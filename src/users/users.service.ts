import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: {
        userId,
      },
    });

    if (!profile) {
      throw new NotFoundException('User profile not found');
    }

    return profile;
  }

  async updateProfile(userId: string, data: UpdateUserDto) {
    await this.getProfile(userId);

    return this.prisma.userProfile.update({
      where: {
        userId,
      },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        birthDate:
          data.birthDate === undefined
            ? undefined
            : data.birthDate === null
              ? null
              : new Date(data.birthDate),
        homeAddress: data.homeAddress,
      },
    });
  }
}
