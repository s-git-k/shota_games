/**
 * 地形生成全体で共有する基本定数。
 * terrain.ts / biome.ts / underground.ts が互いに循環importしないよう、
 * 共通で使う定数だけをこの依存先の無いモジュールに切り出している。
 */
import { CHUNK_HEIGHT } from "./chunk";

export const SEA_LEVEL = 20;
/** 建築用に上部の余白を残した、地形が届きうる最大の高さ。 */
export const MAX_TERRAIN_HEIGHT = CHUNK_HEIGHT - 20;
