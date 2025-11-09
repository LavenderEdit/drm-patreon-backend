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
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>License API</title>
      </head>
      <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background-color: #f9f9f9; color: #333;">
        <h1>🎮 Patreon License Server</h1>
        <p>This is the backend for the real-time DRM system by Studios TKOH.</p>
        <p>Server is running correctly.</p>
        <hr style="width: 50%; border: 0; border-top: 1px solid #eee;">
        <footer style="font-size: 0.8em; color: #777;">
          <p>Developed with 💙 by Studios TKOH</p>
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
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Access Authorized!</title>
      </head>
      <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background-color: #f8fcf8; color: #333;">
        
        <h1 style="color: #5cb85c;">✅ Authentication Successful!</h1>
        <p>Hello, <strong>${safeName}</strong>.</p>
        
        <div style="background-color: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 20px; max-width: 600px; margin: 20px auto; color: #333; text-align: left;">
          <p>We have verified your patron status:</p>
          <h3 style="text-align: center; margin: 10px 0;">${safeTier}</h3>
          <p style="text-align: center; font-size: 0.9em; color: #777;">Status: Active</p>
        </div>

        <p style="font-size: 0.9em; color: #777;">
          You can now close this window and return to the game.
        </p>
        
        <hr style="width: 50%; border: 0; border-top: 1px solid #eee; margin-top: 30px;">
        <footer style="font-size: 0.8em; color: #777;">
          <p>Developed with 💙 by Studios TKOH</p>
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
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Access Denied</title>
      </head>
      <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background-color: #fcf8f8; color: #333;">
        <h1 style="color: #d9534f;">❌ Access Denied</h1>
        <p>Your authentication request could not be completed.</p>
        
        <p style="background-color: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 20px; max-width: 600px; margin: 20px auto; color: #b94a48;">
          <strong>Error:</strong> ${safeMessage}
        </p>

        <p style="font-size: 0.9em; color: #777;">
          Please ensure you are an active patron with the required tier.
          <br>
          If you believe this is an error, please contact technical support.
        </p>
        
        <hr style="width: 50%; border: 0; border-top: 1px solid #eee; margin-top: 30px;">
        <footer style="font-size: 0.8em; color: #777;">
          <p>Developed with 💙 by Studios TKOH</p>
        </footer>
      </body>
      </html>
    `;
  }
}