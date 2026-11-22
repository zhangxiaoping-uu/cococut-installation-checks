// Release check against the actual packaged/installed helper and native binaries.
// Uses isolated media only; does not upload files, create jobs or spend credits.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm, copyFile, realpath} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

if (!process.argv[2]) throw Error('EXPLICIT_APP_ROOT_REQUIRED');
const app = resolve(process.argv[2]), execute = promisify(execFile);
const require = createRequire(join(app, 'client/package.json')), sharp = require('sharp');
const load = name => import(pathToFileURL(join(app, 'client/products/packaging', name)));
const {prepareSupportingMaterials, normalizeSupportingMaterials} = await load('host/supporting-materials.mjs');
const {machineAdmission} = await load('runtime/electron/local-resources.mjs');
machineAdmission.memoryAt = Date.now();
machineAdmission.sample = () => ({cpu: 0, memory: 0, available: 12 * 1024 ** 3, total: 16 * 1024 ** 3, pressureLevel: 1});
const bin = join(app, '.local/rebuild/packaging-resources/bin');
const ffmpeg = join(bin, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
const ffprobe = join(bin, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
const anchor = await realpath(await mkdtemp(join(tmpdir(), 'cococut-materials-installed-')));
const directory = join(anchor, '中文用户-🧪', 'profiles/default/workspaces', 'a'.repeat(64),
  'packaging/assets', 'boundary-' + 'b'.repeat(64), '素材存放-' + 'c'.repeat(72));
const source = join(directory, '用户材料');
let registrations = 0, frameExtractions = 0;
try {
  await mkdir(source, {recursive: true});
  const files = {photo: join(source, '产品实拍.png'), video: join(source, '产品操作.mov')};
  await writeFile(files.photo, await sharp({create: {width: 64, height: 32, channels: 4,
    background: '#f04e36'}}).png().toBuffer());
  const shortVideo = join(anchor, 'input.mov');
  await execute(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=10:duration=1',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', '-y', shortVideo], {timeout: 30000, windowsHide: true});
  await copyFile(shortVideo, files.video);
  const metadata = {photo: {id: 'photo', name: '产品实拍.png', width: 64, height: 32, fps: 0, duration: 0},
    video: {id: 'video', name: '产品操作.mov', width: 160, height: 90, fps: 10, duration: 1}};
  const task = {id: 'materials-installation-fixture', supportingMaterials: normalizeSupportingMaterials([
    {media: {id: 'photo'}, kind: 'image', description: '介绍产品时显示实拍图片'},
    {media: {id: 'video'}, kind: 'video', description: '演示操作时使用原视频'}],
  {file: id => files[id], metadata: id => metadata[id]})};
  const ctx = {dir: directory, ffmpeg, ffprobe, file: id => files[id],
    register: file => {const id = 'observation-' + ++registrations; files[id] = file; return {id, url: 'studio://media/' + id};},
    run: async (binary, args) => {frameExtractions++; return execute(binary, args, {timeout: 30000, windowsHide: true});}};
  const observations = await prepareSupportingMaterials(task, ctx);
  const workspace = join(directory, 'workspaces', task.id);
  assert.ok(join(workspace, task.supportingMaterials[1].workspaceFile).length > 350);
  assert.equal(observations.length, 2);
  assert.deepEqual(await readFile(join(workspace, task.supportingMaterials[0].workspaceFile)), await readFile(files.photo));
  assert.deepEqual(await readFile(join(workspace, task.supportingMaterials[1].originalFile)), await readFile(files.video));
  // Keep probing on a short path too: FFmpeg paths are not assumed MAX_PATH-safe.
  const inspected = join(anchor, 'normalized.mp4');
  await copyFile(join(workspace, task.supportingMaterials[1].workspaceFile), inspected);
  const probe = JSON.parse((await execute(ffprobe, ['-v', 'error', '-show_streams', '-of', 'json', inspected],
    {timeout: 30000, windowsHide: true})).stdout);
  assert.equal(probe.streams.find(stream => stream.codec_type === 'video').codec_name, 'h264');
  assert.equal(probe.streams.find(stream => stream.codec_type === 'audio').codec_name, 'aac');
  const contact = await sharp(await readFile(files[observations[1].id])).metadata();
  assert.equal(contact.width, 960); assert.equal(contact.height, 240);
  assert.deepEqual(task.supportingMaterials[1].previewTimes, [.1, .5, .9]);
  assert.equal(frameExtractions, 3);
  const resumed = JSON.parse(JSON.stringify(task));
  assert.deepEqual(await prepareSupportingMaterials(resumed, ctx), observations);
  assert.equal(registrations, 2); assert.equal(frameExtractions, 3);
  console.log(JSON.stringify({status: 'passed', scope: 'installed-supporting-materials', platform: process.platform,
    imageAndVideo: true, originalBytesPreserved: true, normalizedVideo: 'h264/aac',
    videoContactSheet: '960x240', deepUnicodePaths: true, persistedReceiptReused: true,
    paidModelCalls: false, cloudUploads: false, creditsChanged: false}));
} finally {
  await rm(anchor, {recursive: true, force: true});
}
