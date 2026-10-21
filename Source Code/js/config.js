/* ============================================================================
   MSI Thin Board - settings you can edit by hand
   Everything tweakable lives here. After editing, reload the wallpaper in Lively.
   ========================================================================== */
'use strict';

/* Colour themes (the dots in the bar).
   a = main accent · b = highlight · dim = faint lines · bg = background */
const PALETTES = {
  ice: { name: 'Ice', bg: '#04070b', a: '#7fd8ff', b: '#dbe8ff', dim: '#27425a' },
  amber: { name: 'Amber', bg: '#080604', a: '#ffb464', b: '#ffe8c8', dim: '#5e4224' },
  jade: { name: 'Jade', bg: '#030907', a: '#5eeeb0', b: '#d4fff0', dim: '#1f5440' },
  violet: { name: 'Violet', bg: '#06050c', a: '#ad9aff', b: '#e8e2ff', dim: '#3a3268' },
  graphite: { name: 'Graphite', bg: '#070708', a: '#b4b9c2', b: '#eef0f3', dim: '#3c3f45' }
};
const PKEYS = Object.keys(PALETTES);

/* Render quality levels. "Auto" starts at level 1 and steps down by itself when the frame rate drops.
     dpr     render resolution multiplier (1 = native, capped by DPR_MAX and the screen's own scale)
     samples anti-aliasing (0 = off, 2, 4) - the biggest GPU cost. 4 keeps the thin lines bright; 2 saves GPU but dims them ~15%
     bloom   glow pass on / off */
const LEVELS = {
  1: { dpr: 1.5, samples: 4, bloom: true },
  2: { dpr: 1.0, samples: 2, bloom: true },
  3: { dpr: 0.75, samples: 0, bloom: false }
};
const LV = ['', 'HIGH', 'MED', 'LOW']; // level names shown in the readout
const DPR_MAX = 1.5;

/* Frame rate */
const FPS_STEPS = [30, 45, 60]; // choices of the "Frame rate cap" setting in Lively
const IDLE_FPS = 30; // frame rate while nobody touches the mouse/keyboard (saves GPU/CPU)
const IDLE_AFTER_SEC = 3.2; // seconds without input before the bar fades out and IDLE_FPS applies

/* Live data from the helper (helper/cs-load.ps1) */
const FEED_FRESH_MS = 6000; // older data = helper stopped -> built-in demo animation
const POLL_MS = { load: 2000, track: 3000, repos: 60000 }; // how often the page re-reads the helper's files
const HELPER_PORT = 47831; // must match $Port in helper/cs-load.ps1 (music buttons, GitHub setting)
const LOAD_MODES = ['AUTO', 'IDLE', 'MID', 'HEAVY']; // manual load override (key L / Lively setting)
