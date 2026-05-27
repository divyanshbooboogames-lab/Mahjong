// ============================================================
// LETS MAHJONG — Scoring Engine (Part 2: Doubles, Flowers, Analysis)
// Requires mahjong-scorer-core.js to be loaded first
// ============================================================

// ============================================================
// DOUBLES DETECTION (from the Doubles page)
// ============================================================

function detectDoubles(groups, flowers, options = {}) {
  groups = safeGroups(groups);
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
  for (const g of pungs) {
    if (g.tiles[0].type === 'dragon') {
      totalDoubles += 1;
      reasons.push(`1× Pung of ${tileName(g.tiles[0])}`);
    }
  }

  if (ownWind !== roundWind) {
    for (const g of pungs) {
      if (g.tiles[0].type === 'wind' && g.tiles[0].value === ownWind) {
        totalDoubles += 1;
        reasons.push('1× Pung of Own Wind');
      }
    }
    for (const g of pungs) {
      if (g.tiles[0].type === 'wind' && g.tiles[0].value === roundWind) {
        totalDoubles += 1;
        reasons.push('1× Pung of Round Wind');
      }
    }
  }

  const windPungs = pungs.filter(g => g.tiles[0].type === 'wind');
  const dragonPungs = pungs.filter(g => g.tiles[0].type === 'dragon');
  if (windPungs.length >= 3) { totalDoubles += 1; reasons.push('1× 3 Pungs of Winds'); }
  if (dragonPungs.length >= 3) { totalDoubles += 1; reasons.push('1× 3 Pungs of Dragons'); }

  if (concealedPungs.length === 3) { totalDoubles += 1; reasons.push('1× 3 Concealed Pungs'); }

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

  if (isLastTile) { totalDoubles += 1; reasons.push('1× Mahjong on the last tile'); }
  if (isCleanSweep) { totalDoubles += 1; reasons.push('1× Clean Sweep in the same round'); }

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
  if (ownWind === roundWind) {
    const dblWindPung = pungs.find(g => g.tiles[0].type === 'wind' && g.tiles[0].value === ownWind);
    if (dblWindPung) { totalDoubles += 2; reasons.push('2× Pung of Double Wind'); }
  }

  if (concealedPungs.length >= 4) { totalDoubles += 2; reasons.push('2× 4 Concealed Pungs'); }
  if (exposedKongs.length === 3) { totalDoubles += 2; reasons.push('2× 3 Exposed Kongs'); }

  // --- 3 DOUBLES ---
  {
    const allTiles = safeFlatTiles(groups);
    if (allTiles.length > 0 && allTiles.every(t => isHonour(t))) {
      totalDoubles += 3;
      reasons.push('3× All Honour Hand');
    }
  }

  {
    const allSuitedTiles = safeFlatTiles(groups).filter(t => isSuited(t));
    const allHonourTiles = safeFlatTiles(groups).filter(t => isHonour(t));
    if (allSuitedTiles.length > 0 && allHonourTiles.length === 0) {
      const suits = new Set(allSuitedTiles.map(t => t.suit));
      if (suits.size === 1) {
        const hasTerminals = allSuitedTiles.some(t => t.value === 1) && allSuitedTiles.some(t => t.value === 9);
        if (hasTerminals) { totalDoubles += 4; reasons.push('4× Clean Suit Hand with Terminals'); }
        else { totalDoubles += 3; reasons.push('3× One Suit Hand Clean'); }
      }
    }
  }

  if (isConcealed && isMahjong) { totalDoubles += 3; reasons.push('3× Concealed Mahjong'); }
  if (concealedKongs.length === 3) { totalDoubles += 3; reasons.push('3× 3 Concealed Kongs'); }
  if (exposedKongs.length >= 4) { totalDoubles += 3; reasons.push('3× 4 Exposed Kongs'); }

  // --- 4 DOUBLES ---
  if (concealedKongs.length >= 4) { totalDoubles += 4; reasons.push('4× 4 Concealed Kongs'); }

  // --- 5 DOUBLES ---
  if (isDrawnStanding) { totalDoubles += 5; reasons.push('5× Drawn Standing Hand'); }

  // --- 7 DOUBLES ---
  if (windPungs.length >= 4 && pairs.length >= 1 && pairs[0].tiles[0].type === 'dragon') {
    totalDoubles += 7;
    reasons.push('7× 4 Pungs of Winds + Pair of Dragons');
  }

  return { totalDoubles, reasons };
}

// ============================================================
// SCORING CARD LOOKUP
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

