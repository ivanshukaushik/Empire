import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { ReformType } from '../engine/types';
import { Tooltip } from './Tooltip';

const REFORM_OPTIONS: { id: ReformType; label: string; bonus: string; penalty: string }[] = [
  { id: 'iron_fist',       label: 'Iron Fist',       bonus: 'Combat +20%',        penalty: 'Economy −10%' },
  { id: 'commerce',        label: 'Commerce',         bonus: 'Income +20%',        penalty: 'Upkeep +10%' },
  { id: 'conscription',    label: 'Conscription',     bonus: 'Manpower +30%',      penalty: 'Stability −10 (once)' },
  { id: 'propaganda',      label: 'Propaganda',       bonus: '+3 stability/season', penalty: '−5 gold/season' },
  { id: 'fortify_borders', label: 'Fortify Borders',  bonus: 'Fort cost −30%',     penalty: 'Recruit −15%' },
];

export default function ActionBar() {
  const gameState          = useGameStore((s) => s.gameState!);
  const endTurn            = useGameStore((s) => s.endTurn);
  const queueAction        = useGameStore((s) => s.queueAction);
  const setAction          = useGameStore((s) => s.setActionBeingPlanned);
  const setPendingMoveArmy = useGameStore((s) => s.setPendingMoveArmy);
  const actionFeedback     = useGameStore((s) => s.actionFeedback);
  const clearFeedback      = useGameStore((s) => s.clearFeedback);

  const [showReform, setShowReform]   = useState(false);
  const [showDiplo, setShowDiplo]     = useState(false);
  const [tributeTarget, setTributeTarget] = useState('');
  const [tributeAmount, setTributeAmount] = useState(20);

  const {
    ordersRemaining: orders, phase, playerKingdomId, kingdoms,
    actionBeingPlanned, provinceDomesticUsed, armyCampaignUsed,
  } = gameState;

  const isPlanning  = phase === 'player_planning';
  const isQin       = playerKingdomId === 'qin';
  const player      = kingdoms[playerKingdomId];
  const pid         = gameState.selectedProvinceId;
  const selectedProv = pid ? gameState.provinces[pid] : null;
  const isOwnProv   = selectedProv?.owner === playerKingdomId;
  const isEnemyProv = selectedProv && selectedProv.owner !== playerKingdomId;
  const hasOrders   = orders > 0;
  const hasDiploOrders = isQin ? orders >= 2 : orders >= 1;

  const otherKingdoms = Object.values(kingdoms).filter(
    (k) => k.id !== playerKingdomId && !k.isEliminated
  );

  // Check if selected province has used its domestic slot
  const provDomesticUsed = !!(pid && provinceDomesticUsed?.[pid]);

  // Check if player army in selected province has already acted
  const armyInProv = pid
    ? Object.values(gameState.armies).find(
        (a) => a.kingdomId === playerKingdomId && a.provinceId === pid && a.size > 0
      )
    : null;
  const armyActed = !!(armyInProv && armyCampaignUsed?.[armyInProv.id]);

  function startAttack() {
    if (!isPlanning || !hasOrders) return;
    setAction('attack');
    setPendingMoveArmy(null);
  }

  function startMove() {
    if (!isPlanning || !hasOrders) return;
    setAction('move');
    setPendingMoveArmy(null);
  }

  function cancel() { setAction(null); }

  function handleReform(reform: ReformType) {
    queueAction({ type: 'reform', apCost: 1, reform });
    setShowReform(false);
  }

  function handleTribute() {
    if (!tributeTarget) return;
    queueAction({ type: 'diplomacy_tribute', apCost: 1, targetKingdomId: tributeTarget, tributeAmount });
    setShowDiplo(false);
  }

  const isAttack = actionBeingPlanned === 'attack';
  const isMove   = actionBeingPlanned === 'move';
  const isBusy   = !!actionBeingPlanned;

  // ── Derived disable reasons ──────────────────────────────
  const noOrdersTip       = 'No Orders remaining this season — end season to refresh';
  const noProvTip         = 'Select one of your provinces first';
  const noEnemyProvTip    = 'Select an enemy province first';
  const domUsedTip        = `${selectedProv?.name ?? 'This province'} already used its domestic action this season`;
  const armyActedTip      = `${armyInProv?.name ?? 'Army'} already acted this season`;
  const noBarracksTip     = 'Build a barracks first (or use your capital)';

  const canBuild  = isPlanning && isOwnProv && !provDomesticUsed;
  const canRecruit = isPlanning && isOwnProv && !provDomesticUsed
    && !!(selectedProv?.hasBarracks || selectedProv?.isCapital || playerKingdomId === 'qi');

  const buildDisableReason = !isPlanning ? '' : !isOwnProv ? noProvTip : provDomesticUsed ? domUsedTip : '';
  const recruitDisableReason = !isPlanning ? '' : !isOwnProv ? noProvTip
    : provDomesticUsed ? domUsedTip
    : !(selectedProv?.hasBarracks || selectedProv?.isCapital || playerKingdomId === 'qi') ? noBarracksTip
    : '';

  const attackDisableReason = !isPlanning ? '' : !hasOrders ? noOrdersTip : '';
  const moveDisableReason   = !isPlanning ? '' : !hasOrders ? noOrdersTip : '';
  const scoutDisableReason  = !isPlanning ? '' : !hasOrders ? noOrdersTip : !isEnemyProv ? noEnemyProvTip : '';
  const sabDisableReason    = !isPlanning ? '' : !hasOrders ? noOrdersTip : !isEnemyProv ? noEnemyProvTip : '';
  const diploDisableReason  = !isPlanning ? '' : !hasDiploOrders ? (isQin ? 'Qin diplomacy costs 2 Orders' : noOrdersTip) : '';

  return (
    <div className="h-full flex items-center px-3 gap-1.5 overflow-x-auto">

      {/* ── Military ─────────────────────────── */}
      <Group label="Military">
        <Btn
          label="⚔ Attack"
          tip={attackDisableReason || `Attack adjacent enemy province (1 Order) — A`}
          active={isAttack}
          danger
          disabled={!isPlanning || !hasOrders}
          onClick={isAttack ? cancel : startAttack}
        />
        <Btn
          label="⇒ Move"
          tip={moveDisableReason || `Move army to friendly province (1 Order) — M`}
          active={isMove}
          disabled={!isPlanning || !hasOrders}
          onClick={isMove ? cancel : startMove}
        />
        <Btn
          label="🪖 Recruit"
          tip={recruitDisableReason || `Recruit 30 troops — free, uses province domestic slot — R`}
          disabled={!canRecruit}
          onClick={() => {
            if (!pid || !isOwnProv) return;
            queueAction({ type: 'recruit', apCost: 0, provinceId: pid, recruitAmount: 3 });
          }}
        />
      </Group>

      <Divider />

      {/* ── Build ────────────────────────────── */}
      <Group label="Build (free)">
        <Btn label="🌱 Farm"
          tip={buildDisableReason || (selectedProv?.hasFarm ? 'Farm already built' : 'Build farm +2 food/season — free, uses province slot')}
          disabled={!canBuild || !!selectedProv?.hasFarm}
          onClick={() => pid && queueAction({ type: 'build', apCost: 0, provinceId: pid, buildingType: 'farm' })}
        />
        <Btn label="🏪 Market"
          tip={buildDisableReason || (selectedProv?.hasMarket ? 'Market already built' : 'Build market +2 income/season — free, uses province slot')}
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
          tip={scoutDisableReason || 'Reveal enemy province details for 3 seasons (1 Order) — S'}
          disabled={!isPlanning || !hasOrders || !isEnemyProv}
          onClick={() => pid && queueAction({ type: 'espionage_scout', apCost: 1, targetProvinceId: pid })}
        />
        <Btn label="🗡 Sabotage"
          tip={sabDisableReason || 'Reduce enemy garrison 15–30%. May be detected (1 Order)'}
          disabled={!isPlanning || !hasOrders || !isEnemyProv}
          onClick={() => pid && queueAction({ type: 'espionage_sabotage', apCost: 1, targetProvinceId: pid })}
        />
        <Btn label="😠 Incite"
          tip={sabDisableReason || 'Raise enemy province unrest +15–25. May be detected (1 Order)'}
          disabled={!isPlanning || !hasOrders || !isEnemyProv}
          onClick={() => pid && queueAction({ type: 'espionage_incite', apCost: 1, targetProvinceId: pid })}
        />
      </Group>

      <Divider />

      {/* ── Diplomacy ────────────────────────── */}
      <Group label="Diplomacy">
        <div className="relative">
          <Btn
            label="✋ NAP"
            tip={diploDisableReason || `Propose Non-Aggression Pact (${isQin ? '2' : '1'} Order)`}
            disabled={!isPlanning || !hasDiploOrders}
            onClick={() => { setShowDiplo(!showDiplo); setShowReform(false); }}
          />
          {showDiplo && (
            <div className="absolute bottom-full mb-1 left-0 bg-gray-950 border border-gray-700 rounded-lg p-3 min-w-52 z-50 shadow-xl">
              <div className="text-xs text-gray-400 mb-2 font-medium">Propose NAP to:</div>
              <div className="space-y-0.5 mb-3">
                {otherKingdoms.map((k) => {
                  const rel = gameState.relations[playerKingdomId]?.[k.id];
                  const hasNap = rel?.treaty?.type === 'nap';
                  const score = rel?.score ?? 0;
                  return (
                    <button
                      key={k.id}
                      className={`w-full text-left text-xs px-2 py-1.5 rounded flex justify-between items-center hover:bg-gray-800 ${hasNap ? 'opacity-40 cursor-not-allowed' : ''}`}
                      disabled={hasNap}
                      onClick={() => {
                        queueAction({ type: 'diplomacy_nap', apCost: isQin ? 2 : 1, targetKingdomId: k.id });
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

      {/* ── Reform ───────────────────────────── */}
      <div className="relative">
        <Btn
          label={`📜 Reform${player.activeReform ? ' ●' : ''}`}
          tip={!hasOrders ? noOrdersTip : 'Enact a kingdom-wide policy (1 Order). Only 1 active at a time.'}
          disabled={!isPlanning || !hasOrders}
          onClick={() => { setShowReform(!showReform); setShowDiplo(false); }}
        />
        {showReform && (
          <div className="absolute bottom-full mb-1 right-0 bg-gray-950 border border-gray-700 rounded-lg p-3 min-w-56 z-50 shadow-xl">
            <div className="text-xs text-gray-400 mb-2 font-medium">Choose Reform:</div>
            <div className="space-y-1">
              {REFORM_OPTIONS.map((r) => (
                <button
                  key={r.id}
                  className={`w-full text-left text-xs px-2 py-2 rounded hover:bg-gray-800 border ${
                    player.activeReform === r.id
                      ? 'border-amber-700 bg-amber-950/30'
                      : 'border-transparent'
                  }`}
                  onClick={() => handleReform(r.id)}
                >
                  <div className="font-medium text-gray-200">{r.label}{player.activeReform === r.id ? ' ✓' : ''}</div>
                  <div className="flex gap-2 mt-0.5">
                    <span className="text-green-500">{r.bonus}</span>
                    <span className="text-red-500">{r.penalty}</span>
                  </div>
                </button>
              ))}
            </div>
            <button className="text-xs text-gray-600 mt-2 hover:text-gray-400" onClick={() => setShowReform(false)}>Close</button>
          </div>
        )}
      </div>

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
        <span title="Attack">A</span>
        <span title="Move">M</span>
        <span title="Scout selected">S</span>
        <span title="Recruit at selected">R</span>
        <span title="End season">↵</span>
        <span title="Cancel">Esc</span>
      </div>

      {/* End season */}
      <button
        className={`btn-primary px-5 py-2 shrink-0 font-medium ${!isPlanning ? 'opacity-50 cursor-not-allowed' : ''}`}
        disabled={!isPlanning}
        onClick={endTurn}
        title="End Season [Enter]"
      >
        End Season ▶
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
