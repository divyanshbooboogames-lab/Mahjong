// ============================================================
// LETS MAHJONG — Score Calculator Server
// Express + OpenAI Vision API
// ============================================================

const express = require('express');
const path = require('path');
const OpenAI = require('openai');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// ---- PRODUCTION HARDENING ----
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(express.json({ limit: '10mb' }));

// Rate limiting — general (100 req/min)
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
}));

// Rate limiting — AI scan (10 scans/min)
app.use('/api/scan', rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Scan rate limit reached. Wait a moment before scanning again.' }
}));

// Serve static files
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
    const { image } = req.body;

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
- Characters: Chinese numerals with the character for ten-thousand. Red colored markings.
- Bamboo: Sticks/bamboo shapes. Green colored. 1 of bamboo often looks like a bird.
- Circles: Circular dot patterns. Blue/multicolored circles.
- East Wind: East character
- South Wind: South character
- West Wind: West character
- North Wind: North character
- Green Dragon: Green colored character
- Red Dragon: Red colored character in a box
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

    let tiles;
    try {
      let jsonStr = raw;
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      tiles = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error('[AI] Failed to parse:', parseErr.message);
      return res.status(500).json({ success: false, error: 'AI returned invalid format. Retake with better lighting.' });
    }

    if (!Array.isArray(tiles) || tiles.length === 0) {
      return res.status(400).json({ success: false, error: 'No tiles detected. Make sure tiles are face-up and visible.' });
    }

    const validTiles = tiles.filter(t => {
      if (t.type === 'wind') return ['east','south','west','north'].includes(t.value);
      if (t.type === 'dragon') return ['green','red','white'].includes(t.value);
      if (t.type === 'flower') return [1,2].includes(t.set) && Number.isInteger(t.value) && t.value >= 1 && t.value <= 4;
      if (t.suit) return ['characters','bamboo','circles'].includes(t.suit) && t.value >= 1 && t.value <= 9;
      return false;
    });

    console.log(`[AI] Detected ${validTiles.length} valid tiles`);
    res.json({ success: true, tiles: validTiles, count: validTiles.length });

  } catch (err) {
    console.error('[AI] Error:', err.message);
    if (err.status === 401) {
      return res.status(401).json({ success: false, error: 'Invalid OpenAI API key.' });
    }
    res.status(500).json({ success: false, error: 'AI scan failed: ' + err.message });
  }
});

// ---- HEALTH CHECK ----
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ---- START SERVER ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  Lets Mahjong Score Calculator`);
  console.log(`  Running on http://localhost:${PORT}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

process.on('SIGTERM', () => {
  console.log('[SERVER] Shutting down...');
  process.exit(0);
});
