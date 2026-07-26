import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../../config/api';

// ── Colores ──────────────────────────────────────────────────────────────────
const NAVY    = '#1B2A4A';
const BLUE    = '#2B6CB0';
const GREEN   = '#38A169';
const RED     = '#E53E3E';
const SEP     = '#63B3ED';
const GRAY    = '#718096';
const TEXT    = '#2D3748';
const BG      = '#F4F6F9';
const ORANGE  = '#DD6B20';
const PURPLE  = '#805AD5';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtFecha = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};

const estaVencido = (fechaVenc: string | null, estado: string): boolean => {
  if (!fechaVenc || ['convertido','rechazado'].includes(estado)) return false;
  return new Date(fechaVenc) < new Date();
};

function getToken() {
  try { const s = localStorage.getItem('superadmin_session'); return s ? JSON.parse(s).token : ''; }
  catch { return ''; }
}
function getClienteId(): number | null {
  try { const s = localStorage.getItem('roberto_portal_session'); return s ? JSON.parse(s).cliente?.id ?? null : null; }
  catch { return null; }
}

let _tid = 100;
const nextTid = () => _tid++;

// ── Types ─────────────────────────────────────────────────────────────────────
interface PresupRow {
  id: number;
  numero_completo: string;
  comprador_nombre: string;
  total: number;
  estado: string;
  fecha_vencimiento: string | null;
  fecha: string;
  convertido_a_venta: boolean;
  venta_id: number | null;
}

interface DashMetrics {
  presupuestos_mes_cantidad: number;
  presupuestos_mes_monto: number;
  aceptados_cantidad: number;
  vencidos_cantidad: number;
}

interface ProductoResult {
  id: number;
  codigo: string;
  descripcion: string;
  precio_venta_1: number;
  precio_venta_2: number;
  precio_venta_3: number;
  precio_venta_final: number;
  precio_costo: number;
  stock_actual: number;
  alicuota_iva: number;
  ean: string;
}

interface ItemForm {
  tempId: number;
  producto_id: number | null;
  codigo: string;
  descripcion: string;
  es_libre: boolean;
  cantidad: number;
  precio: number;
  dto: number;
  alicuota: number;
  stock_actual: number;
}

interface ClienteFinal {
  id: number;
  comprador_nombre: string;
  comprador_cuit: string;
}

interface ResultadoData {
  presupuesto_id: number;
  numero_completo: string;
  comprador_nombre: string;
  total: number;
  sumaSubtotales: number;
  descuentoMonto: number;
  recargoMonto: number;
  descGlobal: number;
  recargo: number;
  precioConIva: boolean;
  ivaByAlic: Record<number, number>;
  fecha_vencimiento: string;
  items: ItemForm[];
}

interface DetalleData {
  presupuesto: any;
  items: any[];
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const btnStyle = (bg: string, color = '#fff', disabled = false): React.CSSProperties => ({
  backgroundColor: disabled ? '#CBD5E0' : bg,
  color: disabled ? '#A0AEC0' : color,
  border: 'none', borderRadius: '8px', padding: '9px 16px',
  fontSize: '13px', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
});

const inputStyle: React.CSSProperties = {
  border: '1.5px solid #CBD5E0', borderRadius: '8px', padding: '8px 12px',
  fontSize: '13px', color: TEXT, outline: 'none', width: '100%',
  boxSizing: 'border-box', backgroundColor: '#fff',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600, color: GRAY,
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px',
};

// ── Estado badge ──────────────────────────────────────────────────────────────
const ESTADO_MAP: Record<string, { bg: string; c: string; label: string }> = {
  borrador:   { bg: '#EDF2F7', c: GRAY,   label: 'Borrador' },
  enviado:    { bg: '#EBF8FF', c: BLUE,   label: 'Enviado' },
  aceptado:   { bg: '#F0FFF4', c: GREEN,  label: 'Aceptado' },
  rechazado:  { bg: '#FFF5F5', c: RED,    label: 'Rechazado' },
  vencido:    { bg: '#FFFAF0', c: ORANGE, label: 'Vencido' },
  convertido: { bg: '#FAF5FF', c: PURPLE, label: 'Convertido' },
};

function BadgeEstado({ estado, fechaVenc }: { estado: string; fechaVenc: string | null }) {
  const key = estaVencido(fechaVenc, estado) && estado !== 'convertido' ? 'vencido' : estado;
  const s   = ESTADO_MAP[key] || { bg: '#EDF2F7', c: GRAY, label: estado };
  return (
    <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, backgroundColor: s.bg, color: s.c }}>
      {s.label}
    </span>
  );
}

// ── Calc totales ──────────────────────────────────────────────────────────────
function calcTotales(items: ItemForm[], descGlobal: number, recargo: number, precioConIva: boolean) {
  const ivaByAlic: Record<number, number> = {};
  let sumaSubtotales = 0;
  const itemsNeto: { alic: number; subtotal: number }[] = [];

  for (const it of items) {
    const alic = it.alicuota ?? 21;
    const precioNeto = precioConIva ? it.precio / (1 + alic / 100) : it.precio;
    const subtotalItem = precioNeto * it.cantidad * (1 - it.dto / 100);
    sumaSubtotales += subtotalItem;
    itemsNeto.push({ alic, subtotal: subtotalItem });
  }

  const base = sumaSubtotales * (1 - descGlobal / 100);
  const baseConRecargo = base * (1 + recargo / 100);
  const factor = sumaSubtotales > 0 ? baseConRecargo / sumaSubtotales : 1;

  for (const { alic, subtotal } of itemsNeto) {
    const ivaMult = precioConIva ? alic / (100 + alic) : alic / 100;
    ivaByAlic[alic] = (ivaByAlic[alic] || 0) + subtotal * factor * ivaMult;
  }

  const ivaTotal = Object.values(ivaByAlic).reduce((a, b) => a + b, 0);
  const descuentoMonto = sumaSubtotales * (descGlobal / 100);
  const recargoMonto   = base * (recargo / 100);
  return { sumaSubtotales, descuentoMonto, recargoMonto, ivaByAlic, ivaTotal, total: precioConIva ? baseConRecargo : baseConRecargo + ivaTotal };
}

