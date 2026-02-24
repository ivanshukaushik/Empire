import React, { useMemo, useState, useRef, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { Province, FogOfWarEntry } from '../engine/types';
import { previewCombat, OddsRating } from '../engine/combatPreview';

const R = 18; // province node radius
const MAP_W = 820;
const MAP_H = 680;

function buildEdges(provinces: Record<string, Province>): [string, string][] {
  const edges: [string, string][] = [];
  const seen = new Set<string>();
  for (const p of Object.values(provinces)) {
    for (const adj of p.adjacentTo) {
      const key = [p.id, adj].sort().join('-');
      if (!seen.has(key)) { seen.add(key); edges.push([p.id, adj]); }
    }
  }
  return edges;
}

const ODDS_COLOR: Record<OddsRating, string> = {
  overwhelming: '#22c55e',
  favored:      '#84cc16',
  even:         '#eab308',
  risky:        '#f97316',
  desperate:    '#ef4444',
};

interface Props { className?: string }

export default function MapView({ className = '' }: Props) {
  const gameState   = useGameStore((s) => s.gameState!);
  const setSelected = useGameStore((s) => s.setSelectedProvince);
  const setAction   = useGameStore((s) => s.setActionBeingPlanned);
  const setArmy     = useGameStore((s) => s.setPendingMoveArmy);
  const queueAction = useGameStore((s) => s.queueAction);

  const { selectedProvinceId, actionBeingPlanned, pendingMoveArmyId } = gameState;

  // Hover state
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mousePos, setMousePos]   = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const edges = useMemo(() => buildEdges(gameState.provinces), [gameState.provinces]);

  // Precompute sets for the current planning mode
  const playerKid = gameState.playerKingdomId;

  // Provinces that contain a player army (valid step-1 click targets)
  const armyProvinceIds = useMemo(() => {
    const set = new Set<string>();
    Object.values(gameState.armies)
      .filter((a) => a.kingdomId === playerKid && a.size > 0)
      .forEach((a) => set.add(a.provinceId));
    return set;
  }, [gameState.armies, playerKid]);

  // Valid targets for the selected army
  const validTargetIds = useMemo(() => {
    if (!pendingMoveArmyId) return new Set<string>();
    const army = gameState.armies[pendingMoveArmyId];
    if (!army) return new Set<string>();
    const sourceProv = gameState.provinces[army.provinceId];
    if (!sourceProv) return new Set<string>();
    const kingdom = gameState.kingdoms[playerKid];
    const set = new Set<string>();
    const check = (adjId: string) => {
      const adj = gameState.provinces[adjId];
      if (!adj) return;
      if (actionBeingPlanned === 'move' && adj.owner === playerKid) set.add(adjId);
      if (actionBeingPlanned === 'attack' && adj.owner !== playerKid) {
        const rel = gameState.relations[playerKid]?.[adj.owner];
        if (!rel?.treaty || rel.treaty.type !== 'nap') set.add(adjId);
      }
    };
    sourceProv.adjacentTo.forEach(check);
    // Zhao +1 range
    if (kingdom?.mobilityBonus > 0) {
      sourceProv.adjacentTo.forEach((mid) => {
        const midP = gameState.provinces[mid];
        if (midP?.owner === playerKid) midP.adjacentTo.forEach(check);
      });
    }
    return set;
  }, [pendingMoveArmyId, actionBeingPlanned, gameState, playerKid]);

  // Combat preview for hovered target
  const combatPreview = useMemo(() => {
    if (actionBeingPlanned !== 'attack' || !pendingMoveArmyId || !hoveredId) return null;
    if (!validTargetIds.has(hoveredId)) return null;
    return previewCombat(pendingMoveArmyId, hoveredId, gameState);
  }, [actionBeingPlanned, pendingMoveArmyId, hoveredId, validTargetIds, gameState]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  function handleProvinceClick(pId: string) {
    const province = gameState.provinces[pId];
    if (!province) return;
    const isPlanning = actionBeingPlanned === 'attack' || actionBeingPlanned === 'move';

    if (isPlanning) {
      if (!pendingMoveArmyId) {
        // Step 1: select an army in this province
        if (armyProvinceIds.has(pId)) {
          // Pick the largest army in this province
          const armies = Object.values(gameState.armies)
            .filter((a) => a.kingdomId === playerKid && a.provinceId === pId)
            .sort((a, b) => b.size - a.size);
          if (armies.length > 0) {
            setArmy(armies[0].id);
            setSelected(pId);
          }
        }
        return;
      }
      // Step 2: execute the action
      if (validTargetIds.has(pId)) {
        queueAction({
          type: actionBeingPlanned,
          apCost: 1,
          armyId: pendingMoveArmyId,
          targetProvinceId: pId,
        });
        setAction(null);
      } else {
        // Clicked an invalid target; cancel
        setAction(null);
      }
      return;
    }

    setSelected(pId);
  }

  function fogOpacity(fog: FogOfWarEntry | undefined): number {
    if (!fog) return 0.2;
    if (fog.visible) return 1.0;
    if (fog.scouted) return 0.88;
    if (fog.partial) return 0.58;
    return 0.18;
  }

  function fillColor(p: Province, fog: FogOfWarEntry | undefined): string {
    if (!fog || (!fog.visible && !fog.partial && !fog.scouted)) return '#1a1a1a';
    return gameState.kingdoms[p.owner]?.color ?? '#555';
  }

  const isPlanning = actionBeingPlanned === 'attack' || actionBeingPlanned === 'move';
  const isExecuting = gameState.phase === 'executing';

  return (
    <div className={`relative ${className}`} style={{ overflow: 'hidden' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        className="w-full h-full"
        style={{ background: '#080808' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredId(null)}
      >
        {/* Subtle grid */}
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0L0 0 0 40" fill="none" stroke="#151515" strokeWidth="0.5" />
          </pattern>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect width={MAP_W} height={MAP_H} fill="url(#grid)" />

        {/* Edges */}
        {edges.map(([a, b]) => {
          const pa = gameState.provinces[a];
          const pb = gameState.provinces[b];
          if (!pa || !pb) return null;
          const bothVisible =
            (gameState.fogOfWar[a]?.visible || gameState.fogOfWar[a]?.partial) &&
            (gameState.fogOfWar[b]?.visible || gameState.fogOfWar[b]?.partial);
          return (
            <line
              key={`${a}-${b}`}
              x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
              stroke={bothVisible ? '#2d2d2d' : '#1a1a1a'}
              strokeWidth={bothVisible ? 1.5 : 1}
            />
          );
        })}

        {/* Province nodes */}
        {Object.values(gameState.provinces).map((p) => {
          const fog = gameState.fogOfWar[p.id];
          const opacity = fogOpacity(fog);
          const fill = fillColor(p, fog);
          const isSelected = p.id === selectedProvinceId;
          const isHovered = p.id === hoveredId;
          const isArmySource = p.id === (pendingMoveArmyId ? gameState.armies[pendingMoveArmyId]?.provinceId : null);
          const isValidTarget = validTargetIds.has(p.id);
          const isArmyProvince = armyProvinceIds.has(p.id);

          // Step-1 glow: show which provinces have armies you can select
          const isStep1Highlight = isPlanning && !pendingMoveArmyId && isArmyProvince;

          const hasPlayerArmy = Object.values(gameState.armies).some(
            (a) => a.provinceId === p.id && a.kingdomId === playerKid
          );
          const armiesHere = Object.values(gameState.armies).filter(
            (a) => a.provinceId === p.id && a.size > 0
          );

          let strokeColor = '#2a2a2a';
          let strokeWidth = 1;
          let glowColor: string | null = null;

          if (isArmySource) {
            strokeColor = '#60A5FA'; strokeWidth = 2.5; glowColor = '#3B82F6';
          } else if (isValidTarget && actionBeingPlanned === 'attack') {
            strokeColor = '#EF4444'; strokeWidth = 2.5; glowColor = '#DC2626';
          } else if (isValidTarget && actionBeingPlanned === 'move') {
            strokeColor = '#22C55E'; strokeWidth = 2; glowColor = '#16A34A';
          } else if (isStep1Highlight) {
            strokeColor = '#93C5FD'; strokeWidth = 2; glowColor = '#3B82F6';
          } else if (isSelected) {
            strokeColor = '#F59E0B'; strokeWidth = 2.5;
          } else if (isHovered) {
            strokeColor = '#888'; strokeWidth = 1.5;
          } else if (p.isCapital) {
            strokeColor = '#555'; strokeWidth = 1.5;
          }

          const previewOdds = hoveredId === p.id && combatPreview ? combatPreview.odds : null;

          return (
            <g
              key={p.id}
              style={{ cursor: 'pointer' }}
              opacity={opacity}
              onClick={() => handleProvinceClick(p.id)}
              onMouseEnter={() => setHoveredId(p.id)}
            >
              {/* Glow ring for highlighted provinces */}
              {glowColor && (
                <circle
                  cx={p.x} cy={p.y} r={R + 6}
                  fill="none"
                  stroke={glowColor}
                  strokeWidth={1.5}
                  strokeDasharray={isValidTarget ? '4 3' : 'none'}
                  opacity={0.7}
                />
              )}

              {/* Pulsing ring for step-1 targets */}
              {isStep1Highlight && (
                <circle cx={p.x} cy={p.y} r={R + 9} fill="none" stroke="#3B82F6" strokeWidth={1} opacity={0.3} />
              )}

              {/* Capital diamond */}
              {p.isCapital && (
                <polygon
                  points={`${p.x},${p.y - R - 5} ${p.x + R + 5},${p.y} ${p.x},${p.y + R + 5} ${p.x - R - 5},${p.y}`}
                  fill={fill} stroke={strokeColor} strokeWidth={strokeWidth} opacity={0.35}
                />
              )}

              {/* Odds preview ring */}
              {previewOdds && (
                <circle
                  cx={p.x} cy={p.y} r={R + 3}
                  fill={ODDS_COLOR[previewOdds]}
                  opacity={0.25}
                />
              )}

              {/* Main circle */}
              <circle
                cx={p.x} cy={p.y} r={R}
                fill={fill}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
              />

              {/* Fort indicator */}
              {p.fortLevel > 0 && (fog?.visible || fog?.scouted) && (
                <text x={p.x} y={p.y - R - 4} textAnchor="middle" fontSize={7} fill="#aaa">
                  {'▲'.repeat(p.fortLevel)}
                </text>
              )}

              {/* Army dots */}
              {armiesHere.map((army, i) => {
                const k = gameState.kingdoms[army.kingdomId];
                const dotColor = army.kingdomId === playerKid ? '#FCD34D' : (k?.color ?? '#fff');
                return (
                  <circle
                    key={army.id}
                    cx={p.x + R - 5 + i * 6}
                    cy={p.y - R + 5}
                    r={4}
                    fill={dotColor}
                    stroke="#111"
                    strokeWidth={1}
                  />
                );
              })}

              {/* Province label */}
              <text
                x={p.x} y={p.y + R + 11}
                textAnchor="middle"
                fontSize={fog?.visible ? 8 : 7}
                fill={fog?.visible ? '#ccc' : fog?.partial ? '#777' : '#333'}
                fontFamily="serif"
              >
                {fog?.visible || fog?.partial || fog?.scouted ? p.name : '???'}
              </text>

              {/* Terrain glyph (only when fully visible) */}
              {fog?.visible && (
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={10}>
                  {terrainGlyph(p.terrain)}
                </text>
              )}
            </g>
          );
        })}

        {/* Map attribution */}
        <text x={8} y={16} fontSize={9} fill="#333" fontFamily="serif">
          Central Plains — {gameState.year} BCE
        </text>
        <text x={MAP_W - 8} y={16} fontSize={8} fill="#444" textAnchor="end">
          {Object.values(gameState.provinces).filter((p) => p.owner === playerKid).length}/
          {Object.keys(gameState.provinces).length} provinces
        </text>

        {/* Executing overlay */}
        {isExecuting && (
          <g>
            <rect x={0} y={0} width={MAP_W} height={MAP_H} fill="rgba(0,0,0,0.65)" />
            <text x={MAP_W / 2} y={MAP_H / 2 - 10} textAnchor="middle" fontSize={22} fill="#F59E0B" fontFamily="serif">
              Resolving Season...
            </text>
            <text x={MAP_W / 2} y={MAP_H / 2 + 16} textAnchor="middle" fontSize={11} fill="#888" fontFamily="serif">
              AI kingdoms are making their moves
            </text>
          </g>
        )}
      </svg>

      {/* Kingdom legend */}
      <div className="absolute bottom-2 left-2 flex flex-wrap gap-1 pointer-events-none">
        {Object.values(gameState.kingdoms)
          .filter((k) => !k.isEliminated)
          .map((k) => {
            const count = Object.values(gameState.provinces).filter((p) => p.owner === k.id).length;
            return (
              <div key={k.id} className="flex items-center gap-1 text-xs bg-black/70 px-1.5 py-0.5 rounded">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: k.color }} />
                <span style={{ color: k.color }}>{k.name}</span>
                <span className="text-gray-600">{count}</span>
                {k.isPlayer && <span className="text-amber-400 text-xs">★</span>}
              </div>
            );
          })}
      </div>

      {/* Hover tooltip (rendered as HTML overlay) */}
      {hoveredId && (
        <ProvinceHoverTooltip
          provinceId={hoveredId}
          mousePos={mousePos}
          gameState={gameState}
          combatPreview={combatPreview}
          isAttackMode={actionBeingPlanned === 'attack' && !!pendingMoveArmyId}
          isValidTarget={validTargetIds.has(hoveredId)}
        />
      )}

      {/* Planning mode instruction banner */}
      {isPlanning && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none z-10">
          <div className={`px-4 py-1.5 rounded-full text-xs font-medium border ${
            actionBeingPlanned === 'attack'
              ? 'bg-red-950/90 border-red-700 text-red-200'
              : 'bg-blue-950/90 border-blue-700 text-blue-200'
          }`}>
            {!pendingMoveArmyId
              ? (actionBeingPlanned === 'attack'
                  ? '⚔ Attack: Click a province containing your army'
                  : '⇒ Move: Click a province containing your army')
              : (actionBeingPlanned === 'attack'
                  ? `⚔ Now click an enemy province to attack  —  ESC to cancel`
                  : `⇒ Now click a friendly province to move to  —  ESC to cancel`)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Province hover tooltip ─────────────────────────────────
function ProvinceHoverTooltip({
  provinceId, mousePos, gameState, combatPreview, isAttackMode, isValidTarget,
}: {
  provinceId: string;
  mousePos: { x: number; y: number };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gameState: any;
  combatPreview: ReturnType<typeof previewCombat>;
  isAttackMode: boolean;
  isValidTarget: boolean;
}) {
  const p = gameState.provinces[provinceId];
  if (!p) return null;
  const fog = gameState.fogOfWar[provinceId];
  const owner = gameState.kingdoms[p.owner];
  const isVisible = fog?.visible || fog?.scouted;
  const isPartial = fog?.partial;

  const armies = (Object.values(gameState.armies) as any[]).filter((a) => a.provinceId === provinceId && a.size > 0);

  // Position tooltip to avoid edges
  const tooltipW = 220;
  const tooltipH = 160;
  let tx = mousePos.x + 14;
  let ty = mousePos.y - 10;
  const containerW = 820; // approximate
  if (tx + tooltipW > containerW) tx = mousePos.x - tooltipW - 14;
  if (ty + tooltipH > 680) ty = mousePos.y - tooltipH - 10;

  return (
    <div
      className="absolute pointer-events-none z-50"
      style={{ left: tx, top: ty, width: tooltipW }}
    >
      <div className="bg-gray-950/95 border border-gray-700 rounded-lg p-3 shadow-xl text-xs space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="font-bold text-gray-100">{p.name}</span>
          <span className="capitalize text-gray-500">{p.terrain}</span>
        </div>

        {/* Owner */}
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: owner?.color ?? '#888' }} />
          <span style={{ color: owner?.color ?? '#888' }}>{owner?.name ?? 'Unknown'}</span>
          {p.isCapital && <span className="text-amber-400 text-xs">★ Capital</span>}
        </div>

        {/* Stats */}
        {isVisible ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-300">
            <span className="text-gray-500">Garrison</span><span>{p.garrison.toLocaleString()}</span>
            <span className="text-gray-500">Unrest</span>
            <span className={p.unrest > 60 ? 'text-red-400' : p.unrest > 30 ? 'text-yellow-400' : 'text-green-400'}>
              {p.unrest}/100
            </span>
            <span className="text-gray-500">Fort</span><span>Lv.{p.fortLevel}</span>
            <span className="text-gray-500">Income</span><span>+{p.baseIncome}{p.hasMarket ? '+2' : ''}</span>
            <span className="text-gray-500">Food</span><span>+{p.baseFood}{p.hasFarm ? '+2' : ''}</span>
          </div>
        ) : isPartial ? (
          <div className="text-gray-500 space-y-0.5">
            <div>Garrison: <span className="text-gray-300 capitalize">{fog?.lastKnownGarrisonTier ?? 'unknown'}</span></div>
            <div className="italic">Scout for full details</div>
          </div>
        ) : (
          <div className="text-gray-600 italic">Unknown territory — scout to reveal</div>
        )}

        {/* Armies */}
        {armies.length > 0 && (isVisible || isPartial) && (
          <div className="border-t border-gray-800 pt-1.5">
            {armies.map((a) => {
              const k = gameState.kingdoms[a.kingdomId];
              return (
                <div key={a.id} className="flex justify-between">
                  <span style={{ color: k?.color ?? '#888' }}>{a.name}</span>
                  <span className="text-amber-400">{a.size.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Combat preview */}
        {isAttackMode && isValidTarget && combatPreview && (
          <div className="border-t border-gray-800 pt-1.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Battle odds</span>
              <span
                className="font-bold capitalize"
                style={{ color: ODDS_COLOR[combatPreview.odds] }}
              >
                {combatPreview.odds} ({combatPreview.winChancePct}%)
              </span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Your power</span>
              <span className="text-gray-300">{Math.round(combatPreview.attackerPowerBase).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Enemy power</span>
              <span className="text-gray-300">{Math.round(combatPreview.defenderPowerBase).toLocaleString()}</span>
            </div>
            {combatPreview.terrainNote && (
              <div className="text-yellow-600 text-xs">{combatPreview.terrainNote}</div>
            )}
            <div className="text-gray-600 text-xs italic">Click to attack</div>
          </div>
        )}

        {isAttackMode && !isValidTarget && (
          <div className="text-red-600 text-xs italic border-t border-gray-800 pt-1">Not a valid attack target</div>
        )}
      </div>
    </div>
  );
}

function terrainGlyph(terrain: string): string {
  switch (terrain) {
    case 'mountains': return '⛰';
    case 'hills': return '◠';
    case 'riverlands': return '〜';
    default: return '';
  }
}
