/**
 * ============================================================================
 *  LMS SEKOLAH — Backend API (Google Apps Script)  ·  versi 2.0.0
 * ============================================================================
 *  Arsitektur
 *    Frontend : GitHub Pages (repo LMS)  — tampilan Liquid Glass
 *    Backend  : file ini saja (Apps Script, dipanggil sebagai API JSON)
 *    Database : Google Sheets (semua tab dibuat otomatis)
 *
 *  PEMASANGAN
 *  1. Buka Google Sheet untuk database  →  Ekstensi  →  Apps Script.
 *  2. Hapus isi Code.gs, tempel seluruh isi file ini, simpan (Ctrl+S).
 *     Tidak perlu membuat file HTML apa pun di Apps Script.
 *  3. Pilih fungsi `setup` → Jalankan → izinkan akses.
 *  4. Terapkan → Deployment baru → jenis "Aplikasi web"
 *        Jalankan sebagai : Saya
 *        Akses            : Siapa saja
 *     Salin URL yang berakhiran /exec.
 *  5. Tempel URL itu di halaman "Pasang" situs GitHub Pages (setup.html)
 *     atau di file assets/js/config.js pada repo LMS.
 *  Login awal: admin / admin123 (segera ganti).
 *  Pemeriksaan: jalankan fungsi `cekInstalasi` lalu lihat Log eksekusi.
 * ============================================================================
 */
const CONFIG = {
  SPREADSHEET_ID: '',               // kosongkan bila script dibuat dari menu Ekstensi di Google Sheet
  UPLOAD_FOLDER: 'LMS Sekolah - Unggahan',
  SESSION_DAYS: 7,                  // lama sesi login (hari)
  MAX_UPLOAD_MB: 10,                // batas ukuran per berkas
  VERSION: '2.0.0'
};

/* ---------------------------------------------------------------------------
 *  SKEMA DATABASE — satu tab per tabel. Jangan ubah urutan kolom.
 * ------------------------------------------------------------------------- */
const SCHEMA = {
  Settings:      ['key', 'value'],
  Users:         ['id', 'username', 'password_hash', 'salt', 'name', 'email', 'role', 'kelas', 'nisn', 'color', 'status', 'created_at', 'last_login'],
  Categories:    ['id', 'name', 'description', 'sort'],
  Courses:       ['id', 'category_id', 'fullname', 'shortname', 'summary', 'enrol_key', 'cover', 'visible', 'start_date', 'end_date', 'created_by', 'created_at'],
  Enrolments:    ['id', 'course_id', 'user_id', 'role', 'created_at'],
  Sections:      ['id', 'course_id', 'title', 'summary', 'sort', 'visible'],
  Modules:       ['id', 'course_id', 'section_id', 'type', 'title', 'intro', 'config', 'sort', 'visible', 'open_date', 'due_date', 'max_grade', 'created_at'],
  Questions:     ['id', 'module_id', 'type', 'text', 'options', 'answer', 'points', 'sort'],
  Attempts:      ['id', 'module_id', 'user_id', 'started_at', 'finished_at', 'layout', 'answers', 'score', 'max_score', 'grade', 'status', 'preview'],
  Submissions:   ['id', 'module_id', 'user_id', 'text', 'files', 'status', 'submitted_at', 'grade', 'feedback', 'graded_by', 'graded_at'],
  Posts:         ['id', 'module_id', 'discussion_id', 'parent_id', 'user_id', 'subject', 'message', 'created_at'],
  Completions:   ['id', 'module_id', 'user_id', 'completed_at'],
  Announcements: ['id', 'course_id', 'user_id', 'title', 'message', 'created_at'],
  Sessions:      ['token', 'user_id', 'created_at', 'expires_at']
};

const ROLES = ['admin', 'teacher', 'student'];
const MOD_TYPES = ['page', 'file', 'url', 'label', 'assign', 'quiz', 'forum'];
const Q_TYPES = ['mc', 'multi', 'tf', 'short'];
const GRADABLE = ['assign', 'quiz'];
const COLORS = ['#007AFF', '#5856D6', '#AF52DE', '#FF2D55', '#FF9500', '#34C759', '#30B0C7', '#FF3B30', '#5AC8FA', '#A2845E'];

/* ===========================================================================
 *  API WEB — dipanggil frontend (GitHub Pages) dengan fetch()
 *  POST (Content-Type: text/plain) body: {"action":"...","token":"...","payload":{...}}
 *  GET  ?action=ping | ?action=settings  → cek koneksi / pengaturan publik
 *  Jawaban selalu JSON: {"ok":true,"data":...} atau {"ok":false,"error":"..."}
 * ========================================================================= */
const GET_ACTIONS = ['ping', 'settings'];

function doPost(e) {
  let req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}') || {}; }
  catch (err) { return out_({ ok: false, error: 'Format permintaan tidak valid.' }); }
  return out_(handle_(req.action, req.token, req.payload));
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!p.action) {
    return out_({ ok: true, data: { app: 'LMS Sekolah API', version: CONFIG.VERSION, message: 'Server LMS aktif. Buka aplikasi melalui alamat GitHub Pages.' } });
  }
  if (GET_ACTIONS.indexOf(p.action) < 0) return out_({ ok: false, error: 'Aksi ini harus dikirim dengan POST.' });
  return out_(handle_(p.action, p.token, {}));
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(action, token, payload) {
  DB.reset();
  try {
    const def = ACTIONS[action];
    if (!def) throw new Error('Aksi tidak dikenal: ' + action);
    ensureSetup_();
    const ctx = { token: token || '', user: null };
    if (!def.pub) ctx.user = auth_(token);
    if (def.admin && ctx.user.role !== 'admin') throw new Error('Hanya administrator yang dapat melakukan ini.');
    const data = def.fn(ctx, payload || {});
    return { ok: true, data: data === undefined ? null : data };
  } catch (err) {
    return { ok: false, error: (err && err.message) ? err.message : String(err) };
  }
}

function actPing_() {
  const s = getSettings_();
  return { app: 'LMS Sekolah API', version: CONFIG.VERSION, site_name: s.site_name || 'LMS Sekolah', time: now_() };
}
function actSettings_() { return publicSettings_(getSettings_()); }

/** Jalankan dari editor: memeriksa database & akun admin, lalu menampilkan URL aplikasi web. */
function cekInstalasi() {
  const lines = ['LMS Sekolah v' + CONFIG.VERSION + ' — pemeriksaan backend', ''];
  try {
    const book = DB.book();
    lines.push('✅ Spreadsheet: ' + book.getName());
    ensureSetup_(true);
    const missing = Object.keys(SCHEMA).filter(function (n) { return !book.getSheetByName(n); });
    lines.push(missing.length ? '❌ Tab belum ada: ' + missing.join(', ') : '✅ Semua tab database tersedia (' + Object.keys(SCHEMA).length + ' tab)');
    const users = DB.all('Users');
    const admins = users.filter(function (u) { return u.role === 'admin'; }).length;
    lines.push(admins ? '✅ Akun admin: ' + admins : '❌ Belum ada akun admin — jalankan fungsi setup');
    lines.push('ℹ️ Pengguna: ' + users.length + ' · Kursus: ' + DB.all('Courses').length);
  } catch (e) { lines.push('❌ Database: ' + e.message); }
  let url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { url = ''; }
  lines.push(url
    ? '✅ Aplikasi web aktif: ' + url + '\n   (Gunakan URL dari Terapkan → Kelola deployment yang berakhiran /exec.)'
    : 'ℹ️ Belum di-deploy: Terapkan → Deployment baru → Aplikasi web (Jalankan sebagai: Saya, Akses: Siapa saja).');
  const report = lines.join('\n');
  Logger.log(report);
  return report;
}

/** Jalankan sekali dari editor untuk membuat tab database & akun admin. */
function setup() {
  ensureSetup_(true);
  return 'Setup selesai. Login awal: admin / admin123';
}

/* ===========================================================================
 *  DATABASE LAYER (Google Sheets)
 * ========================================================================= */
