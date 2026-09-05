import './style.css'
import { Game } from './game/Game.js'
import { gameConfig } from './game/config.js'
import { GameUI } from './ui/GameUI.js'

const canvas = document.querySelector('#game-canvas')
const ui = new GameUI(document)
const game = new Game(canvas, gameConfig, ui)

ui.onAction(() => game.start())
game.animate()
