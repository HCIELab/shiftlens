import Module from 'manifold-3d';
import wasmURL from 'manifold-3d/manifold.wasm?url';
import {buildAssembly,addSurfaceUVs} from './geometry.mjs';
const ready=Module({locateFile:()=>wasmURL}).then(lib=>{lib.setup();return lib;});
self.onmessage=async({data})=>{try{const lib=await ready;const assembly=addSurfaceUVs(buildAssembly(lib,data.parameters,{surface:data.surface??null}));self.postMessage({revision:data.revision,assembly});}catch(error){self.postMessage({revision:data.revision,error:error.message});}};
