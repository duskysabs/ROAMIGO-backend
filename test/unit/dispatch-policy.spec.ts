import { afterEach, describe, expect, it } from 'vitest';
import { DispatchPolicy } from '../../src/assignments/dispatch-policy.js';

const original = process.env.DRIVER_RESPONSE_WINDOW_MINUTES;
afterEach(() => {
  if (original === undefined) delete process.env.DRIVER_RESPONSE_WINDOW_MINUTES;
  else process.env.DRIVER_RESPONSE_WINDOW_MINUTES = original;
});

describe('Driver response configuration', () => {
  it('defaults to two hours when unset', () => {
    delete process.env.DRIVER_RESPONSE_WINDOW_MINUTES;
    const now = new Date('2030-01-01T08:00:00Z');
    expect(new DispatchPolicy().deadline(now)).toEqual(new Date('2030-01-01T10:00:00Z'));
  });

  it('applies configuration to future dispatches without changing an existing snapshot', () => {
    process.env.DRIVER_RESPONSE_WINDOW_MINUTES = '120';
    const now = new Date('2030-01-01T08:00:00Z');
    const stored = new DispatchPolicy().deadline(now);
    process.env.DRIVER_RESPONSE_WINDOW_MINUTES = '30';
    expect(new DispatchPolicy().deadline(now)).toEqual(new Date('2030-01-01T08:30:00Z'));
    expect(stored).toEqual(new Date('2030-01-01T10:00:00Z'));
  });

  it.each(['', '0', '-1', '1.5', 'wrong', '10081'])('fails closed on invalid configuration %s', (value) => {
    process.env.DRIVER_RESPONSE_WINDOW_MINUTES = value;
    expect(() => new DispatchPolicy()).toThrow('DRIVER_RESPONSE_WINDOW_MINUTES');
  });
});
