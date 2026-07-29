import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../../config/api';
import { getToken } from '../../../utils/auth';

// ── Colores ──────────────────────────────────────────────────────────────────
const NAVY   = '#1B2A4A';
const BLUE   = '#2B6CB0';
const GREEN  = '#38A169';
const RED    = '#E53E3E';
const SEP    = '#63B3ED';
const GRAY   = '#718096';
const TEXT   = '#2D3748';
const BG     = '#F4F6F9';
const ORANGE = '#DD6B20';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtFecha = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};


function getClienteId(): number | null {
  try { const s = localStorage.getItem('roberto_portal_session'); return s ? JSON.parse(s).cliente?.id ?? null : null; }
  catch { return null; }
}

let _tempId = 1;
const nextId = () => _tempId++;

// ── Types ─────────────────────────────────────────────────────────────────────
interface VentaRow {
  id: number;
  numero_completo: string;
  comprador_nombre: string;
  total: number;
  estado: string;
  anulada: boolean;
  fecha: string;
}

interface DashMetrics {
  ventas_hoy_cantidad: number;
  ventas_hoy_monto: number;
  ventas_mes_monto: number;
  ticket_promedio_mes: number;
}

interface ProductoResult {
  id: number;
  codigo: string;
  descripcion: string;
  precio_costo: number;
  precio_venta_1: number;
  precio_venta_2: number;
  precio_venta_3: number;
  precio_venta_final: number;
  stock_actual: number;
  alicuota_iva: number;
  ean: string;
}

interface ItemVenta {
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
  lista_precio_id: number;
}

interface ComprobanteData {
  venta_id: number;
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
  ivaTotal: number;
  items: ItemVenta[];
  formaPago: string;
  montoRecibido: number;
  vuelto: number;
}

// ── Estilos comunes ──────────────────────────────────────────────────────────
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

// ── Calcular totales ──────────────────────────────────────────────────────────
function calcTotales(items: ItemVenta[], descGlobal: number, recargo: number, precioConIva: boolean) {
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

// ── Calcular totales (nuevo: precio AS-IS, IVA opcional) ──────────────────────
function calcTotalesNew(items: ItemVenta[], descGlobal: number, recargo: number, agregarIva: boolean) {
  const ivaByAlic: Record<number, number> = {};
  let sumaSubtotales = 0;
  const itemsSub: { alic: number; sub: number }[] = [];

  for (const it of items) {
    const sub = it.precio * it.cantidad * (1 - it.dto / 100);
    sumaSubtotales += sub;
    itemsSub.push({ alic: it.alicuota ?? 21, sub });
  }

  const descuentoMonto = sumaSubtotales * (descGlobal / 100);
  const base           = sumaSubtotales * (1 - descGlobal / 100);
  const recargoMonto   = base * (recargo / 100);
  const baseConRecargo = base * (1 + recargo / 100);

  if (agregarIva) {
    const factor = sumaSubtotales > 0 ? baseConRecargo / sumaSubtotales : 1;
    for (const { alic, sub } of itemsSub) {
      ivaByAlic[alic] = (ivaByAlic[alic] || 0) + sub * factor * (alic / 100);
    }
  }

  const ivaTotal = Object.values(ivaByAlic).reduce((a, b) => a + b, 0);
  return { sumaSubtotales, descuentoMonto, recargoMonto, ivaByAlic, ivaTotal, total: baseConRecargo + ivaTotal };
}

// ── Panel resumen lateral ──────────────────────────────────────────────────────
const PAGO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia',
  tarjeta_debito: 'Débito', tarjeta_credito: 'Crédito',
  cheque: 'Cheque', cuenta_corriente: 'Cuenta Corriente', otro: 'Otro',
};

