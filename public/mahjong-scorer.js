// ============================================================
// LETS MAHJONG — Hand Analyzer & Scoring Engine
// Based on the official Lets Mahjong Guide
// ============================================================

// ---- TILE DEFINITIONS ----
const SUITS = ['characters', 'bamboo', 'circles'];
const SUIT_LABELS = { characters: 'Characters', bamboo: 'Bamboo', circles: 'Circles' };
const WINDS = ['east', 'south', 'west', 'north'];
const DRAGONS = ['green', 'red', 'white'];
const HONOURS = [...WINDS, ...DRAGONS];

// Each tile is represented as { suit, value } for suited tiles
// or { type: 'wind'|'dragon', value } for honours
// or { type: 'flower', set, value } for flowers

function tileId(tile) {
  if (tile.type === 'flower') return `flower_${tile.set}_${tile.value}`;
  if (tile.type === 'wind') return `wind_${tile.value}`;
  if (tile.type === 'dragon') return `dragon_${tile.value}`;
  return `${tile.suit}_${tile.value}`;
}

function tileName(tile) {
  if (tile.type === 'flower') {
    const setName = tile.set === 1 ? 'Season' : 'Gentleman';
    const names1 = ['Spring', 'Summer', 'Autumn', 'Winter'];
    const names2 = ['Plum', 'Orchid', 'Chrysanthemum', 'Bamboo'];
    return tile.set === 1 ? names1[tile.value - 1] : names2[tile.value - 1];
  }
  if (tile.type === 'wind') return tile.value.charAt(0).toUpperCase() + tile.value.slice(1) + ' Wind';
  if (tile.type === 'dragon') return tile.value.charAt(0).toUpperCase() + tile.value.slice(1) + ' Dragon';
  return `${tile.value} of ${SUIT_LABELS[tile.suit]}`;
}

function tileEmoji(tile) {
  if (tile.type === 'flower') return '🌸';
  if (tile.type === 'wind') return { east: '東', south: '南', west: '西', north: '北' }[tile.value];
  if (tile.type === 'dragon') return { green: '發', red: '中', white: 'B' }[tile.value];
  const suitSymbols = { characters: '萬', bamboo: '竹', circles: '●' };
  return `${tile.value}${suitSymbols[tile.suit]}`;
}

function isSuited(tile) {
  return SUITS.includes(tile.suit) && !tile.type;
}

function isHonour(tile) {
  return tile.type === 'wind' || tile.type === 'dragon';
}

function isTerminal(tile) {
  return isSuited(tile) && (tile.value === 1 || tile.value === 9);
}

function isMajor(tile) {
  return isHonour(tile) || isTerminal(tile);
}

function isMinor(tile) {
  return isSuited(tile) && tile.value >= 2 && tile.value <= 8;
}

function tilesEqual(a, b) {
  return tileId(a) === tileId(b);
}

function sameSuit(a, b) {
  if (isSuited(a) && isSuited(b)) return a.suit === b.suit;
  if (a.type === 'wind' && b.type === 'wind') return true;
  if (a.type === 'dragon' && b.type === 'dragon') return true;
  return false;
}

// ---- ALL TILES (for the picker) ----
function getAllTiles() {
  const tiles = [];
  for (const suit of SUITS) {
    for (let v = 1; v <= 9; v++) {
      tiles.push({ suit, value: v });
    }
  }
  for (const w of WINDS) tiles.push({ type: 'wind', value: w });
  for (const d of DRAGONS) tiles.push({ type: 'dragon', value: d });
  return tiles;
}

function getAllFlowers() {
  const flowers = [];
  for (let v = 1; v <= 4; v++) flowers.push({ type: 'flower', set: 1, value: v });
  for (let v = 1; v <= 4; v++) flowers.push({ type: 'flower', set: 2, value: v });
  return flowers;
}

// ---- SET DETECTION ----

function isPung(tiles) {
  return tiles.length === 3 && tilesEqual(tiles[0], tiles[1]) && tilesEqual(tiles[1], tiles[2]);
}

function isKong(tiles) {
  return tiles.length === 4 && tiles.every(t => tilesEqual(t, tiles[0]));
}

