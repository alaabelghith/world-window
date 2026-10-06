/**
 * glb.js — load any glTF binary as the world behind the window.
 * Drop a file at assets/scene.glb (Blender: File > Export > glTF 2.0, format .glb).
 * The model is centred, scaled to a fixed size and set back behind the glass.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const GLB_PATH = 'assets/scene.glb';

export function buildGLB({ scene, onStatus = () => {} }) {
  const root = new THREE.Group(); scene.add(root);
  scene.background = new THREE.Color(0xbcd8ee);
  scene.fog = new THREE.FogExp2(0xbcd8ee, 0.012);
  root.add(new THREE.HemisphereLight(0xe4f1ff, 0xc9b28f, 1.25));
  const sun = new THREE.DirectionalLight(0xffe2a8, 2.4); sun.position.set(-5, 7, 5); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 0.5, far: 40 });
  sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -0.0008;
  sun.target.position.set(0, 0, -2.8); root.add(sun, sun.target);

  let mixer = null;
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);

  const ready = new Promise((resolve, reject) => {
    onStatus('Loading scene.glb…');
    loader.load(GLB_PATH, (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim === 0) { reject(new Error('Empty scene')); return; }
      const scale = 14 / maxDim;
      model.scale.setScalar(scale);
      model.position.copy(centre).multiplyScalar(-scale);
      model.position.z -= 2.8;                 // set the diorama back behind the glass
      model.traverse((c) => {
        if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; if (c.material) c.material.side = THREE.DoubleSide; }
      });
      root.add(model);
      if (gltf.animations?.length) {
        mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
      }
      onStatus(''); resolve();
    }, (p) => { if (p.total) onStatus(`Loading scene.glb… ${Math.round(p.loaded / p.total * 100)}%`); },
    (err) => { onStatus('No assets/scene.glb found.'); reject(err); });
  });

  return {
    name: 'Your GLB',
    ready,
    update(t, dt) { if (mixer) mixer.update(dt); },
    dispose() { scene.remove(root); scene.background = null; },
  };
}
