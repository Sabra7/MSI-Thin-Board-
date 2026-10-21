/* ============================================================================
   Start-up and the frame loop
   ========================================================================== */
'use strict';

applyPerf();
setPalette(palKey);
enter(clamp(sceneIdx, 0, SCENES.length - 1));
applyUI();

let last = performance.now(); // time of the last rendered frame (ms)
let T = 0; // scene time in seconds (stops while hidden)
let statT = 1; // seconds since the readout was last refreshed
let lastCap = 0; // frame-rate cap used for the previous frame

function frame(now) {
  requestAnimationFrame(frame);
  // nothing to draw while hidden (Lively pauses the page behind full-screen apps)
  if (document.hidden) {
    last = now;
    return;
  }

  /* frame-rate limiter (lower while idle, see effCap) */
  const cap = effCap();
  if (cap !== lastCap) {
    lastCap = cap;
    capInterval = 1000 / cap;
    PERF.winT = 0;
    PERF.winN = 0;
    PERF.warm = Math.max(PERF.warm, 1);
  }
  const el = now - last;
  if (el < capInterval - 2) return;
  const dt = Math.min(0.05, el / 1000);
  last = now;
  T += dt;
  perfTick(el);

  /* bar fades out after a few idle seconds */
  idleT += dt;
  if (idleT > IDLE_AFTER_SEC) document.body.classList.add('idle');
  const k = Math.min(1, dt * 2.4);
  mx += (tmx - mx) * k;
  my += (tmy - my) * k; // mouse parallax easing

  /* scene fade / switch */
  fade += (fadeTarget - fade) * Math.min(1, dt * 5);
  if (pending >= 0 && fade < 0.03) {
    enter(pending);
    pending = -1;
    fadeTarget = 1;
    syncUI();
  }

  U.uTime.value = T;
  updateLoad(dt, T);

  /* readout at the bottom right (only when the bar is visible) */
  statT += dt;
  if (showUI && statT > 0.35) {
    statT = 0;
    statEl.textContent =
      'CPU ' +
      Math.round(LOAD.cpu * 100) +
      '%  ·  GPU ' +
      (LOAD.gpuNA ? '--' : Math.round(LOAD.gpu * 100) + '%') +
      '  ·  ' +
      feedSource() +
      '  ·  ' +
      PERF.fps +
      ' FPS  ·  ' +
      LV[effLevel()] +
      (PERF.batterySaver && PERF.onBattery ? '  ·  BATT' : '');
  }

  const u0 = performance.now();
  current.update(T, dt);
  PERF.upd += (performance.now() - u0 - PERF.upd) * 0.05;
  finalPass.uniforms.uTime.value = T;
  finalPass.uniforms.uFade.value = fade;
  const r0 = performance.now();
  composer.render(dt);
  PERF.sub += (performance.now() - r0 - PERF.sub) * 0.05;
}
requestAnimationFrame(frame);

/* tests/browser-tests.js runs when the page is opened with ?test (tests/run-tests.ps1 does that) */
if (params.has('test')) {
  const el = document.createElement('script');
  el.src = 'tests/browser-tests.js';
  document.head.appendChild(el);
}

/* handle for debugging in the console */
window.__wall = {
  setScene,
  setPalette,
  PERF,
  LOAD,
  poke,
  getScene: () => sceneIdx,
  info: () => renderer.info.render
};
