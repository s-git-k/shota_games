import * as THREE from 'three'

export function createLumen([x, z]) {
  const lumen = new THREE.Group()
  lumen.position.set(x, 0.7, z)
  lumen.userData.phase = Math.random() * Math.PI * 2
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), new THREE.MeshStandardMaterial({ color: '#fff1a8', emissive: '#ffad3d', emissiveIntensity: 2, flatShading: true }))
  const rings = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.025, 6, 24), new THREE.MeshBasicMaterial({ color: '#ffd35b', transparent: true, opacity: 0.7 }))
  rings.rotation.x = Math.PI / 2
  lumen.add(gem, rings, new THREE.PointLight('#ffb347', 2, 3))
  return lumen
}

export function createStorm({ position: [x, z], radius, speed }) {
  const storm = new THREE.Group()
  storm.position.set(x, 0.12, z)
  storm.userData = { radius, speed }
  const core = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.45, 16, 12), new THREE.MeshStandardMaterial({ color: '#30194f', emissive: '#6b35a6', emissiveIntensity: 0.8 }))
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.1, 8, 36), new THREE.MeshBasicMaterial({ color: '#c064ff', transparent: true, opacity: 0.82 }))
  ring.rotation.x = Math.PI / 2
  storm.add(core, ring, new THREE.PointLight('#8e44d4', 1.5, 3))
  return storm
}
