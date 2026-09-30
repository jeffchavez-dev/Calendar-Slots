(() => {
  if (window.__freeslotLoaded) return;
  window.__freeslotLoaded = true;

  const SNAP = 15;        // minutes per grid step
  const CLICK_LEN = 30;   // a plain click offers this many minutes
  const MAC_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // The zone Google Calendar draws its grid in (Settings → Time zone → Primary).
  // It can differ from the computer's zone, so read it from the page.
  function calTz() {
    const tz = (document.getElementById('xTimezone') || {}).textContent;
    try {
      if (tz) { Intl.DateTimeFormat('en-US', { timeZone: tz.trim() }); return tz.trim(); }
    } catch {}
    return MAC_TZ;
  }
  const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);
  const MOD = IS_MAC ? '⌘' : 'Ctrl ';
  const hasStore = !!(globalThis.chrome && chrome.storage && chrome.storage.local);

  const DEFAULT_INTRO = 'Jumping in to help find a time for you to connect. Below are a few openings on our end, please let me know if you need more options.';
  const DEFAULT_CLOSING = 'Let me know what works best and I\'ll send across a calendar invite.\nBest,';
  const DEFAULTS = {
    introText: DEFAULT_INTRO, closing: DEFAULT_CLOSING,
    dateFormat: 'medium', timeFormat: '12', showTz: true, tz: null, // null = calendar's zone
  };
  // One-click presets; labels stay correct through daylight saving (ET, not EDT/EST).
  const PRESETS = [
    { tz: 'America/New_York', label: 'ET' },
    { tz: 'America/Denver', label: 'MT' },
    { tz: 'America/Los_Angeles', label: 'PT' },
  ];
  const COMMON_TZ = [
    'Pacific/Honolulu', 'America/Los_Angeles', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/New_York',
    'America/Sao_Paulo', 'Europe/London', 'Europe/Berlin', 'Africa/Johannesburg', 'Europe/Moscow',
    'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Manila', 'Asia/Singapore', 'Asia/Shanghai',
    'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland', 'UTC',
  ];

  const state = { active: false, slots: [], settings: { ...DEFAULTS }, view: 'main', drag: null };

  /* ---------- storage ---------- */

  function save() {
    if (hasStore) chrome.storage.local.set({ fsSlots: state.slots, fsSettings: state.settings });
  }

  async function load() {
    if (!hasStore) return;
    const r = await chrome.storage.local.get(['fsSlots', 'fsSettings']);
    state.slots = r.fsSlots || [];
    state.settings = { ...DEFAULTS, ...(r.fsSettings || {}) };
  }

  /* ---------- calendar grid ---------- */

  // Google Calendar datekey: ((year - 1970) << 9) | (month << 5) | day
  function decodeKey(k) {
    k = +k;
    return { y: (k >> 9) + 1970, m: (k >> 5) & 15, d: k & 31 };
  }

  // Timed day columns (the tall 24h gridcells), each matched to a date by x-position.
  function getColumns() {
    const main = document.querySelector('[role="main"]') || document;
    const cells = [...main.querySelectorAll('[role="gridcell"]')].filter((c) => c.getBoundingClientRect().height > 300);
    if (!cells.length) return [];
    const keys = [...main.querySelectorAll('[data-datekey]')]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((k) => k.r.width > 0);
    const cols = [];
    for (const cell of cells) {
      const rect = cell.getBoundingClientRect();
      const hit = keys.find((k) => {
        const cx = k.r.left + k.r.width / 2;
        return cx >= rect.left && cx <= rect.right;
      });
      if (!hit) continue;
      const { y, m, d } = decodeKey(hit.el.dataset.datekey);
      cols.push({ i: cols.length, cell, rect, y, m, d, key: `${y}-${m}-${d}` });
    }
    return cols;
  }

  function clipRect(cell) {
    for (let p = cell.parentElement; p && p !== document.body; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY;
      if (oy === 'scroll' || oy === 'auto') return p.getBoundingClientRect();
    }
    return { top: 0, bottom: innerHeight };
  }

  function colAt(x, y) {
    for (const c of getColumns()) {
      const clip = clipRect(c.cell);
      if (x >= c.rect.left && x < c.rect.right && y >= Math.max(c.rect.top, clip.top) && y < Math.min(c.rect.bottom, clip.bottom)) return c;
    }
    return null;
  }

  function minutesAt(col, y) {
    const raw = ((y - col.rect.top) / col.rect.height) * 1440;
    const snapped = Math.floor(raw / SNAP) * SNAP;
    return Math.max(0, Math.min(1440 - SNAP, snapped));
  }

  // Wall-clock time in a zone → epoch ms (two passes settle DST edges).
  function zonedToMs(y, m, d, min, tz) {
    const wall = Date.UTC(y, m - 1, d, 0, min);
    let ms = wall;
    for (let i = 0; i < 2; i++) {
      const p = partsIn(ms, tz);
      ms = wall - (Date.UTC(p.y, p.m - 1, p.d, 0, p.min) - ms);
    }
    return ms;
  }

  const dayMs = (col, min) => zonedToMs(col.y, col.m, col.d, min, calTz());
  const msgTz = () => state.settings.tz || calTz();

  /* ---------- slots ---------- */

  function normalize(slots) {
    const sorted = slots.filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
    const out = [];
    for (const s of sorted) {
      const last = out[out.length - 1];
      if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
      else out.push({ start: s.start, end: s.end });
    }
    return out;
  }

  function subtract(a, b) {
    const out = [];
    for (const s of state.slots) {
      if (s.end <= a || s.start >= b) { out.push(s); continue; }
      if (s.start < a) out.push({ start: s.start, end: a });
      if (s.end > b) out.push({ start: b, end: s.end });
    }
    state.slots = out;
  }

  function commit() {
    state.slots = normalize(state.slots);
    save();
    renderBlocks();
    updatePanel();
  }

  /* ---------- formatting ---------- */

  function partsIn(ms, tz) {
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
    }).formatToParts(new Date(ms))) p[x.type] = +x.value;
    return { y: p.year, m: p.month, d: p.day, min: (p.hour % 24) * 60 + p.minute };
  }

  function tzAbbr(tz, ms = Date.now()) {
    try {
      const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date(ms));
      return (p.find((x) => x.type === 'timeZoneName') || {}).value || tz;
    } catch {
      return tz;
    }
  }

  function tzLabel(tz, ms) {
    const preset = PRESETS.find((p) => p.tz === tz);
    return preset ? preset.label : tzAbbr(tz, ms);
  }

  function tzCity(tz) {
    return tz.split('/').pop().replace(/_/g, ' ');
  }

  function fmtTime(min, h24, withMer = true) {
    const h = Math.floor(min / 60) % 24;
    const m = min % 60;
    if (h24) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const hh = h % 12 || 12;
    return `${hh}:${String(m).padStart(2, '0')}${withMer ? (h < 12 ? 'am' : 'pm') : ''}`;
  }

  function fmtRange(s, e, h24) {
    if (h24) return `${fmtTime(s, true)}–${fmtTime(e, true)}`;
    const sameMer = Math.floor(s / 720) === Math.floor(e / 720) && e < 1440;
    return `${fmtTime(s, false, !sameMer)}–${fmtTime(e, false)}`;
  }

  function fmtDate(y, m, d, style) {
    if (style === 'short') return `${m}/${d}`;
    const weekday = style === 'long' ? 'long' : 'short';
    const s = new Intl.DateTimeFormat('en-US', { weekday, month: 'short', day: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(y, m - 1, d)));
    return s; // "Mon, Sep 14" / "Monday, Sep 14"
  }

  // { intro, lines, closing } — lines look like "Mon, Sep 14: 9:30–11:00am, 1:00–2:30pm ET"
  function buildParts() {
    const { timeFormat, dateFormat, showTz, introText, closing } = state.settings;
    const tz = msgTz();
    const h24 = timeFormat === '24';
    const days = [];
    for (const s of normalize(state.slots)) {
      const a = partsIn(s.start, tz);
      const key = `${a.y}-${a.m}-${a.d}`;
      const range = { s: a.min, e: a.min + Math.round((s.end - s.start) / 60000) };
      const last = days[days.length - 1];
      if (last && last.key === key) last.ranges.push(range);
      else days.push({ key, label: fmtDate(a.y, a.m, a.d, dateFormat), ranges: [range] });
    }
    if (!days.length) return null;
    const zone = showTz ? ` ${tzLabel(tz, state.slots[0].start)}` : '';
    const lines = days.map((d) => `${d.label}: ${d.ranges.map((r) => fmtRange(r.s, r.e, h24)).join(', ')}${zone}`);
    return { intro: introText.trim(), lines, closing: closing.trim() };
  }

  function buildMessage() {
    const p = buildParts();
    if (!p) return '';
    return [p.intro, p.lines.map((l) => `• ${l}`).join('\n'), p.closing].filter(Boolean).join('\n\n');
  }

  // Rich version so pasting into Gmail/Docs gives a real bulleted list.
  function buildHtml() {
    const p = buildParts();
    if (!p) return '';
    const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const para = (t) => (t ? `<p>${esc(t).replace(/\n/g, '<br>')}</p>` : '');
    return para(p.intro) + `<ul>${p.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` + para(p.closing);
  }

  /* ---------- blocks on the calendar ---------- */

  const pageCss = document.createElement('style');
  pageCss.textContent = `
    .fs-layer { position:absolute; inset:0; pointer-events:none; z-index:6; }
    .fs-block {
      position:absolute; left:2px; right:6px; box-sizing:border-box; border-radius:6px;
      border:1.5px solid #FFB020; overflow:hidden; pointer-events:none;
      background: repeating-linear-gradient(135deg, rgba(255,176,32,.30) 0 6px, rgba(255,176,32,.12) 6px 12px);
      box-shadow: 0 1px 0 rgba(0,0,0,.15);
      font: 500 11px/1 "Google Sans Text","Google Sans",Roboto,system-ui,sans-serif;
    }
    .fs-block.fs-preview { border-style:dashed; opacity:.85; }
    .fs-time {
      position:absolute; top:3px; left:3px; padding:3px 6px; border-radius:4px;
      background:#FFB020; color:#1d1400; letter-spacing:.01em; white-space:nowrap;
    }
    .fs-x {
      position:absolute; top:2px; right:2px; width:18px; height:18px; border:0; border-radius:4px; padding:0;
      background:#1d1400; color:#FFB020; font:600 13px/18px system-ui,sans-serif; cursor:pointer;
      opacity:0; transition:opacity .12s;
    }
    .fs-live .fs-block { pointer-events:auto; cursor:grab; }
    .fs-h { position:absolute; left:0; right:0; height:6px; cursor:ns-resize; }
    .fs-h.fs-top { top:-2px; }
    .fs-h.fs-bot { bottom:-2px; }
    .fs-h::after {
      content:""; position:absolute; left:50%; top:50%; width:22px; height:3px; margin:-1.5px 0 0 -11px;
      border-radius:2px; background:#FFB020; opacity:0; transition:opacity .12s;
    }
    .fs-live .fs-block:hover .fs-h::after { opacity:1; }
    html.fs-moving, html.fs-moving * { cursor:grabbing !important; }
    html.fs-resizing, html.fs-resizing * { cursor:ns-resize !important; }
    .fs-live .fs-block:hover .fs-x { opacity:1; }
    html.fs-on [role="main"] [role="gridcell"] { cursor:crosshair !important; }
  `;
  document.documentElement.appendChild(pageCss);

  function minuteOfDay(ms, col) {
    const p = partsIn(ms, calTz());
    return p.y === col.y && p.m === col.m && p.d === col.d ? p.min : 1440;
  }

  function renderBlocks() {
    const h24 = state.settings.timeFormat === '24';
    for (const col of getColumns()) {
      const ds = dayMs(col, 0);
      const de = dayMs(col, 1440);
      const items = [];
      for (const s of state.slots) {
        const a = Math.max(s.start, ds), b = Math.min(s.end, de);
        if (a < b) items.push({ a, b });
      }
      if (state.drag) for (const p of state.drag.preview) if (p.key === col.key) items.push({ a: p.start, b: p.end, preview: true });

      const sig = `${state.active}|${h24}|${JSON.stringify(items)}`;
      let layer = col.cell.querySelector(':scope > .fs-layer');
      if (!layer) {
        if (!items.length) continue;
        if (getComputedStyle(col.cell).position === 'static') col.cell.style.position = 'relative';
        layer = document.createElement('div');
        layer.className = 'fs-layer';
        col.cell.appendChild(layer);
      }
      if (layer.dataset.sig === sig) continue;
      layer.dataset.sig = sig;
      layer.classList.toggle('fs-live', state.active);
      layer.innerHTML = items.map(({ a, b, preview }) => {
        const s = minuteOfDay(a, col), e = minuteOfDay(b, col);
        const top = (s / 1440) * 100, height = ((e - s) / 1440) * 100;
        return `<div class="fs-block${preview ? ' fs-preview' : ''}" data-a="${a}" data-b="${b}" style="top:${top}%;height:${height}%">
          <span class="fs-time">${fmtRange(s, e, h24)}</span>${preview ? '' :
            '<button class="fs-x" title="Remove">×</button><div class="fs-h fs-top" title="Drag to change start"></div><div class="fs-h fs-bot" title="Drag to change end"></div>'}</div>`;
      }).join('');
    }
  }

  let raf = 0;
  const scheduleRender = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; renderBlocks(); });
  };
  new MutationObserver(scheduleRender).observe(document.body, { childList: true, subtree: true });
  addEventListener('resize', scheduleRender);

  /* ---------- drag to select ---------- */

  const stop = (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
  const inPanel = (e) => e.composedPath().includes(host);

  const snapDelta = (px, col) => Math.round(((px / col.rect.height) * 1440) / SNAP) * SNAP;

  function colIndexAt(cols, x) {
    const idx = cols.findIndex((c) => x >= c.rect.left && x < c.rect.right);
    if (idx >= 0) return idx;
    return x < cols[0].rect.left ? 0 : cols.length - 1;
  }

  // mode: 'new' (paint a slot), 'move' (whole block), 'start' / 'end' (resize an edge)
  function updatePreview(cols, e) {
    const d = state.drag;
    if (d.mode === 'new') {
      const lo = Math.min(d.startMin, d.curMin);
      const hi = Math.max(d.startMin, d.curMin) + SNAP;
      const [a, b] = d.moved ? [lo, hi] : [d.startMin, Math.min(1440, d.startMin + CLICK_LEN)];
      const i0 = Math.min(d.startIdx, d.curIdx), i1 = Math.max(d.startIdx, d.curIdx);
      d.preview = cols.slice(i0, i1 + 1).map((c) => ({ key: c.key, start: dayMs(c, a), end: dayMs(c, b) }));
    } else {
      const col = d.mode === 'move' && e ? cols[colIndexAt(cols, e.clientX)] : cols.find((c) => c.key === d.key) || cols[0];
      const delta = e ? snapDelta(e.clientY - d.y0, col) : 0;
      let a = d.s0, b = d.e0;
      if (d.mode === 'move') {
        a = Math.max(0, Math.min(1440 - (d.e0 - d.s0), d.s0 + delta));
        b = a + (d.e0 - d.s0);
      } else if (d.mode === 'start') {
        a = Math.max(0, Math.min(d.e0 - SNAP, d.s0 + delta));
      } else {
        b = Math.min(1440, Math.max(d.s0 + SNAP, d.e0 + delta));
      }
      d.preview = [{ key: col.key, start: dayMs(col, a), end: dayMs(col, b) }];
    }
    renderBlocks();
  }

  // Put an edited block back where it was (Esc, or a click that didn't move).
  function cancelDrag() {
    const d = state.drag;
    state.drag = null;
    document.documentElement.classList.remove('fs-moving', 'fs-resizing');
    if (d && d.orig) {
      state.slots.push(d.orig);
      state.slots = normalize(state.slots);
    }
    renderBlocks();
  }

  addEventListener('pointerdown', (e) => {
    if (!state.active || e.button !== 0 || inPanel(e)) return;
    const col = colAt(e.clientX, e.clientY);
    if (!col) return;
    stop(e);
    const t = e.target.closest ? e.target : e.target.parentElement;
    const block = t.closest('.fs-block');
    if (t.closest('.fs-x')) {
      subtract(+block.dataset.a, +block.dataset.b);
      commit();
      return;
    }
    const base = { x0: e.clientX, y0: e.clientY, moved: false, preview: [] };
    if (block) {
      const a = +block.dataset.a, b = +block.dataset.b;
      const handle = t.closest('.fs-h');
      const mode = handle ? (handle.classList.contains('fs-top') ? 'start' : 'end') : 'move';
      subtract(a, b); // lift the block out while it's being edited
      state.drag = { ...base, mode, key: col.key, s0: minuteOfDay(a, col), e0: minuteOfDay(b, col), orig: { start: a, end: b } };
      document.documentElement.classList.add(mode === 'move' ? 'fs-moving' : 'fs-resizing');
    } else {
      const m = minutesAt(col, e.clientY);
      state.drag = { ...base, mode: 'new', startIdx: col.i, curIdx: col.i, startMin: m, curMin: m };
    }
    updatePreview(getColumns());
  }, true);

  addEventListener('pointermove', (e) => {
    const d = state.drag;
    if (!d) return;
    stop(e);
    if (Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) > 4) d.moved = true;
    const cols = getColumns();
    if (!cols.length) return;
    if (d.mode === 'new') {
      d.curIdx = colIndexAt(cols, e.clientX);
      d.curMin = minutesAt(cols[d.curIdx], e.clientY);
    }
    updatePreview(cols, e);
  }, true);

  addEventListener('pointerup', (e) => {
    const d = state.drag;
    if (!d) return;
    stop(e);
    if (d.mode !== 'new' && !d.moved) { cancelDrag(); return; }
    state.drag = null;
    document.documentElement.classList.remove('fs-moving', 'fs-resizing');
    state.slots.push(...d.preview.map(({ start, end }) => ({ start, end })));
    commit();
  }, true);

  // Keep Google Calendar from opening its "new event" UI while we're selecting.
  for (const type of ['mousedown', 'mouseup', 'click', 'dblclick']) {
    addEventListener(type, (e) => {
      if (!state.active || inPanel(e)) return;
      if (state.drag || colAt(e.clientX, e.clientY)) stop(e);
    }, true);
  }

  addEventListener('keydown', (e) => {
    if (!state.active) return;
    const t = e.composedPath()[0];
    const editable = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const k = e.key.toLowerCase();
    const mod = e.metaKey || e.ctrlKey;
    if (k === 'escape') {
      stop(e);
      if (state.drag) cancelDrag();
      else if (state.view === 'settings') setView('main');
      else setActive(false);
    } else if (editable) {
      return;
    } else if (mod && !e.shiftKey && k === 'c' && !String(getSelection()) && state.slots.length) {
      stop(e);
      copy();
    } else if (mod && e.shiftKey && k === 'e' && state.slots.length) {
      stop(e);
      email();
    }
  }, true);

  /* ---------- panel ---------- */

  const host = document.createElement('div');
  host.id = 'freeslot-root';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
