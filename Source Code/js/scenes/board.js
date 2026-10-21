/* ============================================================================
   Scene 0 - BOARD: a laptop motherboard (CPU + GPU, 2 SODIMM, M.2, fan) that reacts to your real CPU/GPU/RAM/network/battery.
   The chip labels show your own CPU / GPU / RAM names once the helper has sent them (LOAD.hw).
   build() returns { group, fov, fog, update(t, dt) }.  Reads LOAD (js/state.js).  Hover labels: the `hot` list near the end.
   ========================================================================== */
'use strict';

/* Short silkscreen names: "12th Gen Intel(R) Core(TM) i7-12650H" -> chip "CORE i7", label "CORE i7-12650H" */
function hwNames(hw) {
  const clean = s =>
    String(s || '')
      .replace(/\((R|TM|C)\)|®|™/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  const cpu = clean(hw && hw.cpu),
    gpu = clean(hw && hw.gpu);
  let cpuChip = 'CPU',
    cpuName = 'CPU',
    m;
  if ((m = cpu.match(/Core\s+(Ultra\s+\d|i\d)[- ]?(\w+)?/i))) {
    cpuChip = 'CORE ' + m[1].replace(/ultra/i, 'ULTRA');
    cpuName = cpuChip + (m[2] ? '-' + m[2] : '');
  } else if ((m = cpu.match(/Ryzen\s+(AI\s+)?(\d+)\s*(\w+)?/i))) {
    cpuChip = 'RYZEN ' + m[2];
    cpuName = cpuChip + (m[3] ? ' ' + m[3] : '');
  } else if (cpu) {
    cpuName = cpu
      .replace(/\d+th Gen|Processor|CPU|with .*|@.*| - .*/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase()
      .slice(0, 28);
    cpuChip = cpuName.split(' ').slice(0, 2).join(' ');
    if (cpuChip.length > 10) cpuChip = cpuName.split(' ')[0].slice(0, 10);
  }
  let gpuName =
    gpu
      .replace(/^(NVIDIA|AMD|ATI|Intel|Qualcomm)\s+/i, '')
      .replace(/^GeForce\s+/i, '')
      .replace(/\s*(Laptop GPU|GPU)$/i, '')
      .toUpperCase() || 'GPU';
  const gpuChip =
    gpuName.length <= 10
      ? gpuName
      : gpuName
          .replace(/\s*GRAPHICS$/, '')
          .slice(0, 10)
          .trim();
  return {
    cpuChip,
    cpuName,
    gpuChip,
    gpuName,
    ram: (hw && hw.ram) || 'RAM',
    vram: hw && hw.vram > 0 ? hw.vram + ' GB' : ''
  };
}
function miterPts(pts, off) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    let n1 = null,
      n2 = null;
    if (i > 0) {
      const d = pts[i]
        .clone()
        .sub(pts[i - 1])
        .normalize();
      n1 = new THREE.Vector3(-d.z, 0, d.x);
    }
    if (i < pts.length - 1) {
      const d = pts[i + 1].clone().sub(pts[i]).normalize();
      n2 = new THREE.Vector3(-d.z, 0, d.x);
    }
    let n;
    if (n1 && n2) {
      n = n1.clone().add(n2).normalize();
      n.multiplyScalar(1 / Math.max(0.5, n.dot(n1)));
    } else n = (n1 || n2).clone();
    out.push(pts[i].clone().addScaledVector(n, off));
  }
  return out;
}
function routePath(ax_, az_, bx_, bz_) {
  const V = THREE.Vector3,
    dx = bx_ - ax_,
    dz = bz_ - az_,
    ax = Math.abs(dx),
    az = Math.abs(dz);
  const sx = Math.sign(dx) || 1,
    sz = Math.sign(dz) || 1,
    m = Math.min(ax, az);
  const pts = [new V(ax_, 0.03, az_)];
  if (ax >= az) {
    const s = (ax - az) / 2;
    pts.push(new V(ax_ + sx * s, 0.03, az_), new V(ax_ + sx * (s + m), 0.03, az_ + sz * m));
  } else {
    const s = (az - ax) / 2;
    pts.push(new V(ax_, 0.03, az_ + sz * s), new V(ax_ + sx * m, 0.03, az_ + sz * (s + m)));
  }
  pts.push(new V(bx_, 0.03, bz_));
  return pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 1e-3);
}
function labelTex(txt) {
  const c = makeCanvas(256, 256);
  drawLabel(c, txt);
  return new THREE.CanvasTexture(c);
}
function relabel(tex, txt) {
  drawLabel(tex.image, txt);
  tex.needsUpdate = true;
}
function drawLabel(c, txt) {
  const S = 256,
    x = c.getContext('2d');
  x.fillStyle = '#0a1018';
  x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(255,255,255,0.10)';
  x.lineWidth = 2;
  x.strokeRect(10, 10, S - 20, S - 20);
  x.strokeRect(28, 28, S - 56, S - 56);
  x.fillStyle = 'rgba(255,255,255,0.18)';
  x.beginPath();
  x.arc(22, 22, 4, 0, 7);
  x.fill();
  if (txt) {
    x.textAlign = 'center';
    x.fillStyle = 'rgba(224,231,242,0.80)';
    x.font = '600 ' + (txt.length > 8 ? 20 : 26) + 'px ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace';
    x.fillText(txt.split('').join(' '), S / 2, S - 46, S - 60); // max width: long names are squeezed
  } else {
    for (let i = 0; i < 20; i++) {
      x.fillStyle = 'rgba(255,255,255,0.04)';
      x.fillRect(70 + (i % 5) * 24, 80 + Math.floor(i / 5) * 24, 14, 2);
    }
  }
}

