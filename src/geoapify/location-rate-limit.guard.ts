import { type CanActivate, type ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

export const LOCATION_RATE_LIMIT = 30;
export const LOCATION_RATE_WINDOW_MS = 60_000;
export const LOCATION_MAX_CLIENTS = 5000;

@Injectable()
export class LocationRateLimiter {
  private readonly clients = new Map<string, { count: number; expiresAt: number }>();

  consume(client: string, now: number): number {
    const entry = this.clients.get(client);
    if (entry && entry.expiresAt > now) {
      if (entry.count >= LOCATION_RATE_LIMIT) return Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
      entry.count += 1;
      return 0;
    }
    this.clients.delete(client);
    if (this.clients.size >= LOCATION_MAX_CLIENTS) {
      for (const [key, value] of this.clients) if (value.expiresAt <= now) this.clients.delete(key);
    }
    // Reject new clients under pressure instead of evicting active clients and resetting their limits.
    if (this.clients.size >= LOCATION_MAX_CLIENTS) return Math.ceil(LOCATION_RATE_WINDOW_MS / 1000);
    this.clients.set(client, { count: 1, expiresAt: now + LOCATION_RATE_WINDOW_MS });
    return 0;
  }
}

@Injectable()
export class LocationRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: LocationRateLimiter) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const seconds = this.limiter.consume(request.ip ?? request.socket.remoteAddress ?? 'unknown', Date.now());
    response.setHeader('Cache-Control', 'no-store');
    if (seconds) {
      response.setHeader('Retry-After', seconds);
      throw new HttpException({ statusCode: 429, code: 'LOCATION_RATE_LIMITED', message: 'Too many location or route requests. Please try again later.', retryable: true }, 429);
    }
    return true;
  }
}
