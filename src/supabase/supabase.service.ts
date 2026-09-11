import 'dotenv/config';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  createClient(): SupabaseClient {
    const url = process.env.SUPABASE_URL;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!url || !publishableKey) {
      throw new InternalServerErrorException(
        'Supabase environment variables are not configured',
      );
    }

    return createClient(url, publishableKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }
}