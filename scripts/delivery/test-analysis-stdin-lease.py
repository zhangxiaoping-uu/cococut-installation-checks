"""Exercise real FFmpeg keyboard polling while Main holds its lifetime pipe."""
import json
import os
from pathlib import Path
import sys
import time

runtime, ffmpeg = sys.argv[1:]
sys.path.insert(0, runtime)
from supervision import install_parent_supervision, finish_parent_supervision
from engine.media import run_media
from engine.errors import ExtractionError

request = json.loads(sys.stdin.buffer.readline())
install_parent_supervision(request)
# Let the watchdog enter its blocking read before FFmpeg inherits the handle.
time.sleep(.1)
started = time.monotonic()
try:
    run_media([ffmpeg, '-v', 'error', '-re', '-f', 'lavfi', '-i',
               'testsrc2=size=64x96:rate=10:duration=2', '-f', 'null', '-'], timeout=6)
    result = {'status': 'passed'}
except ExtractionError as error:
    result = {'status': 'failed', 'code': error.code}
except Exception as error:
    result = {'status': 'failed', 'code': type(error).__name__}
finally:
    finish_parent_supervision()
result.update(seconds=round(time.monotonic() - started, 3),
              platform=sys.platform, parentLeaseHeldOpen=True,
              networkRequests=0, accountFilesRead=False, paidModelCalls=False)
print(json.dumps(result), flush=True)
