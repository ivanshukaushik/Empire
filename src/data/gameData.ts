import type { Province, Kingdom, AIPersonality } from '../engine/types';

// ============================================================
// PROVINCE DEFINITIONS  (40 provinces across 8 kingdoms)
// SVG viewport: 820 × 680
// ============================================================

export const PROVINCE_DEFS: Omit<
  Province,
  'owner' | 'garrison' | 'unrest' | 'fortLevel' | 'hasFarm' | 'hasMarket' | 'hasBarracks' | 'hasSpyNetwork'
>[] = [
  // ── QIN (Legalists) ── Northwest
  { id: 'qin1', name: 'Yongcheng',  isCapital: false, terrain: 'hills',      adjacentTo: ['qin2','qin3','qin4'],              baseFood: 2, baseIncome: 2, baseManpower: 3, hasIron: false, hasSalt: false, x: 130, y: 360 },
  { id: 'qin2', name: 'Xianyang',   isCapital: true,  terrain: 'plains',     adjacentTo: ['qin1','qin4','qin5','han3'],        baseFood: 3, baseIncome: 3, baseManpower: 4, hasIron: false, hasSalt: false, x: 185, y: 310 },
  { id: 'qin3', name: 'Hanzhong',   isCapital: false, terrain: 'mountains',  adjacentTo: ['qin1','han2','han4'],               baseFood: 2, baseIncome: 1, baseManpower: 2, hasIron: true,  hasSalt: false, x: 160, y: 450 },
  { id: 'qin4', name: 'Longxi',     isCapital: false, terrain: 'hills',      adjacentTo: ['qin1','qin2','qin5'],              baseFood: 2, baseIncome: 2, baseManpower: 3, hasIron: false, hasSalt: false, x: 100, y: 295 },
  { id: 'qin5', name: 'Beidi',      isCapital: false, terrain: 'plains',     adjacentTo: ['qin2','qin4','zha3'],              baseFood: 2, baseIncome: 2, baseManpower: 3, hasIron: false, hasSalt: false, x: 155, y: 240 },

  // ── ZHAO (Cavalry Lords) ── North-central
  { id: 'zha1', name: 'Handan',    isCapital: true,  terrain: 'plains',     adjacentTo: ['zha2','wei3','zsh3'],              baseFood: 4, baseIncome: 4, baseManpower: 5, hasIron: false, hasSalt: false, x: 350, y: 370 },
  { id: 'zha2', name: 'Jinyang',   isCapital: false, terrain: 'hills',      adjacentTo: ['zha1','zha3','zha4','wei2'],       baseFood: 3, baseIncome: 3, baseManpower: 4, hasIron: true,  hasSalt: false, x: 280, y: 300 },
  { id: 'zha3', name: 'Yunzhong',  isCapital: false, terrain: 'plains',     adjacentTo: ['zha2','zha5','qin5','zsh5'],       baseFood: 3, baseIncome: 2, baseManpower: 4, hasIron: false, hasSalt: false, x: 215, y: 225 },
  { id: 'zha4', name: 'Dai',       isCapital: false, terrain: 'hills',      adjacentTo: ['zha2','zha5','yan3','zsh5'],       baseFood: 2, baseIncome: 2, baseManpower: 3, hasIron: false, hasSalt: false, x: 300, y: 195 },
  { id: 'zha5', name: 'Yanmen',    isCapital: false, terrain: 'mountains',  adjacentTo: ['zha3','zha4'],                     baseFood: 1, baseIncome: 2, baseManpower: 3, hasIron: false, hasSalt: false, x: 230, y: 155 },

  // ── YAN (Spymasters) ── Northeast
  { id: 'yan1', name: 'Ji',        isCapital: true,  terrain: 'plains',     adjacentTo: ['yan2','yan4','yan5'],              baseFood: 3, baseIncome: 3, baseManpower: 4, hasIron: false, hasSalt: false, x: 515, y: 195 },
  { id: 'yan2', name: 'Yuyang',    isCapital: false, terrain: 'hills',      adjacentTo: ['yan1','yan3'],                     baseFood: 2, baseIncome: 2, baseManpower: 3, hasIron: false, hasSalt: false, x: 450, y: 150 },
  { id: 'yan3', name: 'Shanggu',   isCapital: false, terrain: 'hills',      adjacentTo: ['yan2','yan5','zha4','zsh2'],       baseFood: 2, baseIncome: 2, baseManpower: 3, hasIron: false, hasSalt: false, x: 395, y: 215 },
  { id: 'yan4', name: 'Liaoyang',  isCapital: false, terrain: 'plains',     adjacentTo: ['yan1','yan5'],                     baseFood: 3, baseIncome: 2, baseManpower: 3, hasIron: false, hasSalt: true,  x: 600, y: 165 },
  { id: 'yan5', name: 'Beiping',   isCapital: false, terrain: 'plains',     adjacentTo: ['yan1','yan3','yan4','zsh2','qi4'], baseFood: 2, baseIncome: 2, baseManpower: 3, hasIron: false, hasSalt: false, x: 555, y: 258 },

  // ── QI (Merchants) ── East Coast
  { id: 'qi1',  name: 'Linzi',     isCapital: true,  terrain: 'plains',     adjacentTo: ['qi2','qi3','qi4'],                 baseFood: 4, baseIncome: 5, baseManpower: 4, hasIron: false, hasSalt: true,  x: 660, y: 325 },
  { id: 'qi2',  name: 'Jimo',      isCapital: false, terrain: 'plains',     adjacentTo: ['qi1','qi4'],                       baseFood: 3, baseIncome: 4, baseManpower: 3, hasIron: false, hasSalt: true,  x: 720, y: 275 },
  { id: 'qi3',  name: 'Gaotang',   isCapital: false, terrain: 'plains',     adjacentTo: ['qi1','qi4','qi5','wei5'],          baseFood: 3, baseIncome: 3, baseManpower: 3, hasIron: false, hasSalt: false, x: 625, y: 390 },
  { id: 'qi4',  name: 'Pingyuan',  isCapital: false, terrain: 'plains',     adjacentTo: ['qi1','qi2','qi3','yan5','wei5'],   baseFood: 3, baseIncome: 3, baseManpower: 3, hasIron: false, hasSalt: false, x: 590, y: 310 },
  { id: 'qi5',  name: 'Jibei',     isCapital: false, terrain: 'hills',      adjacentTo: ['qi3','chu3'],                      baseFood: 2, baseIncome: 3, baseManpower: 3, hasIron: false, hasSalt: false, x: 655, y: 445 },

  // ── WEI (Iron Crossbowmen) ── Central
  { id: 'wei1', name: 'Daliang',   isCapital: true,  terrain: 'plains',     adjacentTo: ['wei2','wei3','wei4','wei5','zsh4','han5'], baseFood: 4, baseIncome: 4, baseManpower: 4, hasIron: false, hasSalt: false, x: 460, y: 405 },
  { id: 'wei2', name: 'Anyi',      isCapital: false, terrain: 'riverlands', adjacentTo: ['wei1','wei3','han3','zha2'],        baseFood: 4, baseIncome: 3, baseManpower: 3, hasIron: false, hasSalt: false, x: 320, y: 395 },
  { id: 'wei3', name: 'Henei',     isCapital: false, terrain: 'plains',     adjacentTo: ['wei1','wei2','zha1','zsh3'],       baseFood: 3, baseIncome: 3, baseManpower: 3, hasIron: false, hasSalt: false, x: 395, y: 335 },
  { id: 'wei4', name: 'Suiyang',   isCapital: false, terrain: 'plains',     adjacentTo: ['wei1','wei5','han1','chu2'],       baseFood: 3, baseIncome: 3, baseManpower: 3, hasIron: false, hasSalt: false, x: 510, y: 470 },
  { id: 'wei5', name: 'Puyang',    isCapital: false, terrain: 'riverlands', adjacentTo: ['wei1','wei4','qi3','qi4'],         baseFood: 3, baseIncome: 3, baseManpower: 3, hasIron: false, hasSalt: false, x: 560, y: 370 },

  // ── HAN (Artisans) ── South-central
  { id: 'han1', name: 'Xinzheng',  isCapital: true,  terrain: 'plains',     adjacentTo: ['han2','han3','han4','han5','wei4'], baseFood: 3, baseIncome: 3, baseManpower: 3, hasIron: false, hasSalt: false, x: 390, y: 480 },
  { id: 'han2', name: 'Yiyang',    isCapital: false, terrain: 'hills',      adjacentTo: ['han1','han3','han4','qin3'],       baseFood: 2, baseIncome: 2, baseManpower: 3, hasIron: true,  hasSalt: false, x: 270, y: 465 },
  { id: 'han3', name: 'Luoyang',   isCapital: false, terrain: 'riverlands', adjacentTo: ['han1','han2','wei2','qin2'],       baseFood: 3, baseIncome: 3, baseManpower: 3, hasIron: false, hasSalt: false, x: 270, y: 390 },
  { id: 'han4', name: 'Nanyang',   isCapital: false, terrain: 'plains',     adjacentTo: ['han1','han2','qin3','chu4'],       baseFood: 3, baseIncome: 3, baseManpower: 3, hasIron: false, hasSalt: false, x: 270, y: 545 },
  { id: 'han5', name: 'Yewang',    isCapital: false, terrain: 'hills',      adjacentTo: ['han1','wei1'],                     baseFood: 2, baseIncome: 2, baseManpower: 3, hasIron: false, hasSalt: false, x: 365, y: 440 },

  // ── CHU (River Lords) ── South
  { id: 'chu1', name: 'Ying',      isCapital: true,  terrain: 'riverlands', adjacentTo: ['chu2','chu4','chu5'],              baseFood: 5, baseIncome: 4, baseManpower: 5, hasIron: false, hasSalt: false, x: 440, y: 590 },
  { id: 'chu2', name: 'Chendu',    isCapital: false, terrain: 'plains',     adjacentTo: ['chu1','chu3','chu5','wei4'],       baseFood: 4, baseIncome: 3, baseManpower: 4, hasIron: false, hasSalt: false, x: 515, y: 545 },
  { id: 'chu3', name: 'Shouchun',  isCapital: false, terrain: 'riverlands', adjacentTo: ['chu2','chu5','qi5'],               baseFood: 4, baseIncome: 4, baseManpower: 4, hasIron: false, hasSalt: false, x: 590, y: 510 },
  { id: 'chu4', name: 'Hengshan',  isCapital: false, terrain: 'mountains',  adjacentTo: ['chu1','han4'],                     baseFood: 2, baseIncome: 2, baseManpower: 3, hasIron: true,  hasSalt: false, x: 360, y: 565 },
  { id: 'chu5', name: 'Jianghan',  isCapital: false, terrain: 'riverlands', adjacentTo: ['chu1','chu2','chu3'],              baseFood: 4, baseIncome: 3, baseManpower: 4, hasIron: false, hasSalt: false, x: 500, y: 635 },

  // ── ZHONGSHAN (Survivors) ── Small central
  { id: 'zsh1', name: 'Lingshou',  isCapital: true,  terrain: 'hills',      adjacentTo: ['zsh2','zsh3','zsh4','zsh5'],       baseFood: 2, baseIncome: 2, baseManpower: 2, hasIron: false, hasSalt: false, x: 440, y: 275 },
  { id: 'zsh2', name: 'Gucheng',   isCapital: false, terrain: 'hills',      adjacentTo: ['zsh1','zsh4','zsh5','yan3','yan5'],baseFood: 2, baseIncome: 2, baseManpower: 2, hasIron: false, hasSalt: false, x: 480, y: 240 },
  { id: 'zsh3', name: 'Shiyi',     isCapital: false, terrain: 'hills',      adjacentTo: ['zsh1','zsh4','wei3','zha1'],       baseFood: 2, baseIncome: 2, baseManpower: 2, hasIron: false, hasSalt: false, x: 420, y: 325 },
  { id: 'zsh4', name: 'Zhongdu',   isCapital: false, terrain: 'plains',     adjacentTo: ['zsh1','zsh2','zsh3','wei1'],       baseFood: 2, baseIncome: 2, baseManpower: 2, hasIron: false, hasSalt: false, x: 470, y: 318 },
  { id: 'zsh5', name: 'Furou',     isCapital: false, terrain: 'hills',      adjacentTo: ['zsh1','zsh2','zha3','zha4'],       baseFood: 2, baseIncome: 2, baseManpower: 2, hasIron: false, hasSalt: false, x: 400, y: 255 },
];

