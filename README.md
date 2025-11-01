<p align="center">
  <a href="https://studios-tkoh.azurewebsites.net/" target="_blank">
    <img src="https://drive.google.com/uc?export=view&id=1TuT30CiBkinh85WuTvjKGKN47hCyCS0Z" width="300" alt="Studios TKOH Logo">
  </a>
</p>

<h1 align="center">🎮 Servidor de Licencias Patreon</h1>
<h3 align="center">Sistema DRM en tiempo real con NestJS, Fastify y WebSockets</h3>

---

## 🧠 Descripción General

**Servidor de Licencias Patreon** es el backend oficial desarrollado por **Studios TKOH**, diseñado para gestionar licencias y validar suscripciones de usuarios de Patreon de manera **segura, automática y en tiempo real**.  
Está optimizado para integrarse con **clientes de juegos (como GDevelop)**, usando una arquitectura robusta basada en **3 flujos principales**.

---

## 🏗️ Arquitectura de Flujos

### 🔹 **Flujo 1 — Autenticación OAuth 2.0 (HTTP)**

- Gestiona el **inicio de sesión con Patreon**.
- Verifica el estado del usuario (`patron_status`) y sus niveles de membresía (`tiers`).
- Genera un **JWT de corta duración (60s)** para iniciar la sesión WebSocket.

---

### 🔹 **Flujo 2 — Sesión Persistente (WebSocket)**

- Usa un middleware `WsAuthMiddleware` para **autenticar el handshake** del socket mediante el JWT.
- Rechaza conexiones no autenticadas → evita ataques de recursos.
- Implementa **anti-compartición de sesiones**:  
  ➜ Solo **una sesión activa** por usuario Patreon.

---

### 🔹 **Flujo 3 — Verificación en Segundo Plano (Cron Job)**

- Ejecuta cada **15 minutos** una verificación del estado de todas las conexiones activas.
- Usa el **Creator’s Access Token** para consultar la API de Patreon.
- Desconecta automáticamente a usuarios con suscripción **inactiva o caducada**.
- Refresca automáticamente el **Creator’s Access Token** para prevenir errores a largo plazo.

---

## ⚙️ Puesta en Marcha

### 1️⃣ Instalación

```bash
npm install
````

---

### 2️⃣ Configuración de Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto y copia el siguiente contenido:

```ini
# --- Configuración del Servidor ---
PORT=3000
COOKIE_SECRET=tu-secreto-muy-largo-y-aleatorio-para-cookies

# --- Flujo 1: Autenticación de Usuario (OAuth) ---
PATREON_CLIENT_ID=...tu_client_id_de_patreon...
PATREON_CLIENT_SECRET=...tu_client_secret_de_patreon...
PATREON_REDIRECT_URI=http://localhost:3000/auth/patreon/callback
PATREON_REQUIRED_TIER_IDS=123456,789012

# --- Flujo 2: Sesión de WebSocket (JWT) ---
JWT_SECRET=tu-secreto-muy-largo-y-aleatorio-para-jwt
JWT_WEBSOCKET_EXPIRATION_TIME=60

# --- Flujo 3: Verificación de Creador (Cron Job) ---
PATREON_CREATOR_ACCESS_TOKEN=...tu_creator_access_token...
PATREON_CREATOR_REFRESH_TOKEN=...tu_creator_refresh_token...

# --- Cliente (GDevelop) ---
CLIENT_ERROR_URL=my-game://auth?error=true
```

📘 *Puedes obtener los valores necesarios desde tu [portal de desarrollador de Patreon](https://www.patreon.com/portal/registration/register-clients).*

---

### 3️⃣ Ejecución del Servidor

```bash
# Modo desarrollo (recarga automática)
npm run start:dev

# Modo producción
npm run build
npm run start:prod
```

---

## 🔌 Contrato de API WebSocket

**URL de conexión:**

```
ws://localhost:3000
```

### 🧩 Handshake de Conexión (Payload `auth`)

El cliente debe enviar su JWT (del Flujo 1) al iniciar la conexión:

```json
{
  "auth": {
    "token": "ey... (el_jwt_de_60_segundos)"
  }
}
```

---

### 📡 Eventos del Servidor → Cliente

#### ✅ `'authorization'`

**Descripción:** conexión exitosa.
**Payload:**

```json
{ "status": "authorized", "access": "TituloDelTier" }
```

---

#### ❌ `'error'`

**Descripción:** sesión terminada o inválida.
**Códigos posibles:**

| Código | Mensaje                                       | Causa                                            |
| :----: | :-------------------------------------------- | :----------------------------------------------- |
| `4001` | `"New session initiated"`                     | Se detectó otra sesión activa del mismo usuario. |
| `4002` | `"Subscription expired or no longer active."` | La suscripción del usuario ha expirado.          |

---

## 🧩 Tecnologías Utilizadas

| Categoría     | Tecnologías                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------- |
| Backend       | [NestJS](https://nestjs.com/), [Fastify](https://fastify.io/), [Socket.IO](https://socket.io/) |
| Autenticación | OAuth 2.0 (Patreon API), JWT                                                                   |
| Gestión       | Cron Jobs, Refresh Tokens                                                                      |
| Seguridad     | CSRF Cookies, Anti-session Sharing, Token Rotation                                             |

---

## 🧪 Integración con GDevelop

El cliente del juego (hecho en GDevelop) puede conectarse directamente al servidor usando **eventos de red (GET/POST)** y **WebSocket**, permitiendo:

* Validar licencias activas antes de iniciar el juego.
* Recibir actualizaciones en tiempo real si una suscripción expira.
* Implementar lógicas premium / paywall basadas en tiers de Patreon.

---

## 🧰 Futuras Mejoras

* [ ] Panel de administración para visualizar usuarios conectados en tiempo real.
* [ ] Implementar sistema de cache con Redis.
* [ ] Logs estructurados con Winston o Pino.
* [ ] Integración opcional con Discord OAuth.

---

<p align="center">
  <sub>🛠️ Desarrollado con 💙 por <strong>Studios TKOH</strong></sub><br>
  <a href="https://studios-tkoh.azurewebsites.net/" target="_blank">🌐 studios-tkoh.azurewebsites.net</a>
</p>
