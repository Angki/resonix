import React, { useState } from 'react';
import { X, Lock, User as UserIcon, LogOut, CheckCircle2 } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { api } from '../api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, setAuthModalOpen, currentUser, setCurrentUser } = useUiStore();
  const queryClient = useQueryClient();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: authStatus } = useQuery({
    queryKey: ['authStatus'],
    queryFn: () => api.getAuthStatus(),
    enabled: isAuthModalOpen,
  });

  const setupMutation = useMutation({
    mutationFn: (data: { username: string; password: string }) => api.setupAdmin(data),
    onSuccess: (res) => {
      setCurrentUser(res.user);
      queryClient.invalidateQueries({ queryKey: ['authStatus'] });
      queryClient.invalidateQueries({ queryKey: ['tracks'] });
      queryClient.invalidateQueries({ queryKey: ['libraryRoots'] });
      setAuthModalOpen(false);
      setUsername('');
      setPassword('');
      setErrorMsg(null);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Setup failed');
    },
  });

  const loginMutation = useMutation({
    mutationFn: (data: { username: string; password: string }) => api.login(data),
    onSuccess: (res) => {
      setCurrentUser(res.user);
      queryClient.invalidateQueries({ queryKey: ['authStatus'] });
      queryClient.invalidateQueries({ queryKey: ['tracks'] });
      queryClient.invalidateQueries({ queryKey: ['libraryRoots'] });
      setAuthModalOpen(false);
      setUsername('');
      setPassword('');
      setErrorMsg(null);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Login failed');
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      setCurrentUser(null);
      queryClient.invalidateQueries({ queryKey: ['authStatus'] });
      setAuthModalOpen(false);
    },
  });

  if (!isAuthModalOpen) return null;

  const isSetup = authStatus?.needsSetup;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-sm bg-charcoal-900 border border-charcoal-750 rounded-lg shadow-2xl overflow-hidden text-xs">
        {/* Header */}
        <div className="h-10 bg-charcoal-850 border-b border-charcoal-750 px-4 flex items-center justify-between">
          <div className="flex items-center space-x-2 font-mono font-semibold text-zinc-200">
            <Lock size={13} className="text-crimson-500" />
            <span>{currentUser ? 'User Account' : isSetup ? 'First-Run Admin Setup' : 'Login'}</span>
          </div>
          <button
            onClick={() => setAuthModalOpen(false)}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-charcoal-750 transition"
          >
            <X size={15} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {currentUser ? (
            <div className="space-y-4">
              <div className="flex items-center space-x-3 p-3 bg-charcoal-850 rounded border border-charcoal-800">
                <div className="w-9 h-9 rounded-full bg-crimson-900/60 flex items-center justify-center text-crimson-400">
                  <UserIcon size={18} />
                </div>
                <div>
                  <p className="font-semibold text-zinc-100">{currentUser.username}</p>
                  <p className="text-zinc-500 text-[11px] font-mono capitalize">Role: {currentUser.role}</p>
                </div>
              </div>

              <button
                onClick={() => logoutMutation.mutate()}
                className="w-full bg-charcoal-800 hover:bg-red-950/60 text-zinc-300 hover:text-red-300 py-1.5 rounded flex items-center justify-center space-x-1.5 transition"
              >
                <LogOut size={13} />
                <span>Log Out</span>
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setErrorMsg(null);
                if (isSetup) {
                  setupMutation.mutate({ username, password });
                } else {
                  loginMutation.mutate({ username, password });
                }
              }}
              className="space-y-3"
            >
              {isSetup && (
                <p className="text-zinc-400 text-[11.5px] leading-relaxed">
                  Welcome to Black Library. Create your master administrator account to secure streaming and settings.
                </p>
              )}

              {errorMsg && (
                <div className="p-2 bg-red-950/50 border border-red-800 rounded text-red-300 text-[11px]">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="text-zinc-400 block mb-1">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username..."
                  required
                  className="w-full bg-charcoal-800 border border-charcoal-750 text-zinc-200 px-2.5 py-1.5 rounded focus:outline-none focus:border-crimson-700"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isSetup ? 'At least 8 characters...' : 'Password...'}
                  required
                  className="w-full bg-charcoal-800 border border-charcoal-750 text-zinc-200 px-2.5 py-1.5 rounded focus:outline-none focus:border-crimson-700"
                />
              </div>

              <button
                type="submit"
                disabled={setupMutation.isPending || loginMutation.isPending}
                className="w-full bg-crimson-800 hover:bg-crimson-700 disabled:opacity-50 text-white font-medium py-1.5 rounded transition mt-2 shadow"
              >
                {isSetup ? 'Complete Setup' : 'Log In'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
