export type EnemyKind = 'normal' | 'scout' | 'heavy' | 'sniper' | 'ricochet' | 'boss';

export interface LevelDefinition {
  name: string;
  subtitle: string;
  enemies: EnemyKind[];
  clearBonus: number;
}

export const LEVEL_DEFINITIONS: readonly LevelDefinition[] = [
  {
    name: '边境巡防',
    subtitle: '熟悉移动与射击，清除基础巡逻队',
    enemies: ['normal', 'normal', 'normal', 'normal'],
    clearBonus: 300,
  },
  {
    name: '高速突袭',
    subtitle: '快速坦克从侧翼切入，注意调整方向',
    enemies: ['normal', 'scout', 'normal', 'scout', 'normal', 'scout'],
    clearBonus: 450,
  },
  {
    name: '钢铁封锁',
    subtitle: '重装与狙击单位加入战场',
    enemies: ['normal', 'heavy', 'normal', 'sniper', 'heavy', 'normal', 'scout'],
    clearBonus: 600,
  },
  {
    name: '折射迷阵',
    subtitle: '反弹炮弹会绕过掩体，保持移动',
    enemies: ['scout', 'ricochet', 'normal', 'heavy', 'ricochet', 'scout', 'heavy', 'normal'],
    clearBonus: 800,
  },
  {
    name: '精英防线',
    subtitle: '最终精英部队来袭，但本关没有 Boss',
    enemies: ['heavy', 'sniper', 'ricochet', 'scout', 'heavy', 'normal', 'sniper', 'ricochet', 'scout'],
    clearBonus: 1100,
  },
  {
    name: '潮汐决战',
    subtitle: '最终关仅有一只潮汐巨兽',
    enemies: ['boss'],
    clearBonus: 2000,
  },
] as const;

export const countBosses = (level: LevelDefinition): number =>
  level.enemies.filter((enemy) => enemy === 'boss').length;
