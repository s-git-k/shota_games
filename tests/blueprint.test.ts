import { describe, expect, it } from "vitest";
import {
  BLUEPRINT_SCHEMA_VERSION,
  BlueprintValidationError,
  createBlueprintRecord,
  parseBlueprintFromJson,
  serializeBlueprintToJson,
  validateAndMigrateBlueprint,
  validateBlueprintName
} from "../src/core/blueprint";
import { MAX_SELECTION_VOLUME, type Clipboard } from "../src/core/selection";

function sampleClipboard(): Clipboard {
  return {
    sizeX: 2,
    sizeY: 1,
    sizeZ: 2,
    cells: [
      { dx: 0, dy: 0, dz: 0, id: 1, facing: 0, open: false },
      { dx: 1, dy: 0, dz: 0, id: 2, facing: 1, open: false },
      { dx: 0, dy: 0, dz: 1, id: 27, facing: 2, open: true } // door (openable)
    ]
  };
}

describe("validateBlueprintName", () => {
  it("前後の空白を除去する", () => {
    expect(validateBlueprintName("  お城  ")).toBe("お城");
  });

  it("空文字は拒否する", () => {
    expect(() => validateBlueprintName("   ")).toThrow(BlueprintValidationError);
  });

  it("41文字以上は拒否する", () => {
    expect(() => validateBlueprintName("あ".repeat(41))).toThrow(BlueprintValidationError);
  });

  it("40文字ちょうどは許可する", () => {
    expect(validateBlueprintName("あ".repeat(40)).length).toBe(40);
  });
});

describe("createBlueprintRecord", () => {
  it("現在のスキーマバージョンで作成する", () => {
    const record = createBlueprintRecord({ id: "bp1", name: "小屋", clipboard: sampleClipboard(), now: 1000 });
    expect(record.version).toBe(BLUEPRINT_SCHEMA_VERSION);
    expect(record.name).toBe("小屋");
    expect(record.createdAt).toBe(1000);
    expect(record.updatedAt).toBe(1000);
    expect(record.clipboard).toEqual(sampleClipboard());
  });
});

describe("validateAndMigrateBlueprint / シリアライズ往復", () => {
  it("JSONへシリアライズしてから読み戻しても内容が保持される", () => {
    const record = createBlueprintRecord({ id: "bp2", name: "塔", clipboard: sampleClipboard(), now: 5000 });
    const json = serializeBlueprintToJson(record);
    const parsed = parseBlueprintFromJson(json);
    expect(parsed).toEqual(record);
  });

  it("オブジェクトでない入力は拒否する", () => {
    expect(() => validateAndMigrateBlueprint(null)).toThrow(BlueprintValidationError);
    expect(() => validateAndMigrateBlueprint("bad")).toThrow(BlueprintValidationError);
    expect(() => validateAndMigrateBlueprint(42)).toThrow(BlueprintValidationError);
  });

  it("将来バージョンの設計図は拒否する", () => {
    const record = createBlueprintRecord({ id: "bp3", name: "未来", clipboard: sampleClipboard(), now: 1 });
    expect(() => validateAndMigrateBlueprint({ ...record, version: BLUEPRINT_SCHEMA_VERSION + 1 })).toThrow(
      BlueprintValidationError
    );
  });

  it("IDが欠けている/空だと拒否する", () => {
    const record = createBlueprintRecord({ id: "bp4", name: "名前", clipboard: sampleClipboard(), now: 1 });
    expect(() => validateAndMigrateBlueprint({ ...record, id: "" })).toThrow(BlueprintValidationError);
    expect(() => validateAndMigrateBlueprint({ ...record, id: undefined })).toThrow(BlueprintValidationError);
  });

  it("名前が空だと拒否する", () => {
    const record = createBlueprintRecord({ id: "bp5", name: "名前", clipboard: sampleClipboard(), now: 1 });
    expect(() => validateAndMigrateBlueprint({ ...record, name: "" })).toThrow(BlueprintValidationError);
  });

  it("タイムスタンプが不正だと拒否する", () => {
    const record = createBlueprintRecord({ id: "bp6", name: "名前", clipboard: sampleClipboard(), now: 1 });
    expect(() => validateAndMigrateBlueprint({ ...record, createdAt: "yesterday" })).toThrow(BlueprintValidationError);
  });

  it("JSONとして壊れているテキストは拒否する", () => {
    expect(() => parseBlueprintFromJson("{ not json")).toThrow(BlueprintValidationError);
  });
});

