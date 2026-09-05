/**
 * シード付き疑似乱数と、地形生成に使う決定論的なノイズ関数。
 * 同じシード文字列からは常に同じ地形が生成される。
 */

/** 文字列シードを32bit整数へ変換する (cyrb53 の簡易版)。 */
export function hashStringToInt(seed: string): number {
  let h1 = 0xdeadbeef ^ seed.length;
  let h2 = 0x41c6ce57 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  // 32bit unsigned に正規化
  return (h1 >>> 0) ^ (h2 >>> 0);
}

/** mulberry32: 高速で十分な質の疑似乱数生成器。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function random(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 任意の文字列シードから RNG 関数を作る。 */
export function createRng(seedText: string): () => number {
  return mulberry32(hashStringToInt(seedText));
}

/** 2次元整数座標から決定論的な [0,1) の疑似乱数値を得る (格子点ハッシュ)。 */
export function hash2D(seed: number, x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 格子点上の値をハッシュから作り、その間を滑らかに補間する 2D value noise。 */
export function valueNoise2D(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const sx = smoothstep(x - x0);
  const sy = smoothstep(y - y0);

  const n00 = hash2D(seed, x0, y0);
  const n10 = hash2D(seed, x1, y0);
  const n01 = hash2D(seed, x0, y1);
  const n11 = hash2D(seed, x1, y1);

  const ix0 = lerp(n00, n10, sx);
  const ix1 = lerp(n01, n11, sx);
  return lerp(ix0, ix1, sy);
}

/** 複数オクターブを重ねたフラクタルノイズ。戻り値は概ね [0,1]。 */
export function fractalNoise2D(
  seed: number,
  x: number,
  y: number,
  octaves = 4,
  persistence = 0.5,
  scale = 0.01
): number {
  let total = 0;
  let amplitude = 1;
  let maxAmplitude = 0;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    total += valueNoise2D(seed + i * 1013, x * scale * frequency, y * scale * frequency) * amplitude;
    maxAmplitude += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }
  return total / maxAmplitude;
}

/**
 * Phase 3: 地下生成 (洞窟・鉱脈・地下水) 用の3次元ハッシュ/ノイズ。
 * 2次元版と同じ考え方で、格子点座標から決定論的な [0,1) 値を得る。
 */
export function hash3D(seed: number, x: number, y: number, z: number): number {
  let h =
    Math.imul(x, 374761393) +
    Math.imul(y, 668265263) +
    Math.imul(z, 2246822519) +
    Math.imul(seed, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/** 格子点上の値をハッシュから作り、その間を滑らかに補間する 3D value noise。 */
export function valueNoise3D(seed: number, x: number, y: number, z: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const z1 = z0 + 1;
  const sx = smoothstep(x - x0);
  const sy = smoothstep(y - y0);
  const sz = smoothstep(z - z0);

  const n000 = hash3D(seed, x0, y0, z0);
  const n100 = hash3D(seed, x1, y0, z0);
  const n010 = hash3D(seed, x0, y1, z0);
  const n110 = hash3D(seed, x1, y1, z0);
  const n001 = hash3D(seed, x0, y0, z1);
  const n101 = hash3D(seed, x1, y0, z1);
  const n011 = hash3D(seed, x0, y1, z1);
  const n111 = hash3D(seed, x1, y1, z1);

  const ix00 = lerp(n000, n100, sx);
  const ix10 = lerp(n010, n110, sx);
  const ix01 = lerp(n001, n101, sx);
  const ix11 = lerp(n011, n111, sx);
  const iy0 = lerp(ix00, ix10, sy);
  const iy1 = lerp(ix01, ix11, sy);
  return lerp(iy0, iy1, sz);
}

/** 複数オクターブを重ねた3次元フラクタルノイズ。戻り値は概ね [0,1]。 */
export function fractalNoise3D(
  seed: number,
  x: number,
  y: number,
  z: number,
  octaves = 3,
  persistence = 0.5,
  scale = 0.05
): number {
  let total = 0;
  let amplitude = 1;
  let maxAmplitude = 0;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    total +=
      valueNoise3D(seed + i * 7919, x * scale * frequency, y * scale * frequency, z * scale * frequency) * amplitude;
    maxAmplitude += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }
  return total / maxAmplitude;
}
