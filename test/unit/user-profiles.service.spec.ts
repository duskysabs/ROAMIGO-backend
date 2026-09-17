import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { UserProfilesService } from '../../src/user-profiles/user-profiles.service.js';

describe('UserProfilesService', () => {
  let userProfilesService: UserProfilesService;

  const findUnique = vi.fn();

  const mockPrismaService = {
    userProfile: {
      findUnique,
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
});