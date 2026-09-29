import type { Cell } from './MiningBoard'

// 探知距離は試作値。マップ密度を変える場合も、この設定だけを調整すればよい。
export const DETECTOR_CONFIG = {
  strongDistance: 2,
  mediumDistance: 5,
  weakDistance: 10,
} as const

export type DetectableKind = 'treasure' | 'mine'
export type DetectorStrength = 0 | 1 | 2 | 3

export interface DetectorReading {
  strength: DetectorStrength
  nearestDistance: number | null
}

// 盤面の隠された対象を検索するだけの関数。表示やゲーム状態の変更は行わない。
export function readDetector(
  cells: readonly Cell[],
  width: number,
  playerIndex: number,
  targetKind: DetectableKind,
): DetectorReading {
  const playerX = playerIndex % width
  const playerY = Math.floor(playerIndex / width)
  let nearestDistance = Number.POSITIVE_INFINITY

  cells.forEach((cell, index) => {
    // 発見・採掘済みのものは探知対象から除き、未発見の埋蔵物だけを探す。
    if (cell.kind !== targetKind || cell.revealed) return

    const dx = index % width - playerX
    const dy = Math.floor(index / width) - playerY
    const distance = Math.hypot(dx, dy)
    if (distance < nearestDistance) {
      nearestDistance = distance
    }
  })

  if (!Number.isFinite(nearestDistance) || nearestDistance > DETECTOR_CONFIG.weakDistance) {
    return { strength: 0, nearestDistance: null }
  }

  const strength: DetectorStrength = nearestDistance <= DETECTOR_CONFIG.strongDistance ? 3
    : nearestDistance <= DETECTOR_CONFIG.mediumDistance ? 2
      : 1

  return { strength, nearestDistance }
}
