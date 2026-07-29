import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../../config/api';
import { getToken } from '../../../utils/auth';

// ─── COLORES ─────────────────────────────────────────────────
const NAVY   = '#1B2A4A';
const BLUE   = '#2B6CB0';
const GREEN  = '#38A169';
const RED    = '#E53E3E';
const SEP    = '#63B3ED';
const GRAY   = '#718096';
const TEXT   = '#2D3748';
const BG     = '#F4F6F9';
const ORANGE = '#DD6B20';

// ─── AUTH ─────────────────────────────────────────────────────
function getClienteId(): number | null {
  try { const s = localStorage.getItem('roberto_portal_session'); return s ? JSON.parse(s).cliente?.id ?? null : null; } catch { return null; }
}
function hdr() { return { 'x-superadmin-token': getToken(), 'Content-Type': 'application/json' }; }

// ─── HELPERS ─────────────────────────────────────────────────
function fmt(n: number | string | undefined) { return `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtFecha(f: string | null | undefined) { if (!f) return '—'; return new Date(f).toLocaleDateString('es-AR'); }
function fmtFechaHora(f: string | null | undefined) { if (!f) return '—'; return new Date(f).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function n(v: number | string | undefined): number { return parseFloat(String(v)) || 0; }

// ─── TIPOS ───────────────────────────────────────────────────
interface ConfigARCA {
  configurado: boolean;
  cuit?: string;
  razon_social?: string;
  punto_venta?: number;
  modo?: string;
  estado_conexion?: string;
  ultima_conexion?: string;
  ultimo_error?: string;
  token_expira?: string;
  tiene_certificado?: boolean;
  tiene_clave?: boolean;
  emite_factura_a?: boolean;
  emite_factura_b?: boolean;
  emite_factura_c?: boolean;
}

interface Comprobante {
  id: number;
  tipo_comprobante: string;
  numero_completo: string;
  receptor_nombre: string;
  receptor_cuit: string;
  importe_total: number;
  cae: string;
  cae_vencimiento: string;
  fecha_emision: string;
  estado: string;
  venta_id?: number;
}

interface LogEntry { id: number; tipo: string; exitoso: boolean; error: string; creado_en: string; }

type Tab = 'emitir' | 'historial' | 'estado';

// ─── BADGE ESTADO CONEXIÓN ────────────────────────────────────
function BadgeConexion({ estado }: { estado?: string }) {
  const MAP: Record<string, { icon: string; label: string; color: string; bg: string }> = {
    ok:              { icon: '🟢', label: 'Conectado',    color: GREEN,  bg: '#F0FFF4' },
    error:           { icon: '🔴', label: 'Error',        color: RED,    bg: '#FFF5F5' },
    token_vencido:   { icon: '🟡', label: 'Token vencido',color: ORANGE, bg: '#FFFAF0' },
    sin_configurar:  { icon: '⚪', label: 'Sin configurar',color: GRAY,  bg: '#F7FAFC' },
  };
  const c = MAP[estado ?? 'sin_configurar'] ?? MAP['sin_configurar'];
  return (
    <span style={{ fontSize: '12px', fontWeight: 700, color: c.color, backgroundColor: c.bg,
      border: `1px solid ${c.color}`, borderRadius: '10px', padding: '3px 10px', whiteSpace: 'nowrap' }}>
      {c.icon} {c.label}
    </span>
  );
}

// ─── PDF DEL COMPROBANTE ──────────────────────────────────────
function generarPDFComprobante(comp: Comprobante) {
  const qrData = { ver: 1, cmp: comp.numero_completo, cae: comp.cae, imp: n(comp.importe_total) };
  const qrBase64 = btoa(JSON.stringify(qrData));
  const qrUrl    = `https://www.afip.gob.ar/fe/qr/?p=${qrBase64}`;
  const cfg = (() => { try { return JSON.parse(localStorage.getItem(`roberto_config_${getClienteId()}`) || '{}'); } catch { return {}; } })();
  const logoUrl  = cfg.logo_url         || '';
  const negNom   = cfg.nombre_comercial || '';
  const negDir   = cfg.direccion        || '';
  const negCuit  = cfg.cuit             || '';
  const logoBlock = `<div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #e2e8f0">
    ${logoUrl ? `<img src="${logoUrl}" alt="" style="max-width:150px;max-height:70px;object-fit:contain;flex-shrink:0">` : ''}
    <div>
      ${negNom  ? `<div style="font-size:18px;font-weight:700">${negNom}</div>`   : ''}
      ${negDir  ? `<div style="font-size:12px;color:#666">${negDir}</div>`        : ''}
      ${negCuit ? `<div style="font-size:12px;color:#666">CUIT: ${negCuit}</div>` : ''}
    </div>
  </div>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>${comp.numero_completo}</title>
    <style>body{font-family:Arial,sans-serif;padding:32px;color:#2D3748;font-size:13px}
    .box{border:2px solid #2B6CB0;border-radius:8px;padding:20px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #eee}
    .total{font-size:22px;font-weight:700;color:#2B6CB0}</style></head><body>
    ${logoBlock}
    <div class="box">
      <h1 style="color:#1B2A4A;margin:0 0 4px">${comp.numero_completo}</h1>
      <p style="margin:0;color:#718096">Fecha: ${fmtFecha(comp.fecha_emision)}</p>
    </div>
    <div class="box">
      <p><strong>Receptor:</strong> ${comp.receptor_nombre} — CUIT ${comp.receptor_cuit || '—'}</p>
      <p class="total">Total: ${fmt(comp.importe_total)}</p>
    </div>
    <div class="box" style="border-color:#38A169">
      <p><strong>CAE:</strong> ${comp.cae}</p>
      <p><strong>Vto. CAE:</strong> ${fmtFecha(comp.cae_vencimiento)}</p>
    </div>
    <div style="margin-top:20px;text-align:center">
      <p style="font-size:11px;color:#718096">QR ARCA (escanear para validar)</p>
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrUrl)}" width="120" height="120" />
    </div>
    <script>window.print()</script></body></html>`);
  w.document.close();
}

