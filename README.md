# ShoeBox Web

A local-first sprite and texture toolbox for game developers — a browser rewrite inspired by
[ShoeBox](https://github.com/renderhjs/ShoeBox) by Hendrik-Jan Schoenmaker (renderhjs).

Everything runs in the browser: files are decoded, packed and encoded locally. Nothing is uploaded.

Drop files, use the file picker, or **paste an image straight from the clipboard** (`⌘V` / `Ctrl+V`,
or the *Paste image* button). Pasted images get a timestamped name like `clipboard-20261028-153012.png`.

## Status

Working build with all seven scoped tools.

| Tool | State |
|---|---|
| **Pack Sprites** | Implemented — trim, padding, power-of-two, duplicate merge, multi-page atlases, Phaser / Unity-TexturePacker / Godot / CSS / text metadata |
| **Slice Sprites** | Implemented — alpha blob detection, contained-blob merge, PNG export, JSON manifest |
| **Bitmap Font** | Implemented — glyph slicing, vertical part merging, per-row baseline detection, BMFont text/XML/JSON + live text preview ([details](docs/BITMAP_FONT.md)) |
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

### Multi-page atlases

Enable **Split into pages** in Pack Sprites and a set that cannot fit in one sheet continues on
`atlas-2.png`, `atlas-3.png`, … Each page is packed exactly like a single-atlas run (trim, padding,
duplicate merge), and pages are filled largest-sprite-first so they stay balanced.

Metadata follows the format:

| Format | Behaviour with more than one page |
|---|---|
| Phaser 3 | one file with a `textures` array — load it with `this.load.multiatlas('atlas', 'atlas.json', 'assets/')` |
| Unity / TexturePacker, Godot, CSS, text | one metadata file per page (`atlas.json`, `atlas-2.json`, …), each pointing at its own image |

A sprite larger than **Max sheet size** is reported instead of being silently dropped.

### Settings & presets

Per-tool settings are remembered in `localStorage`. Presets can be saved, exported to JSON and
imported again; they are local to the browser by design (no accounts, no sharing).

## Credits & licence

* Original concept and ActionScript implementation: **Hendrik-Jan Schoenmaker (renderhjs)**,
  ShoeBox 1.00, 2011 — kept in `shoebox_as/` for reference.
* This project is an independent browser rewrite. No original code is bundled into the app build.
