// ============================================================
// ANCIENT WARRING STATES — Core Types
// ============================================================

export type TerrainType = 'plains' | 'hills' | 'mountains' | 'riverlands';

export type PersonalityTrait =
  | 'aggressive'
  | 'cautious'
  | 'opportunistic'
  | 'honorable'
  | 'paranoid'
  | 'mercantile';

export type StrategicGoal = 'expand' | 'consolidate' | 'survive' | 'hegemon';

export type TreatyType = 'nap' | 'tribute';

export type ActionType =
  | 'build'
  | 'recruit'
  | 'move'
  | 'attack'
  | 'diplomacy_nap'
  | 'diplomacy_tribute'
  | 'espionage_scout'
  | 'espionage_sabotage'
  | 'espionage_incite'
  | 'reform';

export type BuildingType = 'farm' | 'market' | 'barracks' | 'fort';

export type ReformType =
  | 'iron_fist'
  | 'commerce'
  | 'conscription'
  | 'propaganda'
  | 'fortify_borders';

export interface Province {
  id: string;
  name: string;
  terrain: TerrainType;
  owner: string; // kingdom id
  isCapital: boolean;
  adjacentTo: string[]; // province ids
  garrison: number; // troops garrisoned
  unrest: number; // 0–100
  baseFood: number;
  baseIncome: number;
  baseManpower: number;
  hasIron: boolean;
  hasSalt: boolean;
  fortLevel: number; // 0–3
  hasFarm: boolean;
  hasMarket: boolean;
  hasBarracks: boolean;
  hasSpyNetwork: boolean;
  x: number;
  y: number;
}

export interface Army {
  id: string;
  kingdomId: string;
  provinceId: string;
  size: number;
  morale: number; // 0–100
  name: string;
}

export interface AIPersonality {
  traits: PersonalityTrait[];
  goal: StrategicGoal;
  aggressionWeight: number; // 0–1
  economyWeight: number;
  diplomacyWeight: number;
  spyWeight: number;
  recentAttackers: string[];
  recentBetrayers: string[];
  scoutedProvinces: Record<string, { season: number; garrison: number; owner: string }>;
}

export interface Kingdom {
  id: string;
  name: string;
  color: string;
  capital: string;
  treasury: number;
  food: number;
  manpower: number;
  stability: number; // 0–100
  reputation: number; // −100 to +100
  incomeModifier: number;
  foodModifier: number;
  armyCostModifier: number;
  combatModifier: number;
  mobilityBonus: number;
  espionageModifier: number;
  diplomacyModifier: number;
  recruitCostModifier: number;
  activeReform: ReformType | null;
  isEliminated: boolean;
  isPlayer: boolean;
  personality?: AIPersonality;
  bonusDescription: string;
  weaknessDescription: string;
  archetype: string;
}

export interface RelationData {
  score: number; // −100 to +100
  treaty: Treaty | null;
  atWarWith: boolean;
  events: string[];
}

export interface Treaty {
  type: TreatyType;
  expiresAt: number; // −1 = permanent; else season number
  tributeAmount?: number;
  parties: [string, string];
}

export interface FogOfWarEntry {
  visible: boolean; // owned — full info
  partial: boolean; // adjacent — owner + terrain + garrison tier
  scouted: boolean; // recently scouted — full info
  scoutedAt: number;
  lastKnownOwner: string;
  lastKnownGarrisonTier: 'small' | 'medium' | 'large' | 'unknown';
}

export interface LogEntry {
  season: number;
  type: 'combat' | 'economy' | 'diplomacy' | 'espionage' | 'event' | 'player' | 'ai';
  message: string;
  kingdomId?: string;
}

export interface PlayerAction {
  id: string;
  type: ActionType;
  /** Order cost: 1 for campaign actions (move/attack/espionage/diplomacy/reform), 0 for domestic (build/recruit) */
  apCost: number;
  provinceId?: string;
  targetProvinceId?: string;
  armyId?: string;
  targetKingdomId?: string;
  buildingType?: BuildingType;
  reform?: ReformType;
  tributeAmount?: number;
  recruitAmount?: number; // manpower points to spend
}

export interface BattleResult {
  attackerKingdomId: string;
  defenderKingdomId: string;
  attackerArmyId: string;
  targetProvinceId: string;
  attackerInitialStrength: number;
  defenderInitialStrength: number;
  attackerPower: number;
  defenderPower: number;
  attackerWon: boolean;
  attackerLosses: number;
  defenderLosses: number;
  provinceCaptured: boolean;
  narrative: string;
}

export interface SeasonSummary {
  season: number;
  year: number;
  seasonName: string;
  battles: BattleResult[];
  playerActions: string[];
  aiActions: string[];
  economyLines: string[];
  diplomaticLines: string[];
  espionageLines: string[];
  winCheck: { winner: string; reason: string } | null;
}

/** Inbound diplomacy proposal from an AI kingdom to the player */
export interface DiploProposal {
  id: string;
  fromKingdomId: string;
  type: 'nap_offer' | 'tribute_demand' | 'mutual_target';
  /** Human-readable description of the proposal and its terms */
  terms: string;
  /** The kingdom being targeted (for mutual_target pacts) */
  targetKingdomId?: string;
  /** Gold the AI will pay per season (for tribute_demand where AI pays player) */
  tributeAmount?: number;
  /** Season the proposal was generated */
  season: number;
}

export type GamePhase =
  | 'player_planning'
  | 'executing'
  | 'season_summary'
  | 'game_over';

export interface GameState {
  seed: number;
  season: number; // starts at 1
  year: number; // starts at 475 (BCE)
  phase: GamePhase;
  provinces: Record<string, Province>;
  kingdoms: Record<string, Kingdom>;
  armies: Record<string, Army>;
  relations: Record<string, Record<string, RelationData>>;
  playerKingdomId: string;

  // ── Orders system (replaces flat AP) ──────────────────────
  /** Orders remaining this season. Campaign actions each cost 1. */
  ordersRemaining: number;
  /** Maximum orders per season (default 2; grows with reforms or events). */
  maxOrders: number;
  /**
   * Tracks which provinces have already used their ONE domestic action
   * (Build or Recruit) this season. Resets at the start of each season.
   */
  provinceDomesticUsed: Record<string, boolean>;
  /**
   * Tracks which armies have already used their ONE campaign action
   * (Move or Attack) this season. Resets at the start of each season.
   */
  armyCampaignUsed: Record<string, boolean>;

  pendingPlayerActions: PlayerAction[];
  fogOfWar: Record<string, FogOfWarEntry>;
  turnLog: LogEntry[];
  seasonSummary: SeasonSummary | null;
  isGameOver: boolean;
  winner: string | null;
  loseReason: string | null;
  selectedProvinceId: string | null;
  actionBeingPlanned: ActionType | null;
  pendingMoveArmyId: string | null; // ID of the army being moved or attacking
  helpSeen: boolean; // has the player dismissed the first-play help overlay

  /** Inbound diplomacy proposals from AI kingdoms, awaiting player decision */
  diplomaticInbox: DiploProposal[];
}
