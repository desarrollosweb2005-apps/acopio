# Acopio en tu propio servidor (Docker Compose)

> ¿Usas **Coolify**? Sigue mejor [COOLIFY.md](COOLIFY.md). Y antes de nada: [SEGURIDAD.md](SEGURIDAD.md).

Acopio corre en Docker en tu servidor; los datos (usuarios, links, colecciones) siguen en **Supabase en la nube** y los archivos irán al **Nextcloud** de cada usuario.

```
Usuarios ──HTTPS──► Caddy ──► Acopio (Docker) ──► Supabase (nube)
                                       └────────► Nextcloud (archivos)
```

## Requisitos

- Un servidor Linux con **Docker** y **Docker Compose** (`docker compose version` debe responder).
- Un dominio o subdominio (por ejemplo `acopio.tudominio.com`) con un registro **A** apuntando a la IP del servidor.
- Puertos **80** y **443** abiertos (Caddy pide el certificado HTTPS solo).
- Recomendado para empezar: 2–4 vCPU y 4–8 GB de RAM (Acopio solo usa unos 200 MB; el resto es margen).

## Instalación

```bash
git clone https://github.com/desarrollosweb2005-apps/acopio.git
cd acopio
cp .env.example .env
nano .env        # rellena los valores (abajo)
docker compose up -d --build
```

En el `.env`:

| Variable | Valor |
|---|---|
| `ACOPIO_DOMAIN` | El dominio, por ejemplo `acopio.tudominio.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | Igual que en Vercel |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Igual que en Vercel |
| `ALLOWED_EMAIL` | Tu email (mientras Acopio sea solo para ti) |
| `GROQ_API_KEY` | Igual que en Vercel |
| `YOUTUBE_API_KEY` | Igual que en Vercel |

La primera vez tarda unos minutos en compilar. Después abre `https://acopio.tudominio.com`.

## Actualizar

```bash
cd acopio
git pull
docker compose up -d --build
```

## Si el servidor ya tiene un proxy (Nginx, Apache, el de Nextcloud…)

Caddy necesita los puertos 80 y 443. Si ya los usa otro programa:

1. En `docker-compose.yml`, borra el servicio `caddy` (y su bloque de `volumes`).
2. Apunta tu proxy a `http://127.0.0.1:3000` para el dominio de Acopio. Ejemplo con Nginx:

```nginx
server {
    server_name acopio.tudominio.com;
    client_max_body_size 60m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    # listen 443 ssl; + certificados (Certbot, etc.)
}
```

## Al cambiar de Vercel al servidor

- **Extensión**: en sus Opciones, cambia la dirección a `https://acopio.tudominio.com` (pedirá permiso para ese dominio).
- **Botón «+ Acopio»** de favoritos: vuelve a arrastrarlo desde la nueva dirección.
- **Móvil**: instala la app de nuevo desde la nueva dirección.
- Los datos no se mueven: siguen en el mismo Supabase.

## Comandos útiles

```bash
docker compose ps              # estado
docker compose logs -f acopio  # registros de la app
docker compose restart acopio  # reiniciar
```
