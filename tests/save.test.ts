import { describe, expect, it } from "vitest";
import {
  SAVE_SCHEMA_VERSION,
  MAX_PERSISTED_ENTITY_ID,
  SaveValidationError,
  createEmptyProgress,
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
import type { EntityRuntime } from "../src/core/entityAI";

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

  it("死亡地点に残した持ち物を保存して読み戻せる (deathDrops リスト形式)", () => {
    const save = createEmptyWorldSave({ id: "death-drop", name: "n", seedText: "s", seed: 1, now: 1, gameMode: "survival" });
    save.deathDrops = [
      {
        id: "drop-1",
        position: { x: 12, y: 34, z: -5 },
        inventory: { stone: 4, cooked_meat: 2 },
        createdAt: 1000
      }
    ];
    const migrated = validateAndMigrateWorldSave(JSON.parse(serializeWorldToJson(save)));
    expect(migrated.deathDrops).toEqual(save.deathDrops);
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

describe("Phase 4: progress / lootedTreasures の移行", () => {
  it("新規ワールドは未達成状態のprogressと空のlootedTreasuresを持つ", () => {
    const save = createEmptyWorldSave({ id: "p1", name: "n", seedText: "s", seed: 1, now: 1 });
    expect(save.progress).toEqual(createEmptyProgress());
    expect(save.lootedTreasures).toEqual([]);
  });

  it("progress/lootedTreasuresが欠けている既存セーブ (Phase 4以前) はデフォルトへ移行される", () => {
    const legacy = {
      version: 2,
      id: "legacy-progress",
      name: "旧ワールド",
      seedText: "legacy-progress",
      seed: 5,
      createdAt: 1,
      updatedAt: 2,
      gameMode: "creative",
      player: { x: 0, y: 41, z: 0, yaw: 0, pitch: 0, cameraMode: "first", movementMode: "walk", health: 10, hunger: 10, equippedWeapon: "fist" },
      quickbar: [],
      inventory: {},
      spawnPoint: { x: 0, y: 40, z: 0 },
      bedPosition: null,
      deathDrop: null,
      timeOfDaySeconds: 0,
      terrainGeneratorVersion: CURRENT_TERRAIN_GENERATOR_VERSION,
      edits: []
      // progress / lootedTreasures は意図的に含めない
    };
    const migrated = validateAndMigrateWorldSave(legacy);
    expect(migrated.progress).toEqual(createEmptyProgress());
    expect(migrated.lootedTreasures).toEqual([]);
  });

  it("進捗データを含めて往復しても内容が保持される", () => {
    const save = createEmptyWorldSave({ id: "p2", name: "n", seedText: "s", seed: 1, now: 1 });
    save.progress = {
      placedBlocksCount: 42,
      craftedItemsCount: 3,
      defeatedHostilesCount: 2,
      openedTreasureCount: 1,
      discoveredBiomes: ["grassland", "ocean"],
      caveDiscovered: true,
      circuitPoweredEver: true,
      unlockedAchievements: ["first_block_placed", "first_ruin_treasure"]
    };
    save.lootedTreasures = ["3,20,-4", "-10,15,7"];
    const migrated = validateAndMigrateWorldSave(JSON.parse(serializeWorldToJson(save)));
    expect(migrated.progress).toEqual(save.progress);
    expect(migrated.lootedTreasures).toEqual(save.lootedTreasures);
  });

  it("discoveredBiomesに未知のバイオームIDが含まれると拒否する", () => {
    const save = createEmptyWorldSave({ id: "p3", name: "n", seedText: "s", seed: 1, now: 1 });
    (save.progress as { discoveredBiomes: string[] }).discoveredBiomes = ["not-a-biome"];
    expect(() => validateAndMigrateWorldSave(save)).toThrow(SaveValidationError);
  });

  it("unlockedAchievementsに未知の実績IDが含まれると拒否する", () => {
    const save = createEmptyWorldSave({ id: "p4", name: "n", seedText: "s", seed: 1, now: 1 });
    (save.progress as { unlockedAchievements: string[] }).unlockedAchievements = ["no-such-achievement"];
    expect(() => validateAndMigrateWorldSave(save)).toThrow(SaveValidationError);
  });

  it("設置ブロック数などが負数/非整数だと拒否する", () => {
    const save = createEmptyWorldSave({ id: "p5", name: "n", seedText: "s", seed: 1, now: 1 });
    (save.progress as { placedBlocksCount: number }).placedBlocksCount = -1;
    expect(() => validateAndMigrateWorldSave(save)).toThrow(SaveValidationError);

    const save2 = createEmptyWorldSave({ id: "p6", name: "n", seedText: "s", seed: 1, now: 1 });
    (save2.progress as { placedBlocksCount: number }).placedBlocksCount = 1.5;
    expect(() => validateAndMigrateWorldSave(save2)).toThrow(SaveValidationError);
  });

  it("lootedTreasuresに不正な座標形式が含まれると拒否する", () => {
    const save = createEmptyWorldSave({ id: "p7", name: "n", seedText: "s", seed: 1, now: 1 });
    (save as { lootedTreasures: string[] }).lootedTreasures = ["not-a-coordinate"];
    expect(() => validateAndMigrateWorldSave(save)).toThrow(SaveValidationError);
  });

  it("progressが不正な型 (配列や文字列) だと拒否する", () => {
    const save = createEmptyWorldSave({ id: "p8", name: "n", seedText: "s", seed: 1, now: 1 });
    expect(() => validateAndMigrateWorldSave({ ...save, progress: [] })).toThrow(SaveValidationError);
    expect(() => validateAndMigrateWorldSave({ ...save, progress: "bad" })).toThrow(SaveValidationError);
  });
});

describe("Phase 5: deathDrops (死亡ドロップのリスト化と移行)", () => {
  it("新規ワールドは空のdeathDropsを持つ", () => {
    const save = createEmptyWorldSave({ id: "dd1", name: "n", seedText: "s", seed: 1, now: 1 });
    expect(save.deathDrops).toEqual([]);
  });

  it("v4以前(Phase4以前)の単一deathDrop形式を、中身を失わずdeathDropsリストへ移行する", () => {
    const save = createEmptyWorldSave({ id: "dd2", name: "n", seedText: "s", seed: 1, now: 1, gameMode: "survival" });
    const legacy = {
      ...save,
      deathDrops: undefined,
      deathDrop: { position: { x: 1, y: 2, z: 3 }, inventory: { stone: 5 } }
    };
    delete (legacy as { deathDrops?: unknown }).deathDrops;
    const migrated = validateAndMigrateWorldSave(legacy);
    expect(migrated.deathDrops).toHaveLength(1);
    expect(migrated.deathDrops[0]?.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(migrated.deathDrops[0]?.inventory).toEqual({ stone: 5 });
    expect(migrated.deathDrops[0]?.id).toBe("legacy-death-drop");
  });

  it("deathDropsが上限件数を超えていると拒否する", () => {
    const save = createEmptyWorldSave({ id: "dd3", name: "n", seedText: "s", seed: 1, now: 1, gameMode: "survival" });
    save.deathDrops = Array.from({ length: 11 }, (_, i) => ({
      id: `drop-${i}`,
      position: { x: i, y: 0, z: 0 },
      inventory: {},
      createdAt: i
    }));
    expect(() => validateAndMigrateWorldSave(save)).toThrow(SaveValidationError);
  });

  it("deathDrops内でIDが重複していると拒否する", () => {
    const save = createEmptyWorldSave({ id: "dd4", name: "n", seedText: "s", seed: 1, now: 1, gameMode: "survival" });
    save.deathDrops = [
      { id: "dup", position: { x: 0, y: 0, z: 0 }, inventory: {}, createdAt: 1 },
      { id: "dup", position: { x: 1, y: 0, z: 0 }, inventory: {}, createdAt: 2 }
    ];
    expect(() => validateAndMigrateWorldSave(save)).toThrow(SaveValidationError);
  });

  it("deathDropsが配列でないと拒否する", () => {
    const save = createEmptyWorldSave({ id: "dd5", name: "n", seedText: "s", seed: 1, now: 1 });
    expect(() => validateAndMigrateWorldSave({ ...save, deathDrops: "bad" })).toThrow(SaveValidationError);
  });

  it("deathDropsのインベントリに未知のアイテムキーが含まれると拒否する", () => {
    const save = createEmptyWorldSave({ id: "dd6", name: "n", seedText: "s", seed: 1, now: 1 });
    save.deathDrops = [
      { id: "d1", position: { x: 0, y: 0, z: 0 }, inventory: { no_such_item: 1 }, createdAt: 1 }
    ];
    expect(() => validateAndMigrateWorldSave(save)).toThrow(SaveValidationError);
  });
});

describe("Phase 5: entities (生存生物のスナップショット永続化)", () => {
  const baseEntity: EntityRuntime = {
    id: 1,
    kind: "sheep",
    x: 1.5,
    y: 40,
    z: -2.5,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0.2,
    hp: 8,
    state: "wander",
    stateTimer: 1.2,
    attackCooldownTimer: 0,
    breedCooldown: 0
  };

  it("新規ワールドは空のentitiesを持つ", () => {
    const save = createEmptyWorldSave({ id: "e1", name: "n", seedText: "s", seed: 1, now: 1 });
    expect(save.entities).toEqual([]);
  });

  it("entitiesが欠けている既存セーブ (Phase 5より前) は空配列へ移行し、通常のスポーンに任せる", () => {
    const save = createEmptyWorldSave({ id: "e2", name: "n", seedText: "s", seed: 1, now: 1 });
    const legacy = { ...save };
    delete (legacy as { entities?: unknown }).entities;
    const migrated = validateAndMigrateWorldSave(legacy);
    expect(migrated.entities).toEqual([]);
  });

  it("有効な生物データを保存して往復できる", () => {
    const save = createEmptyWorldSave({ id: "e3", name: "n", seedText: "s", seed: 1, now: 1 });
    save.entities = [{ ...baseEntity }];
    const migrated = validateAndMigrateWorldSave(JSON.parse(serializeWorldToJson(save)));
    expect(migrated.entities).toEqual(save.entities);
  });

  it("未知の生物種類は拒否する", () => {
    const save = createEmptyWorldSave({ id: "e4", name: "n", seedText: "s", seed: 1, now: 1 });
    save.entities = [{ ...baseEntity, kind: "dragon" }] as unknown as typeof save.entities;
    expect(() => validateAndMigrateWorldSave(save)).toThrow(SaveValidationError);
  });

  it("座標が非有限(NaN/Infinity)だと拒否する", () => {
    const save = createEmptyWorldSave({ id: "e5", name: "n", seedText: "s", seed: 1, now: 1 });
    save.entities = [{ ...baseEntity, x: Number.NaN }];
    expect(() => validateAndMigrateWorldSave(save)).toThrow(SaveValidationError);

    const save2 = createEmptyWorldSave({ id: "e6", name: "n", seedText: "s", seed: 1, now: 1 });
    save2.entities = [{ ...baseEntity, y: Number.POSITIVE_INFINITY }];
    expect(() => validateAndMigrateWorldSave(save2)).toThrow(SaveValidationError);
  });

  it("座標が異常に大きい (境界超過) と拒否する", () => {
    const save = createEmptyWorldSave({ id: "e7", name: "n", seedText: "s", seed: 1, now: 1 });
    save.entities = [{ ...baseEntity, x: 10_000_000 }];
    expect(() => validateAndMigrateWorldSave(save)).toThrow(SaveValidationError);
  });

  it("安全に次IDを採番できないほど大きな生物IDは拒否する", () => {
    const save = createEmptyWorldSave({ id: "e-id", name: "n", seedText: "s", seed: 1, now: 1 });
    save.entities = [{ ...baseEntity, id: MAX_PERSISTED_ENTITY_ID + 1 }];
    expect(() => validateAndMigrateWorldSave(save)).toThrow(SaveValidationError);
  });

  it("HPが種類ごとの最大HPを超えていると拒否する", () => {
    const save = createEmptyWorldSave({ id: "e8", name: "n", seedText: "s", seed: 1, now: 1 });
    save.entities = [{ ...baseEntity, hp: 999 }]; // sheep の maxHp は 8
    expect(() => validateAndMigrateWorldSave(save)).toThrow(SaveValidationError);
  });

  it("state が不正 (未知の文字列、または保存されないはずの'dead') だと拒否する", () => {
    const save = createEmptyWorldSave({ id: "e9", name: "n", seedText: "s", seed: 1, now: 1 });
    save.entities = [{ ...baseEntity, state: "confused" }] as unknown as typeof save.entities;
    expect(() => validateAndMigrateWorldSave(save)).toThrow(SaveValidationError);

    const save2 = createEmptyWorldSave({ id: "e10", name: "n", seedText: "s", seed: 1, now: 1 });
    save2.entities = [{ ...baseEntity, state: "dead" }] as unknown as typeof save2.entities;
    expect(() => validateAndMigrateWorldSave(save2)).toThrow(SaveValidationError);
  });

  it("保存できる生物数の上限を超えていると拒否する (悪意ある/壊れたインポート対策)", () => {
    const save = createEmptyWorldSave({ id: "e11", name: "n", seedText: "s", seed: 1, now: 1 });
    save.entities = Array.from({ length: 65 }, (_, i) => ({ ...baseEntity, id: i + 1 }));
    expect(() => validateAndMigrateWorldSave(save)).toThrow(SaveValidationError);
  });

  it("生物IDが重複していると拒否する", () => {
    const save = createEmptyWorldSave({ id: "e12", name: "n", seedText: "s", seed: 1, now: 1 });
    save.entities = [{ ...baseEntity, id: 1 }, { ...baseEntity, id: 1 }];
    expect(() => validateAndMigrateWorldSave(save)).toThrow(SaveValidationError);
  });

  it("entitiesが配列でないと拒否する", () => {
    const save = createEmptyWorldSave({ id: "e13", name: "n", seedText: "s", seed: 1, now: 1 });
    expect(() => validateAndMigrateWorldSave({ ...save, entities: "bad" })).toThrow(SaveValidationError);
  });
});
