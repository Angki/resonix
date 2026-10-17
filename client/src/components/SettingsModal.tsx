import React, { useState } from 'react';
import {
  X,
  Settings as SettingsIcon,
  Radio,
  FolderSync,
  HardDrive,
  Network,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Palette,
  Volume2,
  Sliders,
  Laptop,
  Download,
  RefreshCw,
  Sparkles,
  Check,
  Music,
  Image as ImageIcon,
  Play,
  Pause,
  Power,
  RotateCcw,
} from 'lucide-react';
import { LastFmIcon } from './LastFmIcon';
import { useUiStore, ThemeName } from '../store/uiStore';
import { usePlayerStore } from '../store/playerStore';
import { useEqualizerStore } from '../store/equalizerStore';
import { api } from '../api/client';
import { offlineStorageService } from '../services/offlineStorageService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    setSettingsOpen,
    theme,
    setTheme,
    gridDensity,
    setGridDensity,
    gridCoverSize,
    setGridCoverSize,
    showGridQualityBadge,
    setShowGridQualityBadge,
    showGridYear,
    setShowGridYear,
    showGridTrackCount,
    setShowGridTrackCount,
    ambientMotionEnabled,
    setAmbientMotionEnabled,
    pwaInstallPrompt,
    isPwaInstalled,
    setPwaInstallPrompt,
    setIsPwaInstalled,
  } = useUiStore();

  const {
    isCrossfadeEnabled,
    setIsCrossfadeEnabled,
    crossfadeSeconds,
    setCrossfadeSeconds,
    isAutoAdvanceEnabled,
    setIsAutoAdvanceEnabled,
    autoAdvanceTriggerSeconds,
    setAutoAdvanceTriggerSeconds,
    forceTranscode,
    setForceTranscode,
  } = usePlayerStore();

  const { isNormalizerEnabled, setNormalizerEnabled } = useEqualizerStore();

  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'playback' | 'appearance' | 'library' | 'app' | 'integrations'>('playback');

  // Last.fm auth state
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Settings form states
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiSecretInput, setApiSecretInput] = useState('');
  const [compatUsername, setCompatUsername] = useState('');
  const [compatPassword, setCompatPassword] = useState('');
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);

  // Subsonic state
  const [subsonicPasswordInput, setSubsonicPasswordInput] = useState('');
  const [subsonicMsg, setSubsonicMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isSavingSubsonicPw, setIsSavingSubsonicPw] = useState(false);

  // App & Server Restart state
  const [isRestartingServer, setIsRestartingServer] = useState(false);
  const [restartMessage, setRestartMessage] = useState<string | null>(null);

  // Offline Audio Cache quota
  const [offlineQuota, setOfflineQuota] = useState<{ availableMB: number; usageMB: number; percentUsed: number } | null>(null);
  const [offlineTracksCount, setOfflineTracksCount] = useState(() => offlineStorageService.getOfflineCount());

  React.useEffect(() => {
    if (isSettingsOpen) {
      offlineStorageService.getStorageQuota().then(setOfflineQuota);
      return offlineStorageService.subscribe(() => {
        setOfflineTracksCount(offlineStorageService.getOfflineCount());
        offlineStorageService.getStorageQuota().then(setOfflineQuota);
      });
    }
  }, [isSettingsOpen]);

  const { data: serverSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
    enabled: isSettingsOpen,
  });

  const { data: lastFmStatus } = useQuery({
    queryKey: ['lastFmStatus'],
    queryFn: () => api.getLastFmStatus(),
    enabled: isSettingsOpen,
  });

  const { data: externalPlaylistData } = useQuery({
    queryKey: ['externalPlaylistCandidates'],
    queryFn: () => api.getExternalPlaylistCandidates(),
    enabled: isSettingsOpen,
  });

  const { data: rootsData } = useQuery({
    queryKey: ['roots'],
    queryFn: () => api.getRoots(),
    enabled: isSettingsOpen,
  });

  const { data: auditData, isLoading: isAuditLoading, refetch: refetchAudit } = useQuery({
    queryKey: ['libraryAudit'],
    queryFn: () => api.getLibraryAudit(),
    enabled: isSettingsOpen && activeTab === 'library',
  });

  const { data: batchStatus } = useQuery({
    queryKey: ['artistBatchStatus'],
    queryFn: () => api.getArtistBatchStatus(),
    enabled: isSettingsOpen && activeTab === 'integrations',
    refetchInterval: (query) => (query.state.data?.isRunning ? 1500 : 6000),
  });

  const toggleBatchMutation = useMutation({
    mutationFn: (action: 'start' | 'pause') => api.startArtistBatchFetch(action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artistBatchStatus'] });
      queryClient.invalidateQueries({ queryKey: ['artists'] });
    },
  });

  const saveSettingsMutation = useMutation({
    mutationFn: (data: Record<string, string>) => api.saveSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['lastFmStatus'] });
      alert('Settings saved successfully');
    },
  });

  const handleStartLastFmAuth = async () => {
    try {
      setAuthError(null);
      const res = await api.getLastFmAuthUrl();
      setAuthToken(res.token);
      window.open(res.authUrl, '_blank', 'width=600,height=700');
    } catch (e: any) {
      setAuthError(e.message || 'Failed to request Last.fm auth token');
    }
  };

  const handleCompleteLastFmAuth = async () => {
    if (!authToken) return;
    try {
      setAuthError(null);
      await api.completeLastFmCallback(authToken);
      setAuthToken(null);
      queryClient.invalidateQueries({ queryKey: ['lastFmStatus'] });
    } catch (e: any) {
      setAuthError(e.message || 'Failed to complete authentication');
    }
  };

  const [isSyncingLastFmLibrary, setIsSyncingLastFmLibrary] = useState(false);
  const [lastFmSyncLibraryMsg, setLastFmSyncLibraryMsg] = useState<string | null>(null);

  const handleDisconnectLastFm = async () => {
    await api.disconnectLastFm();
    queryClient.invalidateQueries({ queryKey: ['lastFmStatus'] });
  };

  const handleSyncLibraryLastFm = async () => {
    if (isSyncingLastFmLibrary) return;
    try {
      setIsSyncingLastFmLibrary(true);
      setLastFmSyncLibraryMsg('Syncing play counts for library tracks from Last.fm...');
      const res = await api.syncLibraryLastFm(200);
      await queryClient.invalidateQueries({ queryKey: ['tracks'] });
      setLastFmSyncLibraryMsg(`Success: Synced play counts for ${res.updatedTracks} tracks!`);
      setTimeout(() => setLastFmSyncLibraryMsg(null), 6000);
    } catch (e: any) {
      setLastFmSyncLibraryMsg(e.message || 'Failed to sync library play counts from Last.fm');
      setTimeout(() => setLastFmSyncLibraryMsg(null), 6000);
    } finally {
      setIsSyncingLastFmLibrary(false);
    }
  };

  const handleImportPlaylist = async (filePath: string) => {
    try {
      const res = await api.importExternalPlaylist(filePath);
      alert(`Imported ${res.tracksImported} tracks into playlist "${res.playlistName}"`);
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      queryClient.invalidateQueries({ queryKey: ['externalPlaylistCandidates'] });
    } catch (e: any) {
      alert(`Import failed: ${e.message}`);
    }
  };

  const handleInstallPwa = async () => {
    if (!pwaInstallPrompt) return;
    try {
      await pwaInstallPrompt.prompt();
      const choice = await pwaInstallPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsPwaInstalled(true);
      }
      setPwaInstallPrompt(null);
    } catch (err) {
      console.warn('PWA install error:', err);
    }
  };

  const handleClearCacheAndReload = async () => {
    queryClient.clear();
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      } catch {
        // ignore
      }
    }
    window.location.reload();
  };

  const handleSaveSubsonicPassword = async () => {
    if (!subsonicPasswordInput.trim()) return;
    setIsSavingSubsonicPw(true);
    setSubsonicMsg(null);
    try {
      const res = await api.updateSubsonicPassword(subsonicPasswordInput.trim());
      setSubsonicMsg({ text: res.message || 'Password Subsonic berhasil disimpan!' });
      setSubsonicPasswordInput('');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    } catch (err: any) {
      setSubsonicMsg({ text: err.message || 'Gagal menyimpan password Subsonic', isError: true });
    } finally {
      setIsSavingSubsonicPw(false);
    }
  };

  const handleRestartServer = async () => {
    if (isRestartingServer) return;
    setIsRestartingServer(true);
    setRestartMessage('Mengirim sinyal restart ke backend...');
    try {
      await api.restartServer();
      setRestartMessage('Server backend sedang menyala ulang (2-3 detik)...');
    } catch {
      setRestartMessage('Server terputus untuk restart. Menyambung kembali...');
    }

    // Poll until server is back online then reload app
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          clearInterval(interval);
          setRestartMessage('Server online! Me-refresh aplikasi...');
          setTimeout(() => {
            window.location.reload();
          }, 600);
        }
      } catch {
        if (attempts > 15) {
          clearInterval(interval);
          setRestartMessage('Gagal menyambung kembali otomatis. Silakan refresh browser manual (F5).');
          setIsRestartingServer(false);
        }
      }
    }, 1000);
  };

  if (!isSettingsOpen) return null;

  const themes: { id: ThemeName; name: string; color: string; desc: string }[] = [
    { id: 'resonance', name: 'Resonance Harmonic', color: '#06b6d4', desc: 'Acoustic deep obsidian with resonant cyan & violet harmonics' },
    { id: 'blacklibrary', name: 'Resonix Crimson', color: '#881337', desc: 'Signature dark crimson & charcoal' },
    { id: 'spotify', name: 'Spotify Dark', color: '#1db954', desc: 'Vibrant modern green & deep black' },
    { id: 'musicbee', name: 'Cobalt Slate', color: '#0ea5e9', desc: 'Compact audiophile slate blue' },
    { id: 'amber', name: 'Dungeon Amber', color: '#f59e0b', desc: 'Warm dungeon synth gold & charcoal' },
    { id: 'glass', name: 'Glassmorphism', color: '#8b5cf6', desc: 'Frosted acrylic glass with blurred glow' },
    { id: 'metro-dark', name: 'Metro Dark (Zune)', color: '#d946ef', desc: 'Clean typography-focused retro dark' },
    { id: 'metro-light', name: 'Metro Light', color: '#2563eb', desc: 'Clean high-contrast light theme' },
    { id: 'light', name: 'Light Metal', color: '#71717a', desc: 'Refined neutral light mode' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 select-none">
      <div className="w-full max-w-2xl bg-charcoal-900 border border-charcoal-750 rounded-lg shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh] overflow-hidden text-xs">
        {/* Header */}
        <div className="h-11 bg-charcoal-850 border-b border-charcoal-750 px-3 sm:px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2 font-mono font-semibold text-zinc-200">
            <SettingsIcon size={14} className="text-crimson-500" />
            <span className="truncate">Resonix Options & Settings</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleClearCacheAndReload}
              title="Muat ulang web app dan bersihkan cache"
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-charcoal-800 hover:bg-charcoal-750 text-zinc-300 hover:text-white border border-charcoal-700 transition text-[11px] cursor-pointer"
            >
              <RotateCcw size={12} className="text-cyan-400" />
              <span className="hidden sm:inline">Reload App</span>
            </button>

            <button
              onClick={handleRestartServer}
              disabled={isRestartingServer}
              title="Restart proses server backend"
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-crimson-900/60 hover:bg-crimson-800 text-crimson-200 hover:text-white border border-crimson-700/60 transition text-[11px] cursor-pointer disabled:opacity-50"
            >
              <Power size={12} className={isRestartingServer ? 'animate-pulse text-crimson-400' : 'text-crimson-400'} />
              <span>{isRestartingServer ? 'Restarting...' : 'Restart Server'}</span>
            </button>

            <button
              onClick={() => setSettingsOpen(false)}
              className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-charcoal-750 transition cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-charcoal-750 bg-charcoal-950 px-2 sm:px-3 pt-2 space-x-1 overflow-x-auto scrollbar-none shrink-0">
          <button
            onClick={() => setActiveTab('playback')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-t font-medium transition shrink-0 cursor-pointer ${
              activeTab === 'playback'
                ? 'bg-charcoal-900 text-zinc-100 border-t border-x border-charcoal-750'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Volume2 size={13} className={activeTab === 'playback' ? 'text-crimson-400' : ''} />
            <span>Playback & Audio</span>
          </button>

          <button
            onClick={() => setActiveTab('appearance')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-t font-medium transition shrink-0 cursor-pointer ${
              activeTab === 'appearance'
                ? 'bg-charcoal-900 text-zinc-100 border-t border-x border-charcoal-750'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Palette size={13} className={activeTab === 'appearance' ? 'text-crimson-400' : ''} />
            <span>Appearance & Themes</span>
          </button>

          <button
            onClick={() => setActiveTab('library')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-t font-medium transition shrink-0 cursor-pointer ${
              activeTab === 'library'
                ? 'bg-charcoal-900 text-zinc-100 border-t border-x border-charcoal-750'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <HardDrive size={13} className={activeTab === 'library' ? 'text-crimson-400' : ''} />
            <span>Library & Folders</span>
          </button>

          <button
            onClick={() => setActiveTab('app')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-t font-medium transition shrink-0 cursor-pointer ${
              activeTab === 'app'
                ? 'bg-charcoal-900 text-zinc-100 border-t border-x border-charcoal-750'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Laptop size={13} className={activeTab === 'app' ? 'text-crimson-400' : ''} />
            <span>Desktop App (PWA)</span>
          </button>

          <button
            onClick={() => setActiveTab('integrations')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-t font-medium transition shrink-0 cursor-pointer ${
              activeTab === 'integrations'
                ? 'bg-charcoal-900 text-zinc-100 border-t border-x border-charcoal-750'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Radio size={13} className={activeTab === 'integrations' ? 'text-crimson-400' : ''} />
            <span>Last.fm & External Sync</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
          {/* TAB 1: PLAYBACK & AUDIO */}
          {activeTab === 'playback' && (
            <div className="space-y-4">
              {/* Crossfade Section */}
              <div className="p-3 bg-charcoal-850 border border-charcoal-750 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-zinc-200 flex items-center space-x-1.5">
                      <Music size={14} className="text-crimson-400" />
                      <span>Dual-Audio Seamless Crossfade</span>
                    </h4>
                    <p className="text-zinc-400 text-[11px] mt-0.5">
                      Transisi overlap antar lagu (DJ equal-power curve). Lagu berikutnya mulai memudar masuk saat lagu saat ini memudar keluar.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isCrossfadeEnabled}
                      onChange={(e) => setIsCrossfadeEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-charcoal-750 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-crimson-600"></div>
                  </label>
                </div>

                {isCrossfadeEnabled && (
                  <div className="pt-2 border-t border-charcoal-800 flex items-center space-x-3">
                    <span className="text-zinc-400 text-[11px] w-24">Durasi Crossfade:</span>
                    <input
                      type="range"
                      min={1}
                      max={12}
                      step={1}
                      value={crossfadeSeconds}
                      onChange={(e) => setCrossfadeSeconds(Number(e.target.value))}
                      className="flex-1 h-1.5 bg-charcoal-750 accent-crimson-600 rounded cursor-pointer"
                    />
                    <span className="font-mono text-crimson-400 font-semibold w-8 text-right">
                      {crossfadeSeconds}s
                    </span>
                  </div>
                )}
              </div>

              {/* Tailscale & Remote Auto-Advance Custom Trigger */}
              <div className="p-3 bg-charcoal-850 border border-charcoal-750 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-zinc-200 flex items-center space-x-1.5">
                      <Sparkles size={14} className="text-amber-400" />
                      <span>Tailscale Auto-Advance Watchdog & Trigger</span>
                    </h4>
                    <p className="text-zinc-400 text-[11px] mt-0.5">
                      Mencegah pemutaran tersendat atau tidak berpindah track di Tailscale / jaringan remote.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAutoAdvanceEnabled}
                      onChange={(e) => setIsAutoAdvanceEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-charcoal-750 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-crimson-600"></div>
                  </label>
                </div>

                {isAutoAdvanceEnabled && (
                  <div className="pt-2 border-t border-charcoal-800 space-y-2">
                    <div className="flex items-center space-x-3">
                      <span className="text-zinc-400 text-[11px] w-32">Sensitivitas Trigger:</span>
                      <input
                        type="range"
                        min={0.5}
                        max={4.0}
                        step={0.5}
                        value={autoAdvanceTriggerSeconds}
                        onChange={(e) => setAutoAdvanceTriggerSeconds(Number(e.target.value))}
                        className="flex-1 h-1.5 bg-charcoal-750 accent-crimson-600 rounded cursor-pointer"
                      />
                      <span className="font-mono text-zinc-300 font-semibold w-12 text-right">
                        {autoAdvanceTriggerSeconds}s
                      </span>
                    </div>
                    <p className="text-zinc-500 text-[10.5px]">
                      Otomatis melompat ke track berikutnya {autoAdvanceTriggerSeconds} detik sebelum akhir file, serta mengaktifkan deteksi buffer stall & background timer watchdog.
                    </p>
                  </div>
                )}
              </div>

              {/* Volume Normalizer & Transcode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-charcoal-850 border border-charcoal-750 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-zinc-200">Volume Normalizer</div>
                    <div className="text-[11px] text-zinc-400">Audio dynamics compressor & peak limiter</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={isNormalizerEnabled}
                    onChange={(e) => setNormalizerEnabled(e.target.checked)}
                    className="w-4 h-4 accent-crimson-600 rounded cursor-pointer"
                  />
                </div>

                <div className="p-3 bg-charcoal-850 border border-charcoal-750 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-zinc-200">Force Transcode</div>
                    <div className="text-[11px] text-zinc-400">Paksa transcode audio ke AAC/MP3</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={forceTranscode}
                    onChange={(e) => setForceTranscode(e.target.checked)}
                    className="w-4 h-4 accent-crimson-600 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* Play Threshold Rules */}
              <div className="p-3 bg-charcoal-850 border border-charcoal-750 rounded-lg space-y-2">
                <h4 className="font-semibold text-zinc-200">Listening Time & Scrobble Rules</h4>
                <p className="text-zinc-400 text-[11px]">
                  Lagu dihitung &quot;Played&quot; dan dicatat ke Last.fm saat didengarkan minimal 50% dari durasi atau maksimal 4 menit.
                </p>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-zinc-400 block text-[11px] mb-1">Play Threshold (% of duration)</label>
                    <input
                      type="number"
                      defaultValue={serverSettings?.settings?.minPlayThresholdPercent || '50'}
                      className="w-full bg-charcoal-800 border border-charcoal-700 rounded px-2 py-1 text-zinc-200"
                      onBlur={(e) => saveSettingsMutation.mutate({ minPlayThresholdPercent: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block text-[11px] mb-1">Max Threshold Cap (seconds)</label>
                    <input
                      type="number"
                      defaultValue={serverSettings?.settings?.maxPlayThresholdSeconds || '240'}
                      className="w-full bg-charcoal-800 border border-charcoal-700 rounded px-2 py-1 text-zinc-200"
                      onBlur={(e) => saveSettingsMutation.mutate({ maxPlayThresholdSeconds: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: APPEARANCE & THEMES */}
          {activeTab === 'appearance' && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-zinc-200 mb-1 flex items-center space-x-1.5">
                  <Palette size={14} className="text-crimson-400" />
                  <span>Tema & Visual Skins</span>
                </h4>
                <p className="text-zinc-400 text-[11px] mb-3">
                  Pilih gaya estetika antarmuka. Tema langsung diaplikasikan dan tersimpan di preferensi Anda.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {themes.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
                        theme === t.id
                          ? 'bg-charcoal-800 border-crimson-500 shadow-sm ring-1 ring-crimson-500/50'
                          : 'bg-charcoal-850/80 border-charcoal-750 hover:bg-charcoal-800 hover:border-charcoal-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-black/40"
                            style={{ backgroundColor: t.color }}
                          />
                          {theme === t.id && <Check size={13} className="text-crimson-400" />}
                        </div>
                        <div className="font-semibold text-[11.5px] text-zinc-200">{t.name}</div>
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-1 line-clamp-2 leading-tight">
                        {t.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid Layout Settings */}
              <div className="p-3 bg-charcoal-850 border border-charcoal-750 rounded-lg space-y-3">
                <h4 className="font-semibold text-zinc-200">Pengaturan Grid Album</h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-zinc-400 block mb-1">Kerapatan (Density)</label>
                    <div className="grid grid-cols-3 gap-1 bg-charcoal-900 p-1 rounded border border-charcoal-800 text-[11px]">
                      <button
                        onClick={() => setGridDensity('compact')}
                        className={`py-1 rounded font-medium transition cursor-pointer ${
                          gridDensity === 'compact' ? 'bg-crimson-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Rapat
                      </button>
                      <button
                        onClick={() => setGridDensity('comfortable')}
                        className={`py-1 rounded font-medium transition cursor-pointer ${
                          gridDensity === 'comfortable' ? 'bg-crimson-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Nyaman
                      </button>
                      <button
                        onClick={() => setGridDensity('minimal')}
                        className={`py-1 rounded font-medium transition cursor-pointer ${
                          gridDensity === 'minimal' ? 'bg-crimson-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Minimal
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-zinc-400">Ukuran Cover Default</label>
                      <span className="font-mono text-zinc-400 text-[10.5px]">{gridCoverSize}px</span>
                    </div>
                    <input
                      type="range"
                      min={110}
                      max={300}
                      step={10}
                      value={gridCoverSize}
                      onChange={(e) => setGridCoverSize(Number(e.target.value))}
                      className="w-full h-1.5 bg-charcoal-750 accent-crimson-600 rounded cursor-pointer mt-1.5"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-charcoal-800 text-[11px]">
                  <label className="flex items-center space-x-1.5 cursor-pointer text-zinc-300">
                    <input
                      type="checkbox"
                      checked={showGridQualityBadge}
                      onChange={(e) => setShowGridQualityBadge(e.target.checked)}
                      className="rounded accent-crimson-600"
                    />
                    <span>Badge Kualitas</span>
                  </label>

                  <label className="flex items-center space-x-1.5 cursor-pointer text-zinc-300">
                    <input
                      type="checkbox"
                      checked={showGridYear}
                      onChange={(e) => setShowGridYear(e.target.checked)}
                      className="rounded accent-crimson-600"
                    />
                    <span>Tahun Rilis</span>
                  </label>

                  <label className="flex items-center space-x-1.5 cursor-pointer text-zinc-300">
                    <input
                      type="checkbox"
                      checked={showGridTrackCount}
                      onChange={(e) => setShowGridTrackCount(e.target.checked)}
                      className="rounded accent-crimson-600"
                    />
                    <span>Jumlah Lagu</span>
                  </label>

                  <label className="flex items-center space-x-1.5 cursor-pointer text-zinc-300">
                    <input
                      type="checkbox"
                      checked={ambientMotionEnabled}
                      onChange={(e) => setAmbientMotionEnabled(e.target.checked)}
                      className="rounded accent-crimson-600"
                    />
                    <span>Ambient Motion</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: LIBRARY & FOLDERS */}
          {activeTab === 'library' && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-zinc-200">Configured Library Roots</h4>
                  {restoreStatus && (
                    <span className="text-emerald-400 font-mono text-[11px]">{restoreStatus}</span>
                  )}
                </div>
                <div className="space-y-1.5 font-mono text-[11px]">
                  {rootsData?.map((r) => (
                    <div key={r.id} className="p-2.5 bg-charcoal-850 border border-charcoal-750 rounded text-zinc-300 flex items-center justify-between">
                      <div className="truncate pr-2">
                        <span className="font-semibold text-zinc-100">{r.name}</span>
                        <span className="text-zinc-500 ml-2">({r.path})</span>
                      </div>
                      <div className="flex items-center space-x-2 shrink-0">
                        <span className="text-[10.5px] bg-charcoal-800 text-crimson-400 px-2 py-0.5 rounded border border-charcoal-700">
                          {r.trackCount.toLocaleString()} tracks
                        </span>
                        <span className="text-[10px] bg-charcoal-800 text-zinc-400 px-1.5 py-0.5 rounded border border-charcoal-700">Read-Only</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Collector Audio Quality & Library Health Auditor */}
              <div className="p-4 bg-charcoal-850 border border-charcoal-750 rounded-xl space-y-3.5 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <ShieldCheck size={18} className="text-crimson-500" />
                    <div>
                      <div className="font-semibold text-zinc-100 text-xs">Collector Audio Quality & Library Auditor</div>
                      <div className="text-zinc-500 text-[10px] font-mono">Hi-Res Lossless, Bitrate Hierarchy & Tag Health</div>
                    </div>
                  </div>
                  <button
                    onClick={() => refetchAudit()}
                    disabled={isAuditLoading}
                    className="flex items-center space-x-1.5 px-2.5 py-1 bg-charcoal-800 hover:bg-charcoal-750 border border-charcoal-700 text-zinc-200 rounded-lg text-[11px] font-medium transition active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw size={11} className={isAuditLoading ? 'animate-spin text-crimson-400' : ''} />
                    <span>{isAuditLoading ? 'Auditing...' : 'Run Audit'}</span>
                  </button>
                </div>

                {auditData ? (
                  <div className="space-y-3 pt-1">
                    {/* Overall Score Banner */}
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-charcoal-900 border border-charcoal-750">
                      <div>
                        <span className="text-[10.5px] text-zinc-400 block">Metadata Integrity Score</span>
                        <div className="flex items-center space-x-2 mt-0.5">
                          <span className={`text-base font-bold font-mono ${auditData.metadataHealth.healthScore >= 90 ? 'text-emerald-400' : auditData.metadataHealth.healthScore >= 75 ? 'text-amber-400' : 'text-crimson-400'}`}>
                            {auditData.metadataHealth.healthScore} / 100
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            ({auditData.totals.tracks.toLocaleString()} tracks across {auditData.totals.albums.toLocaleString()} albums)
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10.5px] text-zinc-400 block">Lossless Ratio</span>
                        <span className="text-sm font-bold font-mono text-cyan-400">
                          {auditData.quality.losslessPercent}% FLAC/WAV
                        </span>
                      </div>
                    </div>

                    {/* Audio Quality Breakdown Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="p-2.5 rounded-lg bg-charcoal-900/90 border border-amber-900/40">
                        <span className="text-[10px] font-mono uppercase text-amber-400 font-bold block">Hi-Res Lossless</span>
                        <span className="text-sm font-mono font-bold text-zinc-100">{auditData.quality.hiRes.toLocaleString()}</span>
                        <span className="block text-[9px] text-zinc-500 mt-0.5">≥24-bit or &gt;48kHz</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-charcoal-900/90 border border-cyan-900/40">
                        <span className="text-[10px] font-mono uppercase text-cyan-400 font-bold block">CD Lossless</span>
                        <span className="text-sm font-mono font-bold text-zinc-100">{auditData.quality.cdLossless.toLocaleString()}</span>
                        <span className="block text-[9px] text-zinc-500 mt-0.5">16-bit / 44.1kHz</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-charcoal-900/90 border border-emerald-900/40">
                        <span className="text-[10px] font-mono uppercase text-emerald-400 font-bold block">High Lossy (320k)</span>
                        <span className="text-sm font-mono font-bold text-zinc-100">{auditData.quality.highLossy.toLocaleString()}</span>
                        <span className="block text-[9px] text-zinc-500 mt-0.5">MP3/AAC ≥320kbps</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-charcoal-900/90 border border-zinc-800">
                        <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold block">Standard Lossy</span>
                        <span className="text-sm font-mono font-bold text-zinc-100">{auditData.quality.lowLossy.toLocaleString()}</span>
                        <span className="block text-[9px] text-zinc-500 mt-0.5">&lt;320kbps</span>
                      </div>
                    </div>

                    {/* Codec Distribution */}
                    {Object.keys(auditData.quality.codecs).length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-charcoal-900/60 border border-charcoal-800">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase mr-1">Codecs:</span>
                        {Object.entries(auditData.quality.codecs).map(([codec, count]) => (
                          <span key={codec} className="font-mono text-[9.5px] px-2 py-0.5 rounded bg-charcoal-800 text-zinc-300 border border-charcoal-700">
                            <span className="font-semibold text-zinc-100">{codec}</span>: {count.toLocaleString()}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Metadata Attention Items */}
                    <div className="p-2.5 rounded-lg bg-charcoal-900/70 border border-charcoal-800 text-[11px] font-mono space-y-1">
                      <div className="text-[10px] text-zinc-400 uppercase font-semibold pb-1 border-b border-charcoal-800 flex justify-between">
                        <span>Tag & Cover Art Diagnostic</span>
                        <span className="text-zinc-500">Status</span>
                      </div>
                      <div className="flex items-center justify-between text-zinc-300">
                        <span>Tracks missing Genre:</span>
                        <span className={auditData.metadataHealth.missingGenre > 0 ? 'text-amber-400' : 'text-zinc-500'}>
                          {auditData.metadataHealth.missingGenre.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-zinc-300">
                        <span>Tracks missing Release Year:</span>
                        <span className={auditData.metadataHealth.missingYear > 0 ? 'text-amber-400' : 'text-zinc-500'}>
                          {auditData.metadataHealth.missingYear.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-zinc-300">
                        <span>Albums without Cover Artwork:</span>
                        <span className={auditData.metadataHealth.missingArtworkAlbums > 0 ? 'text-amber-400' : 'text-zinc-500'}>
                          {auditData.metadataHealth.missingArtworkAlbums.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-zinc-300">
                        <span>Unavailable / Moved files:</span>
                        <span className={auditData.metadataHealth.unavailableTracks > 0 ? 'text-crimson-400 font-bold' : 'text-emerald-400'}>
                          {auditData.metadataHealth.unavailableTracks.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-4 text-center text-zinc-500 font-mono text-[11px]">
                    Click &quot;Run Audit&quot; to inspect audio quality and library metadata health.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: DESKTOP APP (PWA) */}
          {activeTab === 'app' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-charcoal-850 border border-charcoal-750 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Laptop size={16} className="text-crimson-500" />
                    <span className="font-semibold text-zinc-100">Status Aplikasi Desktop</span>
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold border ${
                    isPwaInstalled
                      ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                  }`}>
                    {isPwaInstalled ? 'INSTALLED (STANDALONE)' : 'RUNNING IN BROWSER'}
                  </span>
                </div>
                <p className="text-zinc-400 text-[11.5px] leading-relaxed">
                  Resonix mendukung Progressive Web App (PWA). Anda dapat memasangnya sebagai aplikasi mandiri di Windows Taskbar tanpa URL bar browser.
                </p>

                {pwaInstallPrompt && !isPwaInstalled ? (
                  <button
                    onClick={handleInstallPwa}
                    className="flex items-center space-x-1.5 bg-crimson-700 hover:bg-crimson-600 text-white font-medium px-3.5 py-1.5 rounded shadow transition active:scale-95 cursor-pointer mt-2"
                  >
                    <Download size={13} />
                    <span>Pasang Aplikasi ke Taskbar Sekarang</span>
                  </button>
                ) : isPwaInstalled ? (
                  <div className="text-emerald-400 flex items-center space-x-1.5 text-[11px] pt-1">
                    <CheckCircle2 size={13} />
                    <span>Aplikasi sudah terpasang di sistem operasi Anda.</span>
                  </div>
                ) : (
                  <p className="text-zinc-500 text-[11px] pt-1">
                    (Jika tombol belum aktif, Anda juga dapat mengklik icon &quot;Install App&quot; di address bar browser Anda).
                  </p>
                )}
              </div>

              {/* Offline Storage & PWA Caching Card */}
              <div className="p-3.5 bg-charcoal-850 border border-charcoal-750 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <HardDrive size={16} className="text-cyan-400" />
                    <span className="font-semibold text-zinc-100">PWA Offline Audio Storage</span>
                  </div>
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/80 border border-cyan-800/80 px-2 py-0.5 rounded font-semibold">
                    {offlineTracksCount} LAGU TERSIMPAN
                  </span>
                </div>
                <p className="text-zinc-400 text-[11.5px] leading-relaxed">
                  Lagu yang ditandai untuk offline disimpan di browser CacheStorage untuk pemutaran tanpa koneksi internet atau server lokal.
                </p>

                {offlineQuota && (
                  <div className="bg-charcoal-900 border border-charcoal-800 rounded p-2.5 space-y-1.5 text-[11px] font-mono">
                    <div className="flex justify-between text-zinc-400">
                      <span>Kapasitas Digunakan:</span>
                      <span className="text-zinc-200">{offlineQuota.usageMB} MB ({offlineQuota.percentUsed}% kuota browser)</span>
                    </div>
                    <div className="w-full bg-charcoal-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-cyan-500 h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, Math.max(1, offlineQuota.percentUsed))}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-zinc-500 text-[10px]">
                      <span>Tersedia untuk Cache:</span>
                      <span>{offlineQuota.availableMB.toLocaleString()} MB</span>
                    </div>
                  </div>
                )}

                {offlineTracksCount > 0 && (
                  <button
                    onClick={async () => {
                      if (confirm('Hapus semua lagu dari offline cache?')) {
                        await offlineStorageService.clearAll();
                        alert('Offline audio cache berhasil dibersihkan.');
                      }
                    }}
                    className="flex items-center space-x-1.5 bg-charcoal-800 hover:bg-charcoal-750 text-zinc-300 hover:text-zinc-100 text-[11px] font-medium px-3 py-1.5 rounded border border-charcoal-700 transition cursor-pointer"
                  >
                    <RotateCcw size={12} className="text-red-400" />
                    <span>Hapus Seluruh Offline Audio Cache</span>
                  </button>
                )}
              </div>

              {/* Network and Tailscale info */}
              <div className="p-3.5 bg-charcoal-850 border border-charcoal-750 rounded-lg space-y-2">
                <h4 className="font-semibold text-zinc-200 flex items-center space-x-1.5">
                  <Network size={14} className="text-crimson-400" />
                  <span>Tailscale Remote Streaming URL</span>
                </h4>
                <div className="bg-charcoal-900 border border-charcoal-800 rounded p-2.5 font-mono text-[11px] text-zinc-300 space-y-1">
                  <p className="text-zinc-500">Akses langsung dari device lain via Tailscale:</p>
                  <p className="text-emerald-400 font-semibold select-all">http://100.117.130.4:3000</p>
                </div>
              </div>

              {/* App & Server Lifecycle Controls */}
              <div className="p-3.5 bg-charcoal-850 border border-charcoal-750 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-zinc-200 flex items-center space-x-1.5">
                      <Power size={14} className="text-crimson-400" />
                      <span>App & Server Lifecycle Controls</span>
                    </h4>
                    <p className="text-zinc-400 text-[11px] mt-0.5">
                      Muat ulang tampilan web client atau restart proses server backend secara aman.
                    </p>
                  </div>
                </div>

                {restartMessage && (
                  <div className="p-2.5 rounded bg-crimson-950/60 border border-crimson-800 text-crimson-200 text-xs flex items-center space-x-2 font-mono">
                    <RefreshCw size={13} className="animate-spin shrink-0 text-crimson-400" />
                    <span>{restartMessage}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div className="p-2.5 bg-charcoal-900 border border-charcoal-800 rounded flex flex-col justify-between">
                    <div>
                      <div className="font-semibold text-zinc-200 text-xs flex items-center space-x-1.5">
                        <RotateCcw size={12} className="text-cyan-400" />
                        <span>Reload Web App (F5)</span>
                      </div>
                      <p className="text-[10.5px] text-zinc-400 mt-1">
                        Bersihkan cache peramban (service worker & query) lalu muat ulang antarmuka web.
                      </p>
                    </div>
                    <button
                      onClick={handleClearCacheAndReload}
                      className="mt-3 w-full bg-charcoal-800 hover:bg-charcoal-750 text-zinc-200 px-3 py-1.5 rounded border border-charcoal-700 transition cursor-pointer text-[11px] font-medium"
                    >
                      Reload Web App
                    </button>
                  </div>

                  <div className="p-2.5 bg-charcoal-900 border border-charcoal-800 rounded flex flex-col justify-between">
                    <div>
                      <div className="font-semibold text-zinc-200 text-xs flex items-center space-x-1.5">
                        <Power size={12} className="text-crimson-400" />
                        <span>Restart Server Backend</span>
                      </div>
                      <p className="text-[10.5px] text-zinc-400 mt-1">
                        Spawn proses backend baru dan tutup proses lama secara otomatis tanpa terminal.
                      </p>
                    </div>
                    <button
                      onClick={handleRestartServer}
                      disabled={isRestartingServer}
                      className="mt-3 w-full bg-crimson-800 hover:bg-crimson-700 text-white px-3 py-1.5 rounded transition cursor-pointer text-[11px] font-medium shadow disabled:opacity-50"
                    >
                      {isRestartingServer ? 'Restarting...' : 'Restart Server Backend'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: INTEGRATIONS (LAST.FM & EXTERNAL SYNC) */}
          {activeTab === 'integrations' && (
            <div className="space-y-4">
              {/* Last.fm Banner */}
              <div className="p-3 bg-charcoal-850 border border-charcoal-750 rounded flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-1.5">
                    {lastFmStatus?.isConnected ? (
                      <CheckCircle2 size={14} className="text-emerald-400" />
                    ) : (
                      <AlertCircle size={14} className="text-zinc-500" />
                    )}
                    <span className="font-semibold text-zinc-200">
                      {lastFmStatus?.isConnected
                        ? `Connected as ${lastFmStatus.username}`
                        : 'Not Connected to Last.fm'}
                    </span>
                  </div>
                  <p className="text-zinc-400 text-[11px] mt-0.5">
                    {lastFmStatus?.isConnected
                      ? `Scrobbling: ${lastFmStatus.isScrobblingEnabled ? 'Enabled' : 'Disabled'} • Pending in durable queue: ${lastFmStatus.pendingCount}`
                      : 'Connect your Last.fm account using official web authorization.'}
                  </p>
                </div>

                {lastFmStatus?.isConnected ? (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleSyncLibraryLastFm}
                      disabled={isSyncingLastFmLibrary}
                      className="bg-charcoal-750 hover:bg-charcoal-700 disabled:opacity-50 text-zinc-200 px-2.5 py-1 rounded text-[11px] transition cursor-pointer flex items-center space-x-1"
                      title="Sync play counts from Last.fm top scrobbled tracks"
                    >
                      {isSyncingLastFmLibrary ? (
                        <div className="w-3 h-3 border-2 border-crimson-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <LastFmIcon size={12} className="text-red-500" />
                      )}
                      <span>{isSyncingLastFmLibrary ? 'Syncing...' : 'Sync Play Counts'}</span>
                    </button>
                    <button
                      onClick={handleDisconnectLastFm}
                      className="bg-charcoal-750 hover:bg-red-900/60 text-zinc-300 hover:text-white px-2.5 py-1 rounded text-[11px] transition cursor-pointer"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    {!authToken ? (
                      <button
                        onClick={handleStartLastFmAuth}
                        className="bg-crimson-800 hover:bg-crimson-700 text-white px-3 py-1 rounded font-medium flex items-center space-x-1 transition cursor-pointer"
                      >
                        <span>Authorize Web</span>
                        <ExternalLink size={12} />
                      </button>
                    ) : (
                      <button
                        onClick={handleCompleteLastFmAuth}
                        className="bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1 rounded font-medium transition cursor-pointer"
                      >
                        Finish Authorization
                      </button>
                    )}
                  </div>
                )}
              </div>

              {authError && (
                <div className="p-2 bg-red-950/50 border border-red-800 rounded text-red-300 text-[11px]">
                  {authError}
                </div>
              )}

              {lastFmSyncLibraryMsg && (
                <div className="p-2 bg-charcoal-850/90 border border-charcoal-700 rounded text-zinc-200 text-[11px] font-mono flex items-center space-x-2 animate-fadeIn">
                  <span className="w-1.5 h-1.5 rounded-full bg-crimson-500 shrink-0" />
                  <span>{lastFmSyncLibraryMsg}</span>
                </div>
              )}

              {/* OpenSubsonic & Subsonic REST API Integration */}
              <div className="p-3 bg-charcoal-850 border border-charcoal-750 rounded space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Radio size={14} className="text-amber-400" />
                    <span className="font-semibold text-zinc-100">OpenSubsonic & Subsonic REST API Server</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 flex items-center space-x-1">
                    <CheckCircle2 size={10} />
                    <span>ENDPOINT ACTIVE</span>
                  </span>
                </div>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  Stream koleksi audio kamu langsung ke aplikasi pihak ketiga seperti <strong className="text-zinc-200">Symfonium (Android & Android Auto)</strong>, <strong className="text-zinc-200">Feishin (Windows/Mac/Linux)</strong>, <strong className="text-zinc-200">DSub</strong>, dan <strong className="text-zinc-200">Substreamer</strong> melalui LAN atau Tailscale.
                </p>

                <div className="bg-charcoal-900 border border-charcoal-800 rounded p-2.5 space-y-2 text-[11px]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 font-mono text-zinc-300">
                    <span className="text-zinc-500">Server URL (Subsonic):</span>
                    <div className="flex items-center gap-1.5 bg-charcoal-950 px-2 py-1 rounded border border-charcoal-800 text-[10.5px]">
                      <span className="text-amber-300 font-bold select-all">
                        {serverSettings?.subsonic?.serverUrl || `${window.location.origin}/rest`}
                      </span>
                      <button
                        onClick={() => {
                          const url = serverSettings?.subsonic?.serverUrl || `${window.location.origin}/rest`;
                          navigator.clipboard.writeText(url);
                          setSubsonicMsg({ text: 'Server URL berhasil disalin ke clipboard!' });
                        }}
                        className="text-zinc-400 hover:text-white ml-1 cursor-pointer"
                        title="Copy Subsonic URL"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 font-mono text-zinc-300">
                    <span className="text-zinc-500">Status Password App:</span>
                    <span className={serverSettings?.subsonic?.passwordConfigured ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                      {serverSettings?.subsonic?.passwordConfigured ? '✓ Configured & Ready' : 'Belum diatur (Gunakan form di bawah)'}
                    </span>
                  </div>

                  {/* Password update form */}
                  <div className="pt-2 border-t border-charcoal-800/80 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="password"
                      placeholder="Atur password aplikasi Subsonic (Symfonium / Feishin)..."
                      value={subsonicPasswordInput}
                      onChange={e => setSubsonicPasswordInput(e.target.value)}
                      className="flex-1 bg-charcoal-950 border border-charcoal-750 px-2.5 py-1.5 rounded text-zinc-200 placeholder-zinc-500 text-xs focus:outline-none focus:border-amber-500"
                    />
                    <button
                      onClick={handleSaveSubsonicPassword}
                      disabled={isSavingSubsonicPw || !subsonicPasswordInput.trim()}
                      className="px-3 py-1.5 rounded font-medium bg-amber-600 hover:bg-amber-500 text-zinc-950 text-xs transition cursor-pointer disabled:opacity-50 shrink-0 font-semibold"
                    >
                      {isSavingSubsonicPw ? 'Menyimpan...' : 'Simpan Password'}
                    </button>
                  </div>

                  {subsonicMsg && (
                    <div className={`p-2 rounded text-[11px] font-mono ${subsonicMsg.isError ? 'bg-red-950/60 text-red-300 border border-red-800' : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'}`}>
                      {subsonicMsg.text}
                    </div>
                  )}
                </div>
              </div>

              {/* Discogs & Encyclopaedia Metallum Integration */}
              <div className="p-3 bg-charcoal-850 border border-charcoal-750 rounded space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ImageIcon size={14} className="text-crimson-400" />
                    <span className="font-semibold text-zinc-100">Discogs API & Encyclopaedia Metallum</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 flex items-center space-x-1">
                    <CheckCircle2 size={10} />
                    <span>INTEGRATION READY</span>
                  </span>
                </div>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  Cascade otomatis untuk band photo, logo band beresolusi tinggi, dan biografi artis: 
                  <span className="text-zinc-300 font-medium"> Folder Lokal & Library Cache</span> → 
                  <span className="text-zinc-300 font-medium"> Metal Archives Scraper</span> → 
                  <span className="text-zinc-300 font-medium"> Discogs REST API</span>. Seluruh aset di-cache di disk server lokal (<code className="text-crimson-400">server/data/artists/</code>) untuk streaming remote instan via Tailscale.
                </p>
                <div className="bg-charcoal-900 border border-charcoal-800 rounded p-2 text-[10.5px] font-mono text-zinc-400 flex flex-wrap gap-x-4 gap-y-1">
                  <div>Discogs API: <span className="text-zinc-200">Configured via .env</span></div>
                  <div>Cache Disk: <span className="text-emerald-400">Enabled (Direct Stream)</span></div>
                  <div>Rate Limit: <span className="text-zinc-300">1.5s/call safe</span></div>
                </div>
              </div>

              {/* Artist Artwork Batch Fetcher */}
              <div className="p-3 bg-charcoal-850 border border-charcoal-750 rounded space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Sparkles size={14} className="text-crimson-400" />
                    <span className="font-semibold text-zinc-100">Batch Downloader Artwork Artis</span>
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold border ${
                    batchStatus?.isRunning
                      ? 'bg-amber-950/80 text-amber-300 border-amber-800 animate-pulse'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                  }`}>
                    {batchStatus?.isRunning ? 'RUNNING IN BACKGROUND' : 'IDLE'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10.5px]">
                  <div className="bg-charcoal-900/80 p-2 rounded border border-charcoal-800">
                    <div className="text-zinc-500">Total Artis</div>
                    <div className="font-mono text-sm font-semibold text-zinc-200">{batchStatus?.totalArtists ?? 0}</div>
                  </div>
                  <div className="bg-charcoal-900/80 p-2 rounded border border-charcoal-800">
                    <div className="text-zinc-500">Dengan Foto</div>
                    <div className="font-mono text-sm font-semibold text-emerald-400">{batchStatus?.artistsWithPhoto ?? 0}</div>
                  </div>
                  <div className="bg-charcoal-900/80 p-2 rounded border border-charcoal-800">
                    <div className="text-zinc-500">Dengan Logo</div>
                    <div className="font-mono text-sm font-semibold text-crimson-400">{batchStatus?.artistsWithLogo ?? 0}</div>
                  </div>
                  <div className="bg-charcoal-900/80 p-2 rounded border border-charcoal-800">
                    <div className="text-zinc-500">Progress Scan</div>
                    <div className="font-mono text-sm font-semibold text-zinc-200">
                      {batchStatus ? `${Math.round((batchStatus.artistsWithPhoto / Math.max(1, batchStatus.totalArtists)) * 100)}%` : '0%'}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-charcoal-900 rounded-full h-1.5 overflow-hidden border border-charcoal-800">
                  <div
                    className="bg-gradient-to-r from-crimson-600 to-amber-500 h-full transition-all duration-500"
                    style={{
                      width: `${batchStatus ? Math.min(100, Math.round((batchStatus.artistsWithPhoto / Math.max(1, batchStatus.totalArtists)) * 100)) : 0}%`,
                    }}
                  />
                </div>

                {batchStatus?.isRunning && (
                  <div className="flex items-center space-x-1.5 text-[11px] text-amber-300 font-mono bg-amber-950/30 p-1.5 rounded border border-amber-900/40">
                    <RefreshCw size={11} className="animate-spin text-amber-400 shrink-0" />
                    <span className="truncate">
                      Memproses: <strong className="text-zinc-100">{batchStatus.currentArtistName || 'Mengambil data...'}</strong>
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <p className="text-zinc-500 text-[10.5px]">
                    Proses berjalan throttled di server (1.5 detik per request) sehingga aman tanpa resiko banned.
                  </p>
                  {batchStatus?.isRunning ? (
                    <button
                      onClick={() => toggleBatchMutation.mutate('pause')}
                      disabled={toggleBatchMutation.isPending}
                      className="flex items-center space-x-1.5 bg-amber-800 hover:bg-amber-700 text-white font-medium px-3 py-1.5 rounded transition text-[11px] cursor-pointer disabled:opacity-50"
                    >
                      <Pause size={12} />
                      <span>Jeda Batch</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => toggleBatchMutation.mutate('start')}
                      disabled={toggleBatchMutation.isPending}
                      className="flex items-center space-x-1.5 bg-crimson-700 hover:bg-crimson-600 text-white font-medium px-3 py-1.5 rounded transition text-[11px] shadow cursor-pointer disabled:opacity-50"
                    >
                      <Play size={12} />
                      <span>Mulai Unduh Artwork Seluruh Library</span>
                    </button>
                  )}
                </div>
              </div>

              {/* External Playlists Discovery */}
              <div className="pt-2 border-t border-charcoal-800">
                <h4 className="font-semibold text-zinc-200 mb-1 flex items-center space-x-1.5">
                  <FolderSync size={13} className="text-crimson-400" />
                  <span>External Playlists & Library Artifacts</span>
                </h4>
                <p className="text-zinc-400 mb-2 text-[11px]">
                  Folder terbaca dari: <code className="text-crimson-400">{externalPlaylistData?.discoveryPath}</code>
                </p>

                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {externalPlaylistData?.candidates?.map((c, i) => (
                    <div
                      key={i}
                      className="p-2 bg-charcoal-850 border border-charcoal-750 rounded flex items-center justify-between text-[11px]"
                    >
                      <div className="truncate pr-2">
                        <span className="font-mono text-crimson-400 font-semibold uppercase mr-2">
                          [{c.category}]
                        </span>
                        <span className="text-zinc-200 font-medium mr-1">{c.name}</span>
                        <span className="text-zinc-500 font-mono text-[10px]">({c.folder})</span>
                      </div>
                      {c.category === 'playlist' && (
                        <button
                          onClick={() => handleImportPlaylist(c.fullPath)}
                          className="shrink-0 bg-crimson-800 hover:bg-crimson-700 text-white px-2 py-0.5 rounded text-[10.5px] transition cursor-pointer"
                        >
                          Import
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
