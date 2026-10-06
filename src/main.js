/**
 * World Window — a screen that behaves like a window.
 *
 * Head position (mouse, or a webcam through MediaPipe) drives an off-axis camera,
 * so the scene stays locked to the edges of the screen while its depth shifts
 * the way it would behind real glass.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { applyOffAxis } from './offaxis.js';
import { HeadTracker } from './tracking.js';
import { buildSidi } from './scenes/sidi.js';
import { buildGLB } from './scenes/glb.js';

const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');          // deterministic frame-by-frame rendering, used to record the demo
const $ = (id) => document.getElementById(id);

// The window, in metres. Height is fixed; width follows the screen's aspect ratio.
const HH = 0.45;
let HW = HH * (innerWidth / innerHeight);

// ── renderer ────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(CAPTURE ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.insertBefore(renderer.domElement, document.body.firstChild);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 8000);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.6, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ── world ───────────────────────────────────────────────────────────────────
let world = null;
function loadWorld(kind) {
  if (world) world.dispose();
  scene.fog = null;
  if (kind === 'glb') {
    world = buildGLB({ scene, onStatus: setStatus });
    bloom.strength = 0.0;
    world.ready.catch(() => { $('sceneSel').value = 'sidi'; loadWorld('sidi'); });
  } else {
    world = buildSidi({ scene, hw: HW, hh: HH });
    bloom.strength = 0.3;
  }
}
function setStatus(msg) { const el = $('status'); if (el) { el.textContent = msg; el.style.opacity = msg ? 1 : 0; } }

// ── stage: a room with the screen on the wall, used only for the demo's viewer's-eye shots ──
const stage = new THREE.Group(); stage.visible = false; scene.add(stage);
function buildStage() {
  stage.clear();
  const wall = new THREE.MeshStandardMaterial({ color: 0x3a3c44, roughness: 0.92, fog: false });
  const bezel = new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.35, metalness: 0.6, fog: false });
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.7, fog: false });
  const add = (mat, x, y, z, w, h, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); stage.add(m); return m; };
  const W = 10, H = 6;
  add(wall, 0, HH + (H - HH) / 2, 0, W, H - HH, 0.02); add(wall, 0, -HH - (H - HH) / 2, 0, W, H - HH, 0.02);
  add(wall, -HW - (W / 2 - HW) / 2, 0, 0, W / 2 - HW, HH * 2, 0.02); add(wall, HW + (W / 2 - HW) / 2, 0, 0, W / 2 - HW, HH * 2, 0.02);
  const b = 0.02;
  add(bezel, 0, HH + b / 2, 0.025, HW * 2 + b * 2, b, 0.05); add(bezel, 0, -HH - b / 2, 0.025, HW * 2 + b * 2, b, 0.05);
  add(bezel, -HW - b / 2, 0, 0.025, b, HH * 2, 0.05); add(bezel, HW + b / 2, 0, 0.025, b, HH * 2, 0.05);
  add(wood, 0, -1.35, 2.5, W, 0.04, 5);                                   // floor
  add(wood, 0, -1.02, 0.24, HW * 2 + 0.5, 0.62, 0.44);                    // sideboard under the screen
  add(bezel, 0, -1.31, 0.02, W, 0.07, 0.03);                              // skirting
  const room = new THREE.PointLight(0xffe0bd, 9, 12, 1.5); room.position.set(1.8, 1.7, 2.8); stage.add(room);
  const spill = new THREE.PointLight(0xd9a2c4, 1.6, 3.5, 2); spill.position.set(0, -0.1, 0.45); stage.add(spill);
}
buildStage();

// ── head input ──────────────────────────────────────────────────────────────
// `eye` is where the viewer's eye is, in window metres: x right, y up, z out of the screen.
const eye = new THREE.Vector3(0, 0, 1.25);
const target = new THREE.Vector3(0, 0, 1.25);
let mode = 'mouse';                 // 'mouse' | 'webcam'
let lastMove = -1e9, depth = 1.25;
let tracker = null, video = null;

addEventListener('pointermove', (e) => {
  if (mode !== 'mouse') return;
  lastMove = performance.now();
  target.x = (e.clientX / innerWidth - 0.5) * 2 * 0.62;
  target.y = -(e.clientY / innerHeight - 0.5) * 2 * 0.34;
});
addEventListener('wheel', (e) => { depth = THREE.MathUtils.clamp(depth + e.deltaY * 0.0012, 0.7, 2.4); lastMove = performance.now(); }, { passive: true });

// Cameras: list them, prefer a phone-as-webcam (DroidCam) when one is plugged in, let the viewer pick.
let camTouched = false, orientTouched = false;
async function listCameras() {
  const scan = async () => (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  let cams = await scan();
  if (cams.length && !cams.some((d) => d.label)) {
    // names stay hidden until permission is granted: ask once. The default camera may be one that
    // cannot start (a virtual camera whose app is closed), so a failure here is not fatal.
    try { const tmp = await navigator.mediaDevices.getUserMedia({ video: true }); tmp.getTracks().forEach((t) => t.stop()); } catch (e) { /* keep going */ }
    cams = await scan();
  }
  const sel = $('camSel'), chosen = camTouched ? sel.value : '';
  sel.innerHTML = '';
  cams.forEach((d, i) => { const o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || `Camera ${i + 1}`; sel.appendChild(o); });
  const pick = cams.find((d) => d.deviceId === chosen) || cams.find((d) => /droid/i.test(d.label)) || cams[0];
  if (pick) sel.value = pick.deviceId;
  sel.style.display = cams.length ? '' : 'none';
  return cams;
}

