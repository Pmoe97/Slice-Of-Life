// ===== SECTION: RENDER.GAMES =====
// The Game Room's minigame screens (game-room-overhaul-plan.md; 0.14.5). Each opens in the shared
// modal (#modal-overlay) like the recipe picker and the cook screen, runs against a seeded rng from
// the pure module beside it (darts.js), and resolves to { playerWon, grade, summary, minutes } — or
// null if the modal is closed some other way. Touch first: everything is a tap.

// One entry point: games.js's Challenge verb asks for a minigame by its GAME_DEFS `minigame` id.
function openMinigame(kind, opts) {
  if (kind === 'darts') return openDartsGame(opts);
  if (kind === 'poker') return openPokerGame(opts);
  if (kind === 'blackjack') return openBlackjackGame(opts);
  if (kind === 'pool') return openPoolGame(opts);
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

// Blackjack (Phase 5, D12): a roommate deals, versus not the house. The engine is blackjack.js; this is
// the screen. opts: { npcName, seed, stakeId, amount }. Resolves { playerWon, grade, summary, minutes,
// net, iouAmount } for the night.
function openBlackjackGame(opts) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const actions = document.getElementById('modal-actions');
    if (!overlay || !title || !body || !actions || typeof bjNew !== 'function') { resolve(null); return; }
    if (typeof hideLoading === 'function') hideLoading();

    const npcName = opts.npcName || 'The dealer';
    const st = bjNew({});
    const rng = mulberry32((opts.seed >>> 0) || 1);
    let status = `${npcName} is dealing. Place your bet.`;
    let finished = false;
    let betAmt = BJ_TUNING.minBet * 2;
    let revealing = false;

    title.textContent = 'Blackjack';
    body.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'games-poker games-bj';
    body.appendChild(root);
    actions.innerHTML = '';
    const mk = (label, cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls || 'btn'; b.textContent = label; return b; };
    const hitBtn = mk('Hit');
    const standBtn = mk('Stand');
    const dblBtn = mk('Double', 'btn btn-secondary');
    const dealBtn = mk('Deal');
    const outBtn = mk('Let it play out', 'btn btn-secondary');
    const leaveBtn = mk('Cash out', 'btn btn-secondary');
    actions.append(hitBtn, standBtn, dblBtn, dealBtn, outBtn, leaveBtn);
    overlay.setAttribute('data-open', '');

    const cardEl = (c, hidden) => {
      const el = document.createElement('span');
      if (hidden || !c) { el.className = 'games-card back'; el.textContent = ' '; return el; }
      el.className = `games-card ${c.suit === '♥' || c.suit === '♦' ? 'red' : 'black'}`;
      el.textContent = `${c.rank}${c.suit}`;
      return el;
    };

    function render() {
      root.innerHTML = '';
      const bar = document.createElement('div');
      bar.className = 'games-poker-stake';
      bar.textContent = `${opts.stakeId === 'iou' && opts.amount ? `Loser owes $${opts.amount}, scaled by the chips` : 'Bragging rights'} · hand ${Math.max(1, st.handNo)} of ${st.handsMax}`;
      root.appendChild(bar);
      const inPlay = st.phase === 'player';
      const showDealer = !inPlay;
      const dealer = document.createElement('div');
      dealer.className = 'games-poker-seat';
      const dn = document.createElement('div'); dn.className = 'games-poker-name'; dn.textContent = `${npcName} (dealer) · ${st.dealerChips} chips`;
      const dc = document.createElement('div'); dc.className = 'games-poker-cards';
      st.dealer.forEach((c, i) => dc.appendChild(cardEl(c, inPlay && i === 1)));
      const dv = document.createElement('div'); dv.className = 'games-poker-act';
      dv.textContent = st.dealer.length ? (showDealer ? `${bjValue(st.dealer)}` : `showing ${bjValue([st.dealer[0]])}`) : '';
      dealer.append(dn, dc, dv);
      root.appendChild(dealer);
      const table = document.createElement('div');
      table.className = 'games-poker-table';
      const pot = document.createElement('div'); pot.className = 'games-poker-pot'; pot.textContent = st.bet && (inPlay || st.last) ? `Bet ${st.bet}` : '';
      table.appendChild(pot);
      root.appendChild(table);
      const you = document.createElement('div');
      you.className = 'games-poker-you';
      const yn = document.createElement('div'); yn.className = 'games-poker-name'; yn.textContent = `You · ${st.playerChips} chips`;
      const yc = document.createElement('div'); yc.className = 'games-poker-cards';
      for (const c of st.player) yc.appendChild(cardEl(c, false));
      const yv = document.createElement('div'); yv.className = 'games-poker-act'; yv.textContent = st.player.length ? `${bjValue(st.player)}${bjIsSoft(st.player) ? ' (soft)' : ''}` : '';
      you.append(yn, yc, yv);
      root.appendChild(you);
      const betting = st.phase === 'bet' && !st.over && !finished;
      if (betting) {
        const lo = bjMinBet(st), hi = Math.max(lo, bjMaxBet(st));
        betAmt = Math.max(lo, Math.min(hi, betAmt));
        const row = document.createElement('div');
        row.className = 'games-poker-raise';
        const lab = document.createElement('span'); lab.textContent = `Bet ${betAmt}`;
        const range = document.createElement('input');
        range.type = 'range'; range.min = String(lo); range.max = String(hi); range.step = String(BJ_TUNING.betStep); range.value = String(betAmt);
        range.addEventListener('input', () => { betAmt = Number(range.value); lab.textContent = `Bet ${betAmt}`; });
        row.append(lab, range);
        root.appendChild(row);
      }
      const stat = document.createElement('div');
      stat.className = 'games-poker-status';
      stat.textContent = status;
      root.appendChild(stat);
      const legal = inPlay && !revealing ? bjLegal(st) : null;
      hitBtn.style.display = legal ? '' : 'none';
      standBtn.style.display = legal ? '' : 'none';
      dblBtn.style.display = legal ? '' : 'none';
      dblBtn.disabled = !(legal && legal.canDouble);
      dealBtn.style.display = betting ? '' : 'none';
      dealBtn.textContent = st.handNo === 0 ? 'Deal' : 'Deal next hand';
      outBtn.style.display = finished ? 'none' : '';
      outBtn.disabled = revealing;
      leaveBtn.textContent = finished ? 'Done' : (st.over ? 'Finish' : 'Cash out');
      leaveBtn.disabled = revealing;
    }

    function tell() {
      const l = st.last;
      if (!l) return;
      const verb = { blackjack: 'Blackjack! You win', win: 'You win', push: 'Push', lose: 'You lose' }[l.result] || l.result;
      status = `${verb}${l.delta ? ` ${Math.abs(l.delta)} chips` : ''}. You ${l.pv}, ${npcName} ${l.dv}.${l.doubled ? ' (doubled)' : ''}`;
      if (st.over) status += st.playerChips <= 0 ? ' You are out of chips.' : st.dealerChips <= 0 ? ` ${npcName} is out of chips.` : ' That is the night.';
    }

    function deal() {
      if (st.phase !== 'bet' || st.over) return;
      const r = bjDeal(st, rng, betAmt);
      if (!r.ok) return;
      status = r.natural ? '' : 'Hit, stand or double?';
      if (r.natural) tell();
      render();
      if (st.over) endNight();
    }

    function act(a) {
      if (st.phase !== 'player') return;
      const r = bjAct(st, a);
      if (!r.ok) return;
      if (st.phase !== 'player') tell(); else status = 'Hit, stand or double?';
      render();
      if (st.over) endNight();
    }

    function endNight() {
      finished = true;
      const res = bjNightResult(st, npcName);
      res.iouAmount = opts.stakeId === 'iou' ? bjIouAmount(st, opts.amount) : 0;
      if (st.last) tell();
      status = `${st.last ? status + ' ' : ''}${res.summary}`.trim();
      render();
      leaveBtn.onclick = () => { overlay.removeAttribute('data-open'); resolve(res); };
    }

    hitBtn.addEventListener('click', () => act('hit'));
    standBtn.addEventListener('click', () => act('stand'));
    dblBtn.addEventListener('click', () => act('double'));
    dealBtn.addEventListener('click', deal);
    outBtn.addEventListener('click', () => {
      if (finished) return;
      if (st.phase === 'player') { while (st.phase === 'player') bjAct(st, bjNpcDecision(st.player, st.dealer[0], 0) === 'hit' ? 'hit' : 'stand'); }
      bjSimulate(st, rng, 0, betAmt);
      st.over = true;
      endNight();
    });
    leaveBtn.onclick = () => {
      if (finished) return;
      // Leaving mid-hand stands on what you have.
      if (st.phase === 'player') bjAct(st, 'stand');
      st.over = true;
      tell();
      endNight();
    };
    render();
  });
}

