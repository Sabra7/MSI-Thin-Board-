/* ============================================================================
   Top bar, keyboard shortcuts, window resize, and Lively's settings panel
   Bar:  [●] widgets   |  colour dots  |  [CPU] Board scene · [</>] Code scene · [GitHub] Repos scene
   Keys: 1-3 / arrows scene · C colour · Q quality · F frame cap · L load mode · H hide bar · W widgets · Esc close widgets
   ========================================================================== */
'use strict';

const ui = document.getElementById('ui');
const statEl = document.getElementById('stat'); // small readout at the bottom right
const scBox = document.getElementById('sc'); // holds the ● button
const palBox = document.getElementById('pal'); // holds the colour dots
const bBoard = document.getElementById('bBoard');
const bCode = document.getElementById('bCode');
const bRepo = document.getElementById('bRepo');

function applyUI() {
  ui.style.display = showUI ? '' : 'none';
  statEl.style.display = showUI ? '' : 'none';
}

/* ● button: toggled by ui/widgets.js (it only carries the data-i of the Board scene) */
(function () {
  const b = document.createElement('button');
  b.textContent = '●';
  b.title = 'Widgets';
  b.dataset.i = 0;
  b.onclick = () => setScene(0);
  scBox.appendChild(b);
})();

/* scene icons: clicking the icon of the scene you are in goes back to Board */
bBoard.onclick = () => setScene(0);
bRepo.onclick = () => setScene(sceneIdx === 1 && pending < 0 ? 0 : 1);
bCode.onclick = () => setScene(sceneIdx === 2 && pending < 0 ? 0 : 2);

/* colour dots */
PKEYS.forEach(k => {
  const b = document.createElement('button');
  b.className = 'dot';
  b.dataset.k = k;
  b.title = PALETTES[k].name;
  b.style.setProperty('--c', PALETTES[k].a);
  b.onclick = () => setPalette(k);
  palBox.appendChild(b);
});

/* highlights the active scene icon and colour dot */
function syncUI() {
  const cur = pending >= 0 ? pending : sceneIdx;
  bBoard.classList.toggle('on', cur === 0);
  bRepo.classList.toggle('on', cur === 1);
  bCode.classList.toggle('on', cur === 2);
  [...palBox.children].forEach(b => b.classList.toggle('on', b.dataset.k === palKey));
}

/* any input shows the bar again and restarts the idle timer */
function poke() {
  idleT = 0;
  document.body.classList.remove('idle');
}

addEventListener('mousemove', e => {
  /* the board's hover labels ignore the mouse while it is over the bar or the widgets */
  const overUI = !!(e.target && e.target.closest && e.target.closest('#wg,#ui'));
  mpx = overUI ? -1e4 : e.clientX;
  mpy = overUI ? -1e4 : e.clientY;
  mpIdle = 0;
  tmx = (e.clientX / innerWidth) * 2 - 1;
  tmy = (e.clientY / innerHeight) * 2 - 1; // parallax target
  poke();
});

addEventListener('keydown', e => {
  poke();
  if (e.key >= '1' && e.key <= String(SCENES.length)) setScene(+e.key - 1);
  else if (e.key === 'ArrowRight') setScene(sceneIdx + 1);
  else if (e.key === 'ArrowLeft') setScene(sceneIdx - 1);
  else if (e.key === 'c' || e.key === 'C') setPalette(PKEYS[(PKEYS.indexOf(palKey) + 1) % PKEYS.length]);
  else if (e.key === 'q' || e.key === 'Q') {
    PERF.q = (PERF.q + 1) % 4;
    applyPerf();
  } else if (e.key === 'f' || e.key === 'F') {
    PERF.fpsCap = FPS_STEPS[(FPS_STEPS.indexOf(PERF.fpsCap) + 1) % FPS_STEPS.length];
    applyPerf();
  } else if (e.key === 'l' || e.key === 'L') LOAD.mode = (LOAD.mode + 1) % LOAD_MODES.length;
  else if (e.key === 'h' || e.key === 'H') {
    showUI = !showUI;
    applyUI();
  }
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  updateScale();
});

/* Lively settings (see LivelyProperties.json) arrive here by name */
window.livelyPropertyListener = function (name, val) {
  if (name === 'palette') setPalette(typeof val === 'number' ? PKEYS[val] : val);
  else if (name === 'speed') speedMul = +val;
  else if (name === 'quality') {
    PERF.q = clamp(Math.round(+val), 0, 3);
    if (PERF.q === 0) PERF.autoLevel = 1;
    applyPerf();
  } else if (name === 'fpsCap') {
    PERF.fpsCap = FPS_STEPS[clamp(Math.round(+val), 0, 2)];
    applyPerf();
  } else if (name === 'batterySaver') {
    PERF.batterySaver = !!val;
    applyPerf();
  } else if (name === 'loadMode') LOAD.mode = clamp(Math.round(+val), 0, 3);
  else if (name === 'bloom') bloom.strength = +val;
  else if (name === 'showUI') {
    showUI = !!val;
    applyUI();
  } else if (name === 'showPrivateNames') showPrivNames = !!val;
  else if (name === 'githubUser') setGithubUser(val);
};