async function startWebcam() {
  try {
    setStatus('Starting camera…');
    const cams = await listCameras();
    if (!cams.length) throw new Error('no camera found');
    const sel = $('camSel');
    // try the chosen camera first, then the others: one that will not start should not block the rest
    const order = [sel.value, ...cams.map((d) => d.deviceId).filter((id) => id !== sel.value)];
    let stream = null; const failed = [];
    for (const id of order) {
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: id }, width: 640, height: 480 } }); sel.value = id; break; }
      catch (e) { failed.push(cams.find((d) => d.deviceId === id)?.label || 'camera'); if (camTouched) break; }
    }
    if (!stream) throw new Error(`could not start ${failed.join(', ')}`);
    const label = sel.selectedOptions[0]?.textContent || '';
    if (!orientTouched && /droid/i.test(label)) $('camOrient').value = 'portrait';   // a phone on a stand is usually upright
    video = document.createElement('video'); video.autoplay = true; video.playsInline = true; video.muted = true;
    video.srcObject = stream;
    await video.play();
    tracker = new HeadTracker($('camOrient').value);
    await tracker.init(video, setStatus);
    mode = 'webcam'; $('modeBtn').textContent = 'Webcam on'; $('modeBtn').classList.add('on');
    console.log('[WorldWindow] tracking with', label, '·', $('camOrient').value);
  } catch (err) {
    console.error(err); setStatus(`Camera unavailable: ${err.message || err.name}. Using the mouse.`);
    setTimeout(() => setStatus(''), 5000); stopWebcam();
  }
}
function stopWebcam() {
  if (video?.srcObject) video.srcObject.getTracks().forEach((t) => t.stop());
  tracker = null; video = null; mode = 'mouse'; $('modeBtn').textContent = 'Use webcam'; $('modeBtn').classList.remove('on');
}

function updateHead(t) {
  if (mode === 'webcam' && tracker) {
    tracker.update();
    // outer-eye span of ~0.13 of the frame is roughly arm's length from a laptop camera
    const z = THREE.MathUtils.clamp(0.165 / Math.max(tracker.eyeSpan, 0.03), 0.65, 2.6);
    target.set(tracker.headX * 0.62 * (z / 1.25), tracker.headY * 0.36 * (z / 1.25), z);
    $('noFace').style.opacity = tracker.hasFace ? 0 : 1;
  } else {
    target.z = depth;
    if (performance.now() - lastMove > 3500) {           // nobody at the mouse: drift so the window stays alive
      target.x = Math.sin(t * 0.33) * 0.42;
      target.y = Math.sin(t * 0.47 + 1.0) * 0.12 + 0.03;
      target.z = depth + Math.sin(t * 0.21) * 0.18;
    }
  }
}

// ── loop ────────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let stageCam = null;                 // set by the capture script for viewer-eye shots

function renderFrame(t, dt) {
  if (stageCam) {
    stage.visible = true;
    camera.fov = stageCam.fov; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    camera.position.copy(stageCam.pos); camera.lookAt(stageCam.look); camera.updateMatrixWorld(true);
  } else {
    stage.visible = false;
    applyOffAxis(camera, eye, HW, HH);
  }
  if (world) world.update(t, dt, camera);
  composer.render();
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
  updateHead(t);
  eye.lerp(target, 1 - Math.exp(-dt * 7));
  renderFrame(t, dt);
}

let resizeTimer = 0;
addEventListener('resize', () => {
  HW = HH * (innerWidth / innerHeight);
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  // the window frame is built to the screen's proportions, so rebuild once the resize settles
  clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { loadWorld($('sceneSel').value); buildStage(); }, 250);
});

// ── UI ──────────────────────────────────────────────────────────────────────
$('modeBtn').onclick = () => (mode === 'webcam' ? stopWebcam() : startWebcam());
$('sceneSel').onchange = (e) => loadWorld(e.target.value);
$('camSel').onchange = () => { camTouched = true; if (mode === 'webcam') { stopWebcam(); startWebcam(); } };
$('camOrient').onchange = (e) => { orientTouched = true; if (tracker) tracker.orientation = e.target.value; };
$('fsBtn').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
let uiTimer = 0;
const wakeUI = () => { document.body.classList.remove('idle'); clearTimeout(uiTimer); uiTimer = setTimeout(() => document.body.classList.add('idle'), 3200); };
addEventListener('pointermove', wakeUI); addEventListener('keydown', wakeUI); wakeUI();
if (params.get('ui') === '0' || CAPTURE) document.body.classList.add('noui');

// the GLB scene is optional: hide it when no file has been dropped into assets/
fetch('assets/scene.glb', { method: 'HEAD' }).then((r) => { if (!r.ok) $('sceneSel').querySelector('[value=glb]')?.remove(); }).catch(() => {});

window.__wwState = () => ({ mode, hasFace: tracker?.hasFace ?? null, headX: tracker?.headX ?? null, headY: tracker?.headY ?? null, eyeSpan: tracker?.eyeSpan ?? null, eye: eye.toArray() });   // handy in the console

const startScene = params.get('scene') === 'glb' ? 'glb' : 'sidi';
$('sceneSel').value = startScene;
loadWorld(startScene);

if (CAPTURE) {
  // Frame-accurate control for recording: the script sets time, eye and (optionally) a stage camera.
  window.__ww = {
    frame(t, ex, ey, ez, stageCfg) {
      eye.set(ex, ey, ez);
      stageCam = stageCfg ? { fov: stageCfg.fov, pos: new THREE.Vector3(...stageCfg.pos), look: new THREE.Vector3(...stageCfg.look) } : null;
      renderFrame(t, 1 / 30);
    },
    info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
  };
  window.__wwReady = true;
} else {
  loop();
}
