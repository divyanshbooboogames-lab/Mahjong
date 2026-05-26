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

app.use(express.json({ limit: '50mb' }));

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

    const response = await Promise.race([
      openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a Mahjong tile recognition expert. Analyze the photo and identify each tile precisely.

Return ONLY a valid JSON array. No explanation, no markdown, no code fences.

Output formats:
- Suited: {"suit":"characters"|"bamboo"|"circles","value":1-9}
- Wind:   {"type":"wind","value":"east"|"south"|"west"|"north"}
- Dragon: {"type":"dragon","value":"green"|"red"|"white"}
- Flower: {"type":"flower","set":1|2,"value":1-4}

CRITICAL — How to distinguish the 3 suits:
1. CHARACTERS (萬子/Wan): Each tile has a CHINESE NUMERAL (一二三四五六七八九) written on top, with the character 萬 (ten-thousand) written below it in red/black. The key identifier is the 萬 character at the bottom.
2. BAMBOO (索子/Suo): Each tile shows GREEN STICKS or RODS bundled together. Count the sticks to get the value. 1-Bamboo is special — it looks like a bird (peacock/sparrow), NOT a stick.
3. CIRCLES (筒子/Tong): Each tile shows COLORED CIRCLES/DOTS arranged in patterns. Count the circles to get the value. They look like coins or wheels.

DO NOT confuse suits. If you see 萬 character → characters. If you see sticks/rods → bamboo. If you see circular dots → circles.

Honours:
- Winds: 東(East) 南(South) 西(West) 北(North) — single large character, often in blue/black
- Green Dragon (發): Green character 發, sometimes stylized
- Red Dragon (中): Red character 中, often inside a red rectangle/box
- White Dragon: Blank tile or tile with just a border/frame, no character

Flowers: Ornate artistic tiles depicting seasons (Spring/Summer/Autumn/Winter) or plants (Plum/Orchid/Chrysanthemum/Bamboo). Set 1 = seasons, Set 2 = plants.

A standard hand has 13-16 tiles. Scan left to right. Be precise about the suit.`
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
    }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('OpenAI request timed out after 45s')), 45000))
    ]);

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
      return res.status(401).json({ success: false, error: 'Invalid API key. Contact support.' });
    }
    if (err.message && err.message.includes('timed out')) {
      return res.status(504).json({ success: false, error: 'Scan took too long. Try a clearer photo with fewer tiles visible.' });
    }
    if (err.status === 429) {
      return res.status(429).json({ success: false, error: 'Too many requests. Wait a moment and try again.' });
    }
    res.status(500).json({ success: false, error: 'Scan failed. Please try again.' });
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
