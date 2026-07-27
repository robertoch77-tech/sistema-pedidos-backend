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
function diasHastaCobro(fechaCobro: string): number {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const cobro = new Date(fechaCobro); cobro.setHours(0, 0, 0, 0);
  return Math.round((cobro.getTime() - hoy.getTime()) / 86400000);
}

// ─── TIPOS ───────────────────────────────────────────────────
interface Cheque {
  id: number; numero: string; banco: string; sucursal_banco?: string;
  cuenta_numero?: string; cbu?: string; titular_nombre: string; titular_cuit?: string;
  monto: number; moneda: string; fecha_emision: string; fecha_cobro: string;
  estado: string; tipo: string; origen: string; es_diferido: boolean;
  fecha_deposito?: string; fecha_cobro_real?: string; fecha_rechazo?: string;
  motivo_rechazo?: string; banco_deposito?: string; cuenta_deposito?: string;
  endosado_a?: string; endosado_a_cuit?: string; fecha_endoso?: string;
  venta_pago_id?: number; observaciones?: string; creado_en: string;
}

interface Resumen {
  en_cartera: { cantidad: number; monto: number };
  a_cobrar_7dias: { cantidad: number; monto: number };
  vencidos: { cantidad: number; monto: number };
  entregados_mes: { cantidad: number; monto: number };
  por_banco: { banco: string; cantidad: number; monto: number }[];
}

// ─── ESTADO BADGE ────────────────────────────────────────────
const ESTADO_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  en_cartera: { label: 'En cartera', color: '#fff', bg: BLUE   },
  depositado: { label: 'Depositado', color: '#fff', bg: SEP    },
  cobrado:    { label: 'Cobrado',    color: '#fff', bg: GREEN  },
  rechazado:  { label: 'Rechazado',  color: '#fff', bg: RED    },
  endosado:   { label: 'Endosado',   color: '#fff', bg: ORANGE },
  entregado:  { label: 'Entregado',  color: '#fff', bg: NAVY   },
};
function EstadoBadge({ estado }: { estado: string }) {
  const b = ESTADO_BADGE[estado] ?? { label: estado, color: '#fff', bg: GRAY };
  return <span style={{ fontSize: '11px', fontWeight: 600, color: b.color, backgroundColor: b.bg, borderRadius: '10px', padding: '2px 8px', whiteSpace: 'nowrap' }}>{b.label}</span>;
}

function TipoBadge({ tipo }: { tipo: string }) {
  const MAP: Record<string, { label: string; color: string }> = {
    tercero: { label: 'Tercero', color: BLUE   },
    propio:  { label: 'Propio',  color: NAVY   },
    echeq:   { label: 'eCheq',   color: ORANGE },
  };
  const c = MAP[tipo] ?? { label: tipo, color: GRAY };
  return <span style={{ fontSize: '11px', fontWeight: 600, color: c.color, border: `1px solid ${c.color}`, borderRadius: '10px', padding: '2px 8px', whiteSpace: 'nowrap' }}>{c.label}</span>;
}

// ─── COLOR FECHA COBRO ────────────────────────────────────────
function ColorFechaCobro({ fechaCobro, estado }: { fechaCobro: string; estado: string }) {
  if (estado !== 'en_cartera') return <span style={{ color: GRAY, fontSize: '13px' }}>{fmtFecha(fechaCobro)}</span>;
  const dias = diasHastaCobro(fechaCobro);
  let color = GREEN;
  if (dias < 0) color = RED;
  else if (dias <= 7) color = ORANGE;
  return (
    <div>
      <div style={{ color, fontSize: '13px', fontWeight: 600 }}>{fmtFecha(fechaCobro)}</div>
      <div style={{ fontSize: '11px', color }}>
        {dias < 0 ? `VENCIDO hace ${Math.abs(dias)}d` : dias === 0 ? 'HOY' : `${dias}d`}
      </div>
    </div>
  );
}

