/* ============================================================================
   Core: renderer, camera, post-processing, and small helpers used by every scene
   ========================================================================== */
'use strict';

// colours of the current theme (set by setPalette in scenes/manager.js; scenes share these objects)
const cBg = new THREE.Color(); // background
const cA = new THREE.Color(); // main accent
const cB = new THREE.Color(); // highlight
const cDim = new THREE.Color(); // faint lines

const dprMax = Math.min(window.devicePixelRatio || 1, DPR_MAX);
let dpr = dprMax;
const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: params.has('shot')
});
renderer.setPixelRatio(dpr);
renderer.setSize(innerWidth, innerHeight);
document.getElementById('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.02);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 400);

/* uniforms shared by all the custom shaders */
const U = { uFog: { value: 0.02 }, uScale: { value: 1000 }, uTime: { value: 0 } };

/* Post-processing chain: scene -> bloom (glow) -> final pass (colour fringe, vignette, film grain, fade) */
let composer, bloom, finalPass;
(function initComposer() {
  let target;
  try {
    if (renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget) {
      target = new THREE.WebGLMultisampleRenderTarget(innerWidth * dpr, innerHeight * dpr, {
        format: THREE.RGBAFormat
      });
      target.samples = LEVELS[1].samples;
    }
  } catch (e) {
    target = undefined;
  }
  composer = new THREE.EffectComposer(renderer, target);
  composer.addPass(new THREE.RenderPass(scene, camera));
  bloom = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.6, 0.16);
  composer.addPass(bloom);
  finalPass = new THREE.ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uFade: { value: 0 } },
    vertexShader:
      'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform float uTime; uniform float uFade; varying vec2 vUv;',
      'float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }',
      'void main(){',
      '  vec2 c = vUv - .5; float d = dot(c,c);',
      '  vec2 off = c * d * 0.006;',
      '  vec3 col = vec3(texture2D(tDiffuse, vUv+off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv-off).b);',
      '  col *= 1.0 - smoothstep(0.10, 0.80, d*1.7) * 0.62;', // vignette (dark edges)
      '  col += (h(vUv*vec2(1920.,1080.) + fract(uTime)*97.) - .5) * 0.022;', // film grain
      '  col *= uFade;', // scene fade in / out
      '  gl_FragColor = vec4(max(col, 0.), 1.);',
      '}'
    ].join('\n')
  });
  composer.addPass(finalPass);
})();

/* Keeps point-sprite sizes right for the current resolution and field of view */
function updateScale() {
  U.uScale.value = (innerHeight * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}

/* ───────────── small helpers ───────────── */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
} // seeded random
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}; // smoothstep
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/* ───────────── shared materials ───────────── */
function lineMat(colorV, alpha) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: colorV }, uAlpha: { value: alpha }, uFog: U.uFog },
    vertexShader:
      'varying float vD; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vD=-mv.z; gl_Position=projectionMatrix*mv; }',
    fragmentShader:
      'uniform vec3 uColor; uniform float uAlpha; uniform float uFog; varying float vD; void main(){ float f=exp(-vD*vD*uFog*uFog); gl_FragColor=vec4(uColor, uAlpha*f); }',
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}
const PV =
  'attribute float aSize; attribute float aAlpha; uniform float uScale; varying float vA; varying float vD;' +
  'void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vD=-mv.z; vA=aAlpha; gl_PointSize=max(1.,aSize*uScale/vD); gl_Position=projectionMatrix*mv; }';
const PF_GLOW =
  'uniform vec3 uColor; uniform float uFog; varying float vA; varying float vD;' +
  'void main(){ vec2 p=gl_PointCoord-.5; float d=length(p)*2.; if(d>1.) discard; float g=pow(1.-d,2.2); float core=smoothstep(.4,.0,d);' +
  ' float f=exp(-vD*vD*uFog*uFog); vec3 col=mix(uColor, vec3(1.), core*.55); gl_FragColor=vec4(col, (g*.85+core*.6)*vA*f); }';
const PF_RING =
  'uniform vec3 uColor; uniform float uFog; varying float vA; varying float vD;' +
  'void main(){ vec2 p=gl_PointCoord-.5; float d=length(p)*2.; if(d>1.) discard; float ring=smoothstep(.50,.62,d)*(1.-smoothstep(.80,.92,d)); float dot_=smoothstep(.26,.18,d)*.7;' +
  ' float f=exp(-vD*vD*uFog*uFog); gl_FragColor=vec4(uColor, (ring+dot_)*vA*f); }';
function pointMat(frag, colorV) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: colorV }, uFog: U.uFog, uScale: U.uScale },
    vertexShader: PV,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}
function pointsGeo(n) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n).fill(0.2), 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  return g;
}
