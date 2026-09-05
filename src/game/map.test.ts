import { describe, expect, it } from 'vitest';
import {
  countGlyphBricks,
  canDamageBase,
  createLevelMap,
  directionToward,
  gridCenter,
  isClearLine,
  isTankBlocked,
  rectTouchesBlockedCell,
  worldToGrid,
} from './map';

describe('level map', () => {
  const canReach = (
    grid: ReturnType<typeof createLevelMap>,
    start: { col: number; row: number },
    destination: { col: number; row: number },
  ): boolean => {
    const queue = [start];
    const visited = new Set([`${start.col},${start.row}`]);
    const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.col === destination.col && current.row === destination.row) return true;
      for (const [dc, dr] of directions) {
        const col = current.col + dc;
        const row = current.row + dr;
        const key = `${col},${row}`;
        const cell = grid[row]?.[col];
        if (!cell || visited.has(key) || isTankBlocked(cell)) continue;
        visited.add(key);
        queue.push({ col, row });
      }
    }
    return false;
  };

  it('contains the complete LXY brick signature', () => {
    const grid = createLevelMap();
    expect(countGlyphBricks(grid)).toBe(31);
    // X 的四角和中心、Y 的双臂与中轴必须存在。
    expect(grid[9][11].signature).toBe(true);
    expect(grid[9][15].signature).toBe(true);
    expect(grid[12][13].signature).toBe(true);
    expect(grid[9][17].signature).toBe(true);
    expect(grid[9][21].signature).toBe(true);
    expect(grid[15][19].signature).toBe(true);
  });

  it('keeps the player spawn walkable and the base blocked', () => {
    const grid = createLevelMap();
    const playerSpawn = gridCenter(13, 22);
    const base = gridCenter(13, 24);

    expect(rectTouchesBlockedCell(grid, { ...playerSpawn, width: 25, height: 25 })).toBe(false);
    expect(rectTouchesBlockedCell(grid, { ...base, width: 25, height: 25 })).toBe(true);
  });

  it('keeps the tactical terrain mirrored outside the LXY and base zones', () => {
    const grid = createLevelMap();
    for (let row = 1; row <= 22; row += 1) {
      for (let col = 1; col < 13; col += 1) {
        const mirroredCol = 25 - col;
        const inSignatureZone = row >= 8 && row <= 16
          && ((col >= 5 && col <= 22) || (mirroredCol >= 5 && mirroredCol <= 22));
        if (inSignatureZone) continue;
        expect(grid[row][col].type, `cell ${col},${row}`).toBe(grid[row][mirroredCol].type);
      }
    }
  });

  it('keeps all enemy spawn lanes connected to the player defense area', () => {
    const grid = createLevelMap();
    const playerDefense = { col: 13, row: 22 };
    for (const spawn of [{ col: 2, row: 2 }, { col: 13, row: 2 }, { col: 23, row: 2 }]) {
      expect(isTankBlocked(grid[spawn.row][spawn.col])).toBe(false);
      expect(canReach(grid, spawn, playerDefense), `spawn ${spawn.col},${spawn.row}`).toBe(true);
    }
  });

  it('converts between grid and world coordinates', () => {
    const center = gridCenter(7, 10);
    expect(worldToGrid(center.x, center.y)).toEqual({ col: 7, row: 10 });
  });

  it('detects blocked and open firing lanes', () => {
    const grid = createLevelMap();
    expect(isClearLine(grid, { col: 1, row: 2 }, { col: 1, row: 8 })).toBe(true);
    expect(isClearLine(grid, { col: 5, row: 8 }, { col: 5, row: 16 })).toBe(false);
    expect(isClearLine(grid, { col: 1, row: 1 }, { col: 3, row: 3 })).toBe(false);
  });

  it('prioritizes the axis with the larger target distance', () => {
    expect(directionToward({ col: 2, row: 2 }, { col: 9, row: 4 })[0]).toBe('right');
    expect(directionToward({ col: 9, row: 9 }, { col: 8, row: 2 })[0]).toBe('up');
  });

  it('never allows player fire to damage the friendly base', () => {
    expect(canDamageBase('player')).toBe(false);
    expect(canDamageBase('enemy')).toBe(true);
  });
});
