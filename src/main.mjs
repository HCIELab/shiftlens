import {OpticsPanel} from './optics-panel.mjs';
import './style.css';
import {derive, DEG} from './model.mjs';
import {SURFACE_PRESETS, validateSurface, frameAt} from './surface.mjs';
import {newDesign, designReady, isPlanarRadial, serializeDesign, restoreDesign} from './project.mjs';
import {CurveEditor} from './curve-editor.mjs';
import {Viewer} from './viewer.mjs';
import {imageCanvasSize} from './preview.mjs';
import {nativeAt,slideFraction} from './native-actuation.mjs';
import {originalDoorParameters} from './original-door-profile.mjs';
import {loadImage, cropCanvas, encodeCanvases, uploadFile, download} from './images.mjs';
import {exportBundle, fanPrint, manufacturing3MF} from './export.mjs';
import {referenceImages, referenceCrops} from './defaults.mjs';
import translationIcon from './assets/translation-type.png';
import revolutionIcon from './assets/revolve-type.png';
import screwIcon from './assets/combined-type.png';

const $ = id => document.getElementById(id);
const clone = value => structuredClone(value);
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const STORAGE_KEY = 'shiftlens-project-v1';
const history = [], future = [];
let state = newDesign();
let assembly = null, revision = 0, imageRevision = 0, pending = false, failed = false;
let phase = 0, playing = false, direction = 1, mode = 'assembly', placing = false;
let encoded = null, timer, toastTimer, refit = true;
const imageCache = new Map();
const optics = new OpticsPanel(()=>$('optics-panel'), parameters=>{
  remember();Object.assign(state.parameters,parameters);
  renderWorkflow();schedule();
}, report=>download('shiftlens-optical-evaluation.json',JSON.stringify(report,null,2),'application/json'));


try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) state = restoreDesign(JSON.parse(saved));
} catch { /* A corrupt saved draft does not prevent starting a new project. */ }

mode = state.images.every(Boolean) ? 'appearance' : 'assembly';

const worker = new Worker(new URL('./geometry.worker.mjs', import.meta.url), {type: 'module'});
const viewer = new Viewer($('canvas-host'), point => {
  remember();
  if (point.u !== undefined) {
    state.parameters.switchU = point.u;
    state.parameters.switchV = point.v;
  } else {
    state.parameters.switchRadius = point.radius;
    state.parameters.switchAngleDeg = point.angle;
  }
  setPlacement(false,{keepPreview:true});
  renderWorkflow();
  schedule();
}, (valid, commit) => {
  if (commit) notify(valid.message);
  else $('place-tip').textContent = valid.message;
}, value=>{playing=false;setPhase(value);refreshAvailability();});
const curveEditor = new CurveEditor($('curve-dialog'), curve => {
  const next = {...clone(state.surface), curve};
  // Give a newly drawn flat profile an upward-facing lens side.
  if (!state.surface.curve.points.length && next.motion.type === 'revolution') {
    const heights = curve.points.map(p => p[2]);
    if (Math.max(...heights) - Math.min(...heights) < 0.001) {
      next.flip = false;
      next.flip = frameAt(next, 0.5, 0.5).normal[2] < 0;
    }
  }
  validateSurface(next);
  remember();
  state.surface = next;
  state.preset = null;
  refit = true;
  renderWorkflow();
  schedule();
});
viewer.tick = dt => {
  if (!playing || placing) return;
  phase += dt * Number($('speed').value) * direction;
  if (phase >= 1) { phase = 1; direction = -1; }
  if (phase <= 0) { phase = 0; direction = 1; }
  setPhase(phase);
};

