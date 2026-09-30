// ===== SECTION: RENDER.GAMES =====
// The Game Room's minigame screens (game-room-overhaul-plan.md; 0.14.5). Each opens in the shared
// modal (#modal-overlay) like the recipe picker and the cook screen, runs against a seeded rng from
// the pure module beside it (darts.js), and resolves to { playerWon, grade, summary, minutes } — or
// null if the modal is closed some other way. Touch first: everything is a tap.

// One entry point: games.js's Challenge verb asks for a minigame by its GAME_DEFS `minigame` id.
function openMinigame(kind, opts) {
  if (kind === 'darts') return openDartsGame(opts);
  if (kind === 'poker') return openPokerGame(opts);
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

// Poker night (Phase 4, D11): Texas Hold'em for you and whoever is at the table. The engine is poker.js
// (state machine, side pots) on cardgames.js (deck, evaluator, each roommate's style from who they
// are); this is only the screen. opts: { seats: [{ id, name, style }], stakeId, amount, stakeLabel,
// seed }. Resolves the night's result (poker.js's pokerNightResult, plus the IOU shares if that is
// what was riding on it), or null if the table is somehow closed.
function openPokerGame(opts) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const actions = document.getElementById('modal-actions');
    if (!overlay || !title || !body || !actions || typeof pokerNew !== 'function') { resolve(null); return; }
    if (typeof hideLoading === 'function') hideLoading();

    const seatsIn = opts.seats || [];
    const ids = ['player', ...seatsIn.map(s => s.id)];
    const names = { player: 'You' };
    const styles = { player: { ...POKER_STYLE.base, tilt: 0 } };
    for (const s of seatsIn) { names[s.id] = s.name; if (s.style) styles[s.id] = s.style; }
    const st = pokerNew(ids, {});
    const rng = mulberry32((opts.seed >>> 0) || 1);
    const lastAct = {};
    let status = 'Deal the first hand.';
    let finished = false;
    let busy = false;                 // a roommate is acting, or the night is being settled
    let timer = 0;

    title.textContent = 'Poker night';
    body.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'games-poker';
    body.appendChild(root);
    actions.innerHTML = '';
    const mkBtn = (label, cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls || 'btn'; b.textContent = label; return b; };
    const foldBtn = mkBtn('Fold', 'btn btn-secondary');
    const callBtn = mkBtn('Check');
    const dealBtn = mkBtn('Deal');
    const outBtn = mkBtn('Let it play out', 'btn btn-secondary');
    const leaveBtn = mkBtn('Cash out', 'btn btn-secondary');
    actions.append(foldBtn, callBtn, dealBtn, outBtn, leaveBtn);
    overlay.setAttribute('data-open', '');

    const cardEl = (c, hidden) => {
      const el = document.createElement('span');
      if (hidden || !c) { el.className = 'games-card back'; el.textContent = ' '; return el; }
      el.className = `games-card ${c.suit === '♥' || c.suit === '♦' ? 'red' : 'black'}`;
      el.textContent = `${c.rank}${c.suit}`;
      return el;
    };
    const describe = (r) => {
      if (!r || !r.ok) return '';
      if (r.action === 'fold') return 'folds';
      if (r.action === 'check') return 'checks';
      if (r.action === 'call') return r.allIn ? `calls all in (${r.amount})` : `calls ${r.amount}`;
      if (r.action === 'raise') return r.allIn ? `all in (${r.raiseTo})` : `raises to ${r.raiseTo}`;
      return '';
    };

    let raiseTo = 0;
    function render() {
      root.innerHTML = '';
      const bar = document.createElement('div');
      bar.className = 'games-poker-stake';
      bar.textContent = `${opts.stakeId === 'brag' || !opts.stakeLabel ? 'Bragging rights' : opts.stakeLabel} · hand ${Math.max(1, st.handNo)} of ${st.handsMax}`;
      root.appendChild(bar);
      const opps = document.createElement('div');
      opps.className = 'games-poker-opps';
      const reveal = st.lastHand && st.lastHand.how === 'showdown' ? new Set(st.lastHand.showdown.map(x => x.id)) : new Set();
      st.seats.forEach((s, i) => {
        if (s.id === 'player') return;
        const seat = document.createElement('div');
        seat.className = `games-poker-seat${s.out ? ' out' : ''}${s.folded && !s.out ? ' folded' : ''}${st.turn === i ? ' turn' : ''}`;
        const nm = document.createElement('div'); nm.className = 'games-poker-name'; nm.textContent = `${names[s.id]}${st.dealer === i ? ' (D)' : ''}`;
        const ch = document.createElement('div'); ch.className = 'games-poker-chips'; ch.textContent = s.out ? 'out' : `${s.chips} chips`;
        const cs = document.createElement('div'); cs.className = 'games-poker-cards';
        if (!s.out && s.hand.length) for (const c of s.hand) cs.appendChild(cardEl(c, !(reveal.has(s.id))));
        const act = document.createElement('div'); act.className = 'games-poker-act'; act.textContent = s.out ? '' : (lastAct[s.id] || '');
        seat.append(nm, ch, cs, act);
        opps.appendChild(seat);
      });
      root.appendChild(opps);
      const table = document.createElement('div');
      table.className = 'games-poker-table';
      const pot = document.createElement('div'); pot.className = 'games-poker-pot'; pot.textContent = `Pot ${st.pot}`;
      const comm = document.createElement('div'); comm.className = 'games-poker-community';
      for (let k = 0; k < 5; k++) { const c = st.community[k]; const el = cardEl(c, false); if (!c) el.className = 'games-card empty'; comm.appendChild(el); }
      table.append(pot, comm);
      root.appendChild(table);
      const me = st.seats[0];
      const you = document.createElement('div');
      you.className = `games-poker-you${me.folded && !me.out ? ' folded' : ''}${st.turn === 0 ? ' turn' : ''}`;
      const yn = document.createElement('div'); yn.className = 'games-poker-name'; yn.textContent = `You${st.dealer === 0 ? ' (D)' : ''} · ${me.chips} chips${me.bet ? ` · ${me.bet} in` : ''}`;
      const yc = document.createElement('div'); yc.className = 'games-poker-cards';
      for (const c of me.hand) yc.appendChild(cardEl(c, false));
      const ya = document.createElement('div'); ya.className = 'games-poker-act'; ya.textContent = lastAct.player || '';
      you.append(yn, yc, ya);
      root.appendChild(you);
      const legal = st.turn === 0 && !busy ? pokerLegal(st, 0) : null;
      if (legal && legal.canRaise) {
        raiseTo = Math.max(legal.minTo, Math.min(legal.maxTo, raiseTo || legal.minTo));
        const row = document.createElement('div');
        row.className = 'games-poker-raise';
        const lab = document.createElement('span'); lab.textContent = legal.allInOnly ? `All in ${legal.maxTo}` : `Raise to ${raiseTo}`;
        const raiseBtn = mkBtn(legal.allInOnly ? 'All in' : 'Raise');
        raiseBtn.addEventListener('click', () => playerAct('raise', legal.allInOnly ? legal.maxTo : raiseTo));
        if (!legal.allInOnly) {
          const range = document.createElement('input');
          range.type = 'range'; range.min = String(legal.minTo); range.max = String(legal.maxTo); range.step = '5'; range.value = String(raiseTo);
          range.addEventListener('input', () => { raiseTo = Number(range.value); lab.textContent = `Raise to ${raiseTo}`; });
          row.append(lab, range, raiseBtn);
        } else row.append(lab, raiseBtn);
        root.appendChild(row);
      }
      const stat = document.createElement('div');
      stat.className = 'games-poker-status';
      stat.textContent = status;
      root.appendChild(stat);
      // the buttons
      const handOn = st.phase !== 'idle';
      foldBtn.style.display = legal ? '' : 'none';
      callBtn.style.display = legal ? '' : 'none';
      if (legal) callBtn.textContent = legal.canCheck ? 'Check' : (legal.toCall >= me.chips ? `Call all in (${legal.toCall})` : `Call ${legal.toCall}`);
      dealBtn.style.display = !handOn && !finished && !st.over ? '' : 'none';
      dealBtn.textContent = st.handNo === 0 ? 'Deal' : 'Deal next hand';
      outBtn.style.display = finished ? 'none' : '';
      outBtn.disabled = busy && !legal;
      leaveBtn.textContent = finished ? 'Done' : (st.over ? 'Finish' : 'Cash out');
      leaveBtn.style.display = '';
      leaveBtn.disabled = !finished && !st.over && handOn && !legal;
    }

    function handOver() {
      busy = false;
      const lh = st.lastHand;
      if (lh) {
        const w = lh.winners.map(x => `${names[x.id]} ${x.id === 'player' ? 'win' : 'wins'} ${x.amount}`).join(', ');
        const how = lh.how === 'showdown'
          ? ` with ${(lh.showdown.find(x => x.id === lh.winners[0].id) || {}).name || 'the best hand'}`
          : ` (everyone else folded)`;
        status = `${w}${how}.`;
      }
      if (st.over) {
        const bust = st.seats[0].out;
        status += bust ? ' You are out of chips.' : ' That is the night.';
      }
      render();
    }

    function step() {
      if (finished) return;
      if (st.phase === 'idle') { handOver(); return; }
      if (st.turn === 0) { busy = false; render(); return; }
      busy = true; render();
      timer = setTimeout(() => {
        const who = st.seats[st.turn];
        const r = pokerNpcTurn(st, rng, styles);
        if (r.ok && who) lastAct[who.id] = describe(r);
        if (st.phase === 'idle') { render(); step(); return; }
        render(); step();
      }, 800);
    }

    function startHand() {
      for (const k of Object.keys(lastAct)) delete lastAct[k];
      raiseTo = 0;
      if (!pokerStartHand(st, rng)) { handOver(); return; }
      status = `Hand ${st.handNo}. Everyone antes ${st.ante}.`;
      render();
      step();
    }

    function playerAct(action, to) {
      if (st.turn !== 0 || busy) return;
      const r = pokerAct(st, 0, action, to);
      if (r.ok) lastAct.player = describe(r);
      status = '';
      raiseTo = 0;
      render(); step();
    }

    function finishNight() {
      finished = true; busy = true;
      clearTimeout(timer);
      const result = pokerNightResult(st, 'player', names);
      result.iou = opts.stakeId === 'iou' && opts.amount > 0 ? pokerIouShares(st, 'player', opts.amount) : [];
      status = result.summary;
      finished = true;
      render();
      leaveBtn.onclick = () => { overlay.removeAttribute('data-open'); resolve({ ...result, playerWon: result.net > 0 }); };
    }

    foldBtn.addEventListener('click', () => playerAct('fold'));
    callBtn.addEventListener('click', () => { const L = pokerLegal(st, 0); playerAct(L && L.canCheck ? 'check' : 'call'); });
    dealBtn.addEventListener('click', startHand);
    outBtn.addEventListener('click', () => {
      if (finished) return;
      clearTimeout(timer);
      pokerSimulate(st, rng, styles);
      finishNight();
    });
    leaveBtn.onclick = () => {
      if (finished) return;
      clearTimeout(timer);
      if (st.phase !== 'idle' && st.turn === 0) pokerAct(st, 0, 'fold');
      // Leaving mid-night ends it: the hand in progress plays out without you and the night is settled as it stands.
      let g = 0; while (st.phase !== 'idle' && g++ < 200) { if (st.turn < 0) pokerAdvance(st); else pokerNpcTurn(st, rng, styles); }
      st.over = true;
      finishNight();
    };
    render();
  });
}
// ===== /SECTION: RENDER.GAMES =====
