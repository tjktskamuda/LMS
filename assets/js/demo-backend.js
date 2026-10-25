/* LMS Sekolah — backend DEMO: menyimulasikan Google Apps Script + Google Sheets di browser.
   Dipakai oleh demo.html (dan pengujian). Data demo tersimpan di localStorage browser ini saja. */
(function () {
  'use strict';
  var KEY = 'lmsdemo_db_v2';
  var wb = null;
  try { wb = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { wb = null; }
  if (!wb || !wb.sheets) wb = { sheets: {}, order: [], props: {} };
  var saveT = null;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(wb)); } catch (e) { /* kuota penuh */ } }, 60);
  }
  window.__LMS_DEMO_RESET = function () { try { localStorage.removeItem(KEY); Object.keys(localStorage).forEach(function (k) { if (k.indexOf('lmsdemo_') === 0) localStorage.removeItem(k); }); } catch (e) {} location.reload(); };

  function Range(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
  Range.prototype.getValues = function () {
    var rows = this.sh.d().rows, out = [];
    for (var i = 0; i < this.nr; i++) {
      var row = [], src = rows[this.r - 1 + i] || [];
      for (var j = 0; j < this.nc; j++) { var v = src[this.c - 1 + j]; row.push(v === undefined || v === null ? '' : v); }
      out.push(row);
    }
    return out;
  };
  Range.prototype.getValue = function () { return this.getValues()[0][0]; };
  Range.prototype.setValues = function (vals) {
    var d = this.sh.d();
    if (vals.length !== this.nr) throw new Error('Jumlah baris data tidak cocok (' + vals.length + ' vs ' + this.nr + ')');
    if (this.r + this.nr - 1 > d.maxRows) throw new Error('Range di luar ukuran sheet');
    for (var i = 0; i < this.nr; i++) {
      if (vals[i].length !== this.nc) throw new Error('Jumlah kolom data tidak cocok');
      var ri = this.r - 1 + i;
      while (d.rows.length <= ri) d.rows.push([]);
      for (var j = 0; j < this.nc; j++) {
        var v = vals[i][j];
        if (typeof v === 'string' && v.charAt(0) === "'") v = v.slice(1);
        d.rows[ri][this.c - 1 + j] = v;
      }
    }
    save();
    return this;
  };
  Range.prototype.clearContent = function () {
    var d = this.sh.d();
    for (var i = 0; i < this.nr; i++) { var row = d.rows[this.r - 1 + i]; if (row) for (var j = 0; j < this.nc; j++) row[this.c - 1 + j] = ''; }
    save();
    return this;
  };
  ['setNumberFormat', 'setFontWeight', 'setBackground'].forEach(function (k) { Range.prototype[k] = function () { return this; }; });

  function Sheet(name) { this.name = name; }
  Sheet.prototype.d = function () { return wb.sheets[this.name]; };
  Sheet.prototype.getName = function () { return this.name; };
  Sheet.prototype.getLastRow = function () {
    var r = this.d().rows;
    for (var i = r.length - 1; i >= 0; i--) if (r[i] && r[i].some(function (v) { return v !== '' && v !== null && v !== undefined; })) return i + 1;
    return 0;
  };
  Sheet.prototype.getLastColumn = function () { var m = 0; this.d().rows.forEach(function (r) { if (r && r.length > m) m = r.length; }); return m; };
  Sheet.prototype.getMaxRows = function () { return this.d().maxRows; };
  Sheet.prototype.insertRowsAfter = function (after, n) { this.d().maxRows += n; save(); };
  Sheet.prototype.getRange = function (r, c, nr, nc) {
    if (r < 1 || c < 1) throw new Error('Koordinat range tidak valid');
    return new Range(this, r, c, nr || 1, nc || 1);
  };
  Sheet.prototype.deleteRow = function (r) { var d = this.d(); d.rows.splice(r - 1, 1); d.maxRows = Math.max(1, d.maxRows - 1); save(); };
  Sheet.prototype.setFrozenRows = function () {};

  var book = {
    getId: function () { return 'demo-spreadsheet'; },
    getName: function () { return "Database LMS (demo)"; },
    getSheetByName: function (n) { return wb.sheets[n] ? new Sheet(n) : null; },
    insertSheet: function (n) { wb.sheets[n] = { rows: [], maxRows: 1000 }; wb.order.push(n); save(); return new Sheet(n); },
    getSheets: function () { return wb.order.filter(function (n) { return wb.sheets[n]; }).map(function (n) { return new Sheet(n); }); },
    deleteSheet: function (s) { delete wb.sheets[s.name]; save(); }
  };
  window.SpreadsheetApp = { getActiveSpreadsheet: function () { return book; }, openById: function () { return book; }, flush: function () { save(); } };

  /* SHA-256 */
  var sha256 = (function () {
    var K = [], H = [], n = 2, c = 0;
    function isPrime(x) { for (var i = 2; i * i <= x; i++) if (x % i === 0) return false; return true; }
    while (c < 64) { if (isPrime(n)) { if (c < 8) H[c] = (Math.pow(n, 1 / 2) * 4294967296) | 0; K[c] = (Math.pow(n, 1 / 3) * 4294967296) | 0; c++; } n++; }
    return function (bytes) {
      var l = bytes.length, total = ((l + 9 + 63) >> 6) << 6, buf = new Uint8Array(total);
      buf.set(bytes); buf[l] = 0x80;
      var dv = new DataView(buf.buffer), bits = l * 8;
      dv.setUint32(total - 4, bits >>> 0); dv.setUint32(total - 8, Math.floor(bits / 4294967296));
      var h = H.slice(), w = new Array(64);
      for (var i = 0; i < total; i += 64) {
        for (var j = 0; j < 16; j++) w[j] = dv.getInt32(i + j * 4);
        for (j = 16; j < 64; j++) {
          var a15 = w[j - 15], a2 = w[j - 2];
          var s0 = ((a15 >>> 7) | (a15 << 25)) ^ ((a15 >>> 18) | (a15 << 14)) ^ (a15 >>> 3);
          var s1 = ((a2 >>> 17) | (a2 << 15)) ^ ((a2 >>> 19) | (a2 << 13)) ^ (a2 >>> 10);
          w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
        }
        var A = h[0], B = h[1], C = h[2], D = h[3], E = h[4], F = h[5], G = h[6], HH = h[7];
        for (j = 0; j < 64; j++) {
          var S1 = ((E >>> 6) | (E << 26)) ^ ((E >>> 11) | (E << 21)) ^ ((E >>> 25) | (E << 7));
          var ch = (E & F) ^ (~E & G);
          var t1 = (HH + S1 + ch + K[j] + w[j]) | 0;
          var S0 = ((A >>> 2) | (A << 30)) ^ ((A >>> 13) | (A << 19)) ^ ((A >>> 22) | (A << 10));
          var maj = (A & B) ^ (A & C) ^ (B & C);
          var t2 = (S0 + maj) | 0;
          HH = G; G = F; F = E; E = (D + t1) | 0; D = C; C = B; B = A; A = (t1 + t2) | 0;
        }
        h[0] = (h[0] + A) | 0; h[1] = (h[1] + B) | 0; h[2] = (h[2] + C) | 0; h[3] = (h[3] + D) | 0;
        h[4] = (h[4] + E) | 0; h[5] = (h[5] + F) | 0; h[6] = (h[6] + G) | 0; h[7] = (h[7] + HH) | 0;
      }
      var out = [];
      h.forEach(function (x) { out.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255); });
      return out;
    };
  })();
  window.__sha256 = sha256;

  function b64ToBytes(s) { var bin = atob(String(s)), out = new Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  function bytesToB64(b) { var s = ''; for (var i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.slice(i, i + 8192)); return btoa(s); }
  window.Logger = { log: function (m) { console.log(m); } };
  window.Utilities = {
    DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
    computeDigest: function (alg, str) { return sha256(new TextEncoder().encode(String(str))).map(function (b) { return b > 127 ? b - 256 : b; }); },
    getUuid: function () { return (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); })); },
    base64Decode: function (s) { return b64ToBytes(s); },
    newBlob: function (bytes, mime, name) { return { bytes: bytes, mime: mime, name: name }; },
    sleep: function () {}
  };
  var cacheStore = {};
  window.CacheService = { getScriptCache: function () { return {
    get: function (k) { var e = cacheStore[k]; if (!e || e.exp < Date.now()) return null; return e.v; },
    put: function (k, v, ttl) { cacheStore[k] = { v: String(v), exp: Date.now() + (ttl || 600) * 1000 }; },
    remove: function (k) { delete cacheStore[k]; }
  }; } };
  window.LockService = { getScriptLock: function () { return { waitLock: function () {}, tryLock: function () { return true; }, releaseLock: function () {} }; } };
  window.PropertiesService = { getScriptProperties: function () { return {
    getProperty: function (k) { return wb.props[k] === undefined ? null : wb.props[k]; },
    setProperty: function (k, v) { wb.props[k] = String(v); save(); }
  }; } };

  var files = {}, folders = {};
  function Folder(id, name) { this.id = id; this.name = name; folders[id] = this; }
  Folder.prototype.getId = function () { return this.id; };
  Folder.prototype.isTrashed = function () { return false; };
  Folder.prototype.getFoldersByName = function (n) { var self = this, list = Object.keys(folders).map(function (k) { return folders[k]; }).filter(function (f) { return f.parent === self.id && f.name === n; }); return iter(list); };
  Folder.prototype.createFolder = function (n) { var f = new Folder('fd' + Math.random().toString(36).slice(2), n); f.parent = this.id; return f; };
  Folder.prototype.createFile = function (blob) {
    var id = 'demo' + Math.random().toString(36).slice(2, 12), url = 'data:' + (blob.mime || 'application/octet-stream') + ';base64,' + bytesToB64(blob.bytes);
    var f = { getId: function () { return id; }, getName: function () { return blob.name; }, getMimeType: function () { return blob.mime; }, getSize: function () { return blob.bytes.length; }, getUrl: function () { return url; }, setSharing: function () {}, setTrashed: function () { delete files[id]; } };
    files[id] = f;
    return f;
  };
  function iter(list) { var i = 0; return { hasNext: function () { return i < list.length; }, next: function () { return list[i++]; } }; }
  var root = new Folder('root', 'root');
  window.DriveApp = {
    Access: { ANYONE_WITH_LINK: 1, DOMAIN_WITH_LINK: 2 }, Permission: { VIEW: 1 },
    getFolderById: function (id) { if (!folders[id]) throw new Error('not found'); return folders[id]; },
    getFoldersByName: function (n) { return root.getFoldersByName(n); },
    createFolder: function (n) { return root.createFolder(n); },
    getFileById: function (id) { if (!files[id]) throw new Error('not found'); return files[id]; }
  };
  window.ContentService = {
    MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
    createTextOutput: function (t) { var o = { c: String(t == null ? '' : t), setMimeType: function () { return o; }, getContent: function () { return o.c; } }; return o; }
  };
  var DEMO_URL = 'https://script.google.com/macros/s/DEMO-LMS-SEKOLAH-DI-BROWSER-0000/exec';
  window.ScriptApp = { getService: function () { return { getUrl: function () { return DEMO_URL; } }; } };

  /* fetch() ke DEMO_URL dijawab oleh doPost/doGet dari backend/Code.gs yang dimuat di halaman ini */
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, opt) {
    var url = String(input && input.url ? input.url : input);
    if (url.split('?')[0] !== DEMO_URL) return realFetch(input, opt);
    window.__pending = (window.__pending || 0) + 1;
    return new Promise(function (resolve) {
      setTimeout(function () {
        var text;
        try {
          var out;
          if (opt && String(opt.method).toUpperCase() === 'POST') out = window.doPost({ postData: { contents: String(opt.body || ''), type: 'text/plain' }, parameter: {} });
          else { var q = {}; new URL(url).searchParams.forEach(function (v, k) { q[k] = v; }); out = window.doGet({ parameter: q }); }
          text = out.getContent();
        } catch (e) { text = JSON.stringify({ ok: false, error: String(e && e.message || e) }); }
        window.__pending--;
        resolve(new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }, 140 + Math.random() * 160);
    });
  };
  window.LMS_CONFIG = { API_URL: DEMO_URL };
  window.__LMS_DEMO__ = true;
})();
