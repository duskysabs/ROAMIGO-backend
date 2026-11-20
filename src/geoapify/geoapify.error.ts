import { HttpException } from '@nestjs/common';
export type GeoapifyFailure = 'NOT_CONFIGURED' | 'TIMEOUT' | 'UNAVAILABLE' | 'RATE_LIMITED' | 'REJECTED' | 'INVALID_RESPONSE';
const failures: Record<GeoapifyFailure, { status: number; message: string }> = {
  NOT_CONFIGURED: { status: 503, message: 'Location and routing services are not configured' },
  TIMEOUT: { status: 503, message: 'Location provider timed out. Please try again.' },
  UNAVAILABLE: { status: 503, message: 'Location provider is unavailable. Please try again.' },
  RATE_LIMITED: { status: 503, message: 'Location provider rate limit reached. Please try again later.' },
  REJECTED: { status: 502, message: 'Location provider rejected the request' },
  INVALID_RESPONSE: { status: 502, message: 'Location provider returned invalid data' },
};
export class GeoapifyError extends HttpException {
  constructor(readonly failure: GeoapifyFailure) {
    const { status, message } = failures[failure];
    super({ statusCode: status, code: `GEOAPIFY_${failure}`, message,
      retryable: failure === 'TIMEOUT' || failure === 'UNAVAILABLE' || failure === 'RATE_LIMITED',
    }, status);
  }
}
