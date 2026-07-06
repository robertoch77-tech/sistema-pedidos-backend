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

interface Producto {
  id_producto: number;
  cod_producto: string;
  des_producto: string;
  precio_producto?: number;
  stock_temporal?: number;
  des_producto_marca?: string;
}

interface ItemTicket {
  producto: Producto;
  cantidad: number;
  precioVenta: number;
}

const formatPrecio = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const arreglarNombre = (txt?: string) => (txt || '').replace(/�/g, 'Ñ');

function MisTickets() {
  const cliente = JSON.parse(localStorage.getItem('cliente') || '{}');
  const mayorista_id = cliente.mayorista_id;

  const [ganancia, setGananciaState] = useState<number>(() => {
    const g = parseFloat(localStorage.getItem('mis_precios_ganancia') || '');
    return isNaN(g) ? 30 : g;
  });

  const [cfg, setCfg] = useState({
    razon_social: '',
    descuento_1: 0,
    descuento_2: 0,
    descuento_3: 0,
    iva: 21,
  });

  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(false);
  const [items, setItems] = useState<ItemTicket[]>([]);
  const [mostrarResultados, setMostrarResultados] = useState(false);

  useEffect(() => {
    if (!mayorista_id) return;
    fetch(`${API}/api/mayoristas/${mayorista_id}/configuracion`)
      .then(r => r.json())
      .then(data => setCfg({
        razon_social: data.razon_social || '',
        descuento_1: data.descuento_1 || 0,
        descuento_2: data.descuento_2 || 0,
        descuento_3: data.descuento_3 || 0,
        iva: data.iva ?? 21,
      }))
      .catch(() => {});
  }, [mayorista_id]);

  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 2) { setResultados([]); setMostrarResultados(false); return; }
    const timer = setTimeout(async () => {
      setCargando(true);
      try {
        const res = await fetch(`${API}/api/productos/${mayorista_id}?busqueda=${encodeURIComponent(q)}&pagina=1`);
        const data = await res.json();
        setResultados(data.productos || []);
        setMostrarResultados(true);
      } catch {} finally { setCargando(false); }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line
  }, [busqueda]);

  const calcularPrecioVenta = (precioBase: number) => {
    const neto = precioBase
      * (1 - cfg.descuento_1 / 100)
      * (1 - cfg.descuento_2 / 100)
      * (1 - cfg.descuento_3 / 100);
    const costo = neto * (1 + cfg.iva / 100);
    return costo * (1 + ganancia / 100);
  };

  const agregarProducto = (p: Producto) => {
    const idx = items.findIndex(i => i.producto.id_producto === p.id_producto);
    if (idx >= 0) {
      setItems(prev => prev.map((i, j) => j === idx ? { ...i, cantidad: i.cantidad + 1 } : i));
    } else {
      setItems(prev => [...prev, {
        producto: p,
        cantidad: 1,
        precioVenta: calcularPrecioVenta(p.precio_producto || 0),
      }]);
    }
    setBusqueda('');
    setResultados([]);
    setMostrarResultados(false);
  };

  const cambiarCantidad = (id: number, delta: number) => {
    setItems(prev => {
      const updated = prev.map(i => i.producto.id_producto === id
        ? { ...i, cantidad: i.cantidad + delta }
        : i);
      return updated.filter(i => i.cantidad > 0);
    });
  };

  const setGanancia = (v: number) => {
    setGananciaState(v);
    localStorage.setItem('mis_precios_ganancia', String(v));
    // Recalcular precios de items existentes
    setItems(prev => prev.map(i => ({
      ...i,
      precioVenta: (() => {
        const neto = (i.producto.precio_producto || 0)
          * (1 - cfg.descuento_1 / 100)
          * (1 - cfg.descuento_2 / 100)
          * (1 - cfg.descuento_3 / 100);
        const costo = neto * (1 + cfg.iva / 100);
        return costo * (1 + v / 100);
      })(),
    })));
  };

  const total = items.reduce((acc, i) => acc + i.precioVenta * i.cantidad, 0);

  const generarPDF = () => {
    if (items.length === 0) return;
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Ticket de Venta', 14, 16);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    let y = 22;
    if (cfg.razon_social) { doc.text(cfg.razon_social, 14, y); y += 6; }
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-AR')}`, 14, y);
    y += 6;

    autoTable(doc, {
      head: [['Producto', 'Cant.', 'P. Unitario', 'Subtotal']],
      body: items.map(i => [
        arreglarNombre(i.producto.des_producto),
        String(i.cantidad),
        `$${formatPrecio(i.precioVenta)}`,
        `$${formatPrecio(i.precioVenta * i.cantidad)}`,
      ]),
      startY: y + 2,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [202, 138, 4] },
      columnStyles: {
        0: { cellWidth: 90 },
        1: { cellWidth: 18, halign: 'center' },
        2: { cellWidth: 38, halign: 'right' },
        3: { cellWidth: 38, halign: 'right' },
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text(`Total: $${formatPrecio(total)}`, 14, finalY);

    doc.save(`ticket-${new Date().toISOString().substring(0, 10)}.pdf`);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* NAVBAR */}
      <nav className="bg-white shadow-sm px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Logo size={26} />
          <div>
            <p className="text-xs text-gray-400 leading-none">
              Gestión Integral Pedidos{cfg.razon_social ? ` | ${cfg.razon_social}` : ''}
            </p>
            <h1 className="text-lg font-bold text-yellow-600">🧾 Mis Tickets</h1>
          </div>
        </div>
        <a href="/cliente" className="text-sm text-gray-500 hover:text-gray-700 font-medium">← Volver</a>
      </nav>

      <div className="p-4 max-w-2xl mx-auto">

        {/* GANANCIA */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex items-center gap-4">
          <p className="text-sm font-medium text-gray-700">% Ganancia:</p>
          <input
            type="number" min={0} max={500} step={1}
            value={ganancia}
            onChange={e => setGanancia(Math.max(0, parseFloat(e.target.value) || 0))}
            className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
          <p className="text-xs text-gray-400">Mismo % que Mis Precios</p>
        </div>

        {/* BUSCADOR */}
        <div className="relative mb-4">
          <input
            type="text"
            placeholder="Buscá un producto para agregar al ticket..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
          {cargando && (
            <span className="absolute right-3 top-3 text-xs text-gray-400">Buscando...</span>
          )}
          {mostrarResultados && resultados.length > 0 && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
              {resultados.map(p => (
                <button key={p.id_producto} onClick={() => agregarProducto(p)}
                  className="w-full text-left px-4 py-2.5 hover:bg-yellow-50 border-b border-gray-100 last:border-0">
                  <span className="font-medium text-gray-800 text-sm">{arreglarNombre(p.des_producto)}</span>
                  <span className="text-xs text-gray-400 ml-2 font-mono">{p.cod_producto}</span>
                  {p.precio_producto ? (
                    <span className="float-right text-xs text-yellow-700 font-semibold">
                      Venta: ${formatPrecio(calcularPrecioVenta(p.precio_producto))}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* LISTA DE ITEMS */}
        {items.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-3">🧾</div>
            <p className="text-lg">Buscá productos para armar el ticket</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead className="bg-yellow-50 text-gray-600 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-2">Producto</th>
                    <th className="px-2 py-2 text-center">Cant.</th>
                    <th className="px-4 py-2 text-right">Precio</th>
                    <th className="px-4 py-2 text-right">Subtotal</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(i => (
                    <tr key={i.producto.id_producto} className="border-t border-gray-100">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{arreglarNombre(i.producto.des_producto)}</p>
                        <p className="text-xs text-gray-400 font-mono">{i.producto.cod_producto}</p>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => cambiarCantidad(i.producto.id_producto, -1)}
                            className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-sm leading-none">−</button>
                          <span className="w-7 text-center font-semibold">{i.cantidad}</span>
                          <button onClick={() => cambiarCantidad(i.producto.id_producto, 1)}
                            className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-sm leading-none">+</button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">${formatPrecio(i.precioVenta)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">${formatPrecio(i.precioVenta * i.cantidad)}</td>
                      <td className="px-2 py-3 text-center">
                        <button onClick={() => setItems(prev => prev.filter(x => x.producto.id_producto !== i.producto.id_producto))}
                          className="text-red-400 hover:text-red-600 text-base leading-none">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* TOTAL */}
              <div className="bg-yellow-50 px-4 py-3 flex justify-between items-center border-t border-yellow-100">
                <span className="font-semibold text-gray-700">Total</span>
                <span className="text-xl font-bold text-yellow-700">${formatPrecio(total)}</span>
              </div>
            </div>

            {/* BOTONES */}
            <div className="flex gap-3">
              <button onClick={() => setItems([])}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl text-sm font-semibold">
                🗑️ Limpiar
              </button>
              <button onClick={generarPDF}
                className="flex-2 flex-grow-[2] bg-yellow-500 hover:bg-yellow-600 text-white py-3 rounded-xl text-sm font-semibold">
                🖨️ Imprimir ticket (PDF)
              </button>
            </div>
          </>
        )}
      </div>

      <footer className="bg-white border-t text-center py-2 text-xs text-gray-400 mt-8">
        Gestión Integral Pedidos
      </footer>
    </div>
  );
}

export default MisTickets;
