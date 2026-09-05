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

  const setMirrored = (col: number, row: number, type: TerrainType): void => {
    set(col, row, type);
    set(MAP_COLS - 1 - col, row, type);
  };

  const fillMirrored = (left: number, top: number, width: number, height: number, type: TerrainType): void => {
    fill(left, top, width, height, type);
    fill(MAP_COLS - left - width, top, width, height, type);
  };

  for (let i = 0; i < MAP_COLS; i += 1) {
    set(i, 0, 'steel');
    set(i, MAP_ROWS - 1, 'steel');
  }
  for (let i = 1; i < MAP_ROWS - 1; i += 1) {
    set(0, i, 'steel');
    set(MAP_COLS - 1, i, 'steel');
  }

  // 对称双翼水道：上下分段，中间和底部各保留横向换线通道。
  fillMirrored(3, 5, 2, 4, 'water');
  fillMirrored(3, 17, 2, 4, 'water');

  // 水道内侧的草丛掩护区，兼顾伏击与视野变化。
  fillMirrored(6, 5, 3, 3, 'grass');
  fillMirrored(6, 18, 3, 3, 'grass');

  // 对称钢墙堡垒，控制三条纵向进攻路线但不完全封死通道。
  [[6, 4], [8, 7], [2, 12], [7, 17], [9, 21]]
    .forEach(([col, row]) => setMirrored(col, row, 'steel'));

  // 对称可破坏掩体，为反弹、穿透和破墙战术提供选择。
  [[9, 4], [11, 5], [2, 10], [6, 16], [8, 20], [11, 19], [5, 22]]
    .forEach(([col, row]) => setMirrored(col, row, 'brick'));

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

  // 基地核心与 U 形可破坏防线。
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
