import type { ItemProbability } from './DungeonData'
import { SeededRandom } from './SeededRandom.ts'

// マスの中身を表す。画面表示はこの値を見て決め、盤面ルール自体は Phaser に依存させない。
export type TileKind = 'empty' | 'treasure' | 'mine' | 'stairs'

// 1マス分のゲーム状態。未探索かどうかと、周囲の危険・宝の数を保持する。
export interface Cell {
  kind: TileKind
  number: number
  revealed: boolean
  // プレイヤーが危険そうな場所を記録する印。宝・地雷の正解判定には使わない。
  flagged: boolean
  // 宝や大宝のマスターを参照するID。表示名などはアイテムデータ側に置く。
  itemId: string | null
}

// バランス調整に使う値をまとめる。盤面サイズを変えるときも生成処理の変更を最小限にする。
export interface GameConfig {
  width: number
  height: number
  // 盤面に配置する地雷・宝物の個数。ダンジョン設定ではマップ面積と出現率から算出する。
  treasureCount: number
  mineCount: number
  maxStamina: number
  digCost: number
  treasureDigCost: number
  mineDamage: number
}

export interface BoardGenerationOptions {
  seed: number
  treasureItems?: readonly ItemProbability[]
}

// 試作向けの初期値。数値調整はここだけを変更すれば反映できる。
export const DEFAULT_CONFIG: Readonly<GameConfig> = {
  width: 10,
  height: 10,
  treasureCount: 8,
  mineCount: 6,
  maxStamina: 150,
  digCost: 1,
  treasureDigCost: 0,
  mineDamage: 5,
}

export type GameStatus = 'playing' | 'lost'

/** Phaser を使わずに盤面生成、採掘可否、周囲の数字計算を行うゲームロジック。 */
export class MiningBoard {
  readonly cells: Cell[]
  readonly startIndex: number
  readonly stairsIndex: number | null
  readonly generationSeed: number
  status: GameStatus = 'playing'
  stairsFound = false
  stamina: number
  readonly config: Readonly<GameConfig>
  private readonly random: SeededRandom

  // マスの種類から数えるため、設定値ではなく実際に生成された個数を返す。
  get placedMineCount(): number {
    return this.cells.filter(cell => cell.kind === 'mine').length
  }

  get placedTreasureCount(): number {
    return this.cells.filter(cell => cell.kind === 'treasure').length
  }

