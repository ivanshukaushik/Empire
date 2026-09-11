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

// ── Minister system ───────────────────────────────────────────

export type MinisterRole = 'chancellor' | 'general' | 'treasurer' | 'spymaster';

export type MinisterPersonality =
  | 'loyal'
  | 'ambitious'
  | 'cunning'
  | 'fearful'
  | 'honorable'
  | 'greedy'
  | 'paranoid'
  | 'idealistic';

export interface MinisterHiddenState {
  /** 0 = actively plotting against you, 100 = completely devoted */
  trueLoyalty: number;
  /** What they secretly want or who they serve */
  hiddenAgenda: string;
  /** Kingdom ID that has bribed/turned them, or null */
  foreignFaction: string | null;
  /** How far along their plot is: 0=passive, 1=watching, 2=building, 3=ready */
  plotStage: 0 | 1 | 2 | 3;
  /** IDs of other ministers they are conspiring with */
  secretAllies: string[];
}

export interface MinisterMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Minister {
  id: string;
  name: string;
  role: MinisterRole;
  personality: MinisterPersonality[];
  age: number;
  /** How skilled they are at their role (1–10). Affects advice quality. */
  competence: number;
  /** Apparent loyalty shown to the player (0–100). May differ from trueLoyalty. */
  displayedLoyalty: number;
  /** Player's manually tracked suspicion level (0–100). Affects their demeanor. */
  suspicion: number;
  /** Hidden state — never shown directly in UI */
  hidden: MinisterHiddenState;
  /** Conversation history with this minister */
  conversationHistory: MinisterMessage[];
}

// ── Ruler system ──────────────────────────────────────────────
export type RulerTrait = PersonalityTrait | 'reformist' | 'ambitious' | 'cunning';
export type RulerAmbition = 'unify' | 'survive' | 'dominate_trade' | 'revenge' | 'reform';

export interface RulerStats {
  military: number;        // 1–10 → +combatModifier bonus up to +10%
  diplomacy: number;       // 1–10 → +diplomacyModifier bonus up to +20%
  administration: number;  // 1–10 → +incomeModifier bonus up to +10%
}

export interface Ruler {
  id: string;
  name: string;
  age: number;              // years old (ages 1/year = every 4 seasons)
  traits: RulerTrait[];
  ambition: RulerAmbition;
  stats: RulerStats;
  reignStartSeason: number;
}

export interface RulerSuccessionEvent {
  season: number;
  kingdomId: string;
  deceasedName: string;
  newRuler: Ruler;
  message: string;
}

export type StrategicGoal = 'expand' | 'consolidate' | 'survive' | 'hegemon';

export type TreatyType = 'nap' | 'tribute';
export type TreatyStatus = 'active' | 'breached' | 'expired';

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
  | 'levy'
  | 'split_army'
  | 'breach_treaty';

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
  /** Season when levy becomes available again (undefined = always available) */
  levyCooldownUntil?: number;
  x: number;
  y: number;
  // ── Part A: Project Slots ──────────────────────────────────
  activeProjects?: Project[];
  projectSlotsBase?: number;   // default 1
  // ── Part B: Population ────────────────────────────────────
  population?: number;          // in thousands, drives manpower rate
  // ── Part E: Admin & Resources ─────────────────────────────
  adminCost?: number;           // default 1 (capital = 2)
  hasHorses?: boolean;
}

export interface Army {
  id: string;
  kingdomId: string;
  provinceId: string;
  size: number;
  morale: number; // 0–100
  name: string;
  /** Soft cap for auto-replenishment (set to peak size after recruiting) */
  maxSize?: number;
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
  /** Current ruler */
  ruler?: Ruler;
  /** How many times this kingdom has broken treaties (affects AI trust) */
  treatyBreachCount: number;
  // ── Part E: Admin Capacity ────────────────────────────────
  adminCapacity?: number;      // default 10; overextension if Σ adminCost > this
  adminTechLevel?: number;     // 0 = base; 1 = unlocks 2nd project slot + +4 adminCapacity
}

export interface RelationData {
  score: number; // −100 to +100
  treaty: Treaty | null;
  atWarWith: boolean;
  events: string[];
}

export interface Treaty {
  type: TreatyType;
  /** Track treaty health */
  status: TreatyStatus;
  expiresAt: number; // −1 = permanent; else season number
  tributeAmount?: number;
  parties: [string, string];
  signedAt: number; // season signed
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
  type: 'combat' | 'economy' | 'diplomacy' | 'espionage' | 'event' | 'player' | 'ai' | 'succession';
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
  recruitAmount?: number;   // manpower points to spend
  levyAmount?: number;      // manpower points to levy
  splitFraction?: number;   // 0.25 | 0.5 | 0.75 for split_army
}

/** A timed construction project queued in a province. */
export interface Project {
  id: string;
  kind: BuildingType;
  startedAtDays: number;
  durationDays: number;
  costGold: number;
}

