// ============================================================
// SCOREJONG — Scoring Engine (Part 2: Doubles, Flowers, Analysis)
// Requires mahjong-scorer-core.js to be loaded first
// ============================================================

// ============================================================
// DOUBLES DETECTION (from the Doubles page)
// ============================================================

function detectDoubles(groups, flowers, options) {
  if (!options) options = {};
  groups = safeGroups(groups);
  var ownWind = options.ownWind || 'east';
  var roundWind = options.roundWind || 'west';
  var isMahjong = options.isMahjong || false;
  var isLastTile = options.isLastTile || false;
  var isCleanSweep = options.isCleanSweep || false;
  var isConcealed = options.isConcealed || false;
  var isDrawnStanding = options.isDrawnStanding || false;

  var totalDoubles = 0;
  var reasons = [];

  var pungs = groups.filter(function(g) { return g.type === 'pung' || g.type === 'kong'; });
  var kongs = groups.filter(function(g) { return g.type === 'kong'; });
  var concealedPungs = pungs.filter(function(g) { return !g.exposed; });
  var concealedKongs = kongs.filter(function(g) { return !g.exposed; });
  var pairs = groups.filter(function(g) { return g.type === 'pair'; });
  var allTiles = safeFlatTiles(groups);

  // === HAND COMPOSITION DOUBLES ===

  // All Honours: 3 doubles (all tiles are winds/dragons)
  if (allTiles.length > 0 && allTiles.every(function(t) { return isHonour(t); })) {
    totalDoubles += 3; reasons.push('3x All Honours');
  }

  // One Suit Clean: 3 doubles (all tiles one suit, no honours)
  var allSuited = allTiles.filter(function(t) { return isSuited(t); });
  var allHonours = allTiles.filter(function(t) { return isHonour(t); });
  if (allSuited.length > 0 && allHonours.length === 0) {
    var suitSet = {};
    allSuited.forEach(function(t) { suitSet[t.suit] = true; });
    if (Object.keys(suitSet).length === 1) {
      totalDoubles += 3; reasons.push('3x One Suit Clean');
    }
  }

  // All Majors: 1 double (all tiles are terminals 1/9 + honours)
  if (allTiles.length > 0 && allTiles.every(function(t) { return isMajor(t); })) {
    totalDoubles += 1; reasons.push('1x All Majors');
  }

  // Pungs/Kongs of 1&9: 1 double (all pungs/kongs are terminal values)
  if (pungs.length > 0 && pungs.every(function(g) { return isTerminal(g.tiles[0]); })) {
    totalDoubles += 1; reasons.push('1x Pungs/Kongs of 1 and 9');
  }

  // === INDIVIDUAL MELD DOUBLES ===

  // Pung of Dragon: 1 each
  pungs.forEach(function(g) {
    if (g.tiles[0].type === 'dragon') {
      totalDoubles += 1; reasons.push('1x Pung of ' + tileName(g.tiles[0]));
    }
  });

  // Pung of Own Wind / Round Wind: 1 each (or 2 for double wind)
  var windPungs = pungs.filter(function(g) { return g.tiles[0].type === 'wind'; });
  var dragonPungs = pungs.filter(function(g) { return g.tiles[0].type === 'dragon'; });

  if (ownWind === roundWind) {
    // Double wind: 2 doubles for pung of own=round wind
    pungs.forEach(function(g) {
      if (g.tiles[0].type === 'wind' && g.tiles[0].value === ownWind) {
        totalDoubles += 2; reasons.push('2x Pung of Double Wind');
      }
    });
  } else {
    pungs.forEach(function(g) {
      if (g.tiles[0].type === 'wind' && g.tiles[0].value === ownWind) {
        totalDoubles += 1; reasons.push('1x Pung of Own Wind');
      }
    });
    pungs.forEach(function(g) {
      if (g.tiles[0].type === 'wind' && g.tiles[0].value === roundWind) {
        totalDoubles += 1; reasons.push('1x Pung of Round Wind');
      }
    });
  }

  // 3 Pungs/Kongs of Dragons: 1
  if (dragonPungs.length >= 3) { totalDoubles += 1; reasons.push('1x 3 Pungs/Kongs of Dragons'); }

  // 3 Pungs/Kongs of Winds: 1
  if (windPungs.length >= 3) { totalDoubles += 1; reasons.push('1x 3 Pungs/Kongs of Winds'); }

  // 4 Pungs/Kongs of Winds: 2 (replaces the 3-wind bonus)
  if (windPungs.length >= 4) { totalDoubles += 2; reasons.push('2x 4 Pungs/Kongs of Winds'); }

  // === CONCEALMENT & KONG BONUSES (highest applicable only) ===
  var meldBonus = 0;
  var meldReason = '';
  if (concealedKongs.length >= 4) { meldBonus = 4; meldReason = '4x Four Hidden Kongs'; }
  else if (kongs.length >= 4) { meldBonus = 3; meldReason = '3x Four Kongs'; }
  else if (concealedKongs.length >= 3) { meldBonus = 3; meldReason = '3x Three Hidden Kongs'; }
  else if (concealedPungs.length >= 4) { meldBonus = 2; meldReason = '2x Four Hidden Pungs'; }
  else if (kongs.length >= 3) { meldBonus = 2; meldReason = '2x Three Kongs'; }
  else if (concealedPungs.length >= 3) { meldBonus = 1; meldReason = '1x Three Hidden Pungs'; }
  if (meldBonus > 0) { totalDoubles += meldBonus; reasons.push(meldReason); }

  // === FLOWER DOUBLES ===
  var seatNum = WINDS.indexOf(ownWind) + 1;
  var roundNum = WINDS.indexOf(roundWind) + 1;
  if (flowers && flowers.length > 0) {
    // Own Flower/Season: 1
    if (flowers.some(function(f) { return f.value === seatNum; })) {
      totalDoubles += 1; reasons.push('1x Own Flower');
    }
    // Number of the Round: 1
    if (flowers.some(function(f) { return f.value === roundNum; })) {
      totalDoubles += 1; reasons.push('1x Flower of the Round');
    }
    // Bouquet: 3 (complete set of 4 seasons or 4 gentlemen)
    var set1 = flowers.filter(function(f) { return f.set === 1; });
    var set2 = flowers.filter(function(f) { return f.set === 2; });
    if (set1.length === 4) { totalDoubles += 3; reasons.push('3x Season Bouquet'); }
    if (set2.length === 4) { totalDoubles += 3; reasons.push('3x Gentleman Bouquet'); }
  }

  // === SPECIAL DOUBLES ===
  if (isLastTile) { totalDoubles += 1; reasons.push('1x Mahjong on Last Tile'); }
  if (isCleanSweep) { totalDoubles += 1; reasons.push('1x Clean Sweep'); }
  if (isConcealed && isMahjong) { totalDoubles += 3; reasons.push('3x Concealed Mahjong'); }
  if (isDrawnStanding) { totalDoubles += 5; reasons.push('5x Drawn Standing Hand'); }

  return { totalDoubles: totalDoubles, reasons: reasons };
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
  return { score: score, limitName: null, limits: {} };
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

  // Score: base x 2^doubles, then East x2, then add flower points
  // Flowers always give BOTH doubles (in detectDoubles) AND points (bouquet/pair) - no either/or
  var rawScore = lookupScoringCard(goulashScore.basePoints, baseDoublesTotal);
  if (isEast) rawScore *= 2;
  rawScore += flowerScore.points;
  var limited = applyLimits(rawScore, isEast);

  var finalScore = limited.score;
  var finalLimitName = limited.limitName;
  var finalLimits = limited.limits;
  var finalDoubles = baseDoublesTotal;
  var finalDoubleReasons = baseDoubleReasons;
  var finalFlowerPoints = flowerScore.points;
  var finalFlowerDetails = flowerScore.details;

  var preEastScore = finalScore;
  if (isEast) {
    // Show score before East doubling (without flower points - they're added after East)
    preEastScore = lookupScoringCard(goulashScore.basePoints, baseDoublesTotal);
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
      flowerMode: 'points',
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
