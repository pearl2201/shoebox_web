# ShoeBox (ActionScript / Adobe AIR) — Legacy Feature Inventory

> Purpose of this document: capture **everything the original desktop app does**, in enough detail
> that we can decide what to keep, rework or drop for the web version — without reading the AS3 code again.

| | |
|---|---|
| Product | **ShoeBox** — "Multi purpose drag and drop toolbox" |
| Author | Hendrik-Jan Schoenmaker (renderhjs), 2011 |
| Version in source | `1.00` (`src/shoebox/app/Version.as`) |
| Platform | Adobe AIR 2.0 desktop app (`application.xml`) |
| Language / build | ActionScript 3, FlashDevelop project (`DropletBox.as3proj`), Flex SDK |
| Source snapshot analysed | `shoebox_as/` in this repo |

---

## 0. Important note about this snapshot

The repository contains the **application shell and plugins only**. It does **not** compile as-is because
several libraries it imports are not included:

| Missing package | Used for |
|---|---|
| `tools.*` (`Cookie`, `KeyBind`, `WireButtons`, `BmpSliceDraw`, `TxtTools`, `Color`, `HSL`, `NumberFormat`) | app persistence, key bindings, 9-slice UI drawing, text formatting |
| `com.adobe.images.*` (PNGEncoder, JPGEncoder) | PNG/JPG encoding |
| `com.adobe.serialization.json.*` | JSON encode/decode |
| `com.adobe.air.filesystem.*` | file monitoring helpers |
| `com.greensock.*` (TweenMax) | UI tweening |
| `net.sakri.flash.*` | marching squares / bitmap shape extraction (hull tool) |
| `org.bytearray.gif.*` | animated GIF decoding (Ani 2 Sheet) |
| `tweenTex.*` | SWF animation preview + Unity runtime (`TexTween`) |
| `com.kurst.air.file.*` | async file queue/copy helpers (Share Folder) |

So: **feature behaviour can be fully described, but the pixel-exact algorithms must be re-derived**
from the code we do have. That is fine — every algorithm is present in readable AS3.

---

## 1. Product concept

A frameless, always-on-top utility window ("droplet box") with a row of **square drop targets**.
Each target is a **one-purpose tool**: you drop files, a folder, or paste clipboard content onto it,
and it produces an image or text result, usually **writing the output next to the source file**.

The workflow it was built for (2011 flash/web-game asset pipelines):

1. Assets live on a network share; artists and developers hand files around.
2. Flash/Unity/HTML workflows need sprite sheets, sliced sprite sequences, alpha in JPEGs, tile grids,
   path conversion between Mac and PC, file lists for manifests.
3. No cloud. Everything is local files + clipboard + SMB shares.

---

## 2. Architecture (as built)

```
Main (Sprite, frameless native window)
├── SettingsManager          hard-coded tab → plugin mapping, cookie persistence
├── PluginManager            static registry: instantiates plugins, routes drop events
├── UiMain                   background 9-slice, close button, droplet row, tab bar, status toast
├── UiDroplet  (per plugin)  72×72 drop target: outline/filled/over states, icon, label, paste hint
├── UiTabs / UiTab           tab pages (labels 1..9,0)
├── UiSettings               per-plugin settings window (reflection over `plugin.settings`)
├── UiPluginWindow           generic result/preview window ("Save <file> ?" + OK)
├── UiWindowManager          keeps utility windows / focus in order
├── UiStatusPopUp            transient "Copied Text to Clipboard" style toast
└── plugin/*                 one class per tool, all extend PluginBase
```

### 2.1 Plugin contract (`PluginBase`)

Each plugin declares:

| Field | Meaning |
|---|---|
| `label` | text under the droplet |
| `icon` | 48×48 embedded PNG |
| `settings` | flat object of primitive values (number / boolean / string / comma string array) |
| `settingsTemplates` | named presets shown in the settings window |
| `settingsInfo` | help text |
| `extentions` | accepted file extensions |
| `registerListenEventGetData(type, fn)` | subscribe to **file-in**, **clipboard text-in**, **clipboard image-in** |
| `registerListenEventClick(fn)` | invoked on **hold-down (300 ms)** on the droplet |