function capture() { return clone(state); }
function remember() {
  history.push(capture());
  if (history.length > 30) history.shift();
  future.length = 0;
  updateUndo();
}
function updateUndo() {
  $('undo').disabled = !history.length;
  $('redo').disabled = !future.length;
}
function undo(redo = false) {
  const from = redo ? future : history, to = redo ? history : future;
  if (!from.length) return;
  to.push(capture());
  state = from.pop();
  playing = false;
  refit = true;
  setPlacement(false);
  renderWorkflow();
  schedule();
  updateUndo();
}
function notify(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeDesign(state)));
    $('save-status').textContent = 'Saved locally';
  } catch { $('save-status').textContent = 'Use Save to keep this project'; }
}
function resizeStates(n){state.images=Array.from({length:n},(_,i)=>state.images[i]??null);state.crops=Array.from({length:n},(_,i)=>state.crops[i]??{zoom:1,x:0,y:0,fit:'cover'});state.parameters.stateCount=n;}
function hasImages() { return state.images.every(Boolean); }
function syncShape() {
  if (!isPlanarRadial(state.surface)) return false;
  state.parameters.innerRadius = state.surface.curve.points[0][0];
  state.parameters.outerRadius = state.surface.curve.points[1][0];
  state.parameters.sweepDeg = state.surface.motion.angleDeg;
  return true;
}
function schedule() {
  optics.invalidate(designReady(state));
  clearTimeout(timer);
  revision++;
  failed = false;
  persist();
  if (!designReady(state)) {
    pending = false;
    assembly = null;
    viewer.clear();
    $('empty-design').hidden = false;
    $('empty-design').querySelector('p').innerHTML = state.surface.motion.type
      ? 'Define the primary curve in Step 1.'
      : 'Choose a surface type in Step 1,<br>then define the primary curve.';
    $('status-text').textContent = state.surface.motion.type ? 'Primary curve not defined.' : 'New design — select a surface type.';
    $('model-name').textContent = state.name;
    renderDetails();
    refreshAvailability();
    updateImages();
    return;
  }
  pending = true;
  if (!assembly) { $('empty-design').hidden = false; $('empty-design').querySelector('p').textContent = 'Generating surface…'; }
  $('status-text').textContent = 'Updating geometry…';
  refreshAvailability();
  timer = setTimeout(rebuild, 160);
}
function rebuild() {
  try {
    validateSurface(state.surface);
    const radial = syncShape();
    const dimensions = derive(state.parameters);
    state.parameters.mechanismType=state.mechanism;
    state.parameters.stateCount=state.images.length;
    worker.postMessage({revision, parameters: state.parameters, surface: radial ? null : state.surface});
  } catch (error) { showFailure(error.message); }
}
function showFailure(message) {
  pending = false;
  failed = true;
  setPlacement(false);
  $('status-text').textContent = message;
  $('model-checks').textContent = 'This edit is invalid. Export is disabled.';
  refreshAvailability();
}
worker.onmessage = async ({data}) => {
  if (data.revision !== revision) return;
  if (data.error) { showFailure(data.error); return; }
  assembly = data.assembly;
  optics.setAssembly(assembly);
  viewer.setAssembly(assembly, refit);
  refit = false;
  await updateImages();
  if (data.revision !== revision) return;
  pending = false;
  failed = false;
  $('empty-design').hidden = true;
  $('model-name').textContent = state.name;
  updateReadyStatus();
  setMode(hasImages() ? mode : 'assembly');
  setPhase(phase);
  renderDetails();
  refreshAvailability();
  persist();
};
worker.onerror = event => showFailure(`Geometry could not be computed: ${event.message}`);

function updateReadyStatus() {
  if (!assembly || pending || failed) return;
  $('status-text').textContent = !state.images.some(Boolean)
    ? 'Geometry ready · upload images in Step 2'
    : mode === 'assembly' ? 'Geometry inspection · Start opens image simulation'
    : mode === 'pattern' ? 'Encoded print texture'
    : viewer.rayTrace && assembly.door ? 'Experimental ray trace · not physically calibrated'
    : 'Image preview · idealized lens-aperture mapping';
}