function roundedPath(pts, rMax) {
  const V = THREE.Vector3,
    cp = new THREE.CurvePath();
  let cur = new V(pts[0][0], 0, pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = new V(pts[i - 1][0], 0, pts[i - 1][1]),
      p1 = new V(pts[i][0], 0, pts[i][1]),
      p2 = new V(pts[i + 1][0], 0, pts[i + 1][1]);
    const r = Math.min(rMax, p0.distanceTo(p1) * 0.45, p1.distanceTo(p2) * 0.45);
    const a = p0.clone().sub(p1).normalize().multiplyScalar(r).add(p1),
      b = p2.clone().sub(p1).normalize().multiplyScalar(r).add(p1);
    if (cur.distanceTo(a) > 1e-4) cp.add(new THREE.LineCurve3(cur.clone(), a));
    cp.add(new THREE.QuadraticBezierCurve3(a, p1.clone(), b));
    cur = b;
  }
  cp.add(new THREE.LineCurve3(cur.clone(), new V(pts[pts.length - 1][0], 0, pts[pts.length - 1][1])));
  return cp;
}
function resample(pts, n) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const L = cum[cum.length - 1],
    out = [];
  let j = 1;
  for (let k = 0; k <= n; k++) {
    const d = (L * k) / n;
    while (j < cum.length - 1 && cum[j] < d) j++;
    out.push(pts[j - 1].clone().lerp(pts[j], clamp((d - cum[j - 1]) / (cum[j] - cum[j - 1] || 1), 0, 1)));
  }
  return out;
}
const PV_H =
  'attribute float aSize; attribute float aAlpha; attribute float aHeat; uniform float uScale; varying float vA; varying float vD; varying float vH;' +
  'void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vD=-mv.z; vA=aAlpha; vH=aHeat; gl_PointSize=max(1.,aSize*uScale/vD); gl_Position=projectionMatrix*mv; }';
const PF_HEAT =
  'uniform vec3 uColor; uniform float uFog; varying float vA; varying float vD; varying float vH;' +
  'void main(){ vec2 p=gl_PointCoord-.5; float d=length(p)*2.; if(d>1.) discard; float g=pow(1.-d,2.2); float core=smoothstep(.4,.0,d);' +
  ' float f=exp(-vD*vD*uFog*uFog); vec3 col=mix(uColor, vec3(1.0,.52,.22), vH); col=mix(col, vec3(1.), core*.5); gl_FragColor=vec4(col, (g*.85+core*.6)*vA*f); }';

