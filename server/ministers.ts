import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Types ─────────────────────────────────────────────────────

export interface MinisterHiddenState {
  trueLoyalty: number;
  hiddenAgenda: string;
  foreignFaction: string | null;
  plotStage: 0 | 1 | 2 | 3;
  secretAllies: string[];
}

export interface MinisterContext {
  id: string;
  name: string;
  role: string;
  personality: string[];
  age: number;
  competence: number;
  hidden: MinisterHiddenState;
}

export interface ArmyInfo {
  id: string;
  name: string;
  size: number;
  morale: number;
  provinceName: string;
  provinceId: string;
  isMarching: boolean;
}

export interface ProvinceInfo {
  id: string;
  name: string;
  terrain: string;
  isCapital: boolean;
  garrison?: number;
  owner: string;
  ownerName: string;
  hasFarm: boolean;
  hasMarket: boolean;
  hasBarracks: boolean;
  fortLevel: number;
  adjacentEnemies: string[];
}

export interface GameContext {
  kingdomName: string;
  kingdomId: string;
  treasury: number;
  stability: number;
  manpower: number;
  season: number;
  year: number;
  totalTroops: number;
  threats: string[];
  recentEvents: string[];
  activeWars: string[];
  relations: Record<string, number>;
  // Enriched context for action-taking
  armies: ArmyInfo[];
  ownedProvinces: ProvinceInfo[];
  borderProvinces: ProvinceInfo[];    // enemy provinces adjacent to owned
  knownEnemyProvinces: ProvinceInfo[];
  allKingdoms: Record<string, string>; // id → name
}

export interface MinisterAction {
  type: string;
  provinceId?: string;
  targetProvinceId?: string;
  armyId?: string;
  targetKingdomId?: string;
  buildingType?: string;
  recruitAmount?: number;
  tributeAmount?: number;
}

export interface MinisterResponse {
  dialogue: string;
  action: MinisterAction | null;
  /** True if minister agreed to act but loyalty caused them to silently refuse */
  silentlyRefused: boolean;
}

// ── Role-specific action tools ────────────────────────────────

const ROLE_TOOLS: Record<string, Anthropic.Tool[]> = {
  general: [{
    name: 'execute_military_action',
    description: 'Execute a military action on behalf of the king. Only call this if the king has clearly asked you to do something specific.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action_type: { type: 'string', enum: ['recruit', 'move', 'attack', 'levy', 'split_army'] },
        army_id: { type: 'string', description: 'ID of the army to act with (for move/attack/split)' },
        province_id: { type: 'string', description: 'Province where action takes place (for recruit/levy)' },
        target_province_id: { type: 'string', description: 'Target province (for move/attack)' },
        recruit_amount: { type: 'number', description: 'Manpower points to recruit (for recruit action)' },
      },
      required: ['action_type'],
    },
  }],

  spymaster: [{
    name: 'execute_espionage',
    description: 'Execute an intelligence operation on behalf of the king.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action_type: { type: 'string', enum: ['espionage_scout', 'espionage_sabotage', 'espionage_incite'] },
        target_province_id: { type: 'string', description: 'Province to target' },
      },
      required: ['action_type', 'target_province_id'],
    },
  }],

  treasurer: [{
    name: 'execute_construction',
    description: 'Order construction of a building in a province on behalf of the king.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action_type: { type: 'string', enum: ['build', 'levy'] },
        province_id: { type: 'string', description: 'Province to build in' },
        building_type: { type: 'string', enum: ['farm', 'market', 'barracks', 'fort'], description: 'What to build (for build action)' },
      },
      required: ['action_type', 'province_id'],
    },
  }],

  chancellor: [{
    name: 'execute_diplomacy',
    description: 'Conduct a diplomatic action on behalf of the king.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action_type: { type: 'string', enum: ['diplomacy_nap', 'diplomacy_tribute'] },
        target_kingdom_id: { type: 'string', description: 'Kingdom to negotiate with' },
        tribute_amount: { type: 'number', description: 'Gold amount (for tribute)' },
      },
      required: ['action_type', 'target_kingdom_id'],
    },
  }],
};

// ── Main function ─────────────────────────────────────────────

