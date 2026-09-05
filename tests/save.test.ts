import { describe, expect, it } from "vitest";
import {
  SAVE_SCHEMA_VERSION,
  SaveValidationError,
  createEmptyWorldSave,
  editsMapToPlain,
  parseWorldFromJson,
  serializeWorldToJson,
  validateAndMigrateWorldSave
} from "../src/core/save";
import { World } from "../src/core/world";
import { getBlockDefByKey } from "../src/core/blocks";
import { hashStringToInt } from "../src/core/rng";
import { MAX_HEALTH, MAX_HUNGER } from "../src/core/survival";
import { CURRENT_TERRAIN_GENERATOR_VERSION, TERRAIN_GENERATOR_VERSION_LEGACY, generateChunk } from "../src/core/terrain";

describe("createEmptyWorldSave", () => {
  it("現在のスキーマバージョンを持つ", () => {
    const save = createEmptyWorldSave({ id: "id1", name: "テスト", seedText: "abc", seed: 1, now: 123 });
    expect(save.version).toBe(SAVE_SCHEMA_VERSION);
  });
});

describe("serialize/parse 往復", () => {
  it("JSON化して読み戻すと同じデータになる", () => {
    const save = createEmptyWorldSave({ id: "id2", name: "村", seedText: "seed", seed: 42, now: 1000 });
    save.quickbar = [1, 2, 3];
    const json = serializeWorldToJson(save);
    const parsed = parseWorldFromJson(json);
    expect(parsed).toEqual(save);
  });

  it("ワールドの編集内容を含めて往復できる", () => {
    const world = new World(hashStringToInt("save-world"), "save-world");
    const stone = getBlockDefByKey("stone").id;
    world.setBlock(3, 30, 4, stone);
    const save = createEmptyWorldSave({ id: "id3", name: "保存テスト", seedText: "save-world", seed: world.seed, now: 1 });
    save.edits = editsMapToPlain(world.getAllEdits());

    const json = serializeWorldToJson(save);
    const parsed = parseWorldFromJson(json);

    const world2 = new World(parsed.seed, parsed.seedText);
    world2.loadEdits(parsed.edits);
    expect(world2.getBlockId(3, 30, 4)).toBe(stone);
  });
});

describe("validateAndMigrateWorldSave", () => {
  it("不正なデータ (オブジェクトでない) は例外を投げる", () => {
    expect(() => validateAndMigrateWorldSave(null)).toThrow(SaveValidationError);
    expect(() => validateAndMigrateWorldSave("string")).toThrow(SaveValidationError);
  });

  it("必須フィールドが欠けていると例外を投げる", () => {
    expect(() => validateAndMigrateWorldSave({})).toThrow(SaveValidationError);
  });

  it("未来のバージョンは読み込めない", () => {
    const save = createEmptyWorldSave({ id: "id4", name: "future", seedText: "x", seed: 1, now: 1 });
    const future = { ...save, version: SAVE_SCHEMA_VERSION + 1 };
    expect(() => validateAndMigrateWorldSave(future)).toThrow(SaveValidationError);
  });

  it("壊れたJSON文字列はparseWorldFromJsonで例外を投げる", () => {
    expect(() => parseWorldFromJson("{ not valid json")).toThrow(SaveValidationError);
  });

  it("cameraMode/movementModeの不正値はデフォルトへフォールバックする", () => {
    const save = createEmptyWorldSave({ id: "id5", name: "n", seedText: "s", seed: 1, now: 1 });
    const raw = JSON.parse(serializeWorldToJson(save)) as Record<string, unknown>;
    (raw.player as Record<string, unknown>).cameraMode = "invalid";
    const parsed = validateAndMigrateWorldSave(raw);
    expect(parsed.player.cameraMode).toBe("first");
  });

  it("未定義のブロックIDを含むクイックバーは拒否する", () => {
    const save = createEmptyWorldSave({ id: "id6", name: "n", seedText: "s", seed: 1, now: 1 });
    save.quickbar = [999];
    expect(() => validateAndMigrateWorldSave(save)).toThrow(SaveValidationError);
  });

  it("未定義のブロックIDや範囲外インデックスを含む編集は拒否する", () => {
    const save = createEmptyWorldSave({ id: "id7", name: "n", seedText: "s", seed: 1, now: 1 });
    save.edits = [["0,0", [{ index: 0, id: 999, facing: 0, open: false }]]];
    expect(() => validateAndMigrateWorldSave(save)).toThrow(SaveValidationError);

    save.edits = [["0,0", [{ index: -1, id: 1, facing: 0, open: false }]]];
    expect(() => validateAndMigrateWorldSave(save)).toThrow(SaveValidationError);
  });
});

