// Kniffel-Wertungslogik – im Browser (window.Kniffel) und in Node (module.exports) nutzbar.
(function (root) {
  const UPPER = [
    { id: 'ones', name: 'Einser', face: 1 },
    { id: 'twos', name: 'Zweier', face: 2 },
    { id: 'threes', name: 'Dreier', face: 3 },
    { id: 'fours', name: 'Vierer', face: 4 },
    { id: 'fives', name: 'Fünfer', face: 5 },
    { id: 'sixes', name: 'Sechser', face: 6 },
  ];

  const LOWER = [
    { id: 'threeKind', name: 'Dreierpasch', hint: 'Alle Augen' },
    { id: 'fourKind', name: 'Viererpasch', hint: 'Alle Augen' },
    { id: 'fullHouse', name: 'Full House', hint: '25 Punkte' },
    { id: 'smallStraight', name: 'Kleine Straße', hint: '30 Punkte' },
    { id: 'largeStraight', name: 'Große Straße', hint: '40 Punkte' },
    { id: 'kniffel', name: 'Kniffel', hint: '50 Punkte' },
    { id: 'chance', name: 'Chance', hint: 'Alle Augen' },
  ];

  const UPPER_BONUS_THRESHOLD = 63;
  const UPPER_BONUS = 35;

  function counts(dice) {
    const c = [0, 0, 0, 0, 0, 0, 0];
    for (const d of dice) c[d]++;
    return c;
  }

  function sum(dice) {
    return dice.reduce((a, b) => a + b, 0);
  }

  function hasRun(c, length) {
    let run = 0;
    for (let face = 1; face <= 6; face++) {
      run = c[face] > 0 ? run + 1 : 0;
      if (run >= length) return true;
    }
    return false;
  }

  function score(categoryId, dice) {
    const c = counts(dice);
    const max = Math.max(...c);
    const upper = UPPER.find((u) => u.id === categoryId);
    if (upper) return c[upper.face] * upper.face;

    switch (categoryId) {
      case 'threeKind':
        return max >= 3 ? sum(dice) : 0;
      case 'fourKind':
        return max >= 4 ? sum(dice) : 0;
      case 'fullHouse':
        return c.includes(3) && c.includes(2) ? 25 : 0;
      case 'smallStraight':
        return hasRun(c, 4) ? 30 : 0;
      case 'largeStraight':
        return hasRun(c, 5) ? 40 : 0;
      case 'kniffel':
        return max === 5 ? 50 : 0;
      case 'chance':
        return sum(dice);
      default:
        throw new Error('Unbekannte Kategorie: ' + categoryId);
    }
  }

  function totals(sheet) {
    const upperSum = UPPER.reduce((a, u) => a + (sheet[u.id] ?? 0), 0);
    const bonus = upperSum >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS : 0;
    const upperTotal = upperSum + bonus;
    const lowerTotal = LOWER.reduce((a, l) => a + (sheet[l.id] ?? 0), 0);
    return { upperSum, bonus, upperTotal, lowerTotal, total: upperTotal + lowerTotal };
  }

  const api = { UPPER, LOWER, UPPER_BONUS_THRESHOLD, UPPER_BONUS, score, totals };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Kniffel = api;
})(this);