async function imageFor(url) {
  if (!imageCache.has(url)) imageCache.set(url, loadImage(url));
  return imageCache.get(url);
}
function emptyCanvas(width = 2048, height = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}
async function updateImages() {
  const current = ++imageRevision;
  try {
    const images = await Promise.all(state.images.map(url => url ? imageFor(url) : null));
    if (current !== imageRevision) return;
    const size = imageCanvasSize(assembly);
    const canvases = images.map((image, i) => image ? cropCanvas(image, state.crops[i], size.width, size.height) : emptyCanvas(size.width, size.height));
    const texture = state.images.some(Boolean) ? encodeCanvases(canvases, assembly?.derived.count ?? 16, 1, Boolean(assembly?.door || state.surface.flip)) : null;
    encoded = hasImages() ? texture : null;
    viewer.setTextures(texture ?? emptyCanvas(), ...canvases);
    const canvas = $('pattern-canvas');
    canvas.width = encoded?.width ?? 1; canvas.height = encoded?.height ?? 1;
    if (encoded) canvas.getContext('2d').drawImage(encoded, 0, 0);
    for (const [i, id] of [[0,'thumb-a'],[state.images.length-1,'thumb-b']]) {
      $(id).hidden = !state.images[i];$(id).alt=`State ${i+1}`;
      if (state.images[i]) $(id).src = canvases[i].toDataURL();
      else $(id).removeAttribute('src');
    }
    refreshAvailability();
    updateReadyStatus();
    persist();
  } catch (error) { notify(`Image processing failed: ${error.message}`); }
}
function setPhase(value) {
  phase = Math.max(0, Math.min(1, value));
  viewer.update(phase);
  $('phase').value = phase;
  const index=phase*(state.images.length-1);
  $('phase-label').textContent = Math.abs(index-Math.round(index))<.025?`State ${Math.round(index)+1}`:`${Math.round(phase*100)}%`;
  const m=assembly?.mechanism,k=m?nativeAt(assembly.surface,m,phase):null;
  $('travel-label').textContent=k?`${k.distance.toFixed(2)} mm lens · ${(k.angle/DEG).toFixed(1)}° ${m.type}`:assembly?.door?`${(assembly.derived.travel*phase/DEG).toFixed(2)}° lens`:'';
}
function toggleSimulation() {
  if (!assembly || pending || failed) return;
  const start = !playing;
  if (start) {
    setPlacement(false);
    viewer.exploded = false;
    $('explode').classList.remove('active');
    viewer.update(phase);
    if (state.images.some(Boolean)) setMode('appearance');
  }
  playing = start;
  refreshAvailability();
}
function setPlacement(value,options={}) {
  placing = value;
  playing = false;
  viewer.setPlacement(value,{...options,type:state.mechanism});
  $('place-tip').hidden = !value;
  if (value) {
    viewer.exploded = false;
    $('explode').classList.remove('active');
    viewer.toggleLayer('lens', true);
    setMode('assembly');
    setPhase(0);
    viewer.update(0);
    $('place-tip').textContent = 'Move over the lens: green fits, red cannot be placed. Click to confirm. Esc to cancel.';
  }
  refreshAvailability();
}
function setMode(value) {
  if (placing && value !== 'assembly') setPlacement(false);
  mode = value;
  $('top').textContent = value === 'appearance' ? 'Front' : 'Top';
  viewer.setMode(value === 'assembly' ? 'assembly' : 'appearance');
  $('pattern-panel').hidden = value !== 'pattern';
  for (const name of ['assembly', 'appearance', 'pattern']) $(`view-${name}`).classList.toggle('active', name === value);
  updateReadyStatus();
}
function refreshAvailability() {
  const ready = Boolean(assembly && !pending && !failed);
  $('state-b').setAttribute('aria-label',`Preview state ${state.images.length}`);
  const label=$('state-b').querySelector('span');if(label)label.textContent=String(state.images.length);
  $('export').disabled = !ready || Boolean(assembly?.checks.collisions.length) || Boolean(assembly?.placement&&!assembly.placement.valid);
  $('start-simulation').disabled = !ready;
  $('start-simulation').textContent = playing ? 'Stop' : 'Start';
  $('play').disabled = !ready;
  $('play').textContent = playing ? 'Stop' : 'Start';
  $('play').setAttribute('aria-label', playing ? 'Stop simulation' : 'Start simulation');
  $('phase').disabled = !ready;
  for (const id of ['state-a', 'state-b', 'fit', 'top', 'explode']) $(id).disabled = !ready;
  $('view-appearance').disabled = !ready || !state.images.some(Boolean);
  $('view-pattern').disabled = !ready || !hasImages();
  $('print-pattern').hidden = !assembly?.door;
  $('download-print').hidden = !assembly?.door || !hasImages();
  $('download-print').disabled = !ready;
  $('export-help').textContent = ready && !hasImages() ? 'Exports the 3D assembly. Upload all state images to include encoded images and print files.' : '';
  const place = $('place-switch');
  if (place) { place.disabled = !assembly || pending || state.mechanism === 'custom'; place.textContent = placing ? 'Cancel placement' : `Place the ${state.mechanism[0].toUpperCase()+state.mechanism.slice(1)}`; }
  document.querySelectorAll('[data-preview]').forEach(button => { button.disabled = !ready || !state.images[Number(button.dataset.preview)]; });
  updateUndo();
}

