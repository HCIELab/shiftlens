import {nativePlacement} from './native-actuation.mjs';

// Pointer candidates share the exact fitting rules with the solid builder.
export function switchPlacement(assembly,point,phase=0,type=assembly.derived.mechanismType){
  return {point,phase,...nativePlacement(assembly.surface,assembly.derived,point,type)};
}
