import { NestFactory } from '@nestjs/core';
// import { AppModule, ObserveInstrument } from './app.module.js'; UNCOMMENT WHEN WE ADD BACK OBSERVE MONITORING TOOL
import { AppModule } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';

const PORT = process.env.PORT ?? 3000;

async function bootstrap() {

  // const app = await NestFactory.create(AppModule, {
  //   instrument: ObserveInstrument,
  // }); UNCOMMENT WHEN WE ADD BACK OBSERVE MONITORING TOOL

  const app = await NestFactory.create(AppModule)
  
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  )
  console.log(`Server is running on port ${PORT} http://localhost:${PORT}`);
  await app.listen(PORT);
}
await bootstrap();
