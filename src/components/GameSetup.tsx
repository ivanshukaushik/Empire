import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { KINGDOM_DEFS } from '../data/gameData';
import { resolveSeed } from '../config';

const KINGDOM_EMOJI: Record<string, string> = {
  qin: '🏛',
  zhao: '🐴',
  yan: '🕵',
  qi: '💰',
  wei: '🏹',
  han: '🏰',
  chu: '🌊',
  zhongshan: '🛡',
};

export default function GameSetup() {
  const [selected, setSelected] = useState<string>('');
  const [hasSave, setHasSave] = useState(
    () => !!(localStorage.getItem('warring-states-v2-save') ?? localStorage.getItem('warring-states-v1-save'))
  );
  const newGame = useGameStore((s) => s.newGame);
  const loadGame = useGameStore((s) => s.loadGame);

  function start() {
    if (!selected) return;
    newGame(resolveSeed(), selected);
  }

  function resume() {
    const ok = loadGame();
    if (!ok) setHasSave(false);
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4 overflow-y-auto">
      {/* Title */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold gold mb-1" style={{ letterSpacing: '0.12em' }}>
          ANCIENT WARRING STATES
        </h1>
        <p className="text-gray-400 text-sm">475 BCE — Eight kingdoms. One throne.</p>
      </div>

      {/* Resume */}
      {hasSave && (
        <div className="mb-6">
          <button className="btn-primary px-6 py-2" onClick={resume}>
            ▶ Resume Saved Game
          </button>
        </div>
      )}

      {/* Kingdom cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl w-full mb-6">
        {KINGDOM_DEFS.map((k) => {
          const isSelected = selected === k.id;
          return (
            <button
              key={k.id}
              onClick={() => setSelected(k.id)}
              className={`panel rounded-lg p-4 text-left transition-all border-2 cursor-pointer hover:border-amber-600 ${
                isSelected ? 'border-amber-500 bg-gray-800' : 'border-transparent'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{KINGDOM_EMOJI[k.id] ?? '⚔'}</span>
                <div>
                  <div className="font-bold text-sm" style={{ color: k.color }}>
                    {k.name}
                  </div>
                  <div className="text-xs text-gray-500">{k.archetype}</div>
                </div>
              </div>
              <div className="text-xs text-green-400 mb-1">✓ {k.bonusDescription}</div>
              <div className="text-xs text-red-400">✗ {k.weaknessDescription}</div>
            </button>
          );
        })}
      </div>

      {/* Start */}
      <button
        className={`btn-primary px-8 py-3 text-base ${!selected ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={start}
        disabled={!selected}
      >
        {selected ? `Begin Campaign as ${KINGDOM_DEFS.find((k) => k.id === selected)?.name}` : 'Choose a Kingdom'}
      </button>

      {/* How to play hint */}
      <p className="text-gray-600 text-xs mt-6 text-center max-w-md">
        Each season you receive 2 Orders for campaign actions (Move, Attack, Espionage, Diplomacy, Reform).
        Build and Recruit are free but each province can only do one per season.
        Win by controlling 60% of provinces or capturing 3 enemy capitals.
      </p>
    </div>
  );
}
