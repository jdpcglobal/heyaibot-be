const ChatModel = require('../models/Chat');
const { UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

class ChatController {

  // ============================================================
  // HELPER — DynamoDB update
  // ============================================================
  static async _saveChat(chat) {
    const params = {
      TableName: 'Chats',
      Key: { chatId: chat.chatId },
      UpdateExpression: `SET
        messages        = :messages,
        messageTracking = :messageTracking,
        threads         = :threads,
        tokens          = :tokens,
        lastUserMessage = :lastUserMessage,
        lastBotMessage  = :lastBotMessage,
        updatedAt       = :updatedAt`,
      ExpressionAttributeValues: {
        ':messages':        chat.messages,
        ':messageTracking': chat.messageTracking,
        ':threads':         chat.threads,
        ':tokens':          chat.tokens,
        ':lastUserMessage': chat.lastUserMessage || null,
        ':lastBotMessage':  chat.lastBotMessage  || null,
        ':updatedAt':       Date.now()
      },
      ReturnValues: 'ALL_NEW'
    };
    const updated = await ChatModel.docClient.send(new UpdateCommand(params));
    return new ChatModel(updated.Attributes);
  }

  // ============================================================
  // SESSION-BASED ENDPOINTS
  // ============================================================

  static async addUserMessageToSession(req, res) {
    try {
      const { apiKey, sessionId } = req.params;

      // ✅ FIX: forceNewThread extract karo req.body se
      const { text, tokens, forceNewThread } = req.body;

      if (!apiKey || !sessionId)
        return res.status(400).json({ success: false, message: 'apiKey and sessionId are required' });
      if (!text)
        return res.status(400).json({ success: false, message: 'text is required' });

      const { chat, isNew } = await ChatModel.getOrCreateChatBySession(apiKey, sessionId);

      // ✅ FIX: forceNewThread model ko pass karo (boolean safety check ke saath)
      const result = chat.addUserMessage(
        text,
        tokens || Math.ceil(text.length / 4),
        null,
        forceNewThread === true
      );

      const updatedChat = await ChatController._saveChat(chat);

      res.status(200).json({
        success: true,
        message: isNew ? 'New session created and user message added' : 'User message added to existing session',
        data: {
          chatId:          updatedChat.chatId,
          sessionId:       updatedChat.sessionId,
          threadId:        result.threadId,
          isNewThread:     result.isNewThread,
          message:         result.message,
          lastUserMessage: updatedChat.lastUserMessage,
          lastBotMessage:  updatedChat.lastBotMessage
        }
      });
    } catch (error) {
      console.error('Add user message error:', error);
      res.status(500).json({ success: false, message: 'Error adding user message', error: error.message });
    }
  }

  static async addBotReplyToSession(req, res) {
    try {
      const { apiKey, sessionId } = req.params;
      const { text, tokens }      = req.body;

      if (!apiKey || !sessionId)
        return res.status(400).json({ success: false, message: 'apiKey and sessionId are required' });
      if (!text)
        return res.status(400).json({ success: false, message: 'text is required' });

      const { chat, isNew } = await ChatModel.getOrCreateChatBySession(apiKey, sessionId);
      const message         = chat.addBotReply(text, tokens || Math.ceil(text.length / 4));
      const updatedChat     = await ChatController._saveChat(chat);

      res.status(200).json({
        success: true,
        message: isNew ? 'New session created and bot reply added' : 'Bot reply added to existing session',
        data: {
          chatId:          updatedChat.chatId,
          sessionId:       updatedChat.sessionId,
          threadId:        updatedChat.threads.lastThreadId,
          message:         message,
          lastUserMessage: updatedChat.lastUserMessage,
          lastBotMessage:  updatedChat.lastBotMessage
        }
      });
    } catch (error) {
      console.error('Add bot reply error:', error);
      res.status(500).json({ success: false, message: 'Error adding bot reply', error: error.message });
    }
  }

 static async bulkInsertToSession(req, res) {
  try {
    const { apiKey, sessionId } = req.params;
    const { conversations, forceNewThread } = req.body;

    console.log('📥 [BACKEND] Bulk insert request:', { 
      apiKey, 
      sessionId, 
      forceNewThread,
      conversationCount: conversations?.length 
    });

    if (!conversations || !Array.isArray(conversations) || conversations.length === 0) {
      return res.status(400).json({ success: false, message: 'conversations array is required' });
    }

    const { chat, isNew } = await ChatModel.getOrCreateChatBySession(apiKey, sessionId);

    let newThreadCreated = false;

    conversations.forEach((conv, convIndex) => {
      if (!conv.userMessage || !conv.userMessage.text) return;

      const isFirstMessage = convIndex === 0;
      const shouldForceThread = isFirstMessage && forceNewThread === true;

      if (shouldForceThread) {
        console.log(`🆕 [BACKEND] Creating new thread for conversation ${convIndex + 1}`);
        newThreadCreated = true;
      }

      const result = chat.addUserMessage(
        conv.userMessage.text,
        conv.userMessage.tokens || 0,
        null,
        shouldForceThread
      );

      if (conv.botReplies && Array.isArray(conv.botReplies)) {
        for (const reply of conv.botReplies) {
          if (reply.text) chat.addBotReply(reply.text, reply.tokens || 0);
        }
      }
    });

    const updatedChat = await ChatController._saveChat(chat);

    res.status(200).json({
      success: true,
      message: isNew ? 'New session created with bulk data' : 'Bulk data added to existing session',
      data: {
        chatId: updatedChat.chatId,
        sessionId: updatedChat.sessionId,
        totalMessages: updatedChat.messages.length,
        lastUserMessage: updatedChat.lastUserMessage,
        lastBotMessage: updatedChat.lastBotMessage,
        forceNewThreadApplied: forceNewThread === true && newThreadCreated,
        currentActiveThread: updatedChat.threads.currentActiveThread
      }
    });
  } catch (error) {
    console.error('❌ [BACKEND] Bulk insert error:', error);
    res.status(500).json({ success: false, message: 'Error in bulk insert', error: error.message });
  }
}

  static async getSessionData(req, res) {
    try {
      const { apiKey, sessionId } = req.params;

      const params = {
        TableName:                 'Chats',
        IndexName:                 'SessionIdIndex',
        KeyConditionExpression:    'gsiSessionId = :sessionId',
        FilterExpression:          'apiKey = :apiKey',
        ExpressionAttributeValues: { ':sessionId': sessionId, ':apiKey': apiKey }
      };

      const response = await ChatModel.docClient.send(new QueryCommand(params));

      if (!response.Items || response.Items.length === 0)
        return res.status(404).json({ success: false, message: 'No data found for this session' });

      const chat = new ChatModel(response.Items[0]);

      res.status(200).json({
        success: true,
        data: {
          chatId:          chat.chatId,
          sessionId:       chat.sessionId,
          totalMessages:   chat.messages.length,
          lastUserMessage: chat.lastUserMessage,
          lastBotMessage:  chat.lastBotMessage,
          messages: chat.messages.map(msg => ({
            role:     msg.role,
            text:     msg.text,
            time:     msg.time,
            date:     msg.date,
            tokens:   msg.tokens,
            threadId: msg.threadId
          }))
        }
      });
    } catch (error) {
      console.error('Get session data error:', error);
      res.status(500).json({ success: false, message: 'Error getting session data', error: error.message });
    }
  }

  static async getAllSessions(req, res) {
    try {
      const { apiKey } = req.params;
      const { limit }  = req.query;

      const chats    = await ChatModel.getByApiKey(apiKey, limit ? parseInt(limit) : 100);
      const sessions = chats.map(chat => ({
        chatId:          chat.chatId,
        sessionId:       chat.sessionId,
        createdAt:       chat.createdAt,
        updatedAt:       chat.updatedAt,
        totalMessages:   chat.messages.length,
        lastUserMessage: chat.lastUserMessage,
        lastBotMessage:  chat.lastBotMessage
      }));

      res.status(200).json({ success: true, data: sessions, count: sessions.length, apiKey });
    } catch (error) {
      console.error('Get sessions error:', error);
      res.status(500).json({ success: false, message: 'Error getting sessions', error: error.message });
    }
  }

  // ============================================================
  // GET CHATS BY API KEY
  // ============================================================

  static async getChatsByApiKey(req, res) {
    try {
      const { apiKey } = req.params;
      const { limit }  = req.query;

      const chats          = await ChatModel.getByApiKey(apiKey, limit ? parseInt(limit) : 100);
      const formattedChats = chats.map(chat => ({
        chatId:          chat.chatId,
        sessionId:       chat.sessionId,
        createdAt:       chat.createdAt,
        updatedAt:       chat.updatedAt,
        totalMessages:   chat.messages.length,
        lastUserMessage: chat.lastUserMessage,
        lastBotMessage:  chat.lastBotMessage
      }));

      res.status(200).json({ success: true, data: formattedChats, count: formattedChats.length, apiKey });
    } catch (error) {
      console.error('Get chats by API key error:', error);
      res.status(500).json({ success: false, message: 'Error getting chats by API key', error: error.message });
    }
  }

  // ============================================================
  // MESSAGE RETRIEVAL ENDPOINTS
  // ============================================================

  static async getChatMessages(req, res) {
    try {
      const { chatId } = req.params;
      const chat       = await ChatModel.getById(chatId);

      if (!chat)
        return res.status(404).json({ success: false, message: 'Chat not found' });

      res.status(200).json({ success: true, data: chat.getMessagesResponse() });
    } catch (error) {
      console.error('Get chat messages error:', error);
      res.status(500).json({ success: false, message: 'Error getting chat messages', error: error.message });
    }
  }

  static async getThreadMessages(req, res) {
    try {
      const { chatId, threadId } = req.params;
      const chat = await ChatModel.getById(chatId);

      if (!chat)
        return res.status(404).json({ success: false, message: 'Chat not found' });

      const thread = chat.getThread(parseInt(threadId));
      if (!thread)
        return res.status(404).json({ success: false, message: 'Thread not found' });

      const threadMessages = [
        ...thread.userMessages.map(m => ({
          messageId:     m.id,
          role:          'user',
          text:          m.text,
          time:          m.time,
          date:          m.date,
          tokens:        m.tokens,
          messageNumber: m.messageNumber,
          threadId:      thread.threadId
        })),
        ...thread.botReplies.map(r => ({
          messageId:   r.id,
          role:        'bot',
          text:        r.text,
          time:        r.time,
          date:        r.date,
          tokens:      r.tokens,
          replyNumber: r.replyNumber,
          threadId:    thread.threadId
        }))
      ].sort((a, b) => a.time - b.time);

      res.status(200).json({
        success: true,
        data: {
          chatId:        chat.chatId,
          threadId:      parseInt(threadId),
          totalMessages: threadMessages.length,
          messages:      threadMessages
        }
      });
    } catch (error) {
      console.error('Get thread messages error:', error);
      res.status(500).json({ success: false, message: 'Error getting thread messages', error: error.message });
    }
  }

  // ============================================================
  // BULK OPERATIONS
  // ============================================================

  static async bulkInsertChat(req, res) {
    try {
      const { apiKey, sessionId, conversations } = req.body;

      if (!apiKey)
        return res.status(400).json({ success: false, message: 'apiKey is required' });
      if (!conversations || !Array.isArray(conversations) || conversations.length === 0)
        return res.status(400).json({ success: false, message: 'conversations array is required' });

      const chat = await ChatModel.bulkInsert(apiKey, sessionId || `session-${Date.now()}`, conversations);

      res.status(201).json({
        success: true,
        message: 'Bulk data inserted successfully',
        data: { chatId: chat.chatId, sessionId: chat.sessionId }
      });
    } catch (error) {
      console.error('Bulk insert error:', error);
      res.status(500).json({ success: false, message: 'Error in bulk insert', error: error.message });
    }
  }

  static async appendConversations(req, res) {
    try {
      const { chatId }        = req.params;
      const { conversations } = req.body;

      if (!conversations || !Array.isArray(conversations) || conversations.length === 0)
        return res.status(400).json({ success: false, message: 'conversations array is required' });

      const result = await ChatModel.appendConversations(chatId, conversations);

      res.status(200).json({
        success: true,
        message: `${result.addedStats.threadsAdded} new conversations added successfully`,
        data: { chatId: result.chat.chatId, sessionId: result.chat.sessionId }
      });
    } catch (error) {
      if (error.message === 'Chat not found')
        return res.status(404).json({ success: false, message: 'Chat not found' });
      res.status(500).json({ success: false, message: 'Error appending conversations', error: error.message });
    }
  }

  static async getAppendHistory(req, res) {
    try {
      const { chatId } = req.params;
      const chat       = await ChatModel.getById(chatId);

      if (!chat)
        return res.status(404).json({ success: false, message: 'Chat not found' });

      res.status(200).json({
        success: true,
        data: { chatId: chat.chatId, totalAppends: chat.appendHistory.length, history: chat.getAppendHistory() }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error retrieving append history', error: error.message });
    }
  }

  // ============================================================
  // TRADITIONAL CHAT ENDPOINTS
  // ============================================================

  static async createChat(req, res) {
    try {
      const chat = await ChatModel.create(req.body);
      res.status(201).json({
        success: true, message: 'Chat created successfully',
        data: { chatId: chat.chatId, sessionId: chat.sessionId }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error creating chat', error: error.message });
    }
  }

  static async getChatById(req, res) {
    try {
      const { chatId } = req.params;
      const chat       = await ChatModel.getById(chatId);

      if (!chat)
        return res.status(404).json({ success: false, message: 'Chat not found' });

      res.status(200).json({
        success: true,
        data: {
          chatId:          chat.chatId,
          sessionId:       chat.sessionId,
          createdAt:       chat.createdAt,
          updatedAt:       chat.updatedAt,
          totalMessages:   chat.messages.length,
          lastUserMessage: chat.lastUserMessage,
          lastBotMessage:  chat.lastBotMessage,
          messages: chat.messages.map(msg => ({
            role:     msg.role,
            text:     msg.text,
            time:     msg.time,
            date:     msg.date,
            threadId: msg.threadId
          }))
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error retrieving chat', error: error.message });
    }
  }

  static async getConversationSummary(req, res) {
    try {
      const { chatId } = req.params;
      const chat       = await ChatModel.getById(chatId);

      if (!chat)
        return res.status(404).json({ success: false, message: 'Chat not found' });

      res.status(200).json({ success: true, data: chat.getConversationSummary() });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error retrieving summary', error: error.message });
    }
  }

  static async getThread(req, res) {
    try {
      const { chatId, threadId } = req.params;
      const chat = await ChatModel.getById(chatId);

      if (!chat)
        return res.status(404).json({ success: false, message: 'Chat not found' });

      const thread = chat.getThread(parseInt(threadId));
      if (!thread)
        return res.status(404).json({ success: false, message: 'Thread not found' });

      res.status(200).json({ success: true, data: thread });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error retrieving thread', error: error.message });
    }
  }

  static async getChatStats(req, res) {
    try {
      const { chatId } = req.params;
      const chat       = await ChatModel.getById(chatId);

      if (!chat)
        return res.status(404).json({ success: false, message: 'Chat not found' });

      const userMessages = chat.messages.filter(m => m.role === 'user');
      const botMessages  = chat.messages.filter(m => m.role === 'bot');
      const threadIds    = [...new Set(chat.messages.map(m => m.threadId).filter(Boolean))];
      const userTokens   = userMessages.reduce((a, m) => a + (m.tokens || 0), 0);
      const botTokens    = botMessages.reduce((a, m)  => a + (m.tokens || 0), 0);

      res.status(200).json({
        success: true,
        data: {
          chatId:    chat.chatId,
          sessionId: chat.sessionId,
          stats: {
            totalMessages:     chat.messages.length,
            totalUserMessages: userMessages.length,
            totalBotMessages:  botMessages.length,
            totalThreads:      threadIds.length,
            totalTokens:       userTokens + botTokens,
            totalUserTokens:   userTokens,
            totalBotTokens:    botTokens
          },
          tokens:          chat.tokens,
          lastUserMessage: chat.lastUserMessage,
          lastBotMessage:  chat.lastBotMessage
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error retrieving stats', error: error.message });
    }
  }

  static async deleteChat(req, res) {
    try {
      const { chatId } = req.params;
      const chat       = await ChatModel.getById(chatId);

      if (!chat)
        return res.status(404).json({ success: false, message: 'Chat not found' });

      await ChatModel.delete(chatId);
      res.status(200).json({ success: true, message: 'Chat deleted successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error deleting chat', error: error.message });
    }
  }
}

module.exports = ChatController;