`PluginManager` is a static registry; `sysDropNr` binds a plugin to its droplet.

### 2.2 Settings & persistence

* `SettingsManager.init()` hard-codes which plugin lives in which tab:
  * **Tab 1**: UiToolkit fix, Mac 2 PC url, Spr. Hull Packing, Share Folder, Extract Tiles
  * **Tab 2**: Pack Sprites, Slice Sprites, Ani 2 Sheet, JPGA Bitmap, List Files
* Order of `pushPlugin(...)` calls determines droplet position.
* Settings persist in a Flash **Cookie** (shared object) keyed `setting.<classId>`, plus `tab.page`.
* Loaded settings are only applied if the **key set matches exactly** (guards against schema drift).
* Settings UI is generated from `plugin.settings`:
  * keys sorted alphabetically, **grouped by camelCase prefix** (prefix change inserts a blank row)
  * types: `number`, `boolean`, `string`, `array` (comma-split)
  * booleans toggle on click; arrays edited as one comma-separated string
* **Export** copies a shareable preset to the clipboard as
  `::ShoeBox:<classId>:{"key":value,...}`.
* On app activation (`Event.ACTIVATE`) the clipboard is scanned for that marker and the matching
  plugin's settings are imported (values are checked against the plugin's key set first).

### 2.3 Interaction model

| Gesture | Behaviour |
|---|---|
| Drop file(s)/folder on droplet | dispatch `DATA_FILE_IN` to that plugin only |
| Paste while app activates | clipboard text/image routed to the plugin; plugins declare which they accept |
| Left click droplet | plugin-specific click handler |
| Hold droplet 300 ms | `registerListenEventClick` handler (e.g. Share Folder opens its list) |
| **Right click droplet** | open that plugin's settings window |
| Right click app background | context menu: website link, version |
| Middle click droplet | "repeat last action" — **stub**, only `trace()` |
| Keys `1`–`9` | switch tab page |
| Drag background | move native window |
| Right click result window | close it |
| Result window | preview + "Save X ?" + OK; output written on confirm |

### 2.4 Output conventions

* Outputs are written **next to the source file** (or into the source folder) using the file's parent dir.
* Filename patterns support tokens: `*` = source base name, `#` = zero-padded counter, `@` = token from a
  user-defined name list (`varNames` + `varNamesSplit`).
* Anything text-based is also copied to the clipboard for immediate pasting.
* Windows-style paths are used internally (`"\\"` joins) and validated per OS.

---

## 3. Tool catalogue

> **10 tools are wired into the UI.** Three classes exist but are **not registered** in this snapshot:
> `FlickrWP img`, `Code Inspect`, `Extract SWF`.

### 3.1 Pack Sprites — `plugin/createSpriteSheet/PluginCreateSpriteSheet.as`
**The core tool. Still the most valuable feature in the app today.**

* **Input**: 2+ images (`png`, `jpg`, `gif`), drag-drop.
* **Options**: `padding`, `cropAlpha` (trim transparent border), `powerOfTwo`, output `fileName`,
  `idFileNamesVar` (how the id is derived from the file name, e.g. `_@.png`), text output template
  (`txtFormatOuter`, `txtFormatLoop`, `txtFormatExtention`), `useCssOverHack`.
* **Algorithm**
  1. Load each file, optionally crop to alpha bounds.
  2. **Duplicate detection**: compare every pair with `BitmapData.compare`; ≥ 99 % identical → drop the
     duplicate and map both source ids to one packed rect (big win for animation frames).
  3. Sort rects by `width + height` descending.
  4. **Binary-tree guillotine packer** (port of `rect_packing.py` by Nate W. Moore): recursive split of
     free space into two nodes; `search_resolution = 2000` heuristic.
  5. Canvas sizing: try power-of-two sizes `32…2048`; otherwise **binary-search** the smallest square that
     fits, then binary-search height and width independently; final trim of transparent edges + padding.
  6. Render sheet (`copyPixels`) and overlay debug rects.
* **Output**: `sheet.png` (or configured name) + optional sidecar text file (`xml` / `css` / `json` / `txt`)
  + metadata copied to clipboard. Preview window with save confirmation.
