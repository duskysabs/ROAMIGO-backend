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
        // Public completion never accepts a caller-controlled role or account
        // status. Privileged profiles use the restricted bootstrap process.
        const existingProfile = await this.findByUserId(userId);

        if (existingProfile) {
            throw new ConflictException('Profile already exists');
        }

        try {
            return await this.prisma.userProfile.create({
                data: {
                    userId,
                    firstName: dto.firstName,
                    lastName: dto.lastName,
                    phoneNumber: dto.phoneNumber,
                    birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
                    homeAddress: dto.homeAddress,
                    role: UserRole.CUSTOMER,
                    accountStatus: AccountStatus.ACTIVE,
                    customer: {
                        create: {},
                    },
                },
            });
        } catch (error) {
            if (
                typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                error.code === 'P2002'
            ) {
                throw new ConflictException('Profile already exists');
            }

            throw error;
        }
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
                phoneNumber: dto.phoneNumber,
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
