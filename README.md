# Acopio

Biblioteca personal de links, prompts y highlights. Hecha con Next.js + Supabase, instalable como app (PWA) en el ordenador y el móvil.

## Qué incluye (fase 1)

- **Colecciones anidadas** con icono, **etiquetas**, **notas** y búsqueda en títulos, notas, prompts y highlights.
- **Estado** de cada marcador: Pendiente, Visto o Aplicado. La **Cola pendiente** filtra por tiempo disponible (≤ 15 min, ≤ 30 min, ≤ 1 h) con la duración de los vídeos y el tiempo de lectura de los artículos.
- **Prompts** como tipo propio: texto con variables `{{así}}`, campos para rellenarlas y botón **Copiar prompt**.
- **Copia del contenido** al guardar: texto de la web, del post de X, la descripción del vídeo o el README del repo. Si el link muere, el texto sigue en Acopio.
- **Highlights** con color, nota y minuto del vídeo.
- **Guardar desde cualquier sitio**: botón «+ Acopio» para la barra de favoritos, menú Compartir en Android y Atajo en iPhone (instrucciones en `/herramientas`).
- **Importar de Raindrop** desde su export CSV (`/importar`).
- Vistas Cards, Lista y Compacta, recordadas por sección.

## Puesta en marcha

### 1. Supabase (base de datos y login)

1. Crea un proyecto gratis en [supabase.com](https://supabase.com).
2. **SQL Editor** → pega el contenido de `supabase/migrations/0001_init.sql` → **Run**.
3. **Authentication → Users → Add user → Create new user**: tu email y una contraseña, con **Auto Confirm User** marcado.
4. **Authentication → Sign In / Providers → Email**: desactiva **Allow new users to sign up**, para que nadie más pueda crear cuenta.
5. **Project Settings → API**: copia la **Project URL** y la clave **anon public**.

### 2. Vercel (publicar la app)

1. En [vercel.com](https://vercel.com), **Add New → Project** e importa este repositorio.
2. En **Environment Variables** añade:
   - `NEXT_PUBLIC_SUPABASE_URL` → la Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → la clave anon public
   - `ALLOWED_EMAIL` → tu email (solo esa cuenta puede entrar)
3. **Deploy**. Abre la URL que te da Vercel y entra con tu email y contraseña.

### 3. En local (opcional)

```bash
cp .env.example .env.local   # y rellena los valores
npm install
npm run dev                  # http://localhost:3000
```

## Estructura

| Ruta | Qué es |
|---|---|
| `app/page.tsx` + `components/Library.tsx` | La biblioteca: barra lateral, lista y ficha |
| `app/save` | Guardado rápido (bookmarklet y menú Compartir) |
| `app/herramientas` | Bookmarklet e instrucciones para el móvil |
| `app/importar` | Importador del CSV de Raindrop |
| `app/api/snapshot` | Lee un link: título, portada, duración y copia del texto |
| `lib/snapshot.ts` | Lectores para YouTube, X, GitHub y webs normales |
| `supabase/migrations` | Esquema de la base de datos con seguridad por usuario (RLS) |

## Próximas fases

2. IA (Groq): clasificación, etiquetas y resúmenes automáticos; preguntar a la biblioteca.
3. Capturas: pegar o subir imágenes, recortarlas y guardarlas en una galería.
4. Extensión de Chrome: recorte de zonas de la web y «Guardar texto» con clic derecho.
5. Mantenimiento: duplicados, etiquetas parecidas y links rotos.
