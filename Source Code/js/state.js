/* ============================================================================
   Shared state: URL options, saved choices, and the live-load numbers
   URL options (handy for testing):  ?scene=0|1|2  ?pal=ice|amber|jade|violet|graphite  ?ui=0  ?load=0..1  ?q=0..3
                                     ?fps=30|45|60  ?data=<folder>/ (where the helper's files are read)  ?test (tests/)
   ========================================================================== */
'use strict';

const params = new URLSearchParams(location.search);
const DATA_DIR = params.get('data') || 'data/'; // the helper writes into data/; the tests point this at tests/fixtures/

let sceneIdx = 0; // 0 = Board, 1 = Repos, 2 = Code
let palKey = 'ice';
let speedMul = 1; // "Animation speed" setting
let showUI = params.get('ui') !== '0';
let idleT = 0; // seconds since the last mouse/keyboard input

/* restore the last scene / colour */
try {
  const saved = JSON.parse(localStorage.getItem('cswall') || '{}');
  if (typeof saved.scene === 'number') sceneIdx = saved.scene;
  if (PALETTES[saved.pal]) palKey = saved.pal;
} catch (e) {}
if (params.has('scene')) sceneIdx = +params.get('scene') || 0;
if (!(sceneIdx >= 0 && sceneIdx <= 2)) sceneIdx = 0;
if (PALETTES[params.get('pal')]) palKey = params.get('pal');

function save() {
  try {
    localStorage.setItem('cswall', JSON.stringify({ scene: sceneIdx, pal: palKey }));
  } catch (e) {}
}

/* What the scenes react to. t* = target values, the others ease toward them every frame.
   All values 0..1 except bat (percent) and chg (1 = plugged in). */
const LOAD = {
  // CPU / GPU load: eased value (what the scenes use) and target (from the data)
  cpu: 0.1,
  gpu: 0.06,
  tcpu: 0.1,
  tgpu: 0.06,

  ram: 0.4, // eased RAM use
  net: 0.2, // eased network activity (log scale, 10 MB/s ~ 1)
  chg: 1, // 1 = plugged in
  bat: 100, // battery percent

  // music playing: eased value and target (the board's LEDs pulse with it)
  mus: 0,
  tmus: 0,

  x: null, // raw numbers from the helper (also used by the widgets)
  hw: null, // hardware names from the helper { cpu, gpu, vram, ram }
  gpuNA: false, // the helper has no GPU reading on this PC (GPU follows the CPU instead)
  hasBat: true, // false on desktops

  // is fresh data arriving? (and the timestamp of the last sample)
  live: false,
  lastLive: -1e9,

  fileT: 0, // timestamp of the last helper sample (helper data wins over Lively's)
  mode: 0, // 0 = real data, 1..3 = manual override (see LOAD_MODES)
  fixed: params.has('load') ? Math.min(1, Math.max(0, +params.get('load'))) : -1 // ?load=0..1 pins the load (tests)
};
