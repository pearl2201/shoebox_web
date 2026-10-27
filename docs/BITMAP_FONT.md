# Bitmap Font

The **Bitmap Font** tool turns a font sheet image into a bitmap-font atlas plus engine-ready
metadata. It runs entirely in the browser.

## Pipeline

```
font sheet (PNG)
   │  alpha mask
   ▼
connected glyph blobs ── merge counters (O, A…) ── merge stacked parts (i/j dots, accents)
   │
   ├─ row clustering → reading order (top→bottom, left→right)
   ├─ per-row baseline detection → line top / base / descender
   └─ glyph ↔ character assignment (your character list)
   ▼
packed atlas (PNG) + BMFont text / XML / JSON
   ▼
live text preview (rendered with the generated metrics)
```

## Input requirements

* **Transparent background** and a clear gap between glyphs (at least ~1 px).
* One font per image; glyphs are assigned in reading order (rows, then left-to-right).
* Works best with upright sheets; diagonal/skewed layouts are not detected.
* The image may contain multiple rows — each row gets its own detected baseline and all glyphs are
  normalised to one common line top.
* Multi-part glyphs are handled:
  * **contained blobs** (the hole in “O”) stay part of the glyph,
  * **stacked parts** (dot of “i”/“j”, accents) are merged when their x-ranges overlap and the vertical
    gap is ≤ *Vertical merge gap*.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| **Characters** | `a–z A–Z 0–9 …` | Characters mapped to glyphs in reading order. Whitespace is ignored; duplicates removed; space is generated automatically. |
| **Detect baseline** | on | Per row, use the most common glyph bottom as baseline (keeps descenders below it). Off = use each row's lowest bottom. |
| **Line gap** | 0 | Extra pixels added to `lineHeight`. |
| **Letter spacing** | 1 | Added to every `xadvance`. |
| **Fixed advance** | 0 | `0` = proportional (`glyph width + spacing`); `>0` forces the same advance for all glyphs (monospace). |
| **Space width** | 6 | `xadvance` of the synthetic space character. |
| **Min glyph size** | 2 | Blobs smaller than this (width **and** height) are ignored. |
| **Merge contained blobs** | on | Keeps counters as part of the glyph. |
| **Vertical merge gap** | 6 | Max vertical gap when joining stacked parts. `0` disables. |
| **Atlas padding** | 1 | Spacing between glyphs in the atlas. |
| **Power-of-two atlas** | on | Force a 32/64/128/… square sheet. |
| **Font name** | *(file name)* | `info face` in the metadata. |
| **Atlas file name** | `font.png` | Output image name (also referenced by the metadata). |
| **Metadata** | BMFont text | `BMFont text (.fnt)`, `BMFont XML (.xml)` or `BMFont JSON (.json)`. |
| **Preview text** | sample text | Rendered with the generated atlas and metrics; `\n` starts a new line. |

## Output

Two files:

1. **`font.png`** — packed glyph atlas (RGBA).
2. **`font.fnt` / `font.xml` / `font.json`** — BMFont metadata.

### Metadata fields

| Field | Meaning |
|---|---|
| `lineHeight` | Distance between baselines of consecutive lines (ascender + descender + line gap). |
| `base` | Distance from the top of a line to the baseline. |
| `scaleW` / `scaleH` | Atlas dimensions. |
| `char.id` | Unicode code point (BMP only). |
| `char.x`, `char.y` | Glyph position in the atlas. |
| `char.width`, `char.height` | Glyph size in pixels. |
| `char.xoffset` | Horizontal offset from the pen position (currently `0`; bearings are not derived). |
| `char.yoffset` | Distance from the line top to the glyph top (aligns rows and descenders). |
| `char.xadvance` | Pen advance after drawing the glyph. |
| `char.page` | Texture page (always `0`; single-page atlas). |

A space character (`id=32`, zero-size) is always included so word gaps work without a space glyph.

## Engine usage

### Phaser 3 (XML)

```js
this.load.bitmapFont('pixel', 'assets/font.png', 'assets/font.xml');
// later
this.add.bitmapText(16, 16, 'pixel', 'Hello world', 24);
```

### Godot 4 (BMFont text)

Use the **text** format, then add both files to the project. Godot imports `.fnt` + its page image as a
`FontFile` (BMFont); assign it to a `Label`/`RichTextLabel` with a `theme_override_fonts_font`.

### Unity

BMFont text/XML can be imported by common BMFont importers
(for example TextMesh Pro's BMFont importer or third-party atlas importers). Keep the atlas and the
metadata file names as referenced by `page file="..."`.

### PixiJS / custom loaders

Use the XML or JSON variant and create a bitmap font from the parsed `chars` list. The JSON is a plain
`{ info, common, pages, chars }` object.

## Limitations (v1)

* **No kerning pairs** — glyphs advance by their own width + spacing.
* **No bearings** — `xoffset` is always 0; glyphs are cropped to their alpha bounds. If a font needs
  left side bearings, add them in the engine or in a future version.
* **Single texture page** — very large fonts that exceed the 4096 px atlas limit will fail; reduce the
  font size or split the sheet.
* **BMP characters only** — BMFont ids are 16-bit, so emoji/astral-plane characters are ignored.
* **Sheet-based only** — glyphs must be separated by transparency; it does not read vector fonts.

## Tips for font sheets

* Render every glyph onto the same baseline and keep a fixed cell size; this gives the most consistent
  metrics.
* Leave 2–4 px between glyphs so blob detection separates them.
* Include descenders (`g j p q y`) in the sheet — they define the descender depth.
* Use *Fixed advance* for monospace fonts.
* Check the **preview** before exporting; missing characters appear as gaps (the notes panel tells you how
  many characters had no glyph).

## Related tools

* **Slice Sprites** — per-glyph PNGs and a manifest, when you need individual files instead of BMFont.
* **Pack Sprites** — general atlas packing with Phaser/Unity/Godot/CSS metadata.
