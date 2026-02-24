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
      // Don't fire when typing in an input/select
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if (!isPlanning) return;

      const ap = gameState.actionPointsRemaining;

      switch (e.key.toLowerCase()) {
        case 'escape':
          setAction(null);
          break;
        case 'a':
          if (ap >= 1) { setAction('attack'); setPendingMoveArmy(null); }
          break;
        case 'm':
          if (ap >= 1) { setAction('move'); setPendingMoveArmy(null); }
          break;
        case 's': {
          const pid = gameState.selectedProvinceId;
          if (pid && ap >= 1) {
            const p = gameState.provinces[pid];
            if (p && p.owner !== gameState.playerKingdomId) {
              queueAction({ type: 'espionage_scout', apCost: 1, targetProvinceId: pid });
            }
          }
          break;
        }
        case 'r': {
          const pid = gameState.selectedProvinceId;
          if (pid && ap >= 1) {
            const p = gameState.provinces[pid];
            if (p?.owner === gameState.playerKingdomId && (p.hasBarracks || p.isCapital)) {
              queueAction({ type: 'recruit', apCost: 1, provinceId: pid, recruitAmount: 3 });
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

        {/* AP pips */}
        <div className="flex gap-1 items-center">
          {Array.from({ length: gameState.maxActionPoints }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full border ${
                i < gameState.actionPointsRemaining
                  ? 'bg-amber-500 border-amber-400'
                  : 'bg-gray-800 border-gray-700'
              }`}
            />
          ))}
          <span className="text-gray-500 ml-0.5">{gameState.actionPointsRemaining} AP</span>
        </div>

        <span className="text-gray-700">·</span>
        <span className="text-gray-400">
          {SEASON_NAMES[gameState.season % 4]}, {gameState.year} BCE
        </span>

        {gameState.phase === 'executing' && (
          <span className="text-amber-400 animate-pulse font-medium">⚡ Resolving…</span>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left panel */}
        <div className="w-52 shrink-0 border-r border-gray-800 overflow-hidden">
          <KingdomInfo />
        </div>

        {/* Center map */}
        <div className="flex-1 min-w-0 overflow-hidden relative">
          <MapView className="w-full h-full" />
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

function HelpOverlay({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
      <div className="bg-gray-950 border border-gray-700 rounded-xl p-6 max-w-lg w-full shadow-2xl">
        <h2 className="text-xl font-bold gold mb-4">How to Play</h2>
        <div className="space-y-3 text-sm text-gray-300">
          <HelpRow icon="🗺" label="Select a province" desc="Click any province on the map to see details in the right panel." />
          <HelpRow icon="⚔" label="Attack" desc="Press A (or click Attack), then click your army's province, then an adjacent enemy province. Hover to see battle odds." />
          <HelpRow icon="⇒" label="Move" desc="Press M, click your army's province, then a friendly province to reposition." />
          <HelpRow icon="🏗" label="Build & Recruit" desc="Select one of your provinces, then use the buttons in the right panel or action bar." />
          <HelpRow icon="🔍" label="Scout" desc="Select an enemy province and press S (or click Scout) to reveal its details." />
          <HelpRow icon="▶" label="End Season" desc="Press Enter or click End Season. AI kingdoms act, combat resolves, economy updates." />
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
