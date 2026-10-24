import net from 'node:net';

const PLACEHOLDER_MARKERS = [
  'change_me',
  'changeme',
  'replace_me',
  'replaceme',
  'your_session_secret',
  'your_secret',
  'your-key',
  'your_key',
  'example',
  'placeholder',
];

export function isLoopbackAddress(address?: string | null): boolean {
  if (!address) return false;
  const normalized = address.trim().toLowerCase();
  if (normalized === '::1' || normalized === 'localhost') return true;
  if (normalized.startsWith('::ffff:')) {
    return isLoopbackAddress(normalized.slice('::ffff:'.length));
  }
  if (net.isIPv4(normalized)) {
    return normalized.startsWith('127.');
  }
  return false;
}

export function parseTrustProxy(value: string): boolean | number | string {
  const normalized = value.trim();
  if (normalized === 'true') return true;
  if (normalized === 'false' || normalized === '') return false;
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return normalized;
}

export function isPlaceholderSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker));
}

export function canPerformInitialSetup(params: {
  remoteAddress?: string | null;
  tokenValid: boolean;
  profile: 'PERSONAL' | 'LAN' | 'PUBLIC';
}): boolean {
  if (params.profile === 'PUBLIC') return params.tokenValid;
  return isLoopbackAddress(params.remoteAddress) || params.tokenValid;
}
