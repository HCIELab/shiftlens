import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({build:{rollupOptions:{input:{studio:fileURLToPath(new URL('./index.html',import.meta.url)),demo:fileURLToPath(new URL('./demo/index.html',import.meta.url)),upload:fileURLToPath(new URL('./demo/upload.html',import.meta.url))}}}});
