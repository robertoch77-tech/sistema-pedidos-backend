import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../../config/api';
import { getToken } from '../../../utils/auth';

// ── Colores ───────────────────────────────────────────────────
const NAVY   = '#1B2A4A';
const BLUE   = '#2B6CB0';
const GREEN  = '#38A169';
const RED    = '#E53E3E';
const SEP    = '#63B3ED';
const GRAY   = '#718096';
const TEXT   = '#2D3748';
const BG     = '#F4F6F9';
const ORANGE = '#DD6B20';
const PURPLE = '#805AD5';

// ── Helpers ───────────────────────────────────────────────────
const fmtFecha = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};

function getClienteId(): number | null {
  try { const s = localStorage.getItem('roberto_portal_session'); return s ? JSON.parse(s).cliente?.id ?? null : null; }
  catch { return null; }
}

let _tid = 200;
const nextTid = () => _tid++;

// ── Tipos ─────────────────────────────────────────────────────
type TipoRemito   = 'salida' | 'entrada' | 'interno';
type EstadoRemito = 'pendiente' | 'en_camino' | 'entregado' | 'parcial' | 'devuelto';

interface RemitoRow {
  id: number;
  numero_completo: string;
  tipo: TipoRemito;
  comprador_nombre: string;
  estado: EstadoRemito;
  fecha_entrega: string | null;
  total_bultos: number;
  convertido_a_factura: boolean;
  factura_venta_id: number | null;
  fecha: string;
}

interface DashMetrics {
  mes_cantidad: number;
  pendientes_cantidad: number;
  en_camino_cantidad: number;
  entregados_cantidad: number;
}

interface ProductoResult {
  id: number;
  codigo: string;
  descripcion: string;
  precio_venta_1: number;
  stock_actual: number;
  alicuota_iva: number;
}

interface ItemRemito {
  tempId: number;
  producto_id: number | null;
  codigo: string;
  descripcion: string;
  es_libre: boolean;
  cantidad_remitida: number;
  unidad_medida: string;
}

interface Proveedor {
  id: number;
  razon_social: string;
}

interface DetalleData {
  remito: any;
  items: any[];
}

interface ResultadoData {
  remito_id: number;
  numero_completo: string;
  tipo: TipoRemito;
  comprador_nombre: string;
  fecha_entrega: string | null;
  items: ItemRemito[];
}

// ── Estilos ───────────────────────────────────────────────────
const btnStyle = (bg: string, color = '#fff', disabled = false): React.CSSProperties => ({
  backgroundColor: disabled ? '#CBD5E0' : bg,
  color: disabled ? '#A0AEC0' : color,
  border: 'none', borderRadius: '8px', padding: '9px 16px',
  fontSize: '13px', fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
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

const seccionStyle: React.CSSProperties = {
  fontSize: '12px', fontWeight: 700, color: NAVY, textTransform: 'uppercase',
  letterSpacing: '0.5px', borderBottom: `2px solid ${SEP}`,
  paddingBottom: '6px', marginBottom: '12px',
};

// ── Badges ────────────────────────────────────────────────────
const TIPO_MAP: Record<TipoRemito, { label: string; bg: string; c: string }> = {
  salida:   { label: '📤 Salida',   bg: '#FFF5F0', c: ORANGE },
  entrada:  { label: '📥 Entrada',  bg: '#EBF8FF', c: BLUE   },
  interno:  { label: '🔄 Interno',  bg: '#FAF5FF', c: PURPLE },
};

const ESTADO_MAP: Record<EstadoRemito, { label: string; bg: string; c: string }> = {
  pendiente:  { label: 'Pendiente',  bg: '#EDF2F7', c: GRAY   },
  en_camino:  { label: 'En camino',  bg: '#EBF8FF', c: BLUE   },
  entregado:  { label: 'Entregado',  bg: '#F0FFF4', c: GREEN  },
  parcial:    { label: 'Parcial',    bg: '#FFFAF0', c: ORANGE },
  devuelto:   { label: 'Devuelto',   bg: '#FFF5F5', c: RED    },
};

function BadgeTipo({ tipo }: { tipo: string }) {
  const m = TIPO_MAP[tipo as TipoRemito] || { label: tipo, bg: '#EDF2F7', c: GRAY };
  return (
    <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, backgroundColor: m.bg, color: m.c }}>
      {m.label}
    </span>
  );
}

function BadgeEstado({ estado }: { estado: string }) {
  const m = ESTADO_MAP[estado as EstadoRemito] || { label: estado, bg: '#EDF2F7', c: GRAY };
  return (
    <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, backgroundColor: m.bg, color: m.c }}>
      {m.label}
    </span>
  );
}

