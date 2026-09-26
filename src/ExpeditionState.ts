export class ExpeditionState {
  floor = 1
  carriedTreasures = 0
  storedTreasures = 0

  beginExpedition(): void {
    this.floor = 1
    this.carriedTreasures = 0
  }

  collectTreasure(): void {
    this.carriedTreasures++
  }

  descend(): void {
    this.floor++
  }

  returnToBase(): void {
    this.storedTreasures += this.carriedTreasures
    this.carriedTreasures = 0
    this.floor = 1
  }
}
