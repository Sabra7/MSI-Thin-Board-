/* ============================================================================
   Scene 1 - REPOS: your GitHub projects as a living graph (colour = language, ring = private repo).
   Data, best first:
     1. repos.js written by the helper (public + private/local repos) - window.REPOS_OWNER / window.REPOS_DATA
     2. the public GitHub API, for the "GitHub username" Lively setting (works without the helper)
     3. REPOS_DEFAULT below - made-up demo repos, shown until a username is set
   ========================================================================== */
'use strict';

/* demo data: pushed = days ago */
const REPOS_DEFAULT = [
  ['portfolio-site', 'Web', 1],
  ['dotfiles', 'Other', 3, true],
  ['pathfinding-visualizer', 'Web', 6],
  ['ml-notebooks', 'Python', 9],
  ['tiny-shell', 'C/C++', 14],
  ['discord-bot', 'Python', 20, true],
  ['data-structures', 'C/C++', 28],
  ['notes', 'Docs', 35, true],
  ['risc-v-cpu', 'Verilog', 50],
  ['web-scraper', 'Python', 70],
  ['chess-engine', 'Rust', 95],
  ['todo-api', 'Go', 140, true]
].map(([name, lang, days, priv]) => ({
  name,
  lang,
  isPrivate: !!priv,
  pushedAt: new Date(Date.now() - days * 864e5).toISOString()
}));

/* ───────────── GitHub account and data source ───────────── */
const GH_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
let ghUser = ''; // "GitHub username" Lively setting
let ghApi = null; // { owner, list } from the public API
let ghTimer = 0;
let ghRejected = 0; // GitHub error answers in a row; at 3 we stop asking until the username changes

/* called by ui/controls.js when the setting changes (Lively sends it while you type, so wait a moment) */
function setGithubUser(v) {
  const u = String(v || '')
    .trim()
    .replace(/^@/, '');
  clearTimeout(ghTimer);
  ghTimer = setTimeout(() => {
    const next = GH_NAME.test(u) ? u : '';
    if (next !== ghUser) {
      ghUser = next;
      ghRejected = 0;
    }
    syncGithubUser();
    fetchGithubRepos();
    if (window.__csReposLoaded) window.__csReposLoaded();
  }, 1200);
}

/* tells the helper which account to scan (through its local port, with the key from load.js) */
let ghSent = '';
function syncGithubUser() {
  const k = LOAD.x && LOAD.x.k;
  if (!k || ghSent === k + '|' + ghUser) return;
  ghSent = k + '|' + ghUser;
  new Image().src =
    'http://127.0.0.1:' +
    HELPER_PORT +
    '/user?k=' +
    encodeURIComponent(k) +
    '&u=' +
    encodeURIComponent(ghUser) +
    '&_=' +
    Date.now();
}

/* public repos straight from GitHub (no token: 60 requests / hour, so the answer is cached for 30 minutes) */
function fetchGithubRepos() {
  const u = ghUser;
  if (!u) {
    ghApi = null;
    return;
  }
  const ck = 'cswRepos:' + u.toLowerCase();
  try {
    const c = JSON.parse(localStorage.getItem(ck) || 'null');
    if (c && Date.now() - c.at < 30 * 60e3) {
      ghApi = { owner: u, list: c.list };
      return;
    }
  } catch (e) {}
  if (ghRejected >= 3) return;
  fetch('https://api.github.com/users/' + u + '/repos?per_page=100&sort=pushed', {
    headers: { Accept: 'application/vnd.github+json' }
  })
    .then(r => {
      // GitHub answered with an error (404, 403 rate limit...): count it. Offline = fetch() throws: not counted.
      if (!r.ok) {
        if (u === ghUser) ghRejected++;
        return Promise.reject(r.status);
      }
      return r.json();
    })
    .then(arr => {
      if (u !== ghUser || !Array.isArray(arr)) return;
      ghRejected = 0;
      const list = arr.map(r => ({
        name: r.name,
        isPrivate: false,
        pushedAt: r.pushed_at,
        lang: r.language,
        diskUsage: r.size
      }));
      ghApi = { owner: u, list };
      try {
        localStorage.setItem(ck, JSON.stringify({ at: Date.now(), list }));
      } catch (e) {}
      if (window.__csReposLoaded) window.__csReposLoaded();
    })
    .catch(() => {});
}
setInterval(fetchGithubRepos, 31 * 60e3);

