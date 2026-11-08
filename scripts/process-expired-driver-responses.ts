import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DriverModule } from '../src/driver/driver.module.js';
import { DriverService } from '../src/driver/driver.service.js';

const context = await NestFactory.createApplicationContext(DriverModule, { logger: ['error', 'warn'] });
try {
  const result = await context.get(DriverService).processExpired(undefined, 100);
  console.log(JSON.stringify({ processed: result.processed }));
} finally {
  await context.close();
}
