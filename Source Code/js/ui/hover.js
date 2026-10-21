/* ============================================================================
   Hover labels: the callout that appears when the mouse is near a chip of the board scene.
   The scene passes its list of hot spots to hoverUpdate(); styling is in css/style.css (#tip).
   ========================================================================== */
'use strict';

let mpx = -1e4; // mouse position in pixels (-1e4 = not over the scene, e.g. over the bar)
let mpy = -1e4;
let mpIdle = 99; // seconds since the mouse last moved
let hoverIdx = -1; // index of the hot spot whose label is showing (-1 = none)
const tipEl = document.createElement('div');
tipEl.id = 'tip';
tipEl.innerHTML =
  '<svg width="170" height="100" viewBox="0 0 170 100"><path pathLength="1" d="M6 94 V22 H156"/><circle cx="6" cy="96" r="4"/></svg><div class="tx"><b></b><i></i></div>';
document.body.appendChild(tipEl);
const tipB = tipEl.querySelector('b'),
  tipI = tipEl.querySelector('i'),
  tipV = new THREE.Vector3();
function hideTip() {
  tipEl.classList.remove('on');
  hoverIdx = -1;
}
function hoverUpdate(hots, dt) {
  mpIdle += dt;
  if (mpIdle > IDLE_AFTER_SEC || mpx < 0) {
    if (hoverIdx >= 0) hideTip();
    return;
  }
  camera.updateMatrixWorld();
  let best = -1,
    bd = 1e9;
  for (let i = 0; i < hots.length; i++) {
    tipV.copy(hots[i].v).project(camera);
    if (tipV.z > 1) continue;
    const sx = (tipV.x * 0.5 + 0.5) * innerWidth,
      sy = (-tipV.y * 0.5 + 0.5) * innerHeight,
      d = Math.hypot(sx - mpx, sy - mpy);
    if (d < (hots[i].r || 70) && d < bd) {
      bd = d;
      best = i;
      hots[i].sx = sx;
      hots[i].sy = sy;
    }
  }
  if (best < 0) {
    if (hoverIdx >= 0) hideTip();
    return;
  }
  const h = hots[best],
    flip = h.sx > innerWidth * 0.62;
  if (best !== hoverIdx) {
    tipEl.classList.remove('on');
    void tipEl.offsetWidth;
    hoverIdx = best;
    tipB.textContent = h.n;
    tipEl.classList.toggle('flip', flip);
    tipEl.classList.add('on');
  }
  tipI.textContent = h.f();
  tipEl.style.transform = 'translate(' + h.sx.toFixed(1) + 'px,' + (h.sy + 0).toFixed(1) + 'px)';
}
