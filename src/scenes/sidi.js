/**
 * sidi.js — "Sidi Bou Said, dusk".
 *
 * A window in a white-and-blue hillside village: iron grille and shutters at arm's
 * length, a terrace below, rooftops stepping down to the Gulf of Tunis, Boukornine
 * across the bay. Everything is built in code: no textures or models are loaded.
 *
 * Units are metres. The window is the screen: centred on the origin in the z = 0
 * plane, `2*hw` wide, `2*hh` tall. The village is at z < 0; a few petals drift to z > 0.
 */
import * as THREE from 'three';

const SEA_Y = -16;
const SUN_DIR = new THREE.Vector3(0.42, 0.085, -0.9).normalize();

const C = {
  white: 0xf3ede2, whiteWarm: 0xefe4d2, whiteCool: 0xe9ecf0,
  blue: 0x1f6fbf, blueDeep: 0x174f8c, blueLight: 0x3f8fd8,
  terracotta: 0xb5673e, stone: 0xcbbfa8, ochre: 0xc9a25c,
  leaf: 0x2f5d34, palm: 0x35602f, trunk: 0x6b5540, cypress: 0x1f3a26,
  earth: 0x5a4a3a, cat: 0x17120f,
};

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Shared GLSL: the sky as a function of view direction, used by the dome and by the sea's reflection.
const SKY_GLSL = /* glsl */`
vec3 skyColor(vec3 d, vec3 sunDir) {
  float h = clamp(d.y, -0.05, 1.0);
  vec2 dh = normalize(d.xz + vec2(1e-5));
  vec2 sh = normalize(sunDir.xz);
  float az = max(dot(dh, sh), 0.0);
  vec3 horWarm = vec3(1.00, 0.50, 0.17);
  vec3 horCool = vec3(0.62, 0.34, 0.46);
  vec3 hor  = mix(horCool, horWarm, pow(az, 2.2));
  vec3 mid  = mix(vec3(0.27, 0.23, 0.52), vec3(0.72, 0.34, 0.40), pow(az, 3.0) * 0.75);
  vec3 high = vec3(0.075, 0.10, 0.31);
  vec3 zen  = vec3(0.02, 0.03, 0.12);
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.11, h));
  c = mix(c, high, smoothstep(0.07, 0.30, h));
  c = mix(c, zen,  smoothstep(0.28, 0.9, h));
  float s = max(dot(d, sunDir), 0.0);
  c += vec3(1.0, 0.46, 0.15) * pow(s, 22.0) * 0.42;
  c += vec3(1.0, 0.70, 0.36) * pow(s, 320.0) * 1.0;
  return c;
}`;

const NOISE_GLSL = /* glsl */`
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}`;

