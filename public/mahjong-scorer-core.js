// ============================================================
// LETS MAHJONG — Hand Analyzer & Scoring Engine (Part 1: Core)
// Based on the official Lets Mahjong Guide
// ============================================================

// ---- TILE DEFINITIONS ----
const SUITS = ['characters', 'bamboo', 'circles'];
const SUIT_LABELS = { characters: 'Characters', bamboo: 'Bamboo', circles: 'Circles' };
const WINDS = ['east', 'south', 'west', 'north'];
const DRAGONS = ['green', 'red', 'white'];
const HONOURS = [...WINDS, ...DRAGONS];

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

function isSuited(tile) { return SUITS.includes(tile.suit) && !tile.type; }
function isHonour(tile) { return tile.type === 'wind' || tile.type === 'dragon'; }
function isTerminal(tile) { return isSuited(tile) && (tile.value === 1 || tile.value === 9); }
function isMajor(tile) { return isHonour(tile) || isTerminal(tile); }
function isMinor(tile) { return isSuited(tile) && tile.value >= 2 && tile.value <= 8; }
function tilesEqual(a, b) { return tileId(a) === tileId(b); }

function sameSuit(a, b) {
  if (isSuited(a) && isSuited(b)) return a.suit === b.suit;
  if (a.type === 'wind' && b.type === 'wind') return true;
  if (a.type === 'dragon' && b.type === 'dragon') return true;
  return false;
}

function getAllTiles() {
  const tiles = [];
  for (const suit of SUITS) { for (let v = 1; v <= 9; v++) { tiles.push({ suit, value: v }); } }
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
function isPung(tiles) { return tiles.length === 3 && tilesEqual(tiles[0], tiles[1]) && tilesEqual(tiles[1], tiles[2]); }
function isKong(tiles) { return tiles.length === 4 && tiles.every(t => tilesEqual(t, tiles[0])); }
function isPair(tiles) { return tiles.length === 2 && tilesEqual(tiles[0], tiles[1]); }

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
  const labels = { kong: 'Kong', pung: 'Pung', chow: 'Chow', mixed_chow: 'Mixed Chow', crochet: 'Crochet', pair: 'Pair', knit: 'Knit', unknown: 'Unknown' };
  return labels[type] || 'Unknown';
}

// ---- SAFETY HELPERS ----
function safeGroups(groups) {
  if (!Array.isArray(groups)) return [];
  return groups.filter(function(g) {
    return g && Array.isArray(g.tiles) && g.tiles.length > 0 && g.tiles.every(function(t) { return t != null; });
  });
}

function safeFlatTiles(groups) {
  return safeGroups(groups).flatMap(function(g) { return g.tiles; });
}

// ============================================================
// EAST ROUND (PASSPORT) HAND DETECTION
// ============================================================

