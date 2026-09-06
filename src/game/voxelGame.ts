/**
 * ゲーム本体: World/描画/プレイヤー/入力/履歴/選択/音声/UIを結びつけるメインループ。
 */
import * as THREE from "three";
import { AIR_ID, getBlockDef, getBlockDefByKey, isValidBlockKey } from "../core/blocks";
import type { AvatarConfig } from "../core/avatar";
import { DEFAULT_AVATAR } from "../core/avatar";
import type { BlockChange } from "../core/history";
import { History } from "../core/history";
import {
  boundsVolume,
  copySelection,
  mirrorClipboardX,
  mirrorClipboardZ,
  pasteClipboard,
  rotateClipboardY,
  Selection,
  SelectionTooLargeError,
  type Clipboard
} from "../core/selection";
import { editsMapToPlain, type EquippedWeapon, type ProgressSaveData, type WorldSaveData } from "../core/save";
import type { GameSettings } from "../core/settings";
import { World } from "../core/world";
import type { Facing, Vec3Int } from "../core/types";
import {
  generateId,
  loadTutorialChecklistState,
  saveAvatar,
  saveBlueprint,
  saveSettings,
  saveTutorialChecklistState,
  saveWorld
} from "../core/storage";
import { addDeathDrop, findNearestPickupableDrop, removeDeathDrop, MAX_DEATH_DROPS, type DeathDropEntry } from "../core/deathDrops";
import { createBlueprintRecord, type BlueprintRecord } from "../core/blueprint";
import { rollRuinTreasureLoot } from "../core/treasure";
import { computeNewlyUnlocked } from "../core/achievements";
import type { GameMode } from "../core/gameMode";
import {
  applyDamage,
  applyFallDamage,
  createInitialSurvivalStats,
  feed,
  heal,
  isAlive,
  MAX_HEALTH,
  MAX_HUNGER,
  tickSurvival,
  type SurvivalStats
} from "../core/survival";
import { addItem, createEmptyInventory, hasAtLeast, removeItem, type InventoryData } from "../core/inventory";
import { craftItem, displayNameForKey } from "../core/crafting";
import { getItemDef, isConsumableFood, isMedicine, isValidItemKey } from "../core/items";
import {
  formatTimeLabel,
  getAmbientIntensity,
  getSkyColors,
  getSunIntensity,
  getTimeOfDay,
  isNight,
  UNDERGROUND_Y_THRESHOLD
} from "../core/dayNight";
import { recomputeCircuitNear } from "../core/circuit";
import { getEntityDef, type EntityKind } from "../core/entities";
import { findNearestLandPosition, getBiomeAt, BIOME_LABELS_JA, type Biome } from "../core/biome";
import { resolveWeatherKind, getWeatherIntensity, getWeatherLabelJa } from "../core/weather";
import { TERRAIN_GENERATOR_VERSION_BIOMES } from "../core/terrain";

import { createSceneSetup, resizeToWindow, type SceneSetup } from "../render/sceneSetup";
import { WorldRenderer } from "../render/worldRenderer";
import { buildCharacter, animateWalk, type CharacterParts } from "../render/character";
import { updateCamera } from "../render/cameraRig";
import { WeatherEffects } from "../render/weatherEffects";
import {
  createBlockHighlight,
  positionBlockHighlight,
  createSelectionHighlight,
  positionSelectionHighlight
} from "../render/highlight";

import { PlayerController, PLAYER_HEIGHT, PLAYER_WIDTH } from "./player";
import type { MoveInput } from "./player";
import { raycastVoxels, type RaycastHit } from "./raycast";
import { EntitySystem } from "./entitySystem";

import { InputManager } from "../input/inputManager";
import { TouchControls, isTouchCapable } from "../ui/touchControls";
import { AudioEngine } from "../audio/audioEngine";
import { Hud } from "../ui/hud";
import { openInventoryPanel } from "../ui/inventoryPanel";
import { openSurvivalPanel } from "../ui/survivalPanel";
import { showDeathScreen } from "../ui/deathScreen";
import { openSettingsPanel } from "../ui/settingsPanel";
import { openPauseMenu } from "../ui/pauseMenu";
import { openAvatarCreator } from "../ui/avatarCreator";
import { showHelpOverlay } from "../ui/onboarding";
import { openBuildMenu } from "../ui/buildMenu";
import { openProgressPanel } from "../ui/achievementsPanel";
import { showError, showToast } from "../ui/notifications";
import { DebugHud } from "../ui/debugHud";
import { TutorialChecklist } from "../ui/tutorialChecklist";

const REACH_DISTANCE = 6;
const AUTOSAVE_INTERVAL_MS = 20_000;
const FOOTSTEP_INTERVAL_S = 0.35;
/** 死亡ドロップの回収判定半径 (ブロック)。 */
const DEATH_DROP_PICKUP_RADIUS = 1.6;
/** 武器ごとの攻撃力。 */
const WEAPON_DAMAGE: Record<EquippedWeapon, number> = { fist: 2, stone_sword: 6 };
/** 壊した際にブロックと異なる素材がドロップするものだけ例外的に記載する (それ以外は同じキー)。 */
const BREAK_DROP_OVERRIDES: Record<string, string> = { leaves: "plant_fiber" };

function yawToFacing(yaw: number): Facing {
  const twoPi = Math.PI * 2;
  let angle = yaw % twoPi;
  if (angle < 0) angle += twoPi;
  const f = Math.round(angle / (Math.PI / 2)) % 4;
  return f as Facing;
}

function playerOverlapsBlock(pos: THREE.Vector3, block: Vec3Int): boolean {
  const halfW = PLAYER_WIDTH / 2;
  const pMinX = pos.x - halfW;
  const pMaxX = pos.x + halfW;
  const pMinY = pos.y;
  const pMaxY = pos.y + PLAYER_HEIGHT;
  const pMinZ = pos.z - halfW;
  const pMaxZ = pos.z + halfW;
  return (
    pMinX < block.x + 1 && pMaxX > block.x && pMinY < block.y + 1 && pMaxY > block.y && pMinZ < block.z + 1 && pMaxZ > block.z
  );
}

export class Game {
  private world: World;
  private history = new History();
  private selection = new Selection();
  private clipboard: Clipboard | null = null;
  private selecting = false;

  private sceneSetup: SceneSetup;
  private worldRenderer: WorldRenderer;
  private player = new PlayerController();
  private characterParts: CharacterParts;
  private avatar: AvatarConfig;

  private inputManager: InputManager;
  private touchControls: TouchControls | null = null;
  private audio = new AudioEngine();
  private hud: Hud;

  private blockHighlight = createBlockHighlight();
  private selectionHighlight = createSelectionHighlight();

  private settings: GameSettings;
  private worldSave: WorldSaveData;

  private running = true;
  private paused = false;
  private lastFrameTime = performance.now();
  private walkClock = 0;
  private footstepTimer = 0;
  private autosaveTimer = 0;
  private currentHit: RaycastHit | null = null;
  private rafId = 0;