function scoreFlowers(flowers, ownWind, roundWind) {
  const seatNum = WINDS.indexOf(ownWind) + 1;
  const roundNum = WINDS.indexOf(roundWind) + 1;
  let points = 0;
  const details = [];

  const set1 = flowers.filter(f => f.set === 1);
  const set2 = flowers.filter(f => f.set === 2);

  if (set1.length === 4) { points += 1000; details.push('Season Bouquet: 1000'); }
  if (set2.length === 4) { points += 1000; details.push('Gentleman Bouquet: 1000'); }

  const ownFlowers = flowers.filter(f => f.value === seatNum);
  if (ownFlowers.length === 2) { points += 500; details.push('Own Flower Pair: 500'); }

  if (roundNum !== seatNum) {
    const roundFlowers = flowers.filter(f => f.value === roundNum);
    if (roundFlowers.length === 2) { points += 500; details.push('Round Flower Pair: 500'); }
  }

  return { points, details };
}

// ============================================================
// FLOWER DOUBLES DETECTION (PDF Page 9)
// ============================================================

function detectFlowerDoubles(flowers, ownWind, roundWind) {
  if (!flowers || flowers.length === 0) return { totalDoubles: 0, reasons: [], pointsForfeited: 0 };

  const seatNum = WINDS.indexOf(ownWind) + 1;
  const roundNum = WINDS.indexOf(roundWind) + 1;

  const set1 = flowers.filter(f => f.set === 1);
  const set2 = flowers.filter(f => f.set === 2);
  const hasBouquet1 = set1.length === 4;
  const hasBouquet2 = set2.length === 4;
  const bouquetCount = (hasBouquet1 ? 1 : 0) + (hasBouquet2 ? 1 : 0);

  const extraFlowers = flowers.filter(f => {
    if (f.set === 1 && hasBouquet1) return false;
    if (f.set === 2 && hasBouquet2) return false;
    return true;
  });
  const ownFlowers = flowers.filter(f => f.value === seatNum);
  const roundFlowers = flowers.filter(f => f.value === roundNum);
  const extraOwn = extraFlowers.filter(f => f.value === seatNum);
  const extraRound = extraFlowers.filter(f => f.value === roundNum);
  const hasOwnFlower = extraOwn.length >= 1;
  const hasRoundFlower = extraRound.length >= 1;
  const hasOwnPair = ownFlowers.length >= 2;
  const hasRoundPair = roundFlowers.length >= 2;

  let totalDoubles = 0;
  const reasons = [];
  let pointsForfeited = 0;

  if (bouquetCount === 2) {
    totalDoubles += 6; reasons.push('6× 2 Bouquets (flower doubles)'); pointsForfeited = 5000;
    return { totalDoubles, reasons, pointsForfeited };
  }
  if (bouquetCount >= 1 && hasOwnFlower && hasRoundFlower) {
    totalDoubles += 5; reasons.push('5× Bouquet + Own Flower + Round Flower');
    pointsForfeited = 1000 + (hasOwnPair ? 500 : 0) + (hasRoundPair ? 500 : 0);
    return { totalDoubles, reasons, pointsForfeited };
  }
  if (bouquetCount >= 1 && (hasOwnFlower || hasRoundFlower)) {
    totalDoubles += 4; reasons.push('4× Bouquet + Own/Round Flower');
    pointsForfeited = 1000 + (hasOwnPair ? 500 : 0) + (hasRoundPair ? 500 : 0);
    return { totalDoubles, reasons, pointsForfeited };
  }
  if (hasOwnPair && hasRoundPair) {
    totalDoubles += 4; reasons.push('4× Own Flower Pair + Round Flower Pair'); pointsForfeited = 1000;
    return { totalDoubles, reasons, pointsForfeited };
  }
  if (bouquetCount >= 1) {
    totalDoubles += 3; reasons.push('3× Bouquet (flower doubles)'); pointsForfeited = 1000;
    return { totalDoubles, reasons, pointsForfeited };
  }
  if ((hasOwnPair && hasRoundFlower) || (hasRoundPair && hasOwnFlower)) {
    totalDoubles += 3; reasons.push('3× Flower Pair + Flower of Round/Own'); pointsForfeited = 500;
    return { totalDoubles, reasons, pointsForfeited };
  }
  if (hasOwnPair || hasRoundPair) {
    totalDoubles += 2; reasons.push('2× Flower Pair (flower doubles)'); pointsForfeited = 500;
    return { totalDoubles, reasons, pointsForfeited };
  }

  return { totalDoubles: 0, reasons: [], pointsForfeited: 0 };
}

// ============================================================
// MASTER SCORING FUNCTION
// ============================================================