function PanelResumen({ items, sumaSubtotales, descuentoMonto, recargoMonto, ivaByAlic, ivaTotal, total,
  descGlobal, recargo, agregarIva, formaPago, montoRecibido, vueltoRT, onClose }: {
  items: ItemVenta[]; sumaSubtotales: number; descuentoMonto: number; recargoMonto: number;
  ivaByAlic: Record<number, number>; ivaTotal: number; total: number;
  descGlobal: number; recargo: number; agregarIva: boolean;
  formaPago: string; montoRecibido: number; vueltoRT: number;
  onClose: () => void;
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 500 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(460px, 96vw)', backgroundColor: '#fff', zIndex: 501, boxShadow: '-8px 0 40px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', animation: 'slideIn .2s ease' }}>
        <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

        {/* Header */}
        <div style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #2B6CB0 100%)`, padding: '20px 24px', color: '#fff', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>📋 Resumen de Venta</div>
              <div style={{ fontSize: '12px', opacity: 0.75, marginTop: '3px' }}>{items.length} artículo{items.length !== 1 ? 's' : ''} · {items.reduce((s, i) => s + i.cantidad, 0)} unidades</div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer', borderRadius: '8px', padding: '4px 12px', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: GRAY, fontSize: '14px' }}>Sin artículos agregados</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead style={{ position: 'sticky', top: 0 }}>
                <tr style={{ backgroundColor: '#EBF4FF' }}>
                  {['Cód', 'Descripción', 'Cant', 'Precio', 'Subtotal'].map((h, i) => (
                    <th key={h} style={{ padding: '9px 10px', textAlign: i >= 2 ? 'right' : 'left', color: NAVY, fontSize: '11px', fontWeight: 700, borderBottom: `2px solid ${SEP}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const sub = it.precio * it.cantidad * (1 - it.dto / 100);
                  return (
                    <tr key={it.tempId} style={{ borderBottom: '1px solid #EDF2F7', backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                      <td style={{ padding: '9px 10px', color: GRAY, fontSize: '11px', fontFamily: 'monospace' }}>{it.codigo || '—'}</td>
                      <td style={{ padding: '9px 10px', color: TEXT }}>
                        <div style={{ fontWeight: 500 }}>{it.descripcion}</div>
                        {it.dto > 0 && <div style={{ fontSize: '10px', color: RED }}>Dto {it.dto}%</div>}
                      </td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: TEXT, fontWeight: 600 }}>{it.cantidad}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: GRAY, fontFamily: 'monospace', fontSize: '12px' }}>{fmt(it.precio)}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: BLUE, fontFamily: 'monospace' }}>{fmt(sub)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer totales */}
        <div style={{ borderTop: '2px solid #EDF2F7', padding: '16px 20px', backgroundColor: '#F7FAFC', flexShrink: 0 }}>
          <div style={{ fontSize: '13px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: GRAY }}>
              <span>Subtotal</span>
              <span style={{ fontWeight: 600, color: TEXT }}>{fmt(sumaSubtotales)}</span>
            </div>
            {descGlobal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: RED }}>
                <span>Descuento ({descGlobal}%)</span><span>-{fmt(descuentoMonto)}</span>
              </div>
            )}
            {recargo > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: ORANGE }}>
                <span>Recargo ({recargo}%)</span><span>+{fmt(recargoMonto)}</span>
              </div>
            )}
            {agregarIva && Object.entries(ivaByAlic).sort(([a],[b]) => Number(a)-Number(b)).map(([alic, monto]) => (
              <div key={alic} style={{ display: 'flex', justifyContent: 'space-between', color: GRAY }}>
                <span>IVA {alic}%</span><span>{fmt(monto)}</span>
              </div>
            ))}
          </div>

          {/* Total destacado */}
          <div style={{ background: 'linear-gradient(135deg, #F0FFF4, #C6F6D5)', borderRadius: '12px', padding: '14px 18px', marginBottom: '12px', border: '2px solid #9AE6B4' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#276749' }}>TOTAL A PAGAR</span>
              <span style={{ fontSize: '28px', fontWeight: 900, color: GREEN, fontFamily: 'monospace' }}>{fmt(total)}</span>
            </div>
          </div>

          {/* Resumen de cobro */}
          <div style={{ backgroundColor: NAVY, borderRadius: '10px', padding: '12px 16px', color: '#fff' }}>
            <div style={{ fontSize: '10px', opacity: 0.65, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Cobro</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: formaPago === 'efectivo' && montoRecibido > 0 ? '4px' : 0, fontSize: '13px' }}>
              <span style={{ opacity: 0.8 }}>Método</span>
              <span style={{ fontWeight: 700 }}>{PAGO_LABELS[formaPago] || formaPago}</span>
            </div>
            {formaPago === 'efectivo' && montoRecibido > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
                  <span style={{ opacity: 0.8 }}>Recibido</span><span>{fmt(montoRecibido)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '8px', marginTop: '6px' }}>
                  <span>{vueltoRT >= 0 ? '🔄 Vuelto' : '⚠️ Falta'}</span>
                  <span style={{ color: vueltoRT >= 0 ? '#68D391' : '#FC8181' }}>{fmt(Math.abs(vueltoRT))}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Badge estado ─────────────────────────────────────────────────────────────
function BadgeEstado({ estado, anulada }: { estado: string; anulada: boolean }) {
  const map: Record<string, { bg: string; c: string; label: string }> = {
    anulada:  { bg: '#FFF5F5', c: RED,   label: 'Anulada' },
    cobrada:  { bg: '#F0FFF4', c: GREEN, label: 'Cobrada' },
    pendiente:{ bg: '#EBF8FF', c: BLUE,  label: 'Pendiente' },
  };
  const k = anulada ? 'anulada' : estado;
  const s = map[k] || { bg: '#EDF2F7', c: GRAY, label: estado };
  return (
    <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, backgroundColor: s.bg, color: s.c }}>
      {s.label}
    </span>
  );
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
  onAgregar: (data: { descripcion: string; precio: number; cantidad: number }) => void;
  onCerrar: () => void;
}) {
  const [desc,   setDesc]   = useState('');
  const [precio, setPrecio] = useState('');
  const [cant,   setCant]   = useState('1');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => ref.current?.focus(), 60); }, []);

  const ok = desc.trim() && Number(precio) > 0;
  const agregar = () => {
    if (!ok) return;
    onAgregar({ descripcion: desc.trim(), precio: parseFloat(precio), cantidad: parseFloat(cant) || 1 });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '28px', width: '380px', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: NAVY, margin: '0 0 20px' }}>＋ Producto libre</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Descripción *</label>
            <input ref={ref} value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Nombre del producto o servicio" style={inputStyle}
              onKeyDown={e => e.key === 'Enter' && agregar()} />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Precio unitario *</label>
              <input type="number" value={precio} onChange={e => setPrecio(e.target.value)}
                placeholder="0.00" style={inputStyle} min="0" step="0.01"
                onKeyDown={e => e.key === 'Enter' && agregar()} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Cantidad</label>
              <input type="number" value={cant} onChange={e => setCant(e.target.value)}
                style={inputStyle} min="0.01" step="0.01"
                onKeyDown={e => e.key === 'Enter' && agregar()} />
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

// ── Pantalla comprobante ──────────────────────────────────────────────────────
function PantallaComprobante({ comp, onNuevaVenta, onCerrar }: {
  comp: ComprobanteData;
  onNuevaVenta: () => void;
  onCerrar: () => void;
}) {
  const generarHTML = (size: 'A4' | 'A5' | 'ticket') => {
    const cfg = JSON.parse(localStorage.getItem(`roberto_config_${getClienteId()}`) || '{}');
    const nombreNegocio = cfg.nombre_comercial || 'Mi Negocio';
    const logoUrl       = cfg.logo_url         || '';
    const membreteLinas = [cfg.direccion, cfg.cuit, cfg.membrete].filter(Boolean)
      .map(l => `<div>${l}</div>`).join('');
    const isTicket = size === 'ticket';
    const fs = isTicket ? '11px' : '13px';
    const itemsHTML = comp.items.map(it => {
      const alic = it.alicuota ?? 21;
      const pNeto = comp.precioConIva ? it.precio / (1 + alic / 100) : it.precio;
      const sub = pNeto * it.cantidad * (1 - it.dto / 100);
      return `<tr><td>${it.cantidad}</td><td>${it.descripcion}${it.dto ? ` (-${it.dto}%)` : ''}</td><td style="text-align:right">$${sub.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td></tr>`;
    }).join('');
    const descRow = comp.descuentoMonto > 0
      ? `<div class="row"><span>Descuento (${comp.descGlobal}%):</span><span>-$${comp.descuentoMonto.toLocaleString('es-AR',{minimumFractionDigits:2})}</span></div>` : '';
    const recRow  = comp.recargoMonto > 0
      ? `<div class="row"><span>Recargo (${comp.recargo}%):</span><span>+$${comp.recargoMonto.toLocaleString('es-AR',{minimumFractionDigits:2})}</span></div>` : '';
    const ivaRows = Object.entries(comp.ivaByAlic).sort(([a],[b])=>Number(a)-Number(b))
      .map(([a, m]) => `<div class="row"><span>IVA ${a}%:</span><span>$${m.toLocaleString('es-AR',{minimumFractionDigits:2})}</span></div>`).join('');
    const pagoLabels: Record<string, string> = {
      efectivo: 'Efectivo', transferencia: 'Transferencia',
      tarjeta_debito: 'Débito', tarjeta_credito: 'Crédito',
      cheque: 'Cheque', cuenta_corriente: 'Cuenta Corriente', otro: 'Otro',
    };
    const pagoLabel = pagoLabels[comp.formaPago] || comp.formaPago;
    const pagoRows = `<div class="row"><span>Forma de pago:</span><span class="bold">${pagoLabel}</span></div>`
      + (comp.formaPago === 'efectivo'
        ? `<div class="row"><span>Recibido:</span><span>$${comp.montoRecibido.toLocaleString('es-AR',{minimumFractionDigits:2})}</span></div>`
        + `<div class="row bold"><span>Vuelto:</span><span>$${comp.vuelto.toLocaleString('es-AR',{minimumFractionDigits:2})}</span></div>`
        : '');

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${comp.numero_completo}</title>
<style>
  @page { size: ${isTicket ? '80mm auto' : size}; margin: ${isTicket ? '5mm' : '12mm'}; }
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: ${fs}; margin: 0; }
  .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
  .negocio { font-size: ${isTicket ? '15px' : '18px'}; font-weight: bold; }
  .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
  .sep { border-top: 1px dashed #000; margin: 7px 0; }
  .bold { font-weight: bold; }
  .total { font-size: ${isTicket ? '15px' : '18px'}; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 3px 4px; font-size: inherit; vertical-align: top; }
  th { border-bottom: 1px solid #000; font-weight: bold; }
  td:last-child { white-space: nowrap; }
  .footer { text-align: center; margin-top: 12px; font-size: ${isTicket ? '10px' : '12px'}; }
</style></head><body>
<div class="header">
  ${logoUrl ? `<img src="${logoUrl}" alt="" style="max-width:${isTicket ? '80px' : '150px'};max-height:60px;object-fit:contain;display:block;margin:0 auto 8px">` : ''}
  <div class="negocio">${nombreNegocio}</div>
  <div>Comprobante de Venta</div>
  ${membreteLinas}
</div>
<div class="row"><span class="bold">${comp.numero_completo}</span><span>${new Date().toLocaleDateString('es-AR')} ${new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}</span></div>
<div class="row"><span>Cliente:</span><span>${comp.comprador_nombre || 'Mostrador'}</span></div>
<div class="sep"></div>
<table>
  <thead><tr><th>Cant</th><th>Descripción</th><th style="text-align:right">Subtotal</th></tr></thead>
  <tbody>${itemsHTML}</tbody>
</table>
<div class="sep"></div>
<div class="row"><span>Subtotal:</span><span>$${comp.sumaSubtotales.toLocaleString('es-AR',{minimumFractionDigits:2})}</span></div>
${descRow}${recRow}${ivaRows}
<div class="sep"></div>
<div class="row total"><span>TOTAL:</span><span>$${comp.total.toLocaleString('es-AR',{minimumFractionDigits:2})}</span></div>
<div class="sep"></div>
${pagoRows}
<div class="sep"></div>
<div class="footer">Gracias por su compra</div>
</body></html>`;
  };

  const imprimir = (size: 'A4' | 'A5' | 'ticket') => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(generarHTML(size));
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 350);
  };

  const whatsApp = () => {
    const txt = `*Comprobante de Venta*\nNúmero: ${comp.numero_completo}\nCliente: ${comp.comprador_nombre || 'Mostrador'}\nFecha: ${new Date().toLocaleDateString('es-AR')}\nTotal: $${comp.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}\n\n¡Gracias por su compra!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank');
  };

  return (
    <div style={{ padding: '32px 28px', textAlign: 'center' }}>
      <div style={{ fontSize: '52px', marginBottom: '12px' }}>✅</div>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: GREEN, margin: '0 0 4px' }}>¡Venta confirmada!</h2>
      <div style={{ fontSize: '20px', fontWeight: 700, color: NAVY, marginBottom: '4px' }}>{comp.numero_completo}</div>
      <div style={{ fontSize: '13px', color: GRAY, marginBottom: '4px' }}>
        {comp.comprador_nombre || 'Mostrador'} &nbsp;·&nbsp;
        {new Date().toLocaleDateString('es-AR')} {new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div style={{ fontSize: '30px', fontWeight: 800, color: GREEN, margin: '16px 0 28px' }}>{fmt(comp.total)}</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', maxWidth: '380px', margin: '0 auto 20px' }}>
        <button onClick={() => imprimir('ticket')} style={btnStyle(NAVY)}>🖨️ Imprimir ticket</button>
        <button onClick={() => imprimir('A4')}     style={btnStyle(BLUE)}>📄 PDF A4</button>
        <button onClick={() => imprimir('A5')}     style={btnStyle(BLUE)}>📄 PDF A5</button>
        <button onClick={whatsApp}                 style={btnStyle('#25D366')}>💬 WhatsApp</button>
      </div>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
        <button onClick={onNuevaVenta} style={btnStyle(GREEN)}>✅ Nueva venta</button>
        <button onClick={onCerrar}     style={btnStyle('#EDF2F7', GRAY)}>✅ Cerrar</button>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
function RobertoVentas() {
  const navigate  = useNavigate();
  const cid       = getClienteId();
  const token     = getToken();
  const authHdr   = { 'x-superadmin-token': token };
  const jsonHdr   = { 'x-superadmin-token': token, 'Content-Type': 'application/json' };

  // ── Dashboard ──────────────────────────────────────────────────
  const [dash, setDash] = useState<DashMetrics | null>(null);

  // ── Lista ──────────────────────────────────────────────────────
  const [ventas,       setVentas]       = useState<VentaRow[]>([]);
  const [totalReg,     setTotalReg]     = useState(0);
  const [pagina,       setPagina]       = useState(1);
  const [porPagina,    setPorPagina]    = useState(25);
  const [totalPags,    setTotalPags]    = useState(1);
  const [cargandoList, setCargandoList] = useState(false);

  // ── Filtros ────────────────────────────────────────────────────
  const [busqueda,     setBusqueda]     = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [fechaDesde,   setFechaDesde]   = useState('');
  const [fechaHasta,   setFechaHasta]   = useState('');

  // ── Modal ──────────────────────────────────────────────────────
  const [modalOpen,    setModalOpen]    = useState(false);

  // Cliente
  const [tipoCliente,  setTipoCliente]  = useState<'mostrador'|'cuenta'>('mostrador');
  const [nomMostrador, setNomMostrador] = useState('');
  const [busqCliente,  setBusqCliente]  = useState('');
  const [clientesDrop, setClientesDrop] = useState<ClienteFinal[]>([]);
  const [clienteSel,   setClienteSel]   = useState<ClienteFinal | null>(null);

  // Items
  const [items,        setItems]        = useState<ItemVenta[]>([]);
  const [busqProd,     setBusqProd]     = useState('');
  const [prodsDrop,    setProdsDrop]    = useState<ProductoResult[]>([]);
  const [listaPrecio,  setListaPrecio]  = useState<'pv1'|'pv2'|'pv3'>('pv1');
  const [showDrop,     setShowDrop]     = useState(false);
  const [loadProd,     setLoadProd]     = useState(false);
  const [modalLibre,   setModalLibre]   = useState(false);
  const itemInputRef = useRef<HTMLInputElement>(null);

  // Totales / opciones
  const [descGlobal,     setDescGlobal]     = useState(0);
  const [recargo,        setRecargo]        = useState(0);
  const [precioConIva,   setPrecioConIva]   = useState(true);
  const [enCC,           setEnCC]           = useState(false);
  const [observ,         setObserv]         = useState('');
  const [formaPago,      setFormaPago]      = useState('efectivo');
  const [montoRecibido,  setMontoRecibido]  = useState<number>(0);

  // CC cliente
  const [ccClienteId,  setCcClienteId]  = useState<number | null>(null);
  const [cargandoCC,   setCargandoCC]   = useState(false);

  // IVA toggle + resumen panel
  const [agregarIva,   setAgregarIva]   = useState(false);
  const [showResumen,  setShowResumen]  = useState(false);

  // Submit
  const [procesando,   setProcesando]   = useState(false);
  const [errVenta,     setErrVenta]     = useState('');
  const [comprobante,  setComprobante]  = useState<ComprobanteData | null>(null);

  // Detalle venta
  const [ventaDetalle,  setVentaDetalle]  = useState<{ venta: any; items: any[] } | null>(null);
  const [modalDetalle,  setModalDetalle]  = useState(false);

  // ── Poblar config del negocio desde sesión (fallback) ────────
  useEffect(() => {
    if (!cid) return;
    const key = `roberto_config_${cid}`;
    if (localStorage.getItem(key)) return; // ya existe, no pisar
    try {
      const s = localStorage.getItem('roberto_portal_session');
      if (!s) return;
      const sesion = JSON.parse(s);
      const c = sesion?.cliente;
      if (!c) return;
      localStorage.setItem(key, JSON.stringify({
        nombre_comercial: c.nombre_comercial || '',
        razon_social:     c.razon_social     || '',
        cuit:             c.cuit             || '',
        condicion_iva:    c.condicion_iva    || '',
        direccion:        c.direccion        || '',
        ciudad:           c.ciudad           || '',
        provincia:        c.provincia        || '',
        telefono:         c.telefono         || '',
        whatsapp:         c.whatsapp         || '',
      }));
    } catch { /* silencioso */ }
  }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load dashboard ────────────────────────────────────────────
  const cargarDash = useCallback(() => {
    if (!cid) return;
    fetch(`${API_BASE}/api/superadmin/ventas/${cid}/dashboard`, { headers: authHdr })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setDash(d))
      .catch(() => {});
  }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargarDash(); }, [cargarDash]);

  // ── Load ventas (debounced) ───────────────────────────────────
  const cargarVentas = useCallback(async () => {
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
      const r = await fetch(`${API_BASE}/api/superadmin/ventas/${cid}?${p}`, { headers: authHdr });
      if (r.ok) {
        const d = await r.json();
        setVentas(d.ventas   || []);
        setTotalReg(d.total  || 0);
        setTotalPags(d.paginas || 1);
      }
    } catch { /* silent */ }
    finally { setCargandoList(false); }
  }, [cid, pagina, porPagina, busqueda, filtroEstado, fechaDesde, fechaHasta]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(cargarVentas, 300);
    return () => clearTimeout(t);
  }, [cargarVentas]);

  // ── Fetch id de CC del cliente seleccionado ───────────────────
  const fetchCuentaCorrienteId = useCallback(async (clienteId: number) => {
    if (!cid) return;
    setCargandoCC(true);
    try {
      const r = await fetch(
        `${API_BASE}/api/superadmin/cuenta-corriente/${cid}/${clienteId}`,
        { headers: authHdr }
      );
      if (r.ok) {
        const d = await r.json();
        setCcClienteId(d.cuenta?.id ?? d.id ?? null);
      } else {
        setCcClienteId(null);
      }
    } catch { setCcClienteId(null); }
    finally { setCargandoCC(false); }
  }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Enfocar input al abrir modal ──────────────────────────────
  useEffect(() => {
    if (modalOpen && !comprobante) {
      setTimeout(() => itemInputRef.current?.focus(), 120);
    }
  }, [modalOpen, comprobante]);

  // ── Buscar clientes finales (debounced) ───────────────────────
  useEffect(() => {
    if (!busqCliente.trim() || tipoCliente !== 'cuenta' || clienteSel) {
      setClientesDrop([]); return;
    }
    const t = setTimeout(async () => {
      if (!cid) return;
      try {
        const r = await fetch(
          `${API_BASE}/api/superadmin/clientes-finales/${cid}?buscar=${encodeURIComponent(busqCliente)}&limit=8`,
          { headers: authHdr }
        );
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

      // Si son solo dígitos → intentar EAN primero
      if (/^\d{4,}$/.test(q)) {
        try {
          const r = await fetch(`${API_BASE}/api/superadmin/ventas/buscar-ean/${cid}/${q}`, { headers: authHdr });
          if (r.ok) {
            const d = await r.json();
            if (d.producto) {
              agregarProducto(d.producto);
              setBusqProd('');
              setLoadProd(false);
              return;
            }
          }
        } catch { /* fall through */ }
      }

      // Búsqueda por texto
      try {
        const param = /^\d+$/.test(q) ? `ean=${q}` : `buscar=${encodeURIComponent(q)}`;
        const r = await fetch(`${API_BASE}/api/superadmin/importador/productos/${cid}?${param}&limit=8`, { headers: authHdr });
        if (r.ok) {
          const d = await r.json();
          const lista: ProductoResult[] = d.productos || d.items || [];
          // Coincidencia exacta de código (sin espacios, 1 resultado)
          if (!q.includes(' ') && lista.length === 1) {
            const p = lista[0];
            if ((p.codigo && p.codigo.toLowerCase() === q.toLowerCase()) || p.ean === q) {
              agregarProducto(p);
              setBusqProd('');
              setLoadProd(false);
              return;
            }
          }
          setProdsDrop(lista);
          setShowDrop(lista.length > 0);
        }
      } catch { /* silent */ }
      finally { setLoadProd(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [busqProd]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers de items ──────────────────────────────────────────
  const agregarProducto = (p: ProductoResult) => {
    setItems(prev => [...prev, {
      tempId:     nextId(),
      producto_id: p.id,
      codigo:      p.codigo       || '',
      descripcion: p.descripcion,
      es_libre:    false,
      cantidad:    1,
      precio:      listaPrecio === 'pv1'
        ? (parseFloat(String(p.precio_venta_1)) || parseFloat(String(p.precio_venta_final)) || parseFloat(String(p.precio_costo)) || 0)
        : listaPrecio === 'pv2'
        ? (parseFloat(String(p.precio_venta_2)) || parseFloat(String(p.precio_venta_1)) || parseFloat(String(p.precio_venta_final)) || parseFloat(String(p.precio_costo)) || 0)
        : (parseFloat(String(p.precio_venta_3)) || parseFloat(String(p.precio_venta_2)) || parseFloat(String(p.precio_venta_1)) || parseFloat(String(p.precio_venta_final)) || parseFloat(String(p.precio_costo)) || 0),
      dto:         0,
      alicuota:    parseFloat(String(p.alicuota_iva))   || 21,
      stock_actual:parseFloat(String(p.stock_actual))   || 0,
    }]);
    setProdsDrop([]); setShowDrop(false); setBusqProd('');
    setTimeout(() => itemInputRef.current?.focus(), 60);
  };

  const agregarLibre = (data: { descripcion: string; precio: number; cantidad: number }) => {
    setItems(prev => [...prev, {
      tempId: nextId(), producto_id: null, codigo: '',
      descripcion: data.descripcion, es_libre: true,
      cantidad: data.cantidad, precio: data.precio, dto: 0, alicuota: 21, stock_actual: 0,
    }]);
    setModalLibre(false);
    setTimeout(() => itemInputRef.current?.focus(), 60);
  };

  const actualizarItem = (tempId: number, campo: keyof ItemVenta, val: any) =>
    setItems(prev => prev.map(it => it.tempId === tempId ? { ...it, [campo]: val } : it));

  const eliminarItem = (tempId: number) =>
    setItems(prev => prev.filter(it => it.tempId !== tempId));

  // ── Abrir / resetear modal ────────────────────────────────────
  const resetModal = () => {
    setItems([]); setTipoCliente('mostrador'); setNomMostrador('');
    setBusqCliente(''); setClienteSel(null); setClientesDrop([]);
    setCcClienteId(null);
    setBusqProd(''); setProdsDrop([]); setShowDrop(false);
    setDescGlobal(0); setRecargo(0); setPrecioConIva(true); setEnCC(false); setObserv('');
    setAgregarIva(false); setShowResumen(false);
    setFormaPago('efectivo'); setMontoRecibido(0);
    setErrVenta(''); setComprobante(null);
  };

  const abrirModal = () => { resetModal(); setModalOpen(true); };

  const cerrarModal = () => {
    setModalOpen(false);
    if (comprobante) { cargarVentas(); cargarDash(); }
    resetModal();
  };

  // ── Ver detalle de venta ──────────────────────────────────────
  const handleVerVenta = async (v: VentaRow) => {
    try {
      const r = await fetch(
        `${API_BASE}/api/superadmin/ventas/${cid}/${v.id}`,
        { headers: authHdr }
      );
      const data = await r.json();
      setVentaDetalle(data);
      setModalDetalle(true);
    } catch {
      console.error('Error cargando detalle de venta');
    }
  };

  // ── Confirmar venta ───────────────────────────────────────────
  const confirmarVenta = async () => {
    if (!items.length) { setErrVenta('Agregá al menos un producto.'); return; }
    if (!cid) return;

    const compradorNombre = tipoCliente === 'cuenta'
      ? (clienteSel?.comprador_nombre || '')
      : (nomMostrador.trim() || 'Mostrador');
    const compradorCuit = tipoCliente === 'cuenta' ? (clienteSel?.comprador_cuit || '') : '';

    const { sumaSubtotales, descuentoMonto, recargoMonto, ivaByAlic, ivaTotal, total } = calcTotalesNew(items, descGlobal, recargo, agregarIva);
    const vueltoCalc = formaPago === 'efectivo' ? Math.max(0, montoRecibido - total) : 0;

    const body = {
      comprador_nombre:      compradorNombre,
      comprador_cuit:        compradorCuit,
      va_a_cuenta_corriente: enCC,
      ...(enCC && ccClienteId ? { cuenta_corriente_cliente_id: ccClienteId } : {}),
      observaciones:         observ,
      descuento_global:      descGlobal,
      recargo_global:        recargo,
      precio_con_iva:        false,
      agregar_iva:           agregarIva,
      forma_pago:            formaPago,
      monto_recibido:        formaPago === 'efectivo' ? montoRecibido : total,
      vuelto:                vueltoCalc,
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

    setProcesando(true); setErrVenta('');
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/ventas/${cid}`, {
        method: 'POST', headers: jsonHdr, body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) { setErrVenta(data.mensaje || 'Error al guardar la venta'); return; }

      setComprobante({
        venta_id:         data.venta_id,
        numero_completo:  data.numero_completo,
        comprador_nombre: compradorNombre,
        total, sumaSubtotales, descuentoMonto, recargoMonto,
        descGlobal, recargo, precioConIva: false, ivaByAlic, ivaTotal,
        items: [...items],
        formaPago,
        montoRecibido: formaPago === 'efectivo' ? montoRecibido : total,
        vuelto: vueltoCalc,
      });
    } catch {
      setErrVenta('Error de red. Intentá de nuevo.');
    } finally {
      setProcesando(false);
    }
  };

  // ── Totales en tiempo real ────────────────────────────────────
  const { sumaSubtotales, descuentoMonto, recargoMonto, ivaByAlic, ivaTotal, total } = calcTotalesNew(items, descGlobal, recargo, agregarIva);
  const vueltoRT = formaPago === 'efectivo' ? montoRecibido - total : 0;
  const confirmDisabled = procesando || items.length === 0 || (formaPago === 'efectivo' && montoRecibido > 0 && montoRecibido < total);

  // ── Generar HTML para imprimir desde detalle ─────────────────
  const generarHTMLDetalle = (det: { venta: any; items: any[] }) => {
    const cfg = JSON.parse(localStorage.getItem(`roberto_config_${cid}`) || '{}');
    const nombreNegocio = cfg.nombre_comercial || 'Mi Negocio';
    const logoUrlD      = cfg.logo_url         || '';
    const membrete = [cfg.direccion, cfg.cuit, cfg.membrete].filter(Boolean)
      .map(l => `<div>${l}</div>`).join('');
    const itemsHTML = det.items.map(it =>
      `<tr><td>${it.cantidad}</td><td>${it.descripcion_libre || it.producto_descripcion || '—'}</td><td style="text-align:right">$${Number(it.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td></tr>`
    ).join('');
    const pagoLabels: Record<string, string> = {
      efectivo: 'Efectivo', transferencia: 'Transferencia',
      tarjeta_debito: 'Débito', tarjeta_credito: 'Crédito',
      cheque: 'Cheque', cuenta_corriente: 'Cuenta Corriente', otro: 'Otro',
    };
    const pagoLabel = pagoLabels[det.venta.forma_pago] || det.venta.forma_pago || '—';
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${det.venta.numero_completo}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: 'Courier New', monospace; font-size: 13px; margin: 0; }
  .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
  .negocio { font-size: 18px; font-weight: bold; }
  .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
  .sep { border-top: 1px dashed #000; margin: 7px 0; }
  .bold { font-weight: bold; }
  .total { font-size: 18px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 3px 4px; font-size: inherit; }
  th { border-bottom: 1px solid #000; font-weight: bold; }
</style></head><body>
<div class="header">
  ${logoUrlD ? `<img src="${logoUrlD}" alt="" style="max-width:150px;max-height:60px;object-fit:contain;display:block;margin:0 auto 8px">` : ''}
  <div class="negocio">${nombreNegocio}</div>
  <div>Comprobante de Venta</div>
  ${membrete}
</div>
<div class="row"><span class="bold">${det.venta.numero_completo}</span><span>${fmtFecha(det.venta.fecha)}</span></div>
<div class="row"><span>Cliente:</span><span>${det.venta.comprador_nombre || 'Mostrador'}</span></div>
<div class="sep"></div>
<table>
  <thead><tr><th>Cant</th><th>Descripción</th><th style="text-align:right">Subtotal</th></tr></thead>
  <tbody>${itemsHTML}</tbody>
</table>
<div class="sep"></div>
<div class="row total"><span>TOTAL:</span><span>$${Number(det.venta.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></div>
<div class="sep"></div>
<div class="row"><span>Forma de pago:</span><span class="bold">${pagoLabel}</span></div>
<div class="sep"></div>
<div style="text-align:center;margin-top:12px;font-size:12px">Gracias por su compra</div>
</body></html>`;
  };

  const imprimirDetalle = () => {
    if (!ventaDetalle) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(generarHTMLDetalle(ventaDetalle));
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 350);
  };

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
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: NAVY, margin: '0 0 2px' }}>💰 Ventas</h2>
            <p style={{ fontSize: '13px', color: GRAY, margin: 0 }}>{totalReg.toLocaleString('es-AR')} registros</p>
          </div>
        </div>
        <button onClick={abrirModal} style={btnStyle(GREEN)}>＋ Nueva venta</button>
      </div>

      {/* ── Cards métricas ──────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <CardMetrica icon="💰" label="Ventas hoy"       valor={dash ? fmt(dash.ventas_hoy_monto)    : '—'} color={GREEN}  />
        <CardMetrica icon="🛒" label="Cantidad hoy"     valor={dash ? String(dash.ventas_hoy_cantidad) : '—'} color={ORANGE} />
        <CardMetrica icon="📅" label="Ventas del mes"   valor={dash ? fmt(dash.ventas_mes_monto)    : '—'} color={BLUE}   />
        <CardMetrica icon="🎯" label="Ticket promedio"  valor={dash ? fmt(dash.ticket_promedio_mes) : '—'} color={SEP}    />
      </div>

      {/* ── Filtros ─────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={labelStyle}>Buscar</label>
            <input value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
              placeholder="Número o cliente..." style={inputStyle} />
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
              <option value="cobrada">Cobrada</option>
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
          <div style={{ padding: '48px', textAlign: 'center', color: GRAY, fontSize: '14px' }}>Cargando...</div>
        ) : ventas.length === 0 ? (
          <div style={{ padding: '64px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '52px', marginBottom: '12px' }}>💰</div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>No hay ventas registradas</h3>
            <p style={{ fontSize: '14px', color: GRAY, margin: '0 0 24px' }}>Las ventas aparecerán aquí.</p>
            <button onClick={abrirModal} style={btnStyle(GREEN)}>＋ Registrar primera venta</button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '650px' }}>
              <thead>
                <tr style={{ backgroundColor: '#EBF4FF' }}>
                  {['Número', 'Fecha', 'Cliente', 'Total', 'Estado', 'Acciones'].map(col => (
                    <th key={col} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600, color: NAVY, borderBottom: `2px solid ${SEP}`, whiteSpace: 'nowrap' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ventas.map((v, idx) => (
                  <tr key={v.id}
                    style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#EBF8FF'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#fff' : '#F7FAFC'; }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: NAVY }}>{v.numero_completo}</td>
                    <td style={{ padding: '10px 14px', color: GRAY, whiteSpace: 'nowrap' }}>{fmtFecha(v.fecha)}</td>
                    <td style={{ padding: '10px 14px', color: TEXT }}>{v.comprador_nombre || 'Mostrador'}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: GREEN, fontFamily: 'monospace' }}>{fmt(v.total)}</td>
                    <td style={{ padding: '10px 14px' }}><BadgeEstado estado={v.estado} anulada={v.anulada} /></td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => handleVerVenta(v)} style={{ backgroundColor: '#EBF4FF', color: BLUE, border: 'none', borderRadius: '5px', padding: '5px 9px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>👁️ Ver</button>
                        <button onClick={() => handleVerVenta(v)} style={{ backgroundColor: '#EDF2F7', color: GRAY, border: 'none', borderRadius: '5px', padding: '5px 9px', fontSize: '12px', cursor: 'pointer' }}>🖨️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Paginación ──────────────────────────────────────── */}
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
          MODAL NUEVA VENTA
      ═══════════════════════════════════════════════════════ */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '16px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '920px', boxShadow: '0 24px 72px rgba(0,0,0,0.35)', margin: 'auto' }}>

            {/* Header modal */}
            <div style={{ padding: '18px 28px', borderBottom: `2px solid ${SEP}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: NAVY, margin: 0 }}>
                {comprobante ? '✅ Comprobante de venta' : '＋ Nueva Venta'}
              </h2>
              <button onClick={cerrarModal} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: GRAY, lineHeight: 1, padding: '2px 6px' }}>×</button>
            </div>

            {comprobante ? (
              <PantallaComprobante
                comp={comprobante}
                onNuevaVenta={() => { resetModal(); setTimeout(() => itemInputRef.current?.focus(), 120); }}
                onCerrar={cerrarModal}
              />
            ) : (
              <div style={{ padding: '24px 28px' }}>

                {/* ── TOOLBAR SUPERIOR: IVA + RESUMEN ─────── */}
                <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setAgregarIva(v => !v)}
                    style={{ ...btnStyle(agregarIva ? BLUE : '#EDF2F7', agregarIva ? '#fff' : GRAY), fontSize: '12px', padding: '7px 14px', border: `1.5px solid ${agregarIva ? BLUE : '#CBD5E0'}` }}>
                    🏷️ {agregarIva ? 'IVA: ON' : 'IVA: OFF'}
                  </button>
                  <span style={{ fontSize: '12px', color: GRAY, flex: 1 }}>
                    {agregarIva ? 'Se suma IVA (por alícuota de cada producto) sobre el precio' : 'Se usa el precio tal cual — sin IVA adicional'}
                  </span>
                  <button
                    onClick={() => setShowResumen(true)}
                    style={{ ...btnStyle(NAVY), fontSize: '12px', padding: '7px 14px' }}>
                    📋 Ver resumen
                  </button>
                </div>

                {/* ── SECCIÓN CLIENTE ──────────────────────── */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: `2px solid ${SEP}`, paddingBottom: '6px', marginBottom: '12px' }}>
                    👤 Cliente
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                    {(['mostrador', 'cuenta'] as const).map(t => (
                      <button key={t} onClick={() => { setTipoCliente(t); setClienteSel(null); setBusqCliente(''); setClientesDrop([]); setCcClienteId(null); setEnCC(false); }}
                        style={{ ...btnStyle(tipoCliente === t ? BLUE : '#EDF2F7', tipoCliente === t ? '#fff' : GRAY), fontSize: '12px', padding: '7px 14px' }}>
                        {t === 'mostrador' ? '🏪 Mostrador' : '👥 Con cuenta'}
                      </button>
                    ))}
                  </div>

                  {tipoCliente === 'mostrador' ? (
                    <input value={nomMostrador} onChange={e => setNomMostrador(e.target.value)}
                      placeholder="Nombre del cliente (opcional)" style={{ ...inputStyle, maxWidth: '360px' }} />
                  ) : (
                    <div style={{ position: 'relative', maxWidth: '360px' }}>
                      <input value={busqCliente}
                        onChange={e => { setBusqCliente(e.target.value); setClienteSel(null); }}
                        placeholder="Buscar por nombre o CUIT..." style={inputStyle} />
                      {clienteSel && (
                        <div style={{ marginTop: '5px', fontSize: '13px', color: GREEN, fontWeight: 600 }}>
                          ✓ {clienteSel.comprador_nombre}{clienteSel.comprador_cuit ? ` — ${clienteSel.comprador_cuit}` : ''}
                          <button onClick={() => { setClienteSel(null); setBusqCliente(''); setCcClienteId(null); setEnCC(false); }}
                            style={{ marginLeft: '8px', background: 'none', border: 'none', color: GRAY, cursor: 'pointer', fontSize: '12px' }}>×</button>
                        </div>
                      )}
                      {clientesDrop.length > 0 && !clienteSel && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1.5px solid #CBD5E0', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 20, marginTop: '2px' }}>
                          {clientesDrop.map(cl => (
                            <div key={cl.id}
                              onClick={() => { setClienteSel(cl); setBusqCliente(cl.comprador_nombre); setClientesDrop([]); setEnCC(false); setCcClienteId(null); fetchCuentaCorrienteId(cl.id); }}
                              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #F7FAFC', fontSize: '13px' }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#EBF8FF'; }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}>
                              <span style={{ fontWeight: 600, color: TEXT }}>{cl.comprador_nombre}</span>
                              {cl.comprador_cuit && <span style={{ color: GRAY, marginLeft: '8px', fontSize: '11px' }}>{cl.comprador_cuit}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── SECCIÓN ITEMS ────────────────────────── */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: `2px solid ${SEP}`, paddingBottom: '6px', marginBottom: '12px' }}>
                    📦 Productos
                  </div>

                  {/* Selector lista de precios */}
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                    {(['pv1','pv2','pv3'] as const).map(lp => (
                      <button key={lp} onClick={() => setListaPrecio(lp)}
                        style={{ padding: '4px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                          backgroundColor: listaPrecio === lp ? '#2B6CB0' : '#E2E8F0',
                          color:           listaPrecio === lp ? '#fff'    : '#4A5568' }}>
                        {lp === 'pv1' ? 'PV1' : lp === 'pv2' ? 'PV2' : 'PV3'}
                      </button>
                    ))}
                  </div>

                  {/* Buscador */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        ref={itemInputRef}
                        value={busqProd}
                        onChange={e => setBusqProd(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && prodsDrop.length > 0) agregarProducto(prodsDrop[0]);
                          if (e.key === 'Escape') { setShowDrop(false); setBusqProd(''); }
                        }}
                        placeholder="🔍 Nombre, código o EAN — Enter para agregar el primero"
                        style={inputStyle}
                      />
                      {loadProd && (
                        <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: GRAY, fontSize: '12px' }}>⏳</span>
                      )}

                      {showDrop && prodsDrop.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1.5px solid #CBD5E0', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 20, marginTop: '2px', maxHeight: '340px', overflowY: 'auto' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px 60px', padding: '6px 12px', fontSize: '10px', fontWeight: 700, color: GRAY, borderBottom: '1px solid #EDF2F7', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            <span>Código</span><span>Descripción</span><span>Precio</span><span>Stock</span>
                          </div>
                          {prodsDrop.slice(0, 8).map(p => (
                            <div key={p.id}
                              onClick={() => agregarProducto(p)}
                              style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px 60px', padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #F7FAFC', fontSize: '13px', alignItems: 'center' }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#EBF8FF'; }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}>
                              <span style={{ fontFamily: 'monospace', color: GRAY, fontSize: '11px' }}>{p.codigo || '—'}</span>
                              <span style={{ fontWeight: 500, color: TEXT }}>{p.descripcion}</span>
                              <span style={{ fontWeight: 700, color: GREEN }}>{fmt(
                                listaPrecio === 'pv1'
                                  ? (parseFloat(String(p.precio_venta_1)) || parseFloat(String(p.precio_venta_final)) || parseFloat(String(p.precio_costo)) || 0)
                                  : listaPrecio === 'pv2'
                                  ? (parseFloat(String(p.precio_venta_2)) || parseFloat(String(p.precio_venta_1)) || parseFloat(String(p.precio_venta_final)) || parseFloat(String(p.precio_costo)) || 0)
                                  : (parseFloat(String(p.precio_venta_3)) || parseFloat(String(p.precio_venta_2)) || parseFloat(String(p.precio_venta_1)) || parseFloat(String(p.precio_venta_final)) || parseFloat(String(p.precio_costo)) || 0)
                              )}</span>
                              <span style={{ fontWeight: 700, color: (p.stock_actual || 0) <= 0 ? RED : TEXT }}>
                                {p.stock_actual ?? 0}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => setModalLibre(true)} style={btnStyle('#EDF2F7', GRAY)}>＋ Libre</button>
                  </div>

                  {/* Tabla de items */}
                  {items.length > 0 ? (
                    <div style={{ border: '1px solid #EDF2F7', borderRadius: '10px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#F7FAFC' }}>
                            {['#', 'Descripción', 'Cant', 'Precio', 'Dto%', 'IVA%', 'Subtotal', '×'].map((h, i) => (
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
                                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: GREEN, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                  {fmt(sub)}
                                </td>
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
                      Buscá un producto arriba o usá "＋ Libre" para agregar ítems
                    </div>
                  )}
                </div>

                {/* ── TOTALES + OPCIONES ───────────────────── */}
                {items.length > 0 && (
                  <div style={{ backgroundColor: '#F7FAFC', borderRadius: '10px', padding: '18px 20px', marginBottom: '20px', border: '1px solid #EDF2F7' }}>
                    <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'flex-start' }}>

                      {/* Columna totales */}
                      <div style={{ flex: '1 1 220px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
                          <span style={{ color: GRAY }}>Subtotal:</span>
                          <span style={{ fontWeight: 600, color: TEXT }}>{fmt(sumaSubtotales)}</span>
                        </div>
                        {descGlobal > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px', color: RED }}>
                            <span>Descuento ({descGlobal}%):</span><span>-{fmt(descuentoMonto)}</span>
                          </div>
                        )}
                        {recargo > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px', color: ORANGE }}>
                            <span>Recargo ({recargo}%):</span><span>+{fmt(recargoMonto)}</span>
                          </div>
                        )}
                        {agregarIva && Object.entries(ivaByAlic).sort(([a],[b]) => Number(a) - Number(b)).map(([alic, monto]) => (
                          <div key={alic} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px', color: GRAY }}>
                            <span>IVA {alic}%:</span><span>{fmt(monto)}</span>
                          </div>
                        ))}
                        <div style={{ borderTop: `2px solid ${SEP}`, marginTop: '10px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '15px', fontWeight: 700, color: NAVY }}>{agregarIva ? 'TOTAL (c/IVA):' : 'TOTAL:'}</span>
                          <span style={{ fontSize: '24px', fontWeight: 800, color: GREEN }}>{fmt(total)}</span>
                        </div>
                      </div>

                      {/* Columna opciones */}
                      <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <div>
                            <label style={labelStyle}>Descuento %</label>
                            <input type="number" value={descGlobal} min="0" max="100" step="0.5"
                              onChange={e => setDescGlobal(parseFloat(e.target.value) || 0)}
                              style={{ ...inputStyle, width: '90px' }} />
                          </div>
                          <div>
                            <label style={labelStyle}>Recargo %</label>
                            <input type="number" value={recargo} min="0" max="100" step="0.5"
                              onChange={e => setRecargo(parseFloat(e.target.value) || 0)}
                              style={{ ...inputStyle, width: '90px' }} />
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            if (!enCC) {
                              if (tipoCliente !== 'cuenta' || !clienteSel) {
                                setErrVenta('Seleccioná un cliente con cuenta corriente para activar esta opción.');
                                return;
                              }
                              if (cargandoCC) return;
                              if (!ccClienteId) {
                                setErrVenta('Este cliente no tiene cuenta corriente abierta.');
                                return;
                              }
                            }
                            setErrVenta('');
                            setEnCC(v => !v);
                          }}
                          style={{ ...btnStyle(enCC ? BLUE : '#EDF2F7', enCC ? '#fff' : GRAY), fontSize: '12px', padding: '7px 14px', width: 'fit-content' }}>
                          {cargandoCC ? '⏳ Verificando CC...' : enCC ? '💳 Cuenta corriente: ON' : '💳 Cuenta corriente: OFF'}
                        </button>
                        <div>
                          <label style={labelStyle}>Observaciones</label>
                          <textarea value={observ} onChange={e => setObserv(e.target.value)}
                            placeholder="Notas internas..." rows={2}
                            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', height: '56px' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── FORMA DE PAGO + VUELTO ───────────────── */}
                <div style={{ backgroundColor: '#F7FAFC', borderRadius: '10px', padding: '16px 20px', marginBottom: '20px', border: '1px solid #EDF2F7' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                    💳 Cobro
                  </div>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ flex: '1 1 180px' }}>
                      <label style={labelStyle}>Forma de pago</label>
                      <select value={formaPago} onChange={e => { setFormaPago(e.target.value); setMontoRecibido(0); }}
                        style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value="efectivo">💵 Efectivo</option>
                        <option value="transferencia">🏦 Transferencia</option>
                        <option value="tarjeta_debito">💳 Débito</option>
                        <option value="tarjeta_credito">💳 Crédito</option>
                        <option value="cheque">📝 Cheque</option>
                        <option value="cuenta_corriente">📒 Cuenta Corriente</option>
                        <option value="otro">📌 Otro</option>
                      </select>
                    </div>

                    {formaPago === 'efectivo' && (
                      <>
                        <div style={{ flex: '0 0 140px' }}>
                          <label style={labelStyle}>Monto recibido $</label>
                          <input
                            type="number"
                            value={montoRecibido || ''}
                            onChange={e => setMontoRecibido(parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            min="0"
                            step="0.01"
                            style={inputStyle}
                          />
                        </div>
                        {montoRecibido > 0 && (
                          <div style={{ flex: '0 0 140px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                            <label style={labelStyle}>{vueltoRT >= 0 ? 'Vuelto' : 'Falta'}</label>
                            <div style={{
                              ...inputStyle,
                              backgroundColor: vueltoRT >= 0 ? '#F0FFF4' : '#FFF5F5',
                              color: vueltoRT >= 0 ? GREEN : RED,
                              fontWeight: 700, fontSize: '16px',
                              border: `1.5px solid ${vueltoRT >= 0 ? '#9AE6B4' : '#FEB2B2'}`,
                            }}>
                              {vueltoRT >= 0 ? fmt(vueltoRT) : fmt(Math.abs(vueltoRT))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* ── RESUMEN VISUAL PAGO ──────────────────── */}
                {items.length > 0 && (
                  <div style={{ backgroundColor: NAVY, borderRadius: '10px', padding: '14px 18px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ color: '#fff' }}>
                      <div style={{ fontSize: '11px', opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '2px' }}>Total a cobrar</div>
                      <div style={{ fontSize: '26px', fontWeight: 900, color: '#68D391', fontFamily: 'monospace' }}>{fmt(total)}</div>
                      {agregarIva && ivaTotal > 0 && (
                        <div style={{ fontSize: '11px', opacity: 0.75, marginTop: '2px' }}>Incluye IVA: {fmt(ivaTotal)}</div>
                      )}
                    </div>
                    <div style={{ color: '#fff', textAlign: 'right' }}>
                      <div style={{ fontSize: '11px', opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '2px' }}>Método</div>
                      <div style={{ fontSize: '14px', fontWeight: 700 }}>{PAGO_LABELS[formaPago] || formaPago}</div>
                      {formaPago === 'efectivo' && montoRecibido > 0 && (
                        <div style={{ fontSize: '13px', marginTop: '4px', color: vueltoRT >= 0 ? '#68D391' : '#FC8181', fontWeight: 700 }}>
                          {vueltoRT >= 0 ? `Vuelto: ${fmt(vueltoRT)}` : `Falta: ${fmt(Math.abs(vueltoRT))}`}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Error */}
                {errVenta && (
                  <div style={{ backgroundColor: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: RED, marginBottom: '16px' }}>
                    {errVenta}
                  </div>
                )}

                {/* Botones */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button onClick={cerrarModal} style={btnStyle('#EDF2F7', GRAY)}>Cancelar</button>
                  <button onClick={confirmarVenta}
                    disabled={confirmDisabled}
                    style={btnStyle(GREEN, '#fff', confirmDisabled)}>
                    {procesando ? '⏳ Procesando...' : '✅ Confirmar venta'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Producto libre modal */}
      {modalLibre && (
        <ModalProductoLibre onAgregar={agregarLibre} onCerrar={() => setModalLibre(false)} />
      )}

      {/* Panel resumen lateral */}
      {showResumen && (
        <PanelResumen
          items={items}
          sumaSubtotales={sumaSubtotales}
          descuentoMonto={descuentoMonto}
          recargoMonto={recargoMonto}
          ivaByAlic={ivaByAlic}
          ivaTotal={ivaTotal}
          total={total}
          descGlobal={descGlobal}
          recargo={recargo}
          agregarIva={agregarIva}
          formaPago={formaPago}
          montoRecibido={montoRecibido}
          vueltoRT={vueltoRT}
          onClose={() => setShowResumen(false)}
        />
      )}

      {/* ── Modal detalle de venta ───────────────────────────── */}
      {modalDetalle && ventaDetalle && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '680px', boxShadow: '0 24px 72px rgba(0,0,0,0.35)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div style={{ padding: '16px 24px', borderBottom: `2px solid ${SEP}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: NAVY }}>{ventaDetalle.venta.numero_completo}</div>
                <div style={{ fontSize: '12px', color: GRAY, marginTop: '2px' }}>
                  {fmtFecha(ventaDetalle.venta.fecha)} &nbsp;·&nbsp; {ventaDetalle.venta.comprador_nombre || 'Mostrador'}
                </div>
              </div>
              <button onClick={() => setModalDetalle(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: GRAY, lineHeight: 1, padding: '2px 6px' }}>×</button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#EBF4FF' }}>
                    {['Cant', 'Descripción', 'P. Unit', 'Dto%', 'Subtotal'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: NAVY, borderBottom: `2px solid ${SEP}`, fontSize: '11px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ventaDetalle.items.map((it: any, idx: number) => (
                    <tr key={it.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                      <td style={{ padding: '8px 10px', color: GRAY }}>{it.cantidad}</td>
                      <td style={{ padding: '8px 10px', color: TEXT }}>{it.descripcion_libre || it.producto_descripcion || '—'}</td>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: TEXT }}>{fmt(it.precio_unitario)}</td>
                      <td style={{ padding: '8px 10px', color: GRAY }}>{it.descuento_porcentaje > 0 ? `${it.descuento_porcentaje}%` : '—'}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: GREEN, fontFamily: 'monospace' }}>{fmt(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop: '16px', borderTop: `2px solid ${SEP}`, paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '300px', marginLeft: 'auto' }}>
                {ventaDetalle.venta.iva_monto > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: GRAY }}>
                    <span>IVA:</span><span>{fmt(ventaDetalle.venta.iva_monto)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '17px', fontWeight: 800, color: NAVY }}>
                  <span>TOTAL:</span><span style={{ color: GREEN }}>{fmt(ventaDetalle.venta.total)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: GRAY }}>
                  <span>Forma de pago:</span>
                  <span style={{ fontWeight: 600 }}>{ventaDetalle.venta.forma_pago || '—'}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: `1px solid #EDF2F7`, display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0 }}>
              <button onClick={() => setModalDetalle(false)} style={btnStyle('#EDF2F7', GRAY)}>Cerrar</button>
              <button onClick={imprimirDetalle} style={btnStyle(NAVY)}>🖨️ Imprimir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RobertoVentas;
