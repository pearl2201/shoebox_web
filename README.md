# ShoeBox Web

A local-first sprite and texture toolbox for game developers — a browser rewrite inspired by
[ShoeBox](https://github.com/renderhjs/ShoeBox) by Hendrik-Jan Schoenmaker (renderhjs).

Everything runs in the browser: files are decoded, packed and encoded locally. Nothing is uploaded.

## Status

Working build with all six scoped tools.

| Tool | State |
|---|---|
| **Pack Sprites** | Implemented — trim, padding, power-of-two, duplicate merge, Phaser / Unity-TexturePacker / Godot / CSS / text metadata |
| **Slice Sprites** | Implemented — alpha blob detection, contained-blob merge, PNG export, JSON manifest |
| **Ani 2 Sheet** | Implemented — animated GIF → spritesheet or frame sequence, shared alpha trim, frame timing metadata |
| **Extract Tiles** | Implemented — grid-offset detection, unique tile set, tile map JSON |
| **Sprite Hull** | Implemented — outline / convex hull, JSON / Unity C# / Godot output |
| **List Files** | Implemented — plain / JSON / AS3 / custom template, auto-copy to clipboard |

Scope decisions are recorded in [`docs/SCOPE_DECISIONS.md`](docs/SCOPE_DECISIONS.md).
The legacy ActionScript source lives in `shoebox_as/` as a reference submodule.

## Live builds

| Host | URL |
|---|---|
| Cloudflare Pages (primary) | `https://shoebox.lacgame.com` |
| GitHub Pages (mirror) | https://pearl2201.github.io/shoebox_web/ *(enable Pages once in repo settings)* |

Both are produced from the same `dist/` build — assets use a relative base, so no per-host config is
needed. Setup and DNS steps: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # algorithm unit tests
npm run build    # type-check + production build
```

## How it works

* `src/core/` — framework-free algorithms (guillotine packer, alpha trimming, flood fill, tile-grid
  detection, contour tracing/simplification, metadata templates). Pure functions over typed arrays,
  covered by unit tests.
* `src/tools/` — tool definitions: label, icon, settings fields, defaults and a `run()` function.
  This replaces the legacy `PluginBase` + `PluginManager` model.
* `src/lib/` — browser adapters: image/GIF decoding, presets, clipboard, output (folder handle or ZIP).
* `src/components/` — React UI: tool rail, workbench, settings/presets panel.

### Output

* If the browser supports the File System Access API, pick an output folder once and results are
  written straight into it.
* Otherwise — or if permission is denied — results are downloaded (single file or ZIP).

### Settings & presets

Per-tool settings are remembered in `localStorage`. Presets can be saved, exported to JSON and
imported again; they are local to the browser by design (no accounts, no sharing).

## Credits & licence

* Original concept and ActionScript implementation: **Hendrik-Jan Schoenmaker (renderhjs)**,
  ShoeBox 1.00, 2011 — kept in `shoebox_as/` for reference.
* This project is an independent browser rewrite. No original code is bundled into the app build.
