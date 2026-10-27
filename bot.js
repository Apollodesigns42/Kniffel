// Kniffel-Bots in drei Stärken – im Browser (window.KniffelBot) und in Node (module.exports) nutzbar.
//   easy:   hält die häufigste Augenzahl und nimmt das Feld mit den meisten Punkten
//   medium: sucht den Wurf mit den meisten direkten Punkten, schaut einen Wurf voraus
//   hard:   berücksichtigt Bonus und was ein Feld später wert wäre und berechnet den
//           exakten Erwartungswert über alle restlichen Würfe
(function (root) {
  const K = typeof module !== 'undefined' && module.exports ? require('./scoring.js') : root.Kniffel;
  const { UPPER, LOWER, UPPER_BONUS_THRESHOLD, UPPER_BONUS, score } = K;
  const CATEGORIES = [...UPPER, ...LOWER];

  const LEVELS = [
    { id: 'easy', name: 'leicht' },
    { id: 'medium', name: 'mittel' },
    { id: 'hard', name: 'schwer' },
  ];

  // Durchschnittlicher Wert eines Feldes bei guter Spielweise – was man aufgibt, wenn man es jetzt belegt.
  const TYPICAL = {
    ones: 2.1, twos: 5.3, threes: 8.6, fours: 12.2, fives: 15.7, sixes: 19.2,
    threeKind: 21.7, fourKind: 13.1, fullHouse: 22.6, smallStraight: 29.5,
    largeStraight: 32.7, kniffel: 16.9, chance: 22.0,
  };

  const openCategories = (sheet) => CATEGORIES.filter((c) => sheet[c.id] === undefined);

  // Grobe Bewertung (medium): nur die Punkte, Chance als Notlösung.
  function evaluateSimple(cat, dice) {
    return score(cat.id, dice) - (cat.id === 'chance' ? 15 : 0);
  }

  // Genaue Bewertung (hard): Punkte minus typischer Feldwert, plus Fortschritt Richtung Bonus.
  function evaluate(cat, dice, sheet) {
    const points = score(cat.id, dice);
    let value = points - TYPICAL[cat.id];
    if (cat.face) {
      const upperSum = UPPER.reduce((a, u) => a + (sheet[u.id] ?? 0), 0);
      if (upperSum < UPPER_BONUS_THRESHOLD) {
        if (upperSum + points >= UPPER_BONUS_THRESHOLD) value += UPPER_BONUS;
        else value += (points - 3 * cat.face) * 0.6; // über/unter Soll für den Bonus
      }
    }
    return value;
  }

  // ---------- Würfel-Kombinatorik ----------
  // Würfe werden als sortierte Augenzahlen betrachtet: 252 mögliche Würfe mit 5 Würfeln,
  // 462 mögliche gehaltene Teilmengen (0–5 Würfel). Die Übergänge werden einmal vorberechnet.
  const keyOf = (dice) => dice.join('');
  const sorted = (dice) => [...dice].sort((a, b) => a - b);

  function multisets(size, min = 1) {
    if (size === 0) return [[]];
    const out = [];
    for (let f = min; f <= 6; f++) for (const rest of multisets(size - 1, f)) out.push([f, ...rest]);
    return out;
  }

  const ROLLS = multisets(5);
  const ROLL_INDEX = new Map(ROLLS.map((d, i) => [keyOf(d), i]));
  const KEEPS = [0, 1, 2, 3, 4, 5].flatMap((n) => multisets(n));
  const KEEP_INDEX = new Map(KEEPS.map((d, i) => [keyOf(d), i]));

  // Für k neu geworfene Würfel: alle Ergebnisse (sortiert) mit Wahrscheinlichkeit.
  const REROLLS = [0, 1, 2, 3, 4, 5].map((k) => {
    const map = new Map();
    const total = 6 ** k;
    for (let n = 0; n < total; n++) {
      const dice = [];
      for (let i = 0, x = n; i < k; i++, x = Math.floor(x / 6)) dice.push(1 + (x % 6));
      const key = keyOf(sorted(dice));
      const entry = map.get(key) || { dice: sorted(dice), p: 0 };
      entry.p += 1 / total;
      map.set(key, entry);
    }
    return [...map.values()];
  });

  // KEEP_OUTCOMES[k]: Liste [Wurfindex, Wahrscheinlichkeit] nach Halten von KEEPS[k] und Neuwürfeln des Rests.
  const KEEP_OUTCOMES = KEEPS.map((kept) =>
    REROLLS[5 - kept.length].map(({ dice, p }) => [ROLL_INDEX.get(keyOf(sorted([...kept, ...dice]))), p]));

  // ROLL_KEEPS[r]: Indizes aller unterschiedlichen echten Teilmengen (weniger als 5 Würfel) von Wurf r.
  const ROLL_KEEPS = ROLLS.map((dice) => {
    const set = new Set();
    for (let mask = 0; mask < 31; mask++) {
      set.add(KEEP_INDEX.get(keyOf(dice.filter((_, i) => mask & (1 << i)))));
    }
    return [...set];
  });

  function createSolver(sheet, level) {
    const cats = openCategories(sheet);
    const depthLimit = level === 'hard' ? 2 : 1;
    const rate = level === 'hard' ? (c, dice) => evaluate(c, dice, sheet) : evaluateSimple;
    // values[r][i]: erwarteter Wert von Wurf i, wenn danach noch r Würfe erlaubt sind.
    const values = [ROLLS.map((dice) => Math.max(...cats.map((c) => rate(c, dice))))];
    const keepValues = [];

    for (let r = 1; r <= depthLimit; r++) {
      const prev = values[r - 1];
      const kv = KEEP_OUTCOMES.map((outs) => outs.reduce((sum, [i, p]) => sum + p * prev[i], 0));
      keepValues[r] = kv;
      values[r] = ROLLS.map((_, i) => Math.max(values[0][i], ...ROLL_KEEPS[i].map((k) => kv[k])));
    }

    return {
      stopValue: (dice) => values[0][ROLL_INDEX.get(keyOf(sorted(dice)))],
      keepValue: (kept, rollsLeft) => keepValues[Math.min(rollsLeft, depthLimit)][KEEP_INDEX.get(keyOf(kept))],
    };
  }

  // Welche Würfel halten? Gibt ein Boolean-Array zurück oder null, wenn der Bot nicht mehr würfeln will.
  function chooseHolds(dice, sheet, rollsLeft, level) {
    if (rollsLeft === 0) return null;

    if (level === 'easy') {
      const c = [0, 0, 0, 0, 0, 0, 0];
      for (const d of dice) c[d]++;
      let face = 6;
      for (let f = 6; f >= 1; f--) if (c[f] > c[face]) face = f;
      if (c[face] === 5) return null;
      return dice.map((d) => d === face);
    }

    const solver = createSolver(sheet, level);
    const s = sorted(dice);
    let bestKept = null;
    let best = solver.stopValue(s);
    for (const k of ROLL_KEEPS[ROLL_INDEX.get(keyOf(s))]) {
      const v = solver.keepValue(KEEPS[k], rollsLeft);
      if (v > best + 1e-9) { best = v; bestKept = KEEPS[k]; }
    }
    if (!bestKept) return null;

    // Gewählte Augenzahlen den Würfelpositionen zuordnen.
    const remaining = [...bestKept];
    return dice.map((d) => {
      const idx = remaining.indexOf(d);
      if (idx === -1) return false;
      remaining.splice(idx, 1);
      return true;
    });
  }

  function chooseCategory(dice, sheet, level) {
    const cats = openCategories(sheet);
    const rate = level === 'easy'
      ? (c) => score(c.id, dice) * 100 - (c.id === 'chance' ? 50 : 0) - CATEGORIES.indexOf(c)
      : level === 'medium'
        ? (c) => evaluateSimple(c, dice)
        : (c) => evaluate(c, dice, sheet);
    return cats.reduce((best, c) => (rate(c) > rate(best) ? c : best)).id;
  }

  const api = { LEVELS, chooseHolds, chooseCategory };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KniffelBot = api;
})(this);
