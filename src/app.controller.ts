import { Controller, Get, Res } from '@nestjs/common';
import { AppService } from './app.service';
import type { FastifyReply } from 'fastify';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get()
  getHome(@Res() reply: FastifyReply) {
    const html = this.appService.getWelcomeHtml();

    reply.type('text/html; charset=utf-8').send(html);
  }
}