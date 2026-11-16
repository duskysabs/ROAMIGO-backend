import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { NotificationType } from '../../src/generated/prisma/enums.js';
import { NotificationsService } from '../../src/notifications/notifications.service.js';

describe('NotificationsService', () => {
  it('lists only the recipient’s live notifications with bounded pagination and filters', async () => {
    const prisma = {
      notification: {
        findMany: vi.fn().mockResolvedValue([{ id: 'one' }]),
        count: vi.fn().mockResolvedValue(21),
      },
    };
    const service = new NotificationsService(prisma as never);

    await expect(
      service.list('recipient', {
        page: 2,
        limit: 10,
        type: NotificationType.BOOKING,
        status: 'unread',
      }),
    ).resolves.toEqual({
      data: [{ id: 'one' }],
      meta: { page: 2, limit: 10, total: 21, totalPages: 3 },
    });
    const where = prisma.notification.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      recipientUserId: 'recipient',
      notificationType: NotificationType.BOOKING,
      isRead: false,
      OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
    });
    expect(prisma.notification.count).toHaveBeenCalledWith({ where });
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('counts only live unread notifications for the recipient', async () => {
    const prisma = { notification: { count: vi.fn().mockResolvedValue(3) } };
    const service = new NotificationsService(prisma as never);
    await expect(service.unreadCount('recipient')).resolves.toEqual({
      count: 3,
    });
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: {
        recipientUserId: 'recipient',
        isRead: false,
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
    });
  });

  it('returns 404 for a missing, expired, or foreign notification without updating', async () => {
    const prisma = {
      notification: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn(),
      },
    };
    const service = new NotificationsService(prisma as never);
    await expect(
      service.markRead('recipient', 'notification'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.notification.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'notification',
        recipientUserId: 'recipient',
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      }),
    });
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });

  it('marks one unread notification and preserves the original read time on retry', async () => {
    const updated = {
      id: 'notification',
      isRead: true,
      readAt: new Date('2026-11-16T00:00:00Z'),
    };
    const prisma = {
      notification: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: 'notification', isRead: false })
          .mockResolvedValueOnce(updated)
          .mockResolvedValueOnce(updated)
          .mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new NotificationsService(prisma as never);

    await expect(
      service.markRead('recipient', 'notification'),
    ).resolves.toEqual(updated);
    await expect(
      service.markRead('recipient', 'notification'),
    ).resolves.toEqual(updated);
    expect(prisma.notification.updateMany).toHaveBeenCalledOnce();
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'notification',
        recipientUserId: 'recipient',
        isRead: false,
      }),
      data: { isRead: true, readAt: expect.any(Date) },
    });
  });

  it('marks only the recipient’s existing live unread notifications', async () => {
    const prisma = {
      notification: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };
    const service = new NotificationsService(prisma as never);
    await expect(service.markAllRead('recipient')).resolves.toEqual({
      updatedCount: 2,
    });
    const { where, data } = prisma.notification.updateMany.mock.calls[0][0];
    expect(where).toEqual({
      recipientUserId: 'recipient',
      isRead: false,
      createdAt: { lte: expect.any(Date) },
      OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
    });
    expect(where.createdAt.lte).toBe(data.readAt);
  });
});