// ============================================================
// KINGDOM BASE DEFINITIONS
// ============================================================

const yanPersonality: AIPersonality = {
  traits: ['paranoid', 'cautious'],
  goal: 'survive',
  aggressionWeight: 0.35,
  economyWeight: 0.4,
  diplomacyWeight: 0.6,
  spyWeight: 0.9,
  recentAttackers: [],
  recentBetrayers: [],
  scoutedProvinces: {},
};

const qinPersonality: AIPersonality = {
  traits: ['aggressive'],
  goal: 'hegemon',
  aggressionWeight: 0.85,
  economyWeight: 0.55,
  diplomacyWeight: 0.2,
  spyWeight: 0.3,
  recentAttackers: [],
  recentBetrayers: [],
  scoutedProvinces: {},
};

const zhaoPersonality: AIPersonality = {
  traits: ['aggressive', 'opportunistic'],
  goal: 'expand',
  aggressionWeight: 0.75,
  economyWeight: 0.4,
  diplomacyWeight: 0.35,
  spyWeight: 0.25,
  recentAttackers: [],
  recentBetrayers: [],
  scoutedProvinces: {},
};

const qiPersonality: AIPersonality = {
  traits: ['mercantile', 'opportunistic'],
  goal: 'consolidate',
  aggressionWeight: 0.45,
  economyWeight: 0.9,
  diplomacyWeight: 0.7,
  spyWeight: 0.3,
  recentAttackers: [],
  recentBetrayers: [],
  scoutedProvinces: {},
};

