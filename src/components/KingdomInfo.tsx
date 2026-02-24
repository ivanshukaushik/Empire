import React from 'react';
import { useGameStore } from '../store/gameStore';
import { SEASON_NAMES } from '../engine/turnEngine';

export default function KingdomInfo() {
  const gameState = useGameStore((s) => s.gameState!);
  const saveGame = useGameStore((s) => s.saveGame);
  const resetGame = useGameStore((s) => s.resetGame);

  const player = gameState.kingdoms[gameState.playerKingdomId];
  const seasonName = SEASON_NAMES[gameState.season % 4];

  const ownedCount = Object.values(gameState.provinces).filter(
    (p) => p.owner === gameState.playerKingdomId
  ).length;
  const totalCount = Object.keys(gameState.provinces).length;
  const progress = Math.round((ownedCount / totalCount) * 100);
  const winTarget = Math.ceil(totalCount * 0.6);

  const playerArmies = Object.values(gameState.armies).filter(
    (a) => a.kingdomId === gameState.playerKingdomId
  );
  const totalTroops = playerArmies.reduce((s, a) => s + a.size, 0);

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-thin p-3 space-y-3">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ background: player.color }} />
          <span className="font-bold text-sm" style={{ color: player.color }}>
            {player.name}
          </span>
          <span className="text-gray-500 text-xs ml-auto">{player.archetype}</span>
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {seasonName}, Year {gameState.year} BCE — Season {gameState.season}
        </div>
      </div>

      {/* Action Points */}
      <div className="panel rounded p-2">
        <div className="text-xs text-gray-400 mb-1">Action Points</div>
        <div className="flex gap-1">
          {Array.from({ length: gameState.maxActionPoints }).map((_, i) => (
            <div
              key={i}
              className={`w-6 h-6 rounded border flex items-center justify-center text-xs ${
                i < gameState.actionPointsRemaining
                  ? 'bg-amber-600 border-amber-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-600'
              }`}
            >
              {i < gameState.actionPointsRemaining ? '●' : '○'}
            </div>
          ))}
          <span className="text-xs text-gray-400 ml-1 self-center">
            {gameState.actionPointsRemaining}/{gameState.maxActionPoints} AP
          </span>
        </div>
      </div>

      {/* Resources */}
      <div className="panel rounded p-2 space-y-1.5">
        <div className="text-xs text-gray-400 mb-1">Resources</div>
        <ResourceRow icon="💰" label="Treasury" value={Math.floor(player.treasury)} color="text-yellow-400" />
        <ResourceRow icon="🌾" label="Food" value={Math.floor(player.food)} color="text-green-400" />
        <ResourceRow icon="⚔" label="Manpower" value={Math.floor(player.manpower)} color="text-blue-400" />
        <ResourceRow icon="⚖" label="Stability" value={player.stability} color={player.stability > 60 ? 'text-green-400' : player.stability > 30 ? 'text-yellow-400' : 'text-red-400'} max={100} />
        <ResourceRow icon="🎭" label="Reputation" value={player.reputation} color={player.reputation >= 0 ? 'text-gray-300' : 'text-red-400'} />
      </div>

      {/* Military */}
      <div className="panel rounded p-2">
        <div className="text-xs text-gray-400 mb-1">Armies</div>
        {playerArmies.length === 0 ? (
          <div className="text-xs text-gray-600">No armies</div>
        ) : (
          playerArmies.map((army) => (
            <div key={army.id} className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-300">{army.name}</span>
              <div className="text-right">
                <div className="text-amber-400">{army.size.toLocaleString()} troops</div>
                <div className="text-gray-500">
                  Morale {army.morale}% — {gameState.provinces[army.provinceId]?.name ?? '?'}
                </div>
              </div>
            </div>
          ))
        )}
        <div className="text-xs text-gray-600 mt-1 border-t border-gray-800 pt-1">
          Total: {totalTroops.toLocaleString()} troops
        </div>
      </div>

      {/* Territory progress */}
      <div className="panel rounded p-2">
        <div className="text-xs text-gray-400 mb-1">Territory</div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-300">{ownedCount}/{totalCount} provinces</span>
          <span className="text-gray-500">Win: {winTarget}</span>
        </div>
        <div className="h-2 bg-gray-800 rounded overflow-hidden">
          <div
            className="h-full rounded transition-all"
            style={{ width: `${progress}%`, background: player.color }}
          />
        </div>
        <div className="text-xs text-gray-500 mt-1">{progress}% — need 60%</div>
      </div>

      {/* Active reform */}
      {player.activeReform && (
        <div className="panel rounded p-2">
          <div className="text-xs text-gray-400 mb-1">Active Reform</div>
          <div className="text-xs text-amber-300 capitalize">
            {player.activeReform.replace('_', ' ')}
          </div>
        </div>
      )}

      {/* Diplomacy overview */}
      <div className="panel rounded p-2">
        <div className="text-xs text-gray-400 mb-1">Relations</div>
        <div className="space-y-0.5">
          {Object.keys(gameState.kingdoms)
            .filter((k) => k !== gameState.playerKingdomId && !gameState.kingdoms[k].isEliminated)
            .map((kid) => {
              const rel = gameState.relations[gameState.playerKingdomId]?.[kid];
              const k = gameState.kingdoms[kid];
              const score = rel?.score ?? 0;
              return (
                <div key={kid} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: k.color }} />
                    <span className="text-gray-400">{k.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {rel?.treaty && (
                      <span className="text-xs text-green-400">
                        {rel.treaty.type === 'nap' ? '✋' : '💸'}
                      </span>
                    )}
                    <span
                      className={score > 20 ? 'text-green-400' : score < -20 ? 'text-red-400' : 'text-gray-400'}
                    >
                      {score > 0 ? '+' : ''}{score}
                    </span>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-1.5 mt-auto pt-2">
        <button className="btn-ghost w-full text-xs" onClick={saveGame}>
          💾 Save Game
        </button>
        <button className="btn-ghost w-full text-xs text-red-400" onClick={resetGame}>
          ✕ Abandon Game
        </button>
      </div>
    </div>
  );
}

function ResourceRow({
  icon, label, value, color, max,
}: {
  icon: string; label: string; value: number; color: string; max?: number;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500">{icon} {label}</span>
      <span className={color}>
        {value}{max !== undefined ? `/${max}` : ''}
      </span>
    </div>
  );
}
