import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import MapView from './MapView';
import KingdomInfo from './KingdomInfo';
import ProvinceInfo from './ProvinceInfo';
import ActionBar from './ActionBar';
import SeasonSummary from './SeasonSummary';
import WarLedger from './WarLedger';
import CommandBox from './CommandBox';

const SEASON_NAMES = ['Winter', 'Spring', 'Summer', 'Autumn'];

// ── Toast notification system ─────────────────────────────────

interface Toast {
  id: number;
  message: string;
  type: 'info' | 'success' | 'danger' | 'warning';
}

let toastId = 0;

// ── RAF game loop ─────────────────────────────────────────────
// Runs as a singleton effect inside GameBoard so it shares the React tree.

function useGameLoop() {
  const tickFn     = useGameStore((s) => s.tick);
  const rafRef     = useRef<number | null>(null);
  const lastMsRef  = useRef<number>(performance.now());
  const accumRef   = useRef<number>(0);   // fractional days accumulated

  useEffect(() => {
    function frame() {
      const state = useGameStore.getState().gameState;

      if (
        state &&
        !state.paused &&
        !state.isGameOver &&
        state.phase === 'player_planning'
      ) {
        const now = performance.now();
        const elapsedMs = Math.min(now - lastMsRef.current, 200); // cap at 200 ms
        lastMsRef.current = now;

        // Accumulate fractional game-days
        accumRef.current += (elapsedMs / 1000) * state.speed;

        const wholeDays = Math.floor(accumRef.current);
        if (wholeDays > 0) {
          accumRef.current -= wholeDays;
          // tick() already caps internally at 60 days per call
          tickFn(wholeDays);
        }
      } else {
        // While paused / in summary / game over, just reset the real-time baseline
        // so we don't skip ahead when unpausing.
        lastMsRef.current = performance.now();
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    lastMsRef.current = performance.now();
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [tickFn]);
}

export default function GameBoard() {
  const gameState          = useGameStore((s) => s.gameState!);
  const queueAction        = useGameStore((s) => s.queueAction);
  const setAction          = useGameStore((s) => s.setActionBeingPlanned);
  const setPendingMoveArmy = useGameStore((s) => s.setPendingMoveArmy);
  const dismissHelp        = useGameStore((s) => s.dismissHelp);
  const acceptProposal     = useGameStore((s) => s.acceptProposal);
  const declineProposal    = useGameStore((s) => s.declineProposal);
  const togglePause        = useGameStore((s) => s.togglePause);
  const setSpeed           = useGameStore((s) => s.setSpeed);

  // Start the RAF game loop
  useGameLoop();

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showLedger, setShowLedger] = useState(false);
  const [showCommand, setShowCommand] = useState(false);

  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = ++toastId;
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const playerKingdom = gameState.kingdoms[gameState.playerKingdomId];
  const isPlanning    = gameState.phase === 'player_planning';

  // Selected proposal for Y/N keyboard shortcuts
  const firstProposal = gameState.diplomaticInbox[0] ?? null;

  // ── Keyboard shortcuts ─────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      // Ready armies (not marching)
      const readyArmies = Object.values(gameState.armies).filter(
        (a) => a.kingdomId === gameState.playerKingdomId && a.size > 0 && !(gameState.activeMovements ?? {})[a.id]
      );

      switch (e.key) {
        // ── Command box — C ────────────────────────────────────
        case 'c':
        case 'C':
          e.preventDefault();
          setShowCommand((v) => !v);
          break;

        // ── Pause / resume — Space ─────────────────────────────
        case ' ':
          e.preventDefault();
          togglePause();
          addToast(gameState.paused ? '▶ Resumed' : '⏸ Paused', 'info');
          break;

        // ── Speed controls — 1 / 2 / 3 / 4 ───────────────────
        case '1': setSpeed(1); addToast('Speed: 1×', 'info'); break;
        case '2': setSpeed(2); addToast('Speed: 2×', 'info'); break;
        case '3': setSpeed(4); addToast('Speed: 4×', 'info'); break;
        case '4': setSpeed(8); addToast('Speed: 8×', 'info'); break;

        // ── Global ────────────────────────────────────────────
        case 'Escape':
          setAction(null);
          break;

        // ── Military ──────────────────────────────────────────
        case 'a':
        case 'A':
          if (isPlanning) {
            setAction('attack');
            // Auto-select if only one ready army
            if (readyArmies.length === 1) {
              setPendingMoveArmy(readyArmies[0].id);
            } else {
              setPendingMoveArmy(null);
            }
          }
          break;
        case 'm':
        case 'M':
          if (isPlanning) {
            setAction('move');
            if (readyArmies.length === 1) {
              setPendingMoveArmy(readyArmies[0].id);
            } else {
              setPendingMoveArmy(null);
            }
          }
          break;

        // ── Split army ────────────────────────────────────────
        case 'x':
        case 'X': {
          if (!isPlanning) break;
          const pid = gameState.selectedProvinceId;
          if (!pid) { addToast('Select a province with your army first.', 'warning'); break; }
          const army = Object.values(gameState.armies).find(
            (a) => a.kingdomId === gameState.playerKingdomId && a.provinceId === pid && a.size >= 2000
          );
          if (army) {
            queueAction({ type: 'split_army', apCost: 0, armyId: army.id, splitFraction: 0.5 });
          } else {
            addToast('No eligible army here to split (need 2000+ troops).', 'warning');
          }
          break;
        }

        // ── Intel / scout ──────────────────────────────────────
        case 'i':
        case 'I': {
          if (!isPlanning) break;
          const pid = gameState.selectedProvinceId;
          if (pid) {
            const p = gameState.provinces[pid];
            if (p && p.owner !== gameState.playerKingdomId) {
              queueAction({ type: 'espionage_scout', apCost: 0, targetProvinceId: pid });
            }
          }
          break;
        }

        // ── Recruit ───────────────────────────────────────────
        case 'r':
        case 'R': {
          if (!isPlanning) break;
          const pid = gameState.selectedProvinceId;
          if (pid) {
            const p = gameState.provinces[pid];
            if (p?.owner === gameState.playerKingdomId && (p.hasBarracks || p.isCapital)) {
              queueAction({ type: 'recruit', apCost: 0, provinceId: pid, recruitAmount: 3 });
            }
          }
          break;
        }

        // ── Diplomacy inbox: Y accept, N decline ──────────────
        case 'y':
        case 'Y': {
          if (firstProposal) {
            acceptProposal(firstProposal.id);
            addToast(`Accepted proposal from ${gameState.kingdoms[firstProposal.fromKingdomId]?.name ?? '?'}.`, 'success');
          }
          break;
        }
        case 'n':
        case 'N': {
          if (firstProposal) {
            declineProposal(firstProposal.id);
            addToast(`Declined proposal from ${gameState.kingdoms[firstProposal.fromKingdomId]?.name ?? '?'}.`, 'warning');
          }
          break;
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    isPlanning, gameState, setAction, setPendingMoveArmy, queueAction,
    firstProposal, acceptProposal, declineProposal, addToast, togglePause, setSpeed,
  ]);

  const recentEvents = gameState.turnLog
    .filter((e) => e.type !== 'economy')
    .slice(-8)
    .reverse();

  // Derive season name from absolute season number
  const seasonName = SEASON_NAMES[gameState.season % 4] ?? 'Unknown';

  // How many armies are currently marching
  const marchingCount = Object.keys(gameState.activeMovements ?? {}).length;

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
        {/* Ruler display */}
        {playerKingdom.ruler && (
          <>
            <span className="text-gray-500" title={`${playerKingdom.ruler.name} — ${playerKingdom.ruler.traits.join(', ')} · Age ${playerKingdom.ruler.age}`}>
              👑 {playerKingdom.ruler.name}
            </span>
            <span className="text-gray-700">·</span>
          </>
        )}
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

        <span className="text-gray-400">
          {seasonName}, {gameState.year} BCE
          <span className="text-gray-600 ml-1">
            (Day {Math.floor(gameState.gameTimeDays)})
          </span>
        </span>

        {/* Marching indicator */}
        {marchingCount > 0 && (
          <span className="text-amber-500 animate-pulse text-xs" title="Armies marching">
            ⚔ {marchingCount} marching
          </span>
        )}

        {/* Inbox badge */}
        {gameState.diplomaticInbox.filter((p) => p.status === 'pending').length > 0 && (
          <span
            className="bg-purple-700 text-white text-xs px-1.5 py-0.5 rounded-full font-bold cursor-help"
            title="Diplomatic proposals await — check Diplomacy tab. Press Y to accept, N to decline."
          >
            ✉ {gameState.diplomaticInbox.filter((p) => p.status === 'pending').length}
          </span>
        )}

        {/* Pause indicator */}
        {gameState.paused && (
          <span className="text-yellow-400 font-medium">⏸ Paused</span>
        )}

        {/* Command box toggle */}
        <button
          className={`text-xs px-2 py-0.5 rounded border transition-colors ${
            showCommand
              ? 'bg-amber-900/50 border-amber-700 text-amber-300'
              : 'bg-gray-900 border-gray-700 text-gray-500 hover:text-gray-300'
          }`}
          onClick={() => setShowCommand((v) => !v)}
          title="Command box — type intent commands (C)"
        >
          ⌘ Command
        </button>

        {/* War Ledger toggle */}
        <button
          className={`text-xs px-2 py-0.5 rounded border transition-colors ${
            showLedger
              ? 'bg-amber-900/50 border-amber-700 text-amber-300'
              : 'bg-gray-900 border-gray-700 text-gray-500 hover:text-gray-300'
          }`}
          onClick={() => setShowLedger((v) => !v)}
          title="Toggle War Ledger (recent events)"
        >
          📜 Ledger {(gameState.warLedger?.length ?? 0) > 0 && <span className="text-[10px]">({gameState.warLedger!.length})</span>}
        </button>
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

          {/* Toast notifications overlay */}
          {toasts.length > 0 && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 flex flex-col gap-1.5 z-50 pointer-events-none">
              {toasts.map((t) => (
                <div
                  key={t.id}
                  className={`text-xs px-3 py-1.5 rounded-lg shadow-xl font-medium animate-pulse-once
                    ${t.type === 'success' ? 'bg-green-900/90 text-green-300 border border-green-700'
                    : t.type === 'danger'  ? 'bg-red-900/90 text-red-300 border border-red-700'
                    : t.type === 'warning' ? 'bg-amber-900/90 text-amber-300 border border-amber-700'
                    : 'bg-gray-900/90 text-gray-300 border border-gray-700'}`}
                >
                  {t.message}
                </div>
              ))}
            </div>
          )}

          {/* Recent events strip */}
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
        {!showLedger && (
          <div className="w-60 shrink-0 border-l border-gray-800 overflow-hidden">
            <ProvinceInfo />
          </div>
        )}
        {showLedger && (
          <div className="w-72 shrink-0 border-l border-gray-800 overflow-hidden relative">
            <WarLedger onClose={() => setShowLedger(false)} />
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="h-14 shrink-0 border-t border-gray-800" style={{ background: '#0d0d0d' }}>
        <ActionBar />
      </div>

      {/* Season summary modal */}
      <SeasonSummary />

      {/* Command box overlay */}
      {showCommand && (
        <CommandBox onClose={() => setShowCommand(false)} />
      )}

      {/* First-play help overlay */}
      {!gameState.helpSeen && (
        <HelpOverlay onDismiss={dismissHelp} />
      )}
    </div>
  );
}

function eventColor(type: string): string {
  switch (type) {
    case 'combat':     return 'text-red-400';
    case 'diplomacy':  return 'text-purple-400';
    case 'espionage':  return 'text-yellow-400';
    case 'player':     return 'text-amber-300';
    case 'succession': return 'text-blue-300';
    default:           return 'text-gray-500';
  }
}

function eventIcon(type: string): string {
  switch (type) {
    case 'combat':     return '⚔';
    case 'diplomacy':  return '✋';
    case 'espionage':  return '🔍';
    case 'player':     return '▶';
    case 'succession': return '👑';
    default:           return '·';
  }
}

function HelpOverlay({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
      <div className="bg-gray-950 border border-gray-700 rounded-xl p-6 max-w-lg w-full shadow-2xl">
        <h2 className="text-xl font-bold gold mb-1">How to Play</h2>
        <p className="text-xs text-gray-500 mb-4">Ancient Warring States — 475 BCE — Real-time simulation</p>
        <div className="space-y-3 text-sm text-gray-300">
          <HelpRow icon="⏸" label="Time controls" desc="Press Space to pause/resume. Keys 1/2/3/4 set speed (1×/2×/4×/8× game-days per second). Use bottom bar buttons too." />
          <HelpRow icon="⚔" label="Attack (A)" desc="Press A (or click ⚔ Attack) — click an enemy province to attack. If only one army exists it's auto-selected. Watch it march on the map!" />
          <HelpRow icon="⇒" label="Move (M)" desc="Press M — click a friendly adjacent province. Movement takes 3–8 game-days by terrain (plains fastest, mountains slowest)." />
          <HelpRow icon="✂" label="Split Army (X)" desc="Split selected army 50/50. Useful for multi-front defense." />
          <HelpRow icon="👥" label="Levy (L)" desc="Emergency manpower levy: costs gold and stability, 4-season cooldown. No other limits." />
          <HelpRow icon="🏗" label="Build & Recruit (R)" desc="Each province may build/recruit once per season (domestic slot). No Orders needed." />
          <HelpRow icon="🔍" label="Espionage (I)" desc="Scout, sabotage, or incite unrest in enemy provinces. Select the province then press I or use the Intel buttons." />
          <HelpRow icon="✉" label="Diplomacy inbox (Y/N)" desc="AI kingdoms send NAP proposals. Press Y to accept, N to decline. You always choose — nothing is auto-signed." />
          <HelpRow icon="👑" label="Rulers" desc="Each kingdom has a ruler with military/diplomacy/admin stats. Rulers age and die — successors shift strategy." />
          <div className="border-t border-gray-800 pt-3 text-gray-500 text-xs">
            <strong className="text-gray-400">Win:</strong> Control 60% of provinces or capture 3 enemy capitals. &nbsp;
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
