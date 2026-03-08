/**
 * CommandBox — Phase 4K intent control layer.
 *
 * A text input that parses natural-language commands (no LLM) into
 * concrete game actions, shows a plan preview, and lets the player
 * approve with Enter or cancel with Escape.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { parseCommand, ParsedIntent, IntentKind } from '../engine/commandParser';

interface Props {
  onClose: () => void;
}

const KIND_ICON: Record<IntentKind, string> = {
  conquer:   '⚔',
  defend:    '🛡',
  stabilize: '🏗',
  peace:     '✋',
  unknown:   '?',
};

const KIND_COLOR: Record<IntentKind, string> = {
  conquer:   'text-red-400',
  defend:    'text-blue-400',
  stabilize: 'text-green-400',
  peace:     'text-purple-400',
  unknown:   'text-gray-500',
};

export default function CommandBox({ onClose }: Props) {
  const gameState  = useGameStore((s) => s.gameState!);
  const queueAction = useGameStore((s) => s.queueAction);

  const [input, setInput] = useState('');
  const [intent, setIntent] = useState<ParsedIntent | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Parse intent as user types (debounced 150ms for snappiness)
  useEffect(() => {
    if (!input.trim()) { setIntent(null); return; }
    const timer = setTimeout(() => {
      setIntent(parseCommand(input, gameState));
    }, 150);
    return () => clearTimeout(timer);
  }, [input, gameState]);

  const handleApprove = useCallback(() => {
    if (!intent?.canExecute || !intent.actions) return;
    for (const action of intent.actions) {
      queueAction(action as any);
    }
    onClose();
  }, [intent, queueAction, onClose]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    if (e.key === 'Enter') { e.preventDefault(); handleApprove(); }
  }

  return (
    <div
      className="absolute inset-x-0 bottom-16 flex justify-center pointer-events-none z-40"
      style={{ padding: '0 1rem' }}
    >
      <div
        className="w-full max-w-xl pointer-events-auto rounded-xl border border-amber-800/60 shadow-2xl"
        style={{ background: 'rgba(12,8,2,0.97)' }}
      >
        {/* Input row */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-900/40">
          <span className="text-amber-600 text-sm select-none">⌘</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="conquer Handan  ·  defend Xianyang  ·  make peace with Zhao  ·  stabilize"
            className="flex-1 bg-transparent text-amber-100 text-sm placeholder-amber-900/60 outline-none"
            spellCheck={false}
            autoComplete="off"
          />
          <button
            className="text-amber-800 hover:text-amber-500 text-xs px-1"
            onClick={onClose}
          >
            ESC
          </button>
        </div>

        {/* Intent preview */}
        {intent && (
          <div className="px-3 py-2.5 space-y-2">
            {/* Summary line */}
            <div className={`flex items-start gap-2 text-sm ${KIND_COLOR[intent.kind]}`}>
              <span className="mt-0.5 flex-shrink-0">{KIND_ICON[intent.kind]}</span>
              <span className="leading-snug">{intent.actionSummary}</span>
            </div>

            {/* Detail grid */}
            {intent.canExecute && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-amber-700 pl-5">
                {intent.provinceName && (
                  <>
                    <span>Target</span>
                    <span className="text-amber-300">{intent.provinceName}</span>
                  </>
                )}
                {intent.kingdomName && (
                  <>
                    <span>Owner</span>
                    <span className="text-amber-300">{intent.kingdomName}</span>
                  </>
                )}
                {intent.etaDays !== undefined && (
                  <>
                    <span>ETA</span>
                    <span className="text-amber-300">~{intent.etaDays} days</span>
                  </>
                )}
                {intent.riskNote && (
                  <>
                    <span>Risk</span>
                    <span className="text-amber-300">{intent.riskNote}</span>
                  </>
                )}
              </div>
            )}

            {/* Reason why blocked */}
            {!intent.canExecute && intent.reason && (
              <div className="text-xs text-red-600 pl-5 italic">{intent.reason}</div>
            )}

            {/* Approve / cancel */}
            {intent.canExecute && (
              <div className="flex items-center gap-2 pl-5 pt-1">
                <button
                  onClick={handleApprove}
                  className="text-xs px-2.5 py-1 rounded bg-amber-800/60 hover:bg-amber-700/80 text-amber-200 border border-amber-700/50 transition-colors"
                >
                  ↵ Approve
                </button>
                <button
                  onClick={onClose}
                  className="text-xs px-2.5 py-1 rounded hover:bg-gray-800 text-gray-600 hover:text-gray-400 transition-colors"
                >
                  Esc Cancel
                </button>
                <span className="ml-auto text-amber-900 text-[10px]">Enter to approve</span>
              </div>
            )}
          </div>
        )}

        {/* Hint when empty */}
        {!intent && (
          <div className="px-3 py-2 text-[11px] text-amber-900/70 space-x-3">
            <span>conquer <em>province</em></span>
            <span>·</span>
            <span>defend <em>province</em></span>
            <span>·</span>
            <span>stabilize</span>
            <span>·</span>
            <span>make peace with <em>kingdom</em></span>
          </div>
        )}
      </div>
    </div>
  );
}