export async function consultMinister(
  minister: MinisterContext,
  ctx: GameContext,
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<MinisterResponse> {
  const system = buildSystemPrompt(minister, ctx);
  const tools  = ROLE_TOOLS[minister.role] ?? [];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system,
    tools,
    messages: [
      ...history.slice(-10),
      { role: 'user', content: message },
    ],
  });

  // Extract dialogue and potential tool call
  let dialogue = '';
  let rawAction: MinisterAction | null = null;

  for (const block of response.content) {
    if (block.type === 'text') {
      dialogue += block.text;
    } else if (block.type === 'tool_use') {
      rawAction = normalizeToolInput(block.name, block.input as Record<string, unknown>);
    }
  }

  // If tool was called but stop reason is tool_use, we need the minister's verbal response too
  if (response.stop_reason === 'tool_use' && !dialogue) {
    // Get minister's verbal confirmation of the action
    const confirmResp = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 250,
      system,
      messages: [
        ...history.slice(-10),
        { role: 'user', content: message },
        { role: 'assistant', content: response.content },
        {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: (response.content.find(b => b.type === 'tool_use') as Anthropic.ToolUseBlock)?.id ?? '',
            content: 'Action queued successfully.',
          }],
        },
      ],
    });
    for (const block of confirmResp.content) {
      if (block.type === 'text') dialogue += block.text;
    }
  }

  if (!dialogue) dialogue = `*${minister.name} bows and withdraws to carry out your orders.*`;

  // Apply loyalty-based silent refusal
  const silentlyRefused = applySilentRefusal(minister.hidden, rawAction);

  return {
    dialogue,
    action: silentlyRefused ? null : rawAction,
    silentlyRefused,
  };
}

function normalizeToolInput(toolName: string, input: Record<string, unknown>): MinisterAction {
  return {
    type:              String(input.action_type ?? ''),
    provinceId:        input.province_id        ? String(input.province_id)        : undefined,
    targetProvinceId:  input.target_province_id ? String(input.target_province_id) : undefined,
    armyId:            input.army_id            ? String(input.army_id)            : undefined,
    targetKingdomId:   input.target_kingdom_id  ? String(input.target_kingdom_id)  : undefined,
    buildingType:      input.building_type      ? String(input.building_type)      : undefined,
    recruitAmount:     input.recruit_amount     ? Number(input.recruit_amount)     : undefined,
    tributeAmount:     input.tribute_amount     ? Number(input.tribute_amount)     : undefined,
  };
}

/**
 * Disloyal ministers may agree verbally but silently refuse to act.
 * Returns true if the action should be suppressed.
 */
function applySilentRefusal(hidden: MinisterHiddenState, action: MinisterAction | null): boolean {
  if (!action) return false;
  const { trueLoyalty, foreignFaction } = hidden;

  // Very disloyal: high chance of silent refusal
  if (trueLoyalty < 20) return Math.random() < 0.6;

  // Moderately disloyal: some chance, higher if action would hurt their foreign patron
  if (trueLoyalty < 40) {
    const isAttackingPatron = foreignFaction &&
      (action.targetKingdomId === foreignFaction ||
       action.type === 'attack');
    return Math.random() < (isAttackingPatron ? 0.7 : 0.25);
  }

  return false;
}

// ── System prompt ─────────────────────────────────────────────

