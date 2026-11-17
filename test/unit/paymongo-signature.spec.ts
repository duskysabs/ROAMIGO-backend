import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validTestSignature } from '../../src/payments/paymongo-signature.js';

describe('PayMongo test webhook signatures', () => {
  const body = Buffer.from('{"data":{"id":"evt_123"}}');
  const secret = 'whsk_test_example';
  const now = 1_700_000_000_000;
  const timestamp = '1700000000';
  const sign = (payload: Buffer) => createHmac('sha256', secret).update(`${timestamp}.`).update(payload).digest('hex');

  it('accepts the test signature over the exact raw body', () => {
    expect(validTestSignature(`t=${timestamp},te=${sign(body)},li=`, body, secret, now)).toBe(true);
  });

  it('rejects a changed body, live-only signature, and stale delivery', () => {
    expect(validTestSignature(`t=${timestamp},te=${sign(body)},li=`, Buffer.from('{}'), secret, now)).toBe(false);
    expect(validTestSignature(`t=${timestamp},te=,li=${sign(body)}`, body, secret, now)).toBe(false);
    expect(validTestSignature(`t=${timestamp},te=${sign(body)},li=`, body, secret, now + 301_000)).toBe(false);
  });
});