* **Built-in templates**: AS3 `<slices>` XML, CSS (with `_over`/`_rollover` → `:hover/:focus/:active` pairing),
  TexturePacker-like JSON (`frames` + `meta`).
* **Reusable API**: `PluginCreateSpriteSheet.pack(bitmaps, ids, powerOfTwo, doCrop, padding)` — used by
  Extract SWF, and the source of truth for packer behaviour.

### 3.2 Slice Sprites — `plugin/cutSprites/PluginCutSprites.as`
**Splits one image into separate sprites** (fonts, UI kits, packed sheets).

* **Input**: single image.
* **Options**: `minClusterSize` (min area), `maxClusters` (default 250), `mergeSubClusters`
  (merge blobs nested inside another blob, e.g. letter counters), `baseLine`, `fileName`, `varNames`, `varNamesSplit`.
* **Algorithm**: pad canvas by 2 px → alpha matte → threshold mask → `floodFill` per blob →
  `getColorBoundsRect` per filled colour → dedupe rects → optional nested-blob merge.
  `baseLine` detects common horizontal lines (glyph baselines) by clustering rect bottoms within a
  tolerance and re-aligns output canvases.
* **Output**: one PNG per blob, named with `*` / `#` / `@` tokens; preview + save confirmation.

### 3.3 Ani 2 Sheet — `plugin/aniToFrameSequence/PluginAniToFrameSequence.as`
**Animated GIF or SWF → spritesheet / image sequence.**

* **Input**: `.gif` or `.swf`.
* **Options**: `maxFrames` (60), `cropGroupAlpha` (crop all frames as one group), `singleRow`, `margin`, `saveSequence`.
* **GIF path**: `org.bytearray.gif.player.GIFPlayer` → frames.
* **SWF path**: `GetSwfData` parses the SWF header (signature `FWS`/`CWS`, frame count, and
  `SetBackgroundColor` tag 9) then renders every frame with an `Event.EXIT_FRAME` loop into `BitmapData`.
* **Output**: grid spritesheet (`fnSheetGetBestCanvasSize` computes columns/rows) or numbered frame PNGs,
  file name encodes frame count and grid size; debug overlay of crop rects.
* **Known dead ends in code**: image-sequence detection and video (mov/avi/h264) were planned, never built.

### 3.4 JPGA Bitmap — `plugin/jpgaBitmap/PluginJpgaBitmap.as`
**Alpha textures inside JPEG** (mobile-era size trick).

* **Encode** (PNG → JPG): crop alpha → **dilate colours outward** with repeated blur passes
  (avoids dark halos) → canvas `2 × width`: left = RGB, right = alpha as greyscale → save JPEG at quality.
* **Decode** (JPGA JPG → PNG): split halves, RGB from the left, alpha from the **red channel** of the right.
* **Options**: `cropAlphaBounds`, `JpgCompression` (presets 96 / 85 / 72), `fileNameEncoded`, `fileNameDecoded`.
* **Batch**: multiple dropped files processed sequentially.

### 3.5 Extract Tiles — `plugin/extractTiles/PluginExtractTiles.as`
**Auto-detects a tile grid in a mock-up** and shows unique tiles.

* **Input**: single image or clipboard bitmap.
* **Options**: `tileWidth`, `tileHeight` (16×16).
* **Algorithm**: for every candidate grid offset `(x, y)` build a `TileScan` (tile ids per cell),
  score = `Σ(count²) × (maxCells − uniqueCount)`, pick the best offset.
* **Output**: preview window with source + grid overlay + colour-coded tile ids + a "tile bank" of
  unique tiles. **No file export** (diagnostic/visual aid only).

### 3.6 List Files — `plugin/listFiles/PluginListFiles.as`
**Turns dropped files into a formatted list on the clipboard.**

* **Options**: `outerClosure` (with `*`), `elementClosure` (with `*`), `elementSplit`.
* Supports `\n`, `\r`, `\t` escapes in all three fields.
* **Presets**: AS3 array (`var a:Array = ["a.png", "b.png"];`), plain newline list.
* Uses **file names only** (no paths).

