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

// ─── TIPOS ───────────────────────────────────────────────────
interface NotaItem {
  id?: number;
  producto_id?: number | null;
  variante_id?: number | null;
  es_libre: boolean;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento_pct: number;
  alicuota_iva: number;
}

interface Nota {
  id: number;
  numero: number;
  numero_completo: string;
  tipo: 'emitida' | 'recibida';
  estado: string;
  comprador_nombre: string;
  comprador_cuit?: string;
  motivo: string;
  descripcion_motivo?: string;
  subtotal: number;
  total_iva: number;
  total: number;
  afecta_stock?: boolean;
  afecta_cuenta_corriente: boolean;
  observaciones?: string;
  anulada: boolean;
  creado_en: string;
}

interface Resumen {
  nc_emitidas:  { cantidad: number; monto_mes: number };
  nc_recibidas: { cantidad: number; monto_mes: number };
  nd_emitidas:  { cantidad: number; monto_mes: number };
  nd_recibidas: { cantidad: number; monto_mes: number };
}

// ─── BADGES ──────────────────────────────────────────────────
function TipoBadge({ tipo }: { tipo: string }) {
  return (
    <span style={{ fontSize: '11px', fontWeight: 600, color: '#fff',
      backgroundColor: tipo === 'emitida' ? BLUE : GREEN,
      borderRadius: '10px', padding: '2px 8px' }}>
      {tipo === 'emitida' ? 'Emitida' : 'Recibida'}
    </span>
  );
}

const ESTADO_CFG: Record<string, { label: string; bg: string; color: string }> = {
  borrador: { label: 'Borrador', bg: '#EDF2F7', color: GRAY  },
  emitida:  { label: 'Emitida',  bg: BLUE,      color: '#fff' },
  aplicada: { label: 'Aplicada', bg: GREEN,      color: '#fff' },
  anulada:  { label: 'Anulada',  bg: RED,        color: '#fff' },
};
function EstadoBadge({ estado }: { estado: string }) {
  const c = ESTADO_CFG[estado] ?? { label: estado, bg: GRAY, color: '#fff' };
  return (
    <span style={{ fontSize: '11px', fontWeight: 600, color: c.color, backgroundColor: c.bg,
      borderRadius: '10px', padding: '2px 8px',
      textDecoration: estado === 'anulada' ? 'line-through' : 'none' }}>
      {c.label}
    </span>
  );
}

// ─── CALCULAR TOTALES ITEMS ───────────────────────────────────
function calcItem(it: NotaItem) {
  const base = it.cantidad * it.precio_unitario * (1 - it.descuento_pct / 100);
  const iva  = base * (it.alicuota_iva / 100);
  return { subtotal: base, total_item: base + iva };
}
function calcTotalesItems(items: NotaItem[]) {
  let subtotal = 0, total_iva = 0;
  for (const it of items) {
    const c = calcItem(it);
    subtotal  += c.subtotal;
    total_iva += c.subtotal * (it.alicuota_iva / 100);
  }
  return { subtotal, total_iva, total: subtotal + total_iva };
}

