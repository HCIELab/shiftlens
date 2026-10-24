import {frameAt, motionPoint, add, sub, scale, dot, cross, unit} from './surface.mjs';

// Orthonormal placement frames and the same rigid transform as the surface.
export function switchFrame(surface, u, v) {
  const f = frameAt(surface, u, v);
  return {origin: f.position, x: unit(cross(f.tangent, f.normal)), y: f.tangent, z: f.normal};
}
export function framePoint(f, p) {
  return add(f.origin, add(scale(f.x, p[0]), add(scale(f.y, p[1]), scale(f.z, p[2]))));
}
export function frameCoordinates(f, p) {
  const q = sub(p, f.origin);
  return [dot(q, f.x), dot(q, f.y), dot(q, f.z)];
}
export function frameMatrix(f) {
  return [...f.x, 0, ...f.y, 0, ...f.z, 0, ...f.origin, 1];
}
export function motionMatrix(surface, fraction) {
  const origin = motionPoint(surface, [0, 0, 0], fraction);
  return frameMatrix({origin, ...Object.fromEntries(['x','y','z'].map((key, i) => {
    const p = [0,0,0]; p[i] = 1;
    return [key, sub(motionPoint(surface, p, fraction), origin)];
  }))});
}
