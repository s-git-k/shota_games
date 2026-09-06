/**
 * 設定パネル: 操作(キー割り当て)・グラフィック・音量・アクセシビリティ。
 */
import { ACTION_LABELS_JA, clampSettings, type ActionId, type GameSettings, type QualityLevel } from "../core/settings";
import type { InputManager } from "../input/inputManager";
import { openModal } from "./modal";
import { el, button } from "./dom";
import { showToast } from "./notifications";

function labelForCode(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const specialLabels: Record<string, string> = {
    Space: "スペース",
    ShiftLeft: "左Shift",
    ShiftRight: "右Shift",
    ControlLeft: "左Ctrl",
    ControlRight: "右Ctrl",
    Escape: "Esc"
  };
  return specialLabels[code] ?? code;
}

function sliderRow(
  parent: HTMLElement,
  labelText: string,
  min: number,
  max: number,
  step: number,
  value: number,
  onInput: (v: number) => void
): HTMLInputElement {
  const row = el("div", "settings-row");
  row.appendChild(el("label", "settings-label", labelText));
  const input = el("input", "settings-slider") as HTMLInputElement;
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const valueLabel = el("span", "settings-value", value.toFixed(2));
  input.addEventListener("input", () => {
    const v = Number(input.value);
    valueLabel.textContent = v.toFixed(2);
    onInput(v);
  });
  row.appendChild(input);
  row.appendChild(valueLabel);
  parent.appendChild(row);
  return input;
}

export function openSettingsPanel(
  current: GameSettings,
  inputManager: InputManager,
  onChange: (settings: GameSettings) => void
): void {
  let settings: GameSettings = { ...current, keyBindings: { ...current.keyBindings } };

  const modal = openModal("設定");

  modal.body.appendChild(el("h3", "settings-section-title", "画面・操作性"));
  sliderRow(modal.body, "視野角 (FOV)", 50, 110, 1, settings.fovDeg, (v) => {
    settings = { ...settings, fovDeg: v };
    onChange(clampSettings(settings));
  });
  sliderRow(modal.body, "マウス感度", 0.05, 2, 0.05, settings.mouseSensitivity, (v) => {
    settings = { ...settings, mouseSensitivity: v };
    onChange(clampSettings(settings));
  });
  sliderRow(modal.body, "描画距離 (チャンク数)", 2, 12, 1, settings.renderDistanceChunks, (v) => {
    settings = { ...settings, renderDistanceChunks: Math.round(v) };
    onChange(clampSettings(settings));
  });

  const qualityRow = el("div", "settings-row");
  qualityRow.appendChild(el("label", "settings-label", "画質"));
  const qualitySelect = el("select", "settings-select") as HTMLSelectElement;
  const qualityOptions: Array<[QualityLevel, string]> = [
    ["low", "低 (軽量)"],
    ["medium", "中 (標準)"],
    ["high", "高 (きれい)"]
  ];
  for (const [value, labelText] of qualityOptions) {
    const opt = el("option", undefined, labelText) as HTMLOptionElement;
    opt.value = value;
    if (value === settings.quality) opt.selected = true;
    qualitySelect.appendChild(opt);
  }
  qualitySelect.addEventListener("change", () => {
    settings = { ...settings, quality: qualitySelect.value as QualityLevel };
    onChange(clampSettings(settings));
  });
  qualityRow.appendChild(qualitySelect);
  modal.body.appendChild(qualityRow);

  modal.body.appendChild(el("h3", "settings-section-title", "音量"));
  sliderRow(modal.body, "マスター音量", 0, 1, 0.05, settings.masterVolume, (v) => {
    settings = { ...settings, masterVolume: v };
    onChange(clampSettings(settings));
  });
  sliderRow(modal.body, "BGM音量", 0, 1, 0.05, settings.musicVolume, (v) => {
    settings = { ...settings, musicVolume: v };
    onChange(clampSettings(settings));
  });
  sliderRow(modal.body, "SE音量", 0, 1, 0.05, settings.sfxVolume, (v) => {
    settings = { ...settings, sfxVolume: v };
    onChange(clampSettings(settings));
  });

  modal.body.appendChild(el("h3", "settings-section-title", "アクセシビリティ"));
  const checkboxRow = (labelText: string, checked: boolean, onChangeCb: (v: boolean) => void): void => {
    const row = el("div", "settings-row");
    const label = el("label", "settings-checkbox-label");
    const input = el("input") as HTMLInputElement;
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onChangeCb(input.checked));
    label.appendChild(input);
    label.appendChild(document.createTextNode(labelText));
    row.appendChild(label);
    modal.body.appendChild(row);
  };
  checkboxRow("カメラシェイクを有効にする", settings.cameraShake, (v) => {
    settings = { ...settings, cameraShake: v };
    onChange(clampSettings(settings));
  });
  checkboxRow("視覚効果を控えめにする (Reduced Motion)", settings.reducedMotion, (v) => {
    settings = { ...settings, reducedMotion: v };
    onChange(clampSettings(settings));
  });
  checkboxRow("タッチ操作UIを表示する", settings.touchControlsEnabled, (v) => {
    settings = { ...settings, touchControlsEnabled: v };
    onChange(clampSettings(settings));
  });
  checkboxRow("デバッグ情報を表示する (FPS/チャンク数/生物数など)", settings.debugHudEnabled, (v) => {
    settings = { ...settings, debugHudEnabled: v };
    onChange(clampSettings(settings));
  });

  modal.body.appendChild(el("h3", "settings-section-title", "キー割り当て"));
  modal.body.appendChild(el("p", "modal-hint", "ボタンを押してから、割り当てたいキーを押してください。"));
  const keyList = el("div", "keybind-list");
  const actionIds = Object.keys(settings.keyBindings) as ActionId[];
  for (const action of actionIds) {
    const row = el("div", "keybind-row");
    row.appendChild(el("span", "keybind-action-label", ACTION_LABELS_JA[action]));
    const rebindBtn = button(labelForCode(settings.keyBindings[action] ?? ""), "btn btn-secondary keybind-btn");
    rebindBtn.addEventListener("click", () => {
      rebindBtn.textContent = "キーを押してください…";
      rebindBtn.classList.add("keybind-capturing");
      inputManager.captureNextKey((code) => {
        settings = { ...settings, keyBindings: { ...settings.keyBindings, [action]: code } };
        rebindBtn.textContent = labelForCode(code);
        rebindBtn.classList.remove("keybind-capturing");
        onChange(clampSettings(settings));
        showToast(`「${ACTION_LABELS_JA[action]}」を ${labelForCode(code)} に割り当てました。`, "success");
      });
    });
    row.appendChild(rebindBtn);
    keyList.appendChild(row);
  }
  modal.body.appendChild(keyList);
}
