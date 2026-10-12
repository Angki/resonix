import React from 'react';

interface AlphabetBarProps {
  activeLetters: Set<string>;
  selectedLetter?: string | null;
  onSelectLetter: (letter: string) => void;
}

const ALPHABET = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

export const AlphabetBar: React.FC<AlphabetBarProps> = ({
  activeLetters,
  selectedLetter,
  onSelectLetter,
}) => {
  return (
    <div className="h-6.5 bg-charcoal-900/95 border-b border-charcoal-800 px-2 flex items-center justify-center overflow-x-auto no-scrollbar select-none text-[10px] font-mono shrink-0">
      <div className="flex items-center space-x-0.5 min-w-max mx-auto py-0.5">
        {ALPHABET.map((char) => {
          const isAvailable = activeLetters.has(char);
          const isSelected = selectedLetter === char;

          return (
            <button
              key={char}
              disabled={!isAvailable}
              onClick={() => onSelectLetter(char)}
              title={isAvailable ? `Jump to ${char}` : `No items starting with ${char}`}
              className={`w-4.5 h-4.5 flex items-center justify-center rounded transition font-medium ${
                isSelected
                  ? 'bg-crimson-700 text-white font-bold shadow-xs'
                  : isAvailable
                  ? 'text-zinc-300 hover:text-white hover:bg-charcoal-750 cursor-pointer'
                  : 'text-zinc-650 cursor-default opacity-30'
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
