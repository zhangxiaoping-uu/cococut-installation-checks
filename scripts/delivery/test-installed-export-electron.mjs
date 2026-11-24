// Native installed-export fixture. Uses only generated media and bundled fonts.
import {app,BrowserWindow,session} from 'electron';import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import {promisify,parseArgs} from 'node:util';import {execFile} from 'node:child_process';import assert from 'node:assert/strict';
const {values}=parseArgs({options:{'app-root':{type:'string'},output:{type:'string'},work:{type:'string'}}});
const repo=path.resolve(values['app-root']),dir=path.resolve(values.work),output=path.resolve(values.output);
const load=name=>import(pathToFileURL(path.join(repo,'client/products/packaging/runtime/electron',name)));
const {openLocalPreview}=await load('local-preview.mjs'),{compiledPlayerHtml}=await load('compiled-player.mjs'),{renderDependencies}=await load('render-cache.mjs'),{renderHybrid}=await load('hybrid-render.mjs');
const {localScheduler}=await import(pathToFileURL(path.join(repo,'client/products/packaging/host/local-resources.mjs')));
const {createExportBrowserAlias}=await import(pathToFileURL(path.join(repo,'client/products/packaging/host/export-browser-workspace.mjs')));
app.disableHardwareAcceleration();app.setPath('userData',path.join(dir,'electron-test-profile'));app.on('window-all-closed',()=>{});
const run=promisify(execFile),ffmpeg=path.join(repo,'.local/rebuild/packaging-resources/bin',process.platform==='win32'?'ffmpeg.exe':'ffmpeg'),ffprobe=path.join(repo,'.local/rebuild/packaging-resources/bin',process.platform==='win32'?'ffprobe.exe':'ffprobe');
app.whenReady().then(async()=>{let alias,player;const report={platform:process.platform};try{
 const root=path.join(dir,'source-'+ 'a'.repeat(80),'workspaces-'+ 'b'.repeat(80),'draft-export-'+ 'c'.repeat(36)+'-'+Date.now());await fs.mkdir(path.join(root,'assets','中文 目录'),{recursive:true});
 await run(ffmpeg,['-v','error','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=30:duration=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest',path.join(root,'host.mp4')],{timeout:10000});
 await run(ffmpeg,['-v','error','-y','-f','lavfi','-i','color=green:size=32x32','-frames:v','1',path.join(root,'assets','中文 目录','icon #1.png')],{timeout:10000});
 const fonts=path.join(repo,'.local/rebuild/packaging-resources/font-library');await fs.mkdir(path.join(root,'font-library'),{recursive:true});
 for(const name of await fs.readdir(fonts))if(/\.(otf|ttf|woff2?)$/i.test(name)){try{await fs.link(path.join(fonts,name),path.join(root,'font-library',name));}catch(e){if(e.code!=='EEXIST')throw e;}}
 try{await fs.link(path.join(fonts,'source-han.ttf'),path.join(root,'chinese.ttf'));}catch(e){if(e.code!=='EEXIST')throw e;}
 const task={id:'path-fixture',revision:1,source:{width:320,height:180,duration:1,fps:30},composition:{width:320,height:180,sceneCompilerVersion:1,outputSpec:{width:320,height:180,fps:30}},clips:[{id:'image',kind:'image',role:'material',progressive:true,productionStatus:'ready',progressiveFile:'assets/中文 目录/icon %231.png',start:0,duration:1,x:.6,y:.3,w:.25,h:.5}],captions:[]};
 // On Windows the player allocates its own junction. On macOS exercise the
 // same real filesystem alias while keeping the production platform branch.
 await fs.writeFile(path.join(root,'index.html'),compiledPlayerHtml(task));
 const selected=process.platform==='win32'?root:(alias=await createExportBrowserAlias(root,path.join(dir,'short'))).root;
 const windows=[];class ObservedWindow extends BrowserWindow{constructor(...args){super(...args);windows.push(this);}}
 const signal=AbortSignal.timeout(120000);player=await openLocalPreview({BrowserWindow:ObservedWindow,session},selected,task,task.clips,signal,{fullSize:true});
 for(const t of [0,.2,.6,.966])await player.frame(t);
 const state=await player.evaluate(`({href:location.href,image:document.querySelector('img')?.src,video:document.getElementById('speaker-source')?.currentSrc,images:[...document.images].map(i=>({ready:i.complete&&i.naturalWidth>0,src:i.src})),audio:window.__editorExportMedia()})`);
 const normalized=alias?alias.restore(state):state;report.sourcePathLength=root.length;report.browserEntryURLs=windows.filter(w=>!w.isDestroyed()).map(w=>w.webContents.getURL());assert.ok(root.length>300);if(process.platform==='win32'){assert.ok(report.browserEntryURLs.length>0);assert.ok(report.browserEntryURLs.every(u=>u.length<260&&!u.includes('draft-export-')));}report.state=normalized;
 if(!state.images.every(i=>i.ready))throw Error('Image failed to load');if(!normalized.video.startsWith(pathToFileURL(root+path.sep).href))throw Error('Source identity changed');
 await fs.writeFile(path.join(dir,'export-player.png'),(await player.capture()).toPNG());await player.close();player=null;
 localScheduler.admission={sample:()=>({cpu:0,memory:.1,available:8*1024**3,pressureLevel:0}),snapshot:()=>({})};
 const start=Date.now();await renderHybrid(task,{ffmpeg,ffprobe,sceneFingerprint:renderDependencies},selected,path.join(dir,'path-fixture.mp4'),signal,{BrowserWindow,session},{pixelValidation:'regression'});report.exportMs=Date.now()-start;
 report.output=JSON.parse((await run(ffprobe,['-v','error','-show_streams','-of','json',path.join(dir,'path-fixture.mp4')],{timeout:10000})).stdout).streams.map(s=>({type:s.codec_type,width:s.width,height:s.height,duration:s.duration}));
 if(!(await fs.stat(path.join(root,'host.mp4'))).size)throw Error('Source removed');report.clientRelease=JSON.parse(await fs.readFile(path.join(repo,'client-release.json')));report.realAccountFilesRead=false;report.paidModelCalls=false;report.status='passed';
}catch(e){report.status='failed';report.error=e.stack;console.error(e.stack);}finally{await player?.close().catch(()=>{});await alias?.close();await fs.writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));app.exit(report.status==='passed'?0:1);}});
