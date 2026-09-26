// マスの中身を表す。画面表示はこの値を見て決め、盤面ルール自体は Phaser に依存させない。
export type TileKind = 'empty' | 'treasure' | 'mine' | 'stairs' | 'greatTreasure'

// 1マス分のゲーム状態。未探索かどうかと、周囲の危険・宝の数を保持する。
export interface Cell {
  kind: TileKind
  number: number
  revealed: boolean
}

// バランス調整に使う値をまとめる。盤面サイズを変えるときも生成処理の変更を最小限にする。
export interface GameConfig {
  width: number
  height: number
  treasureCount: number
  mineCount: number
  maxStamina: number
  digCost: number
  treasureDigCost: number
  mineDamage: number
}

// 試作向けの初期値。数値調整はここだけを変更すれば反映できる。
export const DEFAULT_CONFIG: Readonly<GameConfig> = {
  width: 10,
  height: 10,
  treasureCount: 8,
  mineCount: 6,
  maxStamina: 30,
  digCost: 1,
  treasureDigCost: 5,
  mineDamage: 5,
}

export type GameStatus = 'playing' | 'lost'

/** Phaser を使わずに盤面生成、採掘可否、周囲の数字計算を行うゲームロジック。 */
export class MiningBoard {
  readonly cells: Cell[]
  readonly startIndex: number
  readonly stairsIndex: number | null
  readonly greatTreasureIndex: number | null
  status: GameStatus = 'playing'
  stairsFound = false
  greatTreasureFound = false
  stamina: number
  readonly config: Readonly<GameConfig>

  constructor(config: Readonly<GameConfig> = DEFAULT_CONFIG, initialStamina = config.maxStamina, isFinalFloor = false) {
    this.config = config
    this.stamina = Math.min(config.maxStamina, Math.max(0, initialStamina))
    const { width, height } = config
    if (width < 3 || height < 3 || config.treasureCount < 0 || config.mineCount < 0 ||
      config.maxStamina <= 0 || config.digCost <= 0 || config.treasureDigCost <= 0 || config.mineDamage < 0 ||
      config.treasureCount + config.mineCount > width * height - 2) {
      throw new Error('Invalid board configuration')
    }
    // 盤面は一次元配列で持ち、座標との変換には width を使う。縦横サイズを変えても扱いやすい。
    this.cells = Array.from({ length: width * height }, () => ({ kind: 'empty', number: 0, revealed: false }))
    const startCandidates = this.cells.map((_, index) => index).filter(index =>
      this.cells.length - this.neighbors(index).length - 1 >= config.mineCount + config.treasureCount,
    )
    if (startCandidates.length === 0) {
      throw new Error('Too many resources to guarantee a safe starting point')
    }
    // 開始位置とその周囲8マスには宝・地雷を置かず、最初の数字が必ず0になるようにする。
    this.startIndex = startCandidates[Math.floor(Math.random() * startCandidates.length)]
    const adjacentToStart = new Set(this.neighbors(this.startIndex))
    const mineCandidates = this.cells.map((_, index) => index)
      .filter(index => index !== this.startIndex && !adjacentToStart.has(index))
    this.shuffle(mineCandidates)
    for (const index of mineCandidates.splice(0, config.mineCount)) this.cells[index].kind = 'mine'

    const treasureCandidates = this.cells.map((_, index) => index)
      .filter(index => index !== this.startIndex && !adjacentToStart.has(index) && this.cells[index].kind === 'empty')
    this.shuffle(treasureCandidates)
    for (const index of treasureCandidates.splice(0, config.treasureCount)) this.cells[index].kind = 'treasure'
    this.cells[this.startIndex].revealed = true

    // 各マスの数字は隣接8マスにある宝と地雷の合計。階段は数字に含めない。
    for (let index = 0; index < this.cells.length; index++) {
      this.cells[index].number = this.neighbors(index).filter(i => {
        const kind = this.cells[i].kind
        return kind === 'treasure' || kind === 'mine'
      }).length
    }
    // 通常フロアは階段、最終フロアは大宝をゴールとして1つ配置する。
    // 可能なら0マスに置き、0マスの自動開示でゴールが偶然見つかるのを避ける。
    const stairsCandidates = this.cells.map((cell, index) => ({ cell, index }))
      .filter(({ cell, index }) => cell.kind === 'empty' && cell.number === 0 && index !== this.startIndex)
      .map(({ index }) => index)
    const fallback = this.cells.map((cell, index) => ({ cell, index }))
      .filter(({ cell, index }) => cell.kind === 'empty' && index !== this.startIndex)
      .map(({ index }) => index)
    const stairsChoices = stairsCandidates.length ? stairsCandidates : fallback
    const goalIndex = stairsChoices[Math.floor(Math.random() * stairsChoices.length)]
    if (isFinalFloor) {
      this.stairsIndex = null
      this.greatTreasureIndex = goalIndex
      this.cells[goalIndex].kind = 'greatTreasure'
      for (const neighbor of this.neighbors(goalIndex)) this.cells[neighbor].number++
    } else {
      this.stairsIndex = goalIndex
      this.greatTreasureIndex = null
      this.cells[goalIndex].kind = 'stairs'
    }
  }

