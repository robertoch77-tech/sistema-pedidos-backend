import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';

const API = 'https://sistema-pedidos-backend-2hec.onrender.com';

interface Pedido {
  id: number;
  numero_pedido: string;
  fecha_pedido: string;
  total_estimado: number;
  estado: string;
  descuento: number;
  observaciones: string;
  cliente_nombre: string;
  cliente_cuit: string;
  fecha_entrega_estimada?: string | null;
  items: any[];
}

const formatPrecio = (n?: number) =>
  (n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const limpiarPDF = (texto: string) =>
  (texto || '')
    .replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
    .replace(/á/g, 'a').replace(/Á/g, 'A')
    .replace(/é/g, 'e').replace(/É/g, 'E')
    .replace(/í/g, 'i').replace(/Í/g, 'I')
    .replace(/ó/g, 'o').replace(/Ó/g, 'O')
    .replace(/ú/g, 'u').replace(/Ú/g, 'U')
    .replace(/\uFFFD/g, 'N');

const arreglarNombre = (txt?: string) => (txt || '').replace(/\uFFFD/g, 'Ñ');

const labelEstado: Record<string, string> = {
  enviado: 'sin imprimir',
  impreso: 'impreso',
};
const colorEstado: Record<string, string> = {
  enviado: 'bg-orange-100 text-orange-700',
  impreso: 'bg-green-100 text-green-700',
};

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

function Pedidos() {
  const mayorista = JSON.parse(localStorage.getItem('mayorista') || '{}');
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [pedidoAbierto, setPedidoAbierto] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('enviado');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  useEffect(() => { buscarConEstado('enviado'); }, []);

  const buscarConEstado = async (estado: string) => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      if (estado !== 'todos') params.set('estado', estado);
      if (fechaDesde) params.set('fecha_desde', fechaDesde);
      if (fechaHasta) params.set('fecha_hasta', fechaHasta);
      if (busqueda.trim()) params.set('busqueda', busqueda.trim());
      const res = await fetch(`${API}/api/pedidos/${mayorista.id}?${params}`);
      const data = await res.json();
      setPedidos(Array.isArray(data) ? data : []);
      setBuscado(true);
    } catch { setPedidos([]); setBuscado(true); } finally { setCargando(false); }
  };

  const buscar = () => buscarConEstado(filtroEstado);

  const marcarImpreso = async (id: number) => {
    try {
      await fetch(`${API}/api/pedidos/${id}/imprimir`, { method: 'PUT' });
      setPedidos(prev => prev.map(p => p.id === id ? { ...p, estado: 'impreso' } : p));
    } catch (e) { console.error(e); }
  };

  const [fechasEntrega, setFechasEntrega] = useState<Record<number, string>>({});
  const [guardandoFecha, setGuardandoFecha] = useState<number | null>(null);

  const guardarFechaEntrega = async (id: number) => {
    setGuardandoFecha(id);
    try {
      await fetch(`${API}/api/pedidos/${id}/fecha-entrega`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha_entrega_estimada: fechasEntrega[id] || null }),
      });
      setPedidos(prev => prev.map(p => p.id === id ? { ...p, fecha_entrega_estimada: fechasEntrega[id] || null } : p));
    } catch (e) { console.error(e); } finally { setGuardandoFecha(null); }
  };

  const generarPDF = async (pedido: Pedido) => {
    const tamanio = mayorista.tamanio_hoja === 'A5' ? 'a5' : 'a4';
    const doc = new jsPDF({ format: tamanio, unit: 'mm' });
    const ancho = tamanio === 'a5' ? 148 : 210;
    const mg = 12;
    const tableRight = ancho - mg;
    const ordenPdf = mayorista.orden_pdf || 'codigo';
    const itemsPorHoja = Math.max(30, mayorista.items_por_hoja || 30);

    const wN = 7, wCod = tamanio === 'a4' ? 22 : 16, wX = 7, wCant = 13, wX2 = 7;
    const wDesc = (tableRight - mg) - wN - wCod - wX - wCant - wX2;
    const xN    = mg;
    const xCod  = xN + wN;
    const xX1   = xCod + wCod;
    const xCant = xX1 + wX;
    const xX2   = xCant + wCant;
    const xDesc = xX2 + wX2;
    const vCols = [xN, xCod, xX1, xCant, xX2, xDesc, tableRight];
    const rowH  = 5.5;
    const checkSz = 3.5;

    const items = Array.isArray(pedido.items) ? pedido.items.filter(i => i.nombre) : [];
    const itemsOrdenados = [...items].sort((a, b) => {
      if (ordenPdf === 'rubro') {
        const r = (a.rubro || '').localeCompare(b.rubro || '');
        return r !== 0 ? r : (a.nombre || '').localeCompare(b.nombre || '');
      }
      if (ordenPdf === 'descripcion') return (a.nombre || '').localeCompare(b.nombre || '');
      return (a.codigo || '').localeCompare(b.codigo || '');
    });

    const renderHeader = (pageNum: number): number => {
      let y = 8;
      drawLogo(doc, mg, y - 1);
      doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
      doc.setTextColor(13, 43, 107);
      doc.text('Gestion Integral', mg + 13, y + 1.5);
      doc.text('Pedidos', mg + 13, y + 5.5);
      doc.setTextColor(0);
      doc.setFontSize(13); doc.setFont('helvetica', 'bold');
      doc.text('PEDIDO', ancho / 2, y + 3, { align: 'center' });
      doc.setFontSize(9);
      doc.text(`N\xB0: ${pedido.numero_pedido}`, tableRight, y + 3, { align: 'right' });
      y += 10;
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text(`FECHA: ${new Date(pedido.fecha_pedido).toLocaleDateString('es-AR')}`, mg, y);
      doc.text(`Pag. ${pageNum}`, tableRight, y, { align: 'right' });
      y += 5;
      doc.setFont('helvetica', 'bold');
      doc.text(`RAZON SOCIAL:   ${limpiarPDF(pedido.cliente_nombre)}`, mg, y);
      y += 4;
      doc.setDrawColor(0); doc.setLineWidth(0.6);
      doc.line(mg, y, tableRight, y); y += 2;
      doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.text('N',           xN + 1,    y + 3.5);
      doc.text('CODIGO',      xCod + 1,  y + 3.5);
      doc.text('X',           xX1 + 2,   y + 3.5);
      doc.text('CANT.',       xCant + 1, y + 3.5);
      doc.text('X',           xX2 + 2,   y + 3.5);
      doc.text('DESCRIPCION', xDesc + 1, y + 3.5);
      y += rowH;
      doc.setLineWidth(0.4);
      doc.line(mg, y, tableRight, y);
      doc.setLineWidth(0.2);
      vCols.forEach(vx => doc.line(vx, y - rowH, vx, y));
      y += 2;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      return y;
    };

    const drawRowLines = (y: number, rowTop: number) => {
      doc.setDrawColor(150); doc.setLineWidth(0.15);
      doc.line(mg, y, tableRight, y);
      vCols.forEach(vx => doc.line(vx, rowTop, vx, y));
      doc.setDrawColor(0);
    };

    const renderFooter = (y: number) => {
      y += 5;
      doc.setLineWidth(0.5);
      doc.line(mg, y, tableRight, y);
      y += 6;
      const midX = ancho * 0.52;
      const rightX = midX + 4;
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text('BULTOS:', mg, y);
      doc.setLineWidth(0.3);
      doc.line(mg + 19, y, midX - 2, y);
      doc.text('PREPARO:', rightX, y);
      doc.line(rightX + 22, y, tableRight, y);
      y += 8;
      doc.text('OBSERVACIONES:', mg, y);
      doc.setLineWidth(0.2);
      doc.rect(mg, y + 2, midX - mg - 2, 20);
      doc.text('CONTROLO:', rightX, y);
      doc.line(rightX + 23, y, tableRight, y);
      y += 10;
      doc.text('FACTURO:', rightX, y);
      doc.line(rightX + 21, y, tableRight, y);
      y += 15;
      if (mayorista.mostrar_precios && pedido.total_estimado > 0) {
        doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        doc.text(`Total (a modo informativo): $${formatPrecio(pedido.total_estimado)}`, mg, y);
        doc.setTextColor(0);
      }
    };

    let y = renderHeader(1);
    let pageNum = 1;
    let itemCount = 0;
    let itemsEnPagina = 0;
    let rubroActual = '';

    for (const item of itemsOrdenados) {
      if (ordenPdf === 'rubro' && (item.rubro || '') !== rubroActual) {
        rubroActual = item.rubro || '';
        if (itemsEnPagina >= itemsPorHoja) {
          doc.addPage(); pageNum++; y = renderHeader(pageNum); itemsEnPagina = 0;
        }
        const rowTop = y;
        doc.setFillColor(220, 220, 220);
        doc.rect(mg, y, tableRight - mg, rowH, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
        doc.text(limpiarPDF(rubroActual.toUpperCase() || '(SIN RUBRO)'), xDesc + 1, y + 3.5);
        doc.setFont('helvetica', 'normal');
        y += rowH;
        doc.setDrawColor(150); doc.setLineWidth(0.15);
        doc.line(mg, y, tableRight, y);
        vCols.forEach(vx => doc.line(vx, rowTop, vx, y));
        doc.setDrawColor(0);
      }
      if (itemsEnPagina >= itemsPorHoja) {
        doc.addPage(); pageNum++; y = renderHeader(pageNum); itemsEnPagina = 0; rubroActual = '';
      }
      itemCount++;
      itemsEnPagina++;
      const rowTop = y;
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text(String(itemCount),             xN + 1,    y + 3.5);
      doc.text(limpiarPDF(item.codigo || ''), xCod + 1,  y + 3.5);
      doc.text(String(item.cantidad),         xCant + 1, y + 3.5);
      const maxChars = Math.floor(wDesc / 2.1);
      const desc = limpiarPDF(item.nombre || '') + (item.es_oferta ? ' (OFERTA)' : '');
      const descTrunc = desc.length > maxChars ? desc.substring(0, maxChars - 1) + '…' : desc;
      doc.text(descTrunc, xDesc + 1, y + 3.5);
      doc.setDrawColor(0); doc.setLineWidth(0.3);
      doc.rect(xX1 + 2, y + 1, checkSz, checkSz);
      doc.rect(xX2 + 2, y + 1, checkSz, checkSz);
      y += rowH;
      drawRowLines(y, rowTop);
    }

    renderFooter(y);
    doc.save(`pedido-${pedido.numero_pedido}.pdf`);
    await marcarImpreso(pedido.id);
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">📋 Pedidos</h2>

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
            <label className="block text-xs text-gray-500 mb-1">Estado</label>
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="todos">Todos</option>
              <option value="enviado">Sin imprimir</option>
              <option value="impreso">Impreso</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">N° pedido o cliente</label>
            <input type="text" placeholder="Buscar..." value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && buscar()}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <button onClick={buscar} disabled={cargando}
          className="mt-3 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
          {cargando ? 'Buscando...' : 'Buscar pedidos'}
        </button>
      </div>

      {cargando && <div className="text-center py-12 text-gray-400">Cargando...</div>}

      {buscado && !cargando && pedidos.length === 0 && (
        <div className="text-center py-12">
          <p className="text-4xl mb-2">✅</p>
          <p className="text-gray-500 font-medium">Sin pedidos sin imprimir</p>
          <p className="text-gray-400 text-sm mt-1">Todos los pedidos están impresos</p>
        </div>
      )}

      {buscado && !cargando && pedidos.length > 0 && (
        <>
          <p className="text-sm text-gray-500 mb-3">{pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''}</p>
          <div className="space-y-3">
            {pedidos.map(pedido => (
              <div key={pedido.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 cursor-pointer"
                  onClick={() => setPedidoAbierto(pedidoAbierto === pedido.id ? null : pedido.id)}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="font-bold text-gray-800">#{pedido.numero_pedido}</span>
                      <span className="text-sm text-gray-500 ml-3">{pedido.cliente_nombre}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{new Date(pedido.fecha_pedido).toLocaleDateString('es-AR')}</span>
                      <span className="text-gray-400">{pedidoAbierto === pedido.id ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${colorEstado[pedido.estado] || 'bg-gray-100 text-gray-600'}`}>
                      {labelEstado[pedido.estado] || pedido.estado}
                    </span>
                    {mayorista.mostrar_precios && (
                      <span className="text-green-600 font-bold text-sm">${formatPrecio(pedido.total_estimado)}</span>
                    )}
                  </div>
                </div>

                {pedidoAbierto === pedido.id && (
                  <div className="border-t px-4 pb-4">
                    <p className="text-xs text-gray-500 font-semibold mt-3 mb-2">PRODUCTOS</p>
                    <div className="space-y-2">
                      {(Array.isArray(pedido.items) ? pedido.items : []).filter((i: any) => i.nombre).map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center text-sm bg-gray-50 rounded-lg px-3 py-2">
                    <div>
                    <span className="text-gray-800">{arreglarNombre(item.nombre)}</span>
                    {item.codigo && <span className="text-xs text-gray-400 ml-2">({item.codigo})</span>}
                    {item.rubro && <span className="text-xs text-gray-300 ml-2">· {arreglarNombre(item.rubro)}</span>}
                    {item.es_oferta && (
                   <p className="text-xs text-orange-600 font-semibold">🎁 OFERTA: {arreglarNombre(item.oferta_titulo)}</p>
                    )}
                       </div>
                          <div className="flex items-center gap-3">
                            <span className="text-gray-500">x{item.cantidad}</span>
                            {mayorista.mostrar_precios && (
                              <span className="text-blue-600 font-semibold">${formatPrecio(item.precio_unitario * item.cantidad)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {pedido.observaciones && <p className="text-sm text-gray-500 mt-3">Obs: {pedido.observaciones}</p>}
                    {(pedido.estado === 'enviado' || pedido.estado === 'impreso') && (
                      <div className="mt-3 bg-gray-50 rounded-lg p-3 flex flex-wrap items-end gap-2">
                        <div className="flex-1 min-w-[160px]">
                          <label className="text-xs text-gray-500 block mb-1">📦 Fecha de entrega estimada</label>
                          <input type="date"
                            defaultValue={pedido.fecha_entrega_estimada?.substring(0, 10) || ''}
                            onChange={e => setFechasEntrega(prev => ({ ...prev, [pedido.id]: e.target.value }))}
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <button onClick={() => guardarFechaEntrega(pedido.id)}
                          disabled={guardandoFecha === pedido.id}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50">
                          {guardandoFecha === pedido.id ? 'Guardando...' : '💾 Guardar fecha'}
                        </button>
                      </div>
                    )}
                    {pedido.estado === 'enviado' && (
                      <button onClick={() => generarPDF(pedido)}
                        className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold">
                        🖨️ Imprimir pedido
                      </button>
                    )}
                    {pedido.estado === 'impreso' && (
                      <button onClick={() => generarPDF(pedido)}
                        className="mt-3 w-full bg-gray-400 hover:bg-gray-500 text-white py-2 rounded-lg text-sm font-semibold">
                        🖨️ Reimprimir
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default Pedidos;