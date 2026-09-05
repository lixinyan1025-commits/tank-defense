import type { EnemyKind } from './levels';

export const DEFENSE_ENERGY_MAX = 100;

export const defenseEnergyGainFor = (enemyKind: EnemyKind): number => {
  if (enemyKind === 'boss') return 100;
  if (enemyKind === 'heavy' || enemyKind === 'ricochet') return 26;
  if (enemyKind === 'sniper') return 22;
  return 18;
};

export const addDefenseEnergy = (current: number, gain: number): number =>
  Math.min(DEFENSE_ENERGY_MAX, Math.max(0, current + gain));
