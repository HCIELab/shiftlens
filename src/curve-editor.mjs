import {curveAt} from './surface.mjs';

const PLANES = {XZ: [0, 2, 1], XY: [0, 1, 2], YZ: [1, 2, 0]};
const AXES = ['X', 'Y', 'Z'];
const clone = value => structuredClone(value);

// The drawing plane sets two coordinates; the point table exposes all three.
// Applying commits the curve once. Cancel leaves the project untouched.
export class CurveEditor {
  constructor(dialog, onApply) {
    this.dialog = dialog;
    this.onApply = onApply;
    this.dialog.addEventListener('close', () => { this.dragging = null; });
  }

  open(curve) {
    this.curve = clone(curve);
    this.plane = 'XZ';
    this.selected = -1;
    this.dragging = null;
    this.dialog.innerHTML = `
      <form method="dialog" class="dialog-heading"><h2>Define Primary Curve</h2><button aria-label="Close curve editor">×</button></form>
      <p>Click to add points. Drag a point to move it. Edit XYZ below for a curve in 3D space.</p>
      <div class="editor-toolbar">
        <label>Drawing plane <select id="draw-plane"><option>XZ</option><option>XY</option><option>YZ</option></select></label>
        <label><span id="offset-label">Y</span> <input id="plane-offset" type="number" value="0" step="1"> mm</label>
        <label><input id="snap-grid" type="checkbox" checked> Snap 5 mm</label>
        <label>Curve <select id="curve-kind"><option value="linear">Polyline</option><option value="smooth">Smooth</option></select></label>
      </div>
      <svg id="curve-drawing" viewBox="0 0 640 320" role="img" aria-label="Primary curve drawing area"></svg>
      <div class="editor-toolbar"><button type="button" id="add-point">Add point</button><button type="button" id="clear-points">Clear points</button><button type="button" id="import-points">Import XYZ / JSON</button><input id="curve-file" type="file" accept=".json,.csv,.txt" hidden></div>
      <div class="point-table-wrap"><table class="point-table"><thead><tr><th>Point</th><th>X (mm)</th><th>Y (mm)</th><th>Z (mm)</th><th></th></tr></thead><tbody id="point-rows"></tbody></table></div>
      <p id="curve-error" class="error" role="status"></p>
      <div class="dialog-actions"><button type="button" id="cancel-curve">Cancel</button><button type="button" id="accept-curve" class="primary">Use curve</button></div>`;
    const find = id => this.dialog.querySelector(`#${id}`);
    this.svg = find('curve-drawing');
    find('curve-kind').value = this.curve.interpolation ?? 'smooth';
    find('curve-kind').onchange = event => { this.curve.interpolation = event.target.value; this.renderDrawing(); };
    find('draw-plane').onchange = event => {
      this.plane = event.target.value;
      find('offset-label').textContent = AXES[PLANES[this.plane][2]];
      this.renderDrawing();
    };
    find('add-point').onclick = () => {
      const axes = PLANES[this.plane];
      const p = this.curve.points.length ? [...this.curve.points.at(-1)] : [0, 0, 0];
      p[axes[0]] += 20;
      this.curve.points.push(p);
      this.selected = this.curve.points.length - 1;
      this.render();
    };
    find('clear-points').onclick = () => { this.curve.points = []; this.selected = -1; this.render(); };
    find('import-points').onclick = () => find('curve-file').click();
    find('curve-file').onchange = async event => {
      try {
        const file = event.target.files[0];
        if (!file) return;
        if (file.size > 100_000) throw new Error('Curve file is too large.');
        const text = await file.text();
        let data;
        try { data = JSON.parse(text); } catch {
          data = text.trim().split(/\r?\n/).filter(line => line.trim()).map(line => line.trim().split(/[ ,;\t]+/).map(Number));
        }
        const points = Array.isArray(data) ? data : data.points ?? data.curve?.points;
        this.validate(points);
        this.curve.points = points;
        this.curve.interpolation = data.interpolation ?? data.curve?.interpolation ?? this.curve.interpolation;
        find('curve-kind').value = this.curve.interpolation;
        this.render();
      } catch (error) { find('curve-error').textContent = error.message; }
      event.target.value = '';
    };
    find('cancel-curve').onclick = () => this.dialog.close();
    find('accept-curve').onclick = () => {
      try {
        this.validate(this.curve.points);
        this.onApply(clone(this.curve));
        this.dialog.close();
      } catch (error) { find('curve-error').textContent = error.message; }
    };
    const position = event => {
      const matrix = this.svg.getScreenCTM().inverse();
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
      const snap = find('snap-grid').checked ? 5 : 0.1;
      return [Math.round(((point.x - 50) / 2) / snap) * snap, Math.round(((270 - point.y) / 2) / snap) * snap];
    };
    this.svg.onpointerdown = event => {
      if (event.button !== 0) return;
      const index = event.target.dataset.point;
      if (index !== undefined) {
        this.selected = Number(index);
        this.dragging = this.selected;
        this.svg.setPointerCapture(event.pointerId);
      } else if (this.curve.points.length < 64) {
        const [a, b] = position(event), axes = PLANES[this.plane], point = [0, 0, 0];
        point[axes[0]] = a; point[axes[1]] = b;
        point[axes[2]] = Number(find('plane-offset').value);
        this.curve.points.push(point);
        this.selected = this.curve.points.length - 1;
      }
      this.render();
    };
    this.svg.onpointermove = event => {
      if (this.dragging === null) return;
      const [a, b] = position(event), axes = PLANES[this.plane];
      this.curve.points[this.dragging][axes[0]] = a;
      this.curve.points[this.dragging][axes[1]] = b;
      this.render();
    };
    this.svg.onpointerup = () => { this.dragging = null; };
    this.svg.onpointercancel = () => { this.dragging = null; };
    this.render();
    this.dialog.showModal();
  }

