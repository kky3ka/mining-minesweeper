import dungeonData from '../data/dungeons.json'
import type { GameConfig } from './MiningBoard'

export interface ItemProbability {
  itemId: string
  probability: number
}

export interface DungeonStage {
  id: string
  sequence: number
  name: string
  entryCondition?: { type: string; itemId?: string }
  clearCondition: { type: string; itemId?: string; value?: number }
  map: {
    type: 'random' | 'fixed'
    width: number
    height: number
    mineProbability: number
    treasureProbability: number
    mapId?: string
  }
  items: ItemProbability[]
}

export interface DungeonDefinition {
  id: string
  name: string
  largeTreasure: string
  stages: DungeonStage[]
}

// JSONはゲームロジックから切り離し、ここで型付きのダンジョン定義として公開する。
export const DUNGEONS = dungeonData as DungeonDefinition[]

// ダンジョン選択画面がまだないため、現在はデータ先頭の廃鉱山を試作対象にする。
export const ACTIVE_DUNGEON = DUNGEONS[0]

if (!ACTIVE_DUNGEON) {
  throw new Error('data/dungeons.json にダンジョンが登録されていません')
}

export const MAX_DUNGEON_FLOORS = ACTIVE_DUNGEON.stages.length

export function getDungeonStage(dungeon: DungeonDefinition, floor: number): DungeonStage {
  const stage = dungeon.stages.find(candidate => candidate.sequence === floor)
  if (!stage) {
    throw new Error(`ダンジョン「${dungeon.id}」に ${floor} 番目の探索エリアがありません`)
  }
  return stage
}

// 探索エリアのマップ設定を既存の採掘バランス設定へ反映する。
export function createStageConfig(stage: DungeonStage, base: Readonly<GameConfig>): GameConfig {
  const { width, height } = stage.map
  const mapArea = width * height

  return {
    ...base,
    width,
    height,
    // 確率をマス数へ換算し、既存の盤面生成が扱う地雷個数にする。
    mineCount: Math.round(mapArea * stage.map.mineProbability / 100),
    treasureCount: Math.round(mapArea * stage.map.treasureProbability / 100),
  }
}