function buildBoard() {
  const g = new THREE.Group(),
    V = THREE.Vector3,
    rnd = mulberry32(91);
  const BX = 21,
    BZ = 12;
  const metal = (c, r, m) =>
    new THREE.MeshStandardMaterial({
      color: c,
      roughness: r === undefined ? 0.45 : r,
      metalness: m === undefined ? 0.6 : m
    });
  const darkM = metal(0x0b1119, 0.5, 0.55),
    edgeMat = lineMat(cA, 0.5);

  /* PCB with mounting holes and chamfers */
  const P = [
    [-BX + 2.5, -BZ],
    [BX, -BZ],
    [BX, BZ - 4],
    [BX - 3, BZ],
    [-BX, BZ],
    [-BX, -BZ + 2.5]
  ];
  const sh = new THREE.Shape();
  sh.moveTo(P[0][0], -P[0][1]);
  for (let i = 1; i < P.length; i++) sh.lineTo(P[i][0], -P[i][1]);
  sh.closePath();
  const holes = [
    [-17.5, -8.5],
    [-0.5, -9.2],
    [17, -9.5],
    [-17.5, 8.8],
    [17.5, 2.8],
    [-1.5, 0.6]
  ];
  holes.forEach(([hx, hz]) => {
    const h = new THREE.Path();
    h.absarc(hx, -hz, 0.6, 0, Math.PI * 2, true);
    sh.holes.push(h);
  });
  const pcbGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.35, bevelEnabled: false });
  const gc = makeCanvas(512, 512),
    gx = gc.getContext('2d');
  gx.fillStyle = '#060a10';
  gx.fillRect(0, 0, 512, 512);
  for (let i = 0; i <= 512; i += 64) {
    gx.strokeStyle = i % 256 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.028)';
    gx.beginPath();
    gx.moveTo(i + 0.5, 0);
    gx.lineTo(i + 0.5, 512);
    gx.stroke();
    gx.beginPath();
    gx.moveTo(0, i + 0.5);
    gx.lineTo(512, i + 0.5);
    gx.stroke();
  }
  const gt = new THREE.CanvasTexture(gc);
  gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
  gt.repeat.set(0.125, 0.125);
  gt.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const pcbGrp = new THREE.Group();
  pcbGrp.rotation.x = -Math.PI / 2;
  pcbGrp.position.y = -0.35;
  pcbGrp.add(
    new THREE.Mesh(pcbGeo, [
      new THREE.MeshStandardMaterial({ map: gt, roughness: 0.9, metalness: 0.1 }),
      new THREE.MeshStandardMaterial({ color: 0x0a0f16, roughness: 0.7 })
    ])
  );
  pcbGrp.add(new THREE.LineSegments(new THREE.EdgesGeometry(pcbGeo, 25), lineMat(cA, 0.45)));
  g.add(pcbGrp);
  g.add(
    new THREE.Mesh(
      new THREE.PlaneGeometry(64, 64),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: cA } },
        vertexShader:
          'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader:
          'uniform vec3 uColor; varying vec2 vUv; void main(){ float d=length(vUv-.5)*2.; gl_FragColor=vec4(uColor, pow(max(1.-d,0.),2.2)*.09); }',
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    )
      .rotateX(-Math.PI / 2)
      .translateZ(0.02)
  );

  /* collision bookkeeping */
  const placed = [];
  const reserve = (x, z, w, d, m) => {
    m = m === undefined ? 0.35 : m;
    placed.push({ x, z, w: w + m * 2, d: d + m * 2 });
  };
  const isFree = (x, z, w, d) =>
    !placed.some(p => Math.abs(p.x - x) < (p.w + w) / 2 && Math.abs(p.z - z) < (p.d + d) / 2) &&
    Math.abs(x) < BX - 1.2 &&
    Math.abs(z) < BZ - 1.2 &&
    !holes.some(h => Math.hypot(h[0] - x, h[1] - z) < 1.6 + Math.max(w, d) / 2);

  /* generic IC / package */
  const glows = [],
    chipsL = [],
    defTop = labelTex('');
  function chipBox(x, z, w, d, h, o) {
    o = o || {};
    const y0 = o.y0 || 0;
    const top = new THREE.MeshStandardMaterial({ map: o.tex || defTop, roughness: 0.42, metalness: 0.35 });
    const chip = new THREE.Group();
    chip.position.set(x, y0 + h / 2, z);
    chip.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [darkM, darkM, top, darkM, darkM, darkM]));
    chip.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), edgeMat));
    if (o.glow) {
      const pu = { value: 1 },
        uh = { value: 0 };
      const gl = new THREE.Mesh(
        new THREE.PlaneGeometry(w * o.glow, d * o.glow),
        new THREE.ShaderMaterial({
          uniforms: { uColor: { value: cA }, uP: pu, uH: uh },
          vertexShader:
            'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
          fragmentShader:
            'uniform vec3 uColor; uniform float uP; uniform float uH; varying vec2 vUv; void main(){ vec2 p=abs(vUv-.5)*2.; float m=max(p.x,p.y); float a=smoothstep(1.,.05,m)*.30 + smoothstep(.80,.93,m)*(1.-smoothstep(.93,1.,m))*.65; gl_FragColor=vec4(mix(uColor, vec3(1.,.5,.2), uH), a*uP); }',
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      gl.rotation.x = -Math.PI / 2;
      gl.position.y = h / 2 + 0.02;
      chip.add(gl);
      glows.push({ pu, uh, kind: o.kind || '', phase: rnd() * 6.28 });
    }
    g.add(chip);
    if (!o.noReserve) {
      reserve(x, z, w, d);
      chipsL.push({ x, z, w, d });
    }
    return chip;
  }

  /* main silicon */
  const CPU = { x: -6, z: -1 },
    GPU = { x: 5, z: -2.2 };
  let names = hwNames(LOAD.hw),
    namesHw = LOAD.hw; // refreshed in update() when the helper's data arrives
  const cpuTex = labelTex(names.cpuChip),
    gpuTex = labelTex(names.gpuChip);
  chipBox(CPU.x, CPU.z, 6.2, 6.2, 0.55, { tex: cpuTex, glow: 0.5, kind: 'cpu' });
  chipBox(GPU.x, GPU.z, 5.8, 5.8, 0.55, { tex: gpuTex, glow: 0.5, kind: 'gpu' });
  chipBox(10.2, -3.9, 2.2, 2.8, 0.4, { glow: 0.4, kind: 'gpu' });
  chipBox(10.2, -0.5, 2.2, 2.8, 0.4, { glow: 0.4, kind: 'gpu' });

  /* VRM inductors + capacitors (instanced) */
  const indPos = [];
  for (let i = 0; i < 7; i++) indPos.push([-11.9, -3.8 + i * 1.0]);
  for (let i = 0; i < 7; i++) indPos.push([-10 + i * 1.25, -5.4]);
  for (let i = 0; i < 6; i++) indPos.push([2.4 + i * 1.1, 2.5]);
  const indM = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.05, 0.75, 0.9),
    metal(0x1d252f, 0.35, 0.7),
    indPos.length
  );
  const ob = new THREE.Object3D();
  indPos.forEach((p, i) => {
    ob.position.set(p[0], 0.375, p[1]);
    ob.updateMatrix();
    indM.setMatrixAt(i, ob.matrix);
    reserve(p[0], p[1], 1.05, 0.9, 0.1);
  });
  g.add(indM);
  const capPos = [];
  for (let i = 0; i < 14; i++) capPos.push([-16.3 + i * 0.95, -8.2]);
  for (let i = 0; i < 9; i++) capPos.push([-14.4, -5.6 + i * 0.95]);
  for (let i = 0; i < 8; i++) capPos.push([1.6 + i * 0.95, 4.7]);
  const capM = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.55, 16),
    metal(0x9aa3b0, 0.3, 0.85),
    capPos.length
  );
  capPos.forEach((p, i) => {
    ob.position.set(p[0], 0.275, p[1]);
    ob.updateMatrix();
    capM.setMatrixAt(i, ob.matrix);
    reserve(p[0], p[1], 0.7, 0.7, 0.1);
  });
  g.add(capM);

  /* memory sticks (DDR4 SODIMM ×2) */
  const goldM = metal(0x8f7a4a, 0.35, 0.9),
    ramPcb = new THREE.MeshStandardMaterial({ color: 0x10161e, roughness: 0.55, metalness: 0.3 });
  [
    [-11, 6.0],
    [-11, 9.9]
  ].forEach(([sx, sz]) => {
    const st = new THREE.Group();
    st.position.set(sx, 0, sz);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.45, 0.9), darkM);
    slot.position.set(0, 0.225, 1.5);
    st.add(slot);
    const card = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.14, 3.75), ramPcb);
    card.position.set(0, 0.55, 0);
    st.add(card);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(8.4, 0.14, 3.75)), edgeMat);
    edge.position.copy(card.position);
    st.add(edge);
    const cont = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.15, 0.3), goldM);
    cont.position.set(0, 0.55, 1.7);
    st.add(cont);
    for (let i = 0; i < 4; i++) {
      const ic = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 1.7), darkM);
      ic.position.set(-2.6 + i * 1.75, 0.68, -0.3);
      st.add(ic);
    }
    g.add(st);
    reserve(sx, sz, 9, 4.2, 0.2);
  });

  /* M.2 NVMe SSD + Wi-Fi card */
  (function () {
    const st = new THREE.Group();
    st.position.set(6.5, 0, 9.3);
    const card = new THREE.Mesh(new THREE.BoxGeometry(10, 0.12, 2.75), ramPcb);
    card.position.y = 0.5;
    st.add(card);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(10, 0.12, 2.75)), edgeMat);
    e.position.y = 0.5;
    st.add(e);
    [
      [-1.6, 2.1, 2.1],
      [0.9, 2.1, 2.1],
      [3.3, 1.6, 1.6]
    ].forEach(a => {
      const ic = new THREE.Mesh(new THREE.BoxGeometry(a[1], 0.1, a[2]), darkM);
      ic.position.set(a[0], 0.62, 0);
      st.add(ic);
    });
    const slot = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 2.95), darkM);
    slot.position.set(-5.5, 0.2, 0);
    st.add(slot);
    const so = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.55, 12), metal(0xa0a9b5));
    so.position.set(5.2, 0.28, 0);
    st.add(so);
    g.add(st);
    reserve(6.5, 9.3, 10.6, 3.2, 0.2);
    const wf = new THREE.Group();
    wf.position.set(-2.2, 0, 6.6);
    const wc = new THREE.Mesh(new THREE.BoxGeometry(3.75, 0.12, 2.75), ramPcb);
    wc.position.y = 0.5;
    wf.add(wc);
    const we = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(3.75, 0.12, 2.75)), edgeMat);
    we.position.y = 0.5;
    wf.add(we);
    const wi = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 1.3), darkM);
    wi.position.set(-0.4, 0.62, 0);
    wf.add(wi);
    g.add(wf);
    reserve(-2.2, 6.6, 3.9, 2.9, 0.2);
    [
      [-0.9, 0x2a3038],
      [0.9, 0x9aa3b0]
    ].forEach(([oz, col], k) => {
      const curve = new THREE.CatmullRomCurve3([
        new V(-3.8, 0.62, 6.6 + oz * 0.5),
        new V(-5.2, 0.7, 5.0 - k * 0.5),
        new V(-9, 0.6, 3.2 - k * 0.6),
        new V(-14, 0.5, 4.6 - k),
        new V(-19.5, 0.4, 5.2 - k * 0.4)
      ]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.07, 6), metal(col, 0.5, 0.2)));
    });
  })();

  /* I/O edge ports + battery connector */
  const portM = metal(0x7d8896, 0.35, 0.85),
    portIn = new THREE.MeshBasicMaterial({ color: 0x020406 });
  [
    [-1, -4.2, 3.4],
    [-1, -0.6, 3.0],
    [-1, 3.0, 3.0],
    [1, -8.2, 3.4],
    [1, -3.6, 3.4],
    [1, 1.8, 2.6]
  ].forEach(([side, pz, pd]) => {
    const px = side * (BX - 1.0);
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.95, pd), portM);
    b.position.set(px, 0.48, pz);
    g.add(b);
    const inset = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, pd - 0.7), portIn);
    inset.position.set(side * (BX + 0.01), 0.48, pz);
    g.add(inset);
  });
  const dc = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 2.4, 20), portM);
  dc.rotation.z = Math.PI / 2;
  dc.position.set(-BX + 1.0, 0.85, -7.2);
  g.add(dc);
  const bat = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 1.5), metal(0x222b36, 0.5, 0.5));
  bat.position.set(14.5, 0.45, 10.4);
  g.add(bat);
  reserve(14.5, 10.4, 3.2, 1.5);

  /* cooling: fan assembly + fin stack + heatpipes + cold-plate outlines */
  const FAN = { x: 15.3, z: -5.4, r: 3.1, w: 7.4, d: 7.6, h: 1.1 };
  const shellM = metal(0x0d141c, 0.5, 0.6);
  const fan = new THREE.Group();
  fan.position.set(FAN.x, 0, FAN.z);
  const floorM = new THREE.Mesh(new THREE.BoxGeometry(FAN.w, 0.3, FAN.d), shellM);
  floorM.position.y = 0.15;
  fan.add(floorM);
  [
    [-FAN.w / 2 + 0.1, 0, 0.2, FAN.d],
    [FAN.w / 2 - 0.1, 0, 0.2, FAN.d],
    [0, FAN.d / 2 - 0.1, FAN.w, 0.2]
  ].forEach(([wx, wz, ww, wd]) => {
    const w = new THREE.Mesh(new THREE.BoxGeometry(ww, FAN.h, wd), shellM);
    w.position.set(wx, FAN.h / 2, wz);
    fan.add(w);
  });
  const shellEdge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(FAN.w, FAN.h, FAN.d)),
    lineMat(cA, 0.5)
  );
  shellEdge.position.y = FAN.h / 2;
  fan.add(shellEdge);
  const coverShape = new THREE.Shape();
  coverShape.moveTo(-FAN.w / 2, -FAN.d / 2);
  coverShape.lineTo(FAN.w / 2, -FAN.d / 2);
  coverShape.lineTo(FAN.w / 2, FAN.d / 2);
  coverShape.lineTo(-FAN.w / 2, FAN.d / 2);
  coverShape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, FAN.r + 0.12, 0, Math.PI * 2, true);
  coverShape.holes.push(hole);
  const cover = new THREE.Mesh(
    new THREE.ExtrudeGeometry(coverShape, { depth: 0.06, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({
      color: 0x101a26,
      roughness: 0.4,
      metalness: 0.5,
      transparent: true,
      opacity: 0.62
    })
  );
  cover.rotation.x = -Math.PI / 2;
  cover.position.y = FAN.h;
  fan.add(cover);
  const rimPts = [];
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * 6.2832;
    rimPts.push(new V(Math.cos(a) * (FAN.r + 0.12), FAN.h + 0.08, Math.sin(a) * (FAN.r + 0.12)));
  }
  fan.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rimPts), lineMat(cA, 0.8)));
  const spin = new THREE.Group();
  spin.position.y = 0.72;
  fan.add(spin);
  spin.add(new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.5, 36), metal(0x1b2531, 0.35, 0.75)));
  const hubPts = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * 6.2832;
    hubPts.push(new V(Math.cos(a) * 1.0, 0.26, Math.sin(a) * 1.0));
  }
  spin.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(hubPts), lineMat(cB, 0.7)));
  const bladeM = new THREE.MeshStandardMaterial({
    color: 0x3d4b5b,
    roughness: 0.35,
    metalness: 0.5,
    emissive: 0x101822
  });
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * 6.2832,
      bl = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.62, 0.06), bladeM);
    bl.position.set(Math.cos(a) * 2.0, 0, Math.sin(a) * 2.0);
    bl.rotation.y = -a + 0.62;
    spin.add(bl);
  }
  g.add(fan);
  reserve(FAN.x, FAN.z, FAN.w, FAN.d, 0.1);
  const FIN = { z: -10.4, d: 2.4 },
    finN = 31;
  const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, FAN.h, FIN.d), metal(0x8b96a5, 0.4, 0.8), finN);
  for (let i = 0; i < finN; i++) {
    ob.position.set(FAN.x - FAN.w / 2 + 0.2 + i * 0.24, FAN.h / 2, FIN.z);
    ob.updateMatrix();
    fins.setMatrixAt(i, ob.matrix);
  }
  g.add(fins);
  const finBase = new THREE.Mesh(new THREE.BoxGeometry(FAN.w, 0.18, FIN.d), metal(0x4b5563, 0.4, 0.8));
  finBase.position.set(FAN.x, 0.09, FIN.z);
  g.add(finBase);
  reserve(FAN.x, FIN.z, FAN.w, FIN.d, 0.1);

  /* cold plates (translucent) on mounting posts */
  const plateM = new THREE.MeshStandardMaterial({
    color: 0x6e5c4c,
    roughness: 0.5,
    metalness: 0.6,
    transparent: true,
    opacity: 0.3,
    depthWrite: false
  });
  const postM = metal(0x8a94a2, 0.4, 0.8),
    screwM = metal(0xb4bcc7, 0.3, 0.9);
  [
    [CPU.x, CPU.z, 7.6, 7.6],
    [6.5, -2.1, 10.8, 8.0]
  ].forEach(([px, pz, pw, pd]) => {
    const pl = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.1, pd), plateM);
    pl.position.set(px, 0.78, pz);
    g.add(pl);
    const pe = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(pw, 0.1, pd)), lineMat(cA, 0.5));
    pe.position.set(px, 0.78, pz);
    g.add(pe);
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1]
    ].forEach(([sx, sz]) => {
      const cx = px + sx * (pw / 2 - 0.35),
        cz = pz + sz * (pd / 2 - 0.35);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.78, 12), postM);
      post.position.set(cx, 0.39, cz);
      g.add(post);
      const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 16), screwM);
      sc.position.set(cx, 0.88, cz);
      g.add(sc);
      reserve(cx, cz, 0.9, 0.9, 0.1);
    });
  });

  /* flattened heatpipes: straight runs, tight bends, matte bronze that cools toward the fins */
  const pipeDefs = [
    {
      pts: [
        [-8.6, -2.9],
        [-1.2, -2.9],
        [0.8, -4.6],
        [5.2, -4.6],
        [9.8, -10.4],
        [17, -10.4]
      ],
      r: 1.4
    },
    {
      pts: [
        [-8.6, -4.2],
        [-3.0, -4.2],
        [4.8, -10.9],
        [17, -10.9]
      ],
      r: 1.8
    }
  ];
  const pipeM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0.35 });
  const pc0 = new THREE.Color(0.36, 0.21, 0.12),
    pc1 = new THREE.Color(0.21, 0.19, 0.18),
    pcc = new THREE.Color();
  const pipeSamples = [];
  pipeDefs.forEach(d => {
    const cp = roundedPath(d.pts, d.r);
    const tg = new THREE.TubeGeometry(cp, 220, 0.27, 10, false);
    const uv = tg.attributes.uv,
      col = new Float32Array(uv.count * 3);
    for (let i = 0; i < uv.count; i++) {
      pcc.copy(pc0).lerp(pc1, clamp(uv.getX(i) * 1.15, 0, 1));
      col[i * 3] = pcc.r;
      col[i * 3 + 1] = pcc.g;
      col[i * 3 + 2] = pcc.b;
    }
    tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pm = new THREE.Mesh(tg, pipeM);
    pm.scale.y = 0.5;
    pm.position.y = 0.97;
    g.add(pm);
    pipeSamples.push(resample(cp.getPoints(60), 300));
  });
  const HN = 9,
    hG = new THREE.BufferGeometry(),
    hTotal = HN * pipeDefs.length;
  hG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(hTotal * 3), 3));
  hG.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(hTotal).fill(0.2), 1));
  hG.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(hTotal), 1));
  hG.setAttribute('aHeat', new THREE.BufferAttribute(new Float32Array(hTotal), 1));
  g.add(
    new THREE.Points(
      hG,
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: cA }, uFog: U.uFog, uScale: U.uScale },
        vertexShader: PV_H,
        fragmentShader: PF_HEAT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    )
  );
  const hPos = hG.attributes.position.array,
    hAl = hG.attributes.aAlpha.array,
    hHeat = hG.attributes.aHeat.array;
  let heatPhase = 0;
  function heatUpdate(dt, act) {
    heatPhase += dt * (0.03 + 0.11 * act) * speedMul;
    pipeSamples.forEach((sm, k) => {
      for (let i = 0; i < HN; i++) {
        const u = (i / HN + heatPhase * (1 + k * 0.16)) % 1,
          f = clamp(u, 0, 0.9999) * (sm.length - 1),
          i0 = Math.floor(f),
          q = f - i0,
          A = sm[i0],
          B = sm[Math.min(i0 + 1, sm.length - 1)];
        const j = k * HN + i;
        hPos[j * 3] = A.x + (B.x - A.x) * q;
        hPos[j * 3 + 1] = 1.12;
        hPos[j * 3 + 2] = A.z + (B.z - A.z) * q;
        hAl[j] = Math.pow(Math.sin(Math.PI * u), 0.7) * 0.7 * (0.25 + 0.75 * act);
        hHeat[j] = (1 - u) * (0.35 + 0.65 * act);
      }
    });
    hG.attributes.position.needsUpdate = hG.attributes.aAlpha.needsUpdate = hG.attributes.aHeat.needsUpdate = true;
  }

  /* misc ICs + SMD */
  let tries = 0,
    ics = 0;
  while (ics < 26 && tries++ < 900) {
    const w = 1.1 + rnd() * 1.3,
      d = 1.1 + rnd() * 1.3,
      x = (rnd() * 2 - 1) * BX,
      z = (rnd() * 2 - 1) * BZ;
    if (isFree(x, z, w, d)) {
      chipBox(x, z, w, d, 0.26 + rnd() * 0.12);
      ics++;
    }
  }
  const smdN = 420,
    smd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.1, 0.14), metal(0x4a5361, 0.5, 0.4), smdN);
  let si = 0;
  tries = 0;
  while (si < smdN && tries++ < 8000) {
    const x = (rnd() * 2 - 1) * (BX - 1),
      z = (rnd() * 2 - 1) * (BZ - 1);
    if (!isFree(x, z, 0.3, 0.3)) continue;
    ob.position.set(x, 0.05, z);
    ob.rotation.y = rnd() < 0.5 ? 0 : Math.PI / 2;
    ob.updateMatrix();
    smd.setMatrixAt(si++, ob.matrix);
  }
  ob.rotation.y = 0;
  smd.count = si;
  g.add(smd);

  /* status LEDs */
  const LEDS = [
    { n: 'PWR', x: -18.5, z: -5.6, c: 0x7fe8ff, mode: 'pwr' },
    { n: 'CHG', x: -18.5, z: -4.7, c: 0xffb347, mode: 'chg' },
    { n: 'CPU', x: -2.4, z: -4.5, c: 0x7dff9f, mode: 'cpu' },
    { n: 'GPU', x: 8.6, z: -6.1, c: 0x7dff9f, mode: 'gpu' },
    { n: 'SSD', x: 12.6, z: 8.5, c: 0x6ea8ff, mode: 'ssd' },
    { n: 'NET', x: -0.2, z: 5.2, c: 0xffd36a, mode: 'net' },
    { n: 'RAM', x: -6.0, z: 8.1, c: 0xc79bff, mode: 'ram' }
  ];
  LEDS.forEach(L => {
    L.col = new THREE.Color(L.c);
    L.v = 0;
    L.ph = rnd() * 50;
    L.t = 0;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.12, 0.2),
      new THREE.MeshBasicMaterial({ color: 0x0c1118 })
    );
    body.position.set(L.x, 0.07, L.z);
    g.add(body);
    L.lens = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    L.lens.position.set(L.x, 0.15, L.z);
    g.add(L.lens);
    L.gg = pointsGeo(1);
    L.gg.attributes.position.setXYZ(0, L.x, 0.2, L.z);
    L.gg.attributes.aSize.array[0] = 0.8;
    g.add(new THREE.Points(L.gg, pointMat(PF_GLOW, L.col)));
  });
  function ledUpdate(t, dt, act) {
    LEDS.forEach(L => {
      let target;
      if (L.mode === 'pwr')
        target = 0.8 - 0.25 * LOAD.mus + (0.2 + 0.25 * LOAD.mus) * Math.sin(t * (1.3 + 4.5 * LOAD.mus) + L.ph);
      else if (L.mode === 'chg')
        target = LOAD.chg
          ? LOAD.bat >= 99
            ? 0.4
            : 0.45 + 0.55 * Math.abs(Math.sin(t * 1.2))
          : LOAD.bat < 20
            ? Math.sin(t * 7) > 0
              ? 1
              : 0.06
            : 0.06;
      else if (L.mode === 'ram') target = Math.sin(t * (1.2 + 5 * LOAD.ram) + L.ph) > 1.1 - 2.2 * LOAD.ram ? 1 : 0.08;
      else if (L.mode === 'cpu') target = Math.sin(t * (2 + 10 * LOAD.cpu) + L.ph) > 0 - LOAD.cpu * 1.2 ? 1 : 0.08;
      else if (L.mode === 'gpu') target = Math.sin(t * (1.5 + 9 * LOAD.gpu) + L.ph) > 0.3 - LOAD.gpu * 1.4 ? 1 : 0.08;
      else {
        L.t -= dt;
        if (L.t <= 0) {
          L.on = !L.on;
          L.t = L.on
            ? 0.03 + Math.random() * 0.07
            : (0.05 + Math.random() * 0.5) / (L.mode === 'net' ? 0.12 + 4.5 * LOAD.net : 0.3 + 1.6 * act);
        }
        target = L.on ? 1 : 0.06;
      }
      L.v += (target - L.v) * Math.min(1, dt * 18);
      L.lens.material.color.setRGB(
        L.col.r * (0.12 + 0.88 * L.v),
        L.col.g * (0.12 + 0.88 * L.v),
        L.col.b * (0.12 + 0.88 * L.v)
      );
      L.gg.attributes.aAlpha.array[0] = 0.08 + 0.9 * L.v;
      L.gg.attributes.aAlpha.needsUpdate = true;
    });
  }

  /* silkscreen: printed reference designators, outlines and labels */
  (function () {
    const W = 2048,
      H = Math.round((W * (BZ * 2)) / (BX * 2)),
      c = makeCanvas(W, H),
      x = c.getContext('2d');
    const kx = W / (BX * 2),
      kz = H / (BZ * 2),
      PX = u => (u + BX) * kx,
      PZ = u => (u + BZ) * kz;
    const FONT = '600 25px ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace';
    const col = 'rgba(214,224,238,0.62)',
      dim = 'rgba(214,224,238,0.26)';
    x.textBaseline = 'middle';
    x.font = FONT;
    const txt = (t, u, v, a, cl, sz) => {
      x.fillStyle = cl || col;
      x.textAlign = a || 'left';
      if (sz) x.font = sz;
      x.fillText(t, PX(u), PZ(v));
      x.font = FONT;
    };
    const box = (cx, cz, w, d, m) => {
      x.strokeStyle = dim;
      x.lineWidth = 2;
      x.strokeRect(PX(cx - w / 2 - m), PZ(cz - d / 2 - m), (w + m * 2) * kx, (d + m * 2) * kz);
    };
    const dot = (u, v, r) => {
      x.fillStyle = col;
      x.beginPath();
      x.arc(PX(u), PZ(v), r, 0, 7);
      x.fill();
    };
    /* ICs */
    chipsL.forEach((ch, i) => {
      const big = i < 3;
      box(ch.x, ch.z, ch.w, ch.d, big ? 0.35 : 0.2);
      dot(ch.x - ch.w / 2 - (big ? 0.35 : 0.2) + 0.28, ch.z - ch.d / 2 - (big ? 0.35 : 0.2) + 0.28, 4);
      const nm = i === 0 ? 'U1 CPU' : i === 1 ? 'U2 GPU' : 'U' + (i + 1);
      txt(nm, ch.x - ch.w / 2 - 0.2, ch.z + ch.d / 2 + (big ? 0.75 : 0.5));
    });
    /* capacitors / inductors */
    capPos.forEach((p, i) => {
      if (i % 5 === 0)
        txt(
          'C' + ((i / 5) * 4 + 1),
          p[0] - 0.35,
          p[1] + 0.85,
          'left',
          dim,
          '600 21px ui-monospace, Menlo, Consolas, monospace'
        );
    });
    indPos.forEach((p, i) => {
      if (i % 7 === 3)
        txt('L' + (i + 1), p[0] + 0.7, p[1] - 0.8, 'left', dim, '600 21px ui-monospace, Menlo, Consolas, monospace');
    });
    /* modules and connectors */
    txt('DIMM1', -6.2, 4.3);
    txt('DIMM2', -6.2, 8.2);
    txt('M.2 NVME', 1.7, 7.7);
    txt('WLAN', -4.0, 5.0);
    txt('BAT+', 12.4, 9.1);
    txt('DC IN', -19.6, -5.4);
    txt('I/O', 17.4, -11.0);
    txt('VRM', -13.3, -6.6);
    /* board identity */
    txt('MSI THIN', -19.6, 10.6, 'left', 'rgba(214,224,238,0.7)', '700 30px ui-monospace, Menlo, Consolas, monospace');
    txt('REV 1.0', -19.6, 11.3, 'left', dim);
    LEDS.forEach(L =>
      txt(L.n, L.x - 0.5, L.z + 0.62, 'left', dim, '600 20px ui-monospace, Menlo, Consolas, monospace')
    );
    /* fiducials */
    [
      [-19.6, -10.6],
      [19.6, -10.6],
      [19.2, 9.6]
    ].forEach(p => {
      x.strokeStyle = col;
      x.lineWidth = 2;
      x.beginPath();
      x.arc(PX(p[0]), PZ(p[1]), 9, 0, 7);
      x.stroke();
      dot(p[0], p[1], 3);
    });
    const tx = new THREE.CanvasTexture(c);
    tx.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const sil = new THREE.Mesh(
      new THREE.PlaneGeometry(BX * 2, BZ * 2),
      new THREE.MeshBasicMaterial({
        map: tx,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      })
    );
    sil.rotation.x = -Math.PI / 2;
    sil.position.y = 0.014;
    g.add(sil);
  })();

  /* traces & buses */
  const paths = [];
  function bus(ax, az, bx, bz, lanes, sp) {
    const base = routePath(ax, az, bx, bz);
    for (let k = 0; k < lanes; k++) paths.push(miterPts(base, (k - (lanes - 1) / 2) * (sp || 0.3)));
  }
  bus(-8.2, 2.3, -9.6, 4.6, 8);
  bus(-6.2, 2.3, -8.6, 8.2, 8);
  bus(-3.4, 2.3, 1.2, 8.6, 8, 0.26);
  bus(-2.9, -1.5, 2.1, -2.6, 10, 0.3);
  bus(7.9, -3.6, 9.1, -3.9, 5, 0.3);
  bus(7.9, 0.1, 9.1, -0.5, 5, 0.3);
  bus(-4.5, 2.3, -3.2, 5.2, 4);
  bus(-11.2, -1.8, -9.2, -1.2, 3, 0.4);
  bus(-4.4, -4.4, -4.4, -5.0, 3, 0.4);
  const HX = 19.5,
    HZ = 10.8;
  const dirs = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1]
  ];
  for (let i = 0; i < 70; i++) {
    let x = Math.round((rnd() * 2 - 1) * HX),
      z = Math.round((rnd() * 2 - 1) * HZ),
      d = Math.floor(rnd() * 8);
    const pts = [new V(x, 0.03, z)],
      segs = 3 + Math.floor(rnd() * 3);
    for (let s = 0; s < segs; s++) {
      const len = 2 + Math.floor(rnd() * 7),
        nx = x + dirs[d][0] * len,
        nz = z + dirs[d][1] * len;
      if (Math.abs(nx) > HX || Math.abs(nz) > HZ) break;
      x = nx;
      z = nz;
      pts.push(new V(x, 0.03, z));
      d = (d + (rnd() < 0.5 ? 1 : 7)) % 8;
    }
    if (pts.length >= 2) paths.push(pts);
  }
  const dimPos = [],
    brightPos = [];
  paths.forEach((p, idx) => {
    const arr = idx % 5 === 0 ? brightPos : dimPos;
    for (let i = 1; i < p.length; i++) arr.push(p[i - 1].x, p[i - 1].y, p[i - 1].z, p[i].x, p[i].y, p[i].z);
  });
  [
    [dimPos, lineMat(cDim, 1.0)],
    [brightPos, lineMat(cA, 0.42)]
  ].forEach(([arr, mat]) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3));
    g.add(new THREE.LineSegments(geo, mat));
  });
  const padG = pointsGeo(paths.length * 2);
  {
    const pp = padG.attributes.position.array,
      ps = padG.attributes.aSize.array,
      pa = padG.attributes.aAlpha.array;
    paths.forEach((p, i) =>
      [p[0], p[p.length - 1]].forEach((v, k) => {
        const j = i * 2 + k;
        pp[j * 3] = v.x;
        pp[j * 3 + 1] = 0.05;
        pp[j * 3 + 2] = v.z;
        ps[j] = 0.34;
        pa[j] = 0.45;
      })
    );
  }
  g.add(new THREE.Points(padG, pointMat(PF_RING, cA)));
  holes.forEach(([hx, hz]) => {
    const r = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        Array.from(
          { length: 33 },
          (_, i) => new V(hx + Math.cos((i / 32) * 6.2832) * 0.95, 0.02, hz + Math.sin((i / 32) * 6.2832) * 0.95)
        )
      ),
      lineMat(cA, 0.4)
    );
    g.add(r);
  });

  /* pulses */
  const pd = paths.map(p => {
    const cum = [0];
    for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + p[i].distanceTo(p[i - 1]));
    return { pts: p, cum, len: cum[cum.length - 1] };
  });
  function sample(d, s, out) {
    s = clamp(s, 0, d.len);
    let i = 1;
    while (i < d.cum.length - 1 && d.cum[i] < s) i++;
    out.lerpVectors(d.pts[i - 1], d.pts[i], (s - d.cum[i - 1]) / (d.cum[i] - d.cum[i - 1] || 1));
  }
  const PN = 100,
    TR = 14,
    pulses = [];
  for (let i = 0; i < PN; i++) {
    const d = pd[Math.floor(rnd() * pd.length)];
    pulses.push({ d, speed: 2.2 + rnd() * 4.2, s: rnd() * (d.len + 14), trail: 2.2 + rnd() * 2, gap: 2 + rnd() * 14 });
  }
  const pG = pointsGeo(PN * TR),
    pPos = pG.attributes.position.array,
    pSz = pG.attributes.aSize.array,
    pAl = pG.attributes.aAlpha.array;
  g.add(new THREE.Points(pG, pointMat(PF_GLOW, cB)));
  const tmp = new V();
  const DN = 220,
    dG = pointsGeo(DN),
    dp = dG.attributes.position.array,
    dsz = dG.attributes.aSize.array,
    dal = dG.attributes.aAlpha.array;
  for (let i = 0; i < DN; i++) {
    dp[i * 3] = (rnd() * 2 - 1) * 34;
    dp[i * 3 + 1] = rnd() * 15;
    dp[i * 3 + 2] = (rnd() * 2 - 1) * 28;
    dsz[i] = 0.05 + rnd() * 0.07;
    dal[i] = 0.2 + rnd() * 0.4;
  }
  g.add(new THREE.Points(dG, pointMat(PF_GLOW, cB)));

  const hemi = new THREE.HemisphereLight(0x7f8fa6, 0x04060a, 0.7);
  const dir = new THREE.DirectionalLight(0xdbe6ff, 0.9);
  dir.position.set(-12, 22, 10);
  const pl = new THREE.PointLight(0xffffff, 1.6, 40, 1.6);
  pl.position.set(0, 8, 0);
  g.add(hemi, dir, pl);

  const hot = [
    {
      get n() {
        return names.cpuName;
      },
      f: () => 'CPU · ' + Math.round(LOAD.cpu * 100) + '%',
      p: [CPU.x, 0.8, CPU.z]
    },
    {
      get n() {
        return names.gpuName;
      },
      f: () => 'GPU · ' + (LOAD.gpuNA ? 'no reading' : Math.round(LOAD.gpu * 100) + '%'),
      p: [GPU.x, 0.8, GPU.z]
    },
    { n: 'VRAM', f: () => 'video memory' + (names.vram ? ' · ' + names.vram : ''), p: [10.2, 0.5, -3.9] },
    { n: 'VRAM', f: () => 'video memory' + (names.vram ? ' · ' + names.vram : ''), p: [10.2, 0.5, -0.5] },
    {
      get n() {
        return names.ram;
      },
      f: () => 'RAM · ' + Math.round(LOAD.ram * 100) + '%',
      p: [-11, 0.8, 6.0]
    },
    {
      get n() {
        return names.ram;
      },
      f: () => 'RAM · ' + Math.round(LOAD.ram * 100) + '%',
      p: [-11, 0.8, 9.9]
    },
    { n: 'M.2 NVMe SSD', f: () => 'storage', p: [6.5, 0.8, 9.3] },
    { n: 'Wi-Fi module', f: () => 'net · ' + Math.round(LOAD.net * 100) + '%', p: [-2.2, 0.8, 6.6] },
    {
      n: 'Cooling fan',
      f: () => '≈ ' + Math.round(1800 + 4200 * clamp(Math.max(LOAD.cpu, LOAD.gpu), 0, 1)) + ' RPM (est.)',
      p: [FAN.x, 1.2, FAN.z]
    },
    { n: 'Heatsink fins', f: () => 'exhaust', p: [FAN.x, 0.7, FIN.z] },
    { n: 'Heat pipes', f: () => 'copper · CPU+GPU', p: [1.5, 1.1, -4.2] },
    { n: 'VRM', f: () => 'power stage', p: [-11.9, 0.8, -1] },
    { n: 'VRM', f: () => 'power stage', p: [-5, 0.8, -5.4] },
    {
      n: 'Battery connector',
      f: () => (!LOAD.hasBat ? 'no battery · AC power' : LOAD.bat + '% · ' + (LOAD.chg ? 'plugged in' : 'on battery')),
      p: [14.5, 0.9, 10.4]
    },
    { n: 'DC jack', f: () => 'power input', p: [-BX + 1, 0.9, -7.2] },
    { n: 'I/O ports', f: () => 'USB · HDMI', p: [BX - 1, 0.9, -3.6] },
    { n: 'I/O ports', f: () => 'USB-C', p: [-BX + 1, 0.9, -0.6] }
  ];
  LEDS.forEach(L => hot.push({ n: L.n + ' LED', f: () => (L.v > 0.5 ? 'on' : 'idle'), p: [L.x, 0.2, L.z], r: 38 }));
  hot.forEach(h => {
    h.v = new V(h.p[0], h.p[1], h.p[2]);
  });

  return {
    group: g,
    fov: 32,
    fog: 0.01,
    onPalette() {
      pl.color.copy(cA);
    },
    update(t, dt) {
      const act = clamp(Math.max(LOAD.cpu, LOAD.gpu), 0, 1),
        nAct = Math.floor(PN * (0.2 + 0.8 * act)),
        spd = 0.55 + 1.3 * act;
      for (let i = 0; i < PN; i++) {
        const p = pulses[i];
        if (i >= nAct) {
          for (let k = 0; k < TR; k++) pAl[i * TR + k] = 0;
          continue;
        }
        p.s += p.speed * dt * speedMul * spd;
        const cyc = p.d.len + p.trail + p.gap,
          head = p.s % cyc;
        for (let k = 0; k < TR; k++) {
          const j = i * TR + k,
            ss = head - k * (p.trail / TR);
          if (ss < 0 || ss > p.d.len) {
            pAl[j] = 0;
            continue;
          }
          sample(p.d, ss, tmp);
          pPos[j * 3] = tmp.x;
          pPos[j * 3 + 1] = 0.07;
          pPos[j * 3 + 2] = tmp.z;
          const f = 1 - k / TR;
          pAl[j] = Math.pow(f, 1.6) * (k === 0 ? 1.0 : 0.8);
          pSz[j] = k === 0 ? 0.32 : 0.15 + 0.11 * f;
        }
      }
      pG.attributes.position.needsUpdate = pG.attributes.aSize.needsUpdate = pG.attributes.aAlpha.needsUpdate = true;
      for (let i = 0; i < DN; i++) {
        dp[i * 3 + 1] += dt * 0.25 * speedMul;
        if (dp[i * 3 + 1] > 15) dp[i * 3 + 1] = 0;
      }
      dG.attributes.position.needsUpdate = true;
      glows.forEach(c => {
        const L = c.kind === 'cpu' ? LOAD.cpu : c.kind === 'gpu' ? LOAD.gpu : act;
        c.pu.value =
          (0.42 + 0.78 * L) * (0.86 + 0.14 * Math.sin(t * 0.8 + c.phase)) * (1 + 0.16 * LOAD.mus * Math.sin(t * 4.4));
        c.uh.value = smooth(0.3, 1.0, L);
      });
      spin.rotation.y -= dt * (0.9 + 6.2 * act) * speedMul;
      heatUpdate(dt, act);
      pl.position.set(Math.sin(t * 0.18) * 14, 8, Math.cos(t * 0.13) * 9);
      const a = 0.55 + Math.sin(t * 0.045) * 0.13;
      camera.position.set(Math.sin(a) * 40 + mx * 2.2, 31 - my * 1.5, Math.cos(a) * 40);
      camera.lookAt(mx * 1.5, 0, my * 1.2 + 0.5);
      ledUpdate(t, dt, act);
      if (LOAD.hw !== namesHw) {
        // hardware names arrived (or changed): redraw the chip labels
        namesHw = LOAD.hw;
        const nn = hwNames(namesHw);
        if (nn.cpuChip !== names.cpuChip) relabel(cpuTex, nn.cpuChip);
        if (nn.gpuChip !== names.gpuChip) relabel(gpuTex, nn.gpuChip);
        names = nn;
      }
      hoverUpdate(hot, dt);
    }
  };
}
