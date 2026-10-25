/* ==========================================================================
   LMS SEKOLAH — Aplikasi frontend (SPA) · versi 2.0.0
   Di-hosting di GitHub Pages, berkomunikasi dengan backend Google Apps Script
   (assets/js/config.js → API_URL) melalui fetch() JSON. Database: Google Sheets.
   ========================================================================== */
(function () {
'use strict';
window.__LMS_LOADED = true;
const APP_VERSION = '2.0.0';
const markReady = () => { window.__LMS_READY = true; };

/* ---------------------------------------------------------------- state */
const CFG = window.LMS_CONFIG || {};
const BOOT = (function () { try { return JSON.parse(localStorage.getItem('lms_settings') || '{}') || {}; } catch (e) { return {}; } })();
const DEMO = !!window.__LMS_DEMO__;
const HOST_THEME = document.documentElement.getAttribute('data-theme');
const S = {
  apiUrl: '', token: null, user: null, settings: Object.assign({ site_name: 'LMS Sekolah', school_name: '' }, BOOT),
  courses: [], categories: [], cache: new Map(), seq: 0, path: '', onLeave: null, keepScroll: false,
  editMode: false, course: null, mod: null, modSub: '', notifs: [], overlays: [], menu: null, tl: 'all',
  cal: null, calEvents: [], att: null, subFilter: 'all', adminSel: new Set()
};
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem('lms_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('lms_' + k, JSON.stringify(v)); } catch (e) { /* abaikan */ } },
  del(k) { try { localStorage.removeItem('lms_' + k); } catch (e) { /* abaikan */ } }
};
const debounce = (fn, ms) => { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); }; };
const plain = h => { if (!h) return ''; try { return (new DOMParser().parseFromString(String(h), 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim(); } catch (e) { return String(h).replace(/<[^>]*>/g, ' ').trim(); } };
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => matchMedia('(max-width: 899px)').matches;
let uidN = 0;
const uid = () => 'g' + (++uidN);
const ROLE = { admin: 'Administrator', teacher: 'Guru', student: 'Siswa' };
const LETTERS = 'ABCDEFGHIJ';

/* ---------------------------------------------------------------- dates */
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HR = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const pad = n => String(n).padStart(2, '0');
const fTime = t => { const d = new Date(t); return pad(d.getHours()) + '.' + pad(d.getMinutes()); };
const fDate = (t, wd) => { if (!t) return '—'; const d = new Date(t); return (wd ? HR[d.getDay()] + ', ' : '') + d.getDate() + ' ' + BLN[d.getMonth()] + ' ' + d.getFullYear(); };
const fDT = t => t ? fDate(t, true) + ', ' + fTime(t) : '—';
const fLong = t => { const d = new Date(t); return HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear(); };
function dur(ms) {
  ms = Math.abs(ms);
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d >= 1) return d + ' hari' + (h % 24 ? ' ' + (h % 24) + ' jam' : '');
  if (h >= 1) return h + ' jam' + (m % 60 ? ' ' + (m % 60) + ' menit' : '');
  if (m >= 1) return m + ' menit';
  return Math.max(1, Math.round(ms / 1000)) + ' detik';
}
const short2 = s => s.split(' ').slice(0, 2).join(' ');
function rel(t) {
  if (!t) return '—';
  const diff = Date.now() - t;
  if (Math.abs(diff) < 45000) return 'baru saja';
  if (diff > 0) {
    if (diff < 864e5) return short2(dur(diff)) + ' lalu';
    if (diff < 2 * 864e5) return 'kemarin, ' + fTime(t);
    if (diff < 7 * 864e5) return Math.floor(diff / 864e5) + ' hari lalu';
    return fDate(t);
  }
  return 'dalam ' + short2(dur(-diff));
}
const dayKey = t => { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
function dayLabel(t) {
  const k = dayKey(t);
  if (k === dayKey(Date.now())) return 'Hari ini';
  if (k === dayKey(Date.now() + 864e5)) return 'Besok';
  if (k === dayKey(Date.now() - 864e5)) return 'Kemarin';
  return fLong(t);
}
const toInput = t => { if (!t) return ''; const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const fromInput = s => { if (!s) return 0; const t = new Date(s).getTime(); return isNaN(t) ? 0 : t; };
const toDateInput = t => t ? toInput(t).slice(0, 10) : '';
const fromDateInput = s => { if (!s) return 0; const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).getTime(); };
const fSize = b => { b = +b || 0; if (b < 1024) return b + ' B'; if (b < 1048576) return Math.round(b / 1024) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; };
const fNum = n => (Math.round((+n || 0) * 100) / 100).toLocaleString('id-ID');

/* ---------------------------------------------------------------- icons */
const ICONS = {
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="2.2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2.2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2.2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2.2"/>',
  book: '<path d="M2 4.5h6a4 4 0 0 1 4 4V21a3 3 0 0 0-3-3H2z"/><path d="M22 4.5h-6a4 4 0 0 0-4 4V21a3 3 0 0 1 3-3h7z"/>',
  layers: '<path d="m12 2.5 10 5-10 5-10-5z"/><path d="m2 16.5 10 5 10-5M2 12l10 5 10-5"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="17" rx="3.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  chart: '<path d="M3 21h18"/><rect x="5" y="11" width="3.6" height="7" rx="1.2"/><rect x="10.2" y="5" width="3.6" height="13" rx="1.2"/><rect x="15.4" y="13.5" width="3.6" height="4.5" rx="1.2"/>',
  shield: '<path d="M12 22s8-3.6 8-10V5.2L12 2 4 5.2V12c0 6.4 8 10 8 10z"/><path d="m8.8 12 2.2 2.2 4.4-4.4"/>',
  user: '<circle cx="12" cy="8" r="4.2"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3.6"/><path d="M2.5 20.5a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.6 3.6 0 0 1 0 7M18.2 14.6a6.5 6.5 0 0 1 3.3 5.9"/>',
  userplus: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/>',
  bell: '<path d="M6 8.5a6 6 0 1 1 12 0c0 6.8 3 8.5 3 8.5H3s3-1.7 3-8.5"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M16.9 3.1a2.7 2.7 0 0 1 3.9 3.9L7.5 20.3 2.5 21.5l1.2-5z"/>',
  trash: '<path d="M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6M18.5 6l-.9 13.1a2 2 0 0 1-2 1.9H8.4a2 2 0 0 1-2-1.9L5.5 6"/><path d="M10 11v6M14 11v6"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="m3 3 18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.7 17.7 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkc: '<circle cx="12" cy="12" r="9.5"/><path d="m8 12.2 2.8 2.8L16 9.6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  xc: '<circle cx="12" cy="12" r="9.5"/><path d="m15 9-6 6M9 9l6 6"/>',
  left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>', down: '<path d="m6 9 6 6 6-6"/>', up: '<path d="m18 15-6-6-6 6"/>',
  doc: '<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 2.5V8h5.5M8.5 13h7M8.5 17h5"/>',
  link: '<path d="M10 13.5a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7.1l-1.7 1.7"/><path d="M14 10.5a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7.1l1.7-1.7"/>',
  clip: '<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
  assign: '<rect x="8" y="2.5" width="8" height="4" rx="1.2"/><path d="M16 4.5h2a2 2 0 0 1 2 2V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4.5"/>',
  quiz: '<path d="M10.5 6h10M10.5 12h10M10.5 18h10"/><path d="m3.5 6 1.5 1.5L8 4.5M3.5 12l1.5 1.5L8 10.5"/><circle cx="5.5" cy="18" r="1.6"/>',
  forum: '<path d="M21 14.5a2 2 0 0 1-2 2H8l-4.5 4V5.5a2 2 0 0 1 2-2H19a2 2 0 0 1 2 2z"/><path d="M8 8.5h8.5M8 12.5h5"/>',
  type: '<path d="M4 7V4.5h16V7M9 20h6M12 4.5V20"/>',
  logout: '<path d="M9 21H5.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2H9"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  upload: '<path d="M21 15v3.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5V15"/><path d="m17 8-5-5-5 5M12 3v12.5"/>',
  download: '<path d="M21 15v3.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5V15"/><path d="m7 10.5 5 5 5-5M12 15.5V3"/>',
  clock: '<circle cx="12" cy="12" r="9.5"/><path d="M12 6.5V12l3.5 2"/>',
  megaphone: '<path d="M3 10.5v3a1.5 1.5 0 0 0 1.5 1.5H7l6.5 4.5v-15L7 9H4.5A1.5 1.5 0 0 0 3 10.5z"/><path d="M17 8.5a5 5 0 0 1 0 7M19.6 6a8.5 8.5 0 0 1 0 12"/>',
  more: '<circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
  arrowup: '<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>', arrowdown: '<path d="M12 5v14M18.5 12.5 12 19l-6.5-6.5"/>',
  lock: '<rect x="4" y="10.5" width="16" height="11" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 5.8l3 3M14.5 8.3l2 2"/>',
  folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.7l2 2.5h7.3A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z"/>',
  list: '<path d="M8.5 6h12M8.5 12h12M8.5 18h12"/><circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none"/>',
  olist: '<path d="M10 6h11M10 12h11M10 18h11"/><path d="M4 4.5h1.5V9M3.8 9h3.2M3.6 13.6a1.6 1.6 0 1 1 2.4 1.5L3.6 17.5H7"/>',
  copy: '<rect x="8.5" y="8.5" width="12.5" height="12.5" rx="2.5"/><path d="M5.5 15.5H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8.5a2 2 0 0 1 2 2v.5"/>',
  reply: '<path d="M9.5 16.5 4.5 11.5l5-5"/><path d="M20 19v-1.5a6 6 0 0 0-6-6H4.5"/>',
  send: '<path d="M21.5 2.5 14.8 21l-3.9-8.4L2.5 8.8z"/><path d="M21.5 2.5 10.9 12.6"/>',
  flag: '<path d="M4.5 21.5V4a1 1 0 0 1 1-1h12.5l-2.5 4.8 2.5 4.7H5.5"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15.5-5-5L5 21"/>',
  video: '<rect x="2.5" y="5.5" width="14" height="13" rx="3"/><path d="m16.5 10.5 5-3v9l-5-3"/>',
  quote: '<path d="M7 7h4v4.5c0 3-2 5-4.5 6M15 7h4v4.5c0 3-2 5-4.5 6"/>',
  heading: '<path d="M6 4v16M18 4v16M6 12h12"/>',
  eraser: '<path d="m7 21-4.3-4.3a1.5 1.5 0 0 1 0-2.1L13.4 3.9a1.5 1.5 0 0 1 2.1 0l5.6 5.6a1.5 1.5 0 0 1 0 2.1L11.4 21z"/><path d="M21 21H7M7.5 10.5l6 6"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  award: '<circle cx="12" cy="8.5" r="6"/><path d="M8.2 13.8 7 22l5-2.8 5 2.8-1.2-8.2"/>',
  inbox: '<path d="M22 12.5h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12.5V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.5l-3.5-7.4A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z"/>',
  grad: '<path d="M22 9.5 12 4.5 2 9.5l10 5z"/><path d="M6 11.5V16c0 1.6 2.7 3.5 6 3.5s6-1.9 6-3.5v-4.5M22 9.5V15"/>',
  external: '<path d="M14 3h7v7M10 14 21 3M18 13.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5.5"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4.5M12 17.2h.01"/>',
  info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 16.5V11.5M12 7.8h.01"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  globe: '<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5a14.5 14.5 0 0 1 0 19 14.5 14.5 0 0 1 0-19z"/>',
  table: '<rect x="3" y="3.5" width="18" height="17" rx="2.5"/><path d="M3 9h18M3 14.5h18M9 3.5v17"/>',
  sparkle: '<path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5zM19 15.5c.3 1.9 1 2.6 2.5 3-1.5.4-2.2 1.1-2.5 3-.3-1.9-1-2.6-2.5-3 1.5-.4 2.2-1.1 2.5-3z"/>',
  palette: '<path d="M12 21.5a9.5 9.5 0 1 1 9.5-9.5c0 2.8-2.2 4-4.5 4H15a2 2 0 0 0-1.4 3.4c.9 1 .2 2.1-1.6 2.1z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="7.5" r="1.2" fill="currentColor" stroke="none"/>'
};
const ic = (n, c) => '<svg class="ic ' + (c || '') + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>';
function buildSprite() {
  if ($('#lmsSprite')) return;
  const s = '<svg id="lmsSprite" width="0" height="0" style="position:absolute" aria-hidden="true">' +
    Object.keys(ICONS).map(k => '<symbol id="i-' + k + '" viewBox="0 0 24 24">' + ICONS[k] + '</symbol>').join('') + '</svg>';
  document.body.insertAdjacentHTML('afterbegin', s);
}

/* ---------------------------------------------------------------- domain meta */
const TYPES = {
  assign: { name: 'Tugas', icon: 'assign', p: 'assessment', group: 'act', desc: 'Siswa mengirim jawaban teks atau berkas untuk dinilai guru.' },
  quiz: { name: 'Kuis', icon: 'quiz', p: 'quiz', group: 'act', desc: 'Pilihan ganda, benar/salah, dan isian yang dinilai otomatis.' },
  forum: { name: 'Forum', icon: 'forum', p: 'communication', group: 'act', desc: 'Ruang diskusi tanya-jawab antara guru dan siswa.' },
  page: { name: 'Halaman', icon: 'doc', p: 'content', group: 'res', desc: 'Materi berupa teks, gambar, dan video yang ditulis langsung.' },
  file: { name: 'Berkas', icon: 'clip', p: 'content', group: 'res', desc: 'Unggah PDF, PowerPoint, Word, gambar, atau berkas lain.' },
  url: { name: 'Tautan URL', icon: 'link', p: 'content', group: 'res', desc: 'Tautan ke situs web, video YouTube, atau Google Drive.' },
  label: { name: 'Teks & Media', icon: 'type', p: 'interface', group: 'res', desc: 'Teks atau media yang tampil langsung di halaman kursus.' }
};
const QTYPES = [['mc', 'Pilihan Ganda'], ['multi', 'PG Kompleks'], ['tf', 'Benar/Salah'], ['short', 'Isian Singkat']];
const QTL = { mc: 'Pilihan ganda', multi: 'PG kompleks', tf: 'Benar/Salah', short: 'Isian singkat' };
const GM = { highest: 'Nilai tertinggi', average: 'Rata-rata', first: 'Percobaan pertama', last: 'Percobaan terakhir' };
const COVERS = [['#5ac8fa', '#007aff'], ['#ff9a62', '#ff3b6b'], ['#7d7aff', '#c044ff'], ['#30d158', '#00a39a'], ['#ffcc00', '#ff7a00'], ['#ff6b9d', '#c22d7a'], ['#64d2ff', '#5e5ce6'], ['#34c3a0', '#2f6fd6'], ['#f093fb', '#f5576c'], ['#0a84ff', '#30d1c8'], ['#ff8a5c', '#d6336c'], ['#8e8ef0', '#3f3fb5']];
const WALLS = { aurora: ['#7aa7ff', '#c18cff', '#ff9ec7'], sunset: ['#ff9a62', '#ff5f8f', '#ffd166'], ocean: ['#2ec5ff', '#3a7bff', '#6ef0d1'], forest: ['#3ccf91', '#7bd86b', '#1fb5a8'], graphite: ['#9aa3b8', '#c3c7d1', '#8f9bb5'] };
const WALL_NAMES = { aurora: 'Aurora', sunset: 'Senja', ocean: 'Samudra', forest: 'Hutan', graphite: 'Grafit' };
const USER_COLORS = ['#007AFF', '#5856D6', '#AF52DE', '#FF2D55', '#FF9500', '#34C759', '#30B0C7', '#FF3B30', '#5AC8FA', '#A2845E'];

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let s = seed || 7; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; }; }
function coverSVG(id, idx) {
  const c = COVERS[(+idx || 0) % COVERS.length], r = rng(hashStr(String(id))), g = uid(), style = hashStr(String(id) + '#') % 3;
  let sh = '';
  if (style === 0) {
    for (let i = 0; i < 7; i++) sh += `<circle cx="${(r() * 400) | 0}" cy="${(r() * 170) | 0}" r="${(18 + r() * 70) | 0}" fill="#fff" fill-opacity="${(.06 + r() * .14).toFixed(2)}"/>`;
  } else if (style === 1) {
    const cx = (290 + r() * 90) | 0, cy = (20 + r() * 120) | 0;
    for (let i = 1; i <= 7; i++) sh += `<circle cx="${cx}" cy="${cy}" r="${i * 26}" fill="none" stroke="#fff" stroke-opacity="${(.24 - i * .025).toFixed(3)}" stroke-width="11"/>`;
  } else {
    for (let i = 0; i < 9; i++) {
      const x = (r() * 420 - 20) | 0, y = (r() * 180 - 10) | 0, s = (18 + r() * 44) | 0;
      sh += `<path d="M${x} ${y + s}L${x + s / 2} ${y}L${x + s} ${y + s}Z" fill="#fff" fill-opacity="${(.07 + r() * .15).toFixed(2)}" transform="rotate(${(r() * 60 - 30) | 0} ${x} ${y})"/>`;
    }
  }
  return `<svg viewBox="0 0 400 170" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient><radialGradient id="${g}h" cx=".15" cy="0" r="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="400" height="170" fill="url(#${g})"/>${sh}<rect width="400" height="170" fill="url(#${g}h)"/></svg>`;
}
function initials(n) {
  const p = String(n || '?').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/);
  return ((p[0] || '?').charAt(0) + (p[1] ? p[1].charAt(0) : '')).toUpperCase();
}
const av = (u, cls) => { u = u || {}; return `<span class="av ${cls || ''}" style="--c:${esc(u.color || '#8e8e93')}" title="${esc(u.name || '')}">${esc(initials(u.name))}</span>`; };

/* ---------------------------------------------------------------- sanitizer */
const OK_TAGS = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'H1', 'H2', 'H3', 'H4', 'H5', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A', 'IMG', 'CODE', 'PRE', 'SPAN', 'DIV', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'HR', 'IFRAME', 'SUB', 'SUP', 'FIGURE', 'FIGCAPTION', 'MARK', 'SMALL']);
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'META', 'LINK', 'BASE', 'SVG', 'MATH', 'TEMPLATE', 'NOSCRIPT', 'TITLE', 'HEAD']);
const IFRAME_OK = /^https:\/\/(www\.youtube(-nocookie)?\.com\/embed\/|player\.vimeo\.com\/video\/|drive\.google\.com\/file\/d\/[\w-]+\/preview|docs\.google\.com\/)/i;
function sanitize(html) {
  if (!html) return '';
  let doc;
  try { doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html'); } catch (e) { return esc(html); }
  const root = doc.body.firstChild;
  if (!root) return '';
  (function walk(node) {
    Array.from(node.childNodes).forEach(ch => {
      if (ch.nodeType === 3) return;
      if (ch.nodeType !== 1) { ch.remove(); return; }
      const tag = ch.tagName;
      if (DROP_TAGS.has(tag)) { ch.remove(); return; }
      walk(ch);
      if (!OK_TAGS.has(tag)) { ch.replaceWith.apply(ch, Array.from(ch.childNodes)); return; }
      Array.from(ch.attributes).forEach(a => {
        const n = a.name.toLowerCase(), v = a.value.trim();
        let keep = false;
        if (n === 'href' && tag === 'A') keep = /^(https?:|mailto:|#)/i.test(v);
        else if (n === 'src' && tag === 'IMG') keep = /^(https?:|data:image\/)/i.test(v);
        else if (n === 'src' && tag === 'IFRAME') keep = IFRAME_OK.test(v);
        else if (['alt', 'title', 'width', 'height', 'colspan', 'rowspan'].indexOf(n) >= 0) keep = true;
        else if (n === 'style') {
          const m = v.match(/text-align\s*:\s*(left|right|center|justify)/i);
          if (m) { ch.setAttribute('style', 'text-align:' + m[1].toLowerCase()); return; }
        }
        if (!keep) ch.removeAttribute(a.name);
      });
      if (tag === 'A') { ch.setAttribute('target', '_blank'); ch.setAttribute('rel', 'noopener noreferrer'); }
      if (tag === 'IFRAME') { if (!ch.getAttribute('src')) { ch.remove(); return; } ch.setAttribute('allowfullscreen', ''); ch.setAttribute('loading', 'lazy'); }
      if (tag === 'IMG') ch.setAttribute('loading', 'lazy');
    });
  })(root);
  return root.innerHTML;
}

/* ---------------------------------------------------------------- server calls */
/* Alamat backend: assets/js/config.js (API_URL) → bila kosong, URL yang disimpan di browser ini. */
const API_RE = /^https:\/\/script\.google\.com\/(?:a\/macros\/[^/]+|macros)\/s\/[\w-]{20,}\/(?:exec|dev)$/;
function cleanApiUrl(u) { return String(u || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, ''); }
function resolveApi() {
  try {
    const q = new URLSearchParams(location.search).get('api');
    if (q && API_RE.test(cleanApiUrl(q))) LS.set('api_url', cleanApiUrl(q));
  } catch (e) { /* abaikan */ }
  return cleanApiUrl(CFG.API_URL) || cleanApiUrl(LS.get('api_url', ''));
}
function postJSON(url, body, ms) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), ms || 60000) : 0;
  return fetch(url, {
    method: 'POST', redirect: 'follow', credentials: 'omit',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined
  }).then(r => r.text(), e => {
    throw new Error(e && e.name === 'AbortError'
      ? 'Server terlalu lama merespons. Periksa koneksi lalu coba lagi.'
      : 'Tidak dapat terhubung ke server. Periksa koneksi internet; jika tetap gagal, pastikan deployment Apps Script diatur “Siapa saja”.');
  }).then(t => {
    let r;
    try { r = JSON.parse(t); }
    catch (e) {
      throw new Error(/<html|<!doctype/i.test(String(t))
        ? 'Server membalas halaman web, bukan data. Pastikan URL Apps Script berakhiran /exec dan aksesnya “Siapa saja”.'
        : 'Respons server tidak valid.');
    }
    if (r && r.ok) return r.data;
    const err = new Error((r && r.error) || 'Terjadi kesalahan.');
    if (/^AUTH:/.test(err.message)) { err.auth = true; err.message = err.message.replace(/^AUTH:\s*/, ''); }
    throw err;
  }).finally(() => clearTimeout(timer));
}
function call(action, payload) {
  if (!S.apiUrl) return Promise.reject(new Error('Server belum dihubungkan. Buka halaman Pasang untuk mengisi URL Apps Script.'));
  return postJSON(S.apiUrl, { action, token: S.token, payload: payload || {} });
}
async function api(action, payload, opt) {
  try { return await call(action, payload); }
  catch (e) {
    if (e.auth) { e.shown = true; handleAuthLost(e.message); }
    else if (!(opt && opt.silent)) { toast(e.message, 'error'); e.shown = true; }
    throw e;
  }
}
async function mutate(action, payload, opt) {
  const r = await api(action, payload, opt);
  S.cache.clear();
  return r;
}
async function swr(key, action, payload, render, skeleton) {
  const seq = ++S.seq, cached = S.cache.get(key);
  if (cached) render(cached, true, false);
  else if (skeleton) skeleton();
  try {
    const d = await api(action, payload, { silent: !!cached });
    if (seq !== S.seq) return;
    const changed = !cached || JSON.stringify(cached) !== JSON.stringify(d);
    S.cache.set(key, d);
    if (changed) render(d, false, !!cached);
  } catch (e) {
    if (seq === S.seq && !cached && !e.auth) renderError(e);
  }
}

/* ---------------------------------------------------------------- preferences */
function chromiumDesktop() { const ua = navigator.userAgent; return /(Chrome|Edg)\/\d+/.test(ua) && !/Mobile|Android|CriOS/i.test(ua); }
let PREF = Object.assign({ theme: 'auto', wall: 'aurora', reduce: false, motion: !matchMedia('(pointer: coarse)').matches, refract: chromiumDesktop() }, LS.get('pref', {}));
function applyPrefs() {
  const h = document.documentElement;
  const sysDark = HOST_THEME ? HOST_THEME === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = PREF.theme === 'dark' || (PREF.theme === 'auto' && sysDark);
  h.setAttribute('data-theme', dark ? 'dark' : 'light');
  h.setAttribute('data-wall', WALLS[PREF.wall] ? PREF.wall : 'aurora');
  h.classList.toggle('reduce', !!PREF.reduce);
  h.classList.toggle('motion', !!PREF.motion && !reduceMotion());
  h.classList.toggle('refract', !!PREF.refract && chromiumDesktop() && !PREF.reduce);
}
function setPref(k, v) { PREF[k] = v; LS.set('pref', PREF); applyPrefs(); lgRefresh(); }

/* ---------------------------------------------------------------- liquid glass refraction (Chromium) */
const LG = { cache: {}, n: 0, ro: null };
function lgMap(w, h, r, bezel) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data, hw = w / 2, hh = h / 2;
  r = Math.min(r, hw, hh);
  const sdf = (x, y) => { const qx = Math.abs(x - hw) - (hw - r), qy = Math.abs(y - hh) - (hh - r); return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + .5, py = y + .5, inside = -sdf(px, py), i = (y * w + x) * 4;
      let dx = 0, dy = 0;
      if (inside > 0 && inside < bezel) {
        const gx = sdf(px + .5, py) - sdf(px - .5, py), gy = sdf(px, py + .5) - sdf(px, py - .5), gl = Math.hypot(gx, gy) || 1;
        const t = 1 - inside / bezel, m = Math.pow(t, 2.2);
        dx = -gx / gl * m; dy = -gy / gl * m;
      }
      d[i] = Math.round(128 + dx * 127); d[i + 1] = Math.round(128 + dy * 127); d[i + 2] = 128; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}
function lgFilter(w, h, r, blur) {
  const key = w + 'x' + h + 'r' + r + 'b' + blur;
  if (LG.cache[key]) return LG.cache[key];
  const defs = $('#lgDefs');
  if (!defs) return null;
  const id = 'lgf' + (++LG.n), bezel = Math.max(6, Math.min(30, Math.min(w, h) * .42)), scale = Math.round(bezel * 1.9);
  const f = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  ['id', id, 'x', 0, 'y', 0, 'width', w, 'height', h, 'filterUnits', 'userSpaceOnUse', 'color-interpolation-filters', 'sRGB'].forEach((v, i, a) => { if (i % 2 === 0) f.setAttribute(v, a[i + 1]); });
  f.innerHTML = `<feGaussianBlur in="SourceGraphic" stdDeviation="${blur}" edgeMode="duplicate" result="b"/><feImage href="${lgMap(w, h, r, bezel)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="m"/><feDisplacementMap in="b" in2="m" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="d"/><feColorMatrix in="d" type="saturate" values="1.75"/>`;
  defs.appendChild(f);
  LG.cache[key] = id;
  return id;
}
function lgApply(el) {
  if (!el) return;
  const on = document.documentElement.classList.contains('refract');
  const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
  if (!on || !w || !h) { el.style.removeProperty('backdrop-filter'); el.style.removeProperty('-webkit-backdrop-filter'); el.classList.remove('lq-on'); return; }
  const r = Math.round(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0);
  const id = lgFilter(w, h, Math.min(r, w / 2, h / 2), +el.dataset.lgb || 6);
  if (!id) return;
  el.style.setProperty('backdrop-filter', 'url(#' + id + ')');
  el.classList.add('lq-on');
  el._lgSize = w + 'x' + h;
}
function lgRefresh() {
  const els = $$('.lg-el');
  if (!LG.ro && window.ResizeObserver) LG.ro = new ResizeObserver(en => en.forEach(e => {
    const el = e.target;
    if (el.classList.contains('lq-on') && (Math.round(el.offsetWidth) + 'x' + Math.round(el.offsetHeight)) === el._lgSize) return;
    el.style.removeProperty('backdrop-filter'); el.classList.remove('lq-on');
    clearTimeout(el._lgT); el._lgT = setTimeout(() => lgApply(el), 180);
  }));
  els.forEach(el => { lgApply(el); if (LG.ro && !el._lgObs) { LG.ro.observe(el); el._lgObs = true; } });
}
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (PREF.theme === 'auto') applyPrefs(); }); } catch (e) { /* lama */ }

/* ---------------------------------------------------------------- UI: toast, sheet, alert, menu */
function toast(msg, type) {
  type = type || 'ok';
  const host = $('#toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="tic">${ic(type === 'error' ? 'x' : type === 'info' ? 'info' : 'check')}</span><span>${esc(msg)}</span>`;
  host.appendChild(el);
  while (host.children.length > 3) host.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 420); }, type === 'error' ? 4500 : 2600);
}
function shakeIt(el) { if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
function unlockIfClear() { if (!$('#layer .sheet-wrap, #layer .alert-wrap, #layer .spot-wrap')) document.documentElement.classList.remove('locked'); }

function sheet(o) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-bd"></div><div class="sheet glass thick ${o.size || ''}" role="dialog" aria-modal="true" aria-label="${esc(o.title || '')}">
    <div class="grabber"></div>
    <div class="sheet-hd"><div class="l">${o.cancel === false ? '' : `<button class="btn btn-plain" type="button" data-x>${esc(o.cancel || 'Batal')}</button>`}</div><h3>${esc(o.title || '')}</h3><div class="r">${o.ok ? `<button class="btn btn-plain bold" type="button" data-ok>${esc(o.ok)}</button>` : ''}</div></div>
    <div class="sheet-bdy">${o.body || ''}</div>${o.foot ? `<div class="sheet-ft">${o.foot}</div>` : ''}</div>`;
  $('#layer').appendChild(wrap);
  document.documentElement.classList.add('locked');
  const sh = $('.sheet', wrap);
  const api_ = { el: wrap, sheet: sh, body: $('.sheet-bdy', wrap), closed: false };
  api_.close = function (v) {
    if (api_.closed) return;
    api_.closed = true;
    wrap.classList.remove('in'); wrap.classList.add('out');
    S.overlays = S.overlays.filter(x => x !== api_);
    setTimeout(() => { wrap.remove(); unlockIfClear(); }, 380);
    if (o.onClose) o.onClose(v);
  };
  api_.busy = on => { $$('[data-ok], .sheet-ft .btn-primary', wrap).forEach(b => b.classList.toggle('busy', !!on)); };
  api_.ok = async function () {
    if (!o.onOk) { api_.close(true); return; }
    api_.busy(true);
    try { const r = await o.onOk(api_); if (r !== false) api_.close(true); }
    catch (e) { if (e && e.message && !e.shown) toast(e.message, 'error'); shakeIt(sh); }
    finally { api_.busy(false); }
  };
  $('.sheet-bd', wrap).addEventListener('click', () => { if (o.dismiss !== false) api_.close(false); });
  const x = $('[data-x]', wrap); if (x) x.addEventListener('click', () => api_.close(false));
  const okb = $('[data-ok]', wrap); if (okb) okb.addEventListener('click', api_.ok);
  wrap.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) api_.ok(); });
  dragDismiss(sh, $('.sheet-hd', sh), () => api_.close(false));
  S.overlays.push(api_);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('in')));
  afterRender(wrap);
  if (o.onMount) o.onMount(api_);
  return api_;
}
function dragDismiss(sh, handle, onClose) {
  let y0 = null, dy = 0, t0 = 0;
  handle.addEventListener('pointerdown', e => {
    if (!isMobile() || e.target.closest('button')) return;
    y0 = e.clientY; t0 = Date.now(); dy = 0; sh.style.transition = 'none';
    try { handle.setPointerCapture(e.pointerId); } catch (er) { /* abaikan */ }
  });
  handle.addEventListener('pointermove', e => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); sh.style.transform = 'translateY(' + dy + 'px)'; });
  const end = () => {
    if (y0 === null) return;
    const v = dy / Math.max(1, Date.now() - t0);
    sh.style.transition = ''; sh.style.transform = ''; y0 = null;
    if (dy > 130 || v > .6) onClose();
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}
function ask(o) {
  return new Promise(res => {
    const wrap = document.createElement('div');
    wrap.className = 'alert-wrap';
    const tone = o.danger ? 'background:color-mix(in srgb,var(--red) 14%,transparent);color:var(--red)' : 'background:color-mix(in srgb,var(--tint) 14%,transparent);color:var(--tint)';
    wrap.innerHTML = `<div class="sheet-bd"></div><div class="alert glass thick" role="alertdialog"><div class="at">${o.icon ? `<div class="aic" style="${tone}">${ic(o.icon, 'lg')}</div>` : ''}<h4>${esc(o.title)}</h4>${o.message ? `<p>${esc(o.message)}</p>` : ''}${o.input ? `<input class="input" ${o.input.type ? `type="${o.input.type}"` : ''} placeholder="${esc(o.input.placeholder || '')}" value="${esc(o.input.value || '')}">` : ''}</div><div class="ab">${o.cancel === false ? '' : `<button data-v="0">${esc(o.cancel || 'Batal')}</button>`}<button data-v="1" class="bold ${o.danger ? 'danger' : ''}">${esc(o.ok || 'OK')}</button></div></div>`;
    $('#layer').appendChild(wrap);
    document.documentElement.classList.add('locked');
    const inp = $('input', wrap);
    const api_ = {};
    const done = v => {
      if (api_.done) return;
      api_.done = true;
      wrap.classList.remove('in'); wrap.classList.add('out');
      S.overlays = S.overlays.filter(x => x !== api_);
      setTimeout(() => { wrap.remove(); unlockIfClear(); }, 300);
      res(v ? (inp ? inp.value.trim() : true) : (inp ? null : false));
    };
    api_.close = () => done(false);
    S.overlays.push(api_);
    $$('.ab button', wrap).forEach(b => b.addEventListener('click', () => done(b.dataset.v === '1')));
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') done(true); });
    requestAnimationFrame(() => requestAnimationFrame(() => { wrap.classList.add('in'); if (inp) inp.focus(); else { const b = $('.ab .bold', wrap); if (b) b.focus(); } }));
  });
}
function placeNear(el, anchor) {
  const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight, vw = innerWidth, vh = innerHeight;
  let left = r.right - w;
  if (left < 10) left = Math.min(r.left, vw - w - 10);
  left = Math.max(10, Math.min(left, vw - w - 10));
  let top = r.bottom + 8, oy = '0%';
  if (top + h > vh - 10) { top = Math.max(10, r.top - h - 8); oy = '100%'; }
  el.style.left = left + 'px'; el.style.top = top + 'px';
  el.style.setProperty('--ox', Math.round(r.left + r.width / 2 - left) + 'px');
  el.style.setProperty('--oy', oy);
}
function popover(anchor, el) {
  if (S.menu && S.menu._anchor === anchor) { closeMenu(); return null; }
  if (anchor === S.lastAnchor && Date.now() - S.lastClose < 300) return null;
  closeMenu();
  el._anchor = anchor;
  document.body.appendChild(el);
  placeNear(el, anchor);
  S.menu = el;
  setTimeout(() => document.addEventListener('pointerdown', outsideMenu, true), 0);
  return el;
}
function outsideMenu(e) { if (S.menu && !S.menu.contains(e.target)) closeMenu(); }
function closeMenu() {
  const m = S.menu;
  if (!m) return;
  S.menu = null; S.lastAnchor = m._anchor; S.lastClose = Date.now();
  document.removeEventListener('pointerdown', outsideMenu, true);
  m.classList.add('out');
  setTimeout(() => m.remove(), 230);
}
function menu(anchor, items, opt) {
  const el = document.createElement('div');
  el.className = 'menu glass thick';
  el.setAttribute('role', 'menu');
  el.innerHTML = (opt && opt.header ? `<div class="mh">${esc(opt.header)}</div>` : '') + items.map((it, i) => it === '-' ? '<hr>' : `<button role="menuitem" data-i="${i}" class="${it.danger ? 'danger' : ''}">${esc(it.label)}${it.icon ? ic(it.icon) : ''}</button>`).join('');
  if (!popover(anchor, el)) return;
  el.addEventListener('click', e => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    const it = items[+b.dataset.i];
    closeMenu();
    if (it.fn) Promise.resolve(it.fn()).catch(err => { if (!err || !err.shown) console.error(err); });
  });
}
function closeAllOverlays() { S.overlays.slice().forEach(o => o.close()); closeMenu(); closeSpot(); }

/* ---------------------------------------------------------------- helpers: render */
async function withBusy(btn, fn) { if (btn) btn.classList.add('busy'); try { return await fn(); } finally { if (btn) btn.classList.remove('busy'); } }
function setView(html, anim) {
  const v = $('#view');
  if (!v) return;
  anim = anim !== false;
  v.classList.toggle('no-anim', !anim);
  v.innerHTML = html;
  if (anim && !reduceMotion()) { v.classList.remove('page-in'); void v.offsetWidth; v.classList.add('page-in'); }
  afterRender(v, anim);
}
function afterRender(root, anim) {
  anim = anim !== false;
  $$('.stg', root).forEach(g => Array.from(g.children).forEach((c, i) => c.style.setProperty('--i', Math.min(i, 14))));
  initSegs(root);
  initEditors(root);
  initDrops(root);
  const run = () => {
    $$('.progress > i[data-w]', root).forEach(i => { i.style.width = Math.max(0, Math.min(100, +i.dataset.w)) + '%'; });
    $$('.ring .fg[data-off]', root).forEach(c => { c.style.strokeDashoffset = c.dataset.off; });
    $$('[data-count]', root).forEach(el => countUp(el, anim));
  };
  if (anim) requestAnimationFrame(() => requestAnimationFrame(run));
  else {
    $$('.progress > i, .ring .fg', root).forEach(x => { x.style.transition = 'none'; });
    run();
    requestAnimationFrame(() => $$('.progress > i, .ring .fg', root).forEach(x => { x.style.transition = ''; }));
  }
}
function countUp(el, anim) {
  const to = +el.dataset.count || 0, dec = to % 1 ? 1 : 0;
  if (!anim || reduceMotion() || to === 0) { el.textContent = fNum(to); return; }
  const t0 = performance.now(), D = 900;
  const step = t => {
    const p = Math.min(1, (t - t0) / D), e = 1 - Math.pow(2, -10 * p);
    el.textContent = (to * (p === 1 ? 1 : e)).toFixed(dec).replace('.', ',');
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function ring(pct, size, stroke, color) {
  size = size || 56; stroke = stroke || 6;
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, +pct || 0)) / 100);
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle class="bg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/><circle class="fg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color || 'var(--tint)'}" stroke-width="${stroke}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${c.toFixed(2)}" data-off="${off.toFixed(2)}"/></svg>`;
}
function ringBox(pct, size, label, color, fs) {
  return `<div class="ring-wrap">${ring(pct, size, Math.max(5, size / 11), color)}<span class="rv" style="font-size:${fs || Math.round(size / 4.2)}px">${label}</span></div>`;
}
function emptyHTML(icon, title, text, btn) {
  return `<div class="empty"><div class="ei">${ic(icon)}</div><h4>${esc(title)}</h4>${text ? `<p>${esc(text)}</p>` : ''}${btn || ''}</div>`;
}
function renderError(e) {
  setView(`<div class="card glass" style="max-width:520px;margin:40px auto">${emptyHTML('alert', 'Tidak dapat memuat halaman', e && e.message ? e.message : 'Terjadi kesalahan.', `<button class="btn btn-primary" style="margin-top:16px" data-act="retry">${ic('refresh', 'sm')} Coba lagi</button>`)}</div>`);
}
function skel(kind) {
  const card = n => `<div class="card glass"><div class="sk" style="height:18px;width:38%;margin-bottom:16px"></div>${'<div class="sk sk-line"></div>'.repeat(n || 3)}<div class="sk sk-line" style="width:60%"></div></div>`;
  const head = `<div class="ph"><div style="width:100%"><div class="sk" style="height:13px;width:110px;margin-bottom:12px"></div><div class="sk" style="height:34px;width:min(420px,80%)"></div></div></div>`;
  let html = head;
  if (kind === 'cards') html += `<div class="cards">${'<div class="ccard glass" style="padding:7px;min-height:260px"><div class="sk" style="height:118px;border-radius:20px"></div><div style="padding:14px 9px"><div class="sk sk-line" style="width:45%"></div><div class="sk sk-line"></div><div class="sk sk-line" style="width:70%"></div></div></div>'.repeat(6)}</div>`;
  else if (kind === 'course') html = `<div class="chero glass" style="min-height:200px"><div class="sk" style="position:absolute;inset:0;border-radius:0"></div></div><div class="sk" style="height:40px;width:380px;max-width:100%;border-radius:99px;margin-bottom:18px"></div>` + card(4) + card(3);
  else if (kind === 'dash') html += `<div class="grid g4">${'<div class="tile glass"><div class="sk" style="width:38px;height:38px"></div><div class="sk" style="height:28px;width:50%"></div></div>'.repeat(4)}</div><div class="split" style="margin-top:18px"><div class="stack">${card(5)}${card(2)}</div><div class="stack">${card(4)}</div></div>`;
  else html += card(4) + card(3);
  setView(html, false);
}