/* what the scene shows right now: { owner, list, demo } */
function reposSource() {
  const hOwner = String(window.REPOS_OWNER || ''),
    hList = Array.isArray(window.REPOS_DATA) ? window.REPOS_DATA : [];
  if (hList.length && (!ghUser || hOwner.toLowerCase() === ghUser.toLowerCase()))
    return { owner: hOwner, list: hList, demo: false };
  if (ghApi && ghApi.owner === ghUser && ghApi.list.length) return { owner: ghUser, list: ghApi.list, demo: false };
  return { owner: ghUser, list: REPOS_DEFAULT, demo: true };
}
const LANG_COL = {
  Python: '#7db4f0',
  Web: '#eaa46b',
  'C/C++': '#b69cf2',
  Docs: '#9ccf7e',
  Other: '#8794a8',
  Rust: '#e08f6e',
  Java: '#e3c07a',
  Go: '#6fd3d0',
  Verilog: '#d98fc2'
};
function langGroup(l) {
  if (!l) return 'Other';
  const t = String(l);
  if (/^(JavaScript|TypeScript|HTML|CSS|Vue|Svelte|PHP|Web)$/.test(t)) return 'Web';
  if (/^(C|C\+\+|C#|C\/C\+\+|Objective-C)$/.test(t)) return 'C/C++';
  if (/^(Markdown|Docs|TeX)$/.test(t)) return 'Docs';
  if (t === 'Jupyter Notebook') return 'Python';
  return LANG_COL[t] ? t : 'Other';
}
let showPrivNames = params.has('pn') ? params.get('pn') === '1' : true;
function buildRepos() {
  const g = new THREE.Group(),
    V = THREE.Vector3,
    rnd = mulberry32(2026);
  const src = reposSource(),
    raw = src.list.slice(0, 60);
  const now = Date.now();
  const R = raw.map((r, i) => {
    const lang = langGroup(r.lang || (r.primaryLanguage && r.primaryLanguage.name));
    const days = Math.max(0, (now - Date.parse(r.pushedAt || r.pushed_at || now)) / 864e5);
    return {
      name: r.name,
      priv: !!(r.isPrivate || r.private),
      lang,
      days,
      act: Math.exp(-days / 25),
      size: r.diskUsage ? Math.sqrt(r.diskUsage) : 20 + ((i * 7) % 15),
      ph: rnd() * 6.28
    };
  });
  const n = R.length,
    langs = [...new Set(R.map(r => r.lang))];
  /* layout: one cluster per language on a ring, stale repos drift outward */
  const cen = {};
  langs.forEach((l, k) => {
    const a = (k / langs.length) * 6.2832 + 0.6;
    cen[l] = new V(Math.cos(a) * 9.5, (rnd() - 0.5) * 5, Math.sin(a) * 6.5);
  });
  R.forEach(r => {
    const c = cen[r.lang],
      u = clamp(r.days / 120, 0, 1);
    r.p = c
      .clone()
      .multiplyScalar(0.55 + 0.7 * u)
      .add(new V((rnd() - 0.5) * 7, (rnd() - 0.5) * 6, (rnd() - 0.5) * 6));
  });
  for (let it = 0; it < 60; it++)
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const d = R[i].p.distanceTo(R[j].p);
        if (d < 3.6 && d > 1e-3) {
          const push = R[i].p
            .clone()
            .sub(R[j].p)
            .multiplyScalar(((3.6 - d) / d) * 0.5);
          R[i].p.add(push);
          R[j].p.sub(push);
        }
        if (R[i].p.length() < 4.5) R[i].p.setLength(4.5);
        if (R[j].p.length() < 4.5) R[j].p.setLength(4.5);
      }
  const root = new V(0, 0, 0);
  /* edges: root -> repo (dim), same-language chain (cool) */
  const eRoot = [],
    eLang = [];
  R.forEach(r => eRoot.push(0, 0, 0, r.p.x, r.p.y, r.p.z));
  langs.forEach(l => {
    const m = R.filter(r => r.lang === l);
    if (m.length < 2) return;
    const used = new Set([0]);
    let cur = m[0];
    while (used.size < m.length) {
      let best = null,
        bd = 1e9;
      m.forEach((q, qi) => {
        if (used.has(qi)) return;
        const d = cur.p.distanceTo(q.p);
        if (d < bd) {
          bd = d;
          best = qi;
        }
      });
      used.add(best);
      eLang.push(cur.p.x, cur.p.y, cur.p.z, m[best].p.x, m[best].p.y, m[best].p.z);
      cur = m[best];
    }
  });
  const mkLines = (arr, mat) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3));
    const l = new THREE.LineSegments(geo, mat);
    g.add(l);
    return l;
  };
  mkLines(eRoot, lineMat(cA, 0.2));
  mkLines(eLang, lineMat(cB, 0.32));
  /* faint orbit rings */
  [7, 12, 17].forEach(rad =>
    g.add(
      new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(
          Array.from(
            { length: 129 },
            (_, i) => new V(Math.cos((i / 128) * 6.2832) * rad * 1.0, 0, Math.sin((i / 128) * 6.2832) * rad * 0.85)
          )
        ),
        lineMat(cDim, 0.5)
      )
    )
  );
  /* repo nodes */
  const nG = new THREE.BufferGeometry();
  const aPos = new Float32Array(n * 3),
    aSz = new Float32Array(n),
    aCol = new Float32Array(n * 3),
    aAct = new Float32Array(n),
    aPr = new Float32Array(n),
    aPh = new Float32Array(n);
  R.forEach((r, i) => {
    const c = new THREE.Color(LANG_COL[r.lang] || LANG_COL.Other);
    aPos.set([r.p.x, r.p.y, r.p.z], i * 3);
    aCol.set([c.r, c.g, c.b], i * 3);
    aSz[i] = 0.95 + Math.min(0.7, r.size / 70);
    aAct[i] = r.act;
    aPr[i] = r.priv ? 1 : 0;
    aPh[i] = r.ph;
  });
  [
    ['position', aPos, 3],
    ['aSize', aSz, 1],
    ['aCol', aCol, 3],
    ['aAct', aAct, 1],
    ['aPr', aPr, 1],
    ['aPh', aPh, 1]
  ].forEach(([k, a, c]) => nG.setAttribute(k, new THREE.BufferAttribute(a, c)));
  const RU = { uT: { value: 0 }, uFog: U.uFog, uScale: U.uScale };
  g.add(
    new THREE.Points(
      nG,
      new THREE.ShaderMaterial({
        uniforms: RU,
        vertexShader:
          'attribute float aSize; attribute vec3 aCol; attribute float aAct; attribute float aPr; attribute float aPh; uniform float uT,uScale; varying vec3 vC; varying float vA; varying float vPr; varying float vD;' +
          'void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vD=-mv.z; vC=aCol; vPr=aPr; float pulse=.5+.5*sin(uT*2.2+aPh); vA=.62+aAct*(.25+.35*pulse); gl_PointSize=max(1.,aSize*(1.+aAct*.35*pulse)*uScale/vD); gl_Position=projectionMatrix*mv; }',
        fragmentShader:
          'uniform float uFog; varying vec3 vC; varying float vA; varying float vPr; varying float vD;' +
          'void main(){ vec2 p=gl_PointCoord-.5; float d=length(p)*2.; if(d>1.) discard; float f=exp(-vD*vD*uFog*uFog);' +
          ' float g=pow(1.-d,2.0); float core=smoothstep(.45,.0,d); float ring=smoothstep(.55,.66,d)*(1.-smoothstep(.80,.92,d));' +
          ' float pub=(g*.8+core*.9); float prv=ring*1.1+g*.25+core*.25; float a=mix(pub,prv,vPr)*vA; gl_FragColor=vec4(mix(vC,vec3(1.),core*.45*(1.-vPr)), a*f); }',
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    )
  );
  /* root */
  const rG = pointsGeo(1);
  rG.attributes.aSize.array[0] = 1.5;
  g.add(new THREE.Points(rG, pointMat(PF_GLOW, cA)));
  const rG2 = pointsGeo(1);
  rG2.attributes.aSize.array[0] = 2.2;
  rG2.attributes.aAlpha.array[0] = 0.7;
  g.add(new THREE.Points(rG2, pointMat(PF_RING, cA)));
  /* commit packets: recent repos send light from the root */
  const live = R.map((r, i) => i).filter(i => R[i].act > 0.08),
    PK = live.length * 2;
  const kG = pointsGeo(Math.max(1, PK)),
    kp = kG.attributes.position.array,
    kal = kG.attributes.aAlpha.array,
    ksz = kG.attributes.aSize.array;
  g.add(new THREE.Points(kG, pointMat(PF_GLOW, cB)));
  const packets = [];
  live.forEach(i => {
    for (let k = 0; k < 2; k++) packets.push({ i, per: 2.2 + 3.5 * (1 - R[i].act) + rnd(), off: rnd() * 6 });
  });
  /* dust */
  const DN = 160,
    dG = pointsGeo(DN),
    dp = dG.attributes.position.array,
    dsz = dG.attributes.aSize.array,
    dal = dG.attributes.aAlpha.array;
  for (let i = 0; i < DN; i++) {
    dp[i * 3] = (rnd() * 2 - 1) * 36;
    dp[i * 3 + 1] = (rnd() * 2 - 1) * 18;
    dp[i * 3 + 2] = (rnd() * 2 - 1) * 28 - 4;
    dsz[i] = 0.05 + rnd() * 0.08;
    dal[i] = 0.15 + rnd() * 0.3;
  }
  g.add(new THREE.Points(dG, pointMat(PF_GLOW, cB)));
  /* always-on name labels */
  const labels = [];
  R.forEach(r => {
    const txt = r.name.length > 22 ? r.name.slice(0, 21) + '…' : r.name;
    const c = makeCanvas(512, 64),
      x = c.getContext('2d');
    x.font = '600 30px ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace';
    x.textBaseline = 'middle';
    x.textAlign = 'center';
    x.fillStyle = r.priv ? 'rgba(200,212,228,0.72)' : 'rgba(236,242,250,0.95)';
    x.fillText(txt, 256, 34);
    const tx = new THREE.CanvasTexture(c);
    tx.minFilter = THREE.LinearFilter;
    tx.generateMipmaps = false;
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tx,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        fog: false,
        opacity: 0.8
      })
    );
    sp.scale.set(4.6, 0.575, 1);
    sp.position.copy(r.p).add(new V(0, -1.15, 0));
    sp.renderOrder = 5;
    g.add(sp);
    labels.push({ sp, r });
  });
  /* hover data */
  const ago = d =>
    d < 1
      ? 'today'
      : d < 2
        ? 'yesterday'
        : d < 30
          ? Math.floor(d) + ' days ago'
          : d < 365
            ? Math.floor(d / 30) + ' mo ago'
            : Math.floor(d / 365) + ' y ago';
  const hot = R.map(r => ({
    get n() {
      return r.priv && !showPrivNames ? 'private repo' : r.name;
    },
    f: () => r.lang + ' · ' + (r.priv ? 'private' : 'public') + ' · ' + ago(r.days),
    v: new V(),
    loc: r.p,
    r: 46
  }));
  hot.push(
    src.demo
      ? {
          n: 'GitHub · demo',
          f: () => (src.owner ? 'no repos yet for ' + src.owner : 'set your username in the Lively settings'),
          v: new V(),
          loc: root,
          r: 50
        }
      : { n: 'GitHub · ' + (src.owner || 'repos'), f: () => n + ' repos', v: new V(), loc: root, r: 50 }
  );
  return {
    group: g,
    fov: 38,
    fog: 0.009,
    update(t, dt) {
      RU.uT.value = t;
      g.rotation.y = t * 0.04 + mx * 0.3;
      g.rotation.x = 0.5 + my * 0.12;
      camera.position.set(0, 0, 27);
      camera.lookAt(0, 0, 0);
      packets.forEach((k, j) => {
        const u = ((t + k.off) % k.per) / k.per,
          e = u * u * (3 - 2 * u),
          p = R[k.i].p;
        kp[j * 3] = p.x * e;
        kp[j * 3 + 1] = p.y * e;
        kp[j * 3 + 2] = p.z * e;
        kal[j] = Math.sin(Math.PI * u) * (0.45 + 0.55 * R[k.i].act);
        ksz[j] = 0.3;
      });
      kG.attributes.position.needsUpdate = kG.attributes.aAlpha.needsUpdate = kG.attributes.aSize.needsUpdate = true;
      for (let i = 0; i < DN; i++) {
        dp[i * 3 + 1] += dt * 0.12 * speedMul;
        if (dp[i * 3 + 1] > 18) dp[i * 3 + 1] = -18;
      }
      dG.attributes.position.needsUpdate = true;
      labels.forEach(L => {
        L.sp.visible = !L.r.priv || showPrivNames;
      });
      g.updateMatrixWorld(true);
      hot.forEach(h => h.v.copy(h.loc).applyMatrix4(g.matrixWorld));
      hoverUpdate(hot, dt);
    }
  };
}
