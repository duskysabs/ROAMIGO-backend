import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth.service.js';

type TokenAuthenticatedUser = {
  id: string;
  email?: string;
};

export type TokenAuthenticatedRequest = Request & {
  user?: TokenAuthenticatedUser;
};

@Injectable()
export class SupabaseTokenGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<TokenAuthenticatedRequest>();

    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header',
      );
    }

    const accessToken = authorization.slice(7).trim();

    if (!accessToken) {
      throw new UnauthorizedException('Missing access token');
    }

    request.user = await this.authService.verifyAccessToken(accessToken);

    return true;
  }
}