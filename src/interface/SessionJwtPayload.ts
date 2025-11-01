// Tipo para el payload de nuestro JWT de sesión
export interface SessionJwtPayload {
  sub: string; // El ID de usuario de Patreon
  game_level: string; // El nivel de juego (ej. 'Intro', 'Full')
}
