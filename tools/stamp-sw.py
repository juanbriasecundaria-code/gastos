#!/usr/bin/env python3
"""Actualiza sw.js antes de publicar.

Uso (desde cualquier carpeta):   python tools/stamp-sw.py

- Calcula un hash del contenido de la app (index.html, manifest, css/, js/, icons/, splash/).
- Escribe ese hash en CACHE_NAME: si algo cambió, el navegador ve un sw.js distinto
  y actualiza la app instalada. Si no cambió nada, el hash es el mismo.
- Regenera la lista APP_SHELL con todos los archivos de la app para que funcionen sin conexión.
"""
import hashlib, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOLDERS = ('css', 'js', 'icons', 'splash')
TOP_FILES = ('index.html', 'manifest.json')

files = [f for f in TOP_FILES if os.path.exists(os.path.join(ROOT, f))]
for folder in FOLDERS:
    base = os.path.join(ROOT, folder)
    if os.path.isdir(base):
        for name in sorted(os.listdir(base)):
            if os.path.isfile(os.path.join(base, name)):
                files.append(f'{folder}/{name}')

h = hashlib.sha256()
for rel in files:
    h.update(rel.encode())
    with open(os.path.join(ROOT, rel), 'rb') as fh:
        h.update(fh.read())
version = h.hexdigest()[:10]

sw_path = os.path.join(ROOT, 'sw.js')
with open(sw_path, encoding='utf-8') as fh:
    sw = fh.read()

sw, n1 = re.subn(r"var CACHE_NAME = '[^']*';", f"var CACHE_NAME = 'libro-gastos-{version}';", sw)
shell = ['./'] + files
block = "/* APP_SHELL_START */\nvar APP_SHELL = [\n" + ",\n".join(f"  '{p}'" for p in shell) + "\n];\n/* APP_SHELL_END */"
sw, n2 = re.subn(r"/\* APP_SHELL_START \*/.*?/\* APP_SHELL_END \*/", lambda m: block, sw, flags=re.S)
if n1 != 1 or n2 != 1:
    sys.exit('No encontré CACHE_NAME o el bloque APP_SHELL en sw.js')

with open(sw_path, 'w', encoding='utf-8', newline='\n') as fh:
    fh.write(sw)
print(f'sw.js actualizado: libro-gastos-{version} ({len(shell)} archivos en caché)')