  // ---- Phase 2: サバイバル/昼夜/生物/回路の状態 ----
  private gameMode: GameMode;
  private survivalStats: SurvivalStats;
  private inventory: InventoryData;
  private equippedWeapon: EquippedWeapon;
  private spawnPoint: Vec3Int;
  private bedPosition: Vec3Int | null;
  private timeOfDaySeconds: number;
  private entitySystem: EntitySystem;
  private isDead = false;
  private lastDamageCauseJa = "不明な要因";
  private deathDrops: DeathDropEntry[];
  private deathMarkers = new Map<string, THREE.Mesh>();
  // ---- Phase 3: バイオーム/天候 ----
  private weatherEffects: WeatherEffects;
  private environmentUpdateTimer = 0;
  // ---- Phase 4: 探索/実績の進捗、建築補助のクリップボード変換 ----
  private progress: ProgressSaveData;
  // ---- Phase 5: デバッグHUD/はじめてのチェックリスト ----
  private debugHud: DebugHud;
  private tutorialChecklist: TutorialChecklist;
  private tutorialDismissed = false;
  private tutorialStateLoaded = false;
  private fpsSmoothed = 0;
  private hasMovedOrLooked = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly uiRoot: HTMLElement,
    worldSave: WorldSaveData,
    settings: GameSettings,
    avatar: AvatarConfig,
    private readonly onBackToTitle: () => void
  ) {
    this.worldSave = worldSave;
    this.settings = settings;
    this.avatar = avatar ?? DEFAULT_AVATAR;

    this.gameMode = worldSave.gameMode;
    this.survivalStats = {
      health: worldSave.player.health,
      hunger: worldSave.player.hunger,
      hungerAccumulator: 0,
      regenAccumulator: 0,
      starvationAccumulator: 0
    };
    this.inventory = { ...worldSave.inventory };
    this.equippedWeapon = worldSave.player.equippedWeapon;
    this.spawnPoint = worldSave.spawnPoint;
    this.bedPosition = worldSave.bedPosition;
    this.deathDrops = worldSave.deathDrops.map((d) => ({
      id: d.id,
      position: { ...d.position },
      inventory: { ...d.inventory },
      createdAt: d.createdAt
    }));
    this.timeOfDaySeconds = worldSave.timeOfDaySeconds;
    this.progress = {
      ...worldSave.progress,
      discoveredBiomes: [...worldSave.progress.discoveredBiomes],
      unlockedAchievements: [...worldSave.progress.unlockedAchievements]
    };

    this.world = new World(worldSave.seed, worldSave.seedText, worldSave.terrainGeneratorVersion);
    this.world.loadEdits(worldSave.edits.map((e) => [e[0], e[1]]));
    this.world.loadLootedTreasures(worldSave.lootedTreasures);

    this.sceneSetup = createSceneSetup(canvas);
    resizeToWindow(this.sceneSetup);
    this.applyGraphicsSettings();
    this.worldRenderer = new WorldRenderer(this.world);
    this.sceneSetup.scene.add(this.worldRenderer.group);

    this.characterParts = buildCharacter(this.avatar);
    this.sceneSetup.scene.add(this.characterParts.root);

    this.sceneSetup.scene.add(this.blockHighlight);
    this.sceneSetup.scene.add(this.selectionHighlight);

    this.weatherEffects = new WeatherEffects(this.sceneSetup.scene);

    this.entitySystem = new EntitySystem(this.world, worldSave.seed);
    this.sceneSetup.scene.add(this.entitySystem.group);
    // Phase 5: ワールドを開いた直後に一度だけ、保存されていた生存生物を復元する
    // (通常のスポーン処理より前に呼ぶことで、二重出現を避ける)。
    this.entitySystem.restoreEntities(worldSave.entities);

    this.setupPlayer();
    if (this.gameMode === "survival" && !isAlive(this.survivalStats)) {
      this.survivalStats = createInitialSurvivalStats();
      this.movePlayerToRespawnPoint();
    }
    for (const drop of this.deathDrops) {
      this.spawnDeathMarker(drop.id, drop.position);
    }

    this.inputManager = new InputManager(canvas, settings.keyBindings);
    this.bindActions();

    if (isTouchCapable() && settings.touchControlsEnabled) {
      this.enableTouchControls();
    }

    this.hud = new Hud(uiRoot);
    if (worldSave.quickbar.length > 0) {
      this.hud.setQuickbar(worldSave.quickbar);
    }
    this.hud.onSelect(() => this.audio.playUiClick());
    this.hud.setModeLabel(this.gameMode);
    this.hud.setSurvivalVisible(this.gameMode === "survival");
    if (this.gameMode === "survival") {
      this.hud.setHealth(this.survivalStats.health, MAX_HEALTH);
      this.hud.setHunger(this.survivalStats.hunger, MAX_HUNGER);
    }
    this.refreshQuickbarCounts();

    this.debugHud = new DebugHud(uiRoot);
    this.debugHud.setVisible(this.settings.debugHudEnabled);

    this.tutorialChecklist = new TutorialChecklist(uiRoot, this.gameMode === "survival" ? "survival" : "creative");
    this.tutorialChecklist.onDismiss(() => {
      this.tutorialDismissed = true;
      this.saveTutorialProgress();
    });
    if (this.gameMode === "survival") {
      // サバイバルは開始直後から体力・空腹ゲージがHUDに表示されているため、
      // このチェック項目は情報提示型として即座に完了扱いにする
      // (クリエイティブの場合はtoggleFly()の実行時に完了させる)。
      this.completeTutorialStep("modeSpecific");
    }
    void loadTutorialChecklistState(this.worldSave.id).then((state) => {
      this.tutorialDismissed = state.dismissed;
      this.tutorialChecklist.setCompletedSteps(
        Array.from(new Set([...state.completedSteps, ...this.tutorialChecklist.getCompletedSteps()]))
      );
      this.tutorialStateLoaded = true;
      this.saveTutorialProgress();
      if (!state.dismissed && !this.tutorialChecklist.isAllDone()) {
        this.tutorialChecklist.show();
      }
    });

    window.addEventListener("resize", this.onResize);
    window.addEventListener("wheel", this.onWheel, { passive: true });
    window.addEventListener("keydown", this.onDigitKeyDown);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    canvas.addEventListener("click", this.onCanvasClickEnsureAudio);

    this.rafId = requestAnimationFrame(this.loop);
  }

  private setupPlayer(): void {
    const p = this.worldSave.player;
    const isFreshWorld = this.worldSave.createdAt === this.worldSave.updatedAt && this.worldSave.edits.length === 0;
    if (isFreshWorld && p.x === 0 && p.z === 0) {
      const spawn =
        this.world.generatorVersion >= TERRAIN_GENERATOR_VERSION_BIOMES
          ? findNearestLandPosition(this.world.seed)
          : { x: 0, z: 0 };
      const groundY = this.world.findHighestSolidY(spawn.x, spawn.z);
      this.player.position.set(spawn.x + 0.5, groundY + 1, spawn.z + 0.5);
      this.spawnPoint = { x: spawn.x, y: groundY, z: spawn.z };
    } else {
      this.player.position.set(p.x, p.y, p.z);
    }
    this.player.yaw = p.yaw;
    this.player.pitch = p.pitch;
    this.player.cameraMode = p.cameraMode;
    this.player.movementMode = this.gameMode === "survival" ? "walk" : p.movementMode;
  }

  private saveTutorialProgress(): void {
    if (!this.tutorialStateLoaded) return;
    void saveTutorialChecklistState(this.worldSave.id, {
      dismissed: this.tutorialDismissed,
      completedSteps: this.tutorialChecklist.getCompletedSteps()
    }).catch((err) => {
      showError(`チェックリストの保存に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  private completeTutorialStep(step: Parameters<TutorialChecklist["markDone"]>[0]): void {
    if (this.tutorialChecklist.markDone(step)) {
      this.saveTutorialProgress();
    }
  }

  /** Phase 5: タッチ操作UIを生成し、イベントを配線する。 */
  private enableTouchControls(): void {
    if (this.touchControls) return;
    this.touchControls = new TouchControls(this.uiRoot);
    this.touchControls.onBreak(() => this.breakTargetedBlock());
    this.touchControls.onPlace(() => this.placeTargetedBlock());
    this.touchControls.onToggleFly(() => this.toggleFly());
    this.touchControls.onInteract(() => this.interactWithTargetedBlock());
  }

  /** Phase 5: タッチ操作UIを破棄する (windowリスナーの重複を防ぐため、dispose()で確実に解除する)。 */
  private disableTouchControls(): void {
    if (!this.touchControls) return;
    this.touchControls.dispose();
    this.touchControls = null;
  }

  private applyGraphicsSettings(): void {
    const { renderer, camera, scene } = this.sceneSetup;
    camera.fov = this.settings.fovDeg;
    camera.updateProjectionMatrix();
    const pixelRatioCap = this.settings.quality === "low" ? 1 : this.settings.quality === "medium" ? 1.5 : 2;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
    const fogFar = Math.max(48, this.settings.renderDistanceChunks * 16 + 16);
    scene.fog = new THREE.Fog(0xbfe8ff, Math.max(16, fogFar * 0.4), fogFar);
    this.audio.setVolumes(this.settings.masterVolume, this.settings.musicVolume, this.settings.sfxVolume);
  }

  private bindActions(): void {
    this.inputManager.onBreak(() => this.breakTargetedBlock());
    this.inputManager.onPlace(() => this.placeTargetedBlock());
    this.inputManager.on("toggleFly", () => this.toggleFly());
    this.inputManager.on("toggleCamera", () => {
      this.player.toggleCamera();
      this.audio.playUiClick();
      this.completeTutorialStep("camera");
    });
    this.inputManager.on("interact", () => this.interactWithTargetedBlock());
    this.inputManager.on("undo", () => this.performUndo());
    this.inputManager.on("redo", () => this.performRedo());
    this.inputManager.on("selectionMark", () => this.toggleSelectionMark());
    this.inputManager.on("selectionCopy", () => this.copySelectionToClipboard());
    this.inputManager.on("selectionPaste", () => this.pasteClipboardAtTarget());
    this.inputManager.on("openInventory", () => this.openInventory());
    this.inputManager.on("openSettings", () => this.openPause());
    this.inputManager.on("openBuildMenu", () => this.openBuildMenuUi());
    this.inputManager.on("openProgress", () => this.openProgressUi());
  }

  private onCanvasClickEnsureAudio = (): void => {
    this.audio.ensureStarted();
  };

  private onResize = (): void => {
    resizeToWindow(this.sceneSetup);
  };

  private onWheel = (e: WheelEvent): void => {
    if (this.paused) return;
    this.hud.cycleSlot(e.deltaY > 0 ? 1 : -1);
  };

  private onDigitKeyDown = (e: KeyboardEvent): void => {
    if (this.paused) return;
    const match = /^Digit([1-9])$/.exec(e.code);
    if (match?.[1]) {
      this.hud.selectSlot(Number(match[1]) - 1);
    }
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      void this.persist();
    }
  };

  private toggleFly(): void {
    if (this.gameMode === "survival") {
      showError("飛行はクリエイティブモードでのみ使用できます。");
      this.audio.playError();
      return;
    }
    this.player.toggleFly();
    this.audio.playUiClick();
    this.completeTutorialStep("modeSpecific");
  }

  private updateHighlights(): void {
    const origin = new THREE.Vector3(this.player.position.x, this.player.position.y + 1.5, this.player.position.z);
    const lookDir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.player.pitch, this.player.yaw, 0, "YXZ"));
    this.currentHit = raycastVoxels(this.world, origin, lookDir, REACH_DISTANCE);
    if (this.currentHit) {
      positionBlockHighlight(this.blockHighlight, this.currentHit.block.x, this.currentHit.block.y, this.currentHit.block.z);
    } else {
      this.blockHighlight.visible = false;
    }

    if (this.selecting && this.currentHit) {
      // 2点目を確定する前でも、狙っている位置に合わせて選択範囲のプレビューを
      // リアルタイムに更新する (ドラッグ操作は行わず、視点移動だけで範囲を確認できる)。
      this.selection.update(this.currentHit.block);
    }
    const bounds = this.selection.getBounds();
    if (bounds) {
      positionSelectionHighlight(this.selectionHighlight, bounds);
    } else {
      this.selectionHighlight.visible = false;
    }
  }

  private breakTargetedBlock(): void {
    if (this.paused || this.isDead) return;
    if (this.gameMode === "survival" && this.tryAttackEntity()) return;
    if (!this.currentHit) return;
    const { x, y, z } = this.currentHit.block;
    const prevId = this.world.getBlockId(x, y, z);
    if (prevId === AIR_ID) return;
    const prevFacing = this.world.getBlockFacing(x, y, z);
    const prevOpen = this.world.isBlockOpen(x, y, z);
    this.world.setBlock(x, y, z, AIR_ID, 0, false);
    this.history.push({
      changes: [{ x, y, z, prevId, prevFacing, prevOpen, newId: AIR_ID, newFacing: 0, newOpen: false }]
    });
    this.worldRenderer.markDirtyAtWorldPos(x, z);
    this.audio.playBreakBlock();
    this.checkCircuitPoweredAchievement(recomputeCircuitNear(this.world, { x, y, z }).changed);
    this.completeTutorialStep("placeBreak");

    if (this.gameMode === "survival") {
      const brokenDef = getBlockDef(prevId);
      if (
        brokenDef.shape === "bed" &&
        this.bedPosition?.x === x &&
        this.bedPosition.y === y &&
        this.bedPosition.z === z
      ) {
        this.bedPosition = null;
        showToast("復活地点に設定したベッドが壊れました。", "info");
      }
      const dropKey = BREAK_DROP_OVERRIDES[brokenDef.key] ?? brokenDef.key;
      this.inventory = addItem(this.inventory, dropKey, 1);
      this.refreshQuickbarCounts();
    }
  }

  private placeTargetedBlock(): void {
    if (this.paused || this.isDead || !this.currentHit) return;
    const blockId = this.hud.getSelectedBlockId();
    if (blockId === AIR_ID) {
      showError("設置できるブロックがクイックバーに選択されていません。");
      return;
    }
    const { x, y, z } = this.currentHit.placeAt;
    if (playerOverlapsBlock(this.player.position, { x, y, z })) {
      showError("自分がいる場所には設置できません。");
      return;
    }
    if (this.gameMode === "survival") {
      const wantedDef = getBlockDef(blockId);
      if (!hasAtLeast(this.inventory, wantedDef.key, 1)) {
        showError(`${wantedDef.nameJa}が足りません。採取するかクラフトしてください。`);
        this.audio.playError();
        return;
      }
    }
    const prevId = this.world.getBlockId(x, y, z);
    const prevFacing = this.world.getBlockFacing(x, y, z);
    const prevOpen = this.world.isBlockOpen(x, y, z);
    const facing = yawToFacing(this.player.yaw);
    this.world.setBlock(x, y, z, blockId, facing, false);
    this.history.push({
      changes: [{ x, y, z, prevId, prevFacing, prevOpen, newId: blockId, newFacing: facing, newOpen: false }]
    });
    this.worldRenderer.markDirtyAtWorldPos(x, z);
    this.audio.playPlaceBlock();
    this.checkCircuitPoweredAchievement(recomputeCircuitNear(this.world, { x, y, z }).changed);
    this.progress.placedBlocksCount += 1;
    this.evaluateAchievements();
    this.completeTutorialStep("placeBreak");

    if (this.gameMode === "survival") {
      const placedDef = getBlockDef(blockId);
      const removed = removeItem(this.inventory, placedDef.key, 1);
      if (removed) this.inventory = removed;
      this.refreshQuickbarCounts();
    }
  }

  /** サバイバルモードで、正面付近の生物への攻撃を試みる。攻撃できたら true を返す。 */
  private tryAttackEntity(): boolean {
    const forward = this.player.getForwardVector();
    const target = this.entitySystem.findAttackTarget(this.player.position, { x: forward.x, z: forward.z });
    if (!target) return false;
    const damage = WEAPON_DAMAGE[this.equippedWeapon];
    const result = this.entitySystem.damageEntity(target.id, damage);
    if (!result) return false;
    this.audio.playCreatureHit();
    if (result.died) {
      this.audio.playCreatureDeath();
      for (const drop of result.drops) {
        this.inventory = addItem(this.inventory, drop.key, drop.count);
      }
      this.refreshQuickbarCounts();
      showToast(`${result.nameJa}をたおした!`, "success");
      if (getEntityDef(result.kind).temperament === "hostile") {
        this.progress.defeatedHostilesCount += 1;
        this.evaluateAchievements();
      }
    }
    return true;
  }

  private interactWithTargetedBlock(): void {
    if (this.paused || this.isDead) return;

    if (this.gameMode === "survival") {
      const forward = this.player.getForwardVector();
      const nearby = this.entitySystem.findAttackTarget(this.player.position, { x: forward.x, z: forward.z });
      if (nearby) {
        const nearbyDef = getEntityDef(nearby.kind);
        if (nearbyDef.temperament === "friendly" && hasAtLeast(this.inventory, "plant_fiber", 1)) {
          const bred = this.entitySystem.tryBreed(nearby.id);
          if (bred) {
            const removed = removeItem(this.inventory, "plant_fiber", 1);
            if (removed) this.inventory = removed;
            this.refreshQuickbarCounts();
            showToast(`${nearbyDef.nameJa}に植物繊維をあげた!仲間が増えた。`, "success");
            this.audio.playUiClick();
            return;
          }
        }
      }
    }

    if (!this.currentHit) return;
    const { x, y, z } = this.currentHit.block;
    const id = this.world.getBlockId(x, y, z);
    if (id === AIR_ID) return;
    const def = getBlockDef(id);

    if (def.shape === "door") {
      const facing = this.world.getBlockFacing(x, y, z);
      const open = this.world.isBlockOpen(x, y, z);
      this.world.setBlock(x, y, z, id, facing, !open);
      this.worldRenderer.markDirtyAtWorldPos(x, z);
      this.audio.playDoor();
      this.checkCircuitPoweredAchievement(recomputeCircuitNear(this.world, { x, y, z }).changed);
      return;
    }

    if (def.shape === "switch") {
      const facing = this.world.getBlockFacing(x, y, z);
      const on = this.world.isBlockOpen(x, y, z);
      this.world.setBlock(x, y, z, id, facing, !on);
      this.worldRenderer.markDirtyAtWorldPos(x, z);
      this.audio.playSwitch();
      this.checkCircuitPoweredAchievement(recomputeCircuitNear(this.world, { x, y, z }).changed);
      return;
    }

    if (def.shape === "chest") {
      this.interactWithChest(x, y, z, id);
      return;
    }

    if (def.shape === "bed") {
      this.bedPosition = { x, y, z };
      showToast("ベッドを復活地点に設定しました。", "success");
      this.audio.playUiClick();
    }
  }

  /**
   * 宝箱の開閉。生成された遺跡の宝箱 (isGeneratedRuinChestLocation) かつ未開封の場合のみ、
   * シード+座標から決定論的に1回だけ戦利品を渡す。開封済みマーカーは座標ベースで永続化され、
   * ブロックを壊して置き直しても (生成された座標である限り) 再度は渡さない一方、
   * プレイヤーが設置した宝箱 (生成座標ではない場所) には絶対に戦利品を発生させない。
   */
  private interactWithChest(x: number, y: number, z: number, id: number): void {
    const facing = this.world.getBlockFacing(x, y, z);
    const open = this.world.isBlockOpen(x, y, z);
    this.world.setBlock(x, y, z, id, facing, !open);
    this.worldRenderer.markDirtyAtWorldPos(x, z);
    this.audio.playDoor();

    if (open) {
      // 既に開いている宝箱を閉じるだけの操作 (戦利品には影響しない)。
      return;
    }

    if (this.world.isGeneratedRuinChestLocation(x, y, z) && !this.world.isTreasureLooted(x, y, z)) {
      const loot = rollRuinTreasureLoot(this.world.seed, x, y, z);
      for (const drop of loot) {
        this.inventory = addItem(this.inventory, drop.key, drop.count);
      }
      this.world.markTreasureLooted(x, y, z);
      this.refreshQuickbarCounts();
      this.progress.openedTreasureCount += 1;
      this.evaluateAchievements();
      showToast("宝箱を開けた! 掘り出し物が見つかった。", "success");
    } else {
      showToast("宝箱を開けた。", "info");
    }
  }

  /** 実績: 変化したブロック一覧の中にランプが含まれ、通電状態になったら「電気の魔術師」を解除する。 */
  private checkCircuitPoweredAchievement(changed: Vec3Int[]): void {
    if (this.progress.circuitPoweredEver) return;
    for (const pos of changed) {
      const blockId = this.world.getBlockId(pos.x, pos.y, pos.z);
      if (blockId === AIR_ID) continue;
      if (getBlockDef(blockId).shape === "lamp" && this.world.isBlockOpen(pos.x, pos.y, pos.z)) {
        this.progress.circuitPoweredEver = true;
        this.evaluateAchievements();
        return;
      }
    }
  }

  /** 進捗カウンターの変化に応じて、新たに解除された実績があればトースト表示し記録する。 */
  private evaluateAchievements(): void {
    const newly = computeNewlyUnlocked(this.progress, this.progress.unlockedAchievements);
    if (newly.length === 0) return;
    this.progress.unlockedAchievements = [...this.progress.unlockedAchievements, ...newly.map((a) => a.id)];
    for (const achievement of newly) {
      showToast(`実績解除: ${achievement.nameJa} — ${achievement.descriptionJa}`, "success");
    }
    this.audio.playUiClick();
  }

  /** サバイバルモード用: クイックバーに表示するブロック所持数を更新する (クリエイティブでは非表示)。 */
  private refreshQuickbarCounts(): void {
    if (this.gameMode !== "survival") {
      this.hud.setQuickbarCounts(null);
      return;
    }
    const counts = new Map<number, number>();
    for (const [key, count] of Object.entries(this.inventory)) {
      if (!isValidBlockKey(key)) continue;
      counts.set(getBlockDefByKey(key).id, count);
    }
    this.hud.setQuickbarCounts(counts);
  }

  /** 食料/医療品を使う、または道具を装備する (survivalPanel から呼ばれる)。 */
  private useInventoryItem(key: string): void {
    if (!isValidItemKey(key)) return;
    const def = getItemDef(key);
    if (isConsumableFood(key)) {
      const removed = removeItem(this.inventory, key, 1);
      if (!removed) return;
      this.inventory = removed;
      this.survivalStats = feed(this.survivalStats, def.hungerRestore ?? 0);
      this.hud.setHunger(this.survivalStats.hunger, MAX_HUNGER);
      this.refreshQuickbarCounts();
      showToast(`${def.nameJa}を食べた。`, "success");
      this.audio.playUiClick();
    } else if (isMedicine(key)) {
      const removed = removeItem(this.inventory, key, 1);
      if (!removed) return;
      this.inventory = removed;
      this.survivalStats = heal(this.survivalStats, def.healAmount ?? 0);
      this.hud.setHealth(this.survivalStats.health, MAX_HEALTH);
      this.refreshQuickbarCounts();
      showToast(`${def.nameJa}を使った。体力が回復した。`, "success");
      this.audio.playUiClick();
    } else if (def.category === "tool" && key === "stone_sword") {
      this.equippedWeapon = "stone_sword";
      showToast("石の剣を装備した。", "success");
      this.audio.playUiClick();
    }
  }

  /** 昼夜の経過に応じて空・光の見た目を更新する。weatherDimming (0..1) が高いほど、雨/雪で空が曇って薄暗くなる。 */
  private applyDayNightVisuals(fraction: number, weatherDimming = 0): void {
    const sky = getSkyColors(fraction);
    const sun = getSunIntensity(fraction);
    const ambient = getAmbientIntensity(fraction);
    // 悪天候時は空の色を少しグレーがからせ、光量も落として「曇り空」らしい見た目にする
    // (ただし建築の視認性を損なわない程度に留める: 最大でも彩度/明るさを2割程度落とすだけ)
    const overcastGray = 0x8b93a0;
    const skyColor = new THREE.Color(sky.sky).lerp(new THREE.Color(overcastGray), weatherDimming * 0.55);
    const fogColor = new THREE.Color(sky.fog).lerp(new THREE.Color(overcastGray), weatherDimming * 0.55);
    this.sceneSetup.scene.background = skyColor;
    if (this.sceneSetup.scene.fog instanceof THREE.Fog) {
      this.sceneSetup.scene.fog.color.copy(fogColor);
    }
    this.sceneSetup.sunLight.intensity = (0.15 + sun * 1.1) * (1 - weatherDimming * 0.35);
    this.sceneSetup.hemiLight.intensity = (0.25 + ambient * 0.8) * (1 - weatherDimming * 0.2);
  }

  /**
   * バイオーム・天候 (雨/雪/晴れ) を求め、パーティクル・環境音・HUD表示に反映する。
   * シード + 経過ゲーム内時間だけで決まる決定論的な天候のため、セーブ/ロードしても
   * 同じ瞬間の天候が再現される。悪天候の強さ (0..1) を呼び出し元へ返し、
   * 昼夜の見た目 (applyDayNightVisuals) の曇り具合にも使う。
   */
  private updateWeatherAndBiome(dt: number): number {
    const biome = getBiomeAt(this.world.seed, Math.floor(this.player.position.x), Math.floor(this.player.position.z));
    const weatherKind = resolveWeatherKind(this.world.seed, this.timeOfDaySeconds, biome);
    const intensity = getWeatherIntensity(this.world.seed, this.timeOfDaySeconds);

    this.weatherEffects.update(dt, this.player.position, weatherKind, intensity);
    this.audio.setWeatherAmbience(weatherKind, intensity);
    this.audio.setCaveAmbience(this.player.position.y < UNDERGROUND_Y_THRESHOLD);

    this.environmentUpdateTimer -= dt;
    if (this.environmentUpdateTimer <= 0) {
      this.environmentUpdateTimer = 0.5;
      const weatherIcon = weatherKind === "rain" ? "🌧" : weatherKind === "snow" ? "❄" : "☀";
      this.hud.setEnvironment(BIOME_LABELS_JA[biome], getWeatherLabelJa(weatherKind), weatherIcon);
      this.recordBiomeAndCaveDiscovery(biome);
    }

    return intensity;
  }

  /** 実績: 訪れたバイオームの記録と、自然生成された洞窟への初侵入を記録する (0.5秒おきの間引きで呼ばれる)。 */
  private recordBiomeAndCaveDiscovery(biome: Biome): void {
    let changed = false;
    if (!this.progress.discoveredBiomes.includes(biome)) {
      this.progress.discoveredBiomes = [...this.progress.discoveredBiomes, biome];
      changed = true;
    }
    if (!this.progress.caveDiscovered) {
      const px = Math.floor(this.player.position.x);
      const py = Math.floor(this.player.position.y);
      const pz = Math.floor(this.player.position.z);
      if (this.world.isNaturalCaveAt(px, py, pz)) {
        this.progress.caveDiscovered = true;
        changed = true;
      }
    }
    if (changed) this.evaluateAchievements();
  }

  /** 現在の状況に応じた操作ヒントを1行で返す。 */
  private computeHint(): string {
    if (this.isDead) return "";
    if (this.gameMode === "survival") {
      const forward = this.player.getForwardVector();
      const target = this.entitySystem.findAttackTarget(this.player.position, { x: forward.x, z: forward.z });
      if (target) {
        const def = getEntityDef(target.kind);
        return def.temperament === "hostile" ? `[クリック] ${def.nameJa}を攻撃` : `[クリック] ${def.nameJa}を攻撃 / [E] 植物繊維を与える`;
      }
    }
    if (this.currentHit) {
      const { x, y, z } = this.currentHit.block;
      const id = this.world.getBlockId(x, y, z);
      if (id !== AIR_ID) {
        const shape = getBlockDef(id).shape;
        if (shape === "door") return "[E] ドアを開閉";
        if (shape === "switch") return "[E] スイッチを切り替え";
        if (shape === "bed") return "[E] 復活地点に設定";
        if (shape === "chest") return this.world.isBlockOpen(x, y, z) ? "[E] 宝箱を閉じる" : "[E] 宝箱を開ける";
      }
    }
    return "";
  }

  /** サバイバルモードでの被ダメージ (敵対生物の攻撃) を処理する。 */
  private handleHostileAttack(damage: number, kind: EntityKind): void {
    if (this.gameMode !== "survival" || this.isDead) return;
    this.lastDamageCauseJa = `${getEntityDef(kind).nameJa}の攻撃`;
    this.survivalStats = applyDamage(this.survivalStats, damage);
    this.audio.playDamage();
  }

  /** 体力が尽きていれば死亡処理を行う (サバイバルのみ)。 */
  private checkDeath(): void {
    if (this.gameMode !== "survival" || this.isDead) return;
    if (isAlive(this.survivalStats)) return;
    this.isDead = true;
    this.paused = true;
    this.audio.playDeath();
    const dropPos: Vec3Int = {
      x: Math.floor(this.player.position.x),
      y: Math.floor(this.player.position.y),
      z: Math.floor(this.player.position.z)
    };
    const priorCount = this.deathDrops.length;
    const entry: DeathDropEntry = {
      id: generateId(),
      position: dropPos,
      inventory: { ...this.inventory },
      createdAt: Date.now()
    };
    this.deathDrops = addDeathDrop(this.deathDrops, entry);
    if (this.deathDrops.length <= priorCount) {
      // 上限(MAX_DEATH_DROPS)に達していたため、最古のドロップが次点のドロップへ合流した
      // (中身は失われないが、マーカーの数は減る)。
      showToast(
        `死亡地点の落とし物が上限(${MAX_DEATH_DROPS}件)に達したため、最も古い落とし物を近くのものへまとめました。`,
        "info"
      );
    }
    this.syncDeathMarkers();
    this.inventory = createEmptyInventory();
    this.equippedWeapon = "fist";
    this.refreshQuickbarCounts();
    this.inputManager.exitPointerLock();
    this.inputManager.setEnabled(false);
    void this.persist();
    showDeathScreen(this.lastDamageCauseJa, () => this.respawnPlayer());
  }

  private spawnDeathMarker(id: string, pos: Vec3Int): void {
    const geometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const material = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.85 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(pos.x + 0.5, pos.y + 0.4, pos.z + 0.5);
    this.sceneSetup.scene.add(mesh);
    this.deathMarkers.set(id, mesh);
  }

  private clearDeathMarker(id: string): void {
    const mesh = this.deathMarkers.get(id);
    if (!mesh) return;
    this.sceneSetup.scene.remove(mesh);
    mesh.geometry.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat.dispose();
    this.deathMarkers.delete(id);
  }

  /** マーカーの集合を this.deathDrops の現在の内容 (id集合) と一致させる。 */
  private syncDeathMarkers(): void {
    const validIds = new Set(this.deathDrops.map((d) => d.id));
    for (const id of Array.from(this.deathMarkers.keys())) {
      if (!validIds.has(id)) this.clearDeathMarker(id);
    }
    for (const drop of this.deathDrops) {
      if (!this.deathMarkers.has(drop.id)) this.spawnDeathMarker(drop.id, drop.position);
    }
  }

  private disposeAllDeathMarkers(): void {
    for (const id of Array.from(this.deathMarkers.keys())) this.clearDeathMarker(id);
  }

  private respawnPlayer(): void {
    this.movePlayerToRespawnPoint();
    this.player.velocity.set(0, 0, 0);
    this.survivalStats = createInitialSurvivalStats();
    this.hud.setHealth(this.survivalStats.health, MAX_HEALTH);
    this.hud.setHunger(this.survivalStats.hunger, MAX_HUNGER);
    this.isDead = false;
    this.paused = false;
    this.inputManager.setEnabled(true);
  }

  private movePlayerToRespawnPoint(): void {
    const target = this.bedPosition ?? this.spawnPoint;
    this.player.position.set(target.x + 0.5, target.y + 1, target.z + 0.5);
  }

  /** 死亡地点に近づいたら、最も近い落とし物を自動で回収する (1フレームに1個まで)。 */
  private checkDeathDropPickup(): void {
    if (this.deathDrops.length === 0) return;
    const nearest = findNearestPickupableDrop(this.deathDrops, this.player.position, DEATH_DROP_PICKUP_RADIUS, 2.5);
    if (!nearest) return;
    for (const [key, count] of Object.entries(nearest.inventory)) {
      this.inventory = addItem(this.inventory, key, count);
    }
    this.refreshQuickbarCounts();
    this.deathDrops = removeDeathDrop(this.deathDrops, nearest.id);
    this.clearDeathMarker(nearest.id);
    void this.persist();
    showToast("落とした持ち物を回収した。", "success");
  }

  private markDirtyForChanges(changes: BlockChange[]): void {
    const seen = new Set<string>();
    for (const c of changes) {
      const key = `${c.x},${c.z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      this.worldRenderer.markDirtyAtWorldPos(c.x, c.z);
    }
  }

  private performUndo(): void {
    if (this.gameMode === "survival") {
      showError("取り消しはクリエイティブモードでのみ使用できます。");
      return;
    }
    if (!this.history.canUndo()) {
      showToast("これ以上取り消せる操作がありません。", "info");
      return;
    }
    const changes = this.history.undo(this.world);
    this.markDirtyForChanges(changes);
    this.audio.playUndo();
  }

  private performRedo(): void {
    if (this.gameMode === "survival") {
      showError("やり直しはクリエイティブモードでのみ使用できます。");
      return;
    }
    if (!this.history.canRedo()) {
      showToast("これ以上やり直せる操作がありません。", "info");
      return;
    }
    const changes = this.history.redo(this.world);
    this.markDirtyForChanges(changes);
    this.audio.playRedo();
  }

  private toggleSelectionMark(): void {
    if (!this.currentHit) return;
    if (!this.selecting) {
      this.selection.begin(this.currentHit.block);
      this.selecting = true;
      showToast("選択範囲の始点を設定しました。もう一度押すと確定します。", "info");
    } else {
      this.selection.update(this.currentHit.block);
      this.selecting = false;
      showToast("選択範囲を確定しました。コピーできます。", "success");
    }
    this.audio.playUiClick();
  }

  private copySelectionToClipboard(): void {
    const bounds = this.selection.getBounds();
    if (!bounds) {
      showError("選択範囲がありません。まず選択を開始してください。");
      return;
    }
    try {
      this.clipboard = copySelection(this.world, bounds);
      showToast(`選択範囲 (${boundsVolume(bounds)}ブロック) をコピーしました。`, "success");
      this.audio.playUiClick();
    } catch (err) {
      if (err instanceof SelectionTooLargeError) {
        showError(err.message);
      } else {
        showError(`コピーに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private pasteClipboardAtTarget(): void {
    if (this.gameMode === "survival") {
      showError("範囲の貼り付けはクリエイティブモードでのみ使用できます。");
      return;
    }
    if (!this.clipboard) {
      showError("貼り付けるクリップボードがありません。まずコピーしてください。");
      return;
    }
    if (!this.currentHit) return;
    const origin = this.currentHit.placeAt;
    const changes = pasteClipboard(this.world, this.clipboard, origin);
    if (changes.length > 0) {
      this.history.push({ changes });
      this.markDirtyForChanges(changes);
      const placedCount = changes.filter((change) => change.newId !== AIR_ID).length;
      if (placedCount > 0) {
        this.progress.placedBlocksCount += placedCount;
        this.evaluateAchievements();
      }
    }
    this.audio.playPlaceBlock();
    showToast(`${changes.length}個のブロックを貼り付けました。`, "success");
  }

  /** クリップボードをY軸周りに90度回転する (時計回り/反時計回り)。クリエイティブ専用。 */
  private rotateClipboard(direction: "cw" | "ccw"): void {
    if (this.gameMode === "survival") {
      showError("回転はクリエイティブモードでのみ使用できます (資源の複製を防ぐため)。");
      return;
    }
    if (!this.clipboard) {
      showError("回転するクリップボードがありません。まずコピーしてください。");
      return;
    }
    this.clipboard = rotateClipboardY(this.clipboard, direction);
    showToast(`クリップボードを${direction === "cw" ? "時計回り" : "反時計回り"}に90度回転しました。`, "success");
    this.audio.playUiClick();
  }

  /** クリップボードをX軸またはZ軸方向に反転する。クリエイティブ専用。 */
  private mirrorClipboard(axis: "x" | "z"): void {
    if (this.gameMode === "survival") {
      showError("反転はクリエイティブモードでのみ使用できます (資源の複製を防ぐため)。");
      return;
    }
    if (!this.clipboard) {
      showError("反転するクリップボードがありません。まずコピーしてください。");
      return;
    }
    this.clipboard = axis === "x" ? mirrorClipboardX(this.clipboard) : mirrorClipboardZ(this.clipboard);
    showToast(`クリップボードを${axis === "x" ? "X軸" : "Z軸"}方向に反転しました。`, "success");
    this.audio.playUiClick();
  }

  /** 現在のクリップボードに名前を付けて設計図として保存する。クリエイティブ専用。 */
  private async saveClipboardAsBlueprint(rawName: string): Promise<BlueprintRecord | null> {
    if (this.gameMode === "survival") {
      showError("設計図の保存はクリエイティブモードでのみ使用できます。");
      return null;
    }
    if (!this.clipboard) {
      showError("保存するクリップボードがありません。まずコピーしてください。");
      return null;
    }
    const record = createBlueprintRecord({ id: generateId(), name: rawName, clipboard: this.clipboard, now: Date.now() });
    await saveBlueprint(record);
    showToast(`設計図「${record.name}」を保存しました。`, "success");
    this.audio.playUiClick();
    return record;
  }

  /** 設計図の内容をクリップボードへ読み込む。クリエイティブ専用。 */
  private loadBlueprintIntoClipboard(record: BlueprintRecord): void {
    if (this.gameMode === "survival") {
      showError("設計図の読み込みはクリエイティブモードでのみ使用できます。");
      return;
    }
    this.clipboard = record.clipboard;
    showToast(`設計図「${record.name}」をクリップボードに読み込みました。貼り付けできます。`, "success");
    this.audio.playUiClick();
  }

  private openBuildMenuUi(): void {
    this.audio.playUiClick();
    openBuildMenu({
      gameMode: this.gameMode,
      settings: this.settings,
      getClipboard: () => this.clipboard,
      onRotate: (direction) => this.rotateClipboard(direction),
      onMirror: (axis) => this.mirrorClipboard(axis),
      onPaste: () => this.pasteClipboardAtTarget(),
      onSaveBlueprint: (name) => this.saveClipboardAsBlueprint(name),
      onLoadBlueprint: (record) => this.loadBlueprintIntoClipboard(record)
    });
  }

  private openProgressUi(): void {
    this.audio.playUiClick();
    openProgressPanel(this.progress);
  }

  private openInventory(): void {
    this.audio.playUiClick();
    this.completeTutorialStep("inventory");
    if (this.gameMode === "survival") {
      openSurvivalPanel(
        () => this.inventory,
        (recipe) => {
          const result = craftItem(this.inventory, recipe);
          if (!result.ok) {
            const missingText = result.missing.map((m) => `${displayNameForKey(m.key)}×${m.count}`).join("、");
            showError(`材料が足りません: ${missingText}`);
            this.audio.playError();
            return;
          }
          this.inventory = result.inventory;
          this.refreshQuickbarCounts();
          this.audio.playCraft();
          showToast(`${recipe.nameJa}を作った!`, "success");
          this.progress.craftedItemsCount += 1;
          this.evaluateAchievements();
        },
        (blockKey) => {
          const blockId = getBlockDefByKey(blockKey).id;
          this.hud.setSlotItem(this.hud.getSelectedIndex(), blockId);
        },
        (itemKey) => this.useInventoryItem(itemKey)
      );
    } else {
      openInventoryPanel((blockId) => {
        this.hud.setSlotItem(this.hud.getSelectedIndex(), blockId);
      });
    }
  }

  private openPause(): void {
    if (this.paused) return;
    this.paused = true;
    this.inputManager.exitPointerLock();
    this.inputManager.setEnabled(false);
    openPauseMenu({
      onResume: () => {
        this.paused = false;
        this.inputManager.setEnabled(true);
      },
      onOpenSettings: () => {
        openSettingsPanel(this.settings, this.inputManager, (next) => {
          const prevTouchEnabled = this.settings.touchControlsEnabled;
          this.settings = next;
          this.applyGraphicsSettings();
          this.inputManager.applySettings(next);
          this.debugHud.setVisible(next.debugHudEnabled);
          if (next.touchControlsEnabled !== prevTouchEnabled) {
            if (next.touchControlsEnabled) {
              // タッチ非対応端末でも、動作確認用に手動で有効化した場合は表示を許可する。
              this.enableTouchControls();
            } else {
              this.disableTouchControls();
            }
          }
          void saveSettings(next).catch((err) => {
            showError(`設定の保存に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
          });
        });
      },
      onOpenHelp: () => showHelpOverlay(),
      onOpenAvatar: () => {
        openAvatarCreator(this.avatar, (avatar) => {
          this.avatar = avatar;
          this.sceneSetup.scene.remove(this.characterParts.root);
          this.characterParts = buildCharacter(avatar);
          this.sceneSetup.scene.add(this.characterParts.root);
          void saveAvatar(avatar).catch((err) => {
            showError(`アバターの保存に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
          });
        });
      },
      onOpenBuildMenu: () => this.openBuildMenuUi(),
      onOpenProgress: () => this.openProgressUi(),
      onOpenTutorial: () => {
        this.tutorialDismissed = false;
        this.saveTutorialProgress();
        this.tutorialChecklist.show();
      },
      onBackToTitle: () => {
        void this.persist().then(() => {
          this.dispose();
          this.onBackToTitle();
        });
      }
    });
  }

  private async persist(): Promise<void> {
    try {
      this.worldSave = {
        ...this.worldSave,
        updatedAt: Date.now(),
        gameMode: this.gameMode,
        player: {
          x: this.player.position.x,
          y: this.player.position.y,
          z: this.player.position.z,
          yaw: this.player.yaw,
          pitch: this.player.pitch,
          cameraMode: this.player.cameraMode,
          movementMode: this.player.movementMode,
          health: this.survivalStats.health,
          hunger: this.survivalStats.hunger,
          equippedWeapon: this.equippedWeapon
        },
        quickbar: this.hud.getQuickbar(),
        inventory: { ...this.inventory },
        spawnPoint: this.spawnPoint,
        bedPosition: this.bedPosition,
        deathDrops: this.deathDrops.map((d) => ({
          id: d.id,
          position: { ...d.position },
          inventory: { ...d.inventory },
          createdAt: d.createdAt
        })),
        timeOfDaySeconds: this.timeOfDaySeconds,
        terrainGeneratorVersion: this.world.generatorVersion,
        edits: editsMapToPlain(this.world.getAllEdits()),
        progress: {
          ...this.progress,
          discoveredBiomes: [...this.progress.discoveredBiomes],
          unlockedAchievements: [...this.progress.unlockedAchievements]
        },
        lootedTreasures: this.world.getLootedTreasures(),
        entities: this.entitySystem.getSnapshot()
      };
      await saveWorld(this.worldSave);
    } catch (err) {
      showError(`自動保存に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private buildMoveInput(): MoveInput {
    const base = this.inputManager.getMoveInput();
    return this.touchControls ? this.touchControls.applyToMoveInput(base) : base;
  }

  private loop = (): void => {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    if (!this.paused) {
      this.timeOfDaySeconds += dt;
      const timeOfDay = getTimeOfDay(this.timeOfDaySeconds);

      const moveInput = this.buildMoveInput();
      const sensitivity = this.settings.mouseSensitivity;
      const mouseDelta = this.inputManager.consumeLookDelta(sensitivity);
      const touchDelta = this.touchControls?.consumeLookDelta(sensitivity) ?? { dx: 0, dy: 0 };
      this.player.applyLook(mouseDelta.dx + touchDelta.dx, mouseDelta.dy + touchDelta.dy);
      this.player.update(dt, moveInput, this.world);

      const weatherIntensity = this.updateWeatherAndBiome(dt);
      this.applyDayNightVisuals(timeOfDay.fraction, weatherIntensity);

      const moving =
        moveInput.forward ||
        moveInput.backward ||
        moveInput.left ||
        moveInput.right ||
        (moveInput.analogX !== undefined && Math.abs(moveInput.analogX) > 0.05) ||
        (moveInput.analogZ !== undefined && Math.abs(moveInput.analogZ) > 0.05);
      if (!this.hasMovedOrLooked && (moving || Math.abs(mouseDelta.dx) > 0.001 || Math.abs(mouseDelta.dy) > 0.001)) {
        this.hasMovedOrLooked = true;
        this.completeTutorialStep("moveLook");
      }
      this.walkClock += dt;
      animateWalk(this.characterParts, this.walkClock, moving && this.player.onGround);

      if (moving && this.player.onGround) {
        this.footstepTimer -= dt;
        if (this.footstepTimer <= 0) {
          this.audio.playFootstep();
          this.footstepTimer = FOOTSTEP_INTERVAL_S;
        }
      } else {
        this.footstepTimer = 0;
      }

      updateCamera(this.sceneSetup.camera, this.player, this.world, this.characterParts.root);
      this.worldRenderer.update(this.player.position.x, this.player.position.z, this.settings.renderDistanceChunks);
      this.updateHighlights();
      this.checkDeathDropPickup();

      if (this.gameMode === "survival" && !this.isDead) {
        this.entitySystem.update(dt, this.player.position, timeOfDay.fraction, (damage, kind) =>
          this.handleHostileAttack(damage, kind)
        );

        const beforeHealth = this.survivalStats.health;
        this.survivalStats = tickSurvival(this.survivalStats, dt);
        if (this.survivalStats.health < beforeHealth) this.lastDamageCauseJa = "空腹による衰弱";

        if (this.player.lastFallDistance > 0) {
          const fallResult = applyFallDamage(this.survivalStats, this.player.lastFallDistance);
          this.survivalStats = fallResult.stats;
          if (fallResult.damage > 0) {
            this.lastDamageCauseJa = "落下";
            this.audio.playDamage();
          }
        }

        this.hud.setHealth(this.survivalStats.health, MAX_HEALTH);
        this.hud.setHunger(this.survivalStats.hunger, MAX_HUNGER);
        this.checkDeath();
      }

      this.hud.setDayTime(formatTimeLabel(timeOfDay.fraction), isNight(timeOfDay.fraction));
      this.hud.setHint(this.computeHint());

      this.hud.setStatusText(
        `${this.player.cameraMode === "first" ? "一人称" : "三人称"} / ${this.player.movementMode === "fly" ? "飛行" : "歩行"}` +
          (this.history.canUndo() ? ` / 履歴 ${this.history.undoCount}` : "")
      );

      this.autosaveTimer += dt * 1000;
      if (this.autosaveTimer >= AUTOSAVE_INTERVAL_MS) {
        this.autosaveTimer = 0;
        void this.persist();
      }
    }

    if (this.settings.debugHudEnabled) {
      const instantFps = dt > 0 ? 1 / dt : 0;
      this.fpsSmoothed = this.fpsSmoothed === 0 ? instantFps : this.fpsSmoothed * 0.9 + instantFps * 0.1;
      const info = this.sceneSetup.renderer.info;
      const diagnostics = this.worldRenderer.diagnostics;
      this.debugHud.update({
        fps: this.fpsSmoothed,
        loadedChunks: diagnostics.loadedChunks,
        queuedChunks: diagnostics.queuedChunks,
        entityCount: this.entitySystem.liveCount,
        drawCalls: info.render.calls,
        triangles: info.render.triangles
      });
    }

    this.sceneSetup.renderer.render(this.sceneSetup.scene, this.sceneSetup.camera);
    this.rafId = requestAnimationFrame(this.loop);
  };

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.inputManager.exitPointerLock();
    this.inputManager.dispose();
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onDigitKeyDown);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.canvas.removeEventListener("click", this.onCanvasClickEnsureAudio);
    this.worldRenderer.disposeAll();
    this.entitySystem.dispose();
    this.sceneSetup.scene.remove(this.entitySystem.group);
    this.disposeAllDeathMarkers();
    this.weatherEffects.dispose(this.sceneSetup.scene);
    this.audio.dispose();
    this.sceneSetup.renderer.dispose();
    this.hud.root.remove();
    this.debugHud.dispose();
    this.tutorialChecklist.dispose();
    this.touchControls?.dispose();
    this.blockHighlight.geometry.dispose();
    this.selectionHighlight.geometry.dispose();
  }
}
