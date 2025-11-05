import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getWelcomeHtml(): string {
    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>API de Licencias</title>
      </head>
      <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background-color: #f9f9f9; color: #333;">
        <h1>🎮 Servidor de Licencias Patreon</h1>
        <p>Este es el backend del sistema DRM en tiempo real de Studios TKOH.</p>
        <p>El servidor está funcionando correctamente.</p>
        <hr style="width: 50%; border: 0; border-top: 1px solid #eee;">
        <footer style="font-size: 0.8em; color: #777;">
          <p>Desarrollado con 💙 por Studios TKOH</p>
        </footer>
      </body>
      </html>
    `;
  }
}