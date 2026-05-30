// ============================================================
// LETS MAHJONG — Score Calculator Server
// Express + OpenAI Vision API
// ============================================================

const express = require('express');
const path = require('path');
const OpenAI = require('openai');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { SYSTEM_PROMPT, USER_PROMPT } = require('./ai-prompt');

const app = express();

// ---- PRODUCTION HARDENING ----
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '15mb' }));

// Rate limiting
app.use(rateLimit({ windowMs: 60000, max: 100, standardHeaders: true, legacyHeaders: false }));
app.use('/api/scan', rateLimit({
  windowMs: 60000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: 'Scan rate limit reached. Wait a moment.' }
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0, etag: true
}));

// ---- OPENAI SETUP ----
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

// ---- AI TILE SCAN ENDPOINT ----
app.post('/api/scan', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image || typeof image !== 'string')
      return res.status(400).json({ success: false, error: 'No image provided' });
    if (!image.startsWith('data:image/'))
      return res.status(400).json({ success: false, error: 'Invalid image format.' });
    if (image.length > 10 * 1024 * 1024)
      return res.status(413).json({ success: false, error: 'Image too large.' });
    if (!process.env.OPENAI_API_KEY)
      return res.status(500).json({ success: false, error: 'OPENAI_API_KEY not set.' });

    console.log('[AI] Scanning tile image...');

    const response = await Promise.race([
      openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: [
            { type: 'text', text: USER_PROMPT },
            { type: 'image_url', image_url: { url: image, detail: 'high' } }
          ]}
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
      if (jsonStr.startsWith('```'))
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      tiles = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error('[AI] Failed to parse:', parseErr.message);
      return res.status(500).json({ success: false, error: 'AI returned invalid format. Retake with better lighting.' });
    }

    if (!Array.isArray(tiles) || tiles.length === 0)
      return res.status(400).json({ success: false, error: 'No tiles detected.' });

    const validTiles = tiles.filter(t => {
      if (t.type === 'wind') return ['east','south','west','north'].includes(t.value);
      if (t.type === 'dragon') return ['green','red','white'].includes(t.value);
      if (t.type === 'flower') return [1,2].includes(t.set) && Number.isInteger(t.value) && t.value >= 1 && t.value <= 4;
      if (t.suit) return ['characters','bamboo','circles'].includes(t.suit) && Number.isInteger(t.value) && t.value >= 1 && t.value <= 9;
      return false;
    });

    // Sanity check: flag duplicate tiles
    const tileCounts = {};
    const warnings = [];
    validTiles.forEach(t => {
      let key;
      if (t.type === 'wind') key = 'wind_' + t.value;
      else if (t.type === 'dragon') key = 'dragon_' + t.value;
      else if (t.type === 'flower') key = 'flower_' + t.set + '_' + t.value;
      else key = t.suit + '_' + t.value;
      tileCounts[key] = (tileCounts[key] || 0) + 1;
    });
    for (const [key, count] of Object.entries(tileCounts)) {
      if (key.startsWith('flower_') && count > 1)
        warnings.push('Duplicate flower: ' + key + ' (x' + count + ')');
      else if (!key.startsWith('flower_') && count > 4)
        warnings.push('Too many ' + key + ': ' + count + ' (max 4)');
    }

    console.log('[AI] Detected ' + validTiles.length + ' valid tiles');
    res.json({ success: true, tiles: validTiles, count: validTiles.length, warnings });

  } catch (err) {
    console.error('[AI] Error:', err.message);
    if (err.status === 401) return res.status(401).json({ success: false, error: 'Invalid API key.' });
    if (err.message && err.message.includes('timed out'))
      return res.status(504).json({ success: false, error: 'Scan took too long. Try a clearer photo.' });
    if (err.status === 429) return res.status(429).json({ success: false, error: 'Too many requests. Wait and retry.' });
    res.status(500).json({ success: false, error: 'Scan failed. Please try again.' });
  }
});

// ---- HEALTH CHECK ----
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ---- START SERVER ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n  Lets Mahjong Score Calculator');
  console.log('  Running on http://localhost:' + PORT);
  console.log('  Environment: ' + (process.env.NODE_ENV || 'development') + '\n');
});

process.on('SIGTERM', () => { console.log('[SERVER] Shutting down...'); process.exit(0); });
