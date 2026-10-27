(function () {
  const { UPPER, LOWER, score, totals } = window.Kniffel;
  const { LEVELS, chooseHolds, chooseCategory } = window.KniffelBot;
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
  const BOT_DELAY = { start: 700, afterRoll: 1000, afterHold: 650 };
  const levelName = (id) => LEVELS.find((l) => l.id === id)?.name ?? '';

  const $ = (id) => document.getElementById(id);
  const screens = { setup: $('screen-setup'), game: $('screen-game'), end: $('screen-end') };

  let state = null;
  let setupPlayers = [{ name: 'Spieler 1', bot: null }, { name: 'Bot', bot: 'medium' }];
  let lastScored = null;
  let botToken = 0; // erhöht sich, wenn ein laufender Bot-Zug abgebrochen werden soll

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
    setupPlayers.forEach((player, i) => {
      const li = document.createElement('li');
      const input = document.createElement('input');
      input.id = `player-name-${i}`;
      input.value = player.name;
      input.maxLength = 16;
      input.placeholder = player.bot ? 'Bot' : `Spieler ${i + 1}`;
      input.setAttribute('aria-label', `Name von Spieler ${i + 1}`);
      input.addEventListener('input', () => { player.name = input.value; });
      li.appendChild(input);

      const type = document.createElement('select');
      type.id = `player-type-${i}`;
      type.setAttribute('aria-label', `Art von Spieler ${i + 1}`);
      type.innerHTML = '<option value="">Mensch</option>'
        + LEVELS.map((l) => `<option value="${l.id}">Bot ${l.name}</option>`).join('');
      type.value = player.bot ?? '';
      type.addEventListener('change', () => {
        const wasDefault = !player.name.trim() || /^(Spieler \d+|Bot)$/.test(player.name.trim());
        player.bot = type.value || null;
        if (wasDefault) player.name = player.bot ? 'Bot' : `Spieler ${i + 1}`;
        renderSetup();
      });
      li.appendChild(type);

      if (setupPlayers.length > 1) {
        const remove = document.createElement('button');
        remove.className = 'ghost remove';
        remove.textContent = '✕';
        remove.setAttribute('aria-label', 'Spieler entfernen');
        remove.addEventListener('click', () => {
          setupPlayers.splice(i, 1);
          renderSetup();
        });
        li.appendChild(remove);
      }
      list.appendChild(li);
    });
    $('btn-add-player').disabled = setupPlayers.length >= MAX_PLAYERS;
    $('btn-add-bot').disabled = setupPlayers.length >= MAX_PLAYERS;
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

  function startGame(players) {
    state = {
      players: players.map((p, i) => ({
        name: p.name.trim() || (p.bot ? 'Bot' : `Spieler ${i + 1}`),
        bot: p.bot || null,
        sheet: {},
      })),
      current: 0,
      rollsLeft: ROLLS_PER_TURN,
      dice: [1, 1, 1, 1, 1],
      held: [false, false, false, false, false],
    };
    lastScored = null;
    persist();
    show('game');
    renderGame();
    startTurn();
  }

  // ---------- Spiellogik ----------
  const hasRolled = () => state.rollsLeft < ROLLS_PER_TURN;
  const filledCount = (p) => CATEGORIES.filter((c) => p.sheet[c.id] !== undefined).length;
  const isGameOver = () => state.players.every((p) => filledCount(p) === CATEGORIES.length);
  const currentBot = () => state.players[state.current].bot;

  function roll(byBot = false) {
    if (!state || state.rollsLeft === 0 || (currentBot() && !byBot)) return;
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
    if (!hasRolled() || state.rollsLeft === 0 || currentBot()) return;
    state.held[i] = !state.held[i];
    persist();
    renderDice();
  }

  function scoreCategory(id, byBot = false) {
    const player = state.players[state.current];
    if (!hasRolled() || player.sheet[id] !== undefined || (player.bot && !byBot)) return;
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
    startTurn();
  }

  // ---------- Bots ----------
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function startTurn() {
    if (currentBot()) playBotTurn(++botToken);
  }

  function stopBot() {
    botToken++;
  }

  async function playBotTurn(token) {
    const level = currentBot();
    const sheet = () => state.players[state.current].sheet;
    const still = () => token === botToken;

    if (!hasRolled()) {
      await sleep(BOT_DELAY.start);
      if (!still()) return;
      roll(true);
    }
    while (state.rollsLeft > 0) {
      await sleep(BOT_DELAY.afterRoll);
      if (!still()) return;
      const held = chooseHolds(state.dice, sheet(), state.rollsLeft, level);
      if (!held) break;
      state.held = held;
      persist();
      renderDice();
      const kept = state.dice.filter((_, i) => held[i]);
      $('hint').textContent = kept.length ? `🤖 hält ${kept.join(', ')}` : '🤖 würfelt alle neu';
      await sleep(BOT_DELAY.afterHold);
      if (!still()) return;
      roll(true);
    }
    await sleep(BOT_DELAY.afterRoll);
    if (!still()) return;
    scoreCategory(chooseCategory(state.dice, sheet(), level), true);
  }

  function finishGame() {
    const ranking = state.players
      .map((p) => ({ name: displayName(p), human: !p.bot, score: totals(p.sheet).total }))
      .sort((a, b) => b.score - a.score);

    // In die Bestenliste kommen nur Menschen.
    const date = Date.now();
    const newEntries = ranking.filter((r) => r.human).map((r) => ({ name: r.name, score: r.score, date }));
    const highscores = [...load(HIGHSCORE_KEY, []), ...newEntries]
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

  function displayName(p) {
    return p.bot ? `🤖 ${p.name} (${levelName(p.bot)})` : p.name;
  }

  function persist() {
    save(SAVE_KEY, state);
  }

  // ---------- Darstellung ----------
  function renderGame(rolling = []) {
    const player = state.players[state.current];
    $('current-player').textContent = state.players.length > 1 ? `${displayName(player)} ist dran` : displayName(player);
    const round = Math.min(filledCount(player) + 1, CATEGORIES.length);
    $('round-info').textContent = `Runde ${round} / ${CATEGORIES.length}`;

    const btn = $('btn-roll');
    btn.disabled = state.rollsLeft === 0 || !!player.bot;
    btn.textContent = player.bot
      ? 'Bot ist am Zug …'
      : state.rollsLeft === 0
        ? 'Keine Würfe mehr'
        : `Würfeln (${state.rollsLeft} übrig)`;

    $('hint').textContent = player.bot
      ? `🤖 ${player.name} überlegt …`
      : !hasRolled()
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
      die.disabled = !hasRolled() || state.rollsLeft === 0 || !!currentBot();
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
      `<th class="${i === state.current ? 'active' : ''}">${p.bot ? '🤖 ' : ''}${escapeHtml(p.name)}${p.bot ? `<small>${levelName(p.bot)}</small>` : ''}</th>`).join('');
    rows.push(`<thead><tr><th></th>${head}</tr></thead><tbody>`);

    const catRow = (cat, hint) => {
      const cells = players.map((p, i) => {
        const value = p.sheet[cat.id];
        const isActive = i === state.current;
        const classes = [];
        if (isActive) classes.push('active-col');
        if (lastScored && lastScored.player === i && lastScored.id === cat.id) classes.push('just-scored');
        if (value !== undefined) return `<td class="${classes.join(' ')}">${value}</td>`;
        if (isActive && hasRolled() && !p.bot) {
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
    lastScored = null; // nur beim ersten Zeichnen nach dem Eintragen aufleuchten
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- Ereignisse ----------
  function addPlayer(bot) {
    if (setupPlayers.length >= MAX_PLAYERS) return;
    setupPlayers.push({ name: bot ? 'Bot' : `Spieler ${setupPlayers.length + 1}`, bot });
    renderSetup();
    $('player-list').querySelector('li:last-child input').select();
  }

  function backToSetup() {
    stopBot();
    setupPlayers = state.players.map((p) => ({ name: p.name, bot: p.bot ?? null }));
    show('setup');
    renderSetup();
  }

  $('btn-add-player').addEventListener('click', () => addPlayer(null));
  $('btn-add-bot').addEventListener('click', () => addPlayer('medium'));
  $('btn-start').addEventListener('click', () => startGame(setupPlayers));
  $('btn-resume').addEventListener('click', () => {
    state = load(SAVE_KEY, null);
    if (!state) return renderSetup();
    show('game');
    renderGame();
    startTurn();
  });
  $('btn-roll').addEventListener('click', () => roll());
  $('btn-menu').addEventListener('click', backToSetup);
  $('btn-rematch').addEventListener('click', () => startGame(state.players));
  $('btn-new').addEventListener('click', backToSetup);

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
