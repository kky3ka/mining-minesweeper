import Phaser from 'phaser'
import { DUNGEONS, createStageConfig, getDungeonStage, type DungeonDefinition } from './DungeonData'
import { DEBUG_OPTIONS } from './DebugOptions'
import { ExpeditionState } from './ExpeditionState'
import { ITEMS, getItemName } from './ItemData'
import { DEFAULT_CONFIG, MiningBoard } from './MiningBoard'
import { getStandardTileTexture, STANDARD_TILE_THEME } from './TileTheme'
import './style.css'

const GAP = 3
const HUD_HEIGHT = 96

// Phaser のシーンは入力と描画を担当し、盤面ルールの判定は MiningBoard に任せる。
class MiningScene extends Phaser.Scene {
  private expedition = new ExpeditionState()
  private board!: MiningBoard
  private boardLayer!: Phaser.GameObjects.Container
  private characterMarker!: Phaser.GameObjects.Container
  private uiCamera!: Phaser.Cameras.Scene2D.Camera
  private baseLayer!: Phaser.GameObjects.Container
  private stairsPanel!: Phaser.GameObjects.Container
  private digConfirmPanel!: Phaser.GameObjects.Container
  private failurePanel!: Phaser.GameObjects.Container
  private inventoryPanel!: Phaser.GameObjects.Container
  private dungeonPanel!: Phaser.GameObjects.Container
  private staminaText!: Phaser.GameObjects.Text
  private statusText!: Phaser.GameObjects.Text
  private costPreviewText!: Phaser.GameObjects.Text
  private resourceCountText!: Phaser.GameObjects.Text
  private storedTreasureText!: Phaser.GameObjects.Text
  private greatTreasureText!: Phaser.GameObjects.Text
  private digConfirmationText!: Phaser.GameObjects.Text
  private stairsTitleText!: Phaser.GameObjects.Text
  private stairsAdvanceButtonText!: Phaser.GameObjects.Text
  private inventoryRows!: Phaser.GameObjects.Container
  private selectedDungeonText!: Phaser.GameObjects.Text
  private selectedDungeon: DungeonDefinition = DUNGEONS[0]
  private tileSize = 64
  private characterIndex = 0
  private pendingDigIndex: number | null = null

  constructor() { super('mining') }

