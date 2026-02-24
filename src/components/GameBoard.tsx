import React, { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import MapView from './MapView';
import KingdomInfo from './KingdomInfo';
import ProvinceInfo from './ProvinceInfo';
import ActionBar from './ActionBar';
import SeasonSummary from './SeasonSummary';

const SEASON_NAMES = ['Winter', 'Spring', 'Summer', 'Autumn'];

export default function GameBoard() {
  const gameState          = useGameStore((s) => s.gameState!);
  const endTurn            = useGameStore((s) => s.endTurn);
  const queueAction        = useGameStore((s) => s.queueAction);
  const setAction          = useGameStore((s) => s.setActionBeingPlanned);
  const setPendingMoveArmy = useGameStore((s) => s.setPendingMoveArmy);
  const dismissHelp        = useGameStore((s) => s.dismissHelp);

  const playerKingdom = gameState.kingdoms[gameState.playerKingdomId];
  const isPlanning    = gameState.phase === 'player_planning';

  // ── Keyboard shortcuts ─────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if (!isPlanning) return;

      const hasOrders = gameState.ordersRemaining > 0;

      switch (e.key.toLowerCase()) {
        case 'escape':
          setAction(null);
          break;
        case 'a':
          if (hasOrders) { setAction('attack'); setPendingMoveArmy(null); }
          break;
        case 'm':
          if (hasOrders) { setAction('move'); setPendingMoveArmy(null); }
          break;
        case 's': {
          const pid = gameState.selectedProvinceId;
          if (pid && hasOrders) {
            const p = gameState.provinces[pid];
            if (p && p.owner !== gameState.playerKingdomId) {
              queueAction({ type: 'espionage_scout', apCost: 1, targetProvinceId: pid });
            }
          }
          break;
        }
        case 'r': {
          const pid = gameState.selectedProvinceId;
          if (pid) {
            const p = gameState.provinces[pid];
            if (p?.owner === gameState.playerKingdomId && (p.hasBarracks || p.isCapital)) {
              queueAction({ type: 'recruit', apCost: 0, provinceId: pid, recruitAmount: 3 });
            }
          }
          break;
        }
        case 'enter':
          endTurn();
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPlanning, gameState, endTurn, setAction, setPendingMoveArmy, queueAction]);

  const orders = gameState.ordersRemaining;
  const maxOrders = gameState.maxOrders;

  // Recent events (last 8 from turnLog, excluding economy noise)
  const recentEvents = gameState.turnLog
    .filter((e) => e.type !== 'economy')
    .slice(-8)
    .reverse();

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: '#080808' }}>
      {/* Top bar */}
      <div
        className="h-9 shrink-0 flex items-center px-4 gap-3 text-xs border-b border-gray-800"
        style={{ background: '#0d0d0d' }}
      >
        <div
          className="font-bold tracking-widest uppercase text-sm"
          style={{ color: playerKingdom.color }}
        >
          {playerKingdom.name}
        </div>
        <span className="text-gray-700">·</span>
        <span className="text-gray-500">{playerKingdom.archetype}</span>
        <span className="text-gray-700">·</span>

        <span className="text-amber-400" title="Treasury">
          💰 {Math.floor(playerKingdom.treasury)}
        </span>
        <span className="text-green-400" title="Food stores">
          🌾 {Math.floor(playerKingdom.food)}
        </span>
        <span className="text-blue-400" title="Manpower pool">
          ⚔ {Math.floor(playerKingdom.manpower)}
        </span>
        <span
          title="Stability (0=collapse)"
          className={
            playerKingdom.stability > 60 ? 'text-green-400'
            : playerKingdom.stability > 30 ? 'text-yellow-400'
            : 'text-red-400'
          }
        >
          ⚖ {playerKingdom.stability}
        </span>

        <div className="flex-1" />

        {/* Orders pips */}
        <div className="flex gap-1 items-center" title={`${orders}/${maxOrders} Orders remaining. Campaign actions (Move, Attack, Espionage, Diplomacy, Reform) each cost 1 Order.`}>
          {Array.from({ length: maxOrders }).map((_, i) => (
            <div
              key={i}
              className={`w-3.5 h-3.5 rounded border-2 ${
                i < orders
                  ? 'bg-amber-500 border-amber-400'
                  : 'bg-gray-800 border-gray-700'
              }`}
            />
          ))}
          <span className="text-gray-400 ml-1 font-medium">
            {orders}/{maxOrders} Orders
          </span>
        </div>

        <span className="text-gray-700">·</span>
        <span className="text-gray-400">
          {SEASON_NAMES[gameState.season % 4]}, {gameState.year} BCE
        </span>

        {/* Inbox badge */}
        {gameState.diplomaticInbox.length > 0 && (
          <span
            className="bg-purple-700 text-white text-xs px-1.5 py-0.5 rounded-full font-bold"
            title="Diplomatic proposals await your decision"
          >
            ✉ {gameState.diplomaticInbox.length}
          </span>
        )}

        {gameState.phase === 'executing' && (
          <span className="text-amber-400 animate-pulse font-medium">⚡ Resolving…</span>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left panel */}
        <div className="w-56 shrink-0 border-r border-gray-800 overflow-hidden flex flex-col">
          <KingdomInfo />
        </div>

        {/* Center map */}
        <div className="flex-1 min-w-0 overflow-hidden relative flex flex-col">
          <MapView className="flex-1 min-h-0" />

          {/* Recent events strip — visible during planning */}
          {isPlanning && recentEvents.length > 0 && (
            <div
              className="shrink-0 border-t border-gray-800 overflow-x-auto whitespace-nowrap"
              style={{ background: '#0a0a0a', height: '22px' }}
            >
              <div className="flex items-center h-full px-3 gap-4">
                <span className="text-gray-600 text-[10px] uppercase tracking-wider shrink-0">Recent</span>
                {recentEvents.map((e, i) => (
                  <span key={i} className={`text-[11px] shrink-0 ${eventColor(e.type)}`}>
                    {eventIcon(e.type)} {e.message}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="w-60 shrink-0 border-l border-gray-800 overflow-hidden">
          <ProvinceInfo />
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="h-14 shrink-0 border-t border-gray-800" style={{ background: '#0d0d0d' }}>
        <ActionBar />
      </div>

      {/* Season summary modal */}
      <SeasonSummary />

      {/* First-play help overlay */}
      {!gameState.helpSeen && (
        <HelpOverlay onDismiss={dismissHelp} />
      )}
    </div>
  );
}

function eventColor(type: string): string {
  switch (type) {
    case 'combat': return 'text-red-400';
    case 'diplomacy': return 'text-purple-400';
    case 'espionage': return 'text-yellow-400';
    case 'player': return 'text-amber-300';
    default: return 'text-gray-500';
  }
}

function eventIcon(type: string): string {
  switch (type) {
    case 'combat': return '⚔';
    case 'diplomacy': return '✋';
    case 'espionage': return '🔍';
    case 'player': return '▶';
    default: return '·';
  }
}

function HelpOverlay({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
      <div className="bg-gray-950 border border-gray-700 rounded-xl p-6 max-w-lg w-full shadow-2xl">
        <h2 className="text-xl font-bold gold mb-1">How to Play</h2>
        <p className="text-xs text-gray-500 mb-4">Ancient Warring States — 475 BCE</p>
        <div className="space-y-3 text-sm text-gray-300">
          <HelpRow icon="📋" label="Orders system" desc="You have 2 Orders per season for campaign actions: Move, Attack, Espionage, Diplomacy, Reform. Build and Recruit are free domestic actions (one per province per season)." />
          <HelpRow icon="⚔" label="Attack (A)" desc="Press A, click your army's province, then hover an enemy province to see odds. Click to attack." />
          <HelpRow icon="⇒" label="Move (M)" desc="Press M, click your army's province, then click a friendly adjacent province." />
          <HelpRow icon="🏗" label="Build & Recruit (B/R)" desc="Select your province in the right panel or action bar. Free — no Orders needed, but only once per province per season." />
          <HelpRow icon="✉" label="Diplomacy inbox" desc="AI kingdoms may send proposals (NAP offers, tribute, pacts). Check the purple badge on the top bar." />
          <HelpRow icon="▶" label="End Season (Enter)" desc="AI kingdoms act, combat resolves, economy updates. Your Orders and all slots reset." />
          <div className="border-t border-gray-800 pt-3 text-gray-500 text-xs">
            <strong className="text-gray-400">Win:</strong> Control 60% of provinces (24+) or capture 3 enemy capitals. &nbsp;
            <strong className="text-gray-400">Lose:</strong> Your capital is captured or stability hits 0.
          </div>
        </div>
        <button className="btn-primary w-full mt-5 py-2" onClick={onDismiss}>
          Begin Campaign — Good luck!
        </button>
      </div>
    </div>
  );
}

function HelpRow({ icon, label, desc }: { icon: string; label: string; desc: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-lg w-6 flex-shrink-0">{icon}</span>
      <div>
        <span className="font-semibold text-gray-100">{label}: </span>
        <span>{desc}</span>
      </div>
    </div>
  );
}
