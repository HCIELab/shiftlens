import source from './assets/original-door-meta.mjs';

export const originalDoorParameters = Object.freeze({
  nativeDoor: true, innerRadius: source.innerRadius, outerRadius: source.outerRadius,
  sweepDeg: source.sweepDeg, pitch: 5, substrate: source.substrate,
  baseThickness: source.baseThickness, clearance: source.clearance,
  railThickness: source.railThickness, gap: .2,
  switchRadius: source.outerRadius - 12, switchAngleDeg: 0,
});

export function usesOriginalLens(p) {
  return p.nativeDoor === true && ['innerRadius','outerRadius','sweepDeg','pitch','substrate']
    .every(key => Math.abs(p[key]-originalDoorParameters[key]) < 1e-5);
}
export function usesOriginalRails(p) {
  return usesOriginalLens(p) && ['baseThickness','clearance','railThickness','gap']
    .every(key => Math.abs(p[key]-originalDoorParameters[key]) < 1e-5);
}