  preload(): void {
    for (const texture of Object.values(STANDARD_TILE_THEME.textures)) {
      this.load.image(texture.key, `${import.meta.env.BASE_URL}${texture.path}`)
    }
    for (const item of ITEMS) {
      this.load.image(item.id, `${import.meta.env.BASE_URL}assets/items/${item.icon}`)
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#172322')
    this.board = this.createBoardForFloor(DEFAULT_CONFIG.maxStamina)
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
    this.resourceCountText = this.add.text(this.scale.width / 2, 74, '', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#ffcf8a', align: 'center',
    }).setOrigin(0.5, 0).setVisible(false)
    // 拠点・階段選択・危険マス確認は盤面の上に重ねる独立した UI レイヤー。
    this.createInventoryPanel()
    this.createBaseScreen()
    this.createDungeonPanel()
    this.createStairsPanel()
    this.createDigConfirmPanel()
    this.createFailurePanel()
    // 盤面カメラだけをプレイヤーに追従させ、HUDとポップアップは画面位置に固定する。
    this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height, false, 'ui')
    this.cameras.main.ignore([
      this.baseLayer, this.stairsPanel, this.digConfirmPanel, this.failurePanel, this.inventoryPanel, this.dungeonPanel,
      this.staminaText, this.statusText, this.costPreviewText, this.resourceCountText,
    ])
    this.uiCamera.ignore([this.boardLayer, this.characterMarker])
    this.boardLayer.setVisible(false)
    this.characterMarker.setVisible(false)
    this.staminaText.setVisible(false)
    this.statusText.setVisible(false)
    this.costPreviewText.setVisible(false)
    this.resourceCountText.setVisible(false)
    this.layoutOverlays()
    this.layoutCameras()
    this.layoutBoard()
    this.scale.on('resize', () => {
      // Phaser の表示サイズ変更に合わせて HUD、モーダル、盤面を再配置する。
      this.staminaText.setPosition(this.scale.width / 2, 9)
      this.statusText.setPosition(this.scale.width / 2, 32)
      this.costPreviewText.setPosition(this.scale.width / 2, 54)
      this.resourceCountText.setPosition(this.scale.width / 2, 74)
      this.layoutCameras()
      this.layoutOverlays()
      this.layoutBoard()
      this.placeMarker(this.characterIndex)
      if (this.boardLayer.visible) this.drawBoard()
    })
  }

  private createBaseScreen(): void {
    // 拠点は探索画面と切り替えて表示し、保管済みの宝と出発操作をまとめる。
    this.baseLayer = this.add.container(this.scale.width / 2, this.scale.height / 2)
    this.baseLayer.add(this.add.rectangle(0, 0, 340, 400, 0x233732, 0.98).setStrokeStyle(2, 0xc49a53))
    this.baseLayer.add(this.add.text(0, -164, '採掘者の拠点', {
      fontFamily: 'sans-serif', fontSize: '28px', fontStyle: 'bold', color: '#f4ead3',
    }).setOrigin(0.5))
    this.selectedDungeonText = this.add.text(0, -122, '', {
      fontFamily: 'sans-serif', fontSize: '18px', fontStyle: 'bold', color: '#f6d878',
    }).setOrigin(0.5)
    this.baseLayer.add(this.selectedDungeonText)
    this.storedTreasureText = this.add.text(0, -82, '', {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#f6d878',
    }).setOrigin(0.5)
    this.baseLayer.add(this.storedTreasureText)
    this.baseLayer.add(this.add.text(0, -55, '持ち帰ったアイテムは拠点に保管されます', {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#c8d1c8', align: 'center',
    }).setOrigin(0.5))
    this.greatTreasureText = this.add.text(0, -28, '', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#f6d878',
    }).setOrigin(0.5)
    this.baseLayer.add(this.greatTreasureText)
    const dungeonButton = this.add.rectangle(0, 18, 230, 40, 0x53685c).setStrokeStyle(1, 0xd4c29b)
      .setInteractive({ useHandCursor: true })
    const dungeonButtonLabel = this.add.text(0, 18, 'ダンジョンを選択', {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#fff8e9',
    }).setOrigin(0.5)
    dungeonButton.on('pointerdown', () => this.showDungeonSelection())
    const inventoryButton = this.add.rectangle(0, 67, 230, 40, 0x53685c).setStrokeStyle(1, 0xd4c29b)
      .setInteractive({ useHandCursor: true })
    const inventoryButtonLabel = this.add.text(0, 67, 'アイテム一覧', {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#fff8e9',
    }).setOrigin(0.5)
    inventoryButton.on('pointerdown', () => this.showInventory())
    const button = this.add.rectangle(0, 130, 230, 46, 0xb87a38).setStrokeStyle(2, 0xf0c16e).setInteractive({ useHandCursor: true })
    const buttonLabel = this.add.text(0, 130, '探索に出発', {
      fontFamily: 'sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#fff8e9',
    }).setOrigin(0.5)
    button.on('pointerdown', () => this.beginExpedition())
    this.baseLayer.add([dungeonButton, dungeonButtonLabel, inventoryButton, inventoryButtonLabel, button, buttonLabel])
    this.updateStoredTreasureText()
  }

  private createDungeonPanel(): void {
    this.dungeonPanel = this.add.container(this.scale.width / 2, this.scale.height / 2)
    this.dungeonPanel.add(this.add.rectangle(0, 0, 340, 360, 0x233732, 0.99).setStrokeStyle(2, 0xc49a53).setInteractive())
    this.dungeonPanel.add(this.add.text(0, -148, 'ダンジョン選択', {
      fontFamily: 'sans-serif', fontSize: '23px', fontStyle: 'bold', color: '#f4ead3',
    }).setOrigin(0.5))
    DUNGEONS.forEach((dungeon, index) => {
      const y = -75 + index * 62
      const button = this.add.rectangle(0, y, 270, 50, 0x53685c).setStrokeStyle(1, 0xd4c29b)
        .setInteractive({ useHandCursor: true })
      const label = this.add.text(0, y, `${dungeon.name}（${dungeon.stages.length}エリア）`, {
        fontFamily: 'sans-serif', fontSize: '16px', color: '#fff8e9',
      }).setOrigin(0.5)
      button.on('pointerdown', () => {
        this.selectedDungeon = dungeon
        this.updateBaseDungeonLabel()
        this.dungeonPanel.setVisible(false)
      })
      this.dungeonPanel.add([button, label])
    })
    const closeButton = this.add.rectangle(0, 130, 220, 40, 0x394b43).setStrokeStyle(1, 0xc49a53)
      .setInteractive({ useHandCursor: true })
    const closeLabel = this.add.text(0, 130, '戻る', {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#fff8e9',
    }).setOrigin(0.5)
    closeButton.on('pointerdown', () => this.dungeonPanel.setVisible(false))
    this.dungeonPanel.add([closeButton, closeLabel])
    this.dungeonPanel.setDepth(10).setVisible(false)
  }

  private showDungeonSelection(): void {
    this.dungeonPanel.setVisible(true)
    this.layoutOverlays()
  }

  private updateBaseDungeonLabel(): void {
    this.selectedDungeonText.setText(`探索先: ${this.selectedDungeon.name}`)
  }

  private createInventoryPanel(): void {
    this.inventoryPanel = this.add.container(this.scale.width / 2, this.scale.height / 2)
    this.inventoryPanel.add(this.add.rectangle(0, 0, 340, 480, 0x233732, 0.98).setStrokeStyle(2, 0xc49a53).setInteractive())
    this.inventoryPanel.add(this.add.text(0, -218, 'アイテム一覧', {
      fontFamily: 'sans-serif', fontSize: '24px', fontStyle: 'bold', color: '#f4ead3',
    }).setOrigin(0.5))
    this.inventoryRows = this.add.container(-145, -190)
    this.inventoryPanel.add(this.inventoryRows)
    const closeButton = this.add.rectangle(0, 215, 220, 42, 0x53685c).setStrokeStyle(1, 0xd4c29b)
      .setInteractive({ useHandCursor: true })
    const closeLabel = this.add.text(0, 215, '閉じる', {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#fff8e9',
    }).setOrigin(0.5)
    closeButton.on('pointerdown', () => this.inventoryPanel.setVisible(false))
    this.inventoryPanel.add([closeButton, closeLabel])
    // 拠点より後ろに重ならないよう、アイテム一覧をUIの前面に配置する。
    this.inventoryPanel.setDepth(10)
    this.inventoryPanel.setVisible(false)
  }

  private showInventory(): void {
    this.updateInventoryList()
    this.inventoryPanel.setVisible(true)
    this.layoutOverlays()
  }

  private updateInventoryList(): void {
    this.inventoryRows.removeAll(true)
    let y = this.addInventoryHeading('【通常アイテム】', 0)
    const ordinaryItems = Object.entries(this.expedition.storedItems).filter(([, count]) => count > 0)
    if (ordinaryItems.length) {
      for (const [itemId, count] of ordinaryItems) y = this.addInventoryRow(itemId, `× ${count}`, y)
    } else {
      y = this.addInventoryRow(null, 'まだ持ち帰ったアイテムはありません', y)
    }
    y += 5
    y = this.addInventoryHeading('【大宝】', y)
    if (this.expedition.obtainedGreatTreasureIds.length) {
      for (const itemId of this.expedition.obtainedGreatTreasureIds) y = this.addInventoryRow(itemId, '', y)
    } else {
      this.addInventoryRow(null, 'まだ獲得していません', y)
    }
  }

  private addInventoryHeading(label: string, y: number): number {
    this.inventoryRows.add(this.add.text(0, y, label, {
      fontFamily: 'sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#f6d878',
    }).setOrigin(0, 0))
    return y + 22
  }

  private addInventoryRow(itemId: string | null, detail: string, y: number): number {
    if (itemId && this.textures.exists(itemId)) {
      this.inventoryRows.add(this.add.image(10, y + 9, itemId).setDisplaySize(18, 18))
    }
    const name = itemId ? getItemName(itemId) : ''
    const label = [name, detail].filter(Boolean).join(' ')
    this.inventoryRows.add(this.add.text(itemId ? 25 : 0, y, label || detail, {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#f4ead3', wordWrap: { width: 285 },
    }).setOrigin(0, 0))
    return y + 21
  }

  private createStairsPanel(): void {
    // 階段発見後も同じ階を続ける、次の階へ進む、帰還する選択肢を出す。
    this.stairsPanel = this.add.container(this.scale.width / 2, this.scale.height / 2)
    const background = this.add.rectangle(0, 0, 340, 280, 0x233732, 0.98).setStrokeStyle(2, 0xc49a53).setInteractive()
    this.stairsPanel.add(background)
    this.stairsTitleText = this.add.text(0, -104, '階段を発見！', {
      fontFamily: 'sans-serif', fontSize: '23px', fontStyle: 'bold', color: '#f6d878',
    }).setOrigin(0.5)
    this.stairsPanel.add(this.stairsTitleText)
    this.stairsPanel.add(this.add.text(0, -72, 'どうしますか？', {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#f4ead3',
    }).setOrigin(0.5))
    this.addChoiceButton('このフロアを探索', -28, () => {
      this.stairsPanel.setVisible(false)
      this.updateStatus()
    })
    this.stairsAdvanceButtonText = this.addChoiceButton('次のフロアへ', 32, () => this.advanceFloor())
    this.addChoiceButton('宝物を持って帰還', 92, () => this.returnToBase())
    this.stairsPanel.setVisible(false)
  }

  private createDigConfirmPanel(): void {
    // 印のある宝・地雷を掘る前に、プレイヤーが危険を確認できるようにする。
    this.digConfirmPanel = this.add.container(this.scale.width / 2, this.scale.height / 2)
    const background = this.add.rectangle(0, 0, 340, 260, 0x233732, 0.98).setStrokeStyle(2, 0xc49a53).setInteractive()
    this.digConfirmPanel.add(background)
    this.digConfirmPanel.add(this.add.text(0, -88, 'このマスを掘りますか？', {
      fontFamily: 'sans-serif', fontSize: '21px', fontStyle: 'bold', color: '#f4ead3',
    }).setOrigin(0.5))
    this.digConfirmPanel.add(this.add.text(0, -48, '宝物か地雷が埋まっています', {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#c8d1c8',
    }).setOrigin(0.5))
    this.digConfirmationText = this.add.text(0, -15, '', {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#f6d878',
    }).setOrigin(0.5)
    this.digConfirmPanel.add(this.digConfirmationText)
    this.addDigConfirmButton('掘る', 38, () => this.confirmDig())
    this.addDigConfirmButton('やめる', 94, () => this.cancelDig())
    this.digConfirmPanel.setVisible(false)
  }

  private createFailurePanel(): void {
    // 探索失敗を盤面上に知らせ、ボタン操作で拠点へ戻れるようにする。
    this.failurePanel = this.add.container(this.scale.width / 2, this.scale.height / 2)
    this.failurePanel.add(this.add.rectangle(0, 0, 340, 220, 0x233732, 0.98).setStrokeStyle(2, 0xc49a53).setInteractive())
    this.failurePanel.add(this.add.text(0, -62, '探索失敗', {
      fontFamily: 'sans-serif', fontSize: '26px', fontStyle: 'bold', color: '#ff8a76',
    }).setOrigin(0.5))
    this.failurePanel.add(this.add.text(0, -20, 'スタミナが尽きてしまった。', {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#f4ead3',
    }).setOrigin(0.5))
    const button = this.add.rectangle(0, 54, 230, 48, 0xb87a38).setStrokeStyle(2, 0xf0c16e)
      .setInteractive({ useHandCursor: true })
    const label = this.add.text(0, 54, '拠点に戻る', {
      fontFamily: 'sans-serif', fontSize: '18px', fontStyle: 'bold', color: '#fff8e9',
    }).setOrigin(0.5)
    button.on('pointerdown', () => this.returnToBaseAfterFailure())
    this.failurePanel.add([button, label])
    this.failurePanel.setVisible(false)
    this.inventoryPanel.setVisible(false)
  }

  private addDigConfirmButton(label: string, y: number, onClick: () => void): void {
    const button = this.add.rectangle(0, y, 230, 44, 0x53685c).setStrokeStyle(1, 0xd4c29b)
      .setInteractive({ useHandCursor: true })
    const text = this.add.text(0, y, label, {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#fff8e9',
    }).setOrigin(0.5)
    button.on('pointerdown', onClick)
    this.digConfirmPanel.add([button, text])
  }

  private addChoiceButton(label: string, y: number, onClick: () => void): Phaser.GameObjects.Text {
    const button = this.add.rectangle(0, y, 250, 46, 0x53685c).setStrokeStyle(1, 0xd4c29b)
      .setInteractive({ useHandCursor: true })
    const text = this.add.text(0, y, label, {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#fff8e9',
    }).setOrigin(0.5)
    button.on('pointerdown', onClick)
    this.stairsPanel.add([button, text])
    return text
  }

  private layoutOverlays(): void {
    // 狭い画面ではモーダルを縮小し、中央に収める。
    const scale = Math.min(1, (this.scale.width - 24) / 340)
    this.baseLayer.setPosition(this.scale.width / 2, this.scale.height / 2).setScale(scale)
    this.stairsPanel.setPosition(this.scale.width / 2, this.scale.height / 2).setScale(scale)
    this.digConfirmPanel.setPosition(this.scale.width / 2, this.scale.height / 2).setScale(scale)
    this.failurePanel.setPosition(this.scale.width / 2, this.scale.height / 2).setScale(scale)
    const inventoryScale = Math.min(1, (this.scale.width - 24) / 340, (this.scale.height - 24) / 480)
    this.inventoryPanel.setPosition(this.scale.width / 2, this.scale.height / 2).setScale(inventoryScale)
    const dungeonScale = Math.min(1, (this.scale.width - 24) / 340, (this.scale.height - 24) / 360)
    this.dungeonPanel.setPosition(this.scale.width / 2, this.scale.height / 2).setScale(dungeonScale)
  }

  private beginExpedition(): void {
    // 出発ごとに新しい盤面を生成し、キャラクターをランダムな開始位置へ置く。
    this.expedition.beginExpedition()
    this.board = this.createBoardForFloor(DEFAULT_CONFIG.maxStamina)
    this.characterIndex = this.board.startIndex
    this.tweens.killTweensOf(this.characterMarker)
    this.baseLayer.setVisible(false)
    this.dungeonPanel.setVisible(false)
    this.stairsPanel.setVisible(false)
    this.digConfirmPanel.setVisible(false)
    this.failurePanel.setVisible(false)
    this.boardLayer.setVisible(true)
    this.characterMarker.setVisible(true)
    this.staminaText.setVisible(true)
    this.statusText.setVisible(true)
    this.costPreviewText.setVisible(true)
    this.resourceCountText.setVisible(DEBUG_OPTIONS.showResourceCounts)
    this.layoutBoard()
    this.placeMarker(this.characterIndex)
    this.followCharacter()
    this.drawBoard()
    this.updateStatus()
  }

  private updateStoredTreasureText(): void {
    this.updateBaseDungeonLabel()
    this.storedTreasureText.setText(`保管中のアイテム: ${this.expedition.storedItemCount} 個`)
    this.greatTreasureText.setText(`大宝: ${this.expedition.obtainedGreatTreasureIds.map(getItemName).join('、') || '未獲得'}`)
    this.updateInventoryList()
  }

  private showStairsChoices(): void {
    const isFinalFloor = this.expedition.floor >= this.selectedDungeon.stages.length
    this.stairsTitleText.setText(isFinalFloor ? '最深層の階段を発見！' : '階段を発見！')
    this.stairsAdvanceButtonText.setText(isFinalFloor ? '大宝を獲得して帰還' : '次のフロアへ')
    this.stairsPanel.setVisible(true)
    this.layoutOverlays()
  }

  private returnToBase(): void {
    // UIを拠点へ切り替える。探索中の盤面は次回出発時に新しく生成される。
    this.expedition.returnToBase()
    this.showBaseScreen()
  }

  private returnToBaseAfterFailure(): void {
    // 失敗時は今回の宝を持ち帰れないため、通常の帰還処理を通さない。
    this.expedition.failExpedition()
    this.showBaseScreen()
  }

  private showBaseScreen(): void {
    this.updateStoredTreasureText()
    this.stairsPanel.setVisible(false)
    this.digConfirmPanel.setVisible(false)
    this.failurePanel.setVisible(false)
    this.inventoryPanel.setVisible(false)
    this.dungeonPanel.setVisible(false)
    this.boardLayer.setVisible(false)
    this.characterMarker.setVisible(false)
    this.staminaText.setVisible(false)
    this.statusText.setVisible(false)
    this.costPreviewText.setVisible(false)
    this.resourceCountText.setVisible(false)
    this.baseLayer.setVisible(true)
    this.layoutOverlays()
  }

  private layoutBoard(): void {
    // 画面幅からマスの大きさを決めるため、盤面サイズ変更にも追従する。
    // タイル画像の基準寸法を保ち、画面外は既存のカメラ追従で表示する。
    this.tileSize = 64
    const boardWidth = this.board.config.width * (this.tileSize + GAP) - GAP
    const boardHeight = this.board.config.height * (this.tileSize + GAP) - GAP
    this.boardLayer.setPosition(0, 0)
    this.cameras.main.setBounds(0, 0, boardWidth, boardHeight)
  }

  private boardCameraSize(): number {
    return Math.max(1, Math.min(this.scale.width - 16, this.scale.height - HUD_HEIGHT - 16))
  }

  private layoutCameras(): void {
    const side = this.boardCameraSize()
    const x = (this.scale.width - side) / 2
    const y = Math.max(HUD_HEIGHT, (this.scale.height - side) / 2)
    this.cameras.main.setViewport(x, y, side, side)
    this.uiCamera.setViewport(0, 0, this.scale.width, this.scale.height)
  }

  private followCharacter(): void {
    const camera = this.cameras.main
    camera.stopFollow()
    camera.centerOn(this.characterMarker.x, this.characterMarker.y)
    camera.startFollow(this.characterMarker, true, 0.12, 0.12)
  }

  private drawBoard(): void {
    // セル状態から見た目と入力領域を作り直す。未探索セルの中身は表示しない。
    this.boardLayer.removeAll(true)
    this.board.cells.forEach((cell, index) => {
      const x = (index % this.board.config.width) * (this.tileSize + GAP)
      const y = Math.floor(index / this.board.config.width) * (this.tileSize + GAP)
      // 開始マスも他の開示マスと同じ色にし、特別な色で位置を示さない。
      const canClick = this.board.status === 'playing' && (cell.revealed || this.board.canAttemptDig(index))
      const shouldHighlight = canClick && !cell.revealed
      const tile = this.add.image(x, y, getStandardTileTexture(cell)).setOrigin(0)
        .setDisplaySize(this.tileSize, this.tileSize)
      this.boardLayer.add(tile)
      if (shouldHighlight) {
        const highlight = this.add.rectangle(x, y, this.tileSize, this.tileSize, 0xffffff, 0)
          .setOrigin(0).setStrokeStyle(3, 0xffd66e)
        this.boardLayer.add(highlight)
      }
      let label = ''
      if (cell.revealed) {
        if (cell.kind === 'empty' && cell.number > 0) label = String(cell.number)
      // 宝・地雷の「?」印は、現在掘れる隣接マスに限って表示する。
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
      if (canClick) {
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
          // 開示済み階段は移動先ではなく、階段の選択肢を開く操作にする。
          if (cell.revealed && cell.kind === 'stairs' && this.board.stairsFound) {
            this.showStairsChoices()
            return
          }
          if (!cell.revealed) {
            if (!this.board.canDig(index)) {
              this.statusText.setText(`スタミナ不足（必要 ${this.board.getDigCost(index)}）`).setColor('#ff8a76')
              return
            }
            if (cell.kind === 'treasure' || cell.kind === 'mine') {
              this.pendingDigIndex = index
              this.digConfirmationText.setText(`必要スタミナ: ${this.board.getDigCost(index)}`)
              this.digConfirmPanel.setVisible(true)
              this.layoutOverlays()
              return
            }
            this.performDig(index)
            return
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
    // 画像素材を使わず、短い跳ねる tween で移動したことを伝える。
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

  private confirmDig(): void {
    const index = this.pendingDigIndex
    this.pendingDigIndex = null
    this.digConfirmPanel.setVisible(false)
    if (index === null) return
    if (!this.board.canDig(index)) {
      this.statusText.setText(`スタミナ不足（必要 ${this.board.getDigCost(index)}）`).setColor('#ff8a76')
      return
    }
    this.performDig(index)
  }

  private cancelDig(): void {
    this.pendingDigIndex = null
    this.digConfirmPanel.setVisible(false)
  }

  private performDig(index: number): void {
    // モデルの採掘結果を反映し、取得物・キャラクター位置・表示を同期する。
    const cell = this.board.cells[index]
    this.board.dig(index)
    if (cell.kind === 'treasure' && cell.revealed && cell.itemId) this.expedition.collectTreasure(cell.itemId)
    this.characterIndex = index
    this.moveMarkerTo(index)
    this.drawBoard()
    this.updateStatus()
    if (this.board.status === 'lost') {
      this.failurePanel.setVisible(true)
      this.layoutOverlays()
      return
    }
  }

  private updateStatus(): void {
    this.staminaText.setText(
      `地下${this.expedition.floor}/${this.selectedDungeon.stages.length}階　スタミナ ${this.board.stamina}/${this.board.config.maxStamina}　今回のアイテム ${this.expedition.carriedItemCount}`,
    )
    this.showDefaultCostHint()
    this.resourceCountText.setText(
      `配置数（デバッグ） 地雷 ${this.board.placedMineCount} / 宝物 ${this.board.placedTreasureCount}`,
    )
    if (this.board.status === 'lost') this.statusText.setText('スタミナ切れで探索失敗').setColor('#ff8a76')
    else if (this.board.stairsFound) this.statusText.setText('階段発見！「⌄」をクリックして選択').setColor('#f6d878')
    else this.statusText.setText('隣のマスを掘って道を探そう').setColor('#f4ead3')
  }

  private advanceFloor(): void {
    // 階段を下りる。最深層を下りる場合は大宝を確定入手して帰還する。
    if (this.expedition.floor >= this.selectedDungeon.stages.length) {
      this.expedition.collectGreatTreasure(this.selectedDungeon.largeTreasure)
      this.expedition.returnToBase()
      this.showBaseScreen()
      return
    }

    const remainingStamina = this.board.stamina
    if (!this.expedition.descend(this.selectedDungeon.stages.length)) return
    this.stairsPanel.setVisible(false)
    this.board = this.createBoardForFloor(remainingStamina)
    this.characterIndex = this.board.startIndex
    this.tweens.killTweensOf(this.characterMarker)
    this.layoutBoard()
    this.placeMarker(this.characterIndex)
    this.followCharacter()
    this.drawBoard()
    this.updateStatus()
  }

  private createBoardForFloor(initialStamina: number): MiningBoard {
    const stage = getDungeonStage(this.selectedDungeon, this.expedition.floor)
    const config = createStageConfig(stage, DEFAULT_CONFIG)

    return new MiningBoard(config, initialStamina, {
      treasureItems: stage.items,
    })
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
