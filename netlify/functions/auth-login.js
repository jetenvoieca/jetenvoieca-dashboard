const crypto = require('crypto');
const { createToken } = require('./_auth');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const configured = process.env.BUREAU_PASSWORD;
  if (!configured) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server missing BUREAU_PASSWORD environment variable' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const password = body.password || '';
  const a = Buffer.from(password);
  const b = Buffer.from(configured);
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!match) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Incorrect password' }) };
  }

  try {
    const token = createToken();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
