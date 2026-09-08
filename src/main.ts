import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';

const PORT = process.env.PORT ?? 3000;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  console.log(`Server is running on port ${PORT} http://localhost:${PORT}`);
  await app.listen(PORT);
}
await bootstrap();
