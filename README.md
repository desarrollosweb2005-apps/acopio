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
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` → la clave publishable (o `NEXT_PUBLIC_SUPABASE_ANON_KEY` con la clave anon, en proyectos antiguos)
   - `ALLOWED_EMAIL` → tu email (solo esa cuenta puede entrar)
   - `GROQ_API_KEY` → opcional; activa la IA (organizar la Bandeja, resúmenes, prompts y preguntar). Se consigue gratis en [console.groq.com](https://console.groq.com)
   - `YOUTUBE_API_KEY` → opcional; si los vídeos se guardan sin duración ni descripción, ver «Clave de YouTube» abajo
3. **Deploy**. Abre la URL que te da Vercel y entra con tu email y contraseña.

### Clave de YouTube (opcional)

A veces YouTube no deja leer la página del vídeo desde los servidores de Vercel, y el vídeo se guarda sin duración ni descripción. Con una clave gratuita de la API de YouTube funciona siempre:

1. Entra en [console.cloud.google.com](https://console.cloud.google.com) y crea un proyecto.
2. **APIs y servicios → Biblioteca** → busca **YouTube Data API v3** → **Habilitar**.
3. **APIs y servicios → Credenciales → Crear credenciales → Clave de API**.
4. En Vercel, añade la variable `YOUTUBE_API_KEY` con esa clave y vuelve a desplegar.

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

## IA con Groq (fase 2)

- **Organizar con IA** (en la Bandeja): propone colección y etiquetas para cada marcador, creando colecciones nuevas si hace falta. Revisas la propuesta antes de aplicar.
- **Al añadir un link**: sugiere colección y etiquetas.
- **Resumir con IA** y **Convertir en prompt** en la ficha de cada marcador.
- **Preguntar**: responde preguntas sobre la biblioteca citando los marcadores.

También se puede **arrastrar un link** a la ventana o **pegarlo con Ctrl+V** en cualquier parte para guardarlo.

## Próximas fases

3. Capturas: pegar o subir imágenes, recortarlas y guardarlas en una galería.
4. Extensión de Chrome: recorte de zonas de la web y «Guardar texto» con clic derecho.
5. Mantenimiento: duplicados, etiquetas parecidas y links rotos.
