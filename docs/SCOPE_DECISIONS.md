# Scope Decisions — ShoeBox Web (2026-10-28)

## Locked decisions

| Topic | Decision |
|---|---|
| Audience | **Game developers only** |
| Target engines | **Unity, Godot, Phaser** (metadata formats follow) |
| Delivery | **Browser tab only** (no Tauri/Electron, no PWA install requirement) |
| SWF | **Removed** (no SWF parsing, no SWF in Ani 2 Sheet) |
| Collaboration | **Removed** (no Share Folder, no backend) |
| JPEG-alpha (JPGA) | **Removed** |
| Presets | **Local only** — auto-saved per browser, plus JSON export/import (no shareable links/clipboard codes) |
| Licensing | Original app is treated as **inspiration/reference**; `shoebox_as/` stays as a git submodule. Credit renderhjs in the README. |

## Tool scope

| Tool | Status | Notes |
|---|---|---|
| **Pack Sprites** | **Keep — flagship** | Trim, padding, power-of-two, duplicate merge, Unity/Godot/Phaser metadata |
| **Slice Sprites** | **Keep** | Alpha blob detection, merge contained, baseline alignment later |
| **Ani 2 Sheet** | **Keep (GIF only)** | SWF path removed |
| **Extract Tiles** | **Keep** | Tile grid detection + unique tile bank |
| **Sprite Hull** | **Keep + improve** | Must export polygon points (legacy had no export) |
| **List Files** | **Keep** | Manifest/list generation |
| Extract SWF | **Drop** | Flash EOL |
| Share Folder | **Drop** | No backend |
| FlickrWP img | **Drop** | Dead |
| Code Inspect | **Drop** | IDE formatters |
| Mac 2 PC url | **Drop** | Cloud storage |
| UiToolkit fix | **Drop** | One-off 2011 pipeline |
| JPGA Bitmap | **Drop** | PNG/WebP/KTX2 |

## Output target formats

* **Unity / TexturePacker JSON** (hash + array) — widely used importer format.
* **Godot** — JSON frame list (`AtlasTexture` regions) that a small GDScript loader can consume.
* **Phaser 3** — native texture atlas JSON (hash).
* **CSS** — sprite classes with background-position.
* **Plain text** — `id x y w h`.

## Non-goals (v1)

* No uploads, no accounts, no analytics.
* No folder watching.
* No native "write next to source" (folder handle + ZIP fallback instead).
