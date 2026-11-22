"""Create an owned test-only Python clone that opts out of long-path policy.

The actual shipping executable and system registry are never modified. This
reproduces machines where unprefixed paths still have the MAX_PATH restriction.
"""
import ctypes
from ctypes import wintypes
import json
import os
import re
from pathlib import Path
import shutil
import sys
import xml.etree.ElementTree as ET

if os.name != 'nt':
    raise RuntimeError('WINDOWS_TEST_ONLY')
source = Path(sys.executable).resolve()
if source.name.lower() != 'python.exe' or source.parent.name not in ('packaging', 'video-analysis'):
    raise RuntimeError('OWNED_PRODUCT_RUNTIME_REQUIRED')
target = source.with_name('python-cocut-short-path-fixture.exe')
pth = target.with_suffix('._pth')
if target.exists() or pth.exists():
    raise RuntimeError('TEST_CLONE_ALREADY_EXISTS')
shutil.copyfile(source, target)
shutil.copyfile(source.with_name('python312._pth'), pth)
kernel = ctypes.WinDLL('kernel32', use_last_error=True)
kernel.LoadLibraryExW.argtypes = [wintypes.LPCWSTR, ctypes.c_void_p, wintypes.DWORD]
kernel.LoadLibraryExW.restype = ctypes.c_void_p
kernel.FreeLibrary.argtypes = [ctypes.c_void_p]
kernel.FindResourceExW.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, wintypes.WORD]
kernel.FindResourceExW.restype = ctypes.c_void_p
kernel.SizeofResource.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
kernel.SizeofResource.restype = wintypes.DWORD
kernel.LoadResource.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
kernel.LoadResource.restype = ctypes.c_void_p
kernel.LockResource.argtypes = [ctypes.c_void_p]
kernel.LockResource.restype = ctypes.c_void_p
callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, wintypes.WORD, ctypes.c_ssize_t)
languages = []
@callback_type
def language_callback(_module, _type, _name, language, _data):
    languages.append(language)
    return True
kernel.EnumResourceLanguagesW.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, callback_type, ctypes.c_ssize_t]
module = kernel.LoadLibraryExW(str(target), None, 2)
if not module:
    raise ctypes.WinError(ctypes.get_last_error())
resources = []
try:
    if not kernel.EnumResourceLanguagesW(module, 24, 1, language_callback, 0):
        raise ctypes.WinError(ctypes.get_last_error())
    for language in languages:
        resource = kernel.FindResourceExW(module, 24, 1, language)
        body = ctypes.string_at(kernel.LockResource(kernel.LoadResource(module, resource)), kernel.SizeofResource(module, resource))
        xml = ET.fromstring(body)
        flags = [node for node in xml.iter() if node.tag.rsplit('}', 1)[-1] == 'longPathAware']
        if not flags:
            raise RuntimeError('PYTHON_LONG_PATH_MANIFEST_FLAG_REQUIRED')
        patched = re.sub(rb'(<(?:[A-Za-z0-9_.-]+:)?longPathAware\b[^>]*>)\s*(?:true|1)\s*(</(?:[A-Za-z0-9_.-]+:)?longPathAware>)', rb'\1false\2', body, flags=re.IGNORECASE)
        if any((node.text or '').strip().lower() in ('true','1') for node in flags) and patched == body:
            raise RuntimeError('MANIFEST_FLAG_REPLACEMENT_FAILED')
        resources.append((language, patched))
finally:
    kernel.FreeLibrary(module)
kernel.BeginUpdateResourceW.argtypes = [wintypes.LPCWSTR, wintypes.BOOL]
kernel.BeginUpdateResourceW.restype = ctypes.c_void_p
kernel.UpdateResourceW.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, wintypes.WORD, ctypes.c_void_p, wintypes.DWORD]
kernel.EndUpdateResourceW.argtypes = [ctypes.c_void_p, wintypes.BOOL]
handle = kernel.BeginUpdateResourceW(str(target), False)
if not handle:
    raise ctypes.WinError(ctypes.get_last_error())
try:
    for language, body in resources:
        buffer = ctypes.create_string_buffer(body)
        if not kernel.UpdateResourceW(handle, 24, 1, language, buffer, len(body)):
            raise ctypes.WinError(ctypes.get_last_error())
except BaseException:
    kernel.EndUpdateResourceW(handle, True)
    raise
if not kernel.EndUpdateResourceW(handle, False):
    raise ctypes.WinError(ctypes.get_last_error())
print(json.dumps({'python': str(target), 'pth': str(pth), 'manifestLongPathAware': False, 'shippingRuntimeChanged': False, 'registryChanged': False}))
