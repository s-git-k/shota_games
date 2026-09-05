/**
 * 生物ランタイムの管理: 出現・AI更新・見た目同期・攻撃対象の判定・ドロップ計算を担う。
 * ゲーム負荷を抑えるため、出現数に上限を設け、プレイヤーから遠く離れた個体は間引く。
 */
import * as THREE from "three";
import type { World } from "../core/world";
import {
  ENTITY_DEFINITIONS,
  HOSTILE_KINDS,
  FRIENDLY_KINDS,
  getEntityDef,
  rollDropCount,
  type EntityKind
} from "../core/entities";
import {
  createEntityRuntime,
  stepHostileAI,
  stepFriendlyWander,
  applyDamageToEntity,
  pickSpawnOffset,
  shouldAttemptSpawn,
  canSpawnHostileAt,
  type EntityRuntime
} from "../core/entityAI";
import { isNight } from "../core/dayNight";
import { buildEntityVisual, animateEntityVisual, type EntityVisual } from "../render/entityRenderer";
import { mulberry32 } from "../core/rng";

void ENTITY_DEFINITIONS; // レジストリの副作用 (登録漏れがないことの参照) を明示するためだけに触れておく

const MAX_HOSTILE = 8;
const MAX_FRIENDLY = 6;
const SPAWN_CHECK_INTERVAL_S = 2.5;
const HOSTILE_SPAWN_CHANCE = 0.35;
const FRIENDLY_SPAWN_CHANCE = 0.18;
const SPAWN_MIN_RADIUS = 12;
const SPAWN_MAX_RADIUS = 22;
const DESPAWN_RADIUS = 48;
const ATTACK_REACH = 3.2;
/** 攻撃可能な視野角 (cos閾値、約56度以内) */
const ATTACK_CONE_COS = 0.55;

export interface AttackResult {
  kind: EntityKind;
  nameJa: string;
  died: boolean;
  drops: Array<{ key: string; count: number }>;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export class EntitySystem {
  readonly group = new THREE.Group();
  private entities: EntityRuntime[] = [];
  private visuals = new Map<number, EntityVisual>();
  private rng: () => number;
  private spawnTimer = 0;
  private time = 0;

  constructor(private readonly world: World, seed: number) {
    this.rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  }

  private spawnEntity(kind: EntityKind, x: number, y: number, z: number): void {
    const runtime = createEntityRuntime(kind, x, y, z, this.rng() * Math.PI * 2);
    this.entities.push(runtime);
    const visual = buildEntityVisual(kind);
    visual.root.position.set(x, y, z);
    this.group.add(visual.root);
    this.visuals.set(runtime.id, visual);
  }

  private countByTemperament(temperament: "hostile" | "friendly"): number {
    return this.entities.filter((e) => getEntityDef(e.kind).temperament === temperament).length;
  }

  private trySpawn(playerPos: Vec3Like, dayFraction: number): void {
    if (this.countByTemperament("hostile") < MAX_HOSTILE && shouldAttemptSpawn(this.rng, HOSTILE_SPAWN_CHANCE)) {
      const offset = pickSpawnOffset(this.rng, SPAWN_MIN_RADIUS, SPAWN_MAX_RADIUS);
      const x = Math.floor(playerPos.x + offset.x);
      const z = Math.floor(playerPos.z + offset.z);
      const y = this.world.findHighestSolidY(x, z) + 1;
      if (canSpawnHostileAt(dayFraction, y)) {
        const kind = HOSTILE_KINDS[Math.floor(this.rng() * HOSTILE_KINDS.length)];
        if (kind) this.spawnEntity(kind, x + 0.5, y, z + 0.5);
      }
    }

    if (
      !isNight(dayFraction) &&
      this.countByTemperament("friendly") < MAX_FRIENDLY &&
      shouldAttemptSpawn(this.rng, FRIENDLY_SPAWN_CHANCE)
    ) {
      const offset = pickSpawnOffset(this.rng, SPAWN_MIN_RADIUS * 0.6, SPAWN_MAX_RADIUS);
      const x = Math.floor(playerPos.x + offset.x);
      const z = Math.floor(playerPos.z + offset.z);
      const y = this.world.findHighestSolidY(x, z) + 1;
      const kind = FRIENDLY_KINDS[Math.floor(this.rng() * FRIENDLY_KINDS.length)];
      if (kind) this.spawnEntity(kind, x + 0.5, y, z + 0.5);
    }
  }

  private removeVisual(id: number): void {
    const visual = this.visuals.get(id);
    if (!visual) return;
    this.group.remove(visual.root);
    visual.root.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        c.geometry.dispose();
        const mat = c.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
    this.visuals.delete(id);
  }

  /**
   * 全生物を1ステップ進める。敵対生物がプレイヤーへ攻撃を行った場合は onHostileAttack を呼び出す
   * (実際にダメージを適用するかはクリエイティブ/サバイバルの判断とあわせて呼び出し側が行う)。
   */
  update(dt: number, playerPos: Vec3Like, dayFraction: number, onHostileAttack: (damage: number, kind: EntityKind) => void): void {
    this.time += dt;
    this.spawnTimer += dt;
    if (this.spawnTimer >= SPAWN_CHECK_INTERVAL_S) {
      this.spawnTimer = 0;
      this.trySpawn(playerPos, dayFraction);
    }

    const next: EntityRuntime[] = [];
    for (const entity of this.entities) {
      const def = getEntityDef(entity.kind);
      let updated: EntityRuntime;
      if (def.temperament === "hostile") {
        const result = stepHostileAI(entity, dt, playerPos, this.rng);
        updated = result.entity;
        if (result.didAttack) onHostileAttack(def.attackDamage, def.kind);
      } else {
        updated = stepFriendlyWander(entity, dt, this.rng);
      }

      if (!def.flies) {
        const groundY = this.world.findHighestSolidY(Math.round(updated.x), Math.round(updated.z));
        updated.y = groundY + 1;
      }

      const dx = updated.x - playerPos.x;
      const dz = updated.z - playerPos.z;
      if (dx * dx + dz * dz > DESPAWN_RADIUS * DESPAWN_RADIUS) {
        this.removeVisual(updated.id);
        continue;
      }

      next.push(updated);
      const visual = this.visuals.get(updated.id);
      if (visual) {
        visual.root.position.set(updated.x, updated.y, updated.z);
        visual.root.rotation.y = updated.yaw;
        animateEntityVisual(visual, updated.kind, this.time, updated.state === "wander" || updated.state === "chase");
      }
    }
    this.entities = next;
  }

  /** プレイヤーの正面付近・近距離にいる攻撃可能な生物を1体だけ選ぶ (見つからなければ null)。 */
  findAttackTarget(playerPos: Vec3Like, forward: { x: number; z: number }): EntityRuntime | null {
    let best: EntityRuntime | null = null;
    let bestDist = Infinity;
    for (const e of this.entities) {
      const dx = e.x - playerPos.x;
      const dz = e.z - playerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > ATTACK_REACH) continue;
      if (dist > 0.001) {
        const dot = (dx / dist) * forward.x + (dz / dist) * forward.z;
        if (dot < ATTACK_CONE_COS) continue;
      }
      if (dist < bestDist) {
        bestDist = dist;
        best = e;
      }
    }
    return best;
  }

