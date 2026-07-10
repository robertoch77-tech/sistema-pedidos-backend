import React, { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const Logo = ({ size = 26 }: { size?: number }) => (
  <svg viewBox="0 0 80 80" width={size} height={size} style={{ display: 'block' }}>
    <circle cx="15" cy="15" r="11" fill="#0D2B6B" />
    <circle cx="40" cy="15" r="11" fill="#06B6D4" />
    <circle cx="65" cy="15" r="11" fill="#06B6D4" />
    <circle cx="27" cy="40" r="11" fill="#06B6D4" />
    <circle cx="52" cy="40" r="11" fill="#0D2B6B" />
    <circle cx="15" cy="65" r="11" fill="#0D2B6B" />
    <circle cx="40" cy="65" r="11" fill="#0D2B6B" />
    <circle cx="65" cy="65" r="11" fill="#06B6D4" />
  </svg>
);

const API = 'https://sistema-pedidos-backend-2hec.onrender.com';

type TipoHistorial = 'ticket' | 'venta' | 'presupuesto';

interface RegistroHistorial {
  id: number;
  numero_correlativo: number;
  tipo: string;
  tipo_destinatario?: string | null;
  cliente_final_nombre: string | null;
  cliente_final_cuit: string | null;
  cliente_final_direccion: string | null;
  cliente_final_telefono: string | null;
  forma_pago: string | null;
  monto_recibido: number | null;
  vuelto: number | null;
  items: any[];
  total: number;
  ganancia_porcentaje: number;
  observaciones: string | null;
  validez_hasta?: string | null;
  condiciones_pago?: string | null;
  descuento_global?: number | null;
  fecha: string;
}

const TABS: { id: TipoHistorial; label: string; activeBg: string; activeText: string }[] = [
  { id: 'ticket',      label: '🧾 Tickets',      activeBg: 'bg-yellow-500',  activeText: 'text-white' },
  { id: 'venta',       label: '🖩 Ventas',        activeBg: 'bg-indigo-600',  activeText: 'text-white' },
  { id: 'presupuesto', label: '📄 Presupuestos',  activeBg: 'bg-emerald-600', activeText: 'text-white' },
];

const formatPrecio = (n: number) =>
  (n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const arreglarNombre = (txt?: string) => (txt || '').replace(/�/g, 'Ñ').replace(/�/g, 'N');

// Retorna clases de color para la validez del presupuesto
function colorValidez(fecha: string): string {
  const hoy = new Date().toISOString().substring(0, 10);
  return fecha.substring(0, 10) >= hoy ? 'text-green-600' : 'text-red-500';
}

function MiHistorial() {
  const cliente = JSON.parse(localStorage.getItem('cliente') || '{}');
  const mayorista_id = cliente.mayorista_id;

  const [razonSocial, setRazonSocial] = useState('');
  const [tabActiva, setTabActiva] = useState<TipoHistorial>('ticket');
  const [registros, setRegistros] = useState<RegistroHistorial[]>([]);
  const [cargando, setCargando] = useState(false);
  const [eliminando, setEliminando] = useState<number | null>(null);
  const [convirtiendoId, setConvirtiendoId] = useState<number | null>(null);

  useEffect(() => {
    if (!mayorista_id) return;
    fetch(`${API}/api/mayoristas/${mayorista_id}/configuracion`)
      .then(r => r.json())
      .then(data => setRazonSocial(data.razon_social || ''))
      .catch(() => {});
  }, [mayorista_id]);

  useEffect(() => {
    cargar(tabActiva);
    // eslint-disable-next-line
  }, [tabActiva]);

  const cargar = async (tipo: TipoHistorial) => {
    if (!cliente.cuit || !mayorista_id) return;
    setCargando(true);
    try {
      const res = await fetch(
        `${API}/api/historial/${mayorista_id}/${encodeURIComponent(cliente.cuit)}?tipo=${tipo}`
      );
      const data = await res.json();
      setRegistros(Array.isArray(data) ? data : []);
    } catch { setRegistros([]); } finally { setCargando(false); }
  };

  const eliminar = async (id: number) => {
    if (!window.confirm('¿Eliminar este registro del historial?')) return;
    setEliminando(id);
    try {
      await fetch(`${API}/api/historial/${id}?mayorista_id=${mayorista_id}`, { method: 'DELETE' });
      setRegistros(prev => prev.filter(r => r.id !== id));
    } catch {} finally { setEliminando(null); }
  };

  const convertirEnVenta = async (r: RegistroHistorial) => {
    if (!window.confirm('¿Convertir este presupuesto en venta? Se guardará una nueva entrada en el historial como venta.')) return;
    setConvirtiendoId(r.id);
    try {
      const res = await fetch(`${API}/api/historial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mayorista_id,
          cliente_cuit: cliente.cuit,
          tipo: 'venta',
          tipo_destinatario: r.tipo_destinatario || null,
          cliente_final_nombre: r.cliente_final_nombre,
          cliente_final_cuit: r.cliente_final_cuit,
          cliente_final_direccion: r.cliente_final_direccion,
          cliente_final_telefono: r.cliente_final_telefono,
          observaciones: r.observaciones,
          items: r.items,
          total: r.total,
          ganancia_porcentaje: r.ganancia_porcentaje,
          descuento_global: r.descuento_global || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        window.location.href = '/mi-historial';
      }
    } catch {} finally { setConvirtiendoId(null); }
  };

  const reimprimir = (r: RegistroHistorial) => {
    const items: any[] = Array.isArray(r.items) ? r.items : [];
    const mg = 14;

    if (r.tipo === 'presupuesto') {
      // PDF de presupuesto
      const doc = new jsPDF({ format: 'a4' });
      const ancho = 210;

      doc.setFontSize(16); doc.setFont('helvetica', 'bold');
      doc.text(`PRESUPUESTO N°${r.numero_correlativo}`, mg, 16);

      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
      let y = 23;
      if (razonSocial) { doc.text(razonSocial, mg, y); y += 5; }
      doc.text(`Fecha: ${new Date(r.fecha).toLocaleDateString('es-AR')}`, mg, y);
      doc.setTextColor(0);
      y += 7;

      const labelDest = r.tipo_destinatario === 'proveedor' ? 'Proveedor' : 'Cliente';
      if (r.cliente_final_nombre || r.cliente_final_cuit || r.cliente_final_direccion || r.cliente_final_telefono) {
        doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.text(`${labelDest}:`, mg, y); y += 5;
        doc.setFont('helvetica', 'normal');
        if (r.cliente_final_nombre)    { doc.text(`Nombre: ${r.cliente_final_nombre}`, mg + 2, y); y += 4; }
        if (r.cliente_final_cuit)      { doc.text(`CUIT: ${r.cliente_final_cuit}`, mg + 2, y); y += 4; }
        if (r.cliente_final_direccion) { doc.text(`Dirección: ${r.cliente_final_direccion}`, mg + 2, y); y += 4; }
        if (r.cliente_final_telefono)  { doc.text(`Tel: ${r.cliente_final_telefono}`, mg + 2, y); y += 4; }
        if (r.validez_hasta) {
          doc.text(`Válido hasta: ${new Date(r.validez_hasta + 'T12:00:00').toLocaleDateString('es-AR')}`, mg + 2, y);
          y += 4;
        }
        y += 3;
      }

      const colDesc = ancho - mg * 2 - 20 - 38 - 38;
      autoTable(doc, {
        head: [['Código', 'Descripción', 'Cant.', 'P. Unit.', 'Subtotal']],
        body: items.map((i: any) => [
          i.cod_producto || i.codigo || '—',
          arreglarNombre(i.nombre || ''),
          String(i.cantidad || 0),
          `$${formatPrecio(i.precio_unitario || 0)}`,
          `$${formatPrecio((i.precio_unitario || 0) * (i.cantidad || 0))}`,
        ]),
        startY: y,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [20, 83, 45] },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: colDesc - 22 },
          2: { cellWidth: 20, halign: 'center' },
          3: { cellWidth: 38, halign: 'right' },
          4: { cellWidth: 38, halign: 'right' },
        },
      });

      let finalY = (doc as any).lastAutoTable.finalY + 6;
      const subtotal = items.reduce((acc: number, i: any) => acc + (i.precio_unitario || 0) * (i.cantidad || 0), 0);
      const descGlobal = r.descuento_global || 0;
      const montoDesc = subtotal * (descGlobal / 100);

      doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
      if (descGlobal > 0) {
        doc.text(`Subtotal: $${formatPrecio(subtotal)}`, mg, finalY); finalY += 5;
        doc.text(`Descuento ${descGlobal}%: -$${formatPrecio(montoDesc)}`, mg, finalY); finalY += 5;
      }
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
      doc.text(`Total: $${formatPrecio(r.total)}`, mg, finalY); finalY += 8;
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(60);
      if (r.condiciones_pago) { doc.text(`Condiciones de pago: ${r.condiciones_pago}`, mg, finalY); finalY += 5; }
      if (r.observaciones)    { doc.text(`Observaciones: ${r.observaciones}`, mg, finalY); }

      doc.save(`presupuesto-${r.numero_correlativo}.pdf`);
    } else {
      // PDF de ticket / venta (formato original)
      const doc = new jsPDF({ format: 'a4' });
      const titulo = r.tipo === 'ticket' ? 'Ticket de Venta' : 'Comprobante de Venta';
      const headerColor: [number, number, number] =
        r.tipo === 'ticket' ? [202, 138, 4] : [79, 70, 229];

      doc.setFontSize(16); doc.setFont('helvetica', 'bold');
      doc.text(titulo, mg, 16);

      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
      let y = 22;
      if (razonSocial) { doc.text(razonSocial, mg, y); y += 5; }
      doc.text(`N° ${r.numero_correlativo}  ·  Fecha: ${new Date(r.fecha).toLocaleDateString('es-AR')}`, mg, y);
      doc.setTextColor(0);
      y += 7;

      if (r.cliente_final_nombre || r.cliente_final_cuit || r.cliente_final_direccion || r.cliente_final_telefono) {
        doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.text('Cliente:', mg, y); y += 5;
        doc.setFont('helvetica', 'normal');
        if (r.cliente_final_nombre)    { doc.text(`Nombre: ${r.cliente_final_nombre}`, mg + 2, y); y += 4; }
        if (r.cliente_final_cuit)      { doc.text(`CUIT: ${r.cliente_final_cuit}`, mg + 2, y); y += 4; }
        if (r.cliente_final_direccion) { doc.text(`Dirección: ${r.cliente_final_direccion}`, mg + 2, y); y += 4; }
        if (r.cliente_final_telefono)  { doc.text(`Tel: ${r.cliente_final_telefono}`, mg + 2, y); y += 4; }
        y += 2;
      }

      autoTable(doc, {
        head: [['Producto', 'Cant.', 'P. Unitario', 'Subtotal']],
        body: items.map((i: any) => [
          arreglarNombre(i.nombre || ''),
          String(i.cantidad || 0),
          `$${formatPrecio(i.precio_unitario || 0)}`,
          `$${formatPrecio((i.precio_unitario || 0) * (i.cantidad || 0))}`,
        ]),
        startY: y,
        styles: { fontSize: 9 },
        headStyles: { fillColor: headerColor },
        columnStyles: {
          0: { cellWidth: 110 },
          1: { cellWidth: 18, halign: 'center' },
          2: { cellWidth: 38, halign: 'right' },
          3: { cellWidth: 38, halign: 'right' },
        },
      });

      let finalY = (doc as any).lastAutoTable.finalY + 6;
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
      doc.text(`Total: $${formatPrecio(r.total)}`, mg, finalY); finalY += 7;
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      if (r.forma_pago) { doc.text(`Forma de pago: ${r.forma_pago}`, mg, finalY); finalY += 5; }
      if (r.forma_pago === 'Efectivo' && r.monto_recibido) {
        doc.text(`Monto recibido: $${formatPrecio(r.monto_recibido)}`, mg, finalY); finalY += 5;
        doc.text(`Vuelto: $${formatPrecio(r.vuelto || 0)}`, mg, finalY); finalY += 5;
      }
      if (r.observaciones) { doc.text(`Obs: ${r.observaciones}`, mg, finalY); }

      doc.save(`${r.tipo}-${r.numero_correlativo}.pdf`);
    }
  };

  const tabColor = (tab: TipoHistorial) =>
    tab === 'ticket' ? 'text-yellow-600' : tab === 'venta' ? 'text-indigo-600' : 'text-emerald-700';

  const mensajeVacio = (tab: TipoHistorial) => {
    if (tab === 'ticket') return { emoji: '🧾', titulo: 'No hay tickets guardados todavía', sub: 'Generá un PDF desde Mis Tickets para guardar automáticamente' };
    if (tab === 'venta')  return { emoji: '🖩',  titulo: 'No hay ventas guardadas todavía',  sub: 'Generá un comprobante desde la Calculadora de Venta' };
    return { emoji: '📄', titulo: 'No hay presupuestos todavía', sub: 'Creá uno desde la sección Presupuestos' };
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* NAVBAR */}
      <nav className="bg-white shadow-sm px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Logo size={26} />
          <div>
            <p className="text-xs text-gray-400 leading-none">
              Gestión Integral Pedidos{razonSocial ? ` | ${razonSocial}` : ''}
            </p>
            <h1 className="text-lg font-bold text-gray-700">📋 Mi Historial</h1>
          </div>
        </div>
        <a href="/cliente" className="text-sm text-gray-500 hover:text-gray-700 font-medium">← Volver</a>
      </nav>

      <div className="p-4 max-w-2xl mx-auto">

        {/* TABS */}
        <div className="flex gap-2 mb-4">
          {TABS.map(tab => (
            <button key={tab.id}
              onClick={() => setTabActiva(tab.id)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors border-2 ${
                tabActiva === tab.id
                  ? `${tab.activeBg} ${tab.activeText} border-transparent`
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* CONTENIDO */}
        {cargando ? (
          <div className="text-center py-12 text-gray-400">Cargando...</div>
        ) : registros.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-3">{mensajeVacio(tabActiva).emoji}</div>
            <p className="text-lg font-medium">{mensajeVacio(tabActiva).titulo}</p>
            <p className="text-sm mt-1">{mensajeVacio(tabActiva).sub}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {registros.map(r => (
              <div key={r.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="p-4">

                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className={`font-bold text-base ${tabColor(tabActiva)}`}>
                        N° {r.numero_correlativo}
                      </span>
                      <span className="text-xs text-gray-400 ml-3">
                        {new Date(r.fecha).toLocaleDateString('es-AR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="font-bold text-green-600">${formatPrecio(r.total)}</p>
                  </div>

                  {/* Destinatario / cliente */}
                  {r.cliente_final_nombre && (
                    <p className="text-sm text-gray-600 mb-1">
                      {r.tipo_destinatario === 'proveedor' ? '🏭' : '👤'}{' '}
                      <span className="font-medium">{r.cliente_final_nombre}</span>
                      {r.cliente_final_cuit && (
                        <span className="text-gray-400 ml-2 text-xs">{r.cliente_final_cuit}</span>
                      )}
                    </p>
                  )}

                  {/* Tipo destinatario (solo presupuestos) */}
                  {tabActiva === 'presupuesto' && r.tipo_destinatario && (
                    <p className="text-xs text-gray-400 mb-1">
                      {r.tipo_destinatario === 'proveedor' ? 'Para proveedor' : 'Para cliente final'}
                    </p>
                  )}

                  {/* Validez (solo presupuestos) */}
                  {tabActiva === 'presupuesto' && r.validez_hasta && (
                    <p className={`text-xs font-medium mb-1 ${colorValidez(r.validez_hasta)}`}>
                      📅 Válido hasta: {new Date(r.validez_hasta + 'T12:00:00').toLocaleDateString('es-AR')}
                      {new Date(r.validez_hasta + 'T12:00:00') < new Date()
                        ? ' · Vencido'
                        : ' · Vigente'}
                    </p>
                  )}

                  {/* Forma de pago (tickets/ventas) */}
                  {tabActiva !== 'presupuesto' && r.forma_pago && (
                    <p className="text-xs text-gray-500 mb-2">
                      💳 {r.forma_pago}
                      {r.forma_pago === 'Efectivo' && r.monto_recibido
                        ? ` · Recibido: $${formatPrecio(r.monto_recibido)} · Vuelto: $${formatPrecio(r.vuelto || 0)}`
                        : ''}
                    </p>
                  )}

                  {/* Items resumen */}
                  <div className="text-xs text-gray-400 mb-3">
                    {Array.isArray(r.items) && r.items.length > 0
                      ? `${r.items.length} producto${r.items.length !== 1 ? 's' : ''}: ${r.items.slice(0, 2).map((i: any) => arreglarNombre(i.nombre)).join(', ')}${r.items.length > 2 ? ` y ${r.items.length - 2} más` : ''}`
                      : 'Sin items'}
                  </div>

                  {/* Botones */}
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => reimprimir(r)}
                      className="flex-1 min-w-[120px] bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1">
                      🖨️ Reimprimir
                    </button>

                    {tabActiva === 'presupuesto' && (
                      <button
                        onClick={() => convertirEnVenta(r)}
                        disabled={convirtiendoId === r.id}
                        className="flex-1 min-w-[140px] bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1 disabled:opacity-50">
                        {convirtiendoId === r.id ? '...' : '✅ Convertir en venta'}
                      </button>
                    )}

                    <button
                      onClick={() => eliminar(r.id)}
                      disabled={eliminando === r.id}
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-semibold disabled:opacity-50">
                      {eliminando === r.id ? '...' : '🗑️'}
                    </button>
                  </div>

                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="bg-white border-t text-center py-2 text-xs text-gray-400 mt-8">
        Gestión Integral Pedidos
      </footer>
    </div>
  );
}

export default MiHistorial;