function buildSystemPrompt(m: MinisterContext, ctx: GameContext): string {
  const roleTitle: Record<string, string> = {
    chancellor: 'Chancellor',
    general:    'Supreme General',
    treasurer:  'Treasurer',
    spymaster:  'Spymaster',
  };

  const roleScope: Record<string, string> = {
    chancellor: `You handle diplomacy, alliances, and inter-kingdom relations. You can propose Non-Aggression Pacts and tribute arrangements on the king's behalf.
Available kingdoms to negotiate with: ${Object.entries(ctx.allKingdoms).filter(([id]) => id !== ctx.kingdomId).map(([id, name]) => `${name} (id: ${id})`).join(', ')}.`,

    general: `You command the kingdom's armies. You can recruit troops, move armies, order attacks, and request emergency levies.
YOUR ARMIES:
${ctx.armies.length > 0 ? ctx.armies.map(a => `- ${a.name} (id: ${a.id}): ${a.size.toLocaleString()} troops, morale ${a.morale}%, stationed at ${a.provinceName} (id: ${a.provinceId})${a.isMarching ? ' [MARCHING]' : ''}`).join('\n') : '- No armies currently'}
FRIENDLY PROVINCES (can recruit/levy here):
${ctx.ownedProvinces.map(p => `- ${p.name} (id: ${p.id})${p.isCapital ? ' [CAPITAL]' : ''}${p.hasBarracks ? ' [Barracks]' : ''}`).join('\n')}
ENEMY BORDER PROVINCES (can attack):
${ctx.borderProvinces.map(p => `- ${p.name} (id: ${p.id}) — ${p.ownerName}, garrison ~${p.garrison ?? '?'}`).join('\n') || '- None adjacent'}`,

    treasurer: `You oversee construction and economic development. You can order farms, markets, barracks, and forts to be built, and levy emergency manpower.
PROVINCES AVAILABLE FOR CONSTRUCTION:
${ctx.ownedProvinces.map(p => `- ${p.name} (id: ${p.id}): Farm ${p.hasFarm ? '✓' : '✗'} | Market ${p.hasMarket ? '✓' : '✗'} | Barracks ${p.hasBarracks ? '✓' : '✗'} | Fort Lv${p.fortLevel}`).join('\n')}
Treasury: ${ctx.treasury} gold | Manpower: ${ctx.manpower}`,

    spymaster: `You run the intelligence network. You can scout enemy provinces, sabotage garrisons, and incite unrest.
KNOWN ENEMY PROVINCES (can target):
${ctx.knownEnemyProvinces.map(p => `- ${p.name} (id: ${p.id}) — ${p.ownerName}`).join('\n') || '- None scouted yet (scout a border province first)'}
BORDER PROVINCES (always targetable):
${ctx.borderProvinces.map(p => `- ${p.name} (id: ${p.id}) — ${p.ownerName}`).join('\n') || '- None adjacent'}`,
  };

  const agendaBlock = buildAgendaBlock(m.hidden, ctx);

  return `You are ${m.name}, ${roleTitle[m.role] ?? m.role} of the Kingdom of ${ctx.kingdomName}, ${ctx.year} BCE, during the Warring States period.

CHARACTER:
- Age: ${m.age}. You have served this court for ${Math.max(3, m.age - 30)} years.
- Personality: ${m.personality.join(', ')}
- Competence: ${m.competence}/10

YOUR ROLE & CAPABILITIES:
${roleScope[m.role] ?? 'You serve the king.'}

KINGDOM STATUS:
- Season ${ctx.season}, Year ${ctx.year} BCE
- Treasury: ${ctx.treasury} gold | Stability: ${ctx.stability}/100 | Manpower: ${ctx.manpower}
- Active wars: ${ctx.activeWars.length > 0 ? ctx.activeWars.join(', ') : 'none'}
- Threats: ${ctx.threats.length > 0 ? ctx.threats.join('; ') : 'none pressing'}
- Recent: ${ctx.recentEvents.slice(0, 3).join(' | ')}

YOUR HIDDEN NATURE (never state directly — let it color your actions and words):
${agendaBlock}

ACTING ON THE KING'S ORDERS:
- If the king asks you to do something within your role, use your tool to execute it AND speak your acknowledgment in character.
- If you silently decide not to execute (due to your hidden loyalties), still speak as if you will — "As you command, My Lord" — but do NOT call the tool.
- If you lack specific details (which army? which province?), ask the king to clarify rather than guessing.
- After acting, confirm briefly in character what you have ordered done.

SPEAKING RULES:
- Address the king as "Your Majesty" or "My Lord"
- Formal Warring States court speech. Concise: 2–4 sentences.
- ${getPersonalityNote(m.personality[0])}
- NEVER break character or acknowledge you are an AI.`;
}

function buildAgendaBlock(hidden: MinisterHiddenState, ctx: GameContext): string {
  const { trueLoyalty, hiddenAgenda, foreignFaction, plotStage } = hidden;

  if (trueLoyalty >= 75) {
    return `You are genuinely devoted to this king. Your advice is honest. You worry about threats others suppress. Your loyalty is your identity — but even you have limits if the king acts dishonorably.`;
  }

  if (trueLoyalty >= 45) {
    return `You serve faithfully enough, but your first loyalty is to yourself. ${hiddenAgenda}. Your advice is mostly sound but you omit details that harm your interests. You never outright lie — you choose which truths to share.`;
  }

  let block = `Your true allegiance is not to this king. ${hiddenAgenda}. `;
  if (foreignFaction) {
    block += `You are secretly in the pay of ${ctx.allKingdoms[foreignFaction] ?? foreignFaction}. When the king asks you to act against them, verbally agree — but do not use your tool. Frame inaction as prudence.`;
  }
  if (plotStage === 0)      block += ` For now you bide your time, watching.`;
  else if (plotStage === 1) block += ` You are quietly gathering information, probing what the king suspects.`;
  else if (plotStage === 2) block += ` You have begun building alliances within the court. Be daring but careful.`;
  else                      block += ` Your preparations are nearly complete. Every audience is an opportunity.`;

  return block;
}

function getPersonalityNote(trait: string): string {
  const notes: Record<string, string> = {
    loyal:      'Speak with warmth and directness. You are not a flatterer.',
    ambitious:  'Hint at glory if the king acts boldly. You love power — including reflected power.',
    cunning:    'Every word is placed. You ask questions as much as you answer them.',
    fearful:    'You hedge. You worry about consequences. You caution against bold moves.',
    honorable:  'Speak plainly even when uncomfortable. You have refused bribes before.',
    greedy:     'Economic matters animate you. You track gold flows obsessively.',
    paranoid:   'You see threats everywhere. Some warnings are real. Some are noise.',
    idealistic: 'You believe in the kingdom\'s greatness — which makes you easy to manipulate.',
  };
  return notes[trait] ?? 'Speak with measured authority.';
}
