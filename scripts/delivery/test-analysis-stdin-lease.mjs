import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

export function runLeasedMediaProbe({python, ffmpeg, runtime, script = fileURLToPath(new URL('./test-analysis-stdin-lease.py', import.meta.url))}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(python, ['-X', 'utf8', script, runtime, ffmpeg], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32',
      env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'},
    });
    let output = '', settled = false;
    const timer = setTimeout(() => {
      // Closing Main's lease terminates only this probe's owned process tree.
      child.stdin.end();
      child.kill('SIGKILL');
      finish(new Error('LEASE_PROBE_OUTER_TIMEOUT'));
    }, 12000);
    function finish(error, value) {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) reject(error); else resolveResult(value);
    }
    child.stdout.on('data', bytes => { if (output.length < 65536) output += bytes; });
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.once('error', finish);
    child.once('close', code => {
      child.stdin.end();
      if (code !== 0) return finish(new Error('LEASE_PROBE_EXIT_' + code));
      try { finish(null, JSON.parse(output.trim())); } catch { finish(new Error('LEASE_PROBE_RESULT_INVALID')); }
    });
    // Deliberately do not end stdin: production Main keeps this pipe open.
    child.stdin.write(JSON.stringify({parentPid: process.pid, nonce: randomBytes(32).toString('hex')}) + '\n');
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {values} = parseArgs({options: {'app-root': {type: 'string'}}});
  const app = resolve(values['app-root'] || fileURLToPath(new URL('../../', import.meta.url)));
  const windows = process.platform === 'win32';
  const result = await runLeasedMediaProbe({
    python: join(app, '.local/rebuild/portable-python/video-analysis', windows ? 'python.exe' : 'bin/python'),
    ffmpeg: join(app, '.local/rebuild/packaging-resources/bin', windows ? 'ffmpeg.exe' : 'ffmpeg'),
    runtime: join(app, '.local/rebuild/video-analysis-desktop'),
  });
  console.log(JSON.stringify(result));
  if (result.status !== 'passed') process.exitCode = 1;
}
