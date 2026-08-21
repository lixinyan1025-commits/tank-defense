import Phaser from 'phaser';
import { AudioManager } from './audio';
import {
  COLORS,
  DIRECTION_VECTOR,
  MAP_COLS,
  MAP_ROWS,
  TILE_SIZE,
  WORLD_SIZE,
  clamp,
  type Direction,
} from './constants';
import {
  cellAtWorld,
  canDamageBase,
  createLevelMap,
  directionToward,
  gridCenter,
  isClearLine,
  isProjectileBlocked,
  rectTouchesBlockedCell,
  worldToGrid,
  type TerrainCell,
} from './map';
import { LEVEL_DEFINITIONS, type EnemyKind } from './levels';

export type Difficulty = 'easy' | 'normal' | 'hard';
type GameStatus = 'briefing' | 'playing' | 'paused' | 'reward' | 'victory' | 'defeat';
type Team = 'player' | 'enemy';
type ProjectileKind = 'normal' | 'split' | 'ricochet' | 'piercing' | 'freeze' | 'chain' | 'flame' | 'confusion';
type AmmoSkill = Exclude<ProjectileKind, 'normal'>;
type ActiveSkill = 'slow' | 'airstrike' | 'drone' | 'mine' | 'repair' | 'teleport' | 'heal' | 'shield' | 'overdrive' | 'emp';
type PickupKind = AmmoSkill | ActiveSkill;

export interface HudState {
  hp: number;
  maxHp: number;
  baseHp: number;
  level: number;
  totalLevels: number;
  levelName: string;
  enemies: number;
  score: number;
  combo: number;
  resonance: number;
  ammo: {
    name: string;
    description: string;
    icon: string;
    shots: number;
    operation: string;
    status: string;
  };
  active: {
    name: string;
    description: string;
    icon: string;
    ready: boolean;
    cooldownProgress: number;
    operation: string;
    status: string;
  };
  latestPickup?: {
    name: string;
    icon: string;
    operation: string;
    category: 'ammo' | 'active';
    fresh: boolean;
  };
}

export interface RewardChoice {
  kind: PickupKind;
  name: string;
  description: string;
  icon: string;
  category: 'ammo' | 'active';
  operation: string;
}

export interface LevelClearState {
  level: number;
  totalLevels: number;
  levelName: string;
  nextLevelName: string;
  bonusScore: number;
  repairedPlayer: boolean;
  repairedBase: boolean;
  choices: RewardChoice[];
}

export interface ResultState {
  outcome: 'victory' | 'defeat';
  score: number;
  kills: number;
  maxCombo: number;
}

interface TankEntity {
  id: string;
  team: Team;
  kind: EnemyKind | 'player';
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  speed: number;
  direction: Direction;
  fireInterval: number;
  lastShotAt: number;
  nextDecisionAt: number;
  nextSpecialAt: number;
  frozenUntil: number;
  confusedUntil: number;
  invulnerableUntil: number;
  alive: boolean;
  display: Phaser.GameObjects.Container;
}

interface ProjectileEntity {
  id: string;
  ownerId: string;
  team: Team;
  kind: ProjectileKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  bouncesRemaining: number;
  piercesRemaining: number;
  distance: number;
  bornAt: number;
  splitTriggered: boolean;
  hitIds: Set<string>;
  display: Phaser.GameObjects.Rectangle;
}

interface PickupEntity {
  kind: PickupKind;
  x: number;
  y: number;
  baseY: number;
  bornAt: number;
  expiresAt: number;
  display: Phaser.GameObjects.Container;
}

interface MineEntity {
  x: number;
  y: number;
  expiresAt: number;
  display: Phaser.GameObjects.Container;
}

interface BombEntity {
  x: number;
  y: number;
  explodeAt: number;
  marker: Phaser.GameObjects.Arc;
}

interface MonsterBurst {
  owner: TankEntity;
  fireAt: number;
  marker: Phaser.GameObjects.Arc;
}

interface ParticleEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  bornAt: number;
  life: number;
  display: Phaser.GameObjects.Rectangle;
}

interface DroneEntity {
  owner: TankEntity;
  expiresAt: number;
  lastShotAt: number;
}

interface DifficultyTuning {
  playerHp: number;
  baseHp: number;
  enemySpeed: number;
  enemyFireRate: number;
  pickupRate: number;
}

const TOTAL_LEVELS = LEVEL_DEFINITIONS.length;
const PLAYER_SIZE = 25;
const ENEMY_SIZE = 25;

const difficultyTuning: Record<Difficulty, DifficultyTuning> = {
  easy: { playerHp: 6, baseHp: 6, enemySpeed: 0.86, enemyFireRate: 1.2, pickupRate: 1.35 },
  normal: { playerHp: 5, baseHp: 5, enemySpeed: 1, enemyFireRate: 1, pickupRate: 1 },
  hard: { playerHp: 4, baseHp: 4, enemySpeed: 1.12, enemyFireRate: 0.82, pickupRate: 0.78 },
};

const skillInfo: Record<PickupKind, { name: string; description: string; icon: string; category: 'ammo' | 'active'; operation: string; shots?: number }> = {
  split: { name: '分裂弹', description: '飞行后分裂为三颗扇形小弹', icon: '⑂', category: 'ammo', operation: '按住 SPACE 发射；飞行一段距离后自动分裂', shots: 7 },
  ricochet: { name: '反弹弹', description: '最多反弹两次，也可能击中自己', icon: '◇', category: 'ammo', operation: '按住 SPACE 发射；瞄准墙面利用反弹角度', shots: 8 },
  piercing: { name: '穿透弹', description: '贯穿多个敌人并击穿砖墙', icon: '➜', category: 'ammo', operation: '按住 SPACE 发射；对准同一直线上的敌人', shots: 6 },
  freeze: { name: '冰冻弹', description: '冻结普通敌人三秒', icon: '❄', category: 'ammo', operation: '按住 SPACE 发射；命中敌人立即冻结', shots: 6 },
  chain: { name: '连锁闪电', description: '命中后跳向附近三个敌人', icon: 'ϟ', category: 'ammo', operation: '按住 SPACE 发射；优先瞄准密集敌群', shots: 6 },
  flame: { name: '火焰喷射', description: '短程三连火焰，可快速破砖', icon: '♨', category: 'ammo', operation: '按住 SPACE 连续喷射；靠近目标效果最好', shots: 7 },
  confusion: { name: '混乱弹', description: '令敌人短暂攻击自己的同伴', icon: '↻', category: 'ammo', operation: '按住 SPACE 发射；命中后引发敌军内讧', shots: 5 },
  slow: { name: '时间减速', description: '敌军与敌弹减速五秒', icon: '◷', category: 'active', operation: '轻按 Q 立即释放；全场生效，无需长按' },
  airstrike: { name: '呼叫空袭', description: '在附近投下六枚炸弹', icon: '✦', category: 'active', operation: '轻按 Q 释放；以当前位置为中心，随后避开红圈' },
  drone: { name: '召唤僚机', description: '自动追踪敌人并射击八秒', icon: '⌁', category: 'active', operation: '轻按 Q 释放；僚机会自动锁定最近敌人' },
  mine: { name: '地雷投放', description: '原地布置一颗范围地雷', icon: '⊛', category: 'active', operation: '轻按 Q 在脚下放置；场上最多三颗' },
  repair: { name: '修复砖墙', description: '修复或生成前方两格砖墙', icon: '▦', category: 'active', operation: '面向目标砖墙后轻按 Q；检测前方两格' },
  teleport: { name: '安全传送', description: '传送到安全空地并眩晕周围敌人', icon: '◎', category: 'active', operation: '危险时轻按 Q；随机传送到安全空地' },
  heal: { name: '紧急维修', description: '立即恢复两点装甲', icon: '✚', category: 'active', operation: '受伤后轻按 Q；满血使用不会消耗' },
  shield: { name: '能量护盾', description: '五秒内免疫所有伤害', icon: '⬡', category: 'active', operation: '轻按 Q 立即开启；持续五秒，无需长按' },
  overdrive: { name: '火力超频', description: '七秒内提升移动速度和射速', icon: '»', category: 'active', operation: '轻按 Q 开启；随后按住 SPACE 连续射击' },
  emp: { name: 'EMP 脉冲', description: '冻结全场普通敌军两秒半', icon: '◉', category: 'active', operation: '轻按 Q 立即释放；全场敌军暂时停机' },
};

const enemyStats: Record<EnemyKind, { hp: number; speed: number; fireInterval: number; score: number; color: number; view: number }> = {
  normal: { hp: 1, speed: 72, fireInterval: 1450, score: 100, color: 0xef6b73, view: 8 },
  scout: { hp: 1, speed: 105, fireInterval: 1200, score: 150, color: 0xff9f43, view: 9 },
  heavy: { hp: 3, speed: 50, fireInterval: 1750, score: 250, color: 0xc44569, view: 8 },
  sniper: { hp: 1, speed: 42, fireInterval: 2300, score: 260, color: 0xb18cff, view: 14 },
  ricochet: { hp: 2, speed: 62, fireInterval: 1650, score: 320, color: 0x42c9c2, view: 10 },
  boss: { hp: 16, speed: 48, fireInterval: 850, score: 2000, color: 0xff3b62, view: 16 },
};

const allDirections: Direction[] = ['up', 'right', 'down', 'left'];
const spawnPoints = [gridCenter(2, 2), gridCenter(13, 2), gridCenter(23, 2)];

const intersects = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean =>
  Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.y - b.y) < (a.height + b.height) / 2;

