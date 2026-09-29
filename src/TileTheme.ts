import type { Cell } from './MiningBoard'

// タイル画像の場所とPhaser texture keyをここにまとめ、テーマ追加時の変更箇所を限定する。
export const STANDARD_TILE_THEME = {
  textures: {
    unexplored: { key: 'tile-standard-unexplored', path: 'assets/tiles/standard/unexplored.png' },
    explored: { key: 'tile-standard-explored', path: 'assets/tiles/standard/explored.png' },
    treasure: { key: 'tile-standard-treasure', path: 'assets/tiles/standard/dug.png' },
    mine: { key: 'tile-standard-mine', path: 'assets/tiles/standard/mine.png' },
    ladder: { key: 'tile-standard-ladder', path: 'assets/tiles/standard/ladder.png' },
  },
} as const

// 未探索中は中身を参照せず、発見済みセルだけ種類に応じた画像へ切り替える。
export function getStandardTileTexture(cell: Pick<Cell, 'kind' | 'number' | 'revealed'>): string {
  const textures = STANDARD_TILE_THEME.textures
  if (!cell.revealed) return textures.unexplored.key

  switch (cell.kind) {
    case 'treasure': return textures.treasure.key
    case 'mine': return textures.mine.key
    case 'stairs': return textures.ladder.key
    default: return textures.explored.key
  }
}