// ── Card métrica ──────────────────────────────────────────────
function CardMetrica({ icon, label, valor, color }: { icon: string; label: string; valor: string; color: string }) {
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '20px 24px', borderLeft: `4px solid ${color}`, flex: '1 1 150px' }}>
      <div style={{ fontSize: '22px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color, marginBottom: '4px' }}>{valor}</div>
      <div style={{ fontSize: '12px', color: GRAY, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

// ── Modal confirmar entrega ───────────────────────────────────
function ModalConfirmarEntrega({
  detalle, onConfirmar, onCerrar, procesando,
}: {
  detalle: DetalleData;
  onConfirmar: (data: { firma: string; aclaracion: string; cantidades: any[] }) => void;
  onCerrar: () => void;
  procesando: boolean;
}) {
  const [firma,       setFirma]       = useState('');
  const [aclaracion,  setAclaracion]  = useState('');
  const [cantidades,  setCantidades]  = useState<Record<number, { entregada: string; motivo: string }>>(() => {
    const init: Record<number, { entregada: string; motivo: string }> = {};
    detalle.items.forEach((it: any) => {
      init[it.id] = { entregada: String(it.cantidad_remitida), motivo: '' };
    });
    return init;
  });

  const hayDiferencia = detalle.items.some((it: any) => {
    const c = cantidades[it.id];
    return c && parseFloat(c.entregada || '0') < parseFloat(it.cantidad_remitida);
  });

  const submit = () => {
    const lista = detalle.items.map((it: any) => ({
      item_id:            it.id,
      cantidad_entregada: parseFloat(cantidades[it.id]?.entregada || '0'),
      motivo_diferencia:  cantidades[it.id]?.motivo || '',
    }));
    onConfirmar({ firma, aclaracion, cantidades: lista });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 500, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '16px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '640px', boxShadow: '0 24px 72px rgba(0,0,0,0.3)', margin: 'auto' }}>
        <div style={{ padding: '18px 28px', borderBottom: `2px solid ${SEP}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: NAVY, margin: 0 }}>✅ Confirmar Entrega</h2>
          <button onClick={onCerrar} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: GRAY }}>×</button>
        </div>
        <div style={{ padding: '24px 28px' }}>
          <div style={{ marginBottom: '20px' }}>
            <div style={seccionStyle}>📦 Cantidades entregadas</div>
            <div style={{ border: '1px solid #EDF2F7', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#EBF4FF' }}>
                    {['Descripción', 'Remitida', 'Entregada', 'Motivo diferencia'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: NAVY, fontSize: '11px', borderBottom: `2px solid ${SEP}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detalle.items.map((it: any, idx: number) => {
                    const c   = cantidades[it.id] || { entregada: String(it.cantidad_remitida), motivo: '' };
                    const dif = parseFloat(c.entregada || '0') < parseFloat(it.cantidad_remitida);
                    return (
                      <tr key={it.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                        <td style={{ padding: '8px 12px', color: TEXT }}>{it.descripcion}</td>
                        <td style={{ padding: '8px 12px', color: GRAY, textAlign: 'center' }}>{it.cantidad_remitida}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                          <input
                            type="number" min="0" step="0.01"
                            value={c.entregada}
                            onChange={e => setCantidades(prev => ({ ...prev, [it.id]: { ...prev[it.id], entregada: e.target.value } }))}
                            style={{ ...inputStyle, width: '80px', padding: '4px 8px', textAlign: 'right', borderColor: dif ? ORANGE : '#CBD5E0' }}
                          />
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          {dif ? (
                            <input
                              type="text"
                              placeholder="Motivo..."
                              value={c.motivo}
                              onChange={e => setCantidades(prev => ({ ...prev, [it.id]: { ...prev[it.id], motivo: e.target.value } }))}
                              style={{ ...inputStyle, padding: '4px 8px', fontSize: '12px' }}
                            />
                          ) : <span style={{ color: GREEN, fontSize: '12px' }}>✓</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {hayDiferencia && (
              <div style={{ marginTop: '8px', padding: '8px 12px', backgroundColor: '#FFFAF0', borderRadius: '8px', fontSize: '12px', color: ORANGE }}>
                ⚠️ Hay diferencias en cantidades — se registrará como entrega <strong>parcial</strong>.
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
            <div>
              <label style={labelStyle}>Firma receptor</label>
              <input value={firma} onChange={e => setFirma(e.target.value)} placeholder="Nombre del receptor" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Aclaración</label>
              <input value={aclaracion} onChange={e => setAclaracion(e.target.value)} placeholder="Aclaración opcional" style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button onClick={onCerrar} style={btnStyle('#EDF2F7', GRAY)}>Cancelar</button>
            <button onClick={submit} disabled={procesando} style={btnStyle(GREEN, '#fff', procesando)}>
              {procesando ? '⏳ Confirmando...' : '✅ Confirmar entrega'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Pantalla resultado ────────────────────────────────────────
function PantallaResultado({
  res: r, cid, token, onConvertir, onConfirmar, onCerrar,
}: {
  res: ResultadoData;
  cid: number;
  token: string;
  onConvertir: () => void;
  onConfirmar: () => void;
  onCerrar: () => void;
}) {
  const generarHTML = (size: 'A4' | 'A5') => {
    const cfgRem = JSON.parse(localStorage.getItem(`roberto_config_${cid}`) || '{}');
    const negNom  = cfgRem.nombre_comercial || 'Mi Negocio';
    const logoUrl = cfgRem.logo_url         || '';
    const negDir  = cfgRem.direccion        || '';
    const negCuit = cfgRem.cuit             || '';
    const filas = r.items.map(it =>
      `<tr><td>${it.codigo || '—'}</td><td>${it.descripcion}</td><td style="text-align:center">${it.cantidad_remitida}</td><td>${it.unidad_medida}</td></tr>`
    ).join('');
    const tipoLabel = TIPO_MAP[r.tipo]?.label || r.tipo;
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${r.numero_completo}</title>
<style>
  @page { size:${size}; margin:12mm; }
  body { font-family:Arial,sans-serif; font-size:12px; margin:0; color:#222; }
  .header { display:flex; justify-content:space-between; border-bottom:2px solid #1B2A4A; padding-bottom:10px; margin-bottom:14px; }
  .negocio { font-size:20px; font-weight:700; color:#1B2A4A; }
  .row { display:flex; justify-content:space-between; margin-bottom:4px; }
  table { width:100%; border-collapse:collapse; margin:12px 0; }
  th { background:#1B2A4A; color:#fff; padding:6px 8px; text-align:left; font-size:11px; }
  td { padding:7px 8px; border-bottom:1px solid #eee; font-size:11px; }
  .firma { margin-top:40px; border-top:1px solid #ccc; padding-top:12px; }
  .firma-linea { display:flex; gap:40px; }
  .firma-campo { flex:1; border-bottom:1px solid #999; min-height:40px; margin-top:8px; }
  .footer { margin-top:16px; font-size:10px; color:#718096; border-top:1px solid #eee; padding-top:8px; }
</style></head><body>
<div class="header">
  <div>
    ${logoUrl ? `<img src="${logoUrl}" alt="" style="max-width:150px;max-height:60px;object-fit:contain;display:block;margin-bottom:6px">` : ''}
    <div class="negocio">${negNom}</div>
    ${negDir  ? `<div style="color:#718096;font-size:11px">${negDir}</div>`        : ''}
    ${negCuit ? `<div style="color:#718096;font-size:11px">CUIT: ${negCuit}</div>` : ''}
    <div style="color:#718096">REMITO DE ${tipoLabel.toUpperCase()}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:20px;font-weight:700;color:#1B2A4A">${r.numero_completo}</div>
    <div style="color:#718096">Fecha: ${new Date().toLocaleDateString('es-AR')}</div>
  </div>
</div>
<div class="row"><span><b>${r.tipo === 'entrada' ? 'Proveedor:' : 'Cliente:'}</b></span><span>${r.comprador_nombre || 'Sin nombre'}</span></div>
${r.fecha_entrega ? `<div class="row"><span><b>Fecha de entrega:</b></span><span>${fmtFecha(r.fecha_entrega)}</span></div>` : ''}
<table>
  <thead><tr><th>Código</th><th>Descripción</th><th style="text-align:center">Cantidad</th><th>Unidad</th></tr></thead>
  <tbody>${filas}</tbody>
</table>
<div class="firma">
  <p style="font-size:11px;color:#718096;margin-bottom:8px">Recibí conforme:</p>
  <div class="firma-linea">
    <div><div style="font-size:11px;color:#718096">Firma receptor</div><div class="firma-campo"></div></div>
    <div><div style="font-size:11px;color:#718096">Aclaración</div><div class="firma-campo"></div></div>
    <div><div style="font-size:11px;color:#718096">Fecha</div><div class="firma-campo"></div></div>
  </div>
</div>
<div class="footer">Sistema de Pedidos — Remito generado automáticamente.</div>
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
    const tipoLabel = TIPO_MAP[r.tipo]?.label || r.tipo;
    const txt = `*Remito ${r.numero_completo}*\nTipo: ${tipoLabel}\nCliente: ${r.comprador_nombre || 'Sin nombre'}${r.fecha_entrega ? `\nFecha de entrega: ${fmtFecha(r.fecha_entrega)}` : ''}\n\nPor favor confirme la recepción.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank');
  };

  return (
    <div style={{ padding: '32px 28px', textAlign: 'center' }}>
      <div style={{ fontSize: '52px', marginBottom: '12px' }}>✅</div>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: GREEN, margin: '0 0 4px' }}>¡Remito generado!</h2>
      <div style={{ fontSize: '20px', fontWeight: 700, color: NAVY, marginBottom: '4px' }}>{r.numero_completo}</div>
      <BadgeTipo tipo={r.tipo} />
      <div style={{ fontSize: '13px', color: GRAY, marginTop: '6px', marginBottom: '4px' }}>{r.comprador_nombre || 'Sin nombre'}</div>
      {r.fecha_entrega && (
        <div style={{ fontSize: '13px', color: ORANGE, marginBottom: '16px' }}>
          Entrega estimada: {fmtFecha(r.fecha_entrega)}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', maxWidth: '380px', margin: '0 auto 16px' }}>
        <button onClick={() => imprimir('A4')} style={btnStyle(BLUE)}>📄 PDF A4</button>
        <button onClick={() => imprimir('A5')} style={btnStyle(BLUE)}>📄 PDF A5</button>
        <button onClick={whatsApp}             style={btnStyle('#25D366')}>💬 WhatsApp</button>
        <button onClick={onConfirmar}          style={btnStyle(ORANGE)}>✅ Confirmar entrega</button>
      </div>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={onConvertir} style={btnStyle(NAVY)}>🧾 Convertir en factura</button>
        <button onClick={onCerrar}    style={btnStyle('#EDF2F7', GRAY)}>✅ Cerrar</button>
      </div>
    </div>
  );
}

// ── Modal detalle ─────────────────────────────────────────────
function ModalDetalle({
  detalle, onConfirmar, onConvertir, onCerrar,
}: {
  detalle: DetalleData;
  onConfirmar: () => void;
  onConvertir: () => void;
  onCerrar: () => void;
}) {
  const r = detalle.remito;
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '16px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '740px', boxShadow: '0 24px 72px rgba(0,0,0,0.3)', margin: 'auto' }}>
        <div style={{ padding: '18px 28px', borderBottom: `2px solid ${SEP}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: NAVY, margin: '0 0 4px' }}>👁️ {r.numero_completo}</h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <BadgeTipo tipo={r.tipo} />
              <BadgeEstado estado={r.estado} />
            </div>
          </div>
          <button onClick={onCerrar} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: GRAY }}>×</button>
        </div>
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px', fontSize: '13px' }}>
            <div><span style={{ color: GRAY }}>Cliente/Proveedor: </span><strong>{r.comprador_nombre || 'Sin nombre'}</strong></div>
            <div><span style={{ color: GRAY }}>CUIT: </span><strong>{r.comprador_cuit || '—'}</strong></div>
            <div><span style={{ color: GRAY }}>Fecha emisión: </span><strong>{fmtFecha(r.fecha)}</strong></div>
            <div><span style={{ color: GRAY }}>Fecha entrega: </span><strong>{fmtFecha(r.fecha_entrega)}</strong></div>
            {r.transporte && <div><span style={{ color: GRAY }}>Transporte: </span><strong>{r.transporte}</strong></div>}
            {r.chofer    && <div><span style={{ color: GRAY }}>Chofer: </span><strong>{r.chofer}</strong></div>}
            {r.patente   && <div><span style={{ color: GRAY }}>Patente: </span><strong>{r.patente}</strong></div>}
            {r.total_bultos > 0 && <div><span style={{ color: GRAY }}>Bultos: </span><strong>{r.total_bultos}</strong></div>}
          </div>

          {r.direccion_entrega && (
            <div style={{ marginBottom: '16px', padding: '10px 14px', backgroundColor: '#EBF8FF', borderRadius: '8px', fontSize: '13px' }}>
              📍 <strong>Dirección:</strong> {r.direccion_entrega}
            </div>
          )}

          <div style={{ border: '1px solid #EDF2F7', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#EBF4FF' }}>
                  {['Código', 'Descripción', 'Cant. remitida', 'Cant. entregada', 'Unidad'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: NAVY, fontSize: '11px', borderBottom: `2px solid ${SEP}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detalle.items.map((it: any, idx: number) => (
                  <tr key={it.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                    <td style={{ padding: '8px 12px', color: GRAY, fontFamily: 'monospace', fontSize: '11px' }}>{it.codigo || '—'}</td>
                    <td style={{ padding: '8px 12px', color: TEXT }}>{it.descripcion}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>{it.cantidad_remitida}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', color: it.cantidad_entregada != null ? (parseFloat(it.cantidad_entregada) < parseFloat(it.cantidad_remitida) ? ORANGE : GREEN) : GRAY }}>
                      {it.cantidad_entregada ?? '—'}
                    </td>
                    <td style={{ padding: '8px 12px', color: GRAY }}>{it.unidad_medida}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {r.observaciones && (
            <div style={{ marginBottom: '16px', padding: '10px 14px', backgroundColor: '#F7FAFC', borderRadius: '8px', fontSize: '12px', color: GRAY }}>
              <strong>Obs:</strong> {r.observaciones}
            </div>
          )}

          {r.firma_receptor && (
            <div style={{ marginBottom: '16px', padding: '10px 14px', backgroundColor: '#F0FFF4', borderRadius: '8px', fontSize: '12px', color: GREEN }}>
              ✓ Recibido por: <strong>{r.firma_receptor}</strong>{r.aclaracion_receptor ? ` — ${r.aclaracion_receptor}` : ''}
            </div>
          )}

          {r.convertido_a_factura ? (
            <div style={{ padding: '10px 14px', backgroundColor: '#FAF5FF', borderRadius: '8px', fontSize: '13px', color: PURPLE, fontWeight: 600 }}>
              ✓ Convertido a factura {r.factura_venta_id ? `(ID: ${r.factura_venta_id})` : ''}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {r.estado !== 'entregado' && r.estado !== 'devuelto' && (
                <button onClick={onConfirmar} style={btnStyle(ORANGE)}>✅ Confirmar entrega</button>
              )}
              <button onClick={onConvertir} style={btnStyle(NAVY)}>🧾 Convertir en factura</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═════════════════════════════════════════════════════════════
export default function RobertoRemitos() {
  const navigate = useNavigate();
  const cid      = getClienteId();
  const token    = getToken();
  const authHdr  = { 'x-superadmin-token': token };
  const jsonHdr  = { 'x-superadmin-token': token, 'Content-Type': 'application/json' };

  // ── Dashboard ────────────────────────────────────────────────
  const [dash, setDash] = useState<DashMetrics | null>(null);

  // ── Lista ────────────────────────────────────────────────────
  const [remitos,      setRemitos]     = useState<RemitoRow[]>([]);
  const [totalReg,     setTotalReg]    = useState(0);
  const [pagina,       setPagina]      = useState(1);
  const [porPagina,    setPorPagina]   = useState(25);
  const [totalPags,    setTotalPags]   = useState(1);
  const [cargandoList, setCargandoList] = useState(false);

  // ── Filtros ──────────────────────────────────────────────────
  const [busqueda,     setBusqueda]    = useState('');
  const [filtroTipo,   setFiltroTipo]  = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [fechaDesde,   setFechaDesde]  = useState('');
  const [fechaHasta,   setFechaHasta]  = useState('');

  // ── Modal nuevo ──────────────────────────────────────────────
  const [modalOpen,    setModalOpen]   = useState(false);

  // Tipo remito
  const [tipoRemito,   setTipoRemito]  = useState<TipoRemito>('salida');

  // Contraparte
  const [nomCliente,   setNomCliente]  = useState('');
  const [cuitCliente,  setCuitCliente] = useState('');
  const [proveedores,  setProveedores] = useState<Proveedor[]>([]);
  const [proveedorId,  setProveedorId] = useState('');

  // Items
  const [items,        setItems]       = useState<ItemRemito[]>([]);
  const [busqProd,     setBusqProd]    = useState('');
  const [prodsDrop,    setProdsDrop]   = useState<ProductoResult[]>([]);
  const [showDrop,     setShowDrop]    = useState(false);
  const [loadProd,     setLoadProd]    = useState(false);
  const [modalLibre,   setModalLibre]  = useState(false);
  const [libreDesc,    setLibreDesc]   = useState('');
  const [libreCant,    setLibreCant]   = useState('1');
  const itemRef = useRef<HTMLInputElement>(null);

  // Logística
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [direccion,    setDireccion]    = useState('');
  const [transporte,   setTransporte]   = useState('');
  const [chofer,       setChofer]       = useState('');
  const [patente,      setPatente]      = useState('');
  const [totalBultos,  setTotalBultos]  = useState('');
  const [observ,       setObserv]       = useState('');

  // Submit
  const [procesando,   setProcesando]  = useState(false);
  const [errForm,      setErrForm]     = useState('');
  const [resultado,    setResultado]   = useState<ResultadoData | null>(null);

  // Detalle
  const [detalle,        setDetalle]       = useState<DetalleData | null>(null);
  const [confirmando,    setConfirmando]   = useState(false);
  const [modalConfirmar, setModalConfirmar] = useState(false);

  // ── Dashboard ────────────────────────────────────────────────
  const cargarDash = useCallback(() => {
    if (!cid) return;
    fetch(`${API_BASE}/api/superadmin/remitos/${cid}/dashboard`, { headers: authHdr })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setDash(d))
      .catch(() => {});
  }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargarDash(); }, [cargarDash]);

  // ── Lista (debounced 300ms) ──────────────────────────────────
  const cargarLista = useCallback(async () => {
    if (!cid) return;
    setCargandoList(true);
    try {
      const p = new URLSearchParams({
        page: String(pagina), limit: String(porPagina),
        ...(busqueda     && { buscar:      busqueda     }),
        ...(filtroTipo   && { tipo:        filtroTipo   }),
        ...(filtroEstado && { estado:      filtroEstado }),
        ...(fechaDesde   && { fecha_desde: fechaDesde   }),
        ...(fechaHasta   && { fecha_hasta: fechaHasta   }),
      });
      const r = await fetch(`${API_BASE}/api/superadmin/remitos/${cid}?${p}`, { headers: authHdr });
      if (r.ok) {
        const d = await r.json();
        setRemitos(d.remitos || []);
        setTotalReg(d.total || 0);
        setTotalPags(d.paginas || 1);
      }
    } catch { /* silent */ }
    finally { setCargandoList(false); }
  }, [cid, pagina, porPagina, busqueda, filtroTipo, filtroEstado, fechaDesde, fechaHasta]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(cargarLista, 300);
    return () => clearTimeout(t);
  }, [cargarLista]);

  // ── Cargar proveedores al abrir modal Entrada ────────────────
  useEffect(() => {
    if (!cid || tipoRemito !== 'entrada') return;
    fetch(`${API_BASE}/api/superadmin/importador/proveedores/${cid}`, { headers: authHdr })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setProveedores(d.proveedores || d || []))
      .catch(() => {});
  }, [tipoRemito, cid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Buscar productos / EAN (debounced 300ms) ─────────────────
  useEffect(() => {
    const q = busqProd.trim();
    if (!q) { setProdsDrop([]); setShowDrop(false); return; }
    const t = setTimeout(async () => {
      if (!cid) return;
      setLoadProd(true);
      // EAN: secuencia numérica ≥4 dígitos
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

  // ── Focus buscador al abrir modal ───────────────────────────
  useEffect(() => {
    if (modalOpen && !resultado) setTimeout(() => itemRef.current?.focus(), 120);
  }, [modalOpen, resultado]);

  // ── Helpers items ────────────────────────────────────────────
  const agregarProducto = (p: ProductoResult) => {
    setItems(prev => [...prev, {
      tempId: nextTid(), producto_id: p.id, codigo: p.codigo || '',
      descripcion: p.descripcion, es_libre: false,
      cantidad_remitida: 1, unidad_medida: 'unidad',
    }]);
    setProdsDrop([]); setShowDrop(false); setBusqProd('');
    setTimeout(() => itemRef.current?.focus(), 60);
  };

  const agregarLibre = () => {
    const desc = libreDesc.trim();
    if (!desc) return;
    setItems(prev => [...prev, {
      tempId: nextTid(), producto_id: null, codigo: '', descripcion: desc,
      es_libre: true, cantidad_remitida: parseFloat(libreCant) || 1, unidad_medida: 'unidad',
    }]);
    setLibreDesc(''); setLibreCant('1'); setModalLibre(false);
    setTimeout(() => itemRef.current?.focus(), 60);
  };

  const actualizarItem = (tempId: number, campo: keyof ItemRemito, val: any) =>
    setItems(prev => prev.map(it => it.tempId === tempId ? { ...it, [campo]: val } : it));

  const eliminarItem = (tempId: number) =>
    setItems(prev => prev.filter(it => it.tempId !== tempId));

  // ── Reset modal ──────────────────────────────────────────────
  const resetModal = () => {
    setItems([]); setTipoRemito('salida');
    setNomCliente(''); setCuitCliente(''); setProveedorId('');
    setBusqProd(''); setProdsDrop([]); setShowDrop(false);
    setFechaEntrega(''); setDireccion(''); setTransporte('');
    setChofer(''); setPatente(''); setTotalBultos(''); setObserv('');
    setErrForm(''); setResultado(null); setLibreDesc(''); setLibreCant('1'); setModalLibre(false);
  };

  const abrirNuevo = () => { resetModal(); setModalOpen(true); };

  const cerrarModal = () => {
    setModalOpen(false);
    if (resultado) { cargarLista(); cargarDash(); }
    resetModal();
  };

  // ── Submit ───────────────────────────────────────────────────
  const submitRemito = async () => {
    if (!items.length) { setErrForm('Agregá al menos un producto.'); return; }
    if (!cid) return;

    let comprador_nombre = nomCliente;
    let proveedor_id_val: number | null = null;

    if (tipoRemito === 'entrada' && proveedorId) {
      proveedor_id_val = parseInt(proveedorId, 10);
      const prov = proveedores.find(p => p.id === proveedor_id_val);
      comprador_nombre = prov?.razon_social || '';
    }

    const body = {
      tipo: tipoRemito,
      contraparte_tipo: tipoRemito === 'salida' ? 'cliente' : tipoRemito === 'entrada' ? 'proveedor' : 'interno',
      comprador_nombre,
      comprador_cuit: cuitCliente,
      proveedor_id: proveedor_id_val,
      fecha_entrega:    fechaEntrega || null,
      direccion_entrega: direccion,
      transporte, chofer, patente,
      total_bultos: parseInt(totalBultos, 10) || 0,
      observaciones: observ,
      items: items.map(it => ({
        producto_id:       it.producto_id,
        es_libre:          it.es_libre,
        descripcion_libre: it.es_libre ? it.descripcion : null,
        descripcion:       it.descripcion,
        codigo:            it.codigo,
        cantidad_remitida: it.cantidad_remitida,
        unidad_medida:     it.unidad_medida,
      })),
    };

    setProcesando(true); setErrForm('');
    try {
      const r    = await fetch(`${API_BASE}/api/superadmin/remitos/${cid}`, {
        method: 'POST', headers: jsonHdr, body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) { setErrForm(data.mensaje || 'Error al guardar'); return; }
      setResultado({
        remito_id:       data.remito_id,
        numero_completo: data.numero_completo,
        tipo:            tipoRemito,
        comprador_nombre: comprador_nombre || 'Sin nombre',
        fecha_entrega:   fechaEntrega || null,
        items:           [...items],
      });
    } catch { setErrForm('Error de red. Intentá de nuevo.'); }
    finally { setProcesando(false); }
  };

  // ── Ver detalle ──────────────────────────────────────────────
  const verDetalle = async (id: number) => {
    if (!cid) return;
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/remitos/${cid}/${id}`, { headers: authHdr });
      if (r.ok) { const d = await r.json(); setDetalle(d); }
    } catch { /* silent */ }
  };

  // ── Confirmar entrega ────────────────────────────────────────
  const confirmarEntrega = async (data: { firma: string; aclaracion: string; cantidades: any[] }) => {
    if (!cid || !detalle) return;
    setConfirmando(true);
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/remitos/${cid}/${detalle.remito.id}/confirmar-entrega`, {
        method: 'PUT', headers: jsonHdr,
        body: JSON.stringify({
          firma_receptor:       data.firma,
          aclaracion_receptor:  data.aclaracion,
          cantidades_entregadas: data.cantidades,
        }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.mensaje || 'Error'); return; }
      alert(`✅ Entrega confirmada (${d.estado})`);
      setModalConfirmar(false);
      setDetalle(null);
      cargarLista(); cargarDash();
    } catch { alert('Error de red'); }
    finally { setConfirmando(false); }
  };

  // ── Convertir en factura ─────────────────────────────────────
  const convertirFactura = async (id: number) => {
    if (!cid) return;
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/remitos/${cid}/${id}/convertir-factura`, {
        method: 'PUT', headers: jsonHdr,
      });
      const d = await r.json();
      if (!r.ok) { alert(d.mensaje || 'Error al convertir'); return; }
      alert(`✅ Convertido en venta (ID: ${d.venta_id})`);
      setDetalle(null);
      cargarLista(); cargarDash();
    } catch { alert('Error de red'); }
  };

  // ── Imprimir desde lista ─────────────────────────────────────
  const imprimirDesde = (r: RemitoRow) => {
    const cfgRaw = localStorage.getItem(`roberto_config_${cid}`);
    const cfg = cfgRaw ? JSON.parse(cfgRaw) : {};
    const nombreNegocioDesde = cfg.nombre_comercial || 'Mi Negocio';
    const w = window.open('', '_blank');
    if (!w) return;
    const cfgD   = JSON.parse(localStorage.getItem(`roberto_config_${getClienteId()}`) || '{}');
    const negNomD  = cfgD.nombre_comercial || 'Mi Negocio';
    const logoUrlD = cfgD.logo_url         || '';
    const negDirD  = cfgD.direccion        || '';
    const negCuitD = cfgD.cuit             || '';
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${r.numero_completo}</title>
<style>@page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;font-size:12px}.header{border-bottom:2px solid #1B2A4A;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between}.negocio{font-size:20px;font-weight:700;color:#1B2A4A}.firma{margin-top:60px;border-top:1px solid #ccc;padding-top:12px}.firma-linea{display:flex;gap:40px}.firma-campo{flex:1;border-bottom:1px solid #999;min-height:40px;margin-top:8px}</style>
</head><body>
<div class="header"><div>
  ${logoUrlD ? `<img src="${logoUrlD}" alt="" style="max-width:150px;max-height:60px;object-fit:contain;display:block;margin-bottom:6px">` : ''}
  <div class="negocio">${negNomD}</div>
  ${negDirD  ? `<div style="color:#718096;font-size:11px">${negDirD}</div>`        : ''}
  ${negCuitD ? `<div style="color:#718096;font-size:11px">CUIT: ${negCuitD}</div>` : ''}
  <div>REMITO</div>
</div><div><div style="font-size:20px;font-weight:700">${r.numero_completo}</div><div>Fecha: ${fmtFecha(r.fecha)}</div></div></div>
<div>Cliente/Proveedor: <strong>${r.comprador_nombre || '—'}</strong></div>
${r.fecha_entrega ? `<div>Fecha entrega: <strong>${fmtFecha(r.fecha_entrega)}</strong></div>` : ''}
<p style="color:#718096;font-size:11px;margin-top:16px">Ver detalle completo en el sistema.</p>
<div class="firma"><p style="font-size:11px;color:#718096">Recibí conforme:</p>
<div class="firma-linea">
<div><div>Firma receptor</div><div class="firma-campo"></div></div>
<div><div>Aclaración</div><div class="firma-campo"></div></div>
<div><div>Fecha</div><div class="firma-campo"></div></div>
</div></div></body></html>`;
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 350);
  };

  // ── RENDER ────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, padding: '28px', fontFamily: 'system-ui,-apple-system,sans-serif' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/roberto/dashboard')} style={btnStyle('#EDF2F7', GRAY)}>← Volver</button>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: NAVY, margin: '0 0 2px' }}>🚚 Remitos</h2>
            <p style={{ fontSize: '13px', color: GRAY, margin: 0 }}>{totalReg.toLocaleString('es-AR')} registros</p>
          </div>
        </div>
        <button onClick={abrirNuevo} style={btnStyle(GREEN)}>＋ Nuevo remito</button>
      </div>

      {/* ── Dashboard cards ── */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <CardMetrica icon="🚚" label="Remitos este mes"       valor={dash ? String(dash.mes_cantidad)        : '—'} color={NAVY}   />
        <CardMetrica icon="⏳" label="Pendientes de entrega"  valor={dash ? String(dash.pendientes_cantidad)  : '—'} color={ORANGE} />
        <CardMetrica icon="✅" label="Entregados"              valor={dash ? String(dash.entregados_cantidad)  : '—'} color={GREEN}  />
        <CardMetrica icon="🚛" label="En camino"               valor={dash ? String(dash.en_camino_cantidad)   : '—'} color={BLUE}   />
      </div>

      {/* ── Filtros ── */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={labelStyle}>Buscar</label>
            <input value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
              placeholder="Número o cliente/proveedor..." style={inputStyle} />
          </div>
          <div style={{ flex: '0 1 150px' }}>
            <label style={labelStyle}>Tipo</label>
            <select value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setPagina(1); }}
              style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Todos</option>
              <option value="salida">Salida</option>
              <option value="entrada">Entrada</option>
              <option value="interno">Interno</option>
            </select>
          </div>
          <div style={{ flex: '0 1 160px' }}>
            <label style={labelStyle}>Estado</label>
            <select value={filtroEstado} onChange={e => { setFiltroEstado(e.target.value); setPagina(1); }}
              style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Todos</option>
              <option value="pendiente">Pendiente</option>
              <option value="en_camino">En camino</option>
              <option value="entregado">Entregado</option>
              <option value="parcial">Parcial</option>
              <option value="devuelto">Devuelto</option>
            </select>
          </div>
          <div style={{ flex: '0 1 150px' }}>
            <label style={labelStyle}>Fecha desde</label>
            <input type="date" value={fechaDesde} onChange={e => { setFechaDesde(e.target.value); setPagina(1); }} style={inputStyle} />
          </div>
          <div style={{ flex: '0 1 150px' }}>
            <label style={labelStyle}>Fecha hasta</label>
            <input type="date" value={fechaHasta} onChange={e => { setFechaHasta(e.target.value); setPagina(1); }} style={inputStyle} />
          </div>
          {(busqueda || filtroTipo || filtroEstado || fechaDesde || fechaHasta) && (
            <button onClick={() => { setBusqueda(''); setFiltroTipo(''); setFiltroEstado(''); setFechaDesde(''); setFechaHasta(''); setPagina(1); }}
              style={{ ...btnStyle('#EDF2F7', GRAY), alignSelf: 'flex-end' }}>
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* ── Tabla ── */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        {cargandoList ? (
          <div style={{ padding: '48px', textAlign: 'center', color: GRAY }}>Cargando...</div>
        ) : remitos.length === 0 ? (
          <div style={{ padding: '64px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '52px', marginBottom: '12px' }}>🚚</div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>No hay remitos</h3>
            <p style={{ fontSize: '14px', color: GRAY, margin: '0 0 24px' }}>Los remitos aparecerán aquí.</p>
            <button onClick={abrirNuevo} style={btnStyle(GREEN)}>＋ Crear primer remito</button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '860px' }}>
              <thead>
                <tr style={{ backgroundColor: '#EBF4FF' }}>
                  {['Número','Fecha','Tipo','Cliente / Proveedor','Estado','F. Entrega','Bultos','Acciones'].map(col => (
                    <th key={col} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600, color: NAVY, borderBottom: `2px solid ${SEP}`, whiteSpace: 'nowrap' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {remitos.map((r, idx) => (
                  <tr key={r.id}
                    style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#EBF8FF'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#fff' : '#F7FAFC'; }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: NAVY }}>{r.numero_completo}</td>
                    <td style={{ padding: '10px 14px', color: GRAY, whiteSpace: 'nowrap' }}>{fmtFecha(r.fecha)}</td>
                    <td style={{ padding: '10px 14px' }}><BadgeTipo tipo={r.tipo} /></td>
                    <td style={{ padding: '10px 14px', color: TEXT }}>{r.comprador_nombre || 'Sin nombre'}</td>
                    <td style={{ padding: '10px 14px' }}><BadgeEstado estado={r.estado} /></td>
                    <td style={{ padding: '10px 14px', color: GRAY, whiteSpace: 'nowrap' }}>{fmtFecha(r.fecha_entrega)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', color: GRAY }}>{r.total_bultos || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        <button onClick={() => verDetalle(r.id)}
                          style={{ backgroundColor: '#EBF4FF', color: BLUE, border: 'none', borderRadius: '5px', padding: '5px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                          👁️ Ver
                        </button>
                        <button onClick={() => imprimirDesde(r)}
                          style={{ backgroundColor: '#F7FAFC', color: GRAY, border: 'none', borderRadius: '5px', padding: '5px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                          🖨️
                        </button>
                        {!r.convertido_a_factura && (
                          <button onClick={() => convertirFactura(r.id)}
                            style={{ backgroundColor: '#FAF5FF', color: PURPLE, border: 'none', borderRadius: '5px', padding: '5px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                            🧾
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Paginación ── */}
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

      {/* ══════════════════════════════════════════════════════════
          MODAL NUEVO REMITO
      ══════════════════════════════════════════════════════════ */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '16px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '920px', boxShadow: '0 24px 72px rgba(0,0,0,0.35)', margin: 'auto' }}>

            {/* Header modal */}
            <div style={{ padding: '18px 28px', borderBottom: `2px solid ${SEP}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: NAVY, margin: 0 }}>
                {resultado ? '✅ Remito generado' : '＋ Nuevo Remito'}
              </h2>
              <button onClick={cerrarModal} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: GRAY }}>×</button>
            </div>

            {resultado ? (
              <PantallaResultado
                res={resultado}
                cid={cid!}
                token={token}
                onConvertir={() => convertirFactura(resultado.remito_id)}
                onConfirmar={() => {
                  // Cargar detalle para confirmar entrega desde resultado
                  verDetalle(resultado.remito_id).then(() => setModalConfirmar(true));
                }}
                onCerrar={cerrarModal}
              />
            ) : (
              <div style={{ padding: '24px 28px' }}>

                {/* ── TIPO DE REMITO ── */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={seccionStyle}>📋 Tipo de remito</div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {([
                      { val: 'salida',   icon: '📤', label: 'Salida — entrega a cliente' },
                      { val: 'entrada',  icon: '📥', label: 'Entrada — recepción de proveedor' },
                      { val: 'interno',  icon: '🔄', label: 'Interno — entre sucursales' },
                    ] as const).map(({ val, icon, label }) => (
                      <button key={val} onClick={() => setTipoRemito(val)}
                        style={{ ...btnStyle(tipoRemito === val ? BLUE : '#EDF2F7', tipoRemito === val ? '#fff' : GRAY), fontSize: '12px', padding: '10px 16px' }}>
                        {icon} {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── CONTRAPARTE ── */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={seccionStyle}>
                    {tipoRemito === 'salida' ? '👤 Cliente' : tipoRemito === 'entrada' ? '🏭 Proveedor' : '🏪 Sucursal destino'}
                  </div>

                  {tipoRemito === 'salida' && (
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <div style={{ flex: 2 }}>
                        <label style={labelStyle}>Nombre cliente</label>
                        <input value={nomCliente} onChange={e => setNomCliente(e.target.value)}
                          placeholder="Nombre (opcional)" style={inputStyle} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>CUIT</label>
                        <input value={cuitCliente} onChange={e => setCuitCliente(e.target.value)}
                          placeholder="00-00000000-0" style={inputStyle} />
                      </div>
                    </div>
                  )}

                  {tipoRemito === 'entrada' && (
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <div style={{ flex: 2 }}>
                        <label style={labelStyle}>Proveedor</label>
                        <select value={proveedorId} onChange={e => setProveedorId(e.target.value)}
                          style={{ ...inputStyle, cursor: 'pointer' }}>
                          <option value="">— Seleccionar proveedor —</option>
                          {proveedores.map(p => (
                            <option key={p.id} value={String(p.id)}>{p.razon_social}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>O ingreso manual</label>
                        <input value={nomCliente} onChange={e => setNomCliente(e.target.value)}
                          placeholder="Nombre del proveedor" style={inputStyle} />
                      </div>
                    </div>
                  )}

                  {tipoRemito === 'interno' && (
                    <div>
                      <label style={labelStyle}>Sucursal / destino</label>
                      <input value={nomCliente} onChange={e => setNomCliente(e.target.value)}
                        placeholder="Nombre de la sucursal destino" style={inputStyle} />
                    </div>
                  )}
                </div>

                {/* ── ITEMS ── */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={seccionStyle}>📦 Productos</div>

                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        ref={itemRef}
                        value={busqProd}
                        onChange={e => setBusqProd(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && prodsDrop.length > 0) agregarProducto(prodsDrop[0]);
                          if (e.key === 'Escape') { setShowDrop(false); setBusqProd(''); }
                        }}
                        placeholder="🔍 Nombre, código o EAN..."
                        style={inputStyle}
                      />
                      {loadProd && <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: GRAY, fontSize: '12px' }}>⏳</span>}
                      {showDrop && prodsDrop.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1.5px solid #CBD5E0', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 20, marginTop: '2px', maxHeight: '320px', overflowY: 'auto' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 80px 60px', padding: '6px 12px', fontSize: '10px', fontWeight: 700, color: GRAY, borderBottom: '1px solid #EDF2F7', textTransform: 'uppercase' }}>
                            <span>Código</span><span>Descripción</span><span>Precio</span><span>Stock</span>
                          </div>
                          {prodsDrop.slice(0, 8).map(p => (
                            <div key={p.id} onClick={() => agregarProducto(p)}
                              style={{ display: 'grid', gridTemplateColumns: '90px 1fr 80px 60px', padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #F7FAFC', fontSize: '13px', alignItems: 'center' }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#EBF8FF'; }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}>
                              <span style={{ fontFamily: 'monospace', color: GRAY, fontSize: '11px' }}>{p.codigo || '—'}</span>
                              <span style={{ fontWeight: 500 }}>{p.descripcion}</span>
                              <span style={{ fontWeight: 700, color: GREEN }}>${(p.precio_venta_1 || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
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
                            {['#', 'Descripción', 'Cantidad', 'Unidad', '×'].map((h, i) => (
                              <th key={h} style={{ padding: '8px 10px', textAlign: i >= 2 && i <= 3 ? 'right' : 'left', fontWeight: 600, color: GRAY, fontSize: '11px', borderBottom: '1px solid #EDF2F7' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it, idx) => (
                            <tr key={it.tempId} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                              <td style={{ padding: '6px 10px', color: GRAY, fontSize: '11px' }}>{idx + 1}</td>
                              <td style={{ padding: '6px 10px' }}>
                                <div style={{ fontWeight: 500, color: TEXT }}>{it.descripcion}</div>
                                {it.codigo && <div style={{ fontSize: '11px', color: GRAY }}>{it.codigo}</div>}
                              </td>
                              <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                                <input type="number" value={it.cantidad_remitida} min="0.01" step="0.01"
                                  onChange={e => actualizarItem(it.tempId, 'cantidad_remitida', parseFloat(e.target.value) || 0)}
                                  style={{ ...inputStyle, width: '80px', padding: '4px 8px', textAlign: 'right' }} />
                              </td>
                              <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                                <select value={it.unidad_medida}
                                  onChange={e => actualizarItem(it.tempId, 'unidad_medida', e.target.value)}
                                  style={{ ...inputStyle, width: '100px', padding: '4px 8px', cursor: 'pointer' }}>
                                  {['unidad','kg','litro','metro','caja','bulto','par','docena'].map(u => (
                                    <option key={u} value={u}>{u}</option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                <button onClick={() => eliminarItem(it.tempId)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: RED, fontSize: '18px', lineHeight: 1 }}>×</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '24px', color: GRAY, fontSize: '13px', border: '2px dashed #EDF2F7', borderRadius: '10px' }}>
                      Buscá un producto arriba o usá "＋ Libre"
                    </div>
                  )}
                </div>

                {/* ── LOGÍSTICA ── */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={seccionStyle}>🚛 Logística</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>Fecha de entrega</label>
                      <input type="date" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Total bultos</label>
                      <input type="number" value={totalBultos} onChange={e => setTotalBultos(e.target.value)}
                        placeholder="0" min="0" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Transporte / empresa</label>
                      <input value={transporte} onChange={e => setTransporte(e.target.value)}
                        placeholder="Nombre del transporte" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Chofer</label>
                      <input value={chofer} onChange={e => setChofer(e.target.value)}
                        placeholder="Nombre del chofer" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Patente</label>
                      <input value={patente} onChange={e => setPatente(e.target.value)}
                        placeholder="AA-123-BB" style={inputStyle} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Dirección de entrega</label>
                      <input value={direccion} onChange={e => setDireccion(e.target.value)}
                        placeholder="Calle 123, Ciudad" style={inputStyle} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Observaciones</label>
                      <textarea value={observ} onChange={e => setObserv(e.target.value)} rows={2}
                        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', height: '58px' }} />
                    </div>
                  </div>
                </div>

                {errForm && (
                  <div style={{ backgroundColor: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: RED, marginBottom: '16px' }}>
                    {errForm}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button onClick={cerrarModal} style={btnStyle('#EDF2F7', GRAY)}>Cancelar</button>
                  <button onClick={submitRemito} disabled={procesando || items.length === 0}
                    style={btnStyle(GREEN, '#fff', procesando || items.length === 0)}>
                    {procesando ? '⏳ Procesando...' : '🚚 Generar remito'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal detalle */}
      {detalle && !modalConfirmar && (
        <ModalDetalle
          detalle={detalle}
          onConfirmar={() => setModalConfirmar(true)}
          onConvertir={() => convertirFactura(detalle.remito.id)}
          onCerrar={() => setDetalle(null)}
        />
      )}

      {/* Modal confirmar entrega */}
      {detalle && modalConfirmar && (
        <ModalConfirmarEntrega
          detalle={detalle}
          onConfirmar={confirmarEntrega}
          onCerrar={() => setModalConfirmar(false)}
          procesando={confirmando}
        />
      )}

      {/* Modal producto libre */}
      {modalLibre && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '28px', width: '380px', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: NAVY, margin: '0 0 20px' }}>＋ Producto libre</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Descripción *</label>
                <input autoFocus value={libreDesc} onChange={e => setLibreDesc(e.target.value)}
                  placeholder="Descripción del ítem" style={inputStyle}
                  onKeyDown={e => e.key === 'Enter' && agregarLibre()} />
              </div>
              <div>
                <label style={labelStyle}>Cantidad</label>
                <input type="number" value={libreCant} onChange={e => setLibreCant(e.target.value)}
                  min="0.01" step="0.01" style={inputStyle}
                  onKeyDown={e => e.key === 'Enter' && agregarLibre()} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '24px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setModalLibre(false); setLibreDesc(''); setLibreCant('1'); }} style={btnStyle('#EDF2F7', GRAY)}>Cancelar</button>
              <button onClick={agregarLibre} disabled={!libreDesc.trim()} style={btnStyle(GREEN, '#fff', !libreDesc.trim())}>＋ Agregar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
