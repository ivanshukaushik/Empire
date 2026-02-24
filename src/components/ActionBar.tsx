import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { ActionType, ReformType } from '../engine/types';
import { KINGDOM_DEFS } from '../data/gameData';

const REFORM_OPTIONS: { id: ReformType; label: string; desc: string }[] = [
  { id: 'iron_fist',       label: 'Iron Fist',       desc: 'Combat +20%, Economy −10%' },
  { id: 'commerce',        label: 'Commerce',         desc: 'Income +20%, Upkeep +10%' },
  { id: 'conscription',    label: 'Conscription',     desc: 'Manpower +30%, Stability −10' },
  { id: 'propaganda',      label: 'Propaganda',       desc: 'Stability +20 over 4s, −5g/turn' },
  { id: 'fortify_borders', label: 'Fortify Borders',  desc: 'Fort cost −30%, Recruit −15%' },
];

export default function ActionBar() {
  const gameState = useGameStore((s) => s.gameState!);
  const endTurn = useGameStore((s) => s.endTurn);
  const queueAction = useGameStore((s) => s.queueAction);
  const setActionBeingPlanned = useGameStore((s) => s.setActionBeingPlanned);
  const setPendingMoveSource = useGameStore((s) => s.setPendingMoveSource);
  const [showReformPanel, setShowReformPanel] = useState(false);
  const [showDiplomacyPanel, setShowDiplomacyPanel] = useState(false);
  const [tributeAmount, setTributeAmount] = useState(20);
  const [tributeTarget, setTributeTarget] = useState('');

  const { actionPointsRemaining, phase, playerKingdomId, kingdoms } = gameState;
  const isPlanning = phase === 'player_planning';
  const ap = actionPointsRemaining;
  const isQin = playerKingdomId === 'qin';

  function handleMoveAttack(type: 'move' | 'attack') {
    const myArmies = Object.values(gameState.armies).filter(
      (a) => a.kingdomId === playerKingdomId
    );
    if (myArmies.length === 0) return;
    // If only one army, pre-select it
    if (myArmies.length === 1) {
      setActionBeingPlanned(type);
      setPendingMoveSource(myArmies[0].provinceId);
    } else {
      setActionBeingPlanned(type);
      // Player needs to click on their province with army to select it
    }
  }

  function handleReform(reform: ReformType) {
    queueAction({ type: 'reform', apCost: 1, reform });
    setShowReformPanel(false);
  }

  function handleTribute() {
    if (!tributeTarget) return;
    queueAction({
      type: 'diplomacy_tribute',
      apCost: 1,
      targetKingdomId: tributeTarget,
      tributeAmount,
    });
    setShowDiplomacyPanel(false);
  }

  const player = kingdoms[playerKingdomId];

  const otherKingdoms = Object.values(kingdoms).filter(
    (k) => k.id !== playerKingdomId && !k.isEliminated
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2 h-full overflow-x-auto">

        {/* AP display */}
        <div className="flex items-center gap-1 shrink-0 mr-2">
          {Array.from({ length: gameState.maxActionPoints }).map((_, i) => (
            <div
              key={i}
              className={`w-5 h-5 rounded-full border text-xs flex items-center justify-center transition-all ${
                i < ap
                  ? 'bg-amber-600 border-amber-500'
                  : 'bg-gray-800 border-gray-700'
              }`}
            />
          ))}
          <span className="text-xs text-gray-400 ml-1 whitespace-nowrap">{ap} AP</span>
        </div>

        <div className="h-6 border-l border-gray-700 mx-1 shrink-0" />

        {/* Move */}
        <ActionButton
          label="⇒ Move"
          disabled={!isPlanning || ap < 1}
          active={gameState.actionBeingPlanned === 'move'}
          onClick={() => handleMoveAttack('move')}
          tooltip="Move army to adjacent friendly province (1 AP)"
        />

        {/* Attack */}
        <ActionButton
          label="⚔ Attack"
          disabled={!isPlanning || ap < 1}
          active={gameState.actionBeingPlanned === 'attack'}
          onClick={() => handleMoveAttack('attack')}
          tooltip="Attack adjacent enemy province (1 AP)"
          danger
        />

        <div className="h-6 border-l border-gray-700 mx-1 shrink-0" />

        {/* Recruit — goes to selected province */}
        <ActionButton
          label="🪖 Recruit"
          disabled={!isPlanning || ap < 1}
          onClick={() => {
            const pid = gameState.selectedProvinceId;
            if (!pid) return;
            const p = gameState.provinces[pid];
            if (!p || p.owner !== playerKingdomId) return;
            queueAction({ type: 'recruit', apCost: 1, provinceId: pid, recruitAmount: 3 });
          }}
          tooltip="Recruit 30 troops at selected province with barracks (1 AP)"
        />

        {/* Build */}
        <ActionButton
          label="🏗 Build Farm"
          disabled={!isPlanning || ap < 1}
          onClick={() => {
            const pid = gameState.selectedProvinceId;
            if (!pid) return;
            queueAction({ type: 'build', apCost: 1, provinceId: pid, buildingType: 'farm' });
          }}
          tooltip="Build farm in selected province (1 AP)"
        />

        <ActionButton
          label="🏪 Market"
          disabled={!isPlanning || ap < 1}
          onClick={() => {
            const pid = gameState.selectedProvinceId;
            if (!pid) return;
            queueAction({ type: 'build', apCost: 1, provinceId: pid, buildingType: 'market' });
          }}
          tooltip="Build market (1 AP)"
        />

        <ActionButton
          label="🏯 Fort"
          disabled={!isPlanning || ap < 1}
          onClick={() => {
            const pid = gameState.selectedProvinceId;
            if (!pid) return;
            queueAction({ type: 'build', apCost: 1, provinceId: pid, buildingType: 'fort' });
          }}
          tooltip="Upgrade fort level (1 AP)"
        />

        <div className="h-6 border-l border-gray-700 mx-1 shrink-0" />

        {/* Scout */}
        <ActionButton
          label="🔍 Scout"
          disabled={!isPlanning || ap < 1}
          onClick={() => {
            const pid = gameState.selectedProvinceId;
            if (!pid) return;
            queueAction({ type: 'espionage_scout', apCost: 1, targetProvinceId: pid });
          }}
          tooltip="Scout selected province (1 AP)"
        />

        {/* Sabotage */}
        <ActionButton
          label="🗡 Sabotage"
          disabled={!isPlanning || ap < 2}
          onClick={() => {
            const pid = gameState.selectedProvinceId;
            if (!pid) return;
            queueAction({ type: 'espionage_sabotage', apCost: 2, targetProvinceId: pid });
          }}
          tooltip="Sabotage garrison (2 AP)"
        />

        <div className="h-6 border-l border-gray-700 mx-1 shrink-0" />

        {/* Diplomacy */}
        <div className="relative shrink-0">
          <ActionButton
            label="✋ NAP"
            disabled={!isPlanning || ap < (isQin ? 2 : 1)}
            onClick={() => setShowDiplomacyPanel(!showDiplomacyPanel)}
            tooltip={`Propose Non-Aggression Pact (${isQin ? '2' : '1'} AP)`}
          />
          {showDiplomacyPanel && (
            <div className="absolute bottom-full mb-1 left-0 bg-gray-900 border border-gray-700 rounded p-3 min-w-48 z-50">
              <div className="text-xs text-gray-400 mb-2">Propose NAP to:</div>
              {otherKingdoms.map((k) => {
                const rel = gameState.relations[playerKingdomId]?.[k.id];
                const hasNap = rel?.treaty?.type === 'nap';
                return (
                  <button
                    key={k.id}
                    className={`w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-800 flex justify-between items-center ${hasNap ? 'text-gray-600' : 'text-gray-200'}`}
                    disabled={hasNap}
                    onClick={() => {
                      queueAction({
                        type: 'diplomacy_nap',
                        apCost: isQin ? 2 : 1,
                        targetKingdomId: k.id,
                      });
                      setShowDiplomacyPanel(false);
                    }}
                  >
                    <span style={{ color: k.color }}>{k.name}</span>
                    <span className={rel?.score !== undefined && rel.score >= 0 ? 'text-gray-400' : 'text-red-400'}>
                      {rel?.score !== undefined ? (rel.score >= 0 ? '+' : '') + rel.score : '?'}
                      {hasNap ? ' ✋' : ''}
                    </span>
                  </button>
                );
              })}
              <div className="border-t border-gray-700 mt-2 pt-2">
                <div className="text-xs text-gray-400 mb-1">Offer Tribute:</div>
                <select
                  className="w-full bg-gray-800 text-xs rounded px-1 py-0.5 mb-1"
                  value={tributeTarget}
                  onChange={(e) => setTributeTarget(e.target.value)}
                >
                  <option value="">— select kingdom —</option>
                  {otherKingdoms.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
                <div className="flex gap-1">
                  <input
                    type="number"
                    value={tributeAmount}
                    onChange={(e) => setTributeAmount(Number(e.target.value))}
                    className="flex-1 bg-gray-800 text-xs rounded px-1 py-0.5 w-16"
                    min={5} max={200} step={5}
                  />
                  <button
                    className="btn-primary text-xs px-2"
                    disabled={!tributeTarget}
                    onClick={handleTribute}
                  >
                    Pay
                  </button>
                </div>
              </div>
              <button className="text-xs text-gray-600 mt-1 w-full" onClick={() => setShowDiplomacyPanel(false)}>Cancel</button>
            </div>
          )}
        </div>

        {/* Reform */}
        <div className="relative shrink-0">
          <ActionButton
            label="📜 Reform"
            disabled={!isPlanning || ap < 1}
            onClick={() => setShowReformPanel(!showReformPanel)}
            tooltip="Enact a kingdom-wide reform (1 AP)"
          />
          {showReformPanel && (
            <div className="absolute bottom-full mb-1 right-0 bg-gray-900 border border-gray-700 rounded p-3 min-w-52 z-50">
              <div className="text-xs text-gray-400 mb-2">Choose Reform:</div>
              {REFORM_OPTIONS.map((r) => (
                <button
                  key={r.id}
                  className={`w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-800 mb-1 ${
                    player.activeReform === r.id ? 'bg-amber-900/40 border border-amber-700' : ''
                  }`}
                  onClick={() => handleReform(r.id)}
                >
                  <div className="text-gray-200">{r.label}</div>
                  <div className="text-gray-500">{r.desc}</div>
                </button>
              ))}
              <button className="text-xs text-gray-600 mt-1 w-full" onClick={() => setShowReformPanel(false)}>Cancel</button>
            </div>
          )}
        </div>

        {/* Cancel action */}
        {gameState.actionBeingPlanned && (
          <ActionButton
            label="✕ Cancel"
            disabled={false}
            onClick={() => setActionBeingPlanned(null)}
            tooltip="Cancel current action"
          />
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Context hint */}
        {gameState.actionBeingPlanned && (
          <span className="text-xs text-blue-400 shrink-0 mr-2 italic">
            {gameState.pendingMoveSource
              ? `Click target province for ${gameState.actionBeingPlanned}`
              : `Click your province with an army`}
          </span>
        )}

        {/* End turn */}
        <button
          className={`btn-primary px-4 py-2 shrink-0 whitespace-nowrap ${!isPlanning ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={!isPlanning}
          onClick={endTurn}
        >
          End Season ▶
        </button>
      </div>
    </div>
  );
}

function ActionButton({
  label, disabled, onClick, tooltip, active = false, danger = false,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  tooltip?: string;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      className={`btn-action shrink-0 text-xs whitespace-nowrap ${active ? 'active' : ''} ${danger && !disabled ? 'hover:border-red-500' : ''}`}
      disabled={disabled}
      onClick={onClick}
      title={tooltip}
    >
      {label}
    </button>
  );
}
