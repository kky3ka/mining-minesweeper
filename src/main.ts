import Phaser from 'phaser'
import { ExpeditionState } from './ExpeditionState'
import { DEFAULT_CONFIG, MiningBoard } from './MiningBoard'
import './style.css'

const GAP = 3

class MiningScene extends Phaser.Scene {
  private expedition = new ExpeditionState()
  private board!: MiningBoard
  private boardLayer!: Phaser.GameObjects.Container
  private characterMarker!: Phaser.GameObjects.Container
  private baseLayer!: Phaser.GameObjects.Container
  private stairsPanel!: Phaser.GameObjects.Container
  private staminaText!: Phaser.GameObjects.Text
  private statusText!: Phaser.GameObjects.Text
  private costPreviewText!: Phaser.GameObjects.Text
  private storedTreasureText!: Phaser.GameObjects.Text
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
    this.createBaseScreen()
    this.createStairsPanel()
    this.boardLayer.setVisible(false)
    this.characterMarker.setVisible(false)
    this.staminaText.setVisible(false)
    this.statusText.setVisible(false)
    this.costPreviewText.setVisible(false)
    this.layoutOverlays()
    this.layoutBoard()
    this.scale.on('resize', () => {
      this.staminaText.setPosition(this.scale.width / 2, 9)
      this.statusText.setPosition(this.scale.width / 2, 32)
      this.costPreviewText.setPosition(this.scale.width / 2, 54)
      this.layoutOverlays()
      this.layoutBoard()
      this.placeMarker(this.characterIndex)
      if (this.boardLayer.visible) this.drawBoard()
    })
  }

  private createBaseScreen(): void {
    this.baseLayer = this.add.container(this.scale.width / 2, this.scale.height / 2)
    this.baseLayer.add(this.add.rectangle(0, 0, 330, 270, 0x233732, 0.98).setStrokeStyle(2, 0xc49a53))
    this.baseLayer.add(this.add.text(0, -82, '採掘者の拠点', {
      fontFamily: 'sans-serif', fontSize: '28px', fontStyle: 'bold', color: '#f4ead3',
    }).setOrigin(0.5))
    this.storedTreasureText = this.add.text(0, -24, '', {
      fontFamily: 'sans-serif', fontSize: '18px', color: '#f6d878',
    }).setOrigin(0.5)
    this.baseLayer.add(this.storedTreasureText)
    this.baseLayer.add(this.add.text(0, 17, '宝物を持って帰還すると、ここに保管されます', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#c8d1c8', align: 'center',
    }).setOrigin(0.5))
    const button = this.add.rectangle(0, 82, 230, 58, 0xb87a38).setStrokeStyle(2, 0xf0c16e).setInteractive({ useHandCursor: true })
    const buttonLabel = this.add.text(0, 82, '探索に出発', {
      fontFamily: 'sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#fff8e9',
    }).setOrigin(0.5)
    button.on('pointerdown', () => this.beginExpedition())
    this.baseLayer.add([button, buttonLabel])
    this.updateStoredTreasureText()
  }

  private createStairsPanel(): void {
    this.stairsPanel = this.add.container(this.scale.width / 2, this.scale.height / 2)
    const background = this.add.rectangle(0, 0, 340, 280, 0x233732, 0.98).setStrokeStyle(2, 0xc49a53).setInteractive()
    this.stairsPanel.add(background)
    this.stairsPanel.add(this.add.text(0, -104, '階段を発見！', {
      fontFamily: 'sans-serif', fontSize: '23px', fontStyle: 'bold', color: '#f6d878',
    }).setOrigin(0.5))
    this.stairsPanel.add(this.add.text(0, -72, 'どうしますか？', {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#f4ead3',
    }).setOrigin(0.5))
    this.addChoiceButton('このフロアを探索', -28, () => {
      this.stairsPanel.setVisible(false)
      this.updateStatus()
    })
    this.addChoiceButton('次のフロアへ', 32, () => this.advanceFloor())
    this.addChoiceButton('宝物を持って帰還', 92, () => this.returnToBase())
    this.stairsPanel.setVisible(false)
  }

  private addChoiceButton(label: string, y: number, onClick: () => void): void {
    const button = this.add.rectangle(0, y, 250, 46, 0x53685c).setStrokeStyle(1, 0xd4c29b)
      .setInteractive({ useHandCursor: true })
    const text = this.add.text(0, y, label, {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#fff8e9',
    }).setOrigin(0.5)
    button.on('pointerdown', onClick)
    this.stairsPanel.add([button, text])
  }

  private layoutOverlays(): void {
    const scale = Math.min(1, (this.scale.width - 24) / 340)
    this.baseLayer.setPosition(this.scale.width / 2, this.scale.height / 2).setScale(scale)
    this.stairsPanel.setPosition(this.scale.width / 2, this.scale.height / 2).setScale(scale)
  }

  private beginExpedition(): void {
    this.expedition.beginExpedition()
    this.board = new MiningBoard(DEFAULT_CONFIG)
    this.characterIndex = this.board.startIndex
    this.tweens.killTweensOf(this.characterMarker)
    this.baseLayer.setVisible(false)
    this.stairsPanel.setVisible(false)
    this.boardLayer.setVisible(true)
    this.characterMarker.setVisible(true)
    this.staminaText.setVisible(true)
    this.statusText.setVisible(true)
    this.costPreviewText.setVisible(true)
    this.layoutBoard()
    this.placeMarker(this.characterIndex)
    this.drawBoard()
    this.updateStatus()
  }

  private updateStoredTreasureText(): void {
    this.storedTreasureText.setText(`保管中の宝物: ${this.expedition.storedTreasures} 個`)
  }

  private showStairsChoices(): void {
    this.stairsPanel.setVisible(true)
    this.layoutOverlays()
  }

  private returnToBase(): void {
    this.expedition.returnToBase()
    this.updateStoredTreasureText()
    this.stairsPanel.setVisible(false)
    this.boardLayer.setVisible(false)
    this.characterMarker.setVisible(false)
    this.staminaText.setVisible(false)
    this.statusText.setVisible(false)
    this.costPreviewText.setVisible(false)
    this.baseLayer.setVisible(true)
    this.layoutOverlays()
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
      const color = cell.revealed ? 0xb6aa8c : 0x586b63
      const tile = this.add.rectangle(x, y, this.tileSize, this.tileSize, color).setOrigin(0).setStrokeStyle(2, 0x283a35)
      this.boardLayer.add(tile)
      let label = ''
      if (cell.revealed) {
        if (cell.kind === 'mine') label = '✹'
        else if (cell.kind === 'treasure') label = '◆'
        else if (cell.kind === 'stairs') label = '⌄'
        else if (cell.number > 0 || start) label = String(cell.number)
      } else if (this.board.canAttemptDig(index) && (cell.kind === 'treasure' || cell.kind === 'mine')) {
        label = '?'
      }
      if (label) {
        const text = this.add.text(x + this.tileSize / 2, y + this.tileSize / 2, label, {
          fontFamily: 'sans-serif', fontSize: `${Math.max(14, this.tileSize * 0.43)}px`, fontStyle: 'bold',
          color: !cell.revealed ? '#f6d878' : cell.kind === 'mine' ? '#7e201b' : cell.kind === 'treasure' ? '#fff0a8' : '#172322',
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
        } else if (cell.kind === 'stairs' && this.board.stairsFound) {
          hit.on('pointerover', () => this.costPreviewText.setText('クリックしてフロアの選択肢を開く'))
          hit.on('pointerout', () => this.showDefaultCostHint())
        }
        hit.on('pointerdown', () => {
          if (cell.revealed && cell.kind === 'stairs' && this.board.stairsFound) {
            this.showStairsChoices()
            return
          }
          if (!cell.revealed) {
            if (!this.board.canDig(index)) {
              this.statusText.setText(`スタミナ不足（必要 ${this.board.getDigCost(index)}）`).setColor('#ff8a76')
              return
            }
            const wasStairsFound = this.board.stairsFound
            this.board.dig(index)
            if (cell.kind === 'treasure' && cell.revealed) this.expedition.collectTreasure()
            this.drawBoard()
            this.updateStatus()
            if (!wasStairsFound && this.board.stairsFound) this.showStairsChoices()
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
      `地下${this.expedition.floor}階　スタミナ ${this.board.stamina}/${this.board.config.maxStamina}　今回の宝物 ${this.expedition.carriedTreasures}`,
    )
    this.showDefaultCostHint()
    if (this.board.status === 'lost') this.statusText.setText('スタミナ切れで探索失敗').setColor('#ff8a76')
    else if (this.board.stairsFound) this.statusText.setText('階段発見！「⌄」をクリックして選択').setColor('#f6d878')
    else this.statusText.setText('隣のマスを掘って道を探そう').setColor('#f4ead3')
  }

  private advanceFloor(): void {
    const remainingStamina = this.board.stamina
    this.expedition.descend()
    this.stairsPanel.setVisible(false)
    this.board = new MiningBoard(DEFAULT_CONFIG, remainingStamina)
    this.characterIndex = this.board.startIndex
    this.tweens.killTweensOf(this.characterMarker)
    this.layoutBoard()
    this.placeMarker(this.characterIndex)
    this.drawBoard()
    this.updateStatus()
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
