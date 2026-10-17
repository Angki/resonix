import crypto from 'node:crypto';

interface BootstrapState {
  token: string | null;
  expiresAt: number | null;
}

const state: BootstrapState = {
  token: null,
  expiresAt: null,
};

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Initializes an ephemeral bootstrap token on first-run if no users exist.
 * Logs the token clearly in console for local operator use.
 */
export function initializeBootstrapToken(): string {
  const token = crypto.randomBytes(32).toString('hex');
  state.token = token;
  state.expiresAt = Date.now() + TOKEN_TTL_MS;

  console.log('\n================================================================================');
  console.log(' [SECURITY] Resonix First-Run Setup');
  console.log(' No users found in database. Initial setup is active.');
  console.log(` Bootstrap Token: ${token}`);
  console.log(' Valid for 15 minutes from local machine or with X-Bootstrap-Token header.');
  console.log('================================================================================\n');

  return token;
}

/**
 * Checks whether the given token matches the active bootstrap token.
 */
export function verifyBootstrapToken(candidateToken?: string): boolean {
  if (!state.token || !state.expiresAt) return false;
  if (Date.now() > state.expiresAt) {
    state.token = null;
    state.expiresAt = null;
    return false;
  }
  if (!candidateToken) return false;

  const a = Buffer.from(candidateToken, 'utf8');
  const b = Buffer.from(state.token, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Consumes and permanently clears the bootstrap token upon successful admin creation.
 */
export function consumeBootstrapToken(): void {
  state.token = null;
  state.expiresAt = null;
}
