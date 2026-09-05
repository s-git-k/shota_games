export class GameUI {
  constructor(document) {
    this.overlay = document.querySelector('#overlay')
    this.title = document.querySelector('#overlay-title')
    this.message = document.querySelector('#overlay-message')
    this.kicker = document.querySelector('#overlay-kicker')
    this.button = document.querySelector('#action-button')
    this.fill = document.querySelector('#charge-fill')
    this.value = document.querySelector('#charge-value')
    this.timer = document.querySelector('#timer')
    this.hint = document.querySelector('#hint')
  }

  onAction(callback) { this.button.addEventListener('click', callback) }
  showTitle(stage) {
    this.kicker.textContent = stage.toUpperCase()
    this.title.innerHTML = 'LUMEN<br><em>DRIFT</em>'
    this.message.textContent = '漂うルーメンを集め、灯台の光を取り戻そう。'
    this.button.textContent = '航行を開始'
    this.overlay.hidden = false
  }
  playing(collected, needed, seconds) {
    this.overlay.hidden = true
    this.hint.hidden = false
    this.update(collected, needed, seconds)
  }
  update(collected, needed, seconds) {
    this.fill.style.width = `${(collected / needed) * 100}%`
    this.value.textContent = `${collected} / ${needed}`
    this.timer.textContent = `00:${String(Math.ceil(seconds)).padStart(2, '0')}`
  }
  showResult(success, collected, needed) {
    this.kicker.textContent = success ? 'BEACON LIT' : 'DRIFT LOST'
    this.title.innerHTML = success ? '夜明けを<br><em>灯した</em>' : '光はまだ<br><em>遠い</em>'
    this.message.textContent = success ? `ルーメンを ${collected} 個集め、灯台が目を覚ました。` : `${collected} / ${needed} のルーメン。嵐を避けて、もう一度。`
    this.button.textContent = 'もう一度航行'
    this.hint.hidden = true
    this.overlay.hidden = false
  }
}
