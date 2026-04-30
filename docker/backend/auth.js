'use strict';

// ============================================================
//  auth.js – Token Authentication with forced password change
// ============================================================

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const DATA_DIR  = process.env.DATA_DIR || '/data';
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_DISABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.AUTH_DISABLED || '').toLowerCase());

// Default password (first login forces change)
const DEFAULT_PASS = 'admin';

// Active tokens (in-memory)
const tokens = new Map(); // token -> { user, mustChangePass }

// ── Persistent password storage ──
function loadAuth() {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    }
  } catch { /* ignore corrupt file */ }
  return null;
}

function saveAuth(data) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) { console.error('auth: failed to save', e.message); }
}

function hashPass(pass, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(pass, salt, 10000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

function verifyPass(pass, stored) {
  const { hash } = hashPass(pass, stored.salt);
  return hash === stored.hash;
}

function getStoredAuth() {
  const stored = loadAuth();
  if (stored && stored.hash && stored.salt) return stored;
  // No file yet → default credentials, must change
  return null;
}

// ── Token management ──
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function login(user, pass) {
  if (AUTH_DISABLED) {
    const token = generateToken();
    tokens.set(token, { user: user || AUTH_USER, mustChangePass: false });
    return { token, mustChangePass: false };
  }
  if (user !== AUTH_USER) return null;

  const stored = getStoredAuth();
  if (!stored) {
    // First run: accept default password
    if (pass !== DEFAULT_PASS) return null;
    const token = generateToken();
    tokens.set(token, { user, mustChangePass: true });
    return { token, mustChangePass: true };
  }

  if (!verifyPass(pass, stored)) return null;
  const token = generateToken();
  tokens.set(token, { user, mustChangePass: false });
  return { token, mustChangePass: false };
}

function changePassword(token, oldPass, newPass) {
  const session = tokens.get(token);
  if (!session) return { ok: false, error: 'unauthorized' };

  if (newPass.length < 4) return { ok: false, error: 'Passwort muss min. 4 Zeichen haben' };

  const stored = getStoredAuth();
  if (stored) {
    if (!verifyPass(oldPass, stored)) return { ok: false, error: 'Altes Passwort falsch' };
  } else {
    if (oldPass !== DEFAULT_PASS) return { ok: false, error: 'Altes Passwort falsch' };
  }

  const hashed = hashPass(newPass);
  saveAuth({ user: AUTH_USER, salt: hashed.salt, hash: hashed.hash });

  // Update session
  session.mustChangePass = false;
  return { ok: true };
}

function verify(token) {
  if (AUTH_DISABLED) return true;
  return tokens.has(token);
}

function tokenMustChangePass(token) {
  const s = tokens.get(token);
  return s ? s.mustChangePass : false;
}

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  const url = new URL(req.url, `http://${req.headers.host}`);
  return url.searchParams.get('token');
}

// Express middleware
function requireAuth(req, res, next) {
  if (AUTH_DISABLED) return next();
  if (req.path === '/auth/login' || req.path === '/auth/change-password') return next();
  const token = extractToken(req);
  if (!token || !verify(token)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// WebSocket upgrade check
function verifyWsUpgrade(req) {
  if (AUTH_DISABLED) return true;
  const token = extractToken(req);
  return token && verify(token);
}

module.exports = { login, verify, changePassword, tokenMustChangePass, requireAuth, verifyWsUpgrade, extractToken };
