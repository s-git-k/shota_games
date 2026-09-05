/**
 * キーボード・マウス入力の一元管理。
 * 設定のキーバインドを参照して離散アクション (トグル/取り消し等) を発火し、
 * 移動用の入力スナップショットと、ポインターロックによる視点操作を提供する。
 */
import type { ActionId, GameSettings } from "../core/settings";
import type { MoveInput } from "../game/player";

type ActionListener = () => void;

export class InputManager {
  private pressedCodes = new Set<string>();
  private actionListeners = new Map<ActionId, ActionListener[]>();
  private keyBindings: Record<ActionId, string>;
  private pendingLookDx = 0;
  private pendingLookDy = 0;
  private captureCallback: ((code: string) => void) | null = null;
  private breakListeners: Array<() => void> = [];
  private placeListeners: Array<() => void> = [];
  private enabled = true;

  constructor(private readonly canvas: HTMLCanvasElement, initialBindings: Record<ActionId, string>) {
    this.keyBindings = { ...initialBindings };

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);

    canvas.addEventListener("mousedown", this.onMouseDown);
    canvas.addEventListener("contextmenu", this.onContextMenu);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.pressedCodes.clear();
  }

  updateBindings(bindings: Record<ActionId, string>): void {
    this.keyBindings = { ...bindings };
  }

  /** 次に押されたキーのコードを渡してもらう「再割り当てモード」。設定画面から使う。 */
  captureNextKey(callback: (code: string) => void): void {
    this.captureCallback = callback;
  }

  cancelCapture(): void {
    this.captureCallback = null;
  }

  on(action: ActionId, listener: ActionListener): void {
    const list = this.actionListeners.get(action) ?? [];
    list.push(listener);
    this.actionListeners.set(action, list);
  }

  onBreak(listener: () => void): void {
    this.breakListeners.push(listener);
  }

  onPlace(listener: () => void): void {
    this.placeListeners.push(listener);
  }

  private onBlur = (): void => {
    this.pressedCodes.clear();
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.captureCallback) {
      e.preventDefault();
      const cb = this.captureCallback;
      this.captureCallback = null;
      cb(e.code);
      return;
    }
    if (!this.enabled) return;
    if (!this.pressedCodes.has(e.code)) {
      this.dispatchActionsForCode(e.code);
    }
    this.pressedCodes.add(e.code);
    // ブラウザ標準のスクロール等を防ぐ (Space, 矢印キー等)
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.pressedCodes.delete(e.code);
  };

  private dispatchActionsForCode(code: string): void {
    for (const [action, boundCode] of Object.entries(this.keyBindings) as Array<[ActionId, string]>) {
      if (boundCode === code) {
        for (const listener of this.actionListeners.get(action) ?? []) listener();
      }
    }
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.enabled) return;
    if (document.pointerLockElement !== this.canvas) {
      this.requestPointerLock();
      return;
    }
    if (e.button === 0) {
      for (const l of this.breakListeners) l();
    } else if (e.button === 2) {
      for (const l of this.placeListeners) l();
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (document.pointerLockElement !== this.canvas) return;
    this.pendingLookDx += e.movementX;
    this.pendingLookDy += e.movementY;
  };

  private onPointerLockChange = (): void => {
    // UIから呼び出し側が pointerLocked() を見て判断できるようにするだけ
  };

  requestPointerLock(): void {
    this.canvas.requestPointerLock();
  }

  exitPointerLock(): void {
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  isPointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** 直近フレーム分のマウス移動量を取り出し、内部カウンタをリセットする。 */
  consumeLookDelta(sensitivity: number): { dx: number; dy: number } {
    const dx = this.pendingLookDx * sensitivity * 0.0022;
    const dy = this.pendingLookDy * sensitivity * 0.0022;
    this.pendingLookDx = 0;
    this.pendingLookDy = 0;
    return { dx, dy };
  }

  isActionKeyDown(action: ActionId): boolean {
    return this.pressedCodes.has(this.keyBindings[action]);
  }

  getMoveInput(): MoveInput {
    return {
      forward: this.isActionKeyDown("moveForward"),
      backward: this.isActionKeyDown("moveBackward"),
      left: this.isActionKeyDown("moveLeft"),
      right: this.isActionKeyDown("moveRight"),
      jump: this.isActionKeyDown("jumpOrUp"),
      descend: this.isActionKeyDown("flyDown"),
      sprint: this.isActionKeyDown("sprint")
    };
  }

  applySettings(settings: GameSettings): void {
    this.updateBindings(settings.keyBindings);
  }

  dispose(): void {
    this.enabled = false;
    this.pressedCodes.clear();
    this.captureCallback = null;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
  }
}