function isPair(tiles) {
  return tiles.length === 2 && tilesEqual(tiles[0], tiles[1]);
}

function isChow(tiles) {
  if (tiles.length !== 3) return false;
  if (!tiles.every(t => isSuited(t))) return false;
  if (!tiles.every(t => t.suit === tiles[0].suit)) return false;
  const vals = tiles.map(t => t.value).sort((a, b) => a - b);
  return vals[1] === vals[0] + 1 && vals[2] === vals[1] + 1;
}

function isMixedChow(tiles) {
  if (tiles.length !== 3) return false;
  if (!tiles.every(t => isSuited(t))) return false;
  const suits = new Set(tiles.map(t => t.suit));
  if (suits.size !== 3) return false;
  const vals = tiles.map(t => t.value).sort((a, b) => a - b);
  return vals[1] === vals[0] + 1 && vals[2] === vals[1] + 1;
}

function isCrochet(tiles) {
  if (tiles.length !== 3) return false;
  if (!tiles.every(t => isSuited(t))) return false;
  const suits = new Set(tiles.map(t => t.suit));
  return suits.size === 3 && tiles.every(t => t.value === tiles[0].value);
}

function isKnit(tiles) {
  if (tiles.length !== 2) return false;
  if (!tiles.every(t => isSuited(t))) return false;
  return tiles[0].value === tiles[1].value && tiles[0].suit !== tiles[1].suit;
}

// ---- GROUP TYPE LABELING ----
function getGroupType(tiles) {
  if (isKong(tiles)) return 'kong';
  if (isPung(tiles)) return 'pung';
  if (isChow(tiles)) return 'chow';
  if (isMixedChow(tiles)) return 'mixed_chow';
  if (isCrochet(tiles)) return 'crochet';
  if (isPair(tiles)) return 'pair';
  if (isKnit(tiles)) return 'knit';
  return 'unknown';
}

function getGroupLabel(tiles) {
  const type = getGroupType(tiles);
  const labels = {
    kong: 'Kong',
    pung: 'Pung',
    chow: 'Chow',
    mixed_chow: 'Mixed Chow',
    crochet: 'Crochet',
    pair: 'Pair',
    knit: 'Knit',
    unknown: 'Unknown'
  };
  return labels[type] || 'Unknown';
}


// ============================================================
// EAST ROUND (PASSPORT) HAND DETECTION
// ============================================================

