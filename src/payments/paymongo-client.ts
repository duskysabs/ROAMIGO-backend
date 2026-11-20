import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';

type Resource = { id?: unknown; attributes?: Record<string, unknown> };

export class PaymongoRejectedRequest extends BadGatewayException {}

export function testSecretKey(): string {
  const key = process.env.PAYMONGO_TEST_SECRET_KEY;
  if (!key?.startsWith('sk_test_')) throw new ServiceUnavailableException('PayMongo test checkout is not configured');
  return key;
}

function headers(key: string) {
  return { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`, Accept: 'application/json', 'Content-Type': 'application/json' };
}

async function paymongoRequest(path: string, init: RequestInit) {
  let response: Response;
  try {
    response = await fetch(`https://api.paymongo.com/v1${path}`, { ...init, signal: AbortSignal.timeout(15000) });
  } catch {
    throw new BadGatewayException('PayMongo test API could not be reached');
  }
  if (!response.ok) {
    const message = `PayMongo test API rejected the request (${response.status})`;
    if (response.status >= 400 && response.status < 500 && ![408, 409].includes(response.status)) {
      throw new PaymongoRejectedRequest(message);
    }
    throw new BadGatewayException(message);
  }
  try {
    return await response.json() as { data?: Resource };
  } catch {
    throw new BadGatewayException('PayMongo test API returned an invalid response');
  }
}

export async function createTestCheckout(input: { bookingId: string; amountCentavos: number; successUrl: string; cancelUrl: string }) {
  const methods = (process.env.PAYMONGO_TEST_PAYMENT_METHODS ?? 'card,gcash,paymaya').split(',').map((method) => method.trim());
  if (!methods.length || methods.some((method) => !['card', 'gcash', 'paymaya'].includes(method)) || new Set(methods).size !== methods.length) {
    throw new ServiceUnavailableException('PAYMONGO_TEST_PAYMENT_METHODS has an invalid value');
  }
  const result = await paymongoRequest('/checkout_sessions', {
    method: 'POST', headers: { ...headers(testSecretKey()), 'Idempotency-Key': `roamigo-test-checkout-${input.bookingId}` },
    body: JSON.stringify({ data: { attributes: {
      line_items: [{ currency: 'PHP', amount: input.amountCentavos, name: 'ROAMIGO booking', quantity: 1 }],
      payment_method_types: methods,
      success_url: input.successUrl, cancel_url: input.cancelUrl,
      reference_number: input.bookingId,
      description: `ROAMIGO booking ${input.bookingId}`,
      send_email_receipt: false,
    } } }),
  });
  const id = result.data?.id;
  const url = result.data?.attributes?.checkout_url;
  if (typeof id !== 'string' || !/^cs_[A-Za-z0-9]+$/.test(id) || typeof url !== 'string' || !url.startsWith('https://')) {
    throw new BadGatewayException('PayMongo test API returned an invalid checkout session');
  }
  return { sessionId: id, checkoutUrl: url };
}

export async function getVerifiedTestPayment(sessionId: string): Promise<{ amountCentavos: number; currency: string }> {
  if (!/^cs_[A-Za-z0-9]+$/.test(sessionId)) throw new BadGatewayException('Invalid PayMongo checkout session');
  const result = await paymongoRequest(`/checkout_sessions/${sessionId}`, { method: 'GET', headers: headers(testSecretKey()) });
  if (result.data?.id !== sessionId || result.data.attributes?.livemode !== false) {
    throw new BadGatewayException('PayMongo checkout session does not match test mode');
  }
  const payments = result.data.attributes.payments;
  if (!Array.isArray(payments)) throw new BadGatewayException('PayMongo has not confirmed a payment');
  const paid = payments.filter((payment: Resource) => payment?.attributes?.status === 'paid');
  if (paid.length !== 1 || !Number.isSafeInteger(paid[0]?.attributes?.amount) || paid[0].attributes.amount <= 0 || typeof paid[0].attributes.currency !== 'string') {
    throw new BadGatewayException('PayMongo has not confirmed one full payment');
  }
  return { amountCentavos: paid[0].attributes.amount as number, currency: paid[0].attributes.currency as string };
}
