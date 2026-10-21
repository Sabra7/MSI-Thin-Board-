/* ============================================================================
   Live data feeds
   The helper (helper/cs-load.ps1) writes small .js files into data/ (DATA_DIR); we re-load them now and then:
     load.js   -> __csLoad(cpu, gpu, stats)   every ~1.5 s    (CPU/GPU %, battery, RAM, disk, network, hardware names)
     track.js  -> __csTrack(song)             when the song changes (js/ui/widgets.js)
     cover.js  -> __csCover(id, image)        loaded by widgets.js once per song
     repos.js  -> sets window.REPOS_DATA      every ~20 minutes (Repos scene)
   Loading them as <script> tags (JSONP style) works from file:// pages, where fetch() of local files is blocked.
   Lively's own numbers (livelySystemInformation) are only used when the helper isn't running.
   ========================================================================== */
'use strict';

/* Loads <file> again and again; backs off while the file is missing; sleeps while the page is hidden. */
function pollScript(file, everyMs) {
  let fails = 0;
  (function tick() {
    if (document.hidden) {
      setTimeout(tick, 5000);
      return;
    }
    const el = document.createElement('script');
    el.src = file + '?t=' + Date.now(); // ?t= defeats the cache
    el.onload = () => {
      fails = 0;
      el.remove();
      setTimeout(tick, everyMs);
    };
    el.onerror = () => {
      fails++;
      el.remove();
      setTimeout(tick, fails >= 3 ? everyMs * 10 : everyMs * 2);
    };
    document.head.appendChild(el);
  })();
}

const feedFresh = () => LOAD.live && performance.now() - LOAD.lastLive < FEED_FRESH_MS;
const feedSource = () =>
  LOAD.mode
    ? LOAD_MODES[LOAD.mode]
    : LOAD.fileT && performance.now() - LOAD.fileT < FEED_FRESH_MS
      ? 'FILE'
      : feedFresh()
        ? 'LIVE'
        : 'SIM';

/* called by load.js */
window.__csLoad = function (cpu, gpu, stats) {
  const now = performance.now();
  LOAD.x = stats || null;
  if (stats && stats.hw) LOAD.hw = stats.hw;
  if (stats && window.__csWidgets) {
    try {
      window.__csWidgets(stats);
    } catch (e) {}
  }
  LOAD.tcpu = clamp((+cpu || 0) / 100, 0, 1);
  LOAD.gpuNA = +gpu < 0; // -1 = no GPU reading on this PC
  LOAD.tgpu = LOAD.gpuNA ? LOAD.tcpu * 0.6 : clamp((+gpu || 0) / 100, 0, 1);
  LOAD.live = true;
  LOAD.lastLive = now;
  LOAD.fileT = now;
  if (typeof syncGithubUser === 'function') syncGithubUser(); // scenes/repos.js: hands the GitHub setting to the helper
};

/* Lively's built-in system information. On PCs with broken performance counters it sends only zeros: those samples
   are ignored, so after a few seconds the demo animation runs instead of a dead board. */
window.livelySystemInformation = function (data) {
  if (LOAD.fileT && performance.now() - LOAD.fileT < FEED_FRESH_MS) return; // helper data wins
  try {
    const o = typeof data === 'string' ? JSON.parse(data) : data;
    const num = v => (typeof v === 'string' ? parseFloat(v) : v);
    const pick = (...keys) => {
      for (const k of keys) {
        const v = num(o[k]);
        if (typeof v === 'number' && isFinite(v)) return v;
      }
      return null;
    };
    const c = pick('CurrentCpu', 'currentCpu', 'cpu');
    const g = pick('CurrentGpu3D', 'CurrentGpu3d', 'currentGpu3D', 'CurrentGpu', 'gpu');
    if (!(c > 0 || g > 0)) return;
    if (c !== null) LOAD.tcpu = clamp(c / 100, 0, 1);
    if (g !== null) LOAD.tgpu = clamp(g / 100, 0, 1);
    LOAD.gpuNA = false;
    LOAD.live = true;
    LOAD.lastLive = performance.now();
  } catch (e) {}
};

/* Every frame: pick the target values (real data, manual override, or a demo cycle) and ease toward them */
function updateLoad(dt, t) {
  const now = performance.now();
  if (LOAD.mode === 1) {
    LOAD.tcpu = 0.08;
    LOAD.tgpu = 0.05;
  } else if (LOAD.mode === 2) {
    LOAD.tcpu = 0.5;
    LOAD.tgpu = 0.45;
  } else if (LOAD.mode === 3) {
    LOAD.tcpu = 0.95;
    LOAD.tgpu = 0.92;
  } else if (!feedFresh()) {
    // no data: gentle demo animation
    LOAD.gpuNA = false;
    const cyc = (t % 36) / 36,
      busy = smooth(0.3, 0.38, cyc) * (1 - smooth(0.7, 0.78, cyc));
    LOAD.tcpu = 0.1 + 0.06 * Math.sin(t * 0.9) + busy * (0.62 + 0.18 * Math.sin(t * 2.3));
    LOAD.tgpu = 0.06 + 0.04 * Math.sin(t * 0.7) + busy * (0.7 + 0.15 * Math.sin(t * 1.7 + 1));
  }
  if (LOAD.fixed >= 0) LOAD.tcpu = LOAD.tgpu = LOAD.fixed;

  const k = Math.min(1, dt * 1.6); // easing speed
  LOAD.cpu += (LOAD.tcpu - LOAD.cpu) * k;
  LOAD.gpu += (LOAD.tgpu - LOAD.gpu) * k;
  const X = feedFresh() ? LOAD.x : null; // helper stats, if fresh
  LOAD.ram += ((X ? clamp(X.ram / 100, 0, 1) : 0.4) - LOAD.ram) * k;
  LOAD.net += ((X ? clamp(Math.log10(1 + (X.dn + X.up) / 1024) / 4, 0, 1) : 0.2) - LOAD.net) * k; // log scale: 10 MB/s ~ 1
  LOAD.chg = X ? X.c : 1;
  LOAD.bat = X && X.b >= 0 ? X.b : 100;
  LOAD.hasBat = !X || X.b >= 0;
  LOAD.mus += (LOAD.tmus - LOAD.mus) * Math.min(1, dt * 2.5);
}

pollScript(DATA_DIR + 'load.js', POLL_MS.load);
pollScript(DATA_DIR + 'track.js', POLL_MS.track);
pollScript(DATA_DIR + 'repos.js', POLL_MS.repos);
