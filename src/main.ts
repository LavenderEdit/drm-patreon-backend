import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import fastifyCookie from '@fastify/cookie';
import { ConfigService } from '@nestjs/config';
import { WsService } from './ws/ws.service';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  const configService = app.get(ConfigService);
  const cookieSecret = configService.get<string>('COOKIE_SECRET');

  if (!cookieSecret) {
    throw new Error('COOKIE_SECRET no está definida en el archivo .env');
  }

  await app.register(fastifyCookie, {
    secret: cookieSecret,
  });

  const wsService = app.get(WsService);

  const server = app.getHttpAdapter().getInstance().server;

  wsService.initialize(server);

  const port = configService.get<number>('PORT') || 3000;
  await app.listen(port, '0.0.0.0');

  console.log(`Aplicación HTTP y WS corriendo en http://0.0.0.0:${port}`);
}
bootstrap();
