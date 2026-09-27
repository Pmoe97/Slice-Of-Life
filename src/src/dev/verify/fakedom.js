// A small fake DOM for the UI harnesses that lift ui.js / render.computer.js
// functions into the engine vm (verify-ask-composer.js, verify-im-asks.js).
// Not a verify-*.js, so run-all.js never runs it on its own.
//
// Enough of the DOM for a composer, a sheet and a bubble: createElement,
// textContent (which, like the real thing, replaces children), classList,
// style.setProperty, attributes, addEventListener + a bubbling `dispatch`,
// click/focus, and querySelector(All)/closest over SIMPLE selectors only —
// `tag.class[attr="v"]`, comma lists; no descendant combinators (filter with
// closest() instead). `innerHTML` is a plain stored string: nothing parses
// it, which is exactly what lets a harness see whether text went in as
// markup or as text.
//
//   const { FAKE_DOM_SRC } = require('./fakedom.js');
//   api(FAKE_DOM_SRC);   // defines __el, __byId, __doc and sets `document`
const FAKE_DOM_SRC = `
  function __el(tag) {
    const attrs = new Map(), listeners = {}, style = {}, classes = new Set();
    const el = {
      tag: String(tag).toUpperCase(), children: [], parentNode: null, hidden: false, disabled: false,
      value: '', placeholder: '', type: '', min: '', max: '', step: '', inputMode: '', tabIndex: 0,
      _text: '',
      get textContent() { return this._text + this.children.map(c => c.textContent).join(''); },
      set textContent(v) { this._text = String(v); this.children.forEach(c => { c.parentNode = null; }); this.children = []; },
      get className() { return [...classes].join(' '); },
      set className(v) { classes.clear(); String(v).split(/\\s+/).filter(Boolean).forEach(c => classes.add(c)); },
      classList: {
        add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
        toggle: (c, on) => { const want = on === undefined ? !classes.has(c) : !!on; if (want) classes.add(c); else classes.delete(c); return want; },
      },
      style: { setProperty: (k, v) => { style[k] = v; }, getPropertyValue: (k) => style[k] || '' },
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
      append(...nodes) {
        for (const n of nodes) {
          if (typeof n === 'string') { const t = __el('#text'); t._text = n; this.appendChild(t); }
          else this.appendChild(n);
        }
      },
      innerHTML: '',
      get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === __root; },
      addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
      dispatch(type, ev) {
        const e = { type, target: this, key: ev && ev.key, preventDefault() {}, ...(ev || {}) };
        let node = this;
        while (node) { for (const fn of (node._listeners()[type] || [])) fn(e); node = node.parentNode; }
      },
      click() { this.dispatch('click'); },
      focus() { __doc.activeElement = this; },
      _listeners: () => listeners,
      _matches(sel) {
        return sel.split(',').some(one => {
          const m = one.trim().match(/^([a-z]*)((?:\\.[\\w-]+)*)((?:\\[[^\\]]+\\])*)$/i);
          if (!m) return false;
          if (m[1] && m[1].toUpperCase() !== el.tag) return false;
          for (const c of (m[2].match(/\\.[\\w-]+/g) || [])) if (!classes.has(c.slice(1))) return false;
          for (const a of (m[3].match(/\\[[^\\]]+\\]/g) || [])) {
            const am = a.match(/^\\[([\\w-]+)(?:="([^"]*)")?\\]$/);
            if (!attrs.has(am[1])) return false;
            if (am[2] !== undefined && attrs.get(am[1]) !== am[2]) return false;
          }
          return true;
        });
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => { for (const c of n.children) { if (c._matches(sel)) out.push(c); walk(c); } };
        walk(this);
        return out;
      },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      closest(sel) { let n = this; while (n) { if (n._matches && n._matches(sel)) return n; n = n.parentNode; } return null; },
    };
    return el;
  }
  var __root = __el('#document');
  var __byId = {};
  var __doc = { activeElement: null, createElement: (t) => __el(t), getElementById: (id) => __byId[id] || null };
  document = __doc;
`;

module.exports = { FAKE_DOM_SRC };
