/**
 * アバター作成パネル。
 * 写真は完全にブラウザ内で処理し、どこにもアップロードしない。
 * 顔認識やAI推論は一切行わず、単純な領域色平均から肌色・髪色の候補を提案するだけ。
 * その旨をUI上で明示する (誠実な説明義務)。
 */
import * as THREE from "three";
import { derivePaletteFromPixels, HAIR_STYLE_LABELS_JA, type AvatarConfig, type HairStyle } from "../core/avatar";
import { buildCharacter } from "../render/character";
import { openModal } from "./modal";
import { el, button } from "./dom";
import { showError, showToast } from "./notifications";

function colorToHex(n: number): string {
  return `#${n.toString(16).padStart(6, "0")}`;
}

function hexToColor(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

export function openAvatarCreator(current: AvatarConfig, onApply: (avatar: AvatarConfig) => void): void {
  let avatar: AvatarConfig = { ...current };

  const modal = openModal("アバター作成");

  modal.body.appendChild(
    el(
      "p",
      "avatar-disclaimer",
      "⚠ 写真は端末内だけで処理され、どこにも送信されません。顔認識やAIによる識別は行わず、写真の色の平均から" +
        "肌色・髪色のヒントを提案するだけの単純な処理です。実際の外見を再現するものではなく、あくまで" +
        "「スタイライズされた近似」であることをご了承ください。"
    )
  );

  const layout = el("div", "avatar-layout");
  modal.body.appendChild(layout);

  const previewCol = el("div", "avatar-preview-col");
  const previewCanvas = el("canvas", "avatar-preview-canvas") as HTMLCanvasElement;
  previewCanvas.width = 260;
  previewCanvas.height = 320;
  previewCol.appendChild(previewCanvas);
  layout.appendChild(previewCol);

  const controlsCol = el("div", "avatar-controls-col");
  layout.appendChild(controlsCol);

  // --- 写真から色を推定 ---
  controlsCol.appendChild(el("h3", "settings-section-title", "写真から色を提案 (任意)"));
  const photoInput = el("input") as HTMLInputElement;
  photoInput.type = "file";
  photoInput.accept = "image/*";
  photoInput.setAttribute("aria-label", "顔写真を選択 (端末内でのみ処理されます)");
  controlsCol.appendChild(photoInput);
  const hiddenCanvas = document.createElement("canvas");

  photoInput.addEventListener("change", () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const w = 128;
        const h = Math.round((img.height / img.width) * w) || 128;
        hiddenCanvas.width = w;
        hiddenCanvas.height = h;
        const ctx = hiddenCanvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D コンテキストを取得できませんでした。");
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        const palette = derivePaletteFromPixels(data.data, w, h);
        avatar = { ...avatar, skinColor: palette.skinColor, hairColor: palette.hairColor };
        skinColorInput.value = colorToHex(palette.skinColor);
        hairColorInput.value = colorToHex(palette.hairColor);
        rebuildPreview();
        showToast("写真から肌色・髪色の候補を反映しました。必要に応じて調整してください。", "success");
      } catch (err) {
        showError(`写真の解析に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      showError("画像の読み込みに失敗しました。別の画像で試してください。");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });

  // --- 髪型 ---
  controlsCol.appendChild(el("h3", "settings-section-title", "髪型"));
  const hairStyleSelect = el("select", "settings-select") as HTMLSelectElement;
  (Object.keys(HAIR_STYLE_LABELS_JA) as HairStyle[]).forEach((style) => {
    const opt = el("option", undefined, HAIR_STYLE_LABELS_JA[style]) as HTMLOptionElement;
    opt.value = style;
    if (style === avatar.hairStyle) opt.selected = true;
    hairStyleSelect.appendChild(opt);
  });
  hairStyleSelect.addEventListener("change", () => {
    avatar = { ...avatar, hairStyle: hairStyleSelect.value as HairStyle };
    rebuildPreview();
  });
  controlsCol.appendChild(hairStyleSelect);

  // --- 色 ---
  function colorRow(labelText: string, value: number, onInput: (hex: string) => void): HTMLInputElement {
    const row = el("div", "settings-row");
    row.appendChild(el("label", "settings-label", labelText));
    const input = el("input") as HTMLInputElement;
    input.type = "color";
    input.value = colorToHex(value);
    input.addEventListener("input", () => onInput(input.value));
    row.appendChild(input);
    controlsCol.appendChild(row);
    return input;
  }

  const hairColorInput = colorRow("髪の色", avatar.hairColor, (hex) => {
    avatar = { ...avatar, hairColor: hexToColor(hex) };
    rebuildPreview();
  });
  const skinColorInput = colorRow("肌の色", avatar.skinColor, (hex) => {
    avatar = { ...avatar, skinColor: hexToColor(hex) };
    rebuildPreview();
  });
  colorRow("服の色", avatar.clothesColor, (hex) => {
    avatar = { ...avatar, clothesColor: hexToColor(hex) };
    rebuildPreview();
  });

  const applyBtn = button("この見た目を適用する", "btn btn-primary");
  applyBtn.addEventListener("click", () => {
    onApply(avatar);
    showToast("アバターを更新しました。", "success");
    modal.close();
  });
  controlsCol.appendChild(applyBtn);

  // --- 3Dプレビュー ---
  const renderer = new THREE.WebGLRenderer({ canvas: previewCanvas, antialias: true, alpha: true });
  renderer.setSize(previewCanvas.width, previewCanvas.height, false);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, previewCanvas.width / previewCanvas.height, 0.1, 10);
  camera.position.set(0, 1.3, 3.2);
  camera.lookAt(0, 1.0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(2, 3, 2);
  scene.add(dir);

  let currentRoot: THREE.Object3D | null = null;
  function rebuildPreview(): void {
    if (currentRoot) {
      scene.remove(currentRoot);
    }
    const parts = buildCharacter(avatar);
    currentRoot = parts.root;
    scene.add(currentRoot);
  }
  rebuildPreview();

  let rafId = 0;
  let angle = 0;
  function animate(): void {
    angle += 0.01;
    if (currentRoot) currentRoot.rotation.y = angle;
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(animate);
  }
  animate();

  const originalClose = modal.close;
  modal.close = (): void => {
    cancelAnimationFrame(rafId);
    renderer.dispose();
    originalClose();
  };
}
