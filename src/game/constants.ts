export const TILE_SIZE = 32;
export const MAP_COLS = 26;
export const MAP_ROWS = 26;
export const WORLD_SIZE = TILE_SIZE * MAP_COLS;

export const COLORS = {
  floorA: 0x12202d,
  floorB: 0x0f1c28,
  grid: 0x1b3040,
  cyan: 0x25d0c8,
  cyanLight: 0x8fe5df,
  yellow: 0xffd166,
  red: 0xef476f,
  violet: 0x9b7bff,
  white: 0xf4fbff,
  brick: 0xb9654b,
  brickDark: 0x723b35,
  steel: 0x7c96a8,
  steelDark: 0x405665,
  water: 0x176b87,
  waterLight: 0x2eb2c4,
  grass: 0x2f7d5a,
  grassLight: 0x55a66f,
  shadow: 0x02070b,
} as const;

export type Direction = 'up' | 'down' | 'left' | 'right';

export const DIRECTION_VECTOR: Record<Direction, { x: number; y: number; angle: number }> = {
  up: { x: 0, y: -1, angle: 0 },
  right: { x: 1, y: 0, angle: 90 },
  down: { x: 0, y: 1, angle: 180 },
  left: { x: -1, y: 0, angle: 270 },
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
