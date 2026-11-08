import type { Prisma } from '../generated/prisma/client.js';
import { AccountStatus, AssignmentStatus, DriverStatus, EmploymentStatus, MaintenanceStatus, UserRole, VehicleStatus } from '../generated/prisma/enums.js';

export type AllocationInterval = {
  vehicleTypeId: string;
  passengerCount: number;
  startDatetime: Date;
  endDatetime: Date;
};

export const ACTIVE_ASSIGNMENTS = [AssignmentStatus.RESERVED, AssignmentStatus.ASSIGNED, AssignmentStatus.ACKNOWLEDGED];

export function eligiblePairsWhere(interval: AllocationInterval, excludeAssignmentId?: string): Prisma.VehicleWhereInput {
  const overlap: Prisma.BookingAssignmentWhereInput = {
    ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
    assignmentStatus: { in: ACTIVE_ASSIGNMENTS },
    reservedFrom: { lt: interval.endDatetime }, reservedUntil: { gt: interval.startDatetime },
  };
  const lastDay = new Date(Date.UTC(interval.endDatetime.getUTCFullYear(), interval.endDatetime.getUTCMonth(), interval.endDatetime.getUTCDate()));
  return {
    vehicleTypeId: interval.vehicleTypeId, passengerCapacity: { gte: interval.passengerCount },
    isDeleted: false, vehicleStatus: VehicleStatus.AVAILABLE,
    resourceHolds: { none: { releasedAt: null } },
    assignments: { none: overlap },
    maintenanceRecords: { none: { OR: [
      { maintenanceStatus: MaintenanceStatus.IN_PROGRESS },
      { maintenanceStatus: MaintenanceStatus.SCHEDULED, scheduledDate: { lte: lastDay } },
    ] } },
    assignedDriver: { is: {
      driverStatus: DriverStatus.AVAILABLE, licenseExpiry: { gte: lastDay },
      staff: { is: { employmentStatus: EmploymentStatus.ACTIVE, user: { is: { accountStatus: AccountStatus.ACTIVE, role: { in: [UserRole.STAFF, UserRole.DRIVER] } } } } },
      resourceHolds: { none: { releasedAt: null } },
      assignments: { none: overlap },
    } },
  };
}