describe("validateAndMigrateBlueprint: クリップボードの検証", () => {
  it("寸法が0以下/非整数だと拒否する", () => {
    const record = createBlueprintRecord({ id: "c1", name: "名前", clipboard: sampleClipboard(), now: 1 });
    expect(() =>
      validateAndMigrateBlueprint({ ...record, clipboard: { ...record.clipboard, sizeX: 0 } })
    ).toThrow(BlueprintValidationError);
    expect(() =>
      validateAndMigrateBlueprint({ ...record, clipboard: { ...record.clipboard, sizeY: 1.5 } })
    ).toThrow(BlueprintValidationError);
  });

  it("体積が上限を超える場合は拒否する", () => {
    const record = createBlueprintRecord({ id: "c2", name: "名前", clipboard: sampleClipboard(), now: 1 });
    const huge = { ...record.clipboard, sizeX: 1000, sizeY: 1000, sizeZ: 1000, cells: [] };
    expect(huge.sizeX * huge.sizeY * huge.sizeZ).toBeGreaterThan(MAX_SELECTION_VOLUME);
    expect(() => validateAndMigrateBlueprint({ ...record, clipboard: huge })).toThrow(BlueprintValidationError);
  });

  it("セルが配列でない場合は拒否する", () => {
    const record = createBlueprintRecord({ id: "c3", name: "名前", clipboard: sampleClipboard(), now: 1 });
    expect(() =>
      validateAndMigrateBlueprint({ ...record, clipboard: { ...record.clipboard, cells: {} } })
    ).toThrow(BlueprintValidationError);
  });

  it("セル座標が寸法範囲外だと拒否する", () => {
    const record = createBlueprintRecord({ id: "c4", name: "名前", clipboard: sampleClipboard(), now: 1 });
    const bad = { ...record.clipboard, cells: [{ dx: 5, dy: 0, dz: 0, id: 1, facing: 0, open: false }] };
    expect(() => validateAndMigrateBlueprint({ ...record, clipboard: bad })).toThrow(BlueprintValidationError);
  });

  it("未知のブロックIDは拒否する", () => {
    const record = createBlueprintRecord({ id: "c5", name: "名前", clipboard: sampleClipboard(), now: 1 });
    const bad = { ...record.clipboard, cells: [{ dx: 0, dy: 0, dz: 0, id: 9999, facing: 0, open: false }] };
    expect(() => validateAndMigrateBlueprint({ ...record, clipboard: bad })).toThrow(BlueprintValidationError);
  });

  it("facingが0〜3の範囲外だと拒否する", () => {
    const record = createBlueprintRecord({ id: "c6", name: "名前", clipboard: sampleClipboard(), now: 1 });
    const bad = { ...record.clipboard, cells: [{ dx: 0, dy: 0, dz: 0, id: 1, facing: 4, open: false }] };
    expect(() => validateAndMigrateBlueprint({ ...record, clipboard: bad })).toThrow(BlueprintValidationError);
  });

  it("同じ座標が重複するセルはUndoを壊すため拒否する", () => {
    const record = createBlueprintRecord({ id: "c-dup", name: "重複", clipboard: sampleClipboard(), now: 1 });
    const duplicate = {
      ...record.clipboard,
      cells: [
        { dx: 0, dy: 0, dz: 0, id: 1, facing: 0, open: false },
        { dx: 0, dy: 0, dz: 0, id: 2, facing: 0, open: false }
      ]
    };
    expect(() => validateAndMigrateBlueprint({ ...record, clipboard: duplicate })).toThrow(BlueprintValidationError);
  });

  it("openが欠けている場合はfalse扱いになる (寛容なデフォルト)", () => {
    const record = createBlueprintRecord({ id: "c7", name: "名前", clipboard: sampleClipboard(), now: 1 });
    const lenient = { ...record.clipboard, cells: [{ dx: 0, dy: 0, dz: 0, id: 1, facing: 0 }] };
    const migrated = validateAndMigrateBlueprint({ ...record, clipboard: lenient });
    expect(migrated.clipboard.cells[0]?.open).toBe(false);
  });
});
