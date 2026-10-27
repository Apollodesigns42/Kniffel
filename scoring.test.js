const assert = require('node:assert/strict');
const test = require('node:test');
const { score, totals } = require('./scoring.js');

test('obere Sektion zählt nur passende Augen', () => {
  assert.equal(score('ones', [1, 1, 2, 3, 1]), 3);
  assert.equal(score('sixes', [6, 6, 6, 2, 1]), 18);
  assert.equal(score('fours', [1, 2, 3, 5, 6]), 0);
});

test('Pasche', () => {
  assert.equal(score('threeKind', [3, 3, 3, 2, 1]), 12);
  assert.equal(score('threeKind', [3, 3, 2, 2, 1]), 0);
  assert.equal(score('fourKind', [5, 5, 5, 5, 1]), 21);
  assert.equal(score('fourKind', [5, 5, 5, 2, 1]), 0);
  assert.equal(score('fourKind', [4, 4, 4, 4, 4]), 20);
});

test('Full House', () => {
  assert.equal(score('fullHouse', [2, 2, 3, 3, 3]), 25);
  assert.equal(score('fullHouse', [2, 2, 2, 2, 3]), 0);
  assert.equal(score('fullHouse', [6, 6, 6, 6, 6]), 0);
});

test('Straßen', () => {
  assert.equal(score('smallStraight', [1, 2, 3, 4, 6]), 30);
  assert.equal(score('smallStraight', [3, 4, 5, 6, 6]), 30);
  assert.equal(score('smallStraight', [1, 2, 3, 5, 6]), 0);
  assert.equal(score('largeStraight', [2, 3, 4, 5, 6]), 40);
  assert.equal(score('largeStraight', [1, 2, 3, 4, 6]), 0);
  assert.equal(score('smallStraight', [5, 4, 3, 2, 1]), 30);
});

test('Kniffel und Chance', () => {
  assert.equal(score('kniffel', [3, 3, 3, 3, 3]), 50);
  assert.equal(score('kniffel', [3, 3, 3, 3, 2]), 0);
  assert.equal(score('chance', [1, 2, 3, 4, 5]), 15);
});

test('Bonus ab 63 Punkten in der oberen Sektion', () => {
  const sheet = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18, chance: 20 };
  assert.deepEqual(totals(sheet), { upperSum: 63, bonus: 35, upperTotal: 98, lowerTotal: 20, total: 118 });
  assert.equal(totals({ ...sheet, ones: 2 }).bonus, 0);
});
