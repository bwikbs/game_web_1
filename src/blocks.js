import * as THREE from 'three';

// ── 블록 ID ──────────────────────────────────────────────
export const BLOCK = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, LOG: 5,
  LEAVES: 6, PLANK: 7, GLASS: 8, BRICK: 9, COBBLE: 10,
  SNOW: 11, WATER: 12,
};

// ── 타일 인덱스 (아틀라스 내 위치) ──────────────────────
const T = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3,
  SAND: 4, LOG_SIDE: 5, LOG_TOP: 6, LEAVES: 7,
  PLANK: 8, GLASS: 9, BRICK: 10, COBBLE: 11,
  SNOW: 12, WATER: 13,
};

// tiles: [윗면, 아랫면, 옆면]
export const BLOCK_DEFS = [
  { name: '공기', tiles: null, solid: false, transparent: true },
  { name: '잔디', tiles: [T.GRASS_TOP, T.DIRT, T.GRASS_SIDE], solid: true, transparent: false },
  { name: '흙', tiles: [T.DIRT, T.DIRT, T.DIRT], solid: true, transparent: false },
  { name: '돌', tiles: [T.STONE, T.STONE, T.STONE], solid: true, transparent: false },
  { name: '모래', tiles: [T.SAND, T.SAND, T.SAND], solid: true, transparent: false },
  { name: '원목', tiles: [T.LOG_TOP, T.LOG_TOP, T.LOG_SIDE], solid: true, transparent: false },
  { name: '나뭇잎', tiles: [T.LEAVES, T.LEAVES, T.LEAVES], solid: true, transparent: false },
  { name: '판자', tiles: [T.PLANK, T.PLANK, T.PLANK], solid: true, transparent: false },
  { name: '유리', tiles: [T.GLASS, T.GLASS, T.GLASS], solid: true, transparent: true },
  { name: '벽돌', tiles: [T.BRICK, T.BRICK, T.BRICK], solid: true, transparent: false },
  { name: '조약돌', tiles: [T.COBBLE, T.COBBLE, T.COBBLE], solid: true, transparent: false },
  { name: '눈', tiles: [T.SNOW, T.SNOW, T.SNOW], solid: true, transparent: false },
  { name: '물', tiles: [T.WATER, T.WATER, T.WATER], solid: false, transparent: true },
];

// ── 텍스처 아틀라스 (16px 타일, 4×4) 절차 생성 ──────────
const TILE = 16, COLS = 4, ROWS = 4;
export const atlasCanvas = document.createElement('canvas');
atlasCanvas.width = TILE * COLS;
atlasCanvas.height = TILE * ROWS;

let rndState = 12345;
const rnd = () => ((rndState = (rndState * 1664525 + 1013904223) >>> 0) / 4294967296);

function drawTile(ctx, tileIdx, pixelFn) {
  const tx = (tileIdx % COLS) * TILE;
  const ty = Math.floor(tileIdx / COLS) * TILE;
  const img = ctx.createImageData(TILE, TILE);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      const i = (y * TILE + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, tx, ty);
}

const vary = (c, amt) => {
  const d = (rnd() - 0.5) * 2 * amt;
  return [c[0] + d, c[1] + d, c[2] + d, 255];
};

function buildAtlas() {
  const ctx = atlasCanvas.getContext('2d');

  drawTile(ctx, T.GRASS_TOP, () => vary([106, 170, 64], 14));
  drawTile(ctx, T.DIRT, () => vary([134, 96, 67], 12));
  drawTile(ctx, T.GRASS_SIDE, (x, y) => {
    if (y < 3 || (y === 3 && rnd() < 0.5)) return vary([106, 170, 64], 14);
    return vary([134, 96, 67], 12);
  });
  drawTile(ctx, T.STONE, () => vary([125, 125, 125], 12));
  drawTile(ctx, T.SAND, () => vary([219, 207, 163], 10));
  drawTile(ctx, T.LOG_SIDE, (x) => {
    const stripe = (x % 4) < 2;
    return vary(stripe ? [104, 82, 50] : [85, 66, 40], 8);
  });
  drawTile(ctx, T.LOG_TOP, (x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    const ring = (d | 0) % 2 === 0;
    return vary(ring ? [176, 143, 91] : [140, 110, 66], 6);
  });
  drawTile(ctx, T.LEAVES, () => {
    const dark = rnd() < 0.25;
    return vary(dark ? [38, 88, 28] : [58, 124, 40], 14);
  });
  drawTile(ctx, T.PLANK, (x, y) => {
    if (y % 4 === 3) return vary([120, 94, 58], 6);
    if ((y < 4 && x === 12) || (y >= 4 && y < 8 && x === 4) ||
        (y >= 8 && y < 12 && x === 10) || (y >= 12 && x === 2)) return vary([120, 94, 58], 6);
    return vary([175, 140, 88], 8);
  });
  drawTile(ctx, T.GLASS, (x, y) => {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    if (edge) return [200, 220, 230, 255];
    if (x - y === 4 || x - y === 5) return [235, 245, 250, 130];
    return [220, 235, 245, 35];
  });
  drawTile(ctx, T.BRICK, (x, y) => {
    const row = Math.floor(y / 4);
    const mortarY = y % 4 === 3;
    const off = row % 2 === 0 ? 0 : 4;
    const mortarX = (x + off) % 8 === 7;
    if (mortarY || mortarX) return vary([188, 180, 170], 6);
    return vary([150, 72, 60], 10);
  });
  drawTile(ctx, T.COBBLE, (x, y) => {
    const cx = Math.floor(x / 5), cy = Math.floor(y / 5);
    const edge = x % 5 === 4 || y % 5 === 4;
    if (edge) return vary([80, 80, 82], 6);
    const shade = 105 + ((cx * 7 + cy * 13) % 3) * 15;
    return vary([shade, shade, shade + 3], 10);
  });
  drawTile(ctx, T.SNOW, () => vary([238, 244, 248], 6));
  drawTile(ctx, T.WATER, () => {
    const c = vary([48, 108, 200], 12);
    c[3] = 160;
    return c;
  });
}
buildAtlas();

export const atlasTexture = new THREE.CanvasTexture(atlasCanvas);
atlasTexture.magFilter = THREE.NearestFilter;
atlasTexture.minFilter = THREE.NearestFilter;
atlasTexture.generateMipmaps = false;
atlasTexture.colorSpace = THREE.SRGBColorSpace;

// 타일 uv (텍셀 중앙 보정으로 번짐 방지)
export function tileUV(tileIdx, u, v) {
  const tx = tileIdx % COLS;
  const ty = Math.floor(tileIdx / COLS);
  return [
    (tx + (u * 15 + 0.5) / 16) / COLS,
    1 - (ty + ((1 - v) * 15 + 0.5) / 16) / ROWS,
  ];
}

// 핫바 아이콘용 데이터 URL
export function tileIconURL(tileIdx, size = 40) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const tx = (tileIdx % COLS) * TILE;
  const ty = Math.floor(tileIdx / COLS) * TILE;
  ctx.drawImage(atlasCanvas, tx, ty, TILE, TILE, 0, 0, size, size);
  return c.toDataURL();
}
