// Vite inlines the original JPEG bytes so saved projects remain self-contained.
import pleaseComeIn from './assets/please-come-in.jpg?inline';
import meetingInProgress from './assets/meeting-in-progress.jpg?inline';
export const referenceImages = Object.freeze([pleaseComeIn, meetingInProgress]);
export const referenceCrops = () => [{zoom:1,x:0,y:0,fit:'cover'},{zoom:1,x:0,y:0,fit:'cover'}];
