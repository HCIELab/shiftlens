import {DEFAULTS, serializeProject, readProject} from './model.mjs';
import {SURFACE_PRESETS, validateSurface} from './surface.mjs';

export function newDesign() {
  return {
    name: 'Untitled design',
    preset: null,
    parameters: {...DEFAULTS, switchEnabled: false, mechanismType:'custom'},
    surface: {
      curve: {points: [], interpolation: 'smooth'},
      motion: {type: null, origin: [0, 0, 0], axis: [0, 1, 0], angleDeg: 40, distance: 90},
      flip: true,
    },
    mechanism: 'custom',
    images: [null, null],
    crops: [{zoom: 1, x: 0, y: 0, fit: 'cover'}, {zoom: 1, x: 0, y: 0, fit: 'cover'}],
  };
}

export function designReady(design) {
  return Boolean(design.surface.motion.type && design.surface.curve.points.length >= 2);
}

export function isPlanarRadial(surface) {
  const {motion: m, curve: {points: p}} = surface;
  return m.type === 'revolution' && surface.flip === true &&
    m.angleDeg >= 15 && m.angleDeg <= 300 &&
    m.origin.every(x => Math.abs(x) < 1e-8) &&
    Math.abs(m.axis[0]) + Math.abs(m.axis[1]) < 1e-8 && m.axis[2] > 0 &&
    p.length === 2 && p.every(p => Math.abs(p[1]) + Math.abs(p[2]) < 1e-8) &&
    p[0][0] >= 40 && p[1][0] - p[0][0] >= 35 && p[1][0] <= 300;
}

export function serializeDesign(design) {
  return {
    ...serializeProject(design.parameters, design.images, design.crops),
    name: design.name,
    surface: structuredClone(design.surface),
    preset: design.preset,
    mechanism: design.mechanism,
  };
}

export function restoreDesign(value) {
  const common = readProject(value);
  const surface = structuredClone(value.surface ?? SURFACE_PRESETS.door.surface);
  // Empty curves are valid saved drafts. Validate their axis and motion settings
  // using a temporary curve; it never becomes part of the saved design.
  if (surface.curve?.points?.length === 0) {
    validateSurface({...surface, curve: {points: [[0, 0, 0], [1, 0, 0]]},
      motion: {...surface.motion, type: surface.motion.type ?? 'translation'}});
  } else {
    validateSurface(surface);
  }
  if (surface.motion.type !== null && !['translation', 'revolution', 'screw'].includes(surface.motion.type)) {
    throw new Error('Unsupported surface type.');
  }
  common.parameters.mechanismType=common.parameters.switchEnabled?(value.mechanism??common.parameters.mechanismType):'custom';
  return {
    ...common,
    name: typeof value.name === 'string' ? value.name.slice(0, 100) : SURFACE_PRESETS[value.preset]?.name ?? 'Imported design',
    surface,
    preset: value.preset in SURFACE_PRESETS ? value.preset : null,
    mechanism: common.parameters.switchEnabled ? (['switch','knob','roller'].includes(value.mechanism)?value.mechanism:common.parameters.mechanismType??'switch') : 'custom',
  };
}
