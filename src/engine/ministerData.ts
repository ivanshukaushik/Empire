import type { Minister, MinisterRole, MinisterPersonality, MinisterHiddenState } from './types';

// ============================================================
// MINISTER GENERATION
// ============================================================

const MINISTER_NAMES: Record<string, Record<MinisterRole, string[]>> = {
  qin:       { chancellor: ['Fan Ju', 'Wei Ran', 'Lü Buwei'], general: ['Bai Qi', 'Wang Jian', 'Meng Ao'], treasurer: ['Gan Mao', 'Shu Li Ji', 'Chen Shu'], spymaster: ['Zhang Yi', 'Yao Jia', 'Li Xin'] },
  zhao:      { chancellor: ['Lin Xiangru', 'Ping Yuan Jun', 'Zhao Sheng'], general: ['Lian Po', 'Zhao She', 'Li Mu'], treasurer: ['Lou Chang', 'Wei Qi', 'Guo Zong'], spymaster: ['Mao Sui', 'Feng Ting', 'Han Cang'] },
  yan:       { chancellor: ['Su Qin', 'Ju Xin', 'Li Fu'], general: ['Yue Yi', 'Qin Kai', 'Wu Cheng'], treasurer: ['Gao Ge', 'Yan Ran', 'Shi Bo'], spymaster: ['Jing Ke', 'Gao Jian Li', 'Xia Fu'] },
  qi:        { chancellor: ['Mengchang Jun', 'Zou Ji', 'Tian Ying'], general: ['Tian Dan', 'Sun Bin', 'Kuang Zhang'], treasurer: ['Bao Shu', 'Guan Zhong', 'Chen Ju'], spymaster: ['Zhong Li Chun', 'Wang Liang', 'Fan Chi'] },
  wei:       { chancellor: ['Ximen Bao', 'Wei Ying', 'Gong Shu Cuo'], general: ['Wu Qi', 'Pang Juan', 'Wei Rui'], treasurer: ['Bai Gui', 'Li Ke', 'Duan Ganmu'], spymaster: ['Ying Chang', 'Meng Ao', 'Wei Qing'] },
  han:       { chancellor: ['Shen Buhai', 'Han Fei', 'Zhang Ping'], general: ['Bao Shu', 'Teng Geng', 'Nie Zheng'], treasurer: ['Ji Liang', 'Duan Gui', 'Feng Chang'], spymaster: ['Yan He', 'Shui Heng', 'Hou Sheng'] },
  chu:       { chancellor: ['Chunshen Jun', 'Qu Yuan', 'Tang Mei'], general: ['Jing Yang', 'Zhao Yang', 'Xiang Yan'], treasurer: ['Zhao Gui', 'Chen Zhen', 'Hua Yang'], spymaster: ['Huang Xie', 'Fan Xing', 'Wei Xu'] },
  zhongshan: { chancellor: ['Si Ma Xi', 'Yue Zhi', 'Zhong Shan Wang'], general: ['Fu Zhi', 'Peng Zu', 'Yan Ran'], treasurer: ['Gao Ming', 'Liu Pei', 'Chen Hu'], spymaster: ['Wei Ling', 'Fang Zhi', 'Luo Sheng'] },
};

const PERSONALITIES: MinisterPersonality[] = ['loyal', 'ambitious', 'cunning', 'fearful', 'honorable', 'greedy', 'paranoid', 'idealistic'];

const HIDDEN_AGENDAS = [
  'Secretly hopes to accumulate enough personal wealth to retire his family to safety before the inevitable wars consume all',
  'Harbors ambition to become Grand Chancellor with direct access to the seal of state',
  'Privately believes a different kingdom should unite China and has been quietly preparing for the transition',
  'Carries a deep grudge — the king executed his mentor years ago and he has never forgotten',
  'Is slowly bleeding the treasury through falsified procurement accounts to fund a personal estate',
  'Believes the king\'s heir is unfit and is privately grooming a rival claimant',
  'Wants to engineer a diplomatic humiliation that forces the kingdom to sue for peace — he has family in enemy lands',
  'Craves the military glory denied him in his youth; steers the king toward wars the kingdom may not survive',
  'Is addicted to gambling and deeply indebted — he will sell information for gold without fully understanding what he gives away',
  'Genuinely believes the king is doomed and is building personal relationships with neighboring courts as insurance',
];

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickN<T>(arr: T[], n: number, rng: () => number): T[] {
  const shuffled = [...arr].sort(() => rng() - 0.5);
  return shuffled.slice(0, n);
}

function generateHidden(
  kingdomId: string,
  allKingdomIds: string[],
  rng: () => number
): MinisterHiddenState {
  // ~65% loyal-ish (40–100), ~25% self-interested (20–55), ~10% turned (0–30)
  const roll = rng();
  let trueLoyalty: number;
  let foreignFaction: string | null = null;
  let plotStage: 0 | 1 | 2 | 3 = 0;

  if (roll < 0.60) {
    trueLoyalty = Math.floor(50 + rng() * 50); // 50–100
  } else if (roll < 0.85) {
    trueLoyalty = Math.floor(20 + rng() * 35); // 20–55
  } else {
    trueLoyalty = Math.floor(rng() * 25); // 0–25
    const others = allKingdomIds.filter(k => k !== kingdomId);
    foreignFaction = pick(others, rng);
    plotStage = (rng() < 0.6 ? 1 : rng() < 0.5 ? 2 : 0) as 0 | 1 | 2 | 3;
  }

  const hiddenAgenda = trueLoyalty > 65
    ? 'Genuinely devoted to the kingdom. May carry personal worries or family concerns, but serves with real loyalty.'
    : pick(HIDDEN_AGENDAS, rng);

  return {
    trueLoyalty,
    hiddenAgenda,
    foreignFaction,
    plotStage,
    secretAllies: [],
  };
}

export function generateMinisters(
  kingdomId: string,
  allKingdomIds: string[],
  rng: () => number
): Minister[] {
  const roles: MinisterRole[] = ['chancellor', 'general', 'treasurer', 'spymaster'];
  const namePool = MINISTER_NAMES[kingdomId] ?? MINISTER_NAMES['wei'];

  return roles.map((role, i) => {
    const names = namePool[role];
    const name = names[Math.floor(rng() * names.length)];
    const personalities = pickN(PERSONALITIES, 2, rng) as [MinisterPersonality, MinisterPersonality];
    const hidden = generateHidden(kingdomId, allKingdomIds, rng);
    const age = Math.floor(30 + rng() * 40); // 30–70
    const competence = Math.floor(3 + rng() * 8); // 3–10

    // Displayed loyalty drifts from true loyalty by ±20
    const drift = Math.floor((rng() - 0.5) * 40);
    const displayedLoyalty = Math.max(10, Math.min(100, hidden.trueLoyalty + drift));

    return {
      id: `${kingdomId}_minister_${role}`,
      name,
      role,
      personality: personalities,
      age,
      competence,
      displayedLoyalty,
      suspicion: 0,
      hidden,
      conversationHistory: [],
    };
  });
}
