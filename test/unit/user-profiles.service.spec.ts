import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { UserProfilesService } from '../../src/user-profiles/user-profiles.service.js';
import {
  AccountStatus,
  UserRole,
} from '../../src/generated/prisma/enums.js';

describe('UserProfilesService', () => {
  let userProfilesService: UserProfilesService;

  const findUnique = vi.fn();
  const create = vi.fn();

  const mockPrismaService = {
    userProfile: {
      findUnique,
      create,
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserProfilesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    userProfilesService = module.get<UserProfilesService>(
      UserProfilesService,
    );
  });

  it('returns the profile matching the user ID', async () => {
    const mockProfile = {
      userId: 'fake-user-id',
      firstName: 'Test',
      lastName: 'User',
      phoneNumber: '+639171234567',
      birthDate: null,
      homeAddress: null,
      role: 'CUSTOMER',
      accountStatus: 'ACTIVE',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    };

    findUnique.mockResolvedValue(mockProfile);

    const result =
      await userProfilesService.findByUserId('fake-user-id');

    expect(findUnique).toHaveBeenCalledWith({
      where: {
        userId: 'fake-user-id',
      },
    });

    expect(result).toEqual(mockProfile);
  });

  it('returns null when the user has no profile', async () => {
    findUnique.mockResolvedValue(null);

    const result =
      await userProfilesService.findByUserId('missing-user-id');

    expect(findUnique).toHaveBeenCalledWith({
      where: {
        userId: 'missing-user-id',
      },
    });

    expect(result).toBeNull();
  });

  it('creates an active customer profile for a token-authenticated user', async () => {
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({ userId: 'customer-id' });

    await expect(
      userProfilesService.completeCustomerProfile('customer-id', {
        firstName: 'Customer',
        lastName: 'Demo',
        phoneNumber: '+639171234567',
        birthDate: '2000-01-02',
        homeAddress: 'Demo address',
      }),
    ).resolves.toEqual({ userId: 'customer-id' });

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: 'customer-id',
        firstName: 'Customer',
        lastName: 'Demo',
        phoneNumber: '+639171234567',
        birthDate: new Date('2000-01-02'),
        homeAddress: 'Demo address',
        role: UserRole.CUSTOMER,
        accountStatus: AccountStatus.ACTIVE,
        customer: { create: {} },
      },
    });
  });

  it('does not replace an existing profile during completion', async () => {
    findUnique.mockResolvedValue({ userId: 'customer-id' });

    await expect(
      userProfilesService.completeCustomerProfile('customer-id', {
        firstName: 'Customer',
        lastName: 'Demo',
        phoneNumber: '+639171234567',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(create).not.toHaveBeenCalled();
  });

  it('returns a conflict when simultaneous completion creates a duplicate', async () => {
    findUnique.mockResolvedValue(null);
    create.mockRejectedValue({ code: 'P2002' });

    await expect(
      userProfilesService.completeCustomerProfile('customer-id', {
        firstName: 'Customer',
        lastName: 'Demo',
        phoneNumber: '+639171234567',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