/* ---------------------------------------------------------------- segmented, lens */
function placeThumb(seg, anim) {
  let th = seg.querySelector(':scope > .thumb');
  if (!th) { th = document.createElement('i'); th.className = 'thumb'; seg.prepend(th); }
  const on = seg.querySelector(':scope > button.on');
  if (!on || !on.offsetWidth) { th.style.opacity = '0'; return; }
  th.style.opacity = '1';
  if (!anim) th.style.transition = 'none';
  th.style.width = on.offsetWidth + 'px';
  th.style.transform = 'translateX(' + on.offsetLeft + 'px)';
  if (!anim) { void th.offsetWidth; th.style.transition = ''; }
}
function initSegs(root) { $$('.seg', root || document).forEach(s => placeThumb(s, false)); }
function segSelect(btn) {
  const seg = btn.parentElement;
  Array.from(seg.children).forEach(b => { if (b.tagName === 'BUTTON') b.classList.toggle('on', b === btn); });
  placeThumb(seg, true);
}
function moveLens(box, target, anim) {
  if (!box) return;
  const lens = box.querySelector(':scope > .lens');
  if (!lens) return;
  if (!target || !target.offsetWidth) { lens.style.opacity = '0'; lens._p = null; return; }
  const x = target.offsetLeft, y = target.offsetTop, w = target.offsetWidth, h = target.offsetHeight, p = lens._p;
  lens.style.opacity = '1';
  lens.style.width = w + 'px'; lens.style.height = h + 'px';
  lens.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  if (anim && p && lens.animate && !reduceMotion() && (p.x !== x || p.y !== y)) {
    const L = Math.min(p.x, x), T = Math.min(p.y, y), R = Math.max(p.x + p.w, x + w), B = Math.max(p.y + p.h, y + h);
    const horiz = Math.abs(p.x - x) > Math.abs(p.y - y);
    const sw = horiz ? (R - L) * .82 : w, shh = horiz ? h : (B - T) * .82;
    const mx = horiz ? (L + (R - L - sw) / 2) : x, my = horiz ? y : (T + (B - T - shh) / 2);
    lens.animate([
      { transform: `translate(${p.x}px,${p.y}px)`, width: p.w + 'px', height: p.h + 'px' },
      { transform: `translate(${mx}px,${my}px) scale(${horiz ? '1,.9' : '.94,1'})`, width: sw + 'px', height: shh + 'px', offset: .42 },
      { transform: `translate(${x}px,${y}px)`, width: w + 'px', height: h + 'px' }
    ], { duration: 620, easing: 'cubic-bezier(.22,1.2,.36,1)' });
  }
  lens._p = { x, y, w, h };
}

/* ---------------------------------------------------------------- forms */
const fInput = (name, label, val, o) => {
  o = o || {};
  return `<div class="field"><label class="lbl">${label}${o.req ? ' <span class="req">*</span>' : ''}</label><input class="input" name="${name}" value="${esc(val == null ? '' : val)}" ${o.type ? `type="${o.type}"` : ''} ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${o.attrs || ''}>${o.hint ? `<div class="hint">${o.hint}</div>` : ''}</div>`;
};
const fSelect = (name, label, opts, val, hint) => `<div class="field"><label class="lbl">${label}</label><select class="input" name="${name}">${opts.map(o => `<option value="${esc(o[0])}" ${String(o[0]) === String(val == null ? '' : val) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
const fSwitch = (name, label, sub, on) => `<label class="opt-row"><div class="ot"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</div><span class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span></span></span></label>`;
function fv(root, name) { const el = $(`[name="${name}"]`, root); if (!el) return undefined; return el.type === 'checkbox' ? el.checked : el.value.trim(); }
function need(root, name, msg) { const v = fv(root, name); if (!v) { const el = $(`[name="${name}"]`, root); if (el) { el.focus(); shakeIt(el); } throw new Error(msg); } return v; }

/* Rich text editor */
const CMDT = { bold: 'Tebal', italic: 'Miring', underline: 'Garis bawah', h3: 'Judul', ul: 'Daftar berpoin', ol: 'Daftar bernomor', quote: 'Kutipan', link: 'Tautan', image: 'Gambar', video: 'Video', clear: 'Hapus format' };
function editor(name, value, o) {
  o = o || {};
  const tools = [['bold', '<b>B</b>'], ['italic', '<i style="font-family:Georgia,serif">I</i>'], ['underline', '<u>U</u>'], ['|'], ['h3', ic('heading')], ['ul', ic('list')], ['ol', ic('olist')], ['quote', ic('quote')], ['|'], ['link', ic('link')], ['image', ic('image')], ['video', ic('video')], ['|'], ['clear', ic('eraser')]];
  return `<div class="editor" data-editor="${name}"><div class="ed-tools">${tools.map(t => t[0] === '|' ? '<span class="sp"></span>' : `<button type="button" data-cmd="${t[0]}" title="${CMDT[t[0]]}" aria-label="${CMDT[t[0]]}">${t[1]}</button>`).join('')}</div><div class="ed-area rich" contenteditable="true" data-ph="${esc(o.ph || 'Tulis di sini…')}" style="min-height:${o.h || 140}px">${sanitize(value || '')}</div></div>`;
}
function initEditors(root) {
  $$('.editor:not([data-init])', root).forEach(ed => {
    ed.dataset.init = '1';
    const area = $('.ed-area', ed);
    let saved = null;
    const save = () => { const s = getSelection(); if (s.rangeCount && area.contains(s.anchorNode)) saved = s.getRangeAt(0).cloneRange(); };
    const restore = () => { area.focus(); if (saved) { const s = getSelection(); s.removeAllRanges(); s.addRange(saved); } };
    ['keyup', 'mouseup', 'input', 'focus'].forEach(ev => area.addEventListener(ev, save));
    ed.addEventListener('mousedown', e => { if (e.target.closest('[data-cmd]')) e.preventDefault(); });
    ed.addEventListener('click', async e => {
      const b = e.target.closest('[data-cmd]');
      if (!b) return;
      const c = b.dataset.cmd;
      const ex = (cmd, val) => { restore(); document.execCommand(cmd, false, val); save(); };
      if (c === 'bold' || c === 'italic' || c === 'underline') ex(c);
      else if (c === 'h3') ex('formatBlock', inBlock(area, 'H3') ? 'P' : 'H3');
      else if (c === 'quote') ex('formatBlock', inBlock(area, 'BLOCKQUOTE') ? 'P' : 'BLOCKQUOTE');
      else if (c === 'ul') ex('insertUnorderedList');
      else if (c === 'ol') ex('insertOrderedList');
      else if (c === 'clear') { ex('removeFormat'); ex('formatBlock', 'P'); }
      else if (c === 'link') {
        const sel = saved ? saved.toString() : '';
        const url = await ask({ title: 'Sisipkan tautan', input: { placeholder: 'https://…' }, ok: 'Sisipkan' });
        if (!url) return;
        const u = /^(https?:|mailto:)/i.test(url) ? url : 'https://' + url;
        restore();
        if (sel) document.execCommand('createLink', false, u);
        else document.execCommand('insertHTML', false, `<a href="${esc(u)}" target="_blank">${esc(u)}</a>&nbsp;`);
      } else if (c === 'image') {
        menu(b, [
          { label: 'Unggah gambar…', icon: 'upload', fn: () => pickFile('image/*', f => uploadImageInto(f, restore)) },
          { label: 'Dari URL…', icon: 'link', fn: async () => { const url = await ask({ title: 'Gambar dari URL', input: { placeholder: 'https://…/gambar.jpg' }, ok: 'Sisipkan' }); if (url) { restore(); document.execCommand('insertHTML', false, `<img src="${esc(url)}" alt="">`); } } }
        ]);
      } else if (c === 'video') {
        const url = await ask({ title: 'Sisipkan video', message: 'Tempel tautan YouTube, Vimeo, atau Google Drive.', input: { placeholder: 'https://youtu.be/…' }, ok: 'Sisipkan' });
        if (!url) return;
        const em = embedUrl(url);
        if (!em) { toast('Tautan video tidak dikenali.', 'error'); return; }
        restore();
        document.execCommand('insertHTML', false, `<iframe src="${esc(em)}" allowfullscreen></iframe><p><br></p>`);
      }
    });
    area.addEventListener('paste', e => {
      const fl = e.clipboardData && e.clipboardData.files;
      if (fl && fl.length && /^image\//.test(fl[0].type)) { e.preventDefault(); save(); uploadImageInto(fl[0], restore); }
    });
    area.addEventListener('drop', e => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && /^image\//.test(f.type)) { e.preventDefault(); uploadImageInto(f, restore); }
    });
  });
}
function inBlock(area, tag) { const s = getSelection(); let n = s.anchorNode; while (n && n !== area) { if (n.nodeName === tag) return true; n = n.parentNode; } return false; }
async function uploadImageInto(file, restore) {
  if (file.size > 5 * 1048576) { toast('Ukuran gambar maksimal 5 MB.', 'error'); return; }
  toast('Mengunggah gambar…', 'info');
  try {
    const f = await readFile(file);
    const r = await api('uploadImage', f);
    restore();
    document.execCommand('insertHTML', false, `<img src="${esc(imgUrl(r))}" alt="${esc(r.name)}">`);
  } catch (e) { /* sudah ditampilkan */ }
}
function edVal(root, name) {
  const a = $(`[data-editor="${name}"] .ed-area`, root);
  if (!a) return '';
  let h = sanitize(a.innerHTML).replace(/<img[^>]+src="data:[^"]{40000,}"[^>]*>/gi, '').trim();
  if (!plain(h) && !/<(img|iframe)/i.test(h)) h = '';
  return h;
}
function pickFile(accept, cb, multiple) {
  const i = document.createElement('input');
  i.type = 'file'; i.accept = accept || ''; if (multiple) i.multiple = true;
  i.style.display = 'none';
  document.body.appendChild(i);
  i.onchange = () => { if (i.files.length) cb(multiple ? Array.from(i.files) : i.files[0]); i.remove(); };
  i.click();
}
function readFile(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ name: file.name, mime: file.type || 'application/octet-stream', size: file.size, data: String(r.result).split(',')[1] || '' });
    r.onerror = () => rej(new Error('Gagal membaca berkas ' + file.name));
    r.readAsDataURL(file);
  });
}

/* Files */
const FT = [[/pdf/i, 'PDF', '#ff5e57', '#d93025'], [/msword|wordprocessing|\.docx?\b/i, 'DOC', '#4c8bf5', '#1a5fd0'], [/sheet|excel|csv|\.xlsx?\b/i, 'XLS', '#34c759', '#188038'], [/presentation|powerpoint|\.pptx?\b/i, 'PPT', '#ff9f43', '#e8710a'], [/^image\//i, 'IMG', '#bf5af2', '#8e44ec'], [/^video\//i, 'VID', '#ff375f', '#c2185b'], [/zip|rar|7z|compressed/i, 'ZIP', '#a0a0a8', '#6e6e76'], [/^audio\//i, 'AUD', '#30d1c8', '#00897b']];
function fileType(f) {
  const k = (f.mime || '') + ' ' + (f.name || '');
  for (const t of FT) if (t[0].test(k)) return t;
  const ext = String(f.name || '').split('.').pop();
  return [null, (ext && ext.length <= 4 ? ext : 'FILE').toUpperCase(), '#8e8e93', '#636366'];
}
function fileRow(f, right) {
  const t = fileType(f);
  return `<div class="file"><div class="fi" style="--c1:${t[2]};--c2:${t[3]}">${esc(t[1])}</div><div class="grow" style="min-width:0"><div class="fn">${esc(f.name)}</div><div class="fs">${f.size ? fSize(f.size) : ''}</div></div>${right || ''}</div>`;
}
function fileLinks(f) {
  if (/^data:/.test(f.url || '')) return { open: f.url, preview: f.url, download: f.url };
  return { open: 'https://drive.google.com/file/d/' + f.id + '/view', preview: 'https://drive.google.com/file/d/' + f.id + '/preview', download: 'https://drive.google.com/uc?export=download&id=' + f.id };
}
const imgUrl = f => /^data:/.test(f.url || '') ? f.url : 'https://drive.google.com/thumbnail?id=' + f.id + '&sz=w2000';
function fileLinkRow(f) {
  const L = fileLinks(f);
  return fileRow(f, `<a class="btn btn-sm btn-tinted" href="${esc(L.open)}" target="_blank" rel="noopener">Buka</a><a class="btn btn-sm btn-icon" href="${esc(L.download)}" target="_blank" rel="noopener" ${/^data:/.test(f.url || '') ? `download="${esc(f.name)}"` : ''} aria-label="Unduh">${ic('download', 'sm')}</a>`);
}
function embedUrl(url) {
  url = String(url || '').trim();
  let m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i);
  if (m) return 'https://www.youtube.com/embed/' + m[1];
  m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (m) return 'https://player.vimeo.com/video/' + m[1];
  m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/i);
  if (m) return 'https://drive.google.com/file/d/' + m[1] + '/preview';
  m = url.match(/^(https:\/\/docs\.google\.com\/(?:document|presentation|spreadsheets|forms)\/d\/[\w-]+)/i);
  if (m) return /\/forms\//.test(m[1]) ? m[1] + '/viewform?embedded=true' : m[1] + '/preview';
  return null;
}
function dropzone(name, o) {
  o = o || {};
  return `<label class="drop" data-drop="${name}" data-max="${o.max || 1}"><input type="file" ${(o.max || 1) > 1 ? 'multiple' : ''} accept="${esc(o.accept || '')}">${ic('upload')}<b>${esc(o.label || 'Pilih berkas atau seret ke sini')}</b><small>${esc(o.hint || 'Maksimal 10 MB per berkas')}</small></label><div class="files" data-droplist="${name}"></div>`;
}
function initDrops(root) {
  $$('.drop:not([data-init])', root).forEach(d => {
    d.dataset.init = '1'; d._files = [];
    const max = +d.dataset.max || 1;
    const list = $(`[data-droplist="${d.dataset.drop}"]`, root) || d.nextElementSibling;
    const render = () => { list.innerHTML = d._files.map((f, i) => fileRow({ name: f.name, size: f.size, mime: f.type }, `<button type="button" class="btn btn-sm btn-icon" data-rm="${i}" aria-label="Hapus">${ic('x', 'sm')}</button>`)).join(''); };
    const add = fl => {
      Array.from(fl).forEach(f => {
        if (f.size > 10 * 1048576) { toast('"' + f.name + '" melebihi 10 MB', 'error'); return; }
        if (max === 1) d._files = [f];
        else if (d._files.length < max) d._files.push(f);
        else toast('Maksimal ' + max + ' berkas', 'error');
      });
      render();
    };
    $('input', d).addEventListener('change', e => { add(e.target.files); e.target.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => d.addEventListener(ev, e => { e.preventDefault(); d.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => d.addEventListener(ev, e => { e.preventDefault(); d.classList.remove('over'); }));
    d.addEventListener('drop', e => add(e.dataTransfer.files));
    list.addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (!b) return; d._files.splice(+b.dataset.rm, 1); render(); });
  });
}
const dropFiles = (root, name) => { const d = $(`[data-drop="${name}"]`, root); return d && d._files ? d._files.slice() : []; };

/* CSV / Excel */
function parseCSV(text) {
  text = String(text || '').replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const cnt = ch => (first.match(new RegExp(ch === '\t' ? '\\t' : ch, 'g')) || []).length;
  const delim = cnt('\t') > 0 ? '\t' : cnt(';') > cnt(',') ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}
function loadScript(src) {
  return new Promise((res, rej) => {
    if (Array.from(document.scripts).some(s => s.src === src)) { res(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Gagal memuat pustaka pembaca Excel. Simpan sebagai CSV lalu coba lagi.'));
    document.head.appendChild(s);
  });
}
/* Pembaca .xlsx bawaan (tanpa pustaka luar): ZIP + XML, memakai DecompressionStream browser. */
async function readXlsx(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Berkas bukan .xlsx yang valid.');
  const count = dv.getUint16(eocd + 10, true), files = {}, dec = new TextDecoder();
  let p = dv.getUint32(eocd + 16, true);
  for (let n = 0; n < count && dv.getUint32(p, true) === 0x02014b50; n++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    files[dec.decode(u8.subarray(p + 46, p + 46 + nl)).replace(/^\//, '')] = { method, csize, off };
    p += 46 + nl + el + cl;
  }
  const read = async name => {
    const f = files[name];
    if (!f) return null;
    const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true), data = u8.slice(start, start + f.csize);
    if (f.method === 0) return dec.decode(data);
    if (typeof DecompressionStream === 'undefined') throw new Error('NO_INFLATE');
    return await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  };
  const xml = t => new DOMParser().parseFromString(t, 'application/xml');
  const tags = (node, tag) => Array.from(node.getElementsByTagNameNS('*', tag));
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wbXml = await read('xl/workbook.xml'), relXml = await read('xl/_rels/workbook.xml.rels');
  if (wbXml && relXml) {
    const first = tags(xml(wbXml), 'sheet')[0];
    const rid = first && (first.getAttribute('r:id') || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
    const rel = tags(xml(relXml), 'Relationship').find(r => r.getAttribute('Id') === rid);
    if (rel) { const t = rel.getAttribute('Target'); sheetPath = t.charAt(0) === '/' ? t.slice(1) : 'xl/' + t.replace(/^\.\//, ''); }
  }
  const ssXml = await read('xl/sharedStrings.xml');
  const shared = ssXml ? tags(xml(ssXml), 'si').map(si => tags(si, 't').map(t => t.textContent).join('')) : [];
  const shXml = await read(sheetPath);
  if (!shXml) throw new Error('Lembar pertama tidak ditemukan di berkas Excel.');
  const colNum = ref => { let n = 0; const m = /^[A-Z]+/.exec(ref) || ['A']; for (const ch of m[0]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const out = [];
  tags(xml(shXml), 'row').forEach(row => {
    const r = (+row.getAttribute('r') || out.length + 1) - 1, line = [];
    tags(row, 'c').forEach((c, k) => {
      const t = c.getAttribute('t'), ref = c.getAttribute('r'), vEl = tags(c, 'v')[0];
      let v = vEl ? vEl.textContent : '';
      if (t === 's') v = shared[+v] || '';
      else if (t === 'inlineStr') v = tags(c, 't').map(x => x.textContent).join('');
      else if (t === 'b') v = v === '1' ? 'TRUE' : 'FALSE';
      else if (v !== '' && !t && /^-?\d+(\.\d+)?(E[+-]?\d+)?$/i.test(v)) { const num = Number(v); v = Number.isInteger(num) && Math.abs(num) < 1e21 ? BigInt(Math.round(num)).toString() : String(num); }
      line[ref ? colNum(ref) : k] = v;
    });
    out[r] = Array.from(line, x => x == null ? '' : x);
    out[r]._r = r + 1;
  });
  return Array.from(out, x => x || []).filter(r => r.some(c => String(c).trim() !== ''));
}
async function readTable(file) {
  if (/\.xlsx$/i.test(file.name)) {
    try { return await readXlsx(await file.arrayBuffer()); }
    catch (e) { if (e.message !== 'NO_INFLATE' && !/^Berkas|^Lembar/.test(e.message)) console.warn(e); if (/^Berkas|^Lembar/.test(e.message)) throw e; }
  }
  if (/\.xlsx?$/i.test(file.name)) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
    return window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }).filter(r => r.some(c => String(c).trim() !== ''));
  }
  return parseCSV(await file.text());
}
function toCSV(rows) { return rows.map(r => r.map(c => { const s = String(c == null ? '' : c); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n'); }
function downloadFile(name, content, mime) {
  downloadBlob(name, new Blob(['\uFEFF' + content], { type: mime || 'text/csv;charset=utf-8' }));
}
function downloadBlob(name, blob) {
  if (DEMO && window.__LMS_NO_DOWNLOAD__) { toast('Unduhan tidak tersedia di pratinjau ini. Fitur ini aktif di situs LMS Anda.', 'info'); return; }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);
}

/* ==========================================================================
   AUTH & SHELL
   ========================================================================== */
function applyBoot(b) {
  S.user = b.user;
  S.settings = Object.assign(S.settings, b.settings || {});
  if (b.settings) { LS.set('settings', b.settings); checkVersion(b.settings.version); }
  S.courses = b.courses || [];
  S.categories = b.categories || [];
  S.editMode = !!LS.get('edit_' + S.user.id, false);
}
async function refreshBoot() {
  try { const b = await api('boot', {}, { silent: true }); applyBoot(b); LS.set('boot', b); renderNavCourses(); renderMeChip(); } catch (e) { /* abaikan */ }
}
function handleAuthLost(msg) {
  const was = !!S.user;
  LS.del('token'); LS.del('boot');
  S.token = null; S.user = null; S.cache.clear();
  if (S.onLeave) { try { S.onLeave(); } catch (e) { /* abaikan */ } S.onLeave = null; }
  clearInterval(S.notifTimer);
  closeAllOverlays();
  showLogin(was ? msg : null);
}
function showLogin(msg) {
  markReady();
  document.documentElement.classList.remove('focus-mode');
  const st = S.settings, reg = !!st.allow_register;
  $('#root').innerHTML = `<div class="login"><div class="login-card glass thick stg">
    <div class="app-icon">${ic('grad')}</div>
    <h1>${esc(st.site_name)}</h1>
    <p class="sub">${esc(st.school_name || 'Learning Management System')}</p>
    ${reg ? `<div class="seg block" id="authSeg"><button type="button" class="on" data-v="login">Masuk</button><button type="button" data-v="reg">Daftar akun</button></div>` : '<div></div>'}
    <div>
      <form id="loginForm" autocomplete="on" novalidate>
        <div class="inp-ic">${ic('user', 'sm')}<input class="input" name="username" placeholder="Username" autocomplete="username" autocapitalize="none" spellcheck="false"></div>
        <div class="inp-ic">${ic('lock', 'sm')}<input class="input" name="password" type="password" placeholder="Password" autocomplete="current-password"><button type="button" class="btn btn-plain btn-icon btn-sm eye" data-eye aria-label="Lihat password">${ic('eye', 'sm')}</button></div>
        <div class="err-msg hidden" id="loginErr"></div>
        <button class="btn btn-primary btn-lg w100" type="submit">Masuk</button>
      </form>
      ${reg ? `<form id="regForm" class="hidden" novalidate>
        <div class="inp-ic">${ic('user', 'sm')}<input class="input" name="name" placeholder="Nama lengkap"></div>
        <div class="row2"><input class="input" name="kelas" placeholder="Kelas (mis. X TJKT 1)"><input class="input" name="nisn" placeholder="NISN" inputmode="numeric"></div>
        <div class="inp-ic">${ic('sparkle', 'sm')}<input class="input" name="username" placeholder="Username (huruf kecil, tanpa spasi)" autocapitalize="none"></div>
        <div class="inp-ic">${ic('lock', 'sm')}<input class="input" name="password" type="password" placeholder="Password (min. 4 karakter)"></div>
        <div class="err-msg hidden" id="regErr"></div>
        <button class="btn btn-primary btn-lg w100" type="submit">Buat akun</button>
      </form>` : ''}
    </div>
    ${DEMO ? `<div class="demo-box"><b>${ic('sparkle', 'sm')} Mode demo — coba akun berikut:</b><div class="gap8"><button class="btn btn-glass btn-sm" data-demo="admin|admin123">Admin</button><button class="btn btn-glass btn-sm" data-demo="guru|guru123">Guru</button><button class="btn btn-glass btn-sm" data-demo="siswa1|siswa123">Siswa</button><button class="btn btn-plain btn-sm" type="button" data-demo-reset>Reset data</button></div></div>` : ''}
    ${st.tagline ? `<p class="foot">${esc(st.tagline)}</p>` : ''}
  </div><div class="login-copy">© ${new Date().getFullYear()} ${esc(st.school_name || st.site_name)} · v${esc(APP_VERSION)}</div></div>`;
  afterRender($('#root'));
  const lf = $('#loginForm'), rf = $('#regForm');
  if (msg) { const e = $('#loginErr'); e.textContent = msg; e.classList.remove('hidden'); }
  else if (S.serverErr) { const e = $('#loginErr'); e.textContent = S.serverErr; e.classList.remove('hidden'); }
  const seg = $('#authSeg');
  if (seg) seg.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const reg2 = b.dataset.v === 'reg'; lf.classList.toggle('hidden', reg2); rf.classList.toggle('hidden', !reg2); lf.classList.add('fade-in'); rf.classList.add('fade-in'); });
  $$('[data-eye]').forEach(b => b.addEventListener('click', () => { const i = b.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; b.innerHTML = ic(i.type === 'password' ? 'eye' : 'eyeoff', 'sm'); }));
  $$('[data-demo-reset]').forEach(b => b.addEventListener('click', () => { if (window.__LMS_DEMO_RESET) window.__LMS_DEMO_RESET(); }));
  $$('[data-demo]').forEach(b => b.addEventListener('click', () => { const p = b.dataset.demo.split('|'); lf.username.value = p[0]; lf.password.value = p[1]; lf.requestSubmit ? lf.requestSubmit() : lf.dispatchEvent(new Event('submit')); }));
  lf.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('button[type=submit]', lf), err = $('#loginErr');
    const username = lf.username.value.trim(), password = lf.password.value;
    if (!username || !password) { shakeIt($('.login-card')); err.textContent = 'Isi username dan password.'; err.classList.remove('hidden'); return; }
    btn.classList.add('busy'); err.classList.add('hidden');
    try { const r = await call('login', { username, password }); onLoggedIn(r); }
    catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); shakeIt($('.login-card')); }
    finally { btn.classList.remove('busy'); }
  });
  if (rf) rf.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('button[type=submit]', rf), err = $('#regErr');
    btn.classList.add('busy'); err.classList.add('hidden');
    try { const r = await call('register', { name: rf.name.value, kelas: rf.kelas.value, nisn: rf.nisn.value, username: rf.username.value, password: rf.password.value }); onLoggedIn(r); toast('Akun berhasil dibuat. Selamat datang!'); }
    catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); shakeIt($('.login-card')); }
    finally { btn.classList.remove('busy'); }
  });
  setTimeout(() => { try { lf.username.focus({ preventScroll: true }); } catch (e) { /* abaikan */ } }, 400);
}
function onLoggedIn(r) {
  S.token = r.token; LS.set('token', r.token); LS.set('boot', r.boot);
  applyBoot(r.boot);
  renderShell();
  if (!location.hash || location.hash === '#' || location.hash === '#/') go('/dashboard', true); else route();
}
async function logout() {
  const ok = await ask({ title: 'Keluar dari akun?', message: 'Anda perlu masuk kembali untuk mengakses kursus.', ok: 'Keluar', danger: true, icon: 'logout' });
  if (!ok) return;
  try { await call('logout'); } catch (e) { /* abaikan */ }
  S.user = { id: 0 };
  handleAuthLost(null);
  toast('Anda telah keluar.');
}
function navItems() {
  const items = [
    { path: '/dashboard', label: 'Dasbor', icon: 'grid', c: ['#64d2ff', '#007aff'] },
    { path: '/courses', label: 'Kursus Saya', icon: 'book', c: ['#ffb35c', '#ff7a1f'] },
    { path: '/catalog', label: 'Katalog Kursus', icon: 'layers', c: ['#5ee07f', '#1aa84a'] },
    { path: '/calendar', label: 'Kalender', icon: 'calendar', c: ['#ff7a8a', '#ff3b30'] },
    { path: '/grades', label: 'Nilai', icon: 'chart', c: ['#c58bff', '#8a3ff0'] }
  ];
  if (S.user.role === 'admin') items.push({ path: '/admin', label: 'Administrasi Situs', icon: 'shield', c: ['#a1a1aa', '#52525b'] });
  items.push({ path: '/profile', label: 'Profil & Tampilan', icon: 'user', c: ['#8e8bff', '#5856d6'] });
  return items;
}
function tabItems() {
  const t = [['/dashboard', 'Beranda', 'grid'], ['/courses', 'Kursus', 'book'], ['/calendar', 'Kalender', 'calendar']];
  t.push(S.user.role === 'admin' ? ['/admin', 'Admin', 'shield'] : ['/grades', 'Nilai', 'chart']);
  t.push(['/profile', 'Profil', 'user']);
  return t;
}
function renderShell() {
  markReady();
  const u = S.user, mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  $('#root').innerHTML = `<div id="app">
    <aside class="sidebar glass lg-el" data-lgb="14">
      <div class="brand" data-go="/dashboard"><div class="app-icon">${ic('grad')}</div><div class="grow" style="min-width:0"><b id="brandName" class="ellipsis">${esc(S.settings.site_name)}</b><small id="brandSchool" class="ellipsis">${esc(S.settings.school_name)}</small></div></div>
      <nav class="nav" id="nav"><i class="lens"></i>${navItems().map(n => `<button class="nav-item" data-go="${n.path}" data-nav="${n.path}"><span class="ni" style="--c1:${n.c[0]};--c2:${n.c[1]}">${ic(n.icon)}</span>${esc(n.label)}</button>`).join('')}</nav>
      <div class="nav-sec">Kursus Saya</div>
      <div class="nav-courses" id="navCourses"></div>
      <div class="side-foot"><div class="me-chip" data-act="meMenu" id="meChip"></div></div>
    </aside>
    <main>
      <header class="topbar glass lg-el" data-lgb="9" id="topbar">
        <button class="btn btn-glass btn-icon hidden lg-el" data-lgb="3" id="tbBack" aria-label="Kembali">${ic('left')}</button>
        <div class="tb-title" id="tbTitle"></div>
        <div class="tb-actions">
          <div id="tbExtra" class="row"></div>
          <button class="tb-search lg-el" data-lgb="4" data-act="spot" aria-label="Cari">${ic('search', 'sm')}<span>Cari kursus, materi…</span><kbd>${mac ? '⌘' : 'Ctrl'} K</kbd></button>
          <button class="btn btn-glass btn-icon lg-el" data-lgb="3" data-act="notifs" id="bellBtn" aria-label="Notifikasi" style="position:relative">${ic('bell')}</button>
          <button class="btn btn-icon" data-act="meMenu" id="tbAvatar" aria-label="Akun" style="background:none">${av(u, 'sm')}</button>
        </div>
      </header>
      <div id="view"></div>
    </main>
    <nav class="tabbar glass lg-el" data-lgb="5" id="tabbar"><div class="tabs"><i class="lens"></i>${tabItems().map(t => `<button data-go="${t[0]}" data-nav="${t[0]}">${ic(t[2])}<span>${t[1]}</span></button>`).join('')}</div></nav>
  </div>`;
  renderNavCourses();
  renderMeChip();
  try { new ResizeObserver(() => updateNav(S.path, false)).observe($('#tabbar .tabs')); } catch (e) { /* lama */ }
  requestAnimationFrame(lgRefresh);
  refreshNotifs();
  clearInterval(S.notifTimer);
  S.notifTimer = setInterval(refreshNotifs, 180000);
}
function renderNavCourses() {
  const box = $('#navCourses');
  if (!box) return;
  const list = S.courses.slice(0, 14);
  box.innerHTML = list.length ? list.map(c => `<div class="nav-course ${S.curCourse === c.id ? 'on' : ''}" data-go="/course/${c.id}"><span class="dot">${coverSVG(c.id, c.cover)}</span><span class="ellipsis">${esc(c.fullname)}</span></div>`).join('') + (S.courses.length > 14 ? `<div class="nav-course" data-go="/courses"><span class="faint">Lihat semua (${S.courses.length})</span></div>` : '')
    : `<div class="faint" style="padding:6px 12px;font-size:13px">Belum ada kursus. <a data-go="/catalog">Telusuri katalog</a></div>`;
}
function renderMeChip() {
  const u = S.user, el = $('#meChip');
  if (!el || !u) return;
  el.innerHTML = `${av(u)}<div class="grow" style="min-width:0"><b class="ellipsis">${esc(u.name)}</b><small>${ROLE[u.role] || ''}${u.kelas ? ' · ' + esc(u.kelas) : ''}</small></div>${ic('more', 'sm')}`;
  const ta = $('#tbAvatar'); if (ta) ta.innerHTML = av(u, 'sm');
  const bn = $('#brandName'); if (bn) bn.textContent = S.settings.site_name;
  const bs = $('#brandSchool'); if (bs) bs.textContent = S.settings.school_name;
}
function updateNav(path, anim) {
  path = path || '';
  const top = '/' + (path.split('/')[1] || '');
  const key = /^\/(course|mod|discussion|attempt|review)$/.test(top) ? '/courses' : top;
  [['#nav', '.nav-item'], ['#tabbar .tabs', 'button']].forEach(p => {
    const box = $(p[0]);
    if (!box) return;
    let on = null;
    $$(p[1], box).forEach(b => { const hit = b.dataset.nav === key; b.classList.toggle('on', hit); if (hit) on = b; });
    moveLens(box, on, anim !== false);
  });
  const m = path.match(/^\/course\/([^/]+)/);
  if (m) S.curCourse = m[1]; else if (!/^\/(mod|discussion|attempt|review)/.test(path)) S.curCourse = null;
  $$('#navCourses .nav-course').forEach(n => n.classList.toggle('on', n.dataset.go === '/course/' + S.curCourse));
}
function setChrome(o) {
  o = o || {};
  const t = $('#tbTitle');
  if (!t) return;
  t.textContent = o.title || '';
  const back = $('#tbBack');
  if (o.back) { back.classList.remove('hidden'); back.dataset.go = o.back; } else { back.classList.add('hidden'); delete back.dataset.go; }
  $('#tbExtra').innerHTML = o.extra || '';
  initSegs($('#tbExtra'));
  document.documentElement.classList.toggle('focus-mode', !!o.focus);
  document.title = (o.title ? o.title + ' · ' : '') + S.settings.site_name;
}

