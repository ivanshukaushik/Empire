import React from 'react';
import { useGameStore } from './store/gameStore';
import GameSetup from './components/GameSetup';
import GameBoard from './components/GameBoard';

export default function App() {
  const gameState = useGameStore((s) => s.gameState);

  if (!gameState) {
    return <GameSetup />;
  }

  if (gameState.isGameOver) {
    return <GameOverScreen />;
  }

  return <GameBoard />;
}

function GameOverScreen() {
  const gameState = useGameStore((s) => s.gameState!);
  const resetGame = useGameStore((s) => s.resetGame);
  const playerKingdom = gameState.kingdoms[gameState.playerKingdomId];
  const isVictory = gameState.winner === gameState.playerKingdomId;
  const winnerKingdom = gameState.winner ? gameState.kingdoms[gameState.winner] : null;

  const totalSeasons = gameState.season - 1;
  const yearsPlayed = Math.floor(totalSeasons / 4);
  const finalYear = gameState.year;
  const ownedCount = Object.values(gameState.provinces).filter(
    (p) => p.owner === gameState.playerKingdomId
  ).length;
  const totalCount = Object.keys(gameState.provinces).length;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="max-w-lg w-full panel rounded-lg p-8 text-center space-y-6 mx-4">
        {isVictory ? (
          <>
            <div className="text-6xl">⚔</div>
            <h1 className="text-3xl font-bold gold">VICTORY!</h1>
            <p className="text-amber-200 text-lg">
              {playerKingdom.name} has unified the Warring States!
            </p>
          </>
        ) : (
          <>
            <div className="text-6xl">💀</div>
            <h1 className="text-3xl font-bold text-red-400">DEFEAT</h1>
            {winnerKingdom && winnerKingdom.id !== gameState.playerKingdomId && (
              <p className="text-gray-300">
                {winnerKingdom.name} has conquered the realm.
              </p>
            )}
          </>
        )}

        <div className="text-gray-400 text-sm space-y-1 border border-gray-700 rounded p-4">
          <p>{gameState.loseReason ?? gameState.seasonSummary?.winCheck?.reason}</p>
          <p>Year: {finalYear} BCE</p>
          <p>Seasons played: {totalSeasons} ({yearsPlayed} years)</p>
          <p>Final provinces: {ownedCount}/{totalCount}</p>
        </div>

        <div className="space-y-3">
          <button className="btn-primary w-full" onClick={resetGame}>
            New Game
          </button>
        </div>
      </div>
    </div>
  );
}