// ─── PDF NOTA ─────────────────────────────────────────────────
function generarPDFNota(nota: Nota & { items?: NotaItem[] }, tipoNota: 'credito' | 'debito') {
  const prefijo = tipoNota === 'credito' ? 'NC' : 'ND';
  const color   = tipoNota === 'credito' ? BLUE : ORANGE;
  const w = window.open('', '_blank');
  if (!w) return;

  const filas = (nota.items ?? []).map(it => {
    const c = calcItem(it);
    return `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #eee">${it.descripcion}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center">${it.cantidad}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right">$${Number(it.precio_unitario).toFixed(2)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center">${it.descuento_pct}%</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center">${it.alicuota_iva}%</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:700">$${c.total_item.toFixed(2)}</td>
    </tr>`;
  }).join('');

  w.document.write(`<!DOCTYPE html><html><head><title>${nota.numero_completo}</title>
    <style>body{font-family:Arial,sans-serif;padding:32px;color:#2D3748;font-size:13px}
    table{width:100%;border-collapse:collapse}th{background:#F7FAFC;padding:8px 10px;text-align:left;font-size:11px;color:#718096;border-bottom:2px solid ${color}}</style>
  </head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px">
      <div>
        <h1 style="color:${color};font-size:26px;margin:0">${prefijo === 'NC' ? 'NOTA DE CRÉDITO' : 'NOTA DE DÉBITO'}</h1>
        <h2 style="margin:4px 0 0;color:#1B2A4A;font-size:20px">${nota.numero_completo}</h2>
      </div>
      <div style="text-align:right;font-size:12px;color:#718096">
        <div>Fecha: ${fmtFecha(nota.creado_en)}</div>
        <div>Tipo: ${nota.tipo === 'emitida' ? 'Emitida' : 'Recibida'}</div>
        <div>Estado: ${nota.estado}</div>
      </div>
    </div>
    <div style="margin-bottom:16px;padding:12px 16px;background:#F7FAFC;border-radius:6px">
      <strong>Cliente/Proveedor:</strong> ${nota.comprador_nombre || '—'} ${nota.comprador_cuit ? '· CUIT: ' + nota.comprador_cuit : ''}
    </div>
    <div style="margin-bottom:16px;padding:10px 16px;background:#FFFAF0;border-radius:6px;border-left:4px solid ${color}">
      <strong>Motivo:</strong> ${nota.motivo || '—'}${nota.descripcion_motivo ? '<br>' + nota.descripcion_motivo : ''}
    </div>
    <table style="margin-bottom:16px">
      <thead><tr>
        <th>Descripción</th><th style="text-align:center">Cant.</th><th style="text-align:right">P.Unit.</th>
        <th style="text-align:center">Dto%</th><th style="text-align:center">IVA%</th><th style="text-align:right">Total</th>
      </tr></thead>
      <tbody>${filas || '<tr><td colspan="6" style="padding:12px;color:#718096;text-align:center">Sin items</td></tr>'}</tbody>
    </table>
    <div style="float:right;width:220px">
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee"><span>Subtotal</span><span>${fmt(nota.subtotal)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee"><span>IVA</span><span>${fmt(nota.total_iva)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;font-weight:700;font-size:16px;color:${color}"><span>TOTAL</span><span>${fmt(nota.total)}</span></div>
    </div>
    ${nota.observaciones ? `<div style="clear:both;margin-top:20px;padding:10px 14px;background:#F7FAFC;border-radius:6px;font-size:12px"><strong>Observaciones:</strong> ${nota.observaciones}</div>` : '<div style="clear:both"></div>'}
    <script>window.print()</script>
  </body></html>`);
  w.document.close();
}