/* ---------------------------------------------------------------- router */
const ROUTES = [
  [/^\/dashboard$/, pageDashboard],
  [/^\/courses$/, pageMyCourses],
  [/^\/catalog$/, pageCatalog],
  [/^\/course\/([^/]+)(?:\/(participants|grades|announcements|settings))?$/, pageCourse],
  [/^\/mod\/([^/]+)(?:\/(submissions|questions|results))?$/, pageModule],
  [/^\/discussion\/([^/]+)$/, pageDiscussion],
  [/^\/attempt\/([^/]+)$/, pageAttempt],
  [/^\/review\/([^/]+)$/, pageReview],
  [/^\/calendar$/, pageCalendar],
  [/^\/grades$/, pageGrades],
  [/^\/profile$/, pageProfile],
  [/^\/admin(?:\/(overview|users|courses|categories|announcements|settings))?$/, pageAdmin]
];
function go(path, replace) {
  const h = '#' + path;
  if (location.hash === h) { route(); return; }
  try { if (replace) location.replace(h); else location.hash = path; }
  catch (e) { S.forcePath = path; route(); }
}
async function route() {
  if (!S.user || !$('#view')) return;
  let path = S.forcePath || (location.hash || '').replace(/^#/, '') || '/dashboard';
  S.forcePath = null;
  try { path = decodeURI(path); } catch (e) { /* biarkan */ }
  if (S.onLeave) { const f = S.onLeave; S.onLeave = null; try { f(); } catch (e) { /* abaikan */ } }
  closeAllOverlays();
  S.path = path;
  updateNav(path, true);
  for (const r of ROUTES) {
    const m = path.match(r[0]);
    if (m) {
      if (!S.keepScroll) window.scrollTo(0, 0);
      S.keepScroll = false;
      try { await r[1].apply(null, m.slice(1)); } catch (e) { if (!e || !e.shown) console.error(e); }
      return;
    }
  }
  go('/dashboard', true);
}

/* ==========================================================================
   DASBOR
   ========================================================================== */
function tile(icon, c, val, label, goTo, suffix) {
  return `<div class="tile glass" ${goTo ? `data-go="${goTo}"` : ''}><div class="ti" style="--c1:${c[0]};--c2:${c[1]}">${ic(icon)}</div><div><div class="tv"><span data-count="${+val || 0}">0</span>${suffix || ''}</div><div class="tl">${esc(label)}</div></div></div>`;
}
async function pageDashboard() {
  setChrome({ title: 'Dasbor' });
  await swr('dash', 'dashboard', {}, (d, c, refresh) => renderDashboard(d, !refresh), () => skel('dash'));
}
function renderDashboard(d, anim) {
  S.dash = d;
  const u = S.user, st = d.stats || {}, hr = new Date().getHours();
  const greet = hr < 11 ? 'Selamat pagi' : hr < 15 ? 'Selamat siang' : hr < 18 ? 'Selamat sore' : 'Selamat malam';
  const first = String(u.name).split(/[\s,]+/)[0];
  const tiles = [];
  if (u.role === 'admin') {
    tiles.push(tile('users', ['#64d2ff', '#007aff'], st.users, 'Pengguna', '/admin/users'), tile('book', ['#ffb35c', '#ff7a1f'], st.courses, 'Kursus', '/admin/courses'), tile('grad', ['#5ee07f', '#1aa84a'], st.students, 'Siswa', '/admin/users'), tile('inbox', ['#ff7aa2', '#f2245c'], st.toGrade, 'Perlu dinilai'));
  } else if (st.courses !== undefined) {
    tiles.push(tile('book', ['#ffb35c', '#ff7a1f'], st.courses, 'Kursus diampu', '/courses'), tile('users', ['#64d2ff', '#007aff'], st.students, 'Siswa'), tile('inbox', ['#ff7aa2', '#f2245c'], st.toGrade, 'Perlu dinilai'), tile('layers', ['#c58bff', '#8a3ff0'], st.activities, 'Aktivitas'));
  } else {
    tiles.push(tile('book', ['#ffb35c', '#ff7a1f'], st.myCourses, 'Kursus diikuti', '/courses'), tile('chart', ['#5ee07f', '#1aa84a'], st.progress, 'Rata-rata progres', null, '%'), tile('clock', ['#64d2ff', '#007aff'], st.pending, 'Tugas & kuis aktif'), tile('alert', ['#ff7aa2', '#f2245c'], st.overdue, 'Terlambat'));
  }
  const canCreate = u.role !== 'student';
  const recentIds = LS.get('recent_' + u.id, []);
  let recent = recentIds.map(id => d.courses.find(c => c.id === id)).filter(Boolean);
  if (recent.length < 4) recent = recent.concat(d.courses.filter(c => recent.indexOf(c) < 0)).slice(0, 8);
  const evs = d.timeline.map(t => ({ time: t.due, type: t.type, title: t.title, kind: 'due' }));
  const now = new Date();
  setView(`
    <div class="ph"><div><div class="eyebrow">${esc(fLong(Date.now()))}</div><h1>${greet}, ${esc(first)} 👋</h1><p>${u.role === 'student' ? 'Berikut ringkasan belajar Anda hari ini.' : 'Berikut ringkasan kelas yang Anda ampu.'}</p></div>
      <div class="ph-actions">${canCreate ? `<button class="btn btn-primary" data-act="newCourse">${ic('plus', 'sm')} Kursus baru</button>` : `<button class="btn btn-glass" data-go="/catalog">${ic('layers', 'sm')} Katalog kursus</button>`}</div></div>
    <div class="grid g4 stg">${tiles.join('')}</div>
    <div class="split" style="margin-top:18px">
      <div class="stack stg">
        <section class="card glass"><div class="card-h"><h3>${ic('clock')} Linimasa</h3><div class="seg" id="tlSeg">${[['all', 'Semua'], ['7', '7 hari'], ['30', '30 hari'], ['over', 'Terlambat']].map(x => `<button class="${S.tl === x[0] ? 'on' : ''}" data-act="tlFilter" data-v="${x[0]}">${x[1]}</button>`).join('')}</div></div><div class="list" id="tlList">${timelineHTML(d.timeline)}</div></section>
        <section class="card glass"><div class="card-h"><h3>${ic('book')} Kursus yang baru diakses</h3><button class="btn btn-plain btn-sm" data-go="/courses">Lihat semua</button></div>${recent.length ? `<div class="hscroll">${recent.map(ccard).join('')}</div>` : emptyHTML('book', 'Belum ada kursus', u.role === 'student' ? 'Daftar ke kursus melalui Katalog Kursus.' : 'Buat kursus pertama Anda.')}</section>
      </div>
      <div class="stack stg">
        <section class="card glass"><div class="cal-head"><h3 style="font-size:17px">${BULAN[now.getMonth()]} ${now.getFullYear()}</h3><button class="btn btn-plain btn-sm" data-go="/calendar">Kalender</button></div>${calGrid(now.getFullYear(), now.getMonth(), evs, null, true)}</section>
        <section class="card glass"><div class="card-h"><h3>${ic('megaphone')} Pengumuman</h3></div>${d.announcements.length ? `<div class="list">${d.announcements.map(annRow).join('')}</div>` : emptyHTML('megaphone', 'Belum ada pengumuman', '')}</section>
        <section class="card glass"><div class="card-h"><h3>${ic('sparkle')} Aktivitas terbaru</h3></div>${d.recent.length ? `<div class="list">${d.recent.map(recentRow).join('')}</div>` : emptyHTML('sparkle', 'Belum ada aktivitas', '')}</section>
      </div>
    </div>`, anim);
}
function timelineHTML(items) {
  const now = Date.now(), f = S.tl;
  const list = items.filter(t => f === 'over' ? t.overdue : f === '7' ? (!t.overdue && t.due - now < 7 * 864e5) : f === '30' ? (!t.overdue && t.due - now < 30 * 864e5) : true);
  if (!list.length) return emptyHTML('checkc', f === 'over' ? 'Tidak ada yang terlambat' : 'Semua beres!', f === 'over' ? 'Tidak ada tugas yang melewati batas waktu.' : 'Tidak ada tenggat dalam rentang waktu ini.');
  let out = '', last = '';
  list.forEach(t => {
    const k = t.overdue ? 'over' : dayKey(t.due);
    if (k !== last) { out += `<div class="tl-day">${t.overdue ? 'Terlambat' : dayLabel(t.due)}</div>`; last = k; }
    const T = TYPES[t.type];
    let right = '';
    if (t.role === 'student') {
      const left = t.due - now;
      right = t.overdue ? `<span class="chip red">Terlambat</span>` : left < 864e5 ? `<span class="chip orange">${short2(dur(left))} lagi</span>` : `<span class="chip blue">${t.type === 'quiz' ? 'Kerjakan' : 'Kirim tugas'}</span>`;
    } else right = t.need ? `<span class="chip orange">${t.need} perlu dinilai</span>` : t.type === 'assign' ? `<span class="chip">${t.submitted}/${t.students} terkirim</span>` : '';
    out += `<div class="li" data-go="/mod/${t.id}"><span class="aicon sm" data-p="${T.p}">${ic(T.icon)}</span><div class="grow" style="min-width:0"><div class="lt ellipsis">${esc(t.title)}</div><div class="ls ellipsis">${esc(t.course)} · ${t.overdue ? 'tenggat ' + fDT(t.due) : 'pukul ' + fTime(t.due)}</div></div>${right}</div>`;
  });
  return out;
}
function annRow(a) {
  return `<div class="li click" data-act="openAnn" data-id="${a.id}">${av(a.author, 'sm')}<div class="grow" style="min-width:0"><div class="lt ellipsis">${esc(a.title)}</div><div class="ls ellipsis">${esc(a.course || 'Pengumuman situs')} · ${rel(a.created_at)}</div></div>${ic('right', 'sm chev')}</div>`;
}
function recentRow(r) {
  if (r.kind === 'submission') return `<div class="li" data-go="/mod/${r.module_id}">${av({ name: r.who, color: r.color }, 'sm')}<div class="grow" style="min-width:0"><div class="lt ellipsis">${esc(r.who)}</div><div class="ls ellipsis">mengirim ${esc(r.title)} · ${rel(r.time)}</div></div>${r.graded ? '<span class="chip green">Dinilai</span>' : '<span class="chip orange">Baru</span>'}</div>`;
  const pct = r.max ? r.grade / r.max * 100 : 0;
  return `<div class="li" data-go="${r.kind === 'quiz' ? '/review/' + r.attempt_id : '/mod/' + r.module_id}"><span class="aicon sm" data-p="${r.kind === 'quiz' ? 'quiz' : 'assessment'}">${ic(r.kind === 'quiz' ? 'quiz' : 'assign')}</span><div class="grow" style="min-width:0"><div class="lt ellipsis">${esc(r.title)}</div><div class="ls ellipsis">${esc(r.course || '')} · ${rel(r.time)}</div></div><span class="gcell ${gClass(pct)}">${fNum(r.grade)}</span></div>`;
}
const gClass = pct => pct === null || pct === undefined ? 'none' : pct >= 75 ? 'hi' : pct >= 55 ? 'mid' : 'lo';
function findAnn(id) {
  const pools = [S.dash && S.dash.announcements, S.course && S.course.announcements, S.annList];
  for (const p of pools) { const a = (p || []).find(x => x.id === id); if (a) return a; }
  return null;
}
function showAnn(a) {
  sheet({ title: 'Pengumuman', cancel: 'Tutup', size: 'lg', body: `<div class="row" style="margin-bottom:14px">${av(a.author)}<div><b>${esc(a.author.name)}</b><div class="faint" style="font-size:13px">${esc(a.course || 'Pengumuman situs')} · ${fDT(a.created_at)}</div></div></div><h2 style="margin:0 0 10px;font-size:22px">${esc(a.title)}</h2><div class="rich">${sanitize(a.message)}</div>` });
}

/* ---------------------------------------------------------------- calendar grid */
function evColor(e) { if (e.done) return 'var(--text-3)'; if (e.kind === 'open') return 'var(--green)'; return e.type === 'quiz' ? 'var(--orange)' : 'var(--pink)'; }
function calGrid(y, m, events, sel, mini) {
  const startDow = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate(), cells = Math.ceil((startDow + days) / 7) * 7;
  const byDay = {};
  events.forEach(e => { const k = dayKey(e.time); (byDay[k] = byDay[k] || []).push(e); });
  const today = dayKey(Date.now());
  let html = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(d => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < cells; i++) {
    const d = new Date(y, m, 1 - startDow + i), k = dayKey(d.getTime()), evs = byDay[k] || [];
    html += `<div class="day ${d.getMonth() !== m ? 'out' : ''} ${k === today ? 'today' : ''} ${k === sel ? 'sel' : ''}" data-act="calDay" data-day="${k}"><span class="dn">${d.getDate()}</span>${evs.slice(0, 2).map(e => `<span class="ev" style="--ec:${evColor(e)}">${esc(e.title)}</span>`).join('')}${evs.length > 2 ? `<span class="ev" style="--ec:var(--text-2)">+${evs.length - 2} lagi</span>` : ''}<span class="dots">${evs.slice(0, 3).map(e => `<i style="--ec:${evColor(e)}"></i>`).join('')}</span></div>`;
  }
  return `<div class="cal ${mini ? 'mini' : ''}">${html}</div>`;
}

/* ==========================================================================
   KURSUS SAYA & KATALOG
   ========================================================================== */
function ccard(c) {
  const pr = c.progress;
  const tag = !c.visible ? `<span class="chip">${ic('eyeoff')} Tersembunyi</span>` : c.role === 'teacher' ? `<span class="chip">${ic('edit')} Guru</span>` : '';
  let meta = '';
  if (pr) meta = `<div class="pg grow"><div class="progress"><i data-w="${pr.pct}"></i></div><span>${pr.pct}%</span></div>`;
  else if (c.role === 'teacher') meta = `<span class="row" style="gap:5px">${ic('users', 'sm')} ${c.students || 0} siswa</span>${c.toGrade ? `<span class="chip orange">${c.toGrade} perlu dinilai</span>` : ''}`;
  else if (c.enrolled === false) meta = c.selfEnrol ? `<span class="chip blue">${ic('key')} Daftar dengan kunci</span>` : `<span class="chip">${ic('lock')} Didaftarkan guru</span>`;
  else if (c.enrolled) meta = `<span class="chip green">${ic('check')} Terdaftar</span>`;
  const teachers = Array.isArray(c.teachers) ? c.teachers.map(t => typeof t === 'string' ? { name: t, color: '#8e8e93' } : t) : [];
  return `<div class="ccard glass" data-go="/course/${c.id}">
    <div class="cover">${coverSVG(c.id, c.cover)}<div class="cv-tag">${tag}</div><div class="cv-short">${esc(c.shortname)}</div></div>
    <div class="body"><div class="cat">${esc(c.category || '')}</div><h4>${esc(c.fullname)}</h4>
      ${teachers.length ? `<div class="row" style="gap:8px"><span class="av-stack">${teachers.slice(0, 3).map(t => av(t, 'xs')).join('')}</span><span class="faint ellipsis" style="font-size:12.5px">${esc(teachers.map(t => t.name).join(', '))}</span></div>` : ''}
      <div class="meta">${meta}</div></div></div>`;
}
async function pageMyCourses() {
  setChrome({ title: 'Kursus Saya' });
  await swr('my', 'myCourses', {}, (d, c, refresh) => renderMyCourses(d, !refresh), () => skel('cards'));
}
function renderMyCourses(list, anim) {
  S.myList = list;
  const canCreate = S.user.role !== 'student', f = S.mcFilter || 'all', view = LS.get('cview', 'grid');
  setView(`<div class="ph"><div><h1>Kursus Saya</h1><p>${list.length} kursus${S.user.role === 'admin' ? ' di situs ini' : S.user.role === 'teacher' ? ' yang Anda ampu' : ' yang Anda ikuti'}</p></div>
    <div class="ph-actions"><button class="btn btn-glass" data-go="/catalog">${ic('layers', 'sm')} Katalog</button>${canCreate ? `<button class="btn btn-primary" data-act="newCourse">${ic('plus', 'sm')} Kursus baru</button>` : ''}</div></div>
    <div class="row between" style="margin:0 2px 18px;flex-wrap:wrap;gap:10px">
      <div class="seg-wrap"><div class="seg">${[['all', 'Semua'], ['now', 'Berjalan'], ['future', 'Akan datang'], ['past', 'Selesai']].map(x => `<button class="${f === x[0] ? 'on' : ''}" data-act="mcFilter" data-v="${x[0]}">${x[1]}</button>`).join('')}</div></div>
      <div class="row" style="gap:8px;flex:1;justify-content:flex-end;min-width:240px"><div class="inp-ic grow" style="max-width:320px">${ic('search', 'sm')}<input class="input sm" id="mcQ" placeholder="Cari kursus…" value="${esc(S.mcQ || '')}"></div>
      <div class="seg"><button class="${view === 'grid' ? 'on' : ''}" data-act="cview" data-v="grid" aria-label="Kartu">${ic('grid', 'sm')}</button><button class="${view === 'list' ? 'on' : ''}" data-act="cview" data-v="list" aria-label="Daftar">${ic('list', 'sm')}</button></div></div>
    </div>
    <div id="mcGrid"></div>`, anim);
  drawMyCourses(anim);
  $('#mcQ').addEventListener('input', debounce(e => { S.mcQ = e.target.value; drawMyCourses(false); }, 150));
}
function drawMyCourses(anim) {
  const now = Date.now(), f = S.mcFilter || 'all', q = (S.mcQ || '').toLowerCase();
  const list = (S.myList || []).filter(c => {
    if (q && (c.fullname + ' ' + c.shortname + ' ' + c.category).toLowerCase().indexOf(q) < 0) return false;
    if (f === 'now') return (!c.start_date || c.start_date <= now) && (!c.end_date || c.end_date >= now);
    if (f === 'future') return c.start_date && c.start_date > now;
    if (f === 'past') return c.end_date && c.end_date < now;
    return true;
  });
  const g = $('#mcGrid');
  g.innerHTML = list.length ? `<div class="cards stg ${LS.get('cview', 'grid') === 'list' ? 'clist' : ''}">${list.map(ccard).join('')}</div>`
    : `<div class="card glass">${emptyHTML('book', 'Tidak ada kursus', q ? 'Tidak ada kursus yang cocok dengan pencarian.' : S.user.role === 'student' ? 'Telusuri Katalog Kursus untuk bergabung.' : 'Buat kursus baru untuk mulai mengajar.')}</div>`;
  g.classList.toggle('no-anim', anim === false);
  afterRender(g, anim !== false);
}
async function pageCatalog() {
  setChrome({ title: 'Katalog Kursus' });
  await swr('catalog', 'catalog', {}, (d, c, refresh) => renderCatalog(d, !refresh), () => skel('cards'));
}
function renderCatalog(d, anim) {
  S.catalog = d;
  const f = S.catFilter || 'all';
  setView(`<div class="ph"><div><div class="eyebrow">Beranda situs</div><h1>Katalog Kursus</h1><p>Semua kursus yang tersedia di ${esc(S.settings.site_name)}.</p></div></div>
    <div class="row between" style="margin:0 2px 18px;flex-wrap:wrap;gap:10px">
      <div class="seg-wrap" style="max-width:100%"><div class="seg"><button class="${f === 'all' ? 'on' : ''}" data-act="catFilter" data-v="all">Semua</button>${d.categories.map(k => `<button class="${f === k.id ? 'on' : ''}" data-act="catFilter" data-v="${k.id}">${esc(k.name)}</button>`).join('')}</div></div>
      <div class="inp-ic" style="width:min(320px,100%)">${ic('search', 'sm')}<input class="input sm" id="catQ" placeholder="Cari di katalog…" value="${esc(S.catQ || '')}"></div>
    </div><div id="catGrid"></div>`, anim);
  drawCatalog(anim);
  $('#catQ').addEventListener('input', debounce(e => { S.catQ = e.target.value; drawCatalog(false); }, 150));
}
function drawCatalog(anim) {
  const d = S.catalog, f = S.catFilter || 'all', q = (S.catQ || '').toLowerCase(), cats = {};
  d.categories.forEach(k => { cats[k.id] = k.name; });
  const list = d.courses.filter(c => (f === 'all' || c.category_id === f) && (!q || (c.fullname + ' ' + c.shortname).toLowerCase().indexOf(q) >= 0))
    .map(c => Object.assign({}, c, { category: cats[c.category_id] || 'Tanpa kategori', role: c.enrolled ? c.role : null }));
  const g = $('#catGrid');
  g.innerHTML = list.length ? `<div class="cards stg">${list.map(c => ccard(Object.assign({}, c, { students: undefined, role: c.role === 'teacher' ? 'teacher' : null }))).join('')}</div>` : `<div class="card glass">${emptyHTML('layers', 'Tidak ada kursus', 'Belum ada kursus pada kategori ini.')}</div>`;
  g.classList.toggle('no-anim', anim === false);
  afterRender(g, anim !== false);
}

/* ---------------------------------------------------------------- course form */
function courseFormHTML(c, isNew) {
  c = c || { visible: true, cover: Math.floor(Math.random() * COVERS.length) };
  return `<div class="form">
    ${fInput('fullname', 'Nama lengkap kursus', c.fullname, { req: true, ph: 'mis. Koding dan Kecerdasan Artifisial' })}
    <div class="row2">${fInput('shortname', 'Nama singkat', c.shortname, { req: true, ph: 'mis. KKA-X1' })}${fSelect('category_id', 'Kategori', [['', 'Tanpa kategori']].concat(S.categories.map(k => [k.id, k.name])), c.category_id)}</div>
    <div class="field"><label class="lbl">Ringkasan kursus</label>${editor('summary', c.summary, { h: 110, ph: 'Deskripsi singkat kursus…' })}</div>
    <div class="field"><label class="lbl">Sampul kursus</label><div class="covers">${COVERS.map((x, i) => `<button type="button" class="cv-opt ${i === ((+c.cover || 0) % COVERS.length) ? 'on' : ''}" data-act="pickOne" data-cv="${i}" aria-label="Sampul ${i + 1}">${coverSVG('cover-' + (c.id || 'new') + i, i)}</button>`).join('')}</div></div>
    <div class="row2">${fInput('start_date', 'Tanggal mulai', toDateInput(c.start_date), { type: 'date' })}${fInput('end_date', 'Tanggal selesai', toDateInput(c.end_date), { type: 'date' })}</div>
    ${fInput('enrol_key', 'Kunci pendaftaran mandiri', c.enrol_key, { ph: 'Kosongkan bila siswa didaftarkan oleh guru', hint: 'Bila diisi, siswa dapat bergabung sendiri dari Katalog Kursus dengan memasukkan kunci ini.' })}
    ${isNew ? fInput('sections', 'Jumlah topik awal', 4, { type: 'number', attrs: 'min="0" max="52"' }) : ''}
    ${fSwitch('visible', 'Tampilkan kursus untuk siswa', 'Matikan untuk menyembunyikan kursus selama persiapan.', c.visible !== false)}
  </div>`;
}
function collectCourse(root, id) {
  const cv = $('.cv-opt.on', root);
  return {
    id: id || undefined, fullname: need(root, 'fullname', 'Nama lengkap kursus wajib diisi.'), shortname: need(root, 'shortname', 'Nama singkat wajib diisi.'),
    category_id: fv(root, 'category_id'), summary: edVal(root, 'summary'), cover: cv ? +cv.dataset.cv : 0,
    start_date: fromDateInput(fv(root, 'start_date')), end_date: fromDateInput(fv(root, 'end_date')), enrol_key: fv(root, 'enrol_key'),
    sections: fv(root, 'sections'), visible: fv(root, 'visible')
  };
}
function openCourseForm() {
  sheet({
    title: 'Kursus baru', ok: 'Buat', size: 'lg', body: courseFormHTML(null, true),
    onOk: async sh => {
      const r = await mutate('saveCourse', collectCourse(sh.el));
      toast('Kursus berhasil dibuat');
      await refreshBoot();
      setTimeout(() => go('/course/' + r.id), 250);
    }
  });
}

/* ==========================================================================
   HALAMAN KURSUS
   ========================================================================== */
async function pageCourse(id, tab) {
  tab = tab || 'course';
  const rk = 'recent_' + S.user.id, rec = LS.get(rk, []).filter(x => x !== id);
  rec.unshift(id); LS.set(rk, rec.slice(0, 10));
  const sameCourse = S.course && S.course.course && S.course.course.id === id;
  await swr('course:' + id, 'course', { id }, (d, c, refresh) => renderCourse(d, tab, !refresh && !sameCourse), () => skel('course'));
}
function renderCourse(d, tab, anim) {
  S.course = d;
  if (d.needEnrol) return renderEnrol(d, anim);
  const isT = d.role === 'teacher';
  const edit = `<label class="row" style="gap:8px;font-size:13.5px;font-weight:600;cursor:pointer" title="Mode edit"><span class="hide-sm">Mode edit</span><span class="switch"><input type="checkbox" id="editSw" ${S.editMode ? 'checked' : ''}><span></span></span></label>`;
  setChrome({ title: d.course.fullname, back: '/courses', extra: isT && tab === 'course' ? edit : '' });
  const sw = $('#editSw');
  if (sw) sw.addEventListener('change', () => { S.editMode = sw.checked; LS.set('edit_' + S.user.id, S.editMode); renderCourseContent(S.course, false); toast(S.editMode ? 'Mode edit aktif' : 'Mode edit nonaktif', 'info'); });
  const tabs = [['course', 'Kursus'], ['participants', 'Peserta'], ['grades', 'Nilai'], ['announcements', 'Pengumuman']];
  if (isT) tabs.push(['settings', 'Pengaturan']);
  setView(`${courseHero(d)}<div class="seg-wrap ctabs"><div class="seg lg">${tabs.map(t => `<button class="${t[0] === tab ? 'on' : ''}" data-act="ctab" data-v="${t[0]}">${t[1]}</button>`).join('')}</div></div><div id="ctab"></div>`, anim);
  if (tab === 'course') renderCourseContent(d, anim);
  else if (tab === 'participants') loadParticipants(d);
  else if (tab === 'grades') isT ? loadGradebook(d) : loadCourseGrades(d);
  else if (tab === 'announcements') loadAnnouncements(d);
  else if (tab === 'settings' && isT) renderCourseSettings(d);
}
function courseHero(d) {
  const c = d.course, p = d.progress;
  return `<section class="chero glass"><div class="cover">${coverSVG(c.id, c.cover)}</div>
    <div class="ch-in"><div style="min-width:0;flex:1">
      <div class="ch-cat">${esc(d.category || 'Kursus')} · ${esc(c.shortname)}</div>
      <h1>${esc(c.fullname)}</h1>
      <div class="ch-meta">${d.teachers && d.teachers.length ? `<span class="glass-chip"><span class="av-stack">${d.teachers.slice(0, 3).map(t => av(t, 'xs')).join('')}</span>${esc(d.teachers.map(t => t.name).join(', '))}</span>` : ''}${d.studentCount !== undefined ? `<span class="glass-chip">${ic('users', 'sm')} ${d.studentCount} siswa</span>` : ''}${!c.visible ? `<span class="glass-chip">${ic('eyeoff', 'sm')} Tersembunyi</span>` : ''}${c.end_date ? `<span class="glass-chip">${ic('calendar', 'sm')} s.d. ${fDate(c.end_date)}</span>` : ''}</div>
    </div>
    ${p ? `<div class="ch-prog">${ringBox(p.pct, 54, `${p.pct}%`, '#fff', 14)}<div><b>Progres belajar</b><small>${p.done} dari ${p.total} aktivitas selesai</small></div></div>` : ''}
    </div></section>`;
}
function renderEnrol(d, anim) {
  setChrome({ title: d.course.fullname, back: '/catalog' });
  setView(`${courseHero(d)}<section class="card glass" style="max-width:720px">
    <div class="card-h"><h3>${ic('lock')} Bergabung ke kursus</h3></div>
    ${d.course.summary ? `<div class="rich" style="margin-bottom:18px">${sanitize(d.course.summary)}</div>` : ''}
    ${d.selfEnrol ? `<div class="form"><div class="field"><label class="lbl">Kunci pendaftaran</label><div class="inp-ic">${ic('key', 'sm')}<input class="input" id="enrolKey" placeholder="Masukkan kunci dari guru"></div><div class="hint">Minta kunci pendaftaran kepada guru pengampu kursus ini.</div></div><div><button class="btn btn-primary btn-lg" data-act="enrolSelf" data-id="${d.course.id}">Daftar sekarang</button></div></div>`
    : emptyHTML('lock', 'Pendaftaran oleh guru', 'Kursus ini tidak membuka pendaftaran mandiri. Hubungi guru pengampu agar Anda didaftarkan.')}
  </section>`, anim);
  const k = $('#enrolKey');
  if (k) k.addEventListener('keydown', e => { if (e.key === 'Enter') $('[data-act="enrolSelf"]').click(); });
}
function colKey() { return 'col_' + S.course.course.id; }
function renderCourseContent(d, anim) {
  const box = $('#ctab');
  if (!box) return;
  const isT = d.role === 'teacher', edit = isT && S.editMode, col = LS.get(colKey(), {});
  const nMods = d.sections.reduce((s, x) => s + x.modules.filter(m => m.type !== 'label').length, 0);
  const index = `<aside class="cindex glass"><h5>Indeks kursus</h5>${d.sections.map(s => `<div class="ci-sec" data-act="ciGo" data-t="sec-${s.id}">${ic('down', 'xs')}<span class="ellipsis">${esc(s.title)}</span></div>${s.modules.filter(m => m.type !== 'label').map(m => `<div class="ci-mod" data-act="ciGo" data-t="mod-${m.id}">${isT ? `<span class="tdot" data-p="${TYPES[m.type].p}"></span>` : `<span class="cdot ${m.done ? 'on' : ''}">${m.done ? ic('check') : ''}</span>`}<span class="ellipsis">${esc(m.title)}</span></div>`).join('')}`).join('')}</aside>`;
  box.innerHTML = `<div class="course-layout">${index}<div>
    ${d.announcements && d.announcements[0] && Date.now() - d.announcements[0].created_at < 7 * 864e5 ? `<div class="card glass li click" data-act="openAnn" data-id="${d.announcements[0].id}" style="margin-bottom:16px;padding:14px 16px"><span class="aicon sm" data-p="interface">${ic('megaphone')}</span><div class="grow" style="min-width:0"><div class="lt ellipsis">${esc(d.announcements[0].title)}</div><div class="ls">Pengumuman terbaru · ${rel(d.announcements[0].created_at)}</div></div>${ic('right', 'sm chev')}</div>` : ''}
    <div class="row between" style="margin:0 6px 12px"><span class="faint" style="font-size:13.5px">${d.sections.length} topik · ${nMods} aktivitas</span><div class="row" style="gap:4px"><button class="btn btn-plain btn-sm" data-act="mIndex">${ic('list', 'sm')} Indeks</button><button class="btn btn-plain btn-sm" data-act="collapseAll">${Object.keys(col).some(k => col[k]) ? 'Bentangkan semua' : 'Ciutkan semua'}</button></div></div>
    <div class="stg">${d.sections.map(s => sectionHTML(s, d, edit, col)).join('')}</div>
    ${edit ? `<button class="add-act" data-act="addSection" style="height:54px">${ic('plus')} Tambah topik</button>` : ''}
    ${!nMods && !edit ? `<div class="card glass">${emptyHTML('book', 'Kursus masih kosong', isT ? 'Aktifkan Mode edit di kanan atas untuk menambahkan materi dan aktivitas.' : 'Guru belum menambahkan materi.')}</div>` : ''}
  </div></div>`;
  box.classList.toggle('no-anim', anim === false);
  afterRender(box, anim !== false);
}
function sectionHTML(s, d, edit, col) {
  const mods = s.modules, isT = d.role === 'teacher', track = mods.filter(m => m.type !== 'label'), done = track.filter(m => m.done).length;
  return `<section class="section glass ${col[s.id] ? 'collapsed' : ''} ${!s.visible ? 'dim' : ''}" id="sec-${s.id}">
    <div class="sec-h" data-act="toggleSec" data-id="${s.id}"><span class="chev">${ic('down')}</span><h3>${esc(s.title)}</h3>
      ${!s.visible ? `<span class="chip">${ic('eyeoff')} Tersembunyi</span>` : ''}
      ${!isT && track.length ? `<span class="sp">${done}/${track.length}</span>` : ''}
      ${edit ? `<div class="edit-tools"><button class="btn" data-act="secMenu" data-id="${s.id}" aria-label="Opsi topik">${ic('more')}</button></div>` : ''}
    </div>
    <div class="sec-b"><div>
      ${s.summary ? `<div class="sec-sum rich">${sanitize(s.summary)}</div>` : ''}
      <div class="mods">${mods.map(m => modRow(m, d, edit)).join('')}</div>
      ${!mods.length && !edit ? '<div class="faint" style="padding:4px 16px 14px;font-size:14px">Belum ada aktivitas.</div>' : ''}
      ${edit ? `<button class="add-act" data-act="addActivity" data-sec="${s.id}">${ic('plus')} Tambah aktivitas atau sumber daya</button>` : ''}
    </div></div></section>`;
}
function modDates(m) {
  const out = [];
  if (m.open_date) out.push(`<span>${ic('calendar', 'xs')} ${m.type === 'quiz' ? 'Dibuka' : 'Mulai'}: ${fDT(m.open_date)}</span>`);
  if (m.due_date) out.push(`<span>${ic('clock', 'xs')} ${m.type === 'quiz' ? 'Ditutup' : 'Batas'}: ${fDT(m.due_date)}</span>`);
  return out.join('');
}
function modStatus(m, d) {
  const i = m.info || {};
  if (d.role === 'teacher') {
    if (m.type === 'assign') return i.need ? `<span class="chip orange">${i.need} perlu dinilai</span>` : i.submitted ? `<span class="chip">${i.submitted} terkirim</span>` : '';
    if (m.type === 'quiz') return i.attempts ? `<span class="chip">${i.attempts} percobaan</span>` : '';
    if (m.type === 'forum') return i.discussions ? `<span class="chip">${i.discussions} diskusi</span>` : '';
    return '';
  }
  if (m.type === 'assign') {
    if (i.grade !== undefined && i.grade !== null) return `<span class="chip blue">${ic('award')} ${fNum(i.grade)}/${fNum(m.max_grade)}</span>`;
    if (i.status === 'submitted') return `<span class="chip green">${ic('check')} Terkirim</span>`;
    if (m.due_date && m.due_date < Date.now()) return `<span class="chip red">Terlambat</span>`;
    if (m.due_date && m.due_date - Date.now() < 3 * 864e5) return `<span class="chip orange">${short2(dur(m.due_date - Date.now()))} lagi</span>`;
    return `<span class="chip">Belum dikirim</span>`;
  }
  if (m.type === 'quiz') {
    if (i.grade !== undefined && i.grade !== null) return `<span class="chip blue">${ic('award')} ${fNum(i.grade)}/${fNum(m.max_grade)}</span>`;
    if (m.due_date && m.due_date < Date.now()) return `<span class="chip">Ditutup</span>`;
    return `<span class="chip">Belum dikerjakan</span>`;
  }
  if (m.type === 'forum') return m.done ? `<span class="chip green">${ic('check')} Selesai</span>` : '';
  return `<button class="done-btn ${m.done ? 'on' : ''}" data-act="toggleDone" data-id="${m.id}" title="${m.done ? 'Selesai — ketuk untuk membatalkan' : 'Tandai selesai'}" aria-label="Tandai selesai">${ic('check')}</button>`;
}
function modRow(m, d, edit) {
  const tools = edit ? `<div class="edit-tools"><button class="btn" data-act="modEye" data-id="${m.id}" title="${m.visible ? 'Sembunyikan' : 'Tampilkan'}">${ic(m.visible ? 'eye' : 'eyeoff', 'sm')}</button><button class="btn" data-act="modMenu" data-id="${m.id}" aria-label="Opsi">${ic('more')}</button></div>` : '';
  if (m.type === 'label') return `<div class="mod-label ${!m.visible ? 'dim' : ''}" id="mod-${m.id}">${edit ? `<div class="lbl-tools">${tools}</div>` : ''}<div class="rich" ${edit ? 'style="padding-right:80px"' : ''}>${sanitize(m.intro) || '<span class="faint">(Teks kosong)</span>'}</div></div>`;
  const T = TYPES[m.type] || TYPES.page;
  return `<div class="mod ${!m.visible ? 'dim' : ''}" data-go="/mod/${m.id}" id="mod-${m.id}">
    <span class="aicon" data-p="${T.p}">${ic(T.icon)}</span>
    <div class="mod-main"><div class="mt">${T.name}${!m.visible ? ' · Tersembunyi' : ''}</div><div class="mn">${esc(m.title)}</div>${m.open_date || m.due_date ? `<div class="md">${modDates(m)}</div>` : ''}</div>
    <div class="mod-side">${modStatus(m, d)}${tools}</div></div>`;
}
function findMod(id) { for (const s of S.course.sections) { const m = s.modules.find(x => x.id === id); if (m) return m; } return null; }
async function reloadCourse() {
  if (!S.course) return;
  const id = S.course.course.id;
  try {
    const d = await api('course', { id });
    S.cache.set('course:' + id, d);
    if (S.path.indexOf('/course/' + id) !== 0) return;
    S.course = d;
    const tab = (S.path.split('/')[3]) || 'course';
    renderCourse(d, tab, false);
  } catch (e) { /* sudah ditampilkan */ }
}
async function modOp(action, id, msg, extra) {
  try { await mutate(action, Object.assign({ id }, extra || {})); if (msg) toast(msg); await reloadCourse(); } catch (e) { /* sudah ditampilkan */ }
}
function openSectionForm(s) {
  const cid = S.course.course.id;
  sheet({
    title: s ? 'Edit topik' : 'Tambah topik', ok: 'Simpan', size: 'lg',
    body: `<div class="form">${fInput('title', 'Judul topik', s ? s.title : '', { req: true, ph: 'mis. Topik 5: Jaringan Komputer' })}<div class="field"><label class="lbl">Ringkasan topik</label>${editor('summary', s ? s.summary : '', { h: 110, ph: 'Tujuan pembelajaran, petunjuk, dll.' })}</div>${fSwitch('visible', 'Tampilkan untuk siswa', 'Topik tersembunyi beserta isinya tidak terlihat oleh siswa.', s ? s.visible : true)}</div>`,
    onOk: async sh => {
      await mutate('saveSection', { id: s && s.id, course_id: cid, title: fv(sh.el, 'title'), summary: edVal(sh.el, 'summary'), visible: fv(sh.el, 'visible') });
      toast('Topik disimpan');
      await reloadCourse();
    }
  });
}
function openChooser(secId) {
  const groups = [['act', 'Aktivitas'], ['res', 'Sumber daya']];
  sheet({
    title: 'Tambah aktivitas atau sumber daya', size: 'lg', cancel: 'Tutup',
    body: groups.map(g => `<div class="cho-group">${g[1]}</div><div class="chooser" style="margin-bottom:18px">${Object.keys(TYPES).filter(k => TYPES[k].group === g[0]).map((k, i) => `<button class="cho" data-type="${k}" style="--i:${i}"><span class="aicon lg" data-p="${TYPES[k].p}">${ic(TYPES[k].icon)}</span><b>${TYPES[k].name}</b><small>${TYPES[k].desc}</small></button>`).join('')}</div>`).join(''),
    onMount: s => s.body.addEventListener('click', e => {
      const b = e.target.closest('[data-type]');
      if (!b) return;
      s.close();
      setTimeout(() => openModuleForm(b.dataset.type, { courseId: S.course.course.id, sections: S.course.sections, section_id: secId, after: reloadCourse }), 260);
    })
  });
}
function openModuleForm(type, o) {
  const m = o.module || null, T = TYPES[type], cfg = (m && m.config) || {};
  const secOpts = (o.sections || []).map(s => [s.id, s.title]);
  const secVal = m ? m.section_id : o.section_id;
  const dates = (openLbl, dueLbl) => `<div class="row2">${fInput('open_date', openLbl, toInput(m && m.open_date), { type: 'datetime-local' })}${fInput('due_date', dueLbl, toInput(m && m.due_date), { type: 'datetime-local' })}</div>`;
  let body = `<div class="row" style="margin-bottom:16px"><span class="aicon lg" data-p="${T.p}">${ic(T.icon)}</span><div><b style="font-size:17px">${T.name}</b><div class="muted" style="font-size:13.5px">${T.desc}</div></div></div><div class="form">`;
  if (type !== 'label') body += fInput('title', 'Judul', m ? m.title : '', { req: true, ph: type === 'assign' ? 'mis. Tugas 1: Membuat flowchart' : type === 'quiz' ? 'mis. Kuis Bab 1' : 'Judul ' + T.name.toLowerCase() });
  if (type === 'page') body += `<div class="field"><label class="lbl">Deskripsi singkat</label><input class="input" name="introPlain" value="${esc(plain(m && m.intro))}" placeholder="Opsional — tampil di bagian atas halaman"></div><div class="field"><label class="lbl">Isi halaman <span class="req">*</span></label>${editor('body', cfg.body, { h: 260, ph: 'Tulis materi, sisipkan gambar atau video YouTube…' })}</div>`;
  else if (type === 'label') body += `<div class="field"><label class="lbl">Isi teks & media <span class="req">*</span></label>${editor('intro', m && m.intro, { h: 160 })}</div>`;
  else body += `<div class="field"><label class="lbl">${type === 'assign' ? 'Instruksi tugas' : 'Deskripsi'}</label>${editor('intro', m && m.intro, { h: 130 })}</div>`;
  if (type === 'url') body += fInput('url', 'Alamat URL', cfg.url, { req: true, ph: 'https://…', hint: 'Video YouTube, Google Drive, Docs/Slides akan ditampilkan langsung di halaman.' });
  if (type === 'file') body += `<div class="field"><label class="lbl">Berkas ${m ? '' : '<span class="req">*</span>'}</label>${cfg.file ? `<div style="margin-bottom:10px">${fileRow(cfg.file, '<span class="chip">Saat ini</span>')}</div>` : ''}${dropzone('upload', { label: m ? 'Ganti berkas (opsional)' : 'Pilih atau seret berkas ke sini' })}</div>`;
  if (type === 'assign') {
    const types = cfg.types || ['text', 'file'];
    body += dates('Diizinkan mulai', 'Batas waktu') + `<div class="row2">${fInput('max_grade', 'Nilai maksimal', m ? m.max_grade : 100, { type: 'number', attrs: 'min="1" max="1000"' })}${fInput('max_files', 'Maks. jumlah berkas', cfg.max_files || 3, { type: 'number', attrs: 'min="1" max="10"' })}</div>
      <div class="opt-stack">${fSwitch('t_text', 'Teks daring', 'Siswa mengetik jawaban langsung.', types.indexOf('text') >= 0)}${fSwitch('t_file', 'Unggah berkas', 'Siswa mengunggah dokumen/gambar.', types.indexOf('file') >= 0)}${fSwitch('allow_late', 'Terima kiriman terlambat', 'Kiriman setelah batas waktu ditandai terlambat.', cfg.allow_late !== false)}</div>`;
  }
  if (type === 'quiz') {
    body += dates('Dibuka', 'Ditutup') + `<div class="row3">${fInput('time_limit', 'Batas waktu (menit)', m ? cfg.time_limit || 0 : 30, { type: 'number', attrs: 'min="0" max="600"', hint: '0 = tanpa batas' })}${fInput('attempts', 'Kesempatan', m ? cfg.attempts || 0 : 1, { type: 'number', attrs: 'min="0" max="50"', hint: '0 = tak terbatas' })}${fInput('max_grade', 'Nilai maksimal', m ? m.max_grade : 100, { type: 'number', attrs: 'min="1" max="1000"' })}</div>
      ${fSelect('grade_method', 'Metode penilaian', Object.keys(GM).map(k => [k, GM[k]]), cfg.grade_method || 'highest')}
      <div class="opt-stack">${fSwitch('shuffle', 'Acak urutan soal', 'Setiap siswa mendapat urutan soal berbeda.', !!cfg.shuffle)}${fSwitch('shuffle_options', 'Acak urutan opsi jawaban', 'Untuk soal pilihan ganda.', m ? !!cfg.shuffle_options : true)}${fSwitch('review', 'Tampilkan kunci jawaban', 'Siswa dapat melihat jawaban benar setelah selesai.', cfg.review !== false)}</div>`;
  }
  if (type === 'forum') body += fSwitch('teacher_only', 'Hanya guru yang dapat memulai diskusi', 'Cocok untuk forum pengumuman. Siswa tetap dapat membalas.', !!cfg.teacher_only);
  body += `<div class="row2">${fSelect('section_id', 'Topik', secOpts, secVal)}<div class="field"><label class="lbl">Visibilitas</label>${fSwitch('visible', 'Tampilkan untuk siswa', '', m ? m.visible : true)}</div></div></div>`;
  sheet({
    title: (m ? 'Edit ' : 'Tambah ') + T.name, ok: 'Simpan', size: 'lg', body,
    onOk: async sh => {
      const r = sh.el, p = { id: m && m.id, type, course_id: o.courseId, section_id: fv(r, 'section_id'), visible: fv(r, 'visible'), config: {} };
      if (type !== 'label') p.title = need(r, 'title', 'Judul wajib diisi.');
      if (type === 'page') { p.intro = fv(r, 'introPlain') ? `<p>${esc(fv(r, 'introPlain'))}</p>` : ''; p.config.body = edVal(r, 'body'); if (!p.config.body) throw new Error('Isi halaman masih kosong.'); }
      else p.intro = edVal(r, 'intro');
      if (type === 'label' && !p.intro) throw new Error('Isi teks masih kosong.');
      if (type === 'url') p.config.url = need(r, 'url', 'URL wajib diisi.');
      if (type === 'assign' || type === 'quiz') { p.open_date = fromInput(fv(r, 'open_date')); p.due_date = fromInput(fv(r, 'due_date')); p.max_grade = +fv(r, 'max_grade') || 100; }
      if (type === 'assign') p.config = { types: [fv(r, 't_text') ? 'text' : '', fv(r, 't_file') ? 'file' : ''].filter(Boolean), max_files: +fv(r, 'max_files') || 3, allow_late: fv(r, 'allow_late') };
      if (type === 'quiz') p.config = { time_limit: +fv(r, 'time_limit') || 0, attempts: +fv(r, 'attempts') || 0, grade_method: fv(r, 'grade_method'), shuffle: fv(r, 'shuffle'), shuffle_options: fv(r, 'shuffle_options'), review: fv(r, 'review') };
      if (type === 'forum') p.config = { teacher_only: fv(r, 'teacher_only') };
      if (type === 'file') {
        const files = dropFiles(r, 'upload');
        if (files[0]) { toast('Mengunggah berkas…', 'info'); p.upload = await readFile(files[0]); }
        else if (!m) throw new Error('Pilih berkas untuk diunggah.');
      }
      const res = await mutate('saveModule', p);
      toast(m ? 'Perubahan disimpan' : T.name + ' ditambahkan');
      if (o.after) await o.after(res);
    }
  });
}
async function editModule(id, after) {
  try {
    const d = await api('module', { id });
    let secs = S.course && S.course.course && S.course.course.id === d.course.id ? S.course.sections : null;
    if (!secs) { const cd = await api('course', { id: d.course.id }); secs = cd.sections; }
    openModuleForm(d.module.type, { module: d.module, courseId: d.course.id, sections: secs, after: after || reloadCourse });
  } catch (e) { /* sudah ditampilkan */ }
}
function openIndexSheet() {
  const d = S.course;
  sheet({
    title: 'Indeks kursus', cancel: 'Tutup', body: `<div class="list">${d.sections.map(s => `<div class="tl-day">${esc(s.title)}</div>${s.modules.filter(m => m.type !== 'label').map(m => `<div class="li click" data-jump="mod-${m.id}"><span class="aicon sm" data-p="${TYPES[m.type].p}">${ic(TYPES[m.type].icon)}</span><div class="grow" style="min-width:0"><div class="lt ellipsis">${esc(m.title)}</div></div>${d.role !== 'teacher' && m.done ? `<span class="chip green">${ic('check')}</span>` : ''}</div>`).join('') || '<div class="faint" style="padding:4px 12px">—</div>'}`).join('')}</div>`,
    onMount: s => s.body.addEventListener('click', e => { const b = e.target.closest('[data-jump]'); if (!b) return; s.close(); setTimeout(() => jumpTo(b.dataset.jump), 300); })
  });
}
function jumpTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const sec = el.closest('.section');
  if (sec && sec.classList.contains('collapsed')) sec.classList.remove('collapsed');
  const y = el.getBoundingClientRect().top + scrollY - 96;
  window.scrollTo({ top: y, behavior: 'smooth' });
  if (el.classList.contains('mod')) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
}

