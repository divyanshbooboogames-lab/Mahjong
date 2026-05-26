// Vercel Serverless Function — AI Tile Scan
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ''
});

// Simple in-memory rate limiter (per serverless instance)
const rateLimiter = {};
function checkRateLimit(ip) {
  var now = Date.now();
  if (!rateLimiter[ip]) rateLimiter[ip] = [];
  rateLimiter[ip] = rateLimiter[ip].filter(function(t) { return now - t < 60000; });
  if (rateLimiter[ip].length >= 10) return false;
  rateLimiter[ip].push(now);
  return true;
}

module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Rate limit check
    var ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ success: false, error: 'Scan rate limit reached. Wait a moment before scanning again.' });
    }

    var image = req.body && req.body.image;

    if (!image) {
      return res.status(400).json({ success: false, error: 'No image provided' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ success: false, error: 'OPENAI_API_KEY not set. Set it in Vercel Environment Variables.' });
    }

    console.log('[AI] Scanning tile image...');

    var response = await Promise.race([
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a Mahjong tile recognition expert. Analyze the photo and identify each tile precisely.\n\nReturn ONLY a valid JSON array. No explanation, no markdown, no code fences.\n\nOutput formats:\n- Suited: {"suit":"characters"|"bamboo"|"circles","value":1-9}\n- Wind:   {"type":"wind","value":"east"|"south"|"west"|"north"}\n- Dragon: {"type":"dragon","value":"green"|"red"|"white"}\n- Flower: {"type":"flower","set":1|2,"value":1-4}\n\nCRITICAL — How to distinguish the 3 suits:\n1. CHARACTERS (萬子/Wan): Each tile has a CHINESE NUMERAL (一二三四五六七八九) written on top, with the character 萬 (ten-thousand) written below it in red/black. The key identifier is the 萬 character at the bottom.\n2. BAMBOO (索子/Suo): Each tile shows GREEN STICKS or RODS bundled together. Count the sticks to get the value. 1-Bamboo is special — it looks like a bird (peacock/sparrow), NOT a stick.\n3. CIRCLES (筒子/Tong): Each tile shows COLORED CIRCLES/DOTS arranged in patterns. Count the circles to get the value. They look like coins or wheels.\n\nDO NOT confuse suits. If you see 萬 character → characters. If you see sticks/rods → bamboo. If you see circular dots → circles.\n\nHonours:\n- Winds: 東(East) 南(South) 西(West) 北(North) — single large character, often in blue/black\n- Green Dragon (發): Green character 發, sometimes stylized\n- Red Dragon (中): Red character 中, often inside a red rectangle/box\n- White Dragon: Blank tile or tile with just a border/frame, no character\n\nFlowers: Ornate artistic tiles depicting seasons (Spring/Summer/Autumn/Winter) or plants (Plum/Orchid/Chrysanthemum/Bamboo). Set 1 = seasons, Set 2 = plants.\n\nA standard hand has 13-16 tiles. Scan left to right. Be precise about the suit.'
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
      new Promise(function(_, reject) {
        setTimeout(function() { reject(new Error('OpenAI request timed out after 45s')); }, 45000);
      })
    ]);

    var raw = response.choices[0].message.content.trim();
    console.log('[AI] Raw response:', raw);

    var tiles;
    try {
      var jsonStr = raw;
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

    var validTiles = tiles.filter(function(t) {
      if (t.type === 'wind') return ['east','south','west','north'].includes(t.value);
      if (t.type === 'dragon') return ['green','red','white'].includes(t.value);
      if (t.type === 'flower') return [1,2].includes(t.set) && Number.isInteger(t.value) && t.value >= 1 && t.value <= 4;
      if (t.suit) return ['characters','bamboo','circles'].includes(t.suit) && t.value >= 1 && t.value <= 9;
      return false;
    });

    console.log('[AI] Detected ' + validTiles.length + ' valid tiles');
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
};