### 3.7 Mac 2 PC url — `plugin/macPcPathConverter/PluginMacPcPathConverter.as`
**Path translation between macOS and Windows shares + open the folder.**

* **Options**: `driveMappings` (comma list of `PCpath=Macpath`, e.g. `B:\=/Volumes/Work_10/`,
  `\\192.168.0.240\xStaff\=/Volumes/xStaff/`), `openOnlyFolder`.
* Cleans illegal characters, strips whitespace/newlines; adds `/Volumes/` when missing;
  converts `\\server\share` ↔ `/Volumes/...`; `afp://` aware.
* **Clipboard text** → converted path; if it exists on disk the containing folder is opened in the OS.
* **Dropped file** → converted path copied to clipboard.
* Heavily OS-bound (uses `Capabilities.os`, `File.openWithDefaultApplication`-style behaviour).

### 3.8 Share Folder — `plugin/shareFolder/PluginShareFolder.as` (+ `PluginShareFolderUi`, `fileUtils/*`)
**Team hand-off through a shared folder with an `index.txt` log.**

* **Options**: `basePath` (SMB/network folder), `shareId` (sub-folder).
* Dropping files **copies** them into the share folder (async `FileQueue`, progress UI).
* Clipboard **image** → `clipboard_bmp_<seed>.png`; clipboard **text** →
  `<first 28 chars>_<seed>.txt` (blank lines collapsed).
* Appends an entry to `index.txt`, then re-reads it.
* List UI (`PluginShareFolderUi`) shows previews + entries; polls `index.txt` every **2.5 s** while focused,
  **10 s** otherwise.
* Hold/click on the droplet opens/refreshes the list.
* Uses the Mac↔PC path converter for share paths.

### 3.9 Spr. Hull Packing — `plugin/spriteHullPacking/PluginSpriteHullPacking.as` (+ `SpriteHull.as`)
**Extracts the alpha silhouette as a simplified polygon.**

* **Input**: multiple images (`png/jpg/gif`), laid out in a grid preview.
* `SpriteHull`: marching squares outline → distance/angle analysis → **angle-threshold simplification**
  (3° / 5° / 8° passes) and grid snapping.
* **Output**: visualisation of hull points and edges, vertices coloured by turning angle.
  **No export** — intended as an inspection aid for collision hulls / physics polygons
  (e.g. Unity `PolygonCollider2D`), but the point list is never written out.

### 3.10 UiToolkit fix — `plugin/PluginUiToolkit2xResizeJson.as`
**One Unity UI Toolkit pipeline helper (2× retina → 1×).**

* **Input**: exactly 2 files — a PNG and a TexturePacker JSON.
* PNG → resized to 50 %; **original moved to `<name>2x.png`**, resized written to the original name.
* JSON → all `"x"`, `"y"`, `"w"`, `"h"` values scaled by 0.5; original moved to `.txt`;
  scaled JSON written to the original name plus a `<name>2x.txt` backup.

### 3.11 FlickrWP img — `plugin/flickrWPimgEmbed/PluginFlickrWPimgEmbed.as` (not registered)
* Clipboard Flickr URL → WordPress embed HTML (`<a><img></a>`), guessing `_b.jpg` for the large variant.
* Built for Flickr URL schemes of 2011 and a specific blog template.

### 3.12 Code Inspect — `plugin/codeInspect/PluginCodeInspect.as` (not registered)
* Reads `txt/as/cs`, strips `//` and `/* */` comments, `import` lines and `trace(...)` calls,
  collapses blank lines, spaces out punctuation, then displays the code with `var` names highlighted.
* Read-only source prettifier.

