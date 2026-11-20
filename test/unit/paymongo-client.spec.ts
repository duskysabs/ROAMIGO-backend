import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestCheckout, getVerifiedTestPayment, testSecretKey } from '../../src/payments/paymongo-client.js';

describe('PayMongo test API boundary', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('refuses a live key before contacting PayMongo', () => {
    vi.stubEnv('PAYMONGO_TEST_SECRET_KEY', 'sk_live_wrong_mode');
    expect(testSecretKey).toThrow();
  });

  it('sends the server-priced PHP amount in centavos and returns the hosted URL', async () => {
    vi.stubEnv('PAYMONGO_TEST_SECRET_KEY', 'sk_test_example');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      data: { id: 'cs_123', attributes: { checkout_url: 'https://checkout.paymongo.com/cs_123' } },
    }) });
    vi.stubGlobal('fetch', fetchMock);
    const result = await createTestCheckout({ bookingId: 'booking-id', amountCentavos: 120000,
      successUrl: 'https://example.com/success', cancelUrl: 'https://example.com/cancel' });
    expect(result.sessionId).toBe('cs_123');
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.paymongo.com/v1/checkout_sessions');
    expect(JSON.parse(request.body).data.attributes).toMatchObject({
      line_items: [{ amount: 120000, currency: 'PHP', name: 'ROAMIGO booking', quantity: 1 }],
      reference_number: 'booking-id',
    });
    expect(request.headers.Authorization).toMatch(/^Basic /);
    expect(request.headers['Idempotency-Key']).toBe('roamigo-test-checkout-booking-id');
  });

  it('only accepts a test session with one paid PHP payment', async () => {
    vi.stubEnv('PAYMONGO_TEST_SECRET_KEY', 'sk_test_example');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      data: { id: 'cs_123', attributes: { livemode: false, payments: [
        { attributes: { status: 'paid', amount: 120000, currency: 'PHP' } },
      ] } },
    }) }));
    await expect(getVerifiedTestPayment('cs_123')).resolves.toEqual({ amountCentavos: 120000, currency: 'PHP' });
  });
});