describe("schema v1 -> v2 移行", () => {
  /** Phase 1 (schema v1) 相当の生データ。gameMode/inventory/spawnPoint/bedPosition/
   * timeOfDaySeconds/player.health/hunger/equippedWeapon はまだ存在しない。 */
  function legacyV1Save(): Record<string, unknown> {
    return {
      version: 1,
      id: "legacy-1",
      name: "旧ワールド",
      seedText: "legacy",
      seed: 7,
      createdAt: 1000,
      updatedAt: 2000,
      player: { x: 1, y: 41, z: 2, yaw: 0.5, pitch: 0, cameraMode: "first", movementMode: "walk" },
      quickbar: [1, 2, 3],
      edits: []
    };
  }

  it("v1データはエラーにならず正常に移行できる", () => {
    expect(() => validateAndMigrateWorldSave(legacyV1Save())).not.toThrow();
  });

  it("v1データは gameMode が欠けているのでクリエイティブへデフォルトされる", () => {
    const migrated = validateAndMigrateWorldSave(legacyV1Save());
    expect(migrated.gameMode).toBe("creative");
  });

  it("v1データは version が現在のスキーマバージョンへ更新される", () => {
    const migrated = validateAndMigrateWorldSave(legacyV1Save());
    expect(migrated.version).toBe(SAVE_SCHEMA_VERSION);
  });

  it("v1データは体力/空腹が満タンにデフォルトされる", () => {
    const migrated = validateAndMigrateWorldSave(legacyV1Save());
    expect(migrated.player.health).toBe(MAX_HEALTH);
    expect(migrated.player.hunger).toBe(MAX_HUNGER);
    expect(migrated.player.equippedWeapon).toBe("fist");
  });

  it("v1データは空のインベントリへデフォルトされる", () => {
    const migrated = validateAndMigrateWorldSave(legacyV1Save());
    expect(migrated.inventory).toEqual({});
  });

  it("v1データはプレイヤー直下が復活地点になり、ベッドは未設定になる", () => {
    const migrated = validateAndMigrateWorldSave(legacyV1Save());
    expect(migrated.spawnPoint).toEqual({ x: 1, y: 40, z: 2 });
    expect(migrated.bedPosition).toBeNull();
  });

  it("v1データは既存のプレイヤー座標/クイックバー/編集内容を保持する", () => {
    const migrated = validateAndMigrateWorldSave(legacyV1Save());
    expect(migrated.player.x).toBe(1);
    expect(migrated.player.yaw).toBe(0.5);
    expect(migrated.quickbar).toEqual([1, 2, 3]);
  });

  it("v1データは昼夜サイクルの経過時間が既定値 (朝) にデフォルトされる", () => {
    const migrated = validateAndMigrateWorldSave(legacyV1Save());
    expect(migrated.timeOfDaySeconds).toBeGreaterThanOrEqual(0);
  });

  it("v2として作成した新規ワールドはそのまま (再移行しても) 変化しない", () => {
    const save = createEmptyWorldSave({ id: "id8", name: "n", seedText: "s", seed: 1, now: 1, gameMode: "survival" });
    const migrated = validateAndMigrateWorldSave(JSON.parse(serializeWorldToJson(save)));
    expect(migrated).toEqual(save);
  });

  it("死亡地点に残した持ち物を保存して読み戻せる", () => {
    const save = createEmptyWorldSave({ id: "death-drop", name: "n", seedText: "s", seed: 1, now: 1, gameMode: "survival" });
    save.deathDrop = {
      position: { x: 12, y: 34, z: -5 },
      inventory: { stone: 4, cooked_meat: 2 }
    };
    const migrated = validateAndMigrateWorldSave(JSON.parse(serializeWorldToJson(save)));
    expect(migrated.deathDrop).toEqual(save.deathDrop);
  });

  it("インベントリに未知のアイテムキーが含まれると拒否する", () => {
    const save = createEmptyWorldSave({ id: "id9", name: "n", seedText: "s", seed: 1, now: 1 });
    (save as unknown as { inventory: Record<string, number> }).inventory = { no_such_item: 3 };
    expect(() => validateAndMigrateWorldSave(save)).toThrow(SaveValidationError);
  });

  it("インベントリの個数が負数/非整数だと拒否する", () => {
    const save = createEmptyWorldSave({ id: "id10", name: "n", seedText: "s", seed: 1, now: 1 });
    (save as unknown as { inventory: Record<string, number> }).inventory = { stick: -1 };
    expect(() => validateAndMigrateWorldSave(save)).toThrow(SaveValidationError);
  });
});

