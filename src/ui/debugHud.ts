/**
 * 軽量な実行時デバッグHUD (Phase 5)。
 * FPS/ロード済みチャンク数/キュー待ちチャンク数/生存生物数/描画コール数・三角形数を表示する。
 * 既定は非表示 (設定で切り替え、ワールドをまたいで永続化される)。
 * 無効時はGame側でupdate()自体を呼ばないため、追加コストはほぼゼロになる。
 */
export interface DebugHudStats {
  fps: number;
  loadedChunks: number;
  queuedChunks: number;
  entityCount: number;
  drawCalls?: number;
  triangles?: number;
}

export class DebugHud {
  readonly root: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "debug-hud";
    this.root.style.display = "none";
    parent.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? "block" : "none";
  }

  get visible(): boolean {
    return this.root.style.display !== "none";
  }

  update(stats: DebugHudStats): void {
    const lines = [
      `FPS: ${stats.fps.toFixed(0)}`,
      `Chunks loaded: ${stats.loadedChunks}`,
      `Chunks queued: ${stats.queuedChunks}`,
      `Entities: ${stats.entityCount}`
    ];
    if (stats.drawCalls !== undefined) lines.push(`Draw calls: ${stats.drawCalls}`);
    if (stats.triangles !== undefined) lines.push(`Triangles: ${stats.triangles}`);
    this.root.textContent = lines.join("\n");
  }

  dispose(): void {
    this.root.remove();
  }
}
