import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  LOGIN_RATE_BLOCK_DURATION_MS,
  LOGIN_RATE_LIMIT,
  LOGIN_RATE_MAX_TRACKED_CLIENTS,
  LOGIN_RATE_TTL_MS,
} from '../constants/auth-rate-limit.constants.js';

type LoginAttemptRecord = {
  attempts: number;
  windowExpiresAt: number;
  blockedUntil: number;
};

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly attemptsByClient = new Map<string, LoginAttemptRecord>();

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const clientKey = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const existingRecord = this.attemptsByClient.get(clientKey);

    if (existingRecord?.blockedUntil && existingRecord.blockedUntil > now) {
      this.rejectRequest(response, existingRecord.blockedUntil - now);
    }

    if (!existingRecord || existingRecord.windowExpiresAt <= now) {
      this.ensureTrackingCapacity(now);
      this.attemptsByClient.set(clientKey, {
        attempts: 1,
        windowExpiresAt: now + LOGIN_RATE_TTL_MS,
        blockedUntil: 0,
      });
      return true;
    }

    if (existingRecord.attempts >= LOGIN_RATE_LIMIT) {
      existingRecord.blockedUntil = now + LOGIN_RATE_BLOCK_DURATION_MS;
      this.rejectRequest(response, LOGIN_RATE_BLOCK_DURATION_MS);
    }

    existingRecord.attempts += 1;
    return true;
  }

  private ensureTrackingCapacity(now: number) {
    if (this.attemptsByClient.size < LOGIN_RATE_MAX_TRACKED_CLIENTS) {
      return;
    }

    for (const [clientKey, record] of this.attemptsByClient) {
      if (record.windowExpiresAt <= now && record.blockedUntil <= now) {
        this.attemptsByClient.delete(clientKey);
      }
    }

    if (this.attemptsByClient.size >= LOGIN_RATE_MAX_TRACKED_CLIENTS) {
      const oldestClientKey = this.attemptsByClient.keys().next().value as
        string | undefined;

      if (oldestClientKey) {
        this.attemptsByClient.delete(oldestClientKey);
      }
    }
  }

  private rejectRequest(response: Response, remainingBlockMs: number): never {
    response.setHeader('Retry-After', Math.ceil(remainingBlockMs / 1_000));
    throw new HttpException(
      'Too many login attempts. Please try again later.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