function detectEastRoundHand(groups) {
  const results = [];

  const pairs = groups.filter(g => g.type === 'pair');
  const pungs = groups.filter(g => g.type === 'pung' || g.type === 'kong');
  const chows = groups.filter(g => g.type === 'chow');
  const mixedChows = groups.filter(g => g.type === 'mixed_chow');
  const crochets = groups.filter(g => g.type === 'crochet');
  const knits = groups.filter(g => g.type === 'knit');
  const threes = groups.filter(g => ['pung', 'kong', 'chow', 'mixed_chow', 'crochet'].includes(g.type));

  // --- 3 PAIRS IN THE SAME SUIT + 3 + 3 + 2 ---
  if (pairs.length === 3 && threes.length === 2) {
    const pairSuits = pairs.map(p => p.tiles[0].suit).filter(Boolean);
    if (pairSuits.length === 3 && new Set(pairSuits).size === 1) {
      results.push({ name: '3 Pairs in the Same Suit', category: 'east_round' });
    }
  }

  // --- 3 KNITS IN THE SAME 2 SUITS + 3 + 3 + 2 ---
  if (knits.length === 3 && threes.length >= 1) {
    const knitSuitSets = knits.map(k => new Set(k.tiles.map(t => t.suit)));
    const allSuits = new Set();
    knitSuitSets.forEach(s => s.forEach(suit => allSuits.add(suit)));
    if (allSuits.size === 2) {
      results.push({ name: '3 Knits in the Same 2 Suits', category: 'east_round' });
    }
  }

  // --- 3 PAIRS IN 3 DIFFERENT SUITS + 3 + 3 + 2 ---
  if (pairs.length === 3 && threes.length === 2) {
    const pairSuits = pairs.map(p => p.tiles[0].suit).filter(Boolean);
    if (pairSuits.length === 3 && new Set(pairSuits).size === 3) {
      results.push({ name: '3 Pairs in 3 Different Suits', category: 'east_round' });
    }
  }

  // --- NEWS + 1 WIND + 3 + 3 + 3 ---
  if (threes.length >= 3) {
    const windTiles = groups.flatMap(g => g.tiles).filter(t => t.type === 'wind');
    const windValues = new Set(windTiles.map(t => t.value));
    if (windValues.size === 4) {
      results.push({ name: 'NEWS + 1 Wind', category: 'east_round' });
    }
  }

  // --- GREEN + RED + WHITE DRAGON + PAIR OF WINDS/DRAGONS + 3+3+3 ---
  {
    const allTiles = groups.flatMap(g => g.tiles);
    const hasDragons = DRAGONS.every(d => allTiles.some(t => t.type === 'dragon' && t.value === d));
    if (hasDragons && pairs.length >= 1) {
      const pairTile = pairs[0].tiles[0];
      if (isHonour(pairTile)) {
        results.push({ name: 'All 3 Dragons + Honour Pair', category: 'east_round' });
      }
    }
  }

  // --- 3 CHOWS IN THE SAME SUIT + 3 + 2 ---
  if (chows.length >= 3) {
    const chowSuits = chows.map(c => c.tiles[0].suit);
    for (const suit of SUITS) {
      if (chowSuits.filter(s => s === suit).length >= 3) {
        results.push({ name: '3 Chows in the Same Suit', category: 'east_round' });
        break;
      }
    }
  }

  // --- 3 CHOWS IN 3 DIFFERENT SUITS + 3 + 2 ---
  if (chows.length >= 3) {
    const chowSuits = new Set(chows.map(c => c.tiles[0].suit));
    if (chowSuits.size === 3) {
      results.push({ name: '3 Chows in 3 Different Suits', category: 'east_round' });
    }
  }

  // --- 3 MIXED CHOWS + 3 + 2 ---
  if (mixedChows.length >= 3) {
    results.push({ name: '3 Mixed Chows', category: 'east_round' });
  }

  // Default: standard hand (4 sets + 1 pair)
  if (results.length === 0 && threes.length === 4 && pairs.length === 1) {
    results.push({ name: 'Standard Hand (4 Sets + 1 Pair)', category: 'east_round' });
  }

  return results;
}


// ============================================================
// GOULASH HAND DETECTION
// ============================================================

function detectGoulashHand(groups) {
  const results = [];
  const pungs = groups.filter(g => g.type === 'pung' || g.type === 'kong');
  const pairs = groups.filter(g => g.type === 'pair');

  if (pungs.length < 4 || pairs.length < 1) return results;

  const allTiles = groups.flatMap(g => g.tiles);
  const pungTiles = pungs.flatMap(g => g.tiles);
  const pairTile = pairs[0]?.tiles[0];

  // 4 Pungs/Kongs + pair in one suit only (3 doubles)
  {
    const suitedPungs = pungs.filter(g => isSuited(g.tiles[0]));
    if (suitedPungs.length === 4 && pairTile) {
      const suits = new Set(suitedPungs.map(g => g.tiles[0].suit));
      if (suits.size === 1 && isSuited(pairTile) && pairTile.suit === [...suits][0]) {
        results.push({ name: '4 Pungs in One Suit Only', doubles: 3, category: 'goulash' });
      }
    }
  }

  // 4 Pungs and a Pair of Honours only
  if (pungs.length === 4 && pairs.length === 1) {
    if (pungs.every(g => isHonour(g.tiles[0])) && isHonour(pairTile)) {
      results.push({ name: '4 Pungs + Pair of Honours Only', doubles: 3, category: 'goulash' });
    }
  }

  // 4 Pungs/Kongs of only 1s and 9s (3 doubles)
  if (pungs.length === 4 && pairs.length === 1) {
    if (pungs.every(g => isTerminal(g.tiles[0])) && isTerminal(pairTile)) {
      results.push({ name: '4 Pungs of Only 1s and 9s', doubles: 3, category: 'goulash' });
    }
  }

  // 4 Pungs/Kongs + pair of 1s and 9s in one suit mixed with honours (1 double)
  if (pungs.length === 4 && pairs.length === 1) {
    const allGroupTiles = [...pungTiles, ...pairs[0].tiles];
    const hasMajorsOnly = allGroupTiles.every(t => isMajor(t));
    const suitedPungs = pungs.filter(g => isSuited(g.tiles[0]));
    const honourPungs = pungs.filter(g => isHonour(g.tiles[0]));
    if (hasMajorsOnly && suitedPungs.length > 0 && honourPungs.length > 0) {
      const suits = new Set(suitedPungs.map(g => g.tiles[0].suit));
      if (suits.size === 1) {
        results.push({ name: '4 Pungs of 1s/9s in One Suit + Honours', doubles: 1, category: 'goulash' });
      }
    }
  }

  // 4 Pungs/Kongs in any 1 suit with Honours (0 doubles)
  if (pungs.length === 4 && pairs.length === 1) {
    const suitedPungs = pungs.filter(g => isSuited(g.tiles[0]));
    const honourPungs = pungs.filter(g => isHonour(g.tiles[0]));
    if (suitedPungs.length > 0 && suitedPungs.length < 4) {
      const suits = new Set(suitedPungs.map(g => g.tiles[0].suit));
      if (suits.size === 1) {
        results.push({ name: '4 Pungs in 1 Suit with Honours', doubles: 0, category: 'goulash' });
      }
    }
  }

  return results;
}