function detectEastRoundHand(groups) {
  const results = [];
  groups = safeGroups(groups);
  if (groups.length === 0) return results;

  const pairs = groups.filter(g => g.type === 'pair');
  const pungs = groups.filter(g => g.type === 'pung' || g.type === 'kong');
  const chows = groups.filter(g => g.type === 'chow');
  const mixedChows = groups.filter(g => g.type === 'mixed_chow');
  const crochets = groups.filter(g => g.type === 'crochet');
  const knits = groups.filter(g => g.type === 'knit');
  const threes = groups.filter(g => ['pung', 'kong', 'chow', 'mixed_chow', 'crochet'].includes(g.type));

  if (pairs.length === 3 && threes.length === 2) {
    const pairSuits = pairs.map(p => p.tiles[0].suit).filter(Boolean);
    if (pairSuits.length === 3 && new Set(pairSuits).size === 1) {
      results.push({ name: '3 Pairs in the Same Suit', category: 'east_round' });
    }
  }

  if (knits.length === 3 && threes.length >= 1) {
    const knitSuitSets = knits.map(k => new Set(k.tiles.map(t => t.suit)));
    const allSuits = new Set();
    knitSuitSets.forEach(s => s.forEach(suit => allSuits.add(suit)));
    if (allSuits.size === 2) {
      results.push({ name: '3 Knits in the Same 2 Suits', category: 'east_round' });
    }
  }

  if (pairs.length === 3 && threes.length === 2) {
    const pairSuits = pairs.map(p => p.tiles[0].suit).filter(Boolean);
    if (pairSuits.length === 3 && new Set(pairSuits).size === 3) {
      results.push({ name: '3 Pairs in 3 Different Suits', category: 'east_round' });
    }
  }

  if (threes.length >= 3) {
    const windTiles = safeFlatTiles(groups).filter(t => t.type === 'wind');
    const windValues = new Set(windTiles.map(t => t.value));
    if (windValues.size === 4) {
      results.push({ name: 'NEWS + 1 Wind', category: 'east_round' });
    }
  }

  {
    const allTiles = safeFlatTiles(groups);
    const hasDragons = DRAGONS.every(d => allTiles.some(t => t.type === 'dragon' && t.value === d));
    if (hasDragons && pairs.length >= 1) {
      const pairTile = pairs[0].tiles[0];
      if (isHonour(pairTile)) {
        results.push({ name: 'All 3 Dragons + Honour Pair', category: 'east_round' });
      }
    }
  }

  if (chows.length >= 3) {
    const chowSuits = chows.map(c => c.tiles[0].suit);
    for (const suit of SUITS) {
      if (chowSuits.filter(s => s === suit).length >= 3) {
        results.push({ name: '3 Chows in the Same Suit', category: 'east_round' });
        break;
      }
    }
  }

  if (chows.length >= 3) {
    const chowSuits = new Set(chows.map(c => c.tiles[0].suit));
    if (chowSuits.size === 3) {
      results.push({ name: '3 Chows in 3 Different Suits', category: 'east_round' });
    }
  }

  if (mixedChows.length >= 3) {
    results.push({ name: '3 Mixed Chows', category: 'east_round' });
  }

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
  groups = safeGroups(groups);
  if (groups.length === 0) return results;
  const pungs = groups.filter(g => g.type === 'pung' || g.type === 'kong');
  const pairs = groups.filter(g => g.type === 'pair');

  if (pungs.length < 4 || pairs.length < 1) return results;

  const allTiles = safeFlatTiles(groups);
  const pungTiles = pungs.flatMap(g => g.tiles);
  const pairTile = pairs[0]?.tiles[0];

  {
    const suitedPungs = pungs.filter(g => isSuited(g.tiles[0]));
    if (suitedPungs.length === 4 && pairTile) {
      const suits = new Set(suitedPungs.map(g => g.tiles[0].suit));
      if (suits.size === 1 && isSuited(pairTile) && pairTile.suit === [...suits][0]) {
        results.push({ name: '4 Pungs in One Suit Only', doubles: 3, category: 'goulash' });
      }
    }
  }

  if (pungs.length === 4 && pairs.length === 1) {
    if (pungs.every(g => isHonour(g.tiles[0])) && isHonour(pairTile)) {
      results.push({ name: '4 Pungs + Pair of Honours Only', doubles: 3, category: 'goulash' });
    }
  }

  if (pungs.length === 4 && pairs.length === 1) {
    if (pungs.every(g => isTerminal(g.tiles[0])) && isTerminal(pairTile)) {
      results.push({ name: '4 Pungs of Only 1s and 9s', doubles: 3, category: 'goulash' });
    }
  }

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
  groups = safeGroups(groups);
  const { isEast = false, isMahjong = false, ownWind = 'east', roundWind = 'west' } = options;

  let basePoints = 0;
  const breakdown = [];

  for (const g of groups) {
    if (g.type === 'flower') continue;
    const pts = scoreGoulashSet(g);
    if (pts > 0) {
      const label = `${getGroupLabel(g.tiles)} of ${tileName(g.tiles[0])} (${g.exposed ? 'exposed' : 'concealed'})`;
      breakdown.push({ label, points: pts });
      basePoints += pts;
    }
  }

  if (flowers && flowers.length > 0) {
    const flowerPts = flowers.length * 4;
    breakdown.push({ label: `${flowers.length} Flower(s)`, points: flowerPts });
    basePoints += flowerPts;
  }

  if (isMahjong) {
    breakdown.push({ label: 'Mahjong bonus', points: 20 });
    basePoints += 20;
  }

  let doubles = 0;
  const doubleReasons = [];

  for (const g of groups) {
    if (g.type !== 'pung' && g.type !== 'kong') continue;
    const tile = g.tiles[0];
    if (tile.type === 'dragon') { doubles += 1; doubleReasons.push(`Pung of ${tileName(tile)}`); }
    if (tile.type === 'wind' && tile.value === ownWind) { doubles += 1; doubleReasons.push(`Pung of Own Wind (${tileName(tile)})`); }
    if (tile.type === 'wind' && tile.value === roundWind) { doubles += 1; doubleReasons.push(`Pung of Round Wind (${tileName(tile)})`); }
  }

  if (flowers) {
    const seatNum = WINDS.indexOf(ownWind) + 1;
    const roundNum = WINDS.indexOf(roundWind) + 1;
    for (const f of flowers) {
      if (f.value === seatNum) { doubles += 1; doubleReasons.push('Own Flower'); }
      if (f.value === roundNum) { doubles += 1; doubleReasons.push('Flower of the Round'); }
    }
  }

  let finalScore = basePoints;
  for (let i = 0; i < doubles; i++) { finalScore *= 2; }

  if (isEast) {
    finalScore *= 2;
    doubleReasons.push('East seat (all scores doubled)');
  }

  return { basePoints, doubles, doubleReasons, finalScore, breakdown, isEast };
}