// ─── WHATSAPP FACTURA ─────────────────────────────────────────
function whatsAppFactura(comp: Comprobante) {
  const texto = `*Comprobante: ${comp.numero_completo}*\n` +
    `Fecha: ${fmtFecha(comp.fecha_emision)}\n` +
    `*Total: ${fmt(comp.importe_total)}*\n` +
    `CAE: ${comp.cae}\nVto CAE: ${fmtFecha(comp.cae_vencimiento)}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
}

// ─── PANTALLA RESULTADO FACTURA ───────────────────────────────
function PantallaResultado({ resultado, onCerrar }: {
  resultado: { cae: string; numero_completo: string; tipo_factura: string; vencimiento_cae: string };
  onCerrar: () => void;
}) {
  const comp = {
    id: 0, tipo_comprobante: resultado.tipo_factura, numero_completo: resultado.numero_completo,
    receptor_nombre: '', receptor_cuit: '', importe_total: 0,
    cae: resultado.cae, cae_vencimiento: resultado.vencimiento_cae,
    fecha_emision: new Date().toISOString(), estado: 'emitida',
  };
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '36px', width: '480px', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <div style={{ fontSize: '52px', marginBottom: '12px' }}>✅</div>
        <h2 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: 700, color: NAVY }}>¡Factura emitida!</h2>
        <p style={{ margin: '0 0 20px', fontSize: '22px', fontWeight: 700, color: BLUE }}>{resultado.numero_completo}</p>
        <div style={{ backgroundColor: '#F7FAFC', borderRadius: '8px', padding: '16px', marginBottom: '20px', textAlign: 'left' }}>
          {[
            { label: 'CAE',            valor: resultado.cae           },
            { label: 'Vencimiento CAE',valor: fmtFecha(resultado.vencimiento_cae) },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #EDF2F7', fontSize: '13px' }}>
              <span style={{ color: GRAY }}>{r.label}</span>
              <span style={{ fontWeight: 700, color: TEXT, fontFamily: 'monospace' }}>{r.valor}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => generarPDFComprobante(comp)}
            style={{ padding: '9px 16px', backgroundColor: NAVY, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
            📄 PDF con QR
          </button>
          <button onClick={() => { window.print(); }}
            style={{ padding: '9px 16px', backgroundColor: GRAY, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
            🖨️ Imprimir
          </button>
          <button onClick={() => whatsAppFactura(comp)}
            style={{ padding: '9px 16px', backgroundColor: '#25D366', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
            💬 WhatsApp
          </button>
          <button onClick={onCerrar}
            style={{ padding: '9px 16px', backgroundColor: GREEN, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
            ✅ Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TAB EMITIR FACTURA ───────────────────────────────────────
function TabEmitir({ cid, config, onEmitida }: {
  cid: number; config: ConfigARCA;
  onEmitida: (r: any) => void;
}) {
  const [ventas, setVentas]             = useState<any[]>([]);
  const [ventaSel, setVentaSel]         = useState<any | null>(null);
  const [buscarVenta, setBuscarVenta]   = useState('');
  const [tipoFact, setTipoFact]         = useState('6');
  const [receptorCuit, setReceptorCuit] = useState('');
  const [receptorNombre, setReceptorNombre] = useState('Consumidor Final');
  const [receptorCondIVA, setReceptorCondIVA] = useState('5');
  const [emitiendo, setEmitiendo]       = useState(false);
  const [error, setError]               = useState('');
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscarVentas = useCallback(async (q: string) => {
    try {
      const p = new URLSearchParams({ sin_facturar: 'true', limit: '10' });
      if (q) p.set('q', q);
      const r = await fetch(`${API_BASE}/api/superadmin/ventas/${cid}/listado?${p}`,
        { headers: { 'x-superadmin-token': getToken() } });
      if (r.ok) {
        const d = await r.json();
        setVentas(d.ventas ?? d ?? []);
      }
    } catch { setVentas([]); }
  }, [cid]);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => buscarVentas(buscarVenta), 300);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [buscarVenta, buscarVentas]);

  useEffect(() => { buscarVentas(''); }, [buscarVentas]);

  const seleccionarVenta = (v: any) => {
    setVentaSel(v);
    if (v.cliente_nombre) setReceptorNombre(v.cliente_nombre);
    if (v.cliente_cuit)   setReceptorCuit(v.cliente_cuit);
  };

  // Calcular importes
  const total = n(ventaSel?.total ?? ventaSel?.monto_total ?? 0);
  const itemsVenta = (ventaSel?.items ?? []) as any[];
  const iva21 = itemsVenta
    .filter((it: any) => n(it.alicuota_iva) === 21)
    .reduce((acc: number, it: any) => acc + n(it.precio ?? it.precio_unitario) * n(it.cantidad) * 21 / 100, 0);
  const neto21 = itemsVenta
    .filter((it: any) => n(it.alicuota_iva) === 21)
    .reduce((acc: number, it: any) => acc + n(it.precio ?? it.precio_unitario) * n(it.cantidad), 0) - iva21;
  const iva105 = itemsVenta
    .filter((it: any) => n(it.alicuota_iva) === 10.5)
    .reduce((acc: number, it: any) => acc + n(it.precio ?? it.precio_unitario) * n(it.cantidad) * 10.5 / 100, 0);
  const neto105 = itemsVenta
    .filter((it: any) => n(it.alicuota_iva) === 10.5)
    .reduce((acc: number, it: any) => acc + n(it.precio ?? it.precio_unitario) * n(it.cantidad), 0) - iva105;

  const emitir = async () => {
    if (!ventaSel) return;
    setError('');
    setEmitiendo(true);
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/arca/facturar/${cid}`, {
        method: 'POST', headers: hdr(),
        body: JSON.stringify({
          venta_id: ventaSel?.id || null,
          tipo_factura: tipoFact,
          punto_venta: config.punto_venta || 1,
          receptor_cuit: receptorCuit,
          receptor_nombre: receptorNombre,
          receptor_condicion_iva: receptorCondIVA,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Error al facturar'); return; }
      onEmitida(d);
    } finally { setEmitiendo(false); }
  };

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' };
  const lbl: React.CSSProperties = { fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' };

  // Tipos habilitados
  const tiposDisp = [
    { v: '1',  label: 'Factura A',  enabled: config.emite_factura_a },
    { v: '6',  label: 'Factura B',  enabled: config.emite_factura_b !== false },
    { v: '11', label: 'Factura C',  enabled: config.emite_factura_c },
  ].filter(t => t.enabled);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {error && <div style={{ backgroundColor: '#FFF5F5', color: RED, padding: '10px 14px', borderRadius: '7px', fontSize: '13px' }}>{error}</div>}

      {/* Buscar venta */}
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h4 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: NAVY }}>Buscar venta</h4>
        <input value={buscarVenta} onChange={e => setBuscarVenta(e.target.value)}
          placeholder="🔍 Buscar por número o cliente..."
          style={{ ...inp, marginBottom: '10px' }} />
        {ventas.length === 0 ? (
          <p style={{ color: GRAY, fontSize: '13px', textAlign: 'center', padding: '12px' }}>No hay ventas sin facturar</p>
        ) : (
          <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #EDF2F7', borderRadius: '7px' }}>
            {ventas.map((v, idx) => (
              <div key={v.id} onClick={() => seleccionarVenta(v)}
                style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid #EDF2F7',
                  backgroundColor: ventaSel?.id === v.id ? '#EBF8FF' : idx % 2 === 0 ? '#fff' : '#F7FAFC' }}
                onMouseEnter={e => { if (ventaSel?.id !== v.id) e.currentTarget.style.background = '#F0F8FF'; }}
                onMouseLeave={e => { if (ventaSel?.id !== v.id) e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#F7FAFC'; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: ventaSel?.id === v.id ? 700 : 400 }}>
                    {v.numero_venta || v.numero || `#${v.id}`} — {v.cliente_nombre || v.nombre || '—'}
                  </span>
                  <span style={{ color: BLUE, fontWeight: 600 }}>{fmt(v.total ?? v.monto_total ?? 0)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {ventaSel && (
          <div style={{ marginTop: '8px', padding: '8px 12px', backgroundColor: '#EBF8FF', borderRadius: '7px', fontSize: '12px', color: BLUE, fontWeight: 600 }}>
            ✓ Seleccionada: {ventaSel.numero_venta || `#${ventaSel.id}`} — {fmt(ventaSel.total ?? ventaSel.monto_total ?? 0)}
          </div>
        )}
      </div>

      {/* Datos factura */}
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h4 style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: 700, color: NAVY }}>Datos de la factura</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={lbl}>Tipo de comprobante</label>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {tiposDisp.length === 0 ? (
                <span style={{ fontSize: '13px', color: GRAY }}>No hay tipos habilitados en la configuración</span>
              ) : tiposDisp.map(t => (
                <label key={t.v} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                  <input type="radio" name="tipo_fact" value={t.v} checked={tipoFact === t.v} onChange={() => setTipoFact(t.v)} />
                  {t.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label style={lbl}>Receptor CUIT</label>
            <input value={receptorCuit} onChange={e => setReceptorCuit(e.target.value)} placeholder="20-12345678-9" style={inp} />
          </div>
          <div>
            <label style={lbl}>Receptor nombre</label>
            <input value={receptorNombre} onChange={e => setReceptorNombre(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Condición IVA receptor</label>
            <select value={receptorCondIVA} onChange={e => setReceptorCondIVA(e.target.value)} style={{ ...inp, background: '#fff' }}>
              <option value="1">Responsable Inscripto</option>
              <option value="4">Exento</option>
              <option value="5">Consumidor Final</option>
              <option value="6">Monotributista</option>
            </select>
          </div>
        </div>
      </div>

      {/* Importes calculados */}
      {ventaSel && (
        <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h4 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: NAVY }}>Desglose de importes</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[
              { label: 'Neto gravado 21%',  valor: fmt(neto21),  color: TEXT  },
              { label: 'IVA 21%',           valor: fmt(iva21),   color: GRAY  },
              { label: 'Neto gravado 10.5%',valor: fmt(neto105), color: TEXT  },
              { label: 'IVA 10.5%',         valor: fmt(iva105),  color: GRAY  },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #EDF2F7', fontSize: '13px' }}>
                <span style={{ color: GRAY }}>{r.label}</span>
                <span style={{ color: r.color }}>{r.valor}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: '16px', fontWeight: 700 }}>
              <span style={{ color: NAVY }}>TOTAL</span>
              <span style={{ color: BLUE }}>{fmt(total || (ventaSel ? n(ventaSel.total) : 0))}</span>
            </div>
          </div>
        </div>
      )}

      {/* Botón emitir */}
      <button onClick={emitir} disabled={emitiendo}
        style={{ padding: '14px', backgroundColor: emitiendo ? '#C6F6D5' : GREEN, color: '#fff', border: 'none', borderRadius: '10px',
          cursor: emitiendo ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: 700, opacity: emitiendo ? 0.8 : 1 }}>
        {emitiendo ? '⏳ Conectando con ARCA...' : '✅ Emitir factura'}
      </button>
    </div>
  );
}

// ─── TAB HISTORIAL ────────────────────────────────────────────
function TabHistorial({ cid }: { cid: number }) {
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [limit]             = useState(25);
  const [cargando, setCargando] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [tipoFilt, setTipoFilt] = useState('');
  const [fDesde, setFDesde] = useState('');
  const [fHasta, setFHasta] = useState('');
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargar = useCallback(async (pg: number, q: string) => {
    setCargando(true);
    try {
      const p = new URLSearchParams({ page: String(pg), limit: String(limit) });
      if (q) p.set('buscar', q);
      if (tipoFilt) p.set('tipo_comprobante', tipoFilt);
      if (fDesde) p.set('fecha_desde', fDesde);
      if (fHasta) p.set('fecha_hasta', fHasta);
      const r = await fetch(`${API_BASE}/api/superadmin/arca/historial/${cid}?${p}`,
        { headers: { 'x-superadmin-token': getToken() } });
      if (r.ok) { const d = await r.json(); setComprobantes(d.comprobantes ?? []); setTotal(d.total ?? 0); }
    } finally { setCargando(false); }
  }, [cid, tipoFilt, fDesde, fHasta, limit]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setPage(1); cargar(1, buscar); }, [tipoFilt, fDesde, fHasta]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => { setPage(1); cargar(1, buscar); }, 300);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [buscar]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(1, ''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="🔍 Número o receptor..."
          style={{ padding: '8px 12px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', minWidth: '200px' }} />
        <select value={tipoFilt} onChange={e => setTipoFilt(e.target.value)}
          style={{ padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', background: '#fff' }}>
          <option value="">Todos los tipos</option>
          <option value="1">Factura A</option>
          <option value="6">Factura B</option>
          <option value="11">Factura C</option>
        </select>
        <input type="date" value={fDesde} onChange={e => setFDesde(e.target.value)}
          style={{ padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px' }} />
        <input type="date" value={fHasta} onChange={e => setFHasta(e.target.value)}
          style={{ padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px' }} />
        <button onClick={() => { setBuscar(''); setTipoFilt(''); setFDesde(''); setFHasta(''); }}
          style={{ padding: '8px 14px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', background: '#fff', cursor: 'pointer', color: GRAY }}>
          Limpiar
        </button>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        {cargando ? (
          <div style={{ padding: '48px', textAlign: 'center', color: GRAY }}>Cargando historial...</div>
        ) : comprobantes.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📄</div>
            <p style={{ color: GRAY, fontSize: '14px' }}>No hay comprobantes en este período</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '700px' }}>
                <thead style={{ backgroundColor: '#F7FAFC', borderBottom: `2px solid ${SEP}` }}>
                  <tr>
                    {['Número', 'Fecha', 'Receptor', 'Total', 'CAE', 'Vto. CAE', 'Estado', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: GRAY, fontWeight: 600, fontSize: '11px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comprobantes.map((c, idx) => (
                    <tr key={c.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC', borderBottom: '1px solid #EDF2F7' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: NAVY, fontFamily: 'monospace', fontSize: '12px' }}>{c.numero_completo}</td>
                      <td style={{ padding: '10px 14px', color: GRAY }}>{fmtFecha(c.fecha_emision)}</td>
                      <td style={{ padding: '10px 14px', color: TEXT }}>{c.receptor_nombre || '—'}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: BLUE }}>{fmt(c.importe_total)}</td>
                      <td style={{ padding: '10px 14px', color: GRAY, fontFamily: 'monospace', fontSize: '11px' }}>{c.cae}</td>
                      <td style={{ padding: '10px 14px', color: GRAY }}>{fmtFecha(c.cae_vencimiento)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: c.estado === 'anulada' ? RED : GREEN,
                          backgroundColor: c.estado === 'anulada' ? '#FFF5F5' : '#F0FFF4',
                          borderRadius: '10px', padding: '2px 8px' }}>
                          {c.estado === 'anulada' ? 'Anulada' : 'Emitida'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => generarPDFComprobante(c)}
                            style={{ padding: '4px 8px', fontSize: '11px', border: `1px solid ${NAVY}`, color: NAVY, borderRadius: '5px', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                            📄 PDF
                          </button>
                          <button onClick={() => { window.print(); }}
                            style={{ padding: '4px 8px', fontSize: '11px', border: `1px solid ${GRAY}`, color: GRAY, borderRadius: '5px', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                            🖨️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid #EDF2F7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: GRAY }}>
              <span>Total: {total} comprobantes</span>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button onClick={() => { const p = Math.max(1, page-1); setPage(p); cargar(p, buscar); }} disabled={page === 1}
                  style={{ padding: '4px 10px', border: '1px solid #CBD5E0', borderRadius: '5px', cursor: page===1 ? 'default' : 'pointer', background: '#fff', opacity: page===1 ? 0.4 : 1 }}>‹</button>
                <span>{page} / {totalPages}</span>
                <button onClick={() => { const p = Math.min(totalPages, page+1); setPage(p); cargar(p, buscar); }} disabled={page===totalPages}
                  style={{ padding: '4px 10px', border: '1px solid #CBD5E0', borderRadius: '5px', cursor: page===totalPages ? 'default' : 'pointer', background: '#fff', opacity: page===totalPages ? 0.4 : 1 }}>›</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── TAB ESTADO ───────────────────────────────────────────────
function TabEstado({ cid, config, onRecargar }: { cid: number; config: ConfigARCA; onRecargar: () => void }) {
  const [logs, setLogs]       = useState<LogEntry[]>([]);
  const [renovando, setRenovando] = useState(false);
  const [msgRenov, setMsgRenov]   = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/api/superadmin/arca/logs/${cid}?limit=5`, { headers: { 'x-superadmin-token': getToken() } })
      .then(r => r.json()).then(d => setLogs(d.logs ?? [])).catch(() => {});
  }, [cid]);

  const renovarToken = async () => {
    setRenovando(true); setMsgRenov('');
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/arca/config/${cid}/test`, {
        method: 'POST', headers: hdr(),
      });
      const d = await r.json();
      if (d.ok) {
        const exp = d.expira_en ? new Date(d.expira_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—';
        setMsgRenov(`✅ Token renovado. Válido hasta ${exp}`);
      } else {
        setMsgRenov(`❌ Error: ${d.error || 'Sin respuesta'}`);
      }
      onRecargar();
    } finally { setRenovando(false); }
  };

  const tokenVigente = config.token_expira
    ? new Date(config.token_expira).getTime() > Date.now()
    : false;
  const tokenHoraExp = config.token_expira
    ? new Date(config.token_expira).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Info config */}
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h4 style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: 700, color: NAVY }}>Estado de conexión ARCA</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {[
            { label: 'CUIT configurado',  valor: config.cuit || '—' },
            { label: 'Punto de venta',    valor: String(config.punto_venta || '—') },
            { label: 'Modo',
              valor: config.modo === 'produccion' ? '🟢 Producción' : '🟡 Homologación' },
            { label: 'Token WSAA',
              valor: tokenVigente ? `Vigente hasta ${tokenHoraExp}` : 'Sin token / vencido' },
          ].map(r => (
            <div key={r.label} style={{ backgroundColor: '#F7FAFC', borderRadius: '8px', padding: '12px' }}>
              <p style={{ margin: '0 0 4px', fontSize: '11px', color: GRAY, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{r.label}</p>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: TEXT }}>{r.valor}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <BadgeConexion estado={config.estado_conexion} />
          <button onClick={renovarToken} disabled={renovando}
            style={{ padding: '8px 18px', backgroundColor: renovando ? '#BEE3F8' : BLUE, color: '#fff', border: 'none', borderRadius: '8px', cursor: renovando ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600 }}>
            {renovando ? '⏳ Renovando...' : '🔄 Renovar token'}
          </button>
          {msgRenov && <span style={{ fontSize: '13px', color: msgRenov.startsWith('✅') ? GREEN : RED, fontWeight: 600 }}>{msgRenov}</span>}
        </div>
      </div>

      {/* Últimos logs */}
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `2px solid ${SEP}` }}>
          <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: NAVY }}>Últimos 5 logs de conexión</h4>
        </div>
        {logs.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: GRAY, fontSize: '13px' }}>Sin logs registrados</div>
        ) : logs.map((log, idx) => (
          <div key={log.id} style={{ padding: '10px 20px', borderBottom: '1px solid #EDF2F7', display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}>
            <span style={{ fontSize: '14px' }}>{log.exitoso ? '✅' : '❌'}</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: GRAY, width: '120px' }}>{log.tipo}</span>
            <span style={{ fontSize: '12px', color: log.exitoso ? GREEN : RED, flex: 1 }}>{log.exitoso ? 'OK' : log.error || 'Error'}</span>
            <span style={{ fontSize: '11px', color: GRAY }}>{fmtFechaHora(log.creado_en)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────
function RobertoArca() {
  const navigate   = useNavigate();
  const cid        = getClienteId();
  const [tab, setTab]         = useState<Tab>('emitir');
  const [config, setConfig]   = useState<ConfigARCA>({ configurado: false });
  const [histSummary, setHistSummary] = useState({ facturasMes: 0, ultimoCae: '', proxVtoCae: '' });
  const [resultado, setResultado]     = useState<any | null>(null);

  const cargarConfig = useCallback(async () => {
    if (!cid) return;
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/arca/config/${cid}`,
        { headers: { 'x-superadmin-token': getToken() } });
      if (r.ok) setConfig(await r.json());
    } catch { /* silencioso */ }
  }, [cid]);

  const cargarResumenHistorial = useCallback(async () => {
    if (!cid) return;
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/arca/historial/${cid}?limit=1`,
        { headers: { 'x-superadmin-token': getToken() } });
      if (r.ok) {
        const d = await r.json();
        const total = d.total ?? 0;
        const primero = d.comprobantes?.[0];
        setHistSummary({
          facturasMes: total,
          ultimoCae:   primero?.cae           ?? '—',
          proxVtoCae:  primero?.cae_vencimiento ?? '',
        });
      }
    } catch { /* silencioso */ }
  }, [cid]);

  useEffect(() => { cargarConfig(); cargarResumenHistorial(); }, [cargarConfig, cargarResumenHistorial]);

  if (!cid) return <div style={{ padding: '40px', textAlign: 'center', color: GRAY }}>Sin sesión activa.</div>;

  const tokenExp  = config.token_expira ? new Date(config.token_expira).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—';
  const tokenVig  = config.token_expira ? new Date(config.token_expira).getTime() > Date.now() : false;

  return (
    <div style={{ padding: '24px', backgroundColor: BG, minHeight: '100vh' }}>
      {/* Pantalla resultado */}
      {resultado && <PantallaResultado resultado={resultado} onCerrar={() => { setResultado(null); cargarResumenHistorial(); }} />}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: NAVY }}>📄 Facturación ARCA</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: GRAY }}>
            Facturación electrónica — {config.modo === 'produccion' ? (
              <span style={{ color: GREEN, fontWeight: 600 }}>Producción</span>
            ) : (
              <span style={{ color: ORANGE, fontWeight: 600 }}>Homologación</span>
            )}
          </p>
        </div>
        <button onClick={() => navigate('/roberto/dashboard')}
          style={{ padding: '9px 16px', border: '1px solid #CBD5E0', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>
          ← Dashboard
        </button>
      </div>

      {/* 4 Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
        {[
          { icon: '🔌', label: 'Estado ARCA',           valor: <BadgeConexion estado={config.estado_conexion} />, color: config.estado_conexion === 'ok' ? GREEN : RED },
          { icon: '📄', label: 'Comprobantes emitidos',  valor: String(histSummary.facturasMes),                 color: BLUE   },
          { icon: '🔑', label: 'Último CAE',             valor: histSummary.ultimoCae || '—',                    color: NAVY   },
          { icon: '⏰', label: 'Token vigente hasta',    valor: tokenVig ? tokenExp : 'Vencido',                 color: tokenVig ? GREEN : RED },
        ].map(c => (
          <div key={c.label} style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${c.color}` }}>
            <div style={{ fontSize: '22px', marginBottom: '6px' }}>{c.icon}</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: c.color, marginBottom: '2px' }}>{c.valor}</div>
            <div style={{ fontSize: '12px', color: GRAY }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', backgroundColor: '#fff', borderRadius: '10px', padding: '4px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', width: 'fit-content' }}>
        {[
          { id: 'emitir',    label: '📄 Emitir factura' },
          { id: 'historial', label: '📋 Historial'       },
          { id: 'estado',    label: '🔧 Estado'          },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as Tab)}
            style={{ padding: '8px 18px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: tab === t.id ? 700 : 400,
              backgroundColor: tab === t.id ? NAVY : 'transparent', color: tab === t.id ? '#fff' : GRAY, transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido tab */}
      {tab === 'emitir' && (
        <TabEmitir cid={cid} config={config} onEmitida={r => setResultado(r)} />
      )}
      {tab === 'historial' && <TabHistorial cid={cid} />}
      {tab === 'estado'    && <TabEstado cid={cid} config={config} onRecargar={cargarConfig} />}
    </div>
  );
}

export default RobertoArca;