  /**
   * 友好的な生物に植物繊維を与えて繁殖させる (最小限の実用的な繁殖インタラクション)。
   * 対象が存在しない/友好的でない/上限に達している場合は false を返す。
   */
  tryBreed(id: number): boolean {
    const entity = this.entities.find((e) => e.id === id);
    if (!entity) return false;
    const def = getEntityDef(entity.kind);
    if (def.temperament !== "friendly") return false;
    if (this.countByTemperament("friendly") >= MAX_FRIENDLY) return false;
    const angle = this.rng() * Math.PI * 2;
    const x = entity.x + Math.cos(angle) * 1.2;
    const z = entity.z + Math.sin(angle) * 1.2;
    const y = this.world.findHighestSolidY(Math.round(x), Math.round(z)) + 1;
    this.spawnEntity(def.kind, x, y, z);
    return true;
  }

  /** 指定IDの生物にダメージを与える。死亡した場合はドロップ品を計算して除去する。 */
  damageEntity(id: number, amount: number): AttackResult | null {
    const idx = this.entities.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    const entity = this.entities[idx];
    if (!entity) return null;
    const def = getEntityDef(entity.kind);
    const updated = applyDamageToEntity(entity, amount);
    if (updated.state === "dead") {
      const drops = def.drops
        .filter((d) => this.rng() < d.chance)
        .map((d) => ({ key: d.key, count: rollDropCount(d, this.rng()) }));
      this.removeVisual(id);
      this.entities.splice(idx, 1);
      return { kind: def.kind, nameJa: def.nameJa, died: true, drops };
    }
    this.entities[idx] = updated;
    return { kind: def.kind, nameJa: def.nameJa, died: false, drops: [] };
  }

  get liveCount(): number {
    return this.entities.length;
  }

  dispose(): void {
    for (const id of Array.from(this.visuals.keys())) this.removeVisual(id);
    this.entities = [];
  }
}
