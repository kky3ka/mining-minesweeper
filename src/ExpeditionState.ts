import { MAX_DUNGEON_FLOORS } from './DungeonData'

// 進行階数の上限。最深部では階段の代わりに大宝を配置する。
export { MAX_DUNGEON_FLOORS }

/** 探索中の仮取得分と拠点に保管した分を分けて管理する。 */
export class ExpeditionState {
  floor = 1
  carriedTreasures = 0
  storedTreasures = 0
  greatTreasureObtained = false

  beginExpedition(): void {
    // 新しい出発では探索階と持ち帰り前の宝だけを初期化する。
    this.floor = 1
    this.carriedTreasures = 0
  }

  collectTreasure(): void {
    this.carriedTreasures++
  }

  descend(): boolean {
    // 上限階より先には進めない。呼び出し側は false のとき遷移しない。
    if (this.floor >= MAX_DUNGEON_FLOORS) return false
    this.floor++
    return true
  }

  get isFinalFloor(): boolean {
    return this.floor === MAX_DUNGEON_FLOORS
  }

  collectGreatTreasure(): void {
    this.greatTreasureObtained = true
  }

  returnToBase(): void {
    // 帰還時に通常の宝を保管へ移す。大宝は別フラグで記録する。
    this.storedTreasures += this.carriedTreasures
    this.carriedTreasures = 0
    this.floor = 1
  }

  failExpedition(): void {
    // 探索失敗では今回持ち帰る予定だった宝を失い、保管済みの宝は維持する。
    this.carriedTreasures = 0
    this.floor = 1
  }
}
