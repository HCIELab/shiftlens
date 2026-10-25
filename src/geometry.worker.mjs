import Module from 'manifold-3d';
import wasmURL from 'manifold-3d/manifold.wasm?url';
import {buildAssembly,addSurfaceUVs} from './geometry.mjs';
import {automaticOptimization} from './automatic-optics.mjs';
const ready=Module({locateFile:()=>wasmURL}).then(lib=>{lib.setup();return lib;});
self.onmessage=async({data})=>{
  try{
    const lib=await ready,surface=data.surface??null;
    const solved=data.optimize?automaticOptimization(data.parameters,surface,progress=>self.postMessage({revision:data.revision,progress})):null;
    const parameters=solved?.parameters??data.parameters;
    const assembly=addSurfaceUVs(buildAssembly(lib,parameters,{surface}));
    if(solved)assembly.optimization=solved.report;
    self.postMessage({revision:data.revision,assembly,optimized:solved?{parameters,signature:solved.signature}:null});
  }catch(error){self.postMessage({revision:data.revision,error:error.message});}
};
