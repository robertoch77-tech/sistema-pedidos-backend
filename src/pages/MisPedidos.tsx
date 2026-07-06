import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const Logo = ({ size = 28 }: { size?: number }) => (
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

interface Pedido {
  id: number; numero_pedido: string; fecha_pedido: string;
  total_estimado: number; estado: string; items: any[];
}

const API = 'https://sistema-pedidos-backend-2hec.onrender.com';

function MisPedidos() {
  const cliente = JSON.parse(localStorage.getItem('cliente') || '{}');
  const mayorista_id = cliente.mayorista_id;

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(false);
  const [filtroFecha, setFiltroFecha] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [pedidoAbierto, setPedidoAbierto] = useState<number | null>(null);
  const [razonSocial, setRazonSocial] = useState('');

  useEffect(() => {
    if (!mayorista_id) return;
    fetch(`${API}/api/mayoristas/${mayorista_id}/configuracion`)
      .then(r => r.json())
      .then(data => setRazonSocial(data.razon_social || ''))
      .catch(() => {});
  }, [mayorista_id]);

  useEffect(() => {
    cargarPedidos();
  }, []);

  const cargarPedidos = async () => {
    setCargando(true);
    try {
      const res = await fetch(`${API}/api/pedidos/cliente/${cliente.cuit}?mayorista_id=${mayorista_id}`);
      const data = await res.json();
      setPedidos(Array.isArray(data) ? data : []);
    } catch (error) { console.error(error); } finally { setCargando(false); }
  };

  const formatPrecio = (n?: number) => (n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const generarComprobante = (pedido: Pedido) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Comprobante de pedido', 14, 16);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    let y = 23;
    if (razonSocial) { doc.text(razonSocial, 14, y); y += 6; }
    doc.setTextColor(0);
    doc.text(`Pedido N°: ${pedido.numero_pedido}`, 14, y); y += 6;
    doc.text(`Fecha: ${new Date(pedido.fecha_pedido).toLocaleDateString('es-AR')}`, 14, y); y += 6;
    doc.text(`Cliente: ${cliente.nombre || ''}`, 14, y); y += 6;

    const filas = (pedido.items || [])
      .filter((i: any) => i.nombre)
      .map((i: any) => [
        i.nombre,
        String(i.cantidad),
        `$${formatPrecio(i.precio_unitario * i.cantidad)}`,
      ]);

    autoTable(doc, {
      head: [['Producto', 'Cant.', 'Subtotal']],
      body: filas,
      startY: y + 2,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [22, 163, 74] },
      columnStyles: {
        0: { cellWidth: 120 },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 40, halign: 'right' },
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total estimado: $${formatPrecio(pedido.total_estimado)}`, 14, finalY);

    doc.save(`comprobante-pedido-${pedido.numero_pedido}.pdf`);
  };

  const pedidosFiltrados = pedidos.filter(p => {
    const coincideFecha = filtroFecha ? new Date(p.fecha_pedido).toLocaleDateString('es-AR').includes(filtroFecha) : true;
    const coincideEstado = (filtroEstado === '' || filtroEstado === 'todos') ? true : p.estado === filtroEstado;
    return coincideFecha && coincideEstado;
  });

  const colorEstado: Record<string, string> = {
    borrador: 'bg-gray-100 text-gray-600',
    enviado: 'bg-blue-100 text-blue-700',
    impreso: 'bg-green-100 text-green-700',
  };
  const labelEstado: Record<string, string> = {
    borrador: 'Borrador', enviado: 'Enviado', impreso: 'Confirmado',
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
            <h1 className="text-lg font-bold text-blue-600">Mis Pedidos</h1>
          </div>
        </div>
        <a href="/cliente" className="text-sm text-gray-500 hover:text-gray-700 font-medium">← Volver</a>
      </nav>

      <div className="p-4">
        <div className="flex gap-3 mb-4">
          <input type="text" placeholder="Filtrar por fecha (ej: 3/6/2026)"
            value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Estado...</option>
            <option value="todos">Todos</option>
            <option value="borrador">Borrador</option>
            <option value="enviado">Enviado</option>
            <option value="impreso">Confirmado</option>
          </select>
        </div>

        {cargando ? (
          <div className="text-center py-12 text-gray-400">Cargando pedidos...</div>
        ) : (filtroFecha === '' && filtroEstado === '') ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-6xl mb-4">📋</div>
            <p className="text-lg">Filtrá por fecha o elegí un estado para ver tus pedidos</p>
          </div>
        ) : pedidosFiltrados.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No se encontraron pedidos con ese filtro.</div>
        ) : (
          <div className="space-y-3">
            {pedidosFiltrados.map(pedido => (
              <div key={pedido.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 cursor-pointer"
                  onClick={() => setPedidoAbierto(pedidoAbierto === pedido.id ? null : pedido.id)}>
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-gray-800">#{pedido.numero_pedido}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{new Date(pedido.fecha_pedido).toLocaleDateString('es-AR')}</span>
                      <span className="text-gray-400">{pedidoAbierto === pedido.id ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${colorEstado[pedido.estado] || 'bg-gray-100 text-gray-600'}`}>
                    {labelEstado[pedido.estado] || pedido.estado}
                  </span>
                  <p className="text-green-600 font-bold mt-2">Total: ${formatPrecio(pedido.total_estimado)}</p>
                </div>
                {pedidoAbierto === pedido.id && (
                  <div className="border-t px-4 pb-4">
                    <p className="text-xs text-gray-500 font-semibold mt-3 mb-2">PRODUCTOS</p>
                    <div className="space-y-2">
                      {pedido.items?.filter((i: any) => i.nombre).map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center text-sm bg-gray-50 rounded-lg px-3 py-2">
                  <div>
      <span className="text-gray-800">{item.nombre}</span>
      {item.es_oferta && (
        <p className="text-xs text-orange-600 font-semibold">🎁 OFERTA: {item.oferta_titulo}</p>
      )}
    </div>
    <div className="flex items-center gap-3">
      <span className="text-gray-500">x{item.cantidad}</span>
      <span className="text-blue-600 font-semibold">${formatPrecio(item.precio_unitario * item.cantidad)}</span>
    </div>
  </div>
))}
                    </div>
                    {pedido.estado === 'borrador' && (
                      <a href={`/catalogo?editar=${pedido.id}`}
                        className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold flex items-center justify-center">
                        ✏️ Editar borrador
                      </a>
                    )}
                    {(pedido.estado === 'enviado' || pedido.estado === 'impreso') && (
                      <button onClick={() => generarComprobante(pedido)}
                        className="mt-3 w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2">
                        🧾 Descargar comprobante
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="bg-white border-t text-center py-2 text-xs text-gray-400 mt-4">
        Gestión Integral Pedidos
      </footer>
    </div>
  );
}

export default MisPedidos;