/* ---------------------------------------------------------------- course: participants */
async function loadParticipants(d) {
  const box = $('#ctab'), path = S.path;
  box.innerHTML = `<div class="card glass">${'<div class="sk sk-line"></div>'.repeat(6)}</div>`;
  try {
    const r = await api('participants', { course_id: d.course.id });
    if (S.path !== path) return;
    S.parts = r;
    drawParticipants();
  } catch (e) { box.innerHTML = ''; }
}
function drawParticipants() {
  const r = S.parts, box = $('#ctab'), f = S.partF || 'all', q = (S.partQ || '').toLowerCase();
  const list = r.participants.filter(p => (f === 'all' || p.role === f) && (!q || (p.name + ' ' + (p.username || '') + ' ' + (p.kelas || '')).toLowerCase().indexOf(q) >= 0));
  const nT = r.participants.filter(p => p.role === 'teacher').length, nS = r.participants.length - nT;
  box.innerHTML = `<section class="card glass"><div class="card-h"><h3>${ic('users')} Peserta <span class="faint" style="font-weight:600">${r.participants.length}</span></h3>${r.canManage ? `<div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn btn-tinted btn-sm" data-act="partImport">${ic('upload', 'sm')} Impor Excel</button><button class="btn btn-primary btn-sm" data-act="enrolOpen">${ic('userplus', 'sm')} Daftarkan pengguna</button></div>` : ''}</div>
    <div class="row" style="flex-wrap:wrap;gap:10px;margin-bottom:12px"><div class="seg">${[['all', 'Semua'], ['teacher', 'Guru (' + nT + ')'], ['student', 'Siswa (' + nS + ')']].map(x => `<button class="${f === x[0] ? 'on' : ''}" data-act="partF" data-v="${x[0]}">${x[1]}</button>`).join('')}</div><div class="inp-ic grow" style="min-width:200px">${ic('search', 'sm')}<input class="input sm" id="partQ" placeholder="Cari nama, username, atau kelas…" value="${esc(S.partQ || '')}"></div></div>
    <div class="list">${list.map(p => `<div class="li">${av(p)}<div class="grow" style="min-width:0"><div class="lt ellipsis">${esc(p.name)}</div><div class="ls ellipsis">${esc([p.username ? '@' + p.username : '', p.kelas || '', r.canManage && p.last_login ? 'aktif ' + rel(p.last_login) : ''].filter(Boolean).join(' · ') || ROLE[p.role])}</div></div><span class="chip ${p.role === 'teacher' ? 'purple' : 'blue'}">${ROLE[p.role]}</span>${r.canManage && p.id !== S.user.id ? `<button class="btn btn-plain btn-icon btn-sm" data-act="partMenu" data-id="${p.id}">${ic('more')}</button>` : ''}</div>`).join('') || emptyHTML('users', 'Tidak ada peserta', '')}</div></section>`;
  afterRender(box, false);
  $('#partQ').addEventListener('input', debounce(e => { S.partQ = e.target.value; const pos = e.target.selectionStart; drawParticipants(); const n = $('#partQ'); n.focus(); n.setSelectionRange(pos, pos); }, 200));
}
async function openEnrolSheet() {
  const cid = S.course.course.id;
  let data;
  try { data = await api('enrolCandidates', { course_id: cid }); } catch (e) { return; }
  const picked = new Set();
  const sh = sheet({
    title: 'Daftarkan pengguna', ok: 'Daftarkan', size: 'lg',
    body: `<div class="form">
      ${data.kelas.filter(k => k.available).length ? `<div class="card glass flat" style="padding:16px"><div class="lbl" style="margin-left:0">Daftarkan satu kelas sekaligus</div><div class="row" style="flex-wrap:wrap"><select class="input grow" id="enKelas" style="min-width:180px"><option value="">— Pilih kelas —</option>${data.kelas.filter(k => k.available).map(k => `<option value="${esc(k.name)}">${esc(k.name)} (${k.available} siswa belum terdaftar)</option>`).join('')}</select><button type="button" class="btn btn-tinted" id="enKelasBtn">Daftarkan kelas</button></div></div>` : ''}
      <div class="row" style="flex-wrap:wrap;gap:10px"><div class="inp-ic grow" style="min-width:200px">${ic('search', 'sm')}<input class="input sm" id="enQ" placeholder="Cari nama, username, kelas…"></div><select class="input sm" id="enRole" style="width:auto"><option value="student">Sebagai Siswa</option><option value="teacher">Sebagai Guru</option></select></div>
      <div class="list" id="enList" style="max-height:46vh;overflow:auto;margin:0 -6px"></div></div>`,
    onOk: async () => {
      if (!picked.size) throw new Error('Pilih minimal satu pengguna.');
      const r = await mutate('enrolUsers', { course_id: cid, user_ids: Array.from(picked), role: $('#enRole', sh.el).value });
      toast(r.added + ' pengguna didaftarkan');
      loadParticipants(S.course);
    }
  });
  const draw = () => {
    const q = $('#enQ', sh.el).value.toLowerCase();
    const list = data.users.filter(u => !q || (u.name + ' ' + u.username + ' ' + u.kelas).toLowerCase().indexOf(q) >= 0).slice(0, 200);
    $('#enList', sh.el).innerHTML = list.map(u => `<div class="li click ${picked.has(u.id) ? 'on' : ''}" data-pick="${u.id}"><span class="ck ${picked.has(u.id) ? 'on' : ''}">${ic('check')}</span>${av(u, 'sm')}<div class="grow" style="min-width:0"><div class="lt ellipsis">${esc(u.name)}</div><div class="ls">@${esc(u.username)} · ${esc(u.kelas || ROLE[u.role])}</div></div></div>`).join('') || emptyHTML('users', 'Tidak ada pengguna', 'Semua pengguna sudah terdaftar.');
    const ok = $('[data-ok]', sh.el); if (ok) ok.textContent = picked.size ? 'Daftarkan (' + picked.size + ')' : 'Daftarkan';
  };
  draw();
  $('#enQ', sh.el).addEventListener('input', debounce(draw, 150));
  $('#enList', sh.el).addEventListener('click', e => { const li = e.target.closest('[data-pick]'); if (!li) return; const id = li.dataset.pick; if (picked.has(id)) picked.delete(id); else picked.add(id); draw(); });
  const kb = $('#enKelasBtn', sh.el);
  if (kb) kb.addEventListener('click', async () => {
    const k = $('#enKelas', sh.el).value;
    if (!k) { shakeIt($('#enKelas', sh.el)); return; }
    await withBusy(kb, async () => { const r = await mutate('enrolUsers', { course_id: cid, kelas: k, role: 'student' }); toast(r.added + ' siswa kelas ' + k + ' didaftarkan'); sh.close(); loadParticipants(S.course); }).catch(() => {});
  });
}

/* ---------------------------------------------------------------- course: grades */
async function loadGradebook(d) {
  const box = $('#ctab'), path = S.path;
  box.innerHTML = `<div class="card glass">${'<div class="sk sk-line"></div>'.repeat(7)}</div>`;
  let g;
  try { g = await api('gradebook', { course_id: d.course.id }); } catch (e) { box.innerHTML = ''; return; }
  if (S.path !== path) return;
  S.gb = g;
  const pctOf = (v, max) => v === null || v === undefined ? null : v / max * 100;
  box.innerHTML = `<section class="card glass"><div class="card-h"><h3>${ic('table')} Buku nilai</h3><div class="row"><span class="faint" style="font-size:13px">${g.students.length} siswa · ${g.items.length} item penilaian</span><button class="btn btn-tinted btn-sm" data-act="gbExport">${ic('download', 'sm')} Ekspor CSV</button></div></div>
    ${g.items.length && g.students.length ? `<div class="tbl-wrap"><table class="tbl gb"><thead><tr><th class="sticky">Siswa</th>${g.items.map(it => `<th class="num"><a data-go="/mod/${it.id}" style="cursor:pointer;color:inherit" title="${esc(it.title)}">${ic(TYPES[it.type].icon, 'xs')} ${esc(it.title.length > 22 ? it.title.slice(0, 21) + '…' : it.title)}</a><div style="font-weight:500;text-transform:none;letter-spacing:0">maks ${fNum(it.max_grade)}</div></th>`).join('')}<th class="num">Total</th></tr></thead>
    <tbody>${g.students.map(s => `<tr><td class="sticky"><div class="row" style="gap:8px">${av(s, 'xs')}<div><b style="font-size:13.5px">${esc(s.name)}</b><div class="faint" style="font-size:12px">${esc(s.kelas || '')}</div></div></div></td>${g.items.map(it => { const v = g.grades[s.id][it.id]; return `<td class="num"><span class="gcell ${gClass(pctOf(v, it.max_grade))}">${v === undefined || v === null ? '–' : fNum(v)}</span></td>`; }).join('')}<td class="num"><span class="gcell ${gClass(g.totals[s.id].pct)}">${g.totals[s.id].pct === null ? '–' : fNum(g.totals[s.id].pct) + '%'}</span></td></tr>`).join('')}</tbody></table></div>`
    : emptyHTML('table', g.items.length ? 'Belum ada siswa' : 'Belum ada item penilaian', g.items.length ? 'Daftarkan siswa terlebih dahulu.' : 'Tambahkan Tugas atau Kuis ke kursus ini.')}</section>`;
}
function exportGradebook() {
  const g = S.gb;
  const rows = [['Nama', 'Username', 'NISN', 'Kelas'].concat(g.items.map(i => i.title + ' (maks ' + i.max_grade + ')')).concat(['Total (%)'])];
  g.students.forEach(s => rows.push([s.name, s.username, s.nisn || '', s.kelas || ''].concat(g.items.map(i => { const v = g.grades[s.id][i.id]; return v === undefined || v === null ? '' : String(v).replace('.', ','); })).concat([g.totals[s.id].pct === null ? '' : String(g.totals[s.id].pct).replace('.', ',')])));
  downloadFile('nilai-' + g.course.shortname + '.csv', toCSV(rows));
  if (!DEMO) toast('Berkas CSV diunduh');
}
async function loadCourseGrades(d) {
  const box = $('#ctab'), path = S.path;
  box.innerHTML = `<div class="card glass">${'<div class="sk sk-line"></div>'.repeat(5)}</div>`;
  let r;
  try { r = await api('myGrades', { course_id: d.course.id }); } catch (e) { box.innerHTML = ''; return; }
  if (S.path !== path) return;
  box.innerHTML = r[0] ? gradeReportHTML(r[0], false) : `<div class="card glass">${emptyHTML('chart', 'Belum ada nilai', '')}</div>`;
  afterRender(box);
}
function gradeReportHTML(g, withHead) {
  const t = g.total;
  return `<section class="card glass">
    <div class="card-h">${withHead ? `<div class="row" style="cursor:pointer" data-go="/course/${g.course.id}"><span class="cover" style="width:44px;height:44px;border-radius:12px;overflow:hidden;position:relative;display:block">${coverSVG(g.course.id, g.course.cover)}</span><div><h3 style="font-size:16.5px">${esc(g.course.fullname)}</h3><div class="faint" style="font-size:12.5px">${t.graded} dari ${t.items} item sudah dinilai</div></div></div>` : `<h3>${ic('award')} Laporan nilai</h3>`}
    ${ringBox(t.pct || 0, 58, t.pct === null ? '–' : Math.round(t.pct) + '', t.pct === null ? 'var(--text-3)' : t.pct >= 75 ? 'var(--green)' : t.pct >= 55 ? 'var(--orange)' : 'var(--red)', 16)}</div>
    ${g.items.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Item penilaian</th><th class="num">Nilai</th><th class="num">Rentang</th><th class="num">Persentase</th></tr></thead><tbody>${g.items.map(it => { const p = it.grade === null ? null : it.grade / it.max_grade * 100; return `<tr class="click" data-go="/mod/${it.id}"><td><div class="row" style="gap:10px"><span class="aicon sm" data-p="${TYPES[it.type].p}">${ic(TYPES[it.type].icon)}</span><div style="min-width:0"><b style="font-size:14px">${esc(it.title)}</b>${it.feedback ? `<div class="faint ellipsis" style="font-size:12.5px;max-width:360px">💬 ${esc(plain(it.feedback))}</div>` : ''}</div></div></td><td class="num"><span class="gcell ${gClass(p)}">${it.grade === null ? '–' : fNum(it.grade)}</span></td><td class="num faint">0–${fNum(it.max_grade)}</td><td class="num">${p === null ? '–' : fNum(p) + '%'}</td></tr>`; }).join('')}<tr><td><b>Total kursus</b></td><td class="num"><b>${t.graded ? fNum(t.got) : '–'}</b></td><td class="num faint">${t.graded ? '0–' + fNum(t.max) : '–'}</td><td class="num"><b>${t.pct === null ? '–' : fNum(t.pct) + '%'}</b></td></tr></tbody></table></div>` : emptyHTML('chart', 'Belum ada item penilaian', '')}
  </section>`;
}

/* ---------------------------------------------------------------- course: announcements & settings */
async function loadAnnouncements(d) {
  const box = $('#ctab'), path = S.path, isT = d.role === 'teacher';
  box.innerHTML = `<div class="card glass">${'<div class="sk sk-line"></div>'.repeat(4)}</div>`;
  let list;
  try { list = await api('announcements', { course_id: d.course.id }); } catch (e) { box.innerHTML = ''; return; }
  if (S.path !== path) return;
  S.annList = list;
  box.innerHTML = `<div class="row between" style="margin:0 4px 14px"><span class="faint">${list.length} pengumuman</span>${isT ? `<button class="btn btn-primary btn-sm" data-act="annNew" data-course="${d.course.id}">${ic('plus', 'sm')} Buat pengumuman</button>` : ''}</div>
    <div class="stg">${list.map(a => annCard(a, isT)).join('') || `<div class="card glass">${emptyHTML('megaphone', 'Belum ada pengumuman', '')}</div>`}</div>`;
  afterRender(box);
}
function annCard(a, canEdit) {
  return `<article class="card glass" style="margin-bottom:14px"><div class="post-h">${av(a.author)}<div class="grow"><b>${esc(a.author.name)}</b><small>${fDT(a.created_at)} · ${rel(a.created_at)}</small></div>${canEdit ? `<button class="btn btn-plain btn-icon btn-sm" data-act="annMenu" data-id="${a.id}">${ic('more')}</button>` : ''}</div><h3 style="margin:4px 0 8px;font-size:19px">${esc(a.title)}</h3><div class="rich">${sanitize(a.message)}</div></article>`;
}
function openAnnForm(a, courseId, after) {
  sheet({
    title: a ? 'Edit pengumuman' : 'Pengumuman baru', ok: a ? 'Simpan' : 'Kirim', size: 'lg',
    body: `<div class="form">${fInput('title', 'Judul', a ? a.title : '', { req: true, ph: 'mis. Jadwal ujian praktik' })}<div class="field"><label class="lbl">Isi pengumuman</label>${editor('message', a ? a.message : '', { h: 180 })}</div></div>`,
    onOk: async sh => {
      await mutate('saveAnnouncement', { id: a && a.id, course_id: courseId || '', title: need(sh.el, 'title', 'Judul wajib diisi.'), message: edVal(sh.el, 'message') });
      toast('Pengumuman disimpan');
      if (after) after();
    }
  });
}
function renderCourseSettings(d) {
  const box = $('#ctab');
  box.innerHTML = `<section class="card glass" style="max-width:860px"><div class="card-h"><h3>${ic('sliders')} Pengaturan kursus</h3></div><div id="csForm">${courseFormHTML(Object.assign({}, d.course, { enrol_key: d.course.enrol_key }), false)}</div>
    <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn btn-primary" data-act="csSave">Simpan perubahan</button></div></section>
    <section class="card glass" style="max-width:860px;margin-top:16px"><div class="card-h"><h3 style="color:var(--red)">${ic('alert')} Zona berbahaya</h3></div><p class="muted" style="margin:0 0 14px">Menghapus kursus akan menghapus seluruh topik, materi, tugas, kuis, nilai, dan diskusi secara permanen.</p><button class="btn btn-danger" data-act="csDelete">${ic('trash', 'sm')} Hapus kursus ini</button></section>`;
  afterRender(box);
}

/* ==========================================================================
   HALAMAN AKTIVITAS
   ========================================================================== */
async function pageModule(id, sub) {
  S.modSub = sub || '';
  const same = S.mod && S.mod.module && S.mod.module.id === id;
  await swr('mod:' + id, 'module', { id }, (d, c, refresh) => renderModule(d, sub, !refresh && !same), () => skel());
}
async function reloadModule() {
  if (!S.mod) return;
  const id = S.mod.module.id;
  try {
    const d = await api('module', { id });
    S.cache.set('mod:' + id, d);
    if (S.path.indexOf('/mod/' + id) !== 0) return;
    renderModule(d, S.modSub, false);
  } catch (e) { /* sudah ditampilkan */ }
}
function renderModule(d, sub, anim) {
  S.mod = d;
  const m = d.module, T = TYPES[m.type] || TYPES.page, isT = d.role === 'teacher', cfg = m.config || {};
  setChrome({ title: m.title, back: '/course/' + d.course.id });
  const status = [];
  if (!isT && d.done) status.push(`<span class="chip green">${ic('check')} Selesai</span>`);
  if (!m.visible) status.push(`<span class="chip">${ic('eyeoff')} Tersembunyi dari siswa</span>`);
  const dates = [];
  if (m.open_date) dates.push(`<span>${m.type === 'quiz' ? 'Dibuka' : 'Dibuka'}: <b>${fDT(m.open_date)}</b></span>`);
  if (m.due_date) dates.push(`<span>${m.type === 'quiz' ? 'Ditutup' : 'Batas waktu'}: <b>${fDT(m.due_date)}</b></span>`);
  let body = '';
  if (m.type === 'page') body = `<article class="card glass rich" style="padding:26px">${sanitize(cfg.body) || '<p class="faint">Halaman kosong.</p>'}</article>`;
  else if (m.type === 'url') body = urlBody(cfg.url);
  else if (m.type === 'file') body = fileBody(cfg.file);
  else if (m.type === 'label') body = `<article class="card glass rich">${sanitize(m.intro)}</article>`;
  else if (m.type === 'assign') body = isT ? assignTeacherHTML(d) : assignStudentHTML(d);
  else if (m.type === 'quiz') body = isT ? quizTeacherHTML(d, sub) : quizStudentHTML(d);
  else if (m.type === 'forum') body = forumHTML(d);
  setView(`
    <div class="crumbs"><a data-go="/courses">Kursus Saya</a>${ic('right')}<a data-go="/course/${d.course.id}">${esc(d.course.fullname)}</a>${d.section ? ic('right') + `<a data-act="crumbSec" data-id="${d.section.id}">${esc(d.section.title)}</a>` : ''}</div>
    <div class="mhead"><span class="aicon lg" data-p="${T.p}">${ic(T.icon)}</span><div class="grow" style="min-width:0"><div class="mt">${T.name}</div><h1>${esc(m.title)}</h1>${dates.length ? `<div class="dates">${dates.join('')}</div>` : ''}${status.length ? `<div class="gap8" style="margin-top:10px">${status.join('')}</div>` : ''}</div>
      ${isT ? `<div class="row" style="gap:6px"><button class="btn btn-glass btn-sm" data-act="modEditHere">${ic('sliders', 'sm')} <span class="hide-sm">Pengaturan</span></button><button class="btn btn-glass btn-icon btn-sm" data-act="modMoreHere" aria-label="Opsi lain">${ic('more')}</button></div>` : ''}</div>
    ${m.intro && m.type !== 'label' && plain(m.intro) ? `<div class="card glass rich" style="margin-bottom:16px">${sanitize(m.intro)}</div>` : ''}
    <div class="stg">${body}</div>
    ${actNavHTML(d)}`, anim);
  if (m.type === 'assign' && isT) { drawSubList(); const q = $('#subQ'); if (q) q.addEventListener('input', debounce(e => { S.subQ = e.target.value; drawSubList(); }, 150)); if (sub === 'submissions') setTimeout(() => { const c = $('#subsCard'); if (c) window.scrollTo({ top: c.getBoundingClientRect().top + scrollY - 90, behavior: 'smooth' }); }, 350); }
  if (m.type === 'quiz' && isT) loadQuizTab(sub || 'questions');
}
function actNavHTML(d) {
  if (!d.prev && !d.next) return '';
  return `<div class="actnav">${d.prev ? `<div class="an glass" data-go="/mod/${d.prev.id}">${ic('left')}<div><small>Sebelumnya</small><b>${esc(d.prev.title)}</b></div></div>` : '<div style="flex:1"></div>'}
    <button class="btn btn-glass btn-icon" data-act="jumpMenu" aria-label="Lompat ke" style="align-self:center">${ic('list')}</button>
    ${d.next ? `<div class="an glass next" data-go="/mod/${d.next.id}"><div><small>Berikutnya</small><b>${esc(d.next.title)}</b></div>${ic('right')}</div>` : '<div style="flex:1"></div>'}</div>`;
}
function urlBody(url) {
  const em = embedUrl(url);
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { host = url; }
  return `<section class="linkcard glass"><span class="aicon lg" data-p="content">${ic(em ? 'play' : 'globe')}</span><div class="grow" style="min-width:0"><b style="font-size:16px">${esc(host)}</b><div class="lc-url">${esc(url)}</div></div><a class="btn btn-primary" href="${esc(url)}" target="_blank" rel="noopener">${ic('external', 'sm')} Buka</a></section>
    ${em ? `<div class="card glass" style="padding:10px;margin-top:16px"><iframe class="embed" src="${esc(em)}" allowfullscreen loading="lazy"></iframe></div>` : ''}`;
}
function fileBody(f) {
  if (!f) return `<div class="card glass">${emptyHTML('clip', 'Berkas tidak tersedia', '')}</div>`;
  const L = fileLinks(f), demo = /^data:/.test(f.url || ''), isImg = /^image\//.test(f.mime || ''), isPdf = /pdf/i.test(f.mime || '');
  let preview = '';
  if (isImg) preview = `<img src="${esc(demo ? f.url : imgUrl(f))}" alt="${esc(f.name)}" style="width:100%;border-radius:18px;display:block">`;
  else if (!demo || isPdf) preview = `<iframe class="embed" style="aspect-ratio:4/5;max-height:80vh" src="${esc(L.preview)}" loading="lazy"></iframe>`;
  return `<section class="card glass">${fileLinkRow(f)}${preview ? `<div style="margin-top:14px">${preview}</div>` : ''}</section>`;
}

/* ---------------------------------------------------------------- assignment */
function timeRemaining(due, sub) {
  if (!due) return 'Tidak ada batas waktu';
  if (sub && sub.status === 'submitted') {
    const diff = due - sub.submitted_at;
    return diff >= 0 ? 'Dikirim ' + dur(diff) + ' lebih awal' : `<span style="color:var(--red-t)">Dikirim terlambat ${dur(diff)}</span>`;
  }
  const diff = due - Date.now();
  return diff >= 0 ? dur(diff) + ' lagi' : `<span style="color:var(--red-t)">Terlambat ${dur(diff)}</span>`;
}
function assignStudentHTML(d) {
  const m = d.module, cfg = m.config || {}, s = d.submission, submitted = s && s.status === 'submitted', graded = s && s.grade !== null;
  const types = cfg.types || ['text', 'file'];
  const subChip = submitted ? `<span class="chip green">${ic('check')} Terkirim untuk dinilai</span>` : '<span class="chip">Belum ada kiriman</span>';
  const gradeChip = graded ? `<span class="chip blue">${ic('award')} Sudah dinilai</span>` : '<span class="chip">Belum dinilai</span>';
  const pct = graded ? s.grade / m.max_grade * 100 : 0;
  return `<section class="card glass"><div class="card-h"><h3>${ic('assign')} Status kiriman</h3></div>
    <div class="group">
      <div class="gi"><span class="k">Status kiriman</span><span class="v">${subChip}</span></div>
      <div class="gi"><span class="k">Status penilaian</span><span class="v">${gradeChip}</span></div>
      <div class="gi"><span class="k">Batas waktu</span><span class="v">${m.due_date ? fDT(m.due_date) : '—'}</span></div>
      <div class="gi"><span class="k">Sisa waktu</span><span class="v">${timeRemaining(m.due_date, s)}</span></div>
      <div class="gi"><span class="k">Terakhir diubah</span><span class="v">${s && s.submitted_at ? fDT(s.submitted_at) : '—'}</span></div>
      <div class="gi"><span class="k">Jenis kiriman</span><span class="v">${types.map(t => t === 'text' ? 'Teks daring' : 'Unggah berkas (maks ' + (cfg.max_files || 3) + ')').join(' · ')}</span></div>
    </div>
    ${s && (s.text || (s.files && s.files.length)) ? `<div style="margin-top:16px">${s.text ? `<div class="lbl">Teks daring</div><div class="card glass flat rich" style="padding:16px;margin-bottom:12px">${sanitize(s.text)}</div>` : ''}${s.files && s.files.length ? `<div class="lbl">Berkas</div><div class="files">${s.files.map(fileLinkRow).join('')}</div>` : ''}</div>` : ''}
    <div class="row" style="justify-content:center;margin-top:18px;flex-wrap:wrap">${d.canSubmit ? `<button class="btn btn-primary btn-lg" data-act="subOpen">${ic(submitted ? 'edit' : 'upload', 'sm')} ${submitted ? 'Edit kiriman' : 'Tambah kiriman'}</button>` : `<span class="chip" style="height:32px;padding:0 14px">${ic('info')} ${esc(d.reason)}</span>`}</div>
  </section>
  ${graded || (s && s.feedback) ? `<section class="card glass"><div class="card-h"><h3>${ic('award')} Umpan balik</h3></div><div class="row" style="gap:18px;align-items:center;flex-wrap:wrap">${ringBox(pct, 92, `<div style="text-align:center;line-height:1.05"><div style="font-size:24px">${fNum(s.grade)}</div><div style="font-size:11px;color:var(--text-2);font-weight:600">dari ${fNum(m.max_grade)}</div></div>`, pct >= 75 ? 'var(--green)' : pct >= 55 ? 'var(--orange)' : 'var(--red)')}<div class="grow" style="min-width:200px"><div class="group"><div class="gi"><span class="k">Dinilai pada</span><span class="v">${fDT(s.graded_at)}</span></div><div class="gi"><span class="k">Dinilai oleh</span><span class="v">${esc(s.graded_by || '—')}</span></div></div></div></div>${s.feedback ? `<div class="lbl" style="margin-top:16px">Komentar guru</div><div class="card glass flat rich" style="padding:16px">${sanitize(s.feedback)}</div>` : ''}</section>` : ''}`;
}
function openSubmitForm() {
  const d = S.mod, cfg = d.module.config || {}, sub = d.submission, types = cfg.types || ['text', 'file'];
  const existing = sub && sub.files ? sub.files.slice() : [], keep = new Set(existing.map(f => f.id));
  const body = `<div class="form">
    ${types.indexOf('text') >= 0 ? `<div class="field"><label class="lbl">Teks daring</label>${editor('text', sub ? sub.text : '', { h: 220, ph: 'Tulis jawaban Anda di sini…' })}</div>` : ''}
    ${types.indexOf('file') >= 0 ? `<div class="field"><label class="lbl">Berkas (maks ${cfg.max_files || 3})</label>${existing.length ? `<div class="files" id="oldFiles" style="margin:0 0 10px">${existing.map(f => fileRow(f, `<button type="button" class="btn btn-sm" data-keep="${f.id}">Hapus</button>`)).join('')}</div>` : ''}${dropzone('files', { max: cfg.max_files || 3 })}</div>` : ''}
    <div class="hint">${ic('info', 'xs')} Kiriman dapat diubah selama belum dinilai${d.module.due_date ? ' dan sebelum batas waktu' : ''}.</div></div>`;
  sheet({
    title: sub && sub.status === 'submitted' ? 'Edit kiriman' : 'Tambah kiriman', ok: 'Kirim', size: 'lg', body,
    onMount: s => {
      const of = $('#oldFiles', s.el);
      if (of) of.addEventListener('click', e => {
        const b = e.target.closest('[data-keep]');
        if (!b) return;
        const id = b.dataset.keep, row = b.closest('.file');
        if (keep.has(id)) { keep.delete(id); b.textContent = 'Batal'; row.style.opacity = '.4'; }
        else { keep.add(id); b.textContent = 'Hapus'; row.style.opacity = '1'; }
      });
    },
    onOk: async s => {
      const files = dropFiles(s.el, 'files');
      const payload = { id: d.module.id, text: types.indexOf('text') >= 0 ? edVal(s.el, 'text') : '', keep: Array.from(keep), files: [] };
      if (keep.size + files.length > (cfg.max_files || 3)) throw new Error('Maksimal ' + (cfg.max_files || 3) + ' berkas.');
      if (!payload.text && !keep.size && !files.length) throw new Error('Kiriman masih kosong.');
      if (files.length) { toast('Mengunggah ' + files.length + ' berkas…', 'info'); for (const f of files) payload.files.push(await readFile(f)); }
      await mutate('submitAssign', payload);
      toast('Kiriman berhasil disimpan 🎉');
      await reloadModule();
    }
  });
}
function assignTeacherHTML(d) {
  const s = d.summary, f = S.subFilter;
  return `<div class="grid g3 stg" style="margin-bottom:16px">${tile('users', ['#64d2ff', '#007aff'], s.participants, 'Peserta')}${tile('inbox', ['#5ee07f', '#1aa84a'], s.submitted, 'Terkirim')}${tile('edit', ['#ff7aa2', '#f2245c'], s.need, 'Perlu dinilai')}</div>
    <section class="card glass" id="subsCard"><div class="card-h"><h3>${ic('inbox')} Kiriman siswa</h3><button class="btn btn-tinted btn-sm" data-act="subExport">${ic('download', 'sm')} Ekspor</button></div>
      <div class="row" style="flex-wrap:wrap;gap:10px;margin-bottom:12px"><div class="seg-wrap"><div class="seg">${[['all', 'Semua'], ['need', 'Perlu dinilai'], ['sent', 'Terkirim'], ['none', 'Belum mengirim']].map(x => `<button class="${f === x[0] ? 'on' : ''}" data-act="subFilter" data-v="${x[0]}">${x[1]}</button>`).join('')}</div></div><div class="inp-ic grow" style="min-width:200px">${ic('search', 'sm')}<input class="input sm" id="subQ" placeholder="Cari siswa…" value="${esc(S.subQ || '')}"></div></div>
      <div class="list" id="subList"></div></section>`;
}
function subRows() {
  const d = S.mod, f = S.subFilter, q = (S.subQ || '').toLowerCase();
  return d.rows.filter(r => {
    if (q && (r.user.name + ' ' + (r.user.kelas || '')).toLowerCase().indexOf(q) < 0) return false;
    const sent = r.sub && r.sub.status === 'submitted';
    if (f === 'need') return sent && r.sub.grade === null;
    if (f === 'sent') return sent;
    if (f === 'none') return !sent;
    return true;
  });
}
function drawSubList() {
  const box = $('#subList');
  if (!box) return;
  const due = S.mod.module.due_date, rows = subRows();
  box.innerHTML = rows.map(r => {
    const s = r.sub, sent = s && s.status === 'submitted', late = sent && due && s.submitted_at > due;
    const st = sent ? `<span class="chip green">Terkirim</span>${late ? '<span class="chip red">Terlambat</span>' : ''}` : '<span class="chip">Belum mengirim</span>';
    const g = s && s.grade !== null ? `<span class="gcell ${gClass(s.grade / S.mod.module.max_grade * 100)}">${fNum(s.grade)}</span>` : sent ? '<span class="chip orange">Perlu dinilai</span>' : '';
    return `<div class="li click" data-act="gradeOpen" data-uid="${r.user.id}">${av(r.user)}<div class="grow" style="min-width:0"><div class="lt ellipsis">${esc(r.user.name)}</div><div class="ls ellipsis">${esc(r.user.kelas || '')}${sent ? ' · ' + fDT(s.submitted_at) : ''}${s && s.files && s.files.length ? ' · ' + s.files.length + ' berkas' : ''}</div></div><div class="gap8" style="justify-content:flex-end">${st}${g}</div>${ic('right', 'sm chev')}</div>`;
  }).join('') || emptyHTML('inbox', 'Tidak ada data', 'Tidak ada siswa pada filter ini.');
}
function openGrader(uid) {
  const d = S.mod, m = d.module;
  let rows = subRows();
  if (!rows.some(r => r.user.id === uid)) rows = d.rows;
  let idx = Math.max(0, rows.findIndex(r => r.user.id === uid)), changed = false;
  const sh = sheet({
    title: 'Penilaian', size: 'xl', ok: 'Simpan', body: '<div id="grBody"></div>',
    foot: `<button class="btn btn-glass" type="button" data-gnav="-1">${ic('left', 'sm')} <span class="hide-sm">Sebelumnya</span></button><button class="btn btn-glass" type="button" data-gnav="1"><span class="hide-sm">Berikutnya</span> ${ic('right', 'sm')}</button><span class="grow"></span><button class="btn btn-primary" type="button" data-gsave>Simpan & berikutnya</button>`,
    onOk: async () => { await save(); },
    onClose: () => { if (changed) reloadModule(); }
  });
  const draw = () => {
    const r = rows[idx], s = r.sub, sent = s && s.status === 'submitted';
    $('#grBody', sh.el).innerHTML = `<div class="row" style="margin-bottom:16px">${av(r.user, 'lg')}<div class="grow" style="min-width:0"><b style="font-size:18px">${esc(r.user.name)}</b><div class="faint">${esc(r.user.kelas || '')} · Siswa ${idx + 1} dari ${rows.length}</div></div></div>
      <div class="grid g2" style="align-items:start">
        <div><div class="lbl">Kiriman</div>${sent ? `<div class="faint" style="font-size:13px;margin:0 4px 8px">Dikirim ${fDT(s.submitted_at)}${m.due_date && s.submitted_at > m.due_date ? ' · <span style="color:var(--red-t)">terlambat ' + dur(s.submitted_at - m.due_date) + '</span>' : ''}</div>${s.text ? `<div class="card glass flat rich" style="padding:16px;margin-bottom:10px;max-height:46vh;overflow:auto">${sanitize(s.text)}</div>` : ''}${s.files && s.files.length ? `<div class="files">${s.files.map(fileLinkRow).join('')}</div>` : ''}` : emptyHTML('inbox', 'Belum ada kiriman', 'Anda tetap dapat memberi nilai.')}</div>
        <div class="form"><div class="field"><label class="lbl">Nilai (0–${fNum(m.max_grade)})</label><div class="row"><input class="input" id="grGrade" type="number" min="0" max="${m.max_grade}" step="0.01" value="${s && s.grade !== null ? s.grade : ''}" style="font-size:22px;font-weight:800;max-width:160px"><span class="faint" style="font-size:16px">/ ${fNum(m.max_grade)}</span></div></div>
          <div class="field"><label class="lbl">Komentar umpan balik</label>${editor('fb', s ? s.feedback : '', { h: 150, ph: 'Tulis umpan balik untuk siswa…' })}</div>
          ${s && s.graded_at ? `<div class="hint">Terakhir dinilai ${fDT(s.graded_at)}${s.graded_by ? ' oleh ' + esc(s.graded_by) : ''}</div>` : ''}</div>
      </div>`;
    afterRender($('#grBody', sh.el), false);
    $$('[data-gnav]', sh.el).forEach(b => { b.disabled = (+b.dataset.gnav < 0 && idx === 0) || (+b.dataset.gnav > 0 && idx === rows.length - 1); });
    const g = $('#grGrade', sh.el); g.focus({ preventScroll: true });
  };
  async function save() {
    const r = rows[idx], gv = $('#grGrade', sh.el).value.trim();
    if (gv !== '' && (isNaN(+gv) || +gv < 0 || +gv > m.max_grade)) { shakeIt($('#grGrade', sh.el)); throw new Error('Nilai harus antara 0 dan ' + m.max_grade + '.'); }
    const res = await mutate('grade', { module_id: m.id, user_id: r.user.id, grade: gv, feedback: edVal(sh.el, 'fb') });
    r.sub = Object.assign({}, r.sub || {}, res);
    changed = true;
    toast('Nilai ' + r.user.name + ' disimpan');
  }
  sh.el.addEventListener('click', async e => {
    const nb = e.target.closest('[data-gnav]');
    if (nb && !nb.disabled) { idx += +nb.dataset.gnav; draw(); return; }
    const sb = e.target.closest('[data-gsave]');
    if (sb) {
      try { await withBusy(sb, save); if (idx < rows.length - 1) { idx++; draw(); } else sh.close(true); } catch (err) { if (!err.shown) toast(err.message, 'error'); }
    }
  });
  draw();
}

/* ---------------------------------------------------------------- quiz */
function quizInfoGroup(d) {
  const m = d.module, c = m.config || {};
  return `<div class="group">
    <div class="gi"><span class="k">Dibuka</span><span class="v">${m.open_date ? fDT(m.open_date) : 'Kapan saja'}</span></div>
    <div class="gi"><span class="k">Ditutup</span><span class="v">${m.due_date ? fDT(m.due_date) : 'Tidak ditutup'}</span></div>
    <div class="gi"><span class="k">Batas waktu pengerjaan</span><span class="v">${c.time_limit ? c.time_limit + ' menit' : 'Tanpa batas'}</span></div>
    <div class="gi"><span class="k">Kesempatan mengerjakan</span><span class="v">${c.attempts ? c.attempts + ' kali' : 'Tak terbatas'}</span></div>
    <div class="gi"><span class="k">Metode penilaian</span><span class="v">${GM[c.grade_method] || GM.highest}</span></div>
    <div class="gi"><span class="k">Jumlah soal</span><span class="v">${d.questionCount} soal · ${fNum(d.totalPoints)} poin</span></div></div>`;
}
function quizStudentHTML(d) {
  const m = d.module, fin = d.attempts.filter(a => a.status === 'finished');
  const btn = d.canAttempt ? `<button class="btn btn-primary btn-lg" data-act="quizStart">${ic('play', 'sm')} ${d.inprogress ? 'Lanjutkan percobaan' : fin.length ? 'Kerjakan lagi' : 'Mulai mengerjakan'}</button>` : `<span class="chip" style="height:32px;padding:0 14px">${ic('info')} ${esc(d.reason)}</span>`;
  const pct = d.grade !== null ? d.grade / m.max_grade * 100 : 0;
  return `<section class="card glass"><div class="card-h"><h3>${ic('quiz')} Informasi kuis</h3></div>${quizInfoGroup(d)}<div class="row" style="justify-content:center;margin-top:20px">${btn}</div></section>
    ${d.attempts.length ? `<section class="card glass"><div class="card-h"><h3>${ic('clock')} Ringkasan percobaan</h3>${d.grade !== null ? `<div class="row">${ringBox(pct, 56, fNum(d.grade), pct >= 75 ? 'var(--green)' : pct >= 55 ? 'var(--orange)' : 'var(--red)', 15)}<div><b>Nilai akhir</b><div class="faint" style="font-size:12.5px">dari ${fNum(m.max_grade)}</div></div></div>` : ''}</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Status</th><th>Selesai</th><th class="num">Poin</th><th class="num">Nilai</th><th></th></tr></thead><tbody>${d.attempts.map((a, i) => `<tr><td>${i + 1}</td><td>${a.status === 'finished' ? '<span class="chip green">Selesai</span>' : '<span class="chip orange">Sedang dikerjakan</span>'}</td><td>${a.finished_at ? fDT(a.finished_at) : '—'}</td><td class="num">${a.status === 'finished' ? fNum(a.score) + '/' + fNum(a.max_score) : '—'}</td><td class="num">${a.status === 'finished' ? `<span class="gcell ${gClass(a.grade / m.max_grade * 100)}">${fNum(a.grade)}</span>` : '—'}</td><td class="num">${a.status === 'finished' ? `<button class="btn btn-plain btn-sm" data-go="/review/${a.id}">Tinjau</button>` : ''}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
}
function quizTeacherHTML(d, sub) {
  const s = d.summary, tab = sub === 'results' ? 'results' : 'questions';
  return `<div class="grid g4 stg" style="margin-bottom:16px">${tile('quiz', ['#ffb35c', '#ff6a1f'], d.questionCount, 'Soal')}${tile('award', ['#c58bff', '#8a3ff0'], d.totalPoints, 'Total poin')}${tile('users', ['#64d2ff', '#007aff'], s.attempted, 'Siswa mengerjakan')}${tile('chart', ['#5ee07f', '#1aa84a'], s.average || 0, 'Rata-rata nilai')}</div>
    <section class="card glass"><div class="card-h"><div class="seg"><button class="${tab === 'questions' ? 'on' : ''}" data-act="quizTab" data-v="questions">Soal</button><button class="${tab === 'results' ? 'on' : ''}" data-act="quizTab" data-v="results">Hasil (${s.attempts})</button><button data-act="quizTab" data-v="info">Info</button></div>
      <div class="row" style="flex-wrap:wrap;gap:6px" id="qActions">${tab === 'questions' ? `<button class="btn btn-glass btn-sm" data-go="/attempt/${d.module.id}">${ic('play', 'sm')} Pratinjau</button><button class="btn btn-tinted btn-sm" data-act="qImport">${ic('upload', 'sm')} Impor</button><button class="btn btn-primary btn-sm" data-act="qAdd">${ic('plus', 'sm')} Tambah soal</button>` : `<button class="btn btn-tinted btn-sm" data-act="resExport">${ic('download', 'sm')} Ekspor</button>`}</div></div>
      <div id="quizTab"></div></section>`;
}
async function loadQuizTab(tab) {
  const box = $('#quizTab');
  if (!box) return;
  const d = S.mod;
  if (tab === 'info') { box.innerHTML = quizInfoGroup(d); return; }
  if (tab === 'results') {
    const list = d.attempts.filter(a => a.status === 'finished');
    box.innerHTML = list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Siswa</th><th>Mulai</th><th>Durasi</th><th class="num">Poin</th><th class="num">Nilai</th><th></th></tr></thead><tbody>${list.map(a => `<tr><td><div class="row" style="gap:8px">${av(a.user, 'xs')}<div><b style="font-size:13.5px">${esc(a.user.name)}</b><div class="faint" style="font-size:12px">${esc(a.user.kelas || '')}</div></div></div></td><td>${fDT(a.started_at)}</td><td>${dur(a.finished_at - a.started_at)}</td><td class="num">${fNum(a.score)}/${fNum(a.max_score)}</td><td class="num"><span class="gcell ${gClass(a.grade / d.module.max_grade * 100)}">${fNum(a.grade)}</span></td><td class="num nowrap"><button class="btn btn-plain btn-sm" data-go="/review/${a.id}">Tinjau</button><button class="btn btn-plain btn-icon btn-sm" data-act="attDel" data-id="${a.id}" aria-label="Hapus percobaan" style="color:var(--red)">${ic('trash', 'sm')}</button></td></tr>`).join('')}</tbody></table></div>` : emptyHTML('clock', 'Belum ada percobaan', 'Hasil akan muncul setelah siswa menyelesaikan kuis.');
    return;
  }
  box.innerHTML = `<div class="sk sk-line"></div><div class="sk sk-line"></div><div class="sk sk-line" style="width:60%"></div>`;
  try { S.questions = await api('questions', { module_id: d.module.id }); } catch (e) { box.innerHTML = ''; return; }
  drawQuestions();
}
function drawQuestions() {
  const box = $('#quizTab'), qs = S.questions || [];
  if (!box) return;
  box.innerHTML = qs.length ? `<div class="stack stg">${qs.map((q, i) => qCardHTML(q, i, qs.length)).join('')}</div>` : emptyHTML('quiz', 'Belum ada soal', 'Tambahkan soal satu per satu, atau impor sekaligus dari templat Excel / format Aiken.');
  afterRender(box);
}
function qCardHTML(q, i, n) {
  let ans = '';
  if (q.type === 'mc' || q.type === 'multi') ans = `<div class="opts" style="gap:6px;margin-top:12px">${q.options.map((o, k) => { const ok = q.type === 'mc' ? q.answer === k : (q.answer || []).indexOf(k) >= 0; return `<div class="opt static ${ok ? 'correct' : ''}" style="padding:9px 12px;font-size:14.5px"><span class="ol" style="width:26px;height:26px;font-size:12px">${LETTERS[k]}</span><span class="ot">${esc(o)}</span>${ok ? ic('check', 'sm') : ''}</div>`; }).join('')}</div>`;
  else if (q.type === 'tf') ans = `<div style="margin-top:12px"><span class="chip green">${ic('check')} Kunci: ${q.answer ? 'Benar' : 'Salah'}</span></div>`;
  else ans = `<div class="gap8" style="margin-top:12px"><span class="faint" style="font-size:13px">Jawaban diterima:</span>${(q.answer || []).map(a => `<span class="chip green">${esc(a)}</span>`).join('')}</div>`;
  return `<div class="card glass flat" style="padding:16px 18px"><div class="q-head" style="margin-bottom:8px"><span class="q-no">Soal ${i + 1}</span><span class="chip">${QTL[q.type]}</span><span class="chip blue">${fNum(q.points)} poin</span><span class="grow"></span><div class="edit-tools"><button class="btn" data-act="qMove" data-id="${q.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Naik">${ic('arrowup', 'sm')}</button><button class="btn" data-act="qMove" data-id="${q.id}" data-dir="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Turun">${ic('arrowdown', 'sm')}</button><button class="btn" data-act="qEdit" data-id="${q.id}" aria-label="Edit">${ic('edit', 'sm')}</button><button class="btn" data-act="qDel" data-id="${q.id}" aria-label="Hapus">${ic('trash', 'sm')}</button></div></div><div class="rich">${sanitize(q.text)}</div>${ans}</div>`;
}
function openQuestionForm(q) {
  const st = q ? JSON.parse(JSON.stringify(q)) : { type: 'mc', text: '', options: ['', '', '', ''], answer: 0, points: 1 };
  const sh = sheet({
    title: q ? 'Edit soal' : 'Tambah soal', ok: 'Simpan', size: 'lg',
    body: `<div class="form"><div class="seg-wrap"><div class="seg block" id="qType">${QTYPES.map(t => `<button type="button" data-v="${t[0]}" class="${st.type === t[0] ? 'on' : ''}">${t[1]}</button>`).join('')}</div></div>
      <div class="field"><label class="lbl">Pertanyaan <span class="req">*</span></label>${editor('qtext', st.text, { h: 110, ph: 'Tulis pertanyaan…' })}</div>
      <div id="qAns"></div>
      <div class="field" style="max-width:200px"><label class="lbl">Poin</label><input class="input" type="number" min="0.5" step="0.5" id="qPts" value="${st.points}"></div></div>`,
    onOk: async () => {
      collect();
      st.text = edVal(sh.el, 'qtext');
      st.points = +$('#qPts', sh.el).value || 1;
      if (!st.text) throw new Error('Pertanyaan masih kosong.');
      if (st.type === 'mc' || st.type === 'multi') {
        if (st.options.some(o => !o.trim())) throw new Error('Isi semua opsi jawaban atau hapus opsi yang kosong.');
        if (st.type === 'multi' && !st.answer.length) throw new Error('Tandai minimal satu jawaban benar.');
      }
      if (st.type === 'short' && !st.answer.length) throw new Error('Isi minimal satu kunci jawaban.');
      await mutate('saveQuestion', { id: q && q.id, module_id: S.mod.module.id, type: st.type, text: st.text, options: st.options, answer: st.answer, points: st.points });
      toast('Soal disimpan');
      S.mod.questionCount += q ? 0 : 1;
      loadQuizTab('questions');
    }
  });
  const box = $('#qAns', sh.el);
  function collect() {
    if (st.type === 'mc' || st.type === 'multi') st.options = $$('[data-opt]', box).map(i => i.value);
    if (st.type === 'short') { const t = $('#qShort', box); if (t) st.answer = t.value.split('\n').map(s => s.trim()).filter(Boolean); }
  }
  function draw(focusLast) {
    if (st.type === 'mc' || st.type === 'multi') {
      box.innerHTML = `<div class="lbl">Opsi jawaban <span class="faint" style="font-weight:500">— ketuk lingkaran untuk menandai jawaban benar</span></div><div class="opt-stack">${st.options.map((o, k) => { const ok = st.type === 'mc' ? st.answer === k : st.answer.indexOf(k) >= 0; return `<div class="row"><button type="button" class="ck ${st.type === 'multi' ? 'sq' : ''} ${ok ? 'on' : ''}" data-mark="${k}" aria-label="Tandai benar" style="background:${ok ? '' : 'none'};cursor:pointer">${ic('check')}</button><span class="faint" style="font-weight:800;width:16px">${LETTERS[k]}</span><input class="input" data-opt="${k}" value="${esc(o)}" placeholder="Opsi ${LETTERS[k]}"><button type="button" class="btn btn-icon btn-sm" data-delopt="${k}" aria-label="Hapus opsi" ${st.options.length <= 2 ? 'disabled' : ''}>${ic('x', 'sm')}</button></div>`; }).join('')}</div>${st.options.length < 10 ? `<button type="button" class="btn btn-plain btn-sm" data-addopt style="margin-top:8px">${ic('plus', 'sm')} Tambah opsi</button>` : ''}`;
      if (focusLast) { const ins = $$('[data-opt]', box); ins[ins.length - 1].focus(); }
    } else if (st.type === 'tf') {
      box.innerHTML = `<div class="lbl">Kunci jawaban</div><div class="seg lg"><button type="button" class="${st.answer === true ? 'on' : ''}" data-tf="1">Benar</button><button type="button" class="${st.answer === false ? 'on' : ''}" data-tf="0">Salah</button></div>`;
      initSegs(box);
    } else {
      box.innerHTML = `<div class="field"><label class="lbl">Jawaban yang diterima (satu per baris)</label><textarea class="input" id="qShort" placeholder="mis.\nflowchart\ndiagram alir">${esc((st.answer || []).join('\n'))}</textarea><div class="hint">Penilaian tidak membedakan huruf besar/kecil dan spasi berlebih.</div></div>`;
    }
  }
  box.addEventListener('click', e => {
    const mk = e.target.closest('[data-mark]'), del = e.target.closest('[data-delopt]'), add = e.target.closest('[data-addopt]'), tf = e.target.closest('[data-tf]');
    if (mk) { collect(); const k = +mk.dataset.mark; if (st.type === 'mc') st.answer = k; else { const i = st.answer.indexOf(k); if (i >= 0) st.answer.splice(i, 1); else st.answer.push(k); } draw(); }
    else if (del && !del.disabled) {
      collect(); const k = +del.dataset.delopt; st.options.splice(k, 1);
      if (st.type === 'mc') st.answer = st.answer === k ? 0 : st.answer > k ? st.answer - 1 : st.answer;
      else st.answer = st.answer.filter(i => i !== k).map(i => i > k ? i - 1 : i);
      draw();
    } else if (add) { collect(); st.options.push(''); draw(true); }
    else if (tf) { st.answer = tf.dataset.tf === '1'; }
  });
  $('#qType', sh.el).addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    collect();
    const t = b.dataset.v, from = st.type;
    if (t === from) return;
    if (t === 'mc' || t === 'multi') {
      if (!(from === 'mc' || from === 'multi')) { st.options = st.options && st.options.length >= 2 ? st.options : ['', '', '', '']; st.answer = t === 'mc' ? 0 : []; }
      else st.answer = t === 'mc' ? (st.answer[0] || 0) : [st.answer];
    } else if (t === 'tf') st.answer = true;
    else st.answer = [];
    st.type = t;
    draw();
  });
  draw();
}
function parseAiken(text) {
  const blocks = String(text || '').replace(/\r/g, '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean), out = [], errs = [];
  blocks.forEach((b, n) => {
    const lines = b.split('\n').map(l => l.trim()).filter(Boolean);
    const ansLine = lines.find(l => /^(ANSWER|JAWABAN|KUNCI)\s*:/i.test(l));
    const optRe = /^([A-J])[.)]\s+(.+)$/;
    const firstOpt = lines.findIndex(l => optRe.test(l));
    if (!ansLine || firstOpt < 1) { errs.push('Blok ' + (n + 1) + ': format tidak dikenali'); return; }
    const opts = [], letters = [];
    lines.slice(firstOpt).forEach(l => { const m = l.match(optRe); if (m) { letters.push(m[1].toUpperCase()); opts.push(m[2]); } });
    const keys = ansLine.split(':')[1].toUpperCase().split(/[,\s]+/).filter(Boolean).map(k => letters.indexOf(k)).filter(i => i >= 0);
    if (!keys.length) { errs.push('Blok ' + (n + 1) + ': kunci jawaban tidak cocok'); return; }
    const text = lines.slice(0, firstOpt).map(esc).join('<br>');
    out.push(keys.length > 1 ? { type: 'multi', text: '<p>' + text + '</p>', options: opts, answer: keys, points: 1 } : { type: 'mc', text: '<p>' + text + '</p>', options: opts, answer: keys[0], points: 1 });
  });
  return { list: out, errs };
}
/* Impor soal dari Excel/CSV (templat "Soal Kuis") */
const QT_ALIAS = {
  pg: 'mc', pilihanganda: 'mc', pilgan: 'mc', mc: 'mc', multiplechoice: 'mc', ganda: 'mc', single: 'mc',
  pgkompleks: 'multi', pgk: 'multi', kompleks: 'multi', pilihangandakompleks: 'multi', multi: 'multi', multiple: 'multi', multipleanswer: 'multi', checkbox: 'multi',
  benarsalah: 'tf', bs: 'tf', tf: 'tf', truefalse: 'tf', benaratausalah: 'tf', betulsalah: 'tf',
  isian: 'short', isiansingkat: 'short', isi: 'short', short: 'short', shortanswer: 'short', jawabansingkat: 'short', singkat: 'short'
};
const TF_TRUE = ['benar', 'b', 'true', 't', 'ya', 'y', 'betul', '1'], TF_FALSE = ['salah', 's', 'false', 'f', 'tidak', 'n', '0'];
function mapQuizRows(table) {
  if (!table || !table.length) throw new Error('Berkas kosong.');
  const norm = h => String(h == null ? '' : h).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const qKeys = ['pertanyaan', 'soal', 'tekssoal', 'butirsoal', 'question', 'teks'];
  let hr = -1;
  for (let i = 0; i < Math.min(table.length, 12); i++) { const h = table[i].map(norm); if (qKeys.some(k => h.indexOf(k) >= 0)) { hr = i; break; } }
  if (hr < 0) throw new Error('Judul kolom "pertanyaan" tidak ditemukan. Gunakan templat Excel soal kuis yang disediakan.');
  const head = table[hr].map(norm);
  const idx = keys => { for (const k of keys) { const i = head.indexOf(k); if (i >= 0) return i; } return -1; };
  const col = {
    tipe: idx(['tipe', 'jenis', 'tipesoal', 'jenissoal', 'type']), q: idx(qKeys),
    kunci: idx(['kunci', 'kuncijawaban', 'jawaban', 'jawabanbenar', 'answer', 'key']),
    poin: idx(['poin', 'bobot', 'skor', 'nilai', 'point', 'points', 'score'])
  };
  const opt = [];
  for (let n = 0; n < 10; n++) {
    const L = 'abcdefghij'[n], i = idx(['opsi' + L, 'pilihan' + L, 'option' + L, 'opsi' + (n + 1), 'pilihan' + (n + 1), L]);
    if (i < 0) break;
    opt.push(i);
  }
  const rows = [];
  table.slice(hr + 1).forEach((r, k) => {
    const g = i => i < 0 ? '' : String(r[i] == null ? '' : r[i]).replace(/\r/g, '').trim();
    const x = { _row: r._r || hr + k + 2, tipe: g(col.tipe), text: g(col.q), opts: opt.map(g), kunci: g(col.kunci), poin: g(col.poin) };
    if (!x.text && !x.tipe && !x.kunci && !x.opts.some(Boolean)) return;
    rows.push(x);
  });
  return rows;
}
function checkQuizRow(x) {
  const issues = [], out = { _row: x._row, issues, text: x.text };
  let type = QT_ALIAS[String(x.tipe).toLowerCase().replace(/[^a-z]/g, '')] || '';
  if (x.tipe && !type) issues.push('Tipe "' + x.tipe + '" tidak dikenal');
  const last = x.opts.reduce((m, o, i) => o ? i : m, -1), opts = x.opts.slice(0, last + 1);
  const keyTokens = String(x.kunci).split(/\s*[,;/&+]\s*|\s+dan\s+|\s+/i).filter(Boolean);
  const kl = String(x.kunci).trim().toLowerCase();
  const inferred = !type && opts.length > 0;
  if (!type) {
    if (opts.length) type = keyTokens.length > 1 ? 'multi' : 'mc';
    else if (TF_TRUE.concat(TF_FALSE).indexOf(kl) >= 0) type = 'tf';
    else type = 'short';
  }
  out.type = type;
  if (!x.text) issues.push('Pertanyaan kosong');
  else if (x.text.length > 18000) issues.push('Pertanyaan terlalu panjang');
  let points = 1;
  if (x.poin !== '') { points = Number(String(x.poin).replace(',', '.')); if (!isFinite(points) || points < 0.5 || points > 100) { issues.push('Poin harus 0,5–100'); points = 1; } }
  out.points = points;
  let answer, keyLabel = '';
  if (type === 'mc' || type === 'multi') {
    if (opts.length < 2) issues.push('Minimal 2 opsi (opsi_a & opsi_b)');
    const gap = opts.findIndex(o => !o);
    if (gap >= 0) issues.push('Opsi ' + LETTERS[gap] + ' kosong — isi opsi berurutan');
    if (opts.some(o => o.length > 2000)) issues.push('Opsi terlalu panjang');
    const keys = [];
    let badKey = '';
    keyTokens.forEach(t => {
      let i = -1;
      if (/^[a-j]$/i.test(t)) i = t.toUpperCase().charCodeAt(0) - 65;
      else if (/^\d{1,2}$/.test(t)) i = +t - 1;
      else i = opts.findIndex(o => o.toLowerCase() === t.toLowerCase());
      if (i < 0 || i >= opts.length) badKey = badKey || t; else if (keys.indexOf(i) < 0) keys.push(i);
    });
    if (keys.length < keyTokens.length && keyTokens.length && opts.length) {
      const whole = opts.findIndex(o => o.toLowerCase() === kl);
      if (whole >= 0) { keys.length = 0; keys.push(whole); badKey = ''; }
    }
    keys.sort((a, b) => a - b);
    if (inferred && !badKey) type = out.type = keys.length > 1 ? 'multi' : 'mc';
    if (!x.kunci) issues.push('Kunci jawaban kosong');
    else if (badKey) issues.push('Kunci "' + badKey + '" tidak ada di opsi');
    else if (type === 'mc' && keys.length > 1) issues.push('PG hanya 1 kunci — pakai tipe pg_kompleks');
    answer = type === 'mc' ? keys[0] : keys;
    keyLabel = keys.map(i => LETTERS[i]).join(', ') + (type === 'mc' && opts[keys[0]] ? ' · ' + opts[keys[0]] : '');
    out.options = opts;
  } else if (type === 'tf') {
    if (TF_TRUE.indexOf(kl) >= 0) answer = true;
    else if (TF_FALSE.indexOf(kl) >= 0) answer = false;
    else issues.push(x.kunci ? 'Kunci benar_salah harus "Benar" atau "Salah"' : 'Kunci jawaban kosong');
    keyLabel = answer === undefined ? '' : answer ? 'Benar' : 'Salah';
    out.options = [];
  } else {
    answer = String(x.kunci).split(/\s*[|;\n]\s*/).map(s => s.trim().slice(0, 300)).filter(Boolean);
    if (!answer.length) issues.push('Isi kunci jawaban isian (pisahkan dengan |)');
    keyLabel = answer.join(' | ');
    out.options = [];
  }
  out.answer = answer; out.keyLabel = keyLabel;
  return out;
}
const quizPayload = x => ({ type: x.type, text: '<p>' + esc(x.text).replace(/\n/g, '<br>') + '</p>', options: x.options, answer: x.answer, points: x.points });
function openImportQuestions() {
  const sample = 'Perangkat yang menghubungkan dua jaringan berbeda adalah...\nA. Switch\nB. Router\nC. Hub\nD. Repeater\nANSWER: B\n\nManakah yang termasuk perangkat input?\nA. Keyboard\nB. Monitor\nC. Mouse\nD. Printer\nANSWER: A, C';
  let mode = 'xls', checked = [];
  const sh = sheet({
    title: 'Impor soal kuis', ok: 'Impor', size: 'lg',
    body: `<div class="form">
      <div class="seg block" id="qiSeg"><button type="button" class="on" data-v="xls">${ic('grid', 'sm')} Excel / CSV</button><button type="button" data-v="aiken">${ic('doc', 'sm')} Teks (Aiken)</button></div>
      <div id="qiXls" class="form">
        <div class="imp-steps"><div><span>1</span><b>Unduh templat</b><small>Kolom tipe, pertanyaan, opsi, kunci, poin</small></div><div><span>2</span><b>Tulis soal</b><small>PG, PG kompleks, benar/salah, isian</small></div><div><span>3</span><b>Unggah & periksa</b><small>Pratinjau sebelum disimpan</small></div></div>
        <div class="row" style="flex-wrap:wrap;gap:8px"><button type="button" class="btn btn-primary btn-sm" id="qtplX">${ic('download', 'sm')} Unduh templat Excel (.xlsx)</button><button type="button" class="btn btn-plain btn-sm" id="qtplC">Templat CSV</button></div>
        ${dropzone('qxls', { label: 'Pilih berkas Excel (.xlsx) atau CSV', hint: 'Lembar pertama yang dibaca · satu baris = satu soal', accept: '.xlsx,.xls,.csv,.txt' })}
        <details class="imp-paste"><summary>…atau tempel langsung dari Excel / Google Sheets</summary><textarea class="input" id="qPaste" placeholder="Salin tabel beserta baris judulnya (tipe, pertanyaan, opsi_a, …, kunci, poin) lalu tempel di sini" style="min-height:90px;margin-top:8px;font-family:ui-monospace,Menlo,monospace;font-size:13px"></textarea></details>
        <details class="imp-paste"><summary>Cara mengisi kolom tipe & kunci</summary><div class="tbl-wrap" style="margin-top:8px"><table class="tbl" style="font-size:13.5px"><thead><tr><th>tipe</th><th>Isi kolom kunci</th></tr></thead><tbody>
          <tr><td><b>pg</b></td><td>Satu huruf opsi yang benar, mis. <b>B</b></td></tr>
          <tr><td><b>pg_kompleks</b></td><td>Beberapa huruf, mis. <b>A,C</b></td></tr>
          <tr><td><b>benar_salah</b></td><td><b>Benar</b> atau <b>Salah</b> (opsi dikosongkan)</td></tr>
          <tr><td><b>isian</b></td><td>Jawaban diterima, pisahkan dengan <b>|</b> mis. <b>LAN|local area network</b></td></tr></tbody></table></div></details>
        <div id="qiPrev"></div>
      </div>
      <div id="qiAiken" class="form hidden"><div class="hint" style="margin:0 4px">Tulis soal, opsi diawali huruf (A. B. C. …), lalu baris <b>ANSWER: B</b>. Pisahkan antar-soal dengan satu baris kosong. Beberapa kunci (mis. <b>ANSWER: A, C</b>) menjadi soal PG kompleks.</div>
        <textarea class="input" id="aiken" style="min-height:300px;font-family:ui-monospace,Menlo,monospace;font-size:14px" placeholder="${esc(sample)}"></textarea>
        <div class="row between"><button type="button" class="btn btn-plain btn-sm" id="aikenSample">Gunakan contoh</button><span class="faint" id="aikenInfo" style="font-size:13px"></span></div></div>
    </div>`,
    onOk: async () => {
      let list;
      if (mode === 'aiken') {
        const r = parseAiken($('#aiken', sh.el).value);
        if (!r.list.length) throw new Error(r.errs[0] || 'Tidak ada soal yang terbaca.');
        list = r.list;
      } else {
        if (!checked.length) throw new Error('Pilih berkas Excel atau tempel tabel soal terlebih dahulu.');
        const ok = checked.filter(x => !x.issues.length);
        if (!ok.length) throw new Error('Tidak ada soal yang siap diimpor. Perbaiki baris yang bermasalah lalu unggah ulang.');
        if (ok.length > 300) throw new Error('Maksimal 300 soal sekali impor. Bagi berkas menjadi beberapa bagian.');
        list = ok.map(quizPayload);
      }
      const res = await mutate('importQuestions', { module_id: S.mod.module.id, questions: list });
      const skipped = mode === 'xls' ? checked.filter(x => x.issues.length).length : 0;
      toast(res.added + ' soal berhasil diimpor' + (skipped ? ' · ' + skipped + ' baris dilewati' : ''));
      loadQuizTab('questions');
    }
  });
  const el = sh.el, okBtn = $('[data-ok]', el), prev = $('#qiPrev', el);
  const ta = $('#aiken', el), info = $('#aikenInfo', el);
  const updAiken = () => { const r = parseAiken(ta.value); info.innerHTML = ta.value.trim() ? `<b style="color:var(--green-t)">${r.list.length} soal terbaca</b>${r.errs.length ? ` · <span style="color:var(--red-t)">${r.errs.length} gagal</span>` : ''}` : ''; okBtn.textContent = r.list.length ? 'Impor (' + r.list.length + ')' : 'Impor'; };
  const draw = () => {
    const okN = checked.filter(x => !x.issues.length).length, badN = checked.length - okN;
    okBtn.textContent = okN ? 'Impor (' + okN + ')' : 'Impor';
    if (!checked.length) { prev.innerHTML = ''; return; }
    const tl = { mc: 'PG', multi: 'PG kompleks', tf: 'Benar/Salah', short: 'Isian' };
    prev.innerHTML = `<div class="row between" style="margin:0 4px 8px;flex-wrap:wrap"><b>Pratinjau soal</b><div class="gap8"><span class="chip green">${ic('check')} ${okN} siap</span>${badN ? `<span class="chip red">${ic('x')} ${badN} bermasalah</span>` : ''}</div></div>
      <div class="tbl-wrap" style="max-height:320px;overflow:auto"><table class="tbl nw"><thead><tr><th>Baris</th><th>Tipe</th><th>Pertanyaan</th><th>Kunci</th><th>Poin</th><th>Status</th></tr></thead><tbody>${checked.slice(0, 300).map(x => `<tr><td class="faint">${x._row}</td><td><span class="chip">${tl[x.type] || '—'}</span></td><td><div class="ellipsis" style="max-width:260px" title="${esc(x.text)}">${esc(x.text || '—')}</div></td><td><div class="ellipsis" style="max-width:170px">${esc(x.keyLabel || '—')}</div></td><td>${fNum(x.points)}</td><td>${x.issues.length ? `<span style="color:var(--red-t);white-space:normal;display:block;min-width:160px">${esc(x.issues.join(' · '))}</span>` : `<span style="color:var(--green-t)">${ic('check', 'sm')} Siap</span>`}</td></tr>`).join('')}</tbody></table></div>
      ${checked.length > 300 ? `<div class="hint">Menampilkan 300 dari ${checked.length} baris.</div>` : ''}${badN ? '<div class="hint">Baris bermasalah tidak ikut diimpor. Perbaiki di Excel lalu unggah ulang bila perlu.</div>' : ''}`;
  };
  const show = table => {
    try { const rows = mapQuizRows(table); if (!rows.length) throw new Error('Belum ada soal di bawah baris judul kolom.'); checked = rows.map(checkQuizRow); draw(); }
    catch (e) { checked = []; okBtn.textContent = 'Impor'; prev.innerHTML = `<div class="err-msg">${esc(e.message)}</div>`; }
  };
  const readPicked = async () => {
    const f = dropFiles(el, 'qxls')[0];
    if (!f) return;
    prev.innerHTML = `<div class="row" style="gap:10px;padding:8px 4px"><span class="spinner"></span><span class="muted">Membaca ${esc(f.name)}…</span></div>`;
    try { show(await readTable(f)); } catch (e) { checked = []; prev.innerHTML = `<div class="err-msg">${esc(e.message)}</div>`; }
  };
  $('#qiSeg', el).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.classList.contains('on')) return;
    segSelect(b); mode = b.dataset.v;
    $('#qiXls', el).classList.toggle('hidden', mode !== 'xls'); $('#qiAiken', el).classList.toggle('hidden', mode !== 'aiken');
    $(mode === 'xls' ? '#qiXls' : '#qiAiken', el).classList.add('fade-in');
    if (mode === 'xls') draw(); else updAiken();
  });
  $('#qtplX', el).addEventListener('click', e => downloadTemplate('kuis', 'xlsx', e.currentTarget));
  $('#qtplC', el).addEventListener('click', () => downloadTemplate('kuis', 'csv'));
  $('#qPaste', el).addEventListener('input', debounce(e => { if (e.target.value.trim()) show(parseCSV(e.target.value)); else { checked = []; draw(); } }, 250));
  $('.drop input', el).addEventListener('change', () => setTimeout(readPicked, 30));
  $('.drop', el).addEventListener('drop', () => setTimeout(readPicked, 30));
  ta.addEventListener('input', debounce(updAiken, 200));
  $('#aikenSample', el).addEventListener('click', () => { ta.value = sample; updAiken(); });
}