function analyzeHand(groups, flowers, options) {
  if (flowers === undefined) flowers = [];
  if (options === undefined) options = {};
  groups = safeGroups(groups);
  if (!Array.isArray(flowers)) flowers = [];
  var ownWind = options.ownWind || 'east';
  var roundWind = options.roundWind || 'west';
  var isEast = options.isEast || false;
  var isMahjong = options.isMahjong !== undefined ? options.isMahjong : true;
  var isLastTile = options.isLastTile || false;
  var isCleanSweep = options.isCleanSweep || false;
  var isConcealed = options.isConcealed || false;
  var isDrawnStanding = options.isDrawnStanding || false;
  var gameMode = options.gameMode || 'east_round';

  var eastHands = detectEastRoundHand(groups);
  var goulashHands = detectGoulashHand(groups);
  var allHands = gameMode === 'goulash' ? goulashHands : eastHands;

  var goulashScore = calculateGoulashScore(groups, flowers, options);

  var doublesResult = detectDoubles(groups, flowers, {
    ownWind: ownWind, roundWind: roundWind, isMahjong: isMahjong,
    isLastTile: isLastTile, isCleanSweep: isCleanSweep,
    isConcealed: isConcealed, isDrawnStanding: isDrawnStanding
  });

  var handDoubles = 0;
  var handDoubleReasons = [];
  if (gameMode === 'goulash' && goulashHands.length > 0) {
    var bestHand = goulashHands.reduce(function(best, h) {
      return (h.doubles || 0) > (best.doubles || 0) ? h : best;
    }, goulashHands[0]);
    if (bestHand.doubles > 0) {
      handDoubles = bestHand.doubles;
      handDoubleReasons.push(bestHand.doubles + '× ' + bestHand.name);
    }
  }

  var baseDoublesTotal = doublesResult.totalDoubles + handDoubles;
  var baseDoubleReasons = doublesResult.reasons.concat(handDoubleReasons);

  var flowerScore = scoreFlowers(flowers, ownWind, roundWind);
  var flowerDoublesResult = detectFlowerDoubles(flowers, ownWind, roundWind);

  // Path A: Flowers as POINTS
  var scoreA = goulashScore.basePoints;
  scoreA = lookupScoringCard(scoreA, baseDoublesTotal);
  if (isEast) scoreA *= 2;
  scoreA += flowerScore.points;
  var limitA = applyLimits(scoreA, isEast);

  // Path B: Flowers as DOUBLES
  var scoreB = goulashScore.basePoints;
  var totalDoublesB = baseDoublesTotal + flowerDoublesResult.totalDoubles;
  scoreB = lookupScoringCard(scoreB, totalDoublesB);
  if (isEast) scoreB *= 2;
  var limitB = applyLimits(scoreB, isEast);

  var useFlowerDoubles = limitB.score > limitA.score && flowerDoublesResult.totalDoubles > 0;
  var finalScore = useFlowerDoubles ? limitB.score : limitA.score;
  var finalLimitName = useFlowerDoubles ? limitB.limitName : limitA.limitName;
  var finalLimits = useFlowerDoubles ? limitB.limits : limitA.limits;
  var finalDoubles = useFlowerDoubles
    ? baseDoublesTotal + flowerDoublesResult.totalDoubles
    : baseDoublesTotal;
  var finalDoubleReasons = useFlowerDoubles
    ? baseDoubleReasons.concat(flowerDoublesResult.reasons)
    : baseDoubleReasons;
  var finalFlowerPoints = useFlowerDoubles ? 0 : flowerScore.points;
  var finalFlowerDetails = useFlowerDoubles
    ? ['Flowers used as doubles (higher score)']
    : flowerScore.details;

  var preEastScore = useFlowerDoubles ? limitB.score : limitA.score;
  if (isEast) {
    var scoreBeforeEast = useFlowerDoubles
      ? lookupScoringCard(goulashScore.basePoints, totalDoublesB)
      : lookupScoringCard(goulashScore.basePoints, baseDoublesTotal) + flowerScore.points;
    preEastScore = scoreBeforeEast;
  }

  var activeWindBonuses = [];
  for (var wi = 0; wi < groups.length; wi++) {
    var wg = groups[wi];
    if (wg.type !== 'pung' && wg.type !== 'kong') continue;
    var wt = wg.tiles[0];
    if (wt.type === 'wind' && wt.value === ownWind) activeWindBonuses.push('seat');
    if (wt.type === 'wind' && wt.value === roundWind) activeWindBonuses.push('round');
  }

  return {
    hands: allHands,
    groups: groups.map(function(g) {
      return {
        type: getGroupType(g.tiles),
        label: getGroupLabel(g.tiles),
        tiles: g.tiles,
        exposed: g.exposed,
        points: scoreGoulashSet(g)
      };
    }),
    scoring: {
      basePoints: goulashScore.basePoints,
      breakdown: goulashScore.breakdown,
      doubles: finalDoubles,
      doubleReasons: finalDoubleReasons,
      flowerPoints: finalFlowerPoints,
      flowerDetails: finalFlowerDetails,
      rawTotal: finalScore,
      finalScore: finalScore,
      limitName: finalLimitName,
      limits: finalLimits,
      isEast: isEast,
      preEastScore: isEast ? preEastScore : null,
      flowerMode: useFlowerDoubles ? 'doubles' : 'points',
      activeWindBonuses: activeWindBonuses
    },
    flowers: flowers
  };
}

