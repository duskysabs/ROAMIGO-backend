import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AssignmentsService } from './assignments.service.js';
import { AssignmentsController } from './assignments.controller.js';

@Module({ imports: [AuthModule, PrismaModule], controllers: [AssignmentsController], providers: [AssignmentsService], exports: [AssignmentsService] })
export class AssignmentsModule {}
