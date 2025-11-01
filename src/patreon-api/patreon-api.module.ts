import { Module } from '@nestjs/common';
import { PatreonApiService } from './patreon-api.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [PatreonApiService],
  exports: [PatreonApiService]
})
export class PatreonApiModule {}