/* ---------------------------------------------------------------- quiz attempt */
async function pageAttempt(moduleId) {
  setChrome({ title: 'Kuis', back: '/mod/' + moduleId, focus: true });
  skel();
  let d;
  try { d = await api('startAttempt', { id: moduleId }); } catch (e) { go('/mod/' + moduleId, true); return; }
  if (S.path !== '/attempt/' + moduleId) return;
  if (d.finished) { toast('Waktu habis — jawaban terakhir Anda dikirim otomatis.', 'info'); go('/review/' + d.attempt_id, true); return; }
  const A = S.att = { d, i: 0, ans: Object.assign({}, d.attempt.answers || {}), flags: LS.get('flag_' + d.attempt.id, {}), dirty: false, skew: d.attempt.now - Date.now(), finishing: false, summary: false, dir: 'in-r' };
  setChrome({ title: d.quiz.title, back: '/mod/' + moduleId, focus: true });
  renderAttempt();
  if (d.attempt.deadline) { A.timer = setInterval(tick, 1000); tick(); }
  A.autosave = setInterval(() => saveAttempt(), 25000);
  const bu = () => { if (A.dirty) saveAttempt(); };
  window.addEventListener('beforeunload', bu);
  S.onLeave = () => { clearInterval(A.timer); clearInterval(A.autosave); window.removeEventListener('beforeunload', bu); if (A.dirty && !A.finishing) saveAttempt(); };
}
function isAnswered(q) { const a = S.att.ans[q.id]; return !(a === undefined || a === null || a === '' || (Array.isArray(a) && !a.length)); }
function renderAttempt() {
  const A = S.att, d = A.d, qs = d.questions, n = qs.length;
  const answered = qs.filter(isAnswered).length;
  const side = `<aside class="att-side glass"><div class="row between" style="margin-bottom:12px"><b>${d.attempt.preview ? 'Pratinjau (guru)' : 'Navigasi soal'}</b><span class="faint" style="font-size:12.5px" id="ansCount">${answered}/${n} dijawab</span></div>
    ${d.attempt.deadline ? `<div class="timer" id="timer">${ic('clock')}<span>--:--</span></div>` : ''}
    <div class="qnav" id="qnav">${qs.map((x, k) => `<button class="qn ${isAnswered(x) ? 'ans' : ''} ${k === A.i && !A.summary ? 'cur' : ''} ${A.flags[x.id] ? 'flag' : ''}" data-act="qGo" data-k="${k}" aria-label="Soal ${k + 1}">${k + 1}</button>`).join('')}</div>
    <button class="btn btn-tinted w100" style="margin-top:14px" data-act="attSummary">Selesaikan percobaan…</button></aside>`;
  let main;
  if (A.summary) {
    main = `<section class="qcard glass ${A.dir}"><div class="q-no" style="margin-bottom:6px">Ringkasan percobaan</div><h2 style="margin:0 0 14px;font-size:22px">${esc(d.quiz.title)}</h2>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Soal</th><th>Status</th><th></th></tr></thead><tbody>${qs.map((q, k) => `<tr class="click" data-act="qGo" data-k="${k}"><td><b>${k + 1}</b> <span class="faint">${QTL[q.type]}</span>${A.flags[q.id] ? ' <span class="chip orange">' + ic('flag') + ' Ditandai</span>' : ''}</td><td>${isAnswered(q) ? '<span class="chip green">Sudah dijawab</span>' : '<span class="chip red">Belum dijawab</span>'}</td><td class="num">${ic('right', 'sm')}</td></tr>`).join('')}</tbody></table></div>
      ${answered < n ? `<p class="muted" style="margin:14px 4px 0">${ic('alert', 'sm')} Masih ada ${n - answered} soal yang belum dijawab.</p>` : ''}
      <div class="att-foot"><button class="btn btn-glass" data-act="qGo" data-k="0">${ic('left', 'sm')} Kembali ke soal</button><button class="btn btn-primary" data-act="attFinish">${ic('send', 'sm')} Kirim semua & selesai</button></div></section>`;
  } else {
    const q = qs[A.i];
    main = questionHTML(q, A.i) + `<div class="att-foot"><button class="btn btn-glass" data-act="qPrev" ${A.i === 0 ? 'disabled' : ''}>${ic('left', 'sm')} Sebelumnya</button>${A.i < n - 1 ? `<button class="btn btn-primary" data-act="qNext">Berikutnya ${ic('right', 'sm')}</button>` : `<button class="btn btn-primary" data-act="attSummary">Selesai ${ic('check', 'sm')}</button>`}</div>`;
  }
  setView(`<div class="att"><div>${main}</div>${side}</div>`, false);
  const sa = $('#shortAns');
  if (sa) sa.addEventListener('input', () => { A.ans[sa.dataset.q] = sa.value; A.dirty = true; refreshQNav(); });
  tick();
}
function questionHTML(q, k) {
  const A = S.att, a = A.ans[q.id];
  let body;
  if (q.type === 'mc' || q.type === 'multi') {
    body = `<div class="opts">${q.options.map((o, j) => { const on = q.type === 'mc' ? a === o.i : Array.isArray(a) && a.indexOf(o.i) >= 0; return `<button class="opt ${q.type === 'multi' ? 'sq' : ''} ${on ? 'on' : ''}" data-act="pick" data-q="${q.id}" data-i="${o.i}"><span class="ol">${LETTERS[j]}</span><span class="ot">${esc(o.t)}</span></button>`; }).join('')}</div>${q.type === 'multi' ? '<div class="hint">Pilih semua jawaban yang benar.</div>' : ''}`;
  } else if (q.type === 'tf') {
    body = `<div class="tf">${[[true, 'Benar'], [false, 'Salah']].map(x => `<button class="opt ${a === x[0] ? 'on' : ''}" data-act="pick" data-q="${q.id}" data-tf="${x[0]}">${x[1]}</button>`).join('')}</div>`;
  } else {
    body = `<input class="input" id="shortAns" data-q="${q.id}" placeholder="Ketik jawaban Anda…" value="${esc(a || '')}" autocomplete="off" style="font-size:17px">`;
  }
  return `<section class="qcard glass ${A.dir || ''}"><div class="q-head"><span class="q-no">Soal ${k + 1} dari ${A.d.questions.length}</span><span class="chip">${fNum(q.points)} poin</span><span class="grow"></span><button class="btn btn-sm ${A.flags[q.id] ? 'btn-tinted' : ''}" data-act="flagQ" data-q="${q.id}">${ic('flag', 'sm')} ${A.flags[q.id] ? 'Ditandai' : 'Tandai'}</button></div><div class="q-text rich">${sanitize(q.text)}</div>${body}</section>`;
}
function refreshQNav() {
  const A = S.att, qs = A.d.questions;
  $$('#qnav .qn').forEach((b, k) => { b.classList.toggle('ans', isAnswered(qs[k])); b.classList.toggle('flag', !!A.flags[qs[k].id]); });
  const c = $('#ansCount'); if (c) c.textContent = qs.filter(isAnswered).length + '/' + qs.length + ' dijawab';
}
function tick() {
  const A = S.att;
  if (!A || !A.d.attempt.deadline) return;
  const left = A.d.attempt.deadline - (Date.now() + A.skew), el = $('#timer');
  if (el) {
    const s = Math.max(0, Math.floor(left / 1000)), h = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    $('span', el).textContent = (h ? h + ':' + pad(mm) : pad(mm)) + ':' + pad(ss);
    el.classList.toggle('warn', left < 300000 && left >= 60000);
    el.classList.toggle('danger', left < 60000);
  }
  if (left <= 0 && !A.finishing) { clearInterval(A.timer); toast('Waktu habis! Jawaban dikirim otomatis.', 'info'); finishAttempt(true); }
}
function saveAttempt() {
  const A = S.att;
  if (!A || !A.dirty || A.finishing) return;
  A.dirty = false;
  api('saveAttempt', { id: A.d.attempt.id, answers: A.ans }, { silent: true }).catch(() => { A.dirty = true; });
}
async function finishAttempt(auto) {
  const A = S.att;
  if (!A || A.finishing) return;
  A.finishing = true;
  clearInterval(A.timer); clearInterval(A.autosave);
  setView(`<div class="card glass" style="max-width:420px;margin:60px auto;text-align:center;padding:40px 20px"><span class="spinner" style="width:40px;height:40px;border-width:3px"></span><h3 style="margin:18px 0 4px">Mengirim jawaban…</h3><p class="muted" style="margin:0">Mohon tunggu sebentar.</p></div>`, false);
  for (let tries = 0; tries < 3; tries++) {
    try {
      await mutate('finishAttempt', { id: A.d.attempt.id, answers: A.ans }, { silent: tries < 2 });
      LS.del('flag_' + A.d.attempt.id);
      S.onLeave = null; S.justFinished = A.d.attempt.id;
      go('/review/' + A.d.attempt.id, true);
      return;
    } catch (e) { if (e.auth) return; await new Promise(r => setTimeout(r, 1500)); }
  }
  A.finishing = false;
  renderAttempt();
}
async function pageReview(id) {
  setChrome({ title: 'Tinjauan kuis' });
  skel();
  let d;
  try { d = await api('review', { id }); } catch (e) { renderError(e); return; }
  if (S.path !== '/review/' + id) return;
  const a = d.attempt, q = d.quiz, pct = q.max_grade ? a.grade / q.max_grade * 100 : 0, fresh = S.justFinished === id;
  S.justFinished = null;
  setChrome({ title: q.title, back: '/mod/' + q.id });
  const color = pct >= 75 ? 'var(--green)' : pct >= 55 ? 'var(--orange)' : 'var(--red)';
  const msg = pct >= 90 ? 'Luar biasa! 🏆' : pct >= 75 ? 'Kerja bagus! 🎉' : pct >= 55 ? 'Cukup baik, terus berlatih 💪' : 'Jangan menyerah, pelajari lagi ya 📚';
  const conf = fresh && pct >= 75 ? `<div class="confetti">${Array.from({ length: 46 }, (_, i) => `<i style="left:${(i * 2.2 + Math.random() * 3).toFixed(1)}%;background:${['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de', '#ff2d55'][i % 7]};--dx:${(Math.random() * 120 - 60) | 0}px;--rot:${(Math.random() * 720 - 360) | 0}deg;animation-delay:${(Math.random() * .5).toFixed(2)}s"></i>`).join('')}</div>` : '';
  setView(`<div class="crumbs"><a data-go="/course/${q.course_id}">Kursus</a>${ic('right')}<a data-go="/mod/${q.id}">${esc(q.title)}</a>${ic('right')}<span>Tinjauan</span></div>
    <div class="split"><div class="stack stg">
      <section class="result-hero glass">${conf}${ringBox(pct, 150, `<div style="line-height:1"><div style="font-size:40px">${fNum(a.grade)}</div><div style="font-size:13px;color:var(--text-2);font-weight:600;margin-top:4px">dari ${fNum(q.max_grade)}</div></div>`, color)}
        <h2>${d.role === 'teacher' && d.user ? esc(d.user.name) : msg}</h2><p class="muted" style="margin:0">${fNum(a.score)} dari ${fNum(a.max_score)} poin · ${fNum(pct)}%${a.preview ? ' · Pratinjau guru' : ''}</p></section>
      ${d.items.map((it, k) => reviewItemHTML(it, k, d.showAnswers)).join('')}
    </div>
    <div class="stack"><section class="card glass" style="position:sticky;top:90px"><div class="card-h"><h3>Ringkasan</h3></div><div class="group">
      ${d.user ? `<div class="gi"><span class="k">Peserta</span><span class="v">${esc(d.user.name)}</span></div>` : ''}
      <div class="gi"><span class="k">Dimulai</span><span class="v">${fDT(a.started_at)}</span></div>
      <div class="gi"><span class="k">Selesai</span><span class="v">${fDT(a.finished_at)}</span></div>
      <div class="gi"><span class="k">Waktu pengerjaan</span><span class="v">${dur(a.finished_at - a.started_at)}</span></div>
      <div class="gi"><span class="k">Nilai</span><span class="v">${fNum(a.grade)} / ${fNum(q.max_grade)}</span></div></div>
      <div class="qnav" style="margin-top:14px">${d.items.map((it, k) => `<button class="qn ${it.response === null ? '' : it.fraction >= 1 ? 'ok' : it.fraction > 0 ? 'part' : 'bad'}" data-act="rvJump" data-k="${k}">${k + 1}</button>`).join('')}</div>
      <button class="btn btn-primary w100" style="margin-top:14px" data-go="/mod/${q.id}">Kembali ke kuis</button></section></div></div>`);
}
function reviewItemHTML(it, k, show) {
  const r = it.response, c = it.correct;
  const badge = r === null ? '<span class="rv-badge bad">Tidak dijawab</span>' : it.fraction >= 1 ? `<span class="rv-badge ok">${ic('check', 'sm')} Benar</span>` : it.fraction > 0 ? '<span class="rv-badge part">Sebagian benar</span>' : `<span class="rv-badge bad">${ic('x', 'sm')} Salah</span>`;
  let body = '';
  if (it.type === 'mc' || it.type === 'multi') {
    const R = it.type === 'mc' ? (r === null ? [] : [r]) : (r || []), C = c === undefined ? null : (it.type === 'mc' ? [c] : c);
    body = `<div class="opts">${it.options.map((o, j) => {
      const picked = R.indexOf(o.i) >= 0, right = C ? C.indexOf(o.i) >= 0 : (picked && it.fraction >= 1);
      const cls = right && (picked || show) ? 'correct' : picked ? 'wrong' : '';
      return `<div class="opt static ${cls}"><span class="ol">${LETTERS[j]}</span><span class="ot">${esc(o.t)}</span>${picked ? '<span class="chip">Jawaban Anda</span>' : ''}</div>`;
    }).join('')}</div>`;
  } else if (it.type === 'tf') {
    body = `<div class="tf">${[[true, 'Benar'], [false, 'Salah']].map(x => { const picked = r === x[0], right = c !== undefined ? c === x[0] : (picked && it.fraction >= 1); return `<div class="opt static ${right && (picked || show) ? 'correct' : picked ? 'wrong' : ''}">${x[1]}</div>`; }).join('')}</div>`;
  } else {
    body = `<div class="group"><div class="gi"><span class="k">Jawaban Anda</span><span class="v">${r === null ? '<span class="faint">—</span>' : esc(r)}</span></div>${c ? `<div class="gi"><span class="k">Jawaban diterima</span><span class="v">${c.map(esc).join(', ')}</span></div>` : ''}</div>`;
  }
  return `<section class="qcard glass" id="rv-${k}"><div class="q-head"><span class="q-no">Soal ${k + 1}</span>${badge}<span class="grow"></span><span class="chip">${fNum(it.score)} / ${fNum(it.points)} poin</span></div><div class="q-text rich">${sanitize(it.text)}</div>${body}</section>`;
}

