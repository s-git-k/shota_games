import * as THREE from 'three'
import { createPlayer } from '../entities/player.js'
import { createLumen, createStorm } from '../entities/objects.js'
import { createWorld } from '../world/createWorld.js'
import { Input } from '../systems/Input.js'

export class Game {
  constructor(canvas, config, ui) {
    this.config = config
    this.ui = ui
    this.scene = new THREE.Scene()
    this.clock = new THREE.Clock()
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100)
    this.camera.position.set(0, 15, 15)
    this.camera.lookAt(0, 0, 0)
    this.input = new Input()
    this.running = false
    this.resize()
    addEventListener('resize', () => this.resize())
    this.buildStage()
    this.ui.showTitle(config.stage.name)
  }

  buildStage() {
    this.scene.clear()
    this.scene.add(createWorld(this.config.stage.bounds))
    this.player = createPlayer()
    this.scene.add(this.player)
    this.lumens = this.config.stage.lumens.map((position) => createLumen(position))
    this.storms = this.config.stage.storms.map((storm) => createStorm(storm))
    this.lumens.forEach((lumen) => this.scene.add(lumen))
    this.storms.forEach((storm) => this.scene.add(storm))
  }

  start() {
    this.buildStage()
    this.remaining = this.config.duration
    this.collected = 0
    this.running = true
    this.clock.start()
    this.ui.playing(this.collected, this.config.stage.requiredLumens, this.remaining)
  }

  update(delta) {
    if (!this.running) return
    this.remaining -= delta
    const direction = this.input.direction()
    if (direction.lengthSq()) {
      direction.normalize().multiplyScalar(this.config.player.speed * delta)
      this.player.position.add(direction)
      const edge = this.config.stage.bounds - 0.7
      this.player.position.x = THREE.MathUtils.clamp(this.player.position.x, -edge, edge)
      this.player.position.z = THREE.MathUtils.clamp(this.player.position.z, -edge, edge)
      this.player.rotation.y = Math.atan2(direction.x, direction.z)
    }
    this.player.children[1].rotation.y += delta * 5
    this.lumens.forEach((lumen) => {
      lumen.rotation.y += delta * 1.8
      lumen.position.y = 0.7 + Math.sin(performance.now() * 0.003 + lumen.userData.phase) * 0.18
      if (lumen.visible && lumen.position.distanceTo(this.player.position) < 1.05) {
        lumen.visible = false
        this.collected += 1
      }
    })
    const elapsed = this.config.duration - this.remaining
    this.storms.forEach((storm) => {
      storm.rotation.y += delta * storm.userData.speed
      storm.children[1].rotation.z -= delta * storm.userData.speed
      if (storm.position.distanceTo(this.player.position) < storm.userData.radius + this.config.player.radius) this.finish(false)
    })
    if (this.collected >= this.config.stage.requiredLumens) this.finish(true)
    if (this.remaining <= 0) this.finish(false)
    this.ui.update(this.collected, this.config.stage.requiredLumens, Math.max(0, this.remaining))
  }

  finish(success) {
    if (!this.running) return
    this.running = false
    this.ui.showResult(success, this.collected, this.config.stage.requiredLumens)
  }

  animate() {
    requestAnimationFrame(() => this.animate())
    this.update(Math.min(this.clock.getDelta(), 0.05))
    this.renderer.render(this.scene, this.camera)
  }

  resize() {
    const { innerWidth: width, innerHeight: height } = window
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }
}