/** An entry in the persistent War Ledger event feed. */
export interface LedgerEvent {
  id: string;
  type: 'battle' | 'treaty' | 'elimination' | 'succession' | 'economy';
  dayResolved: number;
  season: number;
  message: string;
  provinceId?: string;
  attackerKingdomId?: string;
  defenderKingdomId?: string;
  attackerWon?: boolean;
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
  successionLines: string[];
  winCheck: { winner: string; reason: string } | null;
}

export type DiploProposalType = 'nap_offer' | 'tribute_demand' | 'mutual_target';
export type DiploProposalStatus = 'pending' | 'accepted' | 'declined' | 'expired';

/** Inbound diplomacy proposal from an AI kingdom to the player */
export interface DiploProposal {
  id: string;
  fromKingdomId: string;
  type: DiploProposalType;
  /** Human-readable description of the proposal and its terms */
  terms: string;
  /** The kingdom being targeted (for mutual_target pacts) */
  targetKingdomId?: string;
  /** Gold the AI will pay per season (for tribute_demand where AI pays player) */
  tributeAmount?: number;
  /** Season the proposal was generated */
  season: number;
  /** Season at which this proposal expires if not acted on */
  expiresAt: number;
  /** Lifecycle status — only 'pending' proposals appear in the inbox */
  status: DiploProposalStatus;
}

export type GamePhase =
  | 'player_planning'
  | 'executing'
  | 'season_summary'
  | 'game_over';

// ── Continuous-time simulation types ──────────────────────────

/** An army currently marching between provinces. */
export interface ArmyMovement {
  armyId: string;
  fromProvinceId: string;
  toProvinceId: string;
  startTimeDays: number;
  arrivalTimeDays: number;
  /** True if the destination is enemy-owned (will trigger battle on arrival). */
  isHostile: boolean;
  attackerKingdomId: string;
}

/** Keeps a brief record of a resolved battle for the map overlay. */
export interface RecentBattle {
  id: string;
  provinceId: string;
  attackerKingdomId: string;
  defenderKingdomId: string;
  attackerWon: boolean;
  resolvedAtDays: number;
  narrative: string;
  // Battle stats stored for War Ledger / Season Summary (Part D fix)
  attackerPower: number;
  defenderPower: number;
  attackerLosses: number;
  defenderLosses: number;
  attackerInitialStrength: number;
  defenderInitialStrength: number;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'danger';
  expiresAt: number; // timestamp ms
}

export interface GameState {
  seed: number;
  season: number; // absolute season count starting at 1; season%4: 0=winter,1=spring,2=summer,3=autumn
  year: number;   // BCE year, derived from gameTimeDays
  phase: GamePhase;
  provinces: Record<string, Province>;
  kingdoms: Record<string, Kingdom>;
  armies: Record<string, Army>;
  relations: Record<string, Record<string, RelationData>>;
  playerKingdomId: string;

  // ── Orders system (legacy fields kept for save migration) ──────────
  ordersRemaining: number;
  maxOrders: number;
  /** @deprecated Replaced by Province.activeProjects (Part A). Kept for save migration. */
  provinceDomesticUsed?: Record<string, boolean>;
  /** @deprecated Use activeMovements to determine if an army is busy */
  armyCampaignUsed?: Record<string, boolean>;

  pendingPlayerActions: PlayerAction[];
  fogOfWar: Record<string, FogOfWarEntry>;
  turnLog: LogEntry[];
  seasonSummary: SeasonSummary | null;
  isGameOver: boolean;
  winner: string | null;
  loseReason: string | null;
  selectedProvinceId: string | null;
  actionBeingPlanned: ActionType | null;
  pendingMoveArmyId: string | null;
  helpSeen: boolean;

  /** Inbound diplomacy proposals from AI kingdoms, awaiting player decision */
  diplomaticInbox: DiploProposal[];

  /** Ruler succession events from last season (shown in summary) */
  rulerEvents: RulerSuccessionEvent[];

  /** Transient toast messages for the map overlay */
  toastMessages: ToastMessage[];

  // ── Continuous-time simulation fields ─────────────────────
  /** Days elapsed since game start (0 = Spring 475 BCE). Drives all time logic. */
  gameTimeDays: number;
  /** Whether the simulation clock is paused. */
  paused: boolean;
  /** Game days that elapse per real second. */
  speed: 1 | 2 | 4 | 8;
  /** Armies currently marching between provinces, keyed by armyId. */
  activeMovements: Record<string, ArmyMovement>;
  /** Next day each AI kingdom should run its planning loop, keyed by kingdomId. */
  nextAiPlanAtDays: Record<string, number>;
  /** Last N resolved battles, kept for the map battle-flash overlay. */
  recentBattles: RecentBattle[];
  /** gameTimeDays when the last economy phase ran (runs every 90 days). */
  lastEconomyAtDays: number;
  /** Persistent event feed — last 100 notable events. */
  warLedger?: LedgerEvent[];

  /** Ministers for each kingdom, keyed by kingdom ID */
  ministers: Record<string, Minister[]>;
}
