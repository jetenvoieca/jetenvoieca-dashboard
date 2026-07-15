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

    // ── Single message — full body, for when a message is opened.
    // mailbox defaults to INBOX (matches the plain inbox list below), but a
    // message found via contactEmail search may live in the Sent folder.
    if (params.uid) {
      const mailbox = params.mailbox || 'INBOX';
      const lock = await client.getMailboxLock(mailbox);
      try {
        const msg = await client.fetchOne(params.uid, { source: true }, { uid: true });
        if (!msg) return { statusCode: 404, body: JSON.stringify({ error: 'Message not found' }) };
        const parsed = await simpleParser(msg.source);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: msg.uid,
            mailbox: mailbox,
            from: (parsed.from && parsed.from.text) || '(unknown)',
            to: (parsed.to && parsed.to.text) || '',
            subject: parsed.subject || '(no subject)',
            date: parsed.date,
            messageId: parsed.messageId || '',
            text: parsed.text || '',
            html: parsed.html || ''
          })
        };
      } finally {
        lock.release();
      }
    }

    // ── Emails involving one specific address — checks Inbox (received from
    // them) and Sent (sent to them), for the Contacts page's email history.
    if (params.contactEmail) {
      const address = params.contactEmail;
      const messages = [];
      const CAP = 30; // most recent per folder, keeps this fast

      const inboxLock = await client.getMailboxLock('INBOX');
      try {
        const uids = await client.search({ from: address }, { uid: true });
        if (uids && uids.length) {
          const recent = uids.slice(-CAP);
          for await (const msg of client.fetch(recent, { envelope: true }, { uid: true })) {
            messages.push({
              uid: msg.uid,
              mailbox: 'INBOX',
              direction: 'received',
              from: envelopeName(msg.envelope.from),
              to: envelopeName(msg.envelope.to),
              subject: msg.envelope.subject || '(no subject)',
              date: msg.envelope.date
            });
          }
        }
      } finally {
        inboxLock.release();
      }

      const sentPath = await findSentFolder(client);
      if (sentPath) {
        const sentLock = await client.getMailboxLock(sentPath);
        try {
          const uids = await client.search({ to: address }, { uid: true });
          if (uids && uids.length) {
            const recent = uids.slice(-CAP);
            for await (const msg of client.fetch(recent, { envelope: true }, { uid: true })) {
              messages.push({
                uid: msg.uid,
                mailbox: sentPath,
                direction: 'sent',
                from: envelopeName(msg.envelope.from),
                to: envelopeName(msg.envelope.to),
                subject: msg.envelope.subject || '(no subject)',
                date: msg.envelope.date
              });
            }
          }
        } finally {
          sentLock.release();
        }
      }

      messages.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages, sentFolderFound: !!sentPath })
      };
    }

    // ── Otherwise — list recent Inbox messages, newest first (unchanged).
    const lock = await client.getMailboxLock('INBOX');
    try {
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

function envelopeName(list) {
  if (!list || !list.length) return '';
  const a = list[0];
  return a.name || a.address || '';
}

// Uses the IMAP SPECIAL-USE extension (\Sent flag) when the server supports
// it, falling back to common folder names otherwise. Never guesses blindly —
// if neither works, contact email history just shows Received only.
async function findSentFolder(client) {
  try {
    const list = await client.list();
    const special = list.find(function (mb) { return mb.specialUse === '\\Sent'; });
    if (special) return special.path;
    const byName = list.find(function (mb) { return /^sent/i.test(mb.name) || /sent items/i.test(mb.name); });
    return byName ? byName.path : null;
  } catch (e) {
    return null;
  }
}