const DB = (function () {
  let book_ = null;
  let cache = {};
  let sheets = {};
  let lockDepth = 0;

  function book() {
    if (book_) return book_;
    book_ = CONFIG.SPREADSHEET_ID ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
    if (!book_) throw new Error('Spreadsheet database tidak ditemukan. Isi CONFIG.SPREADSHEET_ID atau buat script dari menu Ekstensi › Apps Script di Google Sheet.');
    return book_;
  }

  function sheet(name) {
    if (sheets[name]) return sheets[name];
    const cols = SCHEMA[name];
    if (!cols) throw new Error('Tabel tidak dikenal: ' + name);
    let sh = book().getSheetByName(name);
    if (!sh) {
      sh = book().insertSheet(name);
      sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
      sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#e8eefc');
      sh.setFrozenRows(1);
    } else if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, cols.length).setNumberFormat('@').setValues([cols]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    sheets[name] = sh;
    return sh;
  }

  function cellIn(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return String(v.getTime());
    return String(v);
  }
  function cellOut(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    const s = String(v);
    return s.charAt(0) === '=' ? "'" + s : s;   // cegah teks dianggap rumus
  }
  function rowOf(name, o) { return SCHEMA[name].map(function (c) { return cellOut(o[c]); }); }

  function all(name) {
    if (cache[name]) return cache[name];
    const sh = sheet(name), cols = SCHEMA[name], last = sh.getLastRow(), out = [];
    if (last >= 2) {
      const vals = sh.getRange(2, 1, last - 1, cols.length).getValues();
      for (let i = 0; i < vals.length; i++) {
        const r = vals[i];
        if (r[0] === '' || r[0] === null) continue;
        const o = { _row: i + 2 };
        for (let j = 0; j < cols.length; j++) o[cols[j]] = cellIn(r[j]);
        out.push(o);
      }
    }
    cache[name] = out;
    return out;
  }

  function withLock(fn) {
    if (lockDepth > 0) return fn();
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    lockDepth++;
    try { return fn(); }
    finally { lockDepth--; SpreadsheetApp.flush(); lock.releaseLock(); }
  }

  function ensureRows(sh, upto) {
    const max = sh.getMaxRows();
    if (upto > max) sh.insertRowsAfter(max, upto - max + 200);
  }

  function get(name, id) {
    const key = SCHEMA[name][0], sid = String(id);
    const rows = all(name);
    for (let i = 0; i < rows.length; i++) if (rows[i][key] === sid) return rows[i];
    return null;
  }

  function insertMany(name, objs) {
    if (!objs || !objs.length) return objs;
    return withLock(function () {
      const sh = sheet(name), cols = SCHEMA[name], start = sh.getLastRow() + 1;
      ensureRows(sh, start + objs.length - 1);
      sh.getRange(start, 1, objs.length, cols.length).setNumberFormat('@').setValues(objs.map(function (o) { return rowOf(name, o); }));
      delete cache[name];
      return objs;
    });
  }

  function update(name, id, patch) {
    return withLock(function () {
      let rec = get(name, id);
      if (!rec) throw new Error('Data tidak ditemukan.');
      const sh = sheet(name);
      if (String(sh.getRange(rec._row, 1).getValue()) !== String(id)) { // baris bergeser karena proses lain
        delete cache[name];
        rec = get(name, id);
        if (!rec) throw new Error('Data tidak ditemukan.');
      }
      const cols = SCHEMA[name];
      Object.keys(patch).forEach(function (k) { if (cols.indexOf(k) >= 0) rec[k] = cellIn(cellOut(patch[k])).replace(/^'=/, '='); });
      sh.getRange(rec._row, 1, 1, cols.length).setNumberFormat('@').setValues([rowOf(name, rec)]);
      return rec;
    });
  }

  function remove(name, id) {
    return withLock(function () {
      delete cache[name];
      const rec = get(name, id);
      if (!rec) return false;
      const sh = sheet(name);
      if (sh.getMaxRows() <= rec._row + 1) sh.insertRowsAfter(sh.getMaxRows(), 50);   // Sheets menolak menghapus baris terakhir
      sh.deleteRow(rec._row);
      delete cache[name];
      return true;
    });
  }

  function removeWhere(name, fn) {
    return withLock(function () {
      delete cache[name];
      const rows = all(name), keep = rows.filter(function (r) { return !fn(r); }), n = rows.length - keep.length;
      if (!n) return 0;
      const sh = sheet(name), cols = SCHEMA[name];
      if (n === 1) {
        const r = rows.filter(fn)[0];
        if (sh.getMaxRows() <= r._row + 1) sh.insertRowsAfter(sh.getMaxRows(), 50);
        sh.deleteRow(r._row);
      } else {
        const last = sh.getLastRow();
        if (last >= 2) sh.getRange(2, 1, last - 1, cols.length).clearContent();
        if (keep.length) sh.getRange(2, 1, keep.length, cols.length).setNumberFormat('@').setValues(keep.map(function (r) { return rowOf(name, r); }));
      }
      delete cache[name];
      return n;
    });
  }

  return {
    book: book, sheet: sheet, all: all, get: get,
    find: function (name, fn) { const r = all(name); for (let i = 0; i < r.length; i++) if (fn(r[i])) return r[i]; return null; },
    where: function (name, fn) { return all(name).filter(fn); },
    insert: function (name, obj) { insertMany(name, [obj]); return obj; },
    insertMany: insertMany, update: update, remove: remove, removeWhere: removeWhere, withLock: withLock,
    reset: function () { cache = {}; sheets = {}; book_ = null; lockDepth = 0; }
  };
})();

function ensureSetup_(force) {
  const props = PropertiesService.getScriptProperties();
  const key = CONFIG.VERSION + '|' + DB.book().getId();
  if (!force && props.getProperty('SETUP_KEY') === key) return;
  DB.withLock(function () {
    Object.keys(SCHEMA).forEach(function (n) {
      const sh = DB.sheet(n), cols = SCHEMA[n];
      const head = sh.getRange(1, 1, 1, cols.length).getValues()[0].map(String);
      if (head.join('|') !== cols.join('|')) sh.getRange(1, 1, 1, cols.length).setNumberFormat('@').setValues([cols]).setFontWeight('bold');
    });
    const defaults = {
      site_name: 'LMS Sekolah',
      school_name: 'SMKN 1 Murung Pudak',
      tagline: 'Belajar di mana saja, kapan saja.',
      academic_year: '2026/2027',
      allow_register: '0',
      teacher_import: '1'
    };
    const cur = getSettings_();
    const add = Object.keys(defaults).filter(function (k) { return cur[k] === undefined; }).map(function (k) { return { key: k, value: defaults[k] }; });
    DB.insertMany('Settings', add);
    if (!DB.all('Users').some(function (u) { return u.role === 'admin'; })) {
      createUser_({ username: 'admin', password: 'admin123', name: 'Administrator', role: 'admin' });
    }
    try {
      const book = DB.book();
      ['Sheet1', 'Lembar1', 'Sheet 1'].forEach(function (n) {
        const s = book.getSheetByName(n);
        if (s && book.getSheets().length > 1 && s.getLastRow() === 0) book.deleteSheet(s);
      });
    } catch (e) { /* abaikan */ }
  });
  props.setProperty('SETUP_KEY', key);
}

/* ===========================================================================
 *  HELPER
 * ========================================================================= */
function str_(v) { return v === null || v === undefined ? '' : String(v); }
function num_(v, d) {
  if (v === '' || v === null || v === undefined) return d === undefined ? 0 : d;
  const n = Number(v);
  return isNaN(n) ? (d === undefined ? 0 : d) : n;
}
function bool_(v) { return v === true || v === 1 || v === '1' || v === 'true' || v === 'TRUE'; }
function json_(s, d) {
  if (s === '' || s === null || s === undefined) return d;
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch (e) { return d; }
}
function now_() { return Date.now(); }
function uid_(p) { return (p || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function round2_(n) { return Math.round(Number(n) * 100) / 100; }
function fail_(msg) { throw new Error(msg); }
function plain_(h) {
  return str_(h).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}
function hasContent_(h) { return !!plain_(h) || /<(img|iframe)/i.test(str_(h)); }
function mapBy_(arr, k) { const o = {}; arr.forEach(function (x) { o[x[k]] = x; }); return o; }
function idSet_(arr) { const o = {}; arr.forEach(function (x) { o[x.id] = 1; }); return o; }
function bySort_(a, b) { return num_(a.sort) - num_(b.sort); }
function byName_(a, b) { return str_(a.name).localeCompare(str_(b.name)); }
function shuffle_(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
function limit_(v, max, label) {
  const s = str_(v);
  if (s.length > max) fail_((label || 'Teks') + ' terlalu panjang (maks ' + max + ' karakter).');
  return s;
}
function hash_(pw, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '::' + pw, Utilities.Charset.UTF_8);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += ('0' + ((bytes[i] + 256) % 256).toString(16)).slice(-2);
  return out;
}
function newSalt_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 16); }

function getSettings_() { const o = {}; DB.all('Settings').forEach(function (r) { o[r.key] = r.value; }); return o; }
function setSetting_(k, v) {
  if (DB.get('Settings', k)) DB.update('Settings', k, { value: v });
  else DB.insert('Settings', { key: k, value: v });
}
function publicSettings_(s) {
  return {
    site_name: s.site_name || 'LMS Sekolah', school_name: s.school_name || '', tagline: s.tagline || '',
    academic_year: s.academic_year || '', allow_register: s.allow_register === '1', teacher_import: s.teacher_import !== '0', version: CONFIG.VERSION
  };
}

function briefUser_(u) { return { id: u.id, name: u.name, color: u.color, kelas: u.kelas, role: u.role }; }
function publicUser_(u) {
  return {
    id: u.id, username: u.username, name: u.name, email: u.email, role: u.role, kelas: u.kelas, nisn: u.nisn,
    color: u.color, status: u.status || 'active', created_at: num_(u.created_at), last_login: num_(u.last_login)
  };
}
function catOut_(c) { return { id: c.id, name: c.name, description: c.description, sort: num_(c.sort) }; }
function secOut_(s) { return { id: s.id, title: s.title, summary: s.summary, sort: num_(s.sort), visible: bool_(s.visible) }; }
function modOut_(m, full) {
  const cfg = json_(m.config, {});
  if (!full && m.type === 'page') delete cfg.body;
  return {
    id: m.id, course_id: m.course_id, section_id: m.section_id, type: m.type, title: m.title,
    intro: (full || m.type === 'label') ? m.intro : '', config: cfg, sort: num_(m.sort), visible: bool_(m.visible),
    open_date: num_(m.open_date), due_date: num_(m.due_date), max_grade: num_(m.max_grade, 100), created_at: num_(m.created_at)
  };
}
function courseOut_(c, isTeacher) {
  const o = {
    id: c.id, fullname: c.fullname, shortname: c.shortname, summary: c.summary, category_id: c.category_id,
    cover: num_(c.cover), visible: bool_(c.visible), start_date: num_(c.start_date), end_date: num_(c.end_date), hasKey: !!c.enrol_key
  };
  if (isTeacher) o.enrol_key = c.enrol_key;
  return o;
}

/* ===========================================================================
 *  AUTENTIKASI & HAK AKSES
 * ========================================================================= */
function auth_(token) {
  if (!token) throw new Error('AUTH: Silakan masuk terlebih dahulu.');
  const cache = CacheService.getScriptCache();
  let uid = cache.get('s_' + token);
  if (!uid) {
    const s = DB.get('Sessions', token);
    if (!s || num_(s.expires_at) < now_()) throw new Error('AUTH: Sesi Anda telah berakhir. Silakan masuk kembali.');
    uid = s.user_id;
    cache.put('s_' + token, uid, 21600);
  }
  const u = DB.get('Users', uid);
  if (!u) throw new Error('AUTH: Akun tidak ditemukan.');
  if (u.status === 'suspended') throw new Error('AUTH: Akun Anda dinonaktifkan.');
  return u;
}

function createSession_(u) {
  const token = Utilities.getUuid().replace(/-/g, '') + Math.random().toString(36).slice(2, 10);
  DB.insert('Sessions', { token: token, user_id: u.id, created_at: now_(), expires_at: now_() + CONFIG.SESSION_DAYS * 864e5 });
  CacheService.getScriptCache().put('s_' + token, u.id, 21600);
  return token;
}

function createUser_(d, opts) {
  opts = opts || {};
  const username = str_(d.username).trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) fail_('Username "' + username + '" tidak valid (3–40 karakter: huruf kecil, angka, titik, minus, garis bawah).');
  if (!opts.skipCheck && DB.find('Users', function (u) { return u.username === username; })) fail_('Username "' + username + '" sudah digunakan.');
  const pw = str_(d.password);
  if (pw.length < 4) fail_('Password minimal 4 karakter.');
  const name = str_(d.name).trim();
  if (!name) fail_('Nama lengkap wajib diisi.');
  const salt = newSalt_();
  const u = {
    id: uid_('u'), username: username, password_hash: hash_(pw, salt), salt: salt, name: name.slice(0, 100),
    email: str_(d.email).trim().slice(0, 120), role: ROLES.indexOf(d.role) >= 0 ? d.role : 'student',
    kelas: str_(d.kelas).trim().slice(0, 40), nisn: str_(d.nisn).trim().slice(0, 30),
    color: d.color || COLORS[Math.floor(Math.random() * COLORS.length)], status: 'active', created_at: now_(), last_login: ''
  };
  if (!opts.noInsert) DB.insert('Users', u);
  return u;
}

function userCourseRoles_(u) {
  const m = {};
  if (u.role === 'admin') { DB.all('Courses').forEach(function (c) { m[c.id] = 'teacher'; }); return m; }
  DB.all('Enrolments').forEach(function (e) { if (e.user_id === u.id) m[e.course_id] = e.role === 'teacher' ? 'teacher' : 'student'; });
  return m;
}
function courseAccess_(u, courseId) {
  const c = DB.get('Courses', courseId);
  if (!c) fail_('Kursus tidak ditemukan.');
  if (u.role === 'admin') return { course: c, role: 'teacher' };
  const e = DB.find('Enrolments', function (x) { return x.course_id === c.id && x.user_id === u.id; });
  if (!e) return { course: c, role: null };
  const role = e.role === 'teacher' ? 'teacher' : 'student';
  if (role === 'student' && !bool_(c.visible)) fail_('Kursus ini sedang disembunyikan oleh guru.');
  return { course: c, role: role };
}
function requireCourse_(u, courseId, needTeacher) {
  const a = courseAccess_(u, courseId);
  if (!a.role) fail_('Anda belum terdaftar di kursus ini.');
  if (needTeacher && a.role !== 'teacher') fail_('Hanya guru kursus yang dapat melakukan ini.');
  return a;
}
function sectionVis_() { const o = {}; DB.all('Sections').forEach(function (s) { o[s.id] = bool_(s.visible); }); return o; }
function visibleForStudent_(m, secVis) { return bool_(m.visible) && secVis[m.section_id] !== false; }
function moduleAccess_(u, moduleId, needTeacher) {
  const m = DB.get('Modules', moduleId);
  if (!m) fail_('Aktivitas tidak ditemukan.');
  const a = requireCourse_(u, m.course_id, needTeacher);
  if (a.role !== 'teacher' && !visibleForStudent_(m, sectionVis_())) fail_('Aktivitas ini sedang tidak tersedia.');
  a.module = m;
  return a;
}
function markComplete_(mid, uid) {
  if (!DB.find('Completions', function (c) { return c.module_id === mid && c.user_id === uid; })) {
    DB.insert('Completions', { id: uid_('cp'), module_id: mid, user_id: uid, completed_at: now_() });
  }
}
function completionSet_(uid) { const o = {}; DB.all('Completions').forEach(function (c) { if (c.user_id === uid) o[c.module_id] = num_(c.completed_at); }); return o; }

/* ===========================================================================
 *  AKSI: SESI & PROFIL
 * ========================================================================= */
function actLogin_(ctx, p) {
  const username = str_(p.username).trim().toLowerCase(), pw = str_(p.password);
  if (!username || !pw) fail_('Masukkan username dan password.');
  const cache = CacheService.getScriptCache(), fk = 'fail_' + username, fails = num_(cache.get(fk));
  if (fails >= 8) fail_('Terlalu banyak percobaan gagal. Coba lagi dalam 5 menit.');
  const u = DB.find('Users', function (x) { return x.username === username; });
  if (!u || hash_(pw, u.salt) !== u.password_hash) {
    cache.put(fk, String(fails + 1), 300);
    fail_('Username atau password salah.');
  }
  if (u.status === 'suspended') fail_('Akun Anda dinonaktifkan. Hubungi administrator.');
  cache.remove(fk);
  DB.update('Users', u.id, { last_login: now_() });
  if (DB.all('Sessions').length > 300) { const t = now_(); DB.removeWhere('Sessions', function (s) { return num_(s.expires_at) < t; }); }
  return { token: createSession_(u), boot: bootData_(u) };
}

function actRegister_(ctx, p) {
  if (getSettings_().allow_register !== '1') fail_('Pendaftaran mandiri tidak diaktifkan. Hubungi administrator.');
  const u = createUser_({ username: p.username, password: p.password, name: p.name, email: p.email, kelas: p.kelas, nisn: p.nisn, role: 'student' });
  return { token: createSession_(u), boot: bootData_(u) };
}

function actLogout_(ctx) {
  CacheService.getScriptCache().remove('s_' + ctx.token);
  DB.remove('Sessions', ctx.token);
  return true;
}

function bootData_(u) {
  return {
    user: publicUser_(u), settings: publicSettings_(getSettings_()), courses: myCourses_(u),
    categories: DB.all('Categories').map(catOut_).sort(bySort_)
  };
}
function actBoot_(ctx) { return bootData_(ctx.user); }

function actSaveProfile_(ctx, p) {
  const name = str_(p.name).trim();
  if (!name) fail_('Nama wajib diisi.');
  const patch = { name: name.slice(0, 100), email: str_(p.email).trim().slice(0, 120) };
  if (p.color && /^#[0-9a-f]{6}$/i.test(p.color)) patch.color = p.color;
  return publicUser_(DB.update('Users', ctx.user.id, patch));
}

function actChangePassword_(ctx, p) {
  const u = ctx.user;
  if (hash_(str_(p.old), u.salt) !== u.password_hash) fail_('Password lama salah.');
  if (str_(p.password).length < 4) fail_('Password baru minimal 4 karakter.');
  const salt = newSalt_();
  DB.update('Users', u.id, { salt: salt, password_hash: hash_(str_(p.password), salt) });
  return true;
}

/* ===========================================================================
 *  AKSI: DASBOR, KURSUS SAYA, KATALOG
 * ========================================================================= */
function courseStatsCtx_(u, roles) {
  const users = mapBy_(DB.all('Users'), 'id'), teachers = {}, studentCount = {};
  DB.all('Enrolments').forEach(function (e) {
    if (e.role === 'teacher') {
      const t = users[e.user_id];
      if (t) (teachers[e.course_id] = teachers[e.course_id] || []).push({ id: t.id, name: t.name, color: t.color });
    } else if (users[e.user_id]) studentCount[e.course_id] = (studentCount[e.course_id] || 0) + 1;
  });
  const secVis = sectionVis_();
  const mods = DB.all('Modules').filter(function (m) { return roles[m.course_id]; });
  const modById = mapBy_(mods, 'id');
  const compl = completionSet_(u.id);
  const toGrade = {};
  DB.all('Submissions').forEach(function (s) {
    const m = modById[s.module_id];
    if (m && roles[m.course_id] === 'teacher' && s.status === 'submitted' && s.grade === '') toGrade[m.course_id] = (toGrade[m.course_id] || 0) + 1;
  });
  return { teachers: teachers, studentCount: studentCount, secVis: secVis, mods: mods, compl: compl, toGrade: toGrade, users: users };
}

function progressFor_(courseId, x) {
  const list = x.mods.filter(function (m) { return m.course_id === courseId && m.type !== 'label' && visibleForStudent_(m, x.secVis); });
  const done = list.filter(function (m) { return x.compl[m.id]; }).length;
  return { done: done, total: list.length, pct: list.length ? Math.round(done / list.length * 100) : 0 };
}

function courseCard_(c, role, cats, x) {
  const o = {
    id: c.id, fullname: c.fullname, shortname: c.shortname, category: (cats[c.category_id] || {}).name || '',
    category_id: c.category_id, cover: num_(c.cover), visible: bool_(c.visible), start_date: num_(c.start_date),
    end_date: num_(c.end_date), role: role || null
  };
  if (x) {
    o.summary = plain_(c.summary).slice(0, 220);
    o.teachers = x.teachers[c.id] || [];
    o.students = x.studentCount[c.id] || 0;
    if (role === 'student') o.progress = progressFor_(c.id, x);
    if (role === 'teacher') o.toGrade = x.toGrade[c.id] || 0;
  }
  return o;
}

function myCourses_(u, detail) {
  const roles = userCourseRoles_(u), cats = mapBy_(DB.all('Categories'), 'id');
  const x = detail ? courseStatsCtx_(u, roles) : null;
  return DB.all('Courses')
    .filter(function (c) { return roles[c.id] && (roles[c.id] === 'teacher' || bool_(c.visible)); })
    .map(function (c) { return courseCard_(c, roles[c.id], cats, x); })
    .sort(function (a, b) { return a.fullname.localeCompare(b.fullname); });
}
function actMyCourses_(ctx) { return myCourses_(ctx.user, true); }

function announcementsFor_(u, roles, courseId, limit) {
  roles = roles || userCourseRoles_(u);
  const users = mapBy_(DB.all('Users'), 'id'), courses = mapBy_(DB.all('Courses'), 'id');
  return DB.all('Announcements')
    .filter(function (a) { return courseId ? a.course_id === courseId : (!a.course_id || roles[a.course_id]); })
    .map(function (a) {
      const au = users[a.user_id];
      return {
        id: a.id, course_id: a.course_id, course: a.course_id && courses[a.course_id] ? courses[a.course_id].fullname : '',
        title: a.title, message: a.message, created_at: num_(a.created_at), author: au ? briefUser_(au) : { name: 'Admin' }
      };
    })
    .sort(function (a, b) { return b.created_at - a.created_at; })
    .slice(0, limit || 50);
}

function actDashboard_(ctx) {
  const u = ctx.user, roles = userCourseRoles_(u), x = courseStatsCtx_(u, roles), cats = mapBy_(DB.all('Categories'), 'id');
  const courses = DB.all('Courses')
    .filter(function (c) { return roles[c.id] && (roles[c.id] === 'teacher' || bool_(c.visible)); })
    .map(function (c) { return courseCard_(c, roles[c.id], cats, x); })
    .sort(function (a, b) { return a.fullname.localeCompare(b.fullname); });
  const cById = mapBy_(courses, 'id'), now = now_();
  const subs = DB.all('Submissions'), subCount = {}, need = {};
  subs.forEach(function (s) {
    if (s.status !== 'submitted') return;
    subCount[s.module_id] = (subCount[s.module_id] || 0) + 1;
    if (s.grade === '') need[s.module_id] = (need[s.module_id] || 0) + 1;
  });
  const timeline = [];
  x.mods.forEach(function (m) {
    if (GRADABLE.indexOf(m.type) < 0) return;
    const c = cById[m.course_id], due = num_(m.due_date);
    if (!c || !due) return;
    const role = roles[m.course_id];
    if (role === 'student') {
      if (!visibleForStudent_(m, x.secVis) || x.compl[m.id] || due < now - 60 * 864e5) return;
    } else if (due < now - 7 * 864e5) return;
    timeline.push({
      id: m.id, type: m.type, title: m.title, course_id: c.id, course: c.fullname, due: due, overdue: due < now, role: role,
      need: need[m.id] || 0, submitted: subCount[m.id] || 0, students: x.studentCount[m.course_id] || 0
    });
  });
  timeline.sort(function (a, b) { return a.due - b.due; });

  const stats = {}, recent = [];
  const teacherCourses = courses.filter(function (c) { return c.role === 'teacher'; });
  const studentCourses = courses.filter(function (c) { return c.role === 'student'; });
  const modById = mapBy_(x.mods, 'id');
  if (u.role === 'admin') {
    const all = DB.all('Users');
    stats.users = all.length;
    stats.teachers = all.filter(function (v) { return v.role === 'teacher'; }).length;
    stats.students = all.filter(function (v) { return v.role === 'student'; }).length;
    stats.courses = courses.length;
    stats.toGrade = teacherCourses.reduce(function (s, c) { return s + (c.toGrade || 0); }, 0);
  } else if (u.role === 'teacher' || teacherCourses.length) {
    const uniq = {};
    DB.all('Enrolments').forEach(function (e) { if (e.role === 'student' && roles[e.course_id] === 'teacher') uniq[e.user_id] = 1; });
    stats.courses = teacherCourses.length;
    stats.students = Object.keys(uniq).length;
    stats.toGrade = teacherCourses.reduce(function (s, c) { return s + (c.toGrade || 0); }, 0);
    stats.activities = x.mods.filter(function (m) { return roles[m.course_id] === 'teacher' && m.type !== 'label'; }).length;
  }
  if (studentCourses.length) {
    stats.myCourses = studentCourses.length;
    stats.progress = studentCourses.length ? Math.round(studentCourses.reduce(function (s, c) { return s + c.progress.pct; }, 0) / studentCourses.length) : 0;
    stats.pending = timeline.filter(function (t) { return t.role === 'student' && !t.overdue; }).length;
    stats.overdue = timeline.filter(function (t) { return t.role === 'student' && t.overdue; }).length;
  }
  // Aktivitas terbaru
  if (teacherCourses.length) {
    subs.filter(function (s) { const m = modById[s.module_id]; return m && roles[m.course_id] === 'teacher' && s.status === 'submitted'; })
      .sort(function (a, b) { return num_(b.submitted_at) - num_(a.submitted_at); }).slice(0, 6)
      .forEach(function (s) {
        const m = modById[s.module_id], st = x.users[s.user_id];
        recent.push({ kind: 'submission', module_id: m.id, title: m.title, course: (cById[m.course_id] || {}).fullname, who: st ? st.name : '(dihapus)', color: st ? st.color : '#999', time: num_(s.submitted_at), graded: s.grade !== '' });
      });
  } else {
    subs.filter(function (s) { return s.user_id === u.id && s.grade !== '' && modById[s.module_id]; }).forEach(function (s) {
      const m = modById[s.module_id];
      recent.push({ kind: 'grade', module_id: m.id, title: m.title, course: (cById[m.course_id] || {}).fullname, grade: num_(s.grade), max: num_(m.max_grade, 100), time: num_(s.graded_at) });
    });
    DB.all('Attempts').filter(function (t) { return t.user_id === u.id && t.status === 'finished' && !bool_(t.preview) && modById[t.module_id]; }).forEach(function (t) {
      const m = modById[t.module_id];
      recent.push({ kind: 'quiz', module_id: m.id, attempt_id: t.id, title: m.title, course: (cById[m.course_id] || {}).fullname, grade: num_(t.grade), max: num_(m.max_grade, 100), time: num_(t.finished_at) });
    });
    recent.sort(function (a, b) { return b.time - a.time; });
    recent.splice(6);
  }
  return { courses: courses, timeline: timeline, announcements: announcementsFor_(u, roles, null, 5), stats: stats, recent: recent };
}

function actCatalog_(ctx) {
  const u = ctx.user, roles = userCourseRoles_(u), users = mapBy_(DB.all('Users'), 'id'), teachers = {}, count = {};
  DB.all('Enrolments').forEach(function (e) {
    if (e.role === 'teacher' && users[e.user_id]) (teachers[e.course_id] = teachers[e.course_id] || []).push(users[e.user_id].name);
    if (e.role === 'student') count[e.course_id] = (count[e.course_id] || 0) + 1;
  });
  const courses = DB.all('Courses')
    .filter(function (c) { return bool_(c.visible) || roles[c.id] === 'teacher'; })
    .map(function (c) {
      return {
        id: c.id, fullname: c.fullname, shortname: c.shortname, category_id: c.category_id, cover: num_(c.cover),
        summary: plain_(c.summary).slice(0, 220), teachers: teachers[c.id] || [], students: count[c.id] || 0,
        enrolled: !!roles[c.id], role: roles[c.id] || null, selfEnrol: !!c.enrol_key, visible: bool_(c.visible)
      };
    })
    .sort(function (a, b) { return a.fullname.localeCompare(b.fullname); });
  return { categories: DB.all('Categories').map(catOut_).sort(bySort_), courses: courses };
}

/* ===========================================================================
 *  AKSI: HALAMAN KURSUS
 * ========================================================================= */
function quizGrade_(atts, method) {
  if (!atts || !atts.length) return null;
  const sorted = atts.slice().sort(function (a, b) { return num_(a.started_at) - num_(b.started_at); });
  const g = sorted.map(function (t) { return num_(t.grade); });
  if (method === 'first') return g[0];
  if (method === 'last') return g[g.length - 1];
  if (method === 'average') return round2_(g.reduce(function (s, v) { return s + v; }, 0) / g.length);
  return Math.max.apply(null, g);
}

function actCourse_(ctx, p) {
  const u = ctx.user, a = courseAccess_(u, p.id), c = a.course;
  const users = mapBy_(DB.all('Users'), 'id');
  const enrols = DB.where('Enrolments', function (e) { return e.course_id === c.id; });
  const teachers = enrols.filter(function (e) { return e.role === 'teacher'; }).map(function (e) { return users[e.user_id]; })
    .filter(Boolean).map(function (t) { return { id: t.id, name: t.name, color: t.color }; });
  const cat = DB.get('Categories', c.category_id);
  const isT = a.role === 'teacher';
  const out = { course: courseOut_(c, isT), category: cat ? cat.name : '', teachers: teachers, role: a.role };
  if (!a.role) {
    if (!bool_(c.visible)) fail_('Kursus tidak tersedia.');
    out.needEnrol = true;
    out.selfEnrol = !!c.enrol_key;
    return out;
  }
  let sections = DB.where('Sections', function (s) { return s.course_id === c.id; }).sort(bySort_);
  const secVis = {};
  sections.forEach(function (s) { secVis[s.id] = bool_(s.visible); });
  if (!isT) sections = sections.filter(function (s) { return bool_(s.visible); });
  let mods = DB.where('Modules', function (m) { return m.course_id === c.id; }).sort(bySort_);
  if (!isT) mods = mods.filter(function (m) { return visibleForStudent_(m, secVis); });
  const modIds = idSet_(mods), info = {}, compl = {};
  DB.all('Completions').forEach(function (x) { if (x.user_id === u.id && modIds[x.module_id]) compl[x.module_id] = 1; });
  const modType = {};
  mods.forEach(function (m) { modType[m.id] = m; });
  if (isT) {
    DB.all('Submissions').forEach(function (s) {
      if (!modIds[s.module_id] || s.status !== 'submitted') return;
      const i = info[s.module_id] = info[s.module_id] || { submitted: 0, need: 0 };
      i.submitted++;
      if (s.grade === '') i.need++;
    });
    DB.all('Attempts').forEach(function (t) {
      if (!modIds[t.module_id] || t.status !== 'finished' || bool_(t.preview)) return;
      const i = info[t.module_id] = info[t.module_id] || {};
      i.attempts = (i.attempts || 0) + 1;
    });
    DB.all('Posts').forEach(function (t) {
      if (!modIds[t.module_id] || t.parent_id) return;
      const i = info[t.module_id] = info[t.module_id] || {};
      i.discussions = (i.discussions || 0) + 1;
    });
    out.studentCount = enrols.filter(function (e) { return e.role === 'student' && users[e.user_id]; }).length;
  } else {
    DB.all('Submissions').forEach(function (s) {
      if (s.user_id === u.id && modIds[s.module_id]) info[s.module_id] = { status: s.status, grade: s.grade === '' ? null : num_(s.grade) };
    });
    const at = {};
    DB.all('Attempts').forEach(function (t) {
      if (t.user_id === u.id && modIds[t.module_id] && t.status === 'finished' && !bool_(t.preview)) (at[t.module_id] = at[t.module_id] || []).push(t);
    });
    Object.keys(at).forEach(function (mid) {
      info[mid] = { attempts: at[mid].length, grade: quizGrade_(at[mid], json_(modType[mid].config, {}).grade_method) };
    });
  }
  const outMods = mods.map(function (m) { const o = modOut_(m, false); o.done = !!compl[m.id]; o.info = info[m.id] || null; return o; });
  out.sections = sections.map(function (s) {
    const so = secOut_(s);
    so.modules = outMods.filter(function (m) { return m.section_id === s.id; });
    return so;
  });
  if (!isT) {
    const track = outMods.filter(function (m) { return m.type !== 'label'; });
    const done = track.filter(function (m) { return m.done; }).length;
    out.progress = { done: done, total: track.length, pct: track.length ? Math.round(done / track.length * 100) : 0 };
  }
  out.announcements = announcementsFor_(u, null, c.id, 3);
  return out;
}

function actEnrolSelf_(ctx, p) {
  const u = ctx.user, c = DB.get('Courses', p.id);
  if (!c || !bool_(c.visible)) fail_('Kursus tidak tersedia.');
  if (DB.find('Enrolments', function (e) { return e.course_id === c.id && e.user_id === u.id; })) return true;
  if (!c.enrol_key) fail_('Kursus ini tidak membuka pendaftaran mandiri. Hubungi guru pengampu.');
  if (str_(p.key).trim() !== str_(c.enrol_key).trim()) fail_('Kunci pendaftaran salah.');
  DB.insert('Enrolments', { id: uid_('e'), course_id: c.id, user_id: u.id, role: 'student', created_at: now_() });
  return true;
}

function actSaveCourse_(ctx, p) {
  const u = ctx.user;
  const fullname = str_(p.fullname).trim().slice(0, 150), shortname = str_(p.shortname).trim().slice(0, 40);
  if (!fullname) fail_('Nama lengkap kursus wajib diisi.');
  if (!shortname) fail_('Nama singkat kursus wajib diisi.');
  if (DB.find('Courses', function (c) { return c.shortname.toLowerCase() === shortname.toLowerCase() && c.id !== p.id; })) fail_('Nama singkat "' + shortname + '" sudah dipakai kursus lain.');
  const rec = {
    category_id: str_(p.category_id), fullname: fullname, shortname: shortname, summary: limit_(p.summary, 40000, 'Ringkasan'),
    enrol_key: str_(p.enrol_key).trim().slice(0, 60), cover: num_(p.cover), visible: p.visible === false ? '0' : '1',
    start_date: num_(p.start_date) || '', end_date: num_(p.end_date) || ''
  };
  if (p.id) {
    requireCourse_(u, p.id, true);
    DB.update('Courses', p.id, rec);
    return { id: p.id };
  }
  if (u.role === 'student') fail_('Hanya guru atau admin yang dapat membuat kursus.');
  const id = uid_('c');
  rec.id = id; rec.created_by = u.id; rec.created_at = now_();
  DB.insert('Courses', rec);
  const n = Math.max(0, Math.min(52, num_(p.sections, 4)));
  const secs = [{ id: uid_('s'), course_id: id, title: 'Umum', summary: '', sort: 0, visible: '1' }];
  for (let i = 1; i <= n; i++) secs.push({ id: uid_('s') + i, course_id: id, title: 'Topik ' + i, summary: '', sort: i, visible: '1' });
  DB.insertMany('Sections', secs);
  if (u.role === 'teacher') DB.insert('Enrolments', { id: uid_('e'), course_id: id, user_id: u.id, role: 'teacher', created_at: now_() });
  return { id: id };
}

function deleteModulesData_(ids) {
  if (!Object.keys(ids).length) return;
  ['Questions', 'Attempts', 'Submissions', 'Posts', 'Completions'].forEach(function (t) {
    DB.removeWhere(t, function (r) { return ids[r.module_id]; });
  });
}

function actDeleteCourse_(ctx, p) {
  requireCourse_(ctx.user, p.id, true);
  const ids = idSet_(DB.where('Modules', function (m) { return m.course_id === p.id; }));
  deleteModulesData_(ids);
  DB.removeWhere('Modules', function (m) { return m.course_id === p.id; });
  DB.removeWhere('Sections', function (s) { return s.course_id === p.id; });
  DB.removeWhere('Enrolments', function (e) { return e.course_id === p.id; });
  DB.removeWhere('Announcements', function (x) { return x.course_id === p.id; });
  DB.remove('Courses', p.id);
  return true;
}

/* ---------- Topik (Section) ---------- */
function actSaveSection_(ctx, p) {
  const u = ctx.user, title = str_(p.title).trim().slice(0, 150), summary = limit_(p.summary, 40000, 'Ringkasan');
  if (p.id) {
    const s = DB.get('Sections', p.id);
    if (!s) fail_('Topik tidak ditemukan.');
    requireCourse_(u, s.course_id, true);
    DB.update('Sections', p.id, { title: title || s.title, summary: summary, visible: p.visible === false ? '0' : '1' });
    return { id: p.id };
  }
  requireCourse_(u, p.course_id, true);
  const sort = DB.where('Sections', function (s) { return s.course_id === p.course_id; }).reduce(function (mx, s) { return Math.max(mx, num_(s.sort)); }, -1) + 1;
  const id = uid_('s');
  DB.insert('Sections', { id: id, course_id: p.course_id, title: title || ('Topik ' + sort), summary: summary, sort: sort, visible: p.visible === false ? '0' : '1' });
  return { id: id };
}

function actDeleteSection_(ctx, p) {
  const s = DB.get('Sections', p.id);
  if (!s) fail_('Topik tidak ditemukan.');
  requireCourse_(ctx.user, s.course_id, true);
  const secs = DB.where('Sections', function (x) { return x.course_id === s.course_id; }).sort(bySort_);
  if (secs[0] && secs[0].id === s.id) fail_('Topik pertama ("Umum") tidak dapat dihapus.');
  const ids = idSet_(DB.where('Modules', function (m) { return m.section_id === s.id; }));
  deleteModulesData_(ids);
  DB.removeWhere('Modules', function (m) { return ids[m.id]; });
  DB.remove('Sections', s.id);
  return true;
}

function actMoveSection_(ctx, p) {
  const s = DB.get('Sections', p.id);
  if (!s) fail_('Topik tidak ditemukan.');
  requireCourse_(ctx.user, s.course_id, true);
  const secs = DB.where('Sections', function (x) { return x.course_id === s.course_id; }).sort(bySort_);
  const i = secs.findIndex(function (x) { return x.id === s.id; }), j = i + (num_(p.dir) < 0 ? -1 : 1);
  if (i <= 0 || j <= 0 || j >= secs.length) return false;
  const t = secs[i]; secs[i] = secs[j]; secs[j] = t;
  secs.forEach(function (x, k) { if (num_(x.sort) !== k) DB.update('Sections', x.id, { sort: k }); });
  return true;
}

function actToggleSection_(ctx, p) {
  const s = DB.get('Sections', p.id);
  if (!s) fail_('Topik tidak ditemukan.');
  requireCourse_(ctx.user, s.course_id, true);
  DB.update('Sections', s.id, { visible: bool_(s.visible) ? '0' : '1' });
  return { visible: bool_(s.visible) };
}

/* ---------- Aktivitas & Sumber Daya (Module) ---------- */
function nextModSort_(secId) {
  return DB.where('Modules', function (m) { return m.section_id === secId; }).reduce(function (mx, m) { return Math.max(mx, num_(m.sort)); }, -1) + 1;
}

function buildConfig_(t, c) {
  c = c || {};
  switch (t) {
    case 'page': return { body: str_(c.body) };
    case 'url': {
      let url = str_(c.url).trim();
      if (!url) fail_('URL wajib diisi.');
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      return { url: url };
    }
    case 'assign': {
      const types = (Array.isArray(c.types) ? c.types : ['text', 'file']).filter(function (x) { return x === 'text' || x === 'file'; });
      if (!types.length) fail_('Pilih minimal satu jenis kiriman (teks daring atau unggah berkas).');
      return { types: types, max_files: Math.max(1, Math.min(10, num_(c.max_files, 3))), allow_late: c.allow_late !== false };
    }
    case 'quiz': return {
      time_limit: Math.max(0, Math.min(600, num_(c.time_limit))), attempts: Math.max(0, Math.min(50, num_(c.attempts, 1))),
      grade_method: ['highest', 'average', 'first', 'last'].indexOf(c.grade_method) >= 0 ? c.grade_method : 'highest',
      shuffle: !!c.shuffle, shuffle_options: !!c.shuffle_options, review: c.review !== false
    };
    case 'forum': return { teacher_only: !!c.teacher_only };
  }
  return {};
}

function actSaveModule_(ctx, p) {
  const u = ctx.user;
  let m = null, courseId, type;
  if (p.id) {
    m = DB.get('Modules', p.id);
    if (!m) fail_('Aktivitas tidak ditemukan.');
    courseId = m.course_id; type = m.type;
  } else {
    type = str_(p.type);
    if (MOD_TYPES.indexOf(type) < 0) fail_('Jenis aktivitas tidak dikenal.');
    courseId = str_(p.course_id);
  }
  requireCourse_(u, courseId, true);
  const sec = DB.get('Sections', p.section_id || (m && m.section_id));
  if (!sec || sec.course_id !== courseId) fail_('Topik tujuan tidak valid.');
  const title = str_(p.title).trim().slice(0, 200);
  if (!title && type !== 'label') fail_('Judul wajib diisi.');
  const old = m ? json_(m.config, {}) : {};
  const cfg = buildConfig_(type, p.config);
  if (type === 'file') {
    if (p.upload && p.upload.data) cfg.file = saveUpload_(p.upload, 'Materi');
    else if (old.file) cfg.file = old.file;
    if (!cfg.file) fail_('Pilih berkas untuk diunggah.');
  }
  const rec = {
    section_id: sec.id, title: title || 'Teks & Media', intro: limit_(p.intro, 45000, 'Deskripsi/isi'),
    config: JSON.stringify(cfg), visible: p.visible === false ? '0' : '1',
    open_date: num_(p.open_date) || '', due_date: num_(p.due_date) || '',
    max_grade: GRADABLE.indexOf(type) >= 0 ? Math.max(1, Math.min(1000, num_(p.max_grade, 100))) : ''
  };
  if (rec.config.length > 45000) fail_('Isi materi terlalu panjang (maks ±45.000 karakter). Bagi menjadi beberapa halaman.');
  if (rec.open_date && rec.due_date && rec.due_date < rec.open_date) fail_('Batas waktu harus setelah tanggal dibuka.');
  if (m) {
    if (m.section_id !== sec.id) rec.sort = nextModSort_(sec.id);
    DB.update('Modules', m.id, rec);
    return { id: m.id };
  }
  rec.id = uid_('m'); rec.course_id = courseId; rec.type = type; rec.sort = nextModSort_(sec.id); rec.created_at = now_();
  DB.insert('Modules', rec);
  return { id: rec.id };
}

function actDeleteModule_(ctx, p) {
  const m = DB.get('Modules', p.id);
  if (!m) fail_('Aktivitas tidak ditemukan.');
  requireCourse_(ctx.user, m.course_id, true);
  const ids = {}; ids[m.id] = 1;
  deleteModulesData_(ids);
  DB.remove('Modules', m.id);
  return true;
}

function actMoveModule_(ctx, p) {
  const m = DB.get('Modules', p.id);
  if (!m) fail_('Aktivitas tidak ditemukan.');
  requireCourse_(ctx.user, m.course_id, true);
  const list = DB.where('Modules', function (x) { return x.section_id === m.section_id; }).sort(bySort_);
  const i = list.findIndex(function (x) { return x.id === m.id; }), j = i + (num_(p.dir) < 0 ? -1 : 1);
  if (j < 0 || j >= list.length) return false;
  const t = list[i]; list[i] = list[j]; list[j] = t;
  list.forEach(function (x, k) { if (num_(x.sort) !== k) DB.update('Modules', x.id, { sort: k }); });
  return true;
}

function actToggleModule_(ctx, p) {
  const m = DB.get('Modules', p.id);
  if (!m) fail_('Aktivitas tidak ditemukan.');
  requireCourse_(ctx.user, m.course_id, true);
  DB.update('Modules', m.id, { visible: bool_(m.visible) ? '0' : '1' });
  return { visible: bool_(m.visible) };
}

function actDuplicateModule_(ctx, p) {
  const m = DB.get('Modules', p.id);
  if (!m) fail_('Aktivitas tidak ditemukan.');
  requireCourse_(ctx.user, m.course_id, true);
  const id = uid_('m');
  const copy = Object.assign({}, m, { id: id, title: (m.title + ' (salinan)').slice(0, 200), sort: num_(m.sort) + 0.5, created_at: now_() });
  delete copy._row;
  DB.insert('Modules', copy);
  DB.where('Modules', function (x) { return x.section_id === m.section_id; }).sort(bySort_)
    .forEach(function (x, k) { if (num_(x.sort) !== k) DB.update('Modules', x.id, { sort: k }); });
  if (m.type === 'quiz') {
    DB.insertMany('Questions', DB.where('Questions', function (q) { return q.module_id === m.id; }).map(function (q, k) {
      const c = Object.assign({}, q, { id: uid_('q') + k, module_id: id });
      delete c._row;
      return c;
    }));
  }
  return { id: id };
}

function actToggleCompletion_(ctx, p) {
  const u = ctx.user, a = moduleAccess_(u, p.id);
  if (a.role !== 'student') fail_('Penanda selesai hanya untuk siswa.');
  if (GRADABLE.indexOf(a.module.type) >= 0) fail_('Aktivitas ini selesai otomatis setelah dikerjakan.');
  const c = DB.find('Completions', function (x) { return x.module_id === p.id && x.user_id === u.id; });
  if (c) { DB.remove('Completions', c.id); return { done: false }; }
  markComplete_(p.id, u.id);
  return { done: true };
}

/* ---------- Halaman aktivitas ---------- */
function actModule_(ctx, p) {
  const u = ctx.user, a = moduleAccess_(u, p.id), m = a.module, c = a.course, isT = a.role === 'teacher';
  const cfg = json_(m.config, {}), sec = DB.get('Sections', m.section_id);
  const out = {
    module: modOut_(m, true), course: { id: c.id, fullname: c.fullname, shortname: c.shortname, cover: num_(c.cover) },
    section: sec ? { id: sec.id, title: sec.title } : null, role: a.role
  };
  const secs = DB.where('Sections', function (s) { return s.course_id === c.id; }).sort(bySort_);
  const secOrder = {}, secVis = {};
  secs.forEach(function (s, i) { secOrder[s.id] = i; secVis[s.id] = bool_(s.visible); });
  let list = DB.where('Modules', function (x) { return x.course_id === c.id && x.type !== 'label' && secOrder[x.section_id] !== undefined; });
  if (!isT) list = list.filter(function (x) { return visibleForStudent_(x, secVis); });
  list.sort(function (x, y) { return (secOrder[x.section_id] - secOrder[y.section_id]) || (num_(x.sort) - num_(y.sort)); });
  const i = list.findIndex(function (x) { return x.id === m.id; });
  const nav = function (x) { return x ? { id: x.id, title: x.title, type: x.type } : null; };
  out.prev = nav(list[i - 1]);
  out.next = nav(list[i + 1]);
  out.jump = list.map(nav);
  out.done = !!DB.find('Completions', function (x) { return x.module_id === m.id && x.user_id === u.id; });
  if (!isT && ['page', 'url', 'file'].indexOf(m.type) >= 0 && !out.done) { markComplete_(m.id, u.id); out.done = true; }
  if (m.type === 'assign') Object.assign(out, assignView_(u, m, cfg, isT, c));
  if (m.type === 'quiz') Object.assign(out, quizView_(u, m, cfg, isT, c));
  if (m.type === 'forum') Object.assign(out, forumView_(u, m, cfg, isT));
  return out;
}

/* ===========================================================================
 *  AKSI: TUGAS (ASSIGNMENT)
 * ========================================================================= */
function subOut_(s, users) {
  const g = users && users[s.graded_by];
  return {
    id: s.id, user_id: s.user_id, text: s.text, files: json_(s.files, []), status: s.status,
    submitted_at: num_(s.submitted_at), grade: s.grade === '' || s.grade === undefined ? null : num_(s.grade),
    feedback: s.feedback || '', graded_at: num_(s.graded_at), graded_by: g ? g.name : ''
  };
}

function assignState_(m, cfg, s) {
  const now = now_(), open = num_(m.open_date), due = num_(m.due_date);
  if (open && now < open) return { can: false, reason: 'Tugas belum dibuka.' };
  if (s && s.grade !== '') return { can: false, reason: 'Kiriman sudah dinilai sehingga tidak dapat diubah lagi.' };
  if (due && now > due && cfg.allow_late === false) return { can: false, reason: 'Batas waktu pengiriman telah berakhir.' };
  return { can: true, reason: '' };
}

function assignView_(u, m, cfg, isT, c) {
  const users = mapBy_(DB.all('Users'), 'id');
  const subs = DB.where('Submissions', function (s) { return s.module_id === m.id; });
  if (!isT) {
    const s = subs.filter(function (x) { return x.user_id === u.id; })[0];
    const st = assignState_(m, cfg, s);
    return { submission: s ? subOut_(s, users) : null, canSubmit: st.can, reason: st.reason };
  }
  const byUser = mapBy_(subs, 'user_id');
  const rows = DB.where('Enrolments', function (e) { return e.course_id === c.id && e.role === 'student'; })
    .map(function (e) { return users[e.user_id]; }).filter(Boolean).sort(byName_)
    .map(function (st) { return { user: briefUser_(st), sub: byUser[st.id] ? subOut_(byUser[st.id], users) : null }; });
  return {
    rows: rows,
    summary: {
      participants: rows.length,
      submitted: rows.filter(function (r) { return r.sub && r.sub.status === 'submitted'; }).length,
      need: rows.filter(function (r) { return r.sub && r.sub.status === 'submitted' && r.sub.grade === null; }).length
    }
  };
}

function actSubmitAssign_(ctx, p) {
  const u = ctx.user, a = moduleAccess_(u, p.id), m = a.module;
  if (a.role !== 'student') fail_('Hanya siswa yang dapat mengirim tugas.');
  if (m.type !== 'assign') fail_('Bukan aktivitas tugas.');
  const cfg = json_(m.config, {});
  const s = DB.find('Submissions', function (x) { return x.module_id === m.id && x.user_id === u.id; });
  const st = assignState_(m, cfg, s);
  if (!st.can) fail_(st.reason);
  const types = cfg.types || ['text', 'file'], maxFiles = cfg.max_files || 3;
  const text = types.indexOf('text') >= 0 ? limit_(p.text, 45000, 'Teks jawaban') : '';
  let files = s ? json_(s.files, []) : [];
  const keep = Array.isArray(p.keep) ? p.keep : files.map(function (f) { return f.id; });
  const removed = files.filter(function (f) { return keep.indexOf(f.id) < 0; });
  files = files.filter(function (f) { return keep.indexOf(f.id) >= 0; });
  const uploads = Array.isArray(p.files) ? p.files : [];
  if (uploads.length && types.indexOf('file') < 0) fail_('Tugas ini tidak menerima unggahan berkas.');
  if (files.length + uploads.length > maxFiles) fail_('Maksimal ' + maxFiles + ' berkas per kiriman.');
  if (!hasContent_(text) && !files.length && !uploads.length) fail_('Kiriman masih kosong. Tulis jawaban atau unggah berkas.');
  uploads.forEach(function (f) { files.push(saveUpload_(f, 'Tugas')); });
  removed.forEach(function (f) { trashFile_(f.id); });
  const rec = { text: text, files: JSON.stringify(files), status: 'submitted', submitted_at: now_() };
  const out = s ? DB.update('Submissions', s.id, rec)
    : DB.insert('Submissions', Object.assign({ id: uid_('sb'), module_id: m.id, user_id: u.id, grade: '', feedback: '', graded_by: '', graded_at: '' }, rec));
  markComplete_(m.id, u.id);
  return subOut_(out, null);
}

function actGrade_(ctx, p) {
  const u = ctx.user, a = moduleAccess_(u, p.module_id, true), m = a.module;
  if (m.type !== 'assign') fail_('Bukan aktivitas tugas.');
  const target = DB.get('Users', p.user_id);
  if (!target) fail_('Siswa tidak ditemukan.');
  const max = num_(m.max_grade, 100);
  let grade = '';
  if (p.grade !== '' && p.grade !== null && p.grade !== undefined) {
    grade = Number(p.grade);
    if (isNaN(grade) || grade < 0 || grade > max) fail_('Nilai harus antara 0 dan ' + max + '.');
    grade = round2_(grade);
  }
  const rec = { grade: grade, feedback: limit_(p.feedback, 20000, 'Umpan balik'), graded_by: u.id, graded_at: now_() };
  const s = DB.find('Submissions', function (x) { return x.module_id === m.id && x.user_id === target.id; });
  const out = s ? DB.update('Submissions', s.id, rec)
    : DB.insert('Submissions', Object.assign({ id: uid_('sb'), module_id: m.id, user_id: target.id, text: '', files: '[]', status: '', submitted_at: '' }, rec));
  const users = {}; users[u.id] = u;
  return subOut_(out, users);
}

/* ===========================================================================
 *  AKSI: KUIS
 * ========================================================================= */
function qOut_(q) {
  return { id: q.id, type: q.type, text: q.text, options: json_(q.options, []), answer: json_(q.answer, null), points: num_(q.points, 1), sort: num_(q.sort) };
}

function attOut_(t, users) {
  const o = {
    id: t.id, user_id: t.user_id, started_at: num_(t.started_at), finished_at: num_(t.finished_at), status: t.status,
    score: num_(t.score), max_score: num_(t.max_score), grade: num_(t.grade), preview: bool_(t.preview)
  };
  if (users) { const x = users[t.user_id]; o.user = x ? briefUser_(x) : { name: '(dihapus)' }; }
  return o;
}

function quizState_(m, cfg, used, hasInprog, qCount) {
  const now = now_(), open = num_(m.open_date), close = num_(m.due_date);
  if (!qCount) return { can: false, reason: 'Kuis belum memiliki soal.' };
  if (open && now < open) return { can: false, reason: 'Kuis belum dibuka.' };
  if (close && now > close) return { can: false, reason: 'Kuis sudah ditutup.' };
  if (hasInprog) return { can: true, reason: '' };
  if (cfg.attempts && used >= cfg.attempts) return { can: false, reason: 'Anda sudah menggunakan semua kesempatan mengerjakan.' };
  return { can: true, reason: '' };
}

function quizView_(u, m, cfg, isT, c) {
  const qs = DB.where('Questions', function (q) { return q.module_id === m.id; });
  const base = { questionCount: qs.length, totalPoints: round2_(qs.reduce(function (s, q) { return s + num_(q.points, 1); }, 0)) };
  const atts = DB.where('Attempts', function (t) { return t.module_id === m.id; });
  if (isT) {
    const users = mapBy_(DB.all('Users'), 'id');
    const list = atts.filter(function (t) { return !bool_(t.preview); }).map(function (t) { return attOut_(t, users); })
      .sort(function (a, b) { return b.started_at - a.started_at; });
    const fin = list.filter(function (x) { return x.status === 'finished'; }), uniq = {};
    fin.forEach(function (x) { uniq[x.user_id] = 1; });
    return Object.assign(base, {
      attempts: list,
      summary: {
        students: DB.where('Enrolments', function (e) { return e.course_id === c.id && e.role === 'student'; }).length,
        attempted: Object.keys(uniq).length, attempts: fin.length,
        average: fin.length ? round2_(fin.reduce(function (s, x) { return s + x.grade; }, 0) / fin.length) : null
      }
    });
  }
  const mine = atts.filter(function (t) { return t.user_id === u.id && !bool_(t.preview); })
    .sort(function (a, b) { return num_(a.started_at) - num_(b.started_at); });
  const fin = mine.filter(function (t) { return t.status === 'finished'; });
  const inprog = mine.filter(function (t) { return t.status === 'inprogress'; })[0];
  const st = quizState_(m, cfg, fin.length, !!inprog, qs.length);
  return Object.assign(base, {
    attempts: mine.map(function (t) { return attOut_(t); }), grade: quizGrade_(fin, cfg.grade_method),
    canAttempt: st.can, reason: st.reason, inprogress: inprog ? inprog.id : null
  });
}

function actQuestions_(ctx, p) {
  moduleAccess_(ctx.user, p.module_id, true);
  return DB.where('Questions', function (q) { return q.module_id === p.module_id; }).sort(bySort_).map(qOut_);
}

function validateQuestion_(p) {
  const type = p.type;
  if (Q_TYPES.indexOf(type) < 0) fail_('Jenis soal tidak dikenal.');
  const text = limit_(p.text, 20000, 'Teks soal');
  if (!hasContent_(text)) fail_('Teks soal wajib diisi.');
  const points = Math.max(0.5, Math.min(100, num_(p.points, 1)));
  let opts = [], ans;
  if (type === 'mc' || type === 'multi') {
    opts = (Array.isArray(p.options) ? p.options : []).map(function (o) { return str_(o).trim().slice(0, 2000); });
    if (opts.some(function (o) { return !o; })) fail_('Opsi jawaban tidak boleh kosong.');
    if (opts.length < 2) fail_('Minimal 2 opsi jawaban.');
    if (opts.length > 10) fail_('Maksimal 10 opsi jawaban.');
    if (type === 'mc') {
      ans = num_(p.answer, -1);
      if (ans < 0 || ans >= opts.length || ans % 1) fail_('Tentukan satu jawaban benar.');
    } else {
      ans = (Array.isArray(p.answer) ? p.answer : []).map(Number).filter(function (i, k, arr) { return i >= 0 && i < opts.length && arr.indexOf(i) === k; }).sort();
      if (!ans.length) fail_('Tentukan minimal satu jawaban benar.');
    }
  } else if (type === 'tf') {
    ans = p.answer === true || p.answer === 'true';
  } else {
    ans = (Array.isArray(p.answer) ? p.answer : str_(p.answer).split(/\n|\|/)).map(function (s) { return str_(s).trim().slice(0, 300); }).filter(Boolean);
    if (!ans.length) fail_('Isi minimal satu kunci jawaban.');
  }
  return { type: type, text: text, options: JSON.stringify(opts), answer: JSON.stringify(ans), points: points };
}

function actSaveQuestion_(ctx, p) {
  const v = validateQuestion_(p);
  if (p.id) {
    const q = DB.get('Questions', p.id);
    if (!q) fail_('Soal tidak ditemukan.');
    moduleAccess_(ctx.user, q.module_id, true);
    return qOut_(DB.update('Questions', q.id, v));
  }
  const a = moduleAccess_(ctx.user, p.module_id, true);
  if (a.module.type !== 'quiz') fail_('Bukan kuis.');
  v.id = uid_('q'); v.module_id = a.module.id;
  v.sort = DB.where('Questions', function (q) { return q.module_id === a.module.id; }).reduce(function (mx, q) { return Math.max(mx, num_(q.sort)); }, -1) + 1;
  return qOut_(DB.insert('Questions', v));
}

function actImportQuestions_(ctx, p) {
  const a = moduleAccess_(ctx.user, p.module_id, true);
  if (a.module.type !== 'quiz') fail_('Bukan kuis.');
  const list = (Array.isArray(p.questions) ? p.questions : []).slice(0, 300);
  if (!list.length) fail_('Tidak ada soal untuk diimpor.');
  let sort = DB.where('Questions', function (q) { return q.module_id === a.module.id; }).reduce(function (mx, q) { return Math.max(mx, num_(q.sort)); }, -1);
  const rows = list.map(function (q, i) {
    let v;
    try { v = validateQuestion_(q); } catch (e) { fail_('Soal nomor ' + (i + 1) + ': ' + e.message); }
    v.id = uid_('q') + i; v.module_id = a.module.id; v.sort = ++sort;
    return v;
  });
  DB.insertMany('Questions', rows);
  return { added: rows.length };
}

function actDeleteQuestion_(ctx, p) {
  const q = DB.get('Questions', p.id);
  if (!q) fail_('Soal tidak ditemukan.');
  moduleAccess_(ctx.user, q.module_id, true);
  DB.remove('Questions', q.id);
  return true;
}

function actMoveQuestion_(ctx, p) {
  const q = DB.get('Questions', p.id);
  if (!q) fail_('Soal tidak ditemukan.');
  moduleAccess_(ctx.user, q.module_id, true);
  const list = DB.where('Questions', function (x) { return x.module_id === q.module_id; }).sort(bySort_);
  const i = list.findIndex(function (x) { return x.id === q.id; }), j = i + (num_(p.dir) < 0 ? -1 : 1);
  if (j < 0 || j >= list.length) return false;
  const t = list[i]; list[i] = list[j]; list[j] = t;
  list.forEach(function (x, k) { if (num_(x.sort) !== k) DB.update('Questions', x.id, { sort: k }); });
  return true;
}

function scoreQuestion_(q, a) {
  const ans = json_(q.answer, null);
  if (a === undefined || a === null || a === '') return 0;
  switch (q.type) {
    case 'mc': return Number(a) === Number(ans) ? 1 : 0;
    case 'tf': return (a === true || a === 'true') === (ans === true) ? 1 : 0;
    case 'multi': {
      const sel = Array.isArray(a) ? a.map(Number) : [], right = (ans || []).map(Number);
      if (!right.length) return 0;
      let ok = 0, bad = 0;
      sel.forEach(function (i) { if (right.indexOf(i) >= 0) ok++; else bad++; });
      return Math.max(0, (ok - bad) / right.length);
    }
    case 'short': {
      const norm = function (s) { return str_(s).trim().toLowerCase().replace(/\s+/g, ' '); };
      const v = norm(a);
      return (ans || []).some(function (x) { return norm(x) === v; }) ? 1 : 0;
    }
  }
  return 0;
}

function cleanAnswers_(a) {
  const o = {};
  if (a && typeof a === 'object') {
    Object.keys(a).slice(0, 500).forEach(function (k) {
      const v = a[k];
      if (Array.isArray(v)) o[k] = v.slice(0, 20).map(Number);
      else if (typeof v === 'boolean' || typeof v === 'number') o[k] = v;
      else if (v !== null && v !== undefined) o[k] = str_(v).slice(0, 1000);
    });
  }
  return o;
}

function finishAttemptInternal_(t, m, qs, answers) {
  const qById = mapBy_(qs, 'id');
  let score = 0, max = 0;
  json_(t.layout, []).forEach(function (L) {
    const q = qById[L.q];
    if (!q) return;
    const pts = num_(q.points, 1);
    max += pts;
    score += pts * scoreQuestion_(q, answers[q.id]);
  });
  const grade = max ? round2_(score / max * num_(m.max_grade, 100)) : 0;
  DB.update('Attempts', t.id, { answers: JSON.stringify(answers), finished_at: now_(), score: round2_(score), max_score: round2_(max), grade: grade, status: 'finished' });
  if (!bool_(t.preview)) markComplete_(m.id, t.user_id);
}

function attemptDeadline_(att, m, cfg) {
  const started = num_(att.started_at);
  let dl = cfg.time_limit ? started + cfg.time_limit * 60000 : 0;
  const close = num_(m.due_date);
  if (close && !bool_(att.preview) && (!dl || close < dl)) dl = close;
  return dl;
}

function actStartAttempt_(ctx, p) {
  const u = ctx.user, a = moduleAccess_(u, p.id), m = a.module;
  if (m.type !== 'quiz') fail_('Bukan kuis.');
  const cfg = json_(m.config, {}), isT = a.role === 'teacher';
  const qs = DB.where('Questions', function (q) { return q.module_id === m.id; }).sort(bySort_);
  const mine = DB.where('Attempts', function (t) { return t.module_id === m.id && t.user_id === u.id; });
  let att;
  if (isT) {
    if (!qs.length) fail_('Kuis belum memiliki soal.');
    att = mine.filter(function (t) { return bool_(t.preview) && t.status === 'inprogress'; })[0];
  } else {
    att = mine.filter(function (t) { return !bool_(t.preview) && t.status === 'inprogress'; })[0];
    if (att) {
      const dl = attemptDeadline_(att, m, cfg);
      if (dl && now_() > dl + 90000) {          // waktu habis → kirim otomatis jawaban terakhir
        finishAttemptInternal_(att, m, qs, json_(att.answers, {}));
        return { finished: true, attempt_id: att.id };
      }
    }
    const used = mine.filter(function (t) { return !bool_(t.preview) && t.status === 'finished'; }).length;
    const st = quizState_(m, cfg, used, !!att, qs.length);
    if (!st.can) fail_(st.reason);
  }
  if (!att) {
    let order = qs.map(function (q) { return q.id; });
    if (cfg.shuffle) order = shuffle_(order);
    const qById = mapBy_(qs, 'id');
    const layout = order.map(function (id) {
      const q = qById[id], n = json_(q.options, []).length;
      let o = [];
      for (let k = 0; k < n; k++) o.push(k);
      if (cfg.shuffle_options && (q.type === 'mc' || q.type === 'multi')) o = shuffle_(o);
      return { q: id, o: o };
    });
    att = DB.insert('Attempts', {
      id: uid_('at'), module_id: m.id, user_id: u.id, started_at: now_(), finished_at: '', layout: JSON.stringify(layout),
      answers: '{}', score: '', max_score: '', grade: '', status: 'inprogress', preview: isT ? '1' : ''
    });
  }
  const qById2 = mapBy_(qs, 'id');
  const questions = json_(att.layout, []).map(function (L) {
    const q = qById2[L.q];
    if (!q) return null;
    const opts = json_(q.options, []);
    return {
      id: q.id, type: q.type, text: q.text, points: num_(q.points, 1),
      options: (q.type === 'mc' || q.type === 'multi') ? L.o.map(function (i) { return { i: i, t: opts[i] }; }) : []
    };
  }).filter(Boolean);
  return {
    attempt: { id: att.id, started_at: num_(att.started_at), deadline: attemptDeadline_(att, m, cfg), answers: json_(att.answers, {}), preview: bool_(att.preview), now: now_() },
    quiz: { id: m.id, title: m.title, course_id: m.course_id, course: a.course.fullname, time_limit: cfg.time_limit || 0 },
    questions: questions
  };
}

function ownAttempt_(u, id) {
  const t = DB.get('Attempts', id);
  if (!t || t.user_id !== u.id) fail_('Percobaan tidak ditemukan.');
  return t;
}

function actSaveAttempt_(ctx, p) {
  const t = ownAttempt_(ctx.user, p.id);
  if (t.status !== 'inprogress') fail_('Percobaan ini sudah selesai.');
  const ans = JSON.stringify(cleanAnswers_(p.answers));
  if (ans.length > 45000) fail_('Jawaban terlalu panjang.');
  DB.update('Attempts', t.id, { answers: ans });
  return { saved: now_() };
}

function actFinishAttempt_(ctx, p) {
  const t = ownAttempt_(ctx.user, p.id);
  if (t.status !== 'inprogress') return { id: t.id, already: true };
  const m = DB.get('Modules', t.module_id);
  const qs = DB.where('Questions', function (q) { return q.module_id === m.id; });
  finishAttemptInternal_(t, m, qs, p.answers ? cleanAnswers_(p.answers) : json_(t.answers, {}));
  return { id: t.id };
}

function actReview_(ctx, p) {
  const u = ctx.user, t = DB.get('Attempts', p.id);
  if (!t) fail_('Percobaan tidak ditemukan.');
  const a = moduleAccess_(u, t.module_id), m = a.module, isT = a.role === 'teacher';
  if (!isT && t.user_id !== u.id) fail_('Anda tidak berhak melihat percobaan ini.');
  if (t.status !== 'finished') fail_('Percobaan belum selesai.');
  const cfg = json_(m.config, {}), showAns = isT || cfg.review !== false;
  const qById = mapBy_(DB.where('Questions', function (q) { return q.module_id === m.id; }), 'id');
  const answers = json_(t.answers, {});
  const items = json_(t.layout, []).map(function (L) {
    const q = qById[L.q];
    if (!q) return null;
    const opts = json_(q.options, []), fr = scoreQuestion_(q, answers[q.id]), pts = num_(q.points, 1);
    const o = {
      id: q.id, type: q.type, text: q.text, points: pts, score: round2_(fr * pts), fraction: fr,
      response: answers[q.id] === undefined ? null : answers[q.id],
      options: (q.type === 'mc' || q.type === 'multi') ? L.o.map(function (i) { return { i: i, t: opts[i] }; }) : []
    };
    if (showAns) o.correct = json_(q.answer, null);
    return o;
  }).filter(Boolean);
  const owner = DB.get('Users', t.user_id);
  return {
    attempt: attOut_(t), user: owner ? briefUser_(owner) : null, role: a.role,
    quiz: { id: m.id, title: m.title, course_id: m.course_id, max_grade: num_(m.max_grade, 100) },
    items: items, showAnswers: showAns
  };
}

function actDeleteAttempt_(ctx, p) {
  const t = DB.get('Attempts', p.id);
  if (!t) fail_('Percobaan tidak ditemukan.');
  moduleAccess_(ctx.user, t.module_id, true);
  DB.remove('Attempts', t.id);
  return true;
}

/* ===========================================================================
 *  AKSI: FORUM
 * ========================================================================= */
function forumView_(u, m, cfg, isT) {
  const users = mapBy_(DB.all('Users'), 'id');
  const posts = DB.where('Posts', function (x) { return x.module_id === m.id; });
  const byDisc = {};
  posts.forEach(function (x) { (byDisc[x.discussion_id] = byDisc[x.discussion_id] || []).push(x); });
  const discussions = posts.filter(function (x) { return !x.parent_id; }).map(function (r) {
    const list = byDisc[r.id] || [r];
    const last = list.reduce(function (mx, x) { return num_(x.created_at) > num_(mx.created_at) ? x : mx; }, r);
    const au = users[r.user_id], lu = users[last.user_id];
    return {
      id: r.id, subject: r.subject, excerpt: plain_(r.message).slice(0, 180), author: au ? briefUser_(au) : { name: '(dihapus)' },
      created_at: num_(r.created_at), replies: list.length - 1, last_at: num_(last.created_at), last_by: lu ? lu.name : ''
    };
  }).sort(function (a, b) { return b.last_at - a.last_at; });
  return { discussions: discussions, canStart: isT || !cfg.teacher_only };
}

function actDiscussion_(ctx, p) {
  const u = ctx.user, root = DB.get('Posts', p.id);
  if (!root || root.parent_id) fail_('Diskusi tidak ditemukan.');
  const a = moduleAccess_(u, root.module_id), users = mapBy_(DB.all('Users'), 'id');
  const posts = DB.where('Posts', function (x) { return x.discussion_id === root.id; })
    .sort(function (x, y) { return num_(x.created_at) - num_(y.created_at); })
    .map(function (x) {
      const au = users[x.user_id];
      return {
        id: x.id, parent_id: x.parent_id, subject: x.subject, message: x.message, created_at: num_(x.created_at),
        author: au ? briefUser_(au) : { name: '(dihapus)' }, mine: x.user_id === u.id, canDelete: x.user_id === u.id || a.role === 'teacher'
      };
    });
  return {
    module: { id: a.module.id, title: a.module.title }, course: { id: a.course.id, fullname: a.course.fullname },
    discussion: { id: root.id, subject: root.subject }, posts: posts, role: a.role
  };
}

function actForumPost_(ctx, p) {
  const u = ctx.user;
  let root = null, modId = p.module_id;
  if (p.discussion_id) {
    root = DB.get('Posts', p.discussion_id);
    if (!root) fail_('Diskusi tidak ditemukan.');
    modId = root.module_id;
  }
  const a = moduleAccess_(u, modId), m = a.module;
  if (m.type !== 'forum') fail_('Bukan forum.');
  const cfg = json_(m.config, {});
  const message = limit_(p.message, 30000, 'Pesan');
  if (!hasContent_(message)) fail_('Pesan tidak boleh kosong.');
  const id = uid_('p');
  if (!root) {
    if (cfg.teacher_only && a.role !== 'teacher') fail_('Hanya guru yang dapat memulai diskusi di forum ini.');
    const subject = str_(p.subject).trim().slice(0, 200);
    if (!subject) fail_('Judul diskusi wajib diisi.');
    DB.insert('Posts', { id: id, module_id: m.id, discussion_id: id, parent_id: '', user_id: u.id, subject: subject, message: message, created_at: now_() });
  } else {
    const parent = p.parent_id ? DB.get('Posts', p.parent_id) : root;
    if (!parent || parent.discussion_id !== root.id) fail_('Pesan yang dibalas tidak ditemukan.');
    DB.insert('Posts', { id: id, module_id: m.id, discussion_id: root.id, parent_id: parent.id, user_id: u.id, subject: 'Re: ' + root.subject, message: message, created_at: now_() });
  }
  if (a.role === 'student') markComplete_(m.id, u.id);
  return { id: id, discussion_id: root ? root.id : id };
}

function actDeletePost_(ctx, p) {
  const u = ctx.user, x = DB.get('Posts', p.id);
  if (!x) fail_('Pesan tidak ditemukan.');
  const a = moduleAccess_(u, x.module_id);
  if (x.user_id !== u.id && a.role !== 'teacher') fail_('Anda tidak berhak menghapus pesan ini.');
  if (!x.parent_id) {
    DB.removeWhere('Posts', function (r) { return r.discussion_id === x.id; });
    return { discussionDeleted: true };
  }
  const all = DB.where('Posts', function (r) { return r.discussion_id === x.discussion_id; }), del = {};
  del[x.id] = 1;
  let grew = true;
  while (grew) {
    grew = false;
    all.forEach(function (r) { if (!del[r.id] && del[r.parent_id]) { del[r.id] = 1; grew = true; } });
  }
  DB.removeWhere('Posts', function (r) { return del[r.id]; });
  return { discussionDeleted: false };
}

/* ===========================================================================
 *  AKSI: PESERTA
 * ========================================================================= */
function actParticipants_(ctx, p) {
  const a = requireCourse_(ctx.user, p.course_id), isT = a.role === 'teacher', users = mapBy_(DB.all('Users'), 'id');
  const list = DB.where('Enrolments', function (e) { return e.course_id === p.course_id; }).map(function (e) {
    const x = users[e.user_id];
    if (!x) return null;
    const o = { id: x.id, name: x.name, color: x.color, role: e.role, kelas: x.kelas, enrolled_at: num_(e.created_at) };
    if (isT) { o.username = x.username; o.email = x.email; o.nisn = x.nisn; o.last_login = num_(x.last_login); }
    return o;
  }).filter(Boolean).sort(function (a, b) { return a.role === b.role ? a.name.localeCompare(b.name) : (a.role === 'teacher' ? -1 : 1); });
  return { participants: list, canManage: isT };
}

function actEnrolCandidates_(ctx, p) {
  requireCourse_(ctx.user, p.course_id, true);
  const enrolled = {};
  DB.all('Enrolments').forEach(function (e) { if (e.course_id === p.course_id) enrolled[e.user_id] = 1; });
  const all = DB.all('Users').filter(function (x) { return x.status !== 'suspended' && x.role !== 'admin'; });
  const kelas = {};
  all.forEach(function (x) { if (x.role === 'student' && x.kelas) kelas[x.kelas] = (kelas[x.kelas] || 0) + (enrolled[x.id] ? 0 : 1); });
  return {
    users: all.filter(function (x) { return !enrolled[x.id]; })
      .map(function (x) { return { id: x.id, name: x.name, username: x.username, kelas: x.kelas, role: x.role, color: x.color }; }).sort(byName_),
    kelas: Object.keys(kelas).sort().map(function (k) { return { name: k, available: kelas[k] }; })
  };
}

function actEnrolUsers_(ctx, p) {
  requireCourse_(ctx.user, p.course_id, true);
  const role = p.role === 'teacher' ? 'teacher' : 'student', enrolled = {}, valid = mapBy_(DB.all('Users'), 'id');
  DB.all('Enrolments').forEach(function (e) { if (e.course_id === p.course_id) enrolled[e.user_id] = 1; });
  let ids = (Array.isArray(p.user_ids) ? p.user_ids : []).filter(function (id) { return valid[id]; });
  if (p.kelas) ids = ids.concat(DB.all('Users').filter(function (x) { return x.role === 'student' && x.status !== 'suspended' && x.kelas === p.kelas; }).map(function (x) { return x.id; }));
  const rows = [];
  ids.forEach(function (id, k) {
    if (enrolled[id]) return;
    enrolled[id] = 1;
    rows.push({ id: uid_('e') + k, course_id: p.course_id, user_id: id, role: role, created_at: now_() });
  });
  DB.insertMany('Enrolments', rows);
  return { added: rows.length };
}

function actUnenrol_(ctx, p) {
  requireCourse_(ctx.user, p.course_id, true);
  if (p.user_id === ctx.user.id) fail_('Anda tidak dapat mengeluarkan diri sendiri.');
  DB.removeWhere('Enrolments', function (e) { return e.course_id === p.course_id && e.user_id === p.user_id; });
  return true;
}

function actSetEnrolRole_(ctx, p) {
  requireCourse_(ctx.user, p.course_id, true);
  if (p.user_id === ctx.user.id) fail_('Anda tidak dapat mengubah peran diri sendiri.');
  const e = DB.find('Enrolments', function (x) { return x.course_id === p.course_id && x.user_id === p.user_id; });
  if (!e) fail_('Peserta tidak ditemukan.');
  DB.update('Enrolments', e.id, { role: p.role === 'teacher' ? 'teacher' : 'student' });
  return true;
}

/* ===========================================================================
 *  AKSI: NILAI
 * ========================================================================= */
function gradeItems_(courseId, includeHidden) {
  const secs = DB.where('Sections', function (s) { return s.course_id === courseId; }).sort(bySort_), order = {}, vis = {};
  secs.forEach(function (s, i) { order[s.id] = i; vis[s.id] = bool_(s.visible); });
  return DB.where('Modules', function (m) {
    return m.course_id === courseId && GRADABLE.indexOf(m.type) >= 0 && order[m.section_id] !== undefined && (includeHidden || visibleForStudent_(m, vis));
  }).sort(function (a, b) { return (order[a.section_id] - order[b.section_id]) || (num_(a.sort) - num_(b.sort)); });
}

function gradeMatrix_(items, userIds) {
  const itemIds = idSet_(items), uset = {}, g = {}, cfg = {};
  userIds.forEach(function (id) { uset[id] = 1; g[id] = {}; });
  items.forEach(function (m) { cfg[m.id] = json_(m.config, {}); });
  DB.all('Submissions').forEach(function (s) {
    if (itemIds[s.module_id] && uset[s.user_id] && s.grade !== '') g[s.user_id][s.module_id] = num_(s.grade);
  });
  const atts = {};
  DB.all('Attempts').forEach(function (t) {
    if (itemIds[t.module_id] && uset[t.user_id] && t.status === 'finished' && !bool_(t.preview)) {
      const k = t.user_id + '|' + t.module_id;
      (atts[k] = atts[k] || []).push(t);
    }
  });
  Object.keys(atts).forEach(function (k) {
    const parts = k.split('|');
    g[parts[0]][parts[1]] = quizGrade_(atts[k], cfg[parts[1]].grade_method);
  });
  return g;
}

function courseTotal_(items, row) {
  let got = 0, max = 0, graded = 0;
  items.forEach(function (m) {
    const v = row[m.id];
    if (v !== undefined && v !== null) { got += v; max += num_(m.max_grade, 100); graded++; }
  });
  return { got: round2_(got), max: max, pct: max ? round2_(got / max * 100) : null, graded: graded, items: items.length };
}

function actGradebook_(ctx, p) {
  const a = requireCourse_(ctx.user, p.course_id, true), users = mapBy_(DB.all('Users'), 'id');
  const items = gradeItems_(p.course_id, true);
  const students = DB.where('Enrolments', function (e) { return e.course_id === p.course_id && e.role === 'student'; })
    .map(function (e) { return users[e.user_id]; }).filter(Boolean).sort(byName_);
  const g = gradeMatrix_(items, students.map(function (s) { return s.id; })), totals = {};
  students.forEach(function (s) { totals[s.id] = courseTotal_(items, g[s.id]); });
  return {
    course: { id: a.course.id, fullname: a.course.fullname, shortname: a.course.shortname },
    items: items.map(function (m) { return { id: m.id, title: m.title, type: m.type, max_grade: num_(m.max_grade, 100), visible: bool_(m.visible) }; }),
    students: students.map(function (s) { return { id: s.id, name: s.name, username: s.username, kelas: s.kelas, nisn: s.nisn, color: s.color }; }),
    grades: g, totals: totals
  };
}

function actMyGrades_(ctx, p) {
  const u = ctx.user, roles = userCourseRoles_(u);
  const fb = {};
  DB.all('Submissions').forEach(function (s) { if (s.user_id === u.id) fb[s.module_id] = { feedback: s.feedback, graded_at: num_(s.graded_at) }; });
  return DB.all('Courses').filter(function (c) {
    return roles[c.id] === 'student' && bool_(c.visible) && (!p.course_id || c.id === p.course_id);
  }).map(function (c) {
    const items = gradeItems_(c.id, false), row = gradeMatrix_(items, [u.id])[u.id];
    return {
      course: { id: c.id, fullname: c.fullname, shortname: c.shortname, cover: num_(c.cover) },
      items: items.map(function (m) {
        const v = row[m.id];
        return {
          id: m.id, title: m.title, type: m.type, max_grade: num_(m.max_grade, 100), grade: v === undefined ? null : v,
          feedback: fb[m.id] ? fb[m.id].feedback : '', graded_at: fb[m.id] ? fb[m.id].graded_at : 0
        };
      }),
      total: courseTotal_(items, row)
    };
  }).sort(function (a, b) { return a.course.fullname.localeCompare(b.course.fullname); });
}

/* ===========================================================================
 *  AKSI: KALENDER, NOTIFIKASI, PENGUMUMAN, PENCARIAN
 * ========================================================================= */
function actCalendar_(ctx) {
  const u = ctx.user, roles = userCourseRoles_(u), secVis = sectionVis_(), compl = completionSet_(u.id);
  const courses = mapBy_(DB.all('Courses').filter(function (c) { return roles[c.id] && (roles[c.id] === 'teacher' || bool_(c.visible)); }), 'id');
  const ev = [];
  DB.all('Modules').forEach(function (m) {
    const c = courses[m.course_id];
    if (!c || GRADABLE.indexOf(m.type) < 0) return;
    if (roles[m.course_id] === 'student' && !visibleForStudent_(m, secVis)) return;
    const due = num_(m.due_date), open = num_(m.open_date);
    const base = { module_id: m.id, type: m.type, title: m.title, course: c.fullname, course_id: c.id, done: !!compl[m.id], role: roles[m.course_id] };
    if (due) ev.push(Object.assign({ id: m.id + '-d', time: due, kind: 'due' }, base));
    if (open) ev.push(Object.assign({ id: m.id + '-o', time: open, kind: 'open' }, base));
  });
  return { events: ev.sort(function (a, b) { return a.time - b.time; }) };
}

function actNotifications_(ctx) {
  const u = ctx.user, roles = userCourseRoles_(u), users = mapBy_(DB.all('Users'), 'id'), now = now_();
  const courses = mapBy_(DB.all('Courses'), 'id');
  const mods = mapBy_(DB.all('Modules').filter(function (m) { return roles[m.course_id]; }), 'id');
  const cname = function (id) { return courses[id] ? courses[id].fullname : ''; };
  const out = [];
  announcementsFor_(u, roles, null, 12).forEach(function (a) {
    if (now - a.created_at < 30 * 864e5) out.push({ kind: 'announce', title: a.title, text: plain_(a.message).slice(0, 140), time: a.created_at, link: a.course_id ? '/course/' + a.course_id + '/announcements' : '/dashboard', course: a.course });
  });
  DB.all('Submissions').forEach(function (s) {
    const m = mods[s.module_id];
    if (!m) return;
    const role = roles[m.course_id];
    if (role === 'student' && s.user_id === u.id && s.grade !== '' && now - num_(s.graded_at) < 30 * 864e5) {
      out.push({ kind: 'grade', title: 'Tugas dinilai: ' + m.title, text: 'Nilai ' + s.grade + ' dari ' + num_(m.max_grade, 100), time: num_(s.graded_at), link: '/mod/' + m.id, course: cname(m.course_id) });
    }
    if (role === 'teacher' && s.status === 'submitted' && s.grade === '' && now - num_(s.submitted_at) < 14 * 864e5) {
      const st = users[s.user_id];
      out.push({ kind: 'submission', title: (st ? st.name : 'Siswa') + ' mengirim tugas', text: m.title, time: num_(s.submitted_at), link: '/mod/' + m.id + '/submissions', course: cname(m.course_id) });
    }
  });
  const secVis = sectionVis_(), compl = completionSet_(u.id);
  Object.keys(mods).forEach(function (id) {
    const m = mods[id], due = num_(m.due_date);
    if (roles[m.course_id] !== 'student' || GRADABLE.indexOf(m.type) < 0 || compl[id] || !visibleForStudent_(m, secVis)) return;
    if (due > now && due - now < 3 * 864e5) out.push({ kind: 'due', title: 'Segera berakhir: ' + m.title, text: '', due: due, time: due - 3 * 864e5, link: '/mod/' + m.id, course: cname(m.course_id) });
  });
  DB.all('Posts').forEach(function (x) {
    const m = mods[x.module_id];
    if (!m || x.user_id === u.id || now - num_(x.created_at) > 7 * 864e5) return;
    const au = users[x.user_id];
    out.push({ kind: 'post', title: (au ? au.name : 'Seseorang') + (x.parent_id ? ' membalas diskusi' : ' memulai diskusi'), text: x.subject, time: num_(x.created_at), link: '/discussion/' + x.discussion_id, course: cname(m.course_id) });
  });
  out.sort(function (a, b) { return b.time - a.time; });
  return out.slice(0, 40);
}

function actAnnouncements_(ctx, p) {
  if (p.course_id) requireCourse_(ctx.user, p.course_id);
  let list = announcementsFor_(ctx.user, null, p.course_id || null, 100);
  if (p.site) list = list.filter(function (a) { return !a.course_id; });
  return list;
}

function actSaveAnnouncement_(ctx, p) {
  const u = ctx.user, courseId = str_(p.course_id);
  if (courseId) requireCourse_(u, courseId, true);
  else if (u.role !== 'admin') fail_('Hanya administrator yang dapat membuat pengumuman situs.');
  const title = str_(p.title).trim().slice(0, 200);
  if (!title) fail_('Judul pengumuman wajib diisi.');
  const message = limit_(p.message, 30000, 'Isi pengumuman');
  if (p.id) {
    const a = DB.get('Announcements', p.id);
    if (!a) fail_('Pengumuman tidak ditemukan.');
    DB.update('Announcements', a.id, { title: title, message: message });
    return { id: a.id };
  }
  const id = uid_('an');
  DB.insert('Announcements', { id: id, course_id: courseId, user_id: u.id, title: title, message: message, created_at: now_() });
  return { id: id };
}

function actDeleteAnnouncement_(ctx, p) {
  const a = DB.get('Announcements', p.id);
  if (!a) fail_('Pengumuman tidak ditemukan.');
  if (a.course_id) requireCourse_(ctx.user, a.course_id, true);
  else if (ctx.user.role !== 'admin') fail_('Hanya administrator yang dapat menghapus pengumuman situs.');
  DB.remove('Announcements', a.id);
  return true;
}

function actSearch_(ctx, p) {
  const q = str_(p.q).trim().toLowerCase();
  if (q.length < 2) return { courses: [], modules: [], users: [] };
  const u = ctx.user, roles = userCourseRoles_(u), secVis = sectionVis_(), cmap = mapBy_(DB.all('Courses'), 'id');
  const courses = DB.all('Courses').filter(function (c) {
    return (bool_(c.visible) || roles[c.id] === 'teacher') && (c.fullname + ' ' + c.shortname).toLowerCase().indexOf(q) >= 0;
  }).slice(0, 8).map(function (c) { return { id: c.id, fullname: c.fullname, shortname: c.shortname, cover: num_(c.cover), enrolled: !!roles[c.id] }; });
  const modules = DB.all('Modules').filter(function (m) {
    const role = roles[m.course_id], c = cmap[m.course_id];
    if (!role || !c || m.type === 'label') return false;
    if (role === 'student' && (!bool_(c.visible) || !visibleForStudent_(m, secVis))) return false;
    return m.title.toLowerCase().indexOf(q) >= 0;
  }).slice(0, 10).map(function (m) { return { id: m.id, title: m.title, type: m.type, course: cmap[m.course_id].fullname }; });
  const users = u.role === 'admin' ? DB.all('Users').filter(function (x) {
    return (x.name + ' ' + x.username + ' ' + x.kelas).toLowerCase().indexOf(q) >= 0;
  }).slice(0, 6).map(function (x) { const b = briefUser_(x); b.username = x.username; return b; }) : [];
  return { courses: courses, modules: modules, users: users };
}

/* ===========================================================================
 *  AKSI: ADMINISTRASI SITUS
 * ========================================================================= */
function actAdminOverview_() {
  const users = DB.all('Users'), cnt = function (fn) { return users.filter(fn).length; };
  return {
    counts: {
      users: users.length, admins: cnt(function (u) { return u.role === 'admin'; }), teachers: cnt(function (u) { return u.role === 'teacher'; }),
      students: cnt(function (u) { return u.role === 'student'; }), suspended: cnt(function (u) { return u.status === 'suspended'; }),
      courses: DB.all('Courses').length, categories: DB.all('Categories').length, modules: DB.all('Modules').length,
      submissions: DB.all('Submissions').filter(function (s) { return s.status === 'submitted'; }).length,
      attempts: DB.all('Attempts').filter(function (t) { return t.status === 'finished' && !bool_(t.preview); }).length
    },
    recent: users.filter(function (u) { return num_(u.last_login); }).sort(function (a, b) { return num_(b.last_login) - num_(a.last_login); })
      .slice(0, 8).map(publicUser_),
    version: CONFIG.VERSION
  };
}

function actUsers_() { return DB.all('Users').map(publicUser_).sort(byName_); }

function actSaveUser_(ctx, p) {
  if (!p.id) return publicUser_(createUser_(p));
  const x = DB.get('Users', p.id);
  if (!x) fail_('Pengguna tidak ditemukan.');
  const patch = {
    name: str_(p.name).trim().slice(0, 100) || x.name, email: str_(p.email).trim().slice(0, 120),
    role: ROLES.indexOf(p.role) >= 0 ? p.role : x.role, kelas: str_(p.kelas).trim().slice(0, 40), nisn: str_(p.nisn).trim().slice(0, 30),
    status: p.status === 'suspended' ? 'suspended' : 'active'
  };
  const username = str_(p.username).trim().toLowerCase();
  if (username && username !== x.username) {
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) fail_('Username tidak valid.');
    if (DB.find('Users', function (u) { return u.username === username; })) fail_('Username sudah digunakan.');
    patch.username = username;
  }
  if (x.id === ctx.user.id && patch.role !== 'admin') fail_('Anda tidak dapat menurunkan peran akun Anda sendiri.');
  if (x.id === ctx.user.id && patch.status === 'suspended') fail_('Anda tidak dapat menonaktifkan akun Anda sendiri.');
  if (p.password) {
    if (str_(p.password).length < 4) fail_('Password minimal 4 karakter.');
    patch.salt = newSalt_();
    patch.password_hash = hash_(str_(p.password), patch.salt);
  }
  return publicUser_(DB.update('Users', x.id, patch));
}

function actDeleteUsers_(ctx, p) {
  const ids = {};
  (Array.isArray(p.ids) ? p.ids : []).forEach(function (id) { ids[id] = 1; });
  if (ids[ctx.user.id]) fail_('Anda tidak dapat menghapus akun Anda sendiri.');
  if (!Object.keys(ids).length) return { deleted: 0 };
  const n = DB.removeWhere('Users', function (u) { return ids[u.id]; });
  ['Enrolments', 'Sessions', 'Completions', 'Submissions', 'Attempts'].forEach(function (t) {
    DB.removeWhere(t, function (r) { return ids[r.user_id]; });
  });
  return { deleted: n };
}

function actBulkUsers_(ctx, p) {
  const status = p.action === 'suspend' ? 'suspended' : 'active';
  let n = 0;
  (Array.isArray(p.ids) ? p.ids : []).forEach(function (id) {
    if (id === ctx.user.id) return;
    const u = DB.get('Users', id);
    if (u && u.status !== status) { DB.update('Users', id, { status: status }); n++; }
  });
  return { updated: n };
}

function mapRole_(r) {
  r = str_(r).trim().toLowerCase();
  if (r === 'admin' || r === 'administrator') return 'admin';
  if (r === 'guru' || r === 'teacher' || r === 'pengajar') return 'teacher';
  return 'student';
}

/** Ubah teks bebas menjadi username valid: huruf kecil, spasi → titik. */
function normUsername_(v) {
  return str_(v).trim().toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '');
}

/**
 * Inti impor pengguna dari Excel/CSV (dipakai admin & guru).
 * opt: { courseId, defaultPassword, allowCreate, studentOnly }
 */
function importRows_(rows, opt) {
  rows = (Array.isArray(rows) ? rows : []).slice(0, 3000);
  const byName = {}, enrolled = {}, seen = {};
  DB.all('Users').forEach(function (u) { byName[u.username] = u; });
  if (opt.courseId) DB.all('Enrolments').forEach(function (e) { if (e.course_id === opt.courseId) enrolled[e.user_id] = 1; });
  const created = [], toEnrol = [], skipped = [];
  let already = 0, existingCount = 0;
  rows.forEach(function (r, i) {
    const line = num_(r._row, i + 2);
    const uname = normUsername_(r.username || r.nisn);
    if (!uname) { skipped.push({ row: line, username: '', reason: 'Username dan NISN kosong' }); return; }
    if (seen[uname]) { skipped.push({ row: line, username: uname, reason: 'Username ganda di dalam berkas' }); return; }
    seen[uname] = 1;
    let u = byName[uname];
    if (u) {
      existingCount++;
      if (!opt.courseId) { skipped.push({ row: line, username: uname, reason: 'Username sudah ada' }); return; }
      if (u.role !== 'student') { skipped.push({ row: line, username: uname, reason: 'Akun sudah ada dan bukan akun siswa' }); return; }
    } else {
      if (!opt.allowCreate) { skipped.push({ row: line, username: uname, reason: 'Akun belum ada — minta admin membuatnya' }); return; }
      const pw = str_(r.password).trim() || str_(opt.defaultPassword).trim() || str_(r.nisn).trim();
      if (pw.length < 4) { skipped.push({ row: line, username: uname, reason: 'Akun baru butuh password min. 4 karakter (kolom password, password bawaan, atau NISN)' }); return; }
      try {
        u = createUser_({
          username: uname, password: pw,
          name: r.name, email: r.email, kelas: r.kelas, nisn: r.nisn,
          role: opt.studentOnly ? 'student' : mapRole_(r.role)
        }, { noInsert: true, skipCheck: true });
      } catch (e) { skipped.push({ row: line, username: uname, reason: e.message }); return; }
      u.id = u.id + i;
      byName[uname] = u;
      created.push(u);
    }
    if (opt.courseId && u.role === 'student') {
      if (enrolled[u.id]) { already++; return; }
      enrolled[u.id] = 1;
      toEnrol.push({ id: uid_('e') + i, course_id: opt.courseId, user_id: u.id, role: 'student', created_at: now_() });
    }
  });
  DB.insertMany('Users', created);
  DB.insertMany('Enrolments', toEnrol);
  return { created: created.length, enrolled: toEnrol.length, already: already, existing: existingCount, skipped: skipped };
}

function actImportUsers_(ctx, p) {
  if (p.course_id && !DB.get('Courses', p.course_id)) fail_('Kursus tujuan tidak ditemukan.');
  return importRows_(p.rows, { courseId: str_(p.course_id), defaultPassword: p.default_password, allowCreate: true, studentOnly: false });
}

/** Guru mengimpor daftar siswa dari Excel langsung ke kursusnya. */
function actImportToCourse_(ctx, p) {
  requireCourse_(ctx.user, p.course_id, true);
  const allowCreate = ctx.user.role === 'admin' || getSettings_().teacher_import !== '0';
  return importRows_(p.rows, { courseId: str_(p.course_id), defaultPassword: p.default_password, allowCreate: allowCreate, studentOnly: true });
}

function actCategories_() { return DB.all('Categories').map(catOut_).sort(bySort_); }

function actSaveCategory_(ctx, p) {
  const name = str_(p.name).trim().slice(0, 120);
  if (!name) fail_('Nama kategori wajib diisi.');
  const rec = { name: name, description: str_(p.description).slice(0, 2000) };
  if (p.id) { DB.update('Categories', p.id, rec); return { id: p.id }; }
  rec.id = uid_('k');
  rec.sort = DB.all('Categories').reduce(function (mx, c) { return Math.max(mx, num_(c.sort)); }, -1) + 1;
  DB.insert('Categories', rec);
  return { id: rec.id };
}

function actDeleteCategory_(ctx, p) {
  DB.where('Courses', function (c) { return c.category_id === p.id; }).forEach(function (c) { DB.update('Courses', c.id, { category_id: '' }); });
  DB.remove('Categories', p.id);
  return true;
}

function actAllCourses_() {
  const users = mapBy_(DB.all('Users'), 'id'), cats = mapBy_(DB.all('Categories'), 'id'), teachers = {}, students = {}, mods = {};
  DB.all('Enrolments').forEach(function (e) {
    if (e.role === 'teacher' && users[e.user_id]) (teachers[e.course_id] = teachers[e.course_id] || []).push(users[e.user_id].name);
    if (e.role === 'student') students[e.course_id] = (students[e.course_id] || 0) + 1;
  });
  DB.all('Modules').forEach(function (m) { mods[m.course_id] = (mods[m.course_id] || 0) + 1; });
  return DB.all('Courses').map(function (c) {
    return {
      id: c.id, fullname: c.fullname, shortname: c.shortname, category: cats[c.category_id] ? cats[c.category_id].name : '',
      cover: num_(c.cover), visible: bool_(c.visible), teachers: teachers[c.id] || [], students: students[c.id] || 0,
      modules: mods[c.id] || 0, created_at: num_(c.created_at)
    };
  }).sort(function (a, b) { return a.fullname.localeCompare(b.fullname); });
}

function actSaveSettings_(ctx, p) {
  const keys = { site_name: 80, school_name: 120, tagline: 200, academic_year: 20 };
  Object.keys(keys).forEach(function (k) { if (p[k] !== undefined) setSetting_(k, str_(p[k]).trim().slice(0, keys[k])); });
  if (p.allow_register !== undefined) setSetting_('allow_register', p.allow_register ? '1' : '0');
  if (p.teacher_import !== undefined) setSetting_('teacher_import', p.teacher_import ? '1' : '0');
  return publicSettings_(getSettings_());
}

/* ===========================================================================
 *  UNGGAH BERKAS (Google Drive)
 * ========================================================================= */
function uploadFolder_(sub) {
  const props = PropertiesService.getScriptProperties();
  let folder = null;
  const id = props.getProperty('UPLOAD_FOLDER_ID');
  if (id) { try { folder = DriveApp.getFolderById(id); if (folder.isTrashed()) folder = null; } catch (e) { folder = null; } }
  if (!folder) {
    const it = DriveApp.getFoldersByName(CONFIG.UPLOAD_FOLDER);
    folder = it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.UPLOAD_FOLDER);
    props.setProperty('UPLOAD_FOLDER_ID', folder.getId());
  }
  if (!sub) return folder;
  const it2 = folder.getFoldersByName(sub);
  return it2.hasNext() ? it2.next() : folder.createFolder(sub);
}

