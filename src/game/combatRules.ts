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

const ENEMY_PROJECTILE_ARM_DISTANCE = 24;

export const enemyProjectileCanDamagePlayer = (travelledDistance: number): boolean =>
  travelledDistance >= ENEMY_PROJECTILE_ARM_DISTANCE;
