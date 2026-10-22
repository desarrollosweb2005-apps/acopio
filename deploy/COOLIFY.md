# Acopio en Coolify

[Coolify](https://coolify.io) es un panel gratuito para desplegar aplicaciones con Docker en tu propio servidor: HTTPS automático, despliegue desde GitHub, registros, copias de seguridad y servicios de un clic (como Nextcloud).

> **Antes de empezar**, protege el servidor: [SEGURIDAD.md](SEGURIDAD.md).
> Los nombres de los botones pueden variar un poco según la versión de Coolify.

## 1. Dominios

En tu proveedor de DNS, crea registros **A** apuntando a la IP del VPS:

- `panel.tudominio.com` → panel de Coolify
- `acopio.tudominio.com` → Acopio
- (más adelante) `nube.tudominio.com` → Nextcloud

## 2. Instalar Coolify

En el VPS (Ubuntu), por SSH:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

Al terminar, abre `http://IP-DEL-VPS:8000` y **crea enseguida la cuenta de administrador** (el primero que entra se queda como dueño). Luego:

1. **Settings** → *Instance Domain*: `https://panel.tudominio.com`. Guarda y entra ya por esa dirección.
2. Tu perfil → activa **2FA**.
3. Cierra el puerto **8000** en el cortafuegos del proveedor.

## 3. Conectar GitHub

El repositorio es privado, así que Coolify necesita permiso para leerlo:

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

## Nextcloud en el mismo servidor

**+ New** → **Services** → busca **Nextcloud** → dominio `https://nube.tudominio.com` → **Deploy**. Coolify crea su base de datos y el almacenamiento persistente. Luego, en Nextcloud, activa 2FA para las cuentas y deja activada la protección contra fuerza bruta (viene por defecto).