const pointHitsTank = (x: number, y: number, tank: TankEntity, radius = 4): boolean =>
  Math.abs(x - tank.x) <= tank.width / 2 + radius && Math.abs(y - tank.y) <= tank.height / 2 + radius;

const randomItem = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

let entitySequence = 0;
const nextId = (prefix: string): string => `${prefix}-${entitySequence += 1}`;

export class GameScene extends Phaser.Scene {
  private terrain: TerrainCell[][] = createLevelMap();
  private terrainGraphics!: Phaser.GameObjects.Graphics;
  private grassGraphics!: Phaser.GameObjects.Graphics;
  private floorGraphics!: Phaser.GameObjects.Graphics;
  private pauseText!: Phaser.GameObjects.Text;
  private shieldRing?: Phaser.GameObjects.Arc;
  private playerGuide?: Phaser.GameObjects.Container;
  private playerGuideUntil = 0;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'fire' | 'skill' | 'pause', Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private audio = new AudioManager();

  private status: GameStatus = 'briefing';
  private difficulty: Difficulty = 'normal';
  private elapsedMs = 0;
  private player?: TankEntity;
  private enemies: TankEntity[] = [];
  private projectiles: ProjectileEntity[] = [];
  private pickups: PickupEntity[] = [];
  private mines: MineEntity[] = [];
  private bombs: BombEntity[] = [];
  private monsterBursts: MonsterBurst[] = [];
  private particles: ParticleEntity[] = [];
  private drones: DroneEntity[] = [];

  private baseHp = 5;
  private maxBaseHp = 5;
  private level = 0;
  private spawnQueue: EnemyKind[] = [];
  private nextSpawnAt = 0;
  private levelClearAt = 0;
  private nextPickupAt = 0;
  private score = 0;
  private kills = 0;
  private comboCount = 0;
  private comboMultiplier = 1;
  private maxCombo = 1;
  private resonance = 0;
  private lastKillAt = -10_000;
  private ammoSkill?: AmmoSkill;
  private ammoShots = -1;
  private activeSkill?: ActiveSkill;
  private lastPickup?: PickupKind;
  private lastPickupAt = -10_000;
  private timeSlowUntil = 0;
  private overdriveUntil = 0;
  private lastHudAt = 0;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0b1520');
    this.drawFloor();
    this.terrainGraphics = this.add.graphics().setDepth(3);
    this.grassGraphics = this.add.graphics().setDepth(8);
    this.drawTerrain();

