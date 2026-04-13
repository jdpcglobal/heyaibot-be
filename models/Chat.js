const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

const client = new DynamoDBClient({
  region: process.env.REGION || 'eu-north-1',
  credentials: {
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY
  }
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'Chats';

class ChatModel {
  constructor(data = {}) {
    this.chatId    = data.chatId || uuidv4();
    this.apiKey    = data.apiKey;
    this.sessionId = data.sessionId;

    this.tokens = {
      user:  data.tokens?.user  || 0,
      bot:   data.tokens?.bot   || 0,
      total: data.tokens?.total || 0
    };

    this.createdAt = data.createdAt || Date.now();
    this.updatedAt = data.updatedAt || Date.now();
    this.messages  = data.messages  || [];

    this.messageTracking = data.messageTracking || {
      byText:   {},
      byThread: {}
    };

    // ✅ currentActiveThread persists across API calls via DynamoDB
    this.threads = data.threads || {
      count:               0,
      lastThreadId:        0,
      userMessageCount:    0,
      botReplyCount:       0,
      repeatQuestions:     [],
      currentActiveThread: null
    };

    // ✅ Track last user and bot message with time + date
    this.lastUserMessage = data.lastUserMessage || null;
    this.lastBotMessage  = data.lastBotMessage  || null;

    this.appendHistory = data.appendHistory || [];
  }

  // ─────────────────────────────────────────────
  // ✅ FIXED addUserMessage
  //    - forceNewThread = true  → currentActiveThread null → naya thread banega
  //    - forceNewThread = false → same thread continue (default behaviour)
  // ─────────────────────────────────────────────
addUserMessage(text, tokens = 0, customTime = null, forceNewThread = false) {
  const existingMessage = this.messageTracking.byText[text];
  const now = customTime || Date.now();

  let threadId;
  let isNewThread = false;

  console.log(`📝 [MODEL] addUserMessage: forceNewThread=${forceNewThread}, currentActiveThread=${this.threads.currentActiveThread}`);

  // ✅ CRITICAL: forceNewThread = true -> currentActiveThread null karo
  if (forceNewThread && this.threads.currentActiveThread !== null) {
    console.log(`🔄 [MODEL] Resetting from thread ${this.threads.currentActiveThread} to null`);
    this.threads.currentActiveThread = null;
  }

  if (this.threads.currentActiveThread) {
    threadId = this.threads.currentActiveThread;
    console.log(`🔄 [MODEL] Continuing thread: ${threadId}`);
  } else {
    this.threads.count += 1;
    this.threads.lastThreadId += 1;
    threadId = this.threads.lastThreadId;
    this.threads.currentActiveThread = threadId;
    isNewThread = true;
    console.log(`🆕 [MODEL] New thread created: ${threadId}`);
  }

    this.threads.userMessageCount += 1;

    const message = {
      id:               uuidv4(),
      role:             'user',
      text:             text,
      time:             now,
      date:             new Date(now).toISOString().split('T')[0],
      tokens:           tokens,
      threadId:         threadId,
      messageNumber:    this.messages.length + 1,
      isRepeat:         existingMessage ? true : false,
      originalThreadId: existingMessage ? existingMessage.threadIds[0] : null,
      repeatNumber:     existingMessage ? existingMessage.count + 1 : 1
    };

    this.messages.push(message);

    // ✅ Update lastUserMessage
    this.lastUserMessage = {
      text: text,
      time: now,
      date: message.date
    };

    this.tokens.user  += tokens;
    this.tokens.total  = this.tokens.user + this.tokens.bot;

    // Message tracking by text
    if (!this.messageTracking.byText[text]) {
      this.messageTracking.byText[text] = {
        text:        text,
        firstTime:   now,
        count:       1,
        threadIds:   [threadId],
        lastAsked:   now,
        occurrences: [{ threadId, time: now, messageId: message.id }]
      };
    } else {
      this.messageTracking.byText[text].count += 1;
      this.messageTracking.byText[text].threadIds.push(threadId);
      this.messageTracking.byText[text].lastAsked = now;
      this.messageTracking.byText[text].occurrences.push({ threadId, time: now, messageId: message.id });

      this.threads.repeatQuestions.push({
        text,
        originalThreadId: existingMessage.threadIds[0],
        repeatThreadId:   threadId,
        time:             now,
        repeatNumber:     existingMessage.count
      });
    }

    // Message tracking by thread
    if (!this.messageTracking.byThread[threadId]) {
      this.messageTracking.byThread[threadId] = {
        threadId,
        userMessages:     [message],
        botReplies:       [],
        firstAsked:       now,
        lastUpdated:      now,
        isRepeat:         existingMessage ? true : false,
        originalThreadId: existingMessage ? existingMessage.threadIds[0] : null,
        repeatCount:      existingMessage ? existingMessage.count : 0,
        previousAnswers:  existingMessage ? this.getThreadAnswers(existingMessage.threadIds[0]) : []
      };
    } else {
      this.messageTracking.byThread[threadId].userMessages.push(message);
      this.messageTracking.byThread[threadId].lastUpdated = now;
    }

    this.updatedAt = now;

    return {
      message,
      threadId,
      isNewThread,
      isRepeat: existingMessage ? true : false,
      repeatInfo: existingMessage ? {
        repeatNumber:     existingMessage.count,
        originalThreadId: existingMessage.threadIds[0],
        previousAnswers:  this.getThreadAnswers(existingMessage.threadIds[0])
      } : null
    };
  }

  // ─────────────────────────────────────────────
  // ✅ addBotReply — same thread mein save hoga
  // ─────────────────────────────────────────────
  addBotReply(text, tokens = 0, customTime = null) {
    if (!this.threads.currentActiveThread) {
      throw new Error('No active thread. Start with user message first.');
    }

    this.threads.botReplyCount += 1;
    const threadId = this.threads.currentActiveThread;
    const now      = customTime || Date.now();

    const replyCount = this.messageTracking.byThread[threadId]?.botReplies?.length || 0;

    const message = {
      id:            uuidv4(),
      role:          'bot',
      text:          text,
      time:          now,
      date:          new Date(now).toISOString().split('T')[0],
      tokens:        tokens,
      threadId:      threadId,
      messageNumber: this.messages.length + 1,
      replyNumber:   replyCount + 1
    };

    this.messages.push(message);

    // ✅ Update lastBotMessage
    this.lastBotMessage = {
      text: text,
      time: now,
      date: message.date
    };

    this.tokens.bot   += tokens;
    this.tokens.total  = this.tokens.user + this.tokens.bot;

    if (!this.messageTracking.byThread[threadId]) {
      this.messageTracking.byThread[threadId] = {
        threadId,
        userMessages: [],
        botReplies:   [message],
        firstAsked:   now,
        lastUpdated:  now
      };
    } else {
      this.messageTracking.byThread[threadId].botReplies.push(message);
      this.messageTracking.byThread[threadId].lastUpdated = now;
    }

    this.updatedAt = now;
    return message;
  }

  // ─────────────────────────────────────────────
  // GET OR CREATE CHAT BY SESSION ID
  // ─────────────────────────────────────────────
  static async getOrCreateChatBySession(apiKey, sessionId = null) {
    try {
      const params = {
        TableName:                 TABLE_NAME,
        IndexName:                 'SessionIdIndex',
        KeyConditionExpression:    'gsiSessionId = :sessionId',
        FilterExpression:          'apiKey = :apiKey',
        ExpressionAttributeValues: {
          ':sessionId': sessionId,
          ':apiKey':    apiKey
        }
      };

      const response = await docClient.send(new QueryCommand(params));

      if (response.Items && response.Items.length > 0) {
        console.log(`✅ Found existing chat: ${response.Items[0].chatId}`);
        return { chat: new ChatModel(response.Items[0]), isNew: false };
      }

      console.log(`🆕 Creating new chat for session: ${sessionId}`);
      const newChat = new ChatModel({ apiKey, sessionId });

      newChat.gsiSessionId = sessionId;
      newChat.gsiApiKey    = apiKey;
      newChat.gsiDate      = new Date().toISOString().split('T')[0];

      const putParams = {
        TableName:           TABLE_NAME,
        Item:                newChat.toDynamoItem(),
        ConditionExpression: 'attribute_not_exists(chatId)'
      };

      await docClient.send(new PutCommand(putParams));
      console.log(`✅ Created new chat: ${newChat.chatId}`);

      return { chat: newChat, isNew: true };
    } catch (error) {
      console.error('Error in getOrCreateChatBySession:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────
  // HELPER METHODS
  // ─────────────────────────────────────────────
  getThreadAnswers(threadId) {
    const thread = this.messageTracking.byThread[threadId];
    return thread ? thread.botReplies : [];
  }

  getThread(threadId) {
    return this.getAllThreads().find(t => t.threadId === threadId) || null;
  }

  getAllThreads() {
    const threads = {};

    this.messages.forEach(message => {
      const threadId = message.threadId;
      if (!threads[threadId]) {
        threads[threadId] = {
          threadId,
          userMessages:     [],
          botReplies:       [],
          messageCount:     0,
          isRepeat:         false,
          originalThreadId: null,
          repeatNumber:     1
        };
      }

      if (message.role === 'user') {
        threads[threadId].userMessages.push(message);
        threads[threadId].isRepeat         = message.isRepeat || false;
        threads[threadId].originalThreadId = message.originalThreadId;
        threads[threadId].repeatNumber     = message.repeatNumber || 1;
      } else {
        threads[threadId].botReplies.push(message);
      }
      threads[threadId].messageCount += 1;
    });

    Object.values(threads).forEach(thread => {
      thread.botReplies.sort((a, b) => a.time - b.time);
      thread.replyCount = thread.botReplies.length;
      thread.botReplies.forEach((reply, i) => { reply.replyNumber = i + 1; });

      if (thread.isRepeat && thread.originalThreadId) {
        thread.originalThread = threads[thread.originalThreadId] || null;
        if (thread.originalThread) {
          thread.originalAnswers = thread.originalThread.botReplies;
        }
      }
    });

    return Object.values(threads).sort((a, b) => a.threadId - b.threadId);
  }

  // ─────────────────────────────────────────────
  // getMessagesResponse
  // ─────────────────────────────────────────────
  getMessagesResponse() {
    const messages     = this.messages;
    const userMessages = messages.filter(m => m.role === 'user');
    const botMessages  = messages.filter(m => m.role === 'bot');
    const userTokens   = userMessages.reduce((a, m) => a + (m.tokens || 0), 0);
    const botTokens    = botMessages.reduce((a, m)  => a + (m.tokens || 0), 0);
    const threadIds    = [...new Set(messages.map(m => m.threadId).filter(Boolean))];

    const formattedMessages = messages.map((msg, index) => ({
      messageId:     msg.id,
      role:          msg.role,
      text:          msg.text,
      time:          msg.time,
      date:          msg.date,
      threadId:      msg.threadId,
      messageNumber: msg.messageNumber || index + 1,
      tokens:        msg.tokens || 0,
      ...(msg.role === 'bot' && { replyNumber: msg.replyNumber })
    }));

    formattedMessages.sort((a, b) => a.time - b.time);

    return {
      chatId:            this.chatId,
      sessionId:         this.sessionId,
      totalMessages:     messages.length,
      totalUserMessages: userMessages.length,
      totalBotMessages:  botMessages.length,
      totalThreads:      threadIds.length,
      totalTokens:       userTokens + botTokens,
      totalUserTokens:   userTokens,
      totalBotTokens:    botTokens,
      lastUserMessage:   this.lastUserMessage,
      lastBotMessage:    this.lastBotMessage,
      messages:          formattedMessages
    };
  }

  // ─────────────────────────────────────────────
  // getConversationSummary
  // ─────────────────────────────────────────────
  getConversationSummary() {
    const threads     = this.getAllThreads();
    const allMessages = this.messages;

    const userMessages = allMessages.filter(m => m.role === 'user');
    const botMessages  = allMessages.filter(m => m.role === 'bot');

    const messageFrequency = {};
    allMessages.forEach(msg => {
      if (msg.role === 'user') {
        messageFrequency[msg.text] = (messageFrequency[msg.text] || 0) + 1;
      }
    });

    return {
      chatId:    this.chatId,
      apiKey:    this.apiKey,
      sessionId: this.sessionId,
      stats: {
        totalMessages:           allMessages.length,
        totalUserMessages:       userMessages.length,
        totalBotMessages:        botMessages.length,
        totalTokens:             this.tokens.total,
        totalUserTokens:         this.tokens.user,
        totalBotTokens:          this.tokens.bot,
        totalThreads:            threads.length,
        totalBotReplies:         this.threads.botReplyCount,
        averageRepliesPerThread: this.threads.count > 0
          ? (this.threads.botReplyCount / this.threads.count).toFixed(2)
          : '0',
        uniqueQuestions:      Object.keys(this.messageTracking.byText).length,
        repeatQuestions:      this.threads.repeatQuestions.length,
        mostFrequentQuestion: Object.entries(messageFrequency)
          .sort((a, b) => b[1] - a[1])[0] || null
      },
      tokens:          this.tokens,
      lastUserMessage: this.lastUserMessage,
      lastBotMessage:  this.lastBotMessage,
      threads: threads.map(thread => ({
        threadId: thread.threadId,
        messages: [
          ...thread.userMessages.map(m => ({
            role:          'user',
            text:          m.text,
            time:          m.time,
            date:          m.date,
            tokens:        m.tokens,
            messageNumber: m.messageNumber
          })),
          ...thread.botReplies.map(r => ({
            role:        'bot',
            text:        r.text,
            time:        r.time,
            date:        r.date,
            tokens:      r.tokens,
            replyNumber: r.replyNumber
          }))
        ].sort((a, b) => a.time - b.time),
        replyCount: thread.replyCount,
        ...(thread.isRepeat && {
          originalThreadId: thread.originalThreadId,
          originalAnswers:  thread.originalAnswers
        })
      }))
    };
  }

  // ─────────────────────────────────────────────
  // toDynamoItem
  // ─────────────────────────────────────────────
  toDynamoItem() {
    return {
      chatId:          this.chatId,
      apiKey:          this.apiKey,
      sessionId:       this.sessionId,
      messages:        this.messages,
      messageTracking: this.messageTracking,
      threads:         this.threads,
      tokens:          this.tokens,
      lastUserMessage: this.lastUserMessage || null,
      lastBotMessage:  this.lastBotMessage  || null,
      appendHistory:   this.appendHistory,
      createdAt:       this.createdAt,
      updatedAt:       this.updatedAt,
      gsiApiKey:       this.apiKey,
      gsiSessionId:    this.sessionId,
      gsiDate:         this.messages.length > 0
        ? this.messages[0].date
        : new Date().toISOString().split('T')[0]
    };
  }

  getAppendHistory() {
    return this.appendHistory.map((record, index) => ({
      appendNumber:         index + 1,
      timestamp:            record.timestamp,
      date:                 new Date(record.timestamp).toISOString().split('T')[0],
      time:                 new Date(record.timestamp).toTimeString().split(' ')[0],
      previousThreadCount:  record.previousThreadCount,
      previousMessageCount: record.previousMessageCount,
      afterThreadCount:     record.afterThreadCount,
      afterMessageCount:    record.afterMessageCount,
      threadsAdded:         record.threadsAdded,
      messagesAdded:        record.messagesAdded,
      conversationsAdded:   record.conversationsAdded
    }));
  }

  // ─────────────────────────────────────────────
  // STATIC CRUD METHODS
  // ─────────────────────────────────────────────
  static async create(chatData) {
    const chat   = new ChatModel(chatData);
    const params = {
      TableName:           TABLE_NAME,
      Item:                chat.toDynamoItem(),
      ConditionExpression: 'attribute_not_exists(chatId)'
    };
    try {
      await docClient.send(new PutCommand(params));
      return chat;
    } catch (error) {
      console.error('Error creating chat:', error);
      throw error;
    }
  }

  static async getById(chatId) {
    const params = { TableName: TABLE_NAME, Key: { chatId } };
    try {
      const response = await docClient.send(new GetCommand(params));
      return response.Item ? new ChatModel(response.Item) : null;
    } catch (error) {
      console.error('Error getting chat:', error);
      throw error;
    }
  }

  static async getByApiKey(apiKey, limit = 10) {
    const params = {
      TableName:                 TABLE_NAME,
      IndexName:                 'ApiKeyIndex',
      KeyConditionExpression:    'gsiApiKey = :apiKey',
      ExpressionAttributeValues: { ':apiKey': apiKey },
      Limit:                     limit,
      ScanIndexForward:          false
    };
    try {
      const response = await docClient.send(new QueryCommand(params));
      return response.Items.map(item => new ChatModel(item));
    } catch (error) {
      console.error('Error getting chats:', error);
      throw error;
    }
  }

  static async getBySessionId(sessionId) {
    const params = {
      TableName:                 TABLE_NAME,
      IndexName:                 'SessionIdIndex',
      KeyConditionExpression:    'gsiSessionId = :sessionId',
      ExpressionAttributeValues: { ':sessionId': sessionId }
    };
    try {
      const response = await docClient.send(new QueryCommand(params));
      return response.Items.map(item => new ChatModel(item));
    } catch (error) {
      console.error('Error getting chats by session:', error);
      throw error;
    }
  }

  static async delete(chatId) {
    const params = { TableName: TABLE_NAME, Key: { chatId } };
    try {
      await docClient.send(new DeleteCommand(params));
      return true;
    } catch (error) {
      console.error('Error deleting chat:', error);
      throw error;
    }
  }
}

module.exports = ChatModel;
module.exports.docClient  = docClient;
module.exports.TABLE_NAME = TABLE_NAME;