// ── Card métrica ──────────────────────────────────────────────────────────────
function CardMetrica({ icon, label, valor, color }: { icon: string; label: string; valor: string; color: string }) {
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '20px 24px', borderLeft: `4px solid ${color}`, flex: '1 1 160px' }}>
      <div style={{ fontSize: '22px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color, marginBottom: '4px' }}>{valor}</div>
      <div style={{ fontSize: '12px', color: GRAY, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

// ── Modal producto libre ──────────────────────────────────────────────────────
function ModalProductoLibre({ onAgregar, onCerrar }: {
  onAgregar: (d: { descripcion: string; precio: number; cantidad: number }) => void;
  onCerrar: () => void;
}) {
  const [desc, setDesc] = useState('');
  const [precio, setPrecio] = useState('');
  const [cant, setCant] = useState('1');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => ref.current?.focus(), 60); }, []);
  const ok = desc.trim() && Number(precio) > 0;
  const agregar = () => ok && onAgregar({ descripcion: desc.trim(), precio: parseFloat(precio), cantidad: parseFloat(cant) || 1 });
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '28px', width: '380px', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: NAVY, margin: '0 0 20px' }}>＋ Producto libre</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Descripción *</label>
            <input ref={ref} value={desc} onChange={e => setDesc(e.target.value)} style={inputStyle} placeholder="Nombre del producto o servicio" onKeyDown={e => e.key === 'Enter' && agregar()} />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Precio *</label>
              <input type="number" value={precio} onChange={e => setPrecio(e.target.value)} style={inputStyle} min="0" step="0.01" onKeyDown={e => e.key === 'Enter' && agregar()} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Cantidad</label>
              <input type="number" value={cant} onChange={e => setCant(e.target.value)} style={inputStyle} min="0.01" step="0.01" onKeyDown={e => e.key === 'Enter' && agregar()} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '24px', justifyContent: 'flex-end' }}>
          <button onClick={onCerrar} style={btnStyle('#EDF2F7', GRAY)}>Cancelar</button>
          <button onClick={agregar} disabled={!ok} style={btnStyle(GREEN, '#fff', !ok)}>＋ Agregar</button>
        </div>
      </div>
    </div>
  );
}