/* ---------------------------------------------------------------- forum */
function forumHTML(d) {
  return `<section class="card glass"><div class="card-h"><h3>${ic('forum')} Topik diskusi <span class="faint" style="font-weight:600">${d.discussions.length}</span></h3>${d.canStart ? `<button class="btn btn-primary btn-sm" data-act="discNew">${ic('plus', 'sm')} Topik baru</button>` : ''}</div>
    <div class="list">${d.discussions.map(x => `<div class="li" data-go="/discussion/${x.id}">${av(x.author)}<div class="grow" style="min-width:0"><div class="lt ellipsis">${esc(x.subject)}</div><div class="ls ellipsis">${esc(x.author.name)} · ${esc(x.excerpt)}</div><div class="ls faint" style="font-size:12px;margin-top:2px">Terakhir: ${esc(x.last_by)} · ${rel(x.last_at)}</div></div><span class="chip ${x.replies ? 'blue' : ''}">${ic('reply')} ${x.replies}</span></div>`).join('') || emptyHTML('forum', 'Belum ada diskusi', d.canStart ? 'Mulai topik diskusi pertama!' : '')}</div></section>`;
}
function openDiscussionForm() {
  sheet({
    title: 'Topik diskusi baru', ok: 'Kirim', size: 'lg',
    body: `<div class="form">${fInput('subject', 'Judul', '', { req: true, ph: 'Apa yang ingin didiskusikan?' })}<div class="field"><label class="lbl">Pesan <span class="req">*</span></label>${editor('message', '', { h: 180 })}</div></div>`,
    onOk: async sh => {
      const r = await mutate('forumPost', { module_id: S.mod.module.id, subject: need(sh.el, 'subject', 'Judul wajib diisi.'), message: edVal(sh.el, 'message') });
      toast('Topik diskusi dibuat');
      setTimeout(() => go('/discussion/' + r.discussion_id), 250);
    }
  });
}
async function pageDiscussion(id) {
  setChrome({ title: 'Diskusi' });
  await swr('disc:' + id, 'discussion', { id }, (d, c, refresh) => renderDiscussion(d, !refresh), () => skel());
}
function renderDiscussion(d, anim) {
  S.disc = d;
  setChrome({ title: d.discussion.subject, back: '/mod/' + d.module.id });
  const by = {};
  d.posts.forEach(p => { const k = p.parent_id || '_'; (by[k] = by[k] || []).push(p); });
  const out = [];
  (function walk(pid, depth) { (by[pid] || []).forEach(p => { out.push([p, depth]); walk(p.id, Math.min(depth + 1, 4)); }); })('_', 0);
  setView(`<div class="crumbs"><a data-go="/course/${d.course.id}">${esc(d.course.fullname)}</a>${ic('right')}<a data-go="/mod/${d.module.id}">${esc(d.module.title)}</a></div>
    <div class="ph"><div><div class="eyebrow">Diskusi</div><h1>${esc(d.discussion.subject)}</h1><p>${d.posts.length - 1} balasan</p></div><div class="ph-actions"><button class="btn btn-primary" data-act="replyPost" data-id="${d.discussion.id}">${ic('reply', 'sm')} Balas</button></div></div>
    <div class="stg">${out.map(x => { const p = x[0], dp = x[1]; return `<article class="post glass ${dp ? 'reply' : ''}" style="--d:${dp}"><div class="post-h">${av(p.author)}<div class="grow"><b>${esc(p.author.name)}</b>${p.author.role === 'teacher' || p.author.role === 'admin' ? ' <span class="chip purple" style="height:20px;font-size:11px">Guru</span>' : ''}<small>${fDT(p.created_at)} · ${rel(p.created_at)}</small></div></div>${dp === 0 ? `<h3 style="margin:2px 0 8px;font-size:18px">${esc(p.subject)}</h3>` : ''}<div class="rich">${sanitize(p.message)}</div><div class="post-f">${p.canDelete ? `<button class="btn btn-plain btn-sm" data-act="delPost" data-id="${p.id}" style="color:var(--red)">${ic('trash', 'sm')} Hapus</button>` : ''}<button class="btn btn-plain btn-sm" data-act="replyPost" data-id="${p.id}">${ic('reply', 'sm')} Balas</button></div></article>`; }).join('')}</div>`, anim);
}
function openReply(parentId) {
  const d = S.disc, p = d.posts.find(x => x.id === parentId);
  sheet({
    title: 'Balas', ok: 'Kirim', size: 'lg',
    body: `${p ? `<div class="card glass flat" style="padding:12px 14px;margin-bottom:14px"><div class="row" style="gap:8px;margin-bottom:6px">${av(p.author, 'xs')}<b style="font-size:13.5px">${esc(p.author.name)}</b></div><div class="faint" style="font-size:13.5px;max-height:80px;overflow:hidden">${esc(plain(p.message).slice(0, 240))}</div></div>` : ''}${editor('message', '', { h: 160, ph: 'Tulis balasan…' })}`,
    onOk: async sh => {
      await mutate('forumPost', { discussion_id: d.discussion.id, parent_id: parentId, message: edVal(sh.el, 'message') });
      toast('Balasan terkirim');
      const nd = await api('discussion', { id: d.discussion.id });
      S.cache.set('disc:' + d.discussion.id, nd);
      renderDiscussion(nd, false);
    }
  });
}

/* ==========================================================================
   KALENDER, NILAI, NOTIFIKASI
   ========================================================================== */
async function pageCalendar() {
  setChrome({ title: 'Kalender' });
  if (!S.cal) { const n = new Date(); S.cal = { y: n.getFullYear(), m: n.getMonth(), sel: dayKey(Date.now()) }; }
  await swr('cal', 'calendar', {}, (d, c, refresh) => { S.calEvents = d.events; renderCalendar(!refresh); }, () => skel());
}
function evRow(e) {
  const T = TYPES[e.type];
  return `<div class="li" data-go="/mod/${e.module_id}"><span class="aicon sm" data-p="${T.p}">${ic(T.icon)}</span><div class="grow" style="min-width:0"><div class="lt ellipsis">${esc(e.title)}</div><div class="ls ellipsis">${e.kind === 'due' ? (e.type === 'quiz' ? 'Ditutup' : 'Batas waktu') : 'Dibuka'} ${fTime(e.time)} · ${esc(e.course)}</div></div>${e.done && e.role === 'student' ? `<span class="chip green">${ic('check')}</span>` : ''}</div>`;
}
function renderCalendar(anim) {
  const c = S.cal, ev = S.calEvents, selT = fromDateInput(c.sel), dayEv = ev.filter(e => dayKey(e.time) === c.sel), now = Date.now();
  const up = ev.filter(e => e.time >= now && e.time - now < 30 * 864e5).slice(0, 12);
  setView(`<div class="ph"><div><h1>Kalender</h1><p>Tenggat tugas dan jadwal kuis dari kursus Anda.</p></div></div>
    <div class="split"><section class="card glass"><div class="cal-head"><h3>${BULAN[c.m]} ${c.y}</h3><div class="row" style="gap:6px"><button class="btn btn-sm btn-glass" data-act="calToday">Hari ini</button><button class="btn btn-glass btn-icon btn-sm" data-act="calNav" data-d="-1" aria-label="Bulan sebelumnya">${ic('left', 'sm')}</button><button class="btn btn-glass btn-icon btn-sm" data-act="calNav" data-d="1" aria-label="Bulan berikutnya">${ic('right', 'sm')}</button></div></div>
      ${calGrid(c.y, c.m, ev, c.sel, false)}
      <div class="gap8" style="margin-top:14px;font-size:12.5px"><span class="chip" style="--ec:var(--pink)"><i style="width:8px;height:8px;border-radius:50%;background:var(--pink)"></i> Tenggat tugas</span><span class="chip"><i style="width:8px;height:8px;border-radius:50%;background:var(--orange)"></i> Kuis ditutup</span><span class="chip"><i style="width:8px;height:8px;border-radius:50%;background:var(--green)"></i> Dibuka</span></div></section>
      <div class="stack stg"><section class="card glass"><div class="card-h"><h3>${esc(dayLabel(selT))}</h3><span class="faint" style="font-size:13px">${fDate(selT, true)}</span></div>${dayEv.length ? `<div class="list">${dayEv.map(evRow).join('')}</div>` : emptyHTML('calendar', 'Tidak ada acara', 'Tidak ada tenggat pada hari ini.')}</section>
      <section class="card glass"><div class="card-h"><h3>${ic('clock')} 30 hari ke depan</h3></div>${up.length ? `<div class="list">${up.map(e => evRow(e).replace('<div class="ls ellipsis">', `<div class="ls ellipsis">${dayLabel(e.time)} · `)).join('')}</div>` : emptyHTML('checkc', 'Tidak ada jadwal', '')}</section></div></div>`, anim);
}
async function pageGrades() {
  setChrome({ title: 'Nilai' });
  const tc = S.courses.filter(c => c.role === 'teacher'), isStudent = S.courses.some(c => c.role === 'student');
  if (!isStudent) {
    setView(`<div class="ph"><div><h1>Nilai</h1><p>Buka buku nilai untuk setiap kursus yang Anda ampu.</p></div></div>
      <section class="card glass"><div class="list">${tc.map(c => `<div class="li" data-go="/course/${c.id}/grades"><span class="cover" style="width:44px;height:44px;border-radius:12px;overflow:hidden;position:relative;display:block;flex:none">${coverSVG(c.id, c.cover)}</span><div class="grow" style="min-width:0"><div class="lt ellipsis">${esc(c.fullname)}</div><div class="ls">${esc(c.shortname)} · Buku nilai</div></div>${ic('right', 'sm chev')}</div>`).join('') || emptyHTML('chart', 'Belum ada kursus', '')}</div></section>`);
    return;
  }
  await swr('grades', 'myGrades', {}, (list, c, refresh) => {
    const all = list.filter(g => g.total.pct !== null), avg = all.length ? all.reduce((s, g) => s + g.total.pct, 0) / all.length : null;
    setView(`<div class="ph"><div><h1>Nilai</h1><p>Ikhtisar nilai dari semua kursus Anda.</p></div>${avg !== null ? `<div class="row">${ringBox(avg, 64, Math.round(avg) + '', avg >= 75 ? 'var(--green)' : avg >= 55 ? 'var(--orange)' : 'var(--red)', 18)}<div><b>Rata-rata</b><div class="faint" style="font-size:13px">${all.length} kursus</div></div></div>` : ''}</div>
      <div class="stack stg">${list.map(g => gradeReportHTML(g, true)).join('') || `<div class="card glass">${emptyHTML('chart', 'Belum ada nilai', '')}</div>`}</div>`, !refresh);
  }, () => skel());
}
async function refreshNotifs() {
  if (!S.user) return;
  try { S.notifs = await api('notifications', {}, { silent: true }); updateBell(); } catch (e) { /* abaikan */ }
}
function updateBell() {
  const b = $('#bellBtn');
  if (!b) return;
  const seen = LS.get('nseen_' + S.user.id, 0), now = Date.now();
  const n = (S.notifs || []).filter(x => x.time > seen && x.time <= now).length;
  let dot = $('.bell-dot', b);
  if (n) { if (!dot) { dot = document.createElement('span'); dot.className = 'bell-dot'; b.appendChild(dot); } dot.textContent = n > 9 ? '9+' : n; }
  else if (dot) dot.remove();
}
const NK = { announce: ['megaphone', 'interface'], grade: ['award', 'content'], submission: ['inbox', 'assessment'], due: ['clock', 'quiz'], post: ['forum', 'communication'] };
function openNotifs(anchor) {
  const seen = LS.get('nseen_' + S.user.id, 0), now = Date.now();
  const el = document.createElement('div');
  el.className = 'menu notif glass thick';
  const listHTML = () => { const list = S.notifs || []; return list.length ? list.map((x, i) => { const k = NK[x.kind] || NK.announce; return `<div class="li click ${x.time > seen && x.time <= now ? 'unread' : ''}" data-ni="${i}"><span class="aicon sm" data-p="${k[1]}">${ic(k[0])}</span><div class="grow" style="min-width:0"><div class="lt" style="font-size:14px">${esc(x.title)}</div><div class="ls">${x.kind === 'due' ? 'Batas ' + fDT(x.due) : esc(x.text)}</div><div class="ls faint" style="font-size:12px">${esc(x.course || '')}${x.course ? ' · ' : ''}${x.kind === 'due' ? 'segera' : rel(x.time)}</div></div></div>`; }).join('') : emptyHTML('bell', 'Tidak ada notifikasi', 'Anda sudah mengikuti semua kabar terbaru.'); };
  el.innerHTML = `<div class="nh"><b>Notifikasi</b><button class="btn btn-plain btn-sm" data-nall>Tandai dibaca</button></div><div class="nl">${listHTML()}</div>`;
  if (!popover(anchor, el)) return;
  el.addEventListener('click', e => {
    if (e.target.closest('[data-nall]')) { LS.set('nseen_' + S.user.id, Date.now()); updateBell(); $$('.unread', el).forEach(x => x.classList.remove('unread')); return; }
    const li = e.target.closest('[data-ni]');
    if (li) { const x = (S.notifs || [])[+li.dataset.ni]; closeMenu(); if (x && x.link) go(x.link); }
  });
  setTimeout(() => { LS.set('nseen_' + S.user.id, Date.now()); updateBell(); }, 2500);
  const before = JSON.stringify(S.notifs || []);
  refreshNotifs().then(() => { if (S.menu === el && JSON.stringify(S.notifs || []) !== before) { $('.nl', el).innerHTML = listHTML(); placeNear(el, anchor); } });
}

/* ==========================================================================
   PROFIL & TAMPILAN
   ========================================================================== */
