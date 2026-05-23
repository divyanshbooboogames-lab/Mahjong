// ============================================================
// LETS MAHJONG — Multiplayer Server
// Node.js + Express + Socket.io
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const OpenAI = require('openai');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
// CORS: allow same-origin in production, configurable via env
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : (process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3000']);

const io = new Server(server, {
  serveClient: false,
  cors: {
    origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : false,
    methods: ['GET', 'POST']
  }
});

// ---- PRODUCTION HARDENING ----
// Trust proxy (required behind Render/Railway/Fly reverse proxy)
app.set('trust proxy', 1);

// Security headers (XSS, clickjacking, MIME sniffing protection)
app.use(helmet({
  contentSecurityPolicy: false,  // Allow inline scripts/styles for our single-file app
  crossOriginEmbedderPolicy: false
}));

// Parse JSON bodies (for /api/scan)
app.use(express.json({ limit: '10mb' }));

// Rate limiting — general API (100 req/min per IP)
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please slow down.' }
});
app.use(generalLimiter);

// Rate limiting — AI scan endpoint (5 scans/min per IP to protect OpenAI costs)
const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Scan rate limit reached. Wait a moment before scanning again.' }
});
app.use('/api/scan', scanLimiter);

// Serve static files with cache headers
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  etag: true
}));

// ---- OPENAI SETUP ----
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ''
});