function saveUpload_(f, sub, maxMb) {
  if (!f || !f.data) fail_('Berkas kosong.');
  const name = str_(f.name).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 150) || 'berkas';
  const bytes = Utilities.base64Decode(String(f.data).replace(/^data:[^,]*,/, ''));
  const limit = (maxMb || CONFIG.MAX_UPLOAD_MB) * 1048576;
  if (bytes.length > limit) fail_('Ukuran berkas "' + name + '" melebihi ' + (maxMb || CONFIG.MAX_UPLOAD_MB) + ' MB.');
  const file = uploadFolder_(sub).createFile(Utilities.newBlob(bytes, f.mime || 'application/octet-stream', name));
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (e) { try { file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); } catch (e2) { /* biarkan default */ } }
  return { id: file.getId(), name: file.getName(), mime: file.getMimeType(), size: file.getSize(), url: file.getUrl() };
}

function trashFile_(id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* abaikan */ } }

function actUploadImage_(ctx, p) {
  if (!/^image\//.test(str_(p.mime))) fail_('Hanya berkas gambar yang dapat disisipkan.');
  return saveUpload_(p, 'Gambar', 5);
}

/* ===========================================================================
 *  DAFTAR AKSI API
 * ========================================================================= */
const ACTIONS = {
  ping: { pub: true, fn: actPing_ },
  settings: { pub: true, fn: actSettings_ },
  login: { pub: true, fn: actLogin_ },
  register: { pub: true, fn: actRegister_ },
  logout: { fn: actLogout_ },
  boot: { fn: actBoot_ },
  saveProfile: { fn: actSaveProfile_ },
  changePassword: { fn: actChangePassword_ },
  dashboard: { fn: actDashboard_ },
  myCourses: { fn: actMyCourses_ },
  catalog: { fn: actCatalog_ },
  course: { fn: actCourse_ },
  enrolSelf: { fn: actEnrolSelf_ },
  saveCourse: { fn: actSaveCourse_ },
  deleteCourse: { fn: actDeleteCourse_ },
  saveSection: { fn: actSaveSection_ },
  deleteSection: { fn: actDeleteSection_ },
  moveSection: { fn: actMoveSection_ },
  toggleSection: { fn: actToggleSection_ },
  saveModule: { fn: actSaveModule_ },
  deleteModule: { fn: actDeleteModule_ },
  moveModule: { fn: actMoveModule_ },
  toggleModule: { fn: actToggleModule_ },
  duplicateModule: { fn: actDuplicateModule_ },
  toggleCompletion: { fn: actToggleCompletion_ },
  module: { fn: actModule_ },
  submitAssign: { fn: actSubmitAssign_ },
  grade: { fn: actGrade_ },
  questions: { fn: actQuestions_ },
  saveQuestion: { fn: actSaveQuestion_ },
  importQuestions: { fn: actImportQuestions_ },
  deleteQuestion: { fn: actDeleteQuestion_ },
  moveQuestion: { fn: actMoveQuestion_ },
  startAttempt: { fn: actStartAttempt_ },
  saveAttempt: { fn: actSaveAttempt_ },
  finishAttempt: { fn: actFinishAttempt_ },
  review: { fn: actReview_ },
  deleteAttempt: { fn: actDeleteAttempt_ },
  discussion: { fn: actDiscussion_ },
  forumPost: { fn: actForumPost_ },
  deletePost: { fn: actDeletePost_ },
  participants: { fn: actParticipants_ },
  enrolCandidates: { fn: actEnrolCandidates_ },
  enrolUsers: { fn: actEnrolUsers_ },
  unenrol: { fn: actUnenrol_ },
  setEnrolRole: { fn: actSetEnrolRole_ },
  gradebook: { fn: actGradebook_ },
  myGrades: { fn: actMyGrades_ },
  calendar: { fn: actCalendar_ },
  notifications: { fn: actNotifications_ },
  announcements: { fn: actAnnouncements_ },
  saveAnnouncement: { fn: actSaveAnnouncement_ },
  deleteAnnouncement: { fn: actDeleteAnnouncement_ },
  categories: { fn: actCategories_ },
  search: { fn: actSearch_ },
  uploadImage: { fn: actUploadImage_ },
  adminOverview: { admin: true, fn: actAdminOverview_ },
  users: { admin: true, fn: actUsers_ },
  saveUser: { admin: true, fn: actSaveUser_ },
  deleteUsers: { admin: true, fn: actDeleteUsers_ },
  bulkUsers: { admin: true, fn: actBulkUsers_ },
  importUsers: { admin: true, fn: actImportUsers_ },
  importToCourse: { fn: actImportToCourse_ },
  saveCategory: { admin: true, fn: actSaveCategory_ },
  deleteCategory: { admin: true, fn: actDeleteCategory_ },
  allCourses: { admin: true, fn: actAllCourses_ },
  saveSettings: { admin: true, fn: actSaveSettings_ }
};

/* ===========================================================================
 *  DATA CONTOH (opsional) — jalankan `isiDataContoh` dari editor
 * ========================================================================= */
function isiDataContoh() {
  ensureSetup_(true);
  if (DB.find('Users', function (u) { return u.username === 'guru'; })) return 'Data contoh sudah ada.';
  const now = now_(), day = 864e5;
  const guru = createUser_({ username: 'guru', password: 'guru123', name: 'Rina Wulandari, S.Kom.', role: 'teacher', email: 'guru@sekolah.sch.id', color: '#5856D6' });
  const names = ['Ahmad Fauzi', 'Siti Rahmawati', 'Budi Prasetyo', 'Dewi Lestari', 'Rizky Pratama', 'Nur Aisyah'];
  const students = names.map(function (n, i) {
    return createUser_({ username: 'siswa' + (i + 1), password: 'siswa123', name: n, role: 'student', kelas: 'X TJKT 1', nisn: '0087654' + ('00' + (i + 1)).slice(-3) }, { noInsert: true });
  });
  DB.insertMany('Users', students);

  const catX = uid_('k'), catXI = uid_('k') + '1', catUmum = uid_('k') + '2';
  DB.insertMany('Categories', [
    { id: catX, name: 'Kelas X', description: 'Kursus untuk Fase E', sort: 0 },
    { id: catXI, name: 'Kelas XI', description: 'Kursus Konsentrasi Keahlian', sort: 1 },
    { id: catUmum, name: 'Umum', description: 'Kursus lintas jenjang', sort: 2 }
  ]);

  function course(full, short, cat, cover, summary, key, topics) {
    const id = uid_('c');
    DB.insert('Courses', { id: id, category_id: cat, fullname: full, shortname: short, summary: summary, enrol_key: key, cover: cover, visible: '1', start_date: now - 30 * day, end_date: now + 150 * day, created_by: guru.id, created_at: now });
    const secs = [{ id: uid_('s') + '0', course_id: id, title: 'Umum', summary: '', sort: 0, visible: '1' }];
    topics.forEach(function (t, i) { secs.push({ id: uid_('s') + (i + 1), course_id: id, title: t[0], summary: t[1], sort: i + 1, visible: '1' }); });
    DB.insertMany('Sections', secs);
    const en = [{ id: uid_('e'), course_id: id, user_id: guru.id, role: 'teacher', created_at: now }];
    students.forEach(function (s, i) { en.push({ id: uid_('e') + i, course_id: id, user_id: s.id, role: 'student', created_at: now }); });
    DB.insertMany('Enrolments', en);
    return { id: id, secs: secs };
  }
  let seq = 0;
  function mod(c, secIdx, type, title, intro, cfg, extra) {
    const id = uid_('m') + (seq++);
    DB.insert('Modules', Object.assign({
      id: id, course_id: c.id, section_id: c.secs[secIdx].id, type: type, title: title, intro: intro || '', config: JSON.stringify(cfg || {}),
      sort: seq, visible: '1', open_date: '', due_date: '', max_grade: GRADABLE.indexOf(type) >= 0 ? 100 : '', created_at: now
    }, extra || {}));
    return id;
  }
  function questions(mid, list) {
    DB.insertMany('Questions', list.map(function (q, i) {
      return { id: uid_('q') + i, module_id: mid, type: q[0], text: q[1], options: JSON.stringify(q[2] || []), answer: JSON.stringify(q[3]), points: q[4] || 1, sort: i };
    }));
  }

  const kka = course('Koding dan Kecerdasan Artifisial', 'KKA-X', catX, 0,
    '<p>Mata pelajaran <b>Koding dan Kecerdasan Artifisial (KKA)</b> Fase E membekali peserta didik dengan kemampuan berpikir komputasional, dasar pemrograman, literasi data, dan pengenalan kecerdasan artifisial secara etis.</p>',
    'kka2026', [
      ['Berpikir Komputasional', '<p>Dekomposisi, pengenalan pola, abstraksi, dan algoritma.</p>'],
      ['Algoritma & Pemrograman Dasar', '<p>Flowchart, pseudocode, dan logika percabangan.</p>'],
      ['Pengenalan Kecerdasan Artifisial', '<p>Apa itu AI, cara kerjanya, dan etika penggunaannya.</p>']
    ]);
  const forum = mod(kka, 0, 'forum', 'Forum Diskusi Kelas', '<p>Tempat bertanya dan berdiskusi seputar materi KKA.</p>', { teacher_only: false });
  mod(kka, 0, 'page', 'Kontrak Belajar & Tata Tertib', '<p>Baca sebelum memulai pembelajaran.</p>', { body: '<h3>Kontrak Belajar</h3><ol><li>Hadir tepat waktu dan siap belajar.</li><li>Kumpulkan tugas sebelum batas waktu.</li><li>Gunakan AI secara jujur dan bertanggung jawab.</li></ol><blockquote>Penilaian: Tugas 40%, Kuis 30%, Proyek 30%.</blockquote>' });
  mod(kka, 1, 'label', '', '<p>📘 <b>Tujuan pembelajaran:</b> peserta didik mampu menerapkan empat fondasi berpikir komputasional untuk menyelesaikan masalah sehari-hari.</p>', {});
  mod(kka, 1, 'page', 'Materi: Empat Fondasi Berpikir Komputasional', '<p>Ringkasan materi minggu pertama.</p>', { body: '<h3>1. Dekomposisi</h3><p>Memecah masalah besar menjadi bagian-bagian kecil yang lebih mudah diselesaikan.</p><h3>2. Pengenalan Pola</h3><p>Menemukan kesamaan atau pola dari beberapa masalah.</p><h3>3. Abstraksi</h3><p>Fokus pada informasi penting dan mengabaikan detail yang tidak relevan.</p><h3>4. Algoritma</h3><p>Menyusun langkah-langkah penyelesaian secara runtut dan jelas.</p>' });
  mod(kka, 1, 'url', 'Tantangan Bebras Indonesia', '<p>Latih berpikir komputasional dengan soal-soal Bebras.</p>', { url: 'https://bebras.or.id' });
  const quiz1 = mod(kka, 1, 'quiz', 'Kuis 1: Berpikir Komputasional', '<p>Kerjakan dengan jujur. Waktu 15 menit.</p>',
    { time_limit: 15, attempts: 2, grade_method: 'highest', shuffle: true, shuffle_options: true, review: true },
    { open_date: now - 3 * day, due_date: now + 4 * day });
  questions(quiz1, [
    ['mc', '<p>Memecah masalah besar menjadi bagian-bagian kecil disebut…</p>', ['Abstraksi', 'Dekomposisi', 'Algoritma', 'Pengenalan pola'], 1],
    ['mc', '<p>Langkah-langkah runtut untuk menyelesaikan masalah disebut…</p>', ['Algoritma', 'Variabel', 'Dekomposisi', 'Data'], 0],
    ['tf', '<p>Abstraksi berarti memperhatikan semua detail, termasuk yang tidak penting.</p>', [], false],
    ['multi', '<p>Manakah yang termasuk fondasi berpikir komputasional? (pilih semua yang benar)</p>', ['Dekomposisi', 'Animasi', 'Abstraksi', 'Pengenalan pola'], [0, 2, 3], 2],
    ['short', '<p>Diagram yang menggambarkan alur algoritma dengan simbol-simbol disebut…</p>', [], ['flowchart', 'diagram alir', 'bagan alir']]
  ]);
  const tugas = mod(kka, 2, 'assign', 'Tugas 1: Flowchart Menyeberang Jalan', '<p>Buat flowchart langkah-langkah menyeberang jalan dengan aman. Kirim dalam bentuk gambar/PDF atau jelaskan dengan teks.</p>',
    { types: ['text', 'file'], max_files: 3, allow_late: true }, { open_date: now - 2 * day, due_date: now + 5 * day });
  mod(kka, 2, 'page', 'Materi: Flowchart & Pseudocode', '', { body: '<p>Flowchart menggunakan simbol <b>terminator</b> (mulai/selesai), <b>proses</b>, <b>keputusan</b>, dan <b>input/output</b>.</p>' });
  mod(kka, 3, 'page', 'Materi: Apa itu Kecerdasan Artifisial?', '', { body: '<p>Kecerdasan Artifisial (AI) adalah kemampuan sistem komputer untuk melakukan tugas yang biasanya memerlukan kecerdasan manusia, seperti mengenali gambar, memahami bahasa, dan membuat keputusan.</p>' });
  mod(kka, 3, 'assign', 'Tugas 2: Esai Etika Penggunaan AI', '<p>Tulis esai 300 kata tentang etika menggunakan AI untuk belajar.</p>', { types: ['text'], max_files: 1, allow_late: false }, { due_date: now + 12 * day });

  const tjkt = course('Dasar-Dasar Teknik Jaringan Komputer dan Telekomunikasi', 'DDTJKT-X', catX, 9,
    '<p>Pengenalan profesi, perangkat jaringan, media transmisi, dan K3LH di bidang TJKT.</p>', 'tjkt2026', [
      ['Profesi & Kewirausahaan TJKT', ''], ['Perangkat & Media Jaringan', ''], ['K3LH', '']
    ]);
  mod(tjkt, 1, 'page', 'Materi: Profesi di Bidang TJKT', '', { body: '<p>Network engineer, teknisi FTTH, system administrator, hingga cloud engineer.</p>' });
  const q2 = mod(tjkt, 2, 'quiz', 'Kuis: Perangkat Jaringan', '', { time_limit: 10, attempts: 1, grade_method: 'highest', shuffle: false, shuffle_options: true, review: true }, { due_date: now + 9 * day });
  questions(q2, [
    ['mc', '<p>Perangkat yang menghubungkan dua jaringan berbeda adalah…</p>', ['Switch', 'Hub', 'Router', 'Repeater'], 2],
    ['tf', '<p>Kabel UTP termasuk media transmisi kabel tembaga.</p>', [], true]
  ]);
  mod(tjkt, 3, 'assign', 'Tugas: Poster K3LH Lab Jaringan', '<p>Buat poster aturan K3LH di laboratorium jaringan.</p>', { types: ['file'], max_files: 2, allow_late: true }, { due_date: now - 1 * day });

  DB.insert('Announcements', { id: uid_('an'), course_id: '', user_id: DB.find('Users', function (u) { return u.role === 'admin'; }).id, title: 'Selamat datang di LMS Sekolah 👋', message: '<p>Semua materi, tugas, dan kuis kini tersedia secara daring. Silakan lengkapi profil Anda.</p>', created_at: now - 2 * day });
  DB.insert('Announcements', { id: uid_('an') + 'b', course_id: kka.id, user_id: guru.id, title: 'Kuis 1 sudah dibuka', message: '<p>Kerjakan Kuis 1 paling lambat minggu ini. Semangat!</p>', created_at: now - 3600000 * 5 });

  // aktivitas contoh
  DB.insert('Submissions', { id: uid_('sb'), module_id: tugas, user_id: students[0].id, text: '<p>Mulai → Lihat kiri-kanan → Apakah aman? Jika ya, menyeberang. Jika tidak, tunggu → Selesai.</p>', files: '[]', status: 'submitted', submitted_at: now - 3600000 * 20, grade: '88', feedback: '<p>Bagus! Tambahkan simbol keputusan yang lebih jelas.</p>', graded_by: guru.id, graded_at: now - 3600000 * 3 });
  DB.insert('Submissions', { id: uid_('sb') + '2', module_id: tugas, user_id: students[1].id, text: '<p>Flowchart terlampir dalam bentuk teks: mulai, cek lampu, menyeberang, selesai.</p>', files: '[]', status: 'submitted', submitted_at: now - 3600000 * 2, grade: '', feedback: '', graded_by: '', graded_at: '' });
  const p1 = uid_('p');
  DB.insertMany('Posts', [
    { id: p1, module_id: forum, discussion_id: p1, parent_id: '', user_id: students[2].id, subject: 'Bedanya abstraksi dan dekomposisi?', message: '<p>Bu, saya masih bingung perbedaan abstraksi dan dekomposisi. Ada contoh sederhana?</p>', created_at: now - 3600000 * 30 },
    { id: p1 + 'r', module_id: forum, discussion_id: p1, parent_id: p1, user_id: guru.id, subject: 'Re: Bedanya abstraksi dan dekomposisi?', message: '<p>Dekomposisi = memecah masalah. Abstraksi = memilih informasi penting saja. Contoh: peta rute bus hanya menampilkan halte (abstraksi).</p>', created_at: now - 3600000 * 26 }
  ]);
  return 'Data contoh dibuat. Akun guru: guru / guru123 — siswa: siswa1 s/d siswa6 / siswa123';
}
