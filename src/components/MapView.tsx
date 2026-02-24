import React, { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { Province, GameState, FogOfWarEntry } from '../engine/types';
import { PROVINCE_DEFS } from '../data/gameData';

const PROVINCE_RADIUS = 18;
const MAP_W = 820;
const MAP_H = 680;

// Build edge list from adjacency (each pair once)
function buildEdges(provinces: Record<string, Province>): [string, string][] {
  const edges: [string, string][] = [];
  const seen = new Set<string>();
  for (const p of Object.values(provinces)) {
    for (const adj of p.adjacentTo) {
      const key = [p.id, adj].sort().join('-');
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([p.id, adj]);
      }
    }
  }
  return edges;
}

interface Props {
  className?: string;
}

export default function MapView({ className = '' }: Props) {
  const gameState = useGameStore((s) => s.gameState!);
  const setSelectedProvince = useGameStore((s) => s.setSelectedProvince);
  const selectedProvinceId = gameState.selectedProvinceId;
  const actionBeingPlanned = gameState.actionBeingPlanned;
  const pendingMoveSource = gameState.pendingMoveSource;
  const queueAction = useGameStore((s) => s.queueAction);
  const setActionBeingPlanned = useGameStore((s) => s.setActionBeingPlanned);

  const edges = useMemo(() => buildEdges(gameState.provinces), [gameState.provinces]);

  function handleProvinceClick(pId: string) {
    const province = gameState.provinces[pId];
    if (!province) return;

    // If an attack/move is being planned
    if (actionBeingPlanned === 'attack' || actionBeingPlanned === 'move') {
      if (!pendingMoveSource) {
        // First click: select army
        setSelectedProvince(pId);
        return;
      }
      // Second click: select target
      const army = Object.values(gameState.armies).find(
        (a) => a.kingdomId === gameState.playerKingdomId && a.provinceId === pendingMoveSource
      );
      if (!army) { setActionBeingPlanned(null); return; }

      if (actionBeingPlanned === 'attack') {
        queueAction({ type: 'attack', apCost: 1, armyId: army.id, targetProvinceId: pId });
      } else {
        queueAction({ type: 'move', apCost: 1, armyId: army.id, targetProvinceId: pId });
      }
      setActionBeingPlanned(null);
      return;
    }

    setSelectedProvince(pId);
  }

  function getFillColor(p: Province, fog: FogOfWarEntry | undefined): string {
    if (!fog || (!fog.visible && !fog.partial && !fog.scouted)) return '#1f1f1f';
    const k = gameState.kingdoms[p.owner];
    return k?.color ?? '#555';
  }

  function getFogOpacity(fog: FogOfWarEntry | undefined): number {
    if (!fog) return 0.2;
    if (fog.visible) return 1.0;
    if (fog.scouted) return 0.9;
    if (fog.partial) return 0.6;
    return 0.2;
  }

  function isValidTarget(pId: string): boolean {
    if (!actionBeingPlanned || !pendingMoveSource) return false;
    const army = Object.values(gameState.armies).find(
      (a) => a.kingdomId === gameState.playerKingdomId && a.provinceId === pendingMoveSource
    );
    if (!army) return false;
    const sourceProv = gameState.provinces[pendingMoveSource];
    if (!sourceProv) return false;
    const targetProv = gameState.provinces[pId];
    if (!targetProv) return false;

    if (actionBeingPlanned === 'attack') {
      return (
        sourceProv.adjacentTo.includes(pId) &&
        targetProv.owner !== gameState.playerKingdomId
      );
    }
    if (actionBeingPlanned === 'move') {
      return (
        sourceProv.adjacentTo.includes(pId) &&
        targetProv.owner === gameState.playerKingdomId
      );
    }
    return false;
  }

  const isPlanning = actionBeingPlanned === 'attack' || actionBeingPlanned === 'move';
  const isExecuting = gameState.phase === 'executing';

  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        className="w-full h-full"
        style={{ background: '#0a0a0a' }}
      >
        {/* Grid background */}
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a1a1a" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={MAP_W} height={MAP_H} fill="url(#grid)" />

        {/* Edges */}
        {edges.map(([a, b]) => {
          const pa = gameState.provinces[a];
          const pb = gameState.provinces[b];
          if (!pa || !pb) return null;
          return (
            <line
              key={`${a}-${b}`}
              x1={pa.x} y1={pa.y}
              x2={pb.x} y2={pb.y}
              stroke="#2a2a2a"
              strokeWidth={1.5}
            />
          );
        })}

        {/* Province nodes */}
        {Object.values(gameState.provinces).map((p) => {
          const fog = gameState.fogOfWar[p.id];
          const opacity = getFogOpacity(fog);
          const fillColor = getFillColor(p, fog);
          const isSelected = p.id === selectedProvinceId;
          const isSourceProv = p.id === pendingMoveSource;
          const isTarget = isPlanning && pendingMoveSource && isValidTarget(p.id);
          const hasPlayerArmy = Object.values(gameState.armies).some(
            (a) => a.provinceId === p.id && a.kingdomId === gameState.playerKingdomId
          );
          const hasAnyArmy = Object.values(gameState.armies).some(
            (a) => a.provinceId === p.id && a.size > 0
          );

          let strokeColor = '#333';
          let strokeWidth = 1;
          if (isSelected) { strokeColor = '#F59E0B'; strokeWidth = 2.5; }
          else if (isSourceProv) { strokeColor = '#60A5FA'; strokeWidth = 2.5; }
          else if (isTarget) { strokeColor = '#F87171'; strokeWidth = 2; }
          else if (p.isCapital) { strokeColor = '#888'; strokeWidth = 1.5; }

          return (
            <g
              key={p.id}
              className="province-node"
              opacity={opacity}
              onClick={() => handleProvinceClick(p.id)}
            >
              {/* Selection ring */}
              {(isSelected || isSourceProv || isTarget) && (
                <circle
                  cx={p.x} cy={p.y}
                  r={PROVINCE_RADIUS + 5}
                  fill="none"
                  stroke={isTarget ? '#F87171' : isSourceProv ? '#60A5FA' : '#F59E0B'}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  opacity={0.8}
                />
              )}

              {/* Capital diamond outer */}
              {p.isCapital && (
                <polygon
                  points={`${p.x},${p.y - PROVINCE_RADIUS - 4} ${p.x + PROVINCE_RADIUS + 4},${p.y} ${p.x},${p.y + PROVINCE_RADIUS + 4} ${p.x - PROVINCE_RADIUS - 4},${p.y}`}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  opacity={0.4}
                />
              )}

              {/* Main circle */}
              <circle
                cx={p.x} cy={p.y}
                r={PROVINCE_RADIUS}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
              />

              {/* Fort indicator */}
              {p.fortLevel > 0 && fog?.visible && (
                <text x={p.x} y={p.y - PROVINCE_RADIUS - 3} textAnchor="middle" fontSize={8} fill="#aaa">
                  {'▲'.repeat(p.fortLevel)}
                </text>
              )}

              {/* Army dot */}
              {hasAnyArmy && (fog?.visible || fog?.partial || fog?.scouted) && (
                <circle
                  cx={p.x + PROVINCE_RADIUS - 4}
                  cy={p.y - PROVINCE_RADIUS + 4}
                  r={4}
                  fill={
                    hasPlayerArmy ? '#FCD34D' :
                    (() => {
                      const armyKid = Object.values(gameState.armies).find(
                        (a) => a.provinceId === p.id && a.size > 0
                      )?.kingdomId;
                      return armyKid ? (gameState.kingdoms[armyKid]?.color ?? '#fff') : '#fff';
                    })()
                  }
                  stroke="#111"
                  strokeWidth={1}
                />
              )}

              {/* Province name */}
              <text
                x={p.x}
                y={p.y + PROVINCE_RADIUS + 11}
                textAnchor="middle"
                fontSize={fog?.visible || fog?.partial || fog?.scouted ? 8 : 7}
                fill={fog?.visible ? '#ccc' : fog?.partial ? '#888' : '#444'}
                fontFamily="serif"
              >
                {fog?.visible || fog?.partial || fog?.scouted ? p.name : '???'}
              </text>

              {/* Terrain icon */}
              {fog?.visible && (
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={10}>
                  {terrainIcon(p.terrain)}
                </text>
              )}
            </g>
          );
        })}

        {/* Map title */}
        <text x={10} y={16} fontSize={10} fill="#444" fontFamily="serif">
          The Central Plains — {gameState.year} BCE
        </text>

        {/* Province count overlay */}
        <text x={MAP_W - 10} y={16} fontSize={9} fill="#555" textAnchor="end">
          {Object.values(gameState.provinces).filter((p) => p.owner === gameState.playerKingdomId).length}/
          {Object.keys(gameState.provinces).length} provinces
        </text>

        {/* Executing overlay */}
        {isExecuting && (
          <g>
            <rect x={0} y={0} width={MAP_W} height={MAP_H} fill="rgba(0,0,0,0.6)" />
            <text
              x={MAP_W / 2} y={MAP_H / 2}
              textAnchor="middle"
              fontSize={24}
              fill="#F59E0B"
              fontFamily="serif"
            >
              Resolving Season...
            </text>
          </g>
        )}
      </svg>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
        {Object.values(gameState.kingdoms)
          .filter((k) => !k.isEliminated)
          .map((k) => (
            <div key={k.id} className="flex items-center gap-1 text-xs bg-black/60 px-1.5 py-0.5 rounded">
              <div className="w-2 h-2 rounded-full" style={{ background: k.color }} />
              <span className="text-gray-400">{k.name}</span>
              {k.isPlayer && <span className="text-amber-400">★</span>}
            </div>
          ))}
      </div>
    </div>
  );
}

function terrainIcon(terrain: string): string {
  switch (terrain) {
    case 'mountains': return '⛰';
    case 'hills': return '◠';
    case 'riverlands': return '~';
    default: return '';
  }
}