function range(label, key, min, max, step, value, unit = '', target = 'parameter') {
  return `<div class="control-row"><label for="range-${key}">${label}</label><input id="range-${key}" type="range" aria-label="${label}" data-target="${target}" data-key="${key}" data-unit="${unit}" min="${min}" max="${max}" step="${step}" value="${value}"><output id="out-${key}">${Number(value).toFixed(step < 1 ? 2 : 0)}${unit}</output></div>`;
}
function surfaceIcon(type) {
  const source = {translation: translationIcon, revolution: revolutionIcon, screw: screwIcon}[type];
  return `<img src="${source}" alt="">`;
}
function renderWorkflow() {
  const p = state.parameters, s = state.surface, type = s.motion.type;
  const ready = designReady(state), radial = isPlanarRadial(s);
  $('design-name').textContent = state.name;
  $('examples').value = '';
  $('panel').innerHTML = `
    <section class="step" aria-labelledby="step-1"><h1 id="step-1">Step 1: Define Surfaces and Lenses</h1>
      <label class="group-label">Choose Surface Type</label>
      <div class="surface-types">${[['translation', 'Translation'], ['revolution', 'Revolution'], ['screw', 'Screw']].map(([key, label]) => `<button class="surface-type ${type === key ? 'selected' : ''}" data-surface="${key}" aria-pressed="${type === key}">${surfaceIcon(key)}<span>${label}</span></button>`).join('')}</div>
      <div class="selection-row"><label>Select Primary Curve</label><button id="define-curve" ${type ? '' : 'disabled'}>${s.curve.points.length ? 'Edit…' : 'Define…'}</button><span>${s.curve.points.length ? `${s.curve.points.length} points` : 'Not defined'}</span></div>
      <div class="selection-row"><label>${type === 'translation' ? 'Select Translation Direction' : 'Select Revolve Axis'}</label><button id="define-axis" ${type ? '' : 'disabled'}>Define…</button><span>${type ? s.motion.axis.join(', ') : ''}</span></div>
      <fieldset ${type ? '' : 'disabled'}>
        ${type !== 'translation' ? range('Revolve Angle', 'angleDeg', 15, 300, 1, s.motion.angleDeg, '°', 'motion') : ''}
        ${type === 'translation' || type === 'screw' ? range('Translation Distance', 'distance', 10, 160, 1, s.motion.distance, ' mm', 'motion') : ''}
        ${range('Lens Width', 'pitch', 2.5, 9, 0.25, p.pitch, ' mm')}
        <div class="selection-row"><label>Flip Lens Side</label><button id="flip-side" aria-pressed="${s.flip}">Flip</button></div>
        <div class="control-row"><label for="rails">Add Rail <input id="rails" type="checkbox" ${p.rails ? 'checked' : ''}></label><input type="range" aria-label="Rail thickness" data-target="parameter" data-key="railThickness" data-unit=" mm" min="1.5" max="4" step="0.1" value="${p.railThickness}"><output id="out-railThickness">${p.railThickness} mm</output></div>
        ${range('Surface Thickness', 'baseThickness', 2, 8, 0.25, p.baseThickness, ' mm')}
      </fieldset>
      <details class="advanced"><summary>Additional lens settings</summary>${range('Substrate Height', 'substrate', 0.4, p.opticalProfile?20:5, 0.1, p.substrate, ' mm')}${p.opticalProfile?range('Lens Radius / Pitch', 'lensRadiusRatio', .5001, 15, .001, p.lensRadiusRatio):''}${range('Refractive Index', 'ior', 1.2, 1.8, 0.01, p.ior)}${range('Image Air Gap', 'gap', 0.2, 1, 0.05, p.gap, ' mm')}${range('Sliding Clearance', 'clearance', 0.15, 1, 0.05, p.clearance, ' mm')}</details>
      <details id="optics-details" class="advanced" ${optics.open?'open':''}><summary>Optical evaluation and optimization</summary><div id="optics-panel"></div></details>
    </section>
    <section class="step" aria-labelledby="step-2"><h2 id="step-2">Step 2: Actuation Mechanism and Images</h2>
      <label class="group-label" for="mechanism">Select (Optional) Actuation Mechanism</label>
      <select id="mechanism" ${ready ? '' : 'disabled'}><option value="custom" ${state.mechanism === 'custom' ? 'selected' : ''}>User Custom</option><option value="switch" ${state.mechanism === 'switch' ? 'selected' : ''}>Switch</option><option value="knob" ${state.mechanism==='knob'?'selected':''}>Knob</option><option value="roller" ${state.mechanism==='roller'?'selected':''}>Roller</option></select>
      ${state.mechanism !== 'custom' ? `<button id="place-switch" class="place-button">Place the ${state.mechanism}</button><details class="advanced"><summary>Mechanism position</summary>${radial ? `${range('Radius', 'switchRadius', p.innerRadius + 17, p.outerRadius - 9, 0.5, p.switchRadius, ' mm')}${range('Angle', 'switchAngleDeg', -p.sweepDeg / 2 + 7, p.sweepDeg / 2 - 7, 0.25, p.switchAngleDeg, '°')}` : `${range('Along motion', 'switchU', .05, .95, .005, p.switchU)}${range('Along curve', 'switchV', .05, .95, .005, p.switchV)}`}</details>` : '<p class="hint">Use the timeline to move the lens.</p>'}
      ${state.mechanism!=='switch'?`<label class="fit-label">Image states <select id="state-count" aria-label="Number of image states">${Array.from({length:(state.mechanism==='knob'?5:10)-1},(_,i)=>i+2).map(n=>`<option value="${n}" ${state.images.length===n?'selected':''}>${n}</option>`).join('')}</select></label>`:''}
      ${state.mechanism==='knob'||state.mechanism==='roller'?'<p class="hint">Drag the handle to move the lens, or use the timeline.</p>':''}
      <label class="group-label image-heading">Upload Images at Different States</label>
      ${state.images.map((url, i) => `<div class="image-state"><label class="state-label">${state.mechanism === 'custom'?'':state.mechanism[0].toUpperCase()+state.mechanism.slice(1)+' '}State ${i + 1}:</label><label class="browse-row"><span>${url ? 'Image loaded' : 'No image selected'}</span><span class="browse-button">Browse…</span><input type="file" data-upload="${i}" accept="image/png,image/jpeg,image/webp" aria-label="Upload image for state ${i + 1}"></label><div class="image-preview-row">${url ? `<img src="${url}" alt="Image for state ${i + 1}">` : '<div class="no-image">No image</div>'}<button data-preview="${i}">Preview State in Viewport</button>${url ? `<button class="remove-image" data-remove-image="${i}" aria-label="Remove image for state ${i + 1}">×</button>` : ''}</div>${url ? `<details class="advanced image-adjust"><summary>Adjust image</summary><label class="fit-label">Fit <select data-fit="${i}" aria-label="Image fit for state ${i + 1}"><option value="cover" ${state.crops[i].fit !== 'contain' ? 'selected' : ''}>Fill area</option><option value="contain" ${state.crops[i].fit === 'contain' ? 'selected' : ''}>Whole image</option></select></label>${range('Zoom', `crop-${i}-zoom`, 1, 3, 0.02, state.crops[i].zoom, '×', 'crop')}${range('Horizontal Crop', `crop-${i}-x`, -1, 1, 0.02, state.crops[i].x, '', 'crop')}${range('Vertical Crop', `crop-${i}-y`, -1, 1, 0.02, state.crops[i].y, '', 'crop')}</details>` : ''}</div>`).join('')}
      <button id="reference-images">Use reference sign images</button><button id="swap-images" ${hasImages() ? '' : 'disabled'}>Swap images</button>
    </section>
    <section class="step" aria-labelledby="step-3"><h2 id="step-3">Step 3: Simulate and Export</h2>
      <div class="selection-row"><label>Start Simulation</label><button id="start-simulation">Start</button></div>
      <div class="selection-row"><label>Export Files</label><button id="export">Export</button></div>
      <p class="hint" id="export-help"></p><button id="download-print" hidden>Download paper insert</button>
      <details class="advanced"><summary>Model details and checks</summary><div id="model-details"></div><p id="model-checks"></p><p class="hint" id="preview-note"></p>${radial ? `<label class="layer"><input id="ray-trace" type="checkbox" ${viewer.rayTrace ? 'checked' : ''}>Experimental ray-traced optics</label>` : ''}<div id="layers"></div></details>
    </section>`;
  bindWorkflow();
  renderDetails();
  refreshAvailability();
}

