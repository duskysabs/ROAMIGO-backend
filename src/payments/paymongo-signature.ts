import { createHmac, timingSafeEqual } from 'node:crypto';

export function validTestSignature(header: string | undefined, rawBody: Buffer, secret: string, now = Date.now()): boolean {
  if (!header || !secret) return false;
  const fields = Object.fromEntries(header.split(',').map((part) => {
    const separator = part.indexOf('=');
    return [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
  }));
  if (!/^\d+$/.test(fields.t ?? '') || !/^[0-9a-f]{64}$/i.test(fields.te ?? '')) return false;
  if (Math.abs(now / 1000 - Number(fields.t)) > 300) return false;
  const expected = createHmac('sha256', secret).update(fields.t).update('.').update(rawBody).digest();
  const actual = Buffer.from(fields.te, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
