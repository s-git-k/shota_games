import { describe, expect, it } from "vitest";
import {
  applyDamageToEntity,
  canSpawnHostileAt,
  createEntityRuntime,
  pickSpawnOffset,
  resetEntityIdCounterForTests,
  shouldAttemptSpawn,
  stepFriendlyWander,
  stepHostileAI
} from "../src/core/entityAI";
import { getEntityDef } from "../src/core/entities";

function fixedRng(value: number): () => number {
  return () => value;
}

describe("entityAI", () => {
  it("createEntityRuntime は種類ごとの最大HPで初期化する", () => {
    resetEntityIdCounterForTests();
    const slime = createEntityRuntime("slime", 0, 0, 0);
    expect(slime.hp).toBe(getEntityDef("slime").maxHp);
    expect(slime.state).toBe("idle");
  });

  it("createEntityRuntime は生成のたびに一意なIDを振る", () => {
    resetEntityIdCounterForTests();
    const a = createEntityRuntime("slime", 0, 0, 0);
    const b = createEntityRuntime("slime", 0, 0, 0);
    expect(a.id).not.toBe(b.id);
  });

  it("applyDamageToEntity はHPを減らし、0以下でdead状態にする", () => {
    resetEntityIdCounterForTests();
    const entity = createEntityRuntime("slime", 0, 0, 0);
    const damaged = applyDamageToEntity(entity, 3);
    expect(damaged.hp).toBe(entity.hp - 3);
    expect(damaged.state).not.toBe("dead");

    const killed = applyDamageToEntity(entity, 999);
    expect(killed.state).toBe("dead");
    expect(killed.hp).toBe(0);
  });

  it("applyDamageToEntity は既に死んでいる/0ダメージなら変化しない", () => {
    resetEntityIdCounterForTests();
    const entity = createEntityRuntime("slime", 0, 0, 0);
    expect(applyDamageToEntity(entity, 0)).toBe(entity);
    const dead = applyDamageToEntity(entity, 999);
    expect(applyDamageToEntity(dead, 5)).toBe(dead);
  });

  it("stepHostileAI は攻撃範囲内なら攻撃を行いdidAttack=trueを返す", () => {
    resetEntityIdCounterForTests();
    const slime = createEntityRuntime("slime", 0, 0, 0);
    const def = getEntityDef("slime");
    const playerPos = { x: def.attackRange * 0.5, y: 0, z: 0 };
    const result = stepHostileAI(slime, 0.1, playerPos, fixedRng(0.5));
    expect(result.didAttack).toBe(true);
    expect(result.entity.state).toBe("attack");
  });

  it("stepHostileAI は検知範囲外だとゆっくり徘徊するだけで攻撃しない", () => {
    resetEntityIdCounterForTests();
    const slime = createEntityRuntime("slime", 0, 0, 0);
    const def = getEntityDef("slime");
    const farAway = { x: def.detectRadius + 100, y: 0, z: 0 };
    const result = stepHostileAI(slime, 0.1, farAway, fixedRng(0.9));
    expect(result.didAttack).toBe(false);
    expect(result.entity.state).not.toBe("attack");
  });

  it("stepHostileAI は検知範囲内・攻撃範囲外だと追跡(chase)する", () => {
    resetEntityIdCounterForTests();
    const slime = createEntityRuntime("slime", 0, 0, 0);
    const def = getEntityDef("slime");
    const mid = { x: (def.attackRange + def.detectRadius) / 2, y: 0, z: 0 };
    const result = stepHostileAI(slime, 0.1, mid, fixedRng(0.5));
    expect(result.entity.state).toBe("chase");
    expect(result.entity.x).toBeGreaterThan(0); // プレイヤー方向へ移動している
  });

  it("すでに死んでいるエンティティはAIステップで何もしない", () => {
    resetEntityIdCounterForTests();
    const slime = createEntityRuntime("slime", 0, 0, 0);
    const dead = applyDamageToEntity(slime, 999);
    const result = stepHostileAI(dead, 0.1, { x: 0, y: 0, z: 0 }, fixedRng(0.5));
    expect(result.entity).toBe(dead);
    expect(result.didAttack).toBe(false);
  });

  it("stepFriendlyWander は死亡状態なら変化しない", () => {
    resetEntityIdCounterForTests();
    const sheep = createEntityRuntime("sheep", 0, 0, 0);
    const dead = applyDamageToEntity(sheep, 999);
    expect(stepFriendlyWander(dead, 0.1, fixedRng(0.5))).toBe(dead);
  });

  it("canSpawnHostileAt / pickSpawnOffset / shouldAttemptSpawn は決定論的に動く", () => {
    expect(canSpawnHostileAt(0.6, 60)).toBe(true);
    expect(canSpawnHostileAt(0.1, 60)).toBe(false);

    const offset = pickSpawnOffset(fixedRng(0), 5, 10);
    expect(offset.x).toBeCloseTo(5, 5);
    expect(offset.z).toBeCloseTo(0, 5);

    expect(shouldAttemptSpawn(fixedRng(0), 0.5)).toBe(true);
    expect(shouldAttemptSpawn(fixedRng(0.9), 0.5)).toBe(false);
  });
});
