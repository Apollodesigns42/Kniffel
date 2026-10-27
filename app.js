(function () {
  const { UPPER, LOWER, score, totals } = window.Kniffel;
  const CATEGORIES = [...UPPER, ...LOWER];
  const ROLLS_PER_TURN = 3;
  const MAX_PLAYERS = 6;
  const SAVE_KEY = 'kniffel.save';
  const HIGHSCORE_KEY = 'kniffel.highscores';
  const PIPS = {
    1: [4],
    2: [1, 7],
    3: [1, 4, 7],
    4: [1, 2, 6, 7],
    5: [1, 2, 4, 6, 7],
    6: [1, 2, 3, 5, 6, 7],
  };

  const $ = (id) => document.getElementById(id);
  const screens = { setup: $('screen-setup'), game: $('screen-game'), end: $('screen-end') };

  let state = null;
  let setupNames = ['Spieler 1', 'Spieler 2'];
  let lastScored = null;

  // ---------- Speicher ----------
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function save(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch { /* Speicher nicht verfügbar – Spiel läuft trotzdem */ }
  }

  // ---------- Bildschirme ----------
  function show(name) {
    for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
    $('btn-menu').hidden = name !== 'game';
  }

  // ---------- Setup ----------
  function renderSetup() {
    const list = $('player-list');
    list.innerHTML = '';
    setupNames.forEach((name, i) => {
      const li = document.createElement('li');
      const input = document.createElement('input');
      input.value = name;
      input.maxLength = 16;
      input.placeholder = `Spieler ${i + 1}`;
      input.setAttribute('aria-label', `Name von Spieler ${i + 1}`);
      input.addEventListener('input', () => { setupNames[i] = input.value; });
      li.appendChild(input);
      if (setupNames.length > 1) {
        const remove = document.createElement('button');
        remove.className = 'ghost remove';
        remove.textContent = '✕';
        remove.setAttribute('aria-label', 'Spieler entfernen');
        remove.addEventListener('click', () => {
          setupNames.splice(i, 1);
          renderSetup();
        });
        li.appendChild(remove);
      }
      list.appendChild(li);
    });
    $('btn-add-player').disabled = setupNames.length >= MAX_PLAYERS;
    $('btn-resume').hidden = !load(SAVE_KEY, null);
    renderHighscores();
  }

  function renderHighscores() {
    const list = $('highscores');
    const scores = load(HIGHSCORE_KEY, []);
    list.innerHTML = '';
    if (!scores.length) {
      list.innerHTML = '<p class="muted">Noch keine Einträge – spiel eine Runde!</p>';
      return;
    }
    for (const s of scores) {
      const li = document.createElement('li');
      li.textContent = `${s.name} – ${s.score} Punkte`;
      const date = document.createElement('span');
      date.className = 'date';
      date.textContent = new Date(s.date).toLocaleDateString('de-DE');
      li.appendChild(date);
      list.appendChild(li);
    }
  }

  function startGame(names) {
    state = {
      players: names.map((name, i) => ({ name: name.trim() || `Spieler ${i + 1}`, sheet: {} })),
      current: 0,
      rollsLeft: ROLLS_PER_TURN,
      dice: [1, 1, 1, 1, 1],
      held: [false, false, false, false, false],
    };
    lastScored = null;
    persist();
    show('game');
    renderGame();
  }

  // ---------- Spiellogik ----------
  const hasRolled = () => state.rollsLeft < ROLLS_PER_TURN;
  const filledCount = (p) => CATEGORIES.filter((c) => p.sheet[c.id] !== undefined).length;
  const isGameOver = () => state.players.every((p) => filledCount(p) === CATEGORIES.length);

  function roll() {
    if (!state || state.rollsLeft === 0) return;
    const rolling = [];
    state.dice = state.dice.map((d, i) => {
      if (hasRolled() && state.held[i]) return d;
      rolling.push(i);
      return 1 + Math.floor(Math.random() * 6);
    });
    state.rollsLeft--;
    persist();
    renderGame(rolling);
  }

  function toggleHold(i) {
    if (!hasRolled() || state.rollsLeft === 0) return;
    state.held[i] = !state.held[i];
    persist();
    renderDice();
  }

  function scoreCategory(id) {
    const player = state.players[state.current];
    if (!hasRolled() || player.sheet[id] !== undefined) return;
    player.sheet[id] = score(id, state.dice);
    lastScored = { player: state.current, id };

    if (isGameOver()) {
      finishGame();
      return;
    }
    state.current = (state.current + 1) % state.players.length;
    state.rollsLeft = ROLLS_PER_TURN;
    state.held = state.held.map(() => false);
    persist();
    renderGame();
  }

  function finishGame() {
    const ranking = state.players
      .map((p) => ({ name: p.name, score: totals(p.sheet).total }))
      .sort((a, b) => b.score - a.score);

    const date = Date.now();
    const highscores = [...load(HIGHSCORE_KEY, []), ...ranking.map((r) => ({ ...r, date }))]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    save(HIGHSCORE_KEY, highscores);
    save(SAVE_KEY, null);

    const best = ranking[0].score;
    const winners = ranking.filter((r) => r.score === best).map((r) => r.name);
    $('winner-title').textContent = state.players.length === 1
      ? `Geschafft: ${best} Punkte!`
      : winners.length > 1
        ? `Unentschieden: ${winners.join(' & ')} 🏆`
        : `${winners[0]} gewinnt! 🏆`;

    const list = $('ranking');
    list.innerHTML = '';
    for (const r of ranking) {
      const li = document.createElement('li');
      li.textContent = `${r.name}: ${r.score} Punkte`;
      list.appendChild(li);
    }
    show('end');
  }

  function persist() {
    save(SAVE_KEY, state);
  }

  // ---------- Darstellung ----------
  function renderGame(rolling = []) {
    const player = state.players[state.current];
    $('current-player').textContent = state.players.length > 1 ? `${player.name} ist dran` : player.name;
    const round = Math.min(filledCount(player) + 1, CATEGORIES.length);
    $('round-info').textContent = `Runde ${round} / ${CATEGORIES.length}`;

    const btn = $('btn-roll');
    btn.disabled = state.rollsLeft === 0;
    btn.textContent = state.rollsLeft === 0
      ? 'Keine Würfe mehr'
      : `Würfeln (${state.rollsLeft} übrig)`;

    $('hint').textContent = !hasRolled()
      ? 'Würfle, um deinen Zug zu beginnen.'
      : state.rollsLeft === 0
        ? 'Wähle ein Feld im Spielblock.'
        : 'Tippe Würfel zum Halten an – oder trage direkt ein.';

    renderDice(rolling);
    renderSheet();
  }

  function renderDice(rolling = []) {
    const wrap = $('dice');
    wrap.innerHTML = '';
    state.dice.forEach((value, i) => {
      const die = document.createElement('button');
      die.className = 'die';
      if (!hasRolled()) die.classList.add('blank');
      if (hasRolled() && state.held[i]) die.classList.add('held');
      if (rolling.includes(i)) die.classList.add('rolling');
      die.disabled = !hasRolled() || state.rollsLeft === 0;
      die.setAttribute('aria-label', hasRolled()
        ? `Würfel ${i + 1}: ${value}${state.held[i] ? ', gehalten' : ''}`
        : `Würfel ${i + 1}`);
      if (hasRolled()) {
        for (const p of PIPS[value]) {
          const pip = document.createElement('span');
          pip.className = `pip p${p}`;
          die.appendChild(pip);
        }
      }
      die.addEventListener('click', () => toggleHold(i));
      wrap.appendChild(die);
    });
  }

  function renderSheet() {
    const table = $('sheet');
    const players = state.players;
    const rows = [];

    const head = players.map((p, i) =>
      `<th class="${i === state.current ? 'active' : ''}">${escapeHtml(p.name)}</th>`).join('');
    rows.push(`<thead><tr><th></th>${head}</tr></thead><tbody>`);

    const catRow = (cat, hint) => {
      const cells = players.map((p, i) => {
        const value = p.sheet[cat.id];
        const isActive = i === state.current;
        const classes = [];
        if (isActive) classes.push('active-col');
        if (lastScored && lastScored.player === i && lastScored.id === cat.id) classes.push('just-scored');
        if (value !== undefined) return `<td class="${classes.join(' ')}">${value}</td>`;
        if (isActive && hasRolled()) {
          const preview = score(cat.id, state.dice);
          classes.push('open');
          if (preview === 0) classes.push('zero');
          const label = preview === 0 ? `${cat.name} streichen` : `${preview} Punkte bei ${cat.name} eintragen`;
          return `<td class="${classes.join(' ')}" data-cat="${cat.id}" tabindex="0" role="button" aria-label="${label}">${preview === 0 ? '–' : preview}</td>`;
        }
        return `<td class="${classes.join(' ')}"></td>`;
      }).join('');
      return `<tr><td class="cat">${cat.name}${hint ? `<small>${hint}</small>` : ''}</td>${cells}</tr>`;
    };
    const sumRow = (label, key, extraClass = '') => {
      const cells = players.map((p) => `<td>${totals(p.sheet)[key]}</td>`).join('');
      return `<tr class="sum ${extraClass}"><td>${label}</td>${cells}</tr>`;
    };

    for (const cat of UPPER) rows.push(catRow(cat, `nur ${cat.face}er zählen`));
    rows.push(sumRow('Summe oben', 'upperSum'));
    rows.push(sumRow('Bonus (ab 63)', 'bonus'));
    for (const cat of LOWER) rows.push(catRow(cat, cat.hint));
    rows.push(sumRow('Summe unten', 'lowerTotal'));
    rows.push(sumRow('Gesamt', 'total', 'total'));
    rows.push('</tbody>');

    table.innerHTML = rows.join('');
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- Ereignisse ----------
  $('btn-add-player').addEventListener('click', () => {
    if (setupNames.length >= MAX_PLAYERS) return;
    setupNames.push(`Spieler ${setupNames.length + 1}`);
    renderSetup();
    $('player-list').querySelector('li:last-child input').select();
  });
  $('btn-start').addEventListener('click', () => startGame(setupNames));
  $('btn-resume').addEventListener('click', () => {
    state = load(SAVE_KEY, null);
    if (!state) return renderSetup();
    show('game');
    renderGame();
  });
  $('btn-roll').addEventListener('click', roll);
  $('btn-menu').addEventListener('click', () => {
    setupNames = state.players.map((p) => p.name);
    show('setup');
    renderSetup();
  });
  $('btn-rematch').addEventListener('click', () => startGame(state.players.map((p) => p.name)));
  $('btn-new').addEventListener('click', () => {
    setupNames = state.players.map((p) => p.name);
    show('setup');
    renderSetup();
  });

  $('sheet').addEventListener('click', (e) => {
    const cell = e.target.closest('td[data-cat]');
    if (cell) scoreCategory(cell.dataset.cat);
  });
  $('sheet').addEventListener('keydown', (e) => {
    const cell = e.target.closest('td[data-cat]');
    if (cell && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      scoreCategory(cell.dataset.cat);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (screens.game.hidden || e.target.matches('input, button, td[data-cat]')) return;
    if (e.key === ' ') {
      e.preventDefault();
      roll();
    } else if (/^[1-5]$/.test(e.key)) {
      toggleHold(Number(e.key) - 1);
    }
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  renderSetup();
  show('setup');
})();
