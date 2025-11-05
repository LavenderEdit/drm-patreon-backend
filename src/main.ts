import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import fastifyCookie from '@fastify/cookie';
import { ConfigService } from '@nestjs/config';
import fastifyStatic from '@fastify/static';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  const configService = app.get(ConfigService);
  const cookieSecret = configService.get<string>('COOKIE_SECRET');

  // --- 4. Verificación de seguridad ---
  if (!cookieSecret) {
    throw new Error('COOKIE_SECRET no está definida en el archivo .env');
  }

  // 5. Registramos el plugin CON EL SECRETO REAL
  await app.register(fastifyCookie, {
    secret: cookieSecret,
  });

  await app.register(fastifyStatic, {
    root: join(__dirname, 'public'),
    prefix: '/',
  });

  const port = configService.get<number>('PORT') || 3000;

  await app.listen(port, '0.0.0.0');
}
bootstrap();
