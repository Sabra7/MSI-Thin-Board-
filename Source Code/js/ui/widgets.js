/* ============================================================================
   Widgets panel (the four squares above the bar). Opens with the ● button or the W key, only on the Board scene.
     1. Music     - song, cover, previous / play-pause / next
     2. Focus     - pomodoro timer
     3. System    - battery icon + RAM stick (one segment per GB)
     4. Network   - download / upload with a small graph, disk usage
   Numbers come from the helper (helper/cs-load.ps1) through __csWidgets(); nothing is drawn while the panel is closed.
   Uses the shared globals of the other scripts directly (sceneIdx, LOAD, poke, clamp, params, HELPER_PORT).
   ========================================================================== */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const panel = $('wg');
  const COL = { warn: '#ffc14d', bad: '#ff6b6b' }; // warning / danger colours

  /* ───────────── open / close ───────────── */
  const isOpen = () => panel.classList.contains('open');
  function setOpen(open) {
    panel.classList.toggle('open', open);
    document.body.classList.toggle('wopen', open); // keeps the bar visible while the panel is open
    const dot = $('sc').firstElementChild;
    if (dot) dot.classList.toggle('on', open);
    if (open) {
      poke();
      if (lastStats) drawStats(lastStats);
      drawPomodoro();
    }
    try {
      localStorage.setItem('cswOpen', open ? '1' : '0');
    } catch (e) {}
  }
  /* ● button: toggles on the Board scene, otherwise goes to Board and opens */
  const onBoard = () => sceneIdx === 0 && pending < 0; // settled on the Board scene
  const toBoard = () => (pending >= 0 ? pending : sceneIdx) === 0; // on it, or fading to it
  $('sc').addEventListener('click', () => setOpen(onBoard() ? !isOpen() : true));
  addEventListener('keydown', e => {
    if ((e.key === 'w' || e.key === 'W') && onBoard()) setOpen(!isOpen());
    else if (e.key === 'Escape') setOpen(false);
  });
  document.addEventListener('click', e => {
    if (isOpen() && !e.target.closest('#wg') && !e.target.closest('#ui')) setOpen(false);
  });
  try {
    // reopen where it was last time (or ?widgets in the URL)
    if (params.has('widgets') || localStorage.getItem('cswOpen') === '1')
      setTimeout(() => {
        if (onBoard()) setOpen(true);
      }, 400);
  } catch (e) {}

  /* ───────────── 1. music ───────────── */
  let trackSeenAt = -1e9,
    coverShown = null;
  function showTrack(has, title, artist, cover, playing) {
    $('wMusic').classList.toggle('playing', has && playing);
    LOAD.tmus = has && playing ? 1 : 0; // the board's LEDs pulse while music plays
    $('mTitle').textContent = has ? title || 'Unknown' : 'Nothing playing';
    $('mArtist').textContent = has ? artist || '' : 'Play something';
    if (cover !== coverShown) {
      coverShown = cover;
      $('mArt').style.backgroundImage = cover ? 'url("' + cover.replace(/"/g, '') + '")' : '';
      $('mArt').classList.toggle('has', !!cover);
    }
  }
  /* primary source: the helper reads the Windows media session and writes track.js (+ cover.js once per song) */
  let coverId = 0,
    coverWanted = 0,
    coverImg = '',
    trk = null;
  window.__csTrack = function (o) {
    trackSeenAt = performance.now();
    if (!o) return;
    const cv = +o.cv || 0;
    trk = o;
    if (cv && cv !== coverId && cv !== coverWanted) {
      // new cover: load cover.js once
      coverWanted = cv;
      const el = document.createElement('script');
      el.src = DATA_DIR + 'cover.js?t=' + Date.now();
      el.onload = el.onerror = () => el.remove();
      document.head.appendChild(el);
    }
    showTrack(!!(o.t || o.a), o.t, o.a, cv && cv === coverId ? coverImg : '', !!o.p);
  };
  window.__csCover = function (id, img) {
    coverId = id;
    coverImg = String(img || '');
    coverWanted = 0;
    if (trk && +trk.cv === id) window.__csTrack(trk);
  };
  /* fallback: Lively's own media info (only if the helper is not running) */
  window.livelyCurrentTrack = function (data) {
    if (performance.now() - trackSeenAt < 15000) return;
    let o = null;
    try {
      o = typeof data === 'string' ? JSON.parse(data) : data;
    } catch (e) {}
    const has = !!(o && (o.Title || o.Artist));
    let cover = has && o.Thumbnail ? String(o.Thumbnail) : '';
    if (cover && !/^(data:|https?:|file:)/.test(cover)) cover = 'data:image/png;base64,' + cover;
    showTrack(has, o && o.Title, o && (o.Artist || o.AlbumTitle), cover, true);
  };
  /* buttons: ask the helper (local port, per-run key) to control the current media session */
  function mediaCommand(action) {
    const key = LOAD.x && LOAD.x.k;
    if (!key) return;
    new Image().src =
      'http://127.0.0.1:' + HELPER_PORT + '/media?k=' + encodeURIComponent(key) + '&a=' + action + '&_=' + Date.now();
  }
  $('mPrev').addEventListener('click', () => mediaCommand('prev'));
  $('mNext').addEventListener('click', () => mediaCommand('next'));
  $('mPlay').addEventListener('click', () => {
    mediaCommand('toggle');
    const playing = $('wMusic').classList.toggle('playing'); // update at once; the helper confirms a moment later
    LOAD.tmus = playing ? 1 : 0;
  });

  /* ───────────── 2. pomodoro ───────────── */
  const POMO_STEP = 300,
    POMO_MIN = 300,
    POMO_MAX = 7200; // +/- buttons: 5 min, between 5 min and 2 h
  const P = { dur: 1500, left: 1500, endAt: 0, run: false }; // duration, seconds left (when paused), end time (when running)
  try {
    Object.assign(P, JSON.parse(localStorage.getItem('cswPomo') || '{}'));
  } catch (e) {}
  const savePomodoro = () => {
    try {
      localStorage.setItem('cswPomo', JSON.stringify(P));
    } catch (e) {}
  };
  const secondsLeft = () => (P.run ? Math.max(0, Math.ceil((P.endAt - Date.now()) / 1000)) : P.left);

  function drawPomodoro() {
    const s = secondsLeft();
    $('pTime').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    $('pBar').style.transform = 'scaleX(' + (P.dur ? clamp(s / P.dur, 0, 1) : 0) + ')';
    $('wPomo').classList.toggle('run', P.run);
    $('pState').textContent = P.run ? 'FOCUS' : s <= 0 ? 'DONE' : s < P.dur ? 'PAUSED' : 'TAP TO START';
  }
  let audio = null; // one context for the whole session (browsers limit how many exist)
  function beep() {
    try {
      const ctx = audio || (audio = new (window.AudioContext || window.webkitAudioContext)());
      if (ctx.state === 'suspended') ctx.resume();
      [0, 0.28, 0.56].forEach(t => {
        const osc = ctx.createOscillator(),
          gain = ctx.createGain();
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + 0.25);
      });
    } catch (e) {}
  }
  function finishPomodoro() {
    P.run = false;
    P.left = 0;
    savePomodoro();
    beep();
    const w = $('wPomo');
    w.classList.remove('done');
    void w.offsetWidth;
    w.classList.add('done'); // restart the flash animation
  }
  function togglePomodoro() {
    if (P.run) {
      P.left = secondsLeft();
      P.run = false;
    } else {
      if (P.left <= 0) P.left = P.dur;
      P.endAt = Date.now() + P.left * 1000;
      P.run = true;
    }
    savePomodoro();
    drawPomodoro();
  }
  function resetPomodoro() {
    P.run = false;
    P.left = P.dur;
    savePomodoro();
    drawPomodoro();
  }
  function adjustPomodoro(delta) {
    if (P.run) {
      P.endAt = clamp(P.endAt + delta * 1000, Date.now() + 60000, Date.now() + POMO_MAX * 1000);
      P.dur = Math.max(P.dur, secondsLeft());
    } else {
      P.dur = clamp(P.dur + delta, POMO_MIN, POMO_MAX);
      P.left = P.dur;
    }
    savePomodoro();
    drawPomodoro();
  }
  $('pTime').addEventListener('click', togglePomodoro); // click: start / pause
  $('pTime').addEventListener('dblclick', resetPomodoro); // double click: reset
  $('pMinus').addEventListener('click', () => adjustPomodoro(-POMO_STEP));
  $('pPlus').addEventListener('click', () => adjustPomodoro(POMO_STEP));
  setInterval(() => {
    if (isOpen() && !toBoard()) setOpen(false); // the panel belongs to the Board scene (keys, Lively, bar icons)
    if (P.run && secondsLeft() <= 0) finishPomodoro();
    if (P.run || isOpen()) drawPomodoro(); // idle and closed: no work at all
  }, 250);

  /* ───────────── 3 + 4. system and network ───────────── */
  let lastStats = null;
  const history = new Array(40).fill(0); // download speed history for the graph
  const formatSpeed = b =>
    b >= 1048576
      ? (b / 1048576).toFixed(1) + ' MB/s'
      : b >= 1024
        ? Math.round(b / 1024) + ' KB/s'
        : Math.round(b) + ' B/s';

  /* RAM stick: one segment per GB installed, filled from the bottom with the GB in use */
  let ramSegCount = 0,
    ramSegs = [];
  function buildRamSegments(n) {
    const g = $('ramSegs'),
      NS = 'http://www.w3.org/2000/svg';
    const top = 12,
      bottom = 82,
      gap = n > 24 ? 0.6 : n > 12 ? 1.4 : 2.4,
      h = (bottom - top - (n - 1) * gap) / n;
    g.textContent = '';
    ramSegs = [];
    for (let i = 0; i < n; i++) {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', 14);
      r.setAttribute('width', 32);
      r.setAttribute('rx', 1.2);
      r.setAttribute('height', h.toFixed(2));
      r.setAttribute('y', (bottom - (i + 1) * h - i * gap).toFixed(2));
      g.appendChild(r);
      ramSegs.push(r);
    }
    ramSegCount = n;
  }
  function drawRam(s) {
    const n = clamp(Math.round(s.rt), 1, 128);
    if (n !== ramSegCount) {
      buildRamSegments(n);
      $('eRam').textContent = 'RAM · ' + n + ' GB';
    }
    const color = s.ram > 90 ? COL.bad : s.ram > 75 ? COL.warn : '';
    ramSegs.forEach((r, i) => {
      r.style.opacity = 0.12 + 0.88 * clamp(s.ru - i, 0, 1);
      r.style.setProperty('--rc', color);
    });
  }
  function drawBattery(s) {
    const pct = s.b >= 0 ? s.b : null,
      onBattery = pct !== null && !s.c;
    $('vBat').textContent = pct === null ? 'AC' : pct + '%';
    $('icBat').classList.toggle('chg', !!s.c); // lightning bolt while plugged in
    $('bFill').style.transform = 'scaleY(' + (pct === null ? 1 : Math.max(0.03, pct / 100)) + ')';
    $('bFill').style.setProperty('--bc', onBattery && pct < 15 ? COL.bad : onBattery && pct < 35 ? COL.warn : '');
    $('sPow').innerHTML = s.c ? '<span class="bolt">&#9889;</span>PLUGGED' : 'ON BATTERY';
  }
  function drawStats(s) {
    drawBattery(s);
    $('vRam').textContent = Math.round(s.ram) + '%';
    drawRam(s);
    let caption = s.ru.toFixed(1) + ' / ' + s.rt.toFixed(1) + ' GB used';
    if (!s.c && s.bt > 0)
      caption = Math.floor(s.bt / 3600) + 'h ' + Math.floor((s.bt % 3600) / 60) + 'm left · ' + caption;
    $('sCap').textContent = caption;

    $('nDn').textContent = formatSpeed(s.dn);
    $('nUp').textContent = formatSpeed(s.up);
    const peak = Math.max(51200, ...history); // graph scale: at least 50 KB/s
    const line =
      'M' +
      history
        .map((v, i) => ((i * 100) / (history.length - 1)).toFixed(1) + ' ' + (28 - (26 * v) / peak).toFixed(1))
        .join(' L');
    $('nSpark').querySelector('.l').setAttribute('d', line);
    $('nSpark')
      .querySelector('.a')
      .setAttribute('d', line + ' L100 30 L0 30 Z');
    $('dBar').style.width = s.dk + '%';
    $('dBar').style.background = s.dk > 92 ? COL.bad : s.dk > 85 ? COL.warn : '';
    $('nDisk').textContent = 'DISK ' + s.dk + '%';
    $('dCap').textContent = s.df.toFixed(1) + ' GB free on ' + (s.dl || 'C') + ':';
  }
  /* called by data/load.js every ~1.5 s (through feeds.js) */
  window.__csWidgets = function (s) {
    if (!s) return;
    lastStats = s;
    history.push(s.dn);
    history.shift();
    if (isOpen()) drawStats(s);
  };

  drawPomodoro();
})();
