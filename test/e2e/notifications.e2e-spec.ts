import {
  ForbiddenException,
  HttpStatus,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { AuthService } from '../../src/auth/auth.service.js';
import { NotificationsService } from '../../src/notifications/notifications.service.js';

describe('Notification inbox HTTP access', () => {
  let app: INestApplication<App>;
  const getUser = vi.fn();
  const list = vi.fn();
  const unreadCount = vi.fn();
  const markRead = vi.fn();
  const markAllRead = vi.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue({ getUser })
      .overrideProvider(NotificationsService)
      .useValue({ list, unreadCount, markRead, markAllRead })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({
      id: 'customer-user',
      profile: { role: 'CUSTOMER' },
    });
  });

  afterAll(async () => app.close());

  it('requires authentication for reads and writes', async () => {
    await request(app.getHttpServer())
      .get('/notifications')
      .expect(HttpStatus.UNAUTHORIZED);
    await request(app.getHttpServer())
      .patch('/notifications/read-all')
      .expect(HttpStatus.UNAUTHORIZED);
    expect(list).not.toHaveBeenCalled();
    expect(markAllRead).not.toHaveBeenCalled();
  });

  it('uses the authenticated identity and validates list filters', async () => {
    list.mockResolvedValue({
      data: [],
      meta: { page: 2, limit: 5, total: 0, totalPages: 0 },
    });
    await request(app.getHttpServer())
      .get('/notifications?page=2&limit=5&status=unread&type=BOOKING')
      .set('Authorization', 'Bearer token')
      .expect(HttpStatus.OK);
    expect(list).toHaveBeenCalledWith(
      'customer-user',
      expect.objectContaining({
        page: 2,
        limit: 5,
        status: 'unread',
        type: 'BOOKING',
      }),
    );
    await request(app.getHttpServer())
      .get('/notifications?limit=51')
      .set('Authorization', 'Bearer token')
      .expect(HttpStatus.BAD_REQUEST);
    expect(list).toHaveBeenCalledOnce();
  });

  it('routes count and both mark-read actions to the authenticated user', async () => {
    const id = '00000000-0000-4000-8000-000000000101';
    unreadCount.mockResolvedValue({ count: 1 });
    markRead.mockResolvedValue({ id, isRead: true });
    markAllRead.mockResolvedValue({ updatedCount: 1 });
    await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .set('Authorization', 'Bearer token')
      .expect(HttpStatus.OK);
    await request(app.getHttpServer())
      .patch(`/notifications/${id}/read`)
      .set('Authorization', 'Bearer token')
      .expect(HttpStatus.OK);
    await request(app.getHttpServer())
      .patch('/notifications/read-all')
      .set('Authorization', 'Bearer token')
      .expect(HttpStatus.OK);
    expect(unreadCount).toHaveBeenCalledWith('customer-user');
    expect(markRead).toHaveBeenCalledWith('customer-user', id);
    expect(markAllRead).toHaveBeenCalledWith('customer-user');
    await request(app.getHttpServer())
      .patch('/notifications/not-a-uuid/read')
      .set('Authorization', 'Bearer token')
      .expect(HttpStatus.BAD_REQUEST);
    expect(markRead).toHaveBeenCalledOnce();
  });

  it('denies inactive accounts through the existing auth guard', async () => {
    getUser.mockRejectedValueOnce(
      new ForbiddenException('Account is inactive.'),
    );
    await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', 'Bearer inactive-token')
      .expect(HttpStatus.FORBIDDEN);
    expect(list).not.toHaveBeenCalled();
  });
});
