/* BlackNode Assistant v2 — single-file, no build step. Data stays in this browser (localStorage). */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const wait = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ic = (id, cls = '') => `<svg class="ic ${cls}"><use href="#i-${id}"/></svg>`;
function ago(ts) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'now'; const m = Math.round(s / 60); if (m < 60) return m + 'm';
  const h = Math.round(m / 60); if (h < 24) return h + 'h'; const d = Math.round(h / 24); if (d < 7) return d + 'd';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
const agoLong = ts => { const a = ago(ts); return a === 'now' ? 'just now' : /\d[mhd]$/.test(a) ? a + ' ago' : a; };
const fmtSep = ts => new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const COLORS = ['linear-gradient(135deg,#e041ff,#6b3dff)', 'linear-gradient(135deg,#2fd3ff,#6b3dff)', 'linear-gradient(135deg,#ffb347,#e041ff)', 'linear-gradient(135deg,#3dffa2,#2f8cff)', 'linear-gradient(135deg,#ff5470,#ffb347)', 'linear-gradient(135deg,#a855f7,#2fd3ff)'];
const colorFor = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return COLORS[Math.abs(h) % COLORS.length]; };
const initials = s => { const w = String(s).match(/[A-Za-z0-9]+/g) || ['?']; if (w.length > 1) return (w[0][0] + w[1][0]).toUpperCase(); const caps = w[0].match(/[A-Z0-9]/g) || []; return (caps.length > 1 ? caps[0] + caps[1] : w[0].slice(0, 2)).toUpperCase(); };

/* ---------- Persistence ---------- */
const KEY = 'bn.assistant.v2';
const DEFAULT_SETTINGS = {
  name: '', provider: 'free', baseUrl: '', model: '', apiKey: '', preset: '', mode: 'fast', timeout: 60, temperature: 0.7,
  accent: 'magenta', fontScale: 1, grid: true, reduceMotion: false, avatarName: 'BlackNode', showTasks: true, voiceReply: false
};
function seed() {
  const now = Date.now();
  const spaceId = 'sp-blacknode';
  return {
    v: 2, settings: { ...DEFAULT_SETTINGS },
    ui: { route: 'chat', thread: 'main', libFilter: 'all' },
    threads: [
      { id: 'main', kind: 'main', title: 'Main chat', updated: now, messages: [
        { id: uid('m'), role: 'assistant', ts: now, content: "Hey, I'm BlackNode. Talk to me here, keep separate topics in side chats, and I'll keep your Feed, Ideas, Goals and Library in step.\n\nTap me up top any time to see what I'm working on, what's finished and what's next.", choices: ['Give me a quick tour', 'Help me set a goal', 'Build my first feed'] }
      ] },
      { id: 't-' + spaceId, kind: 'space', spaceId, title: 'BlackNode', updated: now - 5000, messages: [
        { id: uid('m'), role: 'assistant', ts: now - 5000, content: "This is the **BlackNode** space: one room for the company, the model work and the platform. Ask for a plan, a task list or a draft and I'll keep it here." , choices: ['Plan the LLM', 'Design the platform', 'List my stack'] }
      ] }
    ],
    spaces: [{ id: spaceId, name: 'BlackNode', desc: 'Company HQ: the model, the platform and the stack.', created: now, updated: now - 5000 }],
    feed: { prompt: 'Make me a feed about AI models, open-source tools and indie building. Keep the tone clear and direct, quick to skim, and avoid clickbait.', editions: [] },
    ideas: [
      { id: uid('i'), title: 'Turn this chat into a weekly build log', body: 'Every Sunday I can draft a short log of what shipped, what broke and what is next, and file it in the Library.', fav: false, ts: now },
      { id: uid('i'), title: 'A 20-prompt eval set for your own model', body: 'Write a small, fixed set of prompts and score each model version against it, so every change is measured.', fav: false, ts: now },
      { id: uid('i'), title: 'One-page brand kit for BlackNode', body: 'Palette, type, voice and logo rules on a single page, so every project looks like part of the same family.', fav: false, ts: now }
    ],
    goals: [
      { id: uid('g'), title: 'Ship the BlackNode assistant app', cat: 'Productivity', note: 'Shell, chat, feed and goals are in. Next: real 3D avatar clips.', progress: 60, done: false, ts: now, updated: now }
    ],
    library: [],
    activity: { done: [] }
  };
}
let D;
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) { const d = JSON.parse(raw); if (d && d.v === 2) { d.settings = { ...DEFAULT_SETTINGS, ...d.settings }; return d; } } } catch (e) { /* fall through */ }
  return seed();
}
let saveT = 0;
function save(now) {
  clearTimeout(saveT);
  const run = () => { try { localStorage.setItem(KEY, JSON.stringify(D, (k, v) => (k === 'pending' || k === 'streaming') ? undefined : v)); } catch (e) { toast('Storage is full. Export a backup in Settings.'); } };
  if (now) run(); else saveT = setTimeout(run, 250);
}
D = load();
const S = () => D.settings;

