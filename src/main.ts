import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import fastifyCookie from '@fastify/cookie';
import { ConfigService } from '@nestjs/config';

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

  // --- INICIO DE LA CORRECCIÓN ---

  // 1. Obtener el puerto de las variables de entorno (Render lo provee en 'PORT')
  const port = configService.get<number>('PORT') || 3000;

  // 2. Escuchar en '0.0.0.0' para aceptar conexiones externas
  await app.listen(port, '0.0.0.0');

  // 3. (Opcional pero recomendado) Actualizar el log
  console.log(`Aplicación corriendo en http://0.0.0.0:${port}`);
}
bootstrap();
