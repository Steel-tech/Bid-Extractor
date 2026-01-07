const fs = require('fs');
const zlib = require('zlib');

// PNG chunk utilities
function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type);
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(data) {
  let crc = 0xffffffff;
  const table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Colors
const WHITE = { r: 255, g: 255, b: 255 };
const STEEL_DARK = { r: 55, g: 65, b: 81 };
const STEEL_LIGHT = { r: 107, g: 114, b: 128 };
const BORDER_GRAY = { r: 200, g: 200, b: 200 };

function createIBeamIcon(size) {
  const width = size;
  const height = size;

  // Create pixel buffer (RGBA)
  const pixels = [];
  for (let i = 0; i < width * height; i++) {
    pixels.push({ r: 0, g: 0, b: 0, a: 0 });
  }

  const setPixel = (x, y, color, alpha = 255) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      const idx = y * width + x;
      pixels[idx] = { r: color.r, g: color.g, b: color.b, a: alpha };
    }
  };

  const getPixel = (x, y) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      return pixels[y * width + x];
    }
    return { r: 0, g: 0, b: 0, a: 0 };
  };

  // Draw filled rounded rectangle
  const fillRoundRect = (x, y, w, h, radius, color) => {
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        let inside = true;

        // Check corners
        if (px < x + radius && py < y + radius) {
          // Top-left
          const dx = px - (x + radius);
          const dy = py - (y + radius);
          inside = dx * dx + dy * dy <= radius * radius;
        } else if (px >= x + w - radius && py < y + radius) {
          // Top-right
          const dx = px - (x + w - radius - 1);
          const dy = py - (y + radius);
          inside = dx * dx + dy * dy <= radius * radius;
        } else if (px < x + radius && py >= y + h - radius) {
          // Bottom-left
          const dx = px - (x + radius);
          const dy = py - (y + h - radius - 1);
          inside = dx * dx + dy * dy <= radius * radius;
        } else if (px >= x + w - radius && py >= y + h - radius) {
          // Bottom-right
          const dx = px - (x + w - radius - 1);
          const dy = py - (y + h - radius - 1);
          inside = dx * dx + dy * dy <= radius * radius;
        }

        if (inside) {
          setPixel(Math.floor(px), Math.floor(py), color);
        }
      }
    }
  };

  // Draw filled rectangle
  const fillRect = (x, y, w, h, color) => {
    for (let py = Math.floor(y); py < Math.floor(y + h); py++) {
      for (let px = Math.floor(x); px < Math.floor(x + w); px++) {
        setPixel(px, py, color);
      }
    }
  };

  // Draw filled circle
  const fillCircle = (cx, cy, radius, color) => {
    for (let py = cy - radius; py <= cy + radius; py++) {
      for (let px = cx - radius; px <= cx + radius; px++) {
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy <= radius * radius) {
          setPixel(Math.floor(px), Math.floor(py), color);
        }
      }
    }
  };

  const s = size / 128; // Scale factor

  // 1. Draw white rounded background
  const bgRadius = Math.floor(20 * s);
  const margin = Math.floor(2 * s);
  fillRoundRect(margin, margin, size - margin * 2, size - margin * 2, bgRadius, WHITE);

  // 2. Add subtle border for visibility on white backgrounds
  const borderWidth = Math.max(1, Math.floor(2 * s));
  for (let i = 0; i < borderWidth; i++) {
    const offset = margin + i;
    // Draw border by outlining the rounded rect
    for (let x = offset + bgRadius; x < size - offset - bgRadius; x++) {
      setPixel(x, offset, BORDER_GRAY);
      setPixel(x, size - offset - 1, BORDER_GRAY);
    }
    for (let y = offset + bgRadius; y < size - offset - bgRadius; y++) {
      setPixel(offset, y, BORDER_GRAY);
      setPixel(size - offset - 1, y, BORDER_GRAY);
    }
  }

  // 3. Draw I-Beam - BOLD and centered
  const beamWidth = Math.floor(80 * s);   // Wider beam
  const beamHeight = Math.floor(90 * s);  // Taller beam
  const flangeHeight = Math.floor(18 * s);
  const webWidth = Math.floor(20 * s);

  const startX = Math.floor((size - beamWidth) / 2);
  const startY = Math.floor((size - beamHeight) / 2);

  // Top flange
  fillRoundRect(startX, startY, beamWidth, flangeHeight, Math.floor(3 * s), STEEL_DARK);

  // Bottom flange
  fillRoundRect(startX, startY + beamHeight - flangeHeight, beamWidth, flangeHeight, Math.floor(3 * s), STEEL_DARK);

  // Web (vertical middle part)
  const webX = startX + Math.floor((beamWidth - webWidth) / 2);
  fillRect(webX, startY + flangeHeight - Math.floor(2 * s), webWidth, beamHeight - flangeHeight * 2 + Math.floor(4 * s), STEEL_DARK);

  // Highlight on top flange for 3D effect
  if (size >= 32) {
    fillRoundRect(
      startX + Math.floor(2 * s),
      startY + Math.floor(2 * s),
      beamWidth - Math.floor(4 * s),
      Math.floor(6 * s),
      Math.floor(2 * s),
      STEEL_LIGHT
    );
  }

  // Convert to PNG
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type (RGBA)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT
  const rawData = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0); // filter byte
    for (let x = 0; x < width; x++) {
      const p = getPixel(x, y);
      rawData.push(p.r, p.g, p.b, p.a);
    }
  }
  const compressed = zlib.deflateSync(Buffer.from(rawData));
  const idat = createChunk('IDAT', compressed);

  // IEND
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

// Generate all icon sizes
console.log('🏗️  Generating Steel I-Beam Icons...\n');

[16, 32, 48, 128].forEach(size => {
  const png = createIBeamIcon(size);
  fs.writeFileSync(`${__dirname}/icon${size}.png`, png);
  console.log(`✅ Created icon${size}.png (${size}x${size})`);
});

console.log('\n🔥 DONE! Steel I-beam icons ready!');
console.log('   Refresh your Chrome extension to see the new icons.');
