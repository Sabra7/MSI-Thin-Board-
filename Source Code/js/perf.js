/* ============================================================================
   Performance: quality level, frame-rate cap, battery saver, automatic downgrade
   Tunables are in config.js (LEVELS, FPS_STEPS, IDLE_FPS).
   ========================================================================== */
'use strict';

const PERF = {
  q: params.has('q') ? clamp(+params.get('q'), 0, 3) : 0, // 0 = auto, 1..3 = fixed level
  autoLevel: 1, // current level while in auto mode
  fpsCap: params.has('fps') ? +params.get('fps') : 60, // user's frame-rate cap
  batterySaver: true, // "Battery saver" setting
  onBattery: false,

  // measured frame rate (shown in the readout)
  fps: 0,
  frames: 0,
  fpsT: 0,

  // auto-downgrade: averaging window (ms, frames) and the warm-up seconds after a change
  winT: 0,
  winN: 0,
  warm: 5,

  // auto-upgrade: seconds of smooth frames so far, seconds needed, time of the last try
  goodT: 0,
  upWait: 60,
  upAt: -1e9,

  // ms spent updating / rendering (debug, window.__wall.PERF)
  upd: 0,
  sub: 0
};
let capInterval = 1000 / PERF.fpsCap; // ms per frame we aim for
let appliedLevel = -1;

function effLevel() {
  let l = PERF.q === 0 ? PERF.autoLevel : PERF.q;
  if (PERF.batterySaver && PERF.onBattery) l = Math.max(l, 2); // on battery: at least MED
  return l;
}

/* The frame rate we actually render at right now */
function effCap() {
  let cap = PERF.fpsCap;
  if (PERF.batterySaver && PERF.onBattery) cap = Math.min(cap, 30);
  if (idleT > IDLE_AFTER_SEC) cap = Math.min(cap, IDLE_FPS); // nobody is interacting: a calm wallpaper needs no more
  return cap;
}

/* Applies the current quality level to the renderer (cheap: does nothing if the level did not change) */
function applyPerf() {
  const l = effLevel();
  if (l === appliedLevel) return;
  appliedLevel = l;
  const L = LEVELS[l];
  dpr = Math.min(dprMax, L.dpr);
  /* three.js reads `samples` only when it allocates the target, so free it: it is rebuilt with the new value on the next frame */
  [composer.renderTarget1, composer.renderTarget2].forEach(t => {
    if (t && 'samples' in t && t.samples !== L.samples) {
      t.samples = L.samples;
      t.dispose();
    }
  });
  renderer.setPixelRatio(dpr);
  composer.setPixelRatio(dpr);
  bloom.enabled = L.bloom;
  updateScale();
  PERF.warm = 5;
  PERF.winT = 0;
  PERF.winN = 0;
}

/* Called once per rendered frame with the time since the previous one (ms) */
function perfTick(el) {
  PERF.frames++;
  PERF.fpsT += el;
  if (PERF.fpsT >= 1000) {
    PERF.fps = Math.round((PERF.frames * 1000) / PERF.fpsT);
    PERF.frames = 0;
    PERF.fpsT = 0;
  }
  if (el > 250) return; // ignore hitches (tab switch, scene change)
  if (PERF.warm > 0) {
    PERF.warm -= el / 1000;
    return;
  }
  PERF.winT += el;
  PERF.winN++;
  if (PERF.winT >= 3500) {
    // every 3.5 s: too slow? drop one quality level
    const avg = PERF.winT / PERF.winN,
      win = PERF.winT / 1000;
    PERF.winT = 0;
    PERF.winN = 0;
    if (PERF.q !== 0) return;
    if (avg > capInterval * 1.4 && PERF.autoLevel < 3) {
      /* dropped again soon after trying a higher level: wait twice as long before the next try (1 min ... 16 min) */
      if (performance.now() - PERF.upAt < 30000) PERF.upWait = Math.min(960, PERF.upWait * 2);
      PERF.autoLevel++;
      PERF.goodT = 0;
      applyPerf();
    } else if (PERF.autoLevel > 1) {
      // smooth: after a while, try one level higher (e.g. after a game closed)
      PERF.goodT = avg < capInterval * 1.1 ? PERF.goodT + win : 0;
      if (PERF.goodT >= PERF.upWait) {
        PERF.autoLevel--;
        PERF.goodT = 0;
        PERF.upAt = performance.now();
        applyPerf();
      }
    }
  }
}

/* Battery saver: lower the level and frame rate while unplugged */
try {
  if (navigator.getBattery)
    navigator
      .getBattery()
      .then(b => {
        const update = () => {
          PERF.onBattery = !b.charging;
          applyPerf();
        };
        b.addEventListener('chargingchange', update);
        update();
      })
      .catch(() => {});
} catch (e) {}
