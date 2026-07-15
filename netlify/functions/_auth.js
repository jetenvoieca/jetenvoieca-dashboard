const crypto = require('crypto');

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// Stateless session token: "<expiryTimestamp>.<hmacSignature>". No database
// needed — any function can verify it just by recomputing the signature with
// the same server-side secret.
function createToken() {
  const secret = process.env.BUREAU_SESSION_SECRET;
  if (!secret) throw new Error('Server missing BUREAU_SESSION_SECRET environment variable');
  const expires = Date.now() + 1000 * 60 * 60 * 24 * 14; // 14 days
  const payload = String(expires);
  return payload + '.' + sign(payload, secret);
}

function verifyToken(token) {
  const secret = process.env.BUREAU_SESSION_SECRET;
  if (!secret || !token) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;

  const expected = sign(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;

  const expires = parseInt(payload, 10);
  if (!expires || Date.now() > expires) return false;
  return true;
}

// Call at the top of any function that should require login.
function requireAuth(event) {
  const header = event.headers && (event.headers.authorization || event.headers.Authorization);
  const token = header && header.indexOf('Bearer ') === 0 ? header.slice(7) : null;
  return verifyToken(token);
}

module.exports = { createToken, verifyToken, requireAuth };
