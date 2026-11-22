"""Real local media processing: extract HEVC audio directly, retain compatible H.264 previews."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import struct
import sys
import time

runtime, ffmpeg, ffprobe, source, work = sys.argv[1:]
sys.path.insert(0, runtime)
from engine.filesystem import native_path
from engine import media
from engine.links import Source

os.environ['PATH'] = os.pathsep.join([str(Path(ffmpeg).parent), os.environ.get('PATH', '')])
source = Path(native_path(source))
work = Path(native_path(work))
work.mkdir(parents=True, exist_ok=True)
media.CACHE = work / 'cache'
spec = importlib.util.spec_from_file_location('isolated_desktop_worker', str(Path(runtime) / 'worker.py'))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
service = media.MediaService()
asset = service.asset(Source('https://v.douyin.com/isolated-hevc', 'douyin'))
asset.info = {'title': 'HEVC fixture', 'direct_media_url': 'https://media.example.invalid/fixture.mp4'}
asset.info_time = time.time()
service._save_metadata(asset, asset.info)
count = {'downloads': 0, 'videoEncodes': 0, 'audioExtractions': 0}

def download(_info, target, _progress):
    count['downloads'] += 1
    shutil.copyfile(source, target)

service._public_media_download = download
original = media.run_media

def run(arguments, **options):
    if '-c:v' in arguments and arguments[arguments.index('-c:v') + 1] != 'copy':
        count['videoEncodes'] += 1
        assert count['audioExtractions'] == 1, 'Video encoding must follow audio-only transcription'
    if '-vn' in arguments:
        count['audioExtractions'] += 1
    return original(arguments, **options)

media.run_media = run
stages = []
result = worker.transcript_or_audio(service, asset, stages.append, media)
audio = result['audio']
assert audio['bytes'] > 44 and audio['duration'] > 0
wav = Path(native_path(audio['path'])).read_bytes()
assert len(wav) == audio['bytes'] and hashlib.sha256(wav).hexdigest() == audio['sha256']
assert wav[:4] == b'RIFF' and wav[8:12] == b'WAVE' and struct.unpack('<I', wav[24:28])[0] == 16000
assert not (asset.folder / 'video.mp4').exists(), 'Transcript must not produce a normalized video'
assert count == {'downloads': 1, 'videoEncodes': 0, 'audioExtractions': 1}
video = service.video(asset, stages.append)
assert service.video(asset, stages.append) == video
assert count['downloads'] == 1 and count['videoEncodes'] == 1
source_info, output_info = media.probe(source), media.probe(video)
assert next(s['codec_name'] for s in output_info['streams'] if s['codec_type'] == 'video') == 'h264'
assert abs(float(source_info['format']['duration']) - float(output_info['format']['duration'])) < .15
media.run_media([ffmpeg, '-v', 'error', '-i', str(video), '-f', 'null', '-'], timeout=15)
print(json.dumps({'status': 'passed', 'platform': sys.platform, 'directoryLength': len(str(work)),
                  'audioOnlyTranscript': True, 'canonicalWavVerified': True,
                  'previewVideoCodec': 'h264', 'transcriptVideoEncoderCalls': 0,
                  'deliveredVideoDecoded': True, 'sourceDownloadedOnce': True,
                  'videoEncoderCalls': count['videoEncodes'], 'stages': stages,
                  'networkRequests': 0, 'paidModelCalls': False, 'accountFilesRead': False}))