const weiPersonality: AIPersonality = {
  traits: ['cautious', 'honorable'],
  goal: 'survive',
  aggressionWeight: 0.4,
  economyWeight: 0.6,
  diplomacyWeight: 0.65,
  spyWeight: 0.35,
  recentAttackers: [],
  recentBetrayers: [],
  scoutedProvinces: {},
};

const hanPersonality: AIPersonality = {
  traits: ['cautious'],
  goal: 'consolidate',
  aggressionWeight: 0.3,
  economyWeight: 0.7,
  diplomacyWeight: 0.6,
  spyWeight: 0.3,
  recentAttackers: [],
  recentBetrayers: [],
  scoutedProvinces: {},
};

const chuPersonality: AIPersonality = {
  traits: ['opportunistic'],
  goal: 'expand',
  aggressionWeight: 0.6,
  economyWeight: 0.65,
  diplomacyWeight: 0.45,
  spyWeight: 0.35,
  recentAttackers: [],
  recentBetrayers: [],
  scoutedProvinces: {},
};

const zhongPersonality: AIPersonality = {
  traits: ['paranoid', 'cautious', 'honorable'],
  goal: 'survive',
  aggressionWeight: 0.25,
  economyWeight: 0.6,
  diplomacyWeight: 0.8,
  spyWeight: 0.5,
  recentAttackers: [],
  recentBetrayers: [],
  scoutedProvinces: {},
};

