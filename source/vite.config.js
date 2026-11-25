import {fileURLToPath} from 'node:url';

export default {
  root:fileURLToPath(new URL('./web',import.meta.url)),
  base:'./',
  publicDir:false,
  mode:'public-preview',
  resolve:{alias:[
    {find:'#workspace-data',replacement:fileURLToPath(new URL('./web/preview-workspace.js',import.meta.url))},
    {find:'#diagnostic-workspace',replacement:fileURLToPath(new URL('./web/ts-preview.js',import.meta.url))},
  ]},
  build:{sourcemap:false,emptyOutDir:false},
};