    this.pauseText = this.add.text(WORLD_SIZE / 2, WORLD_SIZE / 2, '防线暂停', {
      fontFamily: 'Noto Sans SC, sans-serif',
      fontSize: '46px',
      fontStyle: 'bold',
      color: '#f4fbff',
      backgroundColor: '#07111fdd',
      padding: { x: 28, y: 18 },
    }).setOrigin(0.5).setDepth(100).setVisible(false);

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is unavailable.');
    this.cursors = keyboard.createCursorKeys();
    this.keys = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      fire: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      skill: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
      pause: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P),
    };
    keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    ]);
    keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', () => this.togglePause());
    window.addEventListener('tank-defense:start', this.onStart);
    window.addEventListener('tank-defense:mute', this.onMute);
    window.addEventListener('tank-defense:pause', this.onPause);
    window.addEventListener('tank-defense:fire', this.onFire);
    window.addEventListener('tank-defense:reward', this.onReward);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('tank-defense:start', this.onStart);
      window.removeEventListener('tank-defense:mute', this.onMute);
      window.removeEventListener('tank-defense:pause', this.onPause);
      window.removeEventListener('tank-defense:fire', this.onFire);
      window.removeEventListener('tank-defense:reward', this.onReward);
    });

    this.dispatchHud();
  }

  update(_time: number, rawDelta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.pause)) this.togglePause();
    if (this.status !== 'playing') return;

    const delta = Math.min(rawDelta, 34);
    const dt = delta / 1000;
    this.elapsedMs += delta;

    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updatePickups();
    this.updateMines();
    this.updateBombs();
    this.updateMonsterBursts();
    this.updateDrones(dt);
    this.updateParticles(dt);
    this.updateTemporaryWalls();
    this.updateLevelDirector();
    if (this.resonance >= 100) this.activateResonance();

    if (this.elapsedMs - this.lastHudAt > 90) {
      this.lastHudAt = this.elapsedMs;
      this.dispatchHud();
    }
  }

  private onStart = (event: Event): void => {
    const detail = (event as CustomEvent<{ difficulty: Difficulty }>).detail;
    this.startGame(detail?.difficulty ?? 'normal');
  };

  private onMute = (event: Event): void => {
    this.audio.setMuted((event as CustomEvent<{ muted: boolean }>).detail.muted);
  };

  private onPause = (event: Event): void => {
    const force = (event as CustomEvent<{ force?: boolean }>).detail?.force;
    if (force && this.status !== 'playing') return;
    this.togglePause();
  };

  private onFire = (): void => {
    if (this.status === 'playing') this.firePlayerWeapon();
  };

  private onReward = (event: Event): void => {
    if (this.status !== 'reward') return;
    const kind = (event as CustomEvent<{ kind: string }>).detail?.kind as PickupKind;
    if (!kind || !(kind in skillInfo)) return;
    this.collectPickup(kind);
    this.startNextLevel();
  };

  private startGame(difficulty: Difficulty): void {
    this.clearEntities();
    this.difficulty = difficulty;
    this.terrain = createLevelMap();
    this.drawTerrain();
    this.elapsedMs = 0;
    this.level = 0;
    this.spawnQueue = [];
    this.nextSpawnAt = 0;
    this.levelClearAt = 0;
    this.nextPickupAt = Number.POSITIVE_INFINITY;
    this.score = 0;
    this.kills = 0;
    this.comboCount = 0;
    this.comboMultiplier = 1;
    this.maxCombo = 1;
    this.lastKillAt = -10_000;
    this.ammoSkill = undefined;
    this.ammoShots = -1;
    this.activeSkill = undefined;
    this.lastPickup = undefined;
    this.lastPickupAt = -10_000;
    this.timeSlowUntil = 0;
    this.overdriveUntil = 0;

    const tuning = difficultyTuning[difficulty];
    this.baseHp = tuning.baseHp;
    this.maxBaseHp = tuning.baseHp;
    this.resonance = 0;
    const spawn = gridCenter(13, 22);
    this.player = this.createTank('player', spawn.x, spawn.y);
    this.player.hp = tuning.playerHp;
    this.player.maxHp = tuning.playerHp;
    this.player.invulnerableUntil = 2000;
    this.status = 'playing';
    this.pauseText.setVisible(false);
    this.startNextLevel();
    this.dispatchHud();
    this.toast('关卡制启动：清场后从三项奖励中选择一个技能');
  }

  private clearEntities(): void {
    this.player?.display.destroy();
    this.player = undefined;
    this.shieldRing?.destroy();
    this.shieldRing = undefined;
    this.playerGuide?.destroy();
    this.playerGuide = undefined;
    this.enemies.forEach((entity) => entity.display.destroy());
    this.projectiles.forEach((entity) => entity.display.destroy());
    this.pickups.forEach((entity) => entity.display.destroy());
    this.mines.forEach((entity) => entity.display.destroy());
    this.bombs.forEach((entity) => entity.marker.destroy());
    this.monsterBursts.forEach((entity) => entity.marker.destroy());
    this.particles.forEach((entity) => entity.display.destroy());
    this.drones.forEach((entity) => entity.owner.display.destroy());
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.mines = [];
    this.bombs = [];
    this.monsterBursts = [];
    this.particles = [];
    this.drones = [];
  }

  private drawFloor(): void {
    this.floorGraphics = this.add.graphics().setDepth(0);
    for (let row = 0; row < MAP_ROWS; row += 1) {
      for (let col = 0; col < MAP_COLS; col += 1) {
        this.floorGraphics.fillStyle((row + col) % 2 ? COLORS.floorA : COLORS.floorB, 1);
        this.floorGraphics.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
    this.floorGraphics.lineStyle(1, COLORS.grid, 0.36);
    for (let i = 0; i <= MAP_COLS; i += 1) {
      this.floorGraphics.lineBetween(i * TILE_SIZE, 0, i * TILE_SIZE, WORLD_SIZE);
      this.floorGraphics.lineBetween(0, i * TILE_SIZE, WORLD_SIZE, i * TILE_SIZE);
    }

    this.add.text(WORLD_SIZE / 2, WORLD_SIZE / 2 + 4, '浪尖大学社区', {
      fontFamily: 'Noto Sans SC, sans-serif',
      fontSize: '58px',
      fontStyle: 'bold',
      color: '#7fa9b8',
      stroke: '#7fa9b8',
      strokeThickness: 1,
    }).setOrigin(0.5).setAlpha(0.095).setDepth(1).setAngle(-9);

    this.add.text(WORLD_SIZE / 2, WORLD_SIZE / 2 + 76, 'LXY DEFENSE NETWORK', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#25d0c8',
      letterSpacing: 5,
    }).setOrigin(0.5).setAlpha(0.12).setDepth(1).setAngle(-9);
  }

  private drawTerrain(): void {
    if (!this.terrainGraphics || !this.grassGraphics) return;
    this.terrainGraphics.clear();
    this.grassGraphics.clear();

    for (let row = 0; row < MAP_ROWS; row += 1) {
      for (let col = 0; col < MAP_COLS; col += 1) {
        const cell = this.terrain[row][col];
        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;

        if (cell.type === 'brick') {
          this.terrainGraphics.fillStyle(cell.hp === 1 ? COLORS.brickDark : COLORS.brick, 1);
          this.terrainGraphics.fillRect(x + 2, y + 2, 28, 28);
          this.terrainGraphics.lineStyle(2, COLORS.brickDark, 0.9);
          this.terrainGraphics.lineBetween(x + 2, y + 16, x + 30, y + 16);
          this.terrainGraphics.lineBetween(x + 16, y + 2, x + 16, y + 16);
          this.terrainGraphics.lineBetween(x + 9, y + 16, x + 9, y + 30);
          if (cell.signature) {
            this.terrainGraphics.lineStyle(2, COLORS.cyan, 0.78);
            this.terrainGraphics.strokeRect(x + 2, y + 2, 28, 28);
          }
          if (cell.hp === 1) {
            this.terrainGraphics.lineStyle(2, 0xe6a37c, 0.8);
            this.terrainGraphics.lineBetween(x + 7, y + 6, x + 15, y + 14);
            this.terrainGraphics.lineBetween(x + 15, y + 14, x + 11, y + 24);
          }
        } else if (cell.type === 'steel') {
          this.terrainGraphics.fillStyle(COLORS.steelDark, 1);
          this.terrainGraphics.fillRect(x + 1, y + 1, 30, 30);
          this.terrainGraphics.fillStyle(COLORS.steel, 1);
          this.terrainGraphics.fillRect(x + 4, y + 4, 24, 24);
          this.terrainGraphics.fillStyle(0xc2d4dd, 0.8);
          this.terrainGraphics.fillRect(x + 6, y + 6, 8, 3);
          this.terrainGraphics.fillRect(x + 6, y + 6, 3, 8);
          this.terrainGraphics.fillStyle(COLORS.steelDark, 1);
          this.terrainGraphics.fillCircle(x + 8, y + 24, 2);
          this.terrainGraphics.fillCircle(x + 24, y + 8, 2);
        } else if (cell.type === 'water') {
          this.terrainGraphics.fillStyle(COLORS.water, 0.92);
          this.terrainGraphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          this.terrainGraphics.lineStyle(2, COLORS.waterLight, 0.55);
          this.terrainGraphics.lineBetween(x + 4, y + 9, x + 16, y + 9);
          this.terrainGraphics.lineBetween(x + 14, y + 20, x + 28, y + 20);
        } else if (cell.type === 'grass') {
          this.grassGraphics.fillStyle(COLORS.grass, 0.72);
          this.grassGraphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          this.grassGraphics.lineStyle(2, COLORS.grassLight, 0.8);
          for (let blade = 0; blade < 4; blade += 1) {
            const bx = x + 6 + blade * 7;
            this.grassGraphics.lineBetween(bx, y + 26, bx + (blade % 2 ? 3 : -3), y + 12);
          }
        } else if (cell.type === 'base') {
          this.terrainGraphics.fillStyle(0x123f4c, 1);
          this.terrainGraphics.fillRect(x + 2, y + 2, 28, 28);
          this.terrainGraphics.lineStyle(3, COLORS.cyan, 1);
          this.terrainGraphics.strokeRect(x + 4, y + 4, 24, 24);
          this.terrainGraphics.fillStyle(COLORS.cyanLight, 1);
          this.terrainGraphics.fillTriangle(x + 16, y + 7, x + 8, y + 23, x + 24, y + 23);
        }
      }
    }
  }

  private createTank(kind: EnemyKind | 'player', x: number, y: number): TankEntity {
    const isPlayer = kind === 'player';
    const stats = isPlayer ? enemyStats.normal : enemyStats[kind];
    const color = isPlayer ? COLORS.yellow : stats.color;
    const accent = isPlayer ? COLORS.cyan : 0xffe4db;
    const scale = kind === 'boss' ? 1.28 : 1;
    const graphics = this.add.graphics();
    if (kind === 'boss') {
      // 非坦克 Boss：潮汐巨兽。触须、独眼和软体轮廓与机械坦克明显区分。
      graphics.fillStyle(COLORS.shadow, 0.45);
      graphics.fillCircle(0, 3, 19);
      graphics.fillStyle(0x3a1766, 1);
      graphics.fillTriangle(-15, 7, -24, 19, -7, 13);
      graphics.fillTriangle(15, 7, 24, 19, 7, 13);
      graphics.fillTriangle(-6, 12, -10, 25, 0, 15);
      graphics.fillTriangle(6, 12, 10, 25, 0, 15);
      graphics.fillStyle(0x7347c7, 1);
      graphics.fillCircle(0, 0, 17);
      graphics.fillStyle(COLORS.cyan, 0.9);
      graphics.fillCircle(0, -2, 9);
      graphics.fillStyle(0x07111f, 1);
      graphics.fillCircle(0, -2, 4);
      graphics.lineStyle(2, 0xb899ff, 0.9);
      graphics.strokeCircle(0, 0, 18);
    } else {
      graphics.fillStyle(COLORS.shadow, 0.45);
      graphics.fillRect(-13, -12, 26, 28);
      graphics.fillStyle(0x172633, 1);
      graphics.fillRect(-13, -12, 6, 24);
      graphics.fillRect(7, -12, 6, 24);
      graphics.fillStyle(color, 1);
      graphics.fillRect(-8, -10, 16, 21);
      graphics.fillStyle(accent, 1);
      graphics.fillRect(-4, -8, 8, 9);
      graphics.fillRect(-2, -17, 4, 13);
      graphics.fillStyle(0xffffff, 0.35);
      graphics.fillRect(-6, -8, 3, 9);
      if (kind === 'heavy') {
        graphics.lineStyle(2, 0xffffff, 0.55);
        graphics.strokeRect(-9, -11, 18, 23);
      }
      if (kind === 'sniper') graphics.fillRect(-1, -22, 2, 8);
    }

    const container = this.add.container(x, y, [graphics]).setDepth(5).setScale(scale);
    const entity: TankEntity = {
      id: nextId(isPlayer ? 'player' : kind),
      team: isPlayer ? 'player' : 'enemy',
      kind,
      x,
      y,
      width: (isPlayer ? PLAYER_SIZE : ENEMY_SIZE) * scale,
      height: (isPlayer ? PLAYER_SIZE : ENEMY_SIZE) * scale,
      hp: isPlayer ? 5 : stats.hp,
      maxHp: isPlayer ? 5 : stats.hp,
      speed: isPlayer ? 122 : stats.speed * difficultyTuning[this.difficulty].enemySpeed,
      direction: isPlayer ? 'up' : 'down',
      fireInterval: isPlayer ? 410 : stats.fireInterval * difficultyTuning[this.difficulty].enemyFireRate,
      lastShotAt: -2000,
      nextDecisionAt: this.elapsedMs + 300,
      nextSpecialAt: this.elapsedMs + 1800,
      frozenUntil: 0,
      confusedUntil: 0,
      invulnerableUntil: isPlayer ? this.elapsedMs + 2000 : this.elapsedMs + 900,
      alive: true,
      display: container,
    };
    this.applyDirection(entity, entity.direction);
    return entity;
  }

  private showPlayerGuide(): void {
    const player = this.player;
    if (!player) return;
    this.playerGuide?.destroy();
    const ring = this.add.circle(0, 0, 28, COLORS.cyan, 0.08).setStrokeStyle(3, COLORS.cyan, 0.9);
    const label = this.add.text(0, -42, '▼ 你的坦克', {
      fontFamily: 'Noto Sans SC, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#8fe5df',
      stroke: '#07111f',
      strokeThickness: 4,
    }).setOrigin(0.5);
    this.playerGuide = this.add.container(player.x, player.y, [ring, label]).setDepth(15);
    this.playerGuideUntil = this.elapsedMs + 3200;
  }

  private applyDirection(tank: TankEntity, direction: Direction): void {
    tank.direction = direction;
    if (tank.kind !== 'boss') tank.display.setRotation(Phaser.Math.DegToRad(DIRECTION_VECTOR[direction].angle));
  }

  private updatePlayer(dt: number): void {
    const player = this.player;
    if (!player?.alive) return;

    let direction: Direction | undefined;
    if (this.keys.up.isDown || this.cursors.up.isDown) direction = 'up';
    else if (this.keys.down.isDown || this.cursors.down.isDown) direction = 'down';
    else if (this.keys.left.isDown || this.cursors.left.isDown) direction = 'left';
    else if (this.keys.right.isDown || this.cursors.right.isDown) direction = 'right';

    if (direction) {
      this.applyDirection(player, direction);
      const vector = DIRECTION_VECTOR[direction];
      const overdriveFactor = this.overdriveUntil > this.elapsedMs ? 1.22 : 1;
      this.tryMoveTank(player, vector.x * player.speed * dt * overdriveFactor, vector.y * player.speed * dt * overdriveFactor);
    }

    if (this.keys.fire.isDown) this.firePlayerWeapon();
    if (Phaser.Input.Keyboard.JustDown(this.keys.skill)) this.activateSkill();

    const invulnerable = player.invulnerableUntil > this.elapsedMs;
    player.display.setAlpha(invulnerable && Math.floor(this.elapsedMs / 90) % 2 === 0 ? 0.35 : 1);
    if (this.shieldRing) {
      if (player.invulnerableUntil <= this.elapsedMs) {
        this.shieldRing.destroy();
        this.shieldRing = undefined;
      } else {
        this.shieldRing.setPosition(player.x, player.y).setScale(1 + Math.sin(this.elapsedMs / 110) * 0.08);
      }
    }
    if (this.playerGuide) {
      if (this.elapsedMs >= this.playerGuideUntil) {
        this.playerGuide.destroy();
        this.playerGuide = undefined;
      } else {
        this.playerGuide.setPosition(player.x, player.y).setScale(1 + Math.sin(this.elapsedMs / 130) * 0.06);
      }
    }
  }

  private tryMoveTank(tank: TankEntity, dx: number, dy: number): boolean {
    const originalX = tank.x;
    const originalY = tank.y;
    const next = { x: tank.x + dx, y: tank.y + dy, width: tank.width, height: tank.height };
    if (rectTouchesBlockedCell(this.terrain, next)) return false;

    const blockers = [this.player, ...this.enemies].filter((other): other is TankEntity =>
      Boolean(other && other.alive && other.id !== tank.id));
    if (blockers.some((other) => intersects(next, other))) return false;

    tank.x = next.x;
    tank.y = next.y;
    tank.display.setPosition(tank.x, tank.y);
    return tank.x !== originalX || tank.y !== originalY;
  }

  private firePlayerWeapon(): void {
    const player = this.player;
    const fireInterval = this.overdriveUntil > this.elapsedMs ? 175 : player?.fireInterval ?? 410;
    if (!player?.alive || this.elapsedMs - player.lastShotAt < fireInterval) return;
    const activePlayerShots = this.projectiles.filter((projectile) => projectile.team === 'player').length;
    if (activePlayerShots >= 12) return;

    const kind = this.ammoSkill ?? 'normal';
    if (kind === 'flame') {
      this.spawnProjectile(player, kind, -9);
      this.spawnProjectile(player, kind);
      this.spawnProjectile(player, kind, 9);
    } else {
      this.spawnProjectile(player, kind);
    }
    player.lastShotAt = this.elapsedMs;
    this.audio.play('shoot');

    if (this.ammoSkill) {
      this.ammoShots -= 1;
      if (this.ammoShots <= 0) {
        this.ammoSkill = undefined;
        this.ammoShots = -1;
        this.toast('特殊弹药已耗尽，恢复标准炮弹');
      }
      this.dispatchHud();
    }
  }

  private spawnProjectile(
    owner: TankEntity,
    kind: ProjectileKind,
    angleOffset = 0,
    overridePosition?: { x: number; y: number },
  ): void {
    const vector = DIRECTION_VECTOR[owner.direction];
    const baseAngle = Math.atan2(vector.y, vector.x) + Phaser.Math.DegToRad(angleOffset);
    const speed = kind === 'freeze' ? 330 : kind === 'piercing' ? 470 : kind === 'flame' ? 300 : 410;
    const muzzleDistance = owner.width / 2 + 8;
    const x = overridePosition?.x ?? owner.x + Math.cos(baseAngle) * muzzleDistance;
    const y = overridePosition?.y ?? owner.y + Math.sin(baseAngle) * muzzleDistance;
    const projectileTeam: Team = owner.team === 'enemy' && owner.confusedUntil > this.elapsedMs ? 'player' : owner.team;
    const color = kind === 'freeze'
      ? 0x88e7ff
      : kind === 'ricochet'
        ? COLORS.cyan
        : kind === 'piercing' || kind === 'confusion'
          ? COLORS.violet
          : kind === 'chain'
            ? 0x77f5ff
            : kind === 'flame'
              ? 0xff7b35
              : projectileTeam === 'player'
                ? COLORS.yellow
                : COLORS.red;
    const projectileWidth = kind === 'piercing' ? 12 : projectileTeam === 'player' ? 9 : 7;
    const display = this.add.rectangle(x, y, projectileWidth, projectileTeam === 'player' ? 8 : 7, color).setDepth(7);
    if (projectileTeam === 'player') {
      display.setStrokeStyle(1, 0xffffff, 0.9);
      const muzzleFlash = this.add.circle(x, y, 8, COLORS.yellow, 0.9).setDepth(6);
      this.tweens.add({
        targets: muzzleFlash,
        alpha: 0,
        scale: 1.8,
        duration: 100,
        onComplete: () => muzzleFlash.destroy(),
      });
    }

    this.projectiles.push({
      id: nextId('shell'),
      ownerId: owner.id,
      team: projectileTeam,
      kind,
      x,
      y,
      vx: Math.cos(baseAngle) * speed,
      vy: Math.sin(baseAngle) * speed,
      damage: owner.kind === 'heavy' || owner.kind === 'boss' ? 2 : 1,
      bouncesRemaining: kind === 'ricochet' ? (owner.team === 'player' ? 2 : 1) : 0,
      piercesRemaining: kind === 'piercing' ? 3 : 0,
      distance: 0,
      bornAt: this.elapsedMs,
      splitTriggered: false,
      hitIds: new Set(),
      display,
    });
  }

  private updateEnemies(dt: number): void {
    const player = this.player;
    if (!player?.alive) return;
    const slowed = this.timeSlowUntil > this.elapsedMs;

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const frozen = enemy.frozenUntil > this.elapsedMs;
      const spawnBlink = enemy.invulnerableUntil > this.elapsedMs && Math.floor(this.elapsedMs / 90) % 2 === 0;
      enemy.display.setAlpha(frozen ? 0.58 : spawnBlink ? 0.4 : 1);
      if (frozen) continue;

      const enemyGrid = worldToGrid(enemy.x, enemy.y);
      const playerGrid = worldToGrid(player.x, player.y);
      const baseGrid = { col: 13, row: 24 };
      const stats = enemyStats[enemy.kind as EnemyKind];
      const distanceToPlayer = Math.abs(enemyGrid.col - playerGrid.col) + Math.abs(enemyGrid.row - playerGrid.row);
      const confusedTarget = enemy.confusedUntil > this.elapsedMs
        ? this.enemies
          .filter((candidate) => candidate.alive && candidate.id !== enemy.id)
          .sort((a, b) => Math.hypot(a.x - enemy.x, a.y - enemy.y) - Math.hypot(b.x - enemy.x, b.y - enemy.y))[0]
        : undefined;
      const target = confusedTarget
        ? worldToGrid(confusedTarget.x, confusedTarget.y)
        : distanceToPlayer <= stats.view
          ? playerGrid
          : baseGrid;
      if (enemy.confusedUntil > this.elapsedMs) enemy.display.setAlpha(0.72 + Math.sin(this.elapsedMs / 80) * 0.18);

      if (this.elapsedMs >= enemy.nextDecisionAt) {
        const aligned = isClearLine(this.terrain, enemyGrid, target);
        if (aligned) {
          if (enemyGrid.col === target.col) this.applyDirection(enemy, target.row > enemyGrid.row ? 'down' : 'up');
          else this.applyDirection(enemy, target.col > enemyGrid.col ? 'right' : 'left');
          this.fireEnemyWeapon(enemy);
          enemy.nextDecisionAt = this.elapsedMs + Phaser.Math.Between(420, 760);
        } else {
          const preferred = directionToward(enemyGrid, target);
          const choices = Math.random() < 0.78 ? preferred : Phaser.Utils.Array.Shuffle([...allDirections]);
          this.applyDirection(enemy, choices[0]);
          enemy.nextDecisionAt = this.elapsedMs + Phaser.Math.Between(360, 820);
        }
      }

      const vector = DIRECTION_VECTOR[enemy.direction];
      const timeFactor = slowed ? 0.5 : 1;
      const moved = this.tryMoveTank(enemy, vector.x * enemy.speed * dt * timeFactor, vector.y * enemy.speed * dt * timeFactor);
      if (!moved) {
        if (enemy.kind === 'heavy' || enemy.kind === 'boss') this.tryBreakWallAhead(enemy);
        const alternatives = Phaser.Utils.Array.Shuffle([...allDirections]).filter((direction) => direction !== enemy.direction);
        this.applyDirection(enemy, alternatives[0]);
        enemy.nextDecisionAt = this.elapsedMs + 180;
      } else if (Math.random() < 0.004) {
        this.fireEnemyWeapon(enemy);
      }
    }
  }

  private fireEnemyWeapon(enemy: TankEntity): void {
    if (this.elapsedMs - enemy.lastShotAt < enemy.fireInterval) return;
    const kind: ProjectileKind = enemy.kind === 'ricochet' ? 'ricochet' : 'normal';
    this.spawnProjectile(enemy, kind);
    enemy.lastShotAt = this.elapsedMs;
    this.audio.play('shoot');
    if (enemy.kind === 'boss') {
      this.spawnProjectile(enemy, 'normal', -22);
      this.spawnProjectile(enemy, 'normal', 22);
      if (this.elapsedMs >= enemy.nextSpecialAt) {
        this.scheduleTideBurst(enemy);
        enemy.nextSpecialAt = this.elapsedMs + (enemy.hp <= enemy.maxHp / 2 ? 2600 : 3600);
      }
    }
  }

  private tryBreakWallAhead(enemy: TankEntity): void {
    const vector = DIRECTION_VECTOR[enemy.direction];
    const point = worldToGrid(enemy.x + vector.x * TILE_SIZE, enemy.y + vector.y * TILE_SIZE);
    const cell = this.terrain[point.row]?.[point.col];
    if (cell?.type === 'brick' && this.elapsedMs - enemy.lastShotAt >= enemy.fireInterval * 0.7) {
      this.fireEnemyWeapon(enemy);
    }
  }

  private updateProjectiles(dt: number): void {
    const slowed = this.timeSlowUntil > this.elapsedMs;
    const survivors: ProjectileEntity[] = [];

    for (const projectile of this.projectiles) {
      const expired = this.elapsedMs - projectile.bornAt > 7000 || (projectile.kind === 'flame' && projectile.distance > 135);
      if (expired) {
        projectile.display.destroy();
        continue;
      }

      const speedFactor = projectile.team === 'enemy' && slowed ? 0.5 : 1;
      let destroyed = false;
      const steps = 2;
      for (let step = 0; step < steps && !destroyed; step += 1) {
        const stepDt = dt / steps;
        const nextX = projectile.x + projectile.vx * stepDt * speedFactor;
        const nextY = projectile.y + projectile.vy * stepDt * speedFactor;
        projectile.distance += Math.hypot(nextX - projectile.x, nextY - projectile.y);

        const hitCell = cellAtWorld(this.terrain, nextX, nextY);
        if (!hitCell || isProjectileBlocked(hitCell)) {
          destroyed = this.handleProjectileTerrain(projectile, nextX, nextY, hitCell);
        } else {
          projectile.x = nextX;
          projectile.y = nextY;
        }

        if (!destroyed) destroyed = this.handleProjectileTankHit(projectile);
      }

      if (!destroyed && projectile.kind === 'split' && projectile.distance >= 220 && !projectile.splitTriggered) {
        projectile.splitTriggered = true;
        const angle = Math.atan2(projectile.vy, projectile.vx);
        [-25, 0, 25].forEach((offset) => {
          const speed = 390;
          const childAngle = angle + Phaser.Math.DegToRad(offset);
          const display = this.add.rectangle(projectile.x, projectile.y, 6, 6, COLORS.yellow).setDepth(7);
          this.projectiles.push({
            ...projectile,
            id: nextId('split'),
            kind: 'normal',
            vx: Math.cos(childAngle) * speed,
            vy: Math.sin(childAngle) * speed,
            distance: 0,
            bornAt: this.elapsedMs,
            splitTriggered: true,
            hitIds: new Set(projectile.hitIds),
            display,
          });
        });
        destroyed = true;
      }

      if (destroyed) projectile.display.destroy();
      else {
        projectile.display.setPosition(projectile.x, projectile.y);
        projectile.display.setRotation(Math.atan2(projectile.vy, projectile.vx));
        survivors.push(projectile);
      }
    }

    this.projectiles = survivors;
  }

  private handleProjectileTerrain(
    projectile: ProjectileEntity,
    nextX: number,
    nextY: number,
    cell: TerrainCell | undefined,
  ): boolean {
    if (!cell) return true;
    const point = worldToGrid(nextX, nextY);
    const tileId = `tile-${point.col}-${point.row}`;

    if (cell.type === 'base') {
      if (canDamageBase(projectile.team)) this.damageBase(projectile.damage);
      else {
        this.audio.play('steel');
        this.spark(nextX, nextY, COLORS.cyan, 4);
      }
      return true;
    }

    if (projectile.kind === 'ricochet' && projectile.bouncesRemaining > 0) {
      const horizontalCell = cellAtWorld(this.terrain, nextX, projectile.y);
      const verticalCell = cellAtWorld(this.terrain, projectile.x, nextY);
      const hitHorizontal = !horizontalCell || isProjectileBlocked(horizontalCell);
      const hitVertical = !verticalCell || isProjectileBlocked(verticalCell);
      if (hitHorizontal) projectile.vx *= -1;
      if (hitVertical) projectile.vy *= -1;
      if (!hitHorizontal && !hitVertical) {
        projectile.vx *= -1;
        projectile.vy *= -1;
      }
      projectile.bouncesRemaining -= 1;
      projectile.x += Math.sign(projectile.vx) * 2;
      projectile.y += Math.sign(projectile.vy) * 2;
      this.audio.play('steel');
      this.spark(projectile.x, projectile.y, COLORS.cyan, 5);
      return false;
    }

    if (cell.type === 'brick' && !projectile.hitIds.has(tileId)) {
      projectile.hitIds.add(tileId);
      this.damageBrick(point.col, point.row, projectile.kind === 'piercing' || projectile.kind === 'flame' ? 2 : 1);
      if (projectile.kind === 'piercing' && projectile.piercesRemaining > 0) {
        projectile.piercesRemaining -= 1;
        projectile.x = nextX;
        projectile.y = nextY;
        return false;
      }
    } else if (cell.type === 'steel') {
      this.audio.play('steel');
      this.spark(nextX, nextY, COLORS.steel, 5);
    }
    return true;
  }

  private handleProjectileTankHit(projectile: ProjectileEntity): boolean {
    if (projectile.team === 'player') {
      for (const enemy of this.enemies) {
        if (!enemy.alive || projectile.hitIds.has(enemy.id) || !pointHitsTank(projectile.x, projectile.y, enemy)) continue;
        projectile.hitIds.add(enemy.id);
        if (projectile.kind === 'freeze') {
          enemy.frozenUntil = this.elapsedMs + (enemy.kind === 'boss' ? 1500 : 3000);
          this.toast(enemy.kind === 'boss' ? 'Boss 抗性：短暂冻结' : '敌军已冻结');
        } else if (projectile.kind === 'confusion') {
          enemy.confusedUntil = this.elapsedMs + (enemy.kind === 'boss' ? 1600 : 4000);
          this.toast(enemy.kind === 'boss' ? 'Boss 抗性：短暂干扰' : '混乱生效：敌军开始内讧');
        }
        this.damageTank(enemy, projectile.damage, projectile.ownerId);
        if (projectile.kind === 'chain') this.triggerChainLightning(enemy, projectile.ownerId);
        if (projectile.kind === 'piercing' && projectile.piercesRemaining > 0) {
          projectile.piercesRemaining -= 1;
          return false;
        }
        return true;
      }

      const player = this.player;
      const selfDamageEnabled = projectile.kind === 'ricochet' && this.elapsedMs - projectile.bornAt > 300;
      if (selfDamageEnabled && player?.alive && !projectile.hitIds.has(player.id) && pointHitsTank(projectile.x, projectile.y, player)) {
        this.damageTank(player, 1, projectile.ownerId);
        return true;
      }
    } else {
      const player = this.player;
      if (player?.alive && pointHitsTank(projectile.x, projectile.y, player)) {
        this.damageTank(player, projectile.damage, projectile.ownerId);
        return true;
      }
    }
    return false;
  }

  private triggerChainLightning(firstTarget: TankEntity, ownerId: string): void {
    let source = firstTarget;
    const hit = new Set<string>([firstTarget.id]);
    for (let jump = 0; jump < 3; jump += 1) {
      const target = this.enemies
        .filter((candidate) => candidate.alive && !hit.has(candidate.id) && Math.hypot(candidate.x - source.x, candidate.y - source.y) <= 150)
        .sort((a, b) => Math.hypot(a.x - source.x, a.y - source.y) - Math.hypot(b.x - source.x, b.y - source.y))[0];
      if (!target) break;
      hit.add(target.id);
      const bolt = this.add.graphics().setDepth(11);
      bolt.lineStyle(4 - jump, 0x77f5ff, 0.95);
      bolt.lineBetween(source.x, source.y, target.x, target.y);
      this.tweens.add({ targets: bolt, alpha: 0, duration: 170, onComplete: () => bolt.destroy() });
      this.damageTank(target, 1, ownerId);
      source = target;
    }
  }

  private damageBrick(col: number, row: number, amount: number): void {
    const cell = this.terrain[row]?.[col];
    if (!cell || cell.type !== 'brick') return;
    cell.hp -= amount;
    this.audio.play('hit');
    this.spark(col * TILE_SIZE + TILE_SIZE / 2, row * TILE_SIZE + TILE_SIZE / 2, COLORS.brick, 6);
    if (cell.hp <= 0) this.terrain[row][col] = { type: 'empty', hp: 0 };
    this.drawTerrain();
  }

  private damageTank(tank: TankEntity, amount: number, _ownerId: string): void {
    if (!tank.alive || tank.invulnerableUntil > this.elapsedMs) return;
    tank.hp -= amount;
    this.audio.play(tank.team === 'player' ? 'hurt' : 'hit');
    this.spark(tank.x, tank.y, tank.team === 'player' ? COLORS.yellow : COLORS.red, 9);

    if (tank.hp <= 0) {
      tank.alive = false;
      tank.display.setVisible(false);
      this.explode(tank.x, tank.y, tank.kind === 'boss' ? 30 : 16);
      if (tank.team === 'enemy') this.onEnemyDestroyed(tank);
      else this.finishGame('defeat');
    } else if (tank.team === 'player') {
      tank.invulnerableUntil = this.elapsedMs + 900;
      this.cameras.main.shake(120, 0.008);
    }
  }

  private damageBase(amount: number): void {
    if (this.status !== 'playing') return;
    this.baseHp = Math.max(0, this.baseHp - amount);
    this.audio.play('hurt');
    const base = gridCenter(13, 24);
    this.explode(base.x, base.y, 10);
    this.cameras.main.shake(150, 0.009);
    this.toast(`浪尖核心受损，剩余 ${this.baseHp} 点耐久`);
    if (this.baseHp <= 0) this.finishGame('defeat');
  }

  private onEnemyDestroyed(enemy: TankEntity): void {
    this.kills += 1;
    if (this.elapsedMs - this.lastKillAt <= 3000) this.comboCount += 1;
    else this.comboCount = 1;
    this.lastKillAt = this.elapsedMs;
    this.comboMultiplier = this.comboCount >= 8 ? 2 : this.comboCount >= 5 ? 1.5 : this.comboCount >= 3 ? 1.2 : 1;
    this.maxCombo = Math.max(this.maxCombo, this.comboMultiplier);
    const stats = enemyStats[enemy.kind as EnemyKind];
    const points = Math.round(stats.score * this.comboMultiplier);
    this.score += points;
    const resonanceGain = enemy.kind === 'boss' ? 100 : enemy.kind === 'heavy' || enemy.kind === 'ricochet' ? 26 : enemy.kind === 'sniper' ? 22 : 18;
    this.resonance = Math.min(100, this.resonance + resonanceGain);
    this.floatingText(enemy.x, enemy.y, `+${points}`, COLORS.yellow);
    this.audio.play('explode');

    const pickupChance = 0.08 * difficultyTuning[this.difficulty].pickupRate;
    if (enemy.kind !== 'boss' && Math.random() < pickupChance) this.spawnPickup(enemy.x, enemy.y);
  }

  private activateResonance(): void {
    this.resonance = 0;
    const repaired = this.baseHp < this.maxBaseHp;
    this.baseHp = Math.min(this.maxBaseHp, this.baseHp + 1);
    const enemyShells = this.projectiles.filter((projectile) => projectile.team === 'enemy');
    enemyShells.forEach((projectile) => {
      this.spark(projectile.x, projectile.y, COLORS.cyan, 3);
      projectile.display.destroy();
    });
    this.projectiles = this.projectiles.filter((projectile) => projectile.team !== 'enemy');
    for (const enemy of this.enemies) {
      if (enemy.alive) enemy.frozenUntil = Math.max(enemy.frozenUntil, this.elapsedMs + 1100);
    }
    this.score += 300;
    const center = gridCenter(13, 12);
    const ring = this.add.circle(center.x, center.y, 24, COLORS.cyan, 0.08)
      .setStrokeStyle(5, COLORS.cyan, 0.95)
      .setDepth(12);
    this.tweens.add({
      targets: ring,
      scale: 9,
      alpha: 0,
      duration: 650,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    this.audio.play('wave');
    this.cameras.main.flash(180, 37, 208, 200, false);
    this.toast(`LXY 浪尖共鸣：清除敌弹、控场${repaired ? '并修复核心 1 点' : ''}`);
    this.floatingText(center.x, center.y, 'LXY RESONANCE', COLORS.cyan);
    this.dispatchHud();
  }

  private spawnPickup(x?: number, y?: number, forcedKind?: PickupKind): void {
    if (this.pickups.length >= 8) return;
    const kind = forcedKind ?? randomItem(Object.keys(skillInfo) as PickupKind[]);
    let spawnX = x ?? Phaser.Math.Between(TILE_SIZE * 2, WORLD_SIZE - TILE_SIZE * 2);
    let spawnY = y ?? Phaser.Math.Between(TILE_SIZE * 4, WORLD_SIZE - TILE_SIZE * 4);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const cell = cellAtWorld(this.terrain, spawnX, spawnY);
      if (cell && (cell.type === 'empty' || cell.type === 'grass')) break;
      spawnX = Phaser.Math.Between(TILE_SIZE * 2, WORLD_SIZE - TILE_SIZE * 2);
      spawnY = Phaser.Math.Between(TILE_SIZE * 4, WORLD_SIZE - TILE_SIZE * 4);
    }

    const info = skillInfo[kind];
    const color = info.category === 'ammo' ? COLORS.yellow : COLORS.violet;
    const box = this.add.rectangle(0, 0, 28, 28, color, 0.95).setStrokeStyle(2, COLORS.white, 0.8);
    const label = this.add.text(0, 0, info.icon, {
      fontFamily: 'Noto Sans SC, sans-serif',
      fontSize: '17px',
      color: '#07111f',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    const display = this.add.container(spawnX, spawnY, [box, label]).setDepth(4);
    this.pickups.push({ kind, x: spawnX, y: spawnY, baseY: spawnY, bornAt: this.elapsedMs, expiresAt: this.elapsedMs + 12_000, display });
  }

  private updatePickups(): void {
    const player = this.player;
    if (!player?.alive) return;
    const survivors: PickupEntity[] = [];

    for (const pickup of this.pickups) {
      pickup.y = pickup.baseY + Math.sin((this.elapsedMs - pickup.bornAt) / 180) * 4;
      pickup.display.setY(pickup.y).setRotation(Math.sin((this.elapsedMs - pickup.bornAt) / 400) * 0.08);
      if (this.elapsedMs >= pickup.expiresAt) {
        pickup.display.destroy();
        continue;
      }
      if (Math.hypot(player.x - pickup.x, player.y - pickup.y) < 25) {
        this.collectPickup(pickup.kind);
        pickup.display.destroy();
        continue;
      }
      survivors.push(pickup);
    }
    this.pickups = survivors;

    if (this.elapsedMs >= this.nextPickupAt) {
      this.spawnPickup();
      this.nextPickupAt = this.elapsedMs + 13_000 / difficultyTuning[this.difficulty].pickupRate;
    }
  }

  private collectPickup(kind: PickupKind): void {
    const info = skillInfo[kind];
    this.lastPickup = kind;
    this.lastPickupAt = this.elapsedMs;
    if (info.category === 'ammo') {
      this.ammoSkill = kind as AmmoSkill;
      this.ammoShots = info.shots ?? 6;
      this.toast(`获得【${info.name}】— 按【空格】发射，剩余 ${this.ammoShots} 发`);
      if (this.player) this.floatingText(this.player.x, this.player.y - 24, '空格发射', COLORS.yellow);
    } else {
      this.activeSkill = kind as ActiveSkill;
      this.toast(`获得【${info.name}】— 轻按【Q】释放，无需长按`);
      if (this.player) this.floatingText(this.player.x, this.player.y - 24, 'Q 释放技能', COLORS.violet);
    }
    this.audio.play('pickup');
    this.dispatchHud();
  }

  private activateSkill(): void {
    const player = this.player;
    if (!player?.alive) return;
    if (!this.activeSkill) {
      this.toast('尚未装备主动技能');
      return;
    }

    const skill = this.activeSkill;
    let consumed = true;
    if (skill === 'slow') {
      this.timeSlowUntil = this.elapsedMs + 5000;
      this.cameras.main.flash(180, 70, 160, 255, false);
      this.toast('子弹时间启动：敌军减速 5 秒');
    } else if (skill === 'airstrike') {
      for (let index = 0; index < 6; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Phaser.Math.Between(25, 165);
        const x = clamp(player.x + Math.cos(angle) * radius, TILE_SIZE * 2, WORLD_SIZE - TILE_SIZE * 2);
        const y = clamp(player.y + Math.sin(angle) * radius, TILE_SIZE * 2, WORLD_SIZE - TILE_SIZE * 2);
        const marker = this.add.circle(x, y, 24, COLORS.red, 0.12).setStrokeStyle(2, COLORS.red, 0.9).setDepth(9);
        this.bombs.push({ x, y, explodeAt: this.elapsedMs + 700 + index * 100, marker });
      }
      this.toast('空袭已呼叫，离开红色落点');
    } else if (skill === 'drone') {
      this.spawnDrone();
      this.toast('僚机上线：自动攻击最近敌人 8 秒');
    } else if (skill === 'mine') {
      if (this.mines.length >= 3) {
        consumed = false;
        this.toast('场上最多同时存在 3 颗地雷');
      } else {
        this.placeMine(player.x, player.y);
        this.toast('地雷已部署');
      }
    } else if (skill === 'repair') {
      consumed = this.repairWall();
      this.toast(consumed ? '前方砖墙已修复' : '前方没有可修复的安全位置');
    } else if (skill === 'teleport') {
      consumed = this.teleportPlayer();
      this.toast(consumed ? '安全传送完成，附近敌军已眩晕' : '暂时找不到安全落点');
    } else if (skill === 'heal') {
      if (player.hp >= player.maxHp) {
        consumed = false;
        this.toast('装甲已满，紧急维修未消耗');
      } else {
        player.hp = Math.min(player.maxHp, player.hp + 2);
        this.floatingText(player.x, player.y - 24, '+2 HP', 0x70f0a4);
        this.toast(`装甲已恢复至 ${player.hp}/${player.maxHp}`);
      }
    } else if (skill === 'shield') {
      player.invulnerableUntil = Math.max(player.invulnerableUntil, this.elapsedMs + 5000);
      this.shieldRing?.destroy();
      this.shieldRing = this.add.circle(player.x, player.y, 23, COLORS.cyan, 0.1).setStrokeStyle(3, COLORS.cyan, 0.9).setDepth(7);
      this.cameras.main.flash(160, 37, 208, 200, false);
      this.toast('能量护盾启动：5 秒内免疫伤害');
    } else if (skill === 'overdrive') {
      this.overdriveUntil = this.elapsedMs + 7000;
      this.toast('火力超频：7 秒内提高移动速度与射速');
    } else if (skill === 'emp') {
      for (const enemy of this.enemies) {
        if (enemy.alive) enemy.frozenUntil = Math.max(enemy.frozenUntil, this.elapsedMs + (enemy.kind === 'boss' ? 1000 : 2500));
      }
      this.cameras.main.flash(220, 100, 180, 255, false);
      this.toast('EMP 脉冲释放：全场敌军暂时停机');
    }

    if (consumed) {
      this.activeSkill = undefined;
      this.audio.play('pickup');
      this.dispatchHud();
    }
  }

  private placeMine(x: number, y: number): void {
    const ring = this.add.circle(0, 0, 11, 0x2d3440, 1).setStrokeStyle(2, COLORS.yellow, 0.8);
    const core = this.add.rectangle(0, 0, 7, 7, COLORS.red);
    const display = this.add.container(x, y, [ring, core]).setDepth(4);
    this.mines.push({ x, y, expiresAt: this.elapsedMs + 10_000, display });
  }

  private spawnDrone(): void {
    const player = this.player;
    if (!player) return;
    const body = this.add.rectangle(0, 0, 16, 12, COLORS.cyan).setStrokeStyle(2, COLORS.white, 0.8);
    const wingLeft = this.add.rectangle(-11, 0, 6, 5, COLORS.violet);
    const wingRight = this.add.rectangle(11, 0, 6, 5, COLORS.violet);
    const display = this.add.container(player.x + 28, player.y, [wingLeft, wingRight, body]).setDepth(6);
    const owner: TankEntity = {
      id: nextId('drone'),
      team: 'player',
      kind: 'player',
      x: player.x + 28,
      y: player.y,
      width: 16,
      height: 12,
      hp: 1,
      maxHp: 1,
      speed: 0,
      direction: 'up',
      fireInterval: 700,
      lastShotAt: this.elapsedMs,
      nextDecisionAt: 0,
      nextSpecialAt: 0,
      frozenUntil: 0,
      confusedUntil: 0,
      invulnerableUntil: Number.POSITIVE_INFINITY,
      alive: true,
      display,
    };
    this.drones.push({ owner, expiresAt: this.elapsedMs + 8000, lastShotAt: this.elapsedMs });
  }

  private updateDrones(dt: number): void {
    const player = this.player;
    if (!player?.alive) return;
    const survivors: DroneEntity[] = [];
    for (const drone of this.drones) {
      if (this.elapsedMs >= drone.expiresAt) {
        drone.owner.display.destroy();
        continue;
      }
      const orbit = this.elapsedMs / 620;
      const targetX = player.x + Math.cos(orbit) * 34;
      const targetY = player.y + Math.sin(orbit) * 34;
      drone.owner.x += (targetX - drone.owner.x) * Math.min(1, dt * 9);
      drone.owner.y += (targetY - drone.owner.y) * Math.min(1, dt * 9);
      drone.owner.display.setPosition(drone.owner.x, drone.owner.y).setRotation(orbit + Math.PI / 2);

      const target = this.enemies
        .filter((enemy) => enemy.alive)
        .sort((a, b) => Math.hypot(a.x - drone.owner.x, a.y - drone.owner.y) - Math.hypot(b.x - drone.owner.x, b.y - drone.owner.y))[0];
      if (target && this.elapsedMs - drone.lastShotAt >= 700) {
        const dx = target.x - drone.owner.x;
        const dy = target.y - drone.owner.y;
        drone.owner.direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        this.spawnProjectile(drone.owner, 'normal');
        drone.lastShotAt = this.elapsedMs;
        this.audio.play('shoot');
      }
      survivors.push(drone);
    }
    this.drones = survivors;
  }

  private updateMines(): void {
    const survivors: MineEntity[] = [];
    for (const mine of this.mines) {
      mine.display.setAlpha(0.65 + Math.sin(this.elapsedMs / 110) * 0.3);
      const target = this.enemies.find((enemy) => enemy.alive && Math.hypot(enemy.x - mine.x, enemy.y - mine.y) < 24);
      if (target) {
        this.areaDamage(mine.x, mine.y, 44, 3, true);
        mine.display.destroy();
        continue;
      }
      if (this.elapsedMs >= mine.expiresAt) {
        mine.display.destroy();
        continue;
      }
      survivors.push(mine);
    }
    this.mines = survivors;
  }

  private updateBombs(): void {
    const survivors: BombEntity[] = [];
    for (const bomb of this.bombs) {
      const remaining = bomb.explodeAt - this.elapsedMs;
      bomb.marker.setScale(1 + Math.sin(this.elapsedMs / 60) * 0.08).setAlpha(clamp(1 - remaining / 1000, 0.25, 1));
      if (remaining <= 0) {
        this.areaDamage(bomb.x, bomb.y, 48, 2, true);
        bomb.marker.destroy();
      } else survivors.push(bomb);
    }
    this.bombs = survivors;
  }

  private scheduleTideBurst(owner: TankEntity): void {
    const marker = this.add.circle(owner.x, owner.y, 30, COLORS.violet, 0.12)
      .setStrokeStyle(4, COLORS.cyan, 0.95)
      .setDepth(10);
    this.monsterBursts.push({ owner, fireAt: this.elapsedMs + 780, marker });
    this.toast('潮汐巨兽正在蓄力：准备躲避八方向潮汐弹');
  }

  private updateMonsterBursts(): void {
    const survivors: MonsterBurst[] = [];
    for (const burst of this.monsterBursts) {
      if (!burst.owner.alive) {
        burst.marker.destroy();
        continue;
      }
      const progress = clamp(1 - (burst.fireAt - this.elapsedMs) / 780, 0, 1);
      burst.marker
        .setPosition(burst.owner.x, burst.owner.y)
        .setScale(1 + progress * 1.15)
        .setAlpha(0.4 + progress * 0.6);
      if (this.elapsedMs >= burst.fireAt) {
        for (let angle = 0; angle < 360; angle += 45) this.spawnProjectile(burst.owner, 'normal', angle);
        this.audio.play('explode');
        this.spark(burst.owner.x, burst.owner.y, COLORS.cyan, 18);
        burst.marker.destroy();
      } else survivors.push(burst);
    }
    this.monsterBursts = survivors;
  }

  private repairWall(): boolean {
    const player = this.player;
    if (!player) return false;
    const vector = DIRECTION_VECTOR[player.direction];
    const start = worldToGrid(player.x, player.y);
    let changed = false;

    for (let distance = 1; distance <= 2; distance += 1) {
      const col = start.col + vector.x * distance;
      const row = start.row + vector.y * distance;
      const cell = this.terrain[row]?.[col];
      if (!cell || cell.type === 'steel' || cell.type === 'water' || cell.type === 'base') continue;
      const center = gridCenter(col, row);
      const occupied = [this.player, ...this.enemies].some((tank) => tank?.alive && Math.hypot(tank.x - center.x, tank.y - center.y) < 30);
      if (occupied) continue;
      if (cell.type === 'brick') cell.hp = 2;
      else this.terrain[row][col] = { type: 'brick', hp: 2, temporaryUntil: this.elapsedMs + 15_000 };
      changed = true;
    }
    if (changed) this.drawTerrain();
    return changed;
  }

  private teleportPlayer(): boolean {
    const player = this.player;
    if (!player) return false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const col = Phaser.Math.Between(2, MAP_COLS - 3);
      const row = Phaser.Math.Between(4, MAP_ROWS - 4);
      const point = gridCenter(col, row);
      const rect = { ...point, width: player.width, height: player.height };
      const unsafeEnemy = this.enemies.some((enemy) => enemy.alive && Math.hypot(enemy.x - point.x, enemy.y - point.y) < TILE_SIZE * 2);
      const unsafeShell = this.projectiles.some((shell) => shell.team === 'enemy' && Math.hypot(shell.x - point.x, shell.y - point.y) < TILE_SIZE * 1.5);
      if (rectTouchesBlockedCell(this.terrain, rect) || unsafeEnemy || unsafeShell) continue;

      this.spark(player.x, player.y, COLORS.violet, 12);
      player.x = point.x;
      player.y = point.y;
      player.display.setPosition(point.x, point.y);
      player.invulnerableUntil = Math.max(player.invulnerableUntil, this.elapsedMs + 700);
      this.spark(point.x, point.y, COLORS.cyan, 16);
      for (const enemy of this.enemies) {
        if (enemy.alive && Math.hypot(enemy.x - point.x, enemy.y - point.y) < TILE_SIZE * 1.5) {
          enemy.frozenUntil = Math.max(enemy.frozenUntil, this.elapsedMs + 2000);
        }
      }
      return true;
    }
    return false;
  }

  private updateTemporaryWalls(): void {
    let changed = false;
    for (const row of this.terrain) {
      for (let col = 0; col < row.length; col += 1) {
        const cell = row[col];
        if (cell.temporaryUntil && this.elapsedMs >= cell.temporaryUntil) {
          row[col] = { type: 'empty', hp: 0 };
          changed = true;
        }
      }
    }
    if (changed) this.drawTerrain();
  }

  private areaDamage(x: number, y: number, radius: number, damage: number, damageWalls: boolean): void {
    this.explode(x, y, 20);
    this.audio.play('explode');
    this.cameras.main.shake(90, 0.006);
    for (const enemy of this.enemies) {
      if (enemy.alive && Math.hypot(enemy.x - x, enemy.y - y) <= radius) this.damageTank(enemy, damage, 'skill');
    }
    if (damageWalls) {
      const center = worldToGrid(x, y);
      for (let row = center.row - 1; row <= center.row + 1; row += 1) {
        for (let col = center.col - 1; col <= center.col + 1; col += 1) {
          const cell = this.terrain[row]?.[col];
          if (cell?.type === 'brick') this.damageBrick(col, row, 2);
        }
      }
    }
  }

  private updateLevelDirector(): void {
    if (this.spawnQueue.length > 0 && this.elapsedMs >= this.nextSpawnAt && this.enemies.filter((enemy) => enemy.alive).length < 8) {
      const kind = this.spawnQueue.shift();
      if (kind) this.spawnEnemy(kind);
      this.nextSpawnAt = this.elapsedMs + (kind === 'boss' ? 1100 : 720);
    }

    const aliveEnemies = this.enemies.filter((enemy) => enemy.alive).length;
    if (this.spawnQueue.length === 0 && aliveEnemies === 0) {
      if (this.levelClearAt === 0) this.levelClearAt = this.elapsedMs + 1000;
      if (this.elapsedMs >= this.levelClearAt) this.completeLevel();
    }
  }

  private completeLevel(): void {
    if (this.status !== 'playing') return;
    const definition = LEVEL_DEFINITIONS[this.level - 1];
    const player = this.player;
    const repairedPlayer = Boolean(player && player.hp < player.maxHp);
    const repairedBase = this.baseHp < this.maxBaseHp;
    if (player) player.hp = Math.min(player.maxHp, player.hp + 1);
    this.baseHp = Math.min(this.maxBaseHp, this.baseHp + 1);
    this.score += definition.clearBonus;
    this.comboCount = 0;
    this.comboMultiplier = 1;
    this.clearLevelCombat();
    this.dispatchHud();

    if (this.level >= TOTAL_LEVELS) {
      this.floatingText(WORLD_SIZE / 2, WORLD_SIZE / 2, `最终关完成 +${definition.clearBonus}`, COLORS.yellow);
      this.finishGame('victory');
      return;
    }

    this.status = 'reward';
    this.audio.play('wave');
    window.dispatchEvent(new CustomEvent<LevelClearState>('tank-defense:level-clear', {
      detail: {
        level: this.level,
        totalLevels: TOTAL_LEVELS,
        levelName: definition.name,
        nextLevelName: LEVEL_DEFINITIONS[this.level].name,
        bonusScore: definition.clearBonus,
        repairedPlayer,
        repairedBase,
        choices: this.buildRewardChoices(),
      },
    }));
  }

  private buildRewardChoices(): RewardChoice[] {
    const allKinds = Object.keys(skillInfo) as PickupKind[];
    const available = Phaser.Utils.Array.Shuffle(allKinds.filter((kind) => kind !== this.ammoSkill && kind !== this.activeSkill));
    const ammo = available.find((kind) => skillInfo[kind].category === 'ammo');
    const active = available.find((kind) => skillInfo[kind].category === 'active');
    const selected = [ammo, active].filter((kind): kind is PickupKind => Boolean(kind));
    const third = available.find((kind) => !selected.includes(kind));
    if (third) selected.push(third);

    return Phaser.Utils.Array.Shuffle(selected).map((kind) => ({
      kind,
      name: skillInfo[kind].name,
      description: skillInfo[kind].description,
      icon: skillInfo[kind].icon,
      category: skillInfo[kind].category,
      operation: skillInfo[kind].operation,
    }));
  }

  private clearLevelCombat(): void {
    this.enemies.forEach((enemy) => enemy.display.destroy());
    this.projectiles.forEach((projectile) => projectile.display.destroy());
    this.pickups.forEach((pickup) => pickup.display.destroy());
    this.bombs.forEach((bomb) => bomb.marker.destroy());
    this.monsterBursts.forEach((burst) => burst.marker.destroy());
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.bombs = [];
    this.monsterBursts = [];
  }

  private startNextLevel(): void {
    this.level += 1;
    this.status = 'playing';
    this.levelClearAt = 0;
    const definition = LEVEL_DEFINITIONS[this.level - 1];
    this.terrain = createLevelMap();
    this.drawTerrain();
    const player = this.player;
    if (player) {
      const spawn = gridCenter(13, 22);
      player.x = spawn.x;
      player.y = spawn.y;
      player.display.setPosition(spawn.x, spawn.y).setVisible(true);
      player.invulnerableUntil = this.elapsedMs + 1600;
      this.applyDirection(player, 'up');
      this.showPlayerGuide();
    }
    this.spawnQueue = [...definition.enemies];
    this.nextSpawnAt = this.elapsedMs + 500;
    this.audio.play('wave');
    this.toast(this.level === TOTAL_LEVELS
      ? '最终关：仅有一只“潮汐巨兽”，击败它即可通关'
      : `第 ${this.level} 关「${definition.name}」：${definition.subtitle}`);
    this.floatingText(WORLD_SIZE / 2, 80, `LEVEL ${this.level} · ${definition.name}`, COLORS.cyan);
    this.dispatchHud();
  }

  private spawnEnemy(kind: EnemyKind): void {
    const available = spawnPoints.filter((point) => ![this.player, ...this.enemies].some((tank) => tank?.alive && Math.hypot(tank.x - point.x, tank.y - point.y) < 44));
    const point = randomItem(available.length > 0 ? available : spawnPoints);
    const enemy = this.createTank(kind, point.x, point.y);
    this.enemies.push(enemy);
    this.spark(point.x, point.y, enemyStats[kind].color, 10);
  }

  private togglePause(): void {
    if (this.status === 'briefing' || this.status === 'reward' || this.status === 'victory' || this.status === 'defeat') return;
    this.status = this.status === 'paused' ? 'playing' : 'paused';
    const paused = this.status === 'paused';
    this.pauseText.setVisible(paused);
    window.dispatchEvent(new CustomEvent('tank-defense:paused', { detail: { paused } }));
  }

  private finishGame(outcome: 'victory' | 'defeat'): void {
    if (this.status === 'victory' || this.status === 'defeat') return;
    this.status = outcome;
    this.audio.play(outcome);
    this.cameras.main.flash(320, outcome === 'victory' ? 37 : 239, outcome === 'victory' ? 208 : 71, outcome === 'victory' ? 200 : 111, false);
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent<ResultState>('tank-defense:result', {
        detail: { outcome, score: this.score, kills: this.kills, maxCombo: this.maxCombo },
      }));
    }, 650);
  }

  private spark(x: number, y: number, color: number, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Phaser.Math.Between(45, 150);
      const display = this.add.rectangle(x, y, Phaser.Math.Between(3, 6), Phaser.Math.Between(3, 6), color).setDepth(10);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 0,
        bornAt: this.elapsedMs,
        life: Phaser.Math.Between(180, 420),
        display,
      });
    }
  }

  private explode(x: number, y: number, count: number): void {
    this.spark(x, y, COLORS.yellow, Math.ceil(count * 0.55));
    this.spark(x, y, COLORS.red, Math.floor(count * 0.45));
    const ring = this.add.circle(x, y, 6, COLORS.yellow, 0.18).setStrokeStyle(3, COLORS.yellow, 0.8).setDepth(9);
    this.tweens.add({
      targets: ring,
      radius: 34,
      alpha: 0,
      duration: 260,
      onComplete: () => ring.destroy(),
    });
  }

  private updateParticles(dt: number): void {
    const survivors: ParticleEntity[] = [];
    for (const particle of this.particles) {
      const age = this.elapsedMs - particle.bornAt;
      if (age >= particle.life) {
        particle.display.destroy();
        continue;
      }
      particle.vy += particle.gravity * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.display.setPosition(particle.x, particle.y).setAlpha(1 - age / particle.life);
      survivors.push(particle);
    }
    this.particles = survivors;
  }

  private floatingText(x: number, y: number, message: string, color: number): void {
    const text = this.add.text(x, y, message, {
      fontFamily: 'monospace',
      fontSize: '18px',
      fontStyle: 'bold',
      color: `#${color.toString(16).padStart(6, '0')}`,
      stroke: '#07111f',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(12);
    this.tweens.add({
      targets: text,
      y: y - 38,
      alpha: 0,
      duration: 850,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private toast(message: string): void {
    window.dispatchEvent(new CustomEvent('tank-defense:toast', { detail: { message } }));
  }

  private dispatchHud(): void {
    const playerHp = this.player?.hp ?? difficultyTuning[this.difficulty].playerHp;
    const playerMaxHp = this.player?.maxHp ?? difficultyTuning[this.difficulty].playerHp;
    const ammo = this.ammoSkill ? skillInfo[this.ammoSkill] : undefined;
    const active = this.activeSkill ? skillInfo[this.activeSkill] : undefined;
    const latest = this.lastPickup ? skillInfo[this.lastPickup] : undefined;
    const hud: HudState = {
      hp: Math.max(0, playerHp),
      maxHp: playerMaxHp,
      baseHp: this.baseHp,
      level: Math.max(1, this.level),
      totalLevels: TOTAL_LEVELS,
      levelName: LEVEL_DEFINITIONS[Math.max(0, this.level - 1)]?.name ?? LEVEL_DEFINITIONS[0].name,
      enemies: this.enemies.filter((enemy) => enemy.alive).length + this.spawnQueue.length,
      score: this.score,
      combo: this.comboMultiplier,
      resonance: this.resonance,
      ammo: ammo
        ? { name: ammo.name, description: ammo.description, icon: ammo.icon, shots: this.ammoShots, operation: ammo.operation, status: `当前装备 · 剩余 ${this.ammoShots} 发` }
        : { name: '标准炮弹', description: '稳定可靠，无特殊效果', icon: '•', shots: -1, operation: '按住 SPACE 连续发射', status: '默认弹药 · 无限' },
      active: active
        ? { name: active.name, description: active.description, icon: active.icon, ready: true, cooldownProgress: 1, operation: active.operation, status: '当前携带 · 可使用 1 次' }
        : { name: '等待拾取', description: '拾取紫色战术箱获得主动技能', icon: 'Q', ready: false, cooldownProgress: 0, operation: '拾取后轻按 Q 释放；无需长按', status: '主动技能槽为空' },
      latestPickup: latest
        ? { name: latest.name, icon: latest.icon, operation: latest.operation, category: latest.category, fresh: this.elapsedMs - this.lastPickupAt < 5000 }
        : undefined,
    };
    window.dispatchEvent(new CustomEvent<HudState>('tank-defense:hud', { detail: hud }));
  }
}