export type KingdomDef = Omit<Kingdom, 'isPlayer'>;

export const KINGDOM_DEFS: KingdomDef[] = [
  {
    id: 'qin',
    name: 'Qin',
    color: '#DC2626',
    capital: 'qin2',
    treasury: 65,
    food: 40,
    manpower: 30,
    stability: 80,
    reputation: -10,
    incomeModifier: 1.0,
    foodModifier: 1.0,
    armyCostModifier: 0.75,
    combatModifier: 1.15,
    mobilityBonus: 0,
    espionageModifier: 0.9,
    diplomacyModifier: 0.7,
    recruitCostModifier: 0.9,
    activeReform: null,
    isEliminated: false,
    personality: qinPersonality,
    bonusDescription: 'Army upkeep −25%; reforms have no stability penalty',
    weaknessDescription: 'Diplomacy costs +1 AP; all kingdoms start −20 relations',
    archetype: 'The Legalists',
  },
  {
    id: 'zhao',
    name: 'Zhao',
    color: '#2563EB',
    capital: 'zha1',
    treasury: 55,
    food: 32,
    manpower: 35,
    stability: 75,
    reputation: 0,
    incomeModifier: 1.0,
    foodModifier: 0.8,
    armyCostModifier: 1.0,
    combatModifier: 1.15,
    mobilityBonus: 1,
    espionageModifier: 1.0,
    diplomacyModifier: 1.0,
    recruitCostModifier: 1.0,
    activeReform: null,
    isEliminated: false,
    personality: zhaoPersonality,
    bonusDescription: 'Army movement +1 range; +15% attack on plains',
    weaknessDescription: 'Food production −20%',
    archetype: 'The Cavalry Lords',
  },
  {
    id: 'yan',
    name: 'Yan',
    color: '#7C3AED',
    capital: 'yan1',
    treasury: 50,
    food: 30,
    manpower: 25,
    stability: 70,
    reputation: 10,
    incomeModifier: 0.85,
    foodModifier: 1.0,
    armyCostModifier: 1.0,
    combatModifier: 0.85,
    mobilityBonus: 0,
    espionageModifier: 0.5,
    diplomacyModifier: 1.2,
    recruitCostModifier: 1.0,
    activeReform: null,
    isEliminated: false,
    personality: yanPersonality,
    bonusDescription: 'Espionage cost −50%; free scout actions',
    weaknessDescription: 'Army combat −15%; income −15%',
    archetype: 'The Spymasters',
  },
  {
    id: 'qi',
    name: 'Qi',
    color: '#D97706',
    capital: 'qi1',
    treasury: 90,
    food: 35,
    manpower: 22,
    stability: 75,
    reputation: 15,
    incomeModifier: 1.3,
    foodModifier: 1.0,
    armyCostModifier: 1.0,
    combatModifier: 1.0,
    mobilityBonus: 0,
    espionageModifier: 1.0,
    diplomacyModifier: 1.3,
    recruitCostModifier: 0.85,
    activeReform: null,
    isEliminated: false,
    personality: qiPersonality,
    bonusDescription: 'Income +30%; can recruit without barracks (at higher cost)',
    weaknessDescription: 'Manpower base −20%',
    archetype: 'The Merchants',
  },
  {
    id: 'wei',
    name: 'Wei',
    color: '#16A34A',
    capital: 'wei1',
    treasury: 60,
    food: 38,
    manpower: 32,
    stability: 72,
    reputation: 5,
    incomeModifier: 1.0,
    foodModifier: 1.0,
    armyCostModifier: 1.0,
    combatModifier: 1.2,
    mobilityBonus: 0,
    espionageModifier: 1.0,
    diplomacyModifier: 1.0,
    recruitCostModifier: 1.0,
    activeReform: null,
    isEliminated: false,
    personality: weiPersonality,
    bonusDescription: 'Combat +20% on plains; fort upgrades −20%',
    weaknessDescription: 'Surrounded — starts with borders on 6+ kingdoms',
    archetype: 'The Iron Crossbowmen',
  },
  {
    id: 'han',
    name: 'Han',
    color: '#0891B2',
    capital: 'han1',
    treasury: 55,
    food: 35,
    manpower: 22,
    stability: 70,
    reputation: 5,
    incomeModifier: 1.0,
    foodModifier: 1.0,
    armyCostModifier: 0.9,
    combatModifier: 1.0,
    mobilityBonus: 0,
    espionageModifier: 1.0,
    diplomacyModifier: 1.0,
    recruitCostModifier: 1.0,
    activeReform: null,
    isEliminated: false,
    personality: hanPersonality,
    bonusDescription: 'All builds −10% gold; fort builds −30%',
    weaknessDescription: 'Manpower rate −20%; smaller pool',
    archetype: 'The Artisans',
  },
  {
    id: 'chu',
    name: 'Chu',
    color: '#B45309',
    capital: 'chu1',
    treasury: 70,
    food: 50,
    manpower: 40,
    stability: 78,
    reputation: 0,
    incomeModifier: 1.0,
    foodModifier: 1.3,
    armyCostModifier: 1.0,
    combatModifier: 1.0,
    mobilityBonus: 0,
    espionageModifier: 1.0,
    diplomacyModifier: 1.0,
    recruitCostModifier: 1.0,
    activeReform: null,
    isEliminated: false,
    personality: chuPersonality,
    bonusDescription: 'Food +30%; riverlands armies regenerate morale +5/season',
    weaknessDescription: 'Movement −1 in non-riverlands; heavier winter penalties',
    archetype: 'The River Lords',
  },
  {
    id: 'zhongshan',
    name: 'Zhongshan',
    color: '#9CA3AF',
    capital: 'zsh1',
    treasury: 40,
    food: 25,
    manpower: 18,
    stability: 85,
    reputation: 20,
    incomeModifier: 0.9,
    foodModifier: 1.0,
    armyCostModifier: 1.0,
    combatModifier: 0.95,
    mobilityBonus: 0,
    espionageModifier: 1.0,
    diplomacyModifier: 1.2,
    recruitCostModifier: 1.0,
    activeReform: null,
    isEliminated: false,
    personality: zhongPersonality,
    bonusDescription: 'Unrest recovers 2× faster; high starting stability',
    weaknessDescription: 'Small starting territory; lower income and manpower',
    archetype: 'The Survivors',
  },
];

