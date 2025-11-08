import { Injectable } from '@nestjs/common';

export interface AuthSuccessData {
  fullName: string;
  tierTitle: string;
}

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

  getAuthSuccessHtml(data: AuthSuccessData): string {
    const safeName = data.fullName
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const safeTier = data.tierTitle
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>¡Acceso Autorizado!</title>
      </head>
      <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background-color: #f8fcf8; color: #333;">
        
        <h1 style="color: #5cb85c;">✅ ¡Autenticación Exitosa!</h1>
        <p>Hola, <strong>${safeName}</strong>.</p>
        
        <div style="background-color: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 20px; max-width: 600px; margin: 20px auto; color: #333; text-align: left;">
          <p>Hemos verificado tu estado de mecenas:</p>
          <h3 style="text-align: center; margin: 10px 0;">${safeTier}</h3>
          <p style="text-align: center; font-size: 0.9em; color: #777;">Estado: Activo</p>
        </div>

        <p style="font-size: 0.9em; color: #777;">
          Puedes cerrar esta pagina y volver al juego.
        </p>
        
        <hr style="width: 50%; border: 0; border-top: 1px solid #eee; margin-top: 30px;">
        <footer style="font-size: 0.8em; color: #777;">
          <p>Desarrollado con 💙 por Studios TKOH</p>
        </footer>
      </body>
      </html>
    `;
  }

  getAuthErrorHtml(errorMessage: string): string {
    const safeMessage = errorMessage
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Acceso Denegado</title>
      </head>
      <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background-color: #fcf8f8; color: #333;">
        <h1 style="color: #d9534f;">❌ Acceso Denegado</h1>
        <p>No se pudo completar tu solicitud de autenticación.</p>
        
        <p style="background-color: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 20px; max-width: 600px; margin: 20px auto; color: #b94a48;">
          <strong>Error:</strong> ${safeMessage}
        </p>

        <p style="font-size: 0.9em; color: #777;">
          Asegúrate de ser un mecenas activo con el nivel (tier) requerido.
          <br>
          Si crees que esto es un error, por favor contacta a soporte técnico.
        </p>
        
        <hr style="width: 50%; border: 0; border-top: 1px solid #eee; margin-top: 30px;">
        <footer style="font-size: 0.8em; color: #777;">
          <p>Desarrollado con 💙 por Studios TKOH</p>
        </footer>
      </body>
      </html>
    `;
  }
}
