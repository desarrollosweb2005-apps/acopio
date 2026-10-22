import { Bookmarklet } from './Bookmarklet';

export const metadata = { title: 'Guardar desde navegador y móvil · Acopio' };

export default function ToolsPage() {
  return (
    <main className="page">
      <div className="page-inner">
        <a className="logo" href="/"><i aria-hidden="true" />Acopio</a>
        <h1>Guardar desde cualquier sitio</h1>

        <section className="card">
          <h2>En el ordenador: extensión para Brave y Chrome</h2>
          <p>La forma más cómoda. Con ella puedes:</p>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li><b>Clic en el icono</b> o <code>Alt</code>+<code>Shift</code>+<code>S</code>: guarda la página que estás viendo.</li>
            <li><b>Clic derecho sobre cualquier link</b> → «Guardar link en Acopio», sin abrirlo. Útil en la portada de YouTube o en X.</li>
            <li><b>Selecciona texto</b> → clic derecho → «Guardar texto seleccionado»: se guarda como highlight de esa página.</li>
            <li><b>Clic derecho → «Capturar zona de la página»</b> o <code>Alt</code>+<code>Shift</code>+<code>C</code>: haces una foto de lo que ves, recortas la zona con el recuadro y se guarda en Capturas y archivos.</li>
          </ul>
          <a className="primary" href="/acopio-extension.zip" download style={{ alignSelf: 'flex-start' }}>Descargar la extensión</a>
          <ol>
            <li>Descomprime el archivo: queda una carpeta <code>acopio-extension</code>. Guárdala en un sitio fijo (por ejemplo en Documentos), porque el navegador la usa desde ahí.</li>
            <li>Abre <code>brave://extensions</code> (en Chrome, <code>chrome://extensions</code>).</li>
            <li>Activa el <b>Modo de desarrollador</b>, arriba a la derecha.</li>
            <li>Pulsa <b>Cargar descomprimida</b> y elige la carpeta <code>acopio-extension</code>.</li>
            <li>Fija el icono: pieza de puzle 🧩 de la barra → chincheta junto a <b>Acopio</b>.</li>
          </ol>
          <p className="mono">¿Ya la tenías instalada? Descarga la nueva versión, reemplaza la carpeta y pulsa ↻ (Recargar) en su tarjeta de <code>brave://extensions</code>. Te pedirá permiso para «leer y cambiar datos en vercel.app»: es para entregar la captura a tu Acopio.</p>
          <p className="mono">La extensión usa tu sesión del navegador: si ya entraste en Acopio, no pide nada más. Viene configurada para acopio-murex.vercel.app; si usas otra dirección, cámbiala en sus Opciones.</p>
        </section>

        <section className="card">
          <h2>Sin extensión: botón «+ Acopio»</h2>
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
