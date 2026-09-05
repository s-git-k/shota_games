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
  pasteClipboard,
  Selection,
  SelectionTooLargeError,
  type Clipboard
} from "../core/selection";
import { editsMapToPlain, type DeathDropSaveData, type EquippedWeapon, type WorldSaveData } from "../core/save";
import type { GameSettings } from "../core/settings";
import { World } from "../core/world";
import type { Facing, Vec3Int } from "../core/types";
import { saveAvatar, saveSettings, saveWorld } from "../core/storage";
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
import { findNearestLandPosition, getBiomeAt, BIOME_LABELS_JA } from "../core/biome";
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
import { showError, showToast } from "../ui/notifications";

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
  private deathDrop: DeathDropSaveData | null;
  private deathMarker: THREE.Mesh | null = null;
  // ---- Phase 3: バイオーム/天候 ----
  private weatherEffects: WeatherEffects;
  private environmentUpdateTimer = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    uiRoot: HTMLElement,
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
    this.deathDrop = worldSave.deathDrop
      ? { position: { ...worldSave.deathDrop.position }, inventory: { ...worldSave.deathDrop.inventory } }
      : null;
    this.timeOfDaySeconds = worldSave.timeOfDaySeconds;

    this.world = new World(worldSave.seed, worldSave.seedText, worldSave.terrainGeneratorVersion);
    this.world.loadEdits(worldSave.edits.map((e) => [e[0], e[1]]));

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

    this.setupPlayer();
    if (this.gameMode === "survival" && !isAlive(this.survivalStats)) {
      this.survivalStats = createInitialSurvivalStats();
      this.movePlayerToRespawnPoint();
    }
    if (this.deathDrop) {
      this.spawnDeathMarker(this.deathDrop.position);
    }

    this.inputManager = new InputManager(canvas, settings.keyBindings);
    this.bindActions();

    if (isTouchCapable() && settings.touchControlsEnabled) {
      this.touchControls = new TouchControls(uiRoot);
      this.touchControls.onBreak(() => this.breakTargetedBlock());
      this.touchControls.onPlace(() => this.placeTargetedBlock());
      this.touchControls.onToggleFly(() => this.toggleFly());
      this.touchControls.onInteract(() => this.interactWithTargetedBlock());
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
    });
    this.inputManager.on("interact", () => this.interactWithTargetedBlock());
    this.inputManager.on("undo", () => this.performUndo());
    this.inputManager.on("redo", () => this.performRedo());
    this.inputManager.on("selectionMark", () => this.toggleSelectionMark());
    this.inputManager.on("selectionCopy", () => this.copySelectionToClipboard());
    this.inputManager.on("selectionPaste", () => this.pasteClipboardAtTarget());
    this.inputManager.on("openInventory", () => this.openInventory());
    this.inputManager.on("openSettings", () => this.openPause());
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
    recomputeCircuitNear(this.world, { x, y, z });

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
    recomputeCircuitNear(this.world, { x, y, z });

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
      recomputeCircuitNear(this.world, { x, y, z });
      return;
    }

    if (def.shape === "switch") {
      const facing = this.world.getBlockFacing(x, y, z);
      const on = this.world.isBlockOpen(x, y, z);
      this.world.setBlock(x, y, z, id, facing, !on);
      this.worldRenderer.markDirtyAtWorldPos(x, z);
      this.audio.playSwitch();
      recomputeCircuitNear(this.world, { x, y, z });
      return;
    }

    if (def.shape === "bed") {
      this.bedPosition = { x, y, z };
      showToast("ベッドを復活地点に設定しました。", "success");
      this.audio.playUiClick();
    }
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
    }

    return intensity;
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
    let droppedInventory = { ...this.inventory };
    if (this.deathDrop) {
      for (const [key, count] of Object.entries(this.deathDrop.inventory)) {
        droppedInventory = addItem(droppedInventory, key, count);
      }
      showToast("前回の落とし物も新しい死亡地点へ移動しました。", "info");
    }
    this.deathDrop = { position: dropPos, inventory: droppedInventory };
    this.spawnDeathMarker(dropPos);
    this.inventory = createEmptyInventory();
    this.equippedWeapon = "fist";
    this.refreshQuickbarCounts();
    this.inputManager.exitPointerLock();
    this.inputManager.setEnabled(false);
    void this.persist();
    showDeathScreen(this.lastDamageCauseJa, () => this.respawnPlayer());
  }

  private spawnDeathMarker(pos: Vec3Int): void {
    this.clearDeathMarker();
    const geometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const material = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.85 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(pos.x + 0.5, pos.y + 0.4, pos.z + 0.5);
    this.sceneSetup.scene.add(mesh);
    this.deathMarker = mesh;
  }

  private clearDeathMarker(): void {
    if (!this.deathMarker) return;
    this.sceneSetup.scene.remove(this.deathMarker);
    this.deathMarker.geometry.dispose();
    const mat = this.deathMarker.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat.dispose();
    this.deathMarker = null;
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

  /** 死亡地点に近づいたら、落とした持ち物を自動で回収する。 */
  private checkDeathDropPickup(): void {
    if (!this.deathDrop) return;
    const dx = this.player.position.x - (this.deathDrop.position.x + 0.5);
    const dz = this.player.position.z - (this.deathDrop.position.z + 0.5);
    const dy = this.player.position.y - this.deathDrop.position.y;
    if (dx * dx + dz * dz > DEATH_DROP_PICKUP_RADIUS * DEATH_DROP_PICKUP_RADIUS || Math.abs(dy) > 2.5) return;
    for (const [key, count] of Object.entries(this.deathDrop.inventory)) {
      this.inventory = addItem(this.inventory, key, count);
    }
    this.refreshQuickbarCounts();
    this.clearDeathMarker();
    this.deathDrop = null;
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
    }
    this.audio.playPlaceBlock();
    showToast(`${changes.length}個のブロックを貼り付けました。`, "success");
  }

  private openInventory(): void {
    this.audio.playUiClick();
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
          this.settings = next;
          this.applyGraphicsSettings();
          this.inputManager.applySettings(next);
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
        deathDrop: this.deathDrop
          ? { position: { ...this.deathDrop.position }, inventory: { ...this.deathDrop.inventory } }
          : null,
        timeOfDaySeconds: this.timeOfDaySeconds,
        terrainGeneratorVersion: this.world.generatorVersion,
        edits: editsMapToPlain(this.world.getAllEdits())
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
    this.clearDeathMarker();
    this.weatherEffects.dispose(this.sceneSetup.scene);
    this.audio.dispose();
    this.sceneSetup.renderer.dispose();
    this.hud.root.remove();
    this.touchControls?.dispose();
    this.blockHighlight.geometry.dispose();
    this.selectionHighlight.geometry.dispose();
  }
}
