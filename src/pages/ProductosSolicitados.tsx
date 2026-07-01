import React, { useState } from 'react';
import jsPDF from 'jspdf';

const API = 'https://sistema-pedidos-backend-2hec.onrender.com';

interface ProductoRanking {
  codigo: string;
  nombre: string;
  total: string | number;
}

const limpiarPDF = (texto: string) =>
  (texto || '')
    .replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
    .replace(/á/g, 'a').replace(/Á/g, 'A')
    .replace(/é/g, 'e').replace(/É/g, 'E')
    .replace(/í/g, 'i').replace(/Í/g, 'I')
    .replace(/ó/g, 'o').replace(/Ó/g, 'O')
    .replace(/ú/g, 'u').replace(/Ú/g, 'U')
    .replace(/\uFFFD/g, 'N');

function drawLogo(doc: jsPDF, startX: number, startY: number) {
  const r = 1.1, gX = 3.0, gY = 3.0;
  const NAVY: [number,number,number] = [13, 43, 107];
  const BLUE: [number,number,number] = [37, 99, 235];
  const CYAN: [number,number,number] = [6, 182, 212];
  const dots: { x: number; y: number; c: [number,number,number] }[] = [
    { x: startX + gX,     y: startY,        c: NAVY },
    { x: startX + gX*2,   y: startY,        c: BLUE },
    { x: startX + gX*3,   y: startY,        c: CYAN },
    { x: startX + gX*0.5, y: startY + gY,   c: CYAN },
    { x: startX + gX*1.5, y: startY + gY,   c: NAVY },
    { x: startX,           y: startY + gY*2, c: BLUE },
    { x: startX + gX,     y: startY + gY*2, c: NAVY },
    { x: startX + gX*2,   y: startY + gY*2, c: CYAN },
  ];
  dots.forEach(d => {
    doc.setFillColor(d.c[0], d.c[1], d.c[2]);
    doc.circle(d.x, d.y, r, 'F');
  });
  doc.setFillColor(0, 0, 0);
}

