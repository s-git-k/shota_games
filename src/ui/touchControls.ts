/**
 * タッチスクリーン向けの直接入力UI。
 * 左: 仮想ジョイスティック (移動), 右: ドラッグでカメラ操作, 破壊/設置ボタン。
 * タッチ非対応環境では自動的に隠れる (設定でも切り替え可能)。
 */
import type { MoveInput } from "../game/player";

export function isTouchCapable(): boolean {
  return navigator.maxTouchPoints > 0 || "ontouchstart" in window;
}

export class TouchControls {
  readonly root: HTMLDivElement;
  private joystickBase: HTMLDivElement;
  private joystickKnob: HTMLDivElement;
  private lookZone: HTMLDivElement;
  private jumpButton: HTMLButtonElement;
  private breakButton: HTMLButtonElement;
  private placeButton: HTMLButtonElement;
  private interactButton: HTMLButtonElement;
  private flyButton: HTMLButtonElement;

  private joystickTouchId: number | null = null;
  private joystickOrigin = { x: 0, y: 0 };
  private analog = { x: 0, z: 0 };
  private lookTouchId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private pendingLook = { dx: 0, dy: 0 };
  private jumpHeld = false;

  private breakCallback: (() => void) | null = null;
  private placeCallback: (() => void) | null = null;
  private interactCallback: (() => void) | null = null;
  private flyCallback: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "touch-controls";

    this.lookZone = document.createElement("div");
    this.lookZone.className = "touch-look-zone";
    this.root.appendChild(this.lookZone);

    this.joystickBase = document.createElement("div");
    this.joystickBase.className = "touch-joystick-base";
    this.joystickKnob = document.createElement("div");
    this.joystickKnob.className = "touch-joystick-knob";
    this.joystickBase.appendChild(this.joystickKnob);
    this.root.appendChild(this.joystickBase);

    const actionCluster = document.createElement("div");
    actionCluster.className = "touch-action-cluster";

    this.breakButton = document.createElement("button");
    this.breakButton.className = "touch-btn touch-btn-break";
    this.breakButton.type = "button";
    this.breakButton.textContent = "壊す";
    this.breakButton.setAttribute("aria-label", "ブロックを壊す");

    this.placeButton = document.createElement("button");
    this.placeButton.className = "touch-btn touch-btn-place";
    this.placeButton.type = "button";
    this.placeButton.textContent = "置く";
    this.placeButton.setAttribute("aria-label", "ブロックを置く");

    this.interactButton = document.createElement("button");
    this.interactButton.className = "touch-btn touch-btn-interact";
    this.interactButton.type = "button";
    this.interactButton.textContent = "使う";
    this.interactButton.setAttribute("aria-label", "使う / スイッチ操作 / ドア開閉");

    this.jumpButton = document.createElement("button");
    this.jumpButton.className = "touch-btn touch-btn-jump";
    this.jumpButton.type = "button";
    this.jumpButton.textContent = "▲";
    this.jumpButton.setAttribute("aria-label", "ジャンプ / 上昇");

    this.flyButton = document.createElement("button");
    this.flyButton.className = "touch-btn touch-btn-fly";
    this.flyButton.type = "button";
    this.flyButton.textContent = "飛行";
    this.flyButton.setAttribute("aria-label", "飛行切り替え");

    actionCluster.appendChild(this.breakButton);
    actionCluster.appendChild(this.placeButton);
    actionCluster.appendChild(this.interactButton);
    actionCluster.appendChild(this.jumpButton);
    actionCluster.appendChild(this.flyButton);
    this.root.appendChild(actionCluster);

