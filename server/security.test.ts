import test from 'node:test';
import assert from 'node:assert/strict';
import { isBlockedIpAddress, validateWebhookUrlSync } from './security';

test('validateWebhookUrlSync allows valid public HTTPS CRM endpoints', () => {
  const validUrls = [
    'https://hooks.zapier.com/hooks/catch/12345/abcdef/',
    'https://api.hubapi.com/crm/v3/objects/contacts',
    'https://hook.us1.make.com/abc123xyz',
  ];
  for (const url of validUrls) {
    const result = validateWebhookUrlSync(url);
    assert.equal(result.valid, true, `Expected ${url} to pass validation`);
  }
});

test('validateWebhookUrlSync blocks non-HTTPS, loopback, private IP, metadata, and dangerous schemes', () => {
  const blockedUrls = [
    'http://hooks.zapier.com/hooks/catch/12345/abc',
    'https://localhost/webhook',
    'https://127.0.0.1/webhook',
    'https://169.254.169.254/latest/meta-data/',
    'https://10.0.0.5/internal',
    'https://192.168.1.20/hook',
    'https://metadata.google.internal/computeMetadata/v1/',
    'https://service.internal/webhook',
    'https://user:pass@hooks.zapier.com/test',
    'javascript:alert(1)',
    'file:///etc/passwd',
  ];
  for (const url of blockedUrls) {
    const result = validateWebhookUrlSync(url);
    assert.equal(result.valid, false, `Expected ${url} to be blocked`);
  }
});

test('isBlockedIpAddress identifies private, link-local, and loopback IPv4/IPv6 ranges', () => {
  assert.equal(isBlockedIpAddress('127.0.0.1'), true);
  assert.equal(isBlockedIpAddress('10.24.0.1'), true);
  assert.equal(isBlockedIpAddress('172.16.5.10'), true);
  assert.equal(isBlockedIpAddress('192.168.0.1'), true);
  assert.equal(isBlockedIpAddress('169.254.169.254'), true);
  assert.equal(isBlockedIpAddress('::1'), true);
  assert.equal(isBlockedIpAddress('fe80::1'), true);
  assert.equal(isBlockedIpAddress('8.8.8.8'), false);
  assert.equal(isBlockedIpAddress('104.18.24.12'), false);
});
