import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify,parseArgs} from 'node:util';
import sharp from 'sharp';
const {values}=parseArgs({options:{resources:{type:'string'},output:{type:'string'},ffmpeg:{type:'string'}}}),resources=resolve(values.resources||'client/resources/packaging');
const work=await realpath(await mkdtemp(join(tmpdir(),'cc-profile-'))),exec=promisify(execFile),results=[];
try{
 let deep=join(work,'profiles/default/workspaces','a'.repeat(64),'packaging/assets/workspaces','d6509c27-550f-453c-844a-f0c425537f18','flow-archive/experience-flow');
 while(deep.length<340)deep=join(deep,'中文 工程路径');
 const poisoned=join(deep,'.tmp');await mkdir(poisoned,{recursive:true});const assetRoot=join(work,'input'),assets=join(assetRoot,'assets');await mkdir(assets,{recursive:true});await writeFile(join(assets,'图标 空格.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#ff3040"/></svg>');
 for(const skill of ['chart-video','image-flow-animation']){
  const module=pathToFileURL(join(resources,skill,'scripts/render.mjs')).href,out=join(deep,skill);await mkdir(out);
  const html='<html><body style="margin:0;background:transparent"><img id="icon" src="assets/图标 空格.svg" style="position:absolute;left:16px;top:16px;width:48px;height:48px"><script>window.__CHART_READY__=true;window.__CHART_META__={browserPageUrl:location.href};window.renderAt=()=>{if(!document.getElementById("icon").naturalWidth)throw Error("ICON_NOT_DECODED")};</script></body></html>';
  const code=`import assert from 'node:assert/strict';import {readdirSync} from 'node:fs';import {dirname} from 'node:path';import {fileURLToPath} from 'node:url';import {renderFrames} from ${JSON.stringify(module)};const result=await renderFrames(${JSON.stringify(html)},{outDir:${JSON.stringify(out)},width:96,height:96,frameCount:2,fps:30,assetRoot:${JSON.stringify(assetRoot)}});const root=dirname(dirname(fileURLToPath(result.pageMeta.browserPageUrl))),before=readdirSync(root).sort();await assert.rejects(renderFrames('',{outDir:${JSON.stringify(out)},width:96,height:96,frameCount:1,fps:30,chromePath:${JSON.stringify(join(work,'missing-chrome.exe'))}}),{code:'ENOENT'});assert.deepEqual(readdirSync(root).sort(),before);console.log(JSON.stringify({...result,failedLaunchCleaned:true}));`;
  const child=await exec(process.execPath,['--input-type=module','-e',code],{env:{...process.env,TMP:poisoned,TEMP:poisoned,TMPDIR:poisoned},timeout:60000,maxBuffer:1024**2});
  const result=JSON.parse(child.stdout.trim()),page=fileURLToPath(result.pageMeta.browserPageUrl);
  if(process.platform==='win32'){assert.ok(page.length<160);assert.ok(!page.startsWith(poisoned));}
  await assert.rejects(readFile(page),{code:'ENOENT'});
  const {data,info}=await sharp(await readFile(join(out,'f000001.png'))).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(data[3],0);const pixel=(32*info.width+32)*4;assert.ok(data[pixel]>200&&data[pixel+3]>200);
  results.push({skill,frames:result.frames,poisonedTempLength:poisoned.length,browserPageLength:page.length,unicodeAssetDecoded:true,visibleAndTransparentPixels:true,workspaceRemoved:true,failedLaunchCleaned:result.failedLaunchCleaned});
 }
 // Exercise the real flow CLI, including its workspace-scoped TMP override.
 if(values.ffmpeg){
  const image=join(deep,'icon.png');await writeFile(image,await sharp({create:{width:96,height:96,channels:4,background:'#00000000'}}).composite([{input:Buffer.from('<svg width="96" height="96"><circle cx="48" cy="48" r="32" fill="red"/></svg>')}]).png().toBuffer());
  const request=join(deep,'flow.json');await writeFile(request,JSON.stringify({workspace:'flow-output',preset:'flow-horizontal',nodes:[{id:'a',label:'节点一',image},{id:'b',label:'节点二',image}],edges:[{from:'a',to:'b'}],timing:{duration_seconds:3},output:{width:640,height:360,fps:12,formats:['qtrle','webm']}}));
  const rendered=await exec(process.execPath,[join(resources,'image-flow-animation/scripts/main.mjs'),'--request',request],{env:{...process.env,CHART_VIDEO_FFMPEG:values.ffmpeg},timeout:180000,maxBuffer:4*1024**2});const value=JSON.parse(rendered.stdout.trim());assert.equal(value.status,'completed');assert.equal(value.usable,true);assert.equal(value.artifacts.length,2);results.push({skill:'image-flow-animation-production',status:'passed',workspaceLength:deep.length,formats:value.artifacts.map(a=>a.format),validated:true});
 }
 const receipt={status:'passed',platform:process.platform,results,realUserProjects:false,paidCalls:false,registryChanged:false};if(values.output){await mkdir(dirname(resolve(values.output)),{recursive:true});await writeFile(resolve(values.output),JSON.stringify(receipt,null,2)+'\n');}console.log(JSON.stringify(receipt));
}finally{await rm(work,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
