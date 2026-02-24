import React, { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import MapView from './MapView';
import KingdomInfo from './KingdomInfo';
import ProvinceInfo from './ProvinceInfo';
import ActionBar from './ActionBar';
import SeasonSummary from './SeasonSummary';

export default function GameBoard() {
  const gameState = useGameStore((s) => s.gameState!);
  const playerKingdom = gameState.kingdoms[gameState.playerKingdomId];

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: '#0a0a0a' }}>
      {/* Top bar */}
      <div
        className="h-8 shrink-0 flex items-center px-4 gap-4 text-xs border-b border-gray-800"
        style={{ background: '#0f0f0f' }}
      >
        <span
          className="font-bold tracking-wider uppercase"
          style={{ color: playerKingdom.color }}
        >
          {playerKingdom.name}
        </span>
        <span className="text-gray-600">|</span>
        <span className="text-gray-400">{playerKingdom.archetype}</span>
        <span className="text-gray-600">|</span>
        <span className="text-amber-400">💰 {Math.floor(playerKingdom.treasury)}</span>
        <span className="text-green-400">🌾 {Math.floor(playerKingdom.food)}</span>
        <span className="text-blue-400">⚔ {Math.floor(playerKingdom.manpower)}</span>
        <span
          className={playerKingdom.stability > 60 ? 'text-green-400' : playerKingdom.stability > 30 ? 'text-yellow-400' : 'text-red-400'}
        >
          ⚖ {playerKingdom.stability}
        </span>
        <div className="flex-1" />
        <span className="text-gray-500">
          Seed: {gameState.seed}
        </span>
        <span className="text-gray-600">|</span>
        <span className="text-gray-400">
          {['Winter','Spring','Summer','Autumn'][gameState.season % 4]}, {gameState.year} BCE
        </span>
        {gameState.phase === 'executing' && (
          <span className="text-amber-400 animate-pulse">Executing...</span>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left panel: Kingdom info */}
        <div className="w-52 shrink-0 border-r border-gray-800 overflow-hidden">
          <KingdomInfo />
        </div>

        {/* Center: Map */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <MapView className="w-full h-full" />
        </div>

        {/* Right panel: Province info */}
        <div className="w-56 shrink-0 border-l border-gray-800 overflow-hidden">
          <ProvinceInfo />
        </div>
      </div>

      {/* Bottom: Action Bar */}
      <div className="h-14 shrink-0 border-t border-gray-800" style={{ background: '#0f0f0f' }}>
        <ActionBar />
      </div>

      {/* Season summary modal */}
      <SeasonSummary />
    </div>
  );
}