// ── Pantalla resultado ────────────────────────────────────────────────────────
function PantallaResultado({ res: r, onEditar, onConvertir, onCerrar }: {
  res: ResultadoData;
  onEditar: () => void;
  onConvertir: () => void;
  onCerrar: () => void;
}) {
  const generarHTML = (size: 'A4' | 'A5') => {
    const cfg = JSON.parse(localStorage.getItem(`roberto_config_${getClienteId()}`) || '{}');
    const nombreNegocio = cfg.nombre_comercial || 'Mi Negocio';
    const membreteLinas = [cfg.direccion, cfg.cuit, cfg.membrete].filter(Boolean)
      .map(l => `<div style="color:#718096;font-size:11px">${l}</div>`).join('');

    const itemsHTML = r.items.map(it => {
      const alic  = (it as any).alicuota ?? 21;
      const pNeto = r.precioConIva ? it.precio / (1 + alic / 100) : it.precio;
      const sub   = pNeto * it.cantidad * (1 - it.dto / 100);
      return `<tr><td>${it.cantidad}</td><td>${it.descripcion}</td><td style="text-align:right">$${sub.toLocaleString('es-AR',{minimumFractionDigits:2})}</td></tr>`;
    }).join('');
    const descRow = r.descuentoMonto > 0
      ? `<div class="row"><span>Descuento (${r.descGlobal}%):</span><span>-$${r.descuentoMonto.toLocaleString('es-AR',{minimumFractionDigits:2})}</span></div>` : '';
    const recRow  = r.recargoMonto > 0
      ? `<div class="row"><span>Recargo (${r.recargo}%):</span><span>+$${r.recargoMonto.toLocaleString('es-AR',{minimumFractionDigits:2})}</span></div>` : '';
    const ivaRows = Object.entries(r.ivaByAlic).sort(([a],[b])=>Number(a)-Number(b))
      .map(([a,m])=>`<div class="row"><span>IVA ${a}%:</span><span>$${Number(m).toLocaleString('es-AR',{minimumFractionDigits:2})}</span></div>`).join('');
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${r.numero_completo}</title>
<style>
  @page { size:${size}; margin:12mm; }
  body { font-family:Arial,sans-serif; font-size:12px; margin:0; color:#222; }
  .header { display:flex; justify-content:space-between; border-bottom:2px solid #1B2A4A; padding-bottom:10px; margin-bottom:14px; }
  .negocio { font-size:20px; font-weight:700; color:#1B2A4A; }
  .row { display:flex; justify-content:space-between; margin-bottom:4px; }
  .sep { border-top:1px dashed #ccc; margin:8px 0; }
  table { width:100%; border-collapse:collapse; margin:10px 0; }
  th { background:#1B2A4A; color:#fff; padding:6px 8px; text-align:left; font-size:11px; }
  td { padding:6px 8px; border-bottom:1px solid #eee; font-size:11px; }
  td:last-child { text-align:right; }
  .total { font-size:16px; font-weight:700; }
  .verde { color:#38A169; }
  .footer { margin-top:16px; font-size:10px; color:#718096; border-top:1px solid #eee; padding-top:8px; }
  .validez { background:#F0FFF4; border:1px solid #9AE6B4; border-radius:6px; padding:8px 12px; margin-top:10px; font-size:11px; }
</style></head><body>
<div class="header">
  <div><div class="negocio">${nombreNegocio}</div><div style="color:#718096">PRESUPUESTO</div>${membreteLinas}</div>
  <div style="text-align:right"><div style="font-size:18px;font-weight:700;color:#1B2A4A">${r.numero_completo}</div><div style="color:#718096">Fecha: ${new Date().toLocaleDateString('es-AR')}</div></div>
</div>
<div class="row"><span><b>Cliente:</b></span><span>${r.comprador_nombre || 'Sin nombre'}</span></div>
<table>
  <thead><tr><th>Cant</th><th>Descripción</th><th>Subtotal</th></tr></thead>
  <tbody>${itemsHTML}</tbody>
</table>
<div class="sep"></div>
<div class="row"><span>Subtotal:</span><span>$${r.sumaSubtotales.toLocaleString('es-AR',{minimumFractionDigits:2})}</span></div>
${descRow}${recRow}${ivaRows}
<div class="sep"></div>
<div class="row total"><span>TOTAL:</span><span class="verde">$${r.total.toLocaleString('es-AR',{minimumFractionDigits:2})}</span></div>
<div class="validez">✓ Válido hasta: <b>${fmtFecha(r.fecha_vencimiento)}</b></div>
<div class="footer">Precios en pesos argentinos. Este presupuesto es válido hasta la fecha indicada.</div>
</body></html>`;
  };

  const imprimir = (size: 'A4' | 'A5') => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(generarHTML(size));
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 350);
  };

  const whatsApp = () => {
    const txt = `*Presupuesto ${r.numero_completo}*\nCliente: ${r.comprador_nombre || 'Sin nombre'}\nTotal: ${fmt(r.total)}\nVálido hasta: ${fmtFecha(r.fecha_vencimiento)}\n\nCualquier consulta, estamos a tu disposición.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank');
  };

  return (
    <div style={{ padding: '32px 28px', textAlign: 'center' }}>
      <div style={{ fontSize: '52px', marginBottom: '12px' }}>✅</div>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: GREEN, margin: '0 0 4px' }}>¡Presupuesto generado!</h2>
      <div style={{ fontSize: '20px', fontWeight: 700, color: NAVY, marginBottom: '4px' }}>{r.numero_completo}</div>
      <div style={{ fontSize: '13px', color: GRAY, marginBottom: '4px' }}>{r.comprador_nombre || 'Sin nombre'}</div>
      <div style={{ fontSize: '13px', color: ORANGE, marginBottom: '4px' }}>Válido hasta: {fmtFecha(r.fecha_vencimiento)}</div>
      <div style={{ fontSize: '30px', fontWeight: 800, color: GREEN, margin: '14px 0 24px' }}>{fmt(r.total)}</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', maxWidth: '380px', margin: '0 auto 16px' }}>
        <button onClick={() => imprimir('A4')} style={btnStyle(BLUE)}>📄 PDF A4</button>
        <button onClick={() => imprimir('A5')} style={btnStyle(BLUE)}>📄 PDF A5</button>
        <button onClick={whatsApp}             style={btnStyle('#25D366')}>💬 WhatsApp</button>
        <button onClick={onEditar}             style={btnStyle('#EDF2F7', GRAY)}>✏️ Editar</button>
      </div>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
        <button onClick={onConvertir} style={btnStyle(GREEN)}>🔄 Convertir en venta</button>
        <button onClick={onCerrar}    style={btnStyle('#EDF2F7', GRAY)}>✅ Cerrar</button>
      </div>
    </div>
  );
}

// ── Modal detalle ─────────────────────────────────────────────────────────────
function ModalDetalle({ detalle, onConvertir, onCerrar, convirtiendo }: {
  detalle: DetalleData;
  onConvertir: () => void;
  onCerrar: () => void;
  convirtiendo: boolean;
}) {
  const p = detalle.presupuesto;
  const venc = estaVencido(p.fecha_vencimiento, p.estado);
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '16px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '740px', boxShadow: '0 24px 72px rgba(0,0,0,0.3)', margin: 'auto' }}>
        <div style={{ padding: '18px 28px', borderBottom: `2px solid ${SEP}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: NAVY, margin: '0 0 4px' }}>👁️ {p.numero_completo}</h2>
            <BadgeEstado estado={p.estado} fechaVenc={p.fecha_vencimiento} />
          </div>
          <button onClick={onCerrar} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: GRAY }}>×</button>
        </div>
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px', fontSize: '13px' }}>
            <div><span style={{ color: GRAY }}>Cliente: </span><strong>{p.comprador_nombre || 'Sin nombre'}</strong></div>
            <div><span style={{ color: GRAY }}>CUIT: </span><strong>{p.comprador_cuit || '—'}</strong></div>
            <div><span style={{ color: GRAY }}>Fecha: </span><strong>{fmtFecha(p.fecha)}</strong></div>
            <div><span style={{ color: GRAY }}>Válido hasta: </span>
              <strong style={{ color: venc ? RED : TEXT }}>{fmtFecha(p.fecha_vencimiento)}{venc ? ' ⚠️' : ''}</strong>
            </div>
          </div>

          <div style={{ border: '1px solid #EDF2F7', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#EBF4FF' }}>
                  {['Descripción','Cant','Precio','Dto%','Subtotal'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: NAVY, fontSize: '11px', borderBottom: `2px solid ${SEP}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detalle.items.map((it: any, idx: number) => {
                  const sub = Number(it.cantidad) * Number(it.precio_unitario) * (1 - Number(it.descuento_porcentaje) / 100);
                  return (
                    <tr key={it.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                      <td style={{ padding: '8px 12px', color: TEXT }}>{it.descripcion}</td>
                      <td style={{ padding: '8px 12px', color: GRAY }}>{it.cantidad}</td>
                      <td style={{ padding: '8px 12px', color: TEXT }}>{fmt(Number(it.precio_unitario))}</td>
                      <td style={{ padding: '8px 12px', color: GRAY }}>{it.descuento_porcentaje}%</td>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: GREEN }}>{fmt(sub)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ textAlign: 'right', fontSize: '13px', color: GRAY }}>
            <div>Subtotal: {fmt(Number(p.subtotal))}</div>
            <div>IVA: {fmt(Number(p.iva_monto))}</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: GREEN, marginTop: '4px' }}>Total: {fmt(Number(p.total))}</div>
          </div>

          {p.condiciones && (
            <div style={{ marginTop: '16px', padding: '10px 14px', backgroundColor: '#FFFAF0', borderRadius: '8px', fontSize: '12px', color: GRAY }}>
              <strong>Condiciones:</strong> {p.condiciones}
            </div>
          )}
          {p.observaciones && (
            <div style={{ marginTop: '8px', padding: '10px 14px', backgroundColor: '#F7FAFC', borderRadius: '8px', fontSize: '12px', color: GRAY }}>
              <strong>Observaciones:</strong> {p.observaciones}
            </div>
          )}

          {p.convertido_a_venta ? (
            <div style={{ marginTop: '16px', padding: '10px 14px', backgroundColor: '#FAF5FF', borderRadius: '8px', fontSize: '13px', color: PURPLE, fontWeight: 600 }}>
              ✓ Convertido a venta {p.venta_id ? `(ID: ${p.venta_id})` : ''}
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={onConvertir} disabled={convirtiendo} style={btnStyle(GREEN, '#fff', convirtiendo)}>
                {convirtiendo ? '⏳ Convirtiendo...' : '🔄 Convertir en venta'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
function RobertoPresupuestos() {
  const navigate  = useNavigate();
  const cid       = getClienteId();
  const token     = getToken();
  const authHdr   = { 'x-superadmin-token': token };
  const jsonHdr   = { 'x-superadmin-token': token, 'Content-Type': 'application/json' };

  // ── Dashboard ──────────────────────────────────────────────────
  const [dash, setDash] = useState<DashMetrics | null>(null);

  // ── Lista ──────────────────────────────────────────────────────
  const [presupuestos,  setPresupuestos]  = useState<PresupRow[]>([]);
  const [totalReg,      setTotalReg]      = useState(0);
  const [pagina,        setPagina]        = useState(1);
  const [porPagina,     setPorPagina]     = useState(25);
  const [totalPags,     setTotalPags]     = useState(1);
  const [cargandoList,  setCargandoList]  = useState(false);

  // ── Filtros ────────────────────────────────────────────────────
  const [busqueda,      setBusqueda]      = useState('');
  const [filtroEstado,  setFiltroEstado]  = useState('');
  const [fechaDesde,    setFechaDesde]    = useState('');
  const [fechaHasta,    setFechaHasta]    = useState('');

  // ── Modal nuevo/editar ─────────────────────────────────────────
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editandoId,    setEditandoId]    = useState<number | null>(null);

  // Cliente
  const [tipoCliente,   setTipoCliente]   = useState<'mostrador'|'cuenta'>('mostrador');
  const [nomCliente,    setNomCliente]     = useState('');
  const [cuitCliente,   setCuitCliente]    = useState('');
  const [busqCliente,   setBusqCliente]    = useState('');
  const [clientesDrop,  setClientesDrop]   = useState<ClienteFinal[]>([]);
  const [clienteSel,    setClienteSel]     = useState<ClienteFinal | null>(null);

  // Items
  const [items,         setItems]          = useState<ItemForm[]>([]);
  const [busqProd,      setBusqProd]       = useState('');
  const [listaPrecio,   setListaPrecio]   = useState<'pv1'|'pv2'|'pv3'>('pv1');
  const [prodsDrop,     setProdsDrop]      = useState<ProductoResult[]>([]);
  const [showDrop,      setShowDrop]       = useState(false);
  const [loadProd,      setLoadProd]       = useState(false);
  const [modalLibre,    setModalLibre]     = useState(false);
  const itemRef = useRef<HTMLInputElement>(null);

  // Validez
  const [diasValidez,   setDiasValidez]   = useState(15);
  const [condiciones,   setCondiciones]   = useState('Precios sujetos a variación.');
  const [observ,        setObserv]        = useState('');

  // Totales
  const [descGlobal,    setDescGlobal]    = useState(0);
  const [recargo,       setRecargo]       = useState(0);
  const [precioConIva,  setPrecioConIva]  = useState(true);

  // Submit
  const [procesando,    setProcesando]    = useState(false);
  const [errForm,       setErrForm]       = useState('');
  const [resultado,     setResultado]     = useState<ResultadoData | null>(null);

  // Detalle
  const [detalle,       setDetalle]       = useState<DetalleData | null>(null);
  const [convirtiendo,  setConvirtiendo]  = useState(false);

  // ── Cargar dashboard ──────────────────────────────────────────
  const cargarDash = useCallback(() => {
    if (!cid) return;
    fetch(`${API_BASE}/api/superadmin/presupuestos/${cid}/dashboard`, { headers: authHdr })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setDash(d))
      .catch(() => {});
  }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargarDash(); }, [cargarDash]);

  // ── Cargar lista (debounced) ──────────────────────────────────
  const cargarLista = useCallback(async () => {
    if (!cid) return;
    setCargandoList(true);
    try {
      const p = new URLSearchParams({
        page: String(pagina), limit: String(porPagina),
        ...(busqueda     && { buscar:       busqueda }),
        ...(filtroEstado && { estado:       filtroEstado }),
        ...(fechaDesde   && { fecha_desde:  fechaDesde }),
        ...(fechaHasta   && { fecha_hasta:  fechaHasta }),
      });
      const r = await fetch(`${API_BASE}/api/superadmin/presupuestos/${cid}?${p}`, { headers: authHdr });
      if (r.ok) {
        const d = await r.json();
        setPresupuestos(d.presupuestos || []);
        setTotalReg(d.total || 0);
        setTotalPags(d.paginas || 1);
      }
    } catch { /* silent */ }
    finally { setCargandoList(false); }
  }, [cid, pagina, porPagina, busqueda, filtroEstado, fechaDesde, fechaHasta]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(cargarLista, 300);
    return () => clearTimeout(t);
  }, [cargarLista]);

  // ── Focus item input al abrir modal ──────────────────────────
  useEffect(() => {
    if (modalOpen && !resultado) setTimeout(() => itemRef.current?.focus(), 120);
  }, [modalOpen, resultado]);

  // ── Buscar clientes (debounced) ───────────────────────────────
  useEffect(() => {
    if (!busqCliente.trim() || tipoCliente !== 'cuenta' || clienteSel) { setClientesDrop([]); return; }
    const t = setTimeout(async () => {
      if (!cid) return;
      try {
        const r = await fetch(`${API_BASE}/api/superadmin/clientes-finales/${cid}?buscar=${encodeURIComponent(busqCliente)}&limit=8`, { headers: authHdr });
        if (r.ok) { const d = await r.json(); setClientesDrop(d.clientes || []); }
      } catch { /* silent */ }
    }, 300);
    return () => clearTimeout(t);
  }, [busqCliente, tipoCliente, clienteSel]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Buscar productos / EAN (debounced) ───────────────────────
  useEffect(() => {
    const q = busqProd.trim();
    if (!q) { setProdsDrop([]); setShowDrop(false); return; }
    const t = setTimeout(async () => {
      if (!cid) return;
      setLoadProd(true);
      if (/^\d{4,}$/.test(q)) {
        try {
          const r = await fetch(`${API_BASE}/api/superadmin/ventas/buscar-ean/${cid}/${q}`, { headers: authHdr });
          if (r.ok) {
            const d = await r.json();
            if (d.producto) { agregarProducto(d.producto); setBusqProd(''); setLoadProd(false); return; }
          }
        } catch { /* fall through */ }
      }
      try {
        const param = /^\d+$/.test(q) ? `ean=${q}` : `buscar=${encodeURIComponent(q)}`;
        const r = await fetch(`${API_BASE}/api/superadmin/importador/productos/${cid}?${param}&limit=8`, { headers: authHdr });
        if (r.ok) {
          const d = await r.json();
          const lista: ProductoResult[] = d.productos || d.items || [];
          setProdsDrop(lista); setShowDrop(lista.length > 0);
        }
      } catch { /* silent */ }
      finally { setLoadProd(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [busqProd]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers items ─────────────────────────────────────────────
  const agregarProducto = (p: ProductoResult) => {
    setItems(prev => [...prev, {
      tempId: nextTid(), producto_id: p.id, codigo: p.codigo || '',
      descripcion: p.descripcion, es_libre: false,
      cantidad: 1, precio: listaPrecio === 'pv1'
        ? (parseFloat(String(p.precio_venta_1)) || parseFloat(String(p.precio_venta_final)) || parseFloat(String(p.precio_costo)) || 0)
        : listaPrecio === 'pv2'
        ? (parseFloat(String(p.precio_venta_2)) || parseFloat(String(p.precio_venta_1)) || parseFloat(String(p.precio_venta_final)) || parseFloat(String(p.precio_costo)) || 0)
        : (parseFloat(String(p.precio_venta_3)) || parseFloat(String(p.precio_venta_2)) || parseFloat(String(p.precio_venta_1)) || parseFloat(String(p.precio_venta_final)) || parseFloat(String(p.precio_costo)) || 0),
      dto: 0, alicuota: parseFloat(String(p.alicuota_iva)) || 21,
      stock_actual: parseFloat(String(p.stock_actual)) || 0,
    }]);
    setProdsDrop([]); setShowDrop(false); setBusqProd('');
    setTimeout(() => itemRef.current?.focus(), 60);
  };

  const agregarLibre = (d: { descripcion: string; precio: number; cantidad: number }) => {
    setItems(prev => [...prev, {
      tempId: nextTid(), producto_id: null, codigo: '', descripcion: d.descripcion,
      es_libre: true, cantidad: d.cantidad, precio: d.precio, dto: 0, alicuota: 21, stock_actual: 0,
    }]);
    setModalLibre(false);
    setTimeout(() => itemRef.current?.focus(), 60);
  };

  const actualizarItem = (tempId: number, campo: keyof ItemForm, val: any) =>
    setItems(prev => prev.map(it => it.tempId === tempId ? { ...it, [campo]: val } : it));

  const eliminarItem = (tempId: number) =>
    setItems(prev => prev.filter(it => it.tempId !== tempId));

  // ── Reset + abrir modal ───────────────────────────────────────
  const resetModal = () => {
    setItems([]); setEditandoId(null);
    setTipoCliente('mostrador'); setNomCliente(''); setCuitCliente('');
    setBusqCliente(''); setClienteSel(null); setClientesDrop([]);
    setBusqProd(''); setProdsDrop([]); setShowDrop(false);
    setDiasValidez(15); setCondiciones('Precios sujetos a variación.');
    setObserv(''); setDescGlobal(0); setRecargo(0); setPrecioConIva(true);
    setErrForm(''); setResultado(null);
  };

  const abrirNuevo = () => { resetModal(); setModalOpen(true); };

  const cerrarModal = () => {
    setModalOpen(false);
    if (resultado) { cargarLista(); cargarDash(); }
    resetModal();
  };

  // Fecha vencimiento calculada
  const fechaVenc = (() => {
    const d = new Date(); d.setDate(d.getDate() + diasValidez);
    return d.toISOString().slice(0, 10);
  })();

  // ── Submit presupuesto ────────────────────────────────────────
  const submitPresupuesto = async (estadoParam: string) => {
    if (!items.length) { setErrForm('Agregá al menos un producto.'); return; }
    if (!cid) return;

    const compradorNombre = tipoCliente === 'cuenta' ? (clienteSel?.comprador_nombre || nomCliente) : nomCliente;
    const compradorCuit   = tipoCliente === 'cuenta' ? (clienteSel?.comprador_cuit   || cuitCliente) : cuitCliente;

    const { sumaSubtotales, descuentoMonto, recargoMonto, ivaByAlic, ivaTotal, total } = calcTotales(items, descGlobal, recargo, precioConIva);

    const body = {
      comprador_nombre:  compradorNombre,
      comprador_cuit:    compradorCuit,
      dias_validez:      diasValidez,
      condiciones, observaciones: observ,
      descuento_global:  descGlobal,
      recargo_global:    recargo,
      precio_con_iva:    precioConIva,
      estado: estadoParam,
      items: items.map(it => ({
        producto_id:           it.producto_id,
        es_libre:              it.es_libre,
        descripcion_libre:     it.es_libre ? it.descripcion : null,
        descripcion:           it.descripcion,
        cantidad:              it.cantidad,
        precio_unitario:       it.precio,
        descuento_porcentaje:  it.dto,
        alicuota_iva:          it.alicuota,
      })),
    };

    setProcesando(true); setErrForm('');
    try {
      const url    = editandoId
        ? `${API_BASE}/api/superadmin/presupuestos/${cid}/${editandoId}`
        : `${API_BASE}/api/superadmin/presupuestos/${cid}`;
      const method = editandoId ? 'PUT' : 'POST';
      const r      = await fetch(url, { method, headers: jsonHdr, body: JSON.stringify(body) });
      const data   = await r.json();
      if (!r.ok) { setErrForm(data.mensaje || 'Error al guardar'); return; }
      setResultado({
        presupuesto_id:    data.presupuesto_id,
        numero_completo:   data.numero_completo,
        comprador_nombre:  compradorNombre || 'Sin nombre',
        total, sumaSubtotales, descuentoMonto, recargoMonto,
        descGlobal, recargo, precioConIva, ivaByAlic,
        fecha_vencimiento: data.fecha_vencimiento || fechaVenc,
        items: [...items],
      });
    } catch { setErrForm('Error de red. Intentá de nuevo.'); }
    finally { setProcesando(false); }
  };

  // ── Ver detalle ───────────────────────────────────────────────
  const verDetalle = async (id: number) => {
    if (!cid) return;
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/presupuestos/${cid}/${id}`, { headers: authHdr });
      if (r.ok) { const d = await r.json(); setDetalle(d); }
    } catch { /* silent */ }
  };

  // ── Convertir en venta ────────────────────────────────────────
  const convertirEnVenta = async (id: number, fromDetalle = false) => {
    if (!cid) return;
    setConvirtiendo(true);
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/presupuestos/${cid}/${id}/convertir`, {
        method: 'PUT', headers: jsonHdr,
      });
      const d = await r.json();
      if (!r.ok) { alert(d.mensaje || 'Error al convertir'); return; }
      alert(`✅ Venta ${d.numero_completo} creada exitosamente`);
      if (fromDetalle) setDetalle(null);
      cargarLista(); cargarDash();
    } catch { alert('Error de red'); }
    finally { setConvirtiendo(false); }
  };

  // ── Anular ────────────────────────────────────────────────────
  const anular = async (id: number) => {
    if (!cid || !window.confirm('¿Anular este presupuesto?')) return;
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/presupuestos/${cid}/${id}/estado`, {
        method: 'PUT', headers: jsonHdr, body: JSON.stringify({ estado: 'rechazado' }),
      });
      if (r.ok) { cargarLista(); cargarDash(); }
    } catch { /* silent */ }
  };

  // ── Totales en tiempo real ────────────────────────────────────
  const { sumaSubtotales, descuentoMonto, recargoMonto, ivaByAlic, ivaTotal, total } = calcTotales(items, descGlobal, recargo, precioConIva);

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, padding: '28px', fontFamily: 'system-ui,-apple-system,sans-serif' }}>

      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/roberto/dashboard')} style={btnStyle('#EDF2F7', GRAY)}>← Volver</button>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: NAVY, margin: '0 0 2px' }}>📋 Presupuestos</h2>
            <p style={{ fontSize: '13px', color: GRAY, margin: 0 }}>{totalReg.toLocaleString('es-AR')} registros</p>
          </div>
        </div>
        <button onClick={abrirNuevo} style={btnStyle(GREEN)}>＋ Nuevo presupuesto</button>
      </div>

      {/* ── Dashboard cards ──────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <CardMetrica icon="📋" label="Presupuestos este mes"  valor={dash ? String(dash.presupuestos_mes_cantidad) : '—'} color={BLUE}   />
        <CardMetrica icon="💰" label="Monto presupuestado"    valor={dash ? fmt(dash.presupuestos_mes_monto)        : '—'} color={GREEN}  />
        <CardMetrica icon="✅" label="Aceptados"              valor={dash ? String(dash.aceptados_cantidad)         : '—'} color={GREEN}  />
        <CardMetrica icon="⚠️" label="Vencidos"               valor={dash ? String(dash.vencidos_cantidad)          : '—'} color={RED}    />
      </div>

      {/* ── Filtros ─────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={labelStyle}>Buscar</label>
            <input value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(1); }} placeholder="Número o cliente..." style={inputStyle} />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label style={labelStyle}>Fecha desde</label>
            <input type="date" value={fechaDesde} onChange={e => { setFechaDesde(e.target.value); setPagina(1); }} style={inputStyle} />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label style={labelStyle}>Fecha hasta</label>
            <input type="date" value={fechaHasta} onChange={e => { setFechaHasta(e.target.value); setPagina(1); }} style={inputStyle} />
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label style={labelStyle}>Estado</label>
            <select value={filtroEstado} onChange={e => { setFiltroEstado(e.target.value); setPagina(1); }} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Todos</option>
              {['borrador','enviado','aceptado','rechazado','vencido','convertido'].map(e => (
                <option key={e} value={e}>{e.charAt(0).toUpperCase()+e.slice(1)}</option>
              ))}
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

      {/* ── Tabla ───────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        {cargandoList ? (
          <div style={{ padding: '48px', textAlign: 'center', color: GRAY }}>Cargando...</div>
        ) : presupuestos.length === 0 ? (
          <div style={{ padding: '64px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '52px', marginBottom: '12px' }}>📋</div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>No hay presupuestos</h3>
            <p style={{ fontSize: '14px', color: GRAY, margin: '0 0 24px' }}>Los presupuestos generados aparecerán aquí.</p>
            <button onClick={abrirNuevo} style={btnStyle(GREEN)}>＋ Crear primer presupuesto</button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '800px' }}>
              <thead>
                <tr style={{ backgroundColor: '#EBF4FF' }}>
                  {['Número','Fecha','Cliente','Total','Estado','Válido hasta','Acciones'].map(col => (
                    <th key={col} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600, color: NAVY, borderBottom: `2px solid ${SEP}`, whiteSpace: 'nowrap' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {presupuestos.map((p, idx) => {
                  const venc = estaVencido(p.fecha_vencimiento, p.estado);
                  return (
                    <tr key={p.id}
                      style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#EBF8FF'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#fff' : '#F7FAFC'; }}>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: NAVY }}>{p.numero_completo}</td>
                      <td style={{ padding: '10px 14px', color: GRAY, whiteSpace: 'nowrap' }}>{fmtFecha(p.fecha)}</td>
                      <td style={{ padding: '10px 14px', color: TEXT }}>{p.comprador_nombre || 'Sin nombre'}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: GREEN, fontFamily: 'monospace' }}>{fmt(p.total)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <BadgeEstado estado={p.estado} fechaVenc={p.fecha_vencimiento} />
                      </td>
                      <td style={{ padding: '10px 14px', color: venc ? RED : GRAY, whiteSpace: 'nowrap', fontWeight: venc ? 700 : 400 }}>
                        {fmtFecha(p.fecha_vencimiento)}{venc ? ' ⚠️' : ''}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          <button onClick={() => verDetalle(p.id)}
                            style={{ backgroundColor: '#EBF4FF', color: BLUE, border: 'none', borderRadius: '5px', padding: '5px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                            👁️ Ver
                          </button>
                          {!p.convertido_a_venta && (
                            <button onClick={() => convertirEnVenta(p.id)}
                              style={{ backgroundColor: '#F0FFF4', color: GREEN, border: 'none', borderRadius: '5px', padding: '5px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                              🔄
                            </button>
                          )}
                          {!p.convertido_a_venta && p.estado !== 'rechazado' && (
                            <button onClick={() => anular(p.id)}
                              style={{ backgroundColor: '#FFF5F5', color: RED, border: 'none', borderRadius: '5px', padding: '5px 8px', fontSize: '11px', cursor: 'pointer' }}>
                              🗑️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Paginación ──────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: GRAY }}>
          Filas:
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
          MODAL NUEVO / EDITAR PRESUPUESTO
      ═══════════════════════════════════════════════════════ */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '16px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '920px', boxShadow: '0 24px 72px rgba(0,0,0,0.35)', margin: 'auto' }}>

            {/* Header */}
            <div style={{ padding: '18px 28px', borderBottom: `2px solid ${SEP}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: NAVY, margin: 0 }}>
                {resultado ? '✅ Presupuesto generado' : editandoId ? '✏️ Editar Presupuesto' : '＋ Nuevo Presupuesto'}
              </h2>
              <button onClick={cerrarModal} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: GRAY }}>×</button>
            </div>

            {resultado ? (
              <PantallaResultado
                res={resultado}
                onEditar={() => setResultado(null)}
                onConvertir={() => convertirEnVenta(resultado.presupuesto_id)}
                onCerrar={cerrarModal}
              />
            ) : (
              <div style={{ padding: '24px 28px' }}>

                {/* ── MODO IVA ──────────────────────────────── */}
                <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', backgroundColor: precioConIva ? '#EBF8FF' : '#F0FFF4', borderRadius: '8px', border: `1px solid ${precioConIva ? '#BEE3F8' : '#9AE6B4'}`, flexWrap: 'wrap' }}>
                  <button onClick={() => setPrecioConIva(v => !v)}
                    style={{ ...btnStyle(precioConIva ? BLUE : GREEN), fontSize: '12px', padding: '6px 14px' }}>
                    🏷️ {precioConIva ? 'Precios CON IVA incluido' : 'Precios SIN IVA'}
                  </button>
                  <span style={{ fontSize: '12px', color: GRAY }}>
                    {precioConIva ? 'El IVA se extrae del precio ingresado (precio ÷ 1.alicuota)' : 'El IVA se suma sobre el precio neto ingresado'}
                  </span>
                </div>

                {/* ── CLIENTE ──────────────────────────────── */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: `2px solid ${SEP}`, paddingBottom: '6px', marginBottom: '12px' }}>👤 Cliente</div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                    {(['mostrador','cuenta'] as const).map(t => (
                      <button key={t} onClick={() => { setTipoCliente(t); setClienteSel(null); setBusqCliente(''); setClientesDrop([]); }}
                        style={{ ...btnStyle(tipoCliente === t ? BLUE : '#EDF2F7', tipoCliente === t ? '#fff' : GRAY), fontSize: '12px', padding: '7px 14px' }}>
                        {t === 'mostrador' ? '🏪 Sin cuenta' : '👥 Con cuenta'}
                      </button>
                    ))}
                  </div>

                  {tipoCliente === 'mostrador' ? (
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <div style={{ flex: 2 }}>
                        <label style={labelStyle}>Nombre cliente</label>
                        <input value={nomCliente} onChange={e => setNomCliente(e.target.value)} placeholder="Nombre (opcional)" style={inputStyle} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>CUIT</label>
                        <input value={cuitCliente} onChange={e => setCuitCliente(e.target.value)} placeholder="00-00000000-0" style={inputStyle} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ position: 'relative', maxWidth: '400px' }}>
                      <input value={busqCliente} onChange={e => { setBusqCliente(e.target.value); setClienteSel(null); }}
                        placeholder="Buscar por nombre o CUIT..." style={inputStyle} />
                      {clienteSel && (
                        <div style={{ marginTop: '5px', fontSize: '13px', color: GREEN, fontWeight: 600 }}>
                          ✓ {clienteSel.comprador_nombre}{clienteSel.comprador_cuit ? ` — ${clienteSel.comprador_cuit}` : ''}
                          <button onClick={() => { setClienteSel(null); setBusqCliente(''); }} style={{ marginLeft: '8px', background: 'none', border: 'none', color: GRAY, cursor: 'pointer' }}>×</button>
                        </div>
                      )}
                      {clientesDrop.length > 0 && !clienteSel && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1.5px solid #CBD5E0', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 20, marginTop: '2px' }}>
                          {clientesDrop.map(cl => (
                            <div key={cl.id} onClick={() => { setClienteSel(cl); setBusqCliente(cl.comprador_nombre); setClientesDrop([]); }}
                              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #F7FAFC', fontSize: '13px' }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#EBF8FF'; }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}>
                              <span style={{ fontWeight: 600 }}>{cl.comprador_nombre}</span>
                              {cl.comprador_cuit && <span style={{ color: GRAY, marginLeft: '8px', fontSize: '11px' }}>{cl.comprador_cuit}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── ITEMS ────────────────────────────────── */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: `2px solid ${SEP}`, paddingBottom: '6px', marginBottom: '12px' }}>📦 Productos</div>

                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>Lista precio:</span>
                    {(['pv1', 'pv2', 'pv3'] as const).map(lp => (
                      <button key={lp} onClick={() => setListaPrecio(lp)} style={{ padding: '4px 10px', fontSize: '12px', fontWeight: 700, border: 'none', borderRadius: '6px', cursor: 'pointer', backgroundColor: listaPrecio === lp ? BLUE : '#EDF2F7', color: listaPrecio === lp ? '#fff' : GRAY }}>
                        {lp.toUpperCase()}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input ref={itemRef} value={busqProd}
                        onChange={e => setBusqProd(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && prodsDrop.length > 0) agregarProducto(prodsDrop[0]);
                          if (e.key === 'Escape') { setShowDrop(false); setBusqProd(''); }
                        }}
                        placeholder="🔍 Nombre, código o EAN..." style={inputStyle} />
                      {loadProd && <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: GRAY, fontSize: '12px' }}>⏳</span>}
                      {showDrop && prodsDrop.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1.5px solid #CBD5E0', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 20, marginTop: '2px', maxHeight: '320px', overflowY: 'auto' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px 60px', padding: '6px 12px', fontSize: '10px', fontWeight: 700, color: GRAY, borderBottom: '1px solid #EDF2F7', textTransform: 'uppercase' }}>
                            <span>Código</span><span>Descripción</span><span>Precio</span><span>Stock</span>
                          </div>
                          {prodsDrop.slice(0, 8).map(p => (
                            <div key={p.id} onClick={() => agregarProducto(p)}
                              style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px 60px', padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #F7FAFC', fontSize: '13px', alignItems: 'center' }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#EBF8FF'; }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}>
                              <span style={{ fontFamily: 'monospace', color: GRAY, fontSize: '11px' }}>{p.codigo || '—'}</span>
                              <span style={{ fontWeight: 500 }}>{p.descripcion}</span>
                              <span style={{ fontWeight: 700, color: GREEN }}>{fmt(
                                listaPrecio === 'pv1'
                                  ? (parseFloat(String(p.precio_venta_1)) || parseFloat(String(p.precio_venta_final)) || parseFloat(String(p.precio_costo)) || 0)
                                  : listaPrecio === 'pv2'
                                  ? (parseFloat(String(p.precio_venta_2)) || parseFloat(String(p.precio_venta_1)) || parseFloat(String(p.precio_venta_final)) || parseFloat(String(p.precio_costo)) || 0)
                                  : (parseFloat(String(p.precio_venta_3)) || parseFloat(String(p.precio_venta_2)) || parseFloat(String(p.precio_venta_1)) || parseFloat(String(p.precio_venta_final)) || parseFloat(String(p.precio_costo)) || 0)
                              )}</span>
                              <span style={{ fontWeight: 700, color: (p.stock_actual || 0) <= 0 ? RED : TEXT }}>{p.stock_actual ?? 0}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => setModalLibre(true)} style={btnStyle('#EDF2F7', GRAY)}>＋ Libre</button>
                  </div>

                  {items.length > 0 ? (
                    <div style={{ border: '1px solid #EDF2F7', borderRadius: '10px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#F7FAFC' }}>
                            {['#','Descripción','Cant','Precio','Dto%','IVA%','Subtotal','×'].map((h, i) => (
                              <th key={h} style={{ padding: '8px 10px', textAlign: i >= 2 && i <= 6 ? 'right' : 'left', fontWeight: 600, color: GRAY, fontSize: '11px', borderBottom: '1px solid #EDF2F7' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it, idx) => {
                            const alic = it.alicuota ?? 21;
                            const pNeto = precioConIva ? it.precio / (1 + alic / 100) : it.precio;
                            const sub = pNeto * it.cantidad * (1 - it.dto / 100);
                            return (
                              <tr key={it.tempId} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                                <td style={{ padding: '6px 10px', color: GRAY, fontSize: '11px' }}>{idx + 1}</td>
                                <td style={{ padding: '6px 10px' }}>
                                  <div style={{ fontWeight: 500, color: TEXT }}>{it.descripcion}</div>
                                  {it.codigo && <div style={{ fontSize: '11px', color: GRAY }}>{it.codigo}</div>}
                                </td>
                                <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                                  <input type="number" value={it.cantidad} min="0.01" step="0.01"
                                    onChange={e => actualizarItem(it.tempId, 'cantidad', parseFloat(e.target.value) || 0)}
                                    style={{ ...inputStyle, width: '64px', padding: '4px 6px', textAlign: 'right' }} />
                                </td>
                                <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                                  <input type="number" value={it.precio} min="0" step="0.01"
                                    onChange={e => actualizarItem(it.tempId, 'precio', parseFloat(e.target.value) || 0)}
                                    style={{ ...inputStyle, width: '84px', padding: '4px 6px', textAlign: 'right' }} />
                                </td>
                                <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                                  <input type="number" value={it.dto} min="0" max="100" step="0.5"
                                    onChange={e => actualizarItem(it.tempId, 'dto', parseFloat(e.target.value) || 0)}
                                    style={{ ...inputStyle, width: '56px', padding: '4px 6px', textAlign: 'right' }} />
                                </td>
                                <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                                  <select value={it.alicuota}
                                    onChange={e => actualizarItem(it.tempId, 'alicuota', parseFloat(e.target.value))}
                                    style={{ ...inputStyle, width: '72px', padding: '4px 6px', cursor: 'pointer' }}>
                                    <option value={0}>0%</option>
                                    <option value={10.5}>10.5%</option>
                                    <option value={21}>21%</option>
                                  </select>
                                </td>
                                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: GREEN, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fmt(sub)}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                  <button onClick={() => eliminarItem(it.tempId)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: RED, fontSize: '18px', lineHeight: 1 }}>×</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '24px', color: GRAY, fontSize: '13px', border: '2px dashed #EDF2F7', borderRadius: '10px' }}>
                      Buscá un producto arriba o usá "＋ Libre"
                    </div>
                  )}
                </div>

                {/* ── VALIDEZ ───────────────────────────────── */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: `2px solid ${SEP}`, paddingBottom: '6px', marginBottom: '12px' }}>⏱️ Validez y condiciones</div>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <div>
                      <label style={labelStyle}>Días de validez</label>
                      <input type="number" value={diasValidez} min="1" max="365"
                        onChange={e => setDiasValidez(parseInt(e.target.value) || 15)}
                        style={{ ...inputStyle, width: '100px' }} />
                      <div style={{ fontSize: '11px', color: GRAY, marginTop: '4px' }}>
                        Vence: <strong style={{ color: ORANGE }}>{fmtFecha(fechaVenc)}</strong>
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <label style={labelStyle}>Condiciones</label>
                      <textarea value={condiciones} onChange={e => setCondiciones(e.target.value)}
                        rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', height: '58px' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: '160px' }}>
                      <label style={labelStyle}>Observaciones internas</label>
                      <textarea value={observ} onChange={e => setObserv(e.target.value)}
                        rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', height: '58px' }} />
                    </div>
                  </div>
                </div>

                {/* ── TOTALES ──────────────────────────────── */}
                {items.length > 0 && (
                  <div style={{ backgroundColor: '#F7FAFC', borderRadius: '10px', padding: '16px 20px', marginBottom: '20px', border: '1px solid #EDF2F7' }}>
                    <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <div style={{ flex: '1 1 200px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                          <span style={{ color: GRAY }}>Subtotal:</span>
                          <span style={{ fontWeight: 600 }}>{fmt(sumaSubtotales)}</span>
                        </div>
                        {descGlobal > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px', color: '#E53E3E' }}>
                            <span>Descuento ({descGlobal}%):</span><span>-{fmt(descuentoMonto)}</span>
                          </div>
                        )}
                        {recargo > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px', color: '#DD6B20' }}>
                            <span>Recargo ({recargo}%):</span><span>+{fmt(recargoMonto)}</span>
                          </div>
                        )}
                        {Object.entries(ivaByAlic).sort(([a],[b])=>Number(a)-Number(b)).map(([alic,monto]) => (
                          <div key={alic} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px', color: GRAY }}>
                            <span>IVA {alic}%:</span><span>{fmt(monto)}</span>
                          </div>
                        ))}
                        <div style={{ borderTop: `2px solid ${SEP}`, marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '15px', fontWeight: 700, color: NAVY }}>TOTAL:</span>
                          <span style={{ fontSize: '24px', fontWeight: 800, color: GREEN }}>{fmt(total)}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                          <label style={labelStyle}>Descuento global %</label>
                          <input type="number" value={descGlobal} min="0" max="100" step="0.5"
                            onChange={e => setDescGlobal(parseFloat(e.target.value) || 0)}
                            style={{ ...inputStyle, width: '120px' }} />
                        </div>
                        <div>
                          <label style={labelStyle}>Recargo %</label>
                          <input type="number" value={recargo} min="0" max="100" step="0.5"
                            onChange={e => setRecargo(parseFloat(e.target.value) || 0)}
                            style={{ ...inputStyle, width: '120px' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Error */}
                {errForm && (
                  <div style={{ backgroundColor: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: RED, marginBottom: '16px' }}>
                    {errForm}
                  </div>
                )}

                {/* Botones */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
                  <button onClick={cerrarModal} style={btnStyle('#EDF2F7', GRAY)}>Cancelar</button>
                  <button onClick={() => submitPresupuesto('borrador')}
                    disabled={procesando || items.length === 0}
                    style={btnStyle('#4A5568', '#fff', procesando || items.length === 0)}>
                    {procesando ? '⏳...' : '💾 Guardar borrador'}
                  </button>
                  <button onClick={() => submitPresupuesto('enviado')}
                    disabled={procesando || items.length === 0}
                    style={btnStyle(GREEN, '#fff', procesando || items.length === 0)}>
                    {procesando ? '⏳ Procesando...' : '📋 Generar presupuesto'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal detalle */}
      {detalle && (
        <ModalDetalle
          detalle={detalle}
          onConvertir={() => convertirEnVenta(detalle.presupuesto.id, true)}
          onCerrar={() => setDetalle(null)}
          convirtiendo={convirtiendo}
        />
      )}

      {/* Modal producto libre */}
      {modalLibre && (
        <ModalProductoLibre onAgregar={agregarLibre} onCerrar={() => setModalLibre(false)} />
      )}
    </div>
  );
}

export default RobertoPresupuestos;
