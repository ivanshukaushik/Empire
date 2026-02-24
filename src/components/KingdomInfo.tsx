import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { SEASON_NAMES } from '../engine/turnEngine';
import { provinceIncome, provinceFood } from '../engine/economy';
import { StatTooltip } from './Tooltip';

type Tab = 'overview' | 'military' | 'diplomacy';

export default function KingdomInfo() {
  const gameState       = useGameStore((s) => s.gameState!);
  const saveGame        = useGameStore((s) => s.saveGame);
  const resetGame       = useGameStore((s) => s.resetGame);
  const acceptProposal  = useGameStore((s) => s.acceptProposal);
  const declineProposal = useGameStore((s) => s.declineProposal);
  const [tab, setTab]   = useState<Tab>('overview');

  const kid        = gameState.playerKingdomId;
  const player     = gameState.kingdoms[kid];
  const seasonName = SEASON_NAMES[gameState.season % 4];

  const ownedProvs = Object.values(gameState.provinces).filter((p) => p.owner === kid);
  const totalProvs = Object.keys(gameState.provinces).length;
  const winTarget  = Math.ceil(totalProvs * 0.6);
  const progress   = Math.round((ownedProvs.length / totalProvs) * 100);

  const myArmies    = Object.values(gameState.armies).filter((a) => a.kingdomId === kid);
  const totalTroops = myArmies.reduce((s, a) => s + a.size, 0);

  // Next season forecast
  const forecastGold = ownedProvs.reduce((s, p) => s + provinceIncome(p, player), 0);
  const forecastFood = ownedProvs.reduce((s, p) => s + provinceFood(p, player, gameState.season), 0);
  const upkeepGold   = myArmies.reduce((s, a) => s + (a.size / 1000) * 0.4 * player.armyCostModifier, 0);
  const upkeepFood   = myArmies.reduce((s, a) => s + (a.size / 1000) * 0.8, 0);
  const netGold      = forecastGold - upkeepGold - (player.activeReform === 'propaganda' ? 5 : 0);
  const netFood      = forecastFood - upkeepFood;

  const inboxCount = gameState.diplomaticInbox.length;

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
          />
        )}
      </div>

      {/* Footer controls */}
      <div className="p-2 border-t border-gray-800 space-y-1 shrink-0">
        <button className="btn-ghost w-full text-[10px] py-1" onClick={saveGame}>💾 Save</button>
        <button className="btn-ghost w-full text-[10px] py-1 text-red-500" onClick={resetGame}>✕ Abandon</button>
      </div>
    </div>
  );
}

// ── Overview Tab ─────────────────────────────────────────────
function OverviewTab({ player, gameState, ownedProvs, totalProvs, winTarget, progress, netGold, netFood, forecastGold, forecastFood, upkeepGold, upkeepFood }: any) {
  const orders    = gameState.ordersRemaining as number;
  const maxOrders = gameState.maxOrders as number;

  return (
    <>
      {/* Orders indicator — most actionable info */}
      <div className="bg-gray-900 rounded-lg p-2.5 border border-gray-800">
        <div className="flex items-center justify-between mb-1.5">
          <StatTooltip tip="Orders are your campaign capacity. Each Move, Attack, Espionage, Diplomacy, and Reform action costs 1 Order. Build and Recruit are free domestic actions.">
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
          <div className="text-gray-600 text-[10px] mt-1 italic">End season to refresh orders</div>
        )}
      </div>

      {/* Resources */}
      <Section title="Resources">
        <ResourceRow
          icon="💰" label="Treasury" value={Math.floor(player.treasury)}
          color={player.treasury < 20 ? 'text-red-400' : 'text-yellow-400'}
          tip="Gold. Army upkeep deducted each season. Negative treasury → stability −5/season."
        />
        <ResourceRow
          icon="🌾" label="Food" value={Math.floor(player.food)}
          color={player.food < 20 ? 'text-red-400' : 'text-green-400'}
          tip="Feeds your armies. Shortage → morale drops and troops die in winter."
        />
        <ResourceRow
          icon="⚔" label="Manpower" value={Math.floor(player.manpower)}
          color="text-blue-400"
          tip="Manpower pool for recruiting. Replenishes from province barracks each season."
        />
        <ResourceRow
          icon="⚖" label="Stability" value={player.stability}
          color={player.stability > 60 ? 'text-green-400' : player.stability > 30 ? 'text-yellow-400' : 'text-red-400'}
          tip="Kingdom health (0–100). Hits 0 → you lose. Drops if bankrupt or capital attacked."
        />
        <ResourceRow
          icon="🎭" label="Reputation" value={player.reputation >= 0 ? `+${player.reputation}` : String(player.reputation)}
          color={player.reputation >= 0 ? 'text-gray-300' : 'text-red-400'}
          tip="Diplomatic standing. Breaking NAPs reduces it; honoring treaties increases it."
        />
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

      {/* Active reform */}
      {player.activeReform && (
        <Section title="Active Reform">
          <span className="text-amber-300 capitalize">{player.activeReform.replace(/_/g, ' ')}</span>
        </Section>
      )}

      {/* Traits */}
      <Section title="Kingdom Traits">
        <div className="text-green-500">✓ {player.bonusDescription}</div>
        <div className="text-red-500 mt-0.5">✗ {player.weaknessDescription}</div>
      </Section>
    </>
  );
}

