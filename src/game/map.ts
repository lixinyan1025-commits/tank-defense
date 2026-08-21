import { MAP_COLS, MAP_ROWS, TILE_SIZE, type Direction } from './constants';

export type TerrainType = 'empty' | 'brick' | 'steel' | 'water' | 'grass' | 'base';

export interface TerrainCell {
  type: TerrainType;
  hp: number;
  temporaryUntil?: number;
  signature?: boolean;
}

export interface GridPoint {
  col: number;
  row: number;
}

export interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

const makeCell = (type: TerrainType): TerrainCell => ({
  type,
  hp: type === 'brick' ? 2 : type === 'base' ? 5 : Number.POSITIVE_INFINITY,
});

export const createLevelMap = (): TerrainCell[][] => {
  const grid = Array.from({ length: MAP_ROWS }, () =>
    Array.from({ length: MAP_COLS }, () => makeCell('empty')),
  );

  const set = (col: number, row: number, type: TerrainType): void => {
    if (col < 0 || row < 0 || col >= MAP_COLS || row >= MAP_ROWS) return;
    grid[row][col] = makeCell(type);
  };

  const fill = (left: number, top: number, width: number, height: number, type: TerrainType): void => {
    for (let row = top; row < top + height; row += 1) {
      for (let col = left; col < left + width; col += 1) set(col, row, type);
    }
  };

  for (let i = 0; i < MAP_COLS; i += 1) {
    set(i, 0, 'steel');
    set(i, MAP_ROWS - 1, 'steel');
  }
  for (let i = 1; i < MAP_ROWS - 1; i += 1) {
    set(0, i, 'steel');
    set(MAP_COLS - 1, i, 'steel');
  }

  // 左侧水道与桥口。
  fill(3, 6, 3, 6, 'water');
  fill(3, 14, 3, 6, 'water');
  fill(2, 8, 1, 2, 'water');
  fill(2, 17, 1, 2, 'water');

  // 右侧草地区，草地不阻挡但改变视野。
  fill(20, 6, 4, 5, 'grass');
  fill(19, 15, 5, 5, 'grass');
  fill(18, 8, 2, 2, 'grass');

  // 教学用钢墙角度和若干掩体。
  [[7, 5], [8, 5], [17, 5], [18, 5], [7, 19], [8, 19], [17, 19], [18, 19], [6, 8], [22, 12]]
    .forEach(([col, row]) => set(col, row, 'steel'));

  [[9, 4], [10, 4], [15, 4], [16, 4], [2, 13], [5, 17], [22, 17], [23, 13], [9, 20], [16, 20]]
    .forEach(([col, row]) => set(col, row, 'brick'));

  // 清空签名展示区，避免其他地形干扰字母轮廓。
  for (let row = 8; row <= 16; row += 1) {
    for (let col = 5; col <= 22; col += 1) set(col, row, 'empty');
  }

  // 中央 LXY 砖墙签名：三组 5×7 点阵，中间保留一格通道。
  const glyphs = [
    ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    ['#...#', '.#.#.', '..#..', '..#..', '..#..', '.#.#.', '#...#'],
    ['#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..', '..#..'],
  ];
  const starts = [5, 11, 17];
  glyphs.forEach((glyph, glyphIndex) => {
    glyph.forEach((line, rowOffset) => {
      [...line].forEach((char, colOffset) => {
        if (char === '#') {
          const col = starts[glyphIndex] + colOffset;
          const row = 9 + rowOffset;
          set(col, row, 'brick');
          grid[row][col].hp = 3;
          grid[row][col].signature = true;
        }
      });
    });
  });

  // 基地与 U 形可破坏防线。
  set(13, 24, 'base');
  [[12, 23], [13, 23], [14, 23], [12, 24], [14, 24]]
    .forEach(([col, row]) => set(col, row, 'brick'));

  return grid;
};

export const isTankBlocked = (cell: TerrainCell): boolean =>
  cell.type === 'brick' || cell.type === 'steel' || cell.type === 'water' || cell.type === 'base';

export const isProjectileBlocked = (cell: TerrainCell): boolean =>
  cell.type === 'brick' || cell.type === 'steel' || cell.type === 'base';

export const canDamageBase = (team: 'player' | 'enemy'): boolean => team === 'enemy';

export const worldToGrid = (x: number, y: number): GridPoint => ({
  col: Math.floor(x / TILE_SIZE),
  row: Math.floor(y / TILE_SIZE),
});

export const gridCenter = (col: number, row: number): { x: number; y: number } => ({
  x: col * TILE_SIZE + TILE_SIZE / 2,
  y: row * TILE_SIZE + TILE_SIZE / 2,
});

export const cellAtWorld = (
  grid: TerrainCell[][],
  x: number,
  y: number,
): TerrainCell | undefined => {
  const { col, row } = worldToGrid(x, y);
  return grid[row]?.[col];
};

export const rectTouchesBlockedCell = (grid: TerrainCell[][], rect: RectLike): boolean => {
  const inset = 1;
  const points = [
    [rect.x - rect.width / 2 + inset, rect.y - rect.height / 2 + inset],
    [rect.x + rect.width / 2 - inset, rect.y - rect.height / 2 + inset],
    [rect.x - rect.width / 2 + inset, rect.y + rect.height / 2 - inset],
    [rect.x + rect.width / 2 - inset, rect.y + rect.height / 2 - inset],
  ];

  return points.some(([x, y]) => {
    const cell = cellAtWorld(grid, x, y);
    return !cell || isTankBlocked(cell);
  });
};

export const isClearLine = (
  grid: TerrainCell[][],
  from: GridPoint,
  to: GridPoint,
): boolean => {
  if (from.col !== to.col && from.row !== to.row) return false;
  const colStep = Math.sign(to.col - from.col);
  const rowStep = Math.sign(to.row - from.row);
  let col = from.col + colStep;
  let row = from.row + rowStep;

  while (col !== to.col || row !== to.row) {
    const cell = grid[row]?.[col];
    if (!cell || isProjectileBlocked(cell)) return false;
    col += colStep;
    row += rowStep;
  }
  return true;
};

export const directionToward = (from: GridPoint, to: GridPoint): Direction[] => {
  const horizontal: Direction = to.col >= from.col ? 'right' : 'left';
  const vertical: Direction = to.row >= from.row ? 'down' : 'up';
  const horizontalDistance = Math.abs(to.col - from.col);
  const verticalDistance = Math.abs(to.row - from.row);
  return horizontalDistance > verticalDistance
    ? [horizontal, vertical]
    : [vertical, horizontal];
};

export const countGlyphBricks = (grid: TerrainCell[][]): number => {
  let count = 0;
  for (let row = 9; row <= 15; row += 1) {
    for (let col = 5; col <= 21; col += 1) {
      if (grid[row][col].signature) count += 1;
    }
  }
  return count;
};
