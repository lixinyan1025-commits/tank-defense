import { describe, expect, it } from 'vitest';
import { addDefenseEnergy, defenseEnergyGainFor, DEFENSE_ENERGY_MAX } from './defenseEnergy';

describe('defense energy', () => {
  it('awards more energy for dangerous enemies', () => {
    expect(defenseEnergyGainFor('normal')).toBe(18);
    expect(defenseEnergyGainFor('scout')).toBe(18);
    expect(defenseEnergyGainFor('sniper')).toBe(22);
    expect(defenseEnergyGainFor('heavy')).toBe(26);
    expect(defenseEnergyGainFor('ricochet')).toBe(26);
    expect(defenseEnergyGainFor('boss')).toBe(DEFENSE_ENERGY_MAX);
  });

  it('accumulates energy and clamps the meter at 100 percent', () => {
    expect(addDefenseEnergy(0, 18)).toBe(18);
    expect(addDefenseEnergy(82, 26)).toBe(DEFENSE_ENERGY_MAX);
    expect(addDefenseEnergy(0, -20)).toBe(0);
  });
});