describe("terrainGeneratorVersion (Phase 3 地形ジェネレーター世代)", () => {
  it("新規ワールドは常に最新の地形ジェネレーターバージョンを持つ", () => {
    const save = createEmptyWorldSave({ id: "gen1", name: "n", seedText: "s", seed: 1, now: 1 });
    expect(save.terrainGeneratorVersion).toBe(CURRENT_TERRAIN_GENERATOR_VERSION);
  });

  it("terrainGeneratorVersionが欠けている既存セーブ (Phase 3以前) は従来地形(v1)へ移行される", () => {
    const legacy = {
      version: 1,
      id: "legacy-gen",
      name: "旧ワールド",
      seedText: "legacy-gen",
      seed: 9,
      createdAt: 1,
      updatedAt: 2,
      player: { x: 0, y: 41, z: 0, yaw: 0, pitch: 0, cameraMode: "first", movementMode: "walk" },
      quickbar: [],
      edits: []
      // terrainGeneratorVersion は意図的に含めない
    };
    const migrated = validateAndMigrateWorldSave(legacy);
    expect(migrated.terrainGeneratorVersion).toBe(TERRAIN_GENERATOR_VERSION_LEGACY);
  });

  it("既に新しい地形ジェネレーターバージョンを持つセーブはそのまま保持される (往復で変化しない)", () => {
    const save = createEmptyWorldSave({ id: "gen2", name: "n", seedText: "s", seed: 1, now: 1 });
    const migrated = validateAndMigrateWorldSave(JSON.parse(serializeWorldToJson(save)));
    expect(migrated.terrainGeneratorVersion).toBe(CURRENT_TERRAIN_GENERATOR_VERSION);
    expect(migrated).toEqual(save);
  });

  it("将来のクライアントでのみ作られた不明に大きい地形ジェネレーターバージョンは拒否する", () => {
    const save = createEmptyWorldSave({ id: "gen3", name: "n", seedText: "s", seed: 1, now: 1 });
    const future = { ...save, terrainGeneratorVersion: CURRENT_TERRAIN_GENERATOR_VERSION + 1 };
    expect(() => validateAndMigrateWorldSave(future)).toThrow(SaveValidationError);
  });

  it("不正な値 (文字列や負の数) の地形ジェネレーターバージョンは拒否する", () => {
    const save = createEmptyWorldSave({ id: "gen4", name: "n", seedText: "s", seed: 1, now: 1 });
    expect(() => validateAndMigrateWorldSave({ ...save, terrainGeneratorVersion: "two" })).toThrow(SaveValidationError);
    expect(() => validateAndMigrateWorldSave({ ...save, terrainGeneratorVersion: -1 })).toThrow(SaveValidationError);
  });

  it("旧ワールド(v1地形)を読み込んでWorldを作ると、Phase 3以前と同じ地形がそのまま再現される", () => {
    const legacySave = createEmptyWorldSave({
      id: "gen5",
      name: "n",
      seedText: "legacy-terrain",
      seed: 123,
      now: 1
    });
    legacySave.terrainGeneratorVersion = TERRAIN_GENERATOR_VERSION_LEGACY;

    const world = new World(legacySave.seed, legacySave.seedText, legacySave.terrainGeneratorVersion);
    const legacyChunk = generateChunk(legacySave.seed, 0, 0, TERRAIN_GENERATOR_VERSION_LEGACY);
    const worldChunk = world.ensureChunk(0, 0);
    expect(Array.from(worldChunk.ids)).toEqual(Array.from(legacyChunk.ids));
  });
});
