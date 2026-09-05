/**
 * ターゲットブロックや範囲選択を示すワイヤーフレームのハイライト表示。
 */
import * as THREE from "three";
import type { SelectionBounds } from "../core/selection";

export function createBlockHighlight(): THREE.LineSegments {
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
  const mat = new THREE.LineBasicMaterial({ color: 0x111111, linewidth: 2 });
  const lines = new THREE.LineSegments(geo, mat);
  lines.visible = false;
  return lines;
}

export function positionBlockHighlight(lines: THREE.Object3D, x: number, y: number, z: number): void {
  lines.position.set(x + 0.5, y + 0.5, z + 0.5);
  lines.visible = true;
}

export function createSelectionHighlight(): THREE.LineSegments {
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const mat = new THREE.LineBasicMaterial({ color: 0xffcc00, linewidth: 2 });
  const lines = new THREE.LineSegments(geo, mat);
  lines.visible = false;
  return lines;
}

export function positionSelectionHighlight(lines: THREE.Object3D, bounds: SelectionBounds): void {
  const sizeX = bounds.max.x - bounds.min.x + 1;
  const sizeY = bounds.max.y - bounds.min.y + 1;
  const sizeZ = bounds.max.z - bounds.min.z + 1;
  lines.scale.set(sizeX, sizeY, sizeZ);
  lines.position.set(bounds.min.x + sizeX / 2, bounds.min.y + sizeY / 2, bounds.min.z + sizeZ / 2);
  lines.visible = true;
}
