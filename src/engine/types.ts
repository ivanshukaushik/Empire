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
  actionPointsRemaining: number;
  maxActionPoints: number;
  pendingPlayerActions: PlayerAction[];
  fogOfWar: Record<string, FogOfWarEntry>;
  turnLog: LogEntry[];
  seasonSummary: SeasonSummary | null;
  isGameOver: boolean;
  winner: string | null;
  loseReason: string | null;
  selectedProvinceId: string | null;
  actionBeingPlanned: ActionType | null;
  pendingMoveSource: string | null; // army id being moved
}
