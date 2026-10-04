import { Module } from '@nestjs/common';
import { GeoapifyClient } from './geoapify.client.js';

@Module({ providers: [GeoapifyClient], exports: [GeoapifyClient] })
export class GeoapifyModule {}
