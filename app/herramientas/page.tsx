import { Bookmarklet } from './Bookmarklet';

export const metadata = { title: 'Guardar desde navegador y móvil · Acopio' };

export default function ToolsPage() {
  return (
    <main className="page">
      <div className="page-inner">
        <a className="logo" href="/"><i aria-hidden="true" />Acopio</a>
        <h1>Guardar desde cualquier sitio</h1>

        <section className="card">
          <h2>En el ordenador: botón «+ Acopio»</h2>
          <ol>
            <li>Muestra la barra de favoritos de Chrome con <code>Ctrl</code>+<code>Shift</code>+<code>B</code>.</li>
            <li>Arrastra este botón hasta la barra:</li>
          </ol>
          <Bookmarklet />
          <p>Cuando estés en una web que quieras guardar, haz clic en él. Se abre una ventanita con el link ya leído: eliges colección y pulsas Guardar.</p>
        </section>

        <section className="card">
          <h2>En Android: menú Compartir</h2>
          <ol>
            <li>Abre Acopio en Chrome desde el móvil y entra con tu cuenta.</li>
            <li>Menú ⋮ → <b>Añadir a pantalla de inicio</b> (o <b>Instalar app</b>).</li>
            <li>Desde YouTube, X o cualquier app, pulsa <b>Compartir</b> y elige <b>Acopio</b>.</li>
          </ol>
        </section>

        <section className="card">
          <h2>En iPhone: Atajo de iOS</h2>
          <p>iOS no deja que las apps web aparezcan en Compartir, así que se hace con la app Atajos (viene instalada):</p>
          <ol>
            <li>Abre <b>Atajos</b> → <b>+</b> para crear uno nuevo y llámalo <b>Guardar en Acopio</b>.</li>
            <li>Toca el icono ⓘ y activa <b>Mostrar en hoja de compartir</b>. En «Recibe», deja solo <b>URL</b>.</li>
            <li>Añade la acción <b>Codificar URL</b> (Encode URL) con la entrada del atajo.</li>
            <li>Añade la acción <b>Abrir URL</b> con: <code>https://TU-DOMINIO/save?url=</code> seguido de la variable «URL codificada».</li>
            <li>Desde cualquier app: <b>Compartir</b> → <b>Guardar en Acopio</b>.</li>
          </ol>
          <p className="mono">Cambia TU-DOMINIO por la dirección donde tengas Acopio publicado (por ejemplo, acopio.vercel.app).</p>
        </section>
      </div>
    </main>
  );
}
