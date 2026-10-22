# Acopio en un servidor propio. Ver deploy/SERVIDOR.md
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# No hace falta ninguna clave para compilar: Supabase, Groq, etc. se leen al arrancar el contenedor
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run postinstall && npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S acopio && adduser -S acopio -G acopio
COPY --from=build --chown=acopio:acopio /app/.next/standalone ./
COPY --from=build --chown=acopio:acopio /app/.next/static ./.next/static
COPY --from=build --chown=acopio:acopio /app/public ./public
USER acopio
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/login >/dev/null || exit 1
CMD ["node", "server.js"]
