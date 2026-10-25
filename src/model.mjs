import {usesOriginalLens,usesOriginalLayout} from './original-door-profile.mjs';
export const DEG = Math.PI / 180;
export const DEFAULTS = Object.freeze({innerRadius: 100, outerRadius: 170, sweepDeg: 40, pitch: 5, substrate: 0.8, baseThickness: 5, clearance: 0.3, gap: 0.35, railThickness: 3, rails: true, switchEnabled: true, mechanismType: 'switch', stateCount: 2, switchRadius: 145, switchAngleDeg: 0, switchU: .5, switchV: .55, ior: 1.5, nativeDoor: false, opticalProfile: false, lensRadiusRatio: 0.502, autoOptimize: true, visibilityThreshold: .7, opticsProfile: 'recomputed-halfdeg-v1', knobMode: 'smooth'});
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function derive(input = {}) {
  const p = {...DEFAULTS, ...input};
  for (const key of Object.keys(DEFAULTS)) if (typeof DEFAULTS[key] === 'number' && !Number.isFinite(p[key])) throw new Error(`${key} must be a finite number`);
  if (p.innerRadius < 40 || p.outerRadius - p.innerRadius < 35 || p.outerRadius > 300) throw new Error('Use an inner radius of at least 40 mm and a radial span of at least 35 mm.');
  if (p.sweepDeg < 15 || p.sweepDeg > 300 || p.pitch < 2.5 || p.pitch > 10) throw new Error('Sweep must be 15–300° and lens pitch 2.5–10 mm.');
  if (p.substrate < 0.4 || p.substrate > 20 || p.baseThickness < 2 || p.baseThickness > 10 || p.clearance < 0.15 || p.clearance > 1 || p.gap < 0.2 || p.gap > 2 || p.railThickness < 1.5 || p.railThickness > 5 || p.ior < 1.2 || p.ior > 1.8) throw new Error('Optical or fabrication dimensions are outside the supported range.');
  if (typeof p.opticalProfile !== 'boolean' || p.lensRadiusRatio <= .5 || p.lensRadiusRatio > 15) throw new Error('Lens radius must be greater than half the local pitch and at most 15 times it.');
  if(typeof p.autoOptimize!=='boolean'||p.visibilityThreshold<.1||p.visibilityThreshold>.9||!['source-1deg-v1','recomputed-halfdeg-v1'].includes(p.opticsProfile))throw new Error('Invalid automatic optical optimization settings.');
  const sweep = p.sweepDeg * DEG;
  const nativeProfile = usesOriginalLens(p);
  const count = usesOriginalLayout(p) ? 20 : Math.max(3, Math.floor(sweep * (p.innerRadius + 0.1 * (p.outerRadius - p.innerRadius)) / p.pitch));
  if(!['smooth','indexed'].includes(p.knobMode))throw new Error('Choose smooth or indexed knob motion.');
  if(!['switch','knob','roller','custom'].includes(p.mechanismType))throw new Error('Unsupported mechanism.');
  if(!Number.isInteger(p.stateCount)||p.stateCount<2||p.stateCount>10)throw new Error('Use 2–10 image states.');
  if(p.switchEnabled&&p.mechanismType==='switch'&&p.stateCount!==2)throw new Error('The switch has two states.');
  if(p.switchEnabled&&p.mechanismType==='knob'&&p.stateCount>5)throw new Error('The knob supports up to five image states.');
  const delta = sweep / count, travel = delta * (p.stateCount-1)/p.stateCount;
  const maxCap = p.outerRadius * Math.sin(delta / 2);
  const rimHeight = p.substrate + maxCap + 0.4;
  const maskThickness = nativeProfile ? .3 : .18, paperZ = nativeProfile ? -p.gap : -p.gap-.18;
  return {...p, nativeProfile, sweep, count, delta, travel, maxCap, rimHeight, a0: -sweep / 2, a1: sweep / 2, maskThickness, paperZ, baseBottom: paperZ-p.baseThickness, switchAngle: p.switchAngleDeg * DEG};
}
export function serializeProject(parameters, images, crops) { return {format: 'shiftlens-project', version: 2, units: 'mm', parameters, images, crops}; }
export function readProject(value) {
  if (!value || !['shiftlens-project','shiftlens-door-sign'].includes(value.format) || ![1,2].includes(value.version) || value.units !== 'mm') throw new Error('This is not a supported ShiftLens project.');
  const d = derive(value.parameters);

  if (!Array.isArray(value.images) || value.images.length !== d.stateCount || value.images.some(x => !(x === null && value.version === 2) && (typeof x !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(x) || x.length > 30_000_000))) throw new Error('Project must contain one embedded image per state, using PNG, JPEG, or WebP images.');
  const crops = Array.isArray(value.crops) && value.crops.length === d.stateCount ? value.crops : Array.from({length:d.stateCount},()=>({zoom:1,x:0,y:0}));
  for (const crop of crops) if (!crop || !Number.isFinite(crop.zoom) || crop.zoom < 1 || crop.zoom > 3 || !Number.isFinite(crop.x) || !Number.isFinite(crop.y) || Math.abs(crop.x) > 1 || Math.abs(crop.y) > 1 || (crop.fit !== undefined && !['contain','cover'].includes(crop.fit))) throw new Error('Invalid image crop.');
  return {parameters: {...DEFAULTS, ...value.parameters}, images: value.images, crops};
}
// Region compression uses the same ordered state bands as the legacy encoder.
// A quarter-period phase puts state 1 under each initial lens center.
export function encodingSample(u, count, states=2) {
  const offset=.5-.5/states, q = u * count - offset;
  const period = Math.floor(q), fraction = q - period;
  const state = Math.min(states-1, Math.floor(fraction * states));
  return {state, sourceU: clamp((period + (fraction * states - state) + offset) / count, 0, 1)};
}
export function remapImageRGBA(sourceA, sourceB, width, height, count) {
  const sources = [sourceA, sourceB];
  if (sources.some(x => x.length !== width * height * 4)) throw new Error('Image dimensions do not match encoding dimensions.');
  const output = new Uint8ClampedArray(width * height * 4);
  for (let x = 0; x < width; x++) {
    const s = encodingSample((x + 0.5) / width, count);
    const sx = clamp(Math.floor(s.sourceU * width), 0, width - 1);
    for (let y = 0; y < height; y++) {
      const a = (y * width + sx) * 4, b = (y * width + x) * 4;
      output[b] = sources[s.state][a]; output[b + 1] = sources[s.state][a + 1]; output[b + 2] = sources[s.state][a + 2]; output[b + 3] = 255;
    }
  }
  return output;
}
