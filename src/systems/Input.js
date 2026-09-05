import * as THREE from 'three'

export class Input {
  constructor() {
    this.keys = new Set()
    addEventListener('keydown', ({ key }) => this.keys.add(key.toLowerCase()))
    addEventListener('keyup', ({ key }) => this.keys.delete(key.toLowerCase()))
  }

  direction() {
    return new THREE.Vector3(
      (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0),
      0,
      (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) - (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0),
    )
  }
}
