// ===== SECTION: RENDER.GAMES =====
// The Game Room's minigame screens (game-room-overhaul-plan.md; 0.14.5). Each opens in the shared
// modal (#modal-overlay) like the recipe picker and the cook screen, runs against a seeded rng from
// the pure module beside it (darts.js), and resolves to { playerWon, grade, summary, minutes } — or
// null if the modal is closed some other way. Touch first: everything is a tap.

// One entry point: games.js's Challenge verb asks for a minigame by its GAME_DEFS `minigame` id.
function openMinigame(kind, opts) {
  if (kind === 'darts') return openDartsGame(opts);
  return Promise.resolve(null);
}

// Darts (D9): the crosshair sweeps the board on two axes; tap (or Space) to throw where it is.
// opts: { mode: '301'|'clock', npcName, skillP, skillN, seed }.
function openDartsGame(opts) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const actions = document.getElementById('modal-actions');
    if (!overlay || !title || !body || !actions || typeof dartsNew !== 'function') { resolve(null); return; }
    if (typeof hideLoading === 'function') hideLoading();

    const T = DARTS_TUNING;
    const mode = opts.mode === 'clock' ? 'clock' : '301';
    const npcName = opts.npcName || 'Them';
    const state = dartsNew(mode);
    const rng = mulberry32((opts.seed >>> 0) || 1);
    const size = Math.max(220, Math.min(320, (window.innerWidth || 360) - 72));
    const R = size / 2 * 0.86;            // the board's radius in pixels
    let marks = [];                       // darts stuck in the board this turn: { x, y, who }
    let busy = false;                     // the roommate is throwing, or the match is over
    let finished = false;
    let raf = 0;
    let note = '';
    const t0 = performance.now();

    title.textContent = mode === 'clock' ? 'Darts: Around the Clock' : 'Darts: 301';
    body.innerHTML = '';
    const board = document.createElement('div');
    board.className = 'games-dart-board';
    const score = document.createElement('div');
    score.className = 'games-dart-score';
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    canvas.className = 'games-dart-canvas';
    canvas.style.touchAction = 'manipulation';
    const status = document.createElement('div');
    status.className = 'games-dart-status';
    board.append(score, canvas, status);
    body.appendChild(board);
    actions.innerHTML = '';
    const throwBtn = document.createElement('button');
    throwBtn.type = 'button'; throwBtn.className = 'btn'; throwBtn.textContent = 'Throw';
    const playOut = document.createElement('button');
    playOut.type = 'button'; playOut.className = 'btn btn-secondary'; playOut.textContent = 'Let it play out';
    const forfeit = document.createElement('button');
    forfeit.type = 'button'; forfeit.className = 'btn btn-secondary'; forfeit.textContent = 'Forfeit';
    actions.append(throwBtn, playOut, forfeit);
    overlay.setAttribute('data-open', '');

    const ctx = canvas.getContext('2d');
    const cx = size / 2, cy = size / 2;

    function label() {
      if (mode === 'clock') {
        const f = (n) => (n >= 21 ? 'bull' : n);
        return `You: ${f(state.at.p)}   ·   ${npcName}: ${f(state.at.n)}`;
      }
      return `You: ${state.left.p}   ·   ${npcName}: ${state.left.n}`;
    }

    function drawBoard() {
      const ring = DARTS_TUNING.rings;
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = '#15151c';
      ctx.beginPath(); ctx.arc(cx, cy, size / 2 - 2, 0, Math.PI * 2); ctx.fill();
      const seg = (i, r0, r1, colour) => {
        const a0 = (i * 18 - 9 - 90) * Math.PI / 180, a1 = (i * 18 + 9 - 90) * Math.PI / 180;
        ctx.beginPath();
        ctx.arc(cx, cy, r1 * R, a0, a1);
        ctx.arc(cx, cy, r0 * R, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = colour; ctx.fill();
      };
      for (let i = 0; i < 20; i++) {
        const dark = i % 2 === 0;
        const single = dark ? '#1c1c22' : '#e8dcc0';
        const bright = dark ? '#c0392b' : '#1e8449';
        seg(i, ring.outerBull, ring.tripleIn, single);
        seg(i, ring.tripleIn, ring.tripleOut, bright);
        seg(i, ring.tripleOut, ring.doubleIn, single);
        seg(i, ring.doubleIn, ring.doubleOut, bright);
      }
      ctx.beginPath(); ctx.arc(cx, cy, ring.outerBull * R, 0, Math.PI * 2); ctx.fillStyle = '#1e8449'; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, ring.bull * R, 0, Math.PI * 2); ctx.fillStyle = '#c0392b'; ctx.fill();
      ctx.fillStyle = '#d8d8e0'; ctx.font = `${Math.round(size * 0.05)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < 20; i++) {
        const a = (i * 18 - 90) * Math.PI / 180;
        ctx.fillText(String(DARTS_TUNING.sectors[i]), cx + Math.cos(a) * (size / 2 - size * 0.045), cy + Math.sin(a) * (size / 2 - size * 0.045));
      }
    }

    function draw() {
      drawBoard();
      for (const m of marks) {
        ctx.beginPath(); ctx.arc(cx + m.x * R, cy + m.y * R, 4, 0, Math.PI * 2);
        ctx.fillStyle = m.who === 'p' ? '#f1c40f' : '#5dade2'; ctx.fill();
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
      }
      if (!busy && !finished && state.turn === 'p') {
        const c = dartsCrosshair((performance.now() - t0) / 1000, opts.skillP);
        const px = cx + c.x * R, py = cy + c.y * R;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px - 14, py); ctx.lineTo(px + 14, py); ctx.moveTo(px, py - 14); ctx.lineTo(px, py + 14); ctx.stroke();
      }
      score.textContent = label();
      status.textContent = finished ? note : busy ? `${npcName} is throwing…` : `Your throw, ${state.dartsLeft} dart${state.dartsLeft === 1 ? '' : 's'} left. ${note}`;
      raf = requestAnimationFrame(draw);
    }

    function cleanup() {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      overlay.removeAttribute('data-open');
    }

    function finishMatch(result) {
      finished = true; busy = true;
      note = result.summary;
      throwBtn.disabled = true; playOut.disabled = true;
      forfeit.textContent = 'Done';
      forfeit.onclick = () => { cleanup(); resolve({ ...result, minutes: DARTS_TUNING.modes[mode].minutes }); };
    }

    function afterThrow(out) {
      const t = out.hit;
      note = `${out.bust ? 'Bust! ' : ''}You hit ${t.label}${t.points ? ` (${t.points})` : ''}.`;
      if (state.winner) { finishMatch(dartsResult(state, npcName)); return; }
      if (out.turnEnd) roommateTurn();   // your three darts stay on the board until they start
    }

    function roommateTurn() {
      busy = true;
      let first = true;
      const step = () => {
        if (finished) return;
        if (first) { marks = []; first = false; }
        if (state.turn !== 'n') { busy = false; marks = []; return; }
        const landing = dartsNpcThrow(rng, opts.skillN, dartsTarget(state, 'n'));
        marks.push({ x: landing.x, y: landing.y, who: 'n' });
        const out = dartsApplyThrow(state, 'n', landing);
        note = `${npcName} hits ${landing.label}${landing.points ? ` (${landing.points})` : ''}.`;
        if (state.winner) { finishMatch(dartsResult(state, npcName)); return; }
        if (out && out.turnEnd) { setTimeout(() => { busy = false; marks = []; note = 'Your turn.'; }, 900); return; }
        setTimeout(step, 750);
      };
      setTimeout(step, 1200);
    }

    function throwNow() {
      if (busy || finished || state.turn !== 'p') return;
      const c = dartsCrosshair((performance.now() - t0) / 1000, opts.skillP);
      const landing = dartsPlayerThrow(rng, opts.skillP, c.x, c.y);
      marks.push({ x: landing.x, y: landing.y, who: 'p' });
      afterThrow(dartsApplyThrow(state, 'p', landing));
    }

    function onKey(e) { if (e.code === 'Space') { e.preventDefault(); throwNow(); } }
    canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); throwNow(); });
    throwBtn.addEventListener('click', throwNow);
    document.addEventListener('keydown', onKey);
    playOut.addEventListener('click', () => {
      if (finished) return;
      busy = true;
      dartsSimulate(rng, mode, opts.skillP, opts.skillN, state);
      finishMatch(dartsResult(state, npcName));
    });
    forfeit.onclick = () => {
      if (finished) return;
      cleanup();
      resolve({ playerWon: false, grade: 'normal', summary: `You concede the game to ${npcName}.`, minutes: Math.max(10, Math.round(DARTS_TUNING.modes[mode].minutes / 2)) });
    };
    raf = requestAnimationFrame(draw);
  });
}
// ===== /SECTION: RENDER.GAMES =====
