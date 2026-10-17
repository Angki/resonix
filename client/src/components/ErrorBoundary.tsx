import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Resonix] React ErrorBoundary caught an unhandled render error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetStorage = async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }
      localStorage.removeItem('black_library_ui_prefs');
    } catch (e) {
      console.warn('Failed clearing caches:', e);
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen w-screen bg-charcoal-950 text-zinc-100 p-6 select-none font-sans">
          <div className="max-w-md w-full bg-charcoal-900 border border-charcoal-750 rounded-lg p-6 shadow-2xl flex flex-col items-center text-center space-y-4">
            <div className="p-3 bg-crimson-950/80 border border-crimson-800 text-crimson-400 rounded-full">
              <AlertTriangle size={32} />
            </div>

            <h1 className="text-lg font-bold text-zinc-100">Playback & UI Error</h1>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Resonix encountered an unexpected UI rendering error. This usually happens if cached assets from a previous version are still active in the browser.
            </p>

            {this.state.error && (
              <div className="w-full bg-charcoal-950 border border-charcoal-800 rounded p-2.5 text-[11px] font-mono text-crimson-400 text-left overflow-x-auto max-h-32">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div className="flex items-center space-x-3 w-full pt-2">
              <button
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-charcoal-800 hover:bg-charcoal-750 border border-charcoal-700 rounded text-xs font-medium text-zinc-200 hover:text-white transition cursor-pointer"
              >
                <RefreshCw size={13} />
                <span>Reload Page</span>
              </button>

              <button
                onClick={this.handleResetStorage}
                className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-crimson-700 hover:bg-crimson-600 text-white rounded text-xs font-medium shadow-md transition cursor-pointer"
              >
                <Trash2 size={13} />
                <span>Clear Cache & Reset</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
