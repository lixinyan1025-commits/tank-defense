import { describe, expect, it } from 'vitest';
import {
  canProjectileDamageBase,
  enemyProjectileCanDamagePlayer,
  LIGHTNING_DAMAGE,
  LIGHTNING_TARGET_LIMIT,
  projectileDamageFor,
  projectilePassesBlockedTerrain,
  stackPickupAmount,
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

  it('prevents point-blank contact shots from causing collision-like damage', () => {
    expect(enemyProjectileCanDamagePlayer(0)).toBe(false);
    expect(enemyProjectileCanDamagePlayer(23.99)).toBe(false);
    expect(enemyProjectileCanDamagePlayer(24)).toBe(true);
  });

  it('defines lightning as three unique one-damage strikes', () => {
    expect(LIGHTNING_TARGET_LIMIT).toBe(3);
    expect(LIGHTNING_DAMAGE).toBe(1);
  });

  it('stacks repeated pickups while a different skill starts a new stack', () => {
    expect(stackPickupAmount('airstrike', 'airstrike', 2, 1)).toBe(3);
    expect(stackPickupAmount('split', 'split', 7, 7)).toBe(14);
    expect(stackPickupAmount('split', 'piercing', 7, 6)).toBe(6);
  });
});