// Pool (Phase 6, D10): 8-ball on a real 2D table. The engine is pool.js (physics, rules, the roommate's
// shot); this is the screen: aim with the pointer, set the power and a little spin, shoot, and watch
// the balls roll. Ball in hand: tap the table to put the cue ball down. opts: { npcName, skillP,
// skillN, seed }. Resolves poolResult(...) for the game, or a forfeit.
function openPoolGame(opts) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const actions = document.getElementById('modal-actions');
    if (!overlay || !title || !body || !actions || typeof poolNew !== 'function') { resolve(null); return; }
    if (typeof hideLoading === 'function') hideLoading();

    const T = POOL_TUNING, R = T.radius;
    const npcName = opts.npcName || 'Them';
    const rng = mulberry32((opts.seed >>> 0) || 1);
    const st = poolNew(rng);
    const W = Math.max(280, Math.min(560, (window.innerWidth || 380) - 64));
    const pad = Math.round(W * 0.045);
    const H = Math.round((W - 2 * pad) / 2 + 2 * pad);
    const scale = (W - 2 * pad) / T.w;
    const tx = (x) => pad + x * scale, ty = (y) => pad + y * scale;
    const fromPx = (px, py) => ({ x: (px - pad) / scale, y: (py - pad) / scale });

    let aim = 0;                       // radians
    let power = 0.55;
    const spin = { x: 0, y: 0 };
    let anim = false;                  // a shot is rolling
    let npcBusy = false;               // the roommate is thinking or shooting
    let placing = false;               // the player has ball in hand
    let finished = false;
    let status = 'Your break. Aim with the pointer, set the power, and shoot.';
    let raf = 0, timer = 0;
    let trail = [];                    // where the cue ball has been this shot (a faint line)

    title.textContent = 'Pool';
    body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'games-pool';
    const info = document.createElement('div');
    info.className = 'games-pool-info';
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.className = 'games-pool-canvas';
    canvas.style.touchAction = 'none';
    const controls = document.createElement('div');
    controls.className = 'games-pool-controls';
    const powLab = document.createElement('span'); powLab.className = 'games-pool-label';
    const powRange = document.createElement('input');
    powRange.type = 'range'; powRange.min = '10'; powRange.max = '100'; powRange.value = String(Math.round(power * 100));
    const spinCanvas = document.createElement('canvas');
    spinCanvas.width = 52; spinCanvas.height = 52; spinCanvas.className = 'games-pool-spin';
    spinCanvas.title = 'Where you hit the cue ball: top to follow, bottom to draw, sides for English';
    controls.append(powLab, powRange, spinCanvas);
    const statusEl = document.createElement('div');
    statusEl.className = 'games-poker-status';
    wrap.append(info, canvas, controls, statusEl);
    body.appendChild(wrap);
    actions.innerHTML = '';
    const mk = (label, cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls || 'btn'; b.textContent = label; return b; };
    const shootBtn = mk('Shoot');
    const outBtn = mk('Let it play out', 'btn btn-secondary');
    const leaveBtn = mk('Forfeit', 'btn btn-secondary');
    actions.append(shootBtn, outBtn, leaveBtn);
    overlay.setAttribute('data-open', '');

    const ctx = canvas.getContext('2d');
    const sctx = spinCanvas.getContext('2d');
    const COLORS = { 1: '#e6c229', 2: '#2456b8', 3: '#c0392b', 4: '#6a2c91', 5: '#e67e22', 6: '#1e8449', 7: '#7b241c', 8: '#111111' };
    const colorOf = (id) => COLORS[id > 8 ? id - 8 : id] || '#f4f1e8';

    function cue() { return poolBallById(st, 0); }
    function myTurn() { return st.turn === 'p' && !st.over && !anim && !npcBusy && !finished; }

    // the first thing the aim line meets: a ball, or a cushion. Returns { x, y, ball }.
    function rayHit(from, ang) {
      const dx = Math.cos(ang), dy = Math.sin(ang);
      let best = { t: Infinity, ball: null };
      for (const b of st.balls) {
        if (b.potted || b.id === 0) continue;
        const ox = b.x - from.x, oy = b.y - from.y;
        const proj = ox * dx + oy * dy;
        if (proj <= 0) continue;
        const d2 = ox * ox + oy * oy - proj * proj;
        if (d2 > 4 * R * R) continue;
        const t = proj - Math.sqrt(4 * R * R - d2);
        if (t < best.t) best = { t, ball: b };
      }
      const tw = dx > 0 ? (T.w - R - from.x) / dx : dx < 0 ? (R - from.x) / dx : Infinity;
      const th = dy > 0 ? (T.h - R - from.y) / dy : dy < 0 ? (R - from.y) / dy : Infinity;
      const wall = Math.min(tw, th);
      if (wall < best.t) best = { t: wall, ball: null };
      return { x: from.x + dx * best.t, y: from.y + dy * best.t, ball: best.ball };
    }

    function drawSpin() {
      const c = 26;
      sctx.clearRect(0, 0, 52, 52);
      sctx.fillStyle = '#f4f1e8'; sctx.beginPath(); sctx.arc(c, c, 24, 0, Math.PI * 2); sctx.fill();
      sctx.strokeStyle = '#999'; sctx.lineWidth = 1; sctx.beginPath(); sctx.moveTo(c, 4); sctx.lineTo(c, 48); sctx.moveTo(4, c); sctx.lineTo(48, c); sctx.stroke();
      sctx.fillStyle = '#c0392b'; sctx.beginPath(); sctx.arc(c + spin.x * 17, c + spin.y * -17, 4, 0, Math.PI * 2); sctx.fill();
    }

    function ballDraw(b) {
      const x = tx(b.x), y = ty(b.y), r = R * scale;
      ctx.beginPath(); ctx.arc(x + 1.5, y + 2, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = b.id === 0 ? '#f8f6ee' : b.id > 8 ? '#f4f1e8' : colorOf(b.id); ctx.fill();
      if (b.id > 8) { ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = colorOf(b.id); ctx.fillRect(x - r, y - r * 0.55, r * 2, r * 1.1); ctx.restore(); }
      if (b.id > 0) {
        ctx.beginPath(); ctx.arc(x, y, r * 0.48, 0, Math.PI * 2); ctx.fillStyle = '#f4f1e8'; ctx.fill();
        ctx.fillStyle = '#111'; ctx.font = `${Math.max(7, Math.round(r * 0.8))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(b.id), x, y + 0.5);
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#5b3a1e'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#1f6b46'; ctx.fillRect(pad, pad, W - 2 * pad, H - 2 * pad);
      for (const p of POOL_POCKETS) { ctx.beginPath(); ctx.arc(tx(p.x), ty(p.y), p.r * scale * 1.05, 0, Math.PI * 2); ctx.fillStyle = '#0a0a0a'; ctx.fill(); }
      if (trail.length > 1) { ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.beginPath(); trail.forEach((p, i) => (i ? ctx.lineTo(tx(p.x), ty(p.y)) : ctx.moveTo(tx(p.x), ty(p.y)))); ctx.stroke(); }
      const c = cue();
      if (myTurn() && !placing && !c.potted) {
        const hit = rayHit(c, aim);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.moveTo(tx(c.x), ty(c.y)); ctx.lineTo(tx(hit.x), ty(hit.y)); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(tx(hit.x), ty(hit.y), R * scale, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke();
        // the cue stick, pulled back with the power
        const back = R * 2.5 + power * 0.28;
        ctx.strokeStyle = '#d9b26f'; ctx.lineWidth = 4; ctx.beginPath();
        ctx.moveTo(tx(c.x - Math.cos(aim) * back), ty(c.y - Math.sin(aim) * back)); ctx.lineTo(tx(c.x - Math.cos(aim) * (back + 0.5)), ty(c.y - Math.sin(aim) * (back + 0.5))); ctx.stroke();
      }
      for (const b of st.balls) if (!b.potted) ballDraw(b);
      if (placing) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Tap the table to place the cue ball', W / 2, H - 4); }
      raf = requestAnimationFrame(frame);
    }

    let lastTs = 0;
    function frame() {
      const now = performance.now();
      const elapsed = Math.min(60, lastTs ? now - lastTs : 16);
      lastTs = now;
      if (anim) {
        // Time-based, so the balls roll at the same pace whatever the frame rate (about twice real time).
        const n = Math.max(2, Math.round(elapsed * 0.001 * (1 / T.dt) * 2));
        let moving = true;
        for (let k = 0; k < n && moving; k++) { moving = poolStep(st); }
        const c = cue(); if (!c.potted) trail.push({ x: c.x, y: c.y });
        if (!moving || st.shot.steps > T.maxStepsPerShot) { anim = false; const v = poolEndShot(st); afterShot(v); }
      }
      draw();
      infoUpdate();
    }

    function groupLabel(who) {
      const g = st.groups[who];
      if (!g) return 'open';
      const left = poolRemaining(st, g);
      return `${g} (${left ? left + ' left' : 'the 8'})`;
    }
    function infoUpdate() {
      info.textContent = `You: ${groupLabel('p')}  ·  ${npcName}: ${groupLabel('n')}${st.turn === 'p' && !st.over ? '' : ''}`;
      powLab.textContent = `Power ${Math.round(power * 100)}`;
      statusEl.textContent = status;
      const mine = myTurn();
      shootBtn.style.display = mine && !placing ? '' : 'none';
      outBtn.disabled = anim || npcBusy || finished;
      outBtn.style.display = finished ? 'none' : '';
      leaveBtn.textContent = finished ? 'Done' : 'Forfeit';
      controls.style.visibility = mine && !placing ? 'visible' : 'hidden';
    }

    function tell(v) {
      const who = v.shooter === 'p' ? 'You' : npcName;
      const pots = v.potted.filter(id => id !== 8);
      let s = pots.length ? `${who} ${v.shooter === 'p' ? 'pot' : 'pots'} the ${pots.join(', ')}.` : `${who} ${v.shooter === 'p' ? 'miss' : 'misses'}.`;
      if (v.assigned) s += ` ${v.shooter === 'p' ? 'You are' : `${npcName} is`} ${v.assigned}.`;
      if (v.foul) s += ` Foul (${v.foul}): ${st.turn === 'p' ? 'you have' : `${npcName} has`} the cue ball in hand.`;
      else if (v.continues) s += ` ${v.shooter === 'p' ? 'Shoot again.' : `${npcName} shoots again.`}`;
      return s;
    }

    function afterShot(v) {
      trail = [];
      status = tell(v);
      if (st.over) { finishGame(); return; }
      if (st.turn === 'n') { npcTurn(); return; }
      if (st.ballInHand) { placing = true; status += ' Place the cue ball.'; }
      if (!st.ballInHand && cue().potted) { placing = true; }
      // aim at the nearest legal ball to start with
      pointAtNearest();
    }

    function pointAtNearest() {
      const c = cue(); if (c.potted) return;
      const ts = poolLegalTargets(st, 'p').map(id => poolBallById(st, id)).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y));
      if (ts[0]) aim = Math.atan2(ts[0].y - c.y, ts[0].x - c.x);
    }

    function npcTurn() {
      npcBusy = true;
      status = `${npcName} is lining up a shot…`;
      timer = setTimeout(() => {
        if (finished) return;
        if (st.ballInHand) poolNpcPlaceCue(st, 'n');
        const s = poolNpcShot(st, 'n', opts.skillN, rng);
        aim = s.angle; power = Math.max(0.1, Math.min(1, s.power)); spin.x = 0; spin.y = 0;
        timer = setTimeout(() => {
          if (finished) return;
          npcBusy = false;   // (the aim line shows for a moment, then the shot rolls)
          poolBeginShotLive(st, { angle: s.angle, power: s.power, spin: s.spin });
          trail = []; anim = true;
        }, 650);
      }, 700);
    }

    function shoot() {
      if (!myTurn() || placing) return;
      poolBeginShotLive(st, { angle: aim, power, spin: { x: spin.x, y: spin.y } });
      trail = []; anim = true;
      status = '';
    }

    function finishGame(modelled) {
      finished = true; anim = false; npcBusy = true; placing = false;
      const res = poolResult(st, npcName);
      status = modelled || !st.lastShot ? res.summary : `${tell(st.lastShot)} ${res.summary}`.trim();
      leaveBtn.onclick = () => { cancelAnimationFrame(raf); clearTimeout(timer); overlay.removeAttribute('data-open'); resolve(res); };
    }

    canvas.addEventListener('pointermove', (e) => {
      if (!myTurn()) return;
      const r = canvas.getBoundingClientRect();
      const p = fromPx((e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height));
      if (placing) return;
      const c = cue();
      aim = Math.atan2(p.y - c.y, p.x - c.x);
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (!myTurn()) return;
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const p = fromPx((e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height));
      if (placing) {
        if (poolPlaceCue(st, p.x, p.y)) { placing = false; status = 'Aim and shoot.'; pointAtNearest(); }
        else status = 'Not there: it has to be clear of the other balls.';
        return;
      }
      const c = cue();
      aim = Math.atan2(p.y - c.y, p.x - c.x);
    });
    powRange.addEventListener('input', () => { power = Number(powRange.value) / 100; });
    spinCanvas.addEventListener('pointerdown', (e) => {
      const r = spinCanvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width - 0.5) * 2, y = -((e.clientY - r.top) / r.height - 0.5) * 2;
      const len = Math.hypot(x, y);
      spin.x = Math.max(-1, Math.min(1, len > 1 ? x / len : x)); spin.y = Math.max(-1, Math.min(1, len > 1 ? y / len : y));
      drawSpin();
    });
    shootBtn.addEventListener('click', shoot);
    outBtn.addEventListener('click', () => {
      if (anim || npcBusy || finished) return;
      clearTimeout(timer);
      if (st.turn === 'p' && st.ballInHand && cue().potted) poolNpcPlaceCue(st, 'p');
      poolSimulate(st, rng, opts.skillP, opts.skillN);
      finishGame(true);
    });
    leaveBtn.onclick = () => {
      if (finished) return;
      cancelAnimationFrame(raf); clearTimeout(timer);
      overlay.removeAttribute('data-open');
      resolve({ playerWon: false, grade: 'normal', summary: `You concede the game to ${npcName}.`, minutes: Math.round(T.minutes / 2) });
    };
    document.addEventListener('keydown', function onKey(e) {
      if (!overlay.hasAttribute('data-open')) { document.removeEventListener('keydown', onKey); return; }
      if (e.code === 'Space') { e.preventDefault(); shoot(); }
    });
    drawSpin();
    pointAtNearest();
    raf = requestAnimationFrame(frame);
  });
}
// ===== /SECTION: RENDER.GAMES =====
