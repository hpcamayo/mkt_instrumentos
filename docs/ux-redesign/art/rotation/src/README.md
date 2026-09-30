# Generators of the nine rotation banners

Everything is drawn in code: no photos and no image-generation models. `glrender.py` renders GLSL with headless
Chromium (Playwright for Python); the rest is NumPy, SciPy, Pillow and CairoSVG.

- `diablada.py`: 01 Diablada (round 9).
- `dstyle.py`: the Diablada style kit used by the eight instrument pieces (round 10): `bronces.py` (Trompeta y tuba),
  `percusion.py` (Bombo y platillos), `metales.py` (Trombón y saxo), `redoble.py` (Tarola y clarinetes),
  `santiago.py` (Waqrapuku y tinya), `andinos.py` (Siku y quena), `cuerdas.py` (Charango y cajón),
  `electrica.py` (Guitarra y amplificador).
- `c9.py`, `common.py`: shared plumbing (canvas size 2880×600, compositing, the calm-centre check).

Run a piece with `python3 bronces.py` (add `--small` for a quick low-resolution pass); images land in `out/`.
The `--prev` preview overlay used during design depends on the canvas tooling and is not included.
The shipped files in `../` were cut from these renders at 1440×300 / 2880×600 (desktop) and 390×150 / 780×300 (phone).
