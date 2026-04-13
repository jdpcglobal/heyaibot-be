// controllers/analyticsController.js
const ChatModel   = require('../models/Chat');
const ChatRequest = require('../models/ChatRequest');
const { docClient, TABLE_NAME } = require('../models/Chat');
const { QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

// ─────────────────────────────────────────────────────────────
// DATE RANGE HELPER
// Returns { fromTs, toTs, bucketUnit } based on `range` param
// ─────────────────────────────────────────────────────────────
function getDateRange(range) {
  const now   = Date.now();
  const toTs  = now;
  let fromTs, bucketUnit;

  switch (range) {
    case '24h':
      fromTs     = now - 24 * 60 * 60 * 1000;
      bucketUnit = 'hour';
      break;
    case '7d':
      fromTs     = now - 7 * 24 * 60 * 60 * 1000;
      bucketUnit = 'day';
      break;
    case '30d':
      fromTs     = now - 30 * 24 * 60 * 60 * 1000;
      bucketUnit = 'day';
      break;
    case '1y':
      fromTs     = now - 365 * 24 * 60 * 60 * 1000;
      bucketUnit = 'month';
      break;
    case 'all':
    default:
      fromTs     = 0;   // beginning of time
      bucketUnit = 'month';
      break;
  }

  return { fromTs, toTs, bucketUnit };
}

// ─────────────────────────────────────────────────────────────
// BUCKET KEY HELPERS
// ─────────────────────────────────────────────────────────────
function getBucketKey(timestamp, unit) {
  const d = new Date(timestamp);

  if (unit === 'hour') {
    // "2024-12-01 14:00"
    const date = d.toISOString().split('T')[0];
    const hour = String(d.getUTCHours()).padStart(2, '0');
    return `${date} ${hour}:00`;
  }

  if (unit === 'day') {
    // "2024-12-01"
    return d.toISOString().split('T')[0];
  }

  // month → "2024-12"
  const year  = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Fill gaps so every bucket in range has an entry
function fillBuckets(buckets, fromTs, toTs, unit) {
  const filled = [];
  let cursor   = new Date(fromTs);

  const key = (d) => {
    if (unit === 'hour') {
      const y = d.toISOString().split('T')[0];
      return `${y} ${String(d.getUTCHours()).padStart(2, '0')}:00`;
    }
    if (unit === 'day') return d.toISOString().split('T')[0];
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };

  const advance = (d) => {
    if (unit === 'hour')  d.setUTCHours(d.getUTCHours() + 1);
    if (unit === 'day')   d.setUTCDate(d.getUTCDate() + 1);
    if (unit === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
  };

  const endKey = key(new Date(toTs));

  while (key(cursor) <= endKey) {
    const k   = key(cursor);
    const val = buckets[k] || null;
    filled.push({ label: k, ...(val || {}) });
    advance(cursor);
  }

  return filled;
}

// ─────────────────────────────────────────────────────────────
// CHATS GRAPH  (from ChatModel → DynamoDB Chats table)
// Groups messages/threads/tokens by time bucket per apiKey
// ─────────────────────────────────────────────────────────────
async function buildChatsGraph(apiKey, fromTs, toTs, bucketUnit) {
  // Pull all chats for this apiKey via GSI
  const params = {
    TableName:                 TABLE_NAME,
    IndexName:                 'ApiKeyIndex',
    KeyConditionExpression:    'gsiApiKey = :apiKey',
    ExpressionAttributeValues: { ':apiKey': apiKey }
  };

  const response = await docClient.send(new QueryCommand(params));
  const chats    = (response.Items || []).map(item => new ChatModel(item));

  // Bucket accumulators
  const buckets = {};

  const ensureBucket = (key) => {
    if (!buckets[key]) {
      buckets[key] = {
        messages:     0,
        userMessages: 0,
        botMessages:  0,
        tokens:       0,
        userTokens:   0,
        botTokens:    0,
        threads:      0,
        sessions:     0,
        repeatQuestions: 0
      };
    }
  };

  // Summary accumulators
  let totalMessages    = 0;
  let totalTokens      = 0;
  let totalThreads     = 0;
  let totalSessions    = chats.length;
  let totalRepeat      = 0;

  for (const chat of chats) {
    // Per-session thread count
    const chatThreadSet = new Set();

    for (const msg of chat.messages) {
      const ts = msg.time;
      if (ts < fromTs || ts > toTs) continue;

      const key = getBucketKey(ts, bucketUnit);
      ensureBucket(key);

      buckets[key].messages += 1;
      totalMessages         += 1;

      if (msg.role === 'user') {
        buckets[key].userMessages += 1;
        buckets[key].tokens       += msg.tokens || 0;
        buckets[key].userTokens   += msg.tokens || 0;
        totalTokens               += msg.tokens || 0;
      } else {
        buckets[key].botMessages  += 1;
        buckets[key].tokens       += msg.tokens || 0;
        buckets[key].botTokens    += msg.tokens || 0;
        totalTokens               += msg.tokens || 0;
      }

      if (msg.threadId && !chatThreadSet.has(`${chat.chatId}-${msg.threadId}`)) {
        chatThreadSet.add(`${chat.chatId}-${msg.threadId}`);
        buckets[key].threads += 1;
        totalThreads         += 1;
      }
    }

    // Count repeat questions in range
    for (const rq of (chat.threads.repeatQuestions || [])) {
      if (rq.time >= fromTs && rq.time <= toTs) {
        totalRepeat += 1;
      }
    }

    // Count session in its first-message bucket
    const firstMsg = chat.messages.find(m => m.time >= fromTs && m.time <= toTs);
    if (firstMsg) {
      const key = getBucketKey(firstMsg.time, bucketUnit);
      ensureBucket(key);
      buckets[key].sessions += 1;
    }
  }

  const graph = fillBuckets(buckets, fromTs, toTs > 0 ? toTs : Date.now(), bucketUnit);

  return {
    source:  'chats',
    apiKey,
    range:   { from: fromTs, to: toTs },
    summary: {
      totalSessions,
      totalMessages,
      totalTokens,
      totalThreads,
      totalRepeatQuestions: totalRepeat
    },
    graph
  };
}

// ─────────────────────────────────────────────────────────────
// LEADS GRAPH  (from ChatRequest table)
// Groups chat requests by time bucket + status breakdown
// ─────────────────────────────────────────────────────────────
async function buildLeadsGraph(backendApiKey, fromTs, toTs, bucketUnit) {
  const allLeads = await ChatRequest.getByBackendApiKey(backendApiKey);

  const buckets = {};
  const statusTotals = { pending: 0, confirmed: 0, cancelled: 0, completed: 0 };
  let totalLeads = 0;

  const ensureBucket = (key) => {
    if (!buckets[key]) {
      buckets[key] = {
        total:     0,
        pending:   0,
        confirmed: 0,
        cancelled: 0,
        completed: 0
      };
    }
  };

  for (const lead of allLeads) {
    const ts = new Date(lead.createdAt).getTime();
    if (ts < fromTs || ts > toTs) continue;

    const key    = getBucketKey(ts, bucketUnit);
    const status = lead.status || 'pending';

    ensureBucket(key);
    buckets[key].total             += 1;
    buckets[key][status]           = (buckets[key][status] || 0) + 1;
    statusTotals[status]           = (statusTotals[status] || 0) + 1;
    totalLeads                     += 1;
  }

  const graph = fillBuckets(buckets, fromTs, toTs > 0 ? toTs : Date.now(), bucketUnit);

  return {
    source:       'leads',
    backendApiKey,
    range:        { from: fromTs, to: toTs },
    summary: {
      totalLeads,
      byStatus: statusTotals,
      conversionRate: totalLeads > 0
        ? ((statusTotals.confirmed + statusTotals.completed) / totalLeads * 100).toFixed(1) + '%'
        : '0%'
    },
    graph
  };
}

// ─────────────────────────────────────────────────────────────
// MAIN CONTROLLER
// ─────────────────────────────────────────────────────────────
async function analyticsController(req, res) {
  try {
    const {
      apiKey,
      backendApiKey,
      source = 'both',
      range  = 'all'
    } = req.query;

    // Validate at least one key provided
    if (!apiKey && !backendApiKey) {
      return res.status(400).json({
        success: false,
        error:   'Provide at least one of: apiKey, backendApiKey'
      });
    }

    // Validate range
    const validRanges = ['24h', '7d', '30d', '1y', 'all'];
    if (!validRanges.includes(range)) {
      return res.status(400).json({
        success: false,
        error:   `Invalid range. Use one of: ${validRanges.join(', ')}`
      });
    }

    // Validate source
    const validSources = ['chats', 'leads', 'both'];
    if (!validSources.includes(source)) {
      return res.status(400).json({
        success: false,
        error:   `Invalid source. Use one of: ${validSources.join(', ')}`
      });
    }

    const { fromTs, toTs, bucketUnit } = getDateRange(range);

    const tasks   = [];
    const results = {};

    // Build chats graph if requested
    if ((source === 'chats' || source === 'both') && apiKey) {
      tasks.push(
        buildChatsGraph(apiKey, fromTs, toTs, bucketUnit)
          .then(data => { results.chats = data; })
      );
    }

    // Build leads graph if requested
    if ((source === 'leads' || source === 'both') && backendApiKey) {
      tasks.push(
        buildLeadsGraph(backendApiKey, fromTs, toTs, bucketUnit)
          .then(data => { results.leads = data; })
      );
    }

    if (tasks.length === 0) {
      return res.status(400).json({
        success: false,
        error:   'No data to fetch. Check: source=chats needs apiKey, source=leads needs backendApiKey.'
      });
    }

    await Promise.all(tasks);

    return res.status(200).json({
      success:    true,
      range,
      bucketUnit,
      fromTs,
      toTs,
      generatedAt: new Date().toISOString(),
      ...results
    });

  } catch (error) {
    console.error('❌ Analytics error:', error);
    return res.status(500).json({
      success: false,
      error:   error.message
    });
  }
}

module.exports = { analyticsController };