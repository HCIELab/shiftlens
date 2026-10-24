import {evaluateAssembly,opticalSection} from './optical-section.mjs';
const percent=x=>`${(100*x).toFixed(1)}%`;
const mm=x=>`${x.toFixed(3)} mm`;
export function visibilityChart(current,candidate,threshold){
  const W=360,H=160,left=37,top=12,width=310,height=113;
  const point=(a,p)=>`${(left+a/89*width).toFixed(2)},${(top+(1-p)*height).toFixed(2)}`;
  const line=r=>r.angles.map((a,i)=>point(a,r.phis[i])).join(' ');
  return `<svg class="visibility-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Target strip visibility versus viewing angle. Blue is current, orange is fitted candidate. Dashed line is the minimum visibility.">
    ${[0,.5,1].map(p=>`<path d="M${point(0,p)}H${left+width}" stroke="#e1e5eb"/><text x="${left-6}" y="${top+(1-p)*height+4}" text-anchor="end">${100*p}%</text>`).join('')}
    <path d="M${point(0,threshold)}H${left+width}" stroke="#8994a2" stroke-dasharray="4 3"/>
    <polyline points="${line(current)}" fill="none" stroke="#2563eb" stroke-width="1.8"/>
    ${candidate?`<polyline points="${line(candidate)}" fill="none" stroke="#bd6824" stroke-width="1.8"/>`:''}
    ${[0,30,60,89].map(a=>`<text x="${left+a/89*width}" y="${top+height+15}" text-anchor="middle">${a}°</text>`).join('')}
    <text x="${left+width/2}" y="${H-3}" text-anchor="middle">Viewing angle from section normal</text></svg>`;
}
export class OpticsPanel {
  constructor(host,onApply,onDownload){this.host=host;this.onApply=onApply;this.onDownload=onDownload;this.threshold=.7;this.section=.5;this.open=false;this.benchmarkOpen=false;this.revision=0;}
  invalidate(waiting=false){this.waiting=waiting;this.worker?.terminate();this.worker=null;this.busy=false;this.result=null;this.benchmark=null;this.a=null;this.current=null;this.error='';this.revision++;this.render();}
  setAssembly(a){this.invalidate();this.a=a;this.evaluate();}
  evaluate(){try{this.current=this.a?evaluateAssembly(this.a,this.threshold,this.section):null;this.error='';}catch(e){this.current=null;this.error=e.message;}this.render();}
  run(benchmark=false){
    if(!this.a)return;
    this.worker?.terminate();const revision=++this.revision;this.busy=true;this.progress=0;this.error='';
    if(benchmark)this.benchmark=null;else this.result=null;
    const input=benchmark?{p:5,N:this.a.derived.stateCount,ior:1.52,threshold:this.threshold}: {...opticalSection(this.a,this.section),threshold:this.threshold,minHeight:this.a.derived.gap+.18+.4,paperZ:-this.a.derived.gap-.18};
    this.worker=new Worker(new URL('./optics.worker.mjs',import.meta.url),{type:'module'});
    this.worker.onmessage=({data})=>{
      if(data.revision!==this.revision)return;
      if(data.progress!==undefined){this.progress=data.progress;const el=document.getElementById('optics-progress');if(el)el.textContent=`Searching 50 × 50 profiles… ${Math.round(100*this.progress)}%`;return;}
      this.busy=false;this.worker?.terminate();this.worker=null;
      if(data.error)this.error=data.error;else if(benchmark)this.benchmark={optimization:data.result,cylinder:data.benchmark};else this.result=data.result;
      this.render();
    };
    this.worker.onerror=e=>{if(revision!==this.revision)return;this.busy=false;this.error=`Optical search failed: ${e.message}`;this.worker?.terminate();this.worker=null;this.render();};
    // Benchmark the optimized profile, not the placeholder radius. The worker
    // computes its benchmark from the selected optimum after the search.
    this.worker.postMessage({revision,operation:'optimize',input,options:{threshold:this.threshold,benchmark:benchmark?{radius:25,lenses:15}:null}});this.render();
  }
  report(){return {current:this.current,optimization:this.result,paperBenchmark:this.benchmark};}
  render(){
    const host=this.host();if(!host)return;
    const a=this.a,c=this.current,f=this.result?.fitted,b=this.result?.best,benchmark=this.benchmark;
    host.innerHTML=`
      <p class="hint">Original evaluation: weighted target-strip visibility φ and viewing half-angle θ.</p>
      <label class="fit-label">Minimum visibility φ <input id="optics-threshold" type="number" aria-label="Minimum target visibility" min="0.1" max="0.9" step="0.05" value="${this.threshold}"></label>
      <label class="fit-label">Along primary curve <input id="optics-section" type="range" aria-label="Optical evaluation section" min="0" max="1" step="0.01" value="${this.section}"><output>${Math.round(100*this.section)}%</output></label>
      ${c?`<p class="optics-dimensions">${c.N} states · pitch ${mm(c.p)} · radius ${mm(c.r)}<br>Height to image ${mm(c.h)} · IOR ${c.ior.toFixed(2)}<br>${a.sourceGeometry?'Original CAD: nominal circular-section estimate.':'Generated circular section.'}</p>
      <div class="optics-metrics"><span>Current φ(0°)<strong>${percent(c.phis[0])}</strong></span><span>Current viewing range<strong>${c.passes?`±${c.theta}°`:'Below minimum'}</strong></span></div>
      ${visibilityChart(c,f,this.threshold)}<p class="chart-key"><span>Current</span>${f?'<span>Fitted candidate</span>':''}</p>
      <p class="hint">Row visibility estimate: ${c.surfaceEstimate?percent(c.surfaceEstimate.opv):'Unavailable'} · at this primary-curve position, viewed along the center normal. Local 2D sections; excludes occlusion.</p>`:`<p class="hint">${this.waiting?'Updating lens geometry…':'Define a surface to evaluate its lens sections.'}</p>`}
      <div class="optics-actions"><button id="optics-run" ${!c||this.busy?'disabled':''}>Optimize this section</button>${this.busy?'<button id="optics-cancel">Cancel</button>':''}</div>
      <p id="optics-progress" class="hint" role="status">${this.busy?`Searching 50 × 50 profiles… ${Math.round(100*(this.progress??0))}%`:''}</p>
      ${b?`<p>Unconstrained source grid: r = ${mm(b.r)}, h = ${mm(b.h)}; ${b.passes?`±${b.theta}°`:'below minimum'}.</p>
      ${f?`<p>Fit to this assembly: r = ${mm(f.r)}, h = ${mm(f.h)}; ${f.passes?`±${f.theta}°`:'below minimum'}. The fit keeps the image gap and at least 0.4 mm of lens substrate.</p>
      ${f.passes&&c&&f.theta<=c.theta?'<p class="hint">This grid candidate does not improve the current nominal viewing half-angle.</p>':''}<button id="optics-apply" ${!f.passes||this.busy?'disabled':''}>Apply fitted lens profile</button><p class="hint">Changes the lens profile and regenerates rails, mechanism clearances and collision checks. Radius/pitch is preserved across the surface.</p>`:'<p>No profile in the source grid fits this image gap and substrate.</p>'}`:''}
      <details class="optics-reference" ${this.benchmarkOpen?'open':''}><summary>Paper cylinder benchmark</summary><p class="hint">Independent reference: 50 mm diameter, 5 mm pitch, 15 lenses, IOR 1.52. Uses the current state count and visibility minimum.</p><button id="optics-benchmark" ${!c||this.busy?'disabled':''}>Run paper benchmark</button>
      ${benchmark?`<p>${benchmark.optimization.best.N} states: r = ${mm(benchmark.optimization.best.r)}, h = ${mm(benchmark.optimization.best.h)}, viewing range ${benchmark.optimization.best.passes?`±${benchmark.optimization.best.theta}°`:'below minimum'}; overall visibility ${percent(benchmark.cylinder.opv)}.</p>`:''}</details>
      <p class="hint">Same single-interface model as the supplied evaluation code. The image gap's exit refraction, aperture mask and material/print effects are excluded. Image animation remains an idealized preview. Physical validation of web-generated parts is pending.</p>
      ${this.error?`<p class="error" role="alert">${this.error.replaceAll('&','&amp;').replaceAll('<','&lt;')}</p>`:''}
      <button id="optics-download" ${!c||this.busy?'disabled':''}>Download optical report</button>`;
    const byId=id=>host.querySelector(`#${id}`);
    host.querySelector('.optics-reference').ontoggle=e=>{this.benchmarkOpen=e.target.open;};
    byId('optics-section').oninput=e=>{e.target.nextElementSibling.textContent=`${Math.round(Number(e.target.value)*100)}%`;};
    byId('optics-threshold').onchange=e=>{const value=Number(e.target.value);if(!Number.isFinite(value)||value<.1||value>.9){e.target.value=this.threshold;return;}this.threshold=value;this.result=null;this.benchmark=null;this.worker?.terminate();this.busy=false;this.revision++;this.evaluate();};
    byId('optics-section').onchange=e=>{this.section=Number(e.target.value);this.result=null;this.worker?.terminate();this.busy=false;this.revision++;this.evaluate();};
    byId('optics-run').onclick=()=>this.run();
    byId('optics-benchmark').onclick=()=>this.run(true);
    if(byId('optics-cancel'))byId('optics-cancel').onclick=()=>{this.worker?.terminate();this.worker=null;this.busy=false;this.revision++;this.render();};
    if(byId('optics-apply'))byId('optics-apply').onclick=()=>{if(f?.passes&&!this.busy)this.onApply({opticalProfile:true,lensRadiusRatio:f.r/f.p,substrate:f.h+this.result.paperZ});};
    byId('optics-download').onclick=()=>this.onDownload(this.report());
  }
}
