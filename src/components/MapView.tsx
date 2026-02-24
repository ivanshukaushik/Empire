import React, { useMemo, useState, useRef, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { Province, FogOfWarEntry } from '../engine/types';
import { previewCombat, OddsRating } from '../engine/combatPreview';
import { MAP_FEATURES } from '../data/mapFeatures';

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

/** Convert array of [x,y] points to a smooth SVG path using cubic Bezier curves */
function pointsToSmoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const cpX1 = prev[0] + (curr[0] - prev[0]) * 0.4;
    const cpY1 = prev[1];
    const cpX2 = curr[0] - (curr[0] - prev[0]) * 0.4;
    const cpY2 = curr[1];
    d += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${curr[0]} ${curr[1]}`;
  }
  return d;
}

const ODDS_COLOR: Record<OddsRating, string> = {
  overwhelming: '#22c55e',
  favored:      '#84cc16',
  even:         '#eab308',
  risky:        '#f97316',
  desperate:    '#ef4444',
};

// Terrain-based tint overlaid on province circles (subtle, behind ownership color)
const TERRAIN_TINT: Record<string, string> = {
  plains:     'rgba(210,180,100,0.12)',
  hills:      'rgba(150,120,60,0.18)',
  mountains:  'rgba(100,90,80,0.22)',
  riverlands: 'rgba(60,120,180,0.16)',
};

interface Props { className?: string }

export default function MapView({ className = '' }: Props) {
  const gameState   = useGameStore((s) => s.gameState!);
  const setSelected = useGameStore((s) => s.setSelectedProvince);
  const setAction   = useGameStore((s) => s.setActionBeingPlanned);
  const setArmy     = useGameStore((s) => s.setPendingMoveArmy);
  const queueAction = useGameStore((s) => s.queueAction);

  const { selectedProvinceId, actionBeingPlanned, pendingMoveArmyId } = gameState;

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mousePos, setMousePos]   = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const edges = useMemo(() => buildEdges(gameState.provinces), [gameState.provinces]);

  const playerKid = gameState.playerKingdomId;

  // Province IDs with a player army that hasn't acted yet
  const armyProvinceIds = useMemo(() => {
    const set = new Set<string>();
    const armyCampaignUsed = gameState.armyCampaignUsed ?? {};
    Object.values(gameState.armies)
      .filter((a) => a.kingdomId === playerKid && a.size > 0 && !armyCampaignUsed[a.id])
      .forEach((a) => set.add(a.provinceId));
    return set;
  }, [gameState.armies, gameState.armyCampaignUsed, playerKid]);

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
    if (kingdom?.mobilityBonus > 0) {
      sourceProv.adjacentTo.forEach((mid) => {
        const midP = gameState.provinces[mid];
        if (midP?.owner === playerKid) midP.adjacentTo.forEach(check);
      });
    }
    return set;
  }, [pendingMoveArmyId, actionBeingPlanned, gameState, playerKid]);

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
        // Step 1: select an army
        if (armyProvinceIds.has(pId)) {
          const armyCampaignUsed = gameState.armyCampaignUsed ?? {};
          const armies = Object.values(gameState.armies)
            .filter((a) => a.kingdomId === playerKid && a.provinceId === pId && !armyCampaignUsed[a.id])
            .sort((a, b) => b.size - a.size);
          if (armies.length > 0) {
            setArmy(armies[0].id);
            setSelected(pId);
          }
        }
        return;
      }
      // Step 2: execute
      if (validTargetIds.has(pId)) {
        queueAction({
          type: actionBeingPlanned,
          apCost: 1,
          armyId: pendingMoveArmyId,
          targetProvinceId: pId,
        });
        setAction(null);
      } else {
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
    if (!fog || (!fog.visible && !fog.partial && !fog.scouted)) return '#2a2318';
    return gameState.kingdoms[p.owner]?.color ?? '#7a6a50';
  }

  const isPlanning  = actionBeingPlanned === 'attack' || actionBeingPlanned === 'move';
  const isExecuting = gameState.phase === 'executing';

  // Pre-build road coordinate lookup
  const roadCoords = useMemo(() => {
    return MAP_FEATURES.roads.map(({ from, to }) => {
      const a = gameState.provinces[from];
      const b = gameState.provinces[to];
      return a && b ? { x1: a.x, y1: a.y, x2: b.x, y2: b.y } : null;
    }).filter(Boolean);
  }, [gameState.provinces]);

  return (
    <div className={`relative ${className}`} style={{ overflow: 'hidden' }}>
      {/* ── Parchment background (CSS) ─────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at 50% 50%, #c8a96e 0%, #b8924a 45%, #9a7535 100%)
          `,
          opacity: 1,
        }}
      />
      {/* Vignette / aged edges */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(20,10,0,0.7) 100%)',
        }}
      />

      <svg
        ref={svgRef}
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        className="w-full h-full relative"
        style={{ display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredId(null)}
      >
        <defs>
          {/* Parchment grain filter */}
          <filter id="parchment-grain" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" result="noise" />
            <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise" />
            <feBlend in="SourceGraphic" in2="grayNoise" mode="multiply" result="blended" />
            <feComposite in="blended" in2="SourceGraphic" operator="in" />
          </filter>

          {/* Soft glow for highlighted provinces */}
          <filter id="glow-soft">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>

          {/* Drop shadow for province circles */}
          <filter id="province-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="1" dy="2" stdDeviation="2" floodColor="rgba(0,0,0,0.5)" />
          </filter>
        </defs>

        {/* Parchment texture overlay on SVG */}
        <rect width={MAP_W} height={MAP_H} fill="rgba(160,120,60,0.08)" filter="url(#parchment-grain)" />

        {/* ── Faint geographic grid lines (like old map longitude/latitude) ── */}
        {[1, 2, 3, 4].map((i) => (
          <line key={`gl-h${i}`} x1={0} y1={i * MAP_H / 5} x2={MAP_W} y2={i * MAP_H / 5}
            stroke="rgba(100,70,20,0.06)" strokeWidth={0.5} strokeDasharray="4 8" />
        ))}
        {[1, 2, 3, 4].map((i) => (
          <line key={`gl-v${i}`} x1={i * MAP_W / 5} y1={0} x2={i * MAP_W / 5} y2={MAP_H}
            stroke="rgba(100,70,20,0.06)" strokeWidth={0.5} strokeDasharray="4 8" />
        ))}

        {/* ── Roads (faint dotted lines beneath provinces) ─────────────── */}
        {roadCoords.map((r, i) => r && (
          <line
            key={`road-${i}`}
            x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2}
            stroke="rgba(100,70,30,0.28)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
        ))}

        {/* ── Edges (province connections) ─────────────────────────────── */}
        {edges.map(([a, b]) => {
          const pa = gameState.provinces[a];
          const pb = gameState.provinces[b];
          if (!pa || !pb) return null;
          const bothVis =
            (gameState.fogOfWar[a]?.visible || gameState.fogOfWar[a]?.partial) &&
            (gameState.fogOfWar[b]?.visible || gameState.fogOfWar[b]?.partial);
          return (
            <line
              key={`${a}-${b}`}
              x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
              stroke={bothVis ? 'rgba(80,55,20,0.35)' : 'rgba(80,55,20,0.12)'}
              strokeWidth={bothVis ? 1 : 0.7}
            />
          );
        })}

        {/* ── Rivers ───────────────────────────────────────────────────── */}
        {MAP_FEATURES.rivers.map((river) => (
          <path
            key={river.id}
            d={pointsToSmoothPath(river.points)}
            fill="none"
            stroke="rgba(60,110,200,0.55)"
            strokeWidth={river.width ?? 2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* ── Forest decoration ─────────────────────────────────────────── */}
        {MAP_FEATURES.forestSites.map((f, i) => (
          <text key={`f-${i}`} x={f.x} y={f.y} fontSize={10} textAnchor="middle"
            fill="rgba(60,100,30,0.45)" fontFamily="serif">
            ♣
          </text>
        ))}

        {/* ── Mountain decoration ───────────────────────────────────────── */}
        {MAP_FEATURES.mountainSites.map((m, i) => {
          const s = m.size ?? 1.0;
          return (
            <g key={`m-${i}`} transform={`translate(${m.x},${m.y}) scale(${s})`}>
              {/* Simple mountain triangle */}
              <polygon
                points="0,-8 6,2 -6,2"
                fill="rgba(100,80,50,0.35)"
                stroke="rgba(80,60,30,0.4)"
                strokeWidth={0.6}
              />
              <polygon
                points="0,-12 9,4 -9,4"
                fill="none"
                stroke="rgba(80,60,30,0.25)"
                strokeWidth={0.5}
              />
            </g>
          );
        })}

        {/* ── Province nodes ────────────────────────────────────────────── */}
        {Object.values(gameState.provinces).map((p) => {
          const fog         = gameState.fogOfWar[p.id];
          const opacity     = fogOpacity(fog);
          const fill        = fillColor(p, fog);
          const isSelected  = p.id === selectedProvinceId;
          const isHovered   = p.id === hoveredId;
          const isArmySrc   = p.id === (pendingMoveArmyId ? gameState.armies[pendingMoveArmyId]?.provinceId : null);
          const isValidTgt  = validTargetIds.has(p.id);
          const isArmyProv  = armyProvinceIds.has(p.id);
          const isStep1     = isPlanning && !pendingMoveArmyId && isArmyProv;

          const armiesHere = Object.values(gameState.armies).filter((a) => a.provinceId === p.id && a.size > 0);

          let strokeColor = 'rgba(60,40,10,0.6)';
          let strokeWidth = 1;
          let glowColor: string | null = null;

          if (isArmySrc) {
            strokeColor = '#60A5FA'; strokeWidth = 2.5; glowColor = '#3B82F6';
          } else if (isValidTgt && actionBeingPlanned === 'attack') {
            strokeColor = '#EF4444'; strokeWidth = 2.5; glowColor = '#DC2626';
          } else if (isValidTgt && actionBeingPlanned === 'move') {
            strokeColor = '#22C55E'; strokeWidth = 2; glowColor = '#16A34A';
          } else if (isStep1) {
            strokeColor = '#93C5FD'; strokeWidth = 2; glowColor = '#3B82F6';
          } else if (isSelected) {
            strokeColor = '#F59E0B'; strokeWidth = 2.5;
          } else if (isHovered) {
            strokeColor = 'rgba(200,160,80,0.9)'; strokeWidth = 1.5;
          } else if (p.isCapital) {
            strokeColor = 'rgba(80,55,20,0.8)'; strokeWidth = 1.5;
          }

          const previewOdds = hoveredId === p.id && combatPreview ? combatPreview.odds : null;
          const terrainTint = TERRAIN_TINT[p.terrain] ?? 'rgba(0,0,0,0)';

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
                  strokeDasharray={isValidTgt ? '4 3' : 'none'}
                  opacity={0.7}
                />
              )}

              {/* Pulsing outer ring for step-1 selectable provinces */}
              {isStep1 && (
                <circle cx={p.x} cy={p.y} r={R + 9} fill="none" stroke="#3B82F6" strokeWidth={1} opacity={0.25} />
              )}

              {/* Capital diamond marker */}
              {p.isCapital && (
                <polygon
                  points={`${p.x},${p.y - R - 5} ${p.x + R + 5},${p.y} ${p.x},${p.y + R + 5} ${p.x - R - 5},${p.y}`}
                  fill={fill} stroke={strokeColor} strokeWidth={strokeWidth} opacity={0.3}
                />
              )}

              {/* Odds preview glow ring */}
              {previewOdds && (
                <circle cx={p.x} cy={p.y} r={R + 3} fill={ODDS_COLOR[previewOdds]} opacity={0.22} />
              )}

              {/* Terrain tint under province circle */}
              <circle cx={p.x} cy={p.y} r={R + 1} fill={terrainTint} />

              {/* Main province circle */}
              <circle
                cx={p.x} cy={p.y} r={R}
                fill={fill}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                filter="url(#province-shadow)"
              />

              {/* Province inner texture (subtle parchment ring) */}
              <circle
                cx={p.x} cy={p.y} r={R - 3}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={0.5}
              />

              {/* Fort indicator — small battlements */}
              {p.fortLevel > 0 && (fog?.visible || fog?.scouted) && (
                <text x={p.x} y={p.y - R - 4} textAnchor="middle" fontSize={7}
                  fill="rgba(220,200,150,0.9)" fontFamily="serif">
                  {'▲'.repeat(p.fortLevel)}
                </text>
              )}

              {/* Army dots */}
              {armiesHere.map((army, i) => {
                const k = gameState.kingdoms[army.kingdomId];
                const isActed = !!(gameState.armyCampaignUsed ?? {})[army.id];
                const dotColor = army.kingdomId === playerKid
                  ? (isActed ? '#9ca3af' : '#FCD34D')
                  : (k?.color ?? '#fff');
                return (
                  <circle
                    key={army.id}
                    cx={p.x + R - 5 + i * 7}
                    cy={p.y - R + 5}
                    r={4}
                    fill={dotColor}
                    stroke="rgba(0,0,0,0.6)"
                    strokeWidth={1}
                    aria-label={isActed ? `${army.name} — Acted` : `${army.name} — Ready`}
                  />
                );
              })}

              {/* Province label — ink-style serif font */}
              <text
                x={p.x} y={p.y + R + 12}
                textAnchor="middle"
                fontSize={fog?.visible ? 8 : 7}
                fill={fog?.visible ? 'rgba(40,25,5,0.95)' : fog?.partial ? 'rgba(40,25,5,0.55)' : 'rgba(40,25,5,0.22)'}
                fontFamily="'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {fog?.visible || fog?.partial || fog?.scouted ? p.name : '???'}
              </text>

              {/* Terrain glyph (visible provinces) */}
              {fog?.visible && (
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={10}
                  style={{ pointerEvents: 'none' }}>
                  {terrainGlyph(p.terrain)}
                </text>
              )}
            </g>
          );
        })}

        {/* ── Map title and attribution ─────────────────────────────────── */}
        <text x={12} y={18} fontSize={10} fill="rgba(60,35,8,0.7)"
          fontFamily="'Palatino Linotype', Georgia, serif" fontStyle="italic">
          Central Plains — {gameState.year} BCE
        </text>
        <text x={MAP_W - 10} y={18} fontSize={8} fill="rgba(60,35,8,0.5)"
          textAnchor="end" fontFamily="'Palatino Linotype', Georgia, serif">
          {Object.values(gameState.provinces).filter((p) => p.owner === playerKid).length}/
          {Object.keys(gameState.provinces).length} provinces
        </text>

        {/* ── Executing overlay ─────────────────────────────────────────── */}
        {isExecuting && (
          <g>
            <rect x={0} y={0} width={MAP_W} height={MAP_H} fill="rgba(0,0,0,0.6)" />
            <text x={MAP_W / 2} y={MAP_H / 2 - 10} textAnchor="middle" fontSize={22}
              fill="#D4A86A" fontFamily="'Palatino Linotype', Georgia, serif" fontStyle="italic">
              Resolving Season...
            </text>
            <text x={MAP_W / 2} y={MAP_H / 2 + 16} textAnchor="middle" fontSize={11}
              fill="rgba(212,168,106,0.6)" fontFamily="Georgia, serif">
              AI kingdoms are making their moves
            </text>
          </g>
        )}
      </svg>

      {/* ── Kingdom legend ────────────────────────────────────────────── */}
      <div className="absolute bottom-2 left-2 flex flex-wrap gap-1 pointer-events-none">
        {Object.values(gameState.kingdoms)
          .filter((k) => !k.isEliminated)
          .map((k) => {
            const count = Object.values(gameState.provinces).filter((p) => p.owner === k.id).length;
            return (
              <div key={k.id} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(20,10,0,0.75)' }}>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: k.color }} />
                <span style={{ color: k.color }}>{k.name}</span>
                <span className="text-amber-900">{count}</span>
                {k.isPlayer && <span className="text-amber-400 text-xs">★</span>}
              </div>
            );
          })}
      </div>

      {/* ── Hover tooltip (HTML overlay) ─────────────────────────────── */}
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

      {/* ── Planning mode instruction banner ─────────────────────────── */}
      {isPlanning && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none z-10">
          <div className={`px-4 py-1.5 rounded-full text-xs font-medium border shadow-lg ${
            actionBeingPlanned === 'attack'
              ? 'bg-red-950/90 border-red-700 text-red-200'
              : 'bg-blue-950/90 border-blue-700 text-blue-200'
          }`}>
            {!pendingMoveArmyId
              ? (actionBeingPlanned === 'attack'
                  ? '⚔ Attack: Click a province with a ready army'
                  : '⇒ Move: Click a province with a ready army')
              : (actionBeingPlanned === 'attack'
                  ? '⚔ Click an enemy province to attack — ESC to cancel'
                  : '⇒ Click a friendly province to move to — ESC to cancel')}
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
  const fog      = gameState.fogOfWar[provinceId];
  const owner    = gameState.kingdoms[p.owner];
  const isVisible = fog?.visible || fog?.scouted;
  const isPartial = fog?.partial;

  const armies = (Object.values(gameState.armies) as any[]).filter((a) => a.provinceId === provinceId && a.size > 0);

  const tooltipW = 220;
  const tooltipH = 170;
  let tx = mousePos.x + 14;
  let ty = mousePos.y - 10;
  const containerW = 820;
  if (tx + tooltipW > containerW) tx = mousePos.x - tooltipW - 14;
  if (ty + tooltipH > 680) ty = mousePos.y - tooltipH - 10;

  return (
    <div className="absolute pointer-events-none z-50" style={{ left: tx, top: ty, width: tooltipW }}>
      <div className="border border-amber-900/60 rounded-lg p-3 shadow-xl text-xs space-y-2"
        style={{ background: 'rgba(28,18,6,0.97)' }}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="font-bold text-amber-100" style={{ fontFamily: 'Georgia, serif' }}>{p.name}</span>
          <span className="capitalize text-amber-800 text-[10px]">{p.terrain}</span>
        </div>

        {/* Owner */}
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: owner?.color ?? '#888' }} />
          <span style={{ color: owner?.color ?? '#888' }}>{owner?.name ?? 'Unknown'}</span>
          {p.isCapital && <span className="text-amber-400 text-[10px]">★ Capital</span>}
        </div>

        {/* Stats */}
        {isVisible ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-amber-200">
            <span className="text-amber-700">Garrison</span><span>{p.garrison.toLocaleString()}</span>
            <span className="text-amber-700">Unrest</span>
            <span className={p.unrest > 60 ? 'text-red-400' : p.unrest > 30 ? 'text-yellow-400' : 'text-green-400'}>
              {p.unrest}/100
            </span>
            <span className="text-amber-700">Fort</span><span>Lv.{p.fortLevel}</span>
            <span className="text-amber-700">Income</span><span>+{p.baseIncome}{p.hasMarket ? '+2' : ''}</span>
            <span className="text-amber-700">Food</span><span>+{p.baseFood}{p.hasFarm ? '+2' : ''}</span>
          </div>
        ) : isPartial ? (
          <div className="text-amber-700 space-y-0.5">
            <div>Garrison: <span className="text-amber-400 capitalize">{fog?.lastKnownGarrisonTier ?? 'unknown'}</span></div>
            <div className="italic text-amber-800">Scout for full intelligence</div>
          </div>
        ) : (
          <div className="text-amber-800 italic">Terra incognita — scout to reveal</div>
        )}

        {/* Armies */}
        {armies.length > 0 && (isVisible || isPartial) && (
          <div className="border-t border-amber-900/50 pt-1.5">
            {armies.map((a: any) => {
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
          <div className="border-t border-amber-900/50 pt-1.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-amber-700">Battle odds</span>
              <span className="font-bold capitalize" style={{ color: ODDS_COLOR[combatPreview.odds] }}>
                {combatPreview.odds} ({combatPreview.winChancePct}%)
              </span>
            </div>
            <div className="flex justify-between text-amber-800">
              <span>Your power</span>
              <span className="text-amber-300">{Math.round(combatPreview.attackerPowerBase).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-amber-800">
              <span>Enemy power</span>
              <span className="text-amber-300">{Math.round(combatPreview.defenderPowerBase).toLocaleString()}</span>
            </div>
            {combatPreview.terrainNote && (
              <div className="text-yellow-600 text-[10px]">{combatPreview.terrainNote}</div>
            )}
            <div className="text-amber-800 text-[10px] italic">Click to commit to battle</div>
          </div>
        )}

        {isAttackMode && !isValidTarget && (
          <div className="text-red-700 text-[10px] italic border-t border-amber-900/50 pt-1">
            Not a valid attack target
          </div>
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