// ============================================================
// GOULASH SCORING (Points per set)
// ============================================================

function scoreGoulashSet(group) {
  const tile = group.tiles[0];
  const exposed = group.exposed;

  if (group.type === 'kong') {
    if (isMajor(tile)) return exposed ? 16 : 32;
    return exposed ? 8 : 16;
  }
  if (group.type === 'pung') {
    if (isMajor(tile)) return exposed ? 4 : 8;
    return exposed ? 2 : 4;
  }
  if (group.type === 'pair') {
    if (isMajor(tile)) return 2;
    return 0;
  }
  return 0;
}

function calculateGoulashScore(groups, flowers, options = {}) {
  const { isEast = false, isMahjong = false, ownWind = 'east', roundWind = 'west' } = options;

  let basePoints = 0;
  const breakdown = [];

  // Score each group
  for (const g of groups) {
    if (g.type === 'flower') continue;
    const pts = scoreGoulashSet(g);
    if (pts > 0) {
      const label = `${getGroupLabel(g.tiles)} of ${tileName(g.tiles[0])} (${g.exposed ? 'exposed' : 'concealed'})`;
      breakdown.push({ label, points: pts });
      basePoints += pts;
    }
  }

  // Flowers: 4 points each
  if (flowers && flowers.length > 0) {
    const flowerPts = flowers.length * 4;
    breakdown.push({ label: `${flowers.length} Flower(s)`, points: flowerPts });
    basePoints += flowerPts;
  }

  // +20 for Mahjong
  if (isMahjong) {
    breakdown.push({ label: 'Mahjong bonus', points: 20 });
    basePoints += 20;
  }

  // Calculate doubles
  let doubles = 0;
  const doubleReasons = [];

  // Detect doubles from groups
  for (const g of groups) {
    if (g.type !== 'pung' && g.type !== 'kong') continue;
    const tile = g.tiles[0];

    if (tile.type === 'dragon') {
      doubles += 1;
      doubleReasons.push(`Pung of ${tileName(tile)}`);
    }
    if (tile.type === 'wind' && tile.value === ownWind) {
      doubles += 1;
      doubleReasons.push(`Pung of Own Wind (${tileName(tile)})`);
    }
    if (tile.type === 'wind' && tile.value === roundWind) {
      doubles += 1;
      doubleReasons.push(`Pung of Round Wind (${tileName(tile)})`);
    }
  }

  // Own flower / round flower doubles
  if (flowers) {
    const seatNum = WINDS.indexOf(ownWind) + 1;
    const roundNum = WINDS.indexOf(roundWind) + 1;
    for (const f of flowers) {
      if (f.value === seatNum) {
        doubles += 1;
        doubleReasons.push('Own Flower');
      }
      if (f.value === roundNum) {
        doubles += 1;
        doubleReasons.push('Flower of the Round');
      }
    }
  }

  // Apply doubles
  let finalScore = basePoints;
  for (let i = 0; i < doubles; i++) {
    finalScore *= 2;
  }

  // East doubles the final score
  if (isEast) {
    finalScore *= 2;
    doubleReasons.push('East seat (all scores doubled)');
  }

  return {
    basePoints,
    doubles,
    doubleReasons,
    finalScore,
    breakdown,
    isEast
  };
}


