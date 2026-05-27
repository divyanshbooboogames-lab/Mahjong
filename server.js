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

app.use(express.json({ limit: '15mb' }));

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

    if (!image || typeof image !== 'string') {
      return res.status(400).json({ success: false, error: 'No image provided' });
    }

    // Validate image is a data URL (not a remote URL — prevents SSRF)
    if (!image.startsWith('data:image/')) {
      return res.status(400).json({ success: false, error: 'Invalid image format. Must be a data URL.' });
    }

    // Reject excessively large images (>10MB base64 ~ 7.5MB raw)
    if (image.length > 10 * 1024 * 1024) {
      return res.status(413).json({ success: false, error: 'Image too large. Take a photo at lower resolution.' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ success: false, error: 'OPENAI_API_KEY not set. Set it as an environment variable.' });
    }

    console.log('[AI] Scanning tile image...');

    const response = await Promise.race([
      openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1',
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

STEP 1 — COUNT THE PHYSICAL TILES FIRST:
Before identifying suits, count how many separate physical tile faces you can see. Each tile is a small white rectangle. Do NOT hallucinate tiles that aren't there. Do NOT count edges, shadows, or rack parts as tiles. Only count clearly visible tile faces. Report exactly what you see — if you see 11 tiles, return 11 entries, not more.

STEP 2 — IDENTIFY EACH TILE LEFT TO RIGHT:

BAMBOO TILES (most commonly confused):
- Bamboo tiles show PARALLEL GREEN STICKS/RODS arranged vertically
- CAREFULLY COUNT the individual sticks: 2-Bam=2 sticks, 3-Bam=3 sticks, 4-Bam=4 sticks (often arranged as 2+2), 5-Bam=5 sticks, 6-Bam=6 sticks (arranged as 3+3), 7-Bam=7 sticks, 8-Bam=8 sticks (arranged as 4+4), 9-Bam=9 sticks
- 1-Bamboo is SPECIAL: it shows a BIRD (peacock/sparrow), NOT sticks
- COMMON ERROR: Tiles with MANY sticks (6, 7, 8, 9) are frequently misread as lower values. Count EVERY stick carefully. 8-Bam has 8 sticks in two columns of 4.
- If sticks are dense and tightly packed, it is likely a HIGH-value bamboo (6-9), not low.

CHARACTER TILES:
- Show a CHINESE NUMERAL on top with 萬 (ten-thousand) written below in red/black
- Key identifier: 萬 character at the bottom of the tile
- Numbers: 一(1) 二(2) 三(3) 四(4) 五(5) 六(6) 七(7) 八(8) 九(9)
- COMMON ERROR: Do not confuse 二/三 Characters with bamboo sticks. Characters have 萬 below.

CIRCLE TILES:
- Show COLORED CIRCLES/DOTS arranged in patterns. Count the circles.

HONOUR TILES — these have ONE LARGE CHARACTER, no sticks or dots:
- 東(East Wind) — single large character, often in green/blue
- 南(South Wind), 西(West Wind), 北(North Wind)
- CRITICAL: 東 looks like a complex character with horizontal strokes. Do NOT confuse it with bamboo sticks. Wind tiles have ONE character filling the tile, not parallel sticks.
- 發(Green Dragon) — green character, sometimes stylized
- 中(Red Dragon) — red character, often inside a red rectangle/box
- White Dragon — blank tile or just a border frame

FLOWER TILES:
- Ornate artistic designs showing plants or seasons with small text
- Much more decorative/colorful than regular tiles
- Set 1 = seasons (Spring/Summer/Autumn/Winter), Set 2 = plants (Plum/Orchid/Chrysanthemum/Bamboo)

ACCURACY RULES:
- Only report tiles you can clearly see. Never guess or add extra tiles.
- If a tile is partially hidden or unclear, skip it rather than guess wrong.
- Double-check bamboo counts — this is the #1 source of errors.
- Scan strictly left to right across the rack.`
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'First count how many physical tile faces are visible. Then identify each tile left to right. For bamboo tiles, count every individual stick carefully. Return ONLY the JSON array.' },
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
      if (t.suit) return ['characters','bamboo','circles'].includes(t.suit) && Number.isInteger(t.value) && t.value >= 1 && t.value <= 9;
      return false;
    });

    // Sanity check: flag duplicate tiles (max 4 of each in a real set)
    const tileCounts = {};
    const warnings = [];
    validTiles.forEach(t => {
      let key;
      if (t.type === 'wind') key = `wind_${t.value}`;
      else if (t.type === 'dragon') key = `dragon_${t.value}`;
      else if (t.type === 'flower') key = `flower_${t.set}_${t.value}`;
      else key = `${t.suit}_${t.value}`;
      tileCounts[key] = (tileCounts[key] || 0) + 1;
    });
    for (const [key, count] of Object.entries(tileCounts)) {
      if (key.startsWith('flower_') && count > 1) {
        warnings.push(`Duplicate flower detected: ${key} (×${count})`);
      } else if (!key.startsWith('flower_') && count > 4) {
        warnings.push(`Too many ${key}: ${count} (max 4 in a set)`);
      }
    }
    if (warnings.length > 0) {
      console.log('[AI] Warnings:', warnings.join(', '));
    }

    console.log(`[AI] Detected ${validTiles.length} valid tiles`);
    res.json({ success: true, tiles: validTiles, count: validTiles.length, warnings });

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
