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
}

interface ItemVenta {
  id: string;
  nombre: string;
  codigo: string;
  cantidad: number;
  precio: number;
  esLibre: boolean;
}

interface ClienteFinal {
  nombre: string;
  cuit: string;
  direccion: string;
  telefono: string;
}

const FORMAS_PAGO = ['Efectivo', 'Transferencia', 'Cheque', 'Otro'];

const formatPrecio = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const arreglarNombre = (txt?: string) => (txt || '').replace(/�/g, 'Ñ');

function CalculadoraVenta() {
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

  // Buscador catálogo
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [cargandoBusqueda, setCargandoBusqueda] = useState(false);
  const [mostrarResultados, setMostrarResultados] = useState(false);

  // Items de la venta
  const [items, setItems] = useState<ItemVenta[]>([]);

  // Producto libre
  const [libreNombre, setLibreNombre] = useState('');
  const [librePrecio, setLibrePrecio] = useState('');
  const [mostrarFormLibre, setMostrarFormLibre] = useState(false);

  // Precio editable
  const [precioEditando, setPrecioEditando] = useState<string | null>(null);
  const [precioTemporal, setPrecioTemporal] = useState('');

  // Cliente final
  const [clienteFinal, setClienteFinal] = useState<ClienteFinal>({ nombre: '', cuit: '', direccion: '', telefono: '' });
  const [clienteFinalAbierto, setClienteFinalAbierto] = useState(false);

  // Forma de pago
  const [formaPago, setFormaPago] = useState('');
  const [montoRecibido, setMontoRecibido] = useState('');

  // Tamaño hoja y observaciones
  const [tamHoja, setTamHoja] = useState<'A4' | 'A5'>('A4');
  const [observaciones, setObservaciones] = useState('');
  const [guardado, setGuardado] = useState(false);

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
      setCargandoBusqueda(true);
      try {
        const res = await fetch(`${API}/api/productos/${mayorista_id}?busqueda=${encodeURIComponent(q)}&pagina=1`);
        const data = await res.json();
        setResultados(data.productos || []);
        setMostrarResultados(true);
      } catch {} finally { setCargandoBusqueda(false); }
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

  const setGanancia = (v: number) => {
    setGananciaState(v);
    localStorage.setItem('mis_precios_ganancia', String(v));
    setItems(prev => prev.map(i => {
      if (i.esLibre) return i;
      return i;
    }));
  };

  const agregarDesdeCatalogo = (p: Producto) => {
    const id = `cat-${p.id_producto}`;
    const existe = items.find(i => i.id === id);
    if (existe) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, cantidad: i.cantidad + 1 } : i));
    } else {
      setItems(prev => [...prev, {
        id,
        nombre: p.des_producto,
        codigo: p.cod_producto,
        cantidad: 1,
        precio: calcularPrecioVenta(p.precio_producto || 0),
        esLibre: false,
      }]);
    }
    setBusqueda('');
    setResultados([]);
    setMostrarResultados(false);
  };

  const agregarLibre = () => {
    const nombre = libreNombre.trim();
    const precio = parseFloat(librePrecio.replace(',', '.')) || 0;
    if (!nombre) return;
    const id = `libre-${Date.now()}`;
    setItems(prev => [...prev, { id, nombre, codigo: '', cantidad: 1, precio, esLibre: true }]);
    setLibreNombre('');
    setLibrePrecio('');
    setMostrarFormLibre(false);
  };

  const cambiarCantidad = (id: string, delta: number) => {
    setItems(prev => {
      const updated = prev.map(i => i.id === id ? { ...i, cantidad: i.cantidad + delta } : i);
      return updated.filter(i => i.cantidad > 0);
    });
  };

  const confirmarEdicionPrecio = (id: string) => {
    const val = parseFloat(precioTemporal.replace(',', '.'));
    if (!isNaN(val) && val >= 0) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, precio: val } : i));
    }
    setPrecioEditando(null);
    setPrecioTemporal('');
  };

  const total = items.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
  const montoNum = parseFloat(montoRecibido.replace(',', '.')) || 0;
  const vuelto = formaPago === 'Efectivo' && montoNum > 0 ? Math.max(0, montoNum - total) : null;

  const limpiar = () => {
    setItems([]);
    setClienteFinal({ nombre: '', cuit: '', direccion: '', telefono: '' });
    setFormaPago('');
    setMontoRecibido('');
    setObservaciones('');
  };

  const generarPDF = async () => {
    if (items.length === 0) return;

    let numCorrelativo: number = Date.now();
    try {
      const res = await fetch(`${API}/api/historial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mayorista_id,
          cliente_cuit: cliente.cuit,
          tipo: 'venta',
          cliente_final_nombre: clienteFinal.nombre || null,
          cliente_final_cuit: clienteFinal.cuit || null,
          cliente_final_direccion: clienteFinal.direccion || null,
          cliente_final_telefono: clienteFinal.telefono || null,
          forma_pago: formaPago || null,
          monto_recibido: montoNum || null,
          vuelto: vuelto,
          items: items.map(i => ({
            id_producto: i.esLibre ? null : parseInt(i.id.replace('cat-', '')),
            cod_producto: i.codigo,
            nombre: i.nombre,
            cantidad: i.cantidad,
            precio_unitario: i.precio,
            es_libre: i.esLibre,
          })),
          total,
          ganancia_porcentaje: ganancia,
          observaciones: observaciones || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        numCorrelativo = data.numero_correlativo;
        setGuardado(true);
        setTimeout(() => setGuardado(false), 3000);
      }
    } catch {}

    const formato = tamHoja === 'A5' ? 'a5' : 'a4';
    const doc = new jsPDF({ format: formato });
    const ancho = tamHoja === 'A5' ? 148 : 210;
    const mg = 14;

    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text('Comprobante de Venta', mg, 16);

    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
    let y = 22;
    if (cfg.razon_social) { doc.text(cfg.razon_social, mg, y); y += 5; }
    doc.text(`N° ${numCorrelativo}  ·  Fecha: ${new Date().toLocaleDateString('es-AR')}`, mg, y);
    doc.setTextColor(0);
    y += 7;

    if (clienteFinal.nombre || clienteFinal.cuit || clienteFinal.direccion || clienteFinal.telefono) {
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text('Cliente:', mg, y); y += 5;
      doc.setFont('helvetica', 'normal');
      if (clienteFinal.nombre)    { doc.text(`Nombre: ${clienteFinal.nombre}`, mg + 2, y); y += 4; }
      if (clienteFinal.cuit)      { doc.text(`CUIT: ${clienteFinal.cuit}`, mg + 2, y); y += 4; }
      if (clienteFinal.direccion) { doc.text(`Dirección: ${clienteFinal.direccion}`, mg + 2, y); y += 4; }
      if (clienteFinal.telefono)  { doc.text(`Tel: ${clienteFinal.telefono}`, mg + 2, y); y += 4; }
      y += 2;
    }

    autoTable(doc, {
      head: [['Producto', 'Cant.', 'P. Unitario', 'Subtotal']],
      body: items.map(i => [
        arreglarNombre(i.nombre),
        String(i.cantidad),
        `$${formatPrecio(i.precio)}`,
        `$${formatPrecio(i.precio * i.cantidad)}`,
      ]),
      startY: y,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [79, 70, 229] },
      columnStyles: {
        0: { cellWidth: ancho - mg * 2 - 18 - 38 - 38 },
        1: { cellWidth: 18, halign: 'center' },
        2: { cellWidth: 38, halign: 'right' },
        3: { cellWidth: 38, halign: 'right' },
      },
    });

    let finalY = (doc as any).lastAutoTable.finalY + 6;
    doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
    doc.text(`Total: $${formatPrecio(total)}`, mg, finalY);
    finalY += 7;

    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    if (formaPago) { doc.text(`Forma de pago: ${formaPago}`, mg, finalY); finalY += 5; }
    if (formaPago === 'Efectivo' && montoNum > 0) {
      doc.text(`Monto recibido: $${formatPrecio(montoNum)}`, mg, finalY); finalY += 5;
      doc.text(`Vuelto: $${formatPrecio(vuelto || 0)}`, mg, finalY); finalY += 5;
    }
    if (observaciones) { doc.text(`Obs: ${observaciones}`, mg, finalY); }

    doc.save(`venta-${numCorrelativo}-${new Date().toISOString().substring(0, 10)}.pdf`);
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
            <h1 className="text-lg font-bold text-indigo-600">🖩 Calculadora de Venta</h1>
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
            className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <p className="text-xs text-gray-400">Aplica sobre precios del catálogo</p>
        </div>

        {/* CLIENTE FINAL — colapsable */}
        <div className="bg-white rounded-xl shadow-sm mb-4 overflow-hidden">
          <button
            onClick={() => setClienteFinalAbierto(v => !v)}
            className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span>👤 Datos del cliente final <span className="text-xs text-gray-400 font-normal">(opcional)</span></span>
            <span className="text-gray-400">{clienteFinalAbierto ? '▲' : '▼'}</span>
          </button>
          {clienteFinalAbierto && (
            <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: 'Para (nombre)', key: 'nombre' as const, placeholder: 'Ej: Juan Pérez' },
                { label: 'CUIT', key: 'cuit' as const, placeholder: 'Ej: 20-12345678-9' },
                { label: 'Dirección', key: 'direccion' as const, placeholder: 'Ej: Av. Corrientes 1234' },
                { label: 'Teléfono', key: 'telefono' as const, placeholder: 'Ej: 11-1234-5678' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-gray-500 block mb-1">{f.label}</label>
                  <input
                    type="text"
                    value={clienteFinal[f.key]}
                    onChange={e => setClienteFinal(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* BUSCADOR CATÁLOGO */}
        <div className="relative mb-3">
          <input
            type="text"
            placeholder="Buscá un producto del catálogo..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {cargandoBusqueda && (
            <span className="absolute right-3 top-3 text-xs text-gray-400">Buscando...</span>
          )}
          {mostrarResultados && resultados.length > 0 && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
              {resultados.map(p => (
                <button key={p.id_producto} onClick={() => agregarDesdeCatalogo(p)}
                  className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 border-b border-gray-100 last:border-0">
                  <span className="font-medium text-gray-800 text-sm">{arreglarNombre(p.des_producto)}</span>
                  <span className="text-xs text-gray-400 ml-2 font-mono">{p.cod_producto}</span>
                  {p.precio_producto ? (
                    <span className="float-right text-xs text-indigo-700 font-semibold">
                      Venta: ${formatPrecio(calcularPrecioVenta(p.precio_producto))}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* PRODUCTO LIBRE */}
        <div className="mb-4">
          {!mostrarFormLibre ? (
            <button
              onClick={() => setMostrarFormLibre(true)}
              className="w-full border-2 border-dashed border-gray-300 hover:border-indigo-400 text-gray-500 hover:text-indigo-600 rounded-xl py-2.5 text-sm font-medium transition-colors">
              ➕ Agregar producto libre
            </button>
          ) : (
            <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-2 items-end">
              <div className="flex-[2] min-w-[150px]">
                <label className="text-xs text-gray-500 block mb-1">Nombre</label>
                <input
                  type="text"
                  value={libreNombre}
                  onChange={e => setLibreNombre(e.target.value)}
                  placeholder="Descripción del producto"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && agregarLibre()}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div className="flex-1 min-w-[100px]">
                <label className="text-xs text-gray-500 block mb-1">Precio</label>
                <input
                  type="text"
                  value={librePrecio}
                  onChange={e => setLibrePrecio(e.target.value)}
                  placeholder="0.00"
                  onKeyDown={e => e.key === 'Enter' && agregarLibre()}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <button onClick={agregarLibre}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
                Agregar
              </button>
              <button onClick={() => { setMostrarFormLibre(false); setLibreNombre(''); setLibrePrecio(''); }}
                className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded-lg text-sm">
                Cancelar
              </button>
            </div>
          )}
        </div>

        {/* TABLA DE ITEMS */}
        {items.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-3">🖩</div>
            <p className="text-lg">Buscá productos del catálogo o agregá productos libres</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead className="bg-indigo-50 text-gray-600 text-xs uppercase">
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
                    <tr key={i.id} className="border-t border-gray-100">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{arreglarNombre(i.nombre)}</p>
                        {i.codigo && <p className="text-xs text-gray-400 font-mono">{i.codigo}</p>}
                        {i.esLibre && <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-medium">Libre</span>}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => cambiarCantidad(i.id, -1)}
                            className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-sm leading-none">−</button>
                          <span className="w-7 text-center font-semibold">{i.cantidad}</span>
                          <button onClick={() => cambiarCantidad(i.id, 1)}
                            className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-sm leading-none">+</button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {precioEditando === i.id ? (
                          <input
                            type="text"
                            value={precioTemporal}
                            onChange={e => setPrecioTemporal(e.target.value)}
                            onBlur={() => confirmarEdicionPrecio(i.id)}
                            onKeyDown={e => { if (e.key === 'Enter') confirmarEdicionPrecio(i.id); if (e.key === 'Escape') setPrecioEditando(null); }}
                            autoFocus
                            className="w-24 text-right border border-indigo-400 rounded px-2 py-1 text-sm focus:outline-none"
                          />
                        ) : (
                          <button
                            onClick={() => { setPrecioEditando(i.id); setPrecioTemporal(String(i.precio.toFixed(2))); }}
                            title="Click para editar precio"
                            className="text-gray-700 hover:text-indigo-600 hover:underline transition-colors"
                          >
                            ${formatPrecio(i.precio)}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">${formatPrecio(i.precio * i.cantidad)}</td>
                      <td className="px-2 py-3 text-center">
                        <button onClick={() => setItems(prev => prev.filter(x => x.id !== i.id))}
                          className="text-red-400 hover:text-red-600 text-base leading-none">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="bg-indigo-50 px-4 py-3 flex justify-between items-center border-t border-indigo-100">
                <span className="font-semibold text-gray-700">Total</span>
                <span className="text-xl font-bold text-indigo-700">${formatPrecio(total)}</span>
              </div>
            </div>

            {/* FORMA DE PAGO */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Forma de pago</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {FORMAS_PAGO.map(fp => (
                  <button key={fp}
                    onClick={() => setFormaPago(prev => prev === fp ? '' : fp)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      formaPago === fp
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                    }`}>
                    {fp}
                  </button>
                ))}
              </div>
              {formaPago === 'Efectivo' && (
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">Monto recibido</label>
                    <input
                      type="text"
                      value={montoRecibido}
                      onChange={e => setMontoRecibido(e.target.value)}
                      placeholder="$0.00"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                  {vuelto !== null && (
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Vuelto</p>
                      <p className={`text-lg font-bold ${vuelto >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        ${formatPrecio(vuelto)}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* OBSERVACIONES */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <label className="text-sm font-medium text-gray-700 block mb-2">Observaciones <span className="text-xs font-normal text-gray-400">(opcional)</span></label>
              <textarea
                value={observaciones}
                onChange={e => setObservaciones(e.target.value)}
                rows={2}
                placeholder="Notas adicionales..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              />
            </div>

            {/* TAMAÑO + BOTONES */}
            <div className="flex items-center gap-3 mb-4">
              <p className="text-sm text-gray-600 font-medium">Tamaño:</p>
              {(['A4', 'A5'] as const).map(t => (
                <button key={t}
                  onClick={() => setTamHoja(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                    tamHoja === t
                      ? 'bg-gray-700 text-white border-gray-700'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                  }`}>
                  {t}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={limpiar}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl text-sm font-semibold">
                🗑️ Limpiar
              </button>
              <button onClick={generarPDF}
                className="flex-2 flex-grow-[2] bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-sm font-semibold">
                🖨️ Generar comprobante (PDF)
              </button>
            </div>

            {guardado && (
              <div className="mt-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3 text-center font-medium">
                ✅ Venta guardada en historial
              </div>
            )}
          </>
        )}
      </div>

      <footer className="bg-white border-t text-center py-2 text-xs text-gray-400 mt-8">
        Gestión Integral Pedidos
      </footer>
    </div>
  );
}

export default CalculadoraVenta;