// ─── MODAL INGRESAR CHEQUE ────────────────────────────────────
function ModalIngresarCheque({ cid, onClose, onOk }: { cid: number; onClose: () => void; onOk: () => void }) {
  const [tipo, setTipo]           = useState('tercero');
  const [origen, setOrigen]       = useState('cobro_cliente');
  const [numero, setNumero]       = useState('');
  const [banco, setBanco]         = useState('');
  const [sucursal, setSucursal]   = useState('');
  const [cuenta, setCuenta]       = useState('');
  const [titular, setTitular]     = useState('');
  const [cuit, setCuit]           = useState('');
  const [monto, setMonto]         = useState('');
  const [moneda, setMoneda]       = useState('ARS');
  const [fEmision, setFEmision]   = useState('');
  const [fCobro, setFCobro]       = useState('');
  const [diferido, setDiferido]   = useState(false);
  const [obs, setObs]             = useState('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  const diasCalc = fCobro ? diasHastaCobro(fCobro) : null;

  const guardar = async () => {
    setError('');
    if (!numero.trim()) { setError('El número de cheque es obligatorio'); return; }
    if (!banco.trim()) { setError('El banco es obligatorio'); return; }
    if (!titular.trim()) { setError('El nombre del titular es obligatorio'); return; }
    if (!monto || Number(monto) <= 0) { setError('El monto debe ser mayor a 0'); return; }
    if (!fEmision) { setError('La fecha de emisión es obligatoria'); return; }
    if (!fCobro) { setError('La fecha de cobro es obligatoria'); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/cheques/${cid}`, {
        method: 'POST', headers: hdr(),
        body: JSON.stringify({
          tipo, origen, numero, banco, sucursal_banco: sucursal, cuenta_numero: cuenta,
          titular_nombre: titular, titular_cuit: cuit, monto: Number(monto), moneda,
          fecha_emision: fEmision, fecha_cobro: fCobro, es_diferido: diferido, observaciones: obs,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Error al guardar'); return; }
      onOk();
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '24px 16px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '28px', width: '560px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700, color: NAVY }}>＋ Ingresar cheque</h3>
        {error && <div style={{ backgroundColor: '#FFF5F5', color: RED, padding: '10px 14px', borderRadius: '7px', fontSize: '13px', marginBottom: '14px' }}>{error}</div>}

        {/* Tipo */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: NAVY, display: 'block', marginBottom: '8px' }}>Tipo *</label>
          <div style={{ display: 'flex', gap: '12px' }}>
            {[{ v: 'tercero', label: 'De tercero (recibido de cliente)' }, { v: 'propio', label: 'Propio (emitido por nosotros)' }, { v: 'echeq', label: 'eCheq (electrónico)' }].map(t => (
              <label key={t.v} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: TEXT }}>
                <input type="radio" name="tipo" value={t.v} checked={tipo === t.v} onChange={() => setTipo(t.v)} /> {t.label}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Origen *</label>
            <select value={origen} onChange={e => setOrigen(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', background: '#fff', boxSizing: 'border-box' }}>
              <option value="cobro_cliente">Cobro de cliente</option>
              <option value="pago_proveedor">Pago proveedor</option>
              <option value="endoso_recibido">Endoso recibido</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Número cheque *</label>
            <input value={numero} onChange={e => setNumero(e.target.value)} placeholder="Nro. cheque"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Banco *</label>
            <input value={banco} onChange={e => setBanco(e.target.value)} placeholder="Ej: Galicia"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Sucursal bancaria</label>
            <input value={sucursal} onChange={e => setSucursal(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
        </div>

        <div style={{ borderTop: `1px solid #EDF2F7`, paddingTop: '14px', marginBottom: '14px' }}>
          <p style={{ margin: '0 0 10px', fontSize: '12px', fontWeight: 700, color: NAVY }}>Titular</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Nombre titular *</label>
              <input value={titular} onChange={e => setTitular(e.target.value)} placeholder="Nombre completo"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>CUIT titular</label>
              <input value={cuit} onChange={e => setCuit(e.target.value)} placeholder="20-12345678-9"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
          </div>
        </div>

        <div style={{ borderTop: `1px solid #EDF2F7`, paddingTop: '14px', marginBottom: '14px' }}>
          <p style={{ margin: '0 0 10px', fontSize: '12px', fontWeight: 700, color: NAVY }}>Fechas y monto</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Monto *</label>
              <input type="number" value={monto} onChange={e => setMonto(e.target.value)} min="0" step="0.01" placeholder="0,00"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '15px', fontWeight: 700, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Moneda</label>
              <select value={moneda} onChange={e => setMoneda(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', background: '#fff', boxSizing: 'border-box' }}>
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Fecha emisión *</label>
              <input type="date" value={fEmision} onChange={e => setFEmision(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Fecha de cobro *</label>
              <input type="date" value={fCobro} onChange={e => setFCobro(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '16px' }}>
                <input type="checkbox" checked={diferido} onChange={e => setDiferido(e.target.checked)} />
                Es diferido
              </label>
            </div>
            {diasCalc !== null && (
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: diasCalc < 0 ? RED : diasCalc <= 7 ? ORANGE : GREEN, fontWeight: 600 }}>
                  {diasCalc < 0 ? `Vencido hace ${Math.abs(diasCalc)}d` : diasCalc === 0 ? 'Vence hoy' : `${diasCalc} días`}
                </span>
              </div>
            )}
          </div>
        </div>

        <div style={{ borderTop: `1px solid #EDF2F7`, paddingTop: '14px', marginBottom: '20px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Observaciones</label>
          <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }} />
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', border: '1px solid #CBD5E0', borderRadius: '7px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>Cancelar</button>
          <button onClick={guardar} disabled={saving}
            style={{ padding: '10px 24px', border: 'none', borderRadius: '7px', backgroundColor: GREEN, color: '#fff', fontWeight: 700, fontSize: '14px', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Guardando...' : '✅ Guardar cheque'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL DEPOSITAR ──────────────────────────────────────────
function ModalDepositar({ cheque, cid, onClose, onOk }: { cheque: Cheque; cid: number; onClose: () => void; onOk: () => void }) {
  const [bancoDep, setBancoDep] = useState('');
  const [cuentaDep, setCuentaDep] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const confirmar = async () => {
    setError('');
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/cheques/${cid}/${cheque.id}/estado`, {
        method: 'PUT', headers: hdr(),
        body: JSON.stringify({ estado: 'depositado', fecha_deposito: fecha, banco_deposito: bancoDep, cuenta_deposito: cuentaDep }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Error'); return; }
      onOk();
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '28px', width: '440px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, color: NAVY }}>💰 Depositar cheque</h3>
        <div style={{ backgroundColor: '#F7FAFC', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: TEXT }}>
          <strong>{cheque.titular_nombre}</strong> · {cheque.banco} · {cheque.numero} · <strong style={{ color: BLUE }}>{fmt(cheque.monto)}</strong>
        </div>
        {error && <div style={{ color: RED, fontSize: '13px', marginBottom: '12px' }}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Banco donde depositar</label>
            <input value={bancoDep} onChange={e => setBancoDep(e.target.value)} placeholder="Banco destino"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Número de cuenta destino</label>
            <input value={cuentaDep} onChange={e => setCuentaDep(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Fecha de depósito</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #CBD5E0', borderRadius: '7px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>Cancelar</button>
          <button onClick={confirmar} disabled={saving}
            style={{ padding: '9px 20px', border: 'none', borderRadius: '7px', backgroundColor: GREEN, color: '#fff', fontWeight: 700, fontSize: '13px', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Confirmando...' : '✅ Confirmar depósito'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL ENDOSAR ────────────────────────────────────────────
function ModalEndosar({ cheque, cid, onClose, onOk }: { cheque: Cheque; cid: number; onClose: () => void; onOk: () => void }) {
  const [endosadoA, setEndosadoA] = useState('');
  const [cuitR, setCuitR] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const confirmar = async () => {
    setError('');
    if (!endosadoA.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/cheques/${cid}/${cheque.id}/estado`, {
        method: 'PUT', headers: hdr(),
        body: JSON.stringify({ estado: 'endosado', endosado_a: endosadoA, endosado_a_cuit: cuitR, fecha_endoso: fecha }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Error'); return; }
      onOk();
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '28px', width: '440px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, color: NAVY }}>🔄 Endosar cheque</h3>
        <div style={{ backgroundColor: '#F7FAFC', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: TEXT }}>
          <strong>{cheque.titular_nombre}</strong> · {cheque.banco} · {cheque.numero} · <strong style={{ color: BLUE }}>{fmt(cheque.monto)}</strong>
        </div>
        {error && <div style={{ color: RED, fontSize: '13px', marginBottom: '12px' }}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Endosado a *</label>
            <input value={endosadoA} onChange={e => setEndosadoA(e.target.value)} placeholder="Nombre completo"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>CUIT del receptor</label>
            <input value={cuitR} onChange={e => setCuitR(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Fecha de endoso</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #CBD5E0', borderRadius: '7px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>Cancelar</button>
          <button onClick={confirmar} disabled={saving}
            style={{ padding: '9px 20px', border: 'none', borderRadius: '7px', backgroundColor: ORANGE, color: '#fff', fontWeight: 700, fontSize: '13px', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Confirmando...' : '🔄 Confirmar endoso'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL RECHAZADO ──────────────────────────────────────────
function ModalRechazado({ cheque, cid, onClose, onOk }: { cheque: Cheque; cid: number; onClose: () => void; onOk: () => void }) {
  const [fecha, setFecha]         = useState(new Date().toISOString().slice(0, 10));
  const [motivo, setMotivo]       = useState('sin_fondos');
  const [detalle, setDetalle]     = useState('');
  const [cargoCC, setCargoCC]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  const MOTIVOS = [
    { v: 'sin_fondos',          label: 'Sin fondos' },
    { v: 'firma_no_coincide',   label: 'Firma no coincide' },
    { v: 'cuenta_cerrada',      label: 'Cuenta cerrada' },
    { v: 'defecto_formal',      label: 'Defecto formal' },
    { v: 'otro',                label: 'Otro' },
  ];

  const confirmar = async () => {
    setError('');
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/cheques/${cid}/${cheque.id}/estado`, {
        method: 'PUT', headers: hdr(),
        body: JSON.stringify({
          estado: 'rechazado', fecha_rechazo: fecha,
          motivo_rechazo: `${motivo}${detalle ? ': ' + detalle : ''}`,
          registrar_cargo_cc: cargoCC, monto_cargo: cheque.monto,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Error'); return; }
      onOk();
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '28px', width: '460px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, color: RED }}>❌ Registrar rechazo</h3>
        <div style={{ backgroundColor: '#FFF5F5', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: TEXT }}>
          <strong>{cheque.titular_nombre}</strong> · {cheque.banco} · {cheque.numero} · <strong style={{ color: RED }}>{fmt(cheque.monto)}</strong>
        </div>
        {error && <div style={{ color: RED, fontSize: '13px', marginBottom: '12px' }}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Fecha de rechazo</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Motivo</label>
            <select value={motivo} onChange={e => setMotivo(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', background: '#fff', boxSizing: 'border-box' }}>
              {MOTIVOS.map(m => <option key={m.v} value={m.v}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Detalle del motivo</label>
            <input value={detalle} onChange={e => setDetalle(e.target.value)} placeholder="Detalle adicional..."
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: TEXT,
            backgroundColor: cargoCC ? '#FFF5F5' : '#F7FAFC', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${cargoCC ? '#FED7D7' : '#EDF2F7'}` }}>
            <input type="checkbox" checked={cargoCC} onChange={e => setCargoCC(e.target.checked)} />
            Registrar cargo en CC cliente ({fmt(cheque.monto)})
          </label>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #CBD5E0', borderRadius: '7px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>Cancelar</button>
          <button onClick={confirmar} disabled={saving}
            style={{ padding: '9px 20px', border: 'none', borderRadius: '7px', backgroundColor: RED, color: '#fff', fontWeight: 700, fontSize: '13px', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Registrando...' : '❌ Registrar rechazo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TABLA CHEQUES ────────────────────────────────────────────
type ModalType = null | 'depositar' | 'endosar' | 'rechazado';

function TablaCheques({ cheques, onAccion, tab }: {
  cheques: Cheque[]; tab: string;
  onAccion: (tipo: ModalType, cheque: Cheque) => void;
}) {
  const COLS = [
    'Número', 'Banco', 'Titular', 'Monto', 'Fecha cobro', 'Tipo', 'Estado', 'Acciones'
  ];
  if (tab === 'rechazados') COLS.splice(6, 0, 'Motivo rechazo');

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '750px' }}>
        <thead style={{ backgroundColor: '#F7FAFC', borderBottom: `2px solid ${SEP}` }}>
          <tr>
            {COLS.map(h => (
              <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: GRAY, fontWeight: 600, fontSize: '11px' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cheques.map((ch, idx) => (
            <tr key={ch.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC', borderBottom: '1px solid #EDF2F7' }}>
              <td style={{ padding: '10px 14px', color: NAVY, fontWeight: 600 }}>{ch.numero || '—'}</td>
              <td style={{ padding: '10px 14px', color: TEXT }}>{ch.banco}</td>
              <td style={{ padding: '10px 14px', color: TEXT }}>
                <div>{ch.titular_nombre}</div>
                {ch.titular_cuit && <div style={{ fontSize: '11px', color: GRAY }}>{ch.titular_cuit}</div>}
              </td>
              <td style={{ padding: '10px 14px', color: BLUE, fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(ch.monto)}</td>
              <td style={{ padding: '10px 14px' }}><ColorFechaCobro fechaCobro={ch.fecha_cobro} estado={ch.estado} /></td>
              <td style={{ padding: '10px 14px' }}><TipoBadge tipo={ch.tipo} /></td>
              {tab === 'rechazados' && (
                <td style={{ padding: '10px 14px', color: RED, fontSize: '12px' }}>{ch.motivo_rechazo || '—'}</td>
              )}
              <td style={{ padding: '10px 14px' }}><EstadoBadge estado={ch.estado} /></td>
              <td style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {ch.estado === 'en_cartera' && (
                    <>
                      <button onClick={() => onAccion('depositar', ch)}
                        style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, border: `1px solid ${GREEN}`, color: GREEN, borderRadius: '5px', background: '#fff', cursor: 'pointer' }}>
                        💰 Dep.
                      </button>
                      <button onClick={() => onAccion('endosar', ch)}
                        style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, border: `1px solid ${ORANGE}`, color: ORANGE, borderRadius: '5px', background: '#fff', cursor: 'pointer' }}>
                        🔄 End.
                      </button>
                      <button onClick={() => onAccion('rechazado', ch)}
                        style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, border: `1px solid ${RED}`, color: RED, borderRadius: '5px', background: '#fff', cursor: 'pointer' }}>
                        ❌ Rech.
                      </button>
                    </>
                  )}
                  {ch.estado === 'rechazado' && (
                    <button onClick={() => onAccion('rechazado', ch)}
                      style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, border: `1px solid ${NAVY}`, color: NAVY, borderRadius: '5px', background: '#fff', cursor: 'pointer' }}>
                      📋 Reclamar
                    </button>
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
type Tab = 'cartera' | 'por_cobrar' | 'entregados' | 'rechazados';

function RobertoCheques() {
  const navigate  = useNavigate();
  const cid       = getClienteId();

  const [tab, setTab]           = useState<Tab>('cartera');
  const [resumen, setResumen]   = useState<Resumen | null>(null);
  const [cheques, setCheques]   = useState<Cheque[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [limit, setLimit]       = useState(25);
  const [cargando, setCargando] = useState(true);

  // Filtros
  const [buscar, setBuscar]   = useState('');
  const [banco, setBanco]     = useState('');
  const [tipo, setTipo]       = useState('');
  const [fDesde, setFDesde]   = useState('');
  const [fHasta, setFHasta]   = useState('');
  const debounceRef           = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modales
  const [modal, setModal]         = useState<ModalType>(null);
  const [chequeModal, setChequeModal] = useState<Cheque | null>(null);
  const [showIngreso, setShowIngreso] = useState(false);

  const estadoPorTab: Record<Tab, string> = {
    cartera:     'en_cartera',
    por_cobrar:  'en_cartera',
    entregados:  'entregado',
    rechazados:  'rechazado',
  };

  const cargarResumen = useCallback(async () => {
    if (!cid) return;
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/cheques/${cid}/resumen`,
        { headers: { 'x-superadmin-token': getToken() } });
      if (r.ok) setResumen(await r.json());
    } catch { /* silencioso */ }
  }, [cid]);

  const cargarCheques = useCallback(async (pg: number, buscarVal: string) => {
    if (!cid) return;
    setCargando(true);
    try {
      const p = new URLSearchParams({ page: String(pg), limit: String(limit), estado: estadoPorTab[tab] });
      if (buscarVal) p.set('buscar', buscarVal);
      if (banco) p.set('banco', banco);
      if (tipo) p.set('tipo', tipo);
      if (fDesde) p.set('fecha_cobro_desde', fDesde);
      if (fHasta) p.set('fecha_cobro_hasta', fHasta);
      // Para "por cobrar" filtrar próximos 30 días
      if (tab === 'por_cobrar' && !fHasta) {
        const d30 = new Date(); d30.setDate(d30.getDate() + 30);
        p.set('fecha_cobro_hasta', d30.toISOString().slice(0, 10));
      }
      const r = await fetch(`${API_BASE}/api/superadmin/cheques/${cid}?${p}`,
        { headers: { 'x-superadmin-token': getToken() } });
      if (r.ok) { const d = await r.json(); setCheques(d.cheques ?? []); setTotal(d.total ?? 0); }
    } finally { setCargando(false); }
  }, [cid, tab, banco, tipo, fDesde, fHasta, limit]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargarResumen(); }, [cargarResumen]);
  useEffect(() => { setPage(1); cargarCheques(1, buscar); }, [tab, banco, tipo, fDesde, fHasta, limit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); cargarCheques(1, buscar); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [buscar]); // eslint-disable-line react-hooks/exhaustive-deps

  const recargar = () => {
    setModal(null); setChequeModal(null); setShowIngreso(false);
    cargarResumen();
    cargarCheques(page, buscar);
  };

  const abrirModal = (tipo: ModalType, ch: Cheque) => { setModal(tipo); setChequeModal(ch); };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Alertas
  const hayVencidos = (resumen?.vencidos?.cantidad ?? 0) > 0;
  const hayPorVencer = (resumen?.a_cobrar_7dias?.cantidad ?? 0) > 0;

  if (!cid) return <div style={{ padding: '40px', textAlign: 'center', color: GRAY }}>Sin sesión activa.</div>;

  return (
    <div style={{ padding: '24px', backgroundColor: BG, minHeight: '100vh' }}>
      {/* Modales */}
      {showIngreso && <ModalIngresarCheque cid={cid} onClose={() => setShowIngreso(false)} onOk={recargar} />}
      {modal === 'depositar' && chequeModal && <ModalDepositar cheque={chequeModal} cid={cid} onClose={() => { setModal(null); setChequeModal(null); }} onOk={recargar} />}
      {modal === 'endosar'   && chequeModal && <ModalEndosar   cheque={chequeModal} cid={cid} onClose={() => { setModal(null); setChequeModal(null); }} onOk={recargar} />}
      {modal === 'rechazado' && chequeModal && <ModalRechazado cheque={chequeModal} cid={cid} onClose={() => { setModal(null); setChequeModal(null); }} onOk={recargar} />}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: NAVY }}>🧾 Cheques</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: GRAY }}>Gestión de cartera de cheques</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowIngreso(true)}
            style={{ padding: '9px 18px', backgroundColor: GREEN, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
            ＋ Ingresar cheque
          </button>
          <button onClick={() => navigate('/roberto/dashboard')}
            style={{ padding: '9px 16px', border: '1px solid #CBD5E0', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>
            ← Dashboard
          </button>
        </div>
      </div>

      {/* Alertas */}
      {hayVencidos && (
        <div style={{ backgroundColor: '#FFF5F5', border: `1px solid #FED7D7`, borderRadius: '8px', padding: '12px 16px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>🚨</span>
          <span style={{ fontSize: '13px', color: RED, fontWeight: 600 }}>
            Hay {resumen!.vencidos.cantidad} cheque{resumen!.vencidos.cantidad !== 1 ? 's' : ''} vencidos sin depositar por {fmt(resumen!.vencidos.monto)}
          </span>
        </div>
      )}
      {hayPorVencer && !hayVencidos && (
        <div style={{ backgroundColor: '#FFFAF0', border: `1px solid #FBD38D`, borderRadius: '8px', padding: '12px 16px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>⚠️</span>
          <span style={{ fontSize: '13px', color: ORANGE, fontWeight: 600 }}>
            {resumen!.a_cobrar_7dias.cantidad} cheque{resumen!.a_cobrar_7dias.cantidad !== 1 ? 's' : ''} a cobrar en los próximos 7 días por {fmt(resumen!.a_cobrar_7dias.monto)}
          </span>
        </div>
      )}

      {/* Dashboard 4 cards */}
      {resumen && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '18px' }}>
          {[
            { icon: '💼', label: 'En cartera',              color: BLUE,   d: resumen.en_cartera    },
            { icon: '📅', label: 'A cobrar próx. 7 días',  color: ORANGE, d: resumen.a_cobrar_7dias },
            { icon: '⚠️', label: 'Vencidos sin cobrar',    color: RED,    d: resumen.vencidos       },
            { icon: '📤', label: 'Entregados este mes',     color: GRAY,   d: resumen.entregados_mes },
          ].map(c => (
            <div key={c.label} style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${c.color}` }}>
              <div style={{ fontSize: '22px', marginBottom: '6px' }}>{c.icon}</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: c.color }}>{fmt(c.d.monto)}</div>
              <div style={{ fontSize: '12px', color: GRAY, marginTop: '2px' }}>{c.d.cantidad} cheque{c.d.cantidad !== 1 ? 's' : ''} · {c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Desglose por banco */}
      {resumen && resumen.por_banco.length > 0 && (
        <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '16px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '18px' }}>
          <p style={{ margin: '0 0 12px', fontSize: '12px', fontWeight: 700, color: NAVY }}>Cartera por banco</p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {resumen.por_banco.map(b => (
              <div key={b.banco} style={{ backgroundColor: '#F7FAFC', borderRadius: '8px', padding: '10px 16px', border: `1px solid #EDF2F7` }}>
                <div style={{ fontSize: '12px', color: GRAY, marginBottom: '2px' }}>{b.banco}</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: BLUE }}>{fmt(b.monto)}</div>
                <div style={{ fontSize: '11px', color: GRAY }}>{b.cantidad} ch.</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', backgroundColor: '#fff', borderRadius: '10px', padding: '4px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', width: 'fit-content' }}>
        {[
          { id: 'cartera',    label: '💼 Cartera'    },
          { id: 'por_cobrar', label: '📅 Por cobrar' },
          { id: 'entregados', label: '📤 Entregados' },
          { id: 'rechazados', label: '❌ Rechazados' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as Tab)}
            style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: tab === t.id ? 700 : 400,
              backgroundColor: tab === t.id ? NAVY : 'transparent', color: tab === t.id ? '#fff' : GRAY, transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="🔍 Número o titular..."
          style={{ padding: '8px 12px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', minWidth: '200px' }} />
        <input value={banco} onChange={e => { setBanco(e.target.value); setPage(1); }} placeholder="Banco..."
          style={{ padding: '8px 12px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', width: '140px' }} />
        <select value={tipo} onChange={e => { setTipo(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', background: '#fff' }}>
          <option value="">Todos los tipos</option>
          <option value="tercero">Tercero</option>
          <option value="propio">Propio</option>
          <option value="echeq">eCheq</option>
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
        <button onClick={() => { setBuscar(''); setBanco(''); setTipo(''); setFDesde(''); setFHasta(''); setPage(1); }}
          style={{ padding: '8px 14px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', background: '#fff', cursor: 'pointer', color: GRAY }}>
          Limpiar
        </button>
      </div>

      {/* Tabla */}
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        {cargando ? (
          <div style={{ padding: '48px', textAlign: 'center', color: GRAY }}>Cargando cheques...</div>
        ) : cheques.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center' }}>
            <div style={{ fontSize: '42px', marginBottom: '12px' }}>🧾</div>
            <p style={{ color: GRAY, fontSize: '14px' }}>No hay cheques en esta sección</p>
          </div>
        ) : (
          <>
            <TablaCheques cheques={cheques} onAccion={abrirModal} tab={tab} />
            <div style={{ padding: '12px 16px', borderTop: '1px solid #EDF2F7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: GRAY }}>
              <span>Total: {total} cheques</span>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button onClick={() => { const p = Math.max(1, page - 1); setPage(p); cargarCheques(p, buscar); }} disabled={page === 1}
                  style={{ padding: '4px 10px', border: '1px solid #CBD5E0', borderRadius: '5px', cursor: page === 1 ? 'default' : 'pointer', background: '#fff', opacity: page === 1 ? 0.4 : 1 }}>‹</button>
                <span>{page} / {totalPages}</span>
                <button onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); cargarCheques(p, buscar); }} disabled={page === totalPages}
                  style={{ padding: '4px 10px', border: '1px solid #CBD5E0', borderRadius: '5px', cursor: page === totalPages ? 'default' : 'pointer', background: '#fff', opacity: page === totalPages ? 0.4 : 1 }}>›</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default RobertoCheques;
