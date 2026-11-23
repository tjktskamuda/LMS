/* ==========================================================================
   LMS SEKOLAH — Kaca optik (WebGL)
   Kaca yang benar-benar membiaskan cahaya: latar (wallpaper) digambar di WebGL,
   lalu tepat di bawah setiap panel/tombol kaca, latar itu dibiaskan seperti kaca tebal
   bertepi bulat (hukum Snell, IOR 1,5) lengkap dengan dispersi warna (RGB), tepi tajam,
   kilau tepi, dan bayangan. Bukan sekadar blur CSS.
   Elemen yang melayang di atas konten (sheet, menu, tab bar, topbar saat menggulir)
   tetap memakai kaca CSS karena WebGL tidak bisa "melihat" isi halaman di bawahnya.
   ========================================================================== */
(function () {
  'use strict';
  const SEL = '.glass, .btn-glass, .tb-search, .seg';
  const SKIP = '#layer, .tabbar, .toasts, .chero, .menu, .sheet, .alert, .spot, .att-off, .att-off-card, .att-off-bar, .exam-ov, .exam-card, #examOv';
  const MAX_DPR = 2, MAX_PX = 2600000;

  const VS = `attribute vec2 aP; varying vec2 vUv; void main(){ vUv = aP * .5 + .5; gl_Position = vec4(aP, 0., 1.); }`;

  // ---------- Latar (wallpaper) prosedural ----------
  const BG_FS = `precision highp float;
varying vec2 vUv;
uniform vec2 uRes; uniform float uTime, uMode, uDark, uScale;
uniform vec3 uC0, uC1, uC2, uC3, uC4;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= .5; } return v; }
float silkH(vec2 q, float t){
  vec2 w = q;
  w += .38 * vec2(sin(q.y * 1.25 + 1.2 + t * .05), sin(q.x * 1.05 - .7 - t * .04));
  w += .13 * vec2(sin(w.y * 3.1 + 2.), sin(w.x * 2.7 + 1.));
  float h = sin(w.x * 2.1 + w.y * 1.05);
  h += sin(-w.x * 1.25 + w.y * 2.5 + 1.3) * .55;
  h += sin(w.x * 4.2 + w.y * .55 + 2.4) * .2;
  h -= .38 * abs(sin(w.x * 1.55 - w.y * 1.85 + .8));
  return h;
}
vec3 silk(vec2 uv, float asp, float t){
  vec2 q = (uv - .5) * vec2(asp, 1.) * 2.4;
  float e = .004, h = silkH(q, t), hx = silkH(q + vec2(e, 0.), t), hy = silkH(q + vec2(0., e), t);
  vec3 n = normalize(vec3(-(hx - h) / e * .3, -(hy - h) / e * .3, 1.));
  vec3 L = normalize(vec3(-.5, .62, .6)), H = normalize(L + vec3(0., 0., 1.));
  float dif = clamp(dot(n, L) * .8 + .2, 0., 1.), nh = max(dot(n, H), 0.);
  float m = smoothstep(-.22, .22, sin(q.x * .85 - q.y * 1.15 + .5) + .4 * sin(q.y * 1.9 + q.x * .4) - .35);
  float m2 = smoothstep(.3, .9, sin(q.x * .5 + q.y * .8 + 2.6) + .3 * sin(q.x * 2.1));
  vec3 base = mix(uC0, uC1, m);
  base = mix(base, uC2, m2 * (1. - m) * .5);
  vec3 col = base * (.1 + 1.05 * dif);
  col += mix(vec3(1., .95, .92), base, .25) * (pow(nh, 70.) * .75 + pow(nh, 14.) * .2);
  float gr = noise(gl_FragCoord.xy / uScale * .85) - .5;
  col *= 1. + gr * .07 + .012 * sin((q.x * .7 + q.y) * 700.);
  return col;
}
float caust(vec2 p, float t){
  vec2 i = floor(p), f = fract(p); float f1 = 8., f2 = 8.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)), o = vec2(hash(i + g), hash(i + g + 19.7));
    o = .5 + .42 * sin(t * .5 + 6.2831 * o);
    float d = length(g + o - f);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  return pow(1. - smoothstep(0., .13, f2 - f1), 2.4);
}
vec3 pool(vec2 uv, float asp, float t){
  vec2 p = (uv - .5) * vec2(asp, 1.) * 8. + vec2(31.7, 12.3);
  vec2 wob = vec2(fbm(p * .3 + t * .12), fbm(p * .3 - t * .1 + 3.1)) - .5;
  vec2 pp = p + wob * .75;
  vec2 cell = floor(pp), f = fract(pp);
  float gw = .045, gr = smoothstep(0., gw, f.x) * smoothstep(0., gw, f.y) * smoothstep(1., 1. - gw, f.x) * smoothstep(1., 1. - gw, f.y);
  float hv = hash(cell);
  vec3 tile = hv < .42 ? uC0 : hv < .8 ? uC1 : hv < .985 ? uC2 : mix(uC1, uC3, .6);
  tile *= .9 + .2 * noise(pp * 7.);
  vec3 col = mix(uC3 * .95, tile, gr);
  vec2 cp = p * .85 + .35 * (vec2(fbm(p * .5 + t * .1), fbm(p * .5 - t * .08 + 7.)) - .5);
  vec2 cp2 = p * .45 + .5 * (vec2(fbm(p * .3 + t * .08), fbm(p * .3 - t * .07 + 2.)) - .5);
  float c = caust(cp2, t) * .42 + caust(cp2 * 1.9 + 4., t * 1.3) * .16;
  col += c * vec3(.85, .97, 1.) * (.75 + .25 * uDark);
  col = mix(col, uC4, .12 + .1 * fbm(p * .2));
  return col;
}
vec3 ribbons(vec2 uv, float asp, float t){
  vec2 q = (uv - .5) * vec2(asp, 1.);
  vec3 col = uC4 * (1. - .35 * length(q));
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    float y0 = -.5 + fk * .24 + .14 * sin(q.x * 2. + fk * 1.7 + t * .05) + .06 * sin(q.x * 4.7 - fk + t * .035) - .1 * q.x;
    float wd = .065 + .03 * sin(q.x * 1.4 + fk * 2.1);
    float d = (q.y - y0) / wd;
    vec3 ca = fk < 1. ? uC0 : fk < 2. ? uC1 : fk < 3. ? uC2 : fk < 4. ? uC3 : uC1;
    vec3 cb = fk < 1. ? uC1 : fk < 2. ? uC2 : fk < 3. ? uC3 : fk < 4. ? uC0 : uC2;
    float tw = .5 + .5 * sin(q.x * 2.6 + fk * 1.3 + t * .06);
    vec3 rc = mix(ca, cb, tw);
    float body = smoothstep(1.05, .85, abs(d));
    float sh = .45 + .55 * cos(clamp(d, -1.4, 1.4) * 1.1);
    rc = rc * sh + vec3(1.) * pow(max(cos(d * 1.5), 0.), 14.) * (.25 + .5 * tw);
    col = mix(col, rc, body);
    col += mix(ca, cb, .5) * .22 * exp(-d * d * .35) * (1. - body);
  }
  return col;
}
vec3 aurora(vec2 uv, float asp, float t){
  vec2 q = uv * vec2(asp, 1.);
  vec3 col = uC4;
  vec2 c1 = vec2(.1 * asp, 1.05) + .08 * vec2(sin(t * .07), cos(t * .05));
  vec2 c2 = vec2(.95 * asp, .95) + .08 * vec2(cos(t * .06), sin(t * .08));
  vec2 c3 = vec2(.9 * asp, .05) + .08 * vec2(sin(t * .05 + 1.), cos(t * .07));
  vec2 c4 = vec2(.12 * asp, .1) + .08 * vec2(cos(t * .04 + 2.), sin(t * .06));
  col = mix(col, uC0, .8 * smoothstep(.75, 0., length(q - c1)));
  col = mix(col, uC1, .7 * smoothstep(.7, 0., length(q - c2)));
  col = mix(col, uC2, .65 * smoothstep(.75, 0., length(q - c3)));
  col = mix(col, uC3, .6 * smoothstep(.7, 0., length(q - c4)));
  vec2 g = mod(gl_FragCoord.xy / uScale, 26.) - 13.;
  float dot_ = smoothstep(1.6, .9, length(g)) * smoothstep(.95, .1, length(uv - vec2(.5, .7)));
  col = mix(col, vec3(1.), dot_ * (.32 - .2 * uDark));
  return col;
}
void main(){
  float asp = uRes.x / uRes.y, t = uTime;
  vec3 c;
  if (uMode < .5) c = aurora(vUv, asp, t);
  else if (uMode < 1.5) c = silk(vUv, asp, t);
  else if (uMode < 2.5) c = pool(vUv, asp, t);
  else c = ribbons(vUv, asp, t);
  c += (hash(gl_FragCoord.xy + t) - .5) * .018;
  gl_FragColor = vec4(clamp(c, 0., 1.), 1.);
}`;

  // ---------- Blur (untuk bagian tengah kaca yang sedikit buram) ----------
  const BLUR_FS = `precision highp float;
varying vec2 vUv; uniform sampler2D uT; uniform vec2 uDir;
void main(){
  vec4 c = texture2D(uT, vUv) * .2270270270;
  c += texture2D(uT, vUv + uDir * 1.3846153846) * .3162162162; c += texture2D(uT, vUv - uDir * 1.3846153846) * .3162162162;
  c += texture2D(uT, vUv + uDir * 3.2307692308) * .0702702703; c += texture2D(uT, vUv - uDir * 3.2307692308) * .0702702703;
  gl_FragColor = c;
}`;

  // ---------- Salin latar ke layar ----------
  const COPY_FS = `precision highp float; varying vec2 vUv; uniform sampler2D uT; void main(){ gl_FragColor = vec4(texture2D(uT, vUv).rgb, 1.); }`;

  // ---------- Kaca: satu kotak per elemen ----------
  const GV = `attribute vec2 aP;
uniform vec2 uView; uniform vec4 uRect; uniform float uPad;
varying vec2 vPos;
void main(){
  vec2 c = aP * .5 + .5;
  vec2 pos = uRect.xy - uPad + c * (uRect.zw + 2. * uPad);
  vPos = pos;
  vec2 clip = pos / uView * 2. - 1.;
  gl_Position = vec4(clip.x, -clip.y, 0., 1.);
}`;
  const GF = `precision highp float;
varying vec2 vPos;
uniform sampler2D uBg, uBl;
uniform vec2 uView;
uniform vec4 uRect;
uniform float uRad, uBevel, uFrost, uTint, uDark, uAlpha, uPass, uDpr, uHover, uLift;
float sdr(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
vec3 tap(vec2 pos, float frost){
  vec2 uv = vec2(pos.x / uView.x, 1. - pos.y / uView.y);
  uv = clamp(uv, vec2(.001), vec2(.999));
  return mix(texture2D(uBg, uv).rgb, texture2D(uBl, uv).rgb, frost);
}
void main(){
  vec2 b = uRect.zw * .5, p = vPos - (uRect.xy + b);
  float r = min(uRad, min(b.x, b.y));
  float d = sdr(p, b, r);
  if (uPass < .5) {                       // bayangan
    float ds = sdr(p - vec2(0., 7.), b, r);
    float s = (1. - smoothstep(-6., 26., ds)) * .55 + (1. - smoothstep(-1., 6., sdr(p - vec2(0., 1.5), b, r))) * .45;
    s *= (uDark > .5 ? .5 : .2) * uAlpha * smoothstep(-1., 1., d);
    gl_FragColor = vec4(0., 0., 0., s);
    return;
  }
  float aa = .75 / uDpr;
  float cov = 1. - smoothstep(-aa, aa, d);
  if (cov <= 0.) discard;
  vec2 e = vec2(.6, 0.);
  vec2 g = vec2(sdr(p + e.xy, b, r) - sdr(p - e.xy, b, r), sdr(p + e.yx, b, r) - sdr(p - e.yx, b, r));
  g = g / max(length(g), 1e-4);
  float s = clamp(-d / uBevel, 0., 1.), k = 1. - s;
  float slope = k / sqrt(max(1. - k * k, .035));
  vec3 n = normalize(vec3(g * slope * .85, 1.));
  vec3 I = vec3(0., 0., -1.);
  float depth = uBevel * 2.8;
  vec3 col;
  vec3 R = refract(I, n, 1. / 1.47); col.r = tap(vPos + R.xy / max(-R.z, .25) * depth, uFrost).r;
  R = refract(I, n, 1. / 1.50);       col.g = tap(vPos + R.xy / max(-R.z, .25) * depth, uFrost).g;
  R = refract(I, n, 1. / 1.54);       col.b = tap(vPos + R.xy / max(-R.z, .25) * depth, uFrost).b;
  // badan kaca: sedikit terang & berwarna
  vec3 tint = uDark > .5 ? vec3(.07, .075, .1) : vec3(1.);
  col = mix(col, tint, clamp(uTint + uHover * .08, 0., .95));
  col = col * (1. - uLift) + uLift;
  // kilau tepi (cahaya dari kiri atas) & pantulan dalam di kanan bawah
  vec2 Ld = normalize(vec2(-.55, -.84));
  float edge = 1. - n.z;
  float hi = pow(max(dot(g, Ld), 0.), 2.) * edge * 1.9 + pow(max(dot(g, -Ld), 0.), 2.) * edge * .8;
  float rim = (1. - smoothstep(0., 1.4, -d)) * (.28 + .5 * max(dot(g, Ld), 0.) + .22 * max(dot(g, -Ld), 0.));
  float inner = (1. - smoothstep(0., uBevel * .9, -d)) * .06;
  col += vec3(1.) * (hi * (uDark > .5 ? .45 : .6) + rim * (uDark > .5 ? .55 : .75) + inner);
  col = clamp(col, 0., 1.);
  gl_FragColor = vec4(col, 1.) * cov * uAlpha;
}`;

  let gl = null, cv = null, ok = false, on = false;
  let pBg, pBl, pCp, pGl, quad, W = 0, H = 0, dpr = 1, bgScale = 1;
  let tBg, fBg, tB1, fB1, tB2, fB2, bw = 0, bh = 0, lw = 0, lh = 0;
  let cfg = { mode: 1, dark: false, motion: false, colors: [] };
  let frames = 0, els = [], scanDirty = true, bgDirty = true, raf = 0, until = 0, t0 = performance.now(), lastBg = 0, mo = null;

  function sh(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('GLSL: ' + gl.getShaderInfoLog(s));
    return s;
  }
  function prog(vs, fs) {
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aP'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('GL link: ' + gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
    return { p, u };
  }
  function target(w, h) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return [t, f];
  }
  function drop(list) { list.forEach(x => { if (!x) return; if (x instanceof WebGLTexture) gl.deleteTexture(x); else gl.deleteFramebuffer(x); }); }

  function init(parent) {
    if (ok) return true;
    try {
      cv = document.createElement('canvas'); cv.id = 'glc'; cv.setAttribute('aria-hidden', 'true');
      // Hanya dengan GPU sungguhan. Tanpa GPU (render perangkat lunak), kaca CSS biasa jauh lebih ringan.
      let force = false;
      try { force = /[?&]glforce/.test(location.search) || localStorage.getItem('lms_glforce') === '1'; } catch (e) { /* */ }
      const opt = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: !force };
      gl = cv.getContext('webgl', opt) || cv.getContext('experimental-webgl', opt);
      if (!gl) return false;
      if (!force) {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        const rn = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
        if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(rn)) { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); gl = null; return false; }
      }
      pBg = prog(VS, BG_FS); pBl = prog(VS, BLUR_FS); pCp = prog(VS, COPY_FS); pGl = prog(GV, GF);
      quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      (parent || document.body).appendChild(cv);
      cv.addEventListener('webglcontextlost', e => {   // GPU direset/sibuk: kembali ke kaca CSS biasa
        e.preventDefault(); ok = false; on = false;
        document.documentElement.classList.remove('glr', 'glon');
        els.forEach(el => { if (el.classList.contains('glo')) el.classList.remove('glo'); }); els = [];
        if (cv.parentNode) cv.parentNode.removeChild(cv);
      }, false);
      ok = true;
      listen();
      return true;
    } catch (e) {
      try { console.warn('[kaca] WebGL tidak tersedia:', e.message); } catch (x) { /* */ }
      if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
      ok = false; return false;
    }
  }

  function resize() {
    const cw = Math.max(1, document.documentElement.clientWidth), ch = Math.max(1, window.innerHeight);
    let d = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    if (cw * ch * d * d > MAX_PX) d = Math.sqrt(MAX_PX / (cw * ch));
    const pw = Math.round(cw * d), ph = Math.round(ch * d);
    if (pw === W && ph === H && Math.abs(d - dpr) < .01) return false;
    W = pw; H = ph; dpr = d; cv.width = W; cv.height = H;
    bgDirty = true; buffers();
    return true;
  }
  function buffers() {
    const s = cfg.motion ? Math.min(1, 1.1 / dpr) : Math.min(1, 1.5 / dpr);
    const nbw = Math.max(2, Math.round(W * s)), nbh = Math.max(2, Math.round(H * s));
    if (nbw === bw && nbh === bh && tBg) return;
    drop([tBg, fBg, tB1, fB1, tB2, fB2]);
    bw = nbw; bh = nbh; bgScale = s * dpr; lw = Math.max(2, Math.round(bw / 4)); lh = Math.max(2, Math.round(bh / 4));
    [tBg, fBg] = target(bw, bh); [tB1, fB1] = target(lw, lh); [tB2, fB2] = target(lw, lh);
    bgDirty = true;
  }
  function v3(u, hex) { if (!u) return; const n = parseInt(String(hex).replace('#', ''), 16); gl.uniform3f(u, (n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); }
  function drawBg(time) {
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fBg); gl.viewport(0, 0, bw, bh);
    gl.useProgram(pBg.p); const u = pBg.u;
    gl.uniform2f(u.uRes, bw, bh); gl.uniform1f(u.uTime, time); gl.uniform1f(u.uMode, cfg.mode); gl.uniform1f(u.uDark, cfg.dark ? 1 : 0); gl.uniform1f(u.uScale, bgScale);
    ['uC0', 'uC1', 'uC2', 'uC3', 'uC4'].forEach((k, i) => v3(u[k], cfg.colors[i] || '#888888'));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // blur: perkecil 4×, lalu Gaussian horizontal + vertikal (2 putaran)
    gl.useProgram(pBl.p); gl.activeTexture(gl.TEXTURE0);
    let src = tBg;
    for (let i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fB1); gl.viewport(0, 0, lw, lh);
      gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(pBl.u.uT, 0); gl.uniform2f(pBl.u.uDir, (i ? 2 : 1.2) / lw, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fB2);
      gl.bindTexture(gl.TEXTURE_2D, tB1); gl.uniform2f(pBl.u.uDir, 0, (i ? 2 : 1.2) / lh);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      src = tB2;
    }
    bgDirty = false;
  }

  // ---------- Elemen kaca ----------
  function scan() {
    scanDirty = false;
    const all = Array.prototype.slice.call(document.querySelectorAll(SEL)).filter(el => {
      if (el.closest(SKIP)) return false;
      if (el.classList.contains('topbar')) return false;
      const tb = el.closest('.topbar');
      if (tb && (tb.classList.contains('scrolled') || tb.classList.contains('always'))) return false;
      if (el.classList.contains('hidden')) return false;
      return true;
    });
    const set = new Set(all);
    const next = all.filter(el => { let p = el.parentElement; while (p) { if (set.has(p)) return false; p = p.parentElement; } return true; });
    els.forEach(el => { if (next.indexOf(el) < 0 && el.classList.contains('glo')) el.classList.remove('glo'); });
    next.forEach(el => {
      if (!el.classList.contains('glo')) el.classList.add('glo');
      const cs = getComputedStyle(el);
      el._glr = parseFloat(cs.borderTopLeftRadius) || 0;
      el._glk = el.matches('.btn-glass, .tb-search, .seg') || el.offsetHeight < 60 ? 'c' : 'p';
      el._glt = el.classList.contains('thick') ? 1 : 0;
    });
    els = next;
  }
  function opacityOf(el) {
    let o = 1, n = 0;
    for (let p = el; p && p !== document.body && n < 6; p = p.parentElement, n++) {
      const cs = getComputedStyle(p);
      if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
      o *= parseFloat(cs.opacity);
      if (o < .01) return 0;
    }
    return o;
  }
  function render(now) {
    if (scanDirty && on) scan();
    const vw = W / dpr, vh = H / dpr;
    if (bgDirty || (cfg.motion && now - lastBg > 40)) { drawBg((now - t0) / 1000); lastBg = now; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    gl.useProgram(pCp.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tBg); gl.uniform1i(pCp.u.uT, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (!on || !els.length) return;
    const animating = now < until;
    const list = [];
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (!el.isConnected) { scanDirty = true; continue; }
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < -40 || r.top > vh + 40 || r.right < -40 || r.left > vw + 40) continue;
      if (animating || el._gla === undefined) el._gla = opacityOf(el);
      if (el._gla < .01) continue;
      list.push([el, r]);
    }
    if (!list.length) return;
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(pGl.p); const u = pGl.u;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tBg); gl.uniform1i(u.uBg, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tB2); gl.uniform1i(u.uBl, 1);
    gl.uniform2f(u.uView, vw, vh); gl.uniform1f(u.uDark, cfg.dark ? 1 : 0); gl.uniform1f(u.uDpr, dpr);
    for (let pass = 0; pass < 2; pass++) {
      gl.uniform1f(u.uPass, pass);
      for (let i = 0; i < list.length; i++) {
        const el = list[i][0], r = list[i][1], c = el._glk === 'c';
        const rad = Math.min(el._glr, r.width / 2, r.height / 2);
        gl.uniform4f(u.uRect, r.left, r.top, r.width, r.height);
        gl.uniform1f(u.uPad, pass ? 1 : 34);
        gl.uniform1f(u.uRad, rad);
        gl.uniform1f(u.uBevel, Math.max(6, Math.min(c ? r.height * .5 : 30, rad * 1.1 + 2, r.width / 2, r.height / 2)));
        gl.uniform1f(u.uFrost, c ? .08 : (el._glt ? .9 : .6));
        gl.uniform1f(u.uTint, c ? (cfg.dark ? .14 : .22) : (el._glt ? (cfg.dark ? .6 : .72) : (cfg.dark ? .3 : .5)));
        gl.uniform1f(u.uLift, c ? (cfg.dark ? .05 : .04) : (cfg.dark ? .035 : .02));
        gl.uniform1f(u.uHover, el._glh ? 1 : 0);
        gl.uniform1f(u.uAlpha, el._gla);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
  }
  function loop() {
    raf = 0;
    if (!ok || document.hidden) return;
    const now = performance.now();
    resize();
    render(now); frames++;
    if (now < until || cfg.motion || (scanDirty && on)) raf = requestAnimationFrame(loop);
  }
  function kick(ms) {
    if (!ok) return;
    until = Math.max(until, performance.now() + (ms || 300));
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function listen() {
    const k = ms => () => kick(ms);
    window.addEventListener('scroll', k(220), { passive: true, capture: true });
    window.addEventListener('resize', k(500), { passive: true });
    document.addEventListener('transitionrun', k(900), true);
    document.addEventListener('animationstart', k(1100), true);
    document.addEventListener('animationend', k(160), true);
    document.addEventListener('transitionend', k(160), true);
    document.addEventListener('pointerdown', k(700), true);
    document.addEventListener('pointerup', k(700), true);
    document.addEventListener('pointerover', e => { const el = e.target.closest && e.target.closest('.glo'); if (el && !el._glh) { el._glh = true; kick(120); } }, true);
    document.addEventListener('pointerout', e => { const el = e.target.closest && e.target.closest('.glo'); if (el && el._glh && !el.contains(e.relatedTarget)) { el._glh = false; kick(120); } }, true);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(300); });
    if (window.MutationObserver) {
      mo = new MutationObserver(muts => {
        for (let i = 0; i < muts.length; i++) { const t = muts[i].target; if (t && t.id === 'glc') continue; scanDirty = true; break; }
        if (scanDirty) kick(900);
      });
      mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    }
  }

  // Wallpaper bertekstur: mode shader + palet [c0..c3, dasar] per tema
  const WALLS = {
    silk: { mode: 1, light: ['#ef5b3c', '#3557d6', '#ff9a6b', '#ffd2c2', '#f3e3dc'], dark: ['#c2301b', '#16309e', '#e5602d', '#5a1a14', '#12081a'] },
    pool: { mode: 2, light: ['#1c8fe3', '#4fc2f5', '#0f63c4', '#e9f7ff', '#bfe8ff'], dark: ['#0b5fb6', '#1f8ed6', '#063f86', '#9fd8f5', '#02223f'] },
    ribbons: { mode: 3, light: ['#8b5cff', '#3d7bff', '#ff8a3d', '#ff5fa8', '#eef0fb'], dark: ['#7b3cff', '#2d5bff', '#ff7a2f', '#d23fc8', '#090717'] }
  };
  /** Palet untuk wallpaper; wallpaper lama (aurora, senja, …) memakai warna variabel CSS-nya. */
  function palette(wall, dark) {
    const w = WALLS[wall];
    if (w) return { mode: w.mode, colors: dark ? w.dark : w.light };
    const cs = getComputedStyle(document.documentElement), v = k => (cs.getPropertyValue(k) || '').trim() || '#888888';
    return { mode: 0, colors: [v('--w1'), v('--w2'), v('--w3'), v('--w4'), v('--w-base')] };
  }

  window.GlassGL = {
    init: init,
    walls: WALLS,
    palette: palette,
    get ok() { return ok; },
    get active() { return ok && on; },
    get frames() { return frames; },
    /** wall: nama wallpaper; colors: [c0..c4]; dark, motion, enabled */
    config(o) {
      if (!ok) return;
      const prevMotion = cfg.motion;
      cfg = Object.assign({}, cfg, o);
      on = !!o.enabled;
      document.documentElement.classList.toggle('glr', ok);
      document.documentElement.classList.toggle('glon', on);
      if (prevMotion !== cfg.motion) { bw = 0; if (W) buffers(); }
      bgDirty = true; scanDirty = true;
      if (!on) { els.forEach(el => { if (el.classList.contains('glo')) el.classList.remove('glo'); }); els = []; }
      kick(400);
    },
    refresh() { scanDirty = true; kick(900); },
    /** Gambar kecil wallpaper (untuk pilihan di Profil). */
    thumb(mode, colors, dark, w, h) {
      if (!ok) return '';
      try {
        const keep = cfg, kw = bw, kh = bh, ks = bgScale;
        const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
        cfg = Object.assign({}, cfg, { mode: mode, colors: colors, dark: dark });
        const [t, f] = target(w, h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.viewport(0, 0, w, h); gl.disable(gl.BLEND);
        gl.useProgram(pBg.p); const u = pBg.u;
        gl.uniform2f(u.uRes, w * 4, h * 4); gl.uniform1f(u.uTime, 3); gl.uniform1f(u.uMode, mode); gl.uniform1f(u.uDark, dark ? 1 : 0); gl.uniform1f(u.uScale, .4);
        ['uC0', 'uC1', 'uC2', 'uC3', 'uC4'].forEach((k, i) => v3(u[k], colors[i] || '#888888'));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        drop([t, f]);
        const x = c2.getContext('2d'), img = x.createImageData(w, h);
        for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
        x.putImageData(img, 0, 0);
        cfg = keep; bw = kw; bh = kh; bgScale = ks; bgDirty = true; kick(100);
        return c2.toDataURL('image/jpeg', .82);
      } catch (e) { return ''; }
    }
  };
})();
