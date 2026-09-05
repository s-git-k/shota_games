/**
 * 共有の型定義。ゲーム全体で使う基本的な型をここにまとめる。
 */

/** 整数ボクセル座標 (ワールド座標系) */
export interface Vec3Int {
  x: number;
  y: number;
  z: number;
}

/** ブロックの向き (0=北,1=東,2=南,3=西 の4方向) */
export type Facing = 0 | 1 | 2 | 3;

/** チャンク内のブロックの追加状態 (向き・ドアの開閉など) */
export interface BlockState {
  /** ブロックID (0 = 空気) */
  id: number;
  /** 設置時の向き 0-3 */
  facing: Facing;
  /** ドアなど開閉可能なブロックが開いているか */
  open: boolean;
}

export function makeDefaultState(id: number): BlockState {
  return { id, facing: 0, open: false };
}

/** カメラモード */
export type CameraMode = "first" | "third";

/** 移動モード */
export type MovementMode = "walk" | "fly";
