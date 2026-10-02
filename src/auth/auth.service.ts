import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service.js';
import { LoginDto } from './dto/login.dto.js';
import { SignUpDto } from './dto/signup.dto.js';
import { UserProfilesService } from '../user-profiles/user-profiles.service.js';
import { AccountStatus } from '../generated/prisma/enums.js';

/**
 * Contains authentication-related business logic.
 *
 * The controller receives HTTP requests and forwards login data here.
 * This service then communicates with Supabase Auth.
 */

@Injectable()
export class AuthService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly userProfilesService: UserProfilesService,
  ) {}

  async signUp(signUpDto: SignUpDto) {
    const supabase = this.supabaseService.createClient();

    const { data, error } = await supabase.auth.signUp({
      email: signUpDto.email,
      password: signUpDto.password,
    });

    if (error || !data.user) {
      throw new BadRequestException('Unable to create account');
    }

    const session = data.session;

    return {
      accessToken: session?.access_token ?? null,
      refreshToken: session?.refresh_token ?? null,
      expiresIn: session?.expires_in ?? null,
      tokenType: session?.token_type ?? null,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      requiresEmailConfirmation: !session,
      requiresProfile: true,
      nextStep: session ? 'COMPLETE_PROFILE' : 'CONFIRM_EMAIL',
    };
  }

  async login(loginDto: LoginDto) {
    const supabase = this.supabaseService.createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginDto.email,
      password: loginDto.password,
    });

    if (error || !data.session) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const profile = await this.userProfilesService.findByUserId(data.user.id);

    if (!profile) {
      return {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresIn: data.session.expires_in,
        tokenType: data.session.token_type,
        user: {
          id: data.user.id,
          email: data.user.email,
        },
        requiresProfile: true,
        nextStep: 'COMPLETE_PROFILE',
      };
    }

    if (profile.accountStatus !== AccountStatus.ACTIVE) {
      await supabase.auth.signOut();
      throw new ForbiddenException('Account is inactive.');
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
      tokenType: data.session.token_type,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      requiresProfile: false,
      nextStep: 'APPLICATION',
    };
  }

  /**
   * Verifies a Supabase Access Token and returns the associated user information.
   * @param accessToken The Supabase Access Token to verify.
   * @returns An object containing the user's ID and email.
   * @throws UnauthorizedException if the token is invalid or expired.
   */

  async verifyAccessToken(accessToken: string) {
    const supabase = this.supabaseService.createClient();

    const { data, error } = await supabase.auth.getUser(accessToken);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    return {
      id: data.user.id,
      email: data.user.email,
    };
  }

  async getUser(accessToken: string) {
    const user = await this.verifyAccessToken(accessToken);
    const profile = await this.userProfilesService.findByUserId(user.id);

    if (!profile) {
      throw new ForbiddenException('User profile not found.');
    }

    if (profile.accountStatus !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Account is inactive.');
    }

    return {
      ...user,
      profile,
    };
  }
}
