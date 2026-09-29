import { MAX_DUNGEON_FLOORS } from './DungeonData'

// 進行階数の初期上限。各ダンジョンの実際の上限は探索状態の呼び出し元から渡す。
export { MAX_DUNGEON_FLOORS }

/** 探索中の仮取得分と拠点に保管した分を分けて管理する。 */
export class ExpeditionState {
  floor = 1
  runSeed: number | null = null
  carriedItems: Record<string, number> = {}
  storedItems: Record<string, number> = {}
  greatTreasureObtained = false
  obtainedGreatTreasureIds: string[] = []

  beginExpedition(seed: number): void {
    // Run単位でSeedを保持し、階層移動中も同じ値を基準として使う。
    this.floor = 1
    this.runSeed = seed
    this.carriedItems = {}
  }

  collectTreasure(itemId: string): void {
    this.carriedItems[itemId] = (this.carriedItems[itemId] ?? 0) + 1
  }

  get carriedItemCount(): number {
    return Object.values(this.carriedItems).reduce((total, count) => total + count, 0)
  }

  get storedItemCount(): number {
    return Object.values(this.storedItems).reduce((total, count) => total + count, 0)
  }

  descend(maxFloors = MAX_DUNGEON_FLOORS): boolean {
    // 上限階より先には進めない。呼び出し側は false のとき遷移しない。
    if (this.floor >= maxFloors) return false
    this.floor++
    return true
  }

  get isFinalFloor(): boolean {
    return this.floor === MAX_DUNGEON_FLOORS
  }

  collectGreatTreasure(itemId: string): void {
    this.greatTreasureObtained = true
    if (!this.obtainedGreatTreasureIds.includes(itemId)) this.obtainedGreatTreasureIds.push(itemId)
  }

  returnToBase(): void {
    // 帰還時に探索中のアイテムを種類ごとに保管数へ加算する。
    for (const [itemId, count] of Object.entries(this.carriedItems)) {
      this.storedItems[itemId] = (this.storedItems[itemId] ?? 0) + count
    }
    this.carriedItems = {}
    this.floor = 1
    this.runSeed = null
  }

  failExpedition(): void {
    // 探索失敗では今回持ち帰る予定だった宝を失い、保管済みの宝は維持する。
    this.carriedItems = {}
    this.floor = 1
    this.runSeed = null
  }
}
