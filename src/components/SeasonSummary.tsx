import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { BattleResult, SeasonSummary as SeasonSummaryType } from '../engine/types';

export default function SeasonSummary() {
  const gameState     = useGameStore((s) => s.gameState!);
  const dismissSummary = useGameStore((s) => s.dismissSummary);

  const summary = gameState.seasonSummary;
  if (!summary || gameState.phase !== 'season_summary') return null;

  const playerKid = gameState.playerKingdomId;
  const kingdoms  = gameState.kingdoms;

  // ── Highlights ──────────────────────────────────────────────
  const highlights: { icon: string; text: string; color: string }[] = [];

  // Province captures
  const playerCaptures = summary.battles.filter(
    (b) => b.attackerKingdomId === playerKid && b.provinceCaptured
  );
  const playerLosses = summary.battles.filter(
    (b) => b.defenderKingdomId === playerKid && b.provinceCaptured
  );
  const aiCaptures = summary.battles.filter(
    (b) => b.attackerKingdomId !== playerKid && b.provinceCaptured
  );

  if (playerCaptures.length > 0) {
    const names = playerCaptures.map((b) => gameState.provinces[b.targetProvinceId]?.name ?? b.targetProvinceId).join(', ');
    highlights.push({ icon: '🏆', text: `You captured ${names}!`, color: 'text-green-400' });
  }
  if (playerLosses.length > 0) {
    const names = playerLosses.map((b) => gameState.provinces[b.targetProvinceId]?.name ?? b.targetProvinceId).join(', ');
    highlights.push({ icon: '💀', text: `You lost ${names}!`, color: 'text-red-400' });
  }
  if (aiCaptures.length > 0 && playerLosses.length === 0) {
    const ex = aiCaptures[0];
    const atk = kingdoms[ex.attackerKingdomId]?.name ?? ex.attackerKingdomId;
    const prov = gameState.provinces[ex.targetProvinceId]?.name ?? ex.targetProvinceId;
    const more = aiCaptures.length > 1 ? ` (+${aiCaptures.length - 1} more)` : '';
    highlights.push({ icon: '⚔', text: `${atk} captured ${prov}${more}`, color: 'text-orange-400' });
  }

  // Capital threatened — player capital attacked even if not captured
  const capitalId = Object.values(gameState.provinces).find(
    (p) => p.owner === playerKid && p.isCapital
  )?.id;
  const capitalAttacked = capitalId && summary.battles.some(
    (b) => b.targetProvinceId === capitalId && b.defenderKingdomId === playerKid
  );
  if (capitalAttacked) {
    highlights.push({ icon: '🏯', text: 'Your capital was attacked this season!', color: 'text-red-300' });
  }

  // Elimination
  const eliminationLines = summary.aiActions.filter(
    (l) => l.toLowerCase().includes('eliminated') || l.toLowerCase().includes('conquered')
  );
  eliminationLines.forEach((l) => highlights.push({ icon: '💀', text: l, color: 'text-purple-400' }));

  // Treasury warning (from economy lines)
  const bankruptLine = summary.economyLines.find((l) => l.toLowerCase().includes('bankrupt') || l.toLowerCase().includes('broke'));
  if (bankruptLine) highlights.push({ icon: '💸', text: bankruptLine, color: 'text-yellow-400' });

  // Stability critical
  const player = kingdoms[playerKid];
  if (player.stability <= 20) {
    highlights.push({ icon: '⚠', text: `Stability critically low (${player.stability}/100) — kingdom at risk!`, color: 'text-red-400' });
  }

  // Big battle (largest by attacker power + defender power)
  const allBattles = summary.battles;
  if (allBattles.length > 0 && playerCaptures.length === 0 && playerLosses.length === 0) {
    const biggest = allBattles.reduce((prev, cur) =>
      cur.attackerPower + cur.defenderPower > prev.attackerPower + prev.defenderPower ? cur : prev
    );
    const atk = kingdoms[biggest.attackerKingdomId]?.name ?? biggest.attackerKingdomId;
    const def = kingdoms[biggest.defenderKingdomId]?.name ?? biggest.defenderKingdomId;
    const prov = gameState.provinces[biggest.targetProvinceId]?.name ?? biggest.targetProvinceId;
    highlights.push({
      icon: '⚔',
      text: `Largest battle: ${atk} vs ${def} at ${prov}`,
      color: 'text-gray-300',
    });
  }

  // ── Filtered interesting AI actions ──────────────────────────
  const interestingAI = summary.aiActions.filter((l) =>
    /attack|storm|assault|captur|eliminat|seige|siege|reinforc|moves|NAP|tribute/i.test(l)
  );

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div className="panel rounded-lg w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-gray-800 shrink-0 flex items-start justify-between">
          <div>
            <h2 className="font-bold text-lg gold leading-tight">
              {summary.seasonName} {summary.year} BCE
            </h2>
            <div className="text-xs text-gray-500 mt-0.5">Season {summary.season} Report</div>
          </div>
          <button className="btn-primary px-5 py-2 shrink-0 ml-4 font-medium" onClick={dismissSummary}>
            Next Season ▶
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto scrollbar-thin flex-1 p-4 space-y-3">

          {/* ── Highlights ──────────────────────────────────── */}
          {highlights.length > 0 && (
            <div className="bg-gray-900 rounded-lg border border-gray-700 p-3 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Highlights</div>
              {highlights.map((h, i) => (
                <div key={i} className={`text-sm font-medium flex items-start gap-2 ${h.color}`}>
                  <span className="w-5 shrink-0 text-center">{h.icon}</span>
                  <span>{h.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Battles ──────────────────────────────────────── */}
          <CollapsibleSection
            icon="💥"
            title="Battles"
            count={summary.battles.length}
            defaultOpen={summary.battles.length > 0}
            accentColor="text-red-400"
          >
            {summary.battles.length === 0 ? (
              <div className="text-xs text-gray-600 italic px-1">No battles this season.</div>
            ) : (
              <div className="space-y-2">
                {summary.battles.map((b, i) => (
                  <BattleCard key={i} battle={b} gameState={gameState} playerKid={playerKid} />
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* ── Your Actions ─────────────────────────────────── */}
          {summary.playerActions.length > 0 && (
            <CollapsibleSection
              icon="🎯"
              title="Your Actions"
              count={summary.playerActions.length}
              defaultOpen
              accentColor="text-amber-400"
            >
              <div className="space-y-0.5">
                {summary.playerActions.map((line, i) => (
                  <LogLine key={i} line={line} />
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* ── AI Kingdoms ──────────────────────────────────── */}
          <CollapsibleSection
            icon="🤖"
            title="AI Kingdoms"
            count={interestingAI.length}
            defaultOpen={interestingAI.length > 0}
            accentColor="text-blue-400"
          >
            {interestingAI.length === 0 ? (
              <div className="text-xs text-gray-600 italic px-1">Quiet activity from rival kingdoms.</div>
            ) : (
              <div className="space-y-0.5">
                {interestingAI.map((line, i) => (
                  <LogLine key={i} line={line} />
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* ── Economy ──────────────────────────────────────── */}
          <CollapsibleSection
            icon="💰"
            title="Economy"
            count={summary.economyLines.length}
            defaultOpen={false}
            accentColor="text-green-400"
          >
            {summary.economyLines.length === 0 ? (
              <div className="text-xs text-gray-600 italic px-1">No economic events.</div>
            ) : (
              <div className="space-y-0.5">
                {summary.economyLines.map((line, i) => (
                  <LogLine key={i} line={line} />
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* ── Diplomacy ────────────────────────────────────── */}
          {summary.diplomaticLines.length > 0 && (
            <CollapsibleSection
              icon="✋"
              title="Diplomacy"
              count={summary.diplomaticLines.length}
              defaultOpen={false}
              accentColor="text-purple-400"
            >
              <div className="space-y-0.5">
                {summary.diplomaticLines.map((line, i) => (
                  <LogLine key={i} line={line} />
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* ── Espionage ────────────────────────────────────── */}
          {summary.espionageLines.length > 0 && (
            <CollapsibleSection
              icon="🕵"
              title="Espionage"
              count={summary.espionageLines.length}
              defaultOpen={false}
              accentColor="text-yellow-400"
            >
              <div className="space-y-0.5">
                {summary.espionageLines.map((line, i) => (
                  <LogLine key={i} line={line} />
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* ── Quiet season fallback ────────────────────────── */}
          {highlights.length === 0 &&
            summary.battles.length === 0 &&
            summary.playerActions.length === 0 &&
            summary.economyLines.length === 0 && (
              <div className="text-center text-gray-600 py-6 text-sm italic">A quiet season passes…</div>
            )}

          {/* ── Standing scoreboard ──────────────────────────── */}
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">
              Standings — entering season {summary.season + 1}
            </div>
            <div className="space-y-1">
              {Object.values(gameState.kingdoms)
                .sort((a, b) => {
                  const ac = Object.values(gameState.provinces).filter((p) => p.owner === a.id).length;
                  const bc = Object.values(gameState.provinces).filter((p) => p.owner === b.id).length;
                  return bc - ac;
                })
                .map((k) => {
                  const count = Object.values(gameState.provinces).filter((p) => p.owner === k.id).length;
                  const totalProvs = Object.keys(gameState.provinces).length;
                  const pct = Math.round((count / totalProvs) * 100);
                  return (
                    <div key={k.id} className={`flex items-center gap-2 ${k.isEliminated ? 'opacity-30' : ''}`}>
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: k.color }} />
                      <span className="text-xs w-20 truncate" style={{ color: k.isEliminated ? '#4b5563' : k.color }}>
                        {k.name}
                        {k.isPlayer && <span className="text-amber-400 ml-0.5">★</span>}
                      </span>
                      <div className="flex-1 h-1.5 bg-gray-800 rounded overflow-hidden">
                        <div
                          className="h-full rounded transition-all"
                          style={{ width: `${pct}%`, background: k.isEliminated ? '#374151' : k.color }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-8 text-right shrink-0">
                        {k.isEliminated ? '✕' : `${count}p`}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Battle Card ───────────────────────────────────────────────
function BattleCard({ battle, gameState, playerKid }: {
  battle: BattleResult;
  gameState: any;
  playerKid: string;
}) {
  const isPlayerAttack  = battle.attackerKingdomId === playerKid;
  const isPlayerDefend  = battle.defenderKingdomId === playerKid;
  const isPlayerBattle  = isPlayerAttack || isPlayerDefend;

  const atkName  = gameState.kingdoms[battle.attackerKingdomId]?.name ?? battle.attackerKingdomId;
  const defName  = gameState.kingdoms[battle.defenderKingdomId]?.name ?? battle.defenderKingdomId;
  const atkColor = gameState.kingdoms[battle.attackerKingdomId]?.color ?? '#9ca3af';
  const defColor = gameState.kingdoms[battle.defenderKingdomId]?.color ?? '#9ca3af';
  const provName = gameState.provinces[battle.targetProvinceId]?.name ?? battle.targetProvinceId;

  const outcome = battle.provinceCaptured ? 'Captured' : 'Repelled';
  const outcomeColor = battle.provinceCaptured
    ? (isPlayerAttack ? 'bg-green-900 text-green-300 border-green-700'
       : isPlayerDefend ? 'bg-red-900 text-red-300 border-red-700'
       : 'bg-orange-900 text-orange-300 border-orange-700')
    : (isPlayerDefend ? 'bg-green-900 text-green-300 border-green-700'
       : 'bg-gray-800 text-gray-400 border-gray-600');

  const borderColor = isPlayerAttack && battle.provinceCaptured ? 'border-green-700'
    : isPlayerDefend && battle.provinceCaptured ? 'border-red-700'
    : isPlayerBattle ? 'border-amber-800'
    : 'border-gray-800';

  return (
    <div className={`rounded border ${borderColor} bg-gray-900 p-2.5 text-xs`}>
      {/* Province & outcome */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-gray-200">
          ⚔ {provName}
        </span>
        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${outcomeColor}`}>
          {outcome}
        </span>
      </div>

      {/* Attacker vs Defender */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <div className="text-[10px] text-gray-600 uppercase mb-0.5">Attacker</div>
          <div className="font-medium" style={{ color: atkColor }}>{atkName}</div>
          <div className="text-gray-400">
            Power: <span className="text-gray-200">{Math.round(battle.attackerPower).toLocaleString()}</span>
          </div>
          <div className={`${battle.attackerLosses > 0 ? 'text-red-400' : 'text-gray-500'}`}>
            −{battle.attackerLosses.toLocaleString()} troops
          </div>
        </div>
        <div>
          <div className="text-[10px] text-gray-600 uppercase mb-0.5">Defender</div>
          <div className="font-medium" style={{ color: defColor }}>{defName}</div>
          <div className="text-gray-400">
            Power: <span className="text-gray-200">{Math.round(battle.defenderPower).toLocaleString()}</span>
          </div>
          <div className={`${battle.defenderLosses > 0 ? 'text-red-400' : 'text-gray-500'}`}>
            −{battle.defenderLosses.toLocaleString()} troops
          </div>
        </div>
      </div>

      {/* Narrative */}
      <div className="text-gray-500 text-[11px] border-t border-gray-800 pt-1.5 leading-relaxed">
        {battle.narrative}
      </div>
    </div>
  );
}

// ── Collapsible Section ────────────────────────────────────────
function CollapsibleSection({
  icon, title, count, defaultOpen, accentColor, children,
}: {
  icon: string;
  title: string;
  count: number;
  defaultOpen: boolean;
  accentColor: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-900 hover:bg-gray-800 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className={`text-xs font-semibold uppercase tracking-wider ${accentColor}`}>{title}</span>
          <span className="text-[10px] text-gray-600 bg-gray-800 rounded-full px-1.5 py-0.5 leading-none">
            {count}
          </span>
        </div>
        <span className="text-gray-600 text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-3 py-2 bg-gray-950">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Log Line ───────────────────────────────────────────────────
function LogLine({ line }: { line: string }) {
  return (
    <div className="text-xs text-gray-400 pl-2 border-l border-gray-800 py-0.5">{line}</div>
  );
}
