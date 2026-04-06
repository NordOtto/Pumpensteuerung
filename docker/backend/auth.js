'use strict';

// ============================================================
//  auth.js – Simple Token Authentication
// ============================================================

const crypto = require('crypto');

const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASS = process.env.AUTH_PASS || 'pumpe';

// Active tokens (in-memory, survive until restart)
const tokens = new Set();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function login(user, pass) {
  if (user === AUTH_USER && pass === AUTH_PASS) {
    const token = generateToken();
    tokens.add(token);
    return token;
  }
  return null;
}

function verify(token) {
  return tokens.has(token);
}

function extractToken(req) {
  // Authorization: Bearer <token>
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  // Query param ?token=<token>
  const url = new URL(req.url, `http://${req.headers.host}`);
  return url.searchParams.get('token');
}

// Express middleware
function requireAuth(req, res, next) {
  // Login route is always open
  if (req.path === '/auth/login') return next();

  const token = extractToken(req);
  if (!token || !verify(token)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// WebSocket upgrade check
function verifyWsUpgrade(req) {
  const token = extractToken(req);
  return token && verify(token);
}

module.exports = { login, verify, requireAuth, verifyWsUpgrade, extractToken };
