import React from 'react';
import { useGameStore } from '../store/gameStore';
import { SeasonSummary as SeasonSummaryType } from '../engine/types';

export default function SeasonSummary() {
  const gameState = useGameStore((s) => s.gameState!);
  const dismissSummary = useGameStore((s) => s.dismissSummary);

  const summary = gameState.seasonSummary;
  if (!summary || gameState.phase !== 'season_summary') return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="panel rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-bold text-lg gold">
              {summary.seasonName} Season Summary
            </h2>
            <div className="text-xs text-gray-400">
              Year {summary.year} BCE — Season {summary.season}
            </div>
          </div>
          <button
            className="btn-primary px-4 py-2"
            onClick={dismissSummary}
          >
            Next Season ▶
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto scrollbar-thin flex-1 p-4 space-y-4">

          {/* Player actions */}
          {summary.playerActions.length > 0 && (
            <Section title="⚔ Your Actions" color="text-amber-300">
              {summary.playerActions.map((line, i) => (
                <LogLine key={i} line={line} />
              ))}
            </Section>
          )}

          {/* Battles */}
          {summary.battles.length > 0 && (
            <Section title="💥 Battles" color="text-red-400">
              {summary.battles.map((b, i) => (
                <div key={i} className={`text-xs p-2 rounded border-l-2 mb-1 ${b.attackerWon ? 'border-green-600 bg-green-950/30' : 'border-red-700 bg-red-950/30'}`}>
                  {b.narrative}
                </div>
              ))}
            </Section>
          )}

          {/* AI actions (filtered to interesting ones) */}
          {summary.aiActions.filter((a) => a.includes('Attack') || a.includes('stormed') || a.includes('assault') || a.includes('captured')).length > 0 && (
            <Section title="🤖 AI Kingdoms" color="text-blue-300">
              {summary.aiActions
                .filter((a) => a.includes('Attack') || a.includes('stormed') || a.includes('assault') || a.includes('captured') || a.includes('moves'))
                .map((line, i) => (
                  <LogLine key={i} line={line} />
                ))}
            </Section>
          )}

          {/* Economy */}
          {summary.economyLines.length > 0 && (
            <Section title="💰 Economy" color="text-green-300">
              {summary.economyLines.map((line, i) => (
                <LogLine key={i} line={line} />
              ))}
            </Section>
          )}

          {/* Diplomacy */}
          {summary.diplomaticLines.length > 0 && (
            <Section title="✋ Diplomacy" color="text-purple-300">
              {summary.diplomaticLines.map((line, i) => (
                <LogLine key={i} line={line} />
              ))}
            </Section>
          )}

          {/* Espionage */}
          {summary.espionageLines.length > 0 && (
            <Section title="🕵 Espionage" color="text-yellow-300">
              {summary.espionageLines.map((line, i) => (
                <LogLine key={i} line={line} />
              ))}
            </Section>
          )}

          {/* If quiet */}
          {summary.battles.length === 0 &&
            summary.economyLines.length === 0 &&
            summary.playerActions.length === 0 && (
              <div className="text-center text-gray-600 py-8 text-sm italic">
                A quiet season passes...
              </div>
            )}

          {/* Next season preview */}
          <div className="panel rounded p-3 text-xs text-gray-400 border border-gray-800">
            <div className="font-medium text-gray-300 mb-1">Entering Season {summary.season + 1}</div>
            <div className="flex flex-wrap gap-4">
              {Object.values(gameState.kingdoms)
                .filter((k) => !k.isEliminated)
                .sort((a, b) => {
                  const ac = Object.values(gameState.provinces).filter((p) => p.owner === a.id).length;
                  const bc = Object.values(gameState.provinces).filter((p) => p.owner === b.id).length;
                  return bc - ac;
                })
                .map((k) => {
                  const count = Object.values(gameState.provinces).filter((p) => p.owner === k.id).length;
                  return (
                    <div key={k.id} className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full" style={{ background: k.color }} />
                      <span style={{ color: k.color }}>{k.name}</span>
                      <span className="text-gray-600">{count}p</span>
                      {k.isPlayer && <span className="text-amber-400">★</span>}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={`text-xs font-semibold uppercase tracking-wider mb-1.5 ${color}`}>{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function LogLine({ line }: { line: string }) {
  return <div className="text-xs text-gray-300 pl-2 border-l border-gray-800">{line}</div>;
}
