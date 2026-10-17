import React, { useEffect } from 'react';
import { Download, X, Laptop, Sparkles } from 'lucide-react';
import { useUiStore } from '../store/uiStore';

export const PwaInstallBanner: React.FC = () => {
  const {
    pwaInstallPrompt,
    isPwaInstalled,
    isPwaBannerDismissed,
    setPwaInstallPrompt,
    setIsPwaInstalled,
    dismissPwaBanner,
  } = useUiStore();

  useEffect(() => {
    // Check if already running in standalone mode (desktop taskbar app / mobile PWA)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      setIsPwaInstalled(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      console.log('[PWA] beforeinstallprompt captured!');
      setPwaInstallPrompt(e);
    };

    const handleAppInstalled = () => {
      console.log('[PWA] App successfully installed!');
      setIsPwaInstalled(true);
      setPwaInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [setPwaInstallPrompt, setIsPwaInstalled]);

  if (!pwaInstallPrompt || isPwaInstalled || isPwaBannerDismissed) {
    return null;
  }

  const handleInstallClick = async () => {
    if (!pwaInstallPrompt) return;
    try {
      await pwaInstallPrompt.prompt();
      const choice = await pwaInstallPrompt.userChoice;
      console.log('[PWA] User choice:', choice.outcome);
      if (choice.outcome === 'accepted') {
        setIsPwaInstalled(true);
      }
      setPwaInstallPrompt(null);
    } catch (err) {
      console.warn('[PWA] Installation prompt error:', err);
    }
  };

  return (
    <div className="fixed bottom-16 sm:bottom-20 right-3 sm:right-6 z-50 max-w-sm w-[calc(100vw-1.5rem)] sm:w-96 bg-charcoal-900/95 border border-crimson-600/40 rounded-xl p-3.5 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-300 select-none">
      <div className="flex items-start space-x-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-crimson-900 to-crimson-700 flex items-center justify-center shrink-0 shadow-md border border-crimson-500/30">
          <Laptop size={20} className="text-white" />
        </div>

        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center space-x-1.5">
            <span className="text-[12px] font-semibold text-zinc-100">
              App is available
            </span>
            <span className="flex items-center space-x-0.5 text-[9px] font-mono bg-crimson-950/80 text-crimson-300 border border-crimson-800/80 px-1 rounded">
              <Sparkles size={9} />
              <span>DESKTOP PWA</span>
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
            Pasang Resonix sebagai aplikasi mandiri di Taskbar untuk streaming lancar tanpa browser.
          </p>

          <div className="flex items-center space-x-2 mt-2.5">
            <button
              onClick={handleInstallClick}
              className="flex items-center space-x-1.5 bg-crimson-700 hover:bg-crimson-600 text-white font-medium px-3 py-1 rounded-md text-[11px] shadow-sm transition active:scale-95 cursor-pointer"
            >
              <Download size={13} />
              <span>Pasang Aplikasi</span>
            </button>
            <button
              onClick={dismissPwaBanner}
              className="text-zinc-400 hover:text-zinc-200 text-[11px] px-2 py-1 rounded transition hover:bg-charcoal-800 cursor-pointer"
            >
              Nanti Saja
            </button>
          </div>
        </div>

        <button
          onClick={dismissPwaBanner}
          title="Tutup pemberitahuan"
          className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-charcoal-800 transition -mr-1 -mt-1 cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
