import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { UserRole } from '../generated/prisma/enums.js';
import { requireStaffOperator } from './staff-operator.js';

export async function requireMasterDataAdmin(tx: Prisma.TransactionClient, actorUserId: string) {
  const actor = await requireStaffOperator(tx, actorUserId);
  if (actor.role !== UserRole.ADMIN) throw new ForbiddenException('Administrator access is required');
  return actor;
}

export async function auditMasterData(tx: Prisma.TransactionClient, actorUserId: string, recordType: string,
  recordId: string, action: string, before: unknown, after: unknown) {
  // Snapshots are restricted to master-data records, never Auth or provider payloads.
  const snapshot = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  await tx.masterDataAudit.create({ data: {
    actorUserId, actorRole: UserRole.ADMIN, recordType, recordId, action,
    reason: `Administrator requested ${action.toLowerCase().replaceAll('_', ' ')}`,
    before: before === null ? Prisma.DbNull : snapshot(before), after: snapshot(after),
  } });
}
