import Phaser from 'phaser'
import { DEFAULT_CONFIG, MiningBoard } from './MiningBoard'
import './style.css'

const GAP = 3

class MiningScene extends Phaser.Scene {
  private board!: MiningBoard
  private boardLayer!: Phaser.GameObjects.Container
  private characterMarker!: Phaser.GameObjects.Container
  private staminaText!: Phaser.GameObjects.Text
  private statusText!: Phaser.GameObjects.Text
  private costPreviewText!: Phaser.GameObjects.Text
  private tileSize = 56
  private characterIndex = 0

  constructor() { super('mining') }

  create(): void {
    this.cameras.main.setBackgroundColor('#172322')
    this.board = new MiningBoard(DEFAULT_CONFIG)
    this.characterIndex = this.board.startIndex
    this.boardLayer = this.add.container(0, 80)
    this.characterMarker = this.add.container(0, 0)
    const markerRadius = Math.max(5, this.tileSize * 0.17)
    this.characterMarker.add([
      this.add.circle(0, 0, markerRadius, 0xe89a42).setStrokeStyle(2, 0x38291c),
      this.add.circle(-markerRadius * 0.28, -markerRadius * 0.3, markerRadius * 0.22, 0xffedbf),
    ])
    this.staminaText = this.add.text(this.scale.width / 2, 9, '', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#f6d878', align: 'center',
    }).setOrigin(0.5, 0)
    this.statusText = this.add.text(this.scale.width / 2, 32, '', {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#f4ead3', align: 'center',
    }).setOrigin(0.5, 0)
    this.costPreviewText = this.add.text(this.scale.width / 2, 54, '', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#b9c8bd', align: 'center',
    }).setOrigin(0.5, 0)
    this.layoutBoard()
    this.placeMarker(this.board.startIndex)
    this.drawBoard()
    this.updateStatus()
    this.scale.on('resize', () => {
      this.staminaText.setPosition(this.scale.width / 2, 9)
      this.statusText.setPosition(this.scale.width / 2, 32)
      this.costPreviewText.setPosition(this.scale.width / 2, 54)
      this.layoutBoard()
      this.placeMarker(this.characterIndex)
      this.drawBoard()
    })
  }

  private layoutBoard(): void {
    this.tileSize = Math.min(56, (this.scale.width - 12 - GAP * (this.board.config.width - 1)) / this.board.config.width)
    this.characterMarker.setScale(this.tileSize / 56)
    const boardWidth = this.board.config.width * (this.tileSize + GAP) - GAP
    this.boardLayer.setPosition((this.scale.width - boardWidth) / 2, 80)
  }

  private drawBoard(): void {
    this.boardLayer.removeAll(true)
    this.board.cells.forEach((cell, index) => {
      const x = (index % this.board.config.width) * (this.tileSize + GAP)
      const y = Math.floor(index / this.board.config.width) * (this.tileSize + GAP)
      const start = index === this.board.startIndex
      const color = cell.revealed ? (start ? 0x517968 : 0xb6aa8c) : 0x586b63
      const tile = this.add.rectangle(x, y, this.tileSize, this.tileSize, color).setOrigin(0).setStrokeStyle(2, 0x283a35)
      this.boardLayer.add(tile)
      let label = ''
      if (cell.revealed) {
        if (cell.kind === 'mine') label = '✹'
        else if (cell.kind === 'treasure') label = '◆'
        else if (cell.kind === 'stairs') label = '⌄'
        else if (cell.number > 0 || start) label = String(cell.number)
      }
      if (label) {
        const text = this.add.text(x + this.tileSize / 2, y + this.tileSize / 2, label, {
          fontFamily: 'sans-serif', fontSize: `${Math.max(14, this.tileSize * 0.43)}px`, fontStyle: 'bold',
          color: cell.kind === 'mine' ? '#7e201b' : cell.kind === 'treasure' ? '#fff0a8' : '#172322',
        }).setOrigin(0.5)
        this.boardLayer.add(text)
      }
      if (this.board.status === 'playing' && (cell.revealed || this.board.canAttemptDig(index))) {
        const hit = this.add.rectangle(x, y, this.tileSize, this.tileSize, 0xffffff, 0.001).setOrigin(0).setInteractive()
        if (!cell.revealed) {
          hit.on('pointerover', () => {
            this.costPreviewText.setText(`このマスの採掘消費: ${this.board.getDigCost(index)}`)
          })
          hit.on('pointerout', () => this.showDefaultCostHint())
        }
        hit.on('pointerdown', () => {
          if (!cell.revealed) {
            if (!this.board.canDig(index)) {
              this.statusText.setText(`スタミナ不足（必要 ${this.board.getDigCost(index)}）`).setColor('#ff8a76')
              return
            }
            this.board.dig(index)
            this.drawBoard()
            this.updateStatus()
          }
          this.characterIndex = index
          this.moveMarkerTo(index)
        })
        this.boardLayer.add(hit)
      }
    })
  }

  private placeMarker(index: number): void {
    const column = index % this.board.config.width
    const row = Math.floor(index / this.board.config.width)
    this.characterMarker.setPosition(
      this.boardLayer.x + column * (this.tileSize + GAP) + this.tileSize * 0.76,
      this.boardLayer.y + row * (this.tileSize + GAP) + this.tileSize * 0.76,
    )
  }

  private moveMarkerTo(index: number): void {
    this.tweens.killTweensOf(this.characterMarker)
    const column = index % this.board.config.width
    const row = Math.floor(index / this.board.config.width)
    const targetX = this.boardLayer.x + column * (this.tileSize + GAP) + this.tileSize * 0.76
    const targetY = this.boardLayer.y + row * (this.tileSize + GAP) + this.tileSize * 0.76
    this.tweens.add({
      targets: this.characterMarker,
      x: targetX,
      y: targetY - Math.max(4, this.tileSize * 0.1),
      duration: 170,
      ease: 'Sine.easeOut',
      onComplete: () => this.tweens.add({
        targets: this.characterMarker,
        y: targetY,
        duration: 100,
        ease: 'Bounce.Out',
      }),
    })
  }

  private updateStatus(): void {
    this.staminaText.setText(
      `スタミナ ${this.board.stamina}/${this.board.config.maxStamina}`,
    )
    this.showDefaultCostHint()
    if (this.board.status === 'lost') this.statusText.setText('スタミナ切れで探索失敗').setColor('#ff8a76')
    else if (this.board.stairsFound) this.statusText.setText('階段発見！探索を続けられます').setColor('#f6d878')
    else this.statusText.setText('隣のマスを掘って道を探そう').setColor('#f4ead3')
  }

  private showDefaultCostHint(): void {
    const baseCost = this.board.config.digCost
    const specialCost = baseCost + Math.max(this.board.config.treasureDigCost, this.board.config.mineDamage)
    this.costPreviewText.setText(`採掘消費: 通常 ${baseCost} / 宝物・地雷 ${specialCost}`)
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#172322',
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: MiningScene,
})
