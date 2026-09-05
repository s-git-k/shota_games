/**
 * アバター設定と、顔写真からの簡易パレット抽出 (色の平均だけを使うローカル処理)。
 * 個人を特定/認識する技術ではなく、あくまで「肌色・髪色の近似値を提案する」だけの
 * 単純な画像処理であることに注意 (UI側でもその旨を明示する)。
 */

export type HairStyle = "short" | "long" | "bob" | "bald" | "ponytail";

export interface AvatarConfig {
  hairStyle: HairStyle;
  hairColor: number;
  skinColor: number;
  clothesColor: number;
}

export const DEFAULT_AVATAR: AvatarConfig = {
  hairStyle: "short",
  hairColor: 0x3a2a1e,
  skinColor: 0xe8b593,
  clothesColor: 0x4a7fd1
};

export const HAIR_STYLE_LABELS_JA: Record<HairStyle, string> = {
  short: "ショート",
  long: "ロング",
  bob: "ボブ",
  bald: "スキンヘッド",
  ponytail: "ポニーテール"
};

function rgbToInt(r: number, g: number, b: number): number {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

/**
 * 画像 (RGBA の連続配列) の指定した矩形領域内の平均色を求める。
 * 顔検出は行わず、単純な領域平均によるヒューリスティックな近似。
 */
export function averageColorInRegion(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  regionX0: number,
  regionY0: number,
  regionX1: number,
  regionY1: number
): number {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const x0 = Math.max(0, Math.floor(regionX0 * width));
  const x1 = Math.min(width, Math.ceil(regionX1 * width));
  const y0 = Math.max(0, Math.floor(regionY0 * height));
  const y1 = Math.min(height, Math.ceil(regionY1 * height));

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * width + x) * 4;
      const alpha = pixels[idx + 3] ?? 255;
      if (alpha < 16) continue;
      r += pixels[idx] ?? 0;
      g += pixels[idx + 1] ?? 0;
      b += pixels[idx + 2] ?? 0;
      count++;
    }
  }
  if (count === 0) return rgbToInt(200, 170, 150);
  return rgbToInt(Math.round(r / count), Math.round(g / count), Math.round(b / count));
}

export interface DerivedPalette {
  skinColor: number;
  hairColor: number;
}

/**
 * 写真ピクセルデータから肌色・髪色のおおまかな近似値を推定する。
 * - 肌色: 画像中央付近 (顔があると想定される領域) の平均色
 * - 髪色: 画像上部の帯 (頭髪があると想定される領域) の平均色
 * これは統計的な色平均に過ぎず、顔認識やAI推論は一切行っていない。
 */
export function derivePaletteFromPixels(pixels: Uint8ClampedArray, width: number, height: number): DerivedPalette {
  const skinColor = averageColorInRegion(pixels, width, height, 0.35, 0.4, 0.65, 0.75);
  const hairColor = averageColorInRegion(pixels, width, height, 0.25, 0.03, 0.75, 0.22);
  return { skinColor, hairColor };
}
