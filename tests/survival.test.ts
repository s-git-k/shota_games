import { describe, expect, it } from "vitest";
import {
  MAX_HEALTH,
  MAX_HUNGER,
  SAFE_FALL_DISTANCE,
  applyDamage,
  applyFallDamage,
  calculateFallDamage,
  clampStats,
  createInitialSurvivalStats,
  feed,
  heal,
  isAlive,
  tickSurvival
} from "../src/core/survival";

describe("survival", () => {
  it("初期状態は満タンの体力/満腹度", () => {
    const stats = createInitialSurvivalStats();
    expect(stats.health).toBe(MAX_HEALTH);
    expect(stats.hunger).toBe(MAX_HUNGER);
    expect(isAlive(stats)).toBe(true);
  });

  it("clampStats は範囲外の値を丸める", () => {
    const stats = clampStats({ health: -5, hunger: 999, hungerAccumulator: 0, regenAccumulator: 0, starvationAccumulator: 0 });
    expect(stats.health).toBe(0);
    expect(stats.hunger).toBe(MAX_HUNGER);
  });

  it("applyDamage は体力を減らし、0未満にはしない", () => {
    const stats = createInitialSurvivalStats();
    const damaged = applyDamage(stats, 5);
    expect(damaged.health).toBe(MAX_HEALTH - 5);
    const overDamaged = applyDamage(stats, 999);
    expect(overDamaged.health).toBe(0);
    expect(isAlive(overDamaged)).toBe(false);
  });

  it("applyDamage は0以下のダメージで変化しない", () => {
    const stats = createInitialSurvivalStats();
    expect(applyDamage(stats, 0)).toBe(stats);
    expect(applyDamage(stats, -1)).toBe(stats);
  });

  it("heal/feed は上限を超えない", () => {
    const stats = createInitialSurvivalStats();
    expect(heal(stats, 100).health).toBe(MAX_HEALTH);
    expect(feed(stats, 100).hunger).toBe(MAX_HUNGER);
  });

  it("calculateFallDamage は安全距離以下でダメージなし", () => {
    expect(calculateFallDamage(SAFE_FALL_DISTANCE)).toBe(0);
    expect(calculateFallDamage(0)).toBe(0);
  });

  it("calculateFallDamage は安全距離を超えた分だけダメージを与える", () => {
    const damage = calculateFallDamage(SAFE_FALL_DISTANCE + 2);
    expect(damage).toBeGreaterThan(0);
  });

  it("calculateFallDamage は上限を超えない", () => {
    const damage = calculateFallDamage(1000);
    expect(damage).toBeLessThanOrEqual(12);
  });

  it("applyFallDamage は落下距離からダメージを算出して適用する", () => {
    const stats = createInitialSurvivalStats();
    const { stats: next, damage } = applyFallDamage(stats, SAFE_FALL_DISTANCE + 4);
    expect(damage).toBeGreaterThan(0);
    expect(next.health).toBe(MAX_HEALTH - damage);
  });

  it("tickSurvival は時間経過で空腹が減っていく", () => {
    let stats = createInitialSurvivalStats();
    stats = tickSurvival(stats, 45 * 1); // HUNGER_DEPLETION_SECONDS_PER_POINT ちょうど
    expect(stats.hunger).toBe(MAX_HUNGER - 1);
  });

  it("tickSurvival は空腹0が続くと飢餓ダメージを与える", () => {
    let stats = { health: MAX_HEALTH, hunger: 0, hungerAccumulator: 0, regenAccumulator: 0, starvationAccumulator: 0 };
    stats = tickSurvival(stats, 4); // STARVATION_DAMAGE_SECONDS
    expect(stats.health).toBeLessThan(MAX_HEALTH);
  });

  it("tickSurvival は満腹度が高いときに体力を自然回復させる", () => {
    let stats = { health: 10, hunger: MAX_HUNGER, hungerAccumulator: 0, regenAccumulator: 0, starvationAccumulator: 0 };
    stats = tickSurvival(stats, 6); // REGEN_SECONDS_PER_POINT
    expect(stats.health).toBe(11);
  });

  it("tickSurvival は死亡状態 (health<=0) では何もしない", () => {
    const stats = { health: 0, hunger: MAX_HUNGER, hungerAccumulator: 0, regenAccumulator: 0, starvationAccumulator: 0 };
    const next = tickSurvival(stats, 100);
    expect(next).toBe(stats);
  });
});