function bindWorkflow() {
  $('optics-details').ontoggle=e=>{optics.open=e.target.open;};
  optics.render();
  document.querySelectorAll('[data-surface]').forEach(button => button.onclick = () => {
    remember();
    const type = button.dataset.surface;
    state.surface.motion.type = type;
    state.surface.motion.axis = type === 'translation' ? [0, 1, 0] : [0, 0, 1];
    state.surface.motion.angleDeg = type === 'translation' ? 0 : 40;
    state.surface.motion.distance = type === 'revolution' ? 0 : type === 'screw' ? 24 : 90;
    state.surface.flip = type === 'translation';
    state.parameters.switchEnabled = false;
    state.mechanism = 'custom';
    state.preset = null;
    refit = true;
    renderWorkflow();
    schedule();
  });
  $('define-curve').onclick = () => curveEditor.open(state.surface.curve);
  $('define-axis').onclick = openAxisEditor;
  $('flip-side').onclick = () => { remember(); state.surface.flip = !state.surface.flip; renderWorkflow(); schedule(); };
  $('rails').onchange = event => { remember(); state.parameters.rails = event.target.checked; schedule(); };
  document.querySelectorAll('[data-key]').forEach(input => input.oninput = () => {
    remember();
    const key = input.dataset.key, value = Number(input.value);
    $(`out-${key}`).textContent = value.toFixed(Number(input.step) < 1 ? 2 : 0) + (input.dataset.unit ?? '');
    if (input.dataset.target === 'crop') {
      const [, index, field] = key.split('-');
      state.crops[Number(index)][field] = value;
      updateImages();
    } else {
      if (input.dataset.target === 'motion') state.surface.motion[key] = value;
      else state.parameters[key] = value;
      schedule();
    }
  });
  $('mechanism').onchange = event => {
    remember();
    state.mechanism = event.target.value;
    state.parameters.switchEnabled = state.mechanism !== 'custom';
    state.parameters.mechanismType=state.mechanism;
    resizeStates(state.mechanism==='switch'?2:Math.min(state.images.length,state.mechanism==='knob'?5:10));
    setPlacement(false);
    renderWorkflow();
    schedule();
  };
  if($('state-count'))$('state-count').onchange=e=>{remember();resizeStates(Number(e.target.value));setPhase(0);renderWorkflow();schedule();};
  if ($('place-switch')) $('place-switch').onclick = () => setPlacement(!placing);
  document.querySelectorAll('[data-upload]').forEach(input => input.onchange = async () => {
    if (!input.files[0]) return;
    try {
      const index = Number(input.dataset.upload), url = await uploadFile(input.files[0]);
      remember();
      state.images[index] = url;
      state.crops[index] = {zoom: 1, x: 0, y: 0, fit: 'cover'};
      renderWorkflow();
      await updateImages();
      if (hasImages() && assembly) setMode('appearance');
    } catch (error) { notify(error.message); }
  });
  document.querySelectorAll('[data-preview]').forEach(button => button.onclick = () => {
    playing = false;
    setMode('appearance');
    setPhase(Number(button.dataset.preview)/(state.images.length-1));
    refreshAvailability();
  });
  document.querySelectorAll('[data-remove-image]').forEach(button => button.onclick = () => {
    remember();
    state.images[Number(button.dataset.removeImage)] = null;
    setMode('assembly');
    renderWorkflow();
    updateImages();
  });
  document.querySelectorAll('[data-fit]').forEach(select => select.onchange = () => {
    remember(); state.crops[Number(select.dataset.fit)].fit = select.value; updateImages();
  });
  $('reference-images').onclick = async () => { remember(); state.images = [...referenceImages,...state.images.slice(2)]; state.crops = [...referenceCrops(),...state.crops.slice(2)]; renderWorkflow(); await updateImages(); if (assembly) setMode('appearance'); };
  $('swap-images').onclick = () => { remember(); state.images.reverse(); state.crops.reverse(); renderWorkflow(); updateImages(); };
  if ($('ray-trace')) $('ray-trace').onchange = event => { viewer.setRayTrace(event.target.checked); setMode('appearance'); updateReadyStatus(); renderDetails(); };
  $('start-simulation').onclick = toggleSimulation;
  $('export').onclick = exportFiles;
  $('download-print').onclick = downloadPrint;
}

