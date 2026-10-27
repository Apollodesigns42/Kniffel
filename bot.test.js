const assert = require('node:assert/strict');
const test = require('node:test');
const { chooseHolds, chooseCategory } = require('./bot.js');

const LEVELS = ['easy', 'medium', 'hard'];

test('Bots behalten einen Kniffel und tragen ihn ein', () => {
  for (const level of LEVELS) {
    assert.equal(chooseHolds([4, 4, 4, 4, 4], {}, 2, level), null, level);
    assert.equal(chooseCategory([4, 4, 4, 4, 4], {}, level), 'kniffel', level);
  }
});

test('Bots wählen nur freie Felder', () => {
  const sheet = { kniffel: 50, fours: 16 };
  for (const level of LEVELS) {
    const cat = chooseCategory([4, 4, 4, 4, 4], sheet, level);
    assert.ok(!(cat in sheet), `${level} wählte belegtes Feld ${cat}`);
  }
});

test('Mittel und schwer nehmen eine Große Straße sofort', () => {
  for (const level of ['medium', 'hard']) {
    assert.equal(chooseHolds([2, 3, 4, 5, 6], {}, 2, level), null, level);
    assert.equal(chooseCategory([2, 3, 4, 5, 6], {}, level), 'largeStraight', level);
  }
});

test('Schwer hält den Vierling', () => {
  assert.deepEqual(chooseHolds([6, 2, 6, 6, 6], {}, 2, 'hard'), [true, false, true, true, true]);
});

test('Leichter Bot hält die häufigste Augenzahl', () => {
  assert.deepEqual(chooseHolds([3, 5, 3, 1, 5], {}, 1, 'easy'), [false, true, false, false, true]);
});