### 3.13 Extract SWF — `plugin/extractSwfAnimation/*` (not registered)
**SWF → texture atlas + animation XML (+ Unity C#).**

* Loads AS3 SWF (`Loader`), or AS2/AVM1 via the bundled `AVM2Loader` wrapper.
* `ParseSwfFrames` walks the display tree for `frames` (default 8) frames, recording per object:
  transform (x, y, rotation, alpha, scaleX/Y, visible), parent id, z order.
* `fnProcessTweens()` derives per-object **tween segments** from per-frame state changes.
* Each leaf object is rasterised to a bitmap; the sheet is built with
  `PluginCreateSpriteSheet.pack(...)`.
* **Outputs**:
  * `<tex>` XML — packed rect list
  * `<ani>` XML — `<swf fps length tex>` → `<elm id parent z tex sx sy>` → `<set>` / `<tweenTo at length>`
  * optional Unity C# class `<Name>_TexTween : TexTween` with `addTransform / addTexture / setTransform`
  * PNG spritesheet
  * live preview via `TweenTexAnimation` (external runtime)

---

## 4. Cross-cutting capabilities

| Capability | Where | Notes for the web port |
|---|---|---|
| Alpha-bounds trim | Pack Sprites, JPGA, Ani 2 Sheet, Slice | `getColorBoundsRect` equivalent = alpha scan; trivial in JS/WASM |
| Duplicate image detection | Pack Sprites | `compare()` + histogram ≥ 99 %; needs a fast pixel diff |
| Rectangle packing (guillotine + binary search) | Pack Sprites, Extract SWF | Pure algorithm, easy and valuable to port **verbatim** |
| Flood-fill blob detection | Slice Sprites | Scanline flood fill on `Uint32Array` |
| Marching squares / polygon simplify | Spr. Hull | Needs a reimplementation |
| Animated GIF decode | Ani 2 Sheet | Modern JS libraries handle this well |
| SWF playback & frame grab | Ani 2 Sheet, Extract SWF | **Hard** — Flash is EOL |
| PNG/JPEG encode | everywhere | Canvas `toBlob`, or WASM codecs for quality control |
| Clipboard text/image | most tools | Browser permissions + fallbacks |
| Native file write next to source | all | Browsers cannot write beside a source file without a directory handle |
| OS path conversion / folder reveal | Mac 2 PC url, Share Folder | Largely meaningless on the web |
| Shared-object persistence | `Cookie` | `localStorage` / IndexedDB |
| Preset export/import via clipboard string | settings | JSON in URL hash / local preset library |
| Settings generated from a flat schema | `UiSettings` | Schema-driven form (Zod + react-hook-form) |
| 9-slice skinning, toasts, utility windows | `UiMain`, `UiDroplet`, `UiPluginWindow` | Replace with modern component UI + modal/drawer |

---

## 5. Platform coupling inventory (what cannot survive the port)

| AIR / Flash API | Used for | Web reality |
|---|---|---|
| `NativeWindow` (frameless, transparent, utility) | main window + per-tool preview windows | browser tab / PWA window; previews become modals/drawers |
| `NativeDragManager` | file drop | HTML5 drag & drop (`DataTransferItem.webkitGetAsEntry` for folders) |
| `Clipboard.generalClipboard` (text/image) | paste tools | `navigator.clipboard` (image read needs gesture + permission) |
| `File`, `FileStream`, `FileMode` | read/write next to source | File System Access API (Chromium) or download; ZIP fallback |
| `File.moveTo` | rename/move originals (UiToolkit fix) | needs directory handle; otherwise not possible |
| Flash shared object (`Cookie`) | settings | `localStorage` / IndexedDB |
| `Capabilities.os` | path conversion | `navigator.platform` (weak), but the feature itself is dated |
| `Loader.loadBytes` (SWF) | SWF tools | no Flash player in browsers |
| `BitmapData` draw/compare/floodFill | all pixel work | Canvas 2D + `ImageData` + workers/WASM |
| `TextField` with HTML-ish keyword colouring | settings/preview | normal DOM/CSS |

---

## 6. Feature relevance matrix (for the keep/drop decision)

Value judged for **today's asset pipelines** (2026: web games, Unity/Godot/Unreal, WebP/AVIF/KTX2,
cloud storage, IDE formatters).