  constructor(
    config: Readonly<GameConfig> = DEFAULT_CONFIG,
    initialStamina = config.maxStamina,
    options: BoardGenerationOptions,
  ) {
    this.config = config
    this.generationSeed = options.seed
    this.random = new SeededRandom(options.seed)
    this.stamina = Math.min(config.maxStamina, Math.max(0, initialStamina))
    const { width, height } = config
    if (width < 3 || height < 3 || config.treasureCount < 0 || config.mineCount < 0 ||
      config.maxStamina <= 0 || config.digCost <= 0 || config.treasureDigCost < 0 || config.mineDamage < 0 ||
      config.treasureCount + config.mineCount > width * height - 2) {
      throw new Error('Invalid board configuration')
    }
    // 盤面は一次元配列で持ち、座標との変換には width を使う。縦横サイズを変えても扱いやすい。
    this.cells = Array.from({ length: width * height }, () => ({
      kind: 'empty', number: 0, revealed: false, flagged: false, itemId: null,
    }))
    const startCandidates = this.cells.map((_, index) => index).filter(index =>
      this.cells.length - this.neighbors(index).length - 1 >= config.mineCount + config.treasureCount,
    )
    if (startCandidates.length === 0) {
      throw new Error('Too many resources to guarantee a safe starting point')
    }
    // 開始位置とその周囲8マスには宝・地雷を置かず、最初の数字が必ず0になるようにする。
    this.startIndex = startCandidates[Math.floor(this.random.next() * startCandidates.length)]
    const adjacentToStart = new Set(this.neighbors(this.startIndex))
    const mineCandidates = this.cells.map((_, index) => index)
      .filter(index => index !== this.startIndex && !adjacentToStart.has(index))
    this.shuffle(mineCandidates)
    for (const index of mineCandidates.splice(0, config.mineCount)) this.cells[index].kind = 'mine'

    const treasureCandidates = this.cells.map((_, index) => index)
      .filter(index => index !== this.startIndex && !adjacentToStart.has(index) && this.cells[index].kind === 'empty')
    this.shuffle(treasureCandidates)
    for (const index of treasureCandidates.splice(0, config.treasureCount)) {
      this.cells[index].kind = 'treasure'
      this.cells[index].itemId = this.chooseItemId(options.treasureItems ?? [])
    }
    this.cells[this.startIndex].revealed = true

    // 各マスの数字は隣接8マスにある宝と地雷の合計。階段は数字に含めない。
    for (let index = 0; index < this.cells.length; index++) {
      this.cells[index].number = this.neighbors(index).filter(i => {
        const kind = this.cells[i].kind
        return kind === 'treasure' || kind === 'mine'
      }).length
    }
    // 各フロアに階段を1つ配置する。最深層を下りたときの大宝獲得は進行側で処理する。
    // 可能なら0マスに置き、0マスの自動開示で階段が偶然見つかるのを避ける。
    const stairsCandidates = this.cells.map((cell, index) => ({ cell, index }))
      .filter(({ cell, index }) => cell.kind === 'empty' && cell.number === 0 && index !== this.startIndex)
      .map(({ index }) => index)
    const fallback = this.cells.map((cell, index) => ({ cell, index }))
      .filter(({ cell, index }) => cell.kind === 'empty' && index !== this.startIndex)
      .map(({ index }) => index)
    const stairsChoices = stairsCandidates.length ? stairsCandidates : fallback
    this.stairsIndex = stairsChoices[Math.floor(this.random.next() * stairsChoices.length)]
    this.cells[this.stairsIndex].kind = 'stairs'
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

  toggleFlag(index: number): boolean {
    // 旗は未探索マスにだけ付け外しでき、採掘内容や生成結果には影響しない。
    if (this.status !== 'playing' || !Number.isInteger(index) || index < 0 || index >= this.cells.length ||
      this.cells[index].revealed) return false
    this.cells[index].flagged = !this.cells[index].flagged
    return true
  }

  dig(index: number): void {
    if (!this.canDig(index)) return
    const cell = this.cells[index]
    this.stamina -= this.getDigCost(index)
    cell.revealed = true
    cell.flagged = false
    if (this.stamina <= 0) {
      this.status = 'lost'
    } else if (cell.kind === 'stairs') {
      this.stairsFound = true
    } else if (cell.kind !== 'mine' && cell.number === 0) {
      this.revealAdjacentSafeCells(index)
    }
  }

  private revealAdjacentSafeCells(index: number): void {
    // 0マスの周囲1段だけを開示し、開いた先の0マスからは連鎖させない。
    for (const neighbor of this.neighbors(index)) {
      const cell = this.cells[neighbor]
      if (cell.revealed || cell.kind === 'mine') continue
      cell.revealed = true
      cell.flagged = false
      if (cell.kind === 'stairs') this.stairsFound = true
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
      const j = Math.floor(this.random.next() * (i + 1))
      ;[items[i], items[j]] = [items[j], items[i]]
    }
  }

  private chooseItemId(items: readonly ItemProbability[]): string | null {
    const totalProbability = items.reduce((total, item) => total + Math.max(0, item.probability), 0)
    if (totalProbability <= 0) return null

    let roll = this.random.next() * totalProbability
    for (const item of items) {
      roll -= Math.max(0, item.probability)
      if (roll < 0) return item.itemId
    }

    // 浮動小数点の端数で最後まで決まらない場合も、最後の候補を使う。
    return items[items.length - 1]?.itemId ?? null
  }
}
