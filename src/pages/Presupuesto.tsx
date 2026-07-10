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

interface ItemPresupuesto {
  id: string;
  nombre: string;
  codigo: string;
  cantidad: number;
  precio: number;
  esLibre: boolean;
}

const formatPrecio = (n: number) =>
  (n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const arreglarNombre = (txt?: string) => (txt || '').replace(/�/g, 'Ñ');

function Presupuesto() {
  const cliente = JSON.parse(localStorage.getItem('cliente') || '{}');
  const mayorista_id = cliente.mayorista_id;

  const [cfg, setCfg] = useState({
    razon_social: '',
    descuento_1: 0,
    descuento_2: 0,
    descuento_3: 0,
    iva: 21,
  });

  const [ganancia, setGananciaState] = useState<number>(() => {
    const g = parseFloat(localStorage.getItem('mis_precios_ganancia') || '');
    return isNaN(g) ? 30 : g;
  });

  // Destinatario
  const [tipoDestinatario, setTipoDestinatario] = useState<'cliente_final' | 'proveedor'>('cliente_final');
  const [para, setPara] = useState('');
  const [cuit, setCuit] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [validezHasta, setValidezHasta] = useState('');
  const [condicionesPago, setCondicionesPago] = useState('');
  const [observaciones, setObservaciones] = useState('');

  // Productos
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [cargandoBusqueda, setCargandoBusqueda] = useState(false);
  const [mostrarResultados, setMostrarResultados] = useState(false);
  const [items, setItems] = useState<ItemPresupuesto[]>([]);

  // Producto libre
  const [libreNombre, setLibreNombre] = useState('');
  const [librePrecio, setLibrePrecio] = useState('');
  const [mostrarFormLibre, setMostrarFormLibre] = useState(false);

  // Precio editable
  const [precioEditando, setPrecioEditando] = useState<string | null>(null);
  const [precioTemporal, setPrecioTemporal] = useState('');

  // Descuento global
  const [descuentoGlobal, setDescuentoGlobal] = useState(0);

  // Tamaño hoja
  const [tamHoja, setTamHoja] = useState<'A4' | 'A5'>('A4');

  // Estado de acciones
  const [guardando, setGuardando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState('');

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
    setItems(prev => [...prev, {
      id: `libre-${Date.now()}`,
      nombre,
      codigo: '',
      cantidad: 1,
      precio,
      esLibre: true,
    }]);
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

  const subtotal = items.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
  const montoDescuento = subtotal * (descuentoGlobal / 100);
  const total = subtotal - montoDescuento;

  const bodyHistorial = (tipo: string) => ({
    mayorista_id,
    cliente_cuit: cliente.cuit,
    tipo,
    tipo_destinatario: tipoDestinatario,
    cliente_final_nombre: para || null,
    cliente_final_cuit: cuit || null,
    cliente_final_direccion: direccion || null,
    cliente_final_telefono: telefono || null,
    validez_hasta: validezHasta || null,
    condiciones_pago: condicionesPago || null,
    descuento_global: descuentoGlobal || null,
    observaciones: observaciones || null,
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
  });

  const guardarEnHistorial = async (tipo: string): Promise<{ ok: boolean; numero_correlativo: number }> => {
    try {
      const res = await fetch(`${API}/api/historial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyHistorial(tipo)),
      });
      const data = await res.json();
      return { ok: data.ok, numero_correlativo: data.numero_correlativo || 0 };
    } catch {
      return { ok: false, numero_correlativo: 0 };
    }
  };

  const construirPDF = (numCorrelativo: number) => {
    const formato = tamHoja === 'A5' ? 'a5' : 'a4';
    const doc = new jsPDF({ format: formato });
    const ancho = tamHoja === 'A5' ? 148 : 210;
    const mg = 14;

    // Título
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text(`PRESUPUESTO N°${numCorrelativo}`, mg, 16);

    // Subtítulo / razón social
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
    let y = 23;
    if (cfg.razon_social) { doc.text(cfg.razon_social, mg, y); y += 5; }
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-AR')}`, mg, y);
    doc.setTextColor(0);
    y += 7;

    // Destinatario
    const labelDestinatario = tipoDestinatario === 'proveedor' ? 'Proveedor' : 'Cliente';
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text(`${labelDestinatario}:`, mg, y); y += 5;
    doc.setFont('helvetica', 'normal');
    if (para)       { doc.text(`Nombre: ${para}`, mg + 2, y); y += 4; }
    if (cuit)       { doc.text(`CUIT: ${cuit}`, mg + 2, y); y += 4; }
    if (direccion)  { doc.text(`Dirección: ${direccion}`, mg + 2, y); y += 4; }
    if (telefono)   { doc.text(`Tel: ${telefono}`, mg + 2, y); y += 4; }
    if (validezHasta) {
      doc.text(`Válido hasta: ${new Date(validezHasta + 'T12:00:00').toLocaleDateString('es-AR')}`, mg + 2, y);
      y += 4;
    }
    y += 3;

    // Tabla de productos
    const colDesc = ancho - mg * 2 - 20 - 38 - 38;
    autoTable(doc, {
      head: [['Código', 'Descripción', 'Cant.', 'P. Unit.', 'Subtotal']],
      body: items.map(i => [
        i.codigo || '—',
        arreglarNombre(i.nombre),
        String(i.cantidad),
        `$${formatPrecio(i.precio)}`,
        `$${formatPrecio(i.precio * i.cantidad)}`,
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
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);

    if (descuentoGlobal > 0) {
      doc.text(`Subtotal: $${formatPrecio(subtotal)}`, mg, finalY); finalY += 5;
      doc.text(`Descuento ${descuentoGlobal}%: -$${formatPrecio(montoDescuento)}`, mg, finalY); finalY += 5;
    }

    doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
    doc.text(`Total: $${formatPrecio(total)}`, mg, finalY); finalY += 8;

    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(60);
    if (condicionesPago) { doc.text(`Condiciones de pago: ${condicionesPago}`, mg, finalY); finalY += 5; }
    if (observaciones)  { doc.text(`Observaciones: ${observaciones}`, mg, finalY); }

    return doc;
  };

  const accionGuardarBorrador = async () => {
    if (!para.trim()) { alert('Ingresá el nombre del destinatario'); return; }
    setGuardando(true);
    const { ok } = await guardarEnHistorial('presupuesto');
    setGuardando(false);
    if (ok) {
      setMensajeExito('💾 Borrador guardado');
      setTimeout(() => setMensajeExito(''), 3000);
    }
  };

  const accionGenerarPDF = async () => {
    if (items.length === 0) { alert('Agregá al menos un producto'); return; }
    if (!para.trim()) { alert('Ingresá el nombre del destinatario'); return; }
    setGuardando(true);
    const { ok, numero_correlativo } = await guardarEnHistorial('presupuesto');
    setGuardando(false);
    const num = ok ? numero_correlativo : Date.now();
    const doc = construirPDF(num);
    doc.save(`presupuesto-${num}-${new Date().toISOString().substring(0, 10)}.pdf`);
    if (ok) {
      setMensajeExito('✅ PDF generado y guardado');
      setTimeout(() => setMensajeExito(''), 3000);
    }
  };

  const accionWhatsApp = async () => {
    if (items.length === 0) { alert('Agregá al menos un producto'); return; }
    if (!para.trim()) { alert('Ingresá el nombre del destinatario'); return; }
    setGuardando(true);
    const { ok, numero_correlativo } = await guardarEnHistorial('presupuesto');
    setGuardando(false);
    const num = ok ? numero_correlativo : Date.now();
    const doc = construirPDF(num);
    doc.save(`presupuesto-${num}.pdf`);
    const mensaje = `Te adjunto el presupuesto N°${num} por $${formatPrecio(total)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank');
  };

  const accionConvertirVenta = async () => {
    if (items.length === 0) { alert('Agregá al menos un producto'); return; }
    if (!para.trim()) { alert('Ingresá el nombre del destinatario'); return; }
    if (!window.confirm('¿Convertir este presupuesto en venta? Se guardará en el historial como venta.')) return;
    setGuardando(true);
    const { ok } = await guardarEnHistorial('venta');
    setGuardando(false);
    if (ok) {
      window.location.href = '/mi-historial';
    } else {
      alert('Error al guardar. Intentá de nuevo.');
    }
  };

  const limpiar = () => {
    setItems([]);
    setPara('');
    setCuit('');
    setDireccion('');
    setTelefono('');
    setValidezHasta('');
    setCondicionesPago('');
    setObservaciones('');
    setDescuentoGlobal(0);
    setMensajeExito('');
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
            <h1 className="text-lg font-bold text-emerald-700">📄 Presupuesto</h1>
          </div>
        </div>
        <a href="/cliente" className="text-sm text-gray-500 hover:text-gray-700 font-medium">← Volver</a>
      </nav>

      <div className="p-4 max-w-2xl mx-auto space-y-4">

        {/* GANANCIA */}
        <div className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-4">
          <p className="text-sm font-medium text-gray-700">% Ganancia:</p>
          <input
            type="number" min={0} max={500} step={1}
            value={ganancia}
            onChange={e => setGanancia(Math.max(0, parseFloat(e.target.value) || 0))}
            className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <p className="text-xs text-gray-400">Aplica sobre precios del catálogo</p>
        </div>

        {/* DESTINATARIO */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">📋 Datos del destinatario</p>

          {/* Tipo */}
          <div className="flex gap-2 mb-4">
            {(['cliente_final', 'proveedor'] as const).map(t => (
              <button key={t}
                onClick={() => setTipoDestinatario(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                  tipoDestinatario === t
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300'
                }`}>
                {t === 'cliente_final' ? '👤 Para cliente final' : '🏭 Para proveedor'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Para: <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={para}
                onChange={e => setPara(e.target.value)}
                placeholder="Nombre del destinatario"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">CUIT <span className="text-gray-300">(opcional)</span></label>
              <input type="text" value={cuit} onChange={e => setCuit(e.target.value)}
                placeholder="20-12345678-9"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Teléfono <span className="text-gray-300">(opcional)</span></label>
              <input type="text" value={telefono} onChange={e => setTelefono(e.target.value)}
                placeholder="11-1234-5678"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Dirección <span className="text-gray-300">(opcional)</span></label>
              <input type="text" value={direccion} onChange={e => setDireccion(e.target.value)}
                placeholder="Av. Corrientes 1234"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Validez hasta <span className="text-gray-300">(opcional)</span></label>
              <input type="date" value={validezHasta} onChange={e => setValidezHasta(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Condiciones de pago <span className="text-gray-300">(opcional)</span></label>
              <input type="text" value={condicionesPago} onChange={e => setCondicionesPago(e.target.value)}
                placeholder="Ej: 50% anticipo, saldo contra entrega"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
          </div>
        </div>

        {/* BUSCADOR CATÁLOGO */}
        <div className="relative">
          <input
            type="text"
            placeholder="Buscá un producto del catálogo..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          {cargandoBusqueda && (
            <span className="absolute right-3 top-3 text-xs text-gray-400">Buscando...</span>
          )}
          {mostrarResultados && resultados.length > 0 && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
              {resultados.map(p => (
                <button key={p.id_producto} onClick={() => agregarDesdeCatalogo(p)}
                  className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 border-b border-gray-100 last:border-0">
                  <span className="font-medium text-gray-800 text-sm">{arreglarNombre(p.des_producto)}</span>
                  <span className="text-xs text-gray-400 ml-2 font-mono">{p.cod_producto}</span>
                  {p.precio_producto ? (
                    <span className="float-right text-xs text-emerald-700 font-semibold">
                      ${formatPrecio(calcularPrecioVenta(p.precio_producto))}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* PRODUCTO LIBRE */}
        {!mostrarFormLibre ? (
          <button
            onClick={() => setMostrarFormLibre(true)}
            className="w-full border-2 border-dashed border-gray-300 hover:border-emerald-400 text-gray-500 hover:text-emerald-600 rounded-xl py-2.5 text-sm font-medium transition-colors">
            ➕ Agregar producto libre
          </button>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-2 items-end">
            <div className="flex-[2] min-w-[150px]">
              <label className="text-xs text-gray-500 block mb-1">Nombre</label>
              <input type="text" value={libreNombre} onChange={e => setLibreNombre(e.target.value)}
                placeholder="Descripción del producto" autoFocus
                onKeyDown={e => e.key === 'Enter' && agregarLibre()}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div className="flex-1 min-w-[100px]">
              <label className="text-xs text-gray-500 block mb-1">Precio</label>
              <input type="text" value={librePrecio} onChange={e => setLibrePrecio(e.target.value)}
                placeholder="0.00" onKeyDown={e => e.key === 'Enter' && agregarLibre()}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <button onClick={agregarLibre}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
              Agregar
            </button>
            <button onClick={() => { setMostrarFormLibre(false); setLibreNombre(''); setLibrePrecio(''); }}
              className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded-lg text-sm">
              Cancelar
            </button>
          </div>
        )}

        {/* TABLA DE ITEMS */}
        {items.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-emerald-50 text-gray-600 text-xs uppercase">
                  <tr>
                    <th className="text-left px-3 py-2">Cód.</th>
                    <th className="text-left px-3 py-2">Producto</th>
                    <th className="px-2 py-2 text-center">Cant.</th>
                    <th className="px-3 py-2 text-right">Precio</th>
                    <th className="px-3 py-2 text-right">Subtotal</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(i => (
                    <tr key={i.id} className="border-t border-gray-100">
                      <td className="px-3 py-3 text-xs text-gray-400 font-mono whitespace-nowrap">
                        {i.codigo || '—'}
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-gray-800 text-sm">{arreglarNombre(i.nombre)}</p>
                        {i.esLibre && (
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">Libre</span>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => cambiarCantidad(i.id, -1)}
                            className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-sm leading-none">−</button>
                          <span className="w-7 text-center font-semibold text-sm">{i.cantidad}</span>
                          <button onClick={() => cambiarCantidad(i.id, 1)}
                            className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-sm leading-none">+</button>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {precioEditando === i.id ? (
                          <input
                            type="text"
                            value={precioTemporal}
                            onChange={e => setPrecioTemporal(e.target.value)}
                            onBlur={() => confirmarEdicionPrecio(i.id)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') confirmarEdicionPrecio(i.id);
                              if (e.key === 'Escape') setPrecioEditando(null);
                            }}
                            autoFocus
                            className="w-24 text-right border border-emerald-400 rounded px-2 py-1 text-sm focus:outline-none"
                          />
                        ) : (
                          <button
                            onClick={() => { setPrecioEditando(i.id); setPrecioTemporal(String(i.precio.toFixed(2))); }}
                            title="Click para editar precio"
                            className="text-gray-700 hover:text-emerald-700 hover:underline transition-colors text-sm"
                          >
                            ${formatPrecio(i.precio)}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-gray-800 text-sm">
                        ${formatPrecio(i.precio * i.cantidad)}
                      </td>
                      <td className="px-2 py-3 text-center">
                        <button onClick={() => setItems(prev => prev.filter(x => x.id !== i.id))}
                          className="text-red-400 hover:text-red-600 text-base leading-none">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* DESCUENTO + TOTALES */}
            <div className="border-t border-gray-100 p-4 space-y-2">
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600 font-medium whitespace-nowrap">Descuento global %:</label>
                <input
                  type="number" min={0} max={100} step={0.5}
                  value={descuentoGlobal || ''}
                  onChange={e => setDescuentoGlobal(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                  placeholder="0"
                  className="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              {descuentoGlobal > 0 && (
                <>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Subtotal</span>
                    <span>${formatPrecio(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-red-500">
                    <span>Descuento ({descuentoGlobal}%)</span>
                    <span>-${formatPrecio(montoDescuento)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between font-bold text-lg text-emerald-700 border-t pt-2">
                <span>Total</span>
                <span>${formatPrecio(total)}</span>
              </div>
            </div>
          </div>
        )}

        {/* OBSERVACIONES */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <label className="text-sm font-medium text-gray-700 block mb-2">
            Observaciones <span className="text-xs font-normal text-gray-400">(opcional)</span>
          </label>
          <textarea
            value={observaciones}
            onChange={e => setObservaciones(e.target.value)}
            rows={2}
            placeholder="Notas adicionales al pie del presupuesto..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
          />
        </div>

        {/* TAMAÑO HOJA */}
        <div className="flex items-center gap-3">
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

        {/* ACCIONES */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={accionGuardarBorrador}
            disabled={guardando}
            className="col-span-2 sm:col-span-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors">
            💾 Guardar borrador
          </button>
          <button
            onClick={accionGenerarPDF}
            disabled={guardando}
            className="col-span-2 sm:col-span-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors">
            🖨️ Generar PDF
          </button>
          <button
            onClick={accionWhatsApp}
            disabled={guardando}
            className="col-span-2 sm:col-span-1 bg-green-500 hover:bg-green-600 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors">
            📱 Compartir WhatsApp
          </button>
          <button
            onClick={accionConvertirVenta}
            disabled={guardando}
            className="col-span-2 sm:col-span-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors">
            ✅ Convertir en venta
          </button>
        </div>

        <button
          onClick={limpiar}
          className="w-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 py-2.5 rounded-xl text-sm font-medium transition-colors">
          🗑️ Limpiar todo
        </button>

        {mensajeExito && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3 text-center font-medium">
            {mensajeExito}
          </div>
        )}

      </div>

      <footer className="bg-white border-t text-center py-2 text-xs text-gray-400 mt-8">
        Gestión Integral Pedidos
      </footer>
    </div>
  );
}

export default Presupuesto;