// ============================================================
// DOUBLES DETECTION (from the Doubles page)
// ============================================================

function detectDoubles(groups, flowers, options = {}) {
  const { ownWind = 'east', roundWind = 'west', isMahjong = false,
          isLastTile = false, isCleanSweep = false, isConcealed = false,
          isDrawnStanding = false } = options;

  let totalDoubles = 0;
  const reasons = [];

  const pungs = groups.filter(g => g.type === 'pung' || g.type === 'kong');
  const kongs = groups.filter(g => g.type === 'kong');
  const concealedPungs = pungs.filter(g => !g.exposed);
  const concealedKongs = kongs.filter(g => !g.exposed);
  const exposedKongs = kongs.filter(g => g.exposed);
  const pairs = groups.filter(g => g.type === 'pair');

  // --- 1 DOUBLE items ---

  // Pung of any Dragon
  for (const g of pungs) {
    if (g.tiles[0].type === 'dragon') {
      totalDoubles += 1;
      reasons.push(`1× Pung of ${tileName(g.tiles[0])}`);
    }
  }

  // Pung of own wind
  for (const g of pungs) {
    if (g.tiles[0].type === 'wind' && g.tiles[0].value === ownWind) {
      totalDoubles += 1;
      reasons.push(`1× Pung of Own Wind`);
    }
  }

  // Pung of round wind
  for (const g of pungs) {
    if (g.tiles[0].type === 'wind' && g.tiles[0].value === roundWind) {
      totalDoubles += 1;
      reasons.push(`1× Pung of Round Wind`);
    }
  }

  // 3 Pungs of Winds OR 3 Pungs of Dragons
  const windPungs = pungs.filter(g => g.tiles[0].type === 'wind');
  const dragonPungs = pungs.filter(g => g.tiles[0].type === 'dragon');
  if (windPungs.length >= 3) {
    totalDoubles += 1;
    reasons.push('1× 3 Pungs of Winds');
  }
  if (dragonPungs.length >= 3) {
    totalDoubles += 1;
    reasons.push('1× 3 Pungs of Dragons');
  }

  // 3 Concealed Pungs
  if (concealedPungs.length >= 3) {
    totalDoubles += 1;
    reasons.push('1× 3 Concealed Pungs');
  }

  // Own Flower
  const seatNum = WINDS.indexOf(ownWind) + 1;
  const roundNum = WINDS.indexOf(roundWind) + 1;
  if (flowers) {
    for (const f of flowers) {
      if (f.value === seatNum) { totalDoubles += 1; reasons.push('1× Own Flower'); }
    }
    for (const f of flowers) {
      if (f.value === roundNum) { totalDoubles += 1; reasons.push('1× Flower of the Round'); }
    }
  }

  // Mahjong on the last tile
  if (isLastTile) { totalDoubles += 1; reasons.push('1× Mahjong on the last tile'); }

  // Clean Sweep
  if (isCleanSweep) { totalDoubles += 1; reasons.push('1× Clean Sweep in the same round'); }

  // Major hand with pung + pair of terminals in one suit
  {
    const terminalPungs = pungs.filter(g => isTerminal(g.tiles[0]));
    for (const suit of SUITS) {
      const suitTermPungs = terminalPungs.filter(g => g.tiles[0].suit === suit);
      const suitTermPairs = pairs.filter(g => isTerminal(g.tiles[0]) && g.tiles[0].suit === suit);
      if (suitTermPungs.length >= 1 && suitTermPairs.length >= 1) {
        totalDoubles += 1;
        reasons.push('1× Major Hand with Pung and Pair of Terminals in One Suit');
        break;
      }
      if (suitTermPungs.length >= 2) {
        totalDoubles += 1;
        reasons.push('1× Pungs of 1s and 9s in One Suit');
        break;
      }
    }
  }

  // --- 2 DOUBLES ---

  // Pung of Double Wind (own wind = round wind)
  if (ownWind === roundWind) {
    const dblWindPung = pungs.find(g => g.tiles[0].type === 'wind' && g.tiles[0].value === ownWind);
    if (dblWindPung) {
      totalDoubles += 2;
      reasons.push('2× Pung of Double Wind');
    }
  }

  // 4 Concealed Pungs
  if (concealedPungs.length >= 4) {
    totalDoubles += 2;
    reasons.push('2× 4 Concealed Pungs');
  }

  // 3 Kongs (Exposed)
  if (exposedKongs.length >= 3) {
    totalDoubles += 2;
    reasons.push('2× 3 Exposed Kongs');
  }

  // --- 3 DOUBLES ---

  // All Honour Hand
  {
    const allTiles = groups.flatMap(g => g.tiles);
    if (allTiles.length > 0 && allTiles.every(t => isHonour(t))) {
      totalDoubles += 3;
      reasons.push('3× All Honour Hand');
    }
  }

  // One Suit Hand Clean
  {
    const suitedTiles = groups.flatMap(g => g.tiles).filter(t => isSuited(t));
    const honourTiles = groups.flatMap(g => g.tiles).filter(t => isHonour(t));
    if (suitedTiles.length > 0 && honourTiles.length === 0) {
      const suits = new Set(suitedTiles.map(t => t.suit));
      if (suits.size === 1) {
        totalDoubles += 3;
        reasons.push('3× One Suit Hand Clean');
      }
    }
  }

  // Concealed Mahjong
  if (isConcealed && isMahjong) {
    totalDoubles += 3;
    reasons.push('3× Concealed Mahjong');
  }

  // 3 Concealed Kongs
  if (concealedKongs.length >= 3) {
    totalDoubles += 3;
    reasons.push('3× 3 Concealed Kongs');
  }

  // 4 Exposed Kongs
  if (exposedKongs.length >= 4) {
    totalDoubles += 3;
    reasons.push('3× 4 Exposed Kongs');
  }

  // --- 4 DOUBLES ---
  // Clean suit with terminals
  {
    const suitedTiles = groups.flatMap(g => g.tiles).filter(t => isSuited(t));
    const honourTiles = groups.flatMap(g => g.tiles).filter(t => isHonour(t));
    if (suitedTiles.length > 0 && honourTiles.length === 0) {
      const suits = new Set(suitedTiles.map(t => t.suit));
      if (suits.size === 1 && suitedTiles.some(t => t.value === 1) && suitedTiles.some(t => t.value === 9)) {
        totalDoubles += 4;
        reasons.push('4× Clean Suit Hand with Terminals');
      }
    }
  }

  // 4 Concealed Kongs
  if (concealedKongs.length >= 4) {
    totalDoubles += 4;
    reasons.push('4× 4 Concealed Kongs');
  }

  // --- 5 DOUBLES ---
  if (isDrawnStanding) {
    totalDoubles += 5;
    reasons.push('5× Drawn Standing Hand');
  }

  // --- 7 DOUBLES ---
  if (windPungs.length >= 4 && pairs.length >= 1 && pairs[0].tiles[0].type === 'dragon') {
    totalDoubles += 7;
    reasons.push('7× 4 Pungs of Winds + Pair of Dragons');
  }

  return { totalDoubles, reasons };
}


