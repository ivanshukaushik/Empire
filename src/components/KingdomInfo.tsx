import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { SEASON_NAMES } from '../engine/turnEngine';
import { provinceIncome, provinceFood } from '../engine/economy';
import { StatTooltip } from './Tooltip';
import { BREACH_CONSEQUENCES } from '../engine/diplomacy';
import type { Ruler } from '../engine/types';

type Tab = 'overview' | 'military' | 'diplomacy';

export default function KingdomInfo() {
  const gameState          = useGameStore((s) => s.gameState!);
  const saveGame           = useGameStore((s) => s.saveGame);
  const resetGame          = useGameStore((s) => s.resetGame);
  const acceptProposal     = useGameStore((s) => s.acceptProposal);
  const declineProposal    = useGameStore((s) => s.declineProposal);
  const breachTreatyWith   = useGameStore((s) => s.breachTreatyWith);
  const [tab, setTab]      = useState<Tab>('overview');
  const [confirmBreach, setConfirmBreach] = useState<string | null>(null);

  const kid        = gameState.playerKingdomId;
  const player     = gameState.kingdoms[kid];
  const seasonName = SEASON_NAMES[gameState.season % 4];

  const ownedProvs = Object.values(gameState.provinces).filter((p) => p.owner === kid);
  const totalProvs = Object.keys(gameState.provinces).length;
  const winTarget  = Math.ceil(totalProvs * 0.6);
  const progress   = Math.round((ownedProvs.length / totalProvs) * 100);

  const myArmies    = Object.values(gameState.armies).filter((a) => a.kingdomId === kid);
  const totalTroops = myArmies.reduce((s, a) => s + a.size, 0);

  const forecastGold = ownedProvs.reduce((s, p) => s + provinceIncome(p, player), 0);
  const forecastFood = ownedProvs.reduce((s, p) => s + provinceFood(p, player, gameState.season), 0);
  const upkeepGold   = myArmies.reduce((s, a) => s + (a.size / 1000) * 0.4 * player.armyCostModifier, 0);
  const upkeepFood   = myArmies.reduce((s, a) => s + (a.size / 1000) * 0.8, 0);
  const netGold      = forecastGold - upkeepGold - (player.activeReform === 'propaganda' ? 5 : 0);
  const netFood      = forecastFood - upkeepFood;

  const inboxCount = gameState.diplomaticInbox.filter((p) => p.status === 'pending').length;

  function handleBreach(targetKid: string) {
    breachTreatyWith(targetKid);
    setConfirmBreach(null);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden text-xs">
      {/* Kingdom header */}
      <div className="px-3 pt-3 pb-2 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: player.color }} />
          <span className="font-bold text-sm leading-tight" style={{ color: player.color }}>
            {player.name}
          </span>
        </div>
        <div className="text-gray-600">{player.archetype}</div>
        {player.ruler && (
          <div className="text-gray-500 mt-0.5 text-[10px]">
            👑 {player.ruler.name}, {player.ruler.age}yr
            · {player.ruler.traits.slice(0, 2).join(', ')}
          </div>
        )}
        <div className="text-gray-600 mt-0.5">{seasonName} · {gameState.year} BCE</div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800 shrink-0">
        {(['overview', 'military', 'diplomacy'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`flex-1 py-1.5 text-[10px] uppercase tracking-wider transition-colors relative ${
              tab === t
                ? 'text-amber-400 border-b border-amber-500'
                : 'text-gray-600 hover:text-gray-400'
            }`}
            onClick={() => setTab(t)}
          >
            {t}
            {t === 'diplomacy' && inboxCount > 0 && (
              <span className="absolute -top-0.5 right-1 bg-purple-600 text-white text-[8px] rounded-full px-1 leading-tight">
                {inboxCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
        {tab === 'overview' && (
          <OverviewTab
            player={player}
            gameState={gameState}
            ownedProvs={ownedProvs}
            totalProvs={totalProvs}
            winTarget={winTarget}
            progress={progress}
            netGold={netGold}
            netFood={netFood}
            forecastGold={forecastGold}
            forecastFood={forecastFood}
            upkeepGold={upkeepGold}
            upkeepFood={upkeepFood}
          />
        )}
        {tab === 'military' && (
          <MilitaryTab armies={myArmies} totalTroops={totalTroops} gameState={gameState} />
        )}
        {tab === 'diplomacy' && (
          <DiplomacyTab
            gameState={gameState}
            playerKid={kid}
            acceptProposal={acceptProposal}
            declineProposal={declineProposal}
            onBreachRequest={(targetKid: string) => setConfirmBreach(targetKid)}
          />
        )}
      </div>

      {/* Footer controls */}
      <div className="p-2 border-t border-gray-800 space-y-1 shrink-0">
        <button className="btn-ghost w-full text-[10px] py-1" onClick={saveGame}>💾 Save</button>
        <button className="btn-ghost w-full text-[10px] py-1 text-red-500" onClick={resetGame}>✕ Abandon</button>
      </div>

      {/* Breach confirmation modal */}
      {confirmBreach && (() => {
        const targetK = gameState.kingdoms[confirmBreach];
        const treaty = gameState.relations[kid]?.[confirmBreach]?.treaty;
        const c = BREACH_CONSEQUENCES;
        return (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-950 border border-red-800 rounded-xl p-5 max-w-xs w-full shadow-2xl">
              <h3 className="text-sm font-bold text-red-400 mb-2">⚠ Breach Treaty?</h3>
              <p className="text-xs text-gray-300 mb-3">
                Breaking the <strong>{treaty?.type === 'nap' ? 'Non-Aggression Pact' : 'Tribute Treaty'}</strong> with{' '}
                <span style={{ color: targetK?.color }}>{targetK?.name}</span>:
              </p>
              <div className="space-y-1 text-xs text-red-400 mb-4">
                <div>Relations with {targetK?.name}: <strong>−{Math.abs(c.relationsWithTarget)}</strong></div>
                <div>Reputation (global): <strong>−{Math.abs(c.reputationChange)}</strong></div>
                <div>Stability: <strong>−{Math.abs(c.stabilityChange)}</strong></div>
                <div>All other kingdoms: <strong>−{Math.abs(c.coalitionPressure)} relations</strong></div>
              </div>
              <div className="flex gap-2">
                <button
                  className="flex-1 text-xs py-1.5 rounded bg-red-900/50 border border-red-700 text-red-300 hover:bg-red-900"
                  onClick={() => handleBreach(confirmBreach)}
                >
                  ⚔ Breach Treaty
                </button>
                <button
                  className="flex-1 text-xs py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:bg-gray-700"
                  onClick={() => setConfirmBreach(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────
function OverviewTab({ player, gameState, ownedProvs, totalProvs, winTarget, progress, netGold, netFood, forecastGold, forecastFood, upkeepGold, upkeepFood }: any) {
  const orders    = gameState.ordersRemaining as number;
  const maxOrders = gameState.maxOrders as number;

  return (
    <>
      {/* Orders indicator */}
      <div className="bg-gray-900 rounded-lg p-2.5 border border-gray-800">
        <div className="flex items-center justify-between mb-1.5">
          <StatTooltip tip="Orders are your campaign capacity. Move, Attack, Espionage, Diplomacy, Reform, and Levy each cost 1 Order. Build and Recruit are free domestic actions.">
            <span className="text-gray-400 font-semibold cursor-help">Orders this season</span>
          </StatTooltip>
          <span className={`font-bold text-sm ${orders > 0 ? 'text-amber-400' : 'text-gray-600'}`}>
            {orders}/{maxOrders}
          </span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: maxOrders }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-2 rounded ${i < orders ? 'bg-amber-500' : 'bg-gray-800'}`}
            />
          ))}
        </div>
        {orders === 0 && (
          <div className="text-gray-600 text-[10px] mt-1 italic">End season (S) to refresh orders</div>
        )}
      </div>

      {/* Ruler card */}
      {player.ruler && <RulerCard ruler={player.ruler} />}

      {/* Resources */}
      <Section title="Resources">
        <ResourceRow
          icon="💰" label="Treasury" value={Math.floor(player.treasury)}
          color={player.treasury < 20 ? 'text-red-400' : 'text-yellow-400'}
          tip="Gold. Army upkeep deducted each season. Negative → stability −5/season."
        />
        <ResourceRow
          icon="🌾" label="Food" value={Math.floor(player.food)}
          color={player.food < 20 ? 'text-red-400' : 'text-green-400'}
          tip="Feeds armies. Shortage → morale drops and troops die."
        />
        <ResourceRow
          icon="⚔" label="Manpower" value={Math.floor(player.manpower)}
          color="text-blue-400"
          tip="Pool for recruiting. Auto-replenishes from provinces. Levy adds instantly."
        />
        <ResourceRow
          icon="⚖" label="Stability" value={player.stability}
          color={player.stability > 60 ? 'text-green-400' : player.stability > 30 ? 'text-yellow-400' : 'text-red-400'}
          tip="Kingdom health (0–100). Hits 0 → you lose."
        />
        <ResourceRow
          icon="🎭" label="Reputation" value={player.reputation >= 0 ? `+${player.reputation}` : String(player.reputation)}
          color={player.reputation >= 0 ? 'text-gray-300' : 'text-red-400'}
          tip="Diplomatic standing. Breaking treaties reduces it; honoring them increases it."
        />
        {(player.treatyBreachCount ?? 0) > 0 && (
          <div className="text-red-500 text-[10px] italic">
            ⚠ {player.treatyBreachCount} treaty breach{(player.treatyBreachCount ?? 0) > 1 ? 'es' : ''} on record
          </div>
        )}
      </Section>

      {/* Next season forecast */}
      <Section title="Next Season Forecast">
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
          <span className="text-gray-500">Income</span>
          <span className="text-yellow-400">+{Math.floor(forecastGold)} gold</span>
          <span className="text-gray-500">Army upkeep</span>
          <span className="text-red-400">−{Math.floor(upkeepGold)} gold</span>
          <span className="text-gray-500 font-medium">Net gold</span>
          <span className={netGold >= 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
            {netGold >= 0 ? '+' : ''}{Math.floor(netGold)}
          </span>
          <span className="text-gray-500">Food prod.</span>
          <span className="text-green-400">+{Math.floor(forecastFood)}</span>
          <span className="text-gray-500">Food upkeep</span>
          <span className="text-red-400">−{Math.floor(upkeepFood)}</span>
          <span className="text-gray-500 font-medium">Net food</span>
          <span className={netFood >= 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
            {netFood >= 0 ? '+' : ''}{Math.floor(netFood)}
          </span>
        </div>
      </Section>

      {/* Territory */}
      <Section title="Territory">
        <div className="flex justify-between mb-1">
          <span className="text-gray-400">{ownedProvs.length}/{totalProvs} provinces</span>
          <span className="text-gray-600">Win at {winTarget}</span>
        </div>
        <div className="h-2 bg-gray-800 rounded overflow-hidden mb-1">
          <div
            className="h-full rounded transition-all"
            style={{ width: `${progress}%`, background: 'var(--color-gold)' }}
          />
        </div>
        <div className="text-gray-600">{progress}% — need 60%</div>
      </Section>

      {player.activeReform && (
        <Section title="Active Reform">
          <span className="text-amber-300 capitalize">{player.activeReform.replace(/_/g, ' ')}</span>
        </Section>
      )}

      <Section title="Kingdom Traits">
        <div className="text-green-500">✓ {player.bonusDescription}</div>
        <div className="text-red-500 mt-0.5">✗ {player.weaknessDescription}</div>
      </Section>
    </>
  );
}

// ── Ruler Card ────────────────────────────────────────────────
function RulerCard({ ruler }: { ruler: Ruler }) {
  const statBar = (val: number, label: string, color: string) => (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className="text-gray-600 w-9">{label}</span>
      <div className="flex-1 h-1 bg-gray-800 rounded overflow-hidden">
        <div className="h-full rounded" style={{ width: `${val * 10}%`, background: color }} />
      </div>
      <span className="text-gray-500 w-3 text-right">{val}</span>
    </div>
  );

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-base">👑</span>
        <div>
          <div className="font-semibold text-gray-100 text-xs">{ruler.name}</div>
          <div className="text-gray-600 text-[10px]">Age {ruler.age} · {ruler.ambition.replace(/_/g, ' ')} · {ruler.traits.join(', ')}</div>
        </div>
      </div>
      <div className="space-y-0.5">
        {statBar(ruler.stats.military, 'Mil', '#ef4444')}
        {statBar(ruler.stats.diplomacy, 'Dip', '#8b5cf6')}
        {statBar(ruler.stats.administration, 'Adm', '#f59e0b')}
      </div>
    </div>
  );
}

// ── Military Tab ──────────────────────────────────────────────
function MilitaryTab({ armies, totalTroops, gameState }: any) {
  const armyCampaignUsed = gameState.armyCampaignUsed ?? {};
  const queueAction = useGameStore((s) => s.queueAction);
  const kid = gameState.playerKingdomId;

  return (
    <>
      <Section title={`Armies (${armies.length}) — ${totalTroops.toLocaleString()} total`}>
        {armies.length === 0 ? (
          <div className="text-gray-600 italic">No armies. Recruit troops at a barracks or capital.</div>
        ) : (
          armies.map((army: any) => {
            const prov    = gameState.provinces[army.provinceId];
            const acted   = !!armyCampaignUsed[army.id];
            const moraleC = army.morale > 60 ? '#22c55e' : army.morale > 30 ? '#eab308' : '#ef4444';
            const maxSize = army.maxSize ?? army.size;
            const atMax   = army.size >= maxSize;
            return (
              <div key={army.id} className="border border-gray-800 rounded p-2 mb-1.5">
                <div className="flex justify-between items-start">
                  <span className="font-medium text-gray-200 truncate mr-1">{army.name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      className={`text-[9px] px-1 py-0.5 rounded font-bold uppercase ${
                        acted ? 'bg-gray-800 text-gray-500' : 'bg-green-900/50 text-green-400'
                      }`}
                    >
                      {acted ? 'Acted' : 'Ready'}
                    </span>
                    <span className="text-amber-400">{army.size.toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex gap-3 mt-0.5 text-gray-500">
                  <span>Morale {army.morale}%</span>
                  <span className="truncate">{prov?.name ?? '?'}</span>
                </div>
                {/* Morale bar */}
                <div className="h-1 bg-gray-800 rounded mt-1.5 overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${army.morale}%`, background: moraleC }} />
                </div>
                {/* Replenishment hint */}
                {!atMax && prov?.owner === kid && (
                  <div className="text-[9px] text-blue-500 mt-0.5 italic">
                    ↑ Replenishing in {prov.name}
                  </div>
                )}
                {/* Split button */}
                {army.size >= 2000 && !acted && (
                  <button
                    className="mt-1.5 w-full text-[9px] py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:bg-gray-700"
                    onClick={() => queueAction({ type: 'split_army', apCost: 0, armyId: army.id, splitFraction: 0.5 })}
                  >
                    ✂ Split 50/50
                  </button>
                )}
              </div>
            );
          })
        )}
      </Section>
    </>
  );
}

// ── Diplomacy Tab ─────────────────────────────────────────────
function DiplomacyTab({ gameState, playerKid, acceptProposal, declineProposal, onBreachRequest }: any) {
  const inbox = (gameState.diplomaticInbox ?? []).filter((p: any) => p.status === 'pending') as any[];

  const others = Object.values(gameState.kingdoms as Record<string, any>)
    .filter((k: any) => k.id !== playerKid && !k.isEliminated)
    .sort((a: any, b: any) => {
      const ra = gameState.relations[playerKid]?.[a.id]?.score ?? 0;
      const rb = gameState.relations[playerKid]?.[b.id]?.score ?? 0;
      return rb - ra;
    });

  return (
    <>
      {/* Diplomatic Inbox */}
      {inbox.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] text-purple-400 uppercase tracking-wider font-semibold flex items-center gap-1">
            <span>✉ Diplomatic Inbox</span>
            <span className="bg-purple-700 text-white rounded-full px-1 text-[8px]">{inbox.length}</span>
          </div>
          <div className="text-[9px] text-gray-600 italic">Y = accept first · N = decline first</div>
          {inbox.map((proposal: any) => {
            const fromK = gameState.kingdoms[proposal.fromKingdomId];
            const typeLabel =
              proposal.type === 'nap_offer' ? 'NAP Offer' :
              proposal.type === 'tribute_demand' ? 'Tribute Offer' :
              'Alliance Pact';
            const expiresIn = proposal.expiresAt - gameState.season;
            return (
              <div key={proposal.id} className="bg-gray-900 border border-purple-900/50 rounded-lg p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: fromK?.color ?? '#888' }} />
                    <span className="font-medium" style={{ color: fromK?.color ?? '#888' }}>
                      {fromK?.name ?? proposal.fromKingdomId}
                    </span>
                    <span className="text-gray-600">·</span>
                    <span className="text-purple-400 text-[10px]">{typeLabel}</span>
                  </div>
                  <span className="text-gray-700 text-[9px]">expires S{proposal.expiresAt}</span>
                </div>
                {fromK?.ruler && (
                  <div className="text-[9px] text-gray-600">
                    👑 {fromK.ruler.name} · {fromK.ruler.traits.slice(0, 2).join(', ')}
                  </div>
                )}
                <p className="text-gray-400 text-[11px] leading-relaxed">{proposal.terms}</p>
                <div className="flex gap-1.5">
                  <button
                    className="flex-1 text-[10px] py-1 px-2 rounded bg-green-900/40 border border-green-700 text-green-400 hover:bg-green-900/70 transition-colors"
                    onClick={() => acceptProposal(proposal.id)}
                    title="Accept (Y)"
                  >
                    ✓ Accept [Y]
                  </button>
                  <button
                    className="flex-1 text-[10px] py-1 px-2 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:bg-gray-700 transition-colors"
                    onClick={() => declineProposal(proposal.id)}
                    title="Decline (N)"
                  >
                    ✕ Decline [N]
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Relations list */}
      <Section title="Relations">
        {others.map((k: any) => {
          const rel   = gameState.relations[playerKid]?.[k.id];
          const score = rel?.score ?? 0;
          const treaty  = rel?.treaty;
          const atWar   = rel?.atWarWith;
          const hasActiveTreaty = treaty && treaty.status === 'active';
          return (
            <div key={k.id} className="py-1 border-b border-gray-800 last:border-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${k.isEliminated ? 'opacity-30' : ''}`} style={{ background: k.color }} />
                  <span className={`${k.isEliminated ? 'line-through text-gray-700' : 'text-gray-300'} truncate max-w-[80px]`}>
                    {k.name}
                  </span>
                  {k.ruler && (
                    <span className="text-gray-700 text-[9px] truncate" title={`${k.ruler.name} (${k.ruler.traits.join(', ')})`}>
                      {k.ruler.name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {atWar && <span className="text-red-400 text-[10px]">⚔</span>}
                  {hasActiveTreaty && treaty.type === 'nap' && (
                    <span className="text-green-400 text-[10px]" title={`NAP expires season ${treaty.expiresAt}`}>✋</span>
                  )}
                  {hasActiveTreaty && treaty.type === 'tribute' && (
                    <span className="text-blue-400 text-[10px]" title={`Tribute ${treaty.tributeAmount}g/season`}>💸</span>
                  )}
                  {(gameState.diplomaticInbox ?? []).some((p: any) => p.fromKingdomId === k.id && p.status === 'pending') && (
                    <span className="text-purple-400 text-[10px]" title="Pending proposal in inbox">✉</span>
                  )}
                  <span className={`font-medium text-[11px] w-7 text-right ${score > 20 ? 'text-green-400' : score < -20 ? 'text-red-400' : 'text-gray-400'}`}>
                    {score > 0 ? '+' : ''}{score}
                  </span>
                </div>
              </div>
              {/* Breach button for active treaties */}
              {hasActiveTreaty && (
                <button
                  className="mt-1 w-full text-[9px] py-0.5 rounded bg-red-950/30 border border-red-900/50 text-red-500 hover:bg-red-950/60 transition-colors"
                  onClick={() => onBreachRequest(k.id)}
                >
                  ⚔ Breach {treaty.type === 'nap' ? 'NAP' : 'Tribute'}
                </button>
              )}
            </div>
          );
        })}
      </Section>
    </>
  );
}

// ── Shared helpers ────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function ResourceRow({ icon, label, value, color, tip }: {
  icon: string; label: string; value: number | string; color: string; tip: string;
}) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <StatTooltip tip={tip}>
        <span className="text-gray-500 cursor-help">{icon} {label}</span>
      </StatTooltip>
      <span className={`font-medium ${color}`}>{value}</span>
    </div>
  );
}
