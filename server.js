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

STEP 1 — COUNT PHYSICAL TILES:
Count every separate white/ivory rectangular tile face visible. A standard Mahjong hand has 13-14 non-flower tiles. Tiles sit side by side on a rack or table. Do NOT count shadows, rack edges, or tile backs. Your JSON array MUST have exactly as many entries as physical tiles you counted — no more, no fewer.

STEP 2 — IDENTIFY EACH TILE LEFT TO RIGHT:

CRITICAL — DUPLICATE TILES ARE NORMAL:
A Mahjong set contains 4 copies of every tile. Seeing 2, 3, or 4 identical tiles next to each other is EXPECTED (these form "pungs" and "kongs"). If you see 3 tiles that all look like 中 (Red Dragon), report ALL THREE as {"type":"dragon","value":"red"}. Do NOT skip duplicates or replace them with a different tile.

HONOUR TILES (single large character, NO sticks or dots):
- 中 Red Dragon — a red character 中, sometimes inside a red box/rectangle. Very common in hands. If you see a red character that looks like 中 on multiple tiles, report each one.
- 發 Green Dragon — a green stylized character
- White Dragon — blank tile or plain border frame
- 東 East Wind — single large blue/green character with horizontal+vertical strokes. Do NOT confuse with bamboo sticks. Wind tiles have ONE character filling the entire tile face.
- 南 South Wind, 西 West Wind, 北 North Wind — same style, one large character each
- KEY TEST: If the tile has ONE large character and NO small 萬 below it, it is an honour tile (wind or dragon), not a character tile.

BAMBOO TILES:
- Show GREEN PARALLEL STICKS/RODS arranged vertically
- *** 1-BAMBOO IS A BIRD *** — It shows a BIRD (peacock/sparrow with colorful plumage), NOT sticks. This is the single most distinctive tile in the set. If you see a tile with a bird/peacock image, it is ALWAYS 1-Bamboo: {"suit":"bamboo","value":1}
- Stick counts: 2-Bam=2 sticks, 3-Bam=3 sticks, 4-Bam=4 sticks (2x2), 5-Bam=5 sticks, 6-Bam=6 sticks (3+3), 7-Bam=7 sticks, 8-Bam=8 sticks (4+4), 9-Bam=9 sticks (3+3+3)
- Count EVERY individual stick. Dense/tightly packed sticks = HIGH value (6-9), not low.
- COMMON ERROR: Misreading 4-Bam as 2-Bam because sticks overlap. Count carefully.

CHARACTER TILES (萬 / wan):
- Show a CHINESE NUMERAL on top with the character 萬 written below in red/black
- KEY IDENTIFIER: The 萬 character at the bottom distinguishes these from all other tiles
- Numbers: 一(1) 二(2) 三(3) 四(4) 五(5) 六(6) 七(7) 八(8) 九(9)
- Do NOT confuse 二/三 Characters with 2/3 bamboo sticks. Characters always have 萬 below.

CIRCLE/DOT TILES:
- Show COLORED CIRCLES (dots) in symmetric patterns. NO sticks, NO characters.
- Count the circles carefully using the pattern:
  1-Circle = 1 large circle (often multicolored rings)
  2-Circle = 2 circles (vertical stack)
  3-Circle = 3 circles (diagonal or triangle)
  4-Circle = 4 circles (2x2 square)
  5-Circle = 5 circles (X pattern or 2+1+2)
  6-Circle = 6 circles (3+3 or 2x3 grid)
  7-Circle = 7 circles (3+1+3 or 2+3+2)
  8-Circle = 8 circles (2 columns of 4, or 3+2+3)
  9-Circle = 9 circles (3x3 grid)
- COMMON ERROR: Miscounting dense circles. 6-Circle and 8-Circle are often read as 4 or 5. Count every dot.

FLOWER TILES:
- Ornate artistic designs with plants, seasons, or scenery — much more decorative than regular tiles
- Often have a small number AND artistic imagery (plum blossoms, orchids, etc.)
- Set 1 = seasons (Spring/Summer/Autumn/Winter), Set 2 = plants (Plum/Orchid/Chrysanthemum/Bamboo)

FINAL CHECKS:
- Scan left to right. Report every tile exactly once.
- Duplicate tiles (2-4 identical) are normal and expected — report each copy.
- If a tile is too blurry to identify, SKIP it rather than guess.
- Bird image = 1-Bamboo. Always.
- Single large character with NO 萬 = honour tile (wind/dragon).
- Character with 萬 below = character/wan tile.
- Circles: count every dot in the pattern.
- Your array length MUST match your physical tile count from Step 1.`
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Step 1: Count the physical tile faces (expect 13-14 for a hand). Step 2: Identify left to right. Remember: bird image = 1-Bamboo, duplicate tiles are normal (report every copy), count bamboo sticks and circle dots carefully, single large character without 萬 = honour tile. Return ONLY the JSON array with exactly as many entries as tiles you counted.' },
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
