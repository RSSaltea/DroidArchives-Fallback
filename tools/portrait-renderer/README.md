# Local portrait renderer

This is a local, deterministic reconstruction of the droid variant materials. It uses our extracted game portrait, mask, normal and crystal textures. It does **not** download portraits, call an image service or embed reference pixels in the generated images.

It is not the original Unreal shader: cooked material exports retain texture/parameter information but strip the authoring graphs. The material response was calibrated against the user-supplied portrait pack. It is closer to that reference, not a claim of pixel-perfect in-game reproduction. Gold, Diamond, Rainbow, Beskar, Galactic and Stellar use a shared normal-response calibration plus the extracted game material textures. This replaces the older Gonk Army colour-ramp renderer.

## Rebuild

Run from the repository root:

```powershell
npm.cmd ci --prefix tools
node tools/portrait-renderer/generate.cjs --manifest research/uefn/october31/portrait-renderer/manifest.json --out assets/droids/variants-v2
```

The manifest is an array of `{name, files}` rows. The first three files are the local base portrait, mask and object-space normal PNGs. Paths are relative to the workspace (an initial `/` is allowed). Add a new droid's three extracted textures to the manifest to render it with the same materials.

Use the current portrait masks from `research/uefn/october31/portrait-masks`. Their blue channel marks Scourge's white emissive eyes. The older October 10 masks lack this information for some droids; guessing from bright base pixels creates false white reflections and misses eyes. The renderer reads the blue channel directly.

To rebuild only Scourge while preserving the approved Kyber portraits:

```powershell
node tools/portrait-renderer/generate.cjs --variants SCOURGE --out assets/droids/variants-v2
```

Optional arguments: `--name "R3"`, `--variants SCOURGE,KYBER_GREEN`, `--crystal <local PNG>`, `--report <JSON>`. Default output is a private research preview directory. Set `CHROME_PATH` if Edge/Chrome is not installed at a usual Windows path.

Generation uses only local HTTP requests. External requests are blocked. The report records manifest/shader hashes and hashes of the output PNGs. The image output is 512x512 RGBA with the extracted silhouette's transparency.

## Reference comparison

With the normal local server running, open `/tools/portrait-renderer/review.html`. It compares the supplied reference, the previous renderer and the live local reconstruction. References and comparison snapshots remain in ignored `research/uefn/october31/portrait-review`; they are not production assets.

The two calibration JSON files contain one global normal/material response each. They are not keyed by droid name. Scourge uses a cubic normal-response boundary and a directional silhouette rim. Kyber combines a normal-response polynomial with the game's crystal texture and a calibrated display palette. Its inactive grey state has no corresponding reference in the supplied pack and remains a reconstruction.

The optional `calibrate-scourge.py` and `calibrate-kyber.py` tools require NumPy/Pillow and local references. They output coefficients, not images. Normal builds need neither Python nor the downloaded reference pack. Pass `--references`, `--manifest` (rows also need `referenceId`, such as `d018`) and, for Kyber, `--crystal`.

Scourge was fitted on five droids, with R3 excluded from training. Kyber excludes every fifth reference ID from training. Holdout checks help catch a material which looks correct on only one droid. They do not establish exact in-game accuracy.

## Checks

```powershell
node --test tests/variant-portraits.test.cjs
node tests/variant-portraits-ui.cjs
```

Review the rendered comparison on both dark and light backgrounds as well. File validity alone is not an appearance test.

## Gonk Army materials

The seven new Gonk Army droids use this same renderer for Gold through Stellar. Generate with `--variants GOLD,DIAMOND,RAINBOW,BESKAR,GALACTIC,STELLAR` and a manifest containing ECG, EG-58, EGL, KT, MPH, JO9-4MN and PLNK. Output goes to `assets/droids/gonk-army-v2`. Ordinary variants retain the green-channel material mask and the original unpainted details. Kyber and Scourge continue to cover the whole droid.

`classic-calibration.json` contains shared RGB response coefficients from five established droids, excluding the new Gonk Army models. The downloaded reference pack is needed only to rerun `calibrate-classic.py`, never to generate portraits. Rainbow uses the local spectrum texture; other materials combine the shared normal response with local surface textures. Animation remains a fixed snapshot and these are reconstructions, not exact Unreal shader outputs. The generator hashes all textures actually used.
