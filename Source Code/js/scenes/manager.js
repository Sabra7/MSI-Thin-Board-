/* ============================================================================
   Scene manager: which scene is on screen, switching (with fade), colour themes
   A scene is { name, build } where build() returns { group, fov, fog, update(t, dt), onPalette?(), dispose?() }.
   Scenes are built on first use and freed again when you leave them (saves GPU memory).
   ========================================================================== */
'use strict';

const SCENES = [
  { name: 'Board', build: buildBoard }, // scenes/board.js
  { name: 'Repos', build: buildRepos }, // scenes/repos.js
  { name: 'Code', build: buildCode } // scenes/code.js
];
let current = null; // the running scene instance
let currentS = null; // its entry in SCENES
let pending = -1; // scene we are fading to (-1 = none)
let fade = 0; // current brightness 0..1 (scenes fade out, switch, fade in)
let fadeTarget = 1; // brightness we are easing toward
// mouse parallax, -1..1: eased values (used by the scenes) and targets (set by the mouse)
let mx = 0;
let my = 0;
let tmx = 0;
let tmy = 0;

/* Frees GPU memory of everything under `root` */
function disposeTree(root) {
  const seen = new Set();
  root.traverse(o => {
    if (o.isInstancedMesh && o.dispose) o.dispose();
    if (o.geometry && !seen.has(o.geometry)) {
      seen.add(o.geometry);
      o.geometry.dispose();
    }
    (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).forEach(m => {
      if (seen.has(m)) return;
      seen.add(m);
      for (const k in m) {
        const v = m[k];
        if (v && v.isTexture) v.dispose();
      }
      if (m.uniforms)
        for (const k in m.uniforms) {
          const v = m.uniforms[k].value;
          if (v && v.isTexture) v.dispose();
        }
      m.dispose();
    });
  });
}
function releaseScene(S) {
  if (!S || !S.inst) return;
  if (S.inst.dispose) S.inst.dispose(); // a scene's own extra GPU resources (e.g. cached textures not on screen)
  disposeTree(S.inst.group);
  S.inst = null;
}

function enter(i) {
  const S = SCENES[i];
  if (current) scene.remove(current.group);
  if (currentS && currentS !== S) releaseScene(currentS);
  hideTip();
  if (!S.inst) S.inst = S.build();
  current = S.inst;
  currentS = S;
  scene.add(current.group);
  camera.fov = current.fov;
  camera.updateProjectionMatrix();
  U.uFog.value = current.fog;
  scene.fog.density = current.fog;
  updateScale();
  if (current.onPalette) current.onPalette();
  sceneIdx = i;
  save();
  syncUI();
}

/* Fades out, then enter() runs from the frame loop */
function setScene(i) {
  i = ((i % SCENES.length) + SCENES.length) % SCENES.length;
  if (!current) {
    enter(i);
    return;
  }
  if (i === sceneIdx && pending < 0) return;
  pending = i;
  fadeTarget = 0;
}

function setPalette(k) {
  if (!PALETTES[k]) return;
  palKey = k;
  const P = PALETTES[k];
  cBg.set(P.bg);
  cA.set(P.a);
  cB.set(P.b);
  cDim.set(P.dim);
  scene.background = cBg;
  scene.fog.color.copy(cBg);
  document.documentElement.style.setProperty('--acc', P.a);
  document.body.style.background = P.bg;
  SCENES.forEach(S => {
    if (S.inst && S.inst.onPalette) S.inst.onPalette();
  });
  save();
  syncUI();
}

/* called when repo data may have changed: by repos.js (written by the helper), the GitHub API fetch and the username setting */
window.__csReposLoaded = function () {
  let json = '';
  try {
    json = JSON.stringify(reposSource());
  } catch (e) {}
  if (json === window.__csReposJson) return; // nothing changed
  window.__csReposJson = json;
  const S = SCENES[1];
  if (!S.inst) return; // not built yet: it reads the data when first entered
  const showing = current === S.inst;
  releaseScene(S);
  if (showing) enter(sceneIdx); // rebuild with the new data
};
