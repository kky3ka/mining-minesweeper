export type TileKind = 'empty' | 'treasure' | 'mine' | 'stairs'

export interface Cell {
  kind: TileKind
  number: number
  revealed: boolean
}

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

export class MiningBoard {
  readonly cells: Cell[]
  readonly startIndex: number
  readonly stairsIndex: number
  status: GameStatus = 'playing'
  stairsFound = false
  stamina: number
  readonly config: Readonly<GameConfig>

  constructor(config: Readonly<GameConfig> = DEFAULT_CONFIG, initialStamina = config.maxStamina) {
    this.config = config
    this.stamina = Math.min(config.maxStamina, Math.max(0, initialStamina))
    const { width, height } = config
    if (width < 3 || height < 3 || config.treasureCount < 0 || config.mineCount < 0 ||
      config.maxStamina <= 0 || config.digCost <= 0 || config.treasureDigCost <= 0 || config.mineDamage < 0 ||
      config.treasureCount + config.mineCount > width * height - 2) {
      throw new Error('Invalid board configuration')
    }
    this.cells = Array.from({ length: width * height }, () => ({ kind: 'empty', number: 0, revealed: false }))
    const startCandidates = this.cells.map((_, index) => index).filter(index =>
      this.cells.length - this.neighbors(index).length - 1 >= config.mineCount,
    )
    if (startCandidates.length === 0) {
      throw new Error('Too many mines to guarantee a safe starting point')
    }
    this.startIndex = startCandidates[Math.floor(Math.random() * startCandidates.length)]
    const adjacentToStart = new Set(this.neighbors(this.startIndex))
    const mineCandidates = this.cells.map((_, index) => index)
      .filter(index => index !== this.startIndex && !adjacentToStart.has(index))
    this.shuffle(mineCandidates)
    for (const index of mineCandidates.splice(0, config.mineCount)) this.cells[index].kind = 'mine'

    const treasureCandidates = this.cells.map((_, index) => index)
      .filter(index => index !== this.startIndex && this.cells[index].kind === 'empty')
    this.shuffle(treasureCandidates)
    for (const index of treasureCandidates.splice(0, config.treasureCount)) this.cells[index].kind = 'treasure'
    this.cells[this.startIndex].revealed = true

    for (let index = 0; index < this.cells.length; index++) {
      this.cells[index].number = this.neighbors(index).filter(i => {
        const kind = this.cells[i].kind
        return kind === 'treasure' || kind === 'mine'
      }).length
    }
    const stairsCandidates = this.cells.map((cell, index) => ({ cell, index }))
      .filter(({ cell, index }) => cell.number === 0 && index !== this.startIndex)
      .map(({ index }) => index)
    const fallback = this.cells.map((_, index) => index).filter(index => index !== this.startIndex)
    const stairsChoices = stairsCandidates.length ? stairsCandidates : fallback
    this.stairsIndex = stairsChoices[Math.floor(Math.random() * stairsChoices.length)]
    this.cells[this.stairsIndex].kind = 'stairs'
  }

  canDig(index: number): boolean {
    return this.canAttemptDig(index) && this.stamina >= this.getDigCost(index)
  }

  canAttemptDig(index: number): boolean {
    return this.status === 'playing' && Number.isInteger(index) && index >= 0 && index < this.cells.length &&
      !this.cells[index].revealed && this.neighbors(index).some(i => this.cells[i].revealed)
  }

  getDigCost(index: number): number {
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
    if (this.stamina <= 0) {
      this.status = 'lost'
    } else if (cell.kind === 'stairs') {
      this.stairsFound = true
    } else if (cell.kind !== 'mine' && cell.number === 0) {
      this.revealEmptyNeighbors(index)
    }
  }

  private revealEmptyNeighbors(index: number): void {
    for (const neighbor of this.neighbors(index)) {
      const cell = this.cells[neighbor]
      if (cell.revealed || cell.kind === 'mine') continue
      cell.revealed = true
      if (cell.kind === 'stairs') this.stairsFound = true
      if (cell.number === 0) this.revealEmptyNeighbors(neighbor)
    }
  }

  private neighbors(index: number): number[] {
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
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[items[i], items[j]] = [items[j], items[i]]
    }
  }
}
