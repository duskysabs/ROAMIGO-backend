import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import type { UserRole } from '../../generated/prisma/enums.js';
import { ROLES_KEY } from '../constants/roles.constants.js';
import { RolesGuard } from '../guards/roles.guard.js';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard.js';

export const Roles = (...roles: UserRole[]) =>
  applyDecorators(
    SetMetadata(ROLES_KEY, roles),
    UseGuards(SupabaseAuthGuard, RolesGuard),
  );
