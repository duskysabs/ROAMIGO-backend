import { Injectable } from '@nestjs/common';
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

    updateProfile(
        userId: string,
        updateProfileDto: UpdateProfileDto,
    ) {
        const existingProfile = await this.findByUserId(userId);

        if (!existingProfile) {
            throw new Error('User profile not found');
        }

        return this.prisma.userProfile.update({
            where: {
                userId,
            },
            data: {
                firstName: updateProfileDto.firstName ?? existingProfile.firstName,
                lastName: updateProfileDto.lastName ?? existingProfile.lastName,
                birthDate: 
                 

            }
        })
}
