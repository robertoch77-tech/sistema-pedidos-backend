import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../../config/api';

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

// ─── AUTH ────────────────────────────────────────────────────
function getToken(): string {
  try { const s = localStorage.getItem('superadmin_session'); return s ? JSON.parse(s).token : ''; } catch { return ''; }
}
function getClienteId(): number | null {
  try { const s = localStorage.getItem('roberto_portal_session'); return s ? JSON.parse(s).cliente?.id ?? null : null; } catch { return null; }
}

// ─── HELPERS ─────────────────────────────────────────────────
function fmt(n: number | string) { return `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtFecha(f: string) { if (!f) return '—'; return new Date(f).toLocaleDateString('es-AR'); }
function hdr() { return { 'x-superadmin-token': getToken(), 'Content-Type': 'application/json' }; }

// ─── TIPOS ───────────────────────────────────────────────────
type TabCC = 'clientes' | 'proveedores';

interface EntidadCC {
  id: number;
  nombre: string;
  cuit: string;
  saldo_actual: number;
  saldo_vencido: number;
  ultimo_movimiento?: string;
  proximo_vencimiento?: string;
  limite_credito?: number;
  bloqueado?: boolean;
  whatsapp?: string;
  comprador_whatsapp?: string;
  moneda?: string;
}

interface Movimiento {
  id: number;
  fecha: string;
  tipo: string;
  descripcion: string;
  numero_comprobante: string;
  debe: number;
  haber: number;
  saldo: number;
  fecha_vencimiento?: string;
  estado?: string;
  medio_pago?: string;
}

interface MedioPago {
  tipo: string;
  monto: number;
  referencia: string;
  cheque_datos?: {
    numero: string;
    banco: string;
    titular: string;
    cuit_titular: string;
    fecha_cobro: string;
  };
}

const TIPO_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  venta:        { label: 'Venta',   color: '#fff', bg: RED    },
  cobro:        { label: 'Cobro',   color: '#fff', bg: GREEN  },
  pago:         { label: 'Pago',    color: '#fff', bg: GREEN  },
  nota_credito: { label: 'NC',      color: '#fff', bg: BLUE   },
  nota_debito:  { label: 'ND',      color: '#fff', bg: ORANGE },
  compra:       { label: 'Compra',  color: '#fff', bg: NAVY   },
  ajuste:       { label: 'Ajuste',  color: TEXT,   bg: '#EDF2F7' },
};

function TipoBadge({ tipo }: { tipo: string }) {
  const b = TIPO_BADGE[tipo] ?? { label: tipo, color: '#fff', bg: GRAY };
  return <span style={{ fontSize: '11px', fontWeight: 600, color: b.color, backgroundColor: b.bg, borderRadius: '10px', padding: '2px 8px', whiteSpace: 'nowrap' }}>{b.label}</span>;
}

const MEDIOS = [
  { id: 'efectivo',       label: 'Efectivo' },
  { id: 'transferencia',  label: 'Transferencia' },
  { id: 'cheque_propio',  label: 'Cheque propio' },
  { id: 'cheque_tercero', label: 'Cheque tercero' },
  { id: 'echeq',          label: 'eCheq' },
  { id: 'otro',           label: 'Otro' },
];

// ─── MODAL NC / ND ───────────────────────────────────────────
function ModalNota({ tipo, cid, cuentaId, onClose, onOk }: {
  tipo: 'nc' | 'nd'; cid: number; cuentaId: number; onClose: () => void; onOk: (saldo: number) => void;
}) {
  const [monto, setMonto]   = useState('');
  const [desc, setDesc]     = useState('');
  const [nroCmp, setNroCmp] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const guardar = async () => {
    if (!monto || isNaN(Number(monto)) || Number(monto) <= 0) { setError('Ingresá un monto válido'); return; }
    setSaving(true);
    try {
      const endpoint = tipo === 'nc' ? 'nota-credito' : 'nota-debito';
      const r = await fetch(`${API_BASE}/api/superadmin/cuenta-corriente/clientes/${cid}/${endpoint}`, {
        method: 'POST', headers: hdr(),
        body: JSON.stringify({ cuenta_corriente_id: cuentaId, monto: Number(monto), descripcion: desc, numero_comprobante: nroCmp }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Error al guardar'); return; }
      onOk(d.saldo_nuevo);
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '28px', width: '420px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700, color: NAVY }}>
          {tipo === 'nc' ? '📄 Nota de Crédito' : '📋 Nota de Débito'}
        </h3>
        {error && <div style={{ backgroundColor: '#FFF5F5', color: RED, padding: '10px 14px', borderRadius: '7px', fontSize: '13px', marginBottom: '14px' }}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Monto *</label>
            <input type="number" value={monto} onChange={e => setMonto(e.target.value)} min="0" step="0.01"
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '14px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Descripción</label>
            <input value={desc} onChange={e => setDesc(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Nro. comprobante</label>
            <input value={nroCmp} onChange={e => setNroCmp(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #CBD5E0', borderRadius: '7px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>Cancelar</button>
          <button onClick={guardar} disabled={saving}
            style={{ padding: '9px 18px', border: 'none', borderRadius: '7px', cursor: saving ? 'default' : 'pointer', fontSize: '13px', fontWeight: 600, color: '#fff',
              backgroundColor: tipo === 'nc' ? BLUE : ORANGE, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Guardando...' : `Registrar ${tipo.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL COBRO / PAGO ──────────────────────────────────────
function ModalCobro({ cid, entidad, tipoCobro, onClose, onOk }: {
  cid: number; entidad: EntidadCC; tipoCobro: 'cobro' | 'pago'; onClose: () => void; onOk: (resultado: any) => void;
}) {
  const [fecha, setFecha]             = useState(new Date().toISOString().slice(0, 10));
  const [observaciones, setObs]       = useState('');
  const [medios, setMedios]           = useState<MedioPago[]>([{ tipo: 'efectivo', monto: 0, referencia: '' }]);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [comprobante, setComprobante] = useState<any>(null);

  const totalMedios = medios.reduce((s, m) => s + Number(m.monto || 0), 0);
  const saldoActual = Math.abs(entidad.saldo_actual);

  const agregarMedio = () => setMedios(prev => [...prev, { tipo: 'efectivo', monto: 0, referencia: '' }]);
  const quitarMedio  = (i: number) => setMedios(prev => prev.filter((_, idx) => idx !== i));

  const actualizarMedio = (i: number, campo: string, valor: any) =>
    setMedios(prev => prev.map((m, idx) => idx === i ? { ...m, [campo]: valor } : m));

  const actualizarCheque = (i: number, campo: string, valor: string) =>
    setMedios(prev => prev.map((m, idx) => idx === i
      ? { ...m, cheque_datos: { ...(m.cheque_datos ?? { numero: '', banco: '', titular: '', cuit_titular: '', fecha_cobro: '' }), [campo]: valor } }
      : m
    ));

  const esChequeTipo = (tipo: string) => ['cheque_propio', 'cheque_tercero', 'echeq'].includes(tipo);

  const guardar = async () => {
    setError('');
    if (totalMedios <= 0) { setError('Ingresá al menos un medio de pago con monto'); return; }
    const diff = Math.abs(totalMedios - saldoActual);
    if (diff > 0.01 && totalMedios <= 0) { setError(`Total medios $${totalMedios.toFixed(2)} debe ser mayor a 0`); return; }

    setSaving(true);
    try {
      const endpoint = tipoCobro === 'cobro'
        ? `${API_BASE}/api/superadmin/cuenta-corriente/clientes/${cid}/cobro`
        : `${API_BASE}/api/superadmin/cuenta-corriente/proveedores/${cid}/pago`;

      const body = tipoCobro === 'cobro'
        ? { cuenta_corriente_id: entidad.id, monto_total: totalMedios, fecha, medios_pago: medios, observaciones }
        : { proveedor_id: entidad.id, monto_total: totalMedios, fecha, medios_pago: medios, observaciones };

      const r = await fetch(endpoint, { method: 'POST', headers: hdr(), body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Error al registrar'); return; }
      setComprobante(d);
    } finally { setSaving(false); }
  };

  const generarPDF = (comp: any) => {
    const w = window.open('', '_blank');
    if (!w) return;
    const esCtrl = tipoCobro === 'cobro';
    w.document.write(`<!DOCTYPE html><html><head><title>${comp.numero_completo}</title><style>
      body{font-family:Arial,sans-serif;padding:32px;color:#2D3748}
      h1{color:#1B2A4A;font-size:20px;margin:0 0 4px}
      .sub{color:#718096;font-size:13px;margin:0 0 24px}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      th{background:#F7FAFC;padding:10px;text-align:left;font-size:12px;color:#718096;border-bottom:1px solid #EDF2F7}
      td{padding:10px;border-bottom:1px solid #EDF2F7;font-size:13px}
      .saldo{font-size:22px;font-weight:700;color:${esCtrl ? GREEN : BLUE};margin-top:16px}
    </style></head><body>
      <h1>${esCtrl ? 'COMPROBANTE DE COBRO' : 'CARTA DE PAGO'}</h1>
      <p class="sub">Nro: ${comp.numero_completo} — Fecha: ${new Date().toLocaleDateString('es-AR')}</p>
      <p><strong>${esCtrl ? 'Cliente' : 'Proveedor'}:</strong> ${entidad.nombre}</p>
      <p><strong>CUIT:</strong> ${entidad.cuit || '—'}</p>
      <table><tr><th>Medio de pago</th><th>Monto</th></tr>
        ${medios.map(m => `<tr><td>${MEDIOS.find(x => x.id === m.tipo)?.label ?? m.tipo}</td><td>$${Number(m.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td></tr>`).join('')}
      </table>
      <div class="saldo">Total: $${totalMedios.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
      <p style="margin-top:24px;font-size:13px;color:#718096">Saldo nuevo: $${Number(comp.saldo_nuevo || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
      <script>window.print()</script></body></html>`);
    w.document.close();
  };

  const enviarWhatsApp = (comp: any) => {
    const wa = entidad.comprador_whatsapp ?? entidad.whatsapp ?? '';
    if (!wa) { alert('El cliente/proveedor no tiene WhatsApp registrado'); return; }
    const num = wa.replace(/\D/g, '');
    const txt = encodeURIComponent(
      `${tipoCobro === 'cobro' ? 'Comprobante de cobro' : 'Carta de pago'} ${comp.numero_completo}\n` +
      `Monto: $${totalMedios.toLocaleString('es-AR', { minimumFractionDigits: 2 })}\n` +
      `Saldo nuevo: $${Number(comp.saldo_nuevo || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
    );
    window.open(`https://wa.me/${num}?text=${txt}`, '_blank');
  };

  // ── Pantalla comprobante ──
  if (comprobante) {
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '32px', width: '460px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
          <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 700, color: NAVY }}>
            {tipoCobro === 'cobro' ? '¡Cobro registrado!' : '¡Pago registrado!'}
          </h3>
          <p style={{ margin: '0 0 4px', fontSize: '13px', color: GRAY }}>{comprobante.numero_completo}</p>
          <p style={{ margin: '0 0 24px', fontSize: '22px', fontWeight: 700, color: GREEN }}>{fmt(totalMedios)}</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => generarPDF(comprobante)}
              style={{ padding: '10px 20px', backgroundColor: BLUE, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
              🖨️ Imprimir PDF
            </button>
            <button onClick={() => enviarWhatsApp(comprobante)}
              style={{ padding: '10px 20px', backgroundColor: GREEN, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
              💬 WhatsApp
            </button>
            <button onClick={() => onOk(comprobante)}
              style={{ padding: '10px 20px', border: '1px solid #CBD5E0', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: GRAY, background: '#fff' }}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '28px', width: '560px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 700, color: NAVY }}>
          {tipoCobro === 'cobro' ? '💵 Registrar cobro' : '💳 Registrar pago'}
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: '13px', color: GRAY }}>{entidad.nombre}</p>

        {/* Saldo actual */}
        <div style={{ backgroundColor: '#F7FAFC', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '13px', color: GRAY }}>Saldo actual</span>
          <span style={{ fontSize: '16px', fontWeight: 700, color: RED }}>{fmt(entidad.saldo_actual)}</span>
        </div>

        {error && <div style={{ backgroundColor: '#FFF5F5', color: RED, padding: '10px 14px', borderRadius: '7px', fontSize: '13px', marginBottom: '14px' }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Observaciones</label>
            <input value={observaciones} onChange={e => setObs(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
        </div>

        {/* Medios de pago */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <label style={{ fontSize: '13px', fontWeight: 700, color: NAVY }}>Medios de pago</label>
            <button onClick={agregarMedio}
              style={{ padding: '4px 12px', border: `1px solid ${BLUE}`, borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: BLUE, background: 'transparent', fontWeight: 600 }}>
              + Agregar
            </button>
          </div>

          {medios.map((m, i) => (
            <div key={i} style={{ border: '1px solid #EDF2F7', borderRadius: '8px', padding: '12px', marginBottom: '8px', backgroundColor: '#FAFAFA' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto', gap: '8px', alignItems: 'center' }}>
                <select value={m.tipo} onChange={e => actualizarMedio(i, 'tipo', e.target.value)}
                  style={{ padding: '7px 10px', border: '1px solid #CBD5E0', borderRadius: '6px', fontSize: '13px', background: '#fff' }}>
                  {MEDIOS.map(md => <option key={md.id} value={md.id}>{md.label}</option>)}
                </select>
                <input type="number" value={m.monto || ''} onChange={e => actualizarMedio(i, 'monto', e.target.value)}
                  placeholder="Monto" min="0" step="0.01"
                  style={{ padding: '7px 10px', border: '1px solid #CBD5E0', borderRadius: '6px', fontSize: '13px' }} />
                {medios.length > 1 && (
                  <button onClick={() => quitarMedio(i)}
                    style={{ padding: '6px 10px', border: '1px solid #EDF2F7', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: RED, background: '#fff' }}>
                    ✕
                  </button>
                )}
              </div>
              {/* Referencia */}
              {(m.tipo === 'transferencia' || m.tipo === 'otro') && (
                <input value={m.referencia} onChange={e => actualizarMedio(i, 'referencia', e.target.value)}
                  placeholder="Referencia / nro. operación"
                  style={{ width: '100%', marginTop: '8px', padding: '7px 10px', border: '1px solid #CBD5E0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
              )}
              {/* Campos cheque */}
              {esChequeTipo(m.tipo) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }}>
                  {[
                    { campo: 'numero',      label: 'Nro. cheque' },
                    { campo: 'banco',       label: 'Banco' },
                    { campo: 'titular',     label: 'Titular' },
                    { campo: 'cuit_titular',label: 'CUIT titular' },
                  ].map(({ campo, label }) => (
                    <div key={campo}>
                      <label style={{ fontSize: '11px', color: GRAY, display: 'block', marginBottom: '3px' }}>{label}</label>
                      <input value={m.cheque_datos?.[campo as keyof typeof m.cheque_datos] ?? ''} onChange={e => actualizarCheque(i, campo, e.target.value)}
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #CBD5E0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                    </div>
                  ))}
                  <div>
                    <label style={{ fontSize: '11px', color: GRAY, display: 'block', marginBottom: '3px' }}>Fecha de cobro</label>
                    <input type="date" value={m.cheque_datos?.fecha_cobro ?? ''} onChange={e => actualizarCheque(i, 'fecha_cobro', e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid #CBD5E0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Total medios vs saldo */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: totalMedios > 0 ? '#F0FFF4' : '#F7FAFC', borderRadius: '7px', border: `1px solid ${totalMedios > 0 ? '#C6F6D5' : '#EDF2F7'}` }}>
            <span style={{ fontSize: '13px', color: GRAY }}>Total imputado</span>
            <span style={{ fontSize: '16px', fontWeight: 700, color: totalMedios > 0 ? GREEN : GRAY }}>{fmt(totalMedios)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', border: '1px solid #CBD5E0', borderRadius: '7px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>Cancelar</button>
          <button onClick={guardar} disabled={saving || totalMedios <= 0}
            style={{ padding: '10px 20px', border: 'none', borderRadius: '7px', cursor: saving || totalMedios <= 0 ? 'default' : 'pointer', fontSize: '13px', fontWeight: 700, color: '#fff',
              backgroundColor: GREEN, opacity: saving || totalMedios <= 0 ? 0.6 : 1 }}>
            {saving ? 'Registrando...' : tipoCobro === 'cobro' ? '✅ Registrar cobro' : '✅ Registrar pago'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PDF ESTADO DE CUENTA ────────────────────────────────────
function generarEstadoCuentaPDF(entidad: EntidadCC, movs: Movimiento[], tipo: TabCC) {
  const w = window.open('', '_blank');
  if (!w) return;
  const filas = movs.map((m, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#F7FAFC'}">
      <td>${fmtFecha(m.fecha)}</td>
      <td>${m.tipo}</td>
      <td>${m.descripcion || '—'}</td>
      <td>${m.numero_comprobante || '—'}</td>
      <td style="color:${RED}">${m.debe > 0 ? fmt(m.debe) : ''}</td>
      <td style="color:${GREEN}">${m.haber > 0 ? fmt(m.haber) : ''}</td>
      <td style="font-weight:700;color:${m.saldo >= 0 ? RED : GREEN}">${fmt(m.saldo)}</td>
    </tr>`).join('');
  w.document.write(`<!DOCTYPE html><html><head><title>Estado de Cuenta</title>
    <style>body{font-family:Arial,sans-serif;padding:32px;color:#2D3748;font-size:13px}
    h1{color:#1B2A4A;font-size:18px;margin:0 0 4px}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th{background:#F7FAFC;padding:8px;text-align:left;font-size:11px;color:#718096;border-bottom:2px solid #63B3ED}
    td{padding:8px;border-bottom:1px solid #EDF2F7}
    </style></head><body>
    <h1>ESTADO DE CUENTA</h1>
    <p><strong>${tipo === 'clientes' ? 'Cliente' : 'Proveedor'}:</strong> ${entidad.nombre} | <strong>CUIT:</strong> ${entidad.cuit || '—'}</p>
    <p><strong>Saldo al cierre:</strong> <span style="font-size:16px;font-weight:700;color:${entidad.saldo_actual > 0 ? RED : GREEN}">${fmt(entidad.saldo_actual)}</span></p>
    <table><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Comprobante</th><th>Debe</th><th>Haber</th><th>Saldo</th></tr>
    ${filas}</table>
    <script>window.print()</script></body></html>`);
  w.document.close();
}

// ─── EXCEL CC ────────────────────────────────────────────────
function exportarExcelCC(entidad: EntidadCC, movs: Movimiento[]) {
  const filas = movs.map(m =>
    [fmtFecha(m.fecha), m.tipo, m.descripcion || '', m.numero_comprobante || '',
     m.debe || 0, m.haber || 0, m.saldo || 0].join('\t')
  ).join('\n');
  const contenido = `Fecha\tTipo\tDescripción\tComprobante\tDebe\tHaber\tSaldo\n${filas}`;
  const blob = new Blob([contenido], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cc_${entidad.nombre.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xls`;
  a.click();
}

// ─── PANTALLA DETALLE CC ─────────────────────────────────────
function PantallaDetalleCCC({
  cid, entidad, tipo, onVolver, onRefresh
}: { cid: number; entidad: EntidadCC; tipo: TabCC; onVolver: () => void; onRefresh: () => void }) {
  const [movs, setMovs]         = useState<Movimiento[]>([]);
  const [saldo, setSaldo]       = useState(entidad.saldo_actual);
  const [saldoVenc, setSaldoVenc] = useState(entidad.saldo_vencido);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [limit] = useState(50);
  const [cargando, setCargando] = useState(true);
  const [desde, setDesde]       = useState('');
  const [hasta, setHasta]       = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [modal, setModal]       = useState<'cobro' | 'nc' | 'nd' | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const base = tipo === 'clientes'
      ? `${API_BASE}/api/superadmin/cuenta-corriente/clientes/${cid}/${entidad.id}/movimientos`
      : `${API_BASE}/api/superadmin/cuenta-corriente/proveedores/${cid}/${entidad.id}/movimientos`;
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (desde)      params.set('fecha_desde', desde);
      if (hasta)      params.set('fecha_hasta', hasta);
      if (tipoFiltro) params.set('tipo', tipoFiltro);
      const r = await fetch(`${base}?${params}`, { headers: { 'x-superadmin-token': getToken() } });
      if (r.ok) {
        const d = await r.json();
        setMovs(d.movimientos ?? []);
        setTotal(d.total ?? 0);
        setSaldo(d.saldo_actual ?? entidad.saldo_actual);
        setSaldoVenc(d.saldo_vencido ?? entidad.saldo_vencido);
      }
    } finally { setCargando(false); }
  }, [cid, entidad.id, tipo, page, limit, desde, hasta, tipoFiltro]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargar(); }, [cargar]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const tituloAccion = tipo === 'clientes' ? 'Cobrar' : 'Pagar';

  // Entidad actualizada con saldo live
  const entidadLive: EntidadCC = { ...entidad, saldo_actual: saldo, saldo_vencido: saldoVenc };

  return (
    <div style={{ padding: '24px', backgroundColor: BG, minHeight: '100vh' }}>
      {modal === 'nc' && (
        <ModalNota tipo="nc" cid={cid} cuentaId={entidad.id}
          onClose={() => setModal(null)}
          onOk={() => { setModal(null); cargar(); onRefresh(); }} />
      )}
      {modal === 'nd' && (
        <ModalNota tipo="nd" cid={cid} cuentaId={entidad.id}
          onClose={() => setModal(null)}
          onOk={() => { setModal(null); cargar(); onRefresh(); }} />
      )}
      {modal === 'cobro' && (
        <ModalCobro cid={cid} entidad={entidadLive} tipoCobro={tipo === 'clientes' ? 'cobro' : 'pago'}
          onClose={() => setModal(null)}
          onOk={() => { setModal(null); cargar(); onRefresh(); }} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '20px' }}>
        <button onClick={onVolver} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: GRAY, paddingTop: '2px' }}>←</button>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: '0 0 2px', fontSize: '18px', fontWeight: 700, color: NAVY }}>{entidad.nombre}</h2>
          {entidad.cuit && <p style={{ margin: 0, fontSize: '12px', color: GRAY }}>CUIT: {entidad.cuit}</p>}
        </div>

        {/* Saldo grande */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '11px', color: GRAY, fontWeight: 500, marginBottom: '2px' }}>SALDO ACTUAL</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: saldo > 0 ? RED : saldo < 0 ? GREEN : GRAY }}>{fmt(saldo)}</div>
          {saldoVenc > 0 && (
            <div style={{ fontSize: '12px', color: RED, fontWeight: 600 }}>Vencido: {fmt(saldoVenc)}</div>
          )}
        </div>
      </div>

      {/* Botones acción */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button onClick={() => setModal('cobro')}
          style={{ padding: '9px 18px', backgroundColor: GREEN, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
          💵 {tituloAccion}
        </button>
        {tipo === 'clientes' && <>
          <button onClick={() => setModal('nc')}
            style={{ padding: '9px 18px', backgroundColor: BLUE, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
            📄 NC
          </button>
          <button onClick={() => setModal('nd')}
            style={{ padding: '9px 18px', backgroundColor: ORANGE, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
            📋 ND
          </button>
        </>}
        <button onClick={() => generarEstadoCuentaPDF(entidadLive, movs, tipo)}
          style={{ padding: '9px 18px', border: `1px solid ${NAVY}`, borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: NAVY, background: '#fff' }}>
          🖨️ PDF
        </button>
        <button onClick={() => exportarExcelCC(entidadLive, movs)}
          style={{ padding: '9px 18px', border: '1px solid #CBD5E0', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: GRAY, background: '#fff' }}>
          📊 Excel
        </button>
      </div>

      {/* Filtros movimientos */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px' }} />
        <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px' }} />
        <select value={tipoFiltro} onChange={e => { setTipoFiltro(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', background: '#fff' }}>
          <option value="">Todos los tipos</option>
          {['venta','cobro','pago','nota_credito','nota_debito','ajuste','compra'].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button onClick={() => { setDesde(''); setHasta(''); setTipoFiltro(''); setPage(1); }}
          style={{ padding: '8px 14px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', background: '#fff', cursor: 'pointer', color: GRAY }}>
          Limpiar
        </button>
      </div>

      {/* Tabla movimientos */}
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        {cargando ? (
          <div style={{ padding: '40px', textAlign: 'center', color: GRAY }}>Cargando movimientos...</div>
        ) : movs.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
            <p style={{ color: GRAY, fontSize: '14px' }}>Sin movimientos registrados</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '750px' }}>
                <thead style={{ backgroundColor: '#F7FAFC', borderBottom: `2px solid ${SEP}` }}>
                  <tr>
                    {['Fecha', 'Tipo', 'Descripción', 'Comprobante', 'Debe', 'Haber', 'Saldo'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: GRAY, fontWeight: 600, fontSize: '11px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movs.map((m, idx) => (
                    <tr key={m.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                      <td style={{ padding: '10px 14px', color: GRAY, whiteSpace: 'nowrap' }}>{fmtFecha(m.fecha)}</td>
                      <td style={{ padding: '10px 14px' }}><TipoBadge tipo={m.tipo} /></td>
                      <td style={{ padding: '10px 14px', color: TEXT, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.descripcion || '—'}</td>
                      <td style={{ padding: '10px 14px', color: GRAY, fontSize: '12px' }}>{m.numero_comprobante || '—'}</td>
                      <td style={{ padding: '10px 14px', color: RED, fontWeight: 600 }}>{m.debe > 0 ? fmt(m.debe) : '—'}</td>
                      <td style={{ padding: '10px 14px', color: GREEN, fontWeight: 600 }}>{m.haber > 0 ? fmt(m.haber) : '—'}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: m.saldo >= 0 ? RED : GREEN }}>{fmt(m.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid #EDF2F7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: GRAY }}>
              <span>Total: {total} movimientos</span>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ padding: '4px 10px', border: '1px solid #CBD5E0', borderRadius: '5px', cursor: page === 1 ? 'default' : 'pointer', background: '#fff', fontSize: '12px', color: GRAY, opacity: page === 1 ? 0.4 : 1 }}>‹</button>
                <span style={{ padding: '4px 8px' }}>{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  style={{ padding: '4px 10px', border: '1px solid #CBD5E0', borderRadius: '5px', cursor: page === totalPages ? 'default' : 'pointer', background: '#fff', fontSize: '12px', color: GRAY, opacity: page === totalPages ? 0.4 : 1 }}>›</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────
function RobertoCuentaCorriente() {
  const navigate = useNavigate();
  const cid = getClienteId();
  const sesionRaw = localStorage.getItem('roberto_portal_session');
  const modulos: Record<string, boolean> = sesionRaw ? (JSON.parse(sesionRaw).modulos ?? {}) : {};
  const tabsDisponibles = [
    { id: 'clientes',    label: '👥 Clientes' },
    ...(modulos.cc_proveedores ? [{ id: 'proveedores', label: '🏢 Proveedores' }] : []),
  ];
  const [tab, setTab]                       = useState<TabCC>('clientes');
  const [cards, setCards]                   = useState<{ icon: string; label: string; valor: string; color: string }[]>([]);
  const [lista, setLista]                   = useState<EntidadCC[]>([]);
  const [total, setTotal]                   = useState(0);
  const [page, setPage]                     = useState(1);
  const [limit, setLimit]                   = useState(25);
  const [buscar, setBuscar]                 = useState('');
  const [buscarDebounce, setBuscarDebounce] = useState('');
  const [soloDeuda, setSoloDeuda]           = useState(false);
  const [cargando, setCargando]             = useState(true);
  const [detalle, setDetalle]               = useState<EntidadCC | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBuscarDebounce(buscar), 300);
    return () => clearTimeout(t);
  }, [buscar]);

  const cargarResumen = useCallback(async () => {
    if (!cid) return;
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/cuenta-corriente/resumen/${cid}`,
        { headers: { 'x-superadmin-token': getToken() } });
      if (!r.ok) return;
      const d = await r.json();
      if (tab === 'clientes') {
        setCards([
          { icon: '💰', label: 'Deuda total clientes',  valor: fmt(d.clientes?.total_deuda ?? 0),        color: RED    },
          { icon: '⚠️', label: 'Deuda vencida',         valor: fmt(d.clientes?.deuda_vencida ?? 0),      color: ORANGE },
          { icon: '👥', label: 'Clientes con deuda',    valor: String(d.clientes?.clientes_con_deuda ?? 0), color: BLUE },
          { icon: '✅', label: 'Cobros del mes',        valor: fmt(d.clientes?.cobros_mes ?? 0),          color: GREEN  },
        ]);
      } else {
        setCards([
          { icon: '💸', label: 'Deuda total proveedores', valor: fmt(d.proveedores?.total_deuda ?? 0),           color: RED    },
          { icon: '⚠️', label: 'Deuda vencida',           valor: fmt(d.proveedores?.deuda_vencida ?? 0),         color: ORANGE },
          { icon: '🏢', label: 'Proveedores con deuda',   valor: String(d.proveedores?.proveedores_con_deuda ?? 0), color: BLUE },
          { icon: '✅', label: 'Pagos del mes',           valor: fmt(d.proveedores?.pagos_mes ?? 0),              color: GREEN  },
        ]);
      }
    } catch { /* degradación elegante */ }
  }, [cid, tab]);

  const cargarLista = useCallback(async () => {
    if (!cid) return;
    setCargando(true);
    const endpoint = tab === 'clientes'
      ? `${API_BASE}/api/superadmin/cuenta-corriente/clientes/${cid}`
      : `${API_BASE}/api/superadmin/cuenta-corriente/proveedores/${cid}`;
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (buscarDebounce) params.set('buscar', buscarDebounce);
      if (soloDeuda) params.set('con_deuda', 'true');
      const r = await fetch(`${endpoint}?${params}`, { headers: { 'x-superadmin-token': getToken() } });
      if (r.ok) {
        const d = await r.json();
        setLista((d.data ?? []).map((e: any) => ({
          id:               e.id,
          nombre:           e.comprador_nombre ?? e.nombre ?? '—',
          cuit:             e.comprador_cuit ?? e.cuit ?? '',
          saldo_actual:     Number(e.saldo_actual ?? 0),
          saldo_vencido:    Number(e.saldo_vencido ?? 0),
          ultimo_movimiento: e.ultimo_movimiento,
          proximo_vencimiento: e.proximo_vencimiento,
          limite_credito:   e.limite_credito,
          bloqueado:        e.bloqueado,
          comprador_whatsapp: e.comprador_whatsapp,
          whatsapp:         e.whatsapp,
          moneda:           e.moneda ?? 'ARS',
        })));
        setTotal(d.total ?? 0);
      }
    } finally { setCargando(false); }
  }, [cid, tab, page, limit, buscarDebounce, soloDeuda]);

  useEffect(() => {
    setDetalle(null);
    setPage(1);
    setBuscar('');
    setSoloDeuda(false);
  }, [tab]);

  useEffect(() => { cargarResumen(); }, [cargarResumen]);
  useEffect(() => { cargarLista(); }, [cargarLista]);

  if (!cid) return <div style={{ padding: '40px', textAlign: 'center', color: GRAY }}>Sin sesión activa.</div>;

  // ── Pantalla detalle ──
  if (detalle) {
    return (
      <PantallaDetalleCCC
        cid={cid} entidad={detalle} tipo={tab}
        onVolver={() => setDetalle(null)}
        onRefresh={cargarLista}
      />
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const enviarEstadoWA = (e: EntidadCC) => {
    const wa = (e.comprador_whatsapp ?? e.whatsapp ?? '').replace(/\D/g, '');
    if (!wa) { alert('Sin WhatsApp registrado'); return; }
    const txt = encodeURIComponent(
      `Hola ${e.nombre}!\nSaldo en cuenta corriente: ${fmt(e.saldo_actual)}${e.saldo_vencido > 0 ? `\nVencido: ${fmt(e.saldo_vencido)}` : ''}`
    );
    window.open(`https://wa.me/${wa}?text=${txt}`, '_blank');
  };

  return (
    <div style={{ padding: '24px', backgroundColor: BG, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: NAVY }}>💳 Cuenta Corriente</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: GRAY }}>Saldos y movimientos de clientes y proveedores</p>
        </div>
        <button onClick={() => navigate('/roberto/dashboard')}
          style={{ padding: '8px 16px', border: '1px solid #CBD5E0', borderRadius: '7px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>
          ← Dashboard
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', backgroundColor: '#fff', borderRadius: '10px', padding: '4px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', width: 'fit-content' }}>
        {tabsDisponibles.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as TabCC)}
            style={{ padding: '8px 20px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: tab === t.id ? 700 : 400,
              backgroundColor: tab === t.id ? NAVY : 'transparent', color: tab === t.id ? '#fff' : GRAY, transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
        {cards.map(c => (
          <div key={c.label} style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${c.color}` }}>
            <div style={{ fontSize: '22px', marginBottom: '6px' }}>{c.icon}</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: c.color }}>{c.valor}</div>
            <div style={{ fontSize: '12px', color: GRAY, marginTop: '2px' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={buscar} onChange={e => { setBuscar(e.target.value); setPage(1); }}
          placeholder={`Buscar ${tab === 'clientes' ? 'cliente' : 'proveedor'}...`}
          style={{ flex: 1, minWidth: '200px', padding: '8px 12px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: TEXT, cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={soloDeuda} onChange={e => { setSoloDeuda(e.target.checked); setPage(1); }} />
          Solo con saldo
        </label>
        <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', background: '#fff' }}>
          {[10, 25, 50].map(l => <option key={l} value={l}>{l} por página</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        {cargando ? (
          <div style={{ padding: '40px', textAlign: 'center', color: GRAY }}>Cargando...</div>
        ) : lista.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>💳</div>
            <p style={{ color: GRAY, fontSize: '14px', margin: '0 0 4px' }}>No se encontraron {tab === 'clientes' ? 'clientes' : 'proveedores'}</p>
            <p style={{ color: GRAY, fontSize: '12px', margin: 0 }}>Ajustá los filtros o registrá uno nuevo</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '700px' }}>
                <thead style={{ backgroundColor: '#F7FAFC', borderBottom: `2px solid ${SEP}` }}>
                  <tr>
                    {['Nombre / CUIT', 'Saldo actual', 'Saldo vencido', 'Próx. vencimiento', 'Último mov.', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: GRAY, fontWeight: 600, fontSize: '11px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lista.map((e, idx) => (
                    <tr key={e.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 600, color: TEXT }}>{e.nombre}</div>
                        {e.cuit && <div style={{ fontSize: '11px', color: GRAY }}>{e.cuit}</div>}
                        {e.bloqueado && <span style={{ fontSize: '10px', color: RED, backgroundColor: '#FFF5F5', borderRadius: '8px', padding: '1px 6px', fontWeight: 700 }}>BLOQUEADO</span>}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: e.saldo_actual > 0 ? RED : e.saldo_actual < 0 ? GREEN : GRAY }}>{fmt(e.saldo_actual)}</td>
                      <td style={{ padding: '10px 14px', color: e.saldo_vencido > 0 ? RED : GRAY, fontWeight: e.saldo_vencido > 0 ? 600 : 400 }}>
                        {e.saldo_vencido > 0 ? fmt(e.saldo_vencido) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: GRAY, fontSize: '12px' }}>{fmtFecha(e.proximo_vencimiento ?? '')}</td>
                      <td style={{ padding: '10px 14px', color: GRAY, fontSize: '12px' }}>{fmtFecha(e.ultimo_movimiento ?? '')}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                          <button onClick={() => setDetalle(e)} title="Ver CC"
                            style={{ padding: '5px 10px', backgroundColor: BLUE, color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                            👁️ CC
                          </button>
                          <button onClick={() => setDetalle(e)} title={tab === 'clientes' ? 'Cobrar' : 'Pagar'}
                            style={{ padding: '5px 10px', backgroundColor: GREEN, color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                            {tab === 'clientes' ? '💵' : '💳'}
                          </button>
                          <button onClick={() => enviarEstadoWA(e)} title="WhatsApp"
                            style={{ padding: '5px 10px', border: '1px solid #CBD5E0', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: GRAY, background: '#fff' }}>
                            💬
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid #EDF2F7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: GRAY }}>
              <span>Total: {total} registros</span>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ padding: '4px 10px', border: '1px solid #CBD5E0', borderRadius: '5px', cursor: page === 1 ? 'default' : 'pointer', background: '#fff', fontSize: '12px', color: GRAY, opacity: page === 1 ? 0.4 : 1 }}>‹</button>
                <span style={{ padding: '4px 8px' }}>{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  style={{ padding: '4px 10px', border: '1px solid #CBD5E0', borderRadius: '5px', cursor: page === totalPages ? 'default' : 'pointer', background: '#fff', fontSize: '12px', color: GRAY, opacity: page === totalPages ? 0.4 : 1 }}>›</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default RobertoCuentaCorriente;
