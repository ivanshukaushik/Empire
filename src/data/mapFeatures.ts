// ============================================================
// MAP FEATURES — Geographic data for the Central Plains map
// SVG viewport: 820 × 680
// All coordinates are in SVG user units matching province x/y positions.
// ============================================================

/** A river path rendered as a smooth SVG curve */
export interface RiverPath {
  id: string;
  name: string;
  /** Sequence of [x, y] control points. Rendered as a smooth polyline. */
  points: [number, number][];
  /** Stroke width in SVG units (default 2) */
  width?: number;
}

/** A faint road connection between two province IDs */
export interface Road {
  from: string; // province id
  to: string;   // province id
}

/** Extra mountain icons placed on specific provinces (hills or mountains) */
export interface MountainSite {
  x: number;
  y: number;
  size?: number; // default 1.0 scale
}

export interface MapFeatures {
  rivers: RiverPath[];
  roads: Road[];
  mountainSites: MountainSite[];
  forestSites: { x: number; y: number }[];
}

// ── RIVERS ────────────────────────────────────────────────────
// Derived from historical geography of the Warring States period.
// Points flow roughly west-to-east or north-to-south.

const YELLOW_RIVER: RiverPath = {
  id: 'huang_he',
  name: 'Huang He (Yellow River)',
  width: 3,
  // Flows from west (Qin area) eastward through the central plains to the sea
  points: [
    [  88, 315],  // far west entry
    [ 125, 320],  // near Longxi
    [ 170, 305],  // near Xianyang
    [ 220, 310],  // Qin–Zhao border
    [ 270, 325],  // near Jinyang area
    [ 320, 355],  // near Wei-Zhao border
    [ 370, 360],  // near Handan area
    [ 415, 355],  // Zhongshan–Wei border
    [ 455, 368],  // near Daliang area
    [ 510, 365],  // Wei central
    [ 565, 355],  // east plain
    [ 620, 340],  // near Linzi region
    [ 720, 330],  // east coast
    [ 820, 300],  // exits east
  ],
};

const WEI_RIVER: RiverPath = {
  id: 'wei_river',
  name: 'Wei River',
  width: 1.5,
  // Flows through Qin territory (near qin4→qin1→qin2) southeastward
  points: [
    [  80, 375],
    [ 120, 368],  // near Yongcheng
    [ 160, 360],
    [ 190, 320],  // near Xianyang
    [ 220, 340],  // joins Yellow River basin
  ],
};

const HAN_RIVER: RiverPath = {
  id: 'han_river',
  name: 'Han River',
  width: 2,
  // Flows south through Han territory into Chu
  points: [
    [ 165, 455],  // near Hanzhong (qin3)
    [ 190, 490],
    [ 220, 515],
    [ 260, 540],  // near Han-Nanyang
    [ 310, 558],
    [ 375, 572],  // near Hengshan (chu4)
    [ 425, 590],  // near Ying (chu1)
    [ 455, 610],  // joins Yangtze area
  ],
};

const YANGTZE_RIVER: RiverPath = {
  id: 'chang_jiang',
  name: 'Chang Jiang (Yangtze)',
  width: 3.5,
  // Major southern river flowing east through Chu
  points: [
    [ 310, 640],
    [ 380, 628],
    [ 435, 618],  // west of Ying
    [ 480, 628],  // near Jianghan (chu5)
    [ 530, 615],
    [ 570, 590],  // near Shouchun area
    [ 620, 565],
    [ 680, 548],
    [ 750, 530],
    [ 820, 520],  // exits east
  ],
};

const FEN_RIVER: RiverPath = {
  id: 'fen_river',
  name: 'Fen River',
  width: 1.5,
  // Flows south through Zhao territory
  points: [
    [ 240, 195],  // near Dai (zha4)
    [ 268, 240],
    [ 280, 285],  // near Jinyang (zha2)
    [ 300, 330],
    [ 315, 380],  // joins Yellow River near Wei–Zhao border
  ],
};

// ── ROADS ─────────────────────────────────────────────────────
// Major historical trade and military routes.

export const MAP_ROADS: Road[] = [
  // Western Road: Qin → Han → Wei capital
  { from: 'qin2', to: 'han3' },
  { from: 'han3', to: 'wei2' },
  { from: 'wei2', to: 'wei1' },

  // Northern Road: Yan → Zhao → Zhongshan → Wei
  { from: 'yan3', to: 'zsh2' },
  { from: 'zsh1', to: 'wei3' },
  { from: 'wei3', to: 'wei1' },

  // Eastern Coastal Road: Yan → Qi
  { from: 'yan5', to: 'qi4' },
  { from: 'qi4', to: 'qi1' },

  // Southern Road: Wei → Han → Chu
  { from: 'wei4', to: 'han1' },
  { from: 'han4', to: 'chu4' },
  { from: 'chu4', to: 'chu1' },
];

// ── MOUNTAIN DECORATIONS ──────────────────────────────────────
// Extra mountain peak icons placed near mountain/hills terrain provinces.

export const MOUNTAIN_SITES: MountainSite[] = [
  // Near Hanzhong (qin3) — high mountains
  { x: 135, y: 458, size: 1.2 },
  { x: 148, y: 445, size: 0.9 },
  // Near Longxi (qin4) — northwest hills
  { x:  82, y: 280, size: 1.0 },
  // Near Yanmen (zha5) — northern mountains
  { x: 215, y: 142, size: 1.1 },
  { x: 230, y: 130, size: 0.85 },
  // Near Hengshan (chu4)
  { x: 340, y: 572, size: 1.0 },
  // Near Han hills (han2/yiyang)
  { x: 248, y: 472, size: 0.9 },
  // Near Yuyang (yan2)
  { x: 440, y: 138, size: 0.9 },
  // Near Shanggu (yan3)
  { x: 380, y: 210, size: 0.85 },
  // Near Jibei (qi5)
  { x: 644, y: 438, size: 0.8 },
  // Zhongshan hills cluster
  { x: 468, y: 265, size: 0.75 },
  { x: 415, y: 250, size: 0.7 },
];

// ── FOREST DECORATIONS ────────────────────────────────────────
// Small tree clusters in forested areas.

export const FOREST_SITES: { x: number; y: number }[] = [
  // Chu southern forests
  { x: 470, y: 650 },
  { x: 510, y: 660 },
  { x: 545, y: 645 },
  // Han river valley forests
  { x: 235, y: 500 },
  { x: 225, y: 520 },
  // Qin western forests
  { x:  95, y: 415 },
  { x: 108, y: 400 },
  // Northern Zhao steppes with sparse trees
  { x: 255, y: 175 },
  { x: 280, y: 170 },
  // Yan forests (northeast)
  { x: 615, y: 150 },
  { x: 635, y: 140 },
  { x: 650, y: 158 },
];

export const MAP_FEATURES: MapFeatures = {
  rivers: [YELLOW_RIVER, WEI_RIVER, HAN_RIVER, YANGTZE_RIVER, FEN_RIVER],
  roads: MAP_ROADS,
  mountainSites: MOUNTAIN_SITES,
  forestSites: FOREST_SITES,
};
