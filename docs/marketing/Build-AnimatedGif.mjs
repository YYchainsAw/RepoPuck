import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import gifenc from "gifenc";
import pngjs from "pngjs";

const { applyPalette, GIFEncoder, quantize } = gifenc;
const { PNG } = pngjs;

const [outputPath, ...framePaths] = process.argv.slice(2);

if (!outputPath || framePaths.length < 2) {
  throw new Error(
    "Usage: node Build-AnimatedGif.mjs <output.gif> <frame-1.png> <frame-2.png> ...",
  );
}

const encoder = GIFEncoder();

for (const [index, framePath] of framePaths.entries()) {
  const png = PNG.sync.read(fs.readFileSync(framePath));
  const palette = quantize(png.data, 256, {
    format: "rgba4444",
    oneBitAlpha: false,
  });
  const indexed = applyPalette(png.data, palette, "rgba4444");

  encoder.writeFrame(indexed, png.width, png.height, {
    palette,
    delay: 1400,
    repeat: index === 0 ? 0 : undefined,
    dispose: 1,
  });
}

encoder.finish();
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, encoder.bytes());
