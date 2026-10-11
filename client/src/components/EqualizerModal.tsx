import React from 'react';
import { Sliders, X, RotateCcw, Power, Check } from 'lucide-react';
import { useEqualizerStore, EQ_FREQUENCIES, EQ_PRESETS } from '../store/equalizerStore';
import { useUiStore } from '../store/uiStore';

function formatFreq(f: number): string {
  if (f >= 1000) return `${f / 1000}k`;
  return `${f}`;
}

export const EqualizerModal: React.FC = () => {
  const { isEqualizerOpen, setEqualizerOpen } = useUiStore();
  const {
    isEnabled,
    gains,
    activePreset,
    toggleEnabled,
    setBandGain,
    applyPreset,
    resetFlat,
  } = useEqualizerStore();

  if (!isEqualizerOpen) return null;

  const currentPresetObj = EQ_PRESETS.find(p => p.name === activePreset);

  return (
    <div
      onClick={() => setEqualizerOpen(false)}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-charcoal-900 border border-charcoal-700 w-full max-w-2xl rounded-lg shadow-2xl overflow-hidden flex flex-col text-xs"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-charcoal-950 border-b border-charcoal-800">
          <div className="flex items-center space-x-2">
            <Sliders size={16} className="text-crimson-500" />
            <h2 className="font-semibold text-zinc-100 text-sm">10-Band Graphic Equalizer</h2>
            <span className="font-mono text-[10px] text-zinc-500 bg-charcoal-850 px-1.5 py-0.5 rounded border border-charcoal-800">
              WebAudio DSP
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={toggleEnabled}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium transition border ${
                isEnabled
                  ? 'bg-crimson-900/40 border-crimson-600 text-crimson-300'
                  : 'bg-charcoal-800 border-charcoal-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Power size={12} className={isEnabled ? 'text-crimson-400' : 'text-zinc-500'} />
              <span>{isEnabled ? 'ENABLED' : 'BYPASSED'}</span>
            </button>

            <button
              onClick={() => setEqualizerOpen(false)}
              className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-charcoal-800 rounded transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Preset Selector */}
        <div className="px-4 py-2.5 bg-charcoal-850 border-b border-charcoal-800 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400 font-mono uppercase tracking-wider text-[10px]">Genre Presets</span>
            <button
              onClick={resetFlat}
              className="flex items-center space-x-1 text-zinc-400 hover:text-zinc-200 hover:underline"
            >
              <RotateCcw size={11} />
              <span>Reset Flat</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {EQ_PRESETS.map((preset) => {
              const isActive = activePreset === preset.name;
              return (
                <button
                  key={preset.name}
                  onClick={() => applyPreset(preset.name)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition border flex items-center space-x-1 ${
                    isActive
                      ? 'bg-crimson-800 text-white border-crimson-600 shadow'
                      : 'bg-charcoal-800 border-charcoal-700/80 text-zinc-300 hover:bg-charcoal-750 hover:text-white'
                  }`}
                >
                  {isActive && <Check size={11} />}
                  <span>{preset.name}</span>
                </button>
              );
            })}
          </div>

          {currentPresetObj && (
            <p className="text-[10.5px] text-zinc-400 italic mt-0.5">
              {currentPresetObj.description}
            </p>
          )}
        </div>

        {/* 10-Band Sliders Rack */}
        <div className="p-4 sm:p-6 bg-charcoal-900/90 flex flex-col items-center">
          <div className="w-full flex items-end justify-between gap-1 sm:gap-3 h-48 sm:h-52 px-1 pb-2">
            {EQ_FREQUENCIES.map((freq, idx) => {
              const gain = gains[idx] ?? 0;
              return (
                <div key={freq} className="flex-1 flex flex-col items-center h-full justify-between group">
                  {/* Gain label */}
                  <span
                    className={`font-mono text-[9px] sm:text-[10px] w-full text-center transition ${
                      gain !== 0 ? 'text-crimson-400 font-semibold' : 'text-zinc-500'
                    }`}
                  >
                    {gain > 0 ? `+${gain}` : gain}
                  </span>

                  {/* Vertical Slider track */}
                  <div className="relative flex-1 flex items-center justify-center py-2 w-full">
                    {/* Zero line indicator */}
                    <div className="absolute top-1/2 left-0 right-0 h-px bg-zinc-700/60 pointer-events-none" />

                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={0.5}
                      value={gain}
                      disabled={!isEnabled}
                      onChange={(e) => setBandGain(idx, parseFloat(e.target.value))}
                      className="accent-crimson-600 cursor-pointer h-full -rotate-90 w-32 sm:w-36 bg-charcoal-800 rounded disabled:opacity-40"
                    />
                  </div>

                  {/* Frequency marker */}
                  <div className="text-center mt-1">
                    <span className="font-mono text-[9px] sm:text-[10.5px] text-zinc-400 group-hover:text-zinc-200">
                      {formatFreq(freq)}
                    </span>
                    <span className="block text-[8px] text-zinc-600">Hz</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Scale labels */}
          <div className="w-full flex justify-between items-center text-[10px] text-zinc-500 font-mono pt-3 border-t border-charcoal-800/80 px-2">
            <span>-12 dB</span>
            <span className="text-zinc-400">0 dB (Unity)</span>
            <span>+12 dB</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-charcoal-950 border-t border-charcoal-800 flex items-center justify-between">
          <span className="text-[11px] text-zinc-500">
            Realtime 10-band bi-quad peaking filter chain with zero latency.
          </span>
          <button
            onClick={() => setEqualizerOpen(false)}
            className="px-3 py-1 bg-charcoal-800 hover:bg-charcoal-750 text-zinc-200 rounded font-medium text-xs transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
