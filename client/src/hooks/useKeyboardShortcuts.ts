import { useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useUiStore } from '../store/uiStore';
import { useVisualizerStore } from '../store/visualizerStore';

export function useKeyboardShortcuts() {
  const {
    togglePlay,
    previous,
    next,
    seek,
    currentTime,
    duration,
    volume,
    setVolume,
    toggleMute,
    toggleShuffle,
    toggleRepeat,
  } = usePlayerStore();

  const {
    isEqualizerOpen,
    setEqualizerOpen,
    isCommandPaletteOpen,
    setCommandPaletteOpen,
    toggleCommandPalette,
    isSettingsOpen,
    setSettingsOpen,
    isKeyboardShortcutsOpen,
    setKeyboardShortcutsOpen,
    isMobileNowPlayingOpen,
    setMobileNowPlayingOpen,
    rightPanelOpen,
    toggleRightPanel,
    setRightPanelTab,
    toggleLeftSidebar,
    toggleFullscreen,
  } = useUiStore();

  const { isOpen: isVisualizerOpen, toggleOpen: toggleVisualizer, setOpen: setVisualizerOpen } = useVisualizerStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputFocused =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          (activeEl as HTMLElement).isContentEditable);

      // 1. Escape key: closes any open modal/drawer regardless of focus
      if (e.key === 'Escape') {
        if (isCommandPaletteOpen) {
          setCommandPaletteOpen(false);
          return;
        }
        if (isKeyboardShortcutsOpen) {
          setKeyboardShortcutsOpen(false);
          return;
        }
        if (isMobileNowPlayingOpen) {
          setMobileNowPlayingOpen(false);
          return;
        }
        if (isVisualizerOpen) {
          setVisualizerOpen(false);
          return;
        }
        if (isEqualizerOpen) {
          setEqualizerOpen(false);
          return;
        }
        if (isSettingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (isInputFocused && activeEl) {
          (activeEl as HTMLElement).blur();
          return;
        }
        return;
      }

      // 2. Global Command Palette: 'Ctrl+K' or 'Cmd+K'
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleCommandPalette();
        return;
      }

      // 2b. Search Shortcut: '/' focuses top search input
      if (e.key === '/' && !isInputFocused) {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement | null;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
        return;
      }

      // 2c. Toggle Library Navigator: 'Ctrl+B'
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleLeftSidebar();
        return;
      }

      // If user is currently typing in an input field, do not trigger audio/navigation hotkeys
      if (isInputFocused) {
        return;
      }

      // 3. Cheatsheet Shortcut: '?' (Shift + /)
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setKeyboardShortcutsOpen(!isKeyboardShortcutsOpen);
        return;
      }

      // 4. Play / Pause: Space
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
        return;
      }

      // 5. Track Nav: Ctrl + Left/Right or Alt + Left/Right
      if ((e.ctrlKey || e.altKey) && e.key === 'ArrowRight') {
        e.preventDefault();
        next();
        return;
      }
      if ((e.ctrlKey || e.altKey) && e.key === 'ArrowLeft') {
        e.preventDefault();
        previous();
        return;
      }

      // 6. Seeking: ArrowLeft (-5s / -15s), ArrowRight (+5s / +15s)
      if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        const step = e.shiftKey ? 15 : 5;
        seek(Math.max(0, currentTime - step));
        return;
      }
      if (e.key === 'ArrowRight' && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        const step = e.shiftKey ? 15 : 5;
        seek(Math.min(duration || 0, currentTime + step));
        return;
      }

      // 7. Volume: ArrowUp (+5%), ArrowDown (-5%)
      if (e.key === 'ArrowUp' && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setVolume(Math.min(1, volume + 0.05));
        return;
      }
      if (e.key === 'ArrowDown' && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setVolume(Math.max(0, volume - 0.05));
        return;
      }

      // 8. Single Key Toggles
      if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggleMute();
        return;
      }
      if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggleShuffle();
        return;
      }
      if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggleRepeat();
        return;
      }
      if (e.key.toLowerCase() === 'v' && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggleVisualizer();
        return;
      }
      if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setEqualizerOpen(!isEqualizerOpen);
        return;
      }
      if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      if (e.key.toLowerCase() === 'q' && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (!rightPanelOpen) toggleRightPanel();
        setRightPanelTab('queue');
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    togglePlay,
    previous,
    next,
    seek,
    currentTime,
    duration,
    volume,
    setVolume,
    toggleMute,
    toggleShuffle,
    toggleRepeat,
    isEqualizerOpen,
    setEqualizerOpen,
    isSettingsOpen,
    setSettingsOpen,
    isKeyboardShortcutsOpen,
    setKeyboardShortcutsOpen,
    isMobileNowPlayingOpen,
    setMobileNowPlayingOpen,
    isVisualizerOpen,
    toggleVisualizer,
    setVisualizerOpen,
    rightPanelOpen,
    toggleRightPanel,
    setRightPanelTab,
    toggleLeftSidebar,
    toggleFullscreen,
  ]);
}