// ============================================================
// STARTING ARMY DEFINITIONS
// ============================================================

export interface ArmyDef {
  id: string;
  kingdomId: string;
  provinceId: string;
  size: number;
  morale: number;
  name: string;
}

export const ARMY_DEFS: ArmyDef[] = [
  { id: 'a_qin_1',  kingdomId: 'qin',       provinceId: 'qin2',  size: 8000, morale: 80, name: 'Qin Army' },
  { id: 'a_zhao_1', kingdomId: 'zhao',      provinceId: 'zha1',  size: 7000, morale: 78, name: 'Zhao Cavalry' },
  { id: 'a_yan_1',  kingdomId: 'yan',       provinceId: 'yan1',  size: 5500, morale: 72, name: 'Yan Guards' },
  { id: 'a_qi_1',   kingdomId: 'qi',        provinceId: 'qi1',   size: 6500, morale: 75, name: 'Qi Infantry' },
  { id: 'a_wei_1',  kingdomId: 'wei',       provinceId: 'wei1',  size: 7500, morale: 80, name: 'Wei Crossbowmen' },
  { id: 'a_han_1',  kingdomId: 'han',       provinceId: 'han1',  size: 5000, morale: 70, name: 'Han Legion' },
  { id: 'a_chu_1',  kingdomId: 'chu',       provinceId: 'chu1',  size: 9000, morale: 76, name: 'Chu Vanguard' },
  { id: 'a_zsh_1',  kingdomId: 'zhongshan', provinceId: 'zsh1',  size: 4000, morale: 74, name: 'Zhongshan Guard' },
];

// Starting garrison by province type
export const STARTING_GARRISON: Record<string, number> = {
  capital: 4000,
  normal: 2000,
  border: 2500,
};

// Which provinces start fortified
export const STARTING_FORTS: Record<string, number> = {
  qin2: 1, zha1: 1, yan1: 1, qi1: 1, wei1: 1, han1: 1, chu1: 1, zsh1: 1,
};
