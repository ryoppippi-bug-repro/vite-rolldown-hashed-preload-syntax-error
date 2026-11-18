import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const directory = path.dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2] ?? 'baseline';
assert.ok(['baseline','candidate','beta'].includes(mode));
const requireMode = createRequire(path.join(directory,mode,'package.json'));
const {build,version} = await import(pathToFileURL(requireMode.resolve('vite')).href);
const {VERSION} = await import(pathToFileURL(requireMode.resolve('rolldown')).href);
const extra = process.env.BUILD_OPTIONS ? JSON.parse(process.env.BUILD_OPTIONS) : {};
const result = await build({configFile:false,root:path.join(directory,'fixture'),logLevel:'silent',build:{write:false,...extra}});
const failures = [];
let entry;
for (const chunk of result.output) {
  if (chunk.type !== 'chunk') continue;
  if (chunk.isEntry) entry = chunk.code;
  try { new vm.SourceTextModule(chunk.code); }
  catch(error) { failures.push({file:chunk.fileName,error:error.message}); }
}
console.log(JSON.stringify({vite:version,rolldown:VERSION,validJavaScript:failures.length===0,failures},null,2));
if (process.argv.includes('--show')) console.log(entry);
assert.equal(failures.length,0,'Every emitted JavaScript chunk must parse');
