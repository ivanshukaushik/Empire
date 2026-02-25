import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { Province } from '../engine/types';
import { StatTooltip } from './Tooltip';

const LEVY_AMOUNT = 20;
const LEVY_GOLD_COST = 5;
const LEVY_STABILITY_HIT = 3;

export default function ProvinceInfo() {
  const gameState          = useGameStore((s) => s.gameState!);
  const setSelected        = useGameStore((s) => s.setSelectedProvince);
  const setAction          = useGameStore((s) => s.setActionBeingPlanned);
  const setPendingMoveArmy = useGameStore((s) => s.setPendingMoveArmy);
  const queueAction        = useGameStore((s) => s.queueAction);
  const actionFeedback     = useGameStore((s) => s.actionFeedback);
  const clearFeedback      = useGameStore((s) => s.clearFeedback);

  const pid = gameState.selectedProvinceId;

  if (!pid) {
    return (
      <div className="flex flex-col h-full">
        <EmptyState />
        {actionFeedback && (
          <div className="m-3 panel rounded p-2 text-xs text-amber-300">
            {actionFeedback}
            <button className="ml-2 text-gray-600 hover:text-gray-400" onClick={clearFeedback}>✕</button>
          </div>
        )}
      </div>
    );
  }

  const province   = gameState.provinces[pid];
  if (!province) return null;

  const fog        = gameState.fogOfWar[pid];
  const isVisible  = fog?.visible || fog?.scouted;
  const isPartial  = fog?.partial;
  const isOwned    = province.owner === gameState.playerKingdomId;
  const ownerK     = gameState.kingdoms[province.owner];
  const playerK    = gameState.kingdoms[gameState.playerKingdomId];
  const rel        = gameState.relations[gameState.playerKingdomId]?.[province.owner];
  const hasNAP     = rel?.treaty?.type === 'nap';
  const isPlanning = gameState.phase === 'player_planning';
  const ap         = gameState.ordersRemaining;

  const armiesHere      = Object.values(gameState.armies).filter((a) => a.provinceId === pid);
  const playerArmiesHere = armiesHere.filter((a) => a.kingdomId === gameState.playerKingdomId);

  return (
    <div className="flex flex-col h-full overflow-hidden text-xs">
      {/* ── Header ─────────────────────────── */}
      <div className="px-3 pt-3 pb-2 border-b border-gray-800 shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-bold text-sm text-gray-100 leading-tight">{province.name}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ownerK?.color ?? '#888' }} />
              <span style={{ color: ownerK?.color ?? '#888' }}>{ownerK?.name ?? 'Unknown'}</span>
              {province.isCapital && <span className="text-amber-400">★ Capital</span>}
              {hasNAP && <span className="text-green-400">✋ NAP</span>}
            </div>
            <div className="capitalize text-gray-600 mt-0.5">{province.terrain}</div>
          </div>
          <button className="text-gray-700 hover:text-gray-400 text-base leading-none" onClick={() => setSelected(null)}>✕</button>
        </div>

        {/* Fog status badge */}
        {!isVisible && !isPartial && (
          <div className="mt-1.5 text-gray-700 italic text-[10px]">Unknown — scout to reveal</div>
        )}
        {isPartial && !isVisible && (
          <div className="mt-1.5 text-gray-600 italic text-[10px]">Partial intel — scout for full details</div>
        )}
        {fog?.scouted && !fog.visible && (
          <div className="mt-1.5 text-blue-600 text-[10px]">🔍 Scouted ({3 - (gameState.season - fog.scoutedAt)} seasons remaining)</div>
        )}
      </div>

      {/* ── Main content ───────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">

        {/* Stats: two-column grid */}
        {(isVisible || isPartial) && (
          <div className="grid grid-cols-2 gap-2">
            {/* Economy column */}
            <div className="space-y-1">
              <div className="text-[10px] text-gray-600 uppercase tracking-wider">Economy</div>
              {isVisible ? (
                <>
                  <Stat icon="💰" label="Income" value={`+${province.baseIncome}${province.hasMarket ? '+2' : ''}`}
                    tip="Gold produced each season. Market adds +2." />
                  <Stat icon="🌾" label="Food" value={`+${province.baseFood}${province.hasFarm ? '+2' : ''}${province.terrain === 'riverlands' ? '+1' : ''}`}
                    tip="Food produced each season. Farm adds +2; riverlands +1 bonus." />
                  <Stat icon="👥" label="Manpower" value={`+${province.baseManpower}${province.hasBarracks ? '+1' : ''}`}
                    tip="Manpower contributed to pool each season. Barracks adds +1." />
                  <Stat icon="😤" label="Unrest" value={`${province.unrest}/100`}
                    tip="High unrest reduces income. Decays 3/season; salt reduces faster."
                    valueColor={province.unrest > 60 ? 'text-red-400' : province.unrest > 30 ? 'text-yellow-400' : 'text-green-400'}
                  />
                </>
              ) : (
                <div className="text-gray-600 italic">Partial — garrison only</div>
              )}
            </div>

            {/* Defense column */}
            <div className="space-y-1">
              <div className="text-[10px] text-gray-600 uppercase tracking-wider">Defense</div>
              {isVisible ? (
                <>
                  <Stat icon="⚔" label="Garrison" value={province.garrison.toLocaleString()}
                    tip="Troops defending without an army. Destroyed if province is captured." />
                  <Stat icon="🏯" label="Fort Lv." value={`${province.fortLevel}/3`}
                    tip="Fort level adds +20% defense power per level (max 3)." />
                  <Stat icon="🌍" label="Terrain" value={province.terrain}
                    tip="Plains=neutral; Hills=+15% def; Mountains=+30% def; River=−15% atk." />
                </>
              ) : (
                <Stat icon="⚔" label="Garrison" value={fog?.lastKnownGarrisonTier ?? '?'}
                  tip="Estimated garrison strength. Scout for exact numbers." />
              )}
            </div>
          </div>
        )}

        {/* Resources */}
        {isVisible && (province.hasIron || province.hasSalt || province.hasMarket || province.hasFarm || province.hasBarracks) && (
          <div>
            <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Resources & Buildings</div>
            <div className="flex flex-wrap gap-1">
              {province.hasIron && (
                <StatTooltip tip="Iron deposits: army recruit costs −15% in this province">
                  <span className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 cursor-help">⛏ Iron</span>
                </StatTooltip>
              )}
              {province.hasSalt && (
                <StatTooltip tip="Salt trade: unrest recovers +5 faster each season">
                  <span className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 cursor-help">🧂 Salt</span>
                </StatTooltip>
              )}
              {province.hasFarm && (
                <StatTooltip tip="Farm built: +2 food/season">
                  <span className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 cursor-help">🌱 Farm</span>
                </StatTooltip>
              )}
              {province.hasMarket && (
                <StatTooltip tip="Market built: +2 income/season">
                  <span className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 cursor-help">🏪 Market</span>
                </StatTooltip>
              )}
              {province.hasBarracks && (
                <StatTooltip tip="Barracks built: +1 manpower/season, cheaper recruiting">
                  <span className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 cursor-help">🏛 Barracks</span>
                </StatTooltip>
              )}
            </div>
          </div>
        )}

        {/* Armies */}
        {armiesHere.length > 0 && (isVisible || isPartial) && (
          <div>
            <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Armies Present</div>
            {armiesHere.map((army) => {
              const k = gameState.kingdoms[army.kingdomId];
              return (
                <div key={army.id} className="flex items-center justify-between py-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: k?.color ?? '#888' }} />
                    <span className="text-gray-300">{army.name}</span>
                  </div>
                  <span className="text-amber-400">{army.size.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Actions ─────────────────────── */}
        {isPlanning && (
          <div className="space-y-2.5">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider">Actions</div>

            {/* Own province actions */}
            {isOwned && (
              <>
                {/* Military */}
                {playerArmiesHere.length > 0 && (
                  <ActionGroup label="Military">
                    {playerArmiesHere.map((army) => (
                      <div key={army.id} className="flex gap-1">
                        <ActionBtn
                          disabled={ap < 1}
                          onClick={() => { setAction('move'); setPendingMoveArmy(army.id); }}
                        >
                          ⇒ Move army
                        </ActionBtn>
                        <ActionBtn
                          danger
                          disabled={ap < 1}
                          onClick={() => { setAction('attack'); setPendingMoveArmy(army.id); }}
                        >
                          ⚔ Attack
                        </ActionBtn>
                      </div>
                    ))}
                  </ActionGroup>
                )}

                {/* Build */}
                <ActionGroup label="Build (1 AP each)">
                  <div className="grid grid-cols-2 gap-1">
                    <ActionBtn disabled={ap < 1 || province.hasFarm}
                      onClick={() => queueAction({ type: 'build', apCost: 1, provinceId: pid, buildingType: 'farm' })}>
                      {province.hasFarm ? <s className="text-gray-600">🌱 Farm</s> : '🌱 Farm'}
                    </ActionBtn>
                    <ActionBtn disabled={ap < 1 || province.hasMarket}
                      onClick={() => queueAction({ type: 'build', apCost: 1, provinceId: pid, buildingType: 'market' })}>
                      {province.hasMarket ? <s className="text-gray-600">🏪 Market</s> : '🏪 Market'}
                    </ActionBtn>
                    <ActionBtn disabled={ap < 1 || province.hasBarracks}
                      onClick={() => queueAction({ type: 'build', apCost: 1, provinceId: pid, buildingType: 'barracks' })}>
                      {province.hasBarracks ? <s className="text-gray-600">🏛 Barracks</s> : '🏛 Barracks'}
                    </ActionBtn>
                    <ActionBtn disabled={ap < 1 || province.fortLevel >= 3}
                      onClick={() => queueAction({ type: 'build', apCost: 1, provinceId: pid, buildingType: 'fort' })}>
                      🏯 Fort {province.fortLevel}/3
                    </ActionBtn>
                  </div>
                </ActionGroup>

                        {/* Levy */}
                <ActionGroup label="Levy (1 Order)">
                  <LevyWidget provinceId={pid} province={province} season={gameState.season} />
                </ActionGroup>

                {/* Recruit */}
                {(province.hasBarracks || province.isCapital) && (
                  <ActionGroup label="Recruit">
                    <RecruitWidget provinceId={pid} />
                  </ActionGroup>
                )}
              </>
            )}

            {/* Enemy province actions */}
            {!isOwned && (
              <>
                <ActionGroup label="Intelligence">
                  <ActionBtn disabled={ap < 1}
                    onClick={() => queueAction({ type: 'espionage_scout', apCost: 1, targetProvinceId: pid })}>
                    🔍 Scout (1 AP)
                  </ActionBtn>
                  {isVisible && (
                    <>
                      <ActionBtn disabled={ap < 2}
                        onClick={() => queueAction({ type: 'espionage_sabotage', apCost: 2, targetProvinceId: pid })}>
                        🗡 Sabotage (2 AP)
                      </ActionBtn>
                      <ActionBtn disabled={ap < 2}
                        onClick={() => queueAction({ type: 'espionage_incite', apCost: 2, targetProvinceId: pid })}>
                        😠 Incite Unrest (2 AP)
                      </ActionBtn>
                    </>
                  )}
                </ActionGroup>

                {!hasNAP && ownerK && (
                  <ActionGroup label="Diplomacy">
                    <ActionBtn
                      disabled={ap < (playerK.id === 'qin' ? 2 : 1)}
                      onClick={() => queueAction({
                        type: 'diplomacy_nap',
                        apCost: playerK.id === 'qin' ? 2 : 1,
                        targetKingdomId: province.owner,
                      })}
                    >
                      ✋ Propose NAP with {ownerK.name}
                      {playerK.id === 'qin' ? ' (2 AP)' : ' (1 AP)'}
                    </ActionBtn>
                  </ActionGroup>
                )}
              </>
            )}
          </div>
        )}

        {/* Feedback */}
        {actionFeedback && (
          <div className="panel rounded p-2 text-xs text-amber-300">
            {actionFeedback}
            <button className="ml-2 text-gray-600 hover:text-gray-400" onClick={clearFeedback}>✕</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center p-4 text-center text-gray-600">
      <div>
        <div className="text-3xl mb-2 opacity-50">🗺</div>
        <div className="text-xs">Click a province to inspect it</div>
        <div className="text-[10px] mt-2 space-y-0.5">
          <div>A — Attack mode</div>
          <div>M — Move mode</div>
          <div>X — Split army</div>
          <div>I — Scout selected</div>
          <div>R — Recruit at selected</div>
          <div>Y/N — Accept/Decline inbox</div>
          <div>S/↵ — End Season</div>
        </div>
      </div>
    </div>
  );
}

function ActionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-gray-700 uppercase tracking-wider mb-1">{label}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function ActionBtn({
  children, disabled, onClick, danger = false,
}: {
  children: React.ReactNode; disabled: boolean; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      className={`btn-action w-full text-xs ${danger && !disabled ? 'hover:border-red-600' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function LevyWidget({ provinceId, province, season }: { provinceId: string; province: Province; season: number }) {
  const queueAction = useGameStore((s) => s.queueAction);
  const gameState   = useGameStore((s) => s.gameState!);
  const player      = gameState.kingdoms[gameState.playerKingdomId];
  const ap          = gameState.ordersRemaining;

  const cooldownUntil = province.levyCooldownUntil ?? 0;
  const cooldownLeft  = Math.max(0, cooldownUntil - season);
  const onCooldown    = cooldownLeft > 0;
  const canAfford     = player.treasury >= LEVY_GOLD_COST;
  const canLevy       = ap >= 1 && !onCooldown && canAfford;

  return (
    <div>
      <div className="text-[10px] text-gray-600 mb-1">
        +{LEVY_AMOUNT} manpower · costs {LEVY_GOLD_COST}g · stability −{LEVY_STABILITY_HIT} · 4-season cooldown
      </div>
      {onCooldown ? (
        <div className="text-yellow-600 text-[10px]">⏳ Cooldown: {cooldownLeft} season{cooldownLeft !== 1 ? 's' : ''} remaining</div>
      ) : (
        <ActionBtn
          disabled={!canLevy}
          onClick={() => queueAction({ type: 'levy', apCost: 1, provinceId, levyAmount: LEVY_AMOUNT })}
        >
          👥 Call Levy ({LEVY_GOLD_COST}g, −{LEVY_STABILITY_HIT} stability)
        </ActionBtn>
      )}
      {!canAfford && !onCooldown && (
        <div className="text-red-500 text-[10px] mt-0.5">Not enough gold ({Math.floor(player.treasury)} available)</div>
      )}
      {ap < 1 && !onCooldown && (
        <div className="text-red-500 text-[10px] mt-0.5">No Orders remaining</div>
      )}
    </div>
  );
}

function RecruitWidget({ provinceId }: { provinceId: string }) {
  const [amount, setAmount] = useState(3);
  const queueAction = useGameStore((s) => s.queueAction);
  const gameState   = useGameStore((s) => s.gameState!);
  const player      = gameState.kingdoms[gameState.playerKingdomId];
  const ap          = gameState.ordersRemaining;
  const troops      = amount * 10;
  const goldCost    = Math.ceil(amount * 2 * player.recruitCostModifier);

  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <select
          className="flex-1 bg-gray-800 border border-gray-700 text-xs rounded px-1 py-1"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        >
          {[1, 2, 3, 5, 8, 10].map((n) => (
            <option key={n} value={n}>{n * 10} troops ({n * 2}g, {n}mp)</option>
          ))}
        </select>
      </div>
      <ActionBtn
        disabled={ap < 1 || player.manpower < amount || player.treasury < goldCost}
        onClick={() => queueAction({ type: 'recruit', apCost: 1, provinceId, recruitAmount: amount })}
      >
        Recruit {troops} troops — {goldCost}g, {amount}mp (1 AP)
      </ActionBtn>
      {player.manpower < amount && (
        <div className="text-red-500 text-[10px] mt-0.5">Not enough manpower ({Math.floor(player.manpower)} available)</div>
      )}
    </div>
  );
}

function Stat({
  icon, label, value, tip, valueColor = 'text-gray-200',
}: { icon: string; label: string; value: string; tip: string; valueColor?: string }) {
  return (
    <div className="flex justify-between items-center">
      <StatTooltip tip={tip}>
        <span className="text-gray-600 cursor-help">{icon} {label}</span>
      </StatTooltip>
      <span className={valueColor}>{value}</span>
    </div>
  );
}
