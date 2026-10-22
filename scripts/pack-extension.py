"""Empaqueta extension/ en public/acopio-extension.zip (se descarga desde /herramientas)."""
import os, zipfile
root = os.path.join(os.path.dirname(__file__), '..')
src = os.path.join(root, 'extension')
out = os.path.join(root, 'public', 'acopio-extension.zip')
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for folder, _, files in os.walk(src):
        for f in sorted(files):
            full = os.path.join(folder, f)
            z.write(full, os.path.join('acopio-extension', os.path.relpath(full, src)))
print('Extensión empaquetada en', out)
