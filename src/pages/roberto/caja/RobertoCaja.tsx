import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../../config/api';
import { getToken } from '../../../utils/auth';

// ─── COLORES ────────────────────────────────────────────────
const NAVY   = '#1B2A4A';
const BLUE   = '#2B6CB0';
const GREEN  = '#38A169';
const RED    = '#E53E3E';
const SEP    = '#63B3ED';
const GRAY   = '#718096';
const TEXT   = '#2D3748';
const BG     = '#F4F6F9';
const ORANGE = '#DD6B20';

// ─── AUTH ───────────────────────────────────────────────────
function getClienteId(): number | null {
  try { const s = localStorage.getItem('roberto_portal_session'); return s ? JSON.parse(s).cliente?.id ?? null : null; } catch { return null; }
}
function hdr() { return { 'x-superadmin-token': getToken(), 'Content-Type': 'application/json' }; }

// ─── HELPERS ────────────────────────────────────────────────
function fmt(n: number | string | undefined) { return `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtFecha(f: string) { if (!f) return '—'; return new Date(f).toLocaleDateString('es-AR'); }
function fmtHora(f: string) { if (!f) return '—'; return new Date(f).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }); }
function fmtFechaHora(f: string) { if (!f) return '—'; const d = new Date(f); return `${d.toLocaleDateString('es-AR')} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`; }

// ─── TIPOS ──────────────────────────────────────────────────
interface EstadoCaja {
  abierta: boolean;
  caja_id?: number;
  fecha_apertura?: string;
  saldo_inicial?: number;
  total_ingresos?: number;
  total_egresos?: number;
  saldo_actual?: number;
  turno?: string;
  abierta_por?: string;
}

interface MovCaja {
  id: number;
  hora: string;
  tipo: string;
  tipo_operacion: string;
  descripcion: string;
  monto: number;
  medio_pago: string;
  numero_comprobante: string;
}

interface Desglose { efectivo: number; transferencia: number; cheques: number; tarjeta: number; otros: number; }

interface ResumenCierre {
  ok: boolean;
  diferencia: number;
  saldo_sistema: number;
  saldo_real: number;
  turno: string;
  fecha_apertura: string;
  saldo_inicial: number;
  total_ingresos: number;
  total_egresos: number;
}

interface CajaHistorial {
  id: number;
  turno: string;
  fecha_apertura: string;
  fecha_cierre: string;
  saldo_inicial: number;
  total_ingresos: number;
  total_egresos: number;
  saldo_final_sistema: number;
  saldo_final_real: number;
  diferencia: number;
}

// ─── BADGES TIPO ────────────────────────────────────────────
const TIPO_CFG: Record<string, { label: string; color: string; bg: string }> = {
  venta:        { label: 'Venta',         color: '#fff', bg: GREEN  },
  cobro:        { label: 'Cobro',         color: '#fff', bg: BLUE   },
  gasto:        { label: 'Gasto',         color: '#fff', bg: RED    },
  retiro:       { label: 'Retiro',        color: '#fff', bg: ORANGE },
  ingreso_extra:{ label: 'Ingreso extra', color: '#fff', bg: GREEN  },
  deposito:     { label: 'Depósito',      color: '#fff', bg: BLUE   },
  apertura:     { label: 'Apertura',      color: TEXT,   bg: '#EDF2F7' },
  cierre:       { label: 'Cierre',        color: TEXT,   bg: '#EDF2F7' },
};
function TipoBadge({ tipo }: { tipo: string }) {
  const c = TIPO_CFG[tipo] ?? { label: tipo, color: '#fff', bg: GRAY };
  return <span style={{ fontSize: '11px', fontWeight: 600, color: c.color, backgroundColor: c.bg, borderRadius: '10px', padding: '2px 8px', whiteSpace: 'nowrap' }}>{c.label}</span>;
}

const MEDIOS_PAGO = ['efectivo','transferencia','tarjeta_debito','tarjeta_credito','cheque_propio','cheque_tercero','echeq','otro'];
const TURNOS = ['Mañana', 'Tarde', 'Noche', 'Único'];

// ─── PDF CIERRE ─────────────────────────────────────────────
function generarPDFCierre(res: ResumenCierre, desglose: Desglose) {
  const w = window.open('', '_blank');
  if (!w) return;
  const diff = res.diferencia;
  const diffColor = Math.abs(diff) < 0.01 ? GREEN : RED;
  w.document.write(`<!DOCTYPE html><html><head><title>Cierre de Caja</title>
    <style>
      body{font-family:Arial,sans-serif;padding:32px;color:#2D3748;font-size:13px}
      h1{color:#1B2A4A;font-size:20px;margin:0 0 4px}
      .sub{color:#718096;font-size:12px}
      table{width:100%;border-collapse:collapse;margin:16px 0}
      th{background:#F7FAFC;padding:10px;text-align:left;font-size:11px;color:#718096;border-bottom:2px solid #63B3ED}
      td{padding:10px;border-bottom:1px solid #EDF2F7}
      .total{font-size:20px;font-weight:700}
    </style></head><body>
    <h1>🏦 CIERRE DE CAJA</h1>
    <p class="sub">Turno: ${res.turno} | Apertura: ${fmtFechaHora(res.fecha_apertura)} | Cierre: ${fmtFechaHora(new Date().toISOString())}</p>
    <table>
      <tr><th>Concepto</th><th>Monto</th></tr>
      <tr><td>Saldo inicial</td><td>${fmt(res.saldo_inicial)}</td></tr>
      <tr><td>Total ingresos</td><td style="color:${GREEN}">${fmt(res.total_ingresos)}</td></tr>
      <tr><td>Total egresos</td><td style="color:${RED}">${fmt(res.total_egresos)}</td></tr>
      <tr><td><strong>Saldo sistema</strong></td><td class="total">${fmt(res.saldo_sistema)}</td></tr>
      <tr><td><strong>Saldo real contado</strong></td><td class="total">${fmt(res.saldo_real)}</td></tr>
      <tr><td><strong>Diferencia</strong></td><td class="total" style="color:${diffColor}">${fmt(diff)}</td></tr>
    </table>
    <h3 style="color:#1B2A4A">Desglose por medio de pago</h3>
    <table>
      <tr><th>Medio</th><th>Monto</th></tr>
      <tr><td>Efectivo</td><td>${fmt(desglose.efectivo)}</td></tr>
      <tr><td>Transferencia</td><td>${fmt(desglose.transferencia)}</td></tr>
      <tr><td>Cheques</td><td>${fmt(desglose.cheques)}</td></tr>
      <tr><td>Tarjeta</td><td>${fmt(desglose.tarjeta)}</td></tr>
      <tr><td>Otros</td><td>${fmt(desglose.otros)}</td></tr>
    </table>
    <script>window.print()</script></body></html>`);
  w.document.close();
}

// ─── PANTALLA RESUMEN CIERRE ─────────────────────────────────
function PantallaResumenCierre({ resumen, desglose, onCerrar }: {
  resumen: ResumenCierre; desglose: Desglose; onCerrar: () => void;
}) {
  const diff = resumen.diferencia;
  const diffColor = Math.abs(diff) < 0.01 ? GREEN : RED;
  const rows = [
    { label: 'Saldo inicial',      valor: fmt(resumen.saldo_inicial),   color: GRAY  },
    { label: 'Total ingresos',     valor: fmt(resumen.total_ingresos),  color: GREEN },
    { label: 'Total egresos',      valor: fmt(resumen.total_egresos),   color: RED   },
    { label: 'Saldo sistema',      valor: fmt(resumen.saldo_sistema),   color: NAVY  },
    { label: 'Saldo real contado', valor: fmt(resumen.saldo_real),      color: NAVY  },
  ];

  return (
    <div style={{ padding: '24px', backgroundColor: BG, minHeight: '100vh' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        {/* Éxito header */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '28px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '52px', marginBottom: '12px' }}>✅</div>
          <h2 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: 700, color: NAVY }}>¡Caja cerrada!</h2>
          <p style={{ margin: 0, fontSize: '13px', color: GRAY }}>Turno {resumen.turno} · {fmtFechaHora(resumen.fecha_apertura)}</p>
        </div>

        {/* Resumen números */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
          <div style={{ padding: '14px 20px', borderBottom: `2px solid ${SEP}` }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: NAVY }}>Resumen del turno</h3>
          </div>
          {rows.map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #EDF2F7' }}>
              <span style={{ fontSize: '13px', color: GRAY }}>{r.label}</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: r.color }}>{r.valor}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 20px', backgroundColor: Math.abs(diff) < 0.01 ? '#F0FFF4' : '#FFF5F5' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: TEXT }}>Diferencia</span>
            <span style={{ fontSize: '18px', fontWeight: 700, color: diffColor }}>{fmt(diff)}</span>
          </div>
        </div>

        {/* Desglose */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
          <div style={{ padding: '14px 20px', borderBottom: `2px solid ${SEP}` }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: NAVY }}>Desglose por medio de pago</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0 }}>
            {[
              { k: 'efectivo',      label: 'Efectivo',       icon: '💵' },
              { k: 'transferencia', label: 'Transferencia',  icon: '🏦' },
              { k: 'cheques',       label: 'Cheques',        icon: '🧾' },
              { k: 'tarjeta',       label: 'Tarjeta',        icon: '💳' },
              { k: 'otros',         label: 'Otros',          icon: '📦' },
            ].map(({ k, label, icon }) => (
              <div key={k} style={{ padding: '16px 12px', textAlign: 'center', borderRight: '1px solid #EDF2F7' }}>
                <div style={{ fontSize: '18px', marginBottom: '4px' }}>{icon}</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: NAVY }}>{fmt(desglose[k as keyof Desglose])}</div>
                <div style={{ fontSize: '10px', color: GRAY, marginTop: '2px' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Botones */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button onClick={() => generarPDFCierre(resumen, desglose)}
            style={{ padding: '10px 22px', backgroundColor: NAVY, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
            🖨️ Imprimir / PDF
          </button>
          <button onClick={onCerrar}
            style={{ padding: '10px 22px', backgroundColor: GREEN, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
            ✅ Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL MOVIMIENTO ────────────────────────────────────────
function ModalMovimiento({ cajaId, cid, tipoInicial, onClose, onOk }: {
  cajaId: number; cid: number; tipoInicial: string; onClose: () => void; onOk: (saldo: number) => void;
}) {
  const [tipo, setTipo]         = useState(tipoInicial);
  const [monto, setMonto]       = useState('');
  const [medio, setMedio]       = useState('efectivo');
  const [desc, setDesc]         = useState('');
  const [nroCmp, setNroCmp]     = useState('');
  const [obs, setObs]           = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const tipoOp = ['gasto', 'retiro'].includes(tipo) ? 'egreso' : 'ingreso';

  const guardar = async () => {
    setError('');
    if (!monto || isNaN(Number(monto)) || Number(monto) <= 0) { setError('Ingresá un monto válido'); return; }
    if (!desc.trim()) { setError('La descripción es obligatoria'); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/caja/${cid}/movimiento`, {
        method: 'POST', headers: hdr(),
        body: JSON.stringify({
          caja_id: cajaId, tipo, monto: Number(monto), tipo_operacion: tipoOp,
          medio_pago: medio, descripcion: desc, numero_comprobante: nroCmp, observaciones: obs,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Error al guardar'); return; }
      onOk(d.saldo_actual);
    } finally { setSaving(false); }
  };

  const TIPOS_MOV = [
    { id: 'ingreso_extra', label: 'Ingreso extra' },
    { id: 'gasto',         label: 'Gasto' },
    { id: 'retiro',        label: 'Retiro' },
    { id: 'deposito',      label: 'Depósito' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '28px', width: '460px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700, color: NAVY }}>
          {tipoOp === 'ingreso' ? '📥' : '📤'} Registrar movimiento
        </h3>
        {error && <div style={{ backgroundColor: '#FFF5F5', color: RED, padding: '10px 14px', borderRadius: '7px', fontSize: '13px', marginBottom: '14px' }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Tipo *</label>
              <select value={tipo} onChange={e => setTipo(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', background: '#fff', boxSizing: 'border-box' }}>
                {TIPOS_MOV.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Monto *</label>
              <input type="number" value={monto} onChange={e => setMonto(e.target.value)} min="0" step="0.01" placeholder="0,00"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '14px', fontWeight: 600, boxSizing: 'border-box' }} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Medio de pago</label>
            <select value={medio} onChange={e => setMedio(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', background: '#fff', boxSizing: 'border-box' }}>
              {MEDIOS_PAGO.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Descripción *</label>
            <input value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Descripción del movimiento"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Nro. comprobante</label>
              <input value={nroCmp} onChange={e => setNroCmp(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Observaciones</label>
              <input value={obs} onChange={e => setObs(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '22px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #CBD5E0', borderRadius: '7px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>Cancelar</button>
          <button onClick={guardar} disabled={saving}
            style={{ padding: '9px 18px', border: 'none', borderRadius: '7px', cursor: saving ? 'default' : 'pointer', fontSize: '13px', fontWeight: 700, color: '#fff',
              backgroundColor: tipoOp === 'ingreso' ? GREEN : RED, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Registrando...' : '✅ Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL CERRAR CAJA ───────────────────────────────────────
function ModalCerrarCaja({ estado, cid, desglose, onClose, onOk }: {
  estado: EstadoCaja; cid: number; desglose: Desglose;
  onClose: () => void; onOk: (res: ResumenCierre) => void;
}) {
  const saldoSistema = (estado.saldo_inicial ?? 0) + (estado.total_ingresos ?? 0) - (estado.total_egresos ?? 0);
  const [saldoReal, setSaldoReal]   = useState(String(saldoSistema.toFixed(2)));
  const [motivo, setMotivo]         = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  const diferencia = Number(saldoReal || 0) - saldoSistema;
  const hayDiff    = Math.abs(diferencia) > 0.01;

  const cerrar = async () => {
    setError('');
    if (hayDiff && !motivo.trim()) { setError('Indicá el motivo de la diferencia'); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/caja/${cid}/cerrar`, {
        method: 'POST', headers: hdr(),
        body: JSON.stringify({
          caja_id: estado.caja_id,
          saldo_final_real: Number(saldoReal),
          motivo_diferencia: motivo,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Error al cerrar'); return; }
      onOk(d);
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '28px', width: '480px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700, color: NAVY }}>🔒 Cerrar caja</h3>

        {/* Resumen turno */}
        <div style={{ backgroundColor: '#F7FAFC', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: NAVY }}>Resumen del turno</h4>
          {[
            { label: 'Saldo inicial',   valor: fmt(estado.saldo_inicial ?? 0),  color: GRAY  },
            { label: 'Total ingresos',  valor: fmt(estado.total_ingresos ?? 0), color: GREEN },
            { label: 'Total egresos',   valor: fmt(estado.total_egresos ?? 0),  color: RED   },
            { label: 'Saldo sistema',   valor: fmt(saldoSistema),               color: NAVY  },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', color: GRAY }}>{r.label}</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: r.color }}>{r.valor}</span>
            </div>
          ))}
        </div>

        {error && <div style={{ backgroundColor: '#FFF5F5', color: RED, padding: '10px 14px', borderRadius: '7px', fontSize: '13px', marginBottom: '14px' }}>{error}</div>}

        {/* Saldo real */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '13px', fontWeight: 700, color: NAVY, display: 'block', marginBottom: '6px' }}>Saldo real contado *</label>
          <input type="number" value={saldoReal} onChange={e => setSaldoReal(e.target.value)} min="0" step="0.01"
            style={{ width: '100%', padding: '10px 14px', border: `2px solid ${hayDiff ? RED : '#CBD5E0'}`, borderRadius: '7px', fontSize: '16px', fontWeight: 700, boxSizing: 'border-box' }} />
        </div>

        {/* Diferencia calculada */}
        <div style={{ padding: '12px 16px', borderRadius: '8px', backgroundColor: hayDiff ? '#FFF5F5' : '#F0FFF4', border: `1px solid ${hayDiff ? '#FED7D7' : '#C6F6D5'}`, marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: hayDiff ? RED : GREEN }}>Diferencia</span>
            <span style={{ fontSize: '20px', fontWeight: 700, color: hayDiff ? RED : GREEN }}>{fmt(diferencia)}</span>
          </div>
          {hayDiff && (
            <p style={{ margin: '8px 0 0', fontSize: '12px', color: RED }}>
              ⚠️ Hay una diferencia de {fmt(Math.abs(diferencia))}. ¿Estás seguro de cerrar la caja?
            </p>
          )}
        </div>

        {/* Motivo diferencia */}
        {hayDiff && (
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Motivo de la diferencia *</label>
            <input value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder="Ej: faltante de cambio, error de carga..."
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', border: '1px solid #CBD5E0', borderRadius: '7px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>Cancelar</button>
          <button onClick={cerrar} disabled={saving}
            style={{ padding: '10px 20px', border: 'none', borderRadius: '7px', cursor: saving ? 'default' : 'pointer', fontSize: '13px', fontWeight: 700, color: '#fff',
              backgroundColor: RED, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Cerrando...' : '🔒 Cerrar caja'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL ABRIR CAJA ────────────────────────────────────────
function ModalAbrirCaja({ cid, onClose, onOk }: { cid: number; onClose: () => void; onOk: () => void }) {
  const [saldoIni, setSaldoIni] = useState('0');
  const [turno, setTurno]       = useState('Único');
  const [obs, setObs]           = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const abrir = async () => {
    setError('');
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/caja/${cid}/abrir`, {
        method: 'POST', headers: hdr(),
        body: JSON.stringify({ saldo_inicial: Number(saldoIni) || 0, turno, observaciones: obs }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Error al abrir'); return; }
      onOk();
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '28px', width: '420px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700, color: NAVY }}>🏦 Abrir caja</h3>
        {error && <div style={{ backgroundColor: '#FFF5F5', color: RED, padding: '10px 14px', borderRadius: '7px', fontSize: '13px', marginBottom: '14px' }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 700, color: NAVY, display: 'block', marginBottom: '6px' }}>Saldo inicial *</label>
            <input type="number" value={saldoIni} onChange={e => setSaldoIni(e.target.value)} min="0" step="0.01"
              style={{ width: '100%', padding: '10px 14px', border: '2px solid #CBD5E0', borderRadius: '7px', fontSize: '18px', fontWeight: 700, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Turno</label>
            <select value={turno} onChange={e => setTurno(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', background: '#fff', boxSizing: 'border-box' }}>
              {TURNOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: GRAY, display: 'block', marginBottom: '4px' }}>Observaciones</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
              placeholder="Novedades, observaciones del turno..."
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '22px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', border: '1px solid #CBD5E0', borderRadius: '7px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>Cancelar</button>
          <button onClick={abrir} disabled={saving}
            style={{ padding: '10px 22px', border: 'none', borderRadius: '7px', cursor: saving ? 'default' : 'pointer', fontSize: '14px', fontWeight: 700, color: '#fff',
              backgroundColor: GREEN, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Abriendo...' : '🏦 Abrir caja'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TAB HISTORIAL ───────────────────────────────────────────
function TabHistorial({ cid }: { cid: number }) {
  const [cajas, setCajas]   = useState<CajaHistorial[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [limit] = useState(25);
  const [desde, setDesde]   = useState('');
  const [hasta, setHasta]   = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const p = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (desde) p.set('fecha_desde', desde);
      if (hasta) p.set('fecha_hasta', hasta);
      const r = await fetch(`${API_BASE}/api/superadmin/caja/${cid}/historial?${p}`,
        { headers: { 'x-superadmin-token': getToken() } });
      if (r.ok) { const d = await r.json(); setCajas(d.cajas ?? []); setTotal(d.total ?? 0); }
    } finally { setCargando(false); }
  }, [cid, page, limit, desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const generarPDFHistorial = (c: CajaHistorial) => {
    const diff = c.diferencia;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Caja ${fmtFecha(c.fecha_apertura)}</title>
      <style>body{font-family:Arial,sans-serif;padding:32px;color:#2D3748;font-size:13px}
      h1{color:#1B2A4A}</style></head><body>
      <h1>🏦 CIERRE DE CAJA — ${c.turno}</h1>
      <p>Apertura: ${fmtFechaHora(c.fecha_apertura)}</p>
      <p>Cierre: ${fmtFechaHora(c.fecha_cierre)}</p>
      <p>Saldo inicial: $${Number(c.saldo_inicial).toFixed(2)}</p>
      <p>Total ingresos: $${Number(c.total_ingresos).toFixed(2)}</p>
      <p>Total egresos: $${Number(c.total_egresos).toFixed(2)}</p>
      <p>Saldo sistema: $${Number(c.saldo_final_sistema).toFixed(2)}</p>
      <p>Saldo real: $${Number(c.saldo_final_real).toFixed(2)}</p>
      <p style="color:${Math.abs(diff) < 0.01 ? GREEN : RED}">Diferencia: $${Number(diff).toFixed(2)}</p>
      <script>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px' }} />
        <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px' }} />
        <button onClick={() => { setDesde(''); setHasta(''); setPage(1); }}
          style={{ padding: '8px 14px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', background: '#fff', cursor: 'pointer', color: GRAY }}>
          Limpiar
        </button>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        {cargando ? (
          <div style={{ padding: '40px', textAlign: 'center', color: GRAY }}>Cargando...</div>
        ) : cajas.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
            <p style={{ color: GRAY, fontSize: '14px' }}>No hay cajas cerradas en el período seleccionado</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '700px' }}>
                <thead style={{ backgroundColor: '#F7FAFC', borderBottom: `2px solid ${SEP}` }}>
                  <tr>
                    {['Fecha', 'Turno', 'Apertura', 'Cierre', 'Ingresos', 'Egresos', 'Diferencia', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: GRAY, fontWeight: 600, fontSize: '11px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cajas.map((c, idx) => {
                    const diff = c.diferencia;
                    const diffOk = Math.abs(diff) < 0.01;
                    return (
                      <tr key={c.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                        <td style={{ padding: '10px 14px', color: GRAY }}>{fmtFecha(c.fecha_apertura)}</td>
                        <td style={{ padding: '10px 14px', color: TEXT, fontWeight: 600 }}>{c.turno}</td>
                        <td style={{ padding: '10px 14px', color: GRAY }}>{fmtHora(c.fecha_apertura)}</td>
                        <td style={{ padding: '10px 14px', color: GRAY }}>{fmtHora(c.fecha_cierre)}</td>
                        <td style={{ padding: '10px 14px', color: GREEN, fontWeight: 600 }}>{fmt(c.total_ingresos)}</td>
                        <td style={{ padding: '10px 14px', color: RED, fontWeight: 600 }}>{fmt(c.total_egresos)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: diffOk ? GREEN : RED,
                            backgroundColor: diffOk ? '#F0FFF4' : '#FFF5F5', borderRadius: '10px', padding: '2px 8px' }}>
                            {diffOk ? '✓ Cuadra' : fmt(diff)}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <button onClick={() => generarPDFHistorial(c)}
                            style={{ padding: '5px 10px', border: `1px solid ${NAVY}`, borderRadius: '5px', cursor: 'pointer', fontSize: '11px', color: NAVY, background: '#fff', fontWeight: 600 }}>
                            📄 PDF
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid #EDF2F7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: GRAY }}>
              <span>Total: {total} turnos</span>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ padding: '4px 10px', border: '1px solid #CBD5E0', borderRadius: '5px', cursor: page === 1 ? 'default' : 'pointer', background: '#fff', fontSize: '12px', color: GRAY, opacity: page === 1 ? 0.4 : 1 }}>‹</button>
                <span>{page} / {totalPages}</span>
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
function RobertoCaja() {
  const navigate = useNavigate();
  const cid = getClienteId();

  const [tab, setTab]               = useState<'turno' | 'historial'>('turno');
  const [estado, setEstado]         = useState<EstadoCaja | null>(null);
  const [desglose, setDesglose]     = useState<Desglose>({ efectivo: 0, transferencia: 0, cheques: 0, tarjeta: 0, otros: 0 });
  const [movimientos, setMovimientos] = useState<MovCaja[]>([]);
  const [totalMovs, setTotalMovs]   = useState(0);
  const [pageMov, setPageMov]       = useState(1);
  const [cargando, setCargando]     = useState(true);
  const [tipoMovFiltro, setTipoMovFiltro] = useState('');

  // Modales
  const [modal, setModal] = useState<'abrir' | 'cerrar' | { tipo: string } | null>(null);
  // Resumen cierre
  const [resumenCierre, setResumenCierre] = useState<ResumenCierre | null>(null);

  const cargarEstado = useCallback(async () => {
    if (!cid) return;
    setCargando(true);
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/caja/${cid}/estado`,
        { headers: { 'x-superadmin-token': getToken() } });
      if (r.ok) {
        const d = await r.json();
        setEstado(d);
        if (d.abierta && d.caja_id) {
          cargarDesglose(d.caja_id);
          cargarMovimientos(d.caja_id, 1, '');
        } else {
          setDesglose({ efectivo: 0, transferencia: 0, cheques: 0, tarjeta: 0, otros: 0 });
          setMovimientos([]);
        }
      } else {
        setEstado({ abierta: false });
      }
    } finally { setCargando(false); }
  }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargarDesglose = async (cajaId: number) => {
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/caja/${cid}/desglose/${cajaId}`,
        { headers: { 'x-superadmin-token': getToken() } });
      if (r.ok) setDesglose(await r.json());
    } catch { /* silencioso */ }
  };

  const cargarMovimientos = async (cajaId: number, pg: number, tipoF: string) => {
    try {
      const p = new URLSearchParams({ page: String(pg), limit: '50' });
      if (tipoF) p.set('tipo', tipoF);
      const r = await fetch(`${API_BASE}/api/superadmin/caja/${cid}/${cajaId}/movimientos?${p}`,
        { headers: { 'x-superadmin-token': getToken() } });
      if (r.ok) { const d = await r.json(); setMovimientos(d.movimientos ?? []); setTotalMovs(d.total ?? 0); }
    } catch { /* silencioso */ }
  };

  useEffect(() => { cargarEstado(); }, [cargarEstado]);

  const recargar = () => {
    setResumenCierre(null);
    cargarEstado();
  };

  if (!cid) return <div style={{ padding: '40px', textAlign: 'center', color: GRAY }}>Sin sesión activa.</div>;

  // Si hay resumen de cierre → mostrar pantalla especial
  if (resumenCierre) {
    return (
      <PantallaResumenCierre
        resumen={resumenCierre}
        desglose={desglose}
        onCerrar={recargar}
      />
    );
  }

  const saldoActual = estado?.saldo_actual ?? 0;
  const cajaAbierta = !!estado?.abierta;
  const cajaId = estado?.caja_id ?? null;

  return (
    <div style={{ padding: '24px', backgroundColor: BG, minHeight: '100vh' }}>
      {/* Modales */}
      {modal === 'abrir' && (
        <ModalAbrirCaja cid={cid} onClose={() => setModal(null)} onOk={recargar} />
      )}
      {modal === 'cerrar' && estado && (
        <ModalCerrarCaja
          estado={estado} cid={cid} desglose={desglose}
          onClose={() => setModal(null)}
          onOk={(res) => { setModal(null); setResumenCierre(res); }}
        />
      )}
      {modal !== null && modal !== 'abrir' && modal !== 'cerrar' && cajaId && (
        <ModalMovimiento
          cajaId={cajaId} cid={cid}
          tipoInicial={(modal as { tipo: string }).tipo}
          onClose={() => setModal(null)}
          onOk={(saldo) => {
            setModal(null);
            setEstado(prev => prev ? { ...prev, saldo_actual: saldo } : prev);
            cargarDesglose(cajaId);
            cargarMovimientos(cajaId, pageMov, tipoMovFiltro);
          }}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: NAVY }}>🏦 Caja</h1>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: GRAY }}>Control de movimientos del turno</p>
          </div>
          {!cargando && (
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#fff',
              backgroundColor: cajaAbierta ? GREEN : GRAY, borderRadius: '12px', padding: '3px 10px' }}>
              {cajaAbierta ? '🟢 ABIERTA' : '🔴 CERRADA'}
            </span>
          )}
          {cajaAbierta && estado?.fecha_apertura && (
            <span style={{ fontSize: '12px', color: GRAY }}>desde {fmtHora(estado.fecha_apertura)}</span>
          )}
        </div>
        <button onClick={() => navigate('/roberto/dashboard')}
          style={{ padding: '8px 16px', border: '1px solid #CBD5E0', borderRadius: '7px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>
          ← Dashboard
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', backgroundColor: '#fff', borderRadius: '10px', padding: '4px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', width: 'fit-content' }}>
        {[{ id: 'turno', label: '🏦 Turno actual' }, { id: 'historial', label: '📋 Historial' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            style={{ padding: '8px 18px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: tab === t.id ? 700 : 400,
              backgroundColor: tab === t.id ? NAVY : 'transparent', color: tab === t.id ? '#fff' : GRAY, transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'historial' ? (
        <TabHistorial cid={cid} />
      ) : cargando ? (
        <div style={{ padding: '60px', textAlign: 'center', color: GRAY }}>Cargando estado de caja...</div>
      ) : !cajaAbierta ? (
        /* ── CAJA CERRADA ── */
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '28px' }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${GRAY}` }}>
              <div style={{ fontSize: '22px', marginBottom: '8px' }}>🔴</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: GRAY }}>Caja cerrada</div>
              <div style={{ fontSize: '12px', color: GRAY, marginTop: '4px' }}>Sin turno activo</div>
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${GREEN}` }}>
              <div style={{ fontSize: '22px', marginBottom: '8px' }}>📥</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: GREEN }}>$0,00</div>
              <div style={{ fontSize: '12px', color: GRAY, marginTop: '2px' }}>Ingresos del turno</div>
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${RED}` }}>
              <div style={{ fontSize: '22px', marginBottom: '8px' }}>📤</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: RED }}>$0,00</div>
              <div style={{ fontSize: '12px', color: GRAY, marginTop: '2px' }}>Egresos del turno</div>
            </div>
          </div>

          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '48px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '52px', marginBottom: '16px' }}>🏦</div>
            <h2 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: NAVY }}>No hay caja abierta</h2>
            <p style={{ margin: '0 0 24px', fontSize: '13px', color: GRAY }}>Abrí la caja para comenzar a registrar movimientos del turno.</p>
            <button onClick={() => setModal('abrir')}
              style={{ padding: '12px 32px', backgroundColor: GREEN, color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: 700 }}>
              🏦 Abrir caja
            </button>
          </div>
        </div>
      ) : (
        /* ── CAJA ABIERTA ── */
        <div>
          {/* 4 Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
            {[
              { icon: '💰', label: 'Saldo actual',         valor: fmt(saldoActual),                         color: BLUE  },
              { icon: '📥', label: 'Total ingresos turno', valor: fmt(estado?.total_ingresos ?? 0),          color: GREEN },
              { icon: '📤', label: 'Total egresos turno',  valor: fmt(estado?.total_egresos ?? 0),           color: RED   },
              { icon: '📊', label: 'Vs apertura',
                valor: fmt(saldoActual - (estado?.saldo_inicial ?? 0)),
                color: saldoActual >= (estado?.saldo_inicial ?? 0) ? GREEN : RED },
            ].map(c => (
              <div key={c.label} style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${c.color}` }}>
                <div style={{ fontSize: '22px', marginBottom: '6px' }}>{c.icon}</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: c.color }}>{c.valor}</div>
                <div style={{ fontSize: '12px', color: GRAY, marginTop: '2px' }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* Desglose medio de pago */}
          <div style={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '20px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: `2px solid ${SEP}` }}>
              <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: NAVY }}>Desglose por medio de pago</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)' }}>
              {[
                { k: 'efectivo',      label: 'Efectivo',      icon: '💵' },
                { k: 'transferencia', label: 'Transferencia', icon: '🏦' },
                { k: 'cheques',       label: 'Cheques',       icon: '🧾' },
                { k: 'tarjeta',       label: 'Tarjeta',       icon: '💳' },
                { k: 'otros',         label: 'Otros',         icon: '📦' },
              ].map(({ k, label, icon }) => (
                <div key={k} style={{ padding: '16px 10px', textAlign: 'center', borderRight: '1px solid #EDF2F7' }}>
                  <div style={{ fontSize: '20px', marginBottom: '6px' }}>{icon}</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: NAVY }}>{fmt(desglose[k as keyof Desglose])}</div>
                  <div style={{ fontSize: '10px', color: GRAY, marginTop: '2px' }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Botones acción */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {[
              { tipo: 'ingreso_extra', label: '＋ Ingreso extra', bg: GREEN  },
              { tipo: 'gasto',         label: '➖ Gasto',         bg: ORANGE },
              { tipo: 'retiro',        label: '💸 Retiro',        bg: RED    },
              { tipo: 'deposito',      label: '💰 Depósito',      bg: BLUE   },
            ].map(b => (
              <button key={b.tipo} onClick={() => setModal({ tipo: b.tipo })}
                style={{ padding: '9px 18px', backgroundColor: b.bg, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                {b.label}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button onClick={() => setModal('cerrar')}
              style={{ padding: '9px 20px', backgroundColor: '#742a2a', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
              🔒 Cerrar caja
            </button>
          </div>

          {/* Tabla movimientos */}
          <div style={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: `2px solid ${SEP}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: NAVY }}>Movimientos del turno ({totalMovs})</h3>
              <select value={tipoMovFiltro}
                onChange={e => { setTipoMovFiltro(e.target.value); setPageMov(1); cajaId && cargarMovimientos(cajaId, 1, e.target.value); }}
                style={{ padding: '6px 10px', border: '1px solid #CBD5E0', borderRadius: '6px', fontSize: '12px', background: '#fff' }}>
                <option value="">Todos los tipos</option>
                {['apertura','venta','cobro','ingreso_extra','gasto','retiro','deposito','cierre'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {movimientos.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: GRAY, fontSize: '13px' }}>
                La caja está abierta pero aún no hay movimientos registrados.
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead style={{ backgroundColor: '#F7FAFC' }}>
                      <tr>
                        {['Hora', 'Tipo', 'Descripción', 'Medio de pago', 'Ingreso', 'Egreso', 'Comprobante'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: GRAY, fontWeight: 600, fontSize: '11px', borderBottom: '1px solid #EDF2F7' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {movimientos.map((m, idx) => {
                        const esIngreso = m.tipo_operacion === 'ingreso' || m.tipo === 'apertura';
                        return (
                          <tr key={m.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                            <td style={{ padding: '10px 14px', color: GRAY, whiteSpace: 'nowrap' }}>{fmtHora(m.hora)}</td>
                            <td style={{ padding: '10px 14px' }}><TipoBadge tipo={m.tipo} /></td>
                            <td style={{ padding: '10px 14px', color: TEXT }}>{m.descripcion || '—'}</td>
                            <td style={{ padding: '10px 14px', color: GRAY, fontSize: '12px' }}>{m.medio_pago?.replace(/_/g, ' ') || '—'}</td>
                            <td style={{ padding: '10px 14px', color: GREEN, fontWeight: 600 }}>{esIngreso && m.monto > 0 ? fmt(m.monto) : '—'}</td>
                            <td style={{ padding: '10px 14px', color: RED, fontWeight: 600 }}>{!esIngreso && m.monto > 0 ? fmt(m.monto) : '—'}</td>
                            <td style={{ padding: '10px 14px', color: GRAY, fontSize: '12px' }}>{m.numero_comprobante || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {totalMovs > 50 && (
                  <div style={{ padding: '10px 16px', borderTop: '1px solid #EDF2F7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: GRAY }}>
                    <span>Mostrando {movimientos.length} de {totalMovs}</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => { const p = Math.max(1, pageMov - 1); setPageMov(p); cajaId && cargarMovimientos(cajaId, p, tipoMovFiltro); }} disabled={pageMov === 1}
                        style={{ padding: '4px 10px', border: '1px solid #CBD5E0', borderRadius: '5px', cursor: pageMov === 1 ? 'default' : 'pointer', background: '#fff', fontSize: '12px', opacity: pageMov === 1 ? 0.4 : 1 }}>‹</button>
                      <button onClick={() => { const p = pageMov + 1; setPageMov(p); cajaId && cargarMovimientos(cajaId, p, tipoMovFiltro); }}
                        style={{ padding: '4px 10px', border: '1px solid #CBD5E0', borderRadius: '5px', cursor: 'pointer', background: '#fff', fontSize: '12px' }}>›</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default RobertoCaja;