// ── Military Tab ─────────────────────────────────────────────
function MilitaryTab({ armies, totalTroops, gameState }: any) {
  const armyCampaignUsed = gameState.armyCampaignUsed ?? {};

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
            return (
              <div key={army.id} className="border border-gray-800 rounded p-2 mb-1.5">
                <div className="flex justify-between items-start">
                  <span className="font-medium text-gray-200 truncate mr-1">{army.name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      className={`text-[9px] px-1 py-0.5 rounded font-bold uppercase ${
                        acted ? 'bg-gray-800 text-gray-500' : 'bg-green-900/50 text-green-400'
                      }`}
                      title={acted ? 'Already acted this season' : 'Ready to act (costs 1 Order)'}
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
              </div>
            );
          })
        )}
      </Section>
    </>
  );
}

// ── Diplomacy Tab ─────────────────────────────────────────────
function DiplomacyTab({ gameState, playerKid, acceptProposal, declineProposal }: any) {
  const inbox = (gameState.diplomaticInbox ?? []) as any[];

  const others = Object.values(gameState.kingdoms as Record<string, any>)
    .filter((k: any) => k.id !== playerKid)
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
          {inbox.map((proposal: any) => {
            const fromK = gameState.kingdoms[proposal.fromKingdomId];
            const typeLabel =
              proposal.type === 'nap_offer' ? 'NAP Offer' :
              proposal.type === 'tribute_demand' ? 'Tribute Offer' :
              'Alliance Pact';
            return (
              <div key={proposal.id} className="bg-gray-900 border border-purple-900/50 rounded-lg p-2.5 space-y-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: fromK?.color ?? '#888' }} />
                  <span className="font-medium" style={{ color: fromK?.color ?? '#888' }}>
                    {fromK?.name ?? proposal.fromKingdomId}
                  </span>
                  <span className="text-gray-600">·</span>
                  <span className="text-purple-400 text-[10px]">{typeLabel}</span>
                </div>
                <p className="text-gray-400 text-[11px] leading-relaxed">{proposal.terms}</p>
                <div className="flex gap-1.5">
                  <button
                    className="flex-1 text-[10px] py-1 px-2 rounded bg-green-900/40 border border-green-700 text-green-400 hover:bg-green-900/70 transition-colors"
                    onClick={() => acceptProposal(proposal.id)}
                  >
                    ✓ Accept
                  </button>
                  <button
                    className="flex-1 text-[10px] py-1 px-2 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:bg-gray-700 transition-colors"
                    onClick={() => declineProposal(proposal.id)}
                  >
                    ✕ Decline
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
          return (
            <div key={k.id} className="flex items-center justify-between py-1 border-b border-gray-800 last:border-0">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${k.isEliminated ? 'opacity-30' : ''}`} style={{ background: k.color }} />
                <span className={`${k.isEliminated ? 'line-through text-gray-700' : 'text-gray-300'} truncate max-w-[80px]`}>
                  {k.name}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {atWar && <span className="text-red-400 text-[10px]">⚔</span>}
                {treaty?.type === 'nap' && (
                  <span className="text-green-400 text-[10px]" title={`NAP expires season ${treaty.expiresAt}`}>✋</span>
                )}
                {treaty?.type === 'tribute' && (
                  <span className="text-blue-400 text-[10px]" title={`Tribute ${treaty.tributeAmount}g/season`}>💸</span>
                )}
                {/* Check if they have a pending inbox proposal */}
                {(gameState.diplomaticInbox ?? []).some((p: any) => p.fromKingdomId === k.id) && (
                  <span className="text-purple-400 text-[10px]" title="Has proposal in inbox">✉</span>
                )}
                <span className={`font-medium text-[11px] w-7 text-right ${score > 20 ? 'text-green-400' : score < -20 ? 'text-red-400' : 'text-gray-400'}`}>
                  {score > 0 ? '+' : ''}{score}
                </span>
              </div>
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
