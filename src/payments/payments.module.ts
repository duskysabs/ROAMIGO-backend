import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AssignmentsModule } from '../assignments/assignments.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({ imports: [AuthModule, PrismaModule, AssignmentsModule], controllers: [PaymentsController], providers: [PaymentsService] })
export class PaymentsModule {}
