import dns from 'node:dns/promises';
import net from 'node:net';

export interface UrlValidationResult {
  valid: boolean;
  reason?: string;
  normalizedUrl?: string;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata',
]);

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  // 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10 (CGNAT), 127.0.0.0/8 (loopback)
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 169.254.0.0/16 (link-local & cloud metadata)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 224.0.0.0/4 multicast & 240.0.0.0/4 reserved
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }
  if (normalized.startsWith('::ffff:')) {
    const mappedV4 = normalized.slice(7);
    if (net.isIP(mappedV4) === 4) {
      return isPrivateIpv4(mappedV4);
    }
  }
  return false;
}

export function isBlockedIpAddress(ip: string): boolean {
  const ipVersion = net.isIP(ip);
  if (ipVersion === 4) return isPrivateIpv4(ip);
  if (ipVersion === 6) return isPrivateIpv6(ip);
  return true;
}

export function validateWebhookUrlSync(rawUrl: string): UrlValidationResult {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Webhook URL is empty.' };
  }
  if (trimmed.length > 2048) {
    return { valid: false, reason: 'Webhook URL exceeds maximum allowed length.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: 'Webhook URL is not a valid URL.' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, reason: 'Only HTTPS webhook URLs are permitted.' };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'Embedded credentials in webhook URLs are not allowed.' };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname) {
    return { valid: false, reason: 'Webhook URL must include a hostname.' };
  }

  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost')
  ) {
    return { valid: false, reason: 'Loopback and internal hostnames are blocked.' };
  }

  if (net.isIP(hostname) !== 0) {
    return {
      valid: false,
      reason: 'Direct IP addresses are blocked; provide a public HTTPS domain hostname.',
    };
  }

  if (!hostname.includes('.')) {
    return { valid: false, reason: 'Webhook hostname must be a fully qualified public domain.' };
  }

  return { valid: true, normalizedUrl: parsed.toString() };
}

export async function resolveAndValidateWebhookUrl(rawUrl: string): Promise<UrlValidationResult> {
  const syncResult = validateWebhookUrlSync(rawUrl);
  if (!syncResult.valid || !syncResult.normalizedUrl) {
    return syncResult;
  }

  const parsed = new URL(syncResult.normalizedUrl);
  try {
    const records = await dns.lookup(parsed.hostname, { all: true });
    if (!records.length) {
      return { valid: false, reason: 'Webhook hostname could not be resolved.' };
    }
    for (const record of records) {
      if (isBlockedIpAddress(record.address)) {
        return {
          valid: false,
          reason: 'Webhook hostname resolves to a restricted private or loopback network address.',
        };
      }
    }
    return syncResult;
  } catch {
    return { valid: false, reason: 'Unable to resolve webhook hostname via DNS.' };
  }
}

export function sanitizeShortString(value: unknown, maxLen: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, maxLen);
}
