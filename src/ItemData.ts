import itemData from '../data/items.json'

export interface ItemDefinition {
  id: string
  name: string
  type: string
  rarity: string
  sellPrice: number
  description: string
  icon: string
  sellable: boolean
}

// アイテムの表示情報はマスターデータから引き、所持数データと分けて扱う。
export const ITEMS = itemData as ItemDefinition[]
export const ITEMS_BY_ID = new Map(ITEMS.map(item => [item.id, item]))

export function getItemName(itemId: string): string {
  return ITEMS_BY_ID.get(itemId)?.name ?? itemId
}
