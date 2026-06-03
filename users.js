// ============================================================
// SCOREJONG - User Management & Subscription System
// ============================================================

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'users-db.json');
const FREE_SCANS_PER_DAY = 3;
const ADMIN_KEY = process.env.ADMIN_KEY || 'scorejong-admin-2024';

// Load/save user database
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch(e) { return {}; }
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// Get today's date string
function today() { return new Date().toISOString().slice(0, 10); }

// Check if user has active pro subscription
function isPro(user) {
  if (!user || !user.pro) return false;
  if (!user.proExpiry) return false;
  return new Date(user.proExpiry) > new Date();
}

// Get remaining scans for a user today
function getScansLeft(username) {
  var db = loadDB();
  var user = db[username.toLowerCase()];
  if (!user) return 0;
  if (isPro(user)) return -1; // unlimited
  var d = today();
  if (user.scanDate !== d) return FREE_SCANS_PER_DAY;
  return Math.max(0, FREE_SCANS_PER_DAY - (user.scanCount || 0));
}

// Record a scan
function recordScan(username) {
  var db = loadDB();
  var key = username.toLowerCase();
  var user = db[key];
  if (!user) return { allowed: false, error: 'User not found' };

  if (isPro(user)) {
    user.totalScans = (user.totalScans || 0) + 1;
    db[key] = user;
    saveDB(db);
    return { allowed: true, remaining: -1, isPro: true };
  }

  var d = today();
  if (user.scanDate !== d) { user.scanDate = d; user.scanCount = 0; }
  if (user.scanCount >= FREE_SCANS_PER_DAY) {
    return { allowed: false, error: 'Daily scan limit reached', remaining: 0, isPro: false };
  }

  user.scanCount += 1;
  user.totalScans = (user.totalScans || 0) + 1;
  db[key] = user;
  saveDB(db);
  return { allowed: true, remaining: FREE_SCANS_PER_DAY - user.scanCount, isPro: false };
}

// Register user
function register(username, password) {
  if (!username || username.length < 2) return { ok: false, error: 'Username too short' };
  if (!password || password.length < 3) return { ok: false, error: 'Password too short' };
  var db = loadDB();
  var key = username.toLowerCase();
  if (db[key]) return { ok: false, error: 'Username taken' };
  db[key] = {
    name: username, pass: password, created: new Date().toISOString(),
    pro: false, proExpiry: null, scanDate: null, scanCount: 0, totalScans: 0
  };
  saveDB(db);
  return { ok: true };
}

// Login
function login(username, password) {
  var db = loadDB();
  var key = username.toLowerCase();
  var user = db[key];
  if (!user) return { ok: false, error: 'User not found' };
  if (user.pass !== password) return { ok: false, error: 'Wrong password' };
  return { ok: true, name: user.name, isPro: isPro(user), proExpiry: user.proExpiry };
}

// Admin: activate pro
function activatePro(username, plan, adminKey) {
  if (adminKey !== ADMIN_KEY) return { ok: false, error: 'Invalid admin key' };
  var db = loadDB();
  var key = username.toLowerCase();
  var user = db[key];
  if (!user) return { ok: false, error: 'User not found' };

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
  return { ok: true, user: user.name, plan: plan, expiry: user.proExpiry };
}

// Admin: list all users
function listUsers(adminKey) {
  if (adminKey !== ADMIN_KEY) return { ok: false, error: 'Invalid admin key' };
  var db = loadDB();
  return {
    ok: true,
    users: Object.values(db).map(function(u) {
      return {
        name: u.name, pro: isPro(u), proExpiry: u.proExpiry,
        totalScans: u.totalScans || 0, created: u.created
      };
    })
  };
}

module.exports = { register, login, recordScan, getScansLeft, activatePro, listUsers, isPro, FREE_SCANS_PER_DAY };
