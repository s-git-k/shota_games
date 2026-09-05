/**
 * 天候パーティクル (雨/雪) の表示。
 * ノートPCでも重くならないよう、固定数のパーティクルを使い回す (毎フレーム生成/破棄しない)。
 * プレイヤーカメラの周囲に追従する固定サイズの箱の中で降らせ、下に達したら上に戻す
 * ("雨/雪が降り続ける" ように見える簡易的なループ) ことで、ジオメトリの再構築を避ける。
 */
import * as THREE from "three";
import type { WeatherKind } from "../core/weather";

/** ノートPCでも滑らかに動く上限。天候の強さに応じて描画範囲だけを絞り込む。 */
const MAX_PARTICLES = 260;
/** パーティクルを降らせる範囲 (プレイヤー中心のローカル座標、ブロック単位)。 */
const SPREAD_XZ = 18;
const SPREAD_Y = 14;

export class WeatherEffects {
  private readonly points: THREE.Points;
  private readonly geometry: THREE.BufferGeometry;
  private readonly positionAttr: THREE.BufferAttribute;
  private readonly rainMaterial: THREE.PointsMaterial;
  private readonly snowMaterial: THREE.PointsMaterial;
  private readonly positions: Float32Array;
  private readonly fallSpeeds: Float32Array;
  private currentKind: WeatherKind = "clear";

  constructor(scene: THREE.Scene) {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.fallSpeeds = new Float32Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.resetParticle(i, true);
    }

    this.geometry = new THREE.BufferGeometry();
    this.positionAttr = new THREE.BufferAttribute(this.positions, 3);
    this.geometry.setAttribute("position", this.positionAttr);

    this.rainMaterial = new THREE.PointsMaterial({
      color: 0x9fd0ff,
      size: 0.12,
      transparent: true,
      opacity: 0.75,
      depthWrite: false
    });
    this.snowMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.18,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });

    this.points = new THREE.Points(this.geometry, this.rainMaterial);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  private resetParticle(i: number, initialRandomHeight: boolean): void {
    this.positions[i * 3] = (Math.random() - 0.5) * SPREAD_XZ * 2;
    this.positions[i * 3 + 1] = initialRandomHeight ? Math.random() * SPREAD_Y * 2 - SPREAD_Y : SPREAD_Y;
    this.positions[i * 3 + 2] = (Math.random() - 0.5) * SPREAD_XZ * 2;
    this.fallSpeeds[i] = 0.5 + Math.random() * 0.5;
  }

  /**
   * 天候パーティクルを更新する。
   * kind==="clear" または intensity<=0 のときは非表示にする (毎フレームのコストもほぼゼロになる)。
   */
  update(dt: number, cameraPosition: THREE.Vector3, kind: WeatherKind, intensity: number): void {
    if (kind === "clear" || intensity <= 0) {
      this.points.visible = false;
      return;
    }
    this.points.visible = true;
    this.points.position.copy(cameraPosition);

    if (kind !== this.currentKind) {
      this.points.material = kind === "snow" ? this.snowMaterial : this.rainMaterial;
      this.currentKind = kind;
    }

    const speedScale = kind === "snow" ? 2.2 : 9;
    const activeCount = Math.max(1, Math.round(MAX_PARTICLES * Math.min(1, Math.max(0, intensity))));
    this.geometry.setDrawRange(0, activeCount);

    for (let i = 0; i < activeCount; i++) {
      const idx = i * 3 + 1;
      this.positions[idx] = (this.positions[idx] ?? 0) - (this.fallSpeeds[i] ?? 0.5) * speedScale * dt;
      if (kind === "snow") {
        // 雪は少し横に揺れながら降る
        const xIdx = i * 3;
        this.positions[xIdx] = (this.positions[xIdx] ?? 0) + Math.sin(performance.now() * 0.001 + i) * 0.01;
      }
      if ((this.positions[idx] ?? 0) < -SPREAD_Y) {
        this.resetParticle(i, false);
      }
    }
    this.positionAttr.needsUpdate = true;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.points);
    this.geometry.dispose();
    this.rainMaterial.dispose();
    this.snowMaterial.dispose();
  }
}