// ---- AI TILE SCAN ENDPOINT ----
app.post('/api/scan', async (req, res) => {
  try {
    const { image } = req.body; // base64 data URL

    if (!image) {
      return res.status(400).json({ success: false, error: 'No image provided' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ success: false, error: 'OPENAI_API_KEY not set. Set it as an environment variable.' });
    }

    console.log('[AI] Scanning tile image...');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a Mahjong tile recognition expert. You analyze photos of Mahjong tiles and identify each tile precisely.

Return ONLY a valid JSON array of tile objects. No explanation, no markdown, just the JSON array.

Each tile object must be ONE of these formats:
- Suited tile: {"suit": "characters"|"bamboo"|"circles", "value": 1-9}
- Wind tile: {"type": "wind", "value": "east"|"south"|"west"|"north"}
- Dragon tile: {"type": "dragon", "value": "green"|"red"|"white"}
- Flower tile: {"type": "flower", "set": 1|2, "value": 1-4}

Tile identification guide:
- Characters (萬/万): Chinese numerals with 萬 character. Red colored markings.
- Bamboo (竹/條): Sticks/bamboo shapes. Green colored. 1 of bamboo often looks like a bird.
- Circles (筒/餅): Circular dot patterns. Blue/multicolored circles.
- East Wind (東): 東 character
- South Wind (南): 南 character
- West Wind (西): 西 character
- North Wind (北): 北 character
- Green Dragon (發): 發 character, green colored
- Red Dragon (中): 中 character, red colored
- White Dragon: Blank tile or frame-only tile
- Flowers: Ornate artwork tiles with seasons or plants

A standard hand has 13-16 tiles. Count carefully and identify each one left to right.`
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Identify every Mahjong tile in this photo. Return ONLY the JSON array.' },
            { type: 'image_url', image_url: { url: image, detail: 'high' } }
          ]
        }
      ],
      max_tokens: 1000,
      temperature: 0.1
    });

    const raw = response.choices[0].message.content.trim();
    console.log('[AI] Raw response:', raw);

    // Parse JSON from the response (handle markdown code blocks)
    let tiles;
    try {
      let jsonStr = raw;
      // Strip markdown code fences if present
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      tiles = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error('[AI] Failed to parse response:', parseErr.message);
      return res.status(500).json({ success: false, error: 'AI returned invalid format. Please retake the photo with better lighting.' });
    }

    if (!Array.isArray(tiles) || tiles.length === 0) {
      return res.status(400).json({ success: false, error: 'No tiles detected. Make sure tiles are face-up and clearly visible.' });
    }

    // Validate each tile object
    const validTiles = tiles.filter(t => {
      if (t.type === 'wind') return ['east','south','west','north'].includes(t.value);
      if (t.type === 'dragon') return ['green','red','white'].includes(t.value);
      if (t.type === 'flower') return [1,2].includes(t.set) && Number.isInteger(t.value) && t.value >= 1 && t.value <= 4;
      if (t.suit) return ['characters','bamboo','circles'].includes(t.suit) && t.value >= 1 && t.value <= 9;
      return false;
    });

    console.log(`[AI] Detected ${validTiles.length} valid tiles`);

    res.json({
      success: true,
      tiles: validTiles,
      count: validTiles.length
    });

  } catch (err) {
    console.error('[AI] Error:', err.message);
    if (err.status === 401) {
      return res.status(401).json({ success: false, error: 'Invalid OpenAI API key. Check your OPENAI_API_KEY.' });
    }
    res.status(500).json({ success: false, error: 'AI scan failed: ' + err.message });
  }
});

// ---- IN-MEMORY GAME STATE ----
const rooms = {};  // roomCode -> roomState

/*
  roomState = {
    code: '1234',
    hostId: 'socket-id',
    players: {
      'socket-id': {
        id: 'socket-id',
        name: 'Divya',
        avatar: '🐉',
        color: '#D4508B',
        seat: 'east' | null,
        isHost: true/false,
        scanned: false,
        confirmedHand: null,
        roundScore: 0
      }
    },
    settings: {
      gameMode: 'east_round',
      roundWind: 'west',
      isMahjong: true,
      isConcealed: false,
      isLastTile: false,
      isCleanSweep: false
    },
    round: 1,
    totalScores: {},   // playerId -> cumulative score
    phase: 'lobby' | 'settings' | 'scanning' | 'results'
  }
*/

// ---- HELPERS ----
function generateRoomCode() {
  let code;
  do {
    code = String(1000 + Math.floor(Math.random() * 9000));
  } while (rooms[code]);
  return code;
}

function getRoomByPlayer(socketId) {
  for (const code in rooms) {
    if (rooms[code].players[socketId]) return rooms[code];
  }
  return null;
}

function getPlayersArray(room) {
  return Object.values(room.players);
}

function broadcastRoomState(room) {
  const players = getPlayersArray(room).filter(p => !p.disconnected);
  const payload = {
    code: room.code,
    players: players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      color: p.color,
      seat: p.seat,
      isHost: p.isHost,
      scanned: p.scanned,
      roundScore: p.roundScore
    })),
    settings: room.settings,
    round: room.round,
    phase: room.phase,
    totalScores: room.totalScores
  };
  io.to(room.code).emit('room:state', payload);
}

// ---- SOCKET.IO EVENTS ----
io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ---- CREATE ROOM ----
  socket.on('room:create', (data, callback) => {
    const code = generateRoomCode();
    const room = {
      code,
      hostId: socket.id,
      players: {
        [socket.id]: {
          id: socket.id,
          name: String(data.name || 'Player').slice(0, 20),
          avatar: String(data.avatar || '🐕').slice(0, 4),
          color: String(data.color || '#D4508B').slice(0, 9),
          seat: null,
          isHost: true,
          scanned: false,
          confirmedHand: null,
          roundScore: 0
        }
      },
      settings: {
        gameMode: 'east_round',
        roundWind: 'west',
        isMahjong: true,
        isConcealed: false,
        isLastTile: false,
        isCleanSweep: false
      },
      round: 1,
      totalScores: { [socket.id]: 0 },
      phase: 'lobby',
      lastActivity: Date.now()
    };

    rooms[code] = room;
    socket.join(code);
    console.log(`[ROOM] Created: ${code} by ${data.name}`);
    if (typeof callback === 'function') callback({ success: true, code });
    broadcastRoomState(room);
  });

  // ---- JOIN ROOM ----
  socket.on('room:join', (data, callback) => {
    const room = rooms[data.code];
    if (!room) {
      if (typeof callback === 'function') return callback({ success: false, error: 'Room not found' });
      return;
    }
    if (Object.keys(room.players).length >= 4) {
      if (typeof callback === 'function') return callback({ success: false, error: 'Room is full (4 players max)' });
      return;
    }
    if (room.phase !== 'lobby') {
      if (typeof callback === 'function') return callback({ success: false, error: 'Game already in progress' });
      return;
    }

    room.players[socket.id] = {
      id: socket.id,
      name: String(data.name || 'Player').slice(0, 20),
      avatar: String(data.avatar || '🐕').slice(0, 4),
      color: String(data.color || '#D4508B').slice(0, 9),
      seat: null,
      isHost: false,
      scanned: false,
      confirmedHand: null,
      roundScore: 0
    };
    room.totalScores[socket.id] = 0;

    socket.join(data.code);
    console.log(`[ROOM] ${data.name} joined ${data.code}`);
    room.lastActivity = Date.now();
    if (typeof callback === 'function') callback({ success: true, code: data.code });
    broadcastRoomState(room);

    // Notify others
    socket.to(data.code).emit('player:joined', {
      name: data.name,
      avatar: data.avatar
    });
  });
  // ---- REJOIN ROOM (reconnection mid-game) ----
  socket.on('room:rejoin', (data, callback) => {
    const room = rooms[data.code];
    if (!room) {
      if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
      return;
    }

    // Find a disconnected player with matching name
    const match = getPlayersArray(room).find(
      p => p.disconnected && p.name === String(data.name || '').slice(0, 20)
    );

    if (!match) {
      if (typeof callback === 'function') callback({ success: false, error: 'No matching player to reconnect' });
      return;
    }

    // Re-associate socket ID
    const oldId = match.id;
    match.id = socket.id;
    match.disconnected = false;
    delete match.disconnectedAt;

    // Update room.players map key
    room.players[socket.id] = match;
    delete room.players[oldId];

    // Update totalScores key
    if (room.totalScores[oldId] !== undefined) {
      room.totalScores[socket.id] = room.totalScores[oldId];
      delete room.totalScores[oldId];
    }

    // Update hostId if this was the host
    if (room.hostId === oldId) {
      room.hostId = socket.id;
      match.isHost = true;
    }

    socket.join(data.code);
    room.lastActivity = Date.now();
    console.log(`[REJOIN] ${match.name} reconnected to room ${data.code}`);

    if (typeof callback === 'function') callback({ success: true, code: data.code, phase: room.phase });
    broadcastRoomState(room);

    // Re-emit phase event so client navigates to correct screen
    if (room.phase === 'settings') {
      socket.emit('game:started');
    } else if (room.phase === 'scanning') {
      socket.emit('phase:scanning');
    } else if (room.phase === 'results') {
      const seated = getPlayersArray(room).filter(p => p.seat && !p.disconnected);
      const results = seated
        .map(p => ({
          id: p.id, name: p.name, avatar: p.avatar, color: p.color,
          seat: p.seat, roundScore: p.roundScore,
          totalScore: room.totalScores[p.id] || 0, hand: p.confirmedHand
        }))
        .sort((a, b) => b.roundScore - a.roundScore);
      socket.emit('round:results', { round: room.round, results, totalScores: room.totalScores });
    }
  });


  // ---- PICK SEAT ----
  socket.on('seat:pick', (data) => {
    const room = getRoomByPlayer(socket.id);
    if (!room) return;
    if (room.phase !== 'lobby') return;

    const wind = data.wind;
    const validWinds = ['east', 'south', 'west', 'north'];
    if (!validWinds.includes(wind)) return;

    // Check if seat is taken by someone else
    const occupant = getPlayersArray(room).find(p => p.seat === wind && p.id !== socket.id);
    if (occupant) {
      socket.emit('seat:error', { message: 'Seat is taken!' });
      return;
    }

    // Assign seat (replaces any previous seat)
    room.players[socket.id].seat = wind;

    room.lastActivity = Date.now();
    console.log(`[SEAT] ${room.players[socket.id].name} → ${wind} in room ${room.code}`);
    broadcastRoomState(room);
  });

  // ---- EMOTE RELAY ----
  socket.on('emote:send', (data) => {
    const room = getRoomByPlayer(socket.id);
    if (!room) return;
    // Sanitize emoji (max 8 chars)
    const emoji = String(data.emoji || '').slice(0, 8);
    if (!emoji) return;
    // Broadcast to everyone else in the room
    socket.to(room.code).emit('emote:received', { 
      emoji: emoji,
      name: room.players[socket.id]?.name || 'Player'
    });
  });

  // ---- START GAME (host only) ----
  socket.on('game:start', () => {
    const room = getRoomByPlayer(socket.id);
    if (!room || room.hostId !== socket.id) return;
    if (room.phase !== 'lobby') return;

    const seated = getPlayersArray(room).filter(p => p.seat);
    if (seated.length < 2) {
      socket.emit('game:error', { message: 'Need at least 2 seated players' });
      return;
    }

    room.phase = 'settings';
    room.lastActivity = Date.now();
    console.log(`[GAME] Started in room ${room.code}`);
    broadcastRoomState(room);
    io.to(room.code).emit('game:started');
  });

  // ---- UPDATE SETTINGS (host only) ----
  socket.on('settings:update', (data) => {
    const room = getRoomByPlayer(socket.id);
    if (!room || room.hostId !== socket.id) return;
    if (room.phase !== 'settings') return;

    // Whitelist allowed setting keys with type validation
    const allowed = ['gameMode', 'roundWind', 'isMahjong', 'isConcealed', 'isLastTile', 'isCleanSweep'];
    const validModes = ['east_round', 'full_game', 'goulash'];
    const validWinds = ['east', 'south', 'west', 'north'];
    const safe = {};
    for (const key of allowed) {
      if (data[key] === undefined) continue;
      if (key === 'gameMode') { if (validModes.includes(data[key])) safe[key] = data[key]; }
      else if (key === 'roundWind') { if (validWinds.includes(data[key])) safe[key] = data[key]; }
      else { safe[key] = !!data[key]; }
    }
    room.settings = { ...room.settings, ...safe };
    room.lastActivity = Date.now();
    broadcastRoomState(room);
  });

  // ---- GO TO SCAN PHASE (host only) ----
  socket.on('phase:scan', () => {
    const room = getRoomByPlayer(socket.id);
    if (!room || room.hostId !== socket.id) return;
    if (room.phase !== 'settings') return;

    // Reset scan status for all players
    for (const id in room.players) {
      room.players[id].scanned = false;
      room.players[id].confirmedHand = null;
      room.players[id].roundScore = 0;
    }

    room.phase = 'scanning';
    room.lastActivity = Date.now();
    console.log(`[SCAN] Phase started in room ${room.code}`);
    broadcastRoomState(room);
    io.to(room.code).emit('phase:scanning');
  });

  // ---- PLAYER SCANNED THEIR HAND ----
  socket.on('scan:confirm', (data) => {
    const room = getRoomByPlayer(socket.id);
    if (!room) return;

    // Guard: must be in scanning phase
    if (room.phase !== 'scanning') return;

    // Guard: player must have a seat
    if (!room.players[socket.id].seat) return;

    // Guard: prevent double-submission
    if (room.players[socket.id].scanned) return;

    room.players[socket.id].scanned = true;
    room.players[socket.id].confirmedHand = data.tiles;  // Array of tile objects
    const score = typeof data.score === 'number' && Number.isFinite(data.score) ? Math.max(0, Math.min(Math.round(data.score), 100000)) : 0;
    room.players[socket.id].roundScore = score;

    room.lastActivity = Date.now();
    console.log(`[SCAN] ${room.players[socket.id].name} confirmed scan (score: ${score})`);
    broadcastRoomState(room);

    // Check if ALL seated players have scanned
    const seated = getPlayersArray(room).filter(p => p.seat);
    const allScanned = seated.every(p => p.scanned);

    if (allScanned) {
      console.log(`[SCAN] All players scanned in room ${room.code}, showing results`);
      room.phase = 'results';

      // Update total scores
      for (const p of seated) {
        room.totalScores[p.id] = (room.totalScores[p.id] || 0) + p.roundScore;
      }

      // Build results payload
      const results = seated
        .map(p => ({
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          color: p.color,
          seat: p.seat,
          roundScore: p.roundScore,
          totalScore: room.totalScores[p.id],
          hand: p.confirmedHand
        }))
        .sort((a, b) => b.roundScore - a.roundScore);

      io.to(room.code).emit('round:results', {
        round: room.round,
        results,
        totalScores: room.totalScores
      });

      broadcastRoomState(room);
    } else {
      // Notify others someone scanned
      socket.to(room.code).emit('scan:playerDone', {
        name: room.players[socket.id].name,
        id: socket.id
      });
    }
  });

  // ---- NEXT ROUND (host only) ----
  socket.on('round:next', () => {
    const room = getRoomByPlayer(socket.id);
    if (!room || room.hostId !== socket.id) return;
    if (room.phase !== 'results') return;

    room.round++;
    room.phase = 'settings';

    // Reset scan status
    for (const id in room.players) {
      room.players[id].scanned = false;
      room.players[id].confirmedHand = null;
      room.players[id].roundScore = 0;
    }

    room.lastActivity = Date.now();
    console.log(`[ROUND] Next round (${room.round}) in room ${room.code}`);
    broadcastRoomState(room);
    io.to(room.code).emit('round:new', { round: room.round });
  });

  // ---- END GAME (host only) ----
  socket.on('game:end', () => {
    const room = getRoomByPlayer(socket.id);
    if (!room || room.hostId !== socket.id) return;
    if (room.phase !== 'results' && room.phase !== 'scanning') return;

    const finalResults = getPlayersArray(room)
      .filter(p => p.seat)
      .map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        color: p.color,
        totalScore: room.totalScores[p.id] || 0,
        rounds: room.round
      }))
      .sort((a, b) => b.totalScore - a.totalScore);

    io.to(room.code).emit('game:over', { results: finalResults });
    console.log(`[GAME] Ended in room ${room.code}`);

    // Clean up room after a delay
    setTimeout(() => {
      delete rooms[room.code];
      console.log(`[ROOM] Cleaned up: ${room.code}`);
    }, 60000); // Keep for 1 minute after game ends
  });

  // ---- DISCONNECT (with mid-game reconnection support) ----
  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    const room = getRoomByPlayer(socket.id);
    if (!room) return;

    const player = room.players[socket.id];
    const playerName = player ? player.name : 'Unknown';

    if (room.phase === 'lobby') {
      // In lobby: remove completely
      delete room.players[socket.id];
      delete room.totalScores[socket.id];
    } else {
      // Mid-game: mark disconnected for possible rejoin
      player.disconnected = true;
      player.disconnectedAt = Date.now();
      player.isHost = false;
    }

    // Count active (non-disconnected) players
    const activePlayers = getPlayersArray(room).filter(p => !p.disconnected);

    // If no active players remain, delete room
    if (activePlayers.length === 0) {
      delete rooms[room.code];
      console.log(`[ROOM] Deleted empty room: ${room.code}`);
      return;
    }

    // Transfer host if needed
    if (room.hostId === socket.id) {
      const newHost = activePlayers[0];
      room.hostId = newHost.id;
      newHost.isHost = true;
      console.log(`[HOST] Transferred to ${newHost.name} in room ${room.code}`);
    }

    // Fix 3: Re-check allScanned when a player disconnects during scanning
    if (room.phase === 'scanning') {
      const seated = getPlayersArray(room).filter(p => p.seat && !p.disconnected);
      if (seated.length > 0 && seated.every(p => p.scanned)) {
        console.log(`[SCAN] All remaining players scanned in room ${room.code} after disconnect`);
        room.phase = 'results';
        for (const p of seated) {
          room.totalScores[p.id] = (room.totalScores[p.id] || 0) + p.roundScore;
        }
        const results = seated
          .map(p => ({
            id: p.id, name: p.name, avatar: p.avatar, color: p.color,
            seat: p.seat, roundScore: p.roundScore,
            totalScore: room.totalScores[p.id], hand: p.confirmedHand
          }))
          .sort((a, b) => b.roundScore - a.roundScore);
        io.to(room.code).emit('round:results', {
          round: room.round, results, totalScores: room.totalScores
        });
      }
    }

    // Notify remaining players
    socket.to(room.code).emit('player:left', { name: playerName });
    broadcastRoomState(room);
  });

  // ---- PING (for connection health) ----
  socket.on('ping:check', (callback) => {
    if (typeof callback === 'function') callback({ ok: true });
  });
});

// ---- HEALTH CHECK ENDPOINT ----
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    rooms: Object.keys(rooms).length,
    connections: io.engine.clientsCount
  });
});

// ---- STALE ROOM CLEANUP (every 5 minutes) ----
setInterval(() => {
  const now = Date.now();
  for (const code in rooms) {
    const room = rooms[code];

    // Clean up players disconnected for over 5 minutes
    for (const p of getPlayersArray(room)) {
      if (p.disconnected && now - p.disconnectedAt > 5 * 60 * 1000) {
        delete room.players[p.id];
        delete room.totalScores[p.id];
        console.log(`[CLEANUP] Removed disconnected player ${p.name} from room ${code}`);
      }
    }

    const playerCount = Object.keys(room.players).length;
    const idleTime = room.lastActivity ? now - room.lastActivity : 0;

    // Remove rooms with no players, or rooms idle for 2 hours
    if (playerCount === 0 || idleTime > 2 * 60 * 60 * 1000) {
      delete rooms[code];
      console.log(`[CLEANUP] Removed ${playerCount === 0 ? 'empty' : 'idle'} room: ${code}`);
    }
  }
}, 5 * 60 * 1000);

// ---- START SERVER ----
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🀄 Lets Mahjong server running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   CORS origins: ${ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS.join(', ') : 'same-origin only'}\n`);
});

// ---- GRACEFUL SHUTDOWN ----
process.on('SIGTERM', () => {
  console.log('[SERVER] SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('[SERVER] Closed.');
    process.exit(0);
  });
});
