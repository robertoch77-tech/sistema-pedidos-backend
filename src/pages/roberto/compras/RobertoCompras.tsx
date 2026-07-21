import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../../config/api';

const NAVY  = '#1B2A4A';
const BLUE  = '#2B6CB0';
const GREEN = '#38A169';
const RED   = '#E53E3E';
const SEP   = '#63B3ED';
const GRAY  = '#718096';
const TEXT  = '#2D3748';
const BG    = '#F4F6F9';
const ORANGE = '#DD6B20';

const fmt = (v: number) =>
  `$${Number(v || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtFecha = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};

function getToken() {
  try { const s = localStorage.getItem('superadmin_session'); return s ? JSON.parse(s).token : ''; }
  catch { return ''; }
}
function getClienteId(): number | null {
  try { const s = localStorage.getItem('roberto_portal_session'); return s ? JSON.parse(s).cliente?.id ?? null : null; }
  catch { return null; }
}

let _tid = 1;
const nextId = () => _tid++;

// ── Types ─────────────────────────────────────────────────────
interface CompraRow {
  id: number;
  proveedor_nombre: string;
  numero_factura: string;
  tipo: string;
  fecha: string;
  total: number;
  estado: string;
}

interface Proveedor {
  id: number;
  nombre: string;
  cuit: string;
}

interface ProductoResult {
  id: number;
  codigo: string;
  descripcion: string;
  precio_costo: number;
  stock_actual: number;
  alicuota_iva: number;
}

interface ItemCompra {
  tempId: number;
  producto_id: number | null;
  descripcion: string;
  es_libre: boolean;
  cantidad: number;
  precio_unitario: number;
  alicuota_iva: number;
}

// ── Estilos comunes ───────────────────────────────────────────
const btnStyle = (bg: string, color = '#fff', disabled = false): React.CSSProperties => ({
  backgroundColor: disabled ? '#CBD5E0' : bg,
  color: disabled ? '#A0AEC0' : color,
  border: 'none', borderRadius: '8px',
  padding: '9px 16px', fontSize: '13px', fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
});

const inputStyle: React.CSSProperties = {
  border: '1.5px solid #CBD5E0', borderRadius: '8px', padding: '8px 12px',
  fontSize: '13px', color: TEXT, outline: 'none',
  width: '100%', boxSizing: 'border-box', backgroundColor: '#fff',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600, color: GRAY,
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px',
};

// ── Badge estado ──────────────────────────────────────────────
function BadgeEstado({ estado }: { estado: string }) {
  const map: Record<string, { bg: string; c: string }> = {
    pendiente: { bg: '#EBF8FF', c: BLUE },
    pagada:    { bg: '#F0FFF4', c: GREEN },
    parcial:   { bg: '#FFFBEB', c: ORANGE },
  };
  const s = map[estado] || { bg: '#EDF2F7', c: GRAY };
  return (
    <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, backgroundColor: s.bg, color: s.c }}>
      {estado.charAt(0).toUpperCase() + estado.slice(1)}
    </span>
  );
}

// ── Calcular totales detallados ───────────────────────────────
function calcTotalesDetalle(items: ItemCompra[], precioConIva: boolean) {
  let subtotal = 0, iva_total = 0;
  for (const it of items) {
    const alic   = it.alicuota_iva ?? 21;
    const precio = precioConIva ? it.precio_unitario / (1 + alic / 100) : it.precio_unitario;
    const sub    = precio * it.cantidad;
    const iva    = sub * (alic / 100);
    subtotal  += sub;
    iva_total += iva;
  }
  return { subtotal, iva_total, total: subtotal + iva_total };
}

// ── Componente principal ──────────────────────────────────────
function RobertoCompras() {
  const navigate = useNavigate();
  const cid      = getClienteId();
  const token    = getToken();
  const authHdr  = { 'x-superadmin-token': token };
  const jsonHdr  = { 'x-superadmin-token': token, 'Content-Type': 'application/json' };

  // Lista
  const [compras,      setCompras]      = useState<CompraRow[]>([]);
  const [totalReg,     setTotalReg]     = useState(0);
  const [pagina,       setPagina]       = useState(1);
  const [porPagina,    setPorPagina]    = useState(25);
  const [totalPags,    setTotalPags]    = useState(1);
  const [cargando,     setCargando]     = useState(false);

  // Filtros
  const [busqueda,     setBusqueda]     = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [fechaDesde,   setFechaDesde]   = useState('');
  const [fechaHasta,   setFechaHasta]   = useState('');

  // Modal
  const [modalOpen,    setModalOpen]    = useState(false);
  const [confirmado,   setConfirmado]   = useState<{ id: number; proveedor: string; total: number } | null>(null);

  // Modo
  const [modoDetalle,  setModoDetalle]  = useState(false);
  const [precioConIva, setPrecioConIva] = useState(false);

  // Campos cabecera
  const [busqProv,     setBusqProv]     = useState('');
  const [provsDrop,    setProvsDrop]    = useState<Proveedor[]>([]);
  const [provSel,      setProvSel]      = useState<Proveedor | null>(null);
  const [nroFactura,   setNroFactura]   = useState('');
  const [fechaComp,    setFechaComp]    = useState(new Date().toISOString().slice(0,10));
  const [observ,       setObserv]       = useState('');

  // Modo simple — totales manuales
  const [simpleSubtotal, setSimpleSubtotal] = useState('');
  const [simpleIvaPct,   setSimpleIvaPct]   = useState('21');
  const simpleIvaMonto = (parseFloat(simpleSubtotal)||0) * ((parseFloat(simpleIvaPct)||0) / 100);
  const simpleTotal    = (parseFloat(simpleSubtotal)||0) + simpleIvaMonto;

  // Modo detallado — ítems
  const [items,        setItems]        = useState<ItemCompra[]>([]);
  const [busqProd,     setBusqProd]     = useState('');
  const [prodsDrop,    setProdsDrop]    = useState<ProductoResult[]>([]);
  const [showDrop,     setShowDrop]     = useState(false);
  const [loadProd,     setLoadProd]     = useState(false);
  const prodInputRef = useRef<HTMLInputElement>(null);

  const { subtotal: detSubtotal, iva_total: detIva, total: detTotal } = calcTotalesDetalle(items, precioConIva);

  // Submit
  const [procesando,   setProcesando]   = useState(false);
  const [errMsg,       setErrMsg]       = useState('');

  // ── Cargar compras ────────────────────────────────────────
  const cargarCompras = useCallback(async () => {
    if (!cid) return;
    setCargando(true);
    try {
      const p = new URLSearchParams({
        page: String(pagina), limit: String(porPagina),
        ...(busqueda     && { buscar:      busqueda }),
        ...(filtroEstado && { estado:      filtroEstado }),
        ...(fechaDesde   && { fecha_desde: fechaDesde }),
        ...(fechaHasta   && { fecha_hasta: fechaHasta }),
      });
      const r = await fetch(`${API_BASE}/api/superadmin/compras/${cid}?${p}`, { headers: authHdr });
      if (r.ok) {
        const d = await r.json();
        setCompras(d.compras || []);
        setTotalReg(d.total  || 0);
        setTotalPags(d.paginas || 1);
      }
    } catch { /* silent */ }
    finally { setCargando(false); }
  }, [cid, pagina, porPagina, busqueda, filtroEstado, fechaDesde, fechaHasta]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(cargarCompras, 300);
    return () => clearTimeout(t);
  }, [cargarCompras]);

  // ── Buscar proveedores (debounce) ─────────────────────────
  useEffect(() => {
    if (!busqProv.trim() || provSel) { setProvsDrop([]); return; }
    const t = setTimeout(async () => {
      if (!cid) return;
      try {
        const r = await fetch(
          `${API_BASE}/api/superadmin/proveedores/${cid}?buscar=${encodeURIComponent(busqProv)}&limit=8`,
          { headers: authHdr }
        );
        if (r.ok) { const d = await r.json(); setProvsDrop(d.proveedores || []); }
      } catch { /* silent */ }
    }, 300);
    return () => clearTimeout(t);
  }, [busqProv, provSel]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Buscar productos (debounce) ───────────────────────────
  useEffect(() => {
    const q = busqProd.trim();
    if (!q) { setProdsDrop([]); setShowDrop(false); return; }
    const t = setTimeout(async () => {
      if (!cid) return;
      setLoadProd(true);
      try {
        const r = await fetch(
          `${API_BASE}/api/superadmin/importador/productos/${cid}?buscar=${encodeURIComponent(q)}&limit=8`,
          { headers: authHdr }
        );
        if (r.ok) {
          const d = await r.json();
          const lista: ProductoResult[] = d.productos || d.items || [];
          setProdsDrop(lista);
          setShowDrop(lista.length > 0);
        }
      } catch { /* silent */ }
      finally { setLoadProd(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [busqProd]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ítems ─────────────────────────────────────────
  const agregarProducto = (p: ProductoResult) => {
    setItems(prev => [...prev, {
      tempId:        nextId(),
      producto_id:   p.id,
      descripcion:   p.descripcion,
      es_libre:      false,
      cantidad:      1,
      precio_unitario: parseFloat(String(p.precio_costo)) || 0,
      alicuota_iva:  parseFloat(String(p.alicuota_iva)) || 21,
    }]);
    setProdsDrop([]); setShowDrop(false); setBusqProd('');
    setTimeout(() => prodInputRef.current?.focus(), 60);
  };

  const agregarLibre = () => {
    setItems(prev => [...prev, {
      tempId: nextId(), producto_id: null, descripcion: '',
      es_libre: true, cantidad: 1, precio_unitario: 0, alicuota_iva: 21,
    }]);
  };

  const actualizarItem = (tempId: number, campo: keyof ItemCompra, val: any) =>
    setItems(prev => prev.map(it => it.tempId === tempId ? { ...it, [campo]: val } : it));

  const eliminarItem = (tempId: number) =>
    setItems(prev => prev.filter(it => it.tempId !== tempId));

  // ── Reset modal ───────────────────────────────────────────
  const resetModal = () => {
    setModoDetalle(false); setPrecioConIva(false);
    setBusqProv(''); setProvsDrop([]); setProvSel(null);
    setNroFactura(''); setFechaComp(new Date().toISOString().slice(0,10)); setObserv('');
    setSimpleSubtotal(''); setSimpleIvaPct('21');
    setItems([]); setBusqProd(''); setProdsDrop([]); setShowDrop(false);
    setErrMsg(''); setConfirmado(null);
  };

  const abrirModal  = () => { resetModal(); setModalOpen(true); };
  const cerrarModal = () => { setModalOpen(false); if (confirmado) cargarCompras(); resetModal(); };

  // ── Guardar compra ────────────────────────────────────────
  const guardarCompra = async () => {
    if (!cid) return;

    const tipo = modoDetalle ? 'detallada' : 'simple';

    if (tipo === 'simple' && !(parseFloat(simpleSubtotal) > 0)) {
      setErrMsg('Ingresá el subtotal de la factura.'); return;
    }
    if (tipo === 'detallada' && items.length === 0) {
      setErrMsg('Agregá al menos un ítem.'); return;
    }

    const subtotal = tipo === 'simple' ? parseFloat(simpleSubtotal) || 0 : detSubtotal;
    const iva_monto = tipo === 'simple' ? simpleIvaMonto : detIva;
    const total     = tipo === 'simple' ? simpleTotal    : detTotal;

    const body: any = {
      proveedor_id:     provSel?.id   || null,
      proveedor_nombre: provSel?.nombre || busqProv.trim() || '',
      numero_factura:   nroFactura.trim(),
      fecha:            fechaComp,
      tipo,
      subtotal, iva_monto, total,
      observaciones:    observ,
    };

    if (tipo === 'detallada') {
      body.items = items.map(it => ({
        producto_id:     it.producto_id,
        es_libre:        it.es_libre,
        descripcion:     it.descripcion,
        cantidad:        it.cantidad,
        precio_unitario: it.precio_unitario,
        alicuota_iva:    it.alicuota_iva,
      }));
    }

    setProcesando(true); setErrMsg('');
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/compras/${cid}`, {
        method: 'POST', headers: jsonHdr, body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) { setErrMsg(data.mensaje || 'Error al guardar la compra'); return; }
      setConfirmado({ id: data.compra_id, proveedor: body.proveedor_nombre, total });
    } catch {
      setErrMsg('Error de red. Intentá de nuevo.');
    } finally {
      setProcesando(false);
    }
  };

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, padding: '28px', fontFamily: 'system-ui,-apple-system,sans-serif' }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/roberto/dashboard')} style={btnStyle('#EDF2F7', GRAY)}>← Volver</button>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: NAVY, margin: '0 0 2px' }}>🛒 Compras</h2>
            <p style={{ fontSize: '13px', color: GRAY, margin: 0 }}>{totalReg.toLocaleString('es-AR')} registros</p>
          </div>
        </div>
        <button onClick={abrirModal} style={btnStyle(BLUE)}>＋ Nueva compra</button>
      </div>

      {/* ── Filtros ────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={labelStyle}>Buscar</label>
            <input value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
              placeholder="Nro factura o proveedor..." style={inputStyle} />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label style={labelStyle}>Fecha desde</label>
            <input type="date" value={fechaDesde} onChange={e => { setFechaDesde(e.target.value); setPagina(1); }} style={inputStyle} />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label style={labelStyle}>Fecha hasta</label>
            <input type="date" value={fechaHasta} onChange={e => { setFechaHasta(e.target.value); setPagina(1); }} style={inputStyle} />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label style={labelStyle}>Estado</label>
            <select value={filtroEstado} onChange={e => { setFiltroEstado(e.target.value); setPagina(1); }}
              style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Todos</option>
              <option value="pendiente">Pendiente</option>
              <option value="pagada">Pagada</option>
              <option value="parcial">Parcial</option>
            </select>
          </div>
          {(busqueda || filtroEstado || fechaDesde || fechaHasta) && (
            <button onClick={() => { setBusqueda(''); setFiltroEstado(''); setFechaDesde(''); setFechaHasta(''); setPagina(1); }}
              style={{ ...btnStyle('#EDF2F7', GRAY), alignSelf: 'flex-end' }}>
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* ── Tabla ──────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        {cargando ? (
          <div style={{ padding: '48px', textAlign: 'center', color: GRAY }}>Cargando...</div>
        ) : compras.length === 0 ? (
          <div style={{ padding: '64px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '52px', marginBottom: '12px' }}>🛒</div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>No hay compras registradas</h3>
            <p style={{ fontSize: '14px', color: GRAY, margin: '0 0 24px' }}>Las facturas de proveedores aparecerán aquí.</p>
            <button onClick={abrirModal} style={btnStyle(BLUE)}>＋ Registrar primera compra</button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '650px' }}>
              <thead>
                <tr style={{ backgroundColor: '#EBF4FF' }}>
                  {['Fecha', 'Proveedor', 'Nro Factura', 'Tipo', 'Total', 'Estado'].map(col => (
                    <th key={col} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600, color: NAVY, borderBottom: `2px solid ${SEP}`, whiteSpace: 'nowrap' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compras.map((c, idx) => (
                  <tr key={c.id}
                    style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#EBF8FF'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#fff' : '#F7FAFC'; }}>
                    <td style={{ padding: '10px 14px', color: GRAY, whiteSpace: 'nowrap' }}>{fmtFecha(c.fecha)}</td>
                    <td style={{ padding: '10px 14px', color: TEXT, fontWeight: 500 }}>{c.proveedor_nombre || '—'}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: NAVY }}>{c.numero_factura || '—'}</td>
                    <td style={{ padding: '10px 14px', color: GRAY }}>{c.tipo === 'detallada' ? 'Detallada' : 'Simple'}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: RED, fontFamily: 'monospace' }}>{fmt(c.total)}</td>
                    <td style={{ padding: '10px 14px' }}><BadgeEstado estado={c.estado} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Paginación ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: GRAY }}>
          Filas por página:
          {[10, 25, 50].map(n => (
            <button key={n} onClick={() => { setPorPagina(n); setPagina(1); }}
              style={{ backgroundColor: porPagina === n ? BLUE : '#EDF2F7', color: porPagina === n ? '#fff' : GRAY, border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
              {n}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: GRAY }}>
          Página {pagina} de {totalPags}
          <button disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}
            style={{ backgroundColor: pagina <= 1 ? '#EDF2F7' : NAVY, color: pagina <= 1 ? GRAY : '#fff', border: 'none', borderRadius: '6px', padding: '5px 14px', fontSize: '12px', fontWeight: 600, cursor: pagina <= 1 ? 'not-allowed' : 'pointer' }}>
            ← Anterior
          </button>
          <button disabled={pagina >= totalPags} onClick={() => setPagina(p => p + 1)}
            style={{ backgroundColor: pagina >= totalPags ? '#EDF2F7' : NAVY, color: pagina >= totalPags ? GRAY : '#fff', border: 'none', borderRadius: '6px', padding: '5px 14px', fontSize: '12px', fontWeight: 600, cursor: pagina >= totalPags ? 'not-allowed' : 'pointer' }}>
            Siguiente →
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          MODAL NUEVA COMPRA
      ═══════════════════════════════════════════════════════ */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '16px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '860px', boxShadow: '0 24px 72px rgba(0,0,0,0.35)', margin: 'auto' }}>

            {/* Header modal */}
            <div style={{ padding: '18px 28px', borderBottom: `2px solid ${SEP}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: NAVY, margin: 0 }}>
                {confirmado ? '✅ Compra registrada' : '🛒 Nueva Compra'}
              </h2>
              <button onClick={cerrarModal} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: GRAY }}>×</button>
            </div>

            {/* ── PANTALLA CONFIRMACIÓN ── */}
            {confirmado ? (
              <div style={{ padding: '40px 28px', textAlign: 'center' }}>
                <div style={{ fontSize: '52px', marginBottom: '12px' }}>✅</div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, color: GREEN, margin: '0 0 8px' }}>¡Compra registrada!</h3>
                <p style={{ color: GRAY, margin: '0 0 4px' }}>Proveedor: <strong>{confirmado.proveedor || 'Sin proveedor'}</strong></p>
                <div style={{ fontSize: '28px', fontWeight: 800, color: RED, margin: '16px 0 28px' }}>{fmt(confirmado.total)}</div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button onClick={() => { resetModal(); }}
                    style={btnStyle(BLUE)}>＋ Nueva compra</button>
                  <button onClick={cerrarModal} style={btnStyle('#EDF2F7', GRAY)}>Cerrar</button>
                </div>
              </div>
            ) : (

            /* ── FORMULARIO ── */
            <div style={{ padding: '24px 28px' }}>

              {/* Toggle modo */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                <button onClick={() => setModoDetalle(false)}
                  style={{ ...btnStyle(!modoDetalle ? BLUE : '#EDF2F7', !modoDetalle ? '#fff' : GRAY), fontSize: '12px', padding: '7px 16px' }}>
                  📄 Importe directo
                </button>
                <button onClick={() => setModoDetalle(true)}
                  style={{ ...btnStyle(modoDetalle ? BLUE : '#EDF2F7', modoDetalle ? '#fff' : GRAY), fontSize: '12px', padding: '7px 16px' }}>
                  📦 Con artículos
                </button>
              </div>

              {/* ── SECCIÓN PROVEEDOR ── */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: `2px solid ${SEP}`, paddingBottom: '6px', marginBottom: '12px' }}>
                  🏢 Proveedor
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', flex: '1 1 240px' }}>
                    <label style={labelStyle}>Proveedor</label>
                    <input value={busqProv}
                      onChange={e => { setBusqProv(e.target.value); setProvSel(null); }}
                      placeholder="Buscar proveedor..." style={inputStyle} />
                    {provSel && (
                      <div style={{ marginTop: '4px', fontSize: '13px', color: GREEN, fontWeight: 600 }}>
                        ✓ {provSel.nombre}
                        <button onClick={() => { setProvSel(null); setBusqProv(''); }}
                          style={{ marginLeft: '8px', background: 'none', border: 'none', color: GRAY, cursor: 'pointer', fontSize: '12px' }}>×</button>
                      </div>
                    )}
                    {provsDrop.length > 0 && !provSel && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1.5px solid #CBD5E0', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 20, marginTop: '2px' }}>
                        {provsDrop.map(p => (
                          <div key={p.id}
                            onClick={() => { setProvSel(p); setBusqProv(p.nombre); setProvsDrop([]); }}
                            style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #F7FAFC', fontSize: '13px' }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#EBF8FF'; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}>
                            <span style={{ fontWeight: 600, color: TEXT }}>{p.nombre}</span>
                            {p.cuit && <span style={{ color: GRAY, marginLeft: '8px', fontSize: '11px' }}>{p.cuit}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: '1 1 160px' }}>
                    <label style={labelStyle}>Nro. Factura</label>
                    <input value={nroFactura} onChange={e => setNroFactura(e.target.value)}
                      placeholder="0001-00001234" style={inputStyle} />
                  </div>
                  <div style={{ flex: '0 0 150px' }}>
                    <label style={labelStyle}>Fecha</label>
                    <input type="date" value={fechaComp} onChange={e => setFechaComp(e.target.value)} style={inputStyle} />
                  </div>
                </div>
              </div>

              {/* ── MODO SIMPLE ── */}
              {!modoDetalle && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: `2px solid ${SEP}`, paddingBottom: '6px', marginBottom: '12px' }}>
                    💰 Importe
                  </div>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 140px' }}>
                      <label style={labelStyle}>Subtotal (neto) *</label>
                      <input type="number" value={simpleSubtotal} onChange={e => setSimpleSubtotal(e.target.value)}
                        placeholder="0.00" min="0" step="0.01" style={inputStyle} />
                    </div>
                    <div style={{ flex: '0 0 110px' }}>
                      <label style={labelStyle}>IVA %</label>
                      <select value={simpleIvaPct} onChange={e => setSimpleIvaPct(e.target.value)}
                        style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value="0">0%</option>
                        <option value="10.5">10.5%</option>
                        <option value="21">21%</option>
                        <option value="27">27%</option>
                      </select>
                    </div>
                    <div style={{ flex: '0 0 130px' }}>
                      <label style={labelStyle}>IVA $</label>
                      <div style={{ ...inputStyle, backgroundColor: '#F7FAFC', color: GRAY }}>{fmt(simpleIvaMonto)}</div>
                    </div>
                    <div style={{ flex: '0 0 150px' }}>
                      <label style={labelStyle}>Total</label>
                      <div style={{ ...inputStyle, backgroundColor: '#F7FAFC', fontWeight: 700, color: RED, fontSize: '15px' }}>{fmt(simpleTotal)}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── MODO DETALLADO ── */}
              {modoDetalle && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: `2px solid ${SEP}`, paddingBottom: '6px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>📦 Artículos</span>
                    <button onClick={() => setPrecioConIva(v => !v)}
                      style={{ ...btnStyle(precioConIva ? BLUE : GREEN, '#fff'), fontSize: '11px', padding: '4px 12px' }}>
                      🏷️ Precios {precioConIva ? 'CON IVA' : 'SIN IVA'}
                    </button>
                  </div>

                  {/* Buscador */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        ref={prodInputRef}
                        value={busqProd}
                        onChange={e => setBusqProd(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && prodsDrop.length > 0) agregarProducto(prodsDrop[0]); }}
                        placeholder="🔍 Buscar producto — Enter para agregar el primero"
                        style={inputStyle}
                      />
                      {loadProd && (
                        <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: GRAY, fontSize: '12px' }}>⏳</span>
                      )}
                      {showDrop && prodsDrop.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1.5px solid #CBD5E0', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 20, marginTop: '2px', maxHeight: '300px', overflowY: 'auto' }}>
                          {prodsDrop.slice(0, 8).map(p => (
                            <div key={p.id} onClick={() => agregarProducto(p)}
                              style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px 60px', padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #F7FAFC', fontSize: '13px', alignItems: 'center' }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#EBF8FF'; }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}>
                              <span style={{ fontFamily: 'monospace', color: GRAY, fontSize: '11px' }}>{p.codigo || '—'}</span>
                              <span style={{ fontWeight: 500, color: TEXT }}>{p.descripcion}</span>
                              <span style={{ color: GRAY }}>{fmt(p.precio_costo || 0)}</span>
                              <span style={{ color: TEXT }}>{p.stock_actual ?? 0}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={agregarLibre} style={btnStyle('#EDF2F7', GRAY)}>＋ Libre</button>
                  </div>

                  {/* Tabla ítems */}
                  {items.length > 0 && (
                    <div style={{ border: '1px solid #EDF2F7', borderRadius: '10px', overflow: 'hidden', marginBottom: '12px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#F7FAFC' }}>
                            {['Descripción', 'Cant', 'Precio', 'IVA%', 'Subtotal', '×'].map((h, i) => (
                              <th key={h} style={{ padding: '8px 10px', textAlign: i >= 1 && i <= 4 ? 'right' : 'left', fontWeight: 600, color: GRAY, fontSize: '11px', borderBottom: '1px solid #EDF2F7' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it, idx) => {
                            const alic   = it.alicuota_iva ?? 21;
                            const precio = precioConIva ? it.precio_unitario / (1 + alic / 100) : it.precio_unitario;
                            const sub    = precio * it.cantidad;
                            return (
                              <tr key={it.tempId} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                                <td style={{ padding: '6px 10px' }}>
                                  {it.es_libre
                                    ? <input value={it.descripcion} onChange={e => actualizarItem(it.tempId, 'descripcion', e.target.value)}
                                        placeholder="Descripción..." style={{ ...inputStyle, padding: '4px 8px', fontSize: '12px' }} />
                                    : <span style={{ color: TEXT }}>{it.descripcion}</span>
                                  }
                                </td>
                                <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                                  <input type="number" value={it.cantidad} min="0.01" step="0.01"
                                    onChange={e => actualizarItem(it.tempId, 'cantidad', parseFloat(e.target.value) || 0)}
                                    style={{ ...inputStyle, width: '64px', padding: '4px 6px', textAlign: 'right' }} />
                                </td>
                                <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                                  <input type="number" value={it.precio_unitario} min="0" step="0.01"
                                    onChange={e => actualizarItem(it.tempId, 'precio_unitario', parseFloat(e.target.value) || 0)}
                                    style={{ ...inputStyle, width: '84px', padding: '4px 6px', textAlign: 'right' }} />
                                </td>
                                <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                                  <select value={it.alicuota_iva}
                                    onChange={e => actualizarItem(it.tempId, 'alicuota_iva', parseFloat(e.target.value))}
                                    style={{ ...inputStyle, width: '72px', padding: '4px 6px', cursor: 'pointer' }}>
                                    <option value={0}>0%</option>
                                    <option value={10.5}>10.5%</option>
                                    <option value={21}>21%</option>
                                    <option value={27}>27%</option>
                                  </select>
                                </td>
                                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: RED, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                  {fmt(sub)}
                                </td>
                                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                  <button onClick={() => eliminarItem(it.tempId)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: RED, fontSize: '18px' }}>×</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Totales detalle */}
                  {items.length > 0 && (
                    <div style={{ backgroundColor: '#F7FAFC', borderRadius: '8px', padding: '12px 16px', border: '1px solid #EDF2F7', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '32px' }}>
                        <span style={{ fontSize: '13px', color: GRAY }}>Subtotal: <strong>{fmt(detSubtotal)}</strong></span>
                        <span style={{ fontSize: '13px', color: GRAY }}>IVA: <strong>{fmt(detIva)}</strong></span>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: RED }}>Total: {fmt(detTotal)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Observaciones */}
              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>Observaciones</label>
                <textarea value={observ} onChange={e => setObserv(e.target.value)}
                  placeholder="Notas internas..." rows={2}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', height: '56px' }} />
              </div>

              {/* Error */}
              {errMsg && (
                <div style={{ backgroundColor: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: RED, marginBottom: '16px' }}>
                  {errMsg}
                </div>
              )}

              {/* Botones */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button onClick={cerrarModal} style={btnStyle('#EDF2F7', GRAY)}>Cancelar</button>
                <button onClick={guardarCompra} disabled={procesando}
                  style={btnStyle(BLUE, '#fff', procesando)}>
                  {procesando ? '⏳ Guardando...' : '✅ Registrar compra'}
                </button>
              </div>
            </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}

export default RobertoCompras;