function pageProfile() {
  const u = S.user;
  setChrome({ title: 'Profil' });
  setView(`<div class="ph"><div><h1>Profil & Tampilan</h1><p>Kelola akun dan sesuaikan tampilan aplikasi.</p></div></div>
    <div class="split"><div class="stack stg">
      <section class="card glass"><div class="row" style="gap:18px;flex-wrap:wrap">${av(u, 'xl')}<div class="grow"><h2 style="margin:0;font-size:26px">${esc(u.name)}</h2><div class="muted">@${esc(u.username)}</div><div class="gap8" style="margin-top:10px"><span class="chip purple">${ROLE[u.role]}</span>${u.kelas ? `<span class="chip">${esc(u.kelas)}</span>` : ''}${u.nisn ? `<span class="chip">NISN ${esc(u.nisn)}</span>` : ''}</div></div></div></section>
      <section class="card glass"><div class="card-h"><h3>${ic('user')} Informasi pribadi</h3></div><div class="form" id="pfForm">
        ${fInput('name', 'Nama lengkap', u.name, { req: true })}${fInput('email', 'Email', u.email, { type: 'email', ph: 'nama@sekolah.sch.id' })}
        <div class="field"><label class="lbl">Warna avatar</label><div class="gap8" id="pfColors">${USER_COLORS.map(c => `<button type="button" class="color-opt ${c.toLowerCase() === String(u.color).toLowerCase() ? 'on' : ''}" data-act="pickOne" data-color="${c}" style="--c:${c}" aria-label="Warna ${c}"></button>`).join('')}</div></div>
        <div><button class="btn btn-primary" data-act="pfSave">Simpan profil</button></div></div></section>
      <section class="card glass"><div class="card-h"><h3>${ic('lock')} Ganti password</h3></div><div class="form" id="pwForm">
        <div class="row2">${fInput('old', 'Password lama', '', { type: 'password' })}${fInput('pw1', 'Password baru', '', { type: 'password', hint: 'Minimal 4 karakter.' })}</div>
        <div><button class="btn btn-tinted" data-act="pwSave">Perbarui password</button></div></div></section>
    </div>
    <div class="stack stg">
      <section class="card glass"><div class="card-h"><h3>${ic('palette')} Tampilan</h3></div><div class="form">
        <div class="field"><label class="lbl">Tema</label><div class="seg block">${[['auto', 'Otomatis'], ['light', 'Terang'], ['dark', 'Gelap']].map(t => `<button class="${PREF.theme === t[0] ? 'on' : ''}" data-act="prefTheme" data-v="${t[0]}">${t[1]}</button>`).join('')}</div></div>
        <div class="field"><label class="lbl">Wallpaper</label><div class="walls">${Object.keys(WALLS).map(k => `<button type="button" class="wall-opt ${PREF.wall === k ? 'on' : ''}" data-act="prefWall" data-v="${k}" style="background:radial-gradient(circle at 20% 20%,${WALLS[k][0]},transparent 60%),radial-gradient(circle at 80% 30%,${WALLS[k][1]},transparent 60%),radial-gradient(circle at 50% 90%,${WALLS[k][2]},transparent 65%),var(--fill)"><span>${WALL_NAMES[k]}</span></button>`).join('')}</div></div>
        <div class="opt-stack">${prefSwitch('motion', 'Wallpaper bergerak', 'Animasi latar yang perlahan mengalir.')}${chromiumDesktop() ? prefSwitch('refract', 'Efek refraksi cair', 'Distorsi lensa kaca ala iOS (Chrome/Edge desktop).') : ''}${prefSwitch('reduce', 'Kurangi transparansi', 'Kaca lebih pekat agar teks lebih mudah dibaca.')}</div>
      </div></section>
      <section class="card glass"><div class="group"><div class="gi"><span class="k">Bergabung</span><span class="v">${fDate(u.created_at)}</span></div><div class="gi"><span class="k">Login terakhir</span><span class="v">${fDT(u.last_login)}</span></div><div class="gi"><span class="k">Versi aplikasi</span><span class="v">${esc(S.settings.version || '1.0.0')}</span></div></div>
        ${serverInfoHTML()}
        <button class="btn btn-danger w100" style="margin-top:14px" data-act="logout">${ic('logout', 'sm')} Keluar</button></section>
    </div></div>`);
  $$('[data-pref]').forEach(i => i.addEventListener('change', () => { setPref(i.dataset.pref, i.checked); toast('Tampilan diperbarui', 'info'); }));
}
const prefSwitch = (k, label, sub) => `<label class="opt-row"><div class="ot"><b>${label}</b><small>${sub}</small></div><span class="switch"><input type="checkbox" data-pref="${k}" ${PREF[k] ? 'checked' : ''}><span></span></span></label>`;

/* ==========================================================================
   ADMINISTRASI SITUS
   ========================================================================== */
