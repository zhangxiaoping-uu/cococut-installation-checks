import assert from 'node:assert/strict';import{readFile,readdir,access}from'node:fs/promises';import{createHash}from'node:crypto';import{join}from'node:path';import{createRequire}from'node:module';
const require=createRequire(import.meta.url);for(const name of ['electron','electron/install.js','playwright','playwright-core','sharp','@electron/packager'])require.resolve(name);
await import('./scripts/delivery/windows-branding.mjs');const manifest=JSON.parse(await readFile('source-manifest.json'));let references=0;
for(const row of manifest.files){const bytes=await readFile(row.path);assert.equal(bytes.length,row.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);}
for(const name of await readdir('scripts/delivery'))if(name.endsWith('.mjs')){
 const source=await readFile(join('scripts/delivery',name),'utf8');
 for(const match of source.matchAll(/['"](scripts\/delivery\/[^'"\n]+\.(?:mjs|py|mp4))['"]/g)){await access(match[1]);references++;}
}
await access('scripts/delivery/test-windows-update-owner.mjs');await access('client/tests/account-payment-ui.test.mjs');await access('scripts/delivery/fixtures/analysis-hevc.mp4');
console.log(JSON.stringify({status:'passed',originalFiles:manifest.files.length,testFileReferences:references,toolDependenciesChecked:true}));