function openAxisEditor() {
  const dialog = $('axis-dialog'), motion = state.surface.motion;
  dialog.innerHTML = `<form method="dialog" class="dialog-heading"><h2>${motion.type === 'translation' ? 'Define Translation Direction' : 'Define Revolve Axis'}</h2><button aria-label="Close axis editor">×</button></form><p>Enter XYZ coordinates in millimeters.</p><label>Origin</label><div class="vector-inputs">${motion.origin.map((v, i) => `<label>${['X', 'Y', 'Z'][i]} <input type="number" id="origin-${i}" aria-label="Axis origin ${['X', 'Y', 'Z'][i]}" value="${v}"></label>`).join('')}</div><label>Direction</label><div class="vector-inputs">${motion.axis.map((v, i) => `<label>${['X', 'Y', 'Z'][i]} <input type="number" id="direction-${i}" aria-label="Axis direction ${['X', 'Y', 'Z'][i]}" value="${v}" step="0.1"></label>`).join('')}</div><p id="axis-error" class="error" role="status"></p><div class="dialog-actions"><button id="cancel-axis">Cancel</button><button id="apply-axis" class="primary">Use axis</button></div>`;
  $('cancel-axis').onclick = () => dialog.close();
  $('apply-axis').onclick = () => {
    try {
      const origin = [0, 1, 2].map(i => Number($(`origin-${i}`).value));
      const axis = [0, 1, 2].map(i => Number($(`direction-${i}`).value));
      if ([...origin, ...axis].some(x => !Number.isFinite(x)) || Math.hypot(...axis) < 0.0001) throw new Error('Enter a finite origin and a nonzero direction.');
      remember();
      state.surface.motion.origin = origin;
      state.surface.motion.axis = axis;
      state.preset = null;
      refit = true;
      dialog.close();
      renderWorkflow();
      schedule();
    } catch (error) { $('axis-error').textContent = error.message; }
  };
  dialog.showModal();
}
function renderDetails() {
  if (!assembly) {
    $('model-details').textContent = 'No surface generated.';
    $('model-checks').textContent = '';
    $('preview-note').textContent = '';
    $('layers').innerHTML = '';
    return;
  }
  const d = assembly.derived, checks = assembly.checks;
  $('model-details').textContent = `${d.physicalLensCount ?? d.count} lenses · ${d.minPitch.toFixed(1)}–${d.maxPitch.toFixed(1)} mm pitch · ${checks.solids} solid parts`;
  $('model-checks').textContent = assembly.placement&&!assembly.placement.valid?assembly.placement.message: checks.collisionSamples > 0
    ? checks.collisions.length ? `${checks.collisions.length} intersections detected.` : `No intersections at ${checks.collisionSamples} sampled positions.`
    : 'Collision sweep for this surface is not yet implemented.';
  $('preview-note').textContent = viewer.rayTrace && assembly.door
    ? 'Experimental geometric ray trace. Material, substrate and printer calibration are not validated.'
    : 'Idealized preview: each lens magnifies its aperture in the exported interleaved image. This predicts the designed state sequence, not calibrated optical performance.';
  $('layers').innerHTML = assembly.parts.map(part => `<label class="layer"><input type="checkbox" data-layer="${part.id}" ${viewer.visible[part.id] !== false ? 'checked' : ''}>${escape(part.name)}</label>`).join('');
  $('layers').querySelectorAll('input').forEach(input => input.onchange = () => viewer.toggleLayer(input.dataset.layer, input.checked));
}
function exportFiles() {
  try {
    if (pending || failed || !assembly || assembly.checks.collisions.length) throw new Error('Wait for a valid computed assembly.');
    if (hasImages() && encoded) exportBundle(assembly, serializeDesign(state), encoded);
    else download('shiftlens-assembly.3mf', manufacturing3MF(assembly));
  } catch (error) { notify(error.message); }
}
function downloadPrint() {
  try { download('shiftlens-paper-insert.svg', fanPrint(assembly, encoded), 'image/svg+xml'); }
  catch (error) { notify(error.message); }
}
function loadExample(key) {
  const example = SURFACE_PRESETS[key];
  if (!example) return;
  remember();
  state = newDesign();
  state.name = example.name;
  state.preset = key;
  state.surface = clone(example.surface);
  if (key === 'door') {
    Object.assign(state.parameters, originalDoorParameters);
    state.surface.curve.points = [[state.parameters.innerRadius,0,0],[state.parameters.outerRadius,0,0]];
  }
  state.images = [...referenceImages];
  state.crops = referenceCrops();
  state.parameters.switchEnabled = key === 'door';
  state.mechanism = key === 'door' ? 'switch' : 'custom';
  refit = true;
  setPlacement(false);
  setPhase(0);
  mode = 'appearance';
  renderWorkflow();
  schedule();
}

