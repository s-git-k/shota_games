import * as THREE from 'three'

export function createWorld(bounds) {
  const world = new THREE.Group()
  world.background = new THREE.Color('#061126')
  const ground = new THREE.Mesh(new THREE.CircleGeometry(bounds, 64), new THREE.MeshStandardMaterial({ color: '#0a2340', roughness: 0.85, metalness: 0.2 }))
  ground.rotation.x = -Math.PI / 2
  world.add(ground, new THREE.HemisphereLight('#8bd8ff', '#030614', 2))
  const grid = new THREE.GridHelper(bounds * 2, 24, '#1d7090', '#124663')
  grid.position.y = 0.015
  world.add(grid)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(bounds, 0.12, 8, 80), new THREE.MeshBasicMaterial({ color: '#47c9ef', transparent: true, opacity: 0.5 }))
  rim.rotation.x = Math.PI / 2
  world.add(rim)
  for (let i = 0; i < 34; i += 1) {
    const angle = i * 2.4
    const radius = 2 + ((i * 7) % 95) / 10
    const star = new THREE.Mesh(new THREE.SphereGeometry(0.025 + (i % 3) * 0.015), new THREE.MeshBasicMaterial({ color: i % 4 ? '#5bd9ff' : '#ffc65b' }))
    star.position.set(Math.cos(angle) * radius, 0.04, Math.sin(angle) * radius)
    world.add(star)
  }
  return world
}
