import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { CompleteProfileDto } from './dto/complete-profile.dto.js';
import {
  AccountStatus,
  UserRole,
} from '../generated/prisma/enums.js';

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

    async completeCustomerProfile(userId: string, dto: CompleteProfileDto) {
        const existingProfile = await this.findByUserId(userId);

        if (existingProfile) {
            throw new ConflictException('Profile already exists');
        }

        return this.prisma.userProfile.create({
            data: {
                userId,
                firstName: dto.firstName,
                lastName: dto.lastName,
                birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
                homeAddress: dto.homeAddress,
                role: UserRole.CUSTOMER,
                accountStatus: AccountStatus.ACTIVE,
                customer: {
                    create: {},
                },
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
