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
} from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { api } from '../api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const SettingsModal: React.FC = () => {
  const { isSettingsOpen, setSettingsOpen } = useUiStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'library' | 'musicbee' | 'lastfm' | 'network'>('library');

  // Last.fm auth state
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Settings form states
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiSecretInput, setApiSecretInput] = useState('');
  const [compatUsername, setCompatUsername] = useState('');
  const [compatPassword, setCompatPassword] = useState('');

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

  const { data: musicBeeData } = useQuery({
    queryKey: ['musicBeeCandidates'],
    queryFn: () => api.getMusicBeeCandidates(),
    enabled: isSettingsOpen,
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

  const handleDisconnectLastFm = async () => {
    await api.disconnectLastFm();
    queryClient.invalidateQueries({ queryKey: ['lastFmStatus'] });
  };

  const handleImportPlaylist = async (filePath: string) => {
    try {
      const res = await api.importMusicBeePlaylist(filePath);
      alert(`Imported ${res.tracksImported} tracks into playlist "${res.playlistName}"`);
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      queryClient.invalidateQueries({ queryKey: ['musicBeeCandidates'] });
    } catch (e: any) {
      alert(`Import failed: ${e.message}`);
    }
  };

  if (!isSettingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 select-none">
      <div className="w-full max-w-2xl bg-charcoal-900 border border-charcoal-750 rounded-lg shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh] overflow-hidden text-xs">
        {/* Header */}
        <div className="h-11 bg-charcoal-850 border-b border-charcoal-750 px-3 sm:px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2 font-mono font-semibold text-zinc-200">
            <SettingsIcon size={14} className="text-crimson-500" />
            <span className="truncate">Black Library Configuration</span>
          </div>
          <button
            onClick={() => setSettingsOpen(false)}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-charcoal-750 transition"
          >
            <X size={15} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-charcoal-750 bg-charcoal-950 px-2 sm:px-3 pt-2 space-x-1 overflow-x-auto scrollbar-none shrink-0">
          <button
            onClick={() => setActiveTab('library')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-t font-medium transition shrink-0 ${
              activeTab === 'library'
                ? 'bg-charcoal-900 text-zinc-100 border-t border-x border-charcoal-750'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <HardDrive size={13} />
            <span>Library & Roots</span>
          </button>

          <button
            onClick={() => setActiveTab('musicbee')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-t font-medium transition shrink-0 ${
              activeTab === 'musicbee'
                ? 'bg-charcoal-900 text-zinc-100 border-t border-x border-charcoal-750'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FolderSync size={13} />
            <span>MusicBee Import</span>
          </button>

          <button
            onClick={() => setActiveTab('lastfm')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-t font-medium transition shrink-0 ${
              activeTab === 'lastfm'
                ? 'bg-charcoal-900 text-zinc-100 border-t border-x border-charcoal-750'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Radio size={13} />
            <span>Last.fm</span>
          </button>

          <button
            onClick={() => setActiveTab('network')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-t font-medium transition shrink-0 ${
              activeTab === 'network'
                ? 'bg-charcoal-900 text-zinc-100 border-t border-x border-charcoal-750'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Network size={13} />
            <span>Tailscale & Streaming</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
          {/* Tab: Library */}
          {activeTab === 'library' && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-zinc-200 mb-1">Configured Library Roots</h4>
                <p className="text-zinc-400 mb-2 text-[11.5px]">
                  Audio sources are scanned recursively and treated as read-only. Original files are never modified or deleted.
                </p>
                <div className="space-y-1.5 font-mono text-[11px]">
                  {serverSettings?.system?.defaultLibraryRoots?.map((r: string) => (
                    <div key={r} className="p-2 bg-charcoal-850 border border-charcoal-750 rounded text-zinc-300 flex items-center justify-between">
                      <span className="truncate">{r}</span>
                      <span className="text-[10px] bg-charcoal-800 text-zinc-400 px-1.5 py-0.5 rounded border border-charcoal-700">Read-Only</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-charcoal-800">
                <h4 className="font-semibold text-zinc-200 mb-1">Listening Time & Play Count Rules</h4>
                <p className="text-zinc-400 text-[11.5px] mb-2">
                  To avoid false counts from skipping, tracks only count as &quot;Played&quot; when actually listened for at least 50% of duration (or 4 minutes max). Pausing and seeking do not artificially inflate listen time.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-zinc-400 block mb-1">Play Threshold (% of duration)</label>
                    <input
                      type="number"
                      defaultValue={serverSettings?.settings?.minPlayThresholdPercent || '50'}
                      className="w-full bg-charcoal-800 border border-charcoal-700 rounded px-2 py-1 text-zinc-200"
                      onBlur={(e) => saveSettingsMutation.mutate({ minPlayThresholdPercent: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Max Threshold Cap (seconds)</label>
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

          {/* Tab: MusicBee */}
          {activeTab === 'musicbee' && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-zinc-200 mb-1">Discovered MusicBee Artifacts</h4>
                <p className="text-zinc-400 mb-2 text-[11.5px]">
                  Scanned read-only from: <code className="text-crimson-400">{musicBeeData?.discoveryPath}</code>
                </p>

                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {musicBeeData?.candidates?.map((c, i) => (
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
                          className="shrink-0 bg-crimson-800 hover:bg-crimson-700 text-white px-2 py-0.5 rounded text-[10.5px] transition"
                        >
                          Import
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {musicBeeData?.pastImports && musicBeeData.pastImports.length > 0 && (
                <div className="pt-2 border-t border-charcoal-800">
                  <h4 className="font-semibold text-zinc-300 mb-1">Import Audit Log</h4>
                  <div className="space-y-1 font-mono text-[10.5px] text-zinc-400">
                    {musicBeeData.pastImports.map((imp: any) => (
                      <div key={imp.id} className="p-1.5 bg-charcoal-900 border border-charcoal-800 rounded">
                        <span className="text-zinc-300">{imp.sourceFile}:</span> {imp.log}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab: Last.fm */}
          {activeTab === 'lastfm' && (
            <div className="space-y-4">
              {/* Status Banner */}
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
                  <button
                    onClick={handleDisconnectLastFm}
                    className="bg-charcoal-750 hover:bg-red-900/60 text-zinc-300 hover:text-white px-2.5 py-1 rounded text-[11px] transition"
                  >
                    Disconnect
                  </button>
                ) : (
                  <div className="flex items-center space-x-2">
                    {!authToken ? (
                      <button
                        onClick={handleStartLastFmAuth}
                        className="bg-crimson-800 hover:bg-crimson-700 text-white px-3 py-1 rounded font-medium flex items-center space-x-1 transition"
                      >
                        <span>Authorize Web</span>
                        <ExternalLink size={12} />
                      </button>
                    ) : (
                      <button
                        onClick={handleCompleteLastFmAuth}
                        className="bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1 rounded font-medium transition"
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

              {/* API Key / Secret Form */}
              <div className="pt-2 border-t border-charcoal-800 space-y-3">
                <h4 className="font-semibold text-zinc-200">Last.fm API Credentials (Admin)</h4>
                <p className="text-zinc-400 text-[11px]">
                  API Key and API Secret are required for signing Last.fm requests and web authorizations.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-zinc-400 block mb-1">API Key</label>
                    <input
                      type="text"
                      placeholder="Enter Last.fm API Key..."
                      defaultValue={serverSettings?.settings?.lastFmApiKey || ''}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      className="w-full bg-charcoal-800 border border-charcoal-700 rounded px-2 py-1 text-zinc-200"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">API Secret</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      onChange={(e) => setApiSecretInput(e.target.value)}
                      className="w-full bg-charcoal-800 border border-charcoal-700 rounded px-2 py-1 text-zinc-200"
                    />
                  </div>
                </div>
                {(apiKeyInput || apiSecretInput) && (
                  <button
                    onClick={() => {
                      const payload: Record<string, string> = {};
                      if (apiKeyInput) payload.lastFmApiKey = apiKeyInput;
                      if (apiSecretInput) payload.lastFmApiSecret = apiSecretInput;
                      saveSettingsMutation.mutate(payload);
                    }}
                    className="bg-charcoal-750 hover:bg-charcoal-700 text-zinc-200 px-3 py-1 rounded transition"
                  >
                    Save API Credentials
                  </button>
                )}
              </div>

              {/* Compatibility fields */}
              <div className="pt-2 border-t border-charcoal-800 space-y-2">
                <div className="flex items-center space-x-1.5 text-zinc-300 font-medium">
                  <ShieldCheck size={13} className="text-emerald-400" />
                  <span>Optional Compatibility Fields</span>
                </div>
                <p className="text-zinc-400 text-[11px]">
                  Passwords are NOT required for standard web authorization and are never stored in plaintext. Session keys are used for all normal scrobbles.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-zinc-500 block mb-1">Compatibility Username</label>
                    <input
                      type="text"
                      value={compatUsername}
                      onChange={(e) => setCompatUsername(e.target.value)}
                      placeholder="Optional username..."
                      className="w-full bg-charcoal-800 border border-charcoal-700 rounded px-2 py-1 text-zinc-200"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-500 block mb-1">Compatibility Password (Opt-in Encrypted)</label>
                    <input
                      type="password"
                      value={compatPassword}
                      onChange={(e) => setCompatPassword(e.target.value)}
                      placeholder="Optional password..."
                      className="w-full bg-charcoal-800 border border-charcoal-700 rounded px-2 py-1 text-zinc-200"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Network & Tailscale */}
          {activeTab === 'network' && (
            <div className="space-y-4">
              <div className="p-3 bg-charcoal-850 border border-charcoal-750 rounded space-y-2">
                <h4 className="font-semibold text-zinc-200 flex items-center space-x-1.5">
                  <Network size={14} className="text-crimson-400" />
                  <span>Tailscale Remote Streaming Setup</span>
                </h4>
                <p className="text-zinc-400 text-[11.5px] leading-relaxed">
                  The Black Library server listens on all network interfaces (<code className="text-zinc-200 font-mono">0.0.0.0:3000</code>). To securely stream from your other PC or phone on your private Tailscale network:
                </p>

                <div className="bg-charcoal-900 border border-charcoal-800 rounded p-2.5 font-mono text-[11px] text-zinc-300 space-y-1.5">
                  <p className="text-zinc-500"># Direct Tailscale access from your other PC / laptop browser:</p>
                  <p className="text-emerald-400 font-semibold select-all">http://100.117.130.4:3000</p>
                  <p className="text-zinc-500 pt-1"># Or enable Tailscale HTTPS Serve (if enabled in Tailscale admin):</p>
                  <p className="text-crimson-400 select-all">tailscale serve --bg 3000</p>
                </div>
              </div>

              <div className="p-3 bg-charcoal-850 border border-charcoal-750 rounded space-y-1.5 font-mono text-[11px]">
                <div className="text-zinc-400 font-semibold mb-1">Transcoding Engine</div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">FFmpeg Status:</span>
                  <span className={serverSettings?.system?.ffmpegAvailable ? 'text-emerald-400' : 'text-amber-400'}>
                    {serverSettings?.system?.ffmpegAvailable ? 'AVAILABLE' : 'NOT DETECTED'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Binary Info:</span>
                  <span className="text-zinc-300 truncate max-w-sm">{serverSettings?.system?.ffmpegVersion}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
