import { describe, expect, it } from 'vitest';
import {
  countGlyphBricks,
  canDamageBase,
  createLevelMap,
  directionToward,
  gridCenter,
  isClearLine,
  rectTouchesBlockedCell,
  worldToGrid,
} from './map';

describe('level map', () => {
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