function ProductosSolicitados() {
  const mayorista = JSON.parse(localStorage.getItem('mayorista') || '{}');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [limiteMas, setLimiteMas] = useState(100);
  const [limiteMenos, setLimiteMenos] = useState(300);
  const [masSolicitados, setMasSolicitados] = useState<ProductoRanking[]>([]);
  const [menosSolicitados, setMenosSolicitados] = useState<ProductoRanking[]>([]);
  const [cargando, setCargando] = useState(false);
  const [generado, setGenerado] = useState(false);
  const [error, setError] = useState('');

  const generar = async () => {
    setError('');
    if (!fechaDesde || !fechaHasta) {
      setError('Elegí fecha desde y hasta'); return;
    }
    setCargando(true);
    try {
      const params = new URLSearchParams({
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        limite_mas: String(limiteMas || 100),
        limite_menos: String(limiteMenos || 300),
      });
      const res = await fetch(`${API}/api/productos-solicitados/${mayorista.id}?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMasSolicitados(data.mas_solicitados || []);
      setMenosSolicitados(data.menos_solicitados || []);
      setGenerado(true);
    } catch {
      setError('Error al generar el reporte');
    } finally { setCargando(false); }
  };

  const generarPDF = () => {
    const doc = new jsPDF({ format: 'a4', unit: 'mm' });
    const ancho = 210;
    const mg = 12;
    const tableRight = ancho - mg;

    const wN = 10, wCod = 28, wCant = 25;
    const wDesc = (tableRight - mg) - wN - wCod - wCant;
    const xN = mg, xCod = xN + wN, xDesc = xCod + wCod, xCant = xDesc + wDesc;
    const vCols = [xN, xCod, xDesc, tableRight];
    const rowH = 6;

    const renderHeader = (titulo: string, color: [number, number, number], pageNum: number): number => {
      let y = 8;
      drawLogo(doc, mg, y - 1);
      doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
      doc.setTextColor(13, 43, 107);
      doc.text('Gestion Integral', mg + 13, y + 1.5);
      doc.text('Pedidos', mg + 13, y + 5.5);
      doc.setTextColor(0);
      doc.setFontSize(13); doc.setFont('helvetica', 'bold');
      doc.text(titulo, ancho / 2, y + 3, { align: 'center' });
      doc.setFontSize(9);
      doc.text(`Pag. ${pageNum}`, tableRight, y + 3, { align: 'right' });
      y += 10;
      doc.setFont('helvetica', 'normal');
      doc.text(`Periodo: ${fechaDesde} al ${fechaHasta}`, mg, y);
      if (mayorista.razon_social) {
        doc.text(limpiarPDF(mayorista.razon_social), tableRight, y, { align: 'right' });
      }
      y += 5;
      doc.setDrawColor(0); doc.setLineWidth(0.6);
      doc.line(mg, y, tableRight, y); y += 2;
      doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.setFillColor(color[0], color[1], color[2]);
      doc.rect(mg, y, tableRight - mg, rowH, 'F');
      doc.setTextColor(255, 255, 255);
      doc.text('N',           xN + 1,    y + 4);
      doc.text('CODIGO',      xCod + 1,  y + 4);
      doc.text('DESCRIPCION', xDesc + 1, y + 4);
      doc.text('CANTIDAD',    xCant + 1, y + 4);
      doc.setTextColor(0);
      y += rowH;
      doc.setLineWidth(0.4);
      doc.line(mg, y, tableRight, y);
      vCols.forEach(vx => doc.line(vx, y - rowH, vx, y));
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      return y;
    };

    const renderTabla = (titulo: string, color: [number, number, number], items: ProductoRanking[], pageNumStart: number): number => {
      let pageNum = pageNumStart;
      let y = renderHeader(titulo, color, pageNum);
      const itemsPorHoja = 38;
      let itemsEnPagina = 0;

      items.forEach((item, idx) => {
        if (itemsEnPagina >= itemsPorHoja) {
          doc.addPage(); pageNum++; y = renderHeader(titulo, color, pageNum); itemsEnPagina = 0;
        }
        const rowTop = y;
        doc.text(String(idx + 1), xN + 1, y + 4);
        doc.text(limpiarPDF(item.codigo || ''), xCod + 1, y + 4);
        const maxChars = Math.floor(wDesc / 2);
        const desc = limpiarPDF(item.nombre || '');
        const descTrunc = desc.length > maxChars ? desc.substring(0, maxChars - 1) + '…' : desc;
        doc.text(descTrunc, xDesc + 1, y + 4);
        doc.text(String(item.total), xCant + 1, y + 4);
        y += rowH;
        doc.setDrawColor(150); doc.setLineWidth(0.15);
        doc.line(mg, y, tableRight, y);
        vCols.forEach(vx => doc.line(vx, rowTop, vx, y));
        doc.setDrawColor(0);
        itemsEnPagina++;
      });
      return pageNum;
    };

    let pageNum = 1;
    pageNum = renderTabla('PRODUCTOS MAS SOLICITADOS', [22, 163, 74], masSolicitados, pageNum);
    doc.addPage(); pageNum++;
    renderTabla('PRODUCTOS MENOS SOLICITADOS', [220, 38, 38], menosSolicitados, pageNum);

    doc.save(`productos-solicitados-${fechaDesde}-a-${fechaHasta}.pdf`);
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">📈 Productos más/menos solicitados</h2>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Desde</label>
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Hasta</label>
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">🟢 Cantidad "más solicitados"</label>
            <input type="number" min="1" value={limiteMas}
              onChange={e => setLimiteMas(parseInt(e.target.value) || 0)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">🔴 Cantidad "menos solicitados"</label>
            <input type="number" min="1" value={limiteMenos}
              onChange={e => setLimiteMenos(parseInt(e.target.value) || 0)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
          </div>
        </div>
        {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
        <div className="flex gap-3 mt-3">
          <button onClick={generar} disabled={cargando}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
            {cargando ? 'Generando...' : 'Generar'}
          </button>
          {generado && (
            <button onClick={generarPDF}
              className="bg-gray-700 hover:bg-gray-800 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors">
              🖨️ Imprimir PDF
            </button>
          )}
        </div>
      </div>

      {cargando && <div className="text-center py-12 text-gray-400">Cargando...</div>}

      {generado && !cargando && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* MAS SOLICITADOS */}
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h3 className="text-lg font-bold text-green-700 mb-3">🟢 Más solicitados ({masSolicitados.length})</h3>
            {masSolicitados.length === 0 ? (
              <p className="text-gray-400 text-center py-6">Sin datos en el período</p>
            ) : (
              <div className="overflow-auto max-h-[500px]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b">
                      <th className="py-2 pr-2">Código</th>
                      <th className="py-2 pr-2">Descripción</th>
                      <th className="py-2 pr-2 text-right">Cant.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {masSolicitados.map((item, idx) => (
                      <tr key={idx} className="border-b border-gray-50">
                        <td className="py-1.5 pr-2 font-mono text-xs text-gray-500">{item.codigo}</td>
                        <td className="py-1.5 pr-2 text-gray-800">{item.nombre}</td>
                        <td className="py-1.5 pr-2 text-right font-semibold text-green-700">{item.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* MENOS SOLICITADOS */}
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h3 className="text-lg font-bold text-red-700 mb-3">🔴 Menos solicitados ({menosSolicitados.length})</h3>
            {menosSolicitados.length === 0 ? (
              <p className="text-gray-400 text-center py-6">Sin datos en el período</p>
            ) : (
              <div className="overflow-auto max-h-[500px]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b">
                      <th className="py-2 pr-2">Código</th>
                      <th className="py-2 pr-2">Descripción</th>
                      <th className="py-2 pr-2 text-right">Cant.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {menosSolicitados.map((item, idx) => (
                      <tr key={idx} className="border-b border-gray-50">
                        <td className="py-1.5 pr-2 font-mono text-xs text-gray-500">{item.codigo}</td>
                        <td className="py-1.5 pr-2 text-gray-800">{item.nombre}</td>
                        <td className="py-1.5 pr-2 text-right font-semibold text-red-700">{item.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductosSolicitados;