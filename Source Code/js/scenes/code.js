/* ============================================================================
   Scene 2 - CODE: windows of syntax-coloured code flying toward you.
   Each window gets a random snippet whenever it goes round again; one window at a time is typed out live.
   Syntax colours lean toward the current theme. Your own snippets: snippets.js (see snippets.example.js).
   ========================================================================== */
'use strict';

const SNIPPETS = [
  {
    file: 'partition.c',
    badge: 'c',
    cmt: '//',
    code: [
      'static int partition(int *a, int lo, int hi) {',
      '    int pivot = a[hi];',
      '    int i = lo - 1;',
      '    for (int j = lo; j < hi; j++) {',
      '        if (a[j] <= pivot) {',
      '            i++;',
      '            swap(&a[i], &a[j]);',
      '        }',
      '    }',
      '    swap(&a[i + 1], &a[hi]);',
      '    return i + 1;',
      '}'
    ]
  },
  {
    file: 'dijkstra.py',
    badge: 'py',
    cmt: '#',
    code: [
      'import heapq',
      '',
      'def dijkstra(graph, src):',
      '    dist = {v: float("inf") for v in graph}',
      '    dist[src] = 0',
      '    heap = [(0, src)]',
      '    while heap:',
      '        d, u = heapq.heappop(heap)',
      '        if d > dist[u]:',
      '            continue',
      '        for v, w in graph[u]:',
      '            if d + w < dist[v]:',
      '                dist[v] = d + w',
      '                heapq.heappush(heap, (dist[v], v))',
      '    return dist'
    ]
  },
  {
    file: 'counter.v',
    badge: 'v',
    cmt: '//',
    code: [
      'module counter #(parameter W = 8)(',
      '    input  wire         clk,',
      '    input  wire         rst_n,',
      '    input  wire         en,',
      '    output reg [W-1:0]  q',
      ');',
      '    always @(posedge clk or negedge rst_n) begin',
      '        if (!rst_n)  q <= 0;',
      '        else if (en) q <= q + 1;',
      '    end',
      'endmodule'
    ]
  },
  {
    file: 'gcd.asm',
    badge: 'chip',
    cmt: ';',
    code: [
      'gcd:',
      '    test    rsi, rsi',
      '    jz      .done',
      '.loop:',
      '    xor     rdx, rdx',
      '    div     rsi',
      '    mov     rax, rsi',
      '    mov     rsi, rdx',
      '    test    rsi, rsi',
      '    jnz     .loop',
      '.done:',
      '    ret          ; result in rax'
    ]
  },
  {
    file: 'bst.js',
    badge: 'js',
    cmt: '//',
    code: [
      'class Node {',
      '  constructor(k) { this.k = k; this.l = null; this.r = null; }',
      '}',
      '',
      'function insert(root, k) {',
      '  if (!root) return new Node(k);',
      '  if (k < root.k) root.l = insert(root.l, k);',
      '  else            root.r = insert(root.r, k);',
      '  return root;',
      '}',
      '',
      '// O(log n) average, O(n) worst case'
    ]
  },
  {
    file: 'binsearch.c',
    badge: 'c',
    cmt: '//',
    code: [
      'int bsearch_i(const int *a, int n, int key) {',
      '    int lo = 0, hi = n - 1;',
      '    while (lo <= hi) {',
      '        int mid = lo + (hi - lo) / 2;',
      '        if (a[mid] == key) return mid;',
      '        if (a[mid] <  key) lo = mid + 1;',
      '        else               hi = mid - 1;',
      '    }',
      '    return -1;',
      '}'
    ]
  },
  {
    file: 'main.rs',
    badge: 'rs',
    cmt: '//',
    code: [
      'fn fib(n: u64) -> u64 {',
      '    match n {',
      '        0 | 1 => n,',
      '        _ => fib(n - 1) + fib(n - 2),',
      '    }',
      '}',
      '',
      'fn main() {',
      '    let v: Vec<u64> = (0..10).map(fib).collect();',
      '    println!("{:?}", v);',
      '}'
    ]
  },
  {
    file: 'users.sql',
    badge: 'sql',
    cmt: '--',
    code: [
      'SELECT u.name, COUNT(o.id) AS orders',
      'FROM users u',
      'LEFT JOIN orders o ON o.user_id = u.id',
      'WHERE u.active = 1',
      'GROUP BY u.name',
      'HAVING COUNT(o.id) > 3',
      'ORDER BY orders DESC',
      'LIMIT 10;'
    ]
  }
];
const KW = new Set([
  'static',
  'for',
  'if',
  'return',
  'import',
  'def',
  'while',
  'continue',
  'module',
  'always',
  'begin',
  'end',
  'else',
  'endmodule',
  'class',
  'function',
  'new',
  'from',
  'in',
  'fn',
  'match',
  'let',
  'select',
  'where',
  'group',
  'by',
  'having',
  'order',
  'limit',
  'left',
  'join',
  'on',
  'as',
  'count',
  'this',
  'constructor',
  'const',
  'input',
  'output',
  'parameter',
  'posedge',
  'negedge',
  'test',
  'jz',
  'jnz',
  'xor',
  'mov',
  'div',
  'ret',
  'func',
  'package',
  'public',
  'private',
  'protected',
  'struct',
  'impl',
  'pub',
  'use',
  'mut',
  'async',
  'await',
  'try',
  'catch',
  'except',
  'finally',
  'with',
  'yield',
  'lambda',
  'var',
  'export',
  'default',
  'switch',
  'case',
  'break',
  'throw',
  'raise',
  'interface',
  'type',
  'enum',
  'elif',
  'not',
  'and',
  'or',
  'is',
  'of',
  'do',
  'then',
  'local',
  'extends',
  'implements',
  'defer',
  'go',
  'loop',
  'pass',
  'global',
  'namespace',
  'using',
  'template',
  'typename',
  'include',
  'define'
]);
const TYPES = new Set([
  'int',
  'float',
  'char',
  'void',
  'u64',
  'Vec',
  'reg',
  'wire',
  'Node',
  'bool',
  'string',
  'String',
  'str',
  'double',
  'long',
  'short',
  'usize',
  'i32',
  'i64',
  'u8',
  'u32',
  'f32',
  'f64',
  'auto',
  'byte'
]);
const LIT = new Set(['null', 'true', 'false', 'None', 'self', 'nil', 'undefined', 'True', 'False', 'NULL', 'nullptr']);
const REGS = new Set(['rax', 'rdx', 'rsi', 'rdi', 'rbx', 'rcx']);
const SYN = {
  kw: '#b69cf2',
  type: '#e3c07a',
  fn: '#7db4f0',
  str: '#9ccf7e',
  num: '#eaa46b',
  cmt: '#5d6c82',
  pun: '#8794a8',
  id: '#d5dde9',
  lit: '#eaa46b',
  reg: '#eaa46b',
  ln: '#415067'
};
/* how much each syntax colour leans toward the theme's accent (Ice, Amber, ...) */
const SYN_TINT = {
  kw: 0.55,
  type: 0.35,
  fn: 0.45,
  str: 0.25,
  num: 0.25,
  cmt: 0.2,
  pun: 0.15,
  id: 0.1,
  lit: 0.25,
  reg: 0.25,
  ln: 0.25
};
function syntaxColors() {
  const out = {},
    c = new THREE.Color();
  for (const k in SYN) out[k] = '#' + c.set(SYN[k]).lerp(cA, SYN_TINT[k]).getHexString();
  return out;
}

/* ───────────── your own snippets (optional) ─────────────
   Put a snippets.js next to index.html (copy snippets.example.js): window.CS_SNIPPETS = [{ file: 'name.ext', code: '...' }].
   The extension picks the comment style and the badge. */
const EXT_INFO = {
  // extension -> [comment marker, badge]
  c: ['//', 'c'],
  h: ['//', 'c'],
  cpp: ['//', 'c'],
  cc: ['//', 'c'],
  hpp: ['//', 'c'],
  cs: ['//', 'c#'],
  java: ['//', 'java'],
  js: ['//', 'js'],
  mjs: ['//', 'js'],
  jsx: ['//', 'js'],
  ts: ['//', 'ts'],
  tsx: ['//', 'ts'],
  rs: ['//', 'rs'],
  go: ['//', 'go'],
  swift: ['//', 'swift'],
  kt: ['//', 'kt'],
  dart: ['//', 'dart'],
  php: ['//', 'php'],
  v: ['//', 'v'],
  sv: ['//', 'v'],
  py: ['#', 'py'],
  rb: ['#', 'rb'],
  sh: ['#', 'sh'],
  ps1: ['#', 'ps'],
  r: ['#', 'r'],
  jl: ['#', 'jl'],
  sql: ['--', 'sql'],
  lua: ['--', 'lua'],
  hs: ['--', 'hs'],
  asm: [';', 'chip'],
  s: [';', 'chip']
};
function addSnippets(list) {
  if (!Array.isArray(list)) return;
  list.forEach(s => {
    if (!s || typeof s.file !== 'string') return;
    let code = Array.isArray(s.code) ? s.code.map(String) : typeof s.code === 'string' ? s.code.split(/\r?\n/) : [];
    code = code.map(l => l.replace(/\t/g, '    ').replace(/\s+$/, ''));
    while (code.length && !code[0]) code.shift();
    while (code.length && !code[code.length - 1]) code.pop();
    if (!code.length) return;
    const ext = (s.file.split('.').pop() || '').toLowerCase(),
      info = EXT_INFO[ext] || ['//', ext.slice(0, 4)];
    SNIPPETS.push({
      file: s.file.slice(0, 40),
      badge: s.badge || info[1] || null,
      cmt: s.comment || info[0],
      code: code.slice(0, 18)
    });
  });
}
(function loadUserSnippets() {
  const el = document.createElement('script');
  el.src = 'snippets.js';
  el.onload = () => {
    el.remove();
    try {
      addSnippets(window.CS_SNIPPETS);
    } catch (e) {}
  };
  el.onerror = () => el.remove(); // no snippets.js: only the built-in ones
  document.head.appendChild(el);
})();

function drawBadge(x, kind, cx, cy, s, col) {
  x.save();
  x.translate(cx, cy);
  x.strokeStyle = col;
  x.fillStyle = col;
  x.lineWidth = 2.4;
  x.lineJoin = 'round';
  x.lineCap = 'round';
  x.font = '700 ' + Math.round(s * 0.62) + 'px ui-monospace, Consolas, "DejaVu Sans Mono", monospace';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const soft = () => {
    x.globalAlpha = 0.16;
    x.fill();
    x.globalAlpha = 1;
    x.stroke();
  };
  if (kind === 'c') {
    x.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      x[i ? 'lineTo' : 'moveTo'](Math.cos(a) * s * 0.62, Math.sin(a) * s * 0.62);
    }
    x.closePath();
    soft();
    x.fillText('C', 0, 2);
  } else if (kind === 'py') {
    x.beginPath();
    x.arc(0, 0, s * 0.6, 0, 6.2832);
    soft();
    x.fillText('py', 0, 2);
  } else if (kind === 'js') {
    x.beginPath();
    x.rect(-s * 0.55, -s * 0.55, s * 1.1, s * 1.1);
    soft();
    x.fillText('JS', 0, 2);
  } else if (kind === 'rs') {
    x.beginPath();
    x.arc(0, 0, s * 0.6, 0, 6.2832);
    x.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      x.beginPath();
      x.moveTo(Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6);
      x.lineTo(Math.cos(a) * s * 0.78, Math.sin(a) * s * 0.78);
      x.stroke();
    }
    x.fillText('Rs', 0, 2);
  } else if (kind === 'chip') {
    const r = s * 0.42;
    x.strokeRect(-r, -r, r * 2, r * 2);
    x.globalAlpha = 0.16;
    x.fillRect(-r, -r, r * 2, r * 2);
    x.globalAlpha = 1;
    for (let i = -1; i <= 1; i++) {
      x.beginPath();
      x.moveTo(i * r * 0.6, -r);
      x.lineTo(i * r * 0.6, -r - s * 0.2);
      x.moveTo(i * r * 0.6, r);
      x.lineTo(i * r * 0.6, r + s * 0.2);
      x.moveTo(-r, i * r * 0.6);
      x.lineTo(-r - s * 0.2, i * r * 0.6);
      x.moveTo(r, i * r * 0.6);
      x.lineTo(r + s * 0.2, i * r * 0.6);
      x.stroke();
    }
  } else if (kind === 'v') {
    const r = s * 0.66;
    x.beginPath();
    x.moveTo(0, -r);
    x.lineTo(r, 0);
    x.lineTo(0, r);
    x.lineTo(-r, 0);
    x.closePath();
    soft();
    x.fillText('V', 0, 2);
  } // Verilog: a diamond
  else if (kind === 'sql') {
    // SQL: a database cylinder
    const w = s * 0.55,
      h = s * 0.5,
      e = s * 0.16;
    x.beginPath();
    x.ellipse(0, -h, w, e, 0, 0, 6.2832);
    soft();
    x.beginPath();
    x.moveTo(-w, -h);
    x.lineTo(-w, h);
    x.ellipse(0, h, w, e, 0, Math.PI, 0, true);
    x.lineTo(w, -h);
    x.stroke();
    x.beginPath();
    x.ellipse(0, 0, w, e, 0, 0, Math.PI);
    x.stroke();
  } else if (kind) {
    // anything else: the name in a rounded box
    const t = String(kind).toUpperCase().slice(0, 4),
      w = s * (0.42 + 0.17 * t.length),
      h = s * 0.55;
    if (t.length > 2)
      x.font =
        '700 ' +
        Math.round(s * (t.length > 3 ? 0.42 : 0.5)) +
        'px ui-monospace, Consolas, "DejaVu Sans Mono", monospace';
    x.beginPath();
    x.moveTo(-w + 8, -h);
    x.arcTo(w, -h, w, h, 8);
    x.arcTo(w, h, -w, h, 8);
    x.arcTo(-w, h, -w, -h, 8);
    x.arcTo(-w, -h, w, -h, 8);
    x.closePath();
    soft();
    x.fillText(t, 0, 2);
  }
  x.restore();
}

/* where a line comment starts, ignoring markers inside "..." or '...' (so "http://x" is not a comment) */
function commentAt(line, cmt) {
  let q = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '\\') i++;
      else if (ch === q) q = '';
    } else if (ch === '"' || ch === "'") q = ch;
    else if (line.startsWith(cmt, i)) return i;
  }
  return -1;
}
function snippetChars(sn) {
  return sn.code.reduce((n, l) => n + l.length + 1, 0);
} // +1: a short pause at each line end

/* Draws a code window onto canvas `c` (1024 x 640). upto = how many characters are typed so far (Infinity = all),
   cursor = draw the blinking block cursor after the last typed character. */
const PANEL_W = 1024;
const PANEL_H = 640;
function drawPanel(sn, c, upto, cursor) {
  const W = PANEL_W,
    H = PANEL_H,
    x = c.getContext('2d');
  const hex = col => '#' + col.getHexString();
  const rgb = [cA.r, cA.g, cA.b].map(v => Math.round(v * 255)).join(',');
  const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';
  const C = syntaxColors();
  x.clearRect(0, 0, W, H);
  x.fillStyle = 'rgba(9,13,20,0.86)';
  x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(' + rgb + ',0.30)';
  x.lineWidth = 2;
  x.strokeRect(1, 1, W - 2, H - 2);
  /* title bar */
  x.fillStyle = 'rgba(255,255,255,0.035)';
  x.fillRect(2, 2, W - 4, 78);
  [0, 1, 2].forEach(i => {
    x.beginPath();
    x.arc(46 + i * 26, 41, 7, 0, 6.2832);
    x.fillStyle = 'rgba(255,255,255,' + (0.16 - i * 0.03) + ')';
    x.fill();
  });
  x.textBaseline = 'alphabetic';
  x.textAlign = 'left';
  x.font = '500 20px ' + MONO;
  x.fillStyle = hex(cA);
  x.globalAlpha = 0.9;
  x.fillText(sn.file, 148, 48);
  x.globalAlpha = 1;
  if (sn.badge) drawBadge(x, sn.badge, W - 62, 41, 30, hex(cA));
  x.fillStyle = 'rgba(255,255,255,0.07)';
  x.fillRect(2, 80, W - 4, 1);
  /* code: line spacing shrinks for long snippets so the last line stays inside the window */
  const n = sn.code.length,
    lh = Math.min(38, n > 1 ? (H - 22 - 130) / (n - 1) : 38),
    fs = Math.min(25, Math.round(lh * 0.68));
  x.font = fs + 'px ' + MONO;
  const cw = x.measureText('M').width,
    maxCh = Math.floor((W - 100 - 24) / cw);
  const re = /("[^"]*")|(\b\d+\b)|([A-Za-z_.@][\w.]*)|(\s+)|(.)/g;
  let left = upto === undefined ? Infinity : upto,
    curX = -1,
    curY = -1;
  for (let i = 0; i < n && left > 0; i++) {
    let line = sn.code[i];
    if (line.length > maxCh) line = line.slice(0, maxCh - 1) + '…';
    const shown = line.slice(0, Math.max(0, left));
    left -= line.length + 1;
    const y = 130 + i * lh;
    x.fillStyle = C.ln;
    x.fillText(String(i + 1).padStart(2, ' '), 40, y);
    let cx = 100;
    const ci = commentAt(shown, sn.cmt);
    const code = ci >= 0 ? shown.slice(0, ci) : shown,
      comment = ci >= 0 ? shown.slice(ci) : '';
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(code))) {
      const tok = m[0];
      if (m[4]) {
        cx += tok.length * cw;
        continue;
      }
      if (m[1]) x.fillStyle = C.str;
      else if (m[2]) x.fillStyle = C.num;
      else if (m[3]) {
        const low = tok.toLowerCase(),
          next = code[re.lastIndex];
        if (KW.has(tok) || (sn.cmt === '--' && KW.has(low))) x.fillStyle = C.kw;
        else if (TYPES.has(tok)) x.fillStyle = C.type;
        else if (LIT.has(tok)) x.fillStyle = C.lit;
        else if (REGS.has(tok)) x.fillStyle = C.reg;
        else if (next === '(' || (sn.file.endsWith('.asm') && next === ':')) x.fillStyle = C.fn;
        else if (/^[A-Z]/.test(tok)) x.fillStyle = C.type;
        else x.fillStyle = C.id;
      } else x.fillStyle = C.pun;
      x.fillText(tok, cx, y);
      cx += tok.length * cw;
    }
    if (comment) {
      x.font = 'italic ' + fs + 'px ' + MONO;
      x.fillStyle = C.cmt;
      x.fillText(comment, cx, y);
      x.font = fs + 'px ' + MONO;
      cx += comment.length * cw;
    }
    curX = cx;
    curY = y;
  }
  if (cursor) {
    if (curY < 0) {
      curX = 100;
      curY = 130;
    }
    x.fillStyle = hex(cA);
    x.globalAlpha = 0.85;
    x.fillRect(curX + 2, curY - fs * 0.82, cw * 0.62, fs * 1.02);
    x.globalAlpha = 1;
  }
  return c;
}
function panelTexture(c) {
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; // mipmaps: small, far windows stay calm instead of shimmering
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function buildCode() {
  const g = new THREE.Group();
  const rnd = mulberry32(77);
  const NP = 18,
    DEPTH = 92,
    PW = 8.4,
    PH = 5.25;
  const geo = new THREE.PlaneGeometry(PW, PH);
  const panels = [];

  /* one texture per snippet, shared by the windows showing it (rebuilt when the theme changes) */
  let cache = {};
  const texFor = k => cache[k] || (cache[k] = panelTexture(drawPanel(SNIPPETS[k], makeCanvas(PANEL_W, PANEL_H))));

  /* random snippet for a window, avoiding the last few picks so the same code does not appear twice in a row */
  const recent = [];
  function pickSnippet() {
    const n = SNIPPETS.length,
      avoid = Math.min(4, n - 1);
    let k,
      tries = 0;
    do {
      k = Math.floor(Math.random() * n);
    } while (recent.includes(k) && ++tries < 20);
    recent.push(k);
    while (recent.length > avoid) recent.shift();
    return k;
  }

  for (let i = 0; i < NP; i++) {
    const a = i * 2.399963,
      r = 7.2 + ((i * 7) % 5) * 1.45;
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: true }); // front side only: the windows never turn around
    const m = new THREE.Mesh(geo, mat);
    const x = Math.cos(a) * r * 1.38,
      y = Math.sin(a) * r * 0.64;
    m.position.set(x, y, -(i / NP) * DEPTH);
    m.rotation.y = -Math.sign(x || 1) * 0.4;
    m.rotation.x = Math.sign(y || 1) * 0.12;
    m.userData.sn = pickSnippet();
    m.userData.bx = x;
    m.userData.by = y;
    mat.map = texFor(m.userData.sn);
    g.add(m);
    panels.push(m);
  }

  /* the "typing" window: one window at a time is typed out character by character with a blinking cursor.
     It gets its own canvas; typing starts when it is close enough to read and ends well before it reaches you. */
  const TYPE_FROM = 62,
    TYPE_UNTIL = 18; // depth range (distance ahead) in which the code is typed
  let typer = null,
    typerFreeAt = 0;
  function startTyper(p) {
    const c = makeCanvas(PANEL_W, PANEL_H),
      sn = SNIPPETS[p.userData.sn];
    typer = {
      p,
      sn,
      c,
      tex: panelTexture(drawPanel(sn, c, 0, true)),
      chars: 0,
      total: snippetChars(sn),
      shown: -1,
      blink: true,
      drawT: 0
    };
    p.material.map = typer.tex;
    p.material.needsUpdate = true;
  }
  function stopTyper(t) {
    if (!typer) return;
    typer.tex.dispose();
    typer = null;
    typerFreeAt = t + 1.5;
  }
  function updateTyper(t, dt, sp) {
    const T = typer,
      depth = -T.p.position.z;
    if (depth < TYPE_FROM) {
      // close enough: type so that it is finished by TYPE_UNTIL
      const rate = T.total / Math.max(3, (TYPE_FROM - TYPE_UNTIL) / Math.max(0.1, sp));
      T.chars = Math.min(T.total, T.chars + rate * dt);
    }
    T.drawT -= dt;
    const shown = Math.floor(T.chars),
      blink = T.chars < T.total || Math.sin(t * 6.3) > 0; // solid while typing, blinks when done
    if (T.drawT <= 0 && (shown !== T.shown || blink !== T.blink)) {
      T.shown = shown;
      T.blink = blink;
      T.drawT = 0.09; // at most ~11 redraws a second
      drawPanel(T.sn, T.c, shown, blink);
      T.tex.needsUpdate = true;
    }
  }

  function retex() {
    const old = cache;
    cache = {};
    panels.forEach(p => {
      if (!typer || p !== typer.p) {
        p.material.map = texFor(p.userData.sn);
        p.material.needsUpdate = true;
      }
    });
    for (const k in old) old[k].dispose();
    if (typer) {
      typer.shown = -1;
      typer.drawT = 0;
    }
  }

  /* speed streaks */
  const SN = 150,
    sPos = new Float32Array(SN * 2 * 3),
    sZ = new Float32Array(SN * 2),
    sU = new Float32Array(SN * 2),
    sA = new Float32Array(SN * 2);
  for (let i = 0; i < SN; i++) {
    const a = rnd() * 6.2832,
      r = 3.5 + Math.pow(rnd(), 0.7) * 17,
      z0 = rnd() * DEPTH,
      al = 0.25 + rnd() * 0.6;
    for (let k = 0; k < 2; k++) {
      const j = i * 2 + k;
      sPos[j * 3] = Math.cos(a) * r * 1.3;
      sPos[j * 3 + 1] = Math.sin(a) * r * 0.75;
      sPos[j * 3 + 2] = 0;
      sZ[j] = z0;
      sU[j] = k;
      sA[j] = al;
    }
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sGeo.setAttribute('aZ', new THREE.BufferAttribute(sZ, 1));
  sGeo.setAttribute('aU', new THREE.BufferAttribute(sU, 1));
  sGeo.setAttribute('aA', new THREE.BufferAttribute(sA, 1));
  const sMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: cA },
      uTime: { value: 0 },
      uSpeed: { value: 8 },
      uDepth: { value: DEPTH },
      uFog: U.uFog
    }, // uSpeed: streak speed at animation speed 1
    vertexShader:
      'attribute float aZ; attribute float aU; attribute float aA; uniform float uTime,uSpeed,uDepth; varying float vD; varying float vA; varying float vU;' +
      'void main(){ float z=mod(aZ+uTime*uSpeed,uDepth)-uDepth+6.; z-=aU*4.5; vec4 mv=modelViewMatrix*vec4(position.xy,z,1.); vD=-mv.z; vA=aA; vU=aU; gl_Position=projectionMatrix*mv; }',
    fragmentShader:
      'uniform vec3 uColor; uniform float uFog; varying float vD; varying float vA; varying float vU;' +
      'void main(){ float f=exp(-vD*vD*uFog*uFog); float near=smoothstep(1.5,9.,vD); gl_FragColor=vec4(uColor, (1.-vU)*vA*0.9*f*near); }',
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const streaks = new THREE.LineSegments(sGeo, sMat);
  streaks.frustumCulled = false;
  g.add(streaks);

  /* floating motes */
  const MN = 320,
    mG = pointsGeo(MN);
  const mp = mG.attributes.position.array,
    ms = mG.attributes.aSize.array,
    ma = mG.attributes.aAlpha.array;
  for (let i = 0; i < MN; i++) {
    const a = rnd() * 6.2832,
      r = 2 + rnd() * 20;
    mp[i * 3] = Math.cos(a) * r * 1.4;
    mp[i * 3 + 1] = Math.sin(a) * r * 0.8;
    mp[i * 3 + 2] = -rnd() * DEPTH;
    ms[i] = 0.04 + rnd() * 0.07;
    ma[i] = 0.25 + rnd() * 0.5;
  }
  g.add(new THREE.Points(mG, pointMat(PF_GLOW, cB)));

  return {
    group: g,
    fov: 58,
    fog: 0.013,
    onPalette() {
      retex();
    },
    dispose() {
      for (const k in cache) cache[k].dispose();
      cache = {};
      if (typer) {
        typer.tex.dispose();
        typer = null;
      }
    }, // textures not on a window right now
    update(t, dt) {
      const sp = 3.2 * speedMul;
      panels.forEach(p => {
        p.position.z += sp * dt;
        if (p.position.z > 4) {
          // passed the camera: back to the far end with new code
          p.position.z -= DEPTH;
          if (typer && typer.p === p) stopTyper(t);
          p.userData.sn = pickSnippet();
          if (!typer && t >= typerFreeAt) startTyper(p);
          else {
            p.material.map = texFor(p.userData.sn);
            p.material.needsUpdate = true;
          }
        }
        const depth = -p.position.z,
          k = 1 + 0.9 * smooth(0, 1, depth / DEPTH);
        p.position.x = p.userData.bx * k;
        p.position.y = p.userData.by * k;
        p.material.opacity = smooth(2.5, 9, depth) * (1 - smooth(DEPTH * 0.82, DEPTH, depth));
      });
      if (typer) updateTyper(t, dt, sp);
      for (let i = 0; i < MN; i++) {
        mp[i * 3 + 2] += sp * 1.6 * dt;
        if (mp[i * 3 + 2] > 4) mp[i * 3 + 2] -= DEPTH;
      }
      mG.attributes.position.needsUpdate = true;
      sMat.uniforms.uTime.value += dt * speedMul; // streaks move uSpeed / 3.2 times as fast as the windows, at any animation speed
      camera.position.set(mx * 0.9, -my * 0.6, 0);
      camera.lookAt(mx * 2.2, -my * 1.4, -20);
    }
  };
}
