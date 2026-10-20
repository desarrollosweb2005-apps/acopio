import { Importer } from './Importer';

export const metadata = { title: 'Importar de Raindrop · Acopio' };

export default function ImportPage() {
  return (
    <main className="page">
      <div className="page-inner">
        <a className="logo" href="/"><i aria-hidden="true" />Acopio</a>
        <h1>Importar de Raindrop</h1>
        <section className="card">
          <ol>
            <li>En Raindrop, abre <b>Todos los marcadores</b> y pulsa <b>Exportar</b> → <b>CSV</b>.</li>
            <li>Elige aquí ese archivo. Verás un resumen antes de importar nada.</li>
          </ol>
          <p className="mono">Las carpetas pasan a ser colecciones, y se conservan etiquetas, notas, highlights y fechas. Los links que ya tengas en Acopio se saltan.</p>
        </section>
        <Importer />
      </div>
    </main>
  );
}