$('new-design').onclick = () => {
  remember();
  state = newDesign();
  phase = 0; playing = false; refit = true;
  setPlacement(false);
  viewer.clear();
  setMode('assembly');
  renderWorkflow();
  schedule();
  setPhase(0);
};
$('examples').onchange = event => loadExample(event.target.value);
$('undo').onclick = () => undo();
$('redo').onclick = () => undo(true);
$('save-project').onclick = () => download('design.shiftlens.json', JSON.stringify(serializeDesign(state), null, 2), 'application/json');
$('open-project').onclick = () => $('project-file').click();
$('project-file').onchange = async event => {
  try {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 50_000_000) throw new Error('Project file is too large.');
    const next = restoreDesign(JSON.parse(await file.text()));
    remember();
    state = next;
    mode = hasImages() ? 'appearance' : 'assembly';
    playing = false; phase = 0; refit = true;
    setPlacement(false);
    renderWorkflow();
    schedule();
  } catch (error) { notify(error.message); }
  finally { $('project-file').value = ''; }
};
$('phase').oninput = event => { playing = false; setPhase(Number(event.target.value)); refreshAvailability(); };
$('state-a').onclick = () => { playing = false; if (state.images[0]) setMode('appearance'); setPhase(0); refreshAvailability(); };
$('state-b').onclick = () => { playing = false; if (state.images.at(-1)) setMode('appearance'); setPhase(1); refreshAvailability(); };
$('play').onclick = toggleSimulation;
$('fit').onclick = () => viewer.fit();
$('top').onclick = () => viewer.top();
$('explode').onclick = () => { viewer.exploded = !viewer.exploded; $('explode').classList.toggle('active', viewer.exploded); viewer.update(phase); };
for (const value of ['assembly', 'appearance', 'pattern']) $(`view-${value}`).onclick = () => setMode(value);
$('download-pattern').onclick = () => { if (encoded) encoded.toBlob(blob => download('shiftlens-encoded.png', blob)); };
$('print-pattern').onclick = downloadPrint;
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') setPlacement(false);
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !$('curve-dialog').open && !$('axis-dialog').open) {
    event.preventDefault(); undo(event.shiftKey);
  }
});

renderWorkflow();
schedule();