<style>
  :host { all: initial; }
  * { box-sizing: border-box; }
  .wrap {
    --bg:#17171a; --raise:#212126; --line:rgba(255,255,255,.08); --text:#ececef; --muted:#9a9aa3;
    --accent:#FFB020; --ink:#1d1400;
    font: 400 13px/1.45 "Google Sans Text","Google Sans",Roboto,system-ui,sans-serif; color: var(--text);
  }
  button { font: inherit; color: inherit; cursor: pointer; }
  .panel {
    position: fixed; right: 72px; bottom: 20px; z-index: 2147483000; width: 380px;
    background: var(--bg); border: 1px solid var(--line); border-radius: 14px;
    box-shadow: 0 18px 50px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.3);
    transform-origin: bottom right; animation: rise .16s ease-out; user-select: none;
  }
  @keyframes rise { from { opacity:0; transform: translateY(6px) scale(.98); } }
  header { display:flex; align-items:center; gap:8px; padding: 14px 16px 0; }
  .dot { width:8px; height:8px; border-radius:50%; background:var(--accent); box-shadow:0 0 0 3px rgba(255,176,32,.18); }
  .eyebrow { font-size:11px; font-weight:600; letter-spacing:.09em; text-transform:uppercase; color:var(--muted); flex:1; }
  .link { background:none; border:0; padding:4px 2px; font-weight:600; color:var(--accent); }
  .link:hover { text-decoration: underline; text-underline-offset: 3px; }
  .body { padding: 12px 16px 14px; }
  .empty { color:var(--muted); margin:2px 0 4px; }
  .empty b { color:var(--text); font-weight:600; }
  .preview {
    margin:0; padding: 10px 12px; border-left: 2px solid var(--accent); background: var(--raise);
    border-radius: 0 8px 8px 0; font: inherit; font-size: 14px; line-height: 1.55;
    max-height: 280px; overflow:auto; user-select: text;
  }
  .preview p { margin: 0 0 10px; }
  .preview p:last-child { margin-bottom: 0; }
  .preview ul { margin: 0 0 10px; padding-left: 18px; }
  .preview li { margin: 2px 0; }
  .preview li::marker { color: var(--accent); }
  .row { display:flex; gap:8px; margin-top: 12px; align-items:center; }
  .chip {
    position:relative; display:inline-flex; align-items:center; gap:6px; height:30px; padding:0 10px;
    border:1px solid var(--line); border-radius:999px; color:var(--text); font-weight:500;
  }
  .chip:hover { border-color: rgba(255,255,255,.2); }
  .chip select { position:absolute; inset:0; opacity:0; cursor:pointer; }
  .chip svg { opacity:.7; }
  .pills { display:flex; gap:4px; padding:3px; border:1px solid var(--line); border-radius:999px; }
  .pill { height:24px; padding:0 10px; border:0; border-radius:999px; background:none; color:var(--muted); font-weight:600; font-size:12px; }
  .pill:hover { color: var(--text); }
  .pill[aria-pressed=true] { background: var(--accent); color: var(--ink); }
  .chip.more[data-on=true] { border-color: var(--accent); color: var(--accent); }
  .btn {
    flex:1; display:inline-flex; align-items:center; justify-content:center; gap:8px; height:36px;
    border-radius:9px; border:1px solid var(--line); background: var(--raise); font-weight:600;
  }
  .btn:hover { background:#2a2a30; }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--ink); }
  .btn.primary:hover { background:#ffbe45; }
  .btn:disabled { opacity:.4; cursor:default; }
  kbd { font: 500 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; opacity:.6; }
  footer { display:flex; align-items:center; justify-content:space-between; border-top:1px solid var(--line); padding: 8px 10px 8px 16px; }
  .ghost { background:none; border:0; color:var(--muted); padding:6px 4px; }
  .ghost:hover { color: var(--text); }
  .icon { width:30px; height:30px; display:grid; place-items:center; border-radius:8px; }
  .icon:hover { background: var(--raise); }
  .field { display:block; margin-bottom: 14px; }
  .field > span { display:block; font-size:12px; color:var(--muted); margin-bottom:6px; }
  textarea {
    width:100%; padding:8px 10px; border-radius:8px; border:1px solid var(--line); resize:vertical;
    background: var(--raise); color: var(--text); font: inherit; line-height:1.4; outline:none;
  }
  textarea:focus { border-color: var(--accent); }
  input[type=text] {
    width:100%; height:34px; padding:0 10px; border-radius:8px; border:1px solid var(--line);
    background: var(--raise); color: var(--text); font: inherit; outline: none;
  }
  input[type=text]:focus { border-color: var(--accent); }
  .seg { display:flex; border:1px solid var(--line); border-radius:9px; overflow:hidden; }
  .seg button { flex:1; background:none; border:0; padding:7px 4px; line-height:1.25; color:var(--muted); }
  .seg button + button { border-left:1px solid var(--line); }
  .seg button small { display:block; font-size:11px; opacity:.75; }
  .seg button[aria-pressed=true] { background: rgba(255,176,32,.12); color: var(--accent); font-weight:600; }
  .toggle { display:flex; align-items:center; justify-content:space-between; }
  .switch { width:36px; height:20px; border-radius:999px; border:0; background:#3a3a42; position:relative; transition: background .15s; }
  .switch::after { content:""; position:absolute; top:3px; left:3px; width:14px; height:14px; border-radius:50%; background:#fff; transition: transform .15s; }
  .switch[aria-checked=true] { background: var(--accent); }
  .switch[aria-checked=true]::after { transform: translateX(16px); }
  .fab {
    position: fixed; right: 72px; bottom: 20px; z-index: 2147483000; display:inline-flex; align-items:center; gap:8px;
    height:38px; padding: 0 14px 0 10px; user-select: none; border-radius:999px; border:1px solid var(--line);
    background: var(--bg); color: var(--text); font-weight:600; box-shadow: 0 8px 24px rgba(0,0,0,.35);
  }
  .fab:hover { border-color: rgba(255,176,32,.6); }
  .swatch { width:18px; height:14px; border-radius:4px; border:1.5px solid var(--accent);
    background: repeating-linear-gradient(135deg, rgba(255,176,32,.45) 0 3px, transparent 3px 6px); }
  .badge { min-width:18px; height:18px; padding:0 5px; border-radius:999px; background:var(--accent); color:var(--ink); font-size:11px; display:grid; place-items:center; }
  [hidden] { display:none !important; }
</style>
<div class="wrap">
  <button class="fab" title="Offer times (Alt+Shift+O)"><span class="swatch"></span>Offer times<span class="badge" hidden></span></button>
  <div class="panel" hidden>
    <header>
      <span class="dot"></span><span class="eyebrow">Your availability</span>
      <button class="link done">Done</button>
    </header>
    <div class="body main">
      <p class="empty"></p>
      <div class="preview" hidden></div>
      <div class="row">
        <div class="pills"></div>
        <label class="chip more" title="Other timezones">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>
          <span class="tzlabel"></span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m6 9 6 6 6-6"/></svg>
          <select class="tz"></select>
        </label>
      </div>
      <div class="row">
        <button class="btn primary copy">Copy <kbd>${MOD}C</kbd></button>
        <button class="btn email">Email <kbd>${MOD}⇧E</kbd></button>
      </div>
    </div>
    <div class="body settings" hidden>
      <label class="field"><span>Opening message</span><textarea class="intro" rows="3" placeholder="Leave blank for no opening"></textarea></label>
      <label class="field"><span>Closing message</span><textarea class="closing" rows="3" placeholder="Leave blank for no closing"></textarea></label>
      <div class="field"><span>Date format</span>
        <div class="seg" data-key="dateFormat">
          <button data-v="short">Short<small>9/14</small></button>
          <button data-v="medium">Medium<small>Mon, Sep 14</small></button>
          <button data-v="long">Long<small>Monday, Sep 14</small></button>
        </div>
      </div>
      <div class="field"><span>Time format</span>
        <div class="seg" data-key="timeFormat">
          <button data-v="12">12-hour<small>9:00am</small></button>
          <button data-v="24">24-hour<small>09:30</small></button>
        </div>
      </div>
      <div class="field toggle"><span style="margin:0">Include timezone in text</span><button class="switch showtz" role="switch"></button></div>
    </div>
    <footer>
      <button class="ghost clear">Clear all</button>
      <button class="ghost icon gear" title="Settings">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>
      </button>
    </footer>
  </div>
</div>`;
  document.body.appendChild(host);

  const $ = (s) => root.querySelector(s);
  const ui = {
    fab: $('.fab'), badge: $('.badge'), panel: $('.panel'), eyebrow: $('.eyebrow'),
    main: $('.main'), settings: $('.settings'), empty: $('.empty'), preview: $('.preview'),
    tz: $('.tz'), tzlabel: $('.tzlabel'), pills: $('.pills'), more: $('.more'), copy: $('.copy'), email: $('.email'),
    intro: $('.intro'), closing: $('.closing'), showtz: $('.showtz'), gear: $('.gear'), clear: $('.clear'),
  };

  function fillTimezones() {
    const cur = msgTz();
    const home = calTz();
    const zones = [...new Set([home, cur, ...COMMON_TZ])];
    ui.tz.innerHTML = zones.map((z) =>
      `<option value="${z}"${z === cur ? ' selected' : ''}>${tzLabel(z)} · ${tzCity(z)}${z === home ? ' (your calendar)' : ''}</option>`).join('');
    const pills = PRESETS.some((p) => p.tz === home) ? PRESETS : [{ tz: home, label: tzLabel(home) }, ...PRESETS];
    ui.pills.innerHTML = pills.map((p) =>
      `<button class="pill" data-tz="${p.tz}" title="${tzCity(p.tz)}${p.tz === home ? ' (your calendar)' : ''}">${p.label}</button>`).join('');
  }

  function updatePanel() {
    const n = state.slots.length;
    const msg = buildMessage();
    ui.fab.hidden = state.active;
    ui.panel.hidden = !state.active;
    ui.badge.hidden = !n;
    ui.badge.textContent = n;
    ui.eyebrow.textContent = state.view === 'settings' ? 'Settings' : 'Your availability';
    ui.main.hidden = state.view !== 'main';
    ui.settings.hidden = state.view !== 'settings';
    ui.gear.style.color = state.view === 'settings' ? 'var(--accent)' : '';

    ui.preview.hidden = !msg;
    ui.preview.innerHTML = buildHtml();
    ui.empty.hidden = !!msg;
    ui.empty.innerHTML = getColumns().length
      ? '<b>Drag on the calendar</b> to mark times you’re free. Drag across days to repeat the same slot.'
      : 'Switch to <b>Day</b> or <b>Week</b> view to start marking free times.';
    ui.copy.disabled = ui.email.disabled = !msg;
    ui.clear.style.visibility = n ? 'visible' : 'hidden';

    const s = state.settings;
    const tz = msgTz();
    if (ui.tz.value !== tz) fillTimezones();
    let pilled = false;
    ui.pills.querySelectorAll('.pill').forEach((b) => {
      const on = b.dataset.tz === tz;
      pilled = pilled || on;
      b.setAttribute('aria-pressed', String(on));
    });
    ui.tzlabel.textContent = pilled ? 'More' : tzLabel(tz);
    ui.more.dataset.on = String(!pilled);
    if (root.activeElement !== ui.intro) ui.intro.value = s.introText;
    if (root.activeElement !== ui.closing) ui.closing.value = s.closing;
    root.querySelectorAll('.seg').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(s[seg.dataset.key] === b.dataset.v)));
    });
    ui.showtz.setAttribute('aria-checked', String(s.showTz));
  }

  function setActive(v) {
    if (state.drag) cancelDrag();
    state.active = v;
    if (!v) state.view = 'main';
    document.documentElement.classList.toggle('fs-on', v);
    renderBlocks();
    updatePanel();
  }

  function setView(v) {
    state.view = v;
    updatePanel();
  }

  function setSetting(k, v) {
    state.settings[k] = v;
    save();
    renderBlocks();
    updatePanel();
  }

  function flash(btn, label) {
    const html = btn.innerHTML;
    btn.textContent = label;
    setTimeout(() => { btn.innerHTML = html; }, 1200);
  }

  async function copy() {
    const msg = buildMessage();
    if (!msg) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([msg], { type: 'text/plain' }),
        'text/html': new Blob([buildHtml()], { type: 'text/html' }),
      })]);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = msg;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    flash(ui.copy, 'Copied ✓');
  }

  function email() {
    const msg = buildMessage();
    if (!msg) return;
    const url = 'https://mail.google.com/mail/?view=cm&fs=1&su=' + encodeURIComponent('Availability') + '&body=' + encodeURIComponent(msg);
    window.open(url, '_blank', 'noopener');
  }

  ui.fab.addEventListener('click', () => setActive(true));
  $('.done').addEventListener('click', () => setActive(false));
  ui.copy.addEventListener('click', copy);
  ui.email.addEventListener('click', email);
  ui.clear.addEventListener('click', () => { state.slots = []; commit(); });
  ui.gear.addEventListener('click', () => setView(state.view === 'settings' ? 'main' : 'settings'));
  ui.tz.addEventListener('change', () => setSetting('tz', ui.tz.value));
  ui.pills.addEventListener('click', (e) => {
    const b = e.target.closest('.pill');
    if (b) setSetting('tz', b.dataset.tz);
  });
  ui.intro.addEventListener('input', () => setSetting('introText', ui.intro.value));
  ui.closing.addEventListener('input', () => setSetting('closing', ui.closing.value));
  ui.showtz.addEventListener('click', () => setSetting('showTz', !state.settings.showTz));
  root.querySelectorAll('.seg').forEach((seg) => seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setSetting(seg.dataset.key, b.dataset.v);
  }));

  if (hasStore) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'freeslot:toggle') setActive(!state.active);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.fsSlots) state.slots = changes.fsSlots.newValue || [];
      if (changes.fsSettings) state.settings = { ...DEFAULTS, ...(changes.fsSettings.newValue || {}) };
      renderBlocks();
      updatePanel();
    });
  }

  load().then(() => {
    fillTimezones();
    renderBlocks();
    updatePanel();
  });
})();
