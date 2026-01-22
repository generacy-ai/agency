# Icon Conversion Required

## Status: MANUAL TASK

The marketplace icon needs to be converted from SVG to PNG format before publishing.

## File Location
- **Source**: `packages/agency-extension/media/icon.png.svg`
- **Target**: `packages/agency-extension/media/icon.png`

## Requirements
- Format: PNG
- Size: 128x128 pixels
- Background: Transparent or solid color

## Conversion Options

### Option 1: Inkscape (Command Line)
```bash
cd packages/agency-extension/media
inkscape icon.png.svg --export-filename=icon.png -w 128 -h 128
```

### Option 2: ImageMagick
```bash
cd packages/agency-extension/media
convert -background none icon.png.svg -resize 128x128 icon.png
```

### Option 3: Online Tool
- Upload to: https://cloudconvert.com/svg-to-png
- Set dimensions: 128x128
- Download and save as `icon.png`

### Option 4: Design Tool
- Open `icon.png.svg` in Figma/Sketch/Illustrator
- Export as PNG, 128x128

## Verification
After conversion, verify:
```bash
cd packages/agency-extension
pnpm exec vsce ls
```

Should show no icon-related errors.
