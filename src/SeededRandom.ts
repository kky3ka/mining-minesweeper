export const MAX_SEED = 0xffff_ffff

export function isValidSeed(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_SEED
}

export function parseSeed(input: string): number | null {
  const normalized = input.trim()
  if (!/^\d+$/.test(normalized)) return null

  const seed = Number(normalized)
  return isValidSeed(seed) ? seed : null
}

// Web Cryptoから0〜2^32-1のSeedを1回だけ作る。探索中には再生成しない。
export function createRandomSeed(): number {
  const values = new Uint32Array(1)
  globalThis.crypto.getRandomValues(values)
  return values[0]
}

// ダンジョンIDを文字列ハッシュにし、Run Seedと探索エリアsequenceを混ぜる。
export function deriveStageSeed(dungeonId: string, runSeed: number, sequence: number): number {
  if (!dungeonId.trim() || !isValidSeed(runSeed) || !Number.isInteger(sequence) || sequence < 1 || sequence > MAX_SEED) {
    throw new RangeError('ダンジョンID、Run Seed、探索エリアsequenceを正しく指定してください')
  }

  // FNV-1aでIDを安定して数値化し、区切りと固定幅の数値を順番に混ぜる。
  let value = 0x811c_9dc5
  for (let index = 0; index < dungeonId.length; index++) {
    value = Math.imul(value ^ dungeonId.charCodeAt(index), 0x0100_0193) >>> 0
  }
  value = Math.imul(value ^ 0xff, 0x0100_0193) >>> 0
  value = Math.imul(value ^ runSeed, 0x0100_0193) >>> 0
  value = Math.imul(value ^ sequence, 0x0100_0193) >>> 0
  value ^= value >>> 16
  value = Math.imul(value, 0x7feb_352d) >>> 0
  value ^= value >>> 15
  value = Math.imul(value, 0x846c_a68b) >>> 0
  value ^= value >>> 16
  return value >>> 0
}

// Mulberry32は外部ライブラリ不要で、同一Seedから同じ[0, 1)列を生成する。
export class SeededRandom {
  private state: number

  constructor(seed: number) {
    if (!isValidSeed(seed)) throw new RangeError(`Seedは0〜${MAX_SEED}の整数で指定してください`)
    this.state = seed >>> 0
  }

  next(): number {
    this.state = (this.state + 0x6d2b_79f5) >>> 0
    let value = this.state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000
  }
}
