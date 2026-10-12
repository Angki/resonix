import React, { useRef } from 'react';

interface AlphabetBarProps {
  activeLetters: Set<string>;
  selectedLetter?: string | null;
  onSelectLetter: (letter: string) => void;
}

const ALPHABET = ['ALL', '#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

export const AlphabetBar: React.FC<AlphabetBarProps> = ({
  activeLetters,
  selectedLetter,
  onSelectLetter,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleWheel = (e: React.WheelEvent) => {
    if (containerRef.current && e.deltaY !== 0) {
      containerRef.current.scrollLeft += e.deltaY * 0.8;
    }
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      className="h-8 bg-charcoal-950/90 backdrop-blur-xs border-b border-charcoal-800/90 px-3 flex items-center overflow-x-auto no-scrollbar select-none text-[11px] font-mono shrink-0 shadow-inner"
    >
      <div className="flex items-center gap-1.5 sm:gap-2 md:gap-2.5 min-w-max mx-auto py-1">
        {ALPHABET.map((char) => {
          const isAll = char === 'ALL';
          const isAvailable = isAll || activeLetters.has(char);
          const isSelected = isAll ? !selectedLetter : selectedLetter === char;

          return (
            <button
              key={char}
              disabled={!isAvailable}
              onClick={() => onSelectLetter(isAll ? '' : char)}
              title={
                isAll
                  ? 'Show All'
                  : isAvailable
                  ? `Jump to ${char}`
                  : `No items starting with ${char}`
              }
              className={`min-w-[24px] h-6 px-1.5 sm:px-2 flex items-center justify-center rounded-md transition-all duration-150 font-mono text-[11px] font-semibold ${
                isSelected
                  ? 'bg-crimson-600 text-white font-bold shadow-sm shadow-crimson-900/60 scale-105 border border-crimson-500'
                  : isAvailable
                  ? 'text-zinc-300 hover:text-white hover:bg-charcoal-800 border border-transparent hover:border-charcoal-700 active:scale-95 cursor-pointer'
                  : 'text-zinc-650/40 cursor-default border border-transparent opacity-25'
              }`}
            >
              {char}
            </button>
          );
        })}
      </div>
    </div>
  );
};

