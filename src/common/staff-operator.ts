import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { AccountStatus, EmploymentStatus, UserRole } from '../generated/prisma/enums.js';

export async function requireStaffOperator(tx: Prisma.TransactionClient, actorUserId: string) {
  await tx.$queryRaw`SELECT user_id FROM public.user_profile WHERE user_id = ${actorUserId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT staff_id FROM public.staff WHERE user_id = ${actorUserId}::uuid FOR UPDATE`;
  const actor = await tx.userProfile.findUnique({
    where: { userId: actorUserId }, include: { staff: { include: { driver: true } } },
  });
  if (!actor || actor.accountStatus !== AccountStatus.ACTIVE || actor.staff?.driver ||
      (actor.role !== UserRole.ADMIN &&
       !(actor.role === UserRole.STAFF && actor.staff?.employmentStatus === EmploymentStatus.ACTIVE))) {
    throw new ForbiddenException('An active non-driver Administrator or Staff operator is required');
  }
  return actor;
}
