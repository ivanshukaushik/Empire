import React, { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import type { Minister } from '../engine/types';

// ============================================================
// MINISTER PANEL — Court audience UI
// ============================================================

const ROLE_ICONS: Record<string, string> = {
  chancellor: '📜',
  general:    '⚔️',
  treasurer:  '💰',
  spymaster:  '🕵',
};

const ACTION_LABELS: Record<string, string> = {
  recruit:            'Recruiting troops',
  move:               'Moving army',
  attack:             'Ordering attack',
  levy:               'Raising levy',
  split_army:         'Splitting army',
  build:              'Ordering construction',
  espionage_scout:    'Dispatching scouts',
  espionage_sabotage: 'Sending saboteurs',
  espionage_incite:   'Inciting unrest',
  diplomacy_nap:      'Sending envoy',
  diplomacy_tribute:  'Offering tribute',
};

const ROLE_LABELS: Record<string, string> = {
  chancellor: 'Chancellor',
  general:    'Supreme General',
  treasurer:  'Treasurer',
  spymaster:  'Spymaster',
};

function loyaltyColor(displayed: number): string {
  if (displayed >= 70) return 'text-green-400';
  if (displayed >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

function loyaltyLabel(displayed: number): string {
  if (displayed >= 80) return 'Devoted';
  if (displayed >= 60) return 'Loyal';
  if (displayed >= 40) return 'Uncertain';
  if (displayed >= 20) return 'Wavering';
  return 'Suspect';
}

// ── Minister card (list view) ─────────────────────────────────

interface MinisterCardProps {
  minister: Minister;
  onClick: () => void;
}

function MinisterCard({ minister, onClick }: MinisterCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-amber-950/40 hover:bg-amber-900/50 border border-amber-800/40 rounded p-3 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{ROLE_ICONS[minister.role]}</span>
          <div>
            <div className="font-semibold text-amber-100 text-sm">{minister.name}</div>
            <div className="text-amber-400/70 text-xs">{ROLE_LABELS[minister.role]} · Age {minister.age}</div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-xs font-medium ${loyaltyColor(minister.displayedLoyalty)}`}>
            {loyaltyLabel(minister.displayedLoyalty)}
          </div>
          {minister.suspicion > 30 && (
            <div className="text-xs text-orange-400 mt-0.5">⚠ Suspected</div>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex gap-1 flex-wrap">
        {minister.personality.map((p) => (
          <span key={p} className="text-[10px] bg-amber-900/50 text-amber-300/70 px-1.5 py-0.5 rounded">
            {p}
          </span>
        ))}
        <span className="text-[10px] bg-amber-900/30 text-amber-400/50 px-1.5 py-0.5 rounded">
          Competence {minister.competence}/10
        </span>
      </div>
      {minister.conversationHistory.length > 0 && (
        <div className="mt-1 text-[10px] text-amber-500/50 italic truncate">
          Last: "{minister.conversationHistory[minister.conversationHistory.length - 1].content.slice(0, 60)}…"
        </div>
      )}
    </button>
  );
}

// ── Audience modal (conversation) ─────────────────────────────

interface AudienceModalProps {
  minister: Minister;
  onClose: () => void;
  onRaiseSuspicion: () => void;
  onLowerSuspicion: () => void;
}

function AudienceModal({ minister, onClose, onRaiseSuspicion, onLowerSuspicion }: AudienceModalProps) {
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const consultMinister = useGameStore((s) => s.consultMinister);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [minister.conversationHistory.length, loading]);

  async function send() {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput('');
    setError(null);
    setLoading(true);
    try {
      await consultMinister(minister.id, msg);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not valid')) {
        setError(`Minister tried to act but the action wasn't valid in the current game state.`);
      } else {
        setError('The minister did not respond. (Is the server running on port 3001?)');
      }
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const history = minister.conversationHistory;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-[#1c1408] border border-amber-800/60 rounded-lg shadow-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-amber-800/40">
          <div className="flex items-center gap-2">
            <span className="text-xl">{ROLE_ICONS[minister.role]}</span>
            <div>
              <div className="font-semibold text-amber-100">{minister.name}</div>
              <div className="text-xs text-amber-400/60">{ROLE_LABELS[minister.role]} · {minister.personality.join(', ')}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Suspicion controls */}
            <div className="text-right mr-2">
              <div className="text-[10px] text-amber-500/60 mb-0.5">Your suspicion</div>
              <div className="flex items-center gap-1">
                <button
                  onClick={onLowerSuspicion}
                  className="text-xs text-amber-600 hover:text-amber-400 px-1"
                  title="Lower suspicion"
                >−</button>
                <span className={`text-xs font-mono ${minister.suspicion > 60 ? 'text-red-400' : minister.suspicion > 30 ? 'text-yellow-400' : 'text-green-400/60'}`}>
                  {minister.suspicion}
                </span>
                <button
                  onClick={onRaiseSuspicion}
                  className="text-xs text-amber-600 hover:text-amber-400 px-1"
                  title="Raise suspicion"
                >+</button>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-amber-500 hover:text-amber-300 text-xl leading-none px-1"
            >×</button>
          </div>
        </div>

        {/* Conversation */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px]"
        >
          {history.length === 0 && (
            <p className="text-amber-600/50 italic text-sm text-center mt-8">
              {minister.name} waits in silence, hands folded, eyes cast downward.
            </p>
          )}
          {history.map((msg, i) => (
            <div
              key={i}
              className={`text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'text-amber-200 pl-3 border-l-2 border-amber-600/50'
                  : 'text-amber-100/90 bg-amber-950/30 rounded p-2.5 border border-amber-800/20'
              }`}
            >
              {msg.role === 'user' && (
                <span className="text-amber-500/70 text-xs block mb-0.5">You</span>
              )}
              {msg.role === 'assistant' && (
                <span className="text-amber-600/60 text-xs block mb-0.5">{minister.name}</span>
              )}
              {msg.content}
            </div>
          ))}
          {loading && (
            <div className="text-amber-600/50 italic text-sm text-center animate-pulse">
              {minister.name} considers your words…
            </div>
          )}
          {error && (
            <div className="text-red-400/80 text-xs text-center bg-red-950/30 rounded p-2">
              {error}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-amber-800/40">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Speak to your minister… (Enter to send)"
              rows={2}
              className="flex-1 bg-amber-950/40 border border-amber-800/40 rounded px-3 py-2 text-amber-100 text-sm placeholder-amber-700/50 resize-none focus:outline-none focus:border-amber-600/60"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="px-4 bg-amber-800/60 hover:bg-amber-700/60 disabled:opacity-40 text-amber-100 text-sm rounded transition-colors"
            >
              Speak
            </button>
          </div>
          <p className="text-[10px] text-amber-700/40 mt-1">
            Shift+Enter for new line. Your ministers remember what you say.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────

export function MinisterPanel() {
  const gameState           = useGameStore((s) => s.gameState);
  const setMinisterSuspicion = useGameStore((s) => s.setMinisterSuspicion);
  const [activeId, setActiveId] = useState<string | null>(null);

  if (!gameState) return null;

  const kid       = gameState.playerKingdomId;
  const ministers = gameState.ministers?.[kid] ?? [];

  const activeMinister = activeId ? ministers.find((m) => m.id === activeId) ?? null : null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-amber-500/60 italic mb-3">
        Your court advises you. Trust wisely — not all who bow are loyal.
      </p>
      {ministers.map((m) => (
        <MinisterCard
          key={m.id}
          minister={m}
          onClick={() => setActiveId(m.id)}
        />
      ))}

      {activeMinister && (
        <AudienceModal
          minister={activeMinister}
          onClose={() => setActiveId(null)}
          onRaiseSuspicion={() => setMinisterSuspicion(activeMinister.id, 10)}
          onLowerSuspicion={() => setMinisterSuspicion(activeMinister.id, -10)}
        />
      )}
    </div>
  );
}