// ─── WHATSAPP NOTA ────────────────────────────────────────────
function compartirWhatsApp(nota: Nota, tipoNota: 'credito' | 'debito') {
  const prefijo = tipoNota === 'credito' ? 'NC' : 'ND';
  const texto = `*${prefijo === 'NC' ? 'Nota de Crédito' : 'Nota de Débito'} ${nota.numero_completo}*\n` +
    `Cliente: ${nota.comprador_nombre || '—'}\n` +
    `Motivo: ${nota.motivo || '—'}\n` +
    `*Total: ${fmt(nota.total)}*\n` +
    `Fecha: ${fmtFecha(nota.creado_en)}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
}

// ─── EXPORTAR EXCEL ───────────────────────────────────────────
function exportarExcel(notas: Nota[], tipoNota: 'credito' | 'debito') {
  const prefijo = tipoNota === 'credito' ? 'NC' : 'ND';
  const rows = notas.map(n =>
    [n.numero_completo, fmtFecha(n.creado_en), n.tipo, n.comprador_nombre, n.motivo, n.subtotal, n.total_iva, n.total, n.estado].join('\t')
  );
  const contenido = `Número\tFecha\tTipo\tCliente/Proveedor\tMotivo\tSubtotal\tIVA\tTotal\tEstado\n${rows.join('\n')}`;
  const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `notas_${prefijo.toLowerCase()}.xls`;
  a.click(); URL.revokeObjectURL(url);
}

// ─── TABLA DE ITEMS (en modal) ────────────────────────────────
function TablaItems({ items, onChange }: { items: NotaItem[]; onChange: (items: NotaItem[]) => void }) {
  const [buscarProd, setBuscarProd] = useState('');
  const [resultados, setResultados] = useState<any[]>([]);
  const cid = getClienteId();
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    if (!buscarProd.trim()) { setResultados([]); return; }
    debRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`${API_BASE}/api/superadmin/ventas/${cid}/productos?q=${encodeURIComponent(buscarProd)}&limit=8`,
          { headers: { 'x-superadmin-token': getToken() } });
        if (r.ok) {
          const d = await r.json();
          setResultados(d.productos ?? d ?? []);
        }
      } catch { /* silencioso */ }
    }, 300);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [buscarProd, cid]);

  const agregarProducto = (p: any) => {
    const nuevo: NotaItem = {
      producto_id: p.id, es_libre: false,
      descripcion: p.nombre || p.descripcion || '',
      cantidad: 1, precio_unitario: n(p.precio_venta ?? p.precio ?? 0),
      descuento_pct: 0, alicuota_iva: 21,
    };
    onChange([...items, nuevo]);
    setBuscarProd(''); setResultados([]);
  };

  const agregarLibre = () => {
    onChange([...items, { es_libre: true, descripcion: '', cantidad: 1, precio_unitario: 0, descuento_pct: 0, alicuota_iva: 21 }]);
  };

  const actualizar = (idx: number, campo: keyof NotaItem, val: string | number | boolean) => {
    const copia = [...items];
    (copia[idx] as any)[campo] = val;
    onChange(copia);
  };

  const eliminar = (idx: number) => onChange(items.filter((_, i) => i !== idx));

  return (
    <div>
      {/* Buscador productos */}
      <div style={{ position: 'relative', marginBottom: '10px', display: 'flex', gap: '8px' }}>
        <input value={buscarProd} onChange={e => setBuscarProd(e.target.value)} placeholder="🔍 Buscar producto o EAN..."
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px' }} />
        <button onClick={agregarLibre}
          style={{ padding: '8px 14px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', background: '#fff', color: GRAY, whiteSpace: 'nowrap' }}>
          + Libre
        </button>
        {resultados.length > 0 && (
          <div style={{ position: 'absolute', top: '36px', left: 0, right: '80px', backgroundColor: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', borderRadius: '8px', zIndex: 100, maxHeight: '200px', overflowY: 'auto' }}>
            {resultados.map((p: any) => (
              <div key={p.id} onClick={() => agregarProducto(p)}
                style={{ padding: '8px 14px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid #EDF2F7' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#F7FAFC')}
                onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                <strong>{p.nombre || p.descripcion}</strong> — {fmt(p.precio_venta ?? p.precio ?? 0)}
              </div>
            ))}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: GRAY, fontSize: '13px', border: '1px dashed #CBD5E0', borderRadius: '7px' }}>
          Agregá ítems buscando productos o usando "+ Libre"
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '560px' }}>
            <thead style={{ backgroundColor: '#F7FAFC' }}>
              <tr>
                {['Descripción', 'Cant.', 'P.Unit.', 'Dto%', 'IVA%', 'Subtotal', ''].map(h => (
                  <th key={h} style={{ padding: '7px 8px', textAlign: 'left', color: GRAY, fontWeight: 600, borderBottom: `2px solid ${SEP}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => {
                const c = calcItem(it);
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid #EDF2F7' }}>
                    <td style={{ padding: '6px 8px' }}>
                      <input value={it.descripcion} onChange={e => actualizar(idx, 'descripcion', e.target.value)}
                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #CBD5E0', borderRadius: '5px', fontSize: '12px', boxSizing: 'border-box' }} />
                    </td>
                    <td style={{ padding: '6px 8px', width: '60px' }}>
                      <input type="number" value={it.cantidad} onChange={e => actualizar(idx, 'cantidad', Number(e.target.value))} min="0.01" step="0.01"
                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #CBD5E0', borderRadius: '5px', fontSize: '12px', textAlign: 'right', boxSizing: 'border-box' }} />
                    </td>
                    <td style={{ padding: '6px 8px', width: '80px' }}>
                      <input type="number" value={it.precio_unitario} onChange={e => actualizar(idx, 'precio_unitario', Number(e.target.value))} min="0" step="0.01"
                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #CBD5E0', borderRadius: '5px', fontSize: '12px', textAlign: 'right', boxSizing: 'border-box' }} />
                    </td>
                    <td style={{ padding: '6px 8px', width: '55px' }}>
                      <input type="number" value={it.descuento_pct} onChange={e => actualizar(idx, 'descuento_pct', Number(e.target.value))} min="0" max="100"
                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #CBD5E0', borderRadius: '5px', fontSize: '12px', textAlign: 'right', boxSizing: 'border-box' }} />
                    </td>
                    <td style={{ padding: '6px 8px', width: '55px' }}>
                      <select value={it.alicuota_iva} onChange={e => actualizar(idx, 'alicuota_iva', Number(e.target.value))}
                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #CBD5E0', borderRadius: '5px', fontSize: '12px', background: '#fff', boxSizing: 'border-box' }}>
                        {[0, 2.5, 5, 10.5, 21, 27].map(v => <option key={v} value={v}>{v}%</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '6px 8px', fontWeight: 600, color: BLUE, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(c.total_item)}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <button onClick={() => eliminar(idx)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: RED, fontSize: '14px' }}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function n(v: number | string | undefined): number { return parseFloat(String(v)) || 0; }

// ─── MODAL NUEVA NOTA ─────────────────────────────────────────
function ModalNuevaNota({ tipoNota, cid, onClose, onOk }: {
  tipoNota: 'credito' | 'debito'; cid: number;
  onClose: () => void;
  onOk: (numero_completo: string, nota: Nota) => void;
}) {
  const MOTIVOS_NC = ['devolucion_mercaderia','error_de_precio','descuento_posterior','bonificacion','otro'];
  const MOTIVOS_ND = ['interes_por_mora','diferencia_de_precio','gasto_adicional','ajuste','otro'];
  const MOTIVOS = tipoNota === 'credito' ? MOTIVOS_NC : MOTIVOS_ND;
  const LABELS: Record<string, string> = {
    devolucion_mercaderia: 'Devolución mercadería',
    error_de_precio:       'Error de precio',
    descuento_posterior:   'Descuento posterior',
    bonificacion:          'Bonificación',
    interes_por_mora:      'Interés por mora',
    diferencia_de_precio:  'Diferencia de precio',
    gasto_adicional:       'Gasto adicional',
    ajuste:                'Ajuste',
    otro:                  'Otro',
  };

  const [tipo, setTipo]                 = useState<'emitida' | 'recibida'>('emitida');
  const [compNombre, setCompNombre]     = useState('');
  const [compCuit, setCompCuit]         = useState('');
  const [motivo, setMotivo]             = useState(MOTIVOS[0]);
  const [descMotivo, setDescMotivo]     = useState('');
  const [items, setItems]               = useState<NotaItem[]>([]);
  const [afectaCC, setAfectaCC]         = useState(false);
  const [afectaStock, setAfectaStock]   = useState(false);
  const [obs, setObs]                   = useState('');
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');

  const totales = calcTotalesItems(items);
  const color   = tipoNota === 'credito' ? BLUE : ORANGE;
  const prefijo = tipoNota === 'credito' ? 'NC' : 'ND';

  const emitir = async (estadoFinal: 'borrador' | 'emitida') => {
    setError('');
    if (!compNombre.trim()) { setError('El nombre del cliente/proveedor es obligatorio'); return; }
    setSaving(true);
    try {
      const body = {
        tipo, comprador_nombre: compNombre, comprador_cuit: compCuit,
        motivo, descripcion_motivo: descMotivo,
        items: items.map(it => {
          const c = calcItem(it);
          return { ...it, _subtotal: c.subtotal, _total_item: c.total_item };
        }),
        afecta_cuenta_corriente: afectaCC,
        afecta_stock: tipoNota === 'credito' ? afectaStock : undefined,
        observaciones: obs,
        estado: estadoFinal,
      };
      const endpoint = tipoNota === 'credito' ? 'credito' : 'debito';
      const r = await fetch(`${API_BASE}/api/superadmin/notas/${cid}/${endpoint}`, {
        method: 'POST', headers: hdr(), body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Error al emitir'); return; }
      onOk(d.numero_completo, {
        id: d.nota_id, numero: 0, numero_completo: d.numero_completo, tipo,
        estado: estadoFinal, comprador_nombre: compNombre, comprador_cuit: compCuit,
        motivo, descripcion_motivo: descMotivo,
        subtotal: totales.subtotal, total_iva: totales.total_iva, total: totales.total,
        afecta_stock: tipoNota === 'credito' ? afectaStock : undefined,
        afecta_cuenta_corriente: afectaCC, observaciones: obs, anulada: false,
        creado_en: new Date().toISOString(),
      } as Nota);
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '24px 16px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '28px', width: '680px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700, color }}>
          ＋ Nueva {tipoNota === 'credito' ? 'Nota de Crédito' : 'Nota de Débito'}
        </h3>
        {error && <div style={{ backgroundColor: '#FFF5F5', color: RED, padding: '10px 14px', borderRadius: '7px', fontSize: '13px', marginBottom: '14px' }}>{error}</div>}

        {/* Tipo emitida/recibida */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: NAVY, display: 'block', marginBottom: '8px' }}>Tipo *</label>
          <div style={{ display: 'flex', gap: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: TEXT }}>
              <input type="radio" name="tipo_nota" value="emitida" checked={tipo === 'emitida'} onChange={() => setTipo('emitida')} />
              Emitida (a cliente)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: TEXT }}>
              <input type="radio" name="tipo_nota" value="recibida" checked={tipo === 'recibida'} onChange={() => setTipo('recibida')} />
              Recibida (de proveedor)
            </label>
          </div>
        </div>

        {/* Contraparte */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>
              {tipo === 'emitida' ? 'Cliente *' : 'Proveedor *'}
            </label>
            <input value={compNombre} onChange={e => setCompNombre(e.target.value)}
              placeholder={tipo === 'emitida' ? 'Nombre del cliente' : 'Nombre del proveedor'}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>CUIT</label>
            <input value={compCuit} onChange={e => setCompCuit(e.target.value)} placeholder="20-12345678-9"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
        </div>

        {/* Motivo */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Motivo</label>
            <select value={motivo} onChange={e => setMotivo(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', background: '#fff', boxSizing: 'border-box' }}>
              {MOTIVOS.map(m => <option key={m} value={m}>{LABELS[m]}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Descripción del motivo</label>
            <input value={descMotivo} onChange={e => setDescMotivo(e.target.value)} placeholder="Detalle..."
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
        </div>

        {/* Items */}
        <div style={{ borderTop: '1px solid #EDF2F7', paddingTop: '14px', marginBottom: '14px' }}>
          <p style={{ margin: '0 0 10px', fontSize: '12px', fontWeight: 700, color: NAVY }}>Ítems</p>
          <TablaItems items={items} onChange={setItems} />
        </div>

        {/* Totales */}
        {items.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
            <div style={{ width: '220px' }}>
              {[
                { label: 'Subtotal', valor: fmt(totales.subtotal), color: TEXT },
                { label: 'IVA',      valor: fmt(totales.total_iva), color: GRAY },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #EDF2F7' }}>
                  <span style={{ fontSize: '13px', color: GRAY }}>{r.label}</span>
                  <span style={{ fontSize: '13px', color: r.color }}>{r.valor}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: 700 }}>
                <span style={{ color: color }}>TOTAL</span>
                <span style={{ fontSize: '18px', color }}>{fmt(totales.total)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Opciones */}
        <div style={{ borderTop: '1px solid #EDF2F7', paddingTop: '14px', marginBottom: '16px' }}>
          <p style={{ margin: '0 0 10px', fontSize: '12px', fontWeight: 700, color: NAVY }}>Opciones</p>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: TEXT,
              backgroundColor: afectaCC ? '#EBF8FF' : '#F7FAFC', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${afectaCC ? SEP : '#EDF2F7'}` }}>
              <input type="checkbox" checked={afectaCC} onChange={e => setAfectaCC(e.target.checked)} />
              Afecta cuenta corriente
            </label>
            {tipoNota === 'credito' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: TEXT,
                backgroundColor: afectaStock ? '#F0FFF4' : '#F7FAFC', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${afectaStock ? GREEN : '#EDF2F7'}` }}>
                <input type="checkbox" checked={afectaStock} onChange={e => setAfectaStock(e.target.checked)} />
                Afecta stock (devuelve unidades)
              </label>
            )}
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Observaciones</label>
          <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }} />
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', border: '1px solid #CBD5E0', borderRadius: '7px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>Cancelar</button>
          <button onClick={() => emitir('borrador')} disabled={saving}
            style={{ padding: '10px 18px', border: 'none', borderRadius: '7px', backgroundColor: '#4A5568', color: '#fff', fontWeight: 600, fontSize: '13px', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            Guardar borrador
          </button>
          <button onClick={() => emitir('emitida')} disabled={saving}
            style={{ padding: '10px 24px', border: 'none', borderRadius: '7px', backgroundColor: color, color: '#fff', fontWeight: 700, fontSize: '14px', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Emitiendo...' : `Emitir ${prefijo}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PANTALLA RESULTADO NOTA ──────────────────────────────────
function PantallaResultado({ nota, tipoNota, onCerrar }: {
  nota: Nota; tipoNota: 'credito' | 'debito'; onCerrar: () => void;
}) {
  const color   = tipoNota === 'credito' ? BLUE : ORANGE;
  const prefijo = tipoNota === 'credito' ? 'NC' : 'ND';

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '36px', width: '480px', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <div style={{ fontSize: '52px', marginBottom: '12px' }}>✅</div>
        <h2 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: 700, color: NAVY }}>
          ¡{tipoNota === 'credito' ? 'Nota de Crédito' : 'Nota de Débito'} emitida!
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: '24px', fontWeight: 700, color }}>{nota.numero_completo}</p>

        <div style={{ backgroundColor: '#F7FAFC', borderRadius: '8px', padding: '16px', marginBottom: '20px', textAlign: 'left' }}>
          {[
            { label: 'Cliente/Proveedor', valor: nota.comprador_nombre || '—' },
            { label: 'Total',             valor: fmt(nota.total) },
            { label: 'Fecha',             valor: fmtFecha(nota.creado_en) },
            { label: 'Afecta CC',         valor: nota.afecta_cuenta_corriente ? 'Sí' : 'No' },
            ...(tipoNota === 'credito' ? [{ label: 'Afecta Stock', valor: nota.afecta_stock ? 'Sí' : 'No' }] : []),
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #EDF2F7', fontSize: '13px' }}>
              <span style={{ color: GRAY }}>{r.label}</span>
              <span style={{ fontWeight: 600, color: TEXT }}>{r.valor}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button onClick={() => generarPDFNota(nota, tipoNota)}
            style={{ padding: '9px 16px', backgroundColor: NAVY, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
            📄 PDF {prefijo}
          </button>
          <button onClick={() => compartirWhatsApp(nota, tipoNota)}
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

// ─── MODAL ANULAR ─────────────────────────────────────────────
function ModalAnular({ nota, tipoNota, cid, onClose, onOk }: {
  nota: Nota; tipoNota: 'credito' | 'debito'; cid: number;
  onClose: () => void; onOk: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const anular = async () => {
    setError('');
    if (!motivo.trim()) { setError('El motivo de anulación es obligatorio'); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/notas/${cid}/${tipoNota}/${nota.id}/anular`, {
        method: 'PUT', headers: hdr(), body: JSON.stringify({ motivo_anulacion: motivo }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Error al anular'); return; }
      onOk();
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '28px', width: '440px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 10px', fontSize: '16px', fontWeight: 700, color: RED }}>🚫 Anular nota</h3>
        <p style={{ margin: '0 0 6px', fontSize: '13px', color: TEXT, fontWeight: 600 }}>{nota.numero_completo}</p>
        <p style={{ margin: '0 0 16px', fontSize: '12px', color: GRAY }}>
          Esta acción revertirá los movimientos generados en cuenta corriente y stock.
        </p>
        {error && <div style={{ color: RED, fontSize: '13px', marginBottom: '12px' }}>{error}</div>}
        <div style={{ marginBottom: '18px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Motivo de anulación *</label>
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} placeholder="Descripción del motivo..."
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #CBD5E0', borderRadius: '7px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>Cancelar</button>
          <button onClick={anular} disabled={saving}
            style={{ padding: '9px 20px', border: 'none', borderRadius: '7px', backgroundColor: RED, color: '#fff', fontWeight: 700, fontSize: '13px', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Anulando...' : '🚫 Anular'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TABLA NOTAS ──────────────────────────────────────────────
function TablaNotas({ notas, tipoNota, cid, onAnular, onPDF, onWA }: {
  notas: Nota[]; tipoNota: 'credito' | 'debito'; cid: number;
  onAnular: (n: Nota) => void; onPDF: (n: Nota) => void; onWA: (n: Nota) => void;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '750px' }}>
        <thead style={{ backgroundColor: '#F7FAFC', borderBottom: `2px solid ${SEP}` }}>
          <tr>
            {['Número', 'Fecha', 'Tipo', 'Cliente/Proveedor', 'Motivo', 'Total', 'CC', 'Stock', 'Estado', 'Acciones'].map(h => (
              <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: GRAY, fontWeight: 600, fontSize: '11px' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {notas.map((nota, idx) => (
            <tr key={nota.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC', borderBottom: '1px solid #EDF2F7',
              opacity: nota.anulada ? 0.6 : 1 }}>
              <td style={{ padding: '10px 14px', fontWeight: 700, color: NAVY }}>{nota.numero_completo}</td>
              <td style={{ padding: '10px 14px', color: GRAY }}>{fmtFecha(nota.creado_en)}</td>
              <td style={{ padding: '10px 14px' }}><TipoBadge tipo={nota.tipo} /></td>
              <td style={{ padding: '10px 14px', color: TEXT }}>{nota.comprador_nombre || '—'}</td>
              <td style={{ padding: '10px 14px', color: GRAY, fontSize: '12px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nota.motivo || '—'}</td>
              <td style={{ padding: '10px 14px', fontWeight: 700, color: tipoNota === 'credito' ? BLUE : ORANGE }}>{fmt(nota.total)}</td>
              <td style={{ padding: '10px 14px' }}>
                {nota.afecta_cuenta_corriente
                  ? <span style={{ fontSize: '11px', color: GREEN, fontWeight: 600 }}>✓ Sí</span>
                  : <span style={{ fontSize: '11px', color: GRAY }}>No</span>}
              </td>
              <td style={{ padding: '10px 14px' }}>
                {tipoNota === 'credito'
                  ? nota.afecta_stock
                    ? <span style={{ fontSize: '11px', color: GREEN, fontWeight: 600 }}>✓ Sí</span>
                    : <span style={{ fontSize: '11px', color: GRAY }}>No</span>
                  : <span style={{ fontSize: '11px', color: GRAY }}>—</span>}
              </td>
              <td style={{ padding: '10px 14px' }}><EstadoBadge estado={nota.estado} /></td>
              <td style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={() => onPDF(nota)}
                    style={{ padding: '4px 8px', fontSize: '11px', border: `1px solid ${NAVY}`, color: NAVY, borderRadius: '5px', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>📄</button>
                  <button onClick={() => onWA(nota)}
                    style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid #25D366', color: '#25D366', borderRadius: '5px', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>💬</button>
                  {!nota.anulada && (
                    <button onClick={() => onAnular(nota)}
                      style={{ padding: '4px 8px', fontSize: '11px', border: `1px solid ${RED}`, color: RED, borderRadius: '5px', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>🚫</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────
type TabNotas = 'nc' | 'nd';

function RobertoNotas() {
  const navigate = useNavigate();
  const cid      = getClienteId();

  const [tab, setTab]           = useState<TabNotas>('nc');
  const [resumen, setResumen]   = useState<Resumen | null>(null);
  const [notas, setNotas]       = useState<Nota[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [limit, setLimit]       = useState(25);
  const [cargando, setCargando] = useState(true);

  // Filtros
  const [buscar, setBuscar]       = useState('');
  const [filtroTipo, setFiltroTipo]   = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [fDesde, setFDesde]       = useState('');
  const [fHasta, setFHasta]       = useState('');
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modales
  const [showModal, setShowModal]   = useState(false);
  const [notaAnular, setNotaAnular] = useState<Nota | null>(null);
  const [resultado, setResultado]   = useState<{ numero: string; nota: Nota } | null>(null);

  const tipoNota: 'credito' | 'debito' = tab === 'nc' ? 'credito' : 'debito';

  const cargarResumen = useCallback(async () => {
    if (!cid) return;
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/notas/${cid}/resumen`,
        { headers: { 'x-superadmin-token': getToken() } });
      if (r.ok) setResumen(await r.json());
    } catch { /* silencioso */ }
  }, [cid]);

  const cargarNotas = useCallback(async (pg: number, buscarVal: string) => {
    if (!cid) return;
    setCargando(true);
    try {
      const p = new URLSearchParams({ tipo_nota: tipoNota, page: String(pg), limit: String(limit) });
      if (buscarVal) p.set('buscar', buscarVal);
      if (filtroTipo)   p.set('tipo', filtroTipo);
      if (filtroEstado) p.set('estado', filtroEstado);
      if (fDesde) p.set('fecha_desde', fDesde);
      if (fHasta) p.set('fecha_hasta', fHasta);
      const r = await fetch(`${API_BASE}/api/superadmin/notas/${cid}?${p}`,
        { headers: { 'x-superadmin-token': getToken() } });
      if (r.ok) { const d = await r.json(); setNotas(d.notas ?? []); setTotal(d.total ?? 0); }
    } finally { setCargando(false); }
  }, [cid, tipoNota, filtroTipo, filtroEstado, fDesde, fHasta, limit]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargarResumen(); }, [cargarResumen]);
  useEffect(() => { setPage(1); cargarNotas(1, buscar); }, [tab, filtroTipo, filtroEstado, fDesde, fHasta, limit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => { setPage(1); cargarNotas(1, buscar); }, 300);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [buscar]); // eslint-disable-line react-hooks/exhaustive-deps

  const recargar = () => {
    setShowModal(false); setNotaAnular(null); setResultado(null);
    cargarResumen(); cargarNotas(page, buscar);
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const color      = tipoNota === 'credito' ? BLUE : ORANGE;
  const prefijo    = tipoNota === 'credito' ? 'NC' : 'ND';

  if (!cid) return <div style={{ padding: '40px', textAlign: 'center', color: GRAY }}>Sin sesión activa.</div>;

  return (
    <div style={{ padding: '24px', backgroundColor: BG, minHeight: '100vh' }}>
      {/* Modales */}
      {showModal && (
        <ModalNuevaNota
          tipoNota={tipoNota} cid={cid}
          onClose={() => setShowModal(false)}
          onOk={(numero, nota) => { setShowModal(false); setResultado({ numero, nota }); }}
        />
      )}
      {resultado && (
        <PantallaResultado
          nota={resultado.nota} tipoNota={tipoNota}
          onCerrar={recargar}
        />
      )}
      {notaAnular && (
        <ModalAnular
          nota={notaAnular} tipoNota={tipoNota} cid={cid}
          onClose={() => setNotaAnular(null)}
          onOk={recargar}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: NAVY }}>📄 NC / ND</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: GRAY }}>Notas de Crédito y Débito</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowModal(true)}
            style={{ padding: '9px 18px', backgroundColor: color, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
            ＋ Nueva {prefijo}
          </button>
          <button onClick={() => exportarExcel(notas, tipoNota)}
            style={{ padding: '9px 14px', border: `1px solid ${NAVY}`, borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: NAVY }}>
            📤 Excel
          </button>
          <button onClick={() => {
            notas.forEach((nota, i) => { setTimeout(() => generarPDFNota(nota, tipoNota), i * 300); });
          }}
            style={{ padding: '9px 14px', border: `1px solid ${NAVY}`, borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: NAVY }}>
            🖨️ PDF
          </button>
          <button onClick={() => navigate('/roberto/dashboard')}
            style={{ padding: '9px 14px', border: '1px solid #CBD5E0', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>
            ← Dashboard
          </button>
        </div>
      </div>

      {/* Dashboard 4 cards */}
      {resumen && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
          {[
            { icon: '📄', label: 'NC emitidas este mes',   color: BLUE,   d: resumen.nc_emitidas  },
            { icon: '📄', label: 'NC recibidas este mes',  color: GREEN,  d: resumen.nc_recibidas },
            { icon: '📄', label: 'ND emitidas este mes',   color: ORANGE, d: resumen.nd_emitidas  },
            { icon: '📄', label: 'ND recibidas este mes',  color: RED,    d: resumen.nd_recibidas },
          ].map(c => (
            <div key={c.label} style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${c.color}` }}>
              <div style={{ fontSize: '22px', marginBottom: '6px' }}>{c.icon}</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: c.color }}>{fmt(c.d.monto_mes)}</div>
              <div style={{ fontSize: '12px', color: GRAY, marginTop: '2px' }}>{c.d.cantidad} nota{c.d.cantidad !== 1 ? 's' : ''} · {c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', backgroundColor: '#fff', borderRadius: '10px', padding: '4px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', width: 'fit-content' }}>
        {[{ id: 'nc', label: '📄 Notas de Crédito' }, { id: 'nd', label: '📄 Notas de Débito' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as TabNotas)}
            style={{ padding: '8px 18px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: tab === t.id ? 700 : 400,
              backgroundColor: tab === t.id ? NAVY : 'transparent', color: tab === t.id ? '#fff' : GRAY, transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="🔍 Número o cliente..."
          style={{ padding: '8px 12px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', minWidth: '200px' }} />
        <select value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', background: '#fff' }}>
          <option value="">Todos</option>
          <option value="emitida">Emitida</option>
          <option value="recibida">Recibida</option>
        </select>
        <select value={filtroEstado} onChange={e => { setFiltroEstado(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', background: '#fff' }}>
          <option value="">Todos los estados</option>
          <option value="borrador">Borrador</option>
          <option value="emitida">Emitida</option>
          <option value="aplicada">Aplicada</option>
          <option value="anulada">Anulada</option>
        </select>
        <input type="date" value={fDesde} onChange={e => { setFDesde(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px' }} />
        <input type="date" value={fHasta} onChange={e => { setFHasta(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px' }} />
        <select value={String(limit)} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', background: '#fff' }}>
          <option value="10">10</option>
          <option value="25">25</option>
          <option value="50">50</option>
        </select>
        <button onClick={() => { setBuscar(''); setFiltroTipo(''); setFiltroEstado(''); setFDesde(''); setFHasta(''); setPage(1); }}
          style={{ padding: '8px 14px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', background: '#fff', cursor: 'pointer', color: GRAY }}>
          Limpiar
        </button>
      </div>

      {/* Tabla */}
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        {cargando ? (
          <div style={{ padding: '48px', textAlign: 'center', color: GRAY }}>Cargando notas...</div>
        ) : notas.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center' }}>
            <div style={{ fontSize: '42px', marginBottom: '12px' }}>📄</div>
            <p style={{ color: GRAY, fontSize: '14px' }}>No hay {prefijo === 'NC' ? 'notas de crédito' : 'notas de débito'} en este período</p>
          </div>
        ) : (
          <>
            <TablaNotas
              notas={notas} tipoNota={tipoNota} cid={cid}
              onAnular={n => setNotaAnular(n)}
              onPDF={n => generarPDFNota(n, tipoNota)}
              onWA={n => compartirWhatsApp(n, tipoNota)}
            />
            <div style={{ padding: '12px 16px', borderTop: '1px solid #EDF2F7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: GRAY }}>
              <span>Total: {total} notas</span>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button onClick={() => { const p = Math.max(1, page - 1); setPage(p); cargarNotas(p, buscar); }} disabled={page === 1}
                  style={{ padding: '4px 10px', border: '1px solid #CBD5E0', borderRadius: '5px', cursor: page === 1 ? 'default' : 'pointer', background: '#fff', opacity: page === 1 ? 0.4 : 1 }}>‹</button>
                <span>{page} / {totalPages}</span>
                <button onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); cargarNotas(p, buscar); }} disabled={page === totalPages}
                  style={{ padding: '4px 10px', border: '1px solid #CBD5E0', borderRadius: '5px', cursor: page === totalPages ? 'default' : 'pointer', background: '#fff', opacity: page === totalPages ? 0.4 : 1 }}>›</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default RobertoNotas;
