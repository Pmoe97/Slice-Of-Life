// ===== SECTION: RENDER.CALENDAR =====
// The year-grid view (occasions-and-holidays-plan.md Phase 1, D3). One
// component, two future callers: the Calendar app's Year tab (here, via
// COMPUTER_RENDERERS['calendar-year'] — shared by desktop and phone), and the
// character-creation birthday picker (birthdays-and-occasions-plan.md P2,
// which passes `selectable`). Pure view code: it paints OCCASIONS'
// yearGridModel and never writes state. Extends COMPUTER_RENDERERS the way
// render.spritestudio.js does, so it loads AFTER render.computer.js.
//
// Every season is exactly five weeks and starts on a Sunday (occasions.js
// header), so each season is a clean 5x7 grid, Sunday first, no padding.

const CALENDAR_DOW_HEADER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function calendarCellTitle(cell, seasonLabel) {
  const bits = [`${cell.dom}${ordinalSuffix(cell.dom)} of ${seasonLabel}`];
  for (const o of cell.occasions) bits.push(`${o.emoji} ${o.label}`);
  for (const name of cell.birthdays) bits.push(`🎂 ${name}'s birthday`);
  for (const e of cell.events || []) bits.push(`${e.emoji} ${e.label}`);
  return bits.join(' · ');
}

// Builds the grid element for a yearGridModel. opts:
//   selectable   — cells are buttons; clicking one calls opts.onPick(doy)
//   selectedDoy  — the currently chosen day-of-year (picker)
//   showDetail   — a detail line under the grid names what's on a tapped
//                  day (touch has no hover, so the title tooltip alone
//                  would hide everything on a phone)
function buildYearGrid(model, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'cal-year';
  const detail = document.createElement('p');
  detail.className = 'cal-detail dim tiny';
  detail.textContent = opts.selectable ? 'Pick a day.' : 'Tap a day to see what\'s on it.';

  const grid = document.createElement('div');
  grid.className = 'cal-seasons';
  for (const season of model.seasons) {
    const block = document.createElement('div');
    block.className = `cal-season cal-season-${season.season}`;
    const title = document.createElement('div');
    title.className = 'cal-season-title';
    title.textContent = season.label;
    block.appendChild(title);

    const days = document.createElement('div');
    days.className = 'cal-grid';
    for (const dow of CALENDAR_DOW_HEADER) {
      const h = document.createElement('div');
      h.className = 'cal-dow';
      h.textContent = dow.slice(0, 1);
      h.title = dow;
      days.appendChild(h);
    }
    for (const cell of season.cells) {
      const el = document.createElement(opts.selectable ? 'button' : 'div');
      const marks = [...cell.occasions.map(o => o.emoji), ...cell.birthdays.map(() => '🎂'), ...(cell.events || []).map(e => e.emoji)];
      el.className = 'cal-cell'
        + (cell.isToday ? ' cal-today' : '')
        + (cell.isPast && !opts.selectable ? ' cal-past' : '')
        + (marks.length ? ' cal-marked' : '')
        + (opts.selectedDoy === cell.doy ? ' cal-selected' : '');
      // Sunday-first column: getWeekday is Monday = 0, so Sunday (6) → 0.
      el.style.gridColumn = String(((cell.weekday + 1) % 7) + 1);
      el.title = calendarCellTitle(cell, season.label);
      el.innerHTML = `<span class="cal-dom">${cell.dom}</span>`
        + (marks.length ? `<span class="cal-marks">${marks.slice(0, 2).join('')}</span>` : '');
      el.addEventListener('click', () => {
        detail.textContent = calendarCellTitle(cell, season.label);
        if (opts.selectable && typeof opts.onPick === 'function') opts.onPick(cell.doy);
      });
      days.appendChild(el);
    }
    block.appendChild(days);
    grid.appendChild(block);
  }
  wrap.appendChild(grid);
  if (opts.showDetail !== false) wrap.appendChild(detail);
  return wrap;
}

// COMPUTER_RENDERERS['calendar-year'] — the Calendar app's Year tab.
function renderCalendarYear(body, gs, app, screen) {
  if (typeof yearGridModel !== 'function') {
    body.innerHTML = '<p class="dim tiny">The calendar is unavailable.</p>';
    return;
  }
  const model = yearGridModel(gs);
  const header = document.createElement('div');
  header.className = 'cal-year-header';
  header.innerHTML = `<h3>Year ${model.year}</h3><p class="dim tiny">Holidays, the birthdays you know, and your roommates' big days. Today is outlined.</p>`;
  body.appendChild(header);
  body.appendChild(buildYearGrid(model, { showDetail: true }));
}

Object.assign(COMPUTER_RENDERERS, {
  'calendar-year': renderCalendarYear,
});

// ===== /SECTION: RENDER.CALENDAR =====
