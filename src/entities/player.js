import * as THREE from 'three'

export function createPlayer() {
  const player = new THREE.Group()
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.4, 5), new THREE.MeshStandardMaterial({ color: '#e7f8ff', emissive: '#3fa9f5', emissiveIntensity: 0.55, flatShading: true }))
  body.position.y = 0.75
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.05, 8, 32), new THREE.MeshBasicMaterial({ color: '#9be8ff' }))
  halo.position.y = 1.25
  halo.rotation.x = Math.PI / 2
  const light = new THREE.PointLight('#6de3ff', 4, 5)
  light.position.y = 1.5
  player.add(body, halo, light)
  return player
}