| # | Feature | Value today | Port difficulty | Recommendation |
|---|---|---|---|---|
| 1 | Pack Sprites | **High** — atlas packing is still a daily need | Medium (pure algorithm + encode) | **Keep, make it the flagship** |
| 2 | Slice Sprites | **High** — sprite/font slicing is still common | Medium | **Keep** |
| 3 | Ani 2 Sheet (GIF) | Medium — GIF→frames still used for prototypes/memes | Easy–Medium | **Keep GIF path** |
| 4 | Ani 2 Sheet (SWF) | Very low — Flash is EOL | Hard | **Drop / later (experimental)** |
| 5 | Extract SWF | Very low; only for legacy archives | Very hard | **Drop / later** (offer only if users ask) |
| 6 | JPGA Bitmap | Low–Medium — PNG/WebP/KTX2 solved alpha; still handy for old engines | Easy | **Keep as optional "alpha-in-JPEG" utility** |
| 7 | Extract Tiles | Medium — pixel-art/tileset detection is niche but loved | Medium | **Keep (bonus tool)** |
| 8 | Spr. Hull Packing | Medium — collision polygons still useful (Godot/Unity) | Medium | **Rework: add real export** (JSON/points) |
| 9 | List Files | Medium — manifest generation | Easy | **Keep** |
| 10 | UiToolkit fix | Very low — tied to one 2011 pipeline | Easy | **Generalise or drop** ("halve atlas + JSON") |
| 11 | Mac 2 PC url | Very low — cloud storage replaced network drives | Easy but OS-bound | **Drop** (optional micro-utility) |
| 12 | Share Folder | Low — Figma/Slack/Drive/WeTransfer replaced it | Medium–High (needs backend) | **Drop** (or rethink as "share a result via link") |
| 13 | FlickrWP img | Zero — dead service patterns | Trivial | **Drop** |
| 14 | Code Inspect | Zero — IDE formatters exist | Trivial | **Drop** |
| 15 | Whole droplet-box UX | **High** — fast, no-modal, drag-and-drop is still great | Medium | **Keep the concept**, restyle |

**Net:** the durable product is a **client-side asset utility toolbox**: atlas packing, sprite slicing,
GIF→frames, tile extraction, hull export, file listing. Everything network/Flash/OS-path related can go.

---

## 7. Formats & tokens (reference for reimplementation)

| Concept | Legacy syntax | Notes |
|---|---|---|
| Filename tokens | `*` source base name, `#` zero-padded counter, `@` name from `varNames` | counter width = number of `#` |
| Atlas id derivation | `idFileNamesVar` e.g. `_@.png` → id = file name between `_` and `.png` | prefix/suffix `@` |
| Text template | `@loop` placeholder, `@id @x @y @w @h` per item | escapes `\n`, `\t`, `\r` |
| CSS pairing | suffix `_over`, `_o.`, `_rollover`, `_rollOver` | emits `a.id:hover, a.id:focus, a.id:active` |
| Settings preset share | `::ShoeBox:<classId>:{json}` on clipboard | imported on app focus |
| Atlas JSON template | `{"frames": {...}, "meta": {"app":"ShoeBox","size":{"w":@w,"h":@h}}}` | TexturePacker-like |
| Atlas XML template | `<slices><img id x y w h/></slices>` | |
| SWF animation XML | `<swf fps length tex><elm id parent z tex sx sy><set/><tweenTo at length/></elm></swf>` | |
| SWF texture XML | `<tex fps?><rec x y width height/></tex>` | |

---

## 8. Open questions to settle before we cut features

> **Answered on 2026-10-28 — see [`SCOPE_DECISIONS.md`](./SCOPE_DECISIONS.md).** The questions below are
> kept as the rationale trail.

1. **Audience**: game developers only, or general designers? (decides whether tile/hull tools stay)
2. **Target engines**: Unity / Godot / Phaser / PixiJS / plain CSS? (decides atlas export formats)
3. **Offline/desktop requirement**: is a browser tab enough, or do we need a desktop build (Tauri) for
   "write next to source" and folder watching?
4. **SWF**: does anyone still have SWF assets to convert? If yes, do we accept a Ruffle-based,
   experimental path?
5. **Collaboration**: is Share Folder / team hand-off still a need, or is a "copy result / download ZIP" enough?
6. **JPEG-alpha**: any engine in the target set still needs it?
7. **Settings presets**: do we need shareable presets (team standard atlases)?
8. **Attribution/licence**: confirm the terms of the original ShoeBox source before publishing a port.
