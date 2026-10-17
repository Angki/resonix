import React, { useState } from 'react';
import { Sliders, X, RotateCcw, Power, Check, Radio, Volume2, Headphones, Waves, Sparkles } from 'lucide-react';
import {
  useEqualizerStore,
  EQ_FREQUENCIES_10,
  EQ_FREQUENCIES_5,
  EQ_PRESETS,
  EqBandMode,
  EqPresetCategory,
} from '../store/equalizerStore';
import { useUiStore } from '../store/uiStore';
import { useVisualizerStore, VISUALIZER_MODES } from '../store/visualizerStore';

function formatFreq(f: number): string {
  if (f >= 1000) return `${f / 1000}k`;
  return `${f}`;
}

export const EqualizerModal: React.FC = () => {
  const { isEqualizerOpen, setEqualizerOpen } = useUiStore();
  const {
    isEnabled,
    bandMode,
    gains,
    gains5,
    preAmp,
    activePreset,
    isNormalizerEnabled,
    isCrossfeedEnabled,
    toggleEnabled,
    toggleNormalizer,
    toggleCrossfeed,
    setBandMode,
    setBandGain10,
    setBandGain5,
    setPreAmp,
    applyPreset,
    resetFlat,
  } = useEqualizerStore();

  const { mode: visualizerMode, setMode: setVisualizerMode, setOpen: setVisualizerOpen } = useVisualizerStore();

  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  if (!isEqualizerOpen) return null;

  const currentPresetObj = EQ_PRESETS.find((p) => p.name === activePreset);

  const categories = [
    'All',
    'Metal / Heavy',
    'Ambient / Synth',
    'Audiophile / Acoustic',
    'Utility / Profile',
  ];

  const filteredPresets =
    selectedCategory === 'All'
      ? EQ_PRESETS
      : EQ_PRESETS.filter((p) => p.category === selectedCategory);

  // Generate SVG curve points for frequency response curve graph
  const curvePoints = gains.map((g, idx) => {
    // 10 bands mapped along X: from 40 to 560
    const x = 40 + (idx / 9) * 520;
    // Y: 0dB is at 60px (middle of 120px height), +12dB is at 10px, -12dB is at 110px
    const y = 60 - (g / 12) * 50;
    return { x, y };
  });

  // Construct smooth SVG path
  let pathD = `M ${curvePoints[0].x} ${curvePoints[0].y}`;
  for (let i = 0; i < curvePoints.length - 1; i++) {
    const p0 = curvePoints[i];
    const p1 = curvePoints[i + 1];
    const cpX = (p0.x + p1.x) / 2;
    pathD += ` C ${cpX} ${p0.y}, ${cpX} ${p1.y}, ${p1.x} ${p1.y}`;
  }

  return (
    <div
      onClick={() => setEqualizerOpen(false)}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 select-none overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-charcoal-900 border border-charcoal-700 w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs my-auto"
      >
        {/* Header */}

        <div className="flex items-center justify-between px-4 py-3 bg-charcoal-950 border-b border-charcoal-800">
          <div className="flex items-center space-x-2.5">
            <Sliders size={17} className="text-crimson-500" />
            <h2 className="font-semibold text-zinc-100 text-sm">Parametric Audio Equalizer</h2>

            {/* Mode Switcher: 5-Band vs 10-Band */}
            <div className="flex items-center bg-charcoal-850 p-0.5 rounded-lg border border-charcoal-750 font-mono text-[10px]">
              <button
                onClick={() => setBandMode('5-band')}
                className={`px-2 py-0.5 rounded font-medium transition ${
                  bandMode === '5-band'
                    ? 'bg-crimson-700 text-white font-bold shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                5-BAND
              </button>
              <button
                onClick={() => setBandMode('10-band')}
                className={`px-2 py-0.5 rounded font-medium transition ${
                  bandMode === '10-band'
                    ? 'bg-crimson-700 text-white font-bold shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                10-BAND PRO
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={toggleCrossfeed}
              title="Bauer Stereophonic-to-Binaural (bs2b) Crossfeed: Blends 700Hz low-passed channel cross-feed with 350µs delay to eliminate headphone listening fatigue from extreme stereo pans & harsh mixes."
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-medium transition border ${
                isCrossfeedEnabled
                  ? 'bg-purple-950/50 border-purple-600 text-purple-300'
                  : 'bg-charcoal-800 border-charcoal-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Headphones size={12} className={isCrossfeedEnabled ? 'text-purple-400' : 'text-zinc-500'} />
              <span>{isCrossfeedEnabled ? 'CROSSFEED: ON' : 'CROSSFEED: OFF'}</span>
            </button>

            <button
              onClick={toggleNormalizer}
              title="Dynamics Peak Compressor / Auto Volume Normalizer (prevents sudden ear-blasting peaks)"
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-medium transition border ${
                isNormalizerEnabled
                  ? 'bg-amber-950/40 border-amber-600 text-amber-300'
                  : 'bg-charcoal-800 border-charcoal-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Volume2 size={12} className={isNormalizerEnabled ? 'text-amber-400' : 'text-zinc-500'} />
              <span>{isNormalizerEnabled ? 'NORM: ON' : 'NORM: OFF'}</span>
            </button>

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

        {/* Real-time Frequency Response Curve Graph */}
        <div className="px-4 py-2.5 bg-charcoal-950/80 border-b border-charcoal-800 relative">
          <div className="h-24 sm:h-28 w-full bg-charcoal-900/90 rounded-lg border border-charcoal-800 relative overflow-hidden flex items-center justify-center">
            {/* Grid Lines */}
            <svg className="w-full h-full absolute inset-0 pointer-events-none" viewBox="0 0 600 120" preserveAspectRatio="none">
              {/* Zero dB Axis */}
              <line x1="0" y1="60" x2="600" y2="60" stroke="#3f3f46" strokeWidth="1" strokeDasharray="3 3" />
              {/* +6 dB line */}
              <line x1="0" y1="35" x2="600" y2="35" stroke="#27272a" strokeWidth="1" strokeDasharray="2 4" />
              {/* -6 dB line */}
              <line x1="0" y1="85" x2="600" y2="85" stroke="#27272a" strokeWidth="1" strokeDasharray="2 4" />

              {/* Curve Fill Area */}
              <path
                d={`${pathD} L 560 120 L 40 120 Z`}
                fill={isEnabled ? 'url(#eqGradArea)' : 'rgba(113, 113, 122, 0.05)'}
              />

              {/* Curve Stroke Line */}
              <path
                d={pathD}
                fill="none"
                stroke={isEnabled ? '#dc2626' : '#71717a'}
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* Gradient definition */}
              <defs>
                <linearGradient id="eqGradArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#dc2626" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#dc2626" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Band Nodes */}
              {curvePoints.map((pt, i) => (
                <circle
                  key={i}
                  cx={pt.x}
                  cy={pt.y}
                  r="3.5"
                  fill={isEnabled ? '#f87171' : '#71717a'}
                  stroke="#18181b"
                  strokeWidth="1.5"
                />
              ))}
            </svg>

            <div className="absolute top-1.5 left-2 flex items-center space-x-2 text-[9px] font-mono text-zinc-500">
              <span>+12 dB</span>
              <span className="text-zinc-400">0 dB</span>
              <span>-12 dB</span>
            </div>

            <div className="absolute bottom-1 right-2 text-[9px] font-mono text-zinc-500">
              DSP BiQuad Peaking IIR Filter Curve
            </div>
          </div>
        </div>

        {/* Preset Selector with Category Filter Tabs */}
        <div className="px-4 py-2.5 bg-charcoal-850 border-b border-charcoal-800 flex flex-col gap-2">
          {/* Top row: Categories & Reset Flat */}
          <div className="flex items-center justify-between text-[11px] flex-wrap gap-1">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition whitespace-nowrap ${
                    selectedCategory === cat
                      ? 'bg-charcoal-700 text-zinc-100 font-semibold border border-charcoal-600'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <button
              onClick={resetFlat}
              className="flex items-center space-x-1 text-zinc-400 hover:text-zinc-200 hover:underline shrink-0"
            >
              <RotateCcw size={11} />
              <span>Reset Flat</span>
            </button>
          </div>

          {/* Preset Buttons Grid */}
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto no-scrollbar py-0.5">
            {filteredPresets.map((preset) => {
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
            <p className="text-[10.5px] text-zinc-400 italic">
              {currentPresetObj.description}
            </p>
          )}
        </div>

        {/* Sliders Section: Pre-Amp + Band Sliders */}
        <div className="p-4 sm:p-5 bg-charcoal-900 flex flex-col items-center">
          <div className="w-full flex items-end justify-between gap-1 sm:gap-2 h-44 sm:h-48 px-1 pb-1 overflow-x-auto no-scrollbar">
            {/* Pre-Amp Gain Slider */}
            <div className="flex flex-col items-center h-full justify-between pr-2 sm:pr-3 border-r border-charcoal-800 group shrink-0 w-12 sm:w-14">
              <span
                className={`font-mono text-[9px] sm:text-[10px] w-full text-center transition ${
                  preAmp !== 0 ? 'text-amber-400 font-semibold' : 'text-zinc-500'
                }`}
              >
                {preAmp > 0 ? `+${preAmp}` : preAmp}
              </span>

              <div className="relative flex-1 flex items-center justify-center py-2 w-full">
                <div className="absolute top-1/2 left-0 right-0 h-px bg-zinc-700/60 pointer-events-none" />
                <input
                  type="range"
                  min={-6}
                  max={6}
                  step={0.5}
                  value={preAmp}
                  disabled={!isEnabled}
                  onChange={(e) => setPreAmp(parseFloat(e.target.value))}
                  className="accent-amber-500 cursor-pointer h-full -rotate-90 w-28 sm:w-32 bg-charcoal-800 rounded disabled:opacity-40"
                />
              </div>

              <div className="text-center mt-1">
                <span className="font-mono text-[9px] text-amber-300/90 font-medium">PreAmp</span>
                <span className="block text-[8px] text-zinc-500">dB</span>
              </div>
            </div>

            {/* EQ Band Sliders: 5-Band or 10-Band */}
            {bandMode === '10-band' ? (
              // 10-Band Sliders
              EQ_FREQUENCIES_10.map((freq, idx) => {
                const gain = gains[idx] ?? 0;
                return (
                  <div key={freq} className="flex-1 min-w-[34px] sm:min-w-[48px] flex flex-col items-center h-full justify-between group">
                    <span
                      className={`font-mono text-[9px] sm:text-[10px] w-full text-center transition ${
                        gain !== 0 ? 'text-crimson-400 font-semibold' : 'text-zinc-500'
                      }`}
                    >
                      {gain > 0 ? `+${gain}` : gain}
                    </span>

                    <div className="relative flex-1 flex items-center justify-center py-2 w-full">
                      <div className="absolute top-1/2 left-0 right-0 h-px bg-zinc-700/60 pointer-events-none" />
                      <input
                        type="range"
                        min={-12}
                        max={12}
                        step={0.5}
                        value={gain}
                        disabled={!isEnabled}
                        onChange={(e) => setBandGain10(idx, parseFloat(e.target.value))}
                        className="accent-crimson-600 cursor-pointer h-full -rotate-90 w-26 sm:w-30 bg-charcoal-800 rounded disabled:opacity-40"
                      />
                    </div>

                    <div className="text-center mt-1">
                      <span className="font-mono text-[9px] sm:text-[10.5px] text-zinc-400 group-hover:text-zinc-200">
                        {formatFreq(freq)}
                      </span>
                      <span className="block text-[8px] text-zinc-600">Hz</span>
                    </div>
                  </div>
                );
              })
            ) : (

              // 5-Band Sliders (Sub, Low-Mid, Mid, High-Mid, Treble)
              EQ_FREQUENCIES_5.map((freq, idx) => {
                const gain = gains5[idx] ?? 0;
                const bandLabels = ['Sub/Bass', 'Low Mid', 'Mid', 'High Mid', 'Treble'];
                return (
                  <div key={freq} className="flex-1 flex flex-col items-center h-full justify-between group">
                    <span
                      className={`font-mono text-[10px] sm:text-[11px] w-full text-center transition ${
                        gain !== 0 ? 'text-crimson-400 font-bold' : 'text-zinc-500'
                      }`}
                    >
                      {gain > 0 ? `+${gain}` : gain} dB
                    </span>

                    <div className="relative flex-1 flex items-center justify-center py-2 w-full">
                      <div className="absolute top-1/2 left-0 right-0 h-px bg-zinc-700/60 pointer-events-none" />
                      <input
                        type="range"
                        min={-12}
                        max={12}
                        step={0.5}
                        value={gain}
                        disabled={!isEnabled}
                        onChange={(e) => setBandGain5(idx, parseFloat(e.target.value))}
                        className="accent-crimson-600 cursor-pointer h-full -rotate-90 w-28 sm:w-32 bg-charcoal-800 rounded disabled:opacity-40"
                      />
                    </div>

                    <div className="text-center mt-1">
                      <span className="font-mono text-[10px] sm:text-[11px] font-semibold text-zinc-300">
                        {bandLabels[idx]}
                      </span>
                      <span className="block text-[8.5px] text-zinc-500 font-mono">
                        {formatFreq(freq)}Hz
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Scale labels */}
          <div className="w-full flex justify-between items-center text-[10px] text-zinc-500 font-mono pt-3 border-t border-charcoal-800/80 px-2">
            <span>-12 dB (Attenuate)</span>
            <span className="text-zinc-400">0 dB (Flat Unity)</span>
            <span>+12 dB (Boost)</span>
          </div>
        </div>

        {/* Audio Visualizer Mode Controls directly inside Equalizer! */}
        <div className="px-4 py-3 bg-charcoal-925 border-t border-charcoal-800 flex flex-col space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Waves size={15} className="text-crimson-400" />
              <span className="font-semibold text-zinc-200 text-xs">Pilih Mode Visualisasi Audio:</span>
              <span className="font-mono text-[11px] text-zinc-400 hidden sm:inline">
                Mode {visualizerMode + 1}: <strong className="text-crimson-300">{VISUALIZER_MODES[visualizerMode]?.name}</strong>
              </span>
            </div>

            <button
              onClick={() => {
                setEqualizerOpen(false);
                setVisualizerOpen(true);
              }}
              className="flex items-center space-x-1.5 px-3 py-1 bg-crimson-800 hover:bg-crimson-700 text-white rounded-lg text-[11px] font-medium transition shadow-xs active:scale-95 cursor-pointer"
            >
              <Waves size={13} />
              <span>Buka Visualizer Layar Penuh (V)</span>
            </button>
          </div>

          {/* Quick Visualizer Mode Pills Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1.5 max-h-36 overflow-y-auto pr-0.5 scrollbar-thin scrollbar-thumb-charcoal-700">
            {VISUALIZER_MODES.map((m) => {
              const isSelected = visualizerMode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setVisualizerMode(m.id)}
                  title={`${m.name}: ${m.description}`}
                  className={`px-2 py-1.5 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
                    isSelected
                      ? 'bg-crimson-950/70 border-crimson-600 text-white shadow-xs ring-1 ring-crimson-500/40'
                      : 'bg-charcoal-850/80 border-charcoal-750 text-zinc-400 hover:text-zinc-200 hover:bg-charcoal-800'
                  }`}
                >
                  <span className="text-[11px] font-medium truncate w-full flex items-center gap-1">
                    {m.id === 10 || m.id === 12 ? '🖼️ ' : m.id === 6 ? '💿 ' : m.id === 11 ? '🎤 ' : '📊 '}
                    {m.name}
                  </span>
                  <span className="text-[9px] font-mono text-zinc-500 truncate">
                    {m.tagline}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-charcoal-950 border-t border-charcoal-800 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-[11px] text-zinc-500">
            <span>
              {bandMode === '10-band'
                ? 'Real-time 10-Band BiQuad IIR peaking filter cascade.'
                : '5-Band Macro Equalizer with automatic smooth harmonic interpolation.'}
            </span>
            {isNormalizerEnabled && (
              <span className="text-amber-400 font-mono text-[10px] bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-700/50">
                • Dynamics Peak Compressor Active (-24dB, 12:1)
              </span>
            )}
            {isCrossfeedEnabled && (
              <span className="text-purple-400 font-mono text-[10px] bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-700/50">
                • bs2b Crossfeed Active (700Hz, 350µs)
              </span>
            )}
          </div>
          <button
            onClick={() => setEqualizerOpen(false)}
            className="px-3.5 py-1 bg-charcoal-800 hover:bg-charcoal-750 text-zinc-200 rounded-lg font-medium text-xs transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
