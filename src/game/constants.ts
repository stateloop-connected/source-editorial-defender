import type { PowerUpDef } from "./types";

export const TEXT_FONT = '18px "Trebuchet MS", Verdana, sans-serif';
export const TEXT_LINE_HEIGHT = 30;
export const TEXT_CHAR_GAP = 18;
export const TEXT_VERTICAL_PADDING = 22;
export const TEXT_HORIZONTAL_PADDING = 28;
export const SAFE_ZONE_WIDTH = 230;
export const SAFE_ZONE_HEIGHT = 230;
export const BASE_STAGE_AREA = 1920 * 1080;
export const TEXT_REPEL_RADIUS = 120;
export const TEXT_RESPAWN_DELAY = 240;
export const TEXT_RESPAWN_DURATION = 90;
export const TEXT_RESPAWN_STAGGER = 90;
export const TEXT_BUCKET_SIZE = 48;
export const TEXT_REPEL_RADIUS_SQ = TEXT_REPEL_RADIUS * TEXT_REPEL_RADIUS;
export const TEXT_ISLAND_INSET_X = 20;
export const TEXT_ISLAND_INSET_Y = 16;
export const TEXT_MAX_BLOCKS = 3600;
export const AMBIENT_GLYPH_MIN_COUNT = 40;
export const AMBIENT_GLYPH_MAX_COUNT = 110;

export const TEXT_CORPUS =
  "在这片数字荒原中文字不仅是承载信息的媒介它们构成了物理的边界与防线当错误的数据流从四面八方涌来排版引擎开始重组为了维持系统的秩序你必须在这个动态的网格中穿梭每一次射击不仅是毁灭也是重构利用文字作为掩体生存下去直到最后一个周期结束。排版防线启动，文字避让协议生效，检测到敌对节点靠近。";

export const AMBIENT_GLYPH_CHARS = [
  "。",
  "·",
  "、",
  "•",
  "°",
  "∶",
  "◦",
  "※",
  "░",
] as const;

export const PLAYER_BULLET_CHARS = ["破", "灭", "碎", "击", "斩"] as const;
export const ENEMY_BULLET_CHARS = ["厄", "凶", "死", "噬", "虚"] as const;

export const POWER_UP_TYPES: PowerUpDef[] = [
  { type: "freeze", char: "冰", color: "#60a5fa", duration: 600 },
  { type: "rapid", char: "连", color: "#fbbf24", duration: 600 },
  { type: "invincible", char: "盾", color: "#a78bfa", duration: 900 },
  { type: "barrage", char: "环", color: "#fb7185", duration: 480 },
];
