const nodemailer = require('nodemailer');
const { requireAuth } = require('./_auth');

// Namecheap Private Email — same host for every subscription.
const HOST = 'mail.privateemail.com';
const PORT = 465;

exports.handler = async function (event) {
  if (!requireAuth(event)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;
  if (!user || !pass) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server missing EMAIL_USER or EMAIL_PASSWORD environment variables' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const to = (body.to || '').trim();
  const subject = body.subject || '(no subject)';
  const text = body.text || '';
  if (!to) return { statusCode: 400, body: JSON.stringify({ error: 'Missing "to" address' }) };
  if (!text) return { statusCode: 400, body: JSON.stringify({ error: 'Message is empty' }) };

  const transporter = nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: true,
    auth: { user, pass }
  });

  const mailOptions = { from: user, to: to, subject: subject, text: text };
  // Threading headers, present when this is a reply
  if (body.inReplyTo) mailOptions.inReplyTo = body.inReplyTo;
  if (body.references) mailOptions.references = body.references;

  try {
    const info = await transporter.sendMail(mailOptions);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, messageId: info.messageId })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
