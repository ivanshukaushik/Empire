import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { Tooltip } from './Tooltip';

export default function ActionBar() {
  const gameState          = useGameStore((s) => s.gameState!);
  const queueAction        = useGameStore((s) => s.queueAction);
  const setAction          = useGameStore((s) => s.setActionBeingPlanned);
  const setPendingMoveArmy = useGameStore((s) => s.setPendingMoveArmy);
  const actionFeedback     = useGameStore((s) => s.actionFeedback);
  const clearFeedback      = useGameStore((s) => s.clearFeedback);
  const togglePause        = useGameStore((s) => s.togglePause);
  const setSpeed           = useGameStore((s) => s.setSpeed);

  const [showDiplo, setShowDiplo]     = useState(false);
  const [tributeTarget, setTributeTarget] = useState('');
  const [tributeAmount, setTributeAmount] = useState(20);

  const {
    phase, playerKingdomId, kingdoms,
    actionBeingPlanned, provinceDomesticUsed,
    paused, speed, activeMovements,
  } = gameState;

  const isPlanning  = phase === 'player_planning';
  const player      = kingdoms[playerKingdomId];
  const pid         = gameState.selectedProvinceId;
  const selectedProv = pid ? gameState.provinces[pid] : null;
  const isOwnProv   = selectedProv?.owner === playerKingdomId;
  const isEnemyProv = selectedProv && selectedProv.owner !== playerKingdomId;

  const otherKingdoms = Object.values(kingdoms).filter(
    (k) => k.id !== playerKingdomId && !k.isEliminated
  );

  // Check if selected province has used its domestic slot
  const provDomesticUsed = !!(pid && provinceDomesticUsed?.[pid]);

  // Check if player army in selected province is currently marching
  const armyInProv = pid
    ? Object.values(gameState.armies).find(
        (a) => a.kingdomId === playerKingdomId && a.provinceId === pid && a.size > 0
      )
    : null;
  const armyActed = !!(armyInProv && (activeMovements ?? {})[armyInProv.id]);

  // Levy cooldown check
  const levyCooldownUntil = selectedProv?.levyCooldownUntil ?? 0;
  const levyCooldownRemaining = Math.max(0, levyCooldownUntil - gameState.season);

  // Ready armies (not currently marching)
  const readyArmies = isPlanning
    ? Object.values(gameState.armies).filter(
        (a) => a.kingdomId === playerKingdomId && a.size > 0 && !(activeMovements ?? {})[a.id]
      )
    : [];

  function startAttack() {
    if (!isPlanning) return;
    setAction('attack');
    // Auto-select if only one ready army
    if (readyArmies.length === 1) {
      setPendingMoveArmy(readyArmies[0].id);
    } else {
      setPendingMoveArmy(null);
    }
  }

  function startMove() {
    if (!isPlanning) return;
    setAction('move');
    // Auto-select if only one ready army
    if (readyArmies.length === 1) {
      setPendingMoveArmy(readyArmies[0].id);
    } else {
      setPendingMoveArmy(null);
    }
  }

  function cancel() { setAction(null); }

  function handleTribute() {
    if (!tributeTarget) return;
    queueAction({ type: 'diplomacy_tribute', apCost: 0, targetKingdomId: tributeTarget, tributeAmount });
    setShowDiplo(false);
  }

  const isAttack = actionBeingPlanned === 'attack';
  const isMove   = actionBeingPlanned === 'move';
  const isBusy   = !!actionBeingPlanned;

  // ── Derived disable reasons ──────────────────────────────
  const noProvTip         = 'Select one of your provinces first';
  const noEnemyProvTip    = 'Select an enemy province first';
  const domUsedTip        = `${selectedProv?.name ?? 'This province'} already used its domestic action this season`;
  const armyActedTip      = `${armyInProv?.name ?? 'Army'} is already marching`;
  const noBarracksTip     = 'Build a barracks first (or use your capital)';
  const noReadyArmyTip    = 'No ready armies — armies marching or none exist';

  const canBuild  = isPlanning && isOwnProv && !provDomesticUsed;
  const canRecruit = isPlanning && isOwnProv && !provDomesticUsed
    && !!(selectedProv?.hasBarracks || selectedProv?.isCapital || playerKingdomId === 'qi');

  const canLevy = isPlanning && !!isOwnProv && levyCooldownRemaining === 0;
  const canSplit = isPlanning && !!armyInProv && (armyInProv.size ?? 0) >= 2000;
  const canAttack = isPlanning && readyArmies.length > 0;
  const canMove   = isPlanning && readyArmies.length > 0;

  const buildDisableReason = !isPlanning ? '' : !isOwnProv ? noProvTip : provDomesticUsed ? domUsedTip : '';
  const recruitDisableReason = !isPlanning ? '' : !isOwnProv ? noProvTip
    : provDomesticUsed ? domUsedTip
    : !(selectedProv?.hasBarracks || selectedProv?.isCapital || playerKingdomId === 'qi') ? noBarracksTip
    : '';
  const levyDisableReason = !isPlanning ? '' : !isOwnProv ? noProvTip
    : levyCooldownRemaining > 0 ? `Levy on cooldown (${levyCooldownRemaining} seasons remaining)` : '';
  const splitDisableReason = !isPlanning ? '' : !armyInProv ? 'No army in selected province'
    : (armyInProv.size ?? 0) < 2000 ? 'Army needs 2000+ troops to split' : '';

  const attackDisableReason = !isPlanning ? '' : readyArmies.length === 0 ? noReadyArmyTip : '';
  const moveDisableReason   = !isPlanning ? '' : readyArmies.length === 0 ? noReadyArmyTip : '';
  const scoutDisableReason  = !isPlanning ? '' : !isEnemyProv ? noEnemyProvTip : '';
  const sabDisableReason    = !isPlanning ? '' : !isEnemyProv ? noEnemyProvTip : '';

  return (
    <div className="h-full flex items-center px-3 gap-1.5 overflow-x-auto">

      {/* ── Military ─────────────────────────── */}
      <Group label="Military">
        <Btn
          label="⚔ Attack"
          tip={attackDisableReason || `Attack adjacent enemy province — A`}
          active={isAttack}
          danger
          disabled={!canAttack}
          onClick={isAttack ? cancel : startAttack}
        />
        <Btn
          label="⇒ Move"
          tip={moveDisableReason || `Move army to friendly province — M`}
          active={isMove}
          disabled={!canMove}
          onClick={isMove ? cancel : startMove}
        />
        <Btn
          label="🪖 Recruit"
          tip={recruitDisableReason || `Recruit 30 troops — uses province domestic slot — R`}
          disabled={!canRecruit}
          onClick={() => {
            if (!pid || !isOwnProv) return;
            queueAction({ type: 'recruit', apCost: 0, provinceId: pid, recruitAmount: 3 });
          }}
        />
        <Btn
          label="👥 Levy"
          tip={levyDisableReason || `Emergency manpower levy: costs 5 gold + stability −3, 4-season cooldown — L`}
          disabled={!canLevy}
          onClick={() => {
            if (!pid) return;
            queueAction({ type: 'levy', apCost: 0, provinceId: pid, levyAmount: 20 });
          }}
        />
        <Btn
          label="✂ Split"
          tip={splitDisableReason || `Split selected army 50/50 into two groups — X`}
          disabled={!canSplit}
          onClick={() => {
            if (!armyInProv) return;
            queueAction({ type: 'split_army', apCost: 0, armyId: armyInProv.id, splitFraction: 0.5 });
          }}
        />
      </Group>

      <Divider />

      {/* ── Build ────────────────────────────── */}
      <Group label="Build">
        <Btn label="🌱 Farm"
          tip={buildDisableReason || (selectedProv?.hasFarm ? 'Farm already built' : 'Build farm +2 food/season — uses province slot')}
          disabled={!canBuild || !!selectedProv?.hasFarm}
          onClick={() => pid && queueAction({ type: 'build', apCost: 0, provinceId: pid, buildingType: 'farm' })}
        />
        <Btn label="🏪 Market"
          tip={buildDisableReason || (selectedProv?.hasMarket ? 'Market already built' : 'Build market +2 income/season — uses province slot')}
          disabled={!canBuild || !!selectedProv?.hasMarket}
          onClick={() => pid && queueAction({ type: 'build', apCost: 0, provinceId: pid, buildingType: 'market' })}
        />
        <Btn label="🪖 Barracks"
          tip={buildDisableReason || (selectedProv?.hasBarracks ? 'Barracks already built' : 'Build barracks — enables recruiting, +1 manpower/season')}
          disabled={!canBuild || !!selectedProv?.hasBarracks}
          onClick={() => pid && queueAction({ type: 'build', apCost: 0, provinceId: pid, buildingType: 'barracks' })}
        />
        <Btn label={`🏯 Fort${selectedProv ? ' ' + selectedProv.fortLevel + '/3' : ''}`}
          tip={buildDisableReason || ((selectedProv?.fortLevel ?? 0) >= 3 ? 'Fort at max level' : 'Upgrade fort +20% defense per level')}
          disabled={!canBuild || (selectedProv?.fortLevel ?? 0) >= 3}
          onClick={() => pid && queueAction({ type: 'build', apCost: 0, provinceId: pid, buildingType: 'fort' })}
        />
      </Group>

      <Divider />

      {/* ── Intel ────────────────────────────── */}
      <Group label="Intel">
        <Btn label="🔍 Scout"
          tip={scoutDisableReason || 'Reveal enemy province details for 3 seasons — I'}
          disabled={!isPlanning || !isEnemyProv}
          onClick={() => pid && queueAction({ type: 'espionage_scout', apCost: 0, targetProvinceId: pid })}
        />
        <Btn label="🗡 Sabotage"
          tip={sabDisableReason || 'Reduce enemy garrison 15–30%. May be detected'}
          disabled={!isPlanning || !isEnemyProv}
          onClick={() => pid && queueAction({ type: 'espionage_sabotage', apCost: 0, targetProvinceId: pid })}
        />
        <Btn label="😠 Incite"
          tip={sabDisableReason || 'Raise enemy province unrest +15–25. May be detected'}
          disabled={!isPlanning || !isEnemyProv}
          onClick={() => pid && queueAction({ type: 'espionage_incite', apCost: 0, targetProvinceId: pid })}
        />
      </Group>

      <Divider />

      {/* ── Diplomacy ────────────────────────── */}
      <Group label="Diplomacy">
        <div className="relative">
          <Btn
            label="✋ NAP"
            tip="Propose Non-Aggression Pact to another kingdom"
            disabled={!isPlanning}
            onClick={() => setShowDiplo(!showDiplo)}
          />
          {showDiplo && (
            <div className="absolute bottom-full mb-1 left-0 bg-gray-950 border border-gray-700 rounded-lg p-3 min-w-52 z-50 shadow-xl">
              <div className="text-xs text-gray-400 mb-2 font-medium">Propose NAP to:</div>
              <div className="space-y-0.5 mb-3">
                {otherKingdoms.map((k) => {
                  const rel = gameState.relations[playerKingdomId]?.[k.id];
                  const hasNap = rel?.treaty?.type === 'nap' && rel.treaty.status === 'active';
                  const score = rel?.score ?? 0;
                  return (
                    <button
                      key={k.id}
                      className={`w-full text-left text-xs px-2 py-1.5 rounded flex justify-between items-center hover:bg-gray-800 ${hasNap ? 'opacity-40 cursor-not-allowed' : ''}`}
                      disabled={hasNap}
                      onClick={() => {
                        queueAction({ type: 'diplomacy_nap', apCost: 0, targetKingdomId: k.id });
                        setShowDiplo(false);
                      }}
                    >
                      <span style={{ color: k.color }}>{k.name}</span>
                      <span className={score >= 0 ? 'text-gray-400' : 'text-red-400'}>
                        {score >= 0 ? '+' : ''}{score}{hasNap ? ' ✋' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-gray-800 pt-2">
                <div className="text-xs text-gray-400 mb-1.5 font-medium">Pay Tribute:</div>
                <select
                  className="w-full bg-gray-900 text-xs rounded px-2 py-1 mb-1.5 border border-gray-700"
                  value={tributeTarget}
                  onChange={(e) => setTributeTarget(e.target.value)}
                >
                  <option value="">— select kingdom —</option>
                  {otherKingdoms.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
                <div className="flex gap-1">
                  <input
                    type="number" value={tributeAmount} min={5} max={200} step={5}
                    onChange={(e) => setTributeAmount(Number(e.target.value))}
                    className="flex-1 bg-gray-900 text-xs rounded px-2 py-1 border border-gray-700 w-16"
                  />
                  <span className="text-gray-500 text-xs self-center">gold</span>
                  <button className="btn-primary text-xs px-2 py-1" disabled={!tributeTarget} onClick={handleTribute}>Pay</button>
                </div>
              </div>
              <button className="text-xs text-gray-600 mt-2 w-full text-left hover:text-gray-400" onClick={() => setShowDiplo(false)}>Close</button>
            </div>
          )}
        </div>
      </Group>

      {/* ── Cancel / feedback ────────────────── */}
      {isBusy && (
        <button
          className="btn-ghost text-xs text-red-400 border-red-800 shrink-0"
          onClick={cancel}
        >
          ✕ Cancel [Esc]
        </button>
      )}

      {/* Feedback strip */}
      {actionFeedback && !isBusy && (
        <div className="flex-1 min-w-0 mx-2">
          <div className="text-xs text-amber-300 truncate" title={actionFeedback}>
            {actionFeedback}
          </div>
        </div>
      )}

      <div className="flex-1" />

      {/* Keyboard hint */}
      <div className="text-xs text-gray-700 shrink-0 hidden lg:flex gap-2 mr-2">
        <span title="Pause / resume">Space</span>
        <span title="Attack">A</span>
        <span title="Move">M</span>
        <span title="Split army">X</span>
        <span title="Scout selected">I</span>
        <span title="Recruit at selected">R</span>
        <span title="Accept inbox proposal">Y</span>
        <span title="Decline inbox proposal">N</span>
        <span title="Speed 1×/2×/4×/8×">1-4</span>
        <span title="Cancel">Esc</span>
      </div>

      {/* Speed controls */}
      <div className="flex items-center gap-1 shrink-0">
        {([1, 2, 4, 8] as const).map((s) => (
          <button
            key={s}
            className={`text-xs px-2 py-1 rounded border ${
              speed === s
                ? 'bg-amber-700 border-amber-500 text-amber-100'
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'
            }`}
            onClick={() => setSpeed(s)}
            title={`${s}× speed`}
          >
            {s}×
          </button>
        ))}
      </div>

      {/* Pause / play */}
      <button
        className={`px-5 py-2 shrink-0 font-medium rounded border text-sm ${
          paused
            ? 'bg-green-800 border-green-600 text-green-100 hover:bg-green-700'
            : 'bg-amber-800 border-amber-600 text-amber-100 hover:bg-amber-700'
        } ${!isPlanning ? 'opacity-50 cursor-not-allowed' : ''}`}
        disabled={!isPlanning}
        onClick={togglePause}
        title="Pause / Resume [Space]"
      >
        {paused ? '▶ Resume' : '⏸ Pause'}
      </button>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 shrink-0">
      <span className="text-gray-700 text-[9px] uppercase tracking-wider text-center leading-none mb-0.5">
        {label}
      </span>
      <div className="flex gap-1">{children}</div>
    </div>
  );
}

function Divider() {
  return <div className="h-8 w-px bg-gray-800 mx-1 self-center shrink-0" />;
}

function Btn({
  label, tip, disabled, onClick, active = false, danger = false,
}: {
  label: string; tip?: string; disabled: boolean;
  onClick: () => void; active?: boolean; danger?: boolean;
}) {
  const btn = (
    <button
      className={`btn-action shrink-0 text-xs whitespace-nowrap
        ${active ? 'active' : ''}
        ${danger && !disabled ? 'hover:border-red-600' : ''}
      `}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
  if (tip) {
    return (
      <Tooltip content={tip} side="top" delay={400}>
        {btn}
      </Tooltip>
    );
  }
  return btn;
}
