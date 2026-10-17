import React from 'react';
import { X, Keyboard, Play, SkipForward, Volume2, Sliders, Waves, ListMusic, Search, CornerDownLeft } from 'lucide-react';
import { useUiStore } from '../store/uiStore';

export const KeyboardShortcutsModal: React.FC = () => {
  const { isKeyboardShortcutsOpen, setKeyboardShortcutsOpen } = useUiStore();

  if (!isKeyboardShortcutsOpen) return null;

  const shortcutGroups = [
    {
      title: 'Playback Controls',
      icon: <Play size={14} className="text-crimson-400" />,
      shortcuts: [
        { keys: ['Space'], desc: 'Play / Pause audio' },
        { keys: ['←', '→'], desc: 'Seek backward / forward 5 seconds' },
        { keys: ['Shift', '+', '← / →'], desc: 'Seek 15 seconds' },
        { keys: ['Ctrl', '+', '→'], desc: 'Next track in queue' },
        { keys: ['Ctrl', '+', '←'], desc: 'Previous track in queue' },
        { keys: ['S'], desc: 'Toggle Shuffle mode' },
        { keys: ['R'], desc: 'Cycle Repeat mode (Off / All / One)' },
      ],
    },
    {
      title: 'Audio & Volume',
      icon: <Volume2 size={14} className="text-crimson-400" />,
      shortcuts: [
        { keys: ['↑'], desc: 'Volume up (+5%)' },
        { keys: ['↓'], desc: 'Volume down (-5%)' },
        { keys: ['M'], desc: 'Toggle Mute / Unmute' },
        { keys: ['E'], desc: 'Open / Close 10-Band Graphic Equalizer' },
        { keys: ['V'], desc: 'Open / Close Audio Visualizer' },
      ],
    },
    {
      title: 'Navigation & Panels',
      icon: <ListMusic size={14} className="text-crimson-400" />,
      shortcuts: [
        { keys: ['Ctrl', '+', 'K'], desc: 'Open Command Palette & Spotlight Search' },
        { keys: ['/'], desc: 'Quick focus search bar' },
        { keys: ['Ctrl', '+', 'B'], desc: 'Toggle Library Navigator (Sidebar)' },
        { keys: ['Q'], desc: 'Toggle Queue drawer' },
        { keys: ['F'], desc: 'Toggle Fullscreen mode (Layar Penuh)' },
        { keys: ['?'], desc: 'Toggle this keyboard cheatsheet' },
        { keys: ['Esc'], desc: 'Close any open modal or drawer' },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-2xl bg-charcoal-900 border border-charcoal-750 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-charcoal-800 bg-charcoal-950/70">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-crimson-950/60 border border-crimson-900/60 text-crimson-400">
              <Keyboard size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                Keyboard Shortcuts
                <span className="text-[10px] font-mono font-normal px-2 py-0.5 rounded bg-charcoal-800 text-zinc-400 border border-charcoal-700">
                  DESKTOP ERGONOMICS
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">Control audio playback seamlessly with hardware keys</p>
            </div>
          </div>
          <button
            onClick={() => setKeyboardShortcutsOpen(false)}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-charcoal-800 transition"
          >
            <X size={17} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-6 overflow-y-auto">
          {shortcutGroups.map((group, idx) => (
            <div key={idx} className="space-y-2.5">
              <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">
                {group.icon}
                <span>{group.title}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {group.shortcuts.map((sc, scIdx) => (
                  <div
                    key={scIdx}
                    className="flex items-center justify-between p-2 rounded-lg bg-charcoal-950/60 border border-charcoal-800/80 hover:border-charcoal-700 transition"
                  >
                    <span className="text-xs text-zinc-300 pr-2">{sc.desc}</span>
                    <div className="flex items-center space-x-1 shrink-0">
                      {sc.keys.map((k, kIdx) =>
                        k === '+' ? (
                          <span key={kIdx} className="text-[11px] text-zinc-500 font-mono">
                            +
                          </span>
                        ) : (
                          <kbd
                            key={kIdx}
                            className="px-1.5 py-0.5 min-w-[20px] text-center text-[10.5px] font-mono font-medium rounded bg-charcoal-800 text-zinc-200 border border-charcoal-650 shadow-sm"
                          >
                            {k}
                          </kbd>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-charcoal-800 bg-charcoal-950/50 text-xs text-zinc-500">
          <div className="flex items-center space-x-2">
            <span>Press</span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-charcoal-800 text-zinc-400 border border-charcoal-700">
              Esc
            </kbd>
            <span>anytime to dismiss</span>
          </div>
          <button
            onClick={() => setKeyboardShortcutsOpen(false)}
            className="px-3 py-1 rounded bg-charcoal-800 hover:bg-charcoal-700 text-zinc-200 transition text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
