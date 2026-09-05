/**
 * サバイバル用インベントリ (アイテム個数管理)。
 * ブロックキー・アイテムキーを問わず、文字列キー -> 個数 の単純なレコードとして扱う。
 * 純粋関数として実装し、Game クラス側で不変更新する (テストしやすさを優先)。
 */

export type InventoryData = Record<string, number>;

export function createEmptyInventory(): InventoryData {
  return {};
}

export function getCount(inv: InventoryData, key: string): number {
  return inv[key] ?? 0;
}

export function hasAtLeast(inv: InventoryData, key: string, count: number): boolean {
  return getCount(inv, key) >= count;
}

/** アイテムを加算した新しいインベントリを返す (元は変更しない)。 */
export function addItem(inv: InventoryData, key: string, count: number): InventoryData {
  if (count <= 0) return inv;
  const next = { ...inv };
  next[key] = (next[key] ?? 0) + count;
  return next;
}

/**
 * アイテムを減算する。不足している場合は null を返し (呼び出し側でエラー表示できるように)、
 * サイレントに失敗しない。
 */
export function removeItem(inv: InventoryData, key: string, count: number): InventoryData | null {
  if (count <= 0) return inv;
  const current = getCount(inv, key);
  if (current < count) return null;
  const next = { ...inv };
  const remaining = current - count;
  if (remaining <= 0) {
    delete next[key];
  } else {
    next[key] = remaining;
  }
  return next;
}

/** 複数アイテムをまとめて消費する。1つでも不足していれば何も変更せず null を返す。 */
export function removeItems(inv: InventoryData, requirements: ReadonlyArray<{ key: string; count: number }>): InventoryData | null {
  for (const req of requirements) {
    if (!hasAtLeast(inv, req.key, req.count)) return null;
  }
  let next = inv;
  for (const req of requirements) {
    const result = removeItem(next, req.key, req.count);
    if (!result) return null;
    next = result;
  }
  return next;
}

/** インベントリ内の総アイテム種類数 (空でないもの)。 */
export function nonEmptyEntries(inv: InventoryData): Array<[string, number]> {
  return Object.entries(inv).filter(([, count]) => count > 0);
}

export function isEmpty(inv: InventoryData): boolean {
  return nonEmptyEntries(inv).length === 0;
}

/** 不正なデータ (負数/NaN等) を除去した安全なコピーを返す。セーブ読み込み時の検証に使う。 */
export function sanitizeInventory(raw: unknown): InventoryData {
  const out: InventoryData = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== "string" || key.length === 0) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) continue;
    out[key] = value;
  }
  return out;
}