  validate(points) {
    if (!Array.isArray(points) || points.length < 2 || points.length > 64 ||
      points.some(point => !Array.isArray(point) || point.length !== 3 || point.some(x => !Number.isFinite(x) || Math.abs(x) > 1000))) {
      throw new Error('Use 2–64 XYZ points, with each coordinate between −1000 and 1000 mm.');
    }
    for (let i = 1; i < points.length; i++) {
      if (Math.hypot(...points[i].map((x, j) => x - points[i - 1][j])) < 0.01) throw new Error('Adjacent points must be distinct.');
    }
  }

  render() {
    const body = this.dialog.querySelector('#point-rows');
    body.innerHTML = this.curve.points.map((point, i) => `<tr class="${i === this.selected ? 'selected' : ''}"><th>${i + 1}</th>${point.map((value, axis) => `<td><input type="number" aria-label="Point ${i + 1} ${AXES[axis]}" data-index="${i}" data-axis="${axis}" value="${value}" step="0.1"></td>`).join('')}<td><button type="button" data-remove="${i}" aria-label="Remove point ${i + 1}">×</button></td></tr>`).join('');
    body.querySelectorAll('input').forEach(input => input.oninput = () => {
      this.curve.points[Number(input.dataset.index)][Number(input.dataset.axis)] = Number(input.value);
      this.renderDrawing();
    });
    body.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => {
      this.curve.points.splice(Number(button.dataset.remove), 1);
      this.selected = -1;
      this.render();
    });
    this.dialog.querySelector('#accept-curve').disabled = this.curve.points.length < 2;
    this.renderDrawing();
  }

  renderDrawing() {
    const [a, b] = PLANES[this.plane];
    const project = point => [50 + point[a] * 2, 270 - point[b] * 2];
    const grid = [];
    for (let x = 10; x <= 640; x += 40) grid.push(`<path d="M${x} 0V320"/>`);
    for (let y = 30; y <= 320; y += 40) grid.push(`<path d="M0 ${y}H640"/>`);
    let line = '';
    if (this.curve.points.length >= 2) {
      const points = Array.from({length: 101}, (_, i) => project(curveAt(this.curve, i / 100)));
      line = `<polyline points="${points.map(p => p.join(',')).join(' ')}" fill="none" stroke="#2563eb" stroke-width="2.5"/>`;
    }
    this.svg.innerHTML = `<rect width="640" height="320" fill="white"/><g stroke="#edf0f3">${grid.join('')}</g><g stroke="#aeb9c7"><path d="M50 0V320M0 270H640"/></g><g fill="#677586" font-size="11"><text x="610" y="287">${AXES[a]}</text><text x="34" y="18">${AXES[b]}</text><text x="53" y="285">0</text><text x="241" y="285">100 mm</text></g>${line}${this.curve.points.map((point, i) => { const [x, y] = project(point); return `<circle data-point="${i}" cx="${x}" cy="${y}" r="6" fill="${i === this.selected ? '#dc2626' : '#2563eb'}" stroke="white" stroke-width="2"/><text x="${x + 8}" y="${y - 8}" font-size="11" fill="#334155" pointer-events="none">${i + 1}</text>`; }).join('')}`;
  }
}
