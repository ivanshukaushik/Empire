import React, { useState, useRef, useEffect } from 'react';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  delay?: number;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * Wraps any child element and shows a tooltip on hover.
 * Uses a portal-free absolute-positioned approach.
 */
export function Tooltip({ content, children, delay = 300, side = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  function show() {
    timerRef.current = setTimeout(() => setVisible(true), delay);
  }
  function hide() {
    clearTimeout(timerRef.current);
    setVisible(false);
  }

  const sideClasses: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  };

  return (
    <span className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && content && (
        <div
          className={`pointer-events-none absolute z-[9999] ${sideClasses[side]} whitespace-nowrap`}
        >
          <div className="bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-200 shadow-lg max-w-xs whitespace-normal">
            {content}
          </div>
        </div>
      )}
    </span>
  );
}

/** Simple string-only tooltip for icon stats */
export function StatTooltip({
  tip, children,
}: { tip: string; children: React.ReactElement }) {
  return <Tooltip content={<span>{tip}</span>} side="top">{children}</Tooltip>;
}
