// 시드 기반 2D Perlin 노이즈 + fBm
export function createNoise2D(seed = 1337) {
  const perm = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 255; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    const t = base[i]; base[i] = base[j]; base[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];

  const GRAD = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;

  return function noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);

    const g00 = GRAD[perm[X + perm[Y]] & 7];
    const g10 = GRAD[perm[X + 1 + perm[Y]] & 7];
    const g01 = GRAD[perm[X + perm[Y + 1]] & 7];
    const g11 = GRAD[perm[X + 1 + perm[Y + 1]] & 7];

    const n00 = g00[0] * xf + g00[1] * yf;
    const n10 = g10[0] * (xf - 1) + g10[1] * yf;
    const n01 = g01[0] * xf + g01[1] * (yf - 1);
    const n11 = g11[0] * (xf - 1) + g11[1] * (yf - 1);

    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 1.41;
  };
}

// 시드 기반 3D Perlin 노이즈 (동굴 생성용)
export function createNoise3D(seed = 1337) {
  const perm = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 255; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    const t = base[i]; base[i] = base[j]; base[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];

  const G = [
    [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
    [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
    [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
  ];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dot = (g, x, y, z) => g[0] * x + g[1] * y + g[2] * z;

  return function noise3D(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y), zf = z - Math.floor(z);
    const u = fade(xf), v = fade(yf), w = fade(zf);

    const g = (i, j, k) => G[perm[X + i + perm[Y + j + perm[Z + k]]] % 12];
    const n000 = dot(g(0, 0, 0), xf, yf, zf);
    const n100 = dot(g(1, 0, 0), xf - 1, yf, zf);
    const n010 = dot(g(0, 1, 0), xf, yf - 1, zf);
    const n110 = dot(g(1, 1, 0), xf - 1, yf - 1, zf);
    const n001 = dot(g(0, 0, 1), xf, yf, zf - 1);
    const n101 = dot(g(1, 0, 1), xf - 1, yf, zf - 1);
    const n011 = dot(g(0, 1, 1), xf, yf - 1, zf - 1);
    const n111 = dot(g(1, 1, 1), xf - 1, yf - 1, zf - 1);

    return lerp(
      lerp(lerp(n000, n100, u), lerp(n010, n110, u), v),
      lerp(lerp(n001, n101, u), lerp(n011, n111, u), v),
      w
    );
  };
}

export function fbm(noise, x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

// 결정적 해시 (나무 배치 등)
export function hash2(x, z) {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
