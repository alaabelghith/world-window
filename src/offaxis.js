/**
 * offaxis.js — off-axis (asymmetric frustum) projection.
 *
 * The screen is a fixed rectangle in the world: centred on the origin, lying in
 * the z = 0 plane, `2*hw` wide and `2*hh` tall. The camera sits at the viewer's
 * eye and always looks straight down -z; the frustum is skewed so its edges pass
 * exactly through the screen's edges. That is what keeps the scene locked to the
 * bezel and makes the screen read as a window instead of a moving picture.
 */
export function applyOffAxis(camera, eye, hw, hh, near = 0.05, far = 8000) {
  const ez = Math.max(eye.z, 0.15);
  const k = near / ez;
  camera.projectionMatrix.makePerspective(
    (-hw - eye.x) * k, (hw - eye.x) * k,
    (hh - eye.y) * k, (-hh - eye.y) * k,
    near, far
  );
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  camera.position.set(eye.x, eye.y, ez);
  camera.quaternion.identity();
  camera.updateMatrixWorld(true);
}
