import React from 'react';
import { useGameStore } from '../store/gameStore';
import type { LedgerEvent } from '../engine/types';

interface Props {
  onClose: () => void;
}

export default function WarLedger({ onClose }: Props) {
  const gameState = useGameStore((s) => s.gameState!);
  const ledger    = (gameState.warLedger ?? []).slice().reverse();

  return (
    <div className="absolute top-0 right-0 bottom-0 w-72 z-30 flex flex-col border-l border-gray-800"
      style={{ background: '#0d0d0d' }}
    >
      <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
          📜 War Ledger
        </span>
        <button
          className="text-gray-600 hover:text-gray-400 leading-none"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5" style={{ scrollbarWidth: 'thin' }}>
        {ledger.length === 0 ? (
          <div className="text-xs text-gray-600 italic text-center py-8">
            No events yet.
          </div>
        ) : (
          ledger.map((ev) => (
            <LedgerCard key={ev.id} event={ev} />
          ))
        )}
      </div>
    </div>
  );
}

function LedgerCard({ event }: { event: LedgerEvent }) {
  const gameState   = useGameStore((s) => s.gameState!);
  const setSelected = useGameStore((s) => s.setSelectedProvince);

  const handleClick = () => {
    if (event.provinceId) setSelected(event.provinceId);
  };

  const iconMap: Record<string, string> = {
    battle:      '⚔',
    treaty:      '✋',
    elimination: '💀',
    succession:  '👑',
    economy:     '🏗',
  };

  const borderMap: Record<string, string> = {
    battle:      event.attackerWon ? 'border-red-900' : 'border-blue-900',
    treaty:      'border-green-900',
    elimination: 'border-purple-900',
    succession:  'border-amber-900',
    economy:     'border-gray-800',
  };

  const atkK = event.attackerKingdomId ? gameState.kingdoms[event.attackerKingdomId] : null;
  const defK = event.defenderKingdomId ? gameState.kingdoms[event.defenderKingdomId] : null;

  return (
    <div
      className={`rounded border ${borderMap[event.type] ?? 'border-gray-800'} bg-gray-900/80 p-2 text-xs cursor-pointer hover:bg-gray-800 transition-colors`}
      onClick={handleClick}
      title={event.provinceId ? 'Click to focus map' : undefined}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span>{iconMap[event.type] ?? '·'}</span>
        {atkK && (
          <span className="font-medium" style={{ color: atkK.color }}>{atkK.name}</span>
        )}
        {atkK && defK && <span className="text-gray-700">vs</span>}
        {defK && (
          <span className="font-medium" style={{ color: defK.color }}>{defK.name}</span>
        )}
        <span className="ml-auto text-gray-700 text-[10px] shrink-0">
          Day {Math.floor(event.dayResolved)}
        </span>
      </div>
      <div className="text-gray-400 leading-relaxed text-[11px]">
        {event.message}
      </div>
    </div>
  );
}