  canDig(index: number): boolean {
    // 実際に掘るには隣接マスの開示に加えて、必要なスタミナが必要。
    return this.canAttemptDig(index) && this.stamina >= this.getDigCost(index)
  }

  canAttemptDig(index: number): boolean {
    // 到達可能性だけを判定する。スタミナ不足でも画面に候補や印を出す用途がある。
    return this.status === 'playing' && Number.isInteger(index) && index >= 0 && index < this.cells.length &&
      !this.cells[index].revealed && this.neighbors(index).some(i => this.cells[i].revealed)
  }

  getDigCost(index: number): number {
    // 宝・地雷は通常採掘分に追加コストを加える。表示と実消費で同じ計算を使う。
    const kind = this.cells[index]?.kind
    if (kind === 'treasure') return this.config.digCost + this.config.treasureDigCost
    if (kind === 'mine') return this.config.digCost + this.config.mineDamage
    return this.config.digCost
  }

  dig(index: number): void {
    if (!this.canDig(index)) return
    const cell = this.cells[index]
    this.stamina -= this.getDigCost(index)
    cell.revealed = true
    // 大宝の発見をスタミナ切れ判定より先に確定し、発見後の帰還につなげる。
    if (cell.kind === 'greatTreasure') {
      this.greatTreasureFound = true
      return
    }
    if (this.stamina <= 0) {
      this.status = 'lost'
    } else if (cell.kind === 'stairs') {
      this.stairsFound = true
    } else if (cell.kind !== 'mine' && cell.number === 0) {
      this.revealEmptyNeighbors(index)
    }
  }

  private revealEmptyNeighbors(index: number): void {
    // 0マスから安全な隣接マスを連鎖開示する。地雷だけは決して自動で開かない。
    for (const neighbor of this.neighbors(index)) {
      const cell = this.cells[neighbor]
      if (cell.revealed || cell.kind === 'mine') continue
      cell.revealed = true
      if (cell.kind === 'stairs') this.stairsFound = true
      if (cell.number === 0) this.revealEmptyNeighbors(neighbor)
    }
  }

  private neighbors(index: number): number[] {
    // 斜めを含む周囲8方向を返す。端や角では盤面内のマスだけが対象になる。
    const x = index % this.config.width
    const y = Math.floor(index / this.config.width)
    const result: number[] = []
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx, ny = y + dy
      if (nx >= 0 && nx < this.config.width && ny >= 0 && ny < this.config.height) result.push(ny * this.config.width + nx)
    }
    return result
  }

  private shuffle(items: number[]): void {
    // 配列をその場でランダム化し、配置候補の偏りを抑える。
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[items[i], items[j]] = [items[j], items[i]]
    }
  }
}
