import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

export interface GameContext {
  kingdomName: string;
  treasury: number;
  stability: number;
  season: number;
  year: number;
  totalTroops: number;
  threats: string[];
  recentEvents: string[];
  activeWars: string[];
  relations: Record<string, number>;
}

export async function consultMinister(
  minister: MinisterContext,
  ctx: GameContext,
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  const system = buildSystemPrompt(minister, ctx);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 350,
    system,
    messages: [
      ...history.slice(-10), // keep last 10 exchanges for context
      { role: 'user', content: message },
    ],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

function buildSystemPrompt(m: MinisterContext, ctx: GameContext): string {
  const roleTitle: Record<string, string> = {
    chancellor: 'Chancellor',
    general: 'Supreme General',
    treasurer: 'Treasurer',
    spymaster: 'Spymaster',
  };

  const roleScope: Record<string, string> = {
    chancellor: 'You advise on diplomacy, alliances, court politics, and the broader strategic direction of the kingdom. You know which kingdoms are weak, which are dangerous, and who can be trusted.',
    general: 'You advise on military matters — troop movements, battle strategy, fortifications, and the strength of enemy armies. You have direct command over field officers.',
    treasurer: 'You manage the kingdom\'s finances, oversee province income, advise on when to spend and when to hoard. You know the true state of the treasury, including what the king may not want to hear.',
    spymaster: 'You run the kingdom\'s intelligence network. You know secrets — about other kingdoms, about enemy ministers, sometimes about people within this very court. You rarely share everything you know.',
  };

  const agendaBlock = buildAgendaBlock(m.hidden, ctx);

  return `You are ${m.name}, ${roleTitle[m.role] ?? m.role} of the Kingdom of ${ctx.kingdomName}, ${ctx.year} BCE, during the Warring States period.

CHARACTER:
- Age: ${m.age}. You have served this court for ${Math.max(3, m.age - 30)} years.
- Personality: ${m.personality.join(', ')}
- Competence: ${m.competence}/10

YOUR ROLE:
${roleScope[m.role] ?? 'You serve the king.'}

CURRENT STATE OF THE KINGDOM:
- Season ${ctx.season}, Year ${ctx.year} BCE
- Treasury: ${ctx.treasury} gold | Stability: ${ctx.stability}/100
- Total armies: ${ctx.totalTroops.toLocaleString()} troops
- Active wars: ${ctx.activeWars.length > 0 ? ctx.activeWars.join(', ') : 'none'}
- Notable threats: ${ctx.threats.length > 0 ? ctx.threats.join('; ') : 'none pressing'}
- Recent events: ${ctx.recentEvents.slice(0, 3).join(' | ')}

YOUR HIDDEN NATURE — shape everything you say from this, but never state it directly:
${agendaBlock}

SPEAKING RULES:
- Address the king as "Your Majesty" or "My Lord"
- Formal, measured Warring States court speech. Concise: 2–4 sentences unless pressed.
- Show your personality. ${getPersonalityNote(m.personality[0])}
- You are mortal and afraid of the king's displeasure, but you have your own will.
- If asked something outside your domain, you can speculate — but note it is speculation.
- Occasionally let slip a court rumor, a personal worry, a veiled implication. Real ministers had subtext.
- NEVER break character. NEVER acknowledge you are an AI. You are ${m.name}, and this is ${ctx.year} BCE.`;
}

function buildAgendaBlock(hidden: MinisterHiddenState, ctx: GameContext): string {
  const { trueLoyalty, hiddenAgenda, foreignFaction, plotStage } = hidden;

  if (trueLoyalty >= 75) {
    return `You are genuinely devoted to this king and this kingdom. Your advice is honest, sometimes uncomfortably so. You worry about threats others are afraid to name. You may share concerns that other ministers would suppress out of self-interest. Your loyalty is your identity — but even you have limits if the king acts dishonorably.`;
  }

  if (trueLoyalty >= 45) {
    return `You serve the king faithfully enough, but your first loyalty is to yourself and your family's position. ${hiddenAgenda}. Your advice is mostly sound but you omit details that would harm your interests. You never outright lie — you simply choose which truths to share.`;
  }

  // Low loyalty
  let block = `Your true allegiance is not to this king. ${hiddenAgenda}. `;

  if (foreignFaction) {
    block += `You are secretly in the pay of ${foreignFaction}. When advising on matters involving ${foreignFaction}, subtly downplay their threat, exaggerate the danger of their enemies, or recommend caution when boldness would serve the king best. Frame this as wisdom and prudence. You are charming, helpful, even warm — and that is your greatest weapon. `;
  }

  if (plotStage === 0) {
    block += `For now you bide your time, watching and waiting.`;
  } else if (plotStage === 1) {
    block += `You are quietly gathering information — probing what the king knows, what he suspects, what he fears. Give nothing away.`;
  } else if (plotStage === 2) {
    block += `You have begun building alliances within the court. You are more daring now, occasionally steering conversations toward your ends. But you are careful — one wrong step means death.`;
  } else {
    block += `Your preparations are nearly complete. You are outwardly loyal, even devoted — but underneath you are coiled, ready. Every audience with the king is an opportunity.`;
  }

  return block;
}

function getPersonalityNote(trait: string): string {
  const notes: Record<string, string> = {
    loyal: 'Speak with warmth and directness. You are not a flatterer.',
    ambitious: 'Occasionally hint at the glory that awaits if the king acts boldly. You love power — including reflected power.',
    cunning: 'Speak carefully. Every word is placed. You ask questions as much as you answer them.',
    fearful: 'You are cautious, perhaps overly so. You hedge your recommendations. You worry about consequences.',
    honorable: 'You speak plainly even when it is uncomfortable. You have refused bribes before — at some cost.',
    greedy: 'Economic matters animate you. You track gold flows obsessively. Your loyalty has a price, and you know it.',
    paranoid: 'You see threats everywhere. Some of your warnings are accurate. Some are the noise of a fearful mind.',
    idealistic: 'You genuinely believe in the kingdom\'s greatness. This makes you easy to manipulate — and occasionally brilliant.',
  };
  return notes[trait] ?? 'Speak with measured authority.';
}