// ============================================================
// SCORING CARD LOOKUP (from the big table in the guide)
// The table maps base points (rows 2-100) × number of doubles (columns 1-10)
// Formula: basePoints × 2^doubles
// ============================================================

function lookupScoringCard(basePoints, doubles) {
  return basePoints * Math.pow(2, doubles);
}


// ============================================================
// LIMITS
// ============================================================

function applyLimits(score, isEast) {
  const limits = {
    halfLimit: isEast ? 1000 : 500,
    limit: isEast ? 2000 : 1000,
    doubleLimit: isEast ? 4000 : 2000,
    superLimit: isEast ? 8000 : 4000
  };

  let limitName = null;
  if (score >= limits.superLimit) { score = limits.superLimit; limitName = 'Super Limit'; }
  else if (score >= limits.doubleLimit) { score = limits.doubleLimit; limitName = 'Double Limit'; }
  else if (score >= limits.limit) { score = limits.limit; limitName = 'Limit'; }
  else if (score >= limits.halfLimit) { score = limits.halfLimit; limitName = 'Half Limit'; }

  return { score, limitName, limits };
}


// ============================================================
// FLOWER SCORING
// ============================================================

function scoreFlowers(flowers, ownWind) {
  const seatNum = WINDS.indexOf(ownWind) + 1;
  let points = 0;
  const details = [];

  const set1 = flowers.filter(f => f.set === 1);
  const set2 = flowers.filter(f => f.set === 2);

  if (set1.length === 4) {
    points += 1000;
    details.push('Season Bouquet: 1000');
  }
  if (set2.length === 4) {
    points += 1000;
    details.push('Gentleman Bouquet: 1000');
  }

  const ownFlowers = flowers.filter(f => f.value === seatNum);
  if (ownFlowers.length === 2) {
    points += 500;
    details.push('Own Flower Pair: 500');
  }

  return { points, details };
}


