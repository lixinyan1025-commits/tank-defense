import { describe, expect, it } from 'vitest';
import {
  canProjectileDamageBase,
  projectileDamageFor,
  projectilePassesBlockedTerrain,
} from './combatRules';

describe('projectile combat rules', () => {
  it('makes confusion shots pure control projectiles with zero damage', () => {
    expect(projectileDamageFor('confusion', 1)).toBe(0);
    expect(projectileDamageFor('confusion', 2)).toBe(0);
    expect(projectileDamageFor('normal', 2)).toBe(2);
  });

  it('lets piercing shots pass every blocked terrain type', () => {
    expect(projectilePassesBlockedTerrain('piercing')).toBe(true);
    expect(projectilePassesBlockedTerrain('normal')).toBe(false);
  });

  it('never lets a piercing shot damage the base', () => {
    expect(canProjectileDamageBase('player', 'piercing')).toBe(false);
    expect(canProjectileDamageBase('enemy', 'piercing')).toBe(false);
    expect(canProjectileDamageBase('player', 'normal')).toBe(false);
    expect(canProjectileDamageBase('enemy', 'normal')).toBe(true);
  });
});
