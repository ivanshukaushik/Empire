import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { SEASON_NAMES } from '../engine/turnEngine';
import { provinceIncome, provinceFood, provinceManpower } from '../engine/economy';
import { StatTooltip } from './Tooltip';

type Tab = 'overview' | 'military' | 'diplomacy';

export default function KingdomInfo() {
  const gameState  = useGameStore((s) => s.gameState!);
  const saveGame   = useGameStore((s) => s.saveGame);
  const resetGame  = useGameStore((s) => s.resetGame);
  const [tab, setTab] = useState<Tab>('overview');

  const kid         = gameState.playerKingdomId;
  const player      = gameState.kingdoms[kid];
  const seasonName  = SEASON_NAMES[gameState.season % 4];

  const ownedProvs  = Object.values(gameState.provinces).filter((p) => p.owner === kid);
  const totalProvs  = Object.keys(gameState.provinces).length;
  const winTarget   = Math.ceil(totalProvs * 0.6);
  const progress    = Math.round((ownedProvs.length / totalProvs) * 100);

  const myArmies    = Object.values(gameState.armies).filter((a) => a.kingdomId === kid);
  const totalTroops = myArmies.reduce((s, a) => s + a.size, 0);

  // Next season forecast
  const forecastGold = ownedProvs.reduce((s, p) => s + provinceIncome(p, player), 0);
  const forecastFood = ownedProvs.reduce((s, p) => s + provinceFood(p, player, gameState.season), 0);
  const upkeepGold   = myArmies.reduce((s, a) => s + (a.size / 1000) * 0.4 * player.armyCostModifier, 0);
  const upkeepFood   = myArmies.reduce((s, a) => s + (a.size / 1000) * 0.8, 0);
  const netGold      = forecastGold - upkeepGold - (player.activeReform === 'propaganda' ? 5 : 0);
  const netFood      = forecastFood - upkeepFood;

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
        <div className="text-gray-600 mt-0.5">{seasonName} · {gameState.year} BCE · S{gameState.season}</div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800 shrink-0">
        {(['overview', 'military', 'diplomacy'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`flex-1 py-1.5 text-[10px] uppercase tracking-wider transition-colors ${
              tab === t
                ? 'text-amber-400 border-b border-amber-500'
                : 'text-gray-600 hover:text-gray-400'
            }`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
        {tab === 'overview' && (
          <OverviewTab
            player={player} ownedProvs={ownedProvs} totalProvs={totalProvs}
            winTarget={winTarget} progress={progress}
            netGold={netGold} netFood={netFood}
            forecastGold={forecastGold} forecastFood={forecastFood}
            upkeepGold={upkeepGold} upkeepFood={upkeepFood}
          />
        )}
        {tab === 'military' && (
          <MilitaryTab armies={myArmies} totalTroops={totalTroops} gameState={gameState} />
        )}
        {tab === 'diplomacy' && (
          <DiplomacyTab gameState={gameState} playerKid={kid} />
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
function OverviewTab({ player, ownedProvs, totalProvs, winTarget, progress, netGold, netFood, forecastGold, forecastFood, upkeepGold, upkeepFood }: any) {
  return (
    <>
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
          tip="Feeds your armies each season. Food shortage → morale drops and troops die."
        />
        <ResourceRow
          icon="⚔" label="Manpower" value={Math.floor(player.manpower)}
          color="text-blue-400"
          tip="Manpower pool for recruiting. Replenishes from provinces each season."
        />
        <ResourceRow
          icon="⚖" label="Stability" value={player.stability}
          color={player.stability > 60 ? 'text-green-400' : player.stability > 30 ? 'text-yellow-400' : 'text-red-400'}
          tip="Kingdom health (0–100). Hits 0 → you lose. Drops if bankrupt or capital attacked."
        />
        <ResourceRow
          icon="🎭" label="Reputation" value={player.reputation >= 0 ? `+${player.reputation}` : player.reputation}
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
          <span className="text-amber-300 capitalize">{player.activeReform.replace('_', ' ')}</span>
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
  return (
    <>
      <Section title={`Armies (${armies.length}) — ${totalTroops.toLocaleString()} total`}>
        {armies.length === 0 ? (
          <div className="text-gray-600 italic">No armies. Recruit troops at a province with barracks.</div>
        ) : (
          armies.map((army: any) => {
            const prov = gameState.provinces[army.provinceId];
            return (
              <div key={army.id} className="border border-gray-800 rounded p-2 mb-1.5">
                <div className="flex justify-between items-start">
                  <span className="font-medium text-gray-200">{army.name}</span>
                  <span className="text-amber-400">{army.size.toLocaleString()}</span>
                </div>
                <div className="flex gap-3 mt-0.5 text-gray-500">
                  <span>Morale {army.morale}%</span>
                  <span className="truncate">{prov?.name ?? '?'}</span>
                </div>
                {/* Morale bar */}
                <div className="h-1 bg-gray-800 rounded mt-1.5 overflow-hidden">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${army.morale}%`,
                      background: army.morale > 60 ? '#22c55e' : army.morale > 30 ? '#eab308' : '#ef4444',
                    }}
                  />
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
function DiplomacyTab({ gameState, playerKid }: any) {
  const others = Object.values(gameState.kingdoms as Record<string, any>)
    .filter((k: any) => k.id !== playerKid)
    .sort((a: any, b: any) => {
      const ra = gameState.relations[playerKid]?.[a.id]?.score ?? 0;
      const rb = gameState.relations[playerKid]?.[b.id]?.score ?? 0;
      return rb - ra;
    });

  return (
    <Section title="Relations">
      {others.map((k: any) => {
        const rel = gameState.relations[playerKid]?.[k.id];
        const score = rel?.score ?? 0;
        const treaty = rel?.treaty;
        const atWar = rel?.atWarWith;
        return (
          <div key={k.id} className="flex items-center justify-between py-1 border-b border-gray-800 last:border-0">
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${k.isEliminated ? 'opacity-30' : ''}`} style={{ background: k.color }} />
              <span className={`${k.isEliminated ? 'line-through text-gray-700' : 'text-gray-300'}`}>
                {k.name}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {atWar && <span className="text-red-400 text-xs">⚔ War</span>}
              {treaty?.type === 'nap' && (
                <span className="text-green-400 text-xs" title={`Expires season ${treaty.expiresAt}`}>✋ NAP</span>
              )}
              {treaty?.type === 'tribute' && (
                <span className="text-blue-400 text-xs" title={`${treaty.tributeAmount}g/season`}>💸</span>
              )}
              <span className={`font-medium ${score > 20 ? 'text-green-400' : score < -20 ? 'text-red-400' : 'text-gray-400'}`}>
                {score > 0 ? '+' : ''}{score}
              </span>
            </div>
          </div>
        );
      })}
    </Section>
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