async function pageAdmin(tab) {
  if (S.user.role !== 'admin') { go('/dashboard', true); return; }
  tab = tab || 'overview';
  setChrome({ title: 'Administrasi Situs' });
  const tabs = [['overview', 'Ringkasan'], ['users', 'Pengguna'], ['courses', 'Kursus'], ['categories', 'Kategori'], ['announcements', 'Pengumuman'], ['settings', 'Pengaturan']];
  const same = S.lastAdmin;
  S.lastAdmin = true;
  setView(`<div class="ph"><div><div class="eyebrow">${ic('shield', 'xs')} Admin</div><h1>Administrasi Situs</h1><p>Kelola pengguna, kursus, kategori, dan pengaturan LMS.</p></div></div>
    <div class="seg-wrap ctabs"><div class="seg lg">${tabs.map(t => `<button class="${t[0] === tab ? 'on' : ''}" data-act="adminTab" data-v="${t[0]}">${t[1]}</button>`).join('')}</div></div><div id="atab"></div>`, !same);
  const box = $('#atab'), path = S.path;
  box.innerHTML = `<div class="card glass">${'<div class="sk sk-line"></div>'.repeat(6)}</div>`;
  const guard = () => S.path === path;
  try {
    if (tab === 'overview') { const d = await api('adminOverview'); if (guard()) adminOverview(d); }
    else if (tab === 'users') { S.adminUsers = await api('users'); if (guard()) drawAdminUsers(); }
    else if (tab === 'courses') { S.adminCourses = await api('allCourses'); if (guard()) drawAdminCourses(); }
    else if (tab === 'categories') { S.categories = await api('categories'); if (guard()) drawCategories(); }
    else if (tab === 'announcements') { S.annList = await api('announcements', { site: true }); if (guard()) drawSiteAnn(); }
    else if (tab === 'settings') adminSettings();
  } catch (e) { if (guard()) box.innerHTML = ''; }
}
function adminOverview(d) {
  const c = d.counts;
  $('#atab').innerHTML = `<div class="grid g4 stg">${tile('users', ['#64d2ff', '#007aff'], c.users, 'Total pengguna', '/admin/users')}${tile('grad', ['#5ee07f', '#1aa84a'], c.students, 'Siswa')}${tile('edit', ['#c58bff', '#8a3ff0'], c.teachers, 'Guru')}${tile('book', ['#ffb35c', '#ff7a1f'], c.courses, 'Kursus', '/admin/courses')}${tile('layers', ['#7d7aff', '#5856d6'], c.modules, 'Aktivitas & materi')}${tile('inbox', ['#ff7aa2', '#f2245c'], c.submissions, 'Kiriman tugas')}${tile('quiz', ['#ffb35c', '#ff6a1f'], c.attempts, 'Percobaan kuis')}${tile('lock', ['#a1a1aa', '#52525b'], c.suspended, 'Akun nonaktif')}</div>
    <div class="split" style="margin-top:18px"><section class="card glass"><div class="card-h"><h3>${ic('clock')} Login terakhir</h3></div><div class="list">${d.recent.map(u => `<div class="li">${av(u)}<div class="grow" style="min-width:0"><div class="lt ellipsis">${esc(u.name)}</div><div class="ls">@${esc(u.username)} · ${ROLE[u.role]}</div></div><span class="faint" style="font-size:13px">${rel(u.last_login)}</span></div>`).join('') || emptyHTML('clock', 'Belum ada login', '')}</div></section>
    <section class="card glass"><div class="card-h"><h3>${ic('sparkle')} Pintasan</h3></div><div class="opt-stack">
      <button class="opt-row" data-act="userNew" style="border:0;cursor:pointer;text-align:left;font:inherit;color:inherit"><div class="ot"><b>Tambah pengguna</b><small>Buat akun guru atau siswa satu per satu.</small></div>${ic('userplus')}</button>
      <button class="opt-row" data-act="userImport" style="border:0;cursor:pointer;text-align:left;font:inherit;color:inherit"><div class="ot"><b>Impor siswa dari Excel</b><small>Unduh templat, isi, lalu unggah satu kelas sekaligus.</small></div>${ic('upload')}</button>
      <button class="opt-row" data-act="newCourse" style="border:0;cursor:pointer;text-align:left;font:inherit;color:inherit"><div class="ot"><b>Buat kursus</b><small>Kursus baru dengan topik mingguan.</small></div>${ic('book')}</button>
      <button class="opt-row" data-go="/admin/settings" style="border:0;cursor:pointer;text-align:left;font:inherit;color:inherit"><div class="ot"><b>Pengaturan situs</b><small>Nama situs, sekolah, pendaftaran mandiri.</small></div>${ic('sliders')}</button>
    </div><p class="faint" style="font-size:12.5px;margin:14px 4px 0">LMS Sekolah v${esc(d.version)} · Database Google Sheets</p></section></div>`;
  afterRender($('#atab'));
}
function drawAdminUsers() {
  const all = S.adminUsers || [], f = S.auRole || 'all', q = (S.auQ || '').toLowerCase(), sel = S.adminSel;
  const list = all.filter(u => (f === 'all' || u.role === f || (f === 'suspended' && u.status === 'suspended')) && (!q || (u.name + ' ' + u.username + ' ' + u.kelas + ' ' + u.nisn + ' ' + u.email).toLowerCase().indexOf(q) >= 0));
  S.auList = list;
  const cnt = r => all.filter(u => u.role === r).length;
  $('#atab').innerHTML = `<section class="card glass"><div class="card-h"><h3>${ic('users')} Pengguna <span class="faint" style="font-weight:600">${all.length}</span></h3><div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn btn-tinted btn-sm" data-act="userImport">${ic('upload', 'sm')} Impor</button><button class="btn btn-tinted btn-sm" data-act="userExport">${ic('download', 'sm')} Ekspor</button><button class="btn btn-primary btn-sm" data-act="userNew">${ic('userplus', 'sm')} Tambah</button></div></div>
    <div class="row" style="flex-wrap:wrap;gap:10px;margin-bottom:12px"><div class="seg-wrap"><div class="seg">${[['all', 'Semua'], ['student', 'Siswa (' + cnt('student') + ')'], ['teacher', 'Guru (' + cnt('teacher') + ')'], ['admin', 'Admin (' + cnt('admin') + ')'], ['suspended', 'Nonaktif']].map(x => `<button class="${f === x[0] ? 'on' : ''}" data-act="auRole" data-v="${x[0]}">${x[1]}</button>`).join('')}</div></div><div class="inp-ic grow" style="min-width:200px">${ic('search', 'sm')}<input class="input sm" id="auQ" placeholder="Cari nama, username, kelas, NISN…" value="${esc(S.auQ || '')}"></div></div>
    <div id="selBar" class="row ${sel.size ? '' : 'hidden'}" style="padding:10px 14px;border-radius:16px;background:color-mix(in srgb,var(--tint) 10%,transparent);margin-bottom:10px;flex-wrap:wrap"><b id="selN">${sel.size} dipilih</b><span class="grow"></span><button class="btn btn-sm" data-act="bulkUsers" data-v="activate">Aktifkan</button><button class="btn btn-sm" data-act="bulkUsers" data-v="suspend">Nonaktifkan</button><button class="btn btn-sm btn-danger" data-act="bulkUsers" data-v="delete">Hapus</button></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:44px"><span class="ck sq ${list.length && list.every(u => sel.has(u.id)) ? 'on' : ''}" data-act="selAll" style="cursor:pointer">${ic('check')}</span></th><th>Nama</th><th>Username</th><th>Peran</th><th>Kelas</th><th>Status</th><th>Login terakhir</th><th></th></tr></thead>
    <tbody>${list.slice(0, 500).map(u => `<tr><td><span class="ck sq ${sel.has(u.id) ? 'on' : ''}" data-act="selOne" data-id="${u.id}" style="cursor:pointer">${ic('check')}</span></td><td><div class="row" style="gap:10px">${av(u, 'sm')}<div style="min-width:0"><b>${esc(u.name)}</b>${u.email ? `<div class="faint" style="font-size:12px">${esc(u.email)}</div>` : ''}</div></div></td><td class="faint">@${esc(u.username)}</td><td><span class="chip ${u.role === 'admin' ? 'red' : u.role === 'teacher' ? 'purple' : 'blue'}">${ROLE[u.role]}</span></td><td>${esc(u.kelas || '—')}</td><td>${u.status === 'suspended' ? '<span class="chip">Nonaktif</span>' : '<span class="chip green">Aktif</span>'}</td><td class="faint nowrap">${u.last_login ? rel(u.last_login) : 'Belum pernah'}</td><td class="num"><button class="btn btn-plain btn-icon btn-sm" data-act="userMenu" data-id="${u.id}" aria-label="Opsi">${ic('more')}</button></td></tr>`).join('')}</tbody></table></div>
    ${list.length > 500 ? `<p class="faint" style="font-size:13px">Menampilkan 500 dari ${list.length}. Gunakan pencarian untuk mempersempit.</p>` : ''}${!list.length ? emptyHTML('users', 'Tidak ada pengguna', '') : ''}</section>`;
  afterRender($('#atab'), false);
  const qi = $('#auQ');
  qi.addEventListener('input', debounce(e => { S.auQ = e.target.value; const pos = e.target.selectionStart; drawAdminUsers(); const n = $('#auQ'); n.focus(); n.setSelectionRange(pos, pos); }, 220));
}
function openUserForm(u) {
  sheet({
    title: u ? 'Edit pengguna' : 'Pengguna baru', ok: 'Simpan', size: 'lg',
    body: `<div class="form">${fInput('name', 'Nama lengkap', u ? u.name : '', { req: true })}
      <div class="row2">${fInput('username', 'Username', u ? u.username : '', { req: true, ph: 'huruf kecil, angka, titik', attrs: 'autocapitalize="none"' })}${fInput('password', u ? 'Password baru' : 'Password', '', { type: 'text', req: !u, ph: u ? 'Kosongkan bila tidak diubah' : 'Minimal 4 karakter' })}</div>
      <div class="row2">${fSelect('role', 'Peran', [['student', 'Siswa'], ['teacher', 'Guru'], ['admin', 'Administrator']], u ? u.role : 'student')}${fInput('kelas', 'Kelas', u ? u.kelas : '', { ph: 'mis. X TJKT 1' })}</div>
      <div class="row2">${fInput('nisn', 'NISN', u ? u.nisn : '', { attrs: 'inputmode="numeric"', ph: '10 digit' })}${fInput('email', 'Email', u ? u.email : '', { type: 'email' })}</div>
      ${u ? fSwitch('active', 'Akun aktif', 'Akun nonaktif tidak dapat masuk.', u.status !== 'suspended') : ''}</div>`,
    onOk: async sh => {
      const r = sh.el;
      const p = { id: u && u.id, name: need(r, 'name', 'Nama wajib diisi.'), username: need(r, 'username', 'Username wajib diisi.'), password: fv(r, 'password'), role: fv(r, 'role'), kelas: fv(r, 'kelas'), nisn: fv(r, 'nisn'), email: fv(r, 'email') };
      if (u) p.status = fv(r, 'active') ? 'active' : 'suspended';
      else if (!p.password) throw new Error('Password wajib diisi.');
      await mutate('saveUser', p);
      toast(u ? 'Pengguna diperbarui' : 'Pengguna ditambahkan');
      S.adminUsers = await api('users');
      if (S.path.indexOf('/admin') === 0) { if (S.path === '/admin/users') drawAdminUsers(); else go('/admin/users'); }
    }
  });
}
/* ---------------------------------------------------------------- impor siswa (Excel/CSV) */
const TPL_CSV = {
  siswa: 'nama,nisn,kelas,username,password,email,peran\r\nAndi Saputra,0087654321,X TJKT 1,andi.saputra,rahasia123,,siswa\r\nBunga Lestari,0087654322,X TJKT 1,,,,siswa',
  kuis: 'tipe,pertanyaan,opsi_a,opsi_b,opsi_c,opsi_d,opsi_e,kunci,poin\r\npg,Perangkat yang menghubungkan dua jaringan berbeda adalah...,Switch,Router,Hub,Repeater,,B,1\r\npg_kompleks,Manakah yang termasuk perangkat input?,Keyboard,Monitor,Mouse,Printer,,"A,C",2\r\nbenar_salah,Kabel UTP termasuk media transmisi kabel tembaga.,,,,,,Benar,1\r\nisian,Diagram yang menggambarkan alur algoritma disebut...,,,,,,flowchart|diagram alir,1'
};
/* Templat Excel disimpan di Templates.gs (server) agar file App tetap ringan. */
async function downloadTemplate(kind, fmt, btn) {
  kind = kind === 'kuis' ? 'kuis' : 'siswa';
  const base = kind === 'kuis' ? 'Templat-Impor-Soal-Kuis' : 'Templat-Impor-Siswa';
  if (fmt === 'csv') { downloadFile(base + '.csv', TPL_CSV[kind]); return; }
  if (btn && btn.disabled) return;
  const label = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Menyiapkan…'; }
  if (DEMO && window.__LMS_NO_DOWNLOAD__) { downloadBlob(base + '.xlsx', null); return; }
  try {
    const r = await fetch('templates/' + base + '.xlsx', { cache: 'no-cache' });
    if (!r.ok) throw new Error('Berkas templat tidak ditemukan di situs (folder templates).');
    downloadBlob(base + '.xlsx', new Blob([await r.arrayBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  } catch (e) {
    if (await ask({ title: 'Templat Excel belum tersedia', icon: 'alert', message: e.message + ' Sementara ini Anda dapat memakai templat CSV (bisa dibuka & disimpan dari Excel).', ok: 'Unduh templat CSV', cancel: 'Tutup' })) downloadFile(base + '.csv', TPL_CSV[kind]);
  } finally { if (btn) { btn.disabled = false; btn.innerHTML = label; } }
}
const normUsername = v => String(v || '').trim().toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '');
function mapUserRows(table) {
  if (!table || !table.length) throw new Error('Berkas kosong.');
  const norm = h => String(h == null ? '' : h).trim().toLowerCase().replace(/[^a-z]/g, '');
  const nameKeys = ['nama', 'namalengkap', 'namasiswa', 'namapesertadidik', 'name', 'fullname'];
  let hr = -1;
  for (let i = 0; i < Math.min(table.length, 12); i++) { const h = table[i].map(norm); if (nameKeys.some(k => h.indexOf(k) >= 0)) { hr = i; break; } }
  if (hr < 0) throw new Error('Judul kolom "nama" tidak ditemukan. Gunakan templat Excel yang disediakan.');
  const head = table[hr].map(norm);
  const idx = keys => { for (const k of keys) { const i = head.indexOf(k); if (i >= 0) return i; } return -1; };
  const map = {
    username: idx(['username', 'user', 'namapengguna', 'akun']), name: idx(nameKeys),
    password: idx(['password', 'sandi', 'katasandi', 'pass']), role: idx(['peran', 'role', 'level']),
    kelas: idx(['kelas', 'rombel', 'rombelsaatini', 'class']), nisn: idx(['nisn', 'nis', 'nipd', 'nomorinduk']), email: idx(['email', 'surel'])
  };
  if (map.username < 0 && map.nisn < 0) throw new Error('Perlu kolom "username" atau "nisn" sebagai nama akun.');
  return table.slice(hr + 1).map((r, j) => {
    const o = { _row: hr + j + 2 };
    Object.keys(map).forEach(k => { if (map[k] >= 0) o[k] = String(r[map[k]] == null ? '' : r[map[k]]).trim(); });
    return o;
  }).filter(o => o.username || o.name || o.nisn);
}
function checkImportRows(rows, defpw) {
  const seen = {};
  return rows.map(r => {
    const x = Object.assign({}, r), issues = [];
    x.uname = normUsername(r.username || r.nisn);
    if (!r.name) issues.push('Nama kosong');
    if (!x.uname) issues.push('Username/NISN kosong');
    else if (x.uname.length < 3) issues.push('Username terlalu pendek');
    else if (seen[x.uname]) issues.push('Username ganda');
    if (x.uname) seen[x.uname] = 1;
    const pw = r.password || defpw || r.nisn || '';
    x.pwSrc = r.password ? 'kolom' : defpw ? 'bawaan' : r.nisn ? 'NISN' : '';
    const w = [];
    if (pw.length < 4) w.push(r.password ? 'Password < 4 karakter' : 'Tanpa password');
    if (r.nisn && !/^\d{10}$/.test(r.nisn)) w.push('NISN bukan 10 digit');
    x.warn = w.join(', ');
    x.issues = issues;
    return x;
  });
}
function openImportStudents(o) {
  o = o || { mode: 'admin' };
  const isCourse = o.mode === 'course';
  let rows = [], checked = [];
  const courseOpts = [['', '— Tidak didaftarkan ke kursus —']].concat(S.courses.map(c => [c.id, c.fullname]));
  const canCreate = S.user.role === 'admin' || S.settings.teacher_import !== false;
  const sh = sheet({
    title: isCourse ? 'Impor siswa dari Excel' : 'Impor pengguna dari Excel', ok: 'Impor', size: 'lg',
    body: `<div class="form">
      <div class="imp-steps"><div><span>1</span><b>Unduh templat</b><small>Berkas Excel berisi kolom & petunjuk</small></div><div><span>2</span><b>Isi data siswa</b><small>Nama wajib, NISN/username, kelas</small></div><div><span>3</span><b>Unggah & periksa</b><small>Pratinjau sebelum disimpan</small></div></div>
      <div class="row" style="flex-wrap:wrap;gap:8px"><button type="button" class="btn btn-primary btn-sm" id="tplX">${ic('download', 'sm')} Unduh templat Excel (.xlsx)</button><button type="button" class="btn btn-plain btn-sm" id="tplC">Templat CSV</button></div>
      ${dropzone('xls', { label: 'Pilih berkas Excel (.xlsx) atau CSV', hint: 'Lembar pertama yang dibaca · ekspor Dapodik juga didukung', accept: '.xlsx,.xls,.csv,.txt' })}
      <details class="imp-paste"><summary>…atau tempel langsung dari Excel / Google Sheets</summary><textarea class="input" id="pasteCsv" placeholder="Salin tabel beserta baris judulnya (nama, nisn, kelas, …) lalu tempel di sini" style="min-height:90px;margin-top:8px;font-family:ui-monospace,Menlo,monospace;font-size:13px"></textarea></details>
      <div class="row2">${fInput('defpw', 'Password bawaan', '', { ph: 'mis. siswa123', hint: 'Dipakai bila kolom password kosong. Jika ini juga kosong, NISN menjadi password.' })}${isCourse
        ? `<div class="field"><label class="lbl">Kursus tujuan</label><div class="input" style="display:flex;align-items:center;gap:8px;font-size:15px">${ic('book', 'sm')}<span class="ellipsis">${esc(o.courseName || '')}</span></div><div class="hint">${canCreate ? 'Akun baru dibuat otomatis, lalu semua siswa didaftarkan ke kursus ini.' : 'Hanya siswa yang sudah punya akun yang dapat didaftarkan.'}</div></div>`
        : fSelect('course_id', 'Daftarkan ke kursus (opsional)', courseOpts, '', 'Siswa yang diimpor langsung terdaftar di kursus ini.')}</div>
      <div id="impPrev"></div></div>`,
    onOk: async () => {
      if (!rows.length) throw new Error('Pilih berkas Excel atau tempel data terlebih dahulu.');
      const ok = checked.filter(x => !x.issues.length);
      if (!ok.length) throw new Error('Tidak ada baris yang siap diimpor. Perbaiki baris yang bermasalah lalu unggah ulang.');
      const payload = { rows: ok.map(x => ({ _row: x._row, username: x.uname, name: x.name, password: x.password, kelas: x.kelas, nisn: x.nisn, email: x.email, role: x.role })), default_password: fv(sh.el, 'defpw') };
      const courseId = isCourse ? o.courseId : fv(sh.el, 'course_id');
      const r = isCourse ? await mutate('importToCourse', Object.assign(payload, { course_id: courseId })) : await mutate('importUsers', Object.assign(payload, { course_id: courseId }));
      const bad = checked.filter(x => x.issues.length).map(x => ({ row: x._row, username: x.uname, reason: x.issues.join(', ') }));
      setTimeout(() => showImportResult(r, bad, !!courseId), 350);
      if (isCourse) reloadCourse();
      else { S.adminUsers = await api('users'); if (S.path === '/admin/users') drawAdminUsers(); }
    }
  });
  const prev = $('#impPrev', sh.el), okBtn = $('[data-ok]', sh.el);
  const draw = () => {
    checked = checkImportRows(rows, fv(sh.el, 'defpw'));
    const okN = checked.filter(x => !x.issues.length).length, badN = checked.length - okN, warnN = checked.filter(x => !x.issues.length && x.warn).length;
    okBtn.textContent = okN ? 'Impor (' + okN + ')' : 'Impor';
    if (!rows.length) { prev.innerHTML = ''; return; }
    prev.innerHTML = `<div class="row between" style="margin:0 4px 8px;flex-wrap:wrap"><b>Pratinjau data</b><div class="gap8"><span class="chip green">${ic('check')} ${okN - warnN} siap</span>${warnN ? `<span class="chip orange">${ic('alert')} ${warnN} perlu dicek</span>` : ''}${badN ? `<span class="chip red">${ic('x')} ${badN} bermasalah</span>` : ''}</div></div>
      <div class="tbl-wrap" style="max-height:300px;overflow:auto"><table class="tbl nw"><thead><tr><th>Baris</th><th>Nama</th><th>Username</th><th>Kelas</th><th>Password</th><th>Status</th></tr></thead><tbody>${checked.slice(0, 300).map(x => `<tr><td class="faint">${x._row}</td><td><b>${esc(x.name || '—')}</b></td><td>${esc(x.uname || '—')}</td><td>${esc(x.kelas || '—')}</td><td class="faint">${x.pwSrc ? 'dari ' + x.pwSrc : '—'}</td><td>${x.issues.length ? `<span class="chip red">${esc(x.issues.join(', '))}</span>` : x.warn ? `<span class="chip orange" title="NISN seharusnya 10 digit angka. Akun yang sudah ada tetap didaftarkan; akun baru memerlukan password minimal 4 karakter.">${esc(x.warn)}</span>` : '<span class="chip green">Siap</span>'}</td></tr>`).join('')}</tbody></table></div>
      ${checked.length > 300 ? `<div class="hint">Menampilkan 300 dari ${checked.length} baris.</div>` : ''}${warnN ? '<div class="hint">Baris "perlu dicek" tetap ikut diimpor. Periksa NISN yang tidak 10 digit; untuk akun baru tanpa password, isi password bawaan.</div>' : ''}${badN ? '<div class="hint">Baris bermasalah tidak ikut diimpor. Perbaiki di Excel lalu unggah ulang.</div>' : ''}`;
  };
  const show = table => {
    try { rows = mapUserRows(table); if (!rows.length) throw new Error('Tidak ada baris data di bawah judul kolom.'); draw(); }
    catch (e) { rows = []; checked = []; okBtn.textContent = 'Impor'; prev.innerHTML = `<div class="err-msg">${esc(e.message)}</div>`; }
  };
  const readPicked = async () => {
    const f = dropFiles(sh.el, 'xls')[0];
    if (!f) return;
    prev.innerHTML = `<div class="row" style="gap:10px;padding:8px 4px"><span class="spinner"></span><span class="muted">Membaca ${esc(f.name)}…</span></div>`;
    try { show(await readTable(f)); } catch (e) { rows = []; prev.innerHTML = `<div class="err-msg">${esc(e.message)}</div>`; }
  };
  $('#tplX', sh.el).addEventListener('click', e => downloadTemplate('siswa', 'xlsx', e.currentTarget));
  $('#tplC', sh.el).addEventListener('click', () => downloadTemplate('siswa', 'csv'));
  $('[name="defpw"]', sh.el).addEventListener('input', debounce(draw, 200));
  $('#pasteCsv', sh.el).addEventListener('input', debounce(e => { if (e.target.value.trim()) show(parseCSV(e.target.value)); }, 250));
  $('.drop input', sh.el).addEventListener('change', () => setTimeout(readPicked, 30));
  $('.drop', sh.el).addEventListener('drop', () => setTimeout(readPicked, 30));
}
function showImportResult(r, bad, withCourse) {
  const skipped = (r.skipped || []).concat(bad || []).sort((a, b) => a.row - b.row);
  sheet({
    title: 'Hasil impor', cancel: 'Selesai', size: 'lg',
    body: `<div class="grid ${withCourse ? 'g3' : 'g2'} stg" style="margin-bottom:16px">${tile('userplus', ['#5ee07f', '#1aa84a'], r.created, 'Akun baru dibuat')}${withCourse ? tile('book', ['#64d2ff', '#007aff'], r.enrolled, 'Didaftarkan ke kursus') : ''}${tile('alert', ['#ffb35c', '#ff7a1f'], skipped.length, 'Baris dilewati')}</div>
      ${r.already ? `<p class="muted" style="margin:0 4px 12px">${r.already} siswa sudah terdaftar di kursus ini sebelumnya.</p>` : ''}
      ${skipped.length ? `<div class="lbl">Baris yang dilewati</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Baris</th><th>Username</th><th>Alasan</th></tr></thead><tbody>${skipped.map(x => `<tr><td>${x.row}</td><td>${esc(x.username || '—')}</td><td>${esc(x.reason)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty" style="padding:16px"><div class="ei" style="color:var(--green)">${ic('checkc')}</div><h4>Semua baris berhasil diimpor</h4></div>`}`
  });
  toast((r.created ? r.created + ' akun dibuat' : 'Impor selesai') + (withCourse ? ' · ' + r.enrolled + ' didaftarkan' : ''));
}
function drawAdminCourses() {
  const list = S.adminCourses || [];
  $('#atab').innerHTML = `<section class="card glass"><div class="card-h"><h3>${ic('book')} Semua kursus <span class="faint" style="font-weight:600">${list.length}</span></h3><button class="btn btn-primary btn-sm" data-act="newCourse">${ic('plus', 'sm')} Kursus baru</button></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Kursus</th><th>Kategori</th><th>Guru</th><th class="num">Siswa</th><th class="num">Aktivitas</th><th>Status</th><th></th></tr></thead><tbody>${list.map(c => `<tr class="click" data-go="/course/${c.id}"><td><div class="row" style="gap:10px"><span class="cover" style="width:40px;height:40px;border-radius:11px;overflow:hidden;position:relative;display:block;flex:none">${coverSVG(c.id, c.cover)}</span><div style="min-width:0"><b>${esc(c.fullname)}</b><div class="faint" style="font-size:12px">${esc(c.shortname)}</div></div></div></td><td>${esc(c.category || '—')}</td><td>${esc(c.teachers.join(', ') || '—')}</td><td class="num">${c.students}</td><td class="num">${c.modules}</td><td>${c.visible ? '<span class="chip green">Tampil</span>' : '<span class="chip">Tersembunyi</span>'}</td><td class="num"><button class="btn btn-plain btn-icon btn-sm" data-act="acDel" data-id="${c.id}" aria-label="Hapus" style="color:var(--red)">${ic('trash', 'sm')}</button></td></tr>`).join('')}</tbody></table></div>${!list.length ? emptyHTML('book', 'Belum ada kursus', '') : ''}</section>`;
}
function drawCategories() {
  const list = S.categories || [];
  $('#atab').innerHTML = `<section class="card glass" style="max-width:760px"><div class="card-h"><h3>${ic('layers')} Kategori kursus</h3><button class="btn btn-primary btn-sm" data-act="catNew">${ic('plus', 'sm')} Kategori baru</button></div>
    <div class="list">${list.map(k => `<div class="li"><span class="aicon sm" data-p="interface">${ic('folder')}</span><div class="grow" style="min-width:0"><div class="lt">${esc(k.name)}</div><div class="ls">${esc(k.description || '—')}</div></div><button class="btn btn-plain btn-icon btn-sm" data-act="catEdit" data-id="${k.id}" aria-label="Edit">${ic('edit', 'sm')}</button><button class="btn btn-plain btn-icon btn-sm" data-act="catDel" data-id="${k.id}" aria-label="Hapus" style="color:var(--red)">${ic('trash', 'sm')}</button></div>`).join('') || emptyHTML('layers', 'Belum ada kategori', 'Kategori membantu mengelompokkan kursus, mis. Kelas X, XI, XII.')}</div></section>`;
}
function openCategoryForm(k) {
  sheet({
    title: k ? 'Edit kategori' : 'Kategori baru', ok: 'Simpan',
    body: `<div class="form">${fInput('name', 'Nama kategori', k ? k.name : '', { req: true, ph: 'mis. Kelas X' })}${fInput('description', 'Deskripsi', k ? k.description : '')}</div>`,
    onOk: async sh => {
      await mutate('saveCategory', { id: k && k.id, name: need(sh.el, 'name', 'Nama wajib diisi.'), description: fv(sh.el, 'description') });
      toast('Kategori disimpan');
      S.categories = await api('categories');
      if (S.path === '/admin/categories') drawCategories();
    }
  });
}
function drawSiteAnn() {
  const list = S.annList || [];
  $('#atab').innerHTML = `<div class="row between" style="margin:0 4px 14px"><span class="faint">${list.length} pengumuman situs (tampil di dasbor semua pengguna)</span><button class="btn btn-primary btn-sm" data-act="annNew" data-course="">${ic('plus', 'sm')} Buat pengumuman</button></div><div class="stg">${list.map(a => annCard(a, true)).join('') || `<div class="card glass">${emptyHTML('megaphone', 'Belum ada pengumuman situs', '')}</div>`}</div>`;
  afterRender($('#atab'));
}
function adminSettings() {
  const s = S.settings;
  $('#atab').innerHTML = `<section class="card glass" style="max-width:760px"><div class="card-h"><h3>${ic('sliders')} Pengaturan situs</h3></div><div class="form" id="stForm">
    ${fInput('site_name', 'Nama situs', s.site_name, { req: true })}${fInput('school_name', 'Nama sekolah', s.school_name)}${fInput('tagline', 'Slogan (tampil di halaman login)', s.tagline)}${fInput('academic_year', 'Tahun ajaran', s.academic_year, { ph: '2026/2027' })}
    ${fSwitch('allow_register', 'Izinkan pendaftaran mandiri', 'Siswa dapat membuat akun sendiri dari halaman login.', !!s.allow_register)}
    ${fSwitch('teacher_import', 'Guru boleh membuat akun siswa saat impor Excel', 'Jika dimatikan, impor dari kursus hanya mendaftarkan siswa yang akunnya sudah ada.', s.teacher_import !== false)}
    <div><button class="btn btn-primary" data-act="stSave">Simpan pengaturan</button></div></div></section>`;
}

/* ==========================================================================
   PENCARIAN (SPOTLIGHT)
   ========================================================================== */
function closeSpot() { const w = $('.spot-wrap'); if (!w) return; w.classList.remove('in'); w.classList.add('out'); S.overlays = S.overlays.filter(x => x !== w._api); setTimeout(() => { w.remove(); unlockIfClear(); }, 300); }
function openSpot() {
  if ($('.spot-wrap')) return;
  const wrap = document.createElement('div');
  wrap.className = 'spot-wrap';
  wrap.innerHTML = `<div class="sheet-bd"></div><div class="spot glass thick" role="dialog" aria-label="Pencarian"><div class="spot-in">${ic('search', 'lg')}<input id="spotQ" placeholder="Cari kursus, materi, pengguna…" autocomplete="off" spellcheck="false"><button class="btn btn-plain btn-sm" data-sx>Batal</button></div><div class="spot-res" id="spotRes"></div></div>`;
  $('#layer').appendChild(wrap);
  document.documentElement.classList.add('locked');
  wrap._api = { close: closeSpot };
  S.overlays.push(wrap._api);
  const inp = $('#spotQ', wrap), res = $('#spotRes', wrap);
  let items = [], act = 0, seq = 0;
  const draw = groups => {
    items = [];
    res.innerHTML = groups.filter(g => g[1].length).map(g => `<div class="grp">${g[0]}</div>${g[1].map(x => { items.push(x.go); return `<div class="li click" data-k="${items.length - 1}">${x.icon}<div class="grow" style="min-width:0"><div class="lt ellipsis">${esc(x.t)}</div>${x.s ? `<div class="ls ellipsis">${esc(x.s)}</div>` : ''}</div>${ic('right', 'sm chev')}</div>`; }).join('')}`).join('') || (inp.value.trim().length >= 2 ? emptyHTML('search', 'Tidak ditemukan', 'Coba kata kunci lain.') : '');
    act = 0; mark();
  };
  const mark = () => $$('.li', res).forEach((l, i) => l.classList.toggle('act', i === act));
  const pages = () => navItems().map(n => ({ t: n.label, s: 'Halaman', icon: `<span class="ni" style="--c1:${n.c[0]};--c2:${n.c[1]}">${ic(n.icon)}</span>`, go: n.path }));
  const quick = () => draw([['Buka cepat', pages()], ['Kursus Saya', S.courses.slice(0, 5).map(c => ({ t: c.fullname, s: c.shortname, icon: `<span class="cover" style="width:30px;height:30px;border-radius:9px;overflow:hidden;position:relative;display:block;flex:none">${coverSVG(c.id, c.cover)}</span>`, go: '/course/' + c.id }))]]);
  quick();
  const search = debounce(async () => {
    const q = inp.value.trim(), my = ++seq;
    if (q.length < 2) { quick(); return; }
    const pg = pages().filter(p => p.t.toLowerCase().indexOf(q.toLowerCase()) >= 0);
    try {
      const r = await api('search', { q }, { silent: true });
      if (my !== seq) return;
      draw([['Halaman', pg], ['Kursus', r.courses.map(c => ({ t: c.fullname, s: c.shortname + (c.enrolled ? '' : ' · belum terdaftar'), icon: `<span class="cover" style="width:30px;height:30px;border-radius:9px;overflow:hidden;position:relative;display:block;flex:none">${coverSVG(c.id, c.cover)}</span>`, go: '/course/' + c.id }))], ['Aktivitas & materi', r.modules.map(m => ({ t: m.title, s: TYPES[m.type].name + ' · ' + m.course, icon: `<span class="aicon sm" data-p="${TYPES[m.type].p}">${ic(TYPES[m.type].icon)}</span>`, go: '/mod/' + m.id }))], ['Pengguna', r.users.map(u => ({ t: u.name, s: '@' + u.username + ' · ' + ROLE[u.role], icon: av(u, 'sm'), go: '/admin/users' }))]]);
    } catch (e) { /* abaikan */ }
  }, 260);
  inp.addEventListener('input', search);
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { act = Math.min(items.length - 1, act + 1); mark(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { act = Math.max(0, act - 1); mark(); e.preventDefault(); }
    else if (e.key === 'Enter' && items[act]) { const g = items[act]; closeSpot(); go(g); }
  });
  res.addEventListener('click', e => { const li = e.target.closest('[data-k]'); if (!li) return; const g = items[+li.dataset.k]; if (g === '/admin/users') S.auQ = $('.lt', li).textContent; closeSpot(); go(g); });
  $('.sheet-bd', wrap).addEventListener('click', closeSpot);
  $('[data-sx]', wrap).addEventListener('click', closeSpot);
  requestAnimationFrame(() => requestAnimationFrame(() => { wrap.classList.add('in'); inp.focus(); }));
}

/* ==========================================================================
   AKSI (event delegation)
   ========================================================================== */
const A = {
  retry: () => route(),
  spot: () => openSpot(),
  notifs: b => openNotifs(b),
  logout: () => logout(),
  changeServer: async () => { if (await ask({ title: 'Ganti server?', icon: 'link', message: 'Anda akan keluar dan diminta memasukkan URL Apps Script yang baru.', ok: 'Ganti server' })) { LS.del('api_url'); LS.del('token'); LS.del('boot'); location.reload(); } },
  meMenu: b => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    menu(b, [
      { label: 'Profil & tampilan', icon: 'user', fn: () => go('/profile') },
      { label: dark ? 'Mode terang' : 'Mode gelap', icon: dark ? 'sun' : 'moon', fn: () => setPref('theme', dark ? 'light' : 'dark') },
      { label: 'Pencarian', icon: 'search', fn: openSpot },
      '-',
      { label: 'Keluar', icon: 'logout', danger: true, fn: logout }
    ], { header: S.user.name + ' · @' + S.user.username });
  },
  newCourse: () => openCourseForm(),
  pickOne: b => { Array.from(b.parentElement.children).forEach(x => x.classList.toggle('on', x === b)); },
  tlFilter: b => { S.tl = b.dataset.v; const l = $('#tlList'); if (l && S.dash) { l.innerHTML = timelineHTML(S.dash.timeline); l.classList.add('fade-in'); setTimeout(() => l.classList.remove('fade-in'), 400); } },
  openAnn: b => { const a = findAnn(b.dataset.id); if (a) showAnn(a); },
  calDay: b => {
    const k = b.dataset.day, p = k.split('-');
    if (!/^\/calendar/.test(S.path)) { S.cal = { y: +p[0], m: +p[1] - 1, sel: k }; go('/calendar'); return; }
    S.cal.sel = k; S.cal.y = +p[0]; S.cal.m = +p[1] - 1; renderCalendar(false);
  },
  calNav: b => { const c = S.cal, d = new Date(c.y, c.m + +b.dataset.d, 1); c.y = d.getFullYear(); c.m = d.getMonth(); renderCalendar(false); },
  calToday: () => { const n = new Date(); S.cal = { y: n.getFullYear(), m: n.getMonth(), sel: dayKey(Date.now()) }; renderCalendar(false); },
  mcFilter: b => { S.mcFilter = b.dataset.v; drawMyCourses(false); },
  cview: b => { LS.set('cview', b.dataset.v); drawMyCourses(false); },
  catFilter: b => { S.catFilter = b.dataset.v; drawCatalog(false); },
  enrolSelf: async b => {
    const k = $('#enrolKey');
    if (!k.value.trim()) { shakeIt(k); k.focus(); return; }
    await withBusy(b, () => mutate('enrolSelf', { id: b.dataset.id, key: k.value.trim() }));
    toast('Berhasil bergabung. Selamat belajar! 🎉');
    await refreshBoot();
    route();
  },
  ctab: b => { S.keepScroll = true; const id = S.course.course.id, v = b.dataset.v; go('/course/' + id + (v === 'course' ? '' : '/' + v)); },
  toggleSec: b => {
    const sec = b.closest('.section'), k = colKey(), col = LS.get(k, {});
    sec.classList.toggle('collapsed');
    col[b.dataset.id] = sec.classList.contains('collapsed');
    LS.set(k, col);
  },
  collapseAll: b => {
    const k = colKey(), col = LS.get(k, {}), any = Object.keys(col).some(x => col[x]), next = {};
    $$('.section').forEach(s => { const id = s.id.slice(4); s.classList.toggle('collapsed', !any); next[id] = !any; });
    LS.set(k, any ? {} : next);
    b.textContent = any ? 'Ciutkan semua' : 'Bentangkan semua';
  },
  ciGo: b => jumpTo(b.dataset.t),
  mIndex: () => openIndexSheet(),
  crumbSec: b => { S.keepScroll = true; go('/course/' + S.mod.course.id); setTimeout(() => jumpTo('sec-' + b.dataset.id), 600); },
  addSection: () => openSectionForm(null),
  secMenu: b => {
    const s = S.course.sections.find(x => x.id === b.dataset.id), first = S.course.sections[0] && S.course.sections[0].id === s.id;
    const items = [{ label: 'Edit topik', icon: 'edit', fn: () => openSectionForm(s) }, { label: s.visible ? 'Sembunyikan' : 'Tampilkan', icon: s.visible ? 'eyeoff' : 'eye', fn: async () => { await mutate('toggleSection', { id: s.id }); toast(s.visible ? 'Topik disembunyikan' : 'Topik ditampilkan'); reloadCourse(); } }];
    if (!first) items.push({ label: 'Pindah ke atas', icon: 'arrowup', fn: async () => { await mutate('moveSection', { id: s.id, dir: -1 }); reloadCourse(); } }, { label: 'Pindah ke bawah', icon: 'arrowdown', fn: async () => { await mutate('moveSection', { id: s.id, dir: 1 }); reloadCourse(); } }, '-', { label: 'Hapus topik', icon: 'trash', danger: true, fn: async () => { if (await ask({ title: 'Hapus topik?', message: `"${s.title}" beserta ${s.modules.length} aktivitas di dalamnya akan dihapus permanen.`, ok: 'Hapus', danger: true, icon: 'trash' })) { await mutate('deleteSection', { id: s.id }); toast('Topik dihapus'); reloadCourse(); } } });
    menu(b, items);
  },
  addActivity: b => openChooser(b.dataset.sec),
  modEye: b => { const m = findMod(b.dataset.id); modOp('toggleModule', m.id, m.visible ? 'Disembunyikan dari siswa' : 'Ditampilkan untuk siswa'); },
  modMenu: b => {
    const id = b.dataset.id, m = findMod(id);
    menu(b, [
      { label: 'Edit pengaturan', icon: 'edit', fn: () => editModule(id) },
      { label: 'Duplikat', icon: 'copy', fn: () => modOp('duplicateModule', id, 'Aktivitas diduplikat') },
      { label: 'Pindah ke atas', icon: 'arrowup', fn: () => modOp('moveModule', id, null, { dir: -1 }) },
      { label: 'Pindah ke bawah', icon: 'arrowdown', fn: () => modOp('moveModule', id, null, { dir: 1 }) },
      { label: m.visible ? 'Sembunyikan' : 'Tampilkan', icon: m.visible ? 'eyeoff' : 'eye', fn: () => modOp('toggleModule', id, m.visible ? 'Disembunyikan dari siswa' : 'Ditampilkan untuk siswa') },
      '-',
      { label: 'Hapus', icon: 'trash', danger: true, fn: async () => { if (await ask({ title: 'Hapus aktivitas?', message: `"${m.title}" beserta seluruh kiriman, nilai, dan diskusinya akan dihapus permanen.`, ok: 'Hapus', danger: true, icon: 'trash' })) modOp('deleteModule', id, 'Aktivitas dihapus'); } }
    ]);
  },
  toggleDone: async b => {
    const m = findMod(b.dataset.id), on = !b.classList.contains('on');
    b.classList.toggle('on', on);
    try {
      const r = await api('toggleCompletion', { id: m.id });
      S.cache.clear();
      m.done = r.done;
      const track = S.course.sections.reduce((a, s) => a.concat(s.modules.filter(x => x.type !== 'label')), []), done = track.filter(x => x.done).length;
      S.course.progress = { done, total: track.length, pct: track.length ? Math.round(done / track.length * 100) : 0 };
      const hero = $('.chero');
      if (hero) { hero.outerHTML = courseHero(S.course); afterRender($('#view'), true); }
      if (r.done) toast('Ditandai selesai');
    } catch (e) { b.classList.toggle('on', !on); }
  },
  partF: b => { S.partF = b.dataset.v; drawParticipants(); },
  enrolOpen: () => openEnrolSheet(),
  partImport: () => openImportStudents({ mode: 'course', courseId: S.course.course.id, courseName: S.course.course.fullname }),
  partMenu: b => {
    const p = S.parts.participants.find(x => x.id === b.dataset.id), cid = S.course.course.id;
    menu(b, [
      { label: p.role === 'teacher' ? 'Jadikan siswa' : 'Jadikan guru', icon: 'users', fn: async () => { await mutate('setEnrolRole', { course_id: cid, user_id: p.id, role: p.role === 'teacher' ? 'student' : 'teacher' }); toast('Peran diperbarui'); loadParticipants(S.course); } },
      '-',
      { label: 'Keluarkan dari kursus', icon: 'logout', danger: true, fn: async () => { if (await ask({ title: 'Keluarkan peserta?', message: p.name + ' tidak akan bisa lagi mengakses kursus ini.', ok: 'Keluarkan', danger: true })) { await mutate('unenrol', { course_id: cid, user_id: p.id }); toast('Peserta dikeluarkan'); loadParticipants(S.course); } } }
    ], { header: p.name });
  },
  gbExport: () => exportGradebook(),
  annNew: b => openAnnForm(null, b.dataset.course, () => { if (b.dataset.course) loadAnnouncements(S.course); else pageAdmin('announcements'); }),
  annMenu: b => {
    const a = findAnn(b.dataset.id), after = () => { if (a.course_id) loadAnnouncements(S.course); else pageAdmin('announcements'); };
    menu(b, [{ label: 'Edit', icon: 'edit', fn: () => openAnnForm(a, a.course_id, after) }, '-', { label: 'Hapus', icon: 'trash', danger: true, fn: async () => { if (await ask({ title: 'Hapus pengumuman?', message: a.title, ok: 'Hapus', danger: true })) { await mutate('deleteAnnouncement', { id: a.id }); toast('Pengumuman dihapus'); after(); } } }]);
  },
  csSave: async b => {
    const p = collectCourse($('#csForm'), S.course.course.id);
    await withBusy(b, () => mutate('saveCourse', p));
    toast('Pengaturan kursus disimpan');
    await refreshBoot();
    reloadCourse();
  },
  csDelete: async () => {
    const c = S.course.course;
    const v = await ask({ title: 'Hapus kursus?', message: 'Ketik nama singkat "' + c.shortname + '" untuk konfirmasi. Tindakan ini tidak dapat dibatalkan.', input: { placeholder: c.shortname }, ok: 'Hapus permanen', danger: true });
    if (v === null) return;
    if (v !== c.shortname) { toast('Nama singkat tidak cocok.', 'error'); return; }
    await mutate('deleteCourse', { id: c.id });
    toast('Kursus dihapus');
    await refreshBoot();
    go('/courses', true);
  },
  modEditHere: () => editModule(S.mod.module.id, reloadModule),
  modMoreHere: b => {
    const d = S.mod, m = d.module;
    menu(b, [
      { label: 'Duplikat', icon: 'copy', fn: async () => { const r = await mutate('duplicateModule', { id: m.id }); toast('Aktivitas diduplikat'); go('/mod/' + r.id); } },
      { label: m.visible ? 'Sembunyikan' : 'Tampilkan', icon: m.visible ? 'eyeoff' : 'eye', fn: async () => { await mutate('toggleModule', { id: m.id }); toast(m.visible ? 'Disembunyikan dari siswa' : 'Ditampilkan untuk siswa'); reloadModule(); } },
      '-',
      { label: 'Hapus', icon: 'trash', danger: true, fn: async () => { if (await ask({ title: 'Hapus aktivitas?', message: `"${m.title}" beserta data terkait akan dihapus permanen.`, ok: 'Hapus', danger: true, icon: 'trash' })) { await mutate('deleteModule', { id: m.id }); toast('Aktivitas dihapus'); go('/course/' + d.course.id, true); } } }
    ]);
  },
  jumpMenu: b => { const d = S.mod; menu(b, d.jump.map(j => ({ label: (j.id === d.module.id ? '● ' : '') + j.title, icon: TYPES[j.type].icon, fn: () => go('/mod/' + j.id) })), { header: 'Lompat ke…' }); },
  subOpen: () => openSubmitForm(),
  subFilter: b => { S.subFilter = b.dataset.v; drawSubList(); },
  gradeOpen: b => openGrader(b.dataset.uid),
  subExport: () => {
    const d = S.mod, m = d.module;
    const rows = [['Nama', 'Kelas', 'Status', 'Waktu kirim', 'Terlambat', 'Nilai (maks ' + m.max_grade + ')', 'Umpan balik']];
    d.rows.forEach(r => { const s = r.sub, sent = s && s.status === 'submitted'; rows.push([r.user.name, r.user.kelas || '', sent ? 'Terkirim' : 'Belum mengirim', sent ? fDT(s.submitted_at) : '', sent && m.due_date && s.submitted_at > m.due_date ? 'Ya' : '', s && s.grade !== null ? String(s.grade).replace('.', ',') : '', s ? plain(s.feedback) : '']); });
    downloadFile('kiriman-' + m.title.replace(/[^\w]+/g, '-').slice(0, 40) + '.csv', toCSV(rows));
  },
  quizStart: async () => {
    const d = S.mod, c = d.module.config || {};
    if (!d.inprogress && c.time_limit) {
      const ok = await ask({ title: 'Mulai kuis?', message: `Kuis ini memiliki batas waktu ${c.time_limit} menit. Waktu mulai berjalan saat Anda menekan Mulai dan tidak dapat dijeda.`, ok: 'Mulai', icon: 'clock' });
      if (!ok) return;
    }
    go('/attempt/' + d.module.id);
  },
  quizTab: b => { const v = b.dataset.v; S.modSub = v === 'info' ? S.modSub : v; const qa = $('#qActions'); if (qa) qa.style.visibility = v === 'info' ? 'hidden' : 'visible'; if (v !== 'info' && qa) qa.innerHTML = v === 'questions' ? `<button class="btn btn-glass btn-sm" data-go="/attempt/${S.mod.module.id}">${ic('play', 'sm')} Pratinjau</button><button class="btn btn-tinted btn-sm" data-act="qImport">${ic('upload', 'sm')} Impor</button><button class="btn btn-primary btn-sm" data-act="qAdd">${ic('plus', 'sm')} Tambah soal</button>` : `<button class="btn btn-tinted btn-sm" data-act="resExport">${ic('download', 'sm')} Ekspor</button>`; loadQuizTab(v); },
  qAdd: () => openQuestionForm(null),
  qImport: () => openImportQuestions(),
  qEdit: b => openQuestionForm(S.questions.find(q => q.id === b.dataset.id)),
  qDel: async b => {
    if (!(await ask({ title: 'Hapus soal?', message: 'Soal akan dihapus dari kuis. Percobaan yang sudah selesai tidak berubah.', ok: 'Hapus', danger: true }))) return;
    await mutate('deleteQuestion', { id: b.dataset.id });
    S.questions = S.questions.filter(q => q.id !== b.dataset.id);
    S.mod.questionCount--;
    drawQuestions();
    toast('Soal dihapus');
  },
  qMove: async b => {
    const i = S.questions.findIndex(q => q.id === b.dataset.id), j = i + +b.dataset.dir;
    if (j < 0 || j >= S.questions.length) return;
    const t = S.questions[i]; S.questions[i] = S.questions[j]; S.questions[j] = t;
    drawQuestions();
    try { await mutate('moveQuestion', { id: b.dataset.id, dir: +b.dataset.dir }, { silent: true }); } catch (e) { loadQuizTab('questions'); }
  },
  attDel: async b => {
    if (!(await ask({ title: 'Hapus percobaan?', message: 'Nilai dari percobaan ini akan hilang dan siswa mendapat kesempatan kembali.', ok: 'Hapus', danger: true }))) return;
    await mutate('deleteAttempt', { id: b.dataset.id });
    toast('Percobaan dihapus');
    reloadModule();
  },
  resExport: () => {
    const d = S.mod, rows = [['Nama', 'Kelas', 'Mulai', 'Selesai', 'Durasi', 'Poin', 'Nilai (maks ' + d.module.max_grade + ')']];
    d.attempts.filter(a => a.status === 'finished').forEach(a => rows.push([a.user.name, a.user.kelas || '', fDT(a.started_at), fDT(a.finished_at), dur(a.finished_at - a.started_at), a.score + '/' + a.max_score, String(a.grade).replace('.', ',')]));
    downloadFile('hasil-' + d.module.title.replace(/[^\w]+/g, '-').slice(0, 40) + '.csv', toCSV(rows));
  },
  pick: b => {
    const A_ = S.att, q = A_.d.questions.find(x => x.id === b.dataset.q);
    if (!q) return;
    if (q.type === 'tf') A_.ans[q.id] = b.dataset.tf === 'true';
    else if (q.type === 'mc') A_.ans[q.id] = +b.dataset.i;
    else { const arr = Array.isArray(A_.ans[q.id]) ? A_.ans[q.id].slice() : [], i = +b.dataset.i, k = arr.indexOf(i); if (k >= 0) arr.splice(k, 1); else arr.push(i); A_.ans[q.id] = arr; }
    A_.dirty = true;
    const card = b.closest('.qcard');
    $$('.opt', card).forEach(o => {
      const on = q.type === 'tf' ? A_.ans[q.id] === (o.dataset.tf === 'true') : q.type === 'mc' ? A_.ans[q.id] === +o.dataset.i : A_.ans[q.id].indexOf(+o.dataset.i) >= 0;
      o.classList.toggle('on', on);
    });
    refreshQNav();
  },
  flagQ: b => { const A_ = S.att, id = b.dataset.q; A_.flags[id] = !A_.flags[id]; LS.set('flag_' + A_.d.attempt.id, A_.flags); b.classList.toggle('btn-tinted', A_.flags[id]); b.innerHTML = ic('flag', 'sm') + ' ' + (A_.flags[id] ? 'Ditandai' : 'Tandai'); refreshQNav(); },
  qGo: b => { const A_ = S.att, k = +b.dataset.k; A_.dir = A_.summary ? 'in-l' : k >= A_.i ? 'in-r' : 'in-l'; A_.i = k; A_.summary = false; saveAttempt(); renderAttempt(); scrollTo({ top: 0, behavior: 'smooth' }); },
  qNext: () => { const A_ = S.att; A_.dir = 'in-r'; A_.i++; saveAttempt(); renderAttempt(); scrollTo({ top: 0, behavior: 'smooth' }); },
  qPrev: () => { const A_ = S.att; A_.dir = 'in-l'; A_.i--; renderAttempt(); scrollTo({ top: 0, behavior: 'smooth' }); },
  attSummary: () => { const A_ = S.att; A_.dir = 'in-r'; A_.summary = true; saveAttempt(); renderAttempt(); scrollTo({ top: 0, behavior: 'smooth' }); },
  attFinish: async () => {
    const A_ = S.att, left = A_.d.questions.filter(q => !isAnswered(q)).length;
    const ok = await ask({ title: 'Kirim jawaban?', message: (left ? left + ' soal belum dijawab. ' : '') + 'Setelah dikirim, jawaban tidak dapat diubah lagi.', ok: 'Kirim & selesai', icon: 'send' });
    if (ok) finishAttempt(false);
  },
  rvJump: b => { const el = $('#rv-' + b.dataset.k); if (el) scrollTo({ top: el.getBoundingClientRect().top + scrollY - 90, behavior: 'smooth' }); },
  discNew: () => openDiscussionForm(),
  replyPost: b => openReply(b.dataset.id),
  delPost: async b => {
    const d = S.disc, root = b.dataset.id === d.discussion.id;
    if (!(await ask({ title: root ? 'Hapus seluruh diskusi?' : 'Hapus pesan?', message: root ? 'Topik ini beserta semua balasannya akan dihapus.' : 'Pesan ini beserta balasannya akan dihapus.', ok: 'Hapus', danger: true }))) return;
    await mutate('deletePost', { id: b.dataset.id });
    toast('Pesan dihapus');
    if (root) go('/mod/' + d.module.id, true);
    else { const nd = await api('discussion', { id: d.discussion.id }); renderDiscussion(nd, false); }
  },
  prefTheme: b => setPref('theme', b.dataset.v),
  prefWall: b => { $$('.wall-opt').forEach(x => x.classList.toggle('on', x === b)); setPref('wall', b.dataset.v); },
  pfSave: async b => {
    const f = $('#pfForm'), col = $('.color-opt.on', f);
    const u = await withBusy(b, () => mutate('saveProfile', { name: need(f, 'name', 'Nama wajib diisi.'), email: fv(f, 'email'), color: col ? col.dataset.color : S.user.color }));
    S.user = Object.assign(S.user, u);
    const bt = LS.get('boot', null); if (bt) { bt.user = S.user; LS.set('boot', bt); }
    renderMeChip();
    toast('Profil disimpan');
    pageProfile();
  },
  pwSave: async b => {
    const f = $('#pwForm'), old = fv(f, 'old'), pw = fv(f, 'pw1');
    if (!old || !pw) { toast('Isi password lama dan baru.', 'error'); return; }
    await withBusy(b, () => mutate('changePassword', { old, password: pw }));
    $$('input', f).forEach(i => { i.value = ''; });
    toast('Password berhasil diperbarui');
  },
  adminTab: b => { S.keepScroll = true; go('/admin/' + b.dataset.v); },
  auRole: b => { S.auRole = b.dataset.v; drawAdminUsers(); },
  selOne: b => { const s = S.adminSel, id = b.dataset.id; if (s.has(id)) s.delete(id); else s.add(id); drawAdminUsers(); },
  selAll: () => { const s = S.adminSel, list = S.auList || [], all = list.every(u => s.has(u.id)); list.forEach(u => { if (all) s.delete(u.id); else s.add(u.id); }); drawAdminUsers(); },
  bulkUsers: async b => {
    const ids = Array.from(S.adminSel), v = b.dataset.v;
    if (!ids.length) return;
    if (v === 'delete') {
      if (!(await ask({ title: 'Hapus ' + ids.length + ' pengguna?', message: 'Akun beserta kiriman, nilai, dan pendaftaran kursus mereka akan dihapus permanen.', ok: 'Hapus', danger: true, icon: 'trash' }))) return;
      const r = await mutate('deleteUsers', { ids }); toast(r.deleted + ' pengguna dihapus');
    } else { const r = await mutate('bulkUsers', { ids, action: v }); toast(r.updated + ' akun diperbarui'); }
    S.adminSel.clear();
    S.adminUsers = await api('users');
    drawAdminUsers();
  },
  userNew: () => openUserForm(null),
  userImport: () => openImportStudents({ mode: 'admin' }),
  userExport: () => {
    const rows = [['username', 'nama', 'peran', 'kelas', 'nisn', 'email', 'status', 'login_terakhir']];
    (S.auList || S.adminUsers || []).forEach(u => rows.push([u.username, u.name, ROLE[u.role], u.kelas, u.nisn, u.email, u.status === 'suspended' ? 'nonaktif' : 'aktif', u.last_login ? fDT(u.last_login) : '']));
    downloadFile('pengguna.csv', toCSV(rows));
  },
  userMenu: b => {
    const u = S.adminUsers.find(x => x.id === b.dataset.id);
    menu(b, [
      { label: 'Edit pengguna', icon: 'edit', fn: () => openUserForm(u) },
      { label: 'Reset password', icon: 'key', fn: async () => { const pw = await ask({ title: 'Reset password', message: 'Password baru untuk ' + u.name, input: { placeholder: 'Minimal 4 karakter', value: u.role === 'student' ? 'siswa123' : '' }, ok: 'Simpan' }); if (pw) { await mutate('saveUser', Object.assign({}, u, { password: pw })); toast('Password ' + u.name + ' direset'); } } },
      { label: u.status === 'suspended' ? 'Aktifkan akun' : 'Nonaktifkan akun', icon: 'lock', fn: async () => { await mutate('bulkUsers', { ids: [u.id], action: u.status === 'suspended' ? 'activate' : 'suspend' }); S.adminUsers = await api('users'); drawAdminUsers(); toast('Status akun diperbarui'); } },
      '-',
      { label: 'Hapus pengguna', icon: 'trash', danger: true, fn: async () => { if (await ask({ title: 'Hapus pengguna?', message: u.name + ' beserta seluruh data belajarnya akan dihapus.', ok: 'Hapus', danger: true, icon: 'trash' })) { await mutate('deleteUsers', { ids: [u.id] }); S.adminUsers = await api('users'); drawAdminUsers(); toast('Pengguna dihapus'); } } }
    ], { header: u.name + ' · @' + u.username });
  },
  acDel: async b => {
    const c = S.adminCourses.find(x => x.id === b.dataset.id);
    if (!(await ask({ title: 'Hapus kursus?', message: '"' + c.fullname + '" beserta seluruh isinya akan dihapus permanen.', ok: 'Hapus', danger: true, icon: 'trash' }))) return;
    await mutate('deleteCourse', { id: c.id });
    toast('Kursus dihapus');
    await refreshBoot();
    S.adminCourses = await api('allCourses');
    drawAdminCourses();
  },
  catNew: () => openCategoryForm(null),
  catEdit: b => openCategoryForm(S.categories.find(k => k.id === b.dataset.id)),
  catDel: async b => {
    const k = S.categories.find(x => x.id === b.dataset.id);
    if (!(await ask({ title: 'Hapus kategori?', message: 'Kursus dalam "' + k.name + '" akan menjadi tanpa kategori.', ok: 'Hapus', danger: true }))) return;
    await mutate('deleteCategory', { id: k.id });
    S.categories = await api('categories');
    drawCategories();
    toast('Kategori dihapus');
  },
  stSave: async b => {
    const f = $('#stForm');
    const s = await withBusy(b, () => mutate('saveSettings', { site_name: need(f, 'site_name', 'Nama situs wajib diisi.'), school_name: fv(f, 'school_name'), tagline: fv(f, 'tagline'), academic_year: fv(f, 'academic_year'), allow_register: fv(f, 'allow_register'), teacher_import: fv(f, 'teacher_import') }));
    S.settings = Object.assign(S.settings, s);
    const bt = LS.get('boot', null); if (bt) { bt.settings = S.settings; LS.set('boot', bt); }
    renderMeChip();
    toast('Pengaturan situs disimpan');
  }
};

/* ---------------------------------------------------------------- global events */
function bindGlobal() {
  document.addEventListener('click', e => {
    const sb = e.target.closest('.seg > button');
    if (sb && !sb.disabled) segSelect(sb);
    const a = e.target.closest('[data-act]');
    if (a && !a.disabled) {
      const f = A[a.dataset.act];
      if (f) { e.preventDefault(); Promise.resolve(f(a, e)).catch(err => { if (!err || !err.shown) { if (err && err.message) toast(err.message, 'error'); console.error(err); } }); return; }
    }
    const g = e.target.closest('[data-go]');
    if (g && !g.disabled) { e.preventDefault(); go(g.dataset.go); }
  });
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key && e.key.toLowerCase() === 'k' && S.user) { e.preventDefault(); openSpot(); }
    else if (e.key === 'Escape') {
      if (S.menu) closeMenu();
      else if (S.overlays.length) S.overlays[S.overlays.length - 1].close();
    }
  });
  let hlRaf = 0, hlEl = null;
  document.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || hlRaf) return;
    hlRaf = requestAnimationFrame(() => {
      hlRaf = 0;
      const el = e.target && e.target.closest ? e.target.closest('.glass') : null;
      if (hlEl && hlEl !== el) { hlEl.style.removeProperty('--mx'); hlEl.style.removeProperty('--my'); }
      hlEl = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      el.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  }, { passive: true });
  let lastY = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY, tb = $('#topbar'), bar = $('#tabbar');
    if (tb) tb.classList.toggle('scrolled', y > 36);
    if (bar) { if (y > lastY + 6 && y > 140) bar.classList.add('mini'); else if (y < lastY - 6 || y < 60) bar.classList.remove('mini'); }
    lastY = y;
  }, { passive: true });
  window.addEventListener('resize', debounce(() => { initSegs(); updateNav(S.path, false); }, 150));
  window.addEventListener('hashchange', route);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { initSegs(); updateNav(S.path, false); });
}

/* ---------------------------------------------------------------- start */
function safeInit(fn, name) { try { fn(); } catch (e) { console.error('[LMS] ' + name + ':', e); } }
async function start() {
  safeInit(applyPrefs, 'tampilan');
  safeInit(buildSprite, 'ikon');
  safeInit(bindGlobal, 'kontrol');
  S.apiUrl = resolveApi();
  if (!S.apiUrl) { showConnect(); return; }
  S.token = LS.get('token', null);
  if (!S.token) { showLogin(); refreshSettings(); return; }
  const cached = LS.get('boot', null);
  if (cached && cached.user) { applyBoot(cached); renderShell(); route(); }
  else { markReady(); $('#root').innerHTML = `<div class="login"><span class="spinner" style="width:34px;height:34px;border-width:3px"></span></div>`; }
  try {
    const b = await call('boot');
    applyBoot(b); LS.set('boot', b);
    if (!cached || !cached.user) { renderShell(); route(); } else { renderNavCourses(); renderMeChip(); }
  } catch (e) {
    if (e.auth || !cached) { LS.del('token'); LS.del('boot'); S.user = null; showLogin(e.auth ? e.message : 'Tidak dapat terhubung: ' + e.message); }
  }
}
/* ---------------------------------------------------------------- server: pengaturan, versi, koneksi */
let versionWarned = false;
function checkVersion(v) {
  if (!v || versionWarned) return;
  if (String(v).split('.')[0] !== APP_VERSION.split('.')[0]) {
    versionWarned = true;
    setTimeout(() => toast('Versi server (Code.gs v' + v + ') tidak cocok dengan aplikasi v' + APP_VERSION + '. Perbarui Code.gs di Apps Script.', 'error'), 800);
  }
}
async function refreshSettings() {
  try {
    const st = await call('settings');
    S.serverErr = '';
    const key = x => [x.site_name, x.school_name, x.tagline, !!x.allow_register].join('|');
    const changed = key(S.settings) !== key(st);
    Object.assign(S.settings, st); LS.set('settings', st); checkVersion(st.version);
    const lf = $('#loginForm');
    if (changed && !S.user && lf && !lf.username.value && !lf.password.value) showLogin();
  } catch (e) {
    S.serverErr = e.message;
    const el = $('#loginErr');
    if (!S.user && el && el.classList.contains('hidden')) { el.textContent = e.message; el.classList.remove('hidden'); }
  }
}
function serverInfoHTML() {
  const fromCfg = !!cleanApiUrl(CFG.API_URL);
  return `<div class="group" style="margin-top:12px"><div class="gi"><span class="k">Versi aplikasi</span><span class="v">v${esc(APP_VERSION)}</span></div><div class="gi"><span class="k">Versi server</span><span class="v">${S.settings.version ? 'v' + esc(S.settings.version) : '—'}</span></div>${S.user && S.user.role === 'admin' ? `<div class="gi"><span class="k">Server</span><span class="v ellipsis" style="max-width:60%" title="${esc(S.apiUrl)}">${DEMO ? 'Demo (di browser)' : fromCfg ? 'config.js' : 'disimpan di browser ini'}</span></div>` : ''}</div>${S.user && S.user.role === 'admin' && !fromCfg && !DEMO ? `<button class="btn btn-glass w100" style="margin-top:10px" data-act="changeServer">${ic('link', 'sm')} Ganti server</button>` : ''}`;
}
function showConnect(prefill, msg) {
  markReady();
  document.documentElement.classList.remove('focus-mode');
  $('#root').innerHTML = `<div class="login"><div class="login-card glass thick stg">
    <div class="app-icon">${ic('link')}</div>
    <h1>Hubungkan ke server</h1>
    <p class="sub">Tampilan LMS sudah siap. Tempel URL aplikasi web Google Apps Script (backend) Anda.</p>
    <form id="connForm" novalidate>
      <div class="inp-ic">${ic('link', 'sm')}<input class="input" name="url" inputmode="url" autocapitalize="none" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(prefill || '')}"></div>
      <div class="err-msg ${msg ? '' : 'hidden'}" id="connErr">${esc(msg || '')}</div>
      <button class="btn btn-primary btn-lg w100" type="submit">Hubungkan</button>
    </form>
    <p class="foot">Belum punya backend? Ikuti <a href="setup.html">panduan pemasangan</a>, atau <a href="demo.html">coba versi demo</a>.<br>Agar siswa langsung terhubung, admin cukup menyimpan URL ini sekali di <b>assets/js/config.js</b>.</p>
  </div><div class="login-copy">LMS Sekolah · v${esc(APP_VERSION)}</div></div>`;
  afterRender($('#root'));
  const f = $('#connForm'), err = $('#connErr');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const url = cleanApiUrl(f.url.value), btn = $('button[type=submit]', f);
    const show = m => { err.textContent = m; err.classList.remove('hidden'); shakeIt($('.login-card')); };
    if (!API_RE.test(url)) { show('Alamat belum benar. Gunakan URL aplikasi web Apps Script yang diawali https://script.google.com/ dan berakhiran /exec.'); return; }
    btn.classList.add('busy');
    try {
      const r = await postJSON(url, { action: 'ping', payload: {} }, 30000);
      LS.set('api_url', url); S.apiUrl = url;
      toast('Terhubung ke ' + (r.site_name || 'server') + ' (v' + r.version + ')');
      start();
    } catch (x) { show(x.message); }
    finally { btn.classList.remove('busy'); }
  });
}
window.LMS = { go, S, version: APP_VERSION };
function fatal(e) {
  console.error('[LMS] gagal memulai:', e);
  if (typeof window.__LMS_FATAL === 'function') { window.__LMS_FATAL(e); return; }
  const r = document.getElementById('root') || document.body;
  r.innerHTML = '<div style="max-width:560px;margin:12vh auto;padding:24px;border-radius:24px;background:rgba(255,255,255,.85);font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#1c1c1e"><b style="font-size:18px">Aplikasi gagal dimulai</b><p>' + esc(e && e.message || e) + '</p><p>Muat ulang halaman (F5). Jika tetap muncul, coba browser lain atau hubungi admin.</p></div>';
}
function boot() { try { start().catch(fatal); } catch (e) { fatal(e); } }
if (document.getElementById('root')) boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
