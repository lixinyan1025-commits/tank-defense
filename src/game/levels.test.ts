import { describe, expect, it } from 'vitest';
import { LEVEL_DEFINITIONS, countBosses } from './levels';

describe('level progression', () => {
  it('provides six sequential levels', () => {
    expect(LEVEL_DEFINITIONS).toHaveLength(6);
    expect(LEVEL_DEFINITIONS.every((level) => level.enemies.length > 0)).toBe(true);
  });

  it('keeps bosses out of regular levels', () => {
    expect(LEVEL_DEFINITIONS.slice(0, -1).every((level) => countBosses(level) === 0)).toBe(true);
  });

  it('uses exactly one boss in the final level', () => {
    const finalLevel = LEVEL_DEFINITIONS.at(-1);
    expect(finalLevel).toBeDefined();
    expect(countBosses(finalLevel!)).toBe(1);
    expect(finalLevel!.enemies).toEqual(['boss']);
  });

  it('increases clear bonuses as levels progress', () => {
    const bonuses = LEVEL_DEFINITIONS.map((level) => level.clearBonus);
    expect(bonuses).toEqual([...bonuses].sort((a, b) => a - b));
  });
});