function glowTexture(inner = 'rgba(255,220,160,1)', outer = 'rgba(255,150,60,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(0.25, 'rgba(255,190,110,0.55)'); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function cloudTexture(rand) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 192;
  const g = c.getContext('2d');
  for (let i = 0; i < 46; i++) {
    const x = 60 + rand() * 392, y = 70 + (rand() - 0.5) * 60 + Math.abs(x - 256) * 0.08;
    const r = 26 + rand() * 46;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function kilimTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const cols = ['#8e1f2b', '#e8d9b8', '#1c3f6e', '#c9782f', '#8e1f2b', '#22302a', '#e8d9b8', '#8e1f2b'];
  let y = 0; let i = 0;
  while (y < 128) { const h = 6 + ((i * 7) % 5) * 4; g.fillStyle = cols[i % cols.length]; g.fillRect(0, y, 256, h); y += h; i++; }
  g.fillStyle = '#e8d9b8';
  for (let x = 8; x < 256; x += 24) for (const yy of [30, 64, 98]) {
    g.beginPath(); g.moveTo(x, yy); g.lineTo(x + 7, yy - 6); g.lineTo(x + 14, yy); g.lineTo(x + 7, yy + 6); g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function moonTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#fff6dd';
  g.beginPath(); g.arc(118, 128, 70, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.arc(146, 118, 62, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'source-over';
  // a single bright star beside the crescent
  const sx = 196, sy = 96; g.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 6 : 15, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); }
  g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildSidi({ scene, hw, hh }) {
  const rand = mulberry(1881);
  const R = (a, b) => a + rand() * (b - a);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const animated = [];          // callbacks (t, dt)
  const root = new THREE.Group();
  scene.add(root);

  scene.fog = new THREE.FogExp2(0x8a6690, 0.0036);

  // ── materials ──────────────────────────────────────────────────────────────
  const std = (color, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
  const M = {
    plaster: [std(C.white, 0.95), std(C.whiteWarm, 0.95), std(C.whiteCool, 0.95)],
    blue: std(C.blue, 0.6), blueDeep: std(C.blueDeep, 0.6), blueLight: std(C.blueLight, 0.6),
    iron: std(C.blue, 0.45, { metalness: 0.3 }),
    terracotta: std(C.terracotta, 0.85), stone: std(C.stone, 0.9), ochre: std(C.ochre, 0.9),
    leaf: std(C.leaf, 0.8, { side: THREE.DoubleSide }), palm: std(C.palm, 0.75, { side: THREE.DoubleSide }),
    trunk: std(C.trunk, 0.95), cypress: std(C.cypress, 0.95), earth: std(C.earth, 1.0),
    cat: std(C.cat, 0.7),
    glowWin: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.52, 0.16).multiplyScalar(1.9) }),
    glowLamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.62, 0.24).multiplyScalar(2.6) }),
    dark: std(0x1b1a22, 0.9),
  };
  const G = {
    box: new THREE.BoxGeometry(1, 1, 1),
    disc: new THREE.CylinderGeometry(0.5, 0.5, 1, 28).rotateX(Math.PI / 2),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
    dome: new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    sphere: new THREE.SphereGeometry(1, 16, 12),
    cone: new THREE.ConeGeometry(1, 1, 10),
    blob: new THREE.IcosahedronGeometry(1, 1),
  };
  const glowTex = glowTexture();

  function mesh(geo, mat, parent, x, y, z, sx = 1, sy = 1, sz = 1, shadow = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    if (shadow) { m.castShadow = true; m.receiveShadow = true; }
    parent.add(m); return m;
  }
  const box = (mat, p, x, y, z, w, h, d, shadow = true) => mesh(G.box, mat, p, x, y, z, w, h, d, shadow);

  function glow(parent, x, y, z, size, opacity = 0.9) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: false }));
    s.position.set(x, y, z); s.scale.setScalar(size); parent.add(s); return s;
  }

  // ── lights ─────────────────────────────────────────────────────────────────
  scene.add(new THREE.HemisphereLight(0x6f7fe0, 0xc98a78, 0.78));
  const sun = new THREE.DirectionalLight(0xff9a52, 3.0);
  sun.position.copy(new THREE.Vector3(0.42, 0.20, -0.9).normalize().multiplyScalar(70));   // a little higher than the visible sun, to keep shadows readable
  sun.target.position.set(0, -4, -22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 22, bottom: -22, near: 1, far: 160 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xb58fd6, 0.42);       // sky bounce onto the faces turned to the viewer
  fill.position.set(-0.4, 0.5, 1); scene.add(fill);

  // ── sky dome ───────────────────────────────────────────────────────────────
  const skyUniforms = { sunDir: { value: SUN_DIR }, time: { value: 0 } };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(6000, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 sunDir; uniform float time; varying vec3 vDir; ${NOISE_GLSL} ${SKY_GLSL}
        void main(){
          vec3 d = normalize(vDir);
          vec3 c = skyColor(d, sunDir);
          float s = max(dot(d, sunDir), 0.0);
          c += vec3(3.4, 2.1, 1.0) * smoothstep(0.99975, 0.99987, s);                 // sun disc
          // stars: only high up, twinkling
          vec2 sp = d.xz / (abs(d.y) + 0.35) * 90.0;
          float st = step(0.90, hash21(floor(sp))) * smoothstep(0.10, 0.34, d.y) * smoothstep(0.16, 0.03, length(fract(sp) - 0.5 - (vec2(hash21(floor(sp) + 3.1), hash21(floor(sp) + 9.7)) - 0.5) * 0.6));
          st *= 0.55 + 0.45 * sin(time * 2.0 + hash21(floor(sp) + 7.0) * 40.0);
          c += vec3(0.95, 0.95, 1.0) * st * 1.3;
          gl_FragColor = vec4(c, 1.0);
        }`,
    })
  );
  sky.frustumCulled = false; sky.renderOrder = -10; root.add(sky);
  animated.push((t) => { skyUniforms.time.value = t; });

  // crescent and star, upper left
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: moonTexture(), transparent: true, depthWrite: false, fog: false, color: new THREE.Color(1.5, 1.45, 1.3) }));
  moon.position.set(-560, 1180, -4200); moon.scale.setScalar(300); moon.rotation.z = 0.5; root.add(moon);

  // clouds: soft billboards catching the last light from below
  for (let i = 0; i < 9; i++) {
    const tex = cloudTexture(rand);
    const x = R(-3200, 3200), y = R(260, 900), z = R(-4300, -3000);
    const warm = THREE.MathUtils.clamp(1 - Math.abs(x - 1500) / 2600, 0, 1) * (1 - (y - 260) / 900);
    const col = new THREE.Color(0x8d6aa8).lerp(new THREE.Color(0xff9a5a), warm).multiplyScalar(0.95 + warm * 0.6);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, color: col, transparent: true, depthWrite: false, fog: false, opacity: 0.9 }));
    m.position.set(x, y, z); m.scale.set(R(900, 1900), R(260, 480), 1); root.add(m);
    const speed = R(1.5, 4);
    animated.push((t) => { m.position.x = x + t * speed; });
  }

  // ── sea ────────────────────────────────────────────────────────────────────
  const seaUniforms = { sunDir: { value: SUN_DIR }, time: { value: 0 }, camPos: { value: new THREE.Vector3() } };
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(14000, 9000).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      fog: false, uniforms: seaUniforms,
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 sunDir; uniform vec3 camPos; uniform float time; varying vec3 vW; ${NOISE_GLSL} ${SKY_GLSL}
        void main(){
          vec3 V = normalize(vW - camPos);
          float dist = length(vW - camPos);
          vec2 p = vW.xz;
          float a = 0.20 / (1.0 + dist * 0.0009);
          float nx = (vnoise(p * 0.21 + time * vec2(0.22, 0.10)) - 0.5) + 0.6 * (vnoise(p * 0.63 - time * vec2(0.15, 0.27)) - 0.5) + 0.35 * (vnoise(p * 1.9 + time * 0.4) - 0.5);
          float nz = (vnoise(p * 0.19 - time * vec2(0.12, 0.21) + 31.7) - 0.5) + 0.6 * (vnoise(p * 0.57 + time * vec2(0.24, 0.11) + 12.3) - 0.5) + 0.35 * (vnoise(p * 2.1 - time * 0.33 + 5.1) - 0.5);
          vec3 N = normalize(vec3(nx * a * 2.2, 1.0, nz * a * 2.2));
          vec3 Rf = reflect(V, N); Rf.y = abs(Rf.y);
          vec3 refl = skyColor(Rf, sunDir);
          float fres = mix(0.30, 1.0, pow(1.0 - max(dot(-V, N), 0.0), 3.0));
          vec3 col = mix(vec3(0.018, 0.055, 0.11), refl, fres);
          float sp = pow(max(dot(Rf, sunDir), 0.0), 520.0);
          col += vec3(1.0, 0.58, 0.26) * sp * 3.2;                                    // glitter path under the sun
          col += vec3(1.0, 0.55, 0.25) * pow(max(dot(Rf, sunDir), 0.0), 30.0) * 0.10;
          float hz = 1.0 - exp(-dist * 0.00075);
          col = mix(col, skyColor(normalize(vec3(V.x, 0.012, V.z)), sunDir), hz * 0.82);
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  sea.position.set(0, SEA_Y, -4300); root.add(sea);

  // ── far shore: Boukornine's twin peaks and a line of city lights ───────────
  function ridge(z, color, profile, x0, x1, steps = 160) {
    const pos = [];
    for (let i = 0; i < steps; i++) {
      const xa = x0 + (x1 - x0) * i / steps, xb = x0 + (x1 - x0) * (i + 1) / steps;
      const ya = SEA_Y + profile(xa), yb = SEA_Y + profile(xb);
      pos.push(xa, SEA_Y - 2, z, xb, SEA_Y - 2, z, xb, yb, z, xa, SEA_Y - 2, z, xb, yb, z, xa, ya, z);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, fog: false })); root.add(m); return m;
  }
  const bump = (x, c, w, h) => h * Math.exp(-((x - c) * (x - c)) / (2 * w * w));
  ridge(-3600, new THREE.Color(0.52, 0.36, 0.52), (x) => 90 + bump(x, -2200, 700, 150) + bump(x, 300, 900, 110) + bump(x, 2400, 600, 190) + 18 * Math.sin(x * 0.004), -5200, 5200);
  ridge(-2600, new THREE.Color(0.30, 0.23, 0.42), (x) => 14 + bump(x, -640, 82, 225) + bump(x, -345, 78, 190) + bump(x, -490, 330, 92) + bump(x, 900, 500, 46) + bump(x, -1700, 420, 60) + 5 * Math.sin(x * 0.011), -4200, 4200);
  {
    const n = 420, pos = new Float32Array(n * 3), ph = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = R(-3300, 3300);
      pos[i * 3] = x; pos[i * 3 + 1] = SEA_Y + 3 + rand() * rand() * 34; pos[i * 3 + 2] = -2560 + R(-20, 20); ph[i] = rand() * 6.28;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
    const u = { time: { value: 0 } };
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, uniforms: u,
      vertexShader: `attribute float phase; uniform float time; varying float vA; void main(){ vA = 0.55 + 0.45 * sin(time * 2.4 + phase); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = 2.2; }`,
      fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(vec3(1.0, 0.72, 0.42) * 1.6 * vA, 1.0); }`,
    }));
    root.add(pts); animated.push((t) => { u.time.value = t; });
  }

  // ── boats ──────────────────────────────────────────────────────────────────
  function sailboat(x, z, s, heading) {
    const g = new THREE.Group(); g.position.set(x, SEA_Y, z); g.rotation.y = heading; g.scale.setScalar(s);
    box(M.plaster[0], g, 0, 0.35, 0, 4.6, 0.7, 1.3, false);
    box(M.blueDeep, g, 0, 0.05, 0, 4.7, 0.16, 1.34, false);
    box(M.trunk, g, 0.2, 3.6, 0, 0.09, 6.2, 0.09, false);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([0.3, 0.9, 0, 0.3, 6.4, 0, 2.5, 0.9, 0, 0.1, 1.0, 0, 0.1, 6.0, 0, -1.9, 1.0, 0], 3));
    tri.computeVertexNormals();
    g.add(new THREE.Mesh(tri, new THREE.MeshStandardMaterial({ color: 0xfff3df, roughness: 0.9, side: THREE.DoubleSide })));
    root.add(g);
    const ph = rand() * 6.28;
    animated.push((t) => { g.position.y = SEA_Y + Math.sin(t * 0.9 + ph) * 0.12 * s; g.rotation.z = Math.sin(t * 0.7 + ph) * 0.035; g.position.x = x + Math.sin(t * 0.05 + ph) * 3; });
  }
  sailboat(-52, -250, 2.0, 0.5); sailboat(34, -310, 2.3, -0.7); sailboat(-120, -400, 2.7, 0.2); sailboat(95, -480, 3.0, 2.6); sailboat(-10, -660, 3.6, 0.9); sailboat(170, -720, 3.8, -0.4);
  // ── village ────────────────────────────────────────────────────────────────
  // The plateau the village stands on, mostly hidden by roofs.
  {
    const hill = new THREE.Mesh(new THREE.PlaneGeometry(320, 110), M.earth);
    hill.rotation.x = -Math.PI / 2 - 0.035; hill.position.set(0, -10.4, -48); hill.receiveShadow = true; root.add(hill);
  }

  function bougainvillea(parent, x, y, z, w, drop, depth, count, seed) {
    const r = mulberry(seed);
    const cols = [0xd81b7a, 0xb0126a, 0xf04a9b, 0xc2185b, 0xe0408f];
    const geo = new THREE.CircleGeometry(0.042, 5); geo.scale(1, 0.72, 1);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide, emissive: 0x5a0c34, emissiveIntensity: 0.45 });
    const im = new THREE.InstancedMesh(geo, mat, count);
    const d = new THREE.Object3D(); const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const u = r(), v = Math.pow(r(), 1.6);
      const px = (u - 0.5) * w * (1 - v * 0.55) + (r() - 0.5) * 0.25;
      const py = -v * drop + (r() - 0.5) * 0.2;
      const pz = (r() - 0.5) * depth + Math.sin(u * 9) * 0.05;
      d.position.set(x + px, y + py, z + pz);
      d.rotation.set(r() * 3.1, r() * 3.1, r() * 3.1);
      d.scale.setScalar(0.6 + r() * 0.9);
      d.updateMatrix(); im.setMatrixAt(i, d.matrix);
      col.setHex(cols[Math.floor(r() * cols.length)]); im.setColorAt(i, col);
    }
    im.castShadow = true; parent.add(im);
    const lc = Math.floor(count * 0.35);
    const lm = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.05), M.leaf, lc);
    for (let i = 0; i < lc; i++) {
      const u = r(), v = Math.pow(r(), 1.3);
      d.position.set(x + (u - 0.5) * w * (1 - v * 0.5), y - v * drop * 0.95 + 0.05, z + (r() - 0.5) * depth - 0.03);
      d.rotation.set(r() * 3.1, r() * 3.1, r() * 3.1); d.scale.setScalar(0.8 + r() * 0.8); d.updateMatrix(); lm.setMatrixAt(i, d.matrix);
    }
    parent.add(lm);
    return im;
  }

  /** A window on a wall. `face` is the outward normal: 'z+' | 'x+' | 'x-'. detail: 2 = iron grille, 1 = boxed, 0 = flat. */
  function wallWindow(parent, face, u, y, wallPos, detail, lit) {
    const g = new THREE.Group();
    const w = 0.85, h = 1.2;
    box(M.blueDeep, g, 0, 0, 0.03, w + 0.16, h + 0.16, 0.06, false);
    if (lit) box(M.glowWin, g, 0, 0, 0.05, w, h, 0.05, false);
    else { box(M.blue, g, -w / 4, 0, 0.06, w / 2 - 0.02, h, 0.05, false); box(M.blue, g, w / 4, 0, 0.06, w / 2 - 0.02, h, 0.05, false); }
    if (detail >= 2) {            // the curved iron grille Sidi Bou Said is known for, simplified to a cage
      const dz = 0.26;
      for (let i = 0; i <= 6; i++) box(M.iron, g, -w / 2 - 0.05 + i * (w + 0.1) / 6, 0, dz, 0.022, h + 0.1, 0.022, false);
      for (const yy of [-h / 2 - 0.05, -h / 6, h / 6, h / 2 + 0.05]) box(M.iron, g, 0, yy, dz, w + 0.14, 0.022, 0.022, false);
      for (const sx of [-1, 1]) for (const yy of [-h / 2 - 0.05, h / 2 + 0.05]) box(M.iron, g, sx * (w / 2 + 0.06), yy, dz / 2, 0.022, 0.022, dz, false);
      box(M.iron, g, 0, h / 2 + 0.16, dz * 0.5, w + 0.2, 0.03, dz + 0.06, false);
    } else if (detail === 1) {
      box(M.blue, g, 0, 0, 0.16, w + 0.12, h + 0.1, 0.2, false).material = M.blueLight;
    }
    if (face === 'z+') g.position.set(u, y, wallPos);
    else if (face === 'x+') { g.position.set(wallPos, y, u); g.rotation.y = Math.PI / 2; }
    else { g.position.set(wallPos, y, u); g.rotation.y = -Math.PI / 2; }
    parent.add(g);
    if (lit && detail >= 1) glow(parent, g.position.x + (face === 'x+' ? 0.3 : face === 'x-' ? -0.3 : 0), y, g.position.z + (face === 'z+' ? 0.3 : 0), 2.6, 0.5);
    return g;
  }

  /** The screened blue timber balcony that hangs off the upper floor of the old houses. */
  function mashrabiya(parent, u, y, wallZ) {
    const g = new THREE.Group(); g.position.set(u, y, wallZ);
    const w = 1.5, h = 1.5, dp = 0.62;
    box(M.blue, g, 0, 0, dp / 2, w, h, dp);
    box(M.blueDeep, g, 0, -h / 2 - 0.05, dp / 2, w + 0.12, 0.1, dp + 0.08); box(M.blueDeep, g, 0, h / 2 + 0.05, dp / 2, w + 0.16, 0.1, dp + 0.12);
    for (let i = 0; i < 3; i++) box(M.glowWin, g, (i - 1) * 0.44, 0.12, dp + 0.005, 0.3, 0.72, 0.01, false);
    for (let i = 0; i < 6; i++) box(M.blueDeep, g, 0, -0.22 + i * 0.14, dp + 0.012, w - 0.1, 0.03, 0.012, false);
    for (let i = 0; i < 9; i++) box(M.blueDeep, g, -w / 2 + 0.1 + i * (w - 0.2) / 8, 0.12, dp + 0.014, 0.03, 0.78, 0.012, false);
    for (const sx of [-1, 1]) { const br = box(M.blueDeep, g, sx * (w / 2 - 0.12), -h / 2 - 0.3, dp * 0.3, 0.08, 0.5, 0.08); br.rotation.x = 0.7; }
    parent.add(g); glow(parent, u, y + 0.1, wallZ + dp + 0.25, 2.6, 0.38);
    return g;
  }

  function door(parent, x, groundY, z, lit) {
    const g = new THREE.Group(); g.position.set(x, groundY, z);
    box(M.ochre, g, 0, 1.05, 0.02, 1.5, 2.1, 0.08, false);
    mesh(G.disc, M.ochre, g, 0, 2.1, 0.02, 1.5, 1.5, 0.08, false);
    box(M.blue, g, 0, 1.0, 0.07, 1.1, 2.0, 0.08, false);
    mesh(G.disc, M.blue, g, 0, 2.0, 0.07, 1.1, 1.1, 0.08, false);
    box(M.blueDeep, g, 0, 1.0, 0.115, 0.03, 2.0, 0.02, false);
    parent.add(g);
    if (lit) { box(M.glowLamp, g, 0.95, 2.35, 0.22, 0.16, 0.24, 0.16, false); glow(g, 0.95, 2.35, 0.3, 3.4, 0.85); }
    return g;
  }

  function house(x, groundY, z, w, h, d, o = {}) {
    const g = new THREE.Group(); g.position.set(x, groundY, z);
    const mat = pick(M.plaster);
    box(mat, g, 0, h / 2, 0, w, h, d);
    box(mat, g, 0, -3, 0, w, 6, d, false);                                                    // plinth, below sight
    // parapet: a rim around a slightly sunken terrace
    const pr = 0.34, th = 0.22;
    box(mat, g, 0, h + pr / 2, d / 2 - th / 2, w, pr, th); box(mat, g, 0, h + pr / 2, -d / 2 + th / 2, w, pr, th);
    box(mat, g, -w / 2 + th / 2, h + pr / 2, 0, th, pr, d); box(mat, g, w / 2 - th / 2, h + pr / 2, 0, th, pr, d);
    const detail = o.detail ?? 1;
    const storeys = h > 4.6 ? 2 : 1;
    // front face: windows are placed down from the roof, since only the upper part shows over the row in front
    const nW = Math.max(1, Math.floor(w / 2.1));
    const balconyAt = detail >= 1 && rand() < 0.45 ? Math.floor(rand() * nW) : -1;
    for (let s = 0; s < storeys; s++) for (let i = 0; i < nW; i++) {
      const u = -w / 2 + (i + 0.5) * (w / nW) + R(-0.12, 0.12);
      const y = h - 1.25 - s * 2.5;
      if (y < 1.0) continue;
      if (s === 0 && i === balconyAt) { mashrabiya(g, u, y - 0.05, d / 2); continue; }
      if (rand() < 0.14) continue;
      wallWindow(g, 'z+', u, y, d / 2, detail, rand() < (o.litChance ?? 0.3));
    }
    if (!o.noDoor) door(g, -w / 2 + ((o.doorAt ?? 0) + 0.5) * (w / nW), 0, d / 2, rand() < 0.6);
    // side faces
    for (const [face, wx] of [['x+', w / 2], ['x-', -w / 2]]) {
      const nS = Math.max(1, Math.floor(d / 2.6));
      for (let i = 0; i < nS; i++) if (rand() < 0.55) wallWindow(g, face, -d / 2 + (i + 0.5) * (d / nS), h - 1.25, wx, detail, rand() < 0.3);
    }
    if (o.dome || rand() < 0.16) {
      const r = Math.min(w, d) * R(0.24, 0.32);
      const cx = R(-0.2, 0.2) * w, cz = R(-0.1, 0.1) * d;
      box(mat, g, cx, h + 0.45, cz, r * 2.1, 0.9, r * 2.1);
      mesh(G.dome, mat, g, cx, h + 0.9, cz, r, r, r);
      mesh(G.sphere, M.ochre, g, cx, h + 0.9 + r + 0.12, cz, 0.09, 0.14, 0.09, false);
    } else {
      const k = rand();
      if (k < 0.42) {                                                                         // stair head with a blue door onto the roof
        const sx = R(-0.25, 0.25) * w, sz = -d / 2 + 1.1;
        box(mat, g, sx, h + 1.1, sz, 1.9, 2.2, 1.9);
        box(M.blue, g, sx, h + 0.95, sz + 0.96, 0.8, 1.7, 0.05, false);
        if (rand() < 0.5) { box(M.glowLamp, g, sx + 0.65, h + 1.75, sz + 1.0, 0.1, 0.14, 0.1, false); glow(g, sx + 0.65, h + 1.75, sz + 1.1, 2.4, 0.7); }
      } else if (k < 0.62 && detail >= 1) {                                                   // blue pergola
        const px = R(-0.15, 0.15) * w, pw = Math.min(w - 1.2, 3.2), pd = Math.min(d - 1.4, 2.6);
        for (const ax of [-1, 1]) for (const az of [-1, 1]) box(M.blue, g, px + ax * pw / 2, h + 1.15, az * pd / 2, 0.08, 2.3, 0.08);
        for (let i = 0; i < 7; i++) box(M.blue, g, px - pw / 2 + i * pw / 6, h + 2.32, 0, 0.06, 0.06, pd + 0.3);
        for (const az of [-1, 1]) box(M.blue, g, px, h + 2.26, az * pd / 2, pw + 0.3, 0.07, 0.07);
      } else if (k < 0.8) {                                                                   // washing on a line
        const lx = R(-0.2, 0.2) * w, lw = Math.min(w - 1, 3.4), lz = R(-0.3, 0.3) * d;
        for (const ax of [-1, 1]) box(M.dark, g, lx + ax * lw / 2, h + 0.95, lz, 0.04, 1.9, 0.04, false);
        box(M.dark, g, lx, h + 1.85, lz, lw, 0.012, 0.012, false);
        const cols = [0xf4f1ea, 0xd9483b, 0x2f6fb0, 0xe8b84a, 0xf4f1ea, 0x3f8f6a];
        let cx = lx - lw / 2 + 0.25;
        while (cx < lx + lw / 2 - 0.3) {
          const cw = R(0.35, 0.7), ch = R(0.5, 0.95);
          const cloth = box(std(pick(cols), 0.95, { side: THREE.DoubleSide }), g, cx + cw / 2, h + 1.85 - ch / 2, lz, cw, ch, 0.015);
          const ph = rand() * 6.28; animated.push((t) => { cloth.rotation.x = Math.sin(t * 1.4 + ph) * 0.16; });
          cx += cw + R(0.05, 0.2);
        }
      }
    }
    if (rand() < (o.flowers ?? 0.3)) {
      if (detail >= 2) bougainvillea(g, (rand() < 0.5 ? -1 : 1) * (w / 2 - 0.9), h + 0.4, d / 2 + 0.12, 1.9, R(1.6, 2.6), 0.3, 2600, Math.floor(rand() * 1e6));
      else { const bx = (rand() < 0.5 ? -1 : 1) * (w / 2 - 0.7); const bm = new THREE.MeshStandardMaterial({ color: pick([0xd81b7a, 0xc2185b, 0xe0408f]), roughness: 0.9, emissive: 0x4a0a2a, emissiveIntensity: 0.3 });
        mesh(G.blob, bm, g, bx, h - 0.2, d / 2 + 0.15, 0.9, 1.0, 0.35); mesh(G.blob, bm, g, bx + 0.3, h - 1.1, d / 2 + 0.15, 0.6, 0.8, 0.3); }
    }
    root.add(g); return g;
  }

  // Tiers of houses stepping down the hill. Each tier is wider than the view so the edges never show.
  // `roof` is the typical roof height of the tier: chosen so each row sits just above the one in front
  // when seen from the window, and the sea shows over the last one.
  const tiers = [
    { z: -12.5, roof: -3.15, hMin: 3.2, hMax: 4.6, detail: 2 },
    { z: -18.5, roof: -3.75, hMin: 3.2, hMax: 5.6, detail: 1 },
    { z: -25.5, roof: -4.35, hMin: 3.2, hMax: 6.2, detail: 1 },
    { z: -33.5, roof: -4.8, hMin: 3.0, hMax: 6.2, detail: 0 },
    { z: -42.5, roof: -5.25, hMin: 3.0, hMax: 5.8, detail: 0 },
    { z: -52.5, roof: -5.6, hMin: 3.0, hMax: 5.4, detail: 0 },
    { z: -63.5, roof: -5.85, hMin: 2.8, hMax: 5.0, detail: 0 },
    { z: -76, roof: -6.1, hMin: 2.8, hMax: 4.6, detail: 0 },
  ];
  tiers.forEach((t, k) => {
    const ext = Math.abs(t.z) * 1.05 + 9;
    let x = -ext + R(0, 2);
    while (x < ext) {
      const w = R(3.6, 6.8), d = R(4.2, 6.2), h = R(t.hMin, t.hMax);
      if (rand() < 0.07) { x += R(1.2, 2.2); continue; }                                    // an alley
      const tall = (h - t.hMin) / (t.hMax - t.hMin);                                         // taller houses stand a little prouder
      house(x + w / 2, t.roof - h + tall * 1.5 + R(-0.3, 0.3), t.z + R(-0.9, 0.9), w, h, d, { detail: t.detail, doorAt: Math.floor(rand() * 2), litChance: 0.34, flowers: k < 3 ? 0.4 : 0.22 });
      x += w + (rand() < 0.75 ? 0 : R(0.3, 0.9));
    }
  });

  // landmark: the white minaret with its small dome, breaking the horizon left of centre
  {
    const g = new THREE.Group(); g.position.set(-8.5, -9.2, -30); g.scale.setScalar(0.74);
    box(M.plaster[0], g, 0, 3, 0, 9, 6, 8); mesh(G.dome, M.plaster[0], g, -1.6, 6, 0.5, 2.6, 2.6, 2.6);
    box(M.plaster[0], g, 3, 8.2, 2, 2.3, 16.4, 2.3);
    box(M.plaster[2], g, 3, 15.2, 2, 3.0, 0.35, 3.0);                                        // balcony
    for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) box(M.plaster[0], g, 3 + dx, 15.75, 2 + dz, 0.2, 0.9, 0.2);
    box(M.plaster[0], g, 3, 17.6, 2, 1.4, 2.6, 1.4);
    mesh(G.dome, M.plaster[0], g, 3, 18.9, 2, 0.85, 0.95, 0.85);
    box(M.ochre, g, 3, 20.2, 2, 0.06, 0.9, 0.06, false); mesh(G.sphere, M.ochre, g, 3, 20.0, 2, 0.12, 0.12, 0.12, false);
    wallWindow(g, 'z+', 3, 12.4, 3.15, 0, true); wallWindow(g, 'z+', 3, 7.5, 3.15, 0, false);
    door(g, -1.2, 0, 4, true);
    root.add(g);
  }

  // trees scattered through the village
  function cypress(x, y, z, h) { mesh(G.cone, M.cypress, root, x, y + h / 2, z, h * 0.11, h, h * 0.11); }
  function palm(x, y, z, h, lean = 0.12) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const segs = 9; let px = 0;
    for (let i = 0; i < segs; i++) {
      const t = i / segs; px = lean * h * t * t;
      const m = mesh(G.cyl, M.trunk, g, px, (i + 0.5) * h / segs, 0, 0.36 - t * 0.12, h / segs * 1.08, 0.36 - t * 0.12);
      m.rotation.z = -lean * 2 * t;
    }
    const crown = new THREE.Group(); crown.position.set(lean * h, h, 0); g.add(crown);
    for (let i = 0; i < 17; i++) {
      const len = R(2.4, 3.3);
      const geo = new THREE.PlaneGeometry(0.62, len, 1, 7); geo.translate(0, len / 2, 0);
      const p = geo.attributes.position;
      const droop = R(0.55, 1.15);
      for (let v = 0; v < p.count; v++) {
        const yy = p.getY(v), tt = yy / len;
        p.setZ(v, -droop * tt * tt * len * 0.55);
        p.setY(v, yy * (1 - 0.28 * tt * droop));
        p.setX(v, p.getX(v) * (1 - tt * 0.85));
      }
      geo.computeVertexNormals();
      const f = new THREE.Mesh(geo, M.palm); f.castShadow = true;
      const pivot = new THREE.Group(); pivot.rotation.y = (i / 17) * Math.PI * 2 + R(-0.15, 0.15);
      f.rotation.x = -R(0.55, 1.05); pivot.add(f); crown.add(pivot);
    }
    mesh(G.sphere, M.trunk, crown, 0, -0.1, 0, 0.4, 0.45, 0.4);
    root.add(g);
    const ph = rand() * 6.28;
    animated.push((t) => { crown.rotation.z = Math.sin(t * 0.6 + ph) * 0.035; crown.rotation.x = Math.sin(t * 0.45 + ph * 2) * 0.03; });
    return g;
  }
  palm(3.5, -9.4, -11.5, 11.9, 0.09); palm(-13.5, -9.4, -19, 10.5, -0.08); palm(15, -9.6, -27, 10.4, 0.1); palm(-24, -9.8, -36, 10, 0.06); palm(27, -10, -44, 9.6, -0.1); palm(4, -10, -58, 9, 0.08);
  for (let i = 0; i < 18; i++) { const z = R(-72, -15); cypress(R(-1, 1) * (Math.abs(z) * 0.95 + 4), -9.4, z, R(6.5, 10.5)); }

  // ── the neighbour's terrace, right below the window ────────────────────────
  {
    const g = new THREE.Group(); root.add(g);
    const TY = -2.62;                                                                        // terrace floor height
    box(M.plaster[1], g, 1.2, TY - 3, -3.95, 9.2, 6, 5.1);
    box(M.plaster[1], g, 1.2, TY + 0.28, -6.4, 9.2, 0.56, 0.24);                              // far parapet
    box(M.plaster[1], g, 5.68, TY + 0.28, -3.95, 0.24, 0.56, 5.1);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.3), new THREE.MeshStandardMaterial({ map: kilimTexture(), roughness: 1 }));
    rug.rotation.x = -Math.PI / 2; rug.rotation.z = 0.25; rug.position.set(0.5, TY + 0.012, -4.6); rug.receiveShadow = true; g.add(rug);
    // low table with a tea tray
    mesh(G.cyl, M.blueDeep, g, 0.55, TY + 0.2, -4.55, 0.75, 0.04, 0.75);
    for (const a of [0.4, 2.5, 4.6]) box(M.blueDeep, g, 0.55 + Math.cos(a) * 0.26, TY + 0.1, -4.55 + Math.sin(a) * 0.26, 0.04, 0.2, 0.04);
    mesh(G.cyl, std(0xc9a25c, 0.35, { metalness: 0.8 }), g, 0.55, TY + 0.235, -4.55, 0.46, 0.02, 0.46);
    mesh(G.sphere, std(0xc9a25c, 0.3, { metalness: 0.85 }), g, 0.5, TY + 0.33, -4.38, 0.07, 0.09, 0.07);
    for (const [dx, dz] of [[0.14, 0.05], [-0.05, 0.16]]) mesh(G.cyl, std(0xb85c2a, 0.3, { transparent: true, opacity: 0.85 }), g, 0.55 + dx, TY + 0.28, -4.55 + dz, 0.045, 0.07, 0.045, false);
    // cushions
    box(std(0x8e1f2b, 0.95), g, -0.35, TY + 0.1, -5.1, 0.55, 0.18, 0.55); box(std(0x1c3f6e, 0.95), g, 1.5, TY + 0.1, -4.2, 0.55, 0.18, 0.55);
    // potted plants along the parapet
    const pots = [[-2.2, -5.9, 0.9], [-1.3, -5.95, 0.7], [3.7, -5.9, 1.0], [4.9, -5.3, 0.8], [5.1, -3.0, 0.9], [-2.3, -2.2, 0.75]];
    pots.forEach(([px, pz, s], i) => {
      mesh(G.cyl, M.terracotta, g, px, TY + 0.2 * s, pz, 0.42 * s, 0.4 * s, 0.42 * s);
      mesh(G.blob, M.leaf, g, px, TY + 0.62 * s, pz, 0.36 * s, 0.34 * s, 0.36 * s);
      if (i % 2 === 0) for (let k = 0; k < 9; k++) mesh(G.sphere, std(0xd62a2a, 0.7, { emissive: 0x400808, emissiveIntensity: 0.4 }), g, px + R(-0.3, 0.3) * s, TY + (0.72 + R(0, 0.25)) * s, pz + R(-0.3, 0.3) * s, 0.05, 0.05, 0.05, false);
    });
    // lantern on the parapet corner
    box(M.dark, g, 5.68, TY + 0.86, -6.4, 0.18, 0.6, 0.18, false); box(M.glowLamp, g, 5.68, TY + 0.88, -6.4, 0.13, 0.34, 0.13, false);
    glow(g, 5.68, TY + 0.9, -6.3, 3.2, 0.9);
    const pl = new THREE.PointLight(0xffa24a, 14, 9, 1.8); pl.position.set(5.4, TY + 1.0, -6.0); g.add(pl);

  }

  // ── the wing of our own building, close on the left ────────────────────────
  {
    const g = new THREE.Group(); root.add(g);
    box(M.plaster[0], g, -4.6, -1.5, -3.0, 4.0, 13, 5.0);
    wallWindow(g, 'x+', -2.2, 0.35, -2.6, 2, true).scale.setScalar(1.05);
    wallWindow(g, 'x+', -4.3, 0.35, -2.6, 2, false).scale.setScalar(1.05);
    bougainvillea(g, -2.5, 3.1, -3.9, 0.45, 3.0, 2.2, 9000, 77);
    box(M.plaster[0], g, -2.6, 5.2, -3.0, 0.5, 0.4, 5.3);
  }

  // ── the window itself: reveal, frame, sill, shutters, iron balcony grille ──
  const frame = new THREE.Group(); root.add(frame);
  {
    const D = 0.22, T = 1.2;                                                                 // reveal depth, wall margin
    const plaster = std(0xf1ebe0, 0.95);
    box(plaster, frame, 0, hh + T / 2, -D / 2, hw * 2 + T * 2, T, D); box(plaster, frame, 0, -hh - T / 2, -D / 2, hw * 2 + T * 2, T, D);
    box(plaster, frame, -hw - T / 2, 0, -D / 2, T, hh * 2, D); box(plaster, frame, hw + T / 2, 0, -D / 2, T, hh * 2, D);
    const fw = 0.011;                                                                        // blue timber frame just inside the glass line
    box(M.blue, frame, 0, hh - fw / 2, -0.008, hw * 2, fw, 0.014, false); box(M.blue, frame, 0, -hh + fw / 2, -0.008, hw * 2, fw, 0.014, false);
    box(M.blue, frame, -hw + fw / 2, 0, -0.008, fw, hh * 2, 0.014, false); box(M.blue, frame, hw - fw / 2, 0, -0.008, fw, hh * 2, 0.014, false);
    box(M.stone, frame, 0, -hh - 0.03, -D - 0.1, hw * 2 + 0.3, 0.06, 0.3);                    // sill
    // shutters, swung open against the outside wall
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sx * hw, 0, -D); sh.rotation.y = sx * 1.12; frame.add(sh);
      const sw = hw * 0.98;
      box(M.blue, sh, sx * sw / 2, 0, 0, sw, hh * 2, 0.035);
      for (let i = 0; i < 13; i++) box(M.blueDeep, sh, sx * sw / 2, -hh + 0.08 + i * (hh * 2 - 0.16) / 12, sx * 0.0 + 0.022, sw - 0.12, 0.018, 0.02, false);
    }
    // iron balcony grille across the lower part of the opening
    const gr = new THREE.Group(); gr.position.set(0, -hh, -D - 0.2); frame.add(gr);
    const GH = 0.105;
    box(M.iron, gr, 0, GH, 0, hw * 2 + 0.24, 0.014, 0.014, false); box(M.iron, gr, 0, 0.02, 0, hw * 2 + 0.24, 0.012, 0.012, false);
    const nb = 22;
    for (let i = 0; i <= nb; i++) {
      const x = -hw - 0.1 + i * (hw * 2 + 0.2) / nb;
      box(M.iron, gr, x, GH / 2, 0, 0.008, GH, 0.008, false);
      if (i < nb) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0035, 6, 14), M.iron); ring.position.set(x + (hw * 2 + 0.2) / nb / 2, GH * 0.55, 0); gr.add(ring); }
    }
    for (const sx of [-1, 1]) box(M.iron, gr, sx * (hw + 0.11), GH, 0.1, 0.02, 0.02, 0.2, false);

    // a geranium pot on the sill
    mesh(G.cyl, M.terracotta, frame, -hw + 0.2, -hh + 0.04, -D - 0.08, 0.09, 0.08, 0.09);
    mesh(G.blob, std(0x3f7a44, 0.8), frame, -hw + 0.2, -hh + 0.115, -D - 0.08, 0.075, 0.06, 0.075);
    for (let k = 0; k < 7; k++) mesh(G.sphere, std(0xd62a2a, 0.7, { emissive: 0x400808, emissiveIntensity: 0.5 }), frame, -hw + 0.2 + R(-0.065, 0.065), -hh + 0.15 + R(0, 0.04), -D - 0.08 + R(-0.065, 0.065), 0.013, 0.013, 0.013, false);

    // the cat on the sill, back to the room, watching the swallows
    {
      const fur = new THREE.MeshStandardMaterial({ color: C.cat, roughness: 0.62 });
      const hi = new THREE.SphereGeometry(1, 36, 24);
      const cat = new THREE.Group(); cat.position.set(hw * 0.62, -hh, -0.115); cat.rotation.y = Math.PI + 0.38; cat.scale.setScalar(0.68); frame.add(cat);
      const part = (x, y, z, sx, sy, sz, parent = cat) => { const m = new THREE.Mesh(hi, fur); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m; };
      part(0, 0.085, -0.015, 0.118, 0.092, 0.135);                                             // haunches
      part(0, 0.19, 0.012, 0.092, 0.15, 0.098);                                                // back and chest
      part(-0.045, 0.06, 0.1, 0.03, 0.06, 0.036); part(0.045, 0.06, 0.1, 0.03, 0.06, 0.036);    // front paws
      const head = new THREE.Group(); head.position.set(0, 0.365, 0.045); cat.add(head);
      part(0, 0, 0, 0.074, 0.066, 0.07, head);
      part(0, -0.018, 0.05, 0.036, 0.028, 0.03, head);                                         // muzzle
      for (const sx of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.062, 4), fur); ear.position.set(sx * 0.044, 0.064, -0.004); ear.rotation.set(-0.12, sx * 0.5, -sx * 0.22); ear.castShadow = true; head.add(ear);
      }
      const tail = new THREE.Group(); tail.position.set(0.02, 0.03, -0.13); cat.add(tail);
      const tc = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.07, -0.004, -0.05), new THREE.Vector3(0.16, -0.006, -0.03), new THREE.Vector3(0.22, -0.006, 0.03), new THREE.Vector3(0.21, -0.004, 0.1)]);
      const tm = new THREE.Mesh(new THREE.TubeGeometry(tc, 24, 0.019, 10), fur); tm.castShadow = true; tail.add(tm);
      part(0.21, -0.004, 0.1, 0.019, 0.019, 0.019, tail);
      animated.push((t) => {
        tail.rotation.y = Math.sin(t * 1.25) * 0.16 * (0.45 + 0.55 * Math.sin(t * 0.19));
        head.rotation.y = Math.sin(t * 0.27) * 0.55 + Math.sin(t * 0.9) * 0.05;                  // following the birds
        head.rotation.x = Math.sin(t * 0.21 + 1.0) * 0.12 - 0.05;
      });
    }

    // hanging lantern, upper left, with a warm light on the reveal
    const lan = new THREE.Group(); lan.position.set(-hw + 0.2, hh + 0.02, -D - 0.16); frame.add(lan);
    box(M.dark, lan, 0, -0.07, 0, 0.003, 0.14, 0.003, false);
    const body = new THREE.Group(); body.position.y = -0.2; lan.add(body);
    mesh(new THREE.OctahedronGeometry(0.03), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.55, 0.2).multiplyScalar(1.5) }), body, 0, 0, 0, 1, 1.35, 1, false);
    const cage = new THREE.Mesh(new THREE.OctahedronGeometry(0.046), new THREE.MeshStandardMaterial({ color: 0x1c130c, wireframe: true })); cage.scale.y = 1.35; body.add(cage);
    mesh(G.cone, M.dark, body, 0, 0.072, 0, 0.034, 0.034, 0.034, false);
    glow(body, 0, 0, 0.02, 0.26, 0.55);
    const ll = new THREE.PointLight(0xffa24a, 0.3, 2.2, 2); ll.position.set(0, -0.2, 0.05); lan.add(ll);
    animated.push((t) => { lan.rotation.z = Math.sin(t * 0.9) * 0.045; lan.rotation.x = Math.sin(t * 0.7 + 1) * 0.03; ll.intensity = 0.28 + 0.04 * Math.sin(t * 9.0) + 0.025 * Math.sin(t * 23.0); });

    // bougainvillea spilling over the upper right corner
    const br = new THREE.Group(); br.position.set(hw - 0.02, hh + 0.05, -D - 0.12); frame.add(br);
    bougainvillea(br, -0.35, 0.05, 0, 1.25, 0.8, 0.5, 2400, 4242);
    br.children.forEach((c) => c.scale.setScalar(0.27));
    animated.push((t) => { br.rotation.z = Math.sin(t * 0.8) * 0.03 + Math.sin(t * 1.9) * 0.012; });
  }

  // ── petals on the evening breeze: the only things that cross the glass ─────
  {
    const n = 46;
    const geo = new THREE.CircleGeometry(0.012, 5); geo.scale(1, 0.7, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xe23a8e, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x5a1034, emissiveIntensity: 0.5 });
    const im = new THREE.InstancedMesh(geo, mat, n); im.frustumCulled = false; root.add(im);
    const seeds = Array.from({ length: n }, () => ({ a: rand(), b: rand(), c: rand(), d: rand(), e: rand() }));
    const o = new THREE.Object3D();
    animated.push((t) => {
      for (let i = 0; i < n; i++) {
        const s = seeds[i];
        const life = (t * (0.035 + s.a * 0.035) + s.b) % 1;
        o.position.set(hw + 0.3 - life * (hw * 2 + 1.2) + Math.sin(t * 0.8 + s.c * 9) * 0.08,
          (s.d - 0.35) * hh * 1.6 - life * 0.25 + Math.sin(t * 1.1 + s.e * 7) * 0.05,
          -2.2 + s.c * 2.1 + life * 0.3);
        o.rotation.set(t * (1 + s.a * 2), t * (0.7 + s.b * 2), s.c * 6);
        o.scale.setScalar(0.55 + s.e * 0.8);
        o.updateMatrix(); im.setMatrixAt(i, o.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
    });
  }

  // ── swallows ───────────────────────────────────────────────────────────────
  {
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, 0, 0, -0.14, 0.62, 0, -0.22], 3));
    const mat = new THREE.MeshBasicMaterial({ color: 0x141722, side: THREE.DoubleSide, fog: false });
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Group();
      const wl = new THREE.Mesh(wingGeo, mat), wr = new THREE.Mesh(wingGeo, mat); wr.scale.x = -1;
      b.add(wl, wr); root.add(b);
      const cx = R(-14, 14), cy = R(1.5, 7), cz = R(-52, -20), rx = R(6, 16), rz = R(3, 9), sp = R(0.25, 0.5) * (rand() < 0.5 ? -1 : 1), ph = rand() * 6.28, sc = R(0.8, 1.3);
      b.scale.setScalar(sc);
      animated.push((t) => {
        const a = t * sp + ph;
        b.position.set(cx + Math.cos(a) * rx, cy + Math.sin(a * 2.1) * 1.2, cz + Math.sin(a) * rz);
        b.rotation.y = -a + (sp > 0 ? Math.PI : 0) + Math.PI / 2;
        const f = Math.sin(t * 11 + ph) * 0.7;
        wl.rotation.z = f; wr.rotation.z = -f;
      });
    }
  }

  return {
    name: 'Sidi Bou Said, dusk',
    update(t, dt, camera) {
      seaUniforms.time.value = t;
      seaUniforms.camPos.value.copy(camera.position);
      for (const fn of animated) fn(t, dt);
    },
    dispose() { scene.remove(root); },
  };
}
