import { Module } from '@nestjs/common';
import { GeoapifyClient } from './geoapify.client.js';
import { LocationRateLimiter, LocationRateLimitGuard } from './location-rate-limit.guard.js';

@Module({ providers: [GeoapifyClient, LocationRateLimiter, LocationRateLimitGuard], exports: [GeoapifyClient, LocationRateLimiter, LocationRateLimitGuard] })
export class GeoapifyModule {}
