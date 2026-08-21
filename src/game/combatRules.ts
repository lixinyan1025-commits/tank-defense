export type CombatTeam = 'player' | 'enemy';

export type CombatProjectileKind =
  | 'normal'
  | 'split'
  | 'ricochet'
  | 'piercing'
  | 'freeze'
  | 'chain'
  | 'flame'
  | 'confusion';

export const projectileDamageFor = (kind: CombatProjectileKind, baseDamage: number): number =>
  kind === 'confusion' ? 0 : baseDamage;

export const canProjectileDamageBase = (team: CombatTeam, kind: CombatProjectileKind): boolean =>
  team === 'enemy' && kind !== 'piercing';

export const projectilePassesBlockedTerrain = (kind: CombatProjectileKind): boolean => kind === 'piercing';
