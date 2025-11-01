import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { PatreonApiModule } from './patreon-api/patreon-api.module';

@Module({
  imports: [AuthModule, PatreonApiModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
