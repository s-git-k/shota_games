/**
 * Three.js の基本シーン構築: レンダラー、明るいファンタジー調の空、ライティング。
 */
import * as THREE from "three";

export interface SceneSetup {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  hemiLight: THREE.HemisphereLight;
  sunLight: THREE.DirectionalLight;
}

export function createSceneSetup(canvas: HTMLCanvasElement): SceneSetup {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  // 明るく親しみやすいファンタジー世界: 淡い水色の空 + 遠景フォグ
  scene.background = new THREE.Color(0x9fd8ff);
  scene.fog = new THREE.Fog(0xbfe8ff, 40, 160);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 400);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x7a8f5a, 0.9);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfff6e0, 1.1);
  sunLight.position.set(60, 100, 40);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));

  return { renderer, scene, camera, hemiLight, sunLight };
}

export function resizeToWindow(setup: SceneSetup): void {
  const { renderer, camera } = setup;
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, true);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
