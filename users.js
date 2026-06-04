// ============================================================
// SCOREJONG - User Management & Subscription System
// Secure: hashed passwords, input sanitization, timing-safe auth
// ============================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_FILE = path.join(__dirname, 'users-db.json');
const FREE_SCANS_TOTAL = 20; // lifetime free scans, then must upgrade
const ADMIN_KEY = process.env.ADMIN_KEY || 'be6e5c96686bb7198d53c435b2bc4bbba10f8f384722b53d';

// ---- PASSWORD HASHING ----
function hashPassword(password, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  var hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash: hash, salt: salt };
}

function verifyPassword(password, storedHash, storedSalt) {
  if (!storedSalt) return password === storedHash; // backward compat for pre-hash accounts
  var result = hashPassword(password, storedSalt);
  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(result.hash), Buffer.from(storedHash));
  } catch(e) { return false; }
}

// ---- INPUT SANITIZATION ----
function sanitizeUsername(name) {
  if (typeof name !== 'string') return '';
  return name.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 20);
}

function validateInput(username, password) {
  if (!username || typeof username !== 'string') return 'Username is required';
  if (!password || typeof password !== 'string') return 'Password is required';
  var clean = sanitizeUsername(username);
  if (clean.length < 2) return 'Username must be 2-20 characters (letters, numbers, _ -)';
  if (password.length < 4) return 'Password must be at least 4 characters';
  if (password.length > 50) return 'Password too long';
  return null;
}

// ---- DATABASE ----
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch(e) { return {}; }
}

function saveDB(db) {
  var tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE); // atomic write
}

function today() { return new Date().toISOString().slice(0, 10); }

function isPro(user) {
  if (!user || !user.pro) return false;
  if (!user.proExpiry) return false;
  return new Date(user.proExpiry) > new Date();
}

// ---- PUBLIC API ----

var REFERRAL_BONUS = 5; // extra scans for both referrer and new user

function generateReferralCode(username) {
  return username.toLowerCase().slice(0, 8) + crypto.randomBytes(3).toString('hex');
}

function register(username, password, referralCode) {
  var err = validateInput(username, password);
  if (err) return { ok: false, error: err };

  var db = loadDB();
  var key = sanitizeUsername(username).toLowerCase();
  if (db[key]) return { ok: false, error: 'Username already taken' };

  var hashed = hashPassword(password);
  var refCode = generateReferralCode(username);
  db[key] = {
    name: sanitizeUsername(username),
    pass: hashed.hash,
    salt: hashed.salt,
    created: new Date().toISOString(),
    pro: false,
    proExpiry: null,
    scanDate: null,
    scanCount: 0,
    totalScans: 0,
    referralCode: refCode,
    bonusScans: 0,
    referrals: 0
  };

  // Apply referral bonus if valid code provided
  var referrerName = null;
  if (referralCode && typeof referralCode === 'string') {
    var refKey = Object.keys(db).find(function(k) {
      return db[k].referralCode === referralCode.trim();
    });
    if (refKey && refKey !== key) {
      db[refKey].bonusScans = (db[refKey].bonusScans || 0) + REFERRAL_BONUS;
      db[refKey].referrals = (db[refKey].referrals || 0) + 1;
      db[key].bonusScans = REFERRAL_BONUS;
      referrerName = db[refKey].name;
    }
  }

  saveDB(db);
  return { ok: true, referralCode: refCode, referrerName: referrerName };
}

function login(username, password) {
  var err = validateInput(username, password);
  if (err) return { ok: false, error: err };

  var db = loadDB();
  var key = sanitizeUsername(username).toLowerCase();
  var user = db[key];
  if (!user) return { ok: false, error: 'User not found' };
  if (!verifyPassword(password, user.pass, user.salt)) return { ok: false, error: 'Wrong password' };

  // Auto-generate referral code for users created before referral system
  if (!user.referralCode) {
    user.referralCode = generateReferralCode(user.name);
    db[key] = user;
    saveDB(db);
  }

  return { ok: true, name: user.name, isPro: isPro(user), proExpiry: user.proExpiry, referralCode: user.referralCode };
}

