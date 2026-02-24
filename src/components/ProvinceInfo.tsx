import React from 'react';
import { useGameStore } from '../store/gameStore';
import { Province } from '../engine/types';

export default function ProvinceInfo() {
  const gameState = useGameStore((s) => s.gameState!);
  const setSelectedProvince = useGameStore((s) => s.setSelectedProvince);
  const setActionBeingPlanned = useGameStore((s) => s.setActionBeingPlanned);
  const setPendingMoveSource = useGameStore((s) => s.setPendingMoveSource);
  const queueAction = useGameStore((s) => s.queueAction);
  const actionFeedback = useGameStore((s) => s.actionFeedback);
  const clearFeedback = useGameStore((s) => s.clearFeedback);

  const pid = gameState.selectedProvinceId;
  if (!pid) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-4 text-center">
        <div className="text-gray-600 text-sm">
          <div className="text-2xl mb-2">🗺</div>
          Click a province on the map to see details and take actions.
        </div>
        {actionFeedback && (
          <div className="mt-4 text-xs text-amber-300 panel rounded p-2 max-w-full">
            {actionFeedback}
            <button className="ml-2 text-gray-500 hover:text-gray-300" onClick={clearFeedback}>✕</button>
          </div>
        )}
      </div>
    );
  }

  const province = gameState.provinces[pid];
  if (!province) return null;

  const fog = gameState.fogOfWar[pid];
  const isVisible = fog?.visible || fog?.scouted;
  const isPartial = fog?.partial;
  const isOwned = province.owner === gameState.playerKingdomId;
  const ownerKingdom = gameState.kingdoms[province.owner];
  const playerKingdom = gameState.kingdoms[gameState.playerKingdomId];

  const armiesHere = Object.values(gameState.armies).filter(
    (a) => a.provinceId === pid
  );
  const playerArmiesHere = armiesHere.filter((a) => a.kingdomId === gameState.playerKingdomId);
  const rel = gameState.relations[gameState.playerKingdomId]?.[province.owner];
  const hasNAP = rel?.treaty?.type === 'nap';
  const isEnemy = !isOwned && !hasNAP;
  const isPhase = gameState.phase === 'player_planning';

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-thin p-3 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-bold text-base text-gray-200">{province.name}</h2>
          <div className="text-xs text-gray-500 capitalize">{province.terrain}</div>
        </div>
        <button
          className="text-gray-600 hover:text-gray-400 text-xs"
          onClick={() => setSelectedProvince(null)}
        >
          ✕
        </button>
      </div>

      {/* Owner */}
      <div className="panel rounded p-2 flex items-center justify-between">
        <div className="text-xs text-gray-400">Owner</div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ background: ownerKingdom?.color ?? '#888' }} />
          <span className="text-sm font-medium" style={{ color: ownerKingdom?.color ?? '#888' }}>
            {ownerKingdom?.name ?? 'Unknown'}
          </span>
          {province.isCapital && <span className="text-xs text-amber-400">★ Capital</span>}
          {hasNAP && <span className="text-xs text-green-400">NAP ✋</span>}
        </div>
      </div>

      {/* Stats (visible if owned or scouted) */}
      {(isVisible || isPartial) ? (
        <div className="panel rounded p-2 space-y-1">
          <div className="text-xs text-gray-400 mb-1">Province Stats</div>
          {isVisible ? (
            <>
              <StatRow icon="⚔" label="Garrison" value={province.garrison.toLocaleString()} />
              <StatRow icon="😤" label="Unrest" value={`${province.unrest}/100`} color={province.unrest > 60 ? 'text-red-400' : province.unrest > 30 ? 'text-yellow-400' : 'text-green-400'} />
              <StatRow icon="💰" label="Income" value={`+${province.baseIncome}`} />
              <StatRow icon="🌾" label="Food" value={`+${province.baseFood}`} />
              <StatRow icon="👥" label="Manpower" value={`+${province.baseManpower}`} />
              {province.fortLevel > 0 && <StatRow icon="🏯" label="Fort Level" value={`${province.fortLevel}/3`} />}
              {province.hasFarm && <StatRow icon="🌱" label="Farm" value="+2 food" />}
              {province.hasMarket && <StatRow icon="🏪" label="Market" value="+2 income" />}
              {province.hasBarracks && <StatRow icon="⚔" label="Barracks" value="+1 manpower" />}
              {province.hasIron && <StatRow icon="⛏" label="Iron" value="-15% recruit" />}
              {province.hasSalt && <StatRow icon="🧂" label="Salt" value="-5 unrest/season" />}
            </>
          ) : (
            <>
              <StatRow icon="⚔" label="Garrison" value={fog?.lastKnownGarrisonTier ?? '?'} />
              <div className="text-xs text-gray-600 italic">Scout for full details.</div>
            </>
          )}
        </div>
      ) : (
        <div className="panel rounded p-2 text-xs text-gray-600 italic">
          This province is outside your intelligence network. Scout to reveal details.
        </div>
      )}

      {/* Armies */}
      {armiesHere.length > 0 && (isVisible || isPartial) && (
        <div className="panel rounded p-2">
          <div className="text-xs text-gray-400 mb-1">Armies Present</div>
          {armiesHere.map((army) => {
            const k = gameState.kingdoms[army.kingdomId];
            return (
              <div key={army.id} className="flex items-center justify-between text-xs mb-0.5">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: k?.color ?? '#888' }} />
                  <span className="text-gray-300">{army.name}</span>
                </div>
                <span className="text-amber-400">{army.size.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick Actions */}
      {isPhase && (
        <div className="space-y-1.5">
          <div className="text-xs text-gray-500 uppercase tracking-wider">Quick Actions</div>

          {/* Own province actions */}
          {isOwned && (
            <>
              {playerArmiesHere.length > 0 && (
                <div className="space-y-1">
                  {playerArmiesHere.map((army) => (
                    <div key={army.id} className="flex gap-1">
                      <button
                        className="btn-action flex-1 text-xs"
                        disabled={gameState.actionPointsRemaining < 1}
                        onClick={() => {
                          setActionBeingPlanned('move');
                          setPendingMoveSource(province.id);
                        }}
                      >
                        ⇒ Move {army.name}
                      </button>
                      <button
                        className="btn-danger flex-1 text-xs"
                        disabled={gameState.actionPointsRemaining < 1}
                        onClick={() => {
                          setActionBeingPlanned('attack');
                          setPendingMoveSource(province.id);
                        }}
                      >
                        ⚔ Attack
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <BuildButtons province={province} />
              {(province.hasBarracks || province.isCapital) && (
                <RecruitButton province={province} />
              )}
            </>
          )}

          {/* Enemy province actions */}
          {!isOwned && (
            <>
              <button
                className="btn-action w-full text-xs"
                disabled={gameState.actionPointsRemaining < 1}
                onClick={() => {
                  queueAction({ type: 'espionage_scout', apCost: 1, targetProvinceId: pid });
                }}
              >
                🔍 Scout (1 AP)
              </button>
              {isVisible && (
                <>
                  <button
                    className="btn-action w-full text-xs"
                    disabled={gameState.actionPointsRemaining < 2}
                    onClick={() => {
                      queueAction({ type: 'espionage_sabotage', apCost: 2, targetProvinceId: pid });
                    }}
                  >
                    🗡 Sabotage (2 AP)
                  </button>
                  <button
                    className="btn-action w-full text-xs"
                    disabled={gameState.actionPointsRemaining < 2}
                    onClick={() => {
                      queueAction({ type: 'espionage_incite', apCost: 2, targetProvinceId: pid });
                    }}
                  >
                    😠 Incite Unrest (2 AP)
                  </button>
                </>
              )}
              {/* Diplomacy */}
              {!hasNAP && ownerKingdom && (
                <button
                  className="btn-action w-full text-xs"
                  disabled={gameState.actionPointsRemaining < 1}
                  onClick={() => {
                    queueAction({
                      type: 'diplomacy_nap',
                      apCost: playerKingdom.id === 'qin' ? 2 : 1,
                      targetKingdomId: province.owner,
                    });
                  }}
                >
                  ✋ Propose NAP with {ownerKingdom.name}
                  {playerKingdom.id === 'qin' ? ' (2 AP)' : ' (1 AP)'}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Action feedback */}
      {actionFeedback && (
        <div className="panel rounded p-2 text-xs text-amber-300 mt-auto">
          {actionFeedback}
          <button className="ml-2 text-gray-500 hover:text-gray-300" onClick={clearFeedback}>✕</button>
        </div>
      )}
    </div>
  );
}

function BuildButtons({ province }: { province: Province }) {
  const gameState = useGameStore((s) => s.gameState!);
  const queueAction = useGameStore((s) => s.queueAction);
  const ap = gameState.actionPointsRemaining;
  const player = gameState.kingdoms[gameState.playerKingdomId];

  const builds: { type: string; label: string; done?: boolean }[] = [
    { type: 'farm', label: '🌱 Farm (1 AP)', done: province.hasFarm },
    { type: 'market', label: '🏪 Market (1 AP)', done: province.hasMarket },
    { type: 'barracks', label: '🪖 Barracks (1 AP)', done: province.hasBarracks },
    { type: 'fort', label: `🏯 Fort +1 (1 AP)`, done: province.fortLevel >= 3 },
  ];

  return (
    <div className="space-y-1">
      {builds.map((b) => (
        <button
          key={b.type}
          className="btn-action w-full text-xs"
          disabled={ap < 1 || b.done}
          onClick={() => {
            queueAction({
              type: 'build',
              apCost: 1,
              provinceId: province.id,
              buildingType: b.type as any,
            });
          }}
        >
          {b.done ? <s className="text-gray-600">{b.label}</s> : b.label}
        </button>
      ))}
    </div>
  );
}

function RecruitButton({ province }: { province: Province }) {
  const gameState = useGameStore((s) => s.gameState!);
  const queueAction = useGameStore((s) => s.queueAction);
  const [amount, setAmount] = React.useState(3);
  const player = gameState.kingdoms[gameState.playerKingdomId];
  const ap = gameState.actionPointsRemaining;

  return (
    <div className="flex gap-1 items-center">
      <button
        className="btn-action flex-1 text-xs"
        disabled={ap < 1 || player.manpower < amount || player.treasury < amount * 2}
        onClick={() => {
          queueAction({
            type: 'recruit',
            apCost: 1,
            provinceId: province.id,
            recruitAmount: amount,
          });
        }}
      >
        ⚔ Recruit {amount * 10} troops (1 AP)
      </button>
      <select
        className="bg-gray-800 border border-gray-700 text-xs rounded px-1 py-1"
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
      >
        {[1, 2, 3, 5, 8].map((n) => (
          <option key={n} value={n}>{n * 10}k</option>
        ))}
      </select>
    </div>
  );
}

function StatRow({
  icon, label, value, color = 'text-gray-300',
}: {
  icon: string; label: string; value: string; color?: string;
}) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-gray-500">{icon} {label}</span>
      <span className={color}>{value}</span>
    </div>
  );
}
