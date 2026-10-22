# Acopio en Coolify

[Coolify](https://coolify.io) es un panel gratuito para desplegar aplicaciones con Docker en tu propio servidor: HTTPS automático, despliegue desde GitHub, registros, copias de seguridad y servicios de un clic (como Nextcloud).

> **Antes de empezar**, en un VPS Ubuntu recién creado, ejecuta como root el script que protege el servidor **e instala Coolify**:
>
> ```bash
> curl -fsSL https://raw.githubusercontent.com/desarrollosweb2005-apps/acopio/main/deploy/preparar-servidor.sh | sudo bash
> ```
>
> Te pregunta el usuario, la zona horaria y tu llave SSH. Qué hace y por qué: [SEGURIDAD.md](SEGURIDAD.md).
> Los nombres de los botones pueden variar un poco según la versión de Coolify.

## 1. Dominios

En tu proveedor de DNS, crea registros **A** apuntando a la IP del VPS:

- `panel.tudominio.com` → panel de Coolify
- `acopio.tudominio.com` → Acopio
- (más adelante) `nube.tudominio.com` → Nextcloud

## 2. Instalar Coolify

Si usaste `preparar-servidor.sh`, Coolify ya está instalado. Si no, en el VPS:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

Al terminar, abre `http://IP-DEL-VPS:8000` y **crea enseguida la cuenta de administrador** (el primero que entra se queda como dueño). Luego:

1. **Settings** → *Instance Domain*: `https://panel.tudominio.com`. Guarda y entra ya por esa dirección.
2. Tu perfil → activa **2FA**.
3. Cierra el puerto **8000** en el cortafuegos del proveedor.

## 3. Conectar GitHub

Conecta GitHub con una GitHub App: así Coolify puede leer el repositorio (también si algún día lo haces privado) y vuelve a desplegar solo cada vez que se sube código:

**Sources** → **+ Add** → **GitHub App** → sigue el asistente e instala la app en la organización `desarrollosweb2005-apps`, dándole acceso al repositorio `acopio`.

Con la GitHub App, cada vez que se sube código a `main`, Coolify vuelve a desplegar solo.

## 4. Crear la aplicación

1. **Projects** → **+ Add** → nombre `Acopio` → entra en el entorno *production*.
2. **+ New** → **Private Repository (with GitHub App)** → elige `desarrollosweb2005-apps/acopio`, rama `main`.
3. **Build Pack**: **Dockerfile** (no Nixpacks).
4. **Ports Exposes**: `3000`.
5. **Domains**: `https://acopio.tudominio.com`.
6. **Health check** (si lo ofrece): ruta `/login`, puerto `3000`.

## 5. Variables de entorno

En la pestaña **Environment Variables** de la aplicación, añade (no hace falta marcarlas «de compilación»: Acopio las lee al arrancar):

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | La *Project URL* de Supabase (la misma que en Vercel) |
| `SUPABASE_PUBLISHABLE_KEY` | La clave publishable de Supabase (la misma que en Vercel) |
| `ALLOWED_EMAIL` | Tu email |
| `GROQ_API_KEY` | Tu clave de Groq |
| `YOUTUBE_API_KEY` | Tu clave de YouTube |

## 6. Desplegar

Pulsa **Deploy**. La primera vez tarda unos minutos (compila la app). Cuando termine, abre `https://acopio.tudominio.com` y entra con tu cuenta de siempre: los datos están en Supabase, así que verás todo lo que ya tienes.

## 7. Después del cambio

- **Extensión**: Opciones → dirección `https://acopio.tudominio.com` (pedirá permiso para ese dominio).
- **Botón «+ Acopio»**: vuelve a arrastrarlo desde la nueva dirección.
- **Móvil**: instala la app de nuevo desde la nueva dirección.
- Puedes dejar Vercel funcionando en paralelo hasta que estés seguro; usan los mismos datos.

## Otros servicios en el mismo servidor

Todos se añaden en el proyecto que quieras con **+ New**. Regla de oro: **las bases de datos nunca públicas**; solo se publican, con dominio y HTTPS, las webs que tú usas desde fuera.

| Servicio | Cómo | Dominio | Público |
|---|---|---|---|
| **Nextcloud** | **Services** → *Nextcloud* | `https://nube.tudominio.com` | Sí (con 2FA) |
| **n8n** | **Services** → *n8n* (hay variante con PostgreSQL) | `https://n8n.tudominio.com` | Sí (con usuario y contraseña fuertes) |
| **PostgreSQL** | **Databases** → *PostgreSQL* | — | **No**: deja desactivado *Make it publicly available* |
| **Redis** | **Databases** → *Redis* | — | **No** |
| **WhatsApp** (Evolution API o WAHA) | **Services** → búscalo por nombre; si no aparece: **+ New** → *Docker Image* (`atendai/evolution-api` o `devlikeapro/waha`) | `https://wa.tudominio.com` | Sí, **siempre con su API key** |

Cómo se conectan entre sí sin exponerse:

- Los servicios del mismo proyecto se ven por la **red interna de Docker** usando el nombre que Coolify muestra en la ficha de la base de datos (*Postgres URL (internal)*, *Redis URL (internal)*). Usa esas direcciones internas en n8n y en el software de WhatsApp, no la IP pública.
- **Evolution API / WAHA**: define una API key larga (variable `AUTHENTICATION_API_KEY` en Evolution, `WHATSAPP_API_KEY` en WAHA) y no dejes su panel abierto sin ella. Los números de prueba conectados quedan guardados en su base de datos: haz copia de seguridad.
- **n8n**: activa usuario y contraseña de acceso (o 2FA si tu versión lo trae) y define `N8N_ENCRYPTION_KEY` antes de guardar credenciales; si la pierdes, las credenciales guardadas no se pueden recuperar.
- **Copias de seguridad**: en cada base de datos, pestaña *Backups*, programa una copia diaria (Coolify puede enviarlas a un almacenamiento S3).

Con 16 GB de RAM y 4 CPU todo esto entra con margen: Acopio ~200 MB, Nextcloud ~0,5–1 GB, n8n ~300–500 MB, PostgreSQL y Redis unos cientos de MB, Evolution/WAHA ~300–500 MB por sesión, y Coolify ~1 GB.
