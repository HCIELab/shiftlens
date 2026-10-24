import {clamp} from './model.mjs';
import {surfaceAt} from './surface.mjs';

// Ideal magnification: a lens expands its half-period aperture to a full image
// region. Intermediate displacement samples across the A/B boundary in the same
// interleaved texture that is exported for printing. This is not a calibrated
// ray trace; it is deliberately separate from the experimental optics shader.
export function apertureAddress(sourceU, count, phase, padding = 1, textureWidth = 2048, states = 2) {
  const offset=.5-.5/states,q = clamp(sourceU, 0, 1) * count - offset;
  const period = Math.floor(q);
  const guard = Math.min(0.1, (count + 2 * padding) / (2 * textureWidth));
  const local = clamp(q - period, guard * states, 1 - guard * states);
  const encodedPeriod = period + offset + (local + clamp(phase, 0, 1)*(states-1)) / states;
  return (encodedPeriod + padding) / (count + 2 * padding);
}

export const apertureGLSL = `
float apertureAddress(float sourceU) {
  float offset=.5-.5/stateCount;
  float q=clamp(sourceU,0.,1.)*lensCount-offset;
  float period=floor(q);
  float guard=min(.1,(lensCount+2.)/(2.*encodedWidth));
  float local=clamp(fract(q),guard*stateCount,1.-guard*stateCount);
  return (period+offset+(local+phase*(stateCount-1.))/stateCount+1.)/(lensCount+2.);
}
`;

// Match the image canvas to the actual surface dimensions instead of forcing
// every uploaded image into a fixed 2:1 rectangle.
export function imageCanvasSize(assembly, width = 2048) {
  if (!assembly) return {width, height: width / 2};
  const surface = assembly.surface;
  const start = assembly.door ? -0.5 : 0;
  let along = 0, across = 0;
  let previousU = surfaceAt(surface, start, 0.5);
  let previousV = surfaceAt(surface, start + 0.5, 0);
  for (let i = 1; i <= 100; i++) {
    const u = surfaceAt(surface, start + i / 100, 0.5);
    const v = surfaceAt(surface, start + 0.5, i / 100);
    along += Math.hypot(...u.map((x, j) => x - previousU[j]));
    across += Math.hypot(...v.map((x, j) => x - previousV[j]));
    previousU = u; previousV = v;
  }
  return {width, height: Math.max(512, Math.min(4096, Math.round(width * across / Math.max(1, along))))};
}
