# Acopio · instrucciones para el asistente

## Al empezar un hilo
Lee **`TRASPASO.md`** (ficha del último hilo: qué es Acopio, arquitectura, decisiones, pendiente y cómo probar). Si necesitas más contexto, el historial está en `docs/traspasos/`.

## Al terminar un hilo (o cuando el usuario pida la ficha)
1. Crea `docs/traspasos/AAAA-MM-DD-hilo-NN.md` con la ficha nueva (NN = siguiente número). Las fichas anteriores **no se editan ni se borran**.
2. Copia su contenido a `TRASPASO.md` (la ficha vigente), cambiando la nota inicial por el enlace al historial.
3. Añade una fila a la tabla de `docs/traspasos/README.md`.
4. La ficha debe cubrir: qué se hizo en el hilo, estado de cada pieza, decisiones, pendiente, lo que quedó sin verificar y cómo probar. Sin claves ni datos sensibles.

## Convenciones
- Interfaz, comentarios y commits en **español**.
- Se trabaja en la rama `fase-1` y se publica haciendo push de `fase-1` a `main` (Vercel despliega `main`).
- Antes de commitear: `npx tsc --noEmit` y `npx next build` con valores de ejemplo de Supabase.