function getScansLeft(username) {
  if (!username) return 0;
  var db = loadDB();
  var user = db[sanitizeUsername(username).toLowerCase()];
  if (!user) return 0;
  if (isPro(user)) return -1; // unlimited
  var used = user.totalScans || 0;
  var limit = FREE_SCANS_TOTAL + (user.bonusScans || 0);
  return Math.max(0, limit - used);
}

function recordScan(username) {
  if (!username) return { allowed: false, error: 'Not logged in' };
  var db = loadDB();
  var key = sanitizeUsername(username).toLowerCase();
  var user = db[key];
  if (!user) return { allowed: false, error: 'User not found' };

  if (isPro(user)) {
    user.totalScans = (user.totalScans || 0) + 1;
    db[key] = user;
    saveDB(db);
    return { allowed: true, remaining: -1, isPro: true };
  }

  var used = user.totalScans || 0;
  var limit = FREE_SCANS_TOTAL + (user.bonusScans || 0);
  if (used >= limit) {
    return { allowed: false, error: 'Free scans used up. Upgrade to Pro for unlimited scans!', remaining: 0, isPro: false };
  }

  user.totalScans = used + 1;
  db[key] = user;
  saveDB(db);
  return { allowed: true, remaining: limit - user.totalScans, isPro: false };
}

// ---- ADMIN API ----

function verifyAdmin(adminKey) {
  if (!adminKey || typeof adminKey !== 'string') return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(adminKey), Buffer.from(ADMIN_KEY));
  } catch(e) { return false; }
}

function activatePro(username, plan, adminKey) {
  if (!verifyAdmin(adminKey)) return { ok: false, error: 'Unauthorized' };
  if (!username) return { ok: false, error: 'Username required' };

  var db = loadDB();
  var key = sanitizeUsername(username).toLowerCase();
  var user = db[key];
  if (!user) return { ok: false, error: 'User not found: ' + key };

  var now = new Date();
  var expiry = new Date(user.proExpiry && new Date(user.proExpiry) > now ? user.proExpiry : now);

  if (plan === 'weekly') expiry.setDate(expiry.getDate() + 7);
  else if (plan === 'monthly') expiry.setMonth(expiry.getMonth() + 1);
  else if (plan === 'yearly') expiry.setFullYear(expiry.getFullYear() + 1);
  else return { ok: false, error: 'Invalid plan. Use: weekly, monthly, yearly' };

  user.pro = true;
  user.proExpiry = expiry.toISOString();
  db[key] = user;
  saveDB(db);
  console.log('[ADMIN] Activated Pro for ' + user.name + ': ' + plan + ' until ' + user.proExpiry);
  return { ok: true, user: user.name, plan: plan, expiry: user.proExpiry };
}

function deactivatePro(username, adminKey) {
  if (!verifyAdmin(adminKey)) return { ok: false, error: 'Unauthorized' };
  var db = loadDB();
  var key = sanitizeUsername(username).toLowerCase();
  var user = db[key];
  if (!user) return { ok: false, error: 'User not found' };
  user.pro = false;
  user.proExpiry = null;
  db[key] = user;
  saveDB(db);
  return { ok: true, user: user.name };
}

function listUsers(adminKey) {
  if (!verifyAdmin(adminKey)) return { ok: false, error: 'Unauthorized' };
  var db = loadDB();
  return {
    ok: true,
    count: Object.keys(db).length,
    users: Object.values(db).map(function(u) {
      return {
        name: u.name, pro: isPro(u), proExpiry: u.proExpiry,
        totalScans: u.totalScans || 0, created: u.created
      };
    })
  };
}

function resetPassword(username, newPassword, adminKey) {
  if (!verifyAdmin(adminKey)) return { ok: false, error: 'Unauthorized' };
  if (!newPassword || newPassword.length < 4) return { ok: false, error: 'Password too short' };
  var db = loadDB();
  var key = sanitizeUsername(username).toLowerCase();
  var user = db[key];
  if (!user) return { ok: false, error: 'User not found' };
  var hashed = hashPassword(newPassword);
  user.pass = hashed.hash;
  user.salt = hashed.salt;
  db[key] = user;
  saveDB(db);
  return { ok: true, user: user.name };
}

module.exports = {
  register, login, recordScan, getScansLeft,
  activatePro, deactivatePro, listUsers, resetPassword,
  isPro, FREE_SCANS_TOTAL
};