/* ---------- Toast / sheet ---------- */
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }
let sheetClose = null;
function openSheet(html, mount, onClose) {
  const sh = $('#sheet'), sc = $('#sheetScrim');
  $('#sheetBody').innerHTML = html; $('#sheetBody').scrollTop = 0;
  sc.hidden = false; sh.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => { sc.classList.add('on'); sh.classList.add('on'); });
  sheetClose = onClose || null;
  if (mount) mount($('#sheetBody'));
}
function closeSheet() {
  const sh = $('#sheet'), sc = $('#sheetScrim');
  if (!sh.classList.contains('on')) return;
  sh.classList.remove('on'); sc.classList.remove('on'); sh.setAttribute('aria-hidden', 'true');
  setTimeout(() => { if (!sh.classList.contains('on')) { sc.hidden = true; $('#sheetBody').innerHTML = ''; } }, 320);
  const f = sheetClose; sheetClose = null; if (f) f();
}
function confirmSheet(title, body, okLabel, onOk, danger = true) {
  openSheet(`<h3>${esc(title)}</h3><p class="sub">${esc(body)}</p><div class="row-acts"><button class="btn ${danger ? 'danger' : 'primary'}" data-x="ok">${esc(okLabel)}</button><button class="btn ghost" data-x="cancel">Cancel</button></div>`, b => {
    b.querySelector('[data-x=ok]').onclick = () => { closeSheet(); onOk(); };
    b.querySelector('[data-x=cancel]').onclick = closeSheet;
  });
}
function download(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}
async function copyText(t) { try { await navigator.clipboard.writeText(t); toast('Copied'); } catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Copied'); } catch (_) { toast('Copy failed'); } ta.remove(); } }

/* ---------- Markdown (adapted from BlackNode Vanta) ---------- */
function inlineMd(t) {
  return t.replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
let CODE = [];
function md(src) {
  const blocks = []; let s = String(src || '');
  s = s.replace(/```([\w+-]*)[^\n]*\n([\s\S]*?)(```|$)/g, (m, lang, code) => { blocks.push({ lang: lang || '', code }); return `\n\u0000${blocks.length - 1}\u0000\n`; });
  s = esc(s);
  const lines = s.split('\n'); let out = '', list = null, table = [];
  const close = () => { if (list) { out += `</${list}>`; list = null; } };
  const flushT = () => { if (!table.length) return; const rows = table.filter(r => !/^\|[\s:|-]+\|$/.test(r.trim())); out += '<div style="overflow:auto"><table style="border-collapse:collapse;font-size:13px;margin:8px 0">' + rows.map((r, ri) => '<tr>' + r.trim().replace(/^\||\|$/g, '').split('|').map(c => `<${ri ? 'td' : 'th'} style="border:1px solid #2e2b38;padding:6px 9px;text-align:left">${inlineMd(c.trim())}</${ri ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</table></div>'; table = []; };
  for (const ln of lines) {
    let m;
    if (/^\|.*\|\s*$/.test(ln.trim())) { close(); table.push(ln); continue; } else flushT();
    if (/^\u0000\d+\u0000$/.test(ln.trim())) { close(); out += ln.trim(); continue; }
    if ((m = ln.match(/^(#{1,4})\s+(.*)/))) { close(); const h = Math.min(3, m[1].length); out += `<h${h}>${inlineMd(m[2])}</h${h}>`; continue; }
    if ((m = ln.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { close(); out += '<ul>'; list = 'ul'; } out += `<li>${inlineMd(m[1])}</li>`; continue; }
    if ((m = ln.match(/^\s*(\d+)[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out += +m[1] > 1 ? `<ol start="${+m[1]}">` : '<ol>'; list = 'ol'; } out += `<li>${inlineMd(m[2])}</li>`; continue; }
    close(); if (ln.trim()) out += `<p>${inlineMd(ln)}</p>`;
  }
  flushT(); close();
  return out.replace(/\u0000(\d+)\u0000/g, (m, i) => {
    const b = blocks[i]; const isHtml = /^(html|htm)$/i.test(b.lang) || /^\s*(<!doctype html|<html)/i.test(b.code);
    const k = CODE.push(b) - 1;
    return `<div class="code" data-k="${k}"><div class="bar"><span>${esc(b.lang || 'code')}</span><div class="grow"></div>${isHtml ? '<button data-act="code-preview">▶ Preview</button>' : ''}<button data-act="code-save">Save</button><button data-act="code-copy">Copy</button></div><pre><code>${esc(b.code)}</code></pre></div>`;
  });
}
const plain = s => String(s || '').replace(/```[\s\S]*?```/g, ' (code) ').replace(/[*_`#>|]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();

/* ---------- AVATAR: manifest-driven live 3D model + clip map, poster fallback ---------- */
const DEFAULT_MANIFEST = {
  version: 2, name: 'BlackNode', model: 'avatar/mascot.glb', crossFade: 0.4,
  material: { mode: 'auto', color: '#f6f4f1', roughness: 0.6 },
  clips: { idle: 'idle', thinking: 'thinking', talking: 'talking', working: 'working', happy: 'happy' },
  frame: { y: -0.035, height: 0.8, follow: 0.12 },
  states: {
    idle: { poster: 'poses/idle.png', motion: 'bob', label: '' },
    thinking: { poster: 'poses/thinking.png', motion: 'tilt', label: 'Thinking…' },
    talking: { poster: 'poses/talking.png', motion: 'talk', label: 'Writing reply' },
    working: { poster: 'poses/working.png', motion: 'glow', label: 'Working on it' },
    happy: { poster: 'poses/happy.png', motion: 'bounce', label: 'Done' }
  }
};
const ACC = {
  thinking: '<span class="dots"><i></i><i></i><i></i></span>',
  working: '<svg class="spin" viewBox="0 0 24 24"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>',
  talking: '<svg viewBox="0 0 24 24"><path d="M6 10v4M10 7v10M14 9v6M18 11v2"/></svg>',
  happy: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>'
};
/* Avatar: live rigged 3D model (three.js + AnimationMixer) with a poster fallback.
   App code only ever calls Avatar.set(state, task); the 3D module crossfades the matching clip. */
const reduceMotionOn = () => !!S().reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
const Avatar = {
  manifest: DEFAULT_MANIFEST, base: 'avatar/', state: null, task: '', previewT: 0, r3d: null, mode: 'poster', thumbs: {}, info: null, error: '',
  resolve(p) { if (!p) return ''; if (/^(data:|blob:|https?:|\/)/.test(p)) return p; return this.base + p; },
  entry(s) { return (this.manifest.states && this.manifest.states[s]) || this.manifest.states.idle || DEFAULT_MANIFEST.states.idle; },
  thumb(s) { return this.thumbs[s] || this.resolve(this.entry(s).poster); },
  async init() {
    if (window.BN_AVATAR_MANIFEST) { this.manifest = window.BN_AVATAR_MANIFEST; this.base = window.BN_AVATAR_BASE || ''; }
    else if (location.protocol !== 'file:') {
      try { const r = await fetch('avatar/manifest.json', { cache: 'no-cache' }); if (r.ok) this.manifest = { ...DEFAULT_MANIFEST, ...(await r.json()) }; } catch (e) { /* keep defaults */ }
    }
    this.applyName();
    const host = $('#avHost'); host.dataset.mode = 'poster';
    this.state = null; this.set('idle');
    if (this.r3d) { try { this.r3d.dispose(); } catch (_) { } this.r3d = null; }
    const model = window.BN_AVATAR_MODEL || this.manifest.model;
    if (!model) return;
    try {
      const mod = await import(window.BN_AVATAR3D_URL || './avatar3d.js');
      const clip = $('#avBtn .av-clip');
      this.r3d = await mod.createAvatar3D({
        container: clip, url: model, cfg: this.manifest, reduceMotion: reduceMotionOn,
        isShown: () => +getComputedStyle(host).opacity > 0.02
      });
      this.info = this.r3d.info;
      this.r3d.setState(this.state || 'idle');
      try { this.thumbs = this.r3d.snapshots(160); } catch (e) { this.thumbs = {}; }
      host.dataset.mode = '3d'; this.mode = '3d';
      requestAnimationFrame(() => this.r3d && this.r3d.canvas.classList.add('on'));
      if (D.ui.route === 'settings') renderSettings();
    } catch (e) {
      this.error = String(e && e.message || e); this.mode = 'poster'; host.dataset.mode = 'poster';
      console.warn('[avatar] 3D unavailable, using poster:', this.error);
    }
  },
  refreshMotion() { if (this.r3d) this.r3d.kick(); },
  applyName() { const n = S().avatarName || 'BlackNode'; $('#avName').textContent = n; $('#avBtn').setAttribute('aria-label', n + ' — what I\'m working on'); $('#avPill').setAttribute('aria-label', n + ' status'); },
  set(state, task) {
    if (task !== undefined) this.setTask(task);
    if (!this.manifest.states[state]) state = 'idle';
    if (state === this.state) return;
    this.state = state;
    const host = $('#avHost'); host.dataset.state = state; host.classList.toggle('active', state !== 'idle');
    const acc = $('#avAcc'); acc.innerHTML = ACC[state] || ''; acc.classList.toggle('on', !!ACC[state]);
    const e = this.entry(state), img = $('#avPoster');
    img.dataset.motion = e.motion || 'bob';
    const src = this.thumb(state); if (img.getAttribute('src') !== src) img.src = src;
    if (this.r3d) this.r3d.setState(state);
  },
  setTask(t) {
    this.task = t || '';
    const show = !!this.task && S().showTasks !== false;
    $('#avTask').textContent = this.task; $('#avHost').classList.toggle('has-task', show);
    if (this.task) $('#avAnnounce').textContent = (S().avatarName || 'BlackNode') + ': ' + this.task;
  },
  preview(state) { clearTimeout(this.previewT); const prev = Activity.current ? null : 'idle'; this.set(state, this.entry(state).label || (state === 'idle' ? '' : state)); if (prev) this.previewT = setTimeout(() => { if (!Activity.current) this.set('idle', ''); }, 3200); }
};

/* ---------- Activity: drives avatar + "Working on / Finished / Next" sheet ---------- */
const Activity = {
  current: null, idleT: 0,
  start(label, state = 'thinking', where = '') { clearTimeout(this.idleT); this.current = { label, where, ts: Date.now() }; Avatar.set(state, label); },
  update(state, label) { if (!this.current) return; if (label) this.current.label = label; Avatar.set(state, label); },
  end(doneLabel, ok = true) {
    const c = this.current; this.current = null;
    if (doneLabel) { D.activity.done.unshift({ label: doneLabel, ok, ts: Date.now() }); D.activity.done = D.activity.done.slice(0, 20); save(); }
    if (ok) { Avatar.set('happy', doneLabel || 'Done'); } else { Avatar.set('idle', doneLabel || ''); }
    clearTimeout(this.idleT); this.idleT = setTimeout(() => { if (!this.current) Avatar.set('idle', ''); }, ok ? 2400 : 4200);
    return c;
  }
};
function openStatusSheet() {
  const name = esc(S().avatarName || 'BlackNode');
  const cur = Activity.current;
  const done = D.activity.done.slice(0, 6);
  const next = [
    ...D.goals.filter(g => !g.done).slice(0, 3).map(g => ({ label: g.title, sub: `Goal · ${g.progress || 0}%`, go: 'goals' })),
    ...D.ideas.filter(i => i.fav).slice(0, 2).map(i => ({ label: i.title, sub: 'Favourite idea', go: 'ideas' }))
  ].slice(0, 4);
  openSheet(`
   <div style="display:flex;align-items:center;gap:12px;margin:6px 0 6px"><span class="av-thumb" style="width:48px;height:48px;box-shadow:0 0 18px -6px var(--accent)"><img src="${esc(Avatar.thumb(Avatar.state || 'idle'))}" alt=""></span><div><h3 style="margin:0">${name}</h3><div class="note">State: ${esc(Avatar.state || 'idle')}</div></div></div>
   <div class="sec-label">Working on</div>
   <div class="status-list">${cur ? `<div class="srow"><span class="sdot work"></span><div><b>${esc(cur.label)}</b><small>${esc(cur.where || '')} · started ${agoLong(cur.ts)}</small></div></div>` : `<div class="srow"><span class="sdot"></span><div><b>Nothing right now</b><small>Send me something and I'll get going.</small></div></div>`}</div>
   <div class="sec-label">Finished</div>
   <div class="status-list">${done.length ? done.map(d => `<div class="srow"><span class="sdot ${d.ok ? 'done' : ''}"></span><div><b>${esc(d.label)}</b><small>${agoLong(d.ts)}</small></div></div>`).join('') : '<div class="srow"><span class="sdot"></span><div><b>Nothing finished yet</b></div></div>'}</div>
   <div class="sec-label">Next</div>
   <div class="status-list">${next.length ? next.map(n => `<button class="srow" style="width:100%;text-align:left" data-go="${n.go}"><span class="sdot next"></span><div><b>${esc(n.label)}</b><small>${esc(n.sub)}</small></div></button>`).join('') : '<div class="srow"><span class="sdot next"></span><div><b>Set a goal and I\'ll line up next steps</b></div></div>'}</div>
   <div class="row-acts"><button class="btn sm" data-go="goals">${ic('goal', 'sm')}Goals</button><button class="btn sm" data-go="settings" data-anchor="avatar">${ic('gear', 'sm')}Avatar settings</button></div>`);
}

/* ---------- AI engine (reused from BlackNode Vanta: Free Live AI + BYO OpenAI-compatible) ---------- */
const PRESETS = {
  xai: { name: 'xAI Grok (your key)', url: 'https://api.x.ai/v1', model: 'grok-3-mini', note: 'grok-3-mini is fast and cheap; grok-4.5 works too.' },
  groq: { name: 'Groq (free key)', url: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b' },
  gemini: { name: 'Google Gemini (free key)', url: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' },
  openrouter: { name: 'OpenRouter (free models)', url: 'https://openrouter.ai/api/v1', model: 'openrouter/free' },
  ollama: { name: 'Ollama (Termux / local)', url: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:7b' },
  lmstudio: { name: 'LM Studio (local)', url: 'http://127.0.0.1:1234/v1', model: '' }
};
function endpoint() {
  const s = S();
  if (s.provider === 'custom' && s.baseUrl) return { url: s.baseUrl.replace(/\/+$/, '') + '/chat/completions', key: s.apiKey, model: s.model, free: false, xai: /api\.x\.ai/i.test(s.baseUrl), label: (s.model || 'custom') };
  return { url: 'https://text.pollinations.ai/openai', key: '', model: 'openai-fast', free: true, label: 'Free Live AI' };
}
/** Streams an OpenAI-compatible chat completion. Returns { text, reasoning, model }. */
async function aiStream({ messages, signal, onToken, onReasoning, onBusy, temperature, effort, maxParts = 4 }) {
  const ep = endpoint();
  let text = '', reasoning = '', model = ep.model || '';
  const CONT = 'Your reply was cut off by the output limit. Continue EXACTLY where it stopped, starting with the very next character. Do not repeat anything or add commentary.';
  let msgs = messages, parts = 0;
  for (;;) {
    const body = { messages: msgs, stream: true, temperature: temperature ?? +S().temperature };
    if (ep.model) body.model = ep.model;
    if (ep.free) body.seed = Math.floor(Math.random() * 1e9);
    body.reasoning_effort = effort || (S().mode === 'fast' ? 'low' : (ep.xai ? 'high' : 'medium'));
    const headers = { 'Content-Type': 'application/json' }; if (ep.key) headers.Authorization = 'Bearer ' + ep.key;
    let res = await fetch(ep.url, { method: 'POST', headers, body: JSON.stringify(body), signal });
    for (let a = 1; res.status === 429 && a <= 3 && !signal?.aborted; a++) {
      const ra = +(res.headers.get('retry-after') || 0); onBusy && onBusy(a);
      await new Promise((ok, no) => { const t = setTimeout(ok, Math.min(15, ra || a * 4) * 1000); signal && signal.addEventListener('abort', () => { clearTimeout(t); no(new Error('aborted')); }, { once: true }); });
      res = await fetch(ep.url, { method: 'POST', headers, body: JSON.stringify(body), signal });
    }
    if (!res.ok && !ep.free && res.status === 400 && body.reasoning_effort) { delete body.reasoning_effort; res = await fetch(ep.url, { method: 'POST', headers, body: JSON.stringify(body), signal }); }
    if (!res.ok) {
      let t = ''; try { t = (await res.text()).slice(0, 240); } catch (e) { }
      if (/turnstile/i.test(t)) throw new Error(location.hostname === 'localhost' ? 'The free AI blocks pages opened as "localhost". Open the app at http://127.0.0.1 instead, or set your own key in Settings.' : 'The free AI asked for a bot check. Try again in a minute, or set your own key in Settings.');
      throw new Error(`The AI returned error ${res.status}${res.status === 401 ? ' (check your API key in Settings)' : res.status === 429 ? ' (rate limited, wait a minute and retry)' : ''}. ${t}`);
    }
    const before = text; let piece = '', finish = '';
    const add = t => { piece += t; if (!parts) { text += t; } else { const k = Math.min(300, before.length, piece.length); let cut = 0; for (let x = k; x >= 12; x--) { if (before.endsWith(piece.slice(0, x))) { cut = x; break; } } text = before + piece.slice(cut); } onToken && onToken(text); };
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const j = await res.json(); const ch = j.choices?.[0] || {}; const m = ch.message || {};
      if (m.reasoning || m.reasoning_content) { reasoning += m.reasoning || m.reasoning_content; onReasoning && onReasoning(reasoning); }
      add(m.content || ''); finish = ch.finish_reason || ''; if (j.model) model = j.model;
    } else {
      const rd = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      while (true) {
        const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true });
        let nl; while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue; const d = line.slice(5).trim(); if (d === '[DONE]') continue;
          try {
            const j = JSON.parse(d); if (j.error) throw new Error(j.error.message || 'AI error'); if (j.model) model = j.model;
            const ch = j.choices?.[0] || {}; if (ch.finish_reason) finish = ch.finish_reason; const dl = ch.delta || {};
            const r = dl.reasoning || dl.reasoning_content; if (r) { reasoning += r; onReasoning && onReasoning(reasoning); }
            if (dl.content) add(dl.content);
          } catch (e) { if (e.message && !(e instanceof SyntaxError)) throw e; }
        }
      }
    }
    parts++;
    if (finish === 'length' && parts < maxParts && text) { msgs = messages.concat([{ role: 'assistant', content: text }, { role: 'user', content: CONT }]); continue; }
    break;
  }
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return { text, reasoning, model };
}
function friendlyError(e, signal) {
  const ep = endpoint(); const why = signal && signal.reason;
  if (why === 'timeout') return `No reply after ${S().timeout || 60}s. The AI service may be busy. Tap Retry.`;
  return (e && e.message && !/Failed to fetch|NetworkError|Load failed|network/i.test(e.message)) ? e.message : `Couldn't reach the AI${ep.free ? ' (free service)' : ' at ' + ep.url}. Check your connection${ep.free ? '' : ' and Settings'}.`;
}
function extractJSON(t) {
  t = String(t || '').replace(/```(?:json)?/gi, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { } }
  const c = t.indexOf('['), d = t.lastIndexOf(']');
  if (c >= 0 && d > c) { try { return JSON.parse(t.slice(c, d + 1)); } catch (e) { } }
  return null;
}

/* ---------- Navigation ---------- */
const TABS = [
  { id: 'chat', label: 'Chat', icon: 'chat' }, { id: 'feed', label: 'Feed', icon: 'feed' }, { id: 'ideas', label: 'Ideas', icon: 'idea' },
  { id: 'goals', label: 'Goals', icon: 'goal' }, { id: 'library', label: 'Library', icon: 'lib' }
];
const ROUTES = ['chat', 'feed', 'ideas', 'goals', 'library', 'spaces', 'settings'];
function renderNav() {
  const r = D.ui.route;
  $('#tabbar').innerHTML = TABS.map(t => `<button class="tab${r === t.id || (t.id === 'library' && r === 'spaces') ? ' on' : ''}" data-go="${t.id}" aria-label="${t.label}"${r === t.id ? ' aria-current="page"' : ''}>${ic(t.icon)}</button>`).join('') + `<button class="tab" data-act="drawer" aria-label="More">${ic('more')}</button>`;
  $('#dockNav').innerHTML = TABS.map(t => `<button class="dock-btn${r === t.id ? ' on' : ''}" data-go="${t.id}" aria-label="${t.label}" title="${t.label}">${ic(t.icon)}</button>`).join('') + `<button class="dock-btn${r === 'spaces' ? ' on' : ''}" data-go="spaces" aria-label="Spaces" title="Spaces">${ic('square-plus')}</button>`;
}
function go(route, opts = {}) {
  setTimeout(() => Avatar.refreshMotion(), 320);
  if (!ROUTES.includes(route)) route = 'chat';
  D.ui.route = route; save();
  $('#app').dataset.route = route;
  if (location.hash !== '#/' + route) history.replaceState(null, '', '#/' + route);
  renderNav(); closeSheet(); closeSides();
  const R = { chat: renderChat, feed: renderFeed, ideas: renderIdeas, goals: renderGoals, library: renderLibrary, spaces: renderSpaces, settings: renderSettings }[route];
  R && R(opts);
  if (route !== 'chat') { const p = $(`[data-view="${route}"] .page`); if (p && !opts.keepScroll) p.scrollTop = 0; }
}
function openDrawer() {
  const r = D.ui.route;
  openSheet(`
   <div class="sec-label" style="margin-top:6px">Tabs</div>
   ${TABS.map(t => `<div style="display:flex;align-items:center"><button class="drow${r === t.id ? ' on' : ''}" data-go="${t.id}">${ic(t.icon)}<span class="lbl">${t.label}</span></button>${t.id !== 'chat' ? `<button class="icon-btn" data-act="tab-menu" data-tab="${t.id}" aria-label="${t.label} options">${ic('dots', 'sm')}</button>` : ''}</div>`).join('')}
   <div class="sec-label">Spaces</div>
   ${D.spaces.map(sp => `<div style="display:flex;align-items:center"><button class="drow" data-act="open-space" data-id="${sp.id}"><span class="sp-ico" style="background:${colorFor(sp.name)}">${esc(initials(sp.name))}</span><span class="lbl">${esc(sp.name)}</span></button><button class="icon-btn" data-act="space-menu" data-id="${sp.id}" aria-label="${esc(sp.name)} options">${ic('dots', 'sm')}</button></div>`).join('')}
   <button class="drow" data-act="create-space">${ic('square-plus')}<span class="lbl">Create a space</span></button>
   <button class="drow" data-go="spaces">${ic('lib')}<span class="lbl">All spaces</span></button>
   <div class="divider"></div>
   <button class="drow" data-act="report">${ic('bug')}<span class="lbl">Report an issue</span></button>
   <button class="drow${r === 'settings' ? ' on' : ''}" data-go="settings">${ic('gear')}<span class="lbl">Settings</span></button>`);
}
function tabMenu(tab) {
  const items = {
    feed: [['Generate a new edition', () => { go('feed'); generateFeed(); }], ['Edit feed prompt', () => { go('feed'); editFeedPrompt(); }]],
    ideas: [['Think up new ideas', () => { go('ideas'); generateIdeas(); }], ['Add an idea', () => { go('ideas'); ideaForm(); }]],
    goals: [['Create a goal', () => { go('goals'); goalForm(); }]],
    library: [['New note', () => { go('library'); noteForm(); }], ['Open Spaces', () => go('spaces')]]
  }[tab] || [];
  openSheet(`<h3>${esc(tab[0].toUpperCase() + tab.slice(1))}</h3>` + items.map((it, i) => `<button class="drow" data-i="${i}"><span class="lbl">${esc(it[0])}</span>${ic('chev', 'sm')}</button>`).join(''), b => {
    $$('[data-i]', b).forEach(el => el.onclick = () => { closeSheet(); setTimeout(items[+el.dataset.i][1], 60); });
  });
}

/* ---------- Threads / side chats ---------- */
const thread = (id = D.ui.thread) => D.threads.find(t => t.id === id) || D.threads.find(t => t.id === 'main');
function openThread(id) { if (!D.threads.find(t => t.id === id)) id = 'main'; D.ui.thread = id; save(); closeSides(); go('chat'); }
function newSide(title = 'New side chat', open = true) {
  const t = { id: uid('t'), kind: 'side', title, updated: Date.now(), messages: [] };
  D.threads.push(t); save(); if (open) openThread(t.id); return t;
}
function spaceThread(spaceId) {
  let t = D.threads.find(x => x.kind === 'space' && x.spaceId === spaceId);
  if (!t) { const sp = D.spaces.find(s => s.id === spaceId); t = { id: 't-' + spaceId, kind: 'space', spaceId, title: sp ? sp.name : 'Space', updated: Date.now(), messages: [] }; D.threads.push(t); save(); }
  return t;
}
function openSides() { renderSides(); const s = $('#sides'), sc = $('#sideScrim'); sc.hidden = false; s.setAttribute('aria-hidden', 'false'); requestAnimationFrame(() => { sc.classList.add('on'); s.classList.add('on'); }); }
function closeSides() { const s = $('#sides'), sc = $('#sideScrim'); if (!s.classList.contains('on')) return; s.classList.remove('on'); sc.classList.remove('on'); s.setAttribute('aria-hidden', 'true'); setTimeout(() => { if (!s.classList.contains('on')) sc.hidden = true; }, 300); }
let sidesCollapsed = false;
function renderSides() {
  const q = ($('#sideSearch').value || '').toLowerCase().trim();
  const match = t => !q || t.title.toLowerCase().includes(q) || t.messages.some(m => (m.content || '').toLowerCase().includes(q));
  const main = D.threads.find(t => t.id === 'main');
  const sides = D.threads.filter(t => t.kind === 'side' && match(t)).sort((a, b) => b.updated - a.updated);
  const spaces = D.threads.filter(t => t.kind === 'space' && match(t)).sort((a, b) => b.updated - a.updated);
  const row = t => `<button class="crow${D.ui.thread === t.id ? ' on' : ''}" data-act="open-thread" data-id="${t.id}"><span class="lbl">${esc(t.title)}</span><small>${ago(t.updated)}</small></button>`;
  $('#sidesBody').innerHTML = `${main && match(main) ? row(main) : ''}
   <div class="sides-sec"><button data-act="toggle-sides">Side chats ${ic('down', 'xs')}</button><button class="icon-btn" data-act="new-side" aria-label="New side chat">${ic('plus', 'sm')}</button></div>
   ${sidesCollapsed ? '' : sides.length ? sides.map(row).join('') : `<div class="sides-empty" style="padding-top:60px">${ic('bubbles', 'lg')}<b>Start a side chat</b>Side chats keep separate topics out of your main thread. Tap + to start one.</div>`}
   ${spaces.length ? `<div class="sides-sec"><span>Spaces</span></div>${spaces.map(row).join('')}` : ''}`;
}

/* ---------- Chat rendering ---------- */
const CHOICE_RE = /\n?\s*\[\[\s*choices?\s*:\s*([^\]]*)\]\]\s*$/i;
function splitChoices(text, streaming) {
  let t = String(text || ''), choices = null;
  const m = t.match(CHOICE_RE);
  if (m) { choices = m[1].split('|').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean).slice(0, 4); t = t.slice(0, m.index); }
  else if (streaming) { const i = t.lastIndexOf('[['); if (i >= 0 && t.length - i < 220) t = t.slice(0, i); }
  return { text: t.trimEnd(), choices };
}
function msgHTML(m, i, msgs) {
  const prev = msgs[i - 1], next = msgs[i + 1];
  const same = (a, b) => a && b && a.role === b.role && Math.abs(a.ts - b.ts) < 120000 && !a.error && !b.error;
  const cls = ['msg', m.role === 'user' ? 'user' : 'agent', same(prev, m) ? 'grouped-prev' : '', same(m, next) ? 'grouped-next' : ''].join(' ');
  if (m.role === 'user') {
    return `<div class="${cls}" data-idx="${i}" data-message-side="user">${m.files && m.files.length ? `<div class="files">${m.files.map(f => `<span class="chip">${esc(f.name)}</span>`).join('')}</div>` : ''}<div class="bubble"><span class="sr-only">You:</span>${esc(m.display ?? m.content)}</div></div>`;
  }
  const isLast = i === msgs.length - 1;
  const { text, choices } = splitChoices(m.content, m.pending);
  const ch = m.choices || choices;
  let body = '';
  if (m.reasoning && S().mode === 'think') body += `<details class="reasoning"${m.pending && !text ? ' open' : ''}><summary>Reasoning</summary><div>${esc(m.reasoning.slice(-2400))}</div></details>`;
  if (m.pending && !text) body += `<span class="typing" aria-label="Thinking"><i></i><i></i><i></i></span>`;
  else body += `<div class="prose${m.pending ? ' caret' : ''}">${md(text)}</div>`;
  if (ch && ch.length && !m.pending) body += `<div class="choices${m.chosen != null ? ' done' : ''}">${ch.map((c, k) => `<button class="choice${m.chosen === k ? ' sel' : ''}" data-act="choice" data-k="${k}"${m.chosen != null ? ' disabled' : ''}><span>${esc(c)}</span>${ic('checkc', 'sm')}</button>`).join('')}</div>`;
  if (m.error) body += `<div class="err">${esc(m.error)}<button data-act="retry">Retry</button></div>`;
  let cards = '';
  for (const c of (m.cards || [])) {
    const a = D.library.find(x => x.id === c.id); if (!a) continue;
    cards += `<button class="agent-card" data-act="open-art" data-id="${a.id}"><span class="tile">${ic(a.type === 'code' ? 'laptop' : a.type === 'feed' ? 'feed' : 'bookmark')}</span><span style="min-width:0"><b>${esc(a.title)}</b><small>Saved to Library · ${esc(a.lang || a.type)}</small></span>${ic('chev', 'go sm')}</button>`;
  }
  const meta = m.pending ? '' : `<div class="msg-meta"><button class="mini" data-act="m-copy" aria-label="Copy">${ic('copy')}</button><button class="mini" data-act="m-speak" aria-label="Speak">${ic('speaker')}</button><button class="mini" data-act="m-save" aria-label="Save to Library">${ic('bookmark')}</button>${isLast ? `<button class="mini" data-act="retry" aria-label="Regenerate">${ic('refresh')}</button>` : ''}<button class="mini" data-act="m-more" aria-label="More options">${ic('dots')}</button>${m.model ? `<span class="model-tag">${esc(m.model)}</span>` : ''}</div>`;
  return `<div class="${cls}" data-idx="${i}" data-message-side="agent"><div class="bubble" aria-busy="${m.pending ? 'true' : 'false'}">${body}</div>${cards}${meta}</div>`;
}
function renderChat() {
  const t = thread(); CODE = [];
  const sp = t.kind === 'space' ? D.spaces.find(s => s.id === t.spaceId) : null;
  $('#threadName').textContent = sp ? sp.name : t.title;
  $('#threadSub').textContent = sp ? 'Space' : t.kind === 'side' ? 'Side chat' : (S().avatarName || 'BlackNode');
  const msgs = t.messages; let html = '', lastTs = 0;
  if (!msgs.length) html = `<div class="empty-chat"><h2>${esc(t.title)}</h2><p>${t.kind === 'side' ? 'A fresh side chat. What should we dig into?' : 'Say hi to get started.'}</p></div>`;
  msgs.forEach((m, i) => {
    if (!lastTs || m.ts - lastTs > 3600000 || new Date(m.ts).toDateString() !== new Date(lastTs).toDateString()) html += `<div class="date-sep">${fmtSep(m.ts)}</div>`;
    lastTs = m.ts; html += msgHTML(m, i, msgs);
  });
  $('#chatColumn').innerHTML = html;
  $('#inp').placeholder = sp ? `Message ${sp.name}` : 'Message';
  renderSend();
}
function updateMsg(i) {
  const t = thread(); const el = $(`#chatColumn [data-idx="${i}"]`);
  if (!el) return renderChat();
  const w = document.createElement('div'); w.innerHTML = msgHTML(t.messages[i], i, t.messages); el.replaceWith(w.firstElementChild);
}

/* ---------- Sending ---------- */
let busy = null, attachments = [];
function renderSend() {
  const has = !!$('#inp').value.trim() || attachments.length;
  const sb = $('#sendBtn'), mb = $('#micBtn');
  if (busy) { sb.hidden = false; sb.innerHTML = ic('stop'); sb.setAttribute('aria-label', 'Stop'); mb.hidden = true; }
  else { sb.innerHTML = ic('send'); sb.setAttribute('aria-label', 'Send'); sb.hidden = !has; mb.hidden = !!has; }
}
function autosize() { const ta = $('#inp'); ta.style.height = '24px'; ta.style.height = Math.min(192, ta.scrollHeight) + 'px'; }
function systemPrompt(t) {
  const s = S(); const name = s.avatarName || 'BlackNode';
  let p = `You are ${name}, a warm, sharp personal assistant inside the BlackNode app (tabs: Chat, Feed, Ideas, Goals, Library, Spaces). Be concise and practical. Use short paragraphs and markdown when it helps. When the user would benefit from choosing a next step, end your reply with ONE final line exactly like: [[choices: Option one | Option two | Option three]] (2-3 options, each under 7 words). Skip choices for simple factual answers. Put any code in fenced code blocks with a language tag; the app saves code blocks to the Library automatically. Never claim you did things outside this chat.`;
  if (t.kind === 'space') { const sp = D.spaces.find(x => x.id === t.spaceId); if (sp) p += `\n\nYou are in the "${sp.name}" space. ${sp.desc || ''}`; }
  else if (t.kind === 'side') p += `\n\nThis is a side chat called "${t.title}". Stay on that topic.`;
  const goals = D.goals.filter(g => !g.done).slice(0, 6);
  if (goals.length) p += `\n\nThe user's open goals: ${goals.map(g => `${g.title} (${g.progress || 0}%)`).join('; ')}.`;
  if (s.mode === 'think') p += '\n\nReply mode: THINK. Work the problem through carefully, then give a clear, well-structured answer.';
  else p += '\n\nReply mode: FAST. Answer directly. No preamble.';
  p += `\n\nToday is ${new Date().toDateString()}.${s.name ? ` The user's name is ${s.name}.` : ''}`;
  return p;
}
async function send(text, opts = {}) {
  text = String(text ?? $('#inp').value).trim();
  if (busy) return;
  if (!text && !attachments.length) return;
  const t = thread();
  let content = text; const files = [];
  for (const a of attachments) { content += `\n\n--- File: ${a.name} ---\n${a.text}`; files.push({ name: a.name }); }
  attachments = []; renderAttach();
  t.messages.push({ id: uid('m'), role: 'user', content, display: text || '(attached files)', files, ts: Date.now() });
  if (t.kind === 'side' && (t.title === 'New side chat' || !t.title)) t.title = (text || files[0]?.name || 'Side chat').replace(/\s+/g, ' ').slice(0, 42);
  if (!opts.keepInput) { $('#inp').value = ''; autosize(); }
  await runAI(t);
}
async function runAI(t) {
  const ai = { id: uid('m'), role: 'assistant', content: '', reasoning: '', pending: true, ts: Date.now() };
  t.messages.push(ai); const idx = t.messages.length - 1; t.updated = Date.now();
  if (D.ui.thread === t.id) renderChat();
  const ctrl = new AbortController(); busy = { ctrl, idx, t }; renderSend();
  const where = t.kind === 'space' ? (D.spaces.find(s => s.id === t.spaceId)?.name || 'Space') : t.title;
  Activity.start('Thinking…', 'thinking', where);
  let gotFirst = false, last = 0, phase = 'thinking';
  const firstTimer = setTimeout(() => { if (!gotFirst) ctrl.abort('timeout'); }, (S().timeout || 60) * 1000);
  const paint = () => { const n = performance.now(); if (n - last > 70 && D.ui.thread === t.id) { last = n; updateMsg(idx); } };
  try {
    const hist = t.messages.slice(0, idx).filter(m => !m.error && m.content).slice(-24).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
    const r = await aiStream({
      messages: [{ role: 'system', content: systemPrompt(t) }, ...hist], signal: ctrl.signal,
      onBusy: a => { clearTimeout(firstTimer); Activity.update('thinking', `AI is busy, retrying (${a}/3)…`); },
      onReasoning: rs => { gotFirst = true; ai.reasoning = rs; if (phase === 'thinking') Activity.update('thinking', 'Thinking it through'); paint(); },
      onToken: txt => {
        gotFirst = true; ai.content = txt;
        const fences = (txt.match(/```/g) || []).length;
        const want = fences % 2 === 1 ? 'working' : 'talking';
        if (want !== phase) { phase = want; Activity.update(want, want === 'working' ? 'Writing code' : 'Writing reply'); }
        paint();
      }
    });
    ai.content = r.text; ai.model = r.model || endpoint().label;
    if (!ai.content) throw new Error('The AI sent back an empty reply.');
  } catch (e) {
    if (ctrl.signal.reason === 'stop') { if (!ai.content) ai.content = '*Stopped.*'; }
    else ai.error = friendlyError(e, ctrl.signal);
  } finally {
    clearTimeout(firstTimer); delete ai.pending; busy = null; renderSend();
    if (!S().reasoningKeep) ai.reasoning = S().mode === 'think' ? ai.reasoning : '';
    const saved = ai.error ? 0 : harvestArtifacts(ai, t);
    t.updated = Date.now(); touchSpace(t); save(true);
    if (D.ui.thread === t.id) updateMsg(idx);
    if (ai.error) Activity.end('Reply failed in ' + where, false);
    else { Activity.end(saved ? `Saved ${saved} item${saved > 1 ? 's' : ''} to Library` : 'Replied in ' + where, true); }
    if (!ai.error && (S().voiceReply || Voice.call)) speak(splitChoices(ai.content).text, () => { if (Voice.call) Voice.listen(true); });
  }
}
function touchSpace(t) { if (t.kind === 'space') { const sp = D.spaces.find(s => s.id === t.spaceId); if (sp) sp.updated = Date.now(); } }
function harvestArtifacts(ai, t) {
  const re = /```([\w+-]*)[^\n]*\n([\s\S]*?)```/g; let m, n = 0; ai.cards = ai.cards || [];
  const lastUser = [...t.messages].reverse().find(x => x.role === 'user');
  while ((m = re.exec(ai.content))) {
    const code = m[2]; if (code.trim().length < 80) continue;
    const lang = (m[1] || 'code').toLowerCase();
    const head = (lastUser?.display || '').replace(/\s+/g, ' ').slice(0, 48);
    const title = (/<title>([^<]{2,60})<\/title>/i.exec(code) || [])[1] || (head ? head : lang + ' snippet') + (n ? ` (${n + 1})` : '');
    const a = { id: uid('a'), type: 'code', lang, title, content: code, ts: Date.now(), thread: t.id };
    D.library.unshift(a); ai.cards.push({ type: 'artifact', id: a.id }); n++;
  }
  return n;
}
function stop() { if (busy) busy.ctrl.abort('stop'); }
function retry() {
  if (busy) return; const t = thread();
  while (t.messages.length && t.messages[t.messages.length - 1].role === 'assistant') t.messages.pop();
  if (!t.messages.length) return; runAI(t);
}
function renderAttach() {
  const r = $('#attachRow'); r.hidden = !attachments.length;
  r.innerHTML = attachments.map((a, i) => `<span class="chip">${esc(a.name)}<button data-act="unattach" data-i="${i}" aria-label="Remove">${ic('x', 'xs')}</button></span>`).join('');
  renderSend();
}

/* ---------- Voice (browser speech, as in Vanta) ---------- */
function speak(text, done) {
  if (!('speechSynthesis' in window)) { done && done(); return; }
  speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(plain(text).slice(0, 4000)); u.rate = 1.02;
  u.onstart = () => { if (!Activity.current) Avatar.set('talking', 'Speaking'); };
  u.onend = u.onerror = () => { if (!Activity.current) Avatar.set('idle', ''); done && done(); };
  speechSynthesis.speak(u);
}
const Voice = {
  rec: null, call: false,
  supported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); },
  listen(auto) {
    if (!this.supported()) { toast('Voice input needs Chrome speech recognition on this device.'); this.call = false; $('#callBtn').classList.remove('live'); return; }
    const R = window.SpeechRecognition || window.webkitSpeechRecognition; const r = new R(); this.rec = r;
    r.lang = navigator.language || 'en-US'; r.interimResults = true; r.continuous = false;
    $('#micBtn').classList.add('rec'); if (!Activity.current) Avatar.set('thinking', 'Listening…');
    let final = '';
    r.onresult = e => { let s = ''; for (const res of e.results) { s += res[0].transcript; if (res.isFinal) final = s; } $('#inp').value = s; autosize(); renderSend(); };
    r.onerror = () => { };
    r.onend = () => { $('#micBtn').classList.remove('rec'); this.rec = null; if (!Activity.current) Avatar.set('idle', ''); if (auto && (final || $('#inp').value.trim())) send(); else if (auto && this.call) { this.call = false; $('#callBtn').classList.remove('live'); } };
    try { r.start(); } catch (e) { $('#micBtn').classList.remove('rec'); }
  },
  stop() { if (this.rec) try { this.rec.stop(); } catch (e) { } },
  toggleCall() { this.call = !this.call; $('#callBtn').classList.toggle('live', this.call); if (this.call) { toast('Voice call on. Start talking.'); this.listen(true); } else { this.stop(); if ('speechSynthesis' in window) speechSynthesis.cancel(); toast('Voice call ended'); } }
};

/* ---------- Feed ---------- */
let feedBusy = null;
function renderFeed() {
  const f = D.feed; const p = $('#pFeed');
  const units = f.editions.map(ed => `<div class="edition-h"><span>Edition · ${fmtSep(ed.ts)}</span><span>${ed.units.length} items</span></div>` + ed.units.map(u => `
    <article class="unit" data-ed="${ed.id}" data-u="${u.id}">
     <span class="glyph" style="background:${colorFor(u.tag || u.title)}">${esc((u.glyph || initials(u.tag || u.title)).slice(0, 2))}</span>
     <div class="body"><div class="top"><h2>${esc(u.title)}</h2><time datetime="${new Date(ed.ts).toISOString()}">${agoLong(ed.ts)}</time><button class="icon-btn" style="margin:-6px -8px 0 0" data-act="unit-menu" aria-label="More">${ic('dots', 'sm')}</button></div>
      <p>${inlineMd(esc(u.summary))}</p>${u.tag ? `<span class="tag">${esc(u.tag)}</span>` : ''}
      <footer><button class="mini${u.loved ? ' loved' : ''}" data-act="unit-love" aria-pressed="${!!u.loved}" aria-label="Love">${ic('heart')}</button><button class="mini" data-act="unit-discuss">${ic('chat')}Discuss</button><button class="mini" data-act="unit-save">${ic('bookmark')}Save</button></footer></div>
    </article>`).join('')).join('');
  p.innerHTML = `<div class="inner">
   <div class="ph"><h1>Feed</h1></div>
   <div class="card prompt-card" id="feedPrompt"><div class="lab">Your feed prompt</div><div class="txt">${esc(f.prompt)}</div>
    <div class="acts"><button class="btn" data-act="feed-edit">${ic('pencil')}Edit</button><button class="btn primary" data-act="feed-gen"${feedBusy ? ' disabled' : ''}>${feedBusy ? '<span class="spin-sm"></span>Generating' : 'Generate'}</button></div></div>
   ${feedBusy ? `<div class="note" style="margin:14px 4px 0">${esc(feedBusy.note || 'Writing your edition…')}</div>` : ''}
   ${f.editions.length ? units : `<div class="empty"><b>No editions yet</b>Tap Generate and I'll write one from your prompt.</div>`}
   <p class="note" style="margin-top:22px">Editions are written by the AI from its own knowledge, not live news. Check anything important.</p>
  </div>`;
}
function editFeedPrompt() {
  const box = $('#feedPrompt'); if (!box) return;
  box.innerHTML = `<div class="lab">Your feed prompt</div><textarea id="feedTa" aria-label="Feed prompt">${esc(D.feed.prompt)}</textarea><div class="acts"><button class="btn ghost" data-act="feed-cancel">Cancel</button><button class="btn primary" data-act="feed-savep">Save</button></div>`;
  const ta = $('#feedTa'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
}
async function generateFeed() {
  if (feedBusy) return;
  const ctrl = new AbortController(); feedBusy = { ctrl, note: 'Writing your edition…' }; if (D.ui.route === 'feed') renderFeed();
  Activity.start('Generating feed', 'working', 'Feed');
  const sys = 'You write a personal, skimmable feed edition. Output ONLY valid JSON, no prose, in this shape: {"units":[{"title":"...","summary":"2-3 crisp sentences","tag":"one or two words","glyph":"2 letters"}]}. Write exactly 5 units. Use your own knowledge: favour explainers, practical tips, trends and well-established developments. Do not invent specific breaking news, dates, prices or quotes you are not sure of. The reader goals only guide topic choice: write about the wider world, never present the reader\'s own projects as news. No clickbait.';
  const user = `Feed prompt: ${D.feed.prompt}\nToday is ${new Date().toDateString()}.`;
  const timer = setTimeout(() => ctrl.abort('timeout'), (S().timeout || 60) * 1000 + 30000);
  try {
    const r = await aiStream({ messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], signal: ctrl.signal, temperature: 0.8, effort: 'low',
      onToken: txt => { const n = (txt.match(/"title"\s*:/g) || []).length; const note = n ? `Writing item ${Math.min(n, 5)} of 5…` : 'Planning the edition…'; if (note !== feedBusy.note) { feedBusy.note = note; Activity.update('working', 'Generating feed · ' + Math.min(n, 5) + '/5'); if (D.ui.route === 'feed') renderFeed(); } } });
    let j = extractJSON(r.text); let units = Array.isArray(j) ? j : j && (j.units || j.items || j.feed);
    if (!Array.isArray(units) || !units.length) {
      units = r.text.split(/\n(?=\s*(?:\d+[.)]|[-*•]|#+)\s)/).map(s => s.replace(/^\s*(?:\d+[.)]|[-*•]|#+)\s*/, '').trim()).filter(s => s.length > 20).slice(0, 5).map(s => { const [h, ...rest] = s.split(/\n|: | — /); return { title: plain(h).slice(0, 90), summary: plain(rest.join(' ')) || plain(h) }; });
    }
    units = units.filter(u => u && (u.title || u.summary)).slice(0, 6).map(u => ({ id: uid('u'), title: String(u.title || 'Untitled').slice(0, 120), summary: String(u.summary || u.body || '').slice(0, 600), tag: String(u.tag || '').slice(0, 24), glyph: String(u.glyph || '').slice(0, 2), loved: false }));
    if (!units.length) throw new Error('The AI reply could not be turned into feed items. Try Generate again.');
    D.feed.editions.unshift({ id: uid('e'), ts: Date.now(), units, model: r.model }); D.feed.editions = D.feed.editions.slice(0, 12);
    save(true); Activity.end(`Generated a feed edition (${units.length} items)`, true);
    if (D.ui.route !== 'feed') { toast('New feed edition ready'); markTab('feed'); }
  } catch (e) { Activity.end('Feed generation failed', false); toast(friendlyError(e, ctrl.signal)); }
  finally { clearTimeout(timer); feedBusy = null; if (D.ui.route === 'feed') renderFeed(); }
}
function markTab(id) { const b = $(`.tab[data-go="${id}"]`); if (b && !b.querySelector('.badge')) b.insertAdjacentHTML('beforeend', '<span class="badge"></span>'); }
function findUnit(el) { const a = el.closest('[data-u]'); const ed = D.feed.editions.find(e => e.id === a.dataset.ed); return { ed, u: ed && ed.units.find(x => x.id === a.dataset.u) }; }
function discuss(title, body, kick) {
  const t = newSide(title.slice(0, 42), true);
  setTimeout(() => send(kick || `Let's discuss: "${title}"\n\n${body}`), 80);
  return t;
}

/* ---------- Ideas ---------- */
let ideasBusy = false;
function renderIdeas() {
  const list = [...D.ideas].sort((a, b) => (b.fav - a.fav) || (b.ts - a.ts));
  $('#pIdeas').innerHTML = `<div class="inner">
   <div class="ph"><h1>Ideas</h1><button class="round" data-act="idea-add" aria-label="Add an idea">${ic('plus')}</button></div>
   <p class="lede">I keep turning over ways to move your work forward. The best ones land here. Star the keepers.</p>
   <button class="btn primary" data-act="ideas-gen" style="margin-bottom:10px"${ideasBusy ? ' disabled' : ''}>${ideasBusy ? '<span class="spin-sm"></span>Thinking…' : ic('spark') + 'Think up new ideas'}</button>
   ${list.length ? list.map(i => `<div class="idea" data-id="${i.id}"><span class="glyph" style="background:${colorFor(i.title)}">${i.fav ? ic('star', 'sm') : esc(initials(i.title))}</span><div class="body"><h3>${esc(i.title)}</h3><p>${esc(i.body)}</p></div><button class="icon-btn" data-act="idea-menu" aria-label="Idea options">${ic('dots', 'sm')}</button></div>`).join('') : '<div class="empty"><b>No ideas yet</b>Tap "Think up new ideas".</div>'}
  </div>`;
}
async function generateIdeas() {
  if (ideasBusy) return; ideasBusy = true; if (D.ui.route === 'ideas') renderIdeas();
  Activity.start('Thinking up ideas', 'thinking', 'Ideas');
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort('timeout'), 90000);
  const goals = D.goals.filter(g => !g.done).map(g => g.title).slice(0, 6);
  const recent = D.threads.flatMap(t => t.messages.filter(m => m.role === 'user').slice(-3).map(m => (m.display || m.content).slice(0, 140))).slice(-6);
  try {
    const r = await aiStream({ messages: [{ role: 'system', content: 'You suggest concrete, useful ideas the assistant could do for the user next. Output ONLY JSON: {"ideas":[{"title":"short punchy title","body":"1-2 sentences, written as I can..."}]}. Exactly 3 ideas, specific to the context.' }, { role: 'user', content: `Goals: ${goals.join('; ') || 'none yet'}\nRecent messages: ${recent.join(' | ') || 'none yet'}\nExisting ideas (avoid repeats): ${D.ideas.map(i => i.title).slice(0, 10).join('; ')}` }], signal: ctrl.signal, temperature: 0.9, effort: 'low', onToken: () => Activity.update('working', 'Writing ideas') });
    const j = extractJSON(r.text); const arr = Array.isArray(j) ? j : j && j.ideas;
    if (!Array.isArray(arr) || !arr.length) throw new Error('Could not read ideas from the AI reply. Try again.');
    arr.slice(0, 4).reverse().forEach(x => D.ideas.unshift({ id: uid('i'), title: String(x.title || 'Idea').slice(0, 100), body: String(x.body || x.description || '').slice(0, 400), fav: false, ts: Date.now() }));
    save(true); Activity.end(`Added ${Math.min(arr.length, 4)} new ideas`, true);
  } catch (e) { Activity.end('Idea generation failed', false); toast(friendlyError(e, ctrl.signal)); }
  finally { clearTimeout(timer); ideasBusy = false; if (D.ui.route === 'ideas') renderIdeas(); }
}
function ideaForm(idea) {
  openSheet(`<h3>${idea ? 'Edit idea' : 'Add an idea'}</h3><label class="fld"><span>Title</span><input class="in" id="fT" value="${esc(idea?.title || '')}"></label><label class="fld"><span>Details</span><textarea class="in" id="fB">${esc(idea?.body || '')}</textarea></label><div class="row-acts"><button class="btn primary" id="fOk">Save</button></div>`, b => {
    $('#fT', b).focus();
    $('#fOk', b).onclick = () => { const title = $('#fT', b).value.trim(); if (!title) return toast('Give it a title'); if (idea) { idea.title = title; idea.body = $('#fB', b).value.trim(); } else D.ideas.unshift({ id: uid('i'), title, body: $('#fB', b).value.trim(), fav: false, ts: Date.now() }); save(); closeSheet(); renderIdeas(); };
  });
}
function ideaMenu(id) {
  const i = D.ideas.find(x => x.id === id); if (!i) return;
  openSheet(`<h3>${esc(i.title)}</h3><p class="sub">${esc(i.body)}</p>
   <button class="drow" data-x="fav">${ic('star')}<span class="lbl">${i.fav ? 'Unfavourite' : 'Favourite'}</span></button>
   <button class="drow" data-x="discuss">${ic('chat')}<span class="lbl">Discuss in a side chat</span></button>
   <button class="drow" data-x="goal">${ic('goal')}<span class="lbl">Turn into a goal</span></button>
   <button class="drow" data-x="edit">${ic('pencil')}<span class="lbl">Edit</span></button>
   <button class="drow" data-x="del">${ic('trash')}<span class="lbl">Dismiss</span></button>`, b => {
    b.onclick = e => {
      const x = e.target.closest('[data-x]')?.dataset.x; if (!x) return;
      if (x === 'fav') { i.fav = !i.fav; save(); closeSheet(); renderIdeas(); }
      if (x === 'discuss') { closeSheet(); discuss(i.title, i.body, `I like this idea: "${i.title}" — ${i.body}\n\nHow would we do it? Give me the first concrete steps.`); }
      if (x === 'goal') { D.goals.unshift({ id: uid('g'), title: i.title, cat: 'Productivity', note: i.body, progress: 0, done: false, ts: Date.now(), updated: Date.now() }); save(); closeSheet(); toast('Added to Goals'); }
      if (x === 'edit') { closeSheet(); setTimeout(() => ideaForm(i), 60); }
      if (x === 'del') { D.ideas = D.ideas.filter(y => y.id !== id); save(); closeSheet(); renderIdeas(); }
    };
  });
}

/* ---------- Goals ---------- */
const CATS = [['Health', 'heart'], ['Relationships', 'people'], ['Finance', 'dollar'], ['Career', 'brief'], ['Interests', 'palette'], ['Productivity', 'laptop']];
function renderGoals() {
  const open = D.goals.filter(g => !g.done), done = D.goals.filter(g => g.done);
  const row = g => `<div class="goal${g.done ? ' done' : ''}" data-id="${g.id}"><button class="cb" data-act="goal-toggle" aria-label="${g.done ? 'Mark not done' : 'Mark done'}">${g.done ? ic('check', 'xs') : ''}</button><div class="body" data-act="goal-menu" style="cursor:pointer"><h3>${esc(g.title)}</h3><p>${esc(g.note || g.cat)}</p>${g.done ? '' : `<div class="bar" aria-label="${g.progress || 0}%"><i style="width:${clamp(g.progress || 0, 0, 100)}%"></i></div>`}</div><button class="icon-btn" data-act="goal-menu" aria-label="Goal options">${ic('dots', 'sm')}</button></div>`;
  $('#pGoals').innerHTML = `<div class="inner">
   <div class="ph"><h1>Goals</h1><button class="round" data-act="goals-menu" aria-label="Goal options">${ic('dots')}</button></div>
   <div class="tracking"><span class="dot"></span>Tracking</div>
   ${open.length ? open.map(row).join('') : '<p class="note">Nothing tracked yet. Pick a category below.</p>'}
   ${done.length ? `<div class="h2" style="font-size:16px;color:var(--text-2)">Completed</div>${done.map(row).join('')}` : ''}
   <div class="h2">Create a goal</div>
   ${CATS.map(([c, i]) => `<button class="cat" data-act="goal-new" data-cat="${c}">${ic(i)}<span class="lbl">${c}</span>${ic('chev', 'chev')}</button>`).join('')}
  </div>`;
}
function goalForm(cat = 'Productivity', g) {
  openSheet(`<h3>${g ? 'Edit goal' : 'New ' + esc(cat.toLowerCase()) + ' goal'}</h3>
   <label class="fld"><span>What do you want to achieve?</span><input class="in" id="gT" value="${esc(g?.title || '')}" placeholder="e.g. Run 5k without stopping"></label>
   <label class="fld"><span>Category</span><select class="in" id="gC">${CATS.map(([c]) => `<option${(g?.cat || cat) === c ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
   <label class="fld"><span>Where you are now / next step</span><textarea class="in" id="gN" placeholder="Optional">${esc(g?.note || '')}</textarea></label>
   <label class="fld"><span>Progress: <b id="gPv">${g?.progress || 0}%</b></span><input type="range" id="gP" min="0" max="100" step="5" value="${g?.progress || 0}" style="width:100%;accent-color:var(--accent)"></label>
   <div class="row-acts"><button class="btn primary" id="gOk">${g ? 'Save' : 'Start tracking'}</button>${g ? '' : '<button class="btn" id="gPlan">' + ic('spark') + 'Save &amp; ask for a plan</button>'}</div>`, b => {
    $('#gP', b).oninput = e => $('#gPv', b).textContent = e.target.value + '%';
    const commit = () => { const title = $('#gT', b).value.trim(); if (!title) { toast('Name the goal first'); return null; } const obj = g || { id: uid('g'), ts: Date.now(), done: false }; Object.assign(obj, { title, cat: $('#gC', b).value, note: $('#gN', b).value.trim(), progress: +$('#gP', b).value, updated: Date.now() }); if (!g) D.goals.unshift(obj); save(); closeSheet(); renderGoals(); D.activity.done.unshift({ label: (g ? 'Updated goal: ' : 'Started tracking: ') + title, ok: true, ts: Date.now() }); return obj; };
    $('#gOk', b).onclick = commit;
    const pl = $('#gPlan', b); if (pl) pl.onclick = () => { const o = commit(); if (o) discuss(o.title, '', `Help me plan my ${o.cat.toLowerCase()} goal: "${o.title}".${o.note ? ' Where I am now: ' + o.note : ''}\n\nGive me a short step-by-step plan with the first action I can do today.`); };
    $('#gT', b).focus();
  });
}
function goalMenu(id) {
  const g = D.goals.find(x => x.id === id); if (!g) return;
  openSheet(`<h3>${esc(g.title)}</h3><p class="sub">${esc(g.cat)} · ${g.done ? 'Completed' : (g.progress || 0) + '%'} · updated ${agoLong(g.updated || g.ts)}</p>
   <button class="drow" data-x="edit">${ic('pencil')}<span class="lbl">Update progress or notes</span></button>
   <button class="drow" data-x="plan">${ic('spark')}<span class="lbl">Ask ${esc(S().avatarName || 'BlackNode')} for next steps</span></button>
   <button class="drow" data-x="done">${ic('goal')}<span class="lbl">${g.done ? 'Mark not done' : 'Mark complete'}</span></button>
   <button class="drow" data-x="del">${ic('trash')}<span class="lbl">Delete goal</span></button>`, b => {
    b.onclick = e => {
      const x = e.target.closest('[data-x]')?.dataset.x; if (!x) return;
      if (x === 'edit') { closeSheet(); setTimeout(() => goalForm(g.cat, g), 60); }
      if (x === 'plan') { closeSheet(); discuss(g.title, '', `My goal: "${g.title}" (${g.progress || 0}% done). ${g.note || ''}\n\nWhat are the next 3 steps?`); }
      if (x === 'done') { toggleGoal(g.id); closeSheet(); }
      if (x === 'del') { D.goals = D.goals.filter(y => y.id !== id); save(); closeSheet(); renderGoals(); }
    };
  });
}
function toggleGoal(id) { const g = D.goals.find(x => x.id === id); if (!g) return; g.done = !g.done; if (g.done) { g.progress = 100; D.activity.done.unshift({ label: 'Completed goal: ' + g.title, ok: true, ts: Date.now() }); Avatar.set('happy', 'Goal complete!'); setTimeout(() => { if (!Activity.current) Avatar.set('idle', ''); }, 2400); } g.updated = Date.now(); save(); renderGoals(); }

/* ---------- Library ---------- */
const LIB_FILTERS = [['all', 'All'], ['code', 'Code'], ['note', 'Notes'], ['feed', 'Feed'], ['chat', 'Chat']];
function renderLibrary() {
  const f = D.ui.libFilter || 'all';
  $('#pLibrary').innerHTML = `<div class="inner">
   <div class="ph"><h1>Library</h1><button class="round" data-go="spaces" aria-label="Spaces">${ic('square-plus')}</button><button class="round accent" data-act="note-new" aria-label="New note">${ic('plus')}</button></div>
   <label class="search-pill lib-search">${ic('search', 'sm')}<input id="libQ" placeholder="Search artifacts" aria-label="Search artifacts" value="${esc(D.ui.libQ || '')}"></label>
   <div class="chips">${LIB_FILTERS.map(([k, l]) => `<button class="fchip${f === k ? ' on' : ''}" data-act="lib-filter" data-k="${k}">${l}</button>`).join('')}</div>
   <div id="libList"></div></div>`;
  renderLibList();
}
function renderLibList() {
  const f = D.ui.libFilter || 'all', q = (D.ui.libQ || '').toLowerCase().trim();
  const list = D.library.filter(a => (f === 'all' || a.type === f) && (!q || (a.title + ' ' + a.content).toLowerCase().includes(q)));
  $('#libList').innerHTML = list.length ? list.map(a => `<button class="art" data-act="open-art" data-id="${a.id}"><span class="glyph" style="background:${colorFor(a.type + a.title)}">${esc(a.type === 'code' ? (a.lang || 'cd').slice(0, 2).toUpperCase() : a.type.slice(0, 2).toUpperCase())}</span><span class="body"><b>${esc(a.title)}</b><small>${esc(a.type === 'code' ? (a.lang || 'code') : a.type)} · ${agoLong(a.ts)} · ${esc(plain(a.content).slice(0, 70))}</small></span>${ic('chev', 'sm')}</button>`).join('')
    : `<div class="empty"><b>${q || f !== 'all' ? 'Nothing matches' : 'Your Library is empty'}</b>${q || f !== 'all' ? 'Try another search.' : 'Code I write in chat lands here automatically. You can also save any message or feed item.'}</div>`;
}
function addArtifact(a) { const x = { id: uid('a'), ts: Date.now(), ...a }; D.library.unshift(x); save(); return x; }
function openArtifact(id) {
  const a = D.library.find(x => x.id === id); if (!a) return toast('That item was deleted');
  const isHtml = a.type === 'code' && (/^(html|htm)$/.test(a.lang) || /^\s*(<!doctype html|<html)/i.test(a.content));
  const ext = { javascript: 'js', js: 'js', python: 'py', py: 'py', html: 'html', htm: 'html', css: 'css', json: 'json', typescript: 'ts', ts: 'ts', bash: 'sh', sh: 'sh', md: 'md', markdown: 'md' }[a.lang] || (a.type === 'code' ? 'txt' : 'md');
  openSheet(`<h3>${esc(a.title)}</h3><p class="sub">${esc(a.type === 'code' ? a.lang || 'code' : a.type)} · ${agoLong(a.ts)}</p>
   <div id="artView">${a.type === 'code' ? `<pre class="art-pre">${esc(a.content)}</pre>` : `<div class="card prose" style="max-height:50dvh;overflow:auto">${md(a.content)}</div>`}</div>
   <div class="row-acts">${isHtml ? `<button class="btn primary sm" data-x="prev">${ic('play', 'sm')}Preview</button>` : ''}<button class="btn sm" data-x="copy">${ic('copy', 'sm')}Copy</button><button class="btn sm" data-x="dl">${ic('download', 'sm')}Download</button><button class="btn sm" data-x="discuss">${ic('chat', 'sm')}Discuss</button><button class="btn danger sm" data-x="del">${ic('trash', 'sm')}Delete</button></div>`, b => {
    b.onclick = e => {
      const x = e.target.closest('[data-x]')?.dataset.x; if (!x) return;
      if (x === 'prev') { $('#artView', b).innerHTML = `<iframe class="preview-frame" sandbox="allow-scripts allow-forms allow-modals" title="Preview"></iframe>`; $('#artView iframe', b).srcdoc = a.content; }
      if (x === 'copy') copyText(a.content);
      if (x === 'dl') download((a.title.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'artifact') + '.' + ext, a.content);
      if (x === 'discuss') { closeSheet(); discuss(a.title, '', `Let's work on "${a.title}" from my Library:\n\n\`\`\`${a.lang || ''}\n${a.content.slice(0, 6000)}\n\`\`\`\n\nWhat would you improve?`); }
      if (x === 'del') { D.library = D.library.filter(y => y.id !== id); save(); closeSheet(); if (D.ui.route === 'library') renderLibList(); if (D.ui.route === 'chat') renderChat(); }
    };
  });
}
function noteForm() {
  openSheet(`<h3>New note</h3><label class="fld"><span>Title</span><input class="in" id="nT"></label><label class="fld"><span>Note (markdown ok)</span><textarea class="in" id="nB" style="min-height:160px"></textarea></label><div class="row-acts"><button class="btn primary" id="nOk">Save to Library</button></div>`, b => {
    $('#nT', b).focus();
    $('#nOk', b).onclick = () => { const t = $('#nT', b).value.trim() || 'Untitled note'; const c = $('#nB', b).value.trim(); if (!c) return toast('Write something first'); addArtifact({ type: 'note', title: t, content: c }); closeSheet(); if (D.ui.route === 'library') renderLibList(); toast('Saved to Library'); };
  });
}

/* ---------- Spaces ---------- */
function spacePreview(sp) {
  const t = spaceThread(sp.id); const ms = t.messages.filter(m => m.content && !m.error).slice(-3);
  return ms.length ? ms.map(m => `<div class="pb${m.role === 'user' ? ' u' : ''}">${esc(plain(splitChoices(m.display || m.content).text).slice(0, 160))}</div>`).join('') : `<div class="pb">${esc(sp.desc || 'Empty space')}</div>`;
}
function renderSpaces() {
  const list = [...D.spaces].sort((a, b) => (b.updated || 0) - (a.updated || 0)); const rec = list[0];
  $('#pSpaces').innerHTML = `<div class="inner">
   <div class="ph"><h1>Spaces ${ic('down', 'sm')}</h1><button class="round" data-act="spaces-menu" aria-label="Spaces options">${ic('dots')}</button><button class="round accent" data-act="create-space" aria-label="Create a space">${ic('plus')}</button></div>
   ${rec ? `<div class="h2" style="margin-top:6px">Recent</div><button class="sp-recent" data-act="open-space" data-id="${rec.id}"><div class="sp-prev">${spacePreview(rec)}</div><div class="sp-meta"><span class="sp-big" style="background:${colorFor(rec.name)}">${esc(initials(rec.name))}</span><div><b>${esc(rec.name)}</b><small>Space · ${agoLong(rec.updated || rec.created)}</small></div></div></button>` : ''}
   <div class="h2">All spaces</div>
   <div class="sp-grid">${list.map(sp => `<button class="sp-tile" data-act="open-space" data-id="${sp.id}"><div class="sp-prev">${spacePreview(sp)}</div><div class="sp-meta"><span class="sp-big" style="background:${colorFor(sp.name)}">${esc(initials(sp.name))}</span><div><b>${esc(sp.name)}</b><small>${agoLong(sp.updated || sp.created)}</small></div></div></button>`).join('')}<button class="sp-tile create" data-act="create-space">${ic('square-plus', 'lg')}Create a space</button></div>
  </div>`;
}
function spaceForm(sp) {
  openSheet(`<h3>${sp ? 'Edit space' : 'Create a space'}</h3><p class="sub">A space is a room for one project, with its own chat.</p><label class="fld"><span>Name</span><input class="in" id="sN" value="${esc(sp?.name || '')}" placeholder="e.g. Model training"></label><label class="fld"><span>What is it for?</span><textarea class="in" id="sD" placeholder="Optional. I'll use this as context in the space's chat.">${esc(sp?.desc || '')}</textarea></label><div class="row-acts"><button class="btn primary" id="sOk">${sp ? 'Save' : 'Create'}</button>${sp ? '<button class="btn danger" id="sDel">Delete space</button>' : ''}</div>`, b => {
    $('#sN', b).focus();
    $('#sOk', b).onclick = () => {
      const name = $('#sN', b).value.trim(); if (!name) return toast('Name the space');
      if (sp) { sp.name = name; sp.desc = $('#sD', b).value.trim(); const t = spaceThread(sp.id); t.title = name; save(); closeSheet(); go(D.ui.route); return; }
      const n = { id: uid('sp'), name, desc: $('#sD', b).value.trim(), created: Date.now(), updated: Date.now() }; D.spaces.push(n);
      const t = spaceThread(n.id); t.messages.push({ id: uid('m'), role: 'assistant', ts: Date.now(), content: `Welcome to **${name}**. ${n.desc ? 'Got it: ' + n.desc + ' ' : ''}What should we do first?`, choices: ['Make a plan', 'Brainstorm ideas', 'Draft a task list'] });
      D.activity.done.unshift({ label: 'Created space: ' + name, ok: true, ts: Date.now() }); save(true); closeSheet(); openThread(t.id);
    };
    const del = $('#sDel', b); if (del) del.onclick = () => { closeSheet(); setTimeout(() => confirmSheet('Delete ' + sp.name + '?', 'This removes the space and its chat from this device.', 'Delete', () => { D.spaces = D.spaces.filter(s => s.id !== sp.id); D.threads = D.threads.filter(t => !(t.kind === 'space' && t.spaceId === sp.id)); if (thread().id !== D.ui.thread) D.ui.thread = 'main'; if (!D.threads.find(t => t.id === D.ui.thread)) D.ui.thread = 'main'; save(true); go(D.ui.route); }), 60); };
  });
}

/* ---------- Settings ---------- */
function applyAppearance() {
  const s = S(), h = document.documentElement;
  h.dataset.accent = s.accent || 'magenta'; h.style.setProperty('--fs', s.fontScale || 1);
  h.classList.toggle('grid', !!s.grid); h.classList.toggle('reduce', !!s.reduceMotion);
}
const sw = (k, on) => `<button class="switch${on ? ' on' : ''}" role="switch" aria-checked="${!!on}" data-act="set-toggle" data-k="${k}" aria-label="${k}"></button>`;
function renderSettings(opts = {}) {
  const s = S(), ep = endpoint(), M = Avatar.manifest;
  const states = Object.keys(M.states || {});
  $('#pSettings').innerHTML = `<div class="inner">
   <div class="ph"><h1>Settings</h1></div>
   <div class="set-h">Engine</div>
   <div class="set-group" style="padding:14px 16px">
    <div class="seg" role="tablist"><button class="${s.provider !== 'custom' ? 'on' : ''}" data-act="set-prov" data-v="free">Free Live AI</button><button class="${s.provider === 'custom' ? 'on' : ''}" data-act="set-prov" data-v="custom">Your own API</button></div>
    <p class="note" style="margin:10px 2px 0">${s.provider === 'custom' ? 'Any OpenAI-compatible endpoint. Your key stays in this browser and is only sent to that endpoint.' : 'No key needed. Streams from the free Pollinations service (openai-fast). Shared and sometimes rate limited.'}</p>
    ${s.provider === 'custom' ? `
     <label class="fld"><span>Preset</span><select class="in" id="sPreset"><option value="">Choose a preset…</option>${Object.entries(PRESETS).map(([k, v]) => `<option value="${k}"${s.preset === k ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
     <label class="fld"><span>Base URL</span><input class="in" id="sUrl" value="${esc(s.baseUrl)}" placeholder="https://api.x.ai/v1" inputmode="url" autocapitalize="off" spellcheck="false"></label>
     <label class="fld"><span>Model</span><input class="in" id="sModel" value="${esc(s.model)}" placeholder="grok-3-mini" autocapitalize="off" spellcheck="false"></label>
     <label class="fld"><span>API key</span><input class="in" id="sKey" type="password" value="${esc(s.apiKey)}" placeholder="Paste your key" autocomplete="off"></label>
     <p class="note" id="presetNote">${s.preset && PRESETS[s.preset]?.note ? esc(PRESETS[s.preset].note) : ''}</p>` : ''}
    <div class="row-acts"><button class="btn sm" data-act="set-test">${ic('play', 'sm')}Test connection</button><span class="note" id="testOut" style="align-self:center"></span></div>
   </div>
   <div class="set-group">
    <div class="set-row"><div class="lbl"><b>Reply style</b><small>Fast answers directly. Think reasons first.</small></div><div class="seg" style="width:150px"><button class="${s.mode !== 'think' ? 'on' : ''}" data-act="set-mode" data-v="fast">Fast</button><button class="${s.mode === 'think' ? 'on' : ''}" data-act="set-mode" data-v="think">Think</button></div></div>
    <div class="set-row"><div class="lbl"><b>Reply timeout</b><small>Seconds before showing Retry</small></div><input class="in" id="sTimeout" type="number" min="10" max="300" value="${s.timeout}" style="width:90px"></div>
    <div class="set-row"><div class="lbl"><b>Your name</b><small>Optional. Used to personalise replies.</small></div><input class="in" id="sName" value="${esc(s.name)}" placeholder="Optional" style="width:150px"></div>
   </div>

   <div class="set-h" id="setAvatar">Avatar</div>
   <div class="set-group" style="padding:14px 16px">
    <label class="fld" style="margin-top:0"><span>Assistant name</span><input class="in" id="sAvName" value="${esc(s.avatarName)}" maxlength="24"></label>
    <div class="fld" style="margin-bottom:4px"><span>Preview a state</span></div>
    <div class="av-states">${states.map(k => `<button data-act="av-preview" data-k="${k}" class="${Avatar.state === k ? 'on' : ''}"><span class="av-thumb"><img src="${esc(Avatar.thumb(k))}" alt=""></span>${esc(k)}<span class="src">${Avatar.mode === '3d' ? 'clip' : 'poster'}</span></button>`).join('')}</div>
    <p class="note">${Avatar.mode === '3d' ? `Live 3D model (<code>${esc(Avatar.manifest.model || '')}</code>), ${Avatar.info ? Avatar.info.clips.length : 0} animation clips blended by an animation controller.` : `3D model unavailable${Avatar.error ? ' (' + esc(Avatar.error) + ')' : ''}, showing still poses.`} Model, clip names and framing are set in <code>avatar/manifest.json</code>.</p>
    <div class="set-row" style="border-bottom:0"><div class="lbl"><b>Show live task under the avatar</b><small>e.g. "Writing reply", "Generating feed"</small></div>${sw('showTasks', s.showTasks !== false)}</div>
    <div class="row-acts" style="margin-top:4px"><button class="btn sm" data-act="av-reload">${ic('refresh', 'sm')}Reload model</button><button class="btn sm" data-act="av-status">Open status sheet</button></div>
   </div>

   <div class="set-h">Appearance</div>
   <div class="set-group">
    <div class="set-row"><div class="lbl"><b>Accent</b></div><div class="swatches">${[['magenta', '#e041ff'], ['violet', '#a855f7'], ['cyan', '#2fd3ff'], ['green', '#3dffa2']].map(([k, c]) => `<button class="swatch${(s.accent || 'magenta') === k ? ' on' : ''}" style="background:${c}" data-act="set-accent" data-v="${k}" aria-label="${k}"></button>`).join('')}</div></div>
    <div class="set-row"><div class="lbl"><b>Text size</b></div><div class="seg" style="width:160px">${[[0.92, 'S'], [1, 'M'], [1.1, 'L']].map(([v, l]) => `<button class="${+s.fontScale === v ? 'on' : ''}" data-act="set-font" data-v="${v}">${l}</button>`).join('')}</div></div>
    <div class="set-row"><div class="lbl"><b>Grid background</b></div>${sw('grid', s.grid)}</div>
    <div class="set-row"><div class="lbl"><b>Reduce motion</b><small>Holds the avatar still and stops transitions</small></div>${sw('reduceMotion', s.reduceMotion)}</div>
   </div>

   <div class="set-h">Voice</div>
   <div class="set-group">
    <div class="set-row"><div class="lbl"><b>Read replies aloud</b><small>Uses your browser's built-in voice</small></div>${sw('voiceReply', s.voiceReply)}</div>
   </div>

   <div class="set-h">Data</div>
   <div class="set-group" style="padding:14px 16px">
    <p class="note" style="margin-top:0">Everything lives in this browser only: ${D.threads.length} chats, ${D.goals.length} goals, ${D.ideas.length} ideas, ${D.library.length} Library items, ${D.feed.editions.length} feed editions.</p>
    <div class="row-acts"><button class="btn sm" data-act="data-export">${ic('download', 'sm')}Export backup</button><button class="btn sm" data-act="data-import">${ic('upload', 'sm')}Import backup</button><button class="btn danger sm" data-act="data-reset">${ic('trash', 'sm')}Reset</button></div>
    <input type="file" id="importIn" accept="application/json,.json" hidden>
   </div>
   <p class="note" style="text-align:center;margin:24px 0 0">BlackNode Assistant · v2 · ${esc(ep.label)}</p>
  </div>`;
  if (opts.anchor === 'avatar') setTimeout(() => $('#setAvatar')?.scrollIntoView({ block: 'start' }), 30);
}
function bindSettingsInputs(e) {
  const t = e.target, s = S();
  const map = { sUrl: 'baseUrl', sModel: 'model', sKey: 'apiKey', sName: 'name', sAvName: 'avatarName' };
  if (map[t.id]) { s[map[t.id]] = t.value.trim(); save(); if (t.id === 'sAvName') { Avatar.applyName(); renderNav(); } }
  if (t.id === 'sTimeout') { s.timeout = clamp(+t.value || 60, 10, 300); save(); }
  if (t.id === 'sPreset' && e.type === 'change') { const p = PRESETS[t.value]; s.preset = t.value; if (p) { s.baseUrl = p.url; s.model = p.model; } save(); renderSettings(); }
}
async function testEngine() {
  const out = $('#testOut'); out.textContent = 'Testing…'; Activity.start('Testing the engine', 'thinking', 'Settings');
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort('timeout'), 30000);
  try { const r = await aiStream({ messages: [{ role: 'user', content: 'Reply with exactly: BlackNode online.' }], signal: ctrl.signal, effort: 'low', maxParts: 1 }); out.textContent = '✓ ' + (r.text.slice(0, 60) || 'Connected') + (r.model ? ' · ' + r.model : ''); Activity.end('Engine test passed', true); }
  catch (e) { out.textContent = '✗ ' + friendlyError(e, ctrl.signal); Activity.end('Engine test failed', false); }
  finally { clearTimeout(tm); }
}
function exportData() { const copy = JSON.parse(JSON.stringify(D)); if (copy.settings) copy.settings.apiKey = ''; download(`blacknode-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(copy, null, 1), 'application/json'); toast('Backup downloaded (API key left out)'); }
function importData(file) {
  const r = new FileReader(); r.onload = () => { try { const d = JSON.parse(r.result); if (!d || d.v !== 2 || !Array.isArray(d.threads)) throw 0; const key = S().apiKey; D = d; D.settings = { ...DEFAULT_SETTINGS, ...d.settings, apiKey: d.settings?.apiKey || key }; save(true); applyAppearance(); Avatar.applyName(); toast('Backup restored'); go('settings'); } catch (e) { toast('That file is not a BlackNode backup'); } }; r.readAsText(file);
}

/* ---------- Events ---------- */
function report() {
  const diag = `BlackNode Assistant v2 · ${navigator.userAgent.replace(/\s+/g, ' ').slice(0, 140)} · ${innerWidth}x${innerHeight} · engine ${endpoint().label}`;
  openSheet(`<h3>Report an issue</h3><p class="sub">Describe what went wrong. It's saved as a note in your Library with device details, so you can copy or share it.</p><textarea class="in" id="rB" style="min-height:140px" placeholder="What happened?"></textarea><p class="note">${esc(diag)}</p><div class="row-acts"><button class="btn primary" id="rOk">Save report</button><button class="btn" id="rCp">Copy</button></div>`, b => {
    const txt = () => `${$('#rB', b).value.trim()}\n\n---\n${diag}`;
    $('#rOk', b).onclick = () => { if (!$('#rB', b).value.trim()) return toast('Describe the issue first'); addArtifact({ type: 'note', title: 'Issue report · ' + new Date().toLocaleDateString(), content: txt() }); closeSheet(); toast('Saved to Library'); };
    $('#rCp', b).onclick = () => copyText(txt());
  });
}
function msgMore(i) {
  const t = thread(), m = t.messages[i]; if (!m) return;
  openSheet(`<h3>Message</h3>
   <button class="drow" data-x="copy">${ic('copy')}<span class="lbl">Copy text</span></button>
   <button class="drow" data-x="speak">${ic('speaker')}<span class="lbl">Read aloud</span></button>
   <button class="drow" data-x="save">${ic('bookmark')}<span class="lbl">Save to Library</span></button>
   <button class="drow" data-x="side">${ic('bubbles')}<span class="lbl">Continue in a side chat</span></button>
   <button class="drow" data-x="del">${ic('trash')}<span class="lbl">Delete message</span></button>`, b => {
    b.onclick = e => {
      const x = e.target.closest('[data-x]')?.dataset.x; if (!x) return; closeSheet();
      const txt = splitChoices(m.content).text;
      if (x === 'copy') copyText(txt);
      if (x === 'speak') speak(txt);
      if (x === 'save') saveMsg(m);
      if (x === 'side') discuss(plain(txt).slice(0, 40) || 'Side chat', '', `Following up on this:\n\n${txt.slice(0, 4000)}`);
      if (x === 'del') { t.messages.splice(i, 1); save(); renderChat(); }
    };
  });
}
function saveMsg(m) { const txt = splitChoices(m.content).text; addArtifact({ type: 'chat', title: plain(txt).split('\n')[0].slice(0, 60) || 'Saved message', content: txt }); toast('Saved to Library'); }
function onClick(e) {
  const g = e.target.closest('[data-go]');
  if (g) { e.preventDefault(); const r = g.dataset.go; const b = $(`.tab[data-go="${r}"] .badge`); if (b) b.remove(); go(r, { anchor: g.dataset.anchor }); return; }
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act, t = thread();
  const idxEl = a.closest('[data-idx]'); const idx = idxEl ? +idxEl.dataset.idx : -1;
  switch (act) {
    case 'drawer': openDrawer(); break;
    case 'tab-menu': tabMenu(a.dataset.tab); break;
    case 'open-sides': openSides(); break;
    case 'toggle-sides': sidesCollapsed = !sidesCollapsed; renderSides(); break;
    case 'sides-menu': closeSides(); openSheet(`<h3>Chats</h3><button class="drow" data-x="new">${ic('compose')}<span class="lbl">New side chat</span></button><button class="drow" data-x="md">${ic('download')}<span class="lbl">Export this chat (.md)</span></button><button class="drow" data-x="clear">${ic('trash')}<span class="lbl">Clear this chat</span></button>`, b => { b.onclick = ev => { const x = ev.target.closest('[data-x]')?.dataset.x; if (!x) return; closeSheet(); const th = thread(); if (x === 'new') newSide(); if (x === 'md') download((th.title.replace(/[^\w-]+/g, '-') || 'chat') + '.md', `# ${th.title}\n\n` + th.messages.map(m => `**${m.role === 'user' ? 'You' : (S().avatarName || 'BlackNode')}:**\n\n${splitChoices(m.display ?? m.content).text}`).join('\n\n---\n\n'), 'text/markdown'); if (x === 'clear') confirmSheet('Clear this chat?', 'All messages in "' + th.title + '" will be removed from this device.', 'Clear', () => { th.messages = []; save(true); renderChat(); }); }; }); break;
    case 'new-side': newSide(); setTimeout(() => $('#inp').focus(), 50); break;
    case 'open-thread': openThread(a.dataset.id); break;
    case 'open-space': openThread(spaceThread(a.dataset.id).id); break;
    case 'create-space': closeSheet(); setTimeout(() => spaceForm(), 60); break;
    case 'space-menu': { const sp = D.spaces.find(s => s.id === a.dataset.id); closeSheet(); setTimeout(() => spaceForm(sp), 60); break; }
    case 'spaces-menu': openSheet(`<h3>Spaces</h3><p class="sub">${D.spaces.length} space${D.spaces.length === 1 ? '' : 's'} on this device.</p>${D.spaces.map(sp => `<button class="drow" data-act="space-menu" data-id="${sp.id}"><span class="sp-ico" style="background:${colorFor(sp.name)}">${esc(initials(sp.name))}</span><span class="lbl">Edit ${esc(sp.name)}</span></button>`).join('')}`); break;
    case 'report': closeSheet(); setTimeout(report, 60); break;
    case 'choice': { const m = t.messages[idx]; if (!m || m.chosen != null || busy) break; const ch = m.choices || splitChoices(m.content).choices || []; m.chosen = +a.dataset.k; save(); updateMsg(idx); send(ch[m.chosen]); break; }
    case 'retry': retry(); break;
    case 'm-copy': copyText(splitChoices(t.messages[idx].content).text); break;
    case 'm-speak': speak(splitChoices(t.messages[idx].content).text); break;
    case 'm-save': saveMsg(t.messages[idx]); break;
    case 'm-more': msgMore(idx); break;
    case 'code-copy': { const k = +a.closest('.code').dataset.k; copyText(CODE[k].code); break; }
    case 'code-save': { const k = +a.closest('.code').dataset.k; addArtifact({ type: 'code', lang: CODE[k].lang || 'code', title: (CODE[k].lang || 'Code') + ' snippet', content: CODE[k].code }); toast('Saved to Library'); break; }
    case 'code-preview': { const k = +a.closest('.code').dataset.k; openSheet(`<h3>Preview</h3><iframe class="preview-frame" sandbox="allow-scripts allow-forms allow-modals" title="Preview"></iframe>`, b => { $('iframe', b).srcdoc = CODE[k].code; }); break; }
    case 'open-art': openArtifact(a.dataset.id); break;
    case 'unattach': attachments.splice(+a.dataset.i, 1); renderAttach(); break;
    case 'feed-edit': editFeedPrompt(); break;
    case 'feed-cancel': renderFeed(); break;
    case 'feed-savep': { const v = $('#feedTa').value.trim(); if (v) { D.feed.prompt = v; save(); } renderFeed(); toast('Feed prompt saved'); break; }
    case 'feed-gen': generateFeed(); break;
    case 'unit-love': { const { u } = findUnit(a); if (u) { u.loved = !u.loved; save(); renderFeed(); } break; }
    case 'unit-discuss': { const { u } = findUnit(a); if (u) discuss(u.title, u.summary); break; }
    case 'unit-save': { const { u } = findUnit(a); if (u) { addArtifact({ type: 'feed', title: u.title, content: `**${u.title}**\n\n${u.summary}` }); toast('Saved to Library'); } break; }
    case 'unit-menu': { const { ed, u } = findUnit(a); if (!u) break; openSheet(`<h3>${esc(u.title)}</h3><button class="drow" data-x="discuss">${ic('chat')}<span class="lbl">Discuss</span></button><button class="drow" data-x="save">${ic('bookmark')}<span class="lbl">Save to Library</span></button><button class="drow" data-x="hide">${ic('trash')}<span class="lbl">Remove from feed</span></button>`, b => { b.onclick = ev => { const x = ev.target.closest('[data-x]')?.dataset.x; if (!x) return; closeSheet(); if (x === 'discuss') discuss(u.title, u.summary); if (x === 'save') { addArtifact({ type: 'feed', title: u.title, content: `**${u.title}**\n\n${u.summary}` }); toast('Saved to Library'); } if (x === 'hide') { ed.units = ed.units.filter(y => y !== u); if (!ed.units.length) D.feed.editions = D.feed.editions.filter(y => y !== ed); save(); renderFeed(); } }; }); break; }
    case 'ideas-gen': generateIdeas(); break;
    case 'idea-add': ideaForm(); break;
    case 'idea-menu': ideaMenu(a.closest('[data-id]').dataset.id); break;
    case 'goal-new': goalForm(a.dataset.cat); break;
    case 'goal-toggle': toggleGoal(a.closest('[data-id]').dataset.id); break;
    case 'goal-menu': goalMenu(a.closest('[data-id]').dataset.id); break;
    case 'goals-menu': openSheet(`<h3>Goals</h3><button class="drow" data-x="new">${ic('plus')}<span class="lbl">Create a goal</span></button><button class="drow" data-x="clear">${ic('trash')}<span class="lbl">Clear completed goals</span></button>`, b => { b.onclick = ev => { const x = ev.target.closest('[data-x]')?.dataset.x; if (!x) return; closeSheet(); if (x === 'new') setTimeout(() => goalForm(), 60); if (x === 'clear') { D.goals = D.goals.filter(g => !g.done); save(); renderGoals(); } }; }); break;
    case 'note-new': noteForm(); break;
    case 'lib-filter': D.ui.libFilter = a.dataset.k; save(); renderLibrary(); break;
    case 'open-search': go('library'); setTimeout(() => $('#libQ')?.focus(), 50); break;
    case 'set-prov': S().provider = a.dataset.v; save(); renderSettings(); break;
    case 'set-mode': S().mode = a.dataset.v; save(); renderSettings(); break;
    case 'set-accent': S().accent = a.dataset.v; save(); applyAppearance(); renderSettings({ keepScroll: true }); break;
    case 'set-font': S().fontScale = +a.dataset.v; save(); applyAppearance(); renderSettings(); break;
    case 'set-toggle': { const k = a.dataset.k; S()[k] = !(k === 'showTasks' ? S()[k] !== false : S()[k]); save(); applyAppearance(); if (k === 'reduceMotion') Avatar.refreshMotion(); a.classList.toggle('on'); a.setAttribute('aria-checked', a.classList.contains('on')); if (k === 'showTasks') Avatar.setTask(Avatar.task); break; }
    case 'set-test': testEngine(); break;
    case 'av-preview': Avatar.preview(a.dataset.k); $$('.av-states button').forEach(x => x.classList.toggle('on', x === a)); break;
    case 'av-reload': Avatar.init().then(() => { renderSettings(); toast(Avatar.mode === '3d' ? 'Avatar model reloaded' : 'Avatar model unavailable, showing poster'); }); break;
    case 'av-status': openStatusSheet(); break;
    case 'data-export': exportData(); break;
    case 'data-import': $('#importIn').click(); break;
    case 'data-reset': confirmSheet('Reset everything?', 'All chats, goals, ideas, feed editions, Library items and settings on this device will be erased. Export a backup first if you want to keep them.', 'Erase all', () => { localStorage.removeItem(KEY); D = seed(); save(true); applyAppearance(); Avatar.applyName(); go('chat'); toast('Reset done'); }); break;
  }
}
function init() {
  applyAppearance();
  const h = (location.hash.match(/^#\/(\w+)/) || [])[1]; if (h && ROUTES.includes(h)) D.ui.route = h;
  if (!D.threads.find(t => t.id === D.ui.thread)) D.ui.thread = 'main';
  document.addEventListener('click', onClick);
  document.addEventListener('input', e => { if (e.target.closest('#pSettings')) bindSettingsInputs(e); });
  document.addEventListener('change', e => { if (e.target.closest('#pSettings')) bindSettingsInputs(e); if (e.target.id === 'importIn' && e.target.files[0]) importData(e.target.files[0]); });
  $('#sheetScrim').onclick = closeSheet; $('#sideScrim').onclick = closeSides;
  $('#chatSwitcher').onclick = openSides;
  $('#sideSearch').oninput = renderSides;
  $('#avBtn').onclick = openStatusSheet; $('#avPill').onclick = openStatusSheet;
  $('#avBtn').onkeydown = $('#avPill').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openStatusSheet(); } };
  $('#callBtn').onclick = () => Voice.toggleCall();
  $('#micBtn').onclick = () => Voice.rec ? Voice.stop() : Voice.listen(false);
  $('#attachBtn').onclick = () => $('#fileIn').click();
  $('#fileIn').onchange = async e => { for (const f of e.target.files) { if (f.size > 400000) { toast(f.name + ' is too big (400 KB max)'); continue; } attachments.push({ name: f.name, text: (await f.text()).slice(0, 60000) }); } e.target.value = ''; renderAttach(); };
  const inp = $('#inp');
  inp.addEventListener('input', () => { autosize(); renderSend(); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer:fine)').matches) { e.preventDefault(); send(); } });
  $('#composer').onsubmit = e => { e.preventDefault(); if (busy) stop(); else send(); };
  const sc = $('#chatScroll'); sc.addEventListener('scroll', () => { $('#jumpDown').hidden = sc.scrollTop > -240; }, { passive: true });
  $('#jumpDown').onclick = () => sc.scrollTo({ top: 0, behavior: 'smooth' });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeSheet(); closeSides(); } });
  window.addEventListener('hashchange', () => { const r = (location.hash.match(/^#\/(\w+)/) || [])[1]; if (r && r !== D.ui.route) go(r); });
  Avatar.init();
  go(D.ui.route);
  // test / automation hook (read-only status + state driver)
  window.BlackNode = { Avatar, Activity, send, go, get data() { return D; } };
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
