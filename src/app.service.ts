// [Contenido del archivo: lavenderedit/drm-patreon-backend/drm-patreon-backend-1c7d7cdf75688d95935285c32e2f6cc9de3deec5/src/app.service.ts]
import { Injectable } from '@nestjs/common';

// --- ⬇️ NUEVA INTERFAZ AÑADIDA ⬇️ ---
// Interfaz para los datos que mostraremos en la página de éxito
export interface AuthSuccessData {
  fullName: string;
  tierTitle: string;
  sessionToken: string;
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

  // --- ⬇️ NUEVA FUNCIÓN AÑADIDA ⬇️ ---

  getAuthSuccessHtml(data: AuthSuccessData): string {
    // Sanitizamos los datos para mostrarlos en HTML de forma segura
    const safeName = data.fullName
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const safeTier = data.tierTitle
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const safeToken = data.sessionToken
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
        <p>Hola, <strong>${safeName}</strong>. Hemos verificado tu cuenta correctamente.</p>
        
        <div style="background-color: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 20px; max-width: 600px; margin: 20px auto; color: #333; text-align: left;">
          <p><strong>Nivel de Mecenas Validado:</strong> ${safeTier}</p>
          <p><strong>Estado:</strong> Activo</p>
          <hr style="border: 0; border-top: 1px solid #eee;">
          <p style="font-size: 0.9em; color: #777;">
            Token de sesión (para uso del cliente):
          </p>
          <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 4px; word-wrap: break-word; white-space: pre-wrap;">${safeToken}</pre>
        </div>

        <p style="font-size: 0.9em; color: #777;">
          Puedes copiar el token si es necesario, o simplemente cerrar esta ventana y volver a la aplicación.
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