    parent.appendChild(this.root);
    this.attachEvents();
  }

  onBreak(cb: () => void): void {
    this.breakCallback = cb;
  }

  onPlace(cb: () => void): void {
    this.placeCallback = cb;
  }

  onInteract(cb: () => void): void {
    this.interactCallback = cb;
  }

  onToggleFly(cb: () => void): void {
    this.flyCallback = cb;
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? "block" : "none";
  }

  private attachEvents(): void {
    this.joystickBase.addEventListener("touchstart", this.onJoystickStart, { passive: false });
    window.addEventListener("touchmove", this.onJoystickMove, { passive: false });
    window.addEventListener("touchend", this.onJoystickEnd);
    window.addEventListener("touchcancel", this.onJoystickEnd);

    this.lookZone.addEventListener("touchstart", this.onLookStart, { passive: false });
    window.addEventListener("touchmove", this.onLookMove, { passive: false });
    window.addEventListener("touchend", this.onLookEnd);
    window.addEventListener("touchcancel", this.onLookEnd);

    this.breakButton.addEventListener("touchstart", (e) => {
      e.preventDefault();
      this.breakCallback?.();
    });
    this.placeButton.addEventListener("touchstart", (e) => {
      e.preventDefault();
      this.placeCallback?.();
    });
    this.interactButton.addEventListener("touchstart", (e) => {
      e.preventDefault();
      this.interactCallback?.();
    });
    this.jumpButton.addEventListener("touchstart", (e) => {
      e.preventDefault();
      this.jumpHeld = true;
    });
    this.jumpButton.addEventListener("touchend", () => {
      this.jumpHeld = false;
    });
    this.flyButton.addEventListener("touchstart", (e) => {
      e.preventDefault();
      this.flyCallback?.();
    });
  }

  private onJoystickStart = (e: TouchEvent): void => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    if (!touch) return;
    this.joystickTouchId = touch.identifier;
    const rect = this.joystickBase.getBoundingClientRect();
    this.joystickOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  private onJoystickMove = (e: TouchEvent): void => {
    if (this.joystickTouchId === null) return;
    for (const touch of Array.from(e.changedTouches)) {
      if (touch.identifier !== this.joystickTouchId) continue;
      e.preventDefault();
      const maxRadius = 45;
      let dx = touch.clientX - this.joystickOrigin.x;
      let dy = touch.clientY - this.joystickOrigin.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }
      this.joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.analog = { x: dx / maxRadius, z: dy / maxRadius };
    }
  };

  private onJoystickEnd = (e: TouchEvent): void => {
    for (const touch of Array.from(e.changedTouches)) {
      if (touch.identifier !== this.joystickTouchId) continue;
      this.joystickTouchId = null;
      this.analog = { x: 0, z: 0 };
      this.joystickKnob.style.transform = "translate(0px, 0px)";
    }
  };

  private onLookStart = (e: TouchEvent): void => {
    const touch = e.changedTouches[0];
    if (!touch) return;
    e.preventDefault();
    this.lookTouchId = touch.identifier;
    this.lookLast = { x: touch.clientX, y: touch.clientY };
  };

  private onLookMove = (e: TouchEvent): void => {
    if (this.lookTouchId === null) return;
    for (const touch of Array.from(e.changedTouches)) {
      if (touch.identifier !== this.lookTouchId) continue;
      e.preventDefault();
      this.pendingLook.dx += touch.clientX - this.lookLast.x;
      this.pendingLook.dy += touch.clientY - this.lookLast.y;
      this.lookLast = { x: touch.clientX, y: touch.clientY };
    }
  };

  private onLookEnd = (e: TouchEvent): void => {
    for (const touch of Array.from(e.changedTouches)) {
      if (touch.identifier !== this.lookTouchId) continue;
      this.lookTouchId = null;
    }
  };

  consumeLookDelta(sensitivity: number): { dx: number; dy: number } {
    const dx = this.pendingLook.dx * sensitivity * 0.003;
    const dy = this.pendingLook.dy * sensitivity * 0.003;
    this.pendingLook = { dx: 0, dy: 0 };
    return { dx, dy };
  }

  applyToMoveInput(base: MoveInput): MoveInput {
    if (this.analog.x === 0 && this.analog.z === 0 && !this.jumpHeld) {
      return base;
    }
    return {
      ...base,
      analogX: this.analog.x,
      analogZ: this.analog.z,
      jump: base.jump || this.jumpHeld
    };
  }

  dispose(): void {
    this.joystickBase.removeEventListener("touchstart", this.onJoystickStart);
    window.removeEventListener("touchmove", this.onJoystickMove);
    window.removeEventListener("touchend", this.onJoystickEnd);
    window.removeEventListener("touchcancel", this.onJoystickEnd);
    this.lookZone.removeEventListener("touchstart", this.onLookStart);
    window.removeEventListener("touchmove", this.onLookMove);
    window.removeEventListener("touchend", this.onLookEnd);
    window.removeEventListener("touchcancel", this.onLookEnd);
    this.root.remove();
  }
}
