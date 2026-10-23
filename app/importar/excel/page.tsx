import { ExcelImporter } from './ExcelImporter';

export const metadata = { title: 'Importar vídeos de Excel · Acopio' };

export default function ExcelImportPage() {
  return (
    <main className="page">
      <div className="page-inner">
        <a className="logo" href="/"><i aria-hidden="true" />Acopio</a>
        <h1>Importar vídeos de Excel</h1>
        <section className="card">
          <ol>
            <li>Una columna por mes. Las filas sin número (las celestes) son la categoría; debajo, cada subtema empieza con cuántos vídeos viste ese mes («3 Claude»).</li>
            <li>Los vídeos van en el comentario de la celda, numerados: «1.- Canal https://youtube.com/@canal», el título y el link del vídeo.</li>
            <li>Elige el archivo y di a qué mes corresponde la primera columna. Verás el resumen antes de importar nada.</li>
          </ol>
          <p className="mono">Solo se leen las celdas con número mayor que 0. Los links que ya tengas en Acopio se saltan. El archivo se lee en tu navegador.</p>
        </section>
        <ExcelImporter />
      </div>
    </main>
  );
}
