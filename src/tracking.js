/**
 * tracking.js — MediaPipe Face Landmarker wrapper.
 * Reports a smoothed head position: x/y in [-1, 1] and a distance estimate.
 *
 * Needs internet on first run (WASM + ~10 MB model), cached by the browser after.
 */
const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.11';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const NOSE = 4;          // nose tip: stable, centred on the head
const EYE_L = 33;        // outer eye corners, used for the distance estimate
const EYE_R = 263;

export class HeadTracker {
  /**
   * @param {'landscape'|'portrait'} orientation
   *   'landscape' — a normal webcam above or below the screen.
   *   'portrait'  — a phone used as a webcam, standing upright (image rotated 90°).
   */
  constructor(orientation = 'landscape') {
    this.orientation = orientation;
    this.faceLandmarker = null;
    this.lastVideoTime = -1;
    this.headX = 0;      // -1 (viewer's left) … +1 (viewer's right)
    this.headY = 0;      // -1 (down) … +1 (up)
    this.eyeSpan = 0.13; // outer-eye distance in normalised image units (bigger = closer)
    this.hasFace = false;
    this.isReady = false;
    this._rx = 0; this._ry = 0; this._rs = 0.13;
    this.smooth = 0.14;  // lower = smoother and laggier
  }

  async init(video, onStatus = () => {}) {
    this.video = video;
    onStatus('Loading face tracker…');
    const { FaceLandmarker, FilesetResolver } = await import(`${MEDIAPIPE_CDN}/vision_bundle.mjs`);
    const files = await FilesetResolver.forVisionTasks(`${MEDIAPIPE_CDN}/wasm`);
    onStatus('Loading face model (about 10 MB, cached after the first run)…');
    this.faceLandmarker = await FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
    });
    this.isReady = true;
    onStatus('');
  }

  /** Call once per animation frame. */
  update() {
    if (!this.isReady || !this.video) return;
    if (this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const res = this.faceLandmarker.detectForVideo(this.video, performance.now());
      const lm = res.faceLandmarks && res.faceLandmarks[0];
      if (lm) {
        this.hasFace = true;
        const n = lm[NOSE];
        if (this.orientation === 'portrait') {
          // upright phone: image x/y are swapped relative to the room
          this._rx = -(n.y - 0.5) * 2;
          this._ry = -(n.x - 0.5) * 2;
        } else {
          // the camera faces the viewer, so the viewer's right is image-left
          this._rx = -(n.x - 0.5) * 2;
          this._ry = -(n.y - 0.5) * 2;
        }
        this._rs = Math.hypot(lm[EYE_L].x - lm[EYE_R].x, lm[EYE_L].y - lm[EYE_R].y);
      } else {
        this.hasFace = false;
        this._rx *= 0.92; this._ry *= 0.92;   // drift back to centre
      }
    }
    this.headX += (this._rx - this.headX) * this.smooth;
    this.headY += (this._ry - this.headY) * this.smooth;
    this.eyeSpan += (this._rs - this.eyeSpan) * this.smooth;
  }
}
