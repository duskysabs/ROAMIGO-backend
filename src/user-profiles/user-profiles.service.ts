import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

@Injectable()
export class UserProfilesService {
    constructor(private readonly prisma: PrismaService) {}

    findByUserId(userId: string) {
        return this.prisma.userProfile.findUnique({
            where: {
                userId,
            }
        });
    }

    findAll(){
        return this.prisma.userProfile.findMany({
            orderBy: {
                createdAt: 'desc',
            },
        });
    }

    async updateProfile(userId: string, dto: UpdateProfileDto){
        const existingProfile = await this.findByUserId(userId);

        if (!existingProfile) {
            throw new NotFoundException('Profile not found');
        }

        return this.prisma.userProfile.update({
            where: {
                userId,
            },
            data: {
                firstName: dto.firstName,
                lastName: dto.lastName,
                birthDate:
                    dto.birthDate === undefined 
                    ? undefined
                    : dto.birthDate === null
                        ? null
                        : new Date(dto.birthDate),
                homeAddress: dto.homeAddress,
            },
        });
    }
}