// ============================================================
// HAND VALIDATION
// ============================================================

function validateHand(groups, tileCount) {
  groups = safeGroups(groups);
  var nonFlowerCount = tileCount || 0;
  var groupedCount = 0;
  groups.forEach(function(g) { groupedCount += g.tiles.length; });

  var sets = groups.filter(function(g) {
    return g.type === 'pung' || g.type === 'kong' || g.type === 'chow' ||
           g.type === 'mixed_chow' || g.type === 'crochet';
  });
  var pairs = groups.filter(function(g) { return g.type === 'pair'; });
  var knits = groups.filter(function(g) { return g.type === 'knit'; });
  var unknowns = groups.filter(function(g) { return g.type === 'unknown'; });

  var warnings = [];
  var isComplete = false;

  if (sets.length === 4 && pairs.length === 1 && unknowns.length === 0) { isComplete = true; }
  else if (pairs.length === 7 && sets.length === 0) { isComplete = true; }
  else if (pairs.length === 3 && sets.length === 2) { isComplete = true; }
  else if (knits.length === 3 && sets.length >= 1) { isComplete = true; }

  if (nonFlowerCount > 0) {
    if (nonFlowerCount < 13) {
      warnings.push('Only ' + nonFlowerCount + ' tiles detected (need 13-14 for a complete hand)');
    } else if (nonFlowerCount > 18) {
      warnings.push('Too many tiles (' + nonFlowerCount + ') — check for duplicates');
    }
  }

  var leftover = nonFlowerCount - groupedCount;
  if (leftover > 0) { warnings.push(leftover + ' tile(s) could not form valid melds'); }
  if (unknowns.length > 0) { warnings.push(unknowns.length + ' group(s) do not form recognized melds'); }

  if (!isComplete) {
    if (sets.length < 4 && pairs.length < 7) {
      warnings.push('Incomplete hand: ' + sets.length + ' set(s) + ' + pairs.length + ' pair(s) found (need 4 sets + 1 pair)');
    }
  }

  return {
    isComplete: isComplete,
    setCount: sets.length,
    pairCount: pairs.length,
    knitCount: knits.length,
    unknownCount: unknowns.length,
    groupedTileCount: groupedCount,
    totalTileCount: nonFlowerCount,
    leftoverCount: leftover > 0 ? leftover : 0,
    warnings: warnings
  };
}

// ============================================================
// EXPORT — combines all functions from both files
// ============================================================
if (typeof window !== 'undefined') {
  window.MahjongScorer = {
    getAllTiles: getAllTiles, getAllFlowers: getAllFlowers,
    tileId: tileId, tileName: tileName, tileEmoji: tileEmoji,
    isSuited: isSuited, isHonour: isHonour, isTerminal: isTerminal,
    isMajor: isMajor, isMinor: isMinor,
    isPung: isPung, isKong: isKong, isPair: isPair,
    isChow: isChow, isMixedChow: isMixedChow, isCrochet: isCrochet, isKnit: isKnit,
    getGroupType: getGroupType, getGroupLabel: getGroupLabel,
    detectEastRoundHand: detectEastRoundHand, detectGoulashHand: detectGoulashHand,
    calculateGoulashScore: calculateGoulashScore,
    detectDoubles: detectDoubles, detectFlowerDoubles: detectFlowerDoubles,
    scoreFlowers: scoreFlowers,
    analyzeHand: analyzeHand, lookupScoringCard: lookupScoringCard,
    applyLimits: applyLimits, validateHand: validateHand,
    safeGroups: safeGroups, safeFlatTiles: safeFlatTiles,
    SUITS: SUITS, SUIT_LABELS: SUIT_LABELS, WINDS: WINDS, DRAGONS: DRAGONS, HONOURS: HONOURS
  };
}