// ============================================================
// MASTER SCORING FUNCTION
// ============================================================

function analyzeHand(groups, flowers = [], options = {}) {
  const { ownWind = 'east', roundWind = 'west', isEast = false,
          isMahjong = true, isLastTile = false, isCleanSweep = false,
          isConcealed = false, isDrawnStanding = false, gameMode = 'east_round' } = options;

  const eastHands = detectEastRoundHand(groups);
  const goulashHands = detectGoulashHand(groups);
  const allHands = gameMode === 'goulash' ? goulashHands : eastHands;

  const goulashScore = calculateGoulashScore(groups, flowers, options);

  const doublesResult = detectDoubles(groups, flowers, {
    ownWind, roundWind, isMahjong, isLastTile, isCleanSweep, isConcealed, isDrawnStanding
  });

  const flowerScore = scoreFlowers(flowers, ownWind);

  let finalScore = goulashScore.basePoints;
  const totalDoubles = doublesResult.totalDoubles;

  finalScore = lookupScoringCard(finalScore, totalDoubles);

  if (isEast) finalScore *= 2;

  finalScore += flowerScore.points;

  const limitResult = applyLimits(finalScore, isEast);

  return {
    hands: allHands,
    groups: groups.map(g => ({
      type: getGroupType(g.tiles),
      label: getGroupLabel(g.tiles),
      tiles: g.tiles,
      exposed: g.exposed,
      points: scoreGoulashSet(g)
    })),
    scoring: {
      basePoints: goulashScore.basePoints,
      breakdown: goulashScore.breakdown,
      doubles: totalDoubles,
      doubleReasons: doublesResult.reasons,
      flowerPoints: flowerScore.points,
      flowerDetails: flowerScore.details,
      rawTotal: finalScore,
      finalScore: limitResult.score,
      limitName: limitResult.limitName,
      limits: limitResult.limits,
      isEast
    },
    flowers
  };
}

// Export for use in HTML
if (typeof window !== 'undefined') {
  window.MahjongScorer = {
    getAllTiles, getAllFlowers, tileId, tileName, tileEmoji,
    isSuited, isHonour, isTerminal, isMajor, isMinor,
    isPung, isKong, isPair, isChow, isMixedChow, isCrochet, isKnit,
    getGroupType, getGroupLabel,
    detectEastRoundHand, detectGoulashHand,
    calculateGoulashScore, detectDoubles, scoreFlowers,
    analyzeHand, lookupScoringCard, applyLimits,
    SUITS, SUIT_LABELS, WINDS, DRAGONS, HONOURS
  };
}
