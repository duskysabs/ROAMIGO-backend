import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth.service.js';
import type { UserProfile } from '../../generated/prisma/client.js';

/**
 * This guard is responsible for protecting routes that require authentication.
 * It checks if the request has a valid Supabase access token.
 * If the token is valid, the request is allowed to proceed; otherwise, it is denied.
 */

type AuthenticatedUser = {
  id: string;
  email?: string;
  profile?: UserProfile | null;  
};

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

/**
 * Protets endpoints that require a valid Supabase access token.
 */

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Obtain the incoming express request.

    const request = context
    .switchToHttp()
    .getRequest<AuthenticatedRequest>();

    // Exptecxted Format: Authorization: Bearer <access_token>
    const authorization = request.headers.authorization;

    if(!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    // Remove "Bearer " prefix to get the access token.
    const accessToken = authorization.slice(7).trim();

    if(!accessToken) {
      throw new UnauthorizedException('Missing access token');
    }

    // Validate the access token with Supabase Auth.
    const user = await this.authService.getUser(accessToken);

    request.user = user;

    return true;
  }
}


