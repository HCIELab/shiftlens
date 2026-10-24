import {optimizeLens,lensResult,cylinderBenchmark} from './optics.mjs';
self.onmessage=({data})=>{
  const {revision,operation,input,options}=data;
  try {
    const result=operation==='optimize'?optimizeLens(input,progress=>self.postMessage({revision,progress})):lensResult(input,options.threshold);
    self.postMessage({revision,result,benchmark:options.benchmark?cylinderBenchmark(result.best,options.benchmark):null});
  } catch(error){self.postMessage({revision,error:error.message});}
};
