import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service.js';
import { LoginDto } from './dto/login.dto.js';

/**
 * Contains authentication-related business logic.
 *
 * The controller receives HTTP requests and forwards login data here.
 * This service then communicates with Supabase Auth.
 */

@Injectable()
export class AuthService {
    constructor(private readonly supabaseService: SupabaseService) {}

    async login(LoginDto: LoginDto) {
        const supabase = this.supabaseService.createClient();

        const { data, error } = await supabase.auth.signInWithPassword({
            email: LoginDto.email,
            password: LoginDto.password,
        });

        if (error || !data.session) {
            throw new UnauthorizedException('Invalid email or password');
        }

        return { 
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
            expiresIn: data.session.expires_in,
            user: {
                id: data.user.id,
                email: data.user.email,
            },
        }
    }

    /**
     * Verifies a Supabase Access Token and returns the associated user information.
     * @param accessToken The Supabase Access Token to verify.
     * @returns An object containing the user's ID and email.
     * @throws UnauthorizedException if the token is invalid or expired. 
     */

    async getUser(accessToken: string) {
        const supabase = this.supabaseService.createClient();

        const { data, error } = await supabase.auth.getUser(accessToken);

        if (error || !data.user) {
            throw new UnauthorizedException('Invalid or expired access token');
        }

        return {
            id: data.user.id,
            email: data.user.email,
        }
    }
}
