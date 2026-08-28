import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

/**
 * Tooltip — wraps any element; shows tooltip text on hover/focus.
 *
 * Props:
 *   text      {string}  – tooltip content (plain text or JSX)
 *   position  {'top'|'bottom'|'left'|'right'}  – default 'top'
 *   width     {string}  – tailwind max-w class, default 'max-w-xs'
 *   children  {ReactNode}
 */
export function Tooltip({ text, position = 'top', width = 'max-w-xs', children }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  const show = () => {
    timerRef.current = setTimeout(() => setVisible(true), 200);
  };
  const hide = () => {
    clearTimeout(timerRef.current);
    setVisible(false);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const posClass = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left:   'right-full top-1/2 -translate-y-1/2 mr-2',
    right:  'left-full top-1/2 -translate-y-1/2 ml-2',
  }[position] ?? 'bottom-full left-1/2 -translate-x-1/2 mb-2';

  const arrowClass = {
    top:    'top-full left-1/2 -translate-x-1/2 border-t-gray-800 border-x-transparent border-b-transparent border-[5px]',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-800 border-x-transparent border-t-transparent border-[5px]',
    left:   'left-full top-1/2 -translate-y-1/2 border-l-gray-800 border-y-transparent border-r-transparent border-[5px]',
    right:  'right-full top-1/2 -translate-y-1/2 border-r-gray-800 border-y-transparent border-l-transparent border-[5px]',
  }[position] ?? 'top-full left-1/2 -translate-x-1/2 border-t-gray-800 border-x-transparent border-b-transparent border-[5px]';

  return (
    <span className="relative inline-flex"
      onMouseEnter={show} onMouseLeave={hide}
      onFocus={show}     onBlur={hide}>
      {children}
      {visible && text && (
        <span className={`absolute z-[9999] pointer-events-none ${posClass}`}>
          <span className={`block ${width} rounded-lg bg-gray-800 text-white text-xs leading-relaxed px-3 py-2 shadow-lg whitespace-normal`}>
            {text}
          </span>
          <span className={`absolute w-0 h-0 ${arrowClass}`} />
        </span>
      )}
    </span>
  );
}

/**
 * HelpIcon — a small ⓘ/? circle that shows a tooltip on hover.
 * Drop next to any label or heading.
 *
 * Props:
 *   text      {string}  – tooltip content
 *   position  {'top'|'bottom'|'left'|'right'}
 *   width     {string}  – tailwind max-w class
 *   size      {number}  – icon size px, default 14
 */
export function HelpIcon({ text, position = 'top', width = 'max-w-xs', size = 14 }) {
  return (
    <Tooltip text={text} position={position} width={width}>
      <span className="inline-flex items-center justify-center rounded-full text-gray-400 hover:text-blue-500 cursor-help transition-colors">
        <HelpCircle size={size} />
      </span>
    </Tooltip>
  );
}

export default Tooltip;
