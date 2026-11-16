import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListNotificationsDto } from './dto/list-notifications.dto.js';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(recipientUserId: string, query: ListNotificationsDto) {
    const now = new Date();
    const where: Prisma.NotificationWhereInput = {
      recipientUserId,
      ...this.unexpired(now),
      notificationType: query.type,
      isRead: query.status === undefined ? undefined : query.status === 'read',
    };
    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async unreadCount(recipientUserId: string) {
    const count = await this.prisma.notification.count({
      where: { recipientUserId, isRead: false, ...this.unexpired(new Date()) },
    });
    return { count };
  }

  async markRead(recipientUserId: string, notificationId: string) {
    const now = new Date();
    const where: Prisma.NotificationWhereInput = {
      id: notificationId,
      recipientUserId,
      ...this.unexpired(now),
    };
    const existing = await this.prisma.notification.findFirst({ where });
    if (!existing) throw new NotFoundException('Notification not found');
    if (!existing.isRead) {
      await this.prisma.notification.updateMany({
        where: { ...where, isRead: false },
        data: { isRead: true, readAt: now },
      });
    }
    const notification = await this.prisma.notification.findFirst({ where });
    if (!notification) throw new NotFoundException('Notification not found');
    return notification;
  }

  async markAllRead(recipientUserId: string) {
    const now = new Date();
    const result = await this.prisma.notification.updateMany({
      where: {
        recipientUserId,
        isRead: false,
        createdAt: { lte: now },
        ...this.unexpired(now),
      },
      data: { isRead: true, readAt: now },
    });
    return { updatedCount: result.count };
  }

  private unexpired(now: Date): Prisma.NotificationWhereInput {
    return { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  }
}
