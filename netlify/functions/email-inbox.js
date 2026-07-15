const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { requireAuth } = require('./_auth');

// Namecheap Private Email — same host for every subscription.
const HOST = 'mail.privateemail.com';
const PORT = 993;

exports.handler = async function (event) {
  if (!requireAuth(event)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;
  if (!user || !pass) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server missing EMAIL_USER or EMAIL_PASSWORD environment variables' }) };
  }

  const params = event.queryStringParameters || {};
  const client = new ImapFlow({ host: HOST, port: PORT, secure: true, auth: { user, pass }, logger: false });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      // Single message — full body, for when a message is opened
      if (params.uid) {
        const msg = await client.fetchOne(params.uid, { source: true }, { uid: true });
        if (!msg) return { statusCode: 404, body: JSON.stringify({ error: 'Message not found' }) };
        const parsed = await simpleParser(msg.source);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: msg.uid,
            from: (parsed.from && parsed.from.text) || '(unknown)',
            to: (parsed.to && parsed.to.text) || '',
            subject: parsed.subject || '(no subject)',
            date: parsed.date,
            messageId: parsed.messageId || '',
            text: parsed.text || '',
            html: parsed.html || ''
          })
        };
      }

      // Otherwise — list recent messages, newest first
      const status = await client.status('INBOX', { messages: true });
      const total = status.messages || 0;
      const limit = 50;
      const messages = [];
      if (total > 0) {
        const start = Math.max(1, total - limit + 1);
        for await (const msg of client.fetch(`${start}:*`, { envelope: true, flags: true, uid: true })) {
          const from = msg.envelope.from && msg.envelope.from[0];
          messages.push({
            uid: msg.uid,
            from: from ? (from.name || from.address) : '(unknown)',
            subject: msg.envelope.subject || '(no subject)',
            date: msg.envelope.date,
            unread: !(msg.flags && msg.flags.has('\\Seen'))
          });
        }
      }
      messages.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages, total: total })
      };
    } finally {
      lock.release();
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  } finally {
    try { await client.logout(); } catch (e) { /* connection may already be closed */ }
  }
};
