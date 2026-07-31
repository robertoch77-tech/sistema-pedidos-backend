import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { API_BASE } from '../../../config/api';
import { getToken } from '../../../utils/auth';
import ModalEliminar from '../components/ModalEliminar';

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

// ── Helpers ───────────────────────────────────────────────────
const fmt = (n: number | string) =>
  `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtFecha = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};

const isoHoy = () => new Date().toISOString().slice(0, 10);

function getClienteId(): number | null {
  try { const s = localStorage.getItem('roberto_portal_session'); return s ? JSON.parse(s).cliente?.id ?? null : null; }
  catch { return null; }
}

// ── Tipos ─────────────────────────────────────────────────────
interface ClienteFinal {
  id: number;
  comprador_nombre: string;
  comprador_cuit: string;
  comprador_razon_social: string;
  comprador_email: string;
  comprador_telefono: string;
  comprador_whatsapp: string;
  comprador_direccion: string;
  comprador_ciudad: string;
  condicion_iva: string;
  lista_precio_id: number;
  limite_credito: number;
  plazo_pago_dias: number;
  descuento_especial: number;
  es_mostrador: boolean;
  saldo: number;
  saldo_vencido: number;
  bloqueado: boolean;
  motivo_bloqueo: string;
  activo: boolean;
  ultima_compra: string | null;
  creado_en: string;
}

interface Movimiento {
  id: number;
  tipo: string;
  debe: number;
  haber: number;
  saldo_acumulado: number;
  descripcion: string;
  numero_comprobante: string;
  fecha_vencimiento: string | null;
  venta_id: number | null;
  estado: string;
  medio_pago: string;
  referencia: string;
  creado_en: string;
}

interface DashData {
  total_activos: number;
  con_deuda: number;
  deuda_vencida: number;
  nuevos_mes: number;
}

type Vista = 'lista' | 'cc';

// ── Estilos ───────────────────────────────────────────────────
const btnSt = (bg: string, color = '#fff', dis = false): React.CSSProperties => ({
  backgroundColor: dis ? '#CBD5E0' : bg, color: dis ? '#A0AEC0' : color,
  border: 'none', borderRadius: '8px', padding: '9px 16px',
  fontSize: '13px', fontWeight: 600, cursor: dis ? 'not-allowed' : 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
});
const inpSt: React.CSSProperties = {
  border: '1.5px solid #CBD5E0', borderRadius: '8px', padding: '8px 12px',
  fontSize: '13px', color: TEXT, outline: 'none', width: '100%',
  boxSizing: 'border-box', backgroundColor: '#fff',
};
const lblSt: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600, color: GRAY,
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px',
};
const secSt: React.CSSProperties = {
  fontSize: '12px', fontWeight: 700, color: NAVY, textTransform: 'uppercase',
  letterSpacing: '0.5px', borderBottom: `2px solid ${SEP}`,
  paddingBottom: '6px', marginBottom: '12px',
};

// ── Card ──────────────────────────────────────────────────────
function Card({ icon, label, valor, color }: { icon: string; label: string; valor: string | number; color: string }) {
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '20px 24px', borderLeft: `4px solid ${color}`, flex: '1 1 160px' }}>
      <div style={{ fontSize: '22px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color, marginBottom: '4px' }}>{valor}</div>
      <div style={{ fontSize: '12px', color: GRAY, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

// ── Paginación ────────────────────────────────────────────────
function Pag({ p, tp, pp, setP, setPP }: { p: number; tp: number; pp: number; setP: (n: number) => void; setPP: (n: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', flexWrap: 'wrap', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: GRAY }}>
        Filas:
        {[10, 25, 50].map(n => (
          <button key={n} onClick={() => { setPP(n); setP(1); }}
            style={{ backgroundColor: pp === n ? BLUE : '#EDF2F7', color: pp === n ? '#fff' : GRAY, border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>{n}</button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: GRAY }}>
        Pág. {p} de {tp}
        <button disabled={p <= 1} onClick={() => setP(p - 1)}
          style={{ backgroundColor: p <= 1 ? '#EDF2F7' : NAVY, color: p <= 1 ? GRAY : '#fff', border: 'none', borderRadius: '6px', padding: '5px 14px', fontSize: '12px', fontWeight: 600, cursor: p <= 1 ? 'not-allowed' : 'pointer' }}>← Ant.</button>
        <button disabled={p >= tp} onClick={() => setP(p + 1)}
          style={{ backgroundColor: p >= tp ? '#EDF2F7' : NAVY, color: p >= tp ? GRAY : '#fff', border: 'none', borderRadius: '6px', padding: '5px 14px', fontSize: '12px', fontWeight: 600, cursor: p >= tp ? 'not-allowed' : 'pointer' }}>Sig. →</button>
      </div>
    </div>
  );
}

// ── Badge tipo movimiento ─────────────────────────────────────
function BadgeTipo({ tipo }: { tipo: string }) {
  const map: Record<string, { bg: string; c: string; label: string }> = {
    venta:    { bg: '#FFF5F5', c: RED,    label: 'Venta'    },
    cobro:    { bg: '#F0FFF4', c: GREEN,  label: 'Cobro'    },
    nc:       { bg: '#EBF8FF', c: BLUE,   label: 'NC'       },
    nd:       { bg: '#FFFFF0', c: ORANGE, label: 'ND'       },
    ajuste:   { bg: '#EDF2F7', c: GRAY,   label: 'Ajuste'   },
  };
  const s = map[tipo] || { bg: '#EDF2F7', c: GRAY, label: tipo };
  return <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, backgroundColor: s.bg, color: s.c, whiteSpace: 'nowrap' }}>{s.label}</span>;
}

// ═══════════════════════════════════════════════════════════════
// MODAL NUEVO / EDITAR CLIENTE
// ═══════════════════════════════════════════════════════════════
const COND_IVA = ['Consumidor Final', 'Responsable Inscripto', 'Monotributista', 'Exento', 'No Responsable'];

function ModalCliente({ clienteId, token, cliente, onGuardado, onCerrar }: {
  clienteId: number; token: string;
  cliente: ClienteFinal | null;
  onGuardado: () => void; onCerrar: () => void;
}) {
  const authHdr = { 'x-superadmin-token': token, 'Content-Type': 'application/json' };
  const [tab, setTab] = useState<'datos' | 'condiciones'>('datos');
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState('');
  const [listas, setListas] = useState<{ id: number; nombre: string }[]>([]);

  const [form, setForm] = useState({
    comprador_nombre:       cliente?.comprador_nombre       || '',
    comprador_cuit:         cliente?.comprador_cuit         || '',
    comprador_razon_social: cliente?.comprador_razon_social || '',
    comprador_email:        cliente?.comprador_email        || '',
    comprador_telefono:     cliente?.comprador_telefono     || '',
    comprador_whatsapp:     cliente?.comprador_whatsapp     || '',
    comprador_direccion:    cliente?.comprador_direccion    || '',
    comprador_ciudad:       cliente?.comprador_ciudad       || '',
    condicion_iva:          cliente?.condicion_iva          || 'Consumidor Final',
    lista_precio_id:        String(cliente?.lista_precio_id || 1),
    limite_credito:         String(cliente?.limite_credito  || 0),
    plazo_pago_dias:        String(cliente?.plazo_pago_dias || 0),
    descuento_especial:     String(cliente?.descuento_especial || 0),
    es_mostrador:           cliente?.es_mostrador           || false,
  });

  const set = (k: string, v: string | boolean) => setForm(prev => ({ ...prev, [k]: v }));

  useEffect(() => {
    fetch(`${API_BASE}/api/superadmin/importador/listas-precio/${clienteId}`, { headers: { 'x-superadmin-token': token } })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setListas(d.listas || []))
      .catch(() => {});
  }, [clienteId, token]);

  const guardar = async () => {
    if (!form.comprador_nombre.trim()) { setErr('El nombre es requerido'); return; }
    setGuardando(true); setErr('');
    try {
      const body = {
        ...form,
        lista_precio_id:    parseInt(form.lista_precio_id, 10) || 1,
        limite_credito:     parseFloat(form.limite_credito)    || 0,
        plazo_pago_dias:    parseInt(form.plazo_pago_dias, 10) || 0,
        descuento_especial: parseFloat(form.descuento_especial) || 0,
      };
      const url = cliente
        ? `${API_BASE}/api/superadmin/clientes-finales/${clienteId}/${cliente.id}`
        : `${API_BASE}/api/superadmin/clientes-finales/${clienteId}`;
      const method = cliente ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers: authHdr, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { setErr(d.mensaje || 'Error'); return; }
      onGuardado();
    } catch { setErr('Error de red'); }
    finally { setGuardando(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '600px', boxShadow: '0 24px 72px rgba(0,0,0,0.3)', margin: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '18px 28px', borderBottom: `2px solid ${SEP}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: NAVY, margin: 0 }}>
            {cliente ? '✏️ Editar cliente' : '＋ Nuevo cliente'}
          </h2>
          <button onClick={onCerrar} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: GRAY }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #EDF2F7', padding: '0 28px' }}>
          {(['datos', 'condiciones'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 600, border: 'none', borderBottom: `2px solid ${tab === t ? BLUE : 'transparent'}`, cursor: 'pointer', backgroundColor: 'transparent', color: tab === t ? BLUE : GRAY }}>
              {t === 'datos' ? '📋 Datos' : '💰 Condiciones'}
            </button>
          ))}
        </div>

        <div style={{ padding: '24px 28px' }}>
          {tab === 'datos' && (
            <>
              <div style={secSt}>Datos del cliente</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={lblSt}>Nombre *</label>
                  <input value={form.comprador_nombre} onChange={e => set('comprador_nombre', e.target.value)} autoFocus style={inpSt} placeholder="Nombre del cliente" />
                </div>
                <div>
                  <label style={lblSt}>Razón social</label>
                  <input value={form.comprador_razon_social} onChange={e => set('comprador_razon_social', e.target.value)} style={inpSt} placeholder="Razón social" />
                </div>
                <div>
                  <label style={lblSt}>CUIT</label>
                  <input value={form.comprador_cuit} onChange={e => set('comprador_cuit', e.target.value)} style={inpSt} placeholder="XX-XXXXXXXX-X" />
                </div>
                <div>
                  <label style={lblSt}>Condición IVA</label>
                  <select value={form.condicion_iva} onChange={e => set('condicion_iva', e.target.value)} style={{ ...inpSt, cursor: 'pointer' }}>
                    {COND_IVA.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lblSt}>Email</label>
                  <input type="email" value={form.comprador_email} onChange={e => set('comprador_email', e.target.value)} style={inpSt} placeholder="email@ejemplo.com" />
                </div>
                <div>
                  <label style={lblSt}>Teléfono</label>
                  <input value={form.comprador_telefono} onChange={e => set('comprador_telefono', e.target.value)} style={inpSt} placeholder="0XX XXXXXXXX" />
                </div>
                <div>
                  <label style={lblSt}>WhatsApp</label>
                  <input value={form.comprador_whatsapp} onChange={e => set('comprador_whatsapp', e.target.value)} style={inpSt} placeholder="549XXXXXXXXXX" />
                </div>
                <div>
                  <label style={lblSt}>Dirección</label>
                  <input value={form.comprador_direccion} onChange={e => set('comprador_direccion', e.target.value)} style={inpSt} placeholder="Calle y número" />
                </div>
                <div>
                  <label style={lblSt}>Ciudad</label>
                  <input value={form.comprador_ciudad} onChange={e => set('comprador_ciudad', e.target.value)} style={inpSt} placeholder="Ciudad" />
                </div>
              </div>
              {/* Es mostrador toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                <button onClick={() => set('es_mostrador', !form.es_mostrador)}
                  style={{ width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer', backgroundColor: form.es_mostrador ? GREEN : '#CBD5E0', position: 'relative', transition: 'background 0.2s' }}>
                  <span style={{ position: 'absolute', top: '3px', left: form.es_mostrador ? '21px' : '3px', width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.2s' }} />
                </button>
                <span style={{ fontSize: '13px', color: TEXT, fontWeight: 500 }}>Es cliente de mostrador</span>
              </div>
            </>
          )}

          {tab === 'condiciones' && (
            <>
              <div style={secSt}>Condiciones comerciales</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={lblSt}>Lista de precio</label>
                  <select value={form.lista_precio_id} onChange={e => set('lista_precio_id', e.target.value)} style={{ ...inpSt, cursor: 'pointer' }}>
                    <option value="1">Lista 1 (default)</option>
                    {listas.map(l => <option key={l.id} value={String(l.id)}>{l.nombre || `Lista ${l.id}`}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lblSt}>Descuento especial %</label>
                  <input type="number" min="0" max="100" step="0.01" value={form.descuento_especial}
                    onChange={e => set('descuento_especial', e.target.value)} style={inpSt} placeholder="0" />
                </div>
                <div>
                  <label style={lblSt}>Límite de crédito ($)</label>
                  <input type="number" min="0" step="0.01" value={form.limite_credito}
                    onChange={e => set('limite_credito', e.target.value)} style={inpSt} placeholder="0" />
                </div>
                <div>
                  <label style={lblSt}>Plazo de pago (días)</label>
                  <input type="number" min="0" step="1" value={form.plazo_pago_dias}
                    onChange={e => set('plazo_pago_dias', e.target.value)} style={inpSt} placeholder="0" />
                </div>
              </div>
            </>
          )}

          {err && <div style={{ backgroundColor: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: RED, margin: '12px 0' }}>{err}</div>}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button onClick={onCerrar}  style={btnSt('#EDF2F7', GRAY)}>Cancelar</button>
            <button onClick={guardar} disabled={guardando} style={btnSt(GREEN, '#fff', guardando)}>
              {guardando ? '⏳ Guardando...' : '✅ Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODAL REGISTRAR COBRO
// ═══════════════════════════════════════════════════════════════
const MEDIOS_PAGO = ['Efectivo', 'Transferencia', 'Débito', 'Crédito', 'Cheque', 'QR/MercadoPago', 'Otro'];

function ModalCobro({ clienteId, token, cliente, movsPendientes, onCobrado, onCerrar }: {
  clienteId: number; token: string; cliente: ClienteFinal;
  movsPendientes: Movimiento[];
  onCobrado: () => void; onCerrar: () => void;
}) {
  const authHdr = { 'x-superadmin-token': token, 'Content-Type': 'application/json' };
  const [monto,     setMonto]     = useState('');
  const [fecha,     setFecha]     = useState(isoHoy());
  const [medioPago, setMedioPago] = useState('Efectivo');
  const [referencia, setRef]      = useState('');
  const [observ,    setObserv]    = useState('');
  const [nroCheque, setNroCheque] = useState('');
  const [banco,     setBanco]     = useState('');
  const [fchCobro,  setFchCobro]  = useState('');
  const [tipoCheque, setTipoCheque] = useState('tercero');
  const [titular,   setTitular]   = useState('');
  const [selMovs,   setSelMovs]   = useState<number[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [err, setErr] = useState('');

  const esCheque = medioPago === 'Cheque';

  const confirmar = async () => {
    if (!monto || parseFloat(monto) <= 0) { setErr('Ingresá un monto válido'); return; }
    setProcesando(true); setErr('');
    try {
      const ref = esCheque
        ? `Cheque #${nroCheque} - ${banco} - ${tipoCheque}${titular ? ` - ${titular}` : ''}`
        : referencia;
      const r = await fetch(`${API_BASE}/api/superadmin/clientes-finales/${clienteId}/${cliente.id}/movimiento`, {
        method: 'POST', headers: authHdr,
        body: JSON.stringify({
          tipo: 'cobro', haber: parseFloat(monto), debe: 0,
          descripcion: `Cobro ${medioPago}${observ ? ` - ${observ}` : ''}`,
          numero_comprobante: ref,
          medio_pago: medioPago,
          referencia: ref,
          observaciones: observ,
          estado: 'cancelado',
        }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.mensaje || 'Error'); return; }
      // Cancelar movimientos seleccionados
      for (const mid of selMovs) {
        await fetch(`${API_BASE}/api/superadmin/clientes-finales/${clienteId}/${cliente.id}/movimiento`, {
          method: 'POST', headers: authHdr,
          body: JSON.stringify({ tipo: 'ajuste', haber: 0, debe: 0, descripcion: `Cancelado por cobro`, estado: 'cancelado', referencia: String(mid) }),
        }).catch(() => {});
      }
      alert(`✅ Cobro de ${fmt(parseFloat(monto))} registrado`);
      onCobrado();
    } catch { setErr('Error de red'); }
    finally { setProcesando(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '16px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '560px', boxShadow: '0 24px 72px rgba(0,0,0,0.3)', margin: 'auto' }}>
        <div style={{ padding: '18px 28px', borderBottom: `2px solid ${SEP}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: NAVY, margin: 0 }}>💵 Registrar cobro — {cliente.comprador_nombre}</h2>
          <button onClick={onCerrar} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: GRAY }}>×</button>
        </div>
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={lblSt}>Monto *</label>
              <input type="number" value={monto} onChange={e => setMonto(e.target.value)} autoFocus style={inpSt} placeholder="0.00" min="0.01" step="0.01" />
            </div>
            <div>
              <label style={lblSt}>Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inpSt} />
            </div>
            <div>
              <label style={lblSt}>Medio de pago</label>
              <select value={medioPago} onChange={e => setMedioPago(e.target.value)} style={{ ...inpSt, cursor: 'pointer' }}>
                {MEDIOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={lblSt}>Referencia</label>
              <input value={referencia} onChange={e => setRef(e.target.value)} style={inpSt} placeholder="Nro. de referencia" />
            </div>
          </div>

          {/* Campos cheque */}
          {esCheque && (
            <div style={{ backgroundColor: '#EBF8FF', borderRadius: '10px', padding: '14px 16px', marginBottom: '12px' }}>
              <div style={{ ...secSt, borderBottomColor: '#90CDF4' }}>Datos del cheque</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={lblSt}>Número</label>
                  <input value={nroCheque} onChange={e => setNroCheque(e.target.value)} style={inpSt} placeholder="XXXXXXXX" />
                </div>
                <div>
                  <label style={lblSt}>Banco</label>
                  <input value={banco} onChange={e => setBanco(e.target.value)} style={inpSt} placeholder="Banco" />
                </div>
                <div>
                  <label style={lblSt}>Fecha de cobro</label>
                  <input type="date" value={fchCobro} onChange={e => setFchCobro(e.target.value)} style={inpSt} />
                </div>
                <div>
                  <label style={lblSt}>Tipo</label>
                  <select value={tipoCheque} onChange={e => setTipoCheque(e.target.value)} style={{ ...inpSt, cursor: 'pointer' }}>
                    <option value="propio">Propio</option>
                    <option value="tercero">De tercero</option>
                    <option value="echeq">E-Cheq</option>
                  </select>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={lblSt}>Titular</label>
                  <input value={titular} onChange={e => setTitular(e.target.value)} style={inpSt} placeholder="Nombre del titular" />
                </div>
              </div>
            </div>
          )}

          {/* Comprobantes pendientes */}
          {movsPendientes.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <label style={lblSt}>Comprobantes que cancela</label>
              <div style={{ border: '1px solid #EDF2F7', borderRadius: '8px', maxHeight: '160px', overflowY: 'auto' }}>
                {movsPendientes.map(m => (
                  <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderBottom: '1px solid #F7FAFC', cursor: 'pointer', fontSize: '13px' }}>
                    <input type="checkbox" checked={selMovs.includes(m.id)}
                      onChange={e => setSelMovs(prev => e.target.checked ? [...prev, m.id] : prev.filter(x => x !== m.id))} />
                    <span style={{ flex: 1, color: TEXT }}>{m.descripcion || `Mov. #${m.id}`}</span>
                    <span style={{ fontWeight: 700, color: RED, fontFamily: 'monospace' }}>{fmt(m.debe)}</span>
                    {m.fecha_vencimiento && <span style={{ fontSize: '11px', color: new Date(m.fecha_vencimiento) < new Date() ? RED : GRAY }}>{fmtFecha(m.fecha_vencimiento)}</span>}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom: '12px' }}>
            <label style={lblSt}>Observaciones</label>
            <textarea value={observ} onChange={e => setObserv(e.target.value)} rows={2}
              style={{ ...inpSt, resize: 'vertical', fontFamily: 'inherit', height: '56px' }} />
          </div>

          {err && <div style={{ backgroundColor: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: RED, marginBottom: '12px' }}>{err}</div>}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button onClick={onCerrar}   style={btnSt('#EDF2F7', GRAY)}>Cancelar</button>
            <button onClick={confirmar} disabled={procesando} style={btnSt(GREEN, '#fff', procesando)}>
              {procesando ? '⏳...' : '✅ Registrar cobro'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODAL VENTA MANUAL
// ═══════════════════════════════════════════════════════════════
function ModalVentaManual({ clienteId, token, cliente, onRegistrado, onCerrar }: {
  clienteId: number; token: string; cliente: ClienteFinal;
  onRegistrado: () => void; onCerrar: () => void;
}) {
  const authHdr = { 'x-superadmin-token': token, 'Content-Type': 'application/json' };
  const [desc,   setDesc]   = useState('');
  const [monto,  setMonto]  = useState('');
  const [fecha,  setFecha]  = useState(isoHoy());
  const [nroCmp, setNroCmp] = useState('');
  const [fchVenc, setFchVenc] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [err, setErr] = useState('');

  const registrar = async () => {
    if (!monto || parseFloat(monto) <= 0) { setErr('Ingresá un monto válido'); return; }
    setProcesando(true); setErr('');
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/clientes-finales/${clienteId}/${cliente.id}/movimiento`, {
        method: 'POST', headers: authHdr,
        body: JSON.stringify({
          tipo: 'venta', debe: parseFloat(monto), haber: 0,
          descripcion: desc || 'Venta manual',
          numero_comprobante: nroCmp,
          fecha_vencimiento: fchVenc || null,
          estado: 'pendiente',
        }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.mensaje || 'Error'); return; }
      alert('✅ Venta registrada');
      onRegistrado();
    } catch { setErr('Error de red'); }
    finally { setProcesando(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '480px', boxShadow: '0 24px 72px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '18px 28px', borderBottom: `2px solid ${SEP}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: NAVY, margin: 0 }}>🧾 Venta manual — {cliente.comprador_nombre}</h2>
          <button onClick={onCerrar} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: GRAY }}>×</button>
        </div>
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={lblSt}>Descripción</label>
              <input value={desc} onChange={e => setDesc(e.target.value)} autoFocus style={inpSt} placeholder="Descripción de la venta" />
            </div>
            <div>
              <label style={lblSt}>Monto *</label>
              <input type="number" value={monto} onChange={e => setMonto(e.target.value)} style={inpSt} placeholder="0.00" min="0.01" step="0.01" />
            </div>
            <div>
              <label style={lblSt}>Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inpSt} />
            </div>
            <div>
              <label style={lblSt}>Nro. comprobante</label>
              <input value={nroCmp} onChange={e => setNroCmp(e.target.value)} style={inpSt} placeholder="A 0001-00000001" />
            </div>
            <div>
              <label style={lblSt}>Vencimiento</label>
              <input type="date" value={fchVenc} onChange={e => setFchVenc(e.target.value)} style={inpSt} />
            </div>
          </div>
          {err && <div style={{ backgroundColor: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: RED, marginBottom: '12px' }}>{err}</div>}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button onClick={onCerrar} style={btnSt('#EDF2F7', GRAY)}>Cancelar</button>
            <button onClick={registrar} disabled={procesando} style={btnSt(BLUE, '#fff', procesando)}>
              {procesando ? '⏳...' : '🧾 Registrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODAL BLOQUEAR
// ═══════════════════════════════════════════════════════════════
function ModalBloquear({ clienteId, token, cliente, onActualizado, onCerrar }: {
  clienteId: number; token: string; cliente: ClienteFinal;
  onActualizado: () => void; onCerrar: () => void;
}) {
  const authHdr = { 'x-superadmin-token': token, 'Content-Type': 'application/json' };
  const [motivo, setMotivo] = useState(cliente.motivo_bloqueo || '');
  const [procesando, setProcesando] = useState(false);

  const accion = async (bloquear: boolean) => {
    setProcesando(true);
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/clientes-finales/${clienteId}/${cliente.id}/bloquear`, {
        method: 'PUT', headers: authHdr,
        body: JSON.stringify({ bloqueado: bloquear, motivo_bloqueo: bloquear ? motivo : '' }),
      });
      if (r.ok) { onActualizado(); } else { alert('Error al actualizar'); }
    } catch { alert('Error de red'); }
    finally { setProcesando(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '420px', boxShadow: '0 24px 72px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '18px 28px', borderBottom: `2px solid ${SEP}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: NAVY, margin: 0 }}>
            {cliente.bloqueado ? '🔓 Desbloquear cliente' : '🔒 Bloquear cliente'}
          </h2>
          <button onClick={onCerrar} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: GRAY }}>×</button>
        </div>
        <div style={{ padding: '24px 28px' }}>
          <p style={{ fontSize: '14px', color: TEXT, marginBottom: '16px' }}>
            Cliente: <strong>{cliente.comprador_nombre}</strong>
          </p>
          {!cliente.bloqueado && (
            <div style={{ marginBottom: '16px' }}>
              <label style={lblSt}>Motivo del bloqueo</label>
              <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} autoFocus
                style={{ ...inpSt, resize: 'vertical', fontFamily: 'inherit', height: '80px' }}
                placeholder="Indicá el motivo del bloqueo..." />
            </div>
          )}
          {cliente.bloqueado && cliente.motivo_bloqueo && (
            <div style={{ backgroundColor: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: RED }}>
              Motivo actual: {cliente.motivo_bloqueo}
            </div>
          )}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button onClick={onCerrar} style={btnSt('#EDF2F7', GRAY)}>Cancelar</button>
            {cliente.bloqueado
              ? <button onClick={() => accion(false)} disabled={procesando} style={btnSt(GREEN, '#fff', procesando)}>{procesando ? '⏳...' : '🔓 Desbloquear'}</button>
              : <button onClick={() => accion(true)}  disabled={procesando} style={btnSt(RED,   '#fff', procesando)}>{procesando ? '⏳...' : '🔒 Bloquear'}</button>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANTALLA CUENTA CORRIENTE
// ═══════════════════════════════════════════════════════════════
function PantallaCuentaCorriente({ clienteId, token, cliente: clienteInicial, onVolver, onClienteUpdated }: {
  clienteId: number; token: string; cliente: ClienteFinal;
  onVolver: () => void; onClienteUpdated: (c: ClienteFinal) => void;
}) {
  const authHdr = { 'x-superadmin-token': token };
  const [cliente,    setCliente]    = useState(clienteInicial);
  const [movs,       setMovs]       = useState<Movimiento[]>([]);
  const [total,      setTotal]      = useState(0);
  const [pagina,     setPagina]     = useState(1);
  const [porPagina,  setPorPagina]  = useState(25);
  const [totalPags,  setTotalPags]  = useState(1);
  const [cargando,   setCargando]   = useState(false);
  const [fDesde,     setFDesde]     = useState('');
  const [fHasta,     setFHasta]     = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [busqCmp,    setBusqCmp]    = useState('');
  const [modalCobro,    setModalCobro]    = useState(false);
  const [modalVenta,    setModalVenta]    = useState(false);
  const [modalBloquear, setModalBloquear] = useState(false);

  const cargarCliente = useCallback(async () => {
    const r = await fetch(`${API_BASE}/api/superadmin/clientes-finales/${clienteId}/${cliente.id}`, { headers: authHdr });
    if (r.ok) { const d = await r.json(); setCliente(d.cliente); onClienteUpdated(d.cliente); }
  }, [clienteId, cliente.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargarMovs = useCallback(async () => {
    setCargando(true);
    try {
      const p = new URLSearchParams({
        page: String(pagina), limit: String(porPagina),
        ...(fDesde     && { fecha_desde: fDesde     }),
        ...(fHasta     && { fecha_hasta: fHasta     }),
        ...(filtroTipo && { tipo:        filtroTipo }),
        ...(busqCmp    && { buscar:      busqCmp    }),
      });
      const r = await fetch(`${API_BASE}/api/superadmin/clientes-finales/${clienteId}/${cliente.id}/movimientos?${p}`, { headers: authHdr });
      if (r.ok) {
        const d = await r.json();
        setMovs(d.movimientos || []);
        setTotal(d.total || 0);
        setTotalPags(d.paginas || 1);
      }
    } catch { /* silent */ }
    finally { setCargando(false); }
  }, [clienteId, cliente.id, pagina, porPagina, fDesde, fHasta, filtroTipo, busqCmp]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(cargarMovs, 300);
    return () => clearTimeout(t);
  }, [cargarMovs]);

  const movsPendientes = movs.filter(m => m.estado === 'pendiente' && m.debe > 0);

  const exportarExcel = () => {
    if (!movs.length) { alert('No hay movimientos para exportar'); return; }
    const rows = [
      ['Fecha', 'Tipo', 'Descripción', 'Comprobante', 'Debe', 'Haber', 'Saldo', 'Vencimiento', 'Estado'].join('\t'),
      ...movs.map(m => [
        fmtFecha(m.creado_en), m.tipo, m.descripcion, m.numero_comprobante,
        m.debe, m.haber, m.saldo_acumulado, fmtFecha(m.fecha_vencimiento), m.estado,
      ].join('\t')),
    ].join('\n');
    const blob = new Blob([rows], { type: 'text/tab-separated-values;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `CC-${cliente.comprador_nombre}.xls`; a.click();
    URL.revokeObjectURL(url);
  };

  const imprimirPDF = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const filas = movs.map(m => {
      const vencido = m.fecha_vencimiento && new Date(m.fecha_vencimiento) < new Date() && m.estado === 'pendiente';
      return `<tr>
        <td>${fmtFecha(m.creado_en)}</td>
        <td>${m.tipo}</td>
        <td>${m.descripcion}</td>
        <td>${m.numero_comprobante || '—'}</td>
        <td style="text-align:right">${m.debe > 0 ? fmt(m.debe) : ''}</td>
        <td style="text-align:right">${m.haber > 0 ? fmt(m.haber) : ''}</td>
        <td style="text-align:right;font-weight:bold">${fmt(m.saldo_acumulado)}</td>
        <td style="color:${vencido ? '#E53E3E' : '#000'}">${fmtFecha(m.fecha_vencimiento)}</td>
        <td>${m.estado}</td>
      </tr>`;
    }).join('');
    const saldoColor = Number(cliente.saldo) > 0 ? '#E53E3E' : '#38A169';
    const cfgCli = (() => { try { return JSON.parse(localStorage.getItem(`roberto_config_${getClienteId()}`) || '{}'); } catch { return {}; } })();
    const logoUrlCli = cfgCli.logo_url         || '';
    const negNomCli  = cfgCli.nombre_comercial || '';
    const negDirCli  = cfgCli.direccion        || '';
    const negCuitCli = cfgCli.cuit             || '';
    const logoBlockCli = `<div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #e2e8f0">
      ${logoUrlCli ? `<img src="${logoUrlCli}" alt="" style="max-width:120px;max-height:50px;object-fit:contain;flex-shrink:0">` : ''}
      <div>
        ${negNomCli  ? `<div style="font-size:14px;font-weight:700">${negNomCli}</div>`   : ''}
        ${negDirCli  ? `<div style="font-size:10px;color:#666">${negDirCli}</div>`        : ''}
        ${negCuitCli ? `<div style="font-size:10px;color:#666">CUIT: ${negCuitCli}</div>` : ''}
      </div>
    </div>`;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>CC ${cliente.comprador_nombre}</title>
<style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;font-size:10px}
h2{color:#1B2A4A;margin:0 0 4px}p{margin:2px 0;color:#718096;font-size:11px}
.saldo{font-size:22px;font-weight:800;color:${saldoColor};margin-bottom:12px}
table{width:100%;border-collapse:collapse}
th{background:#1B2A4A;color:#fff;padding:5px 8px;text-align:left;font-size:9px}
td{padding:4px 8px;border-bottom:1px solid #eee;font-size:9px}</style>
</head><body>
${logoBlockCli}
<h2>Cuenta Corriente — ${cliente.comprador_nombre}</h2>
<p>${cliente.comprador_cuit ? `CUIT: ${cliente.comprador_cuit}` : ''} ${cliente.comprador_telefono ? `| Tel: ${cliente.comprador_telefono}` : ''}</p>
<div class="saldo">Saldo: ${fmt(Number(cliente.saldo))}</div>
<table><thead><tr>
<th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Comprobante</th>
<th>Debe</th><th>Haber</th><th>Saldo</th><th>Vencimiento</th><th>Estado</th>
</tr></thead><tbody>${filas}</tbody></table>
<p style="margin-top:12px;font-size:9px;color:#A0AEC0">Impreso el ${new Date().toLocaleDateString('es-AR')}</p>
</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 350);
  };

  const saldo       = Number(cliente.saldo)        || 0;
  const saldoVenc   = Number(cliente.saldo_vencido) || 0;
  const proxVenc    = movsPendientes.filter(m => m.fecha_vencimiento && new Date(m.fecha_vencimiento) >= new Date()).sort((a, b) => new Date(a.fecha_vencimiento!).getTime() - new Date(b.fecha_vencimiento!).getTime())[0];
  const ultimoCobro = movs.filter(m => m.tipo === 'cobro').sort((a, b) => new Date(b.creado_en).getTime() - new Date(a.creado_en).getTime())[0];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, padding: '28px', fontFamily: 'system-ui,-apple-system,sans-serif' }}>

      {/* Banner bloqueado */}
      {cliente.bloqueado && (
        <div style={{ backgroundColor: '#FFF5F5', border: '2px solid #FEB2B2', borderRadius: '10px', padding: '12px 20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '20px' }}>🔒</span>
          <div>
            <div style={{ fontWeight: 700, color: RED }}>Cliente bloqueado</div>
            {cliente.motivo_bloqueo && <div style={{ fontSize: '13px', color: RED }}>{cliente.motivo_bloqueo}</div>}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={onVolver} style={btnSt('#EDF2F7', GRAY)}>← Volver</button>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: NAVY, margin: '0 0 2px' }}>💳 {cliente.comprador_nombre}</h2>
            {cliente.comprador_cuit && <p style={{ fontSize: '12px', color: GRAY, margin: 0 }}>CUIT: {cliente.comprador_cuit}</p>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setModalCobro(true)}  style={btnSt(GREEN)}>💵 Registrar cobro</button>
          <button onClick={() => setModalVenta(true)}  style={btnSt(BLUE)}>🧾 Venta manual</button>
          <button onClick={exportarExcel}              style={btnSt('#EDF2F7', GRAY)}>📤 Exportar Excel</button>
          <button onClick={imprimirPDF}                style={btnSt('#EDF2F7', GRAY)}>🖨️ PDF</button>
        </div>
      </div>

      {/* Saldo grande */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '24px 28px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '12px', color: GRAY, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Saldo actual</div>
            <div style={{ fontSize: '36px', fontWeight: 800, color: saldo > 0 ? RED : GREEN, lineHeight: 1 }}>
              {fmt(Math.abs(saldo))}
            </div>
            <div style={{ fontSize: '12px', color: GRAY, marginTop: '4px' }}>
              {saldo > 0 ? 'Deuda del cliente' : saldo < 0 ? 'Saldo a favor' : 'Sin deuda'}
            </div>
          </div>
          {saldoVenc > 0 && (
            <div>
              <div style={{ fontSize: '12px', color: GRAY, fontWeight: 600, textTransform: 'uppercase' }}>Vencido</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: RED }}>{fmt(saldoVenc)}</div>
            </div>
          )}
          {proxVenc && (
            <div>
              <div style={{ fontSize: '12px', color: GRAY, fontWeight: 600, textTransform: 'uppercase' }}>Próximo venc.</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: ORANGE }}>{fmtFecha(proxVenc.fecha_vencimiento)}</div>
              <div style={{ fontSize: '12px', color: GRAY }}>{fmt(proxVenc.debe)}</div>
            </div>
          )}
          {ultimoCobro && (
            <div>
              <div style={{ fontSize: '12px', color: GRAY, fontWeight: 600, textTransform: 'uppercase' }}>Último cobro</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: GREEN }}>{fmt(ultimoCobro.haber)}</div>
              <div style={{ fontSize: '12px', color: GRAY }}>{fmtFecha(ultimoCobro.creado_en)}</div>
            </div>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button onClick={() => setModalBloquear(true)} style={btnSt(cliente.bloqueado ? GREEN : RED)}>
              {cliente.bloqueado ? '🔓 Desbloquear' : '🔒 Bloquear'}
            </button>
          </div>
        </div>
      </div>

      {/* Filtros movimientos */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', padding: '14px 20px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 180px' }}>
            <label style={lblSt}>Buscar comprobante</label>
            <input value={busqCmp} onChange={e => { setBusqCmp(e.target.value); setPagina(1); }} placeholder="Nro. o descripción..." style={inpSt} />
          </div>
          <div style={{ flex: '0 1 150px' }}>
            <label style={lblSt}>Tipo</label>
            <select value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setPagina(1); }} style={{ ...inpSt, cursor: 'pointer' }}>
              <option value="">Todos</option>
              <option value="venta">Venta</option>
              <option value="cobro">Cobro</option>
              <option value="nc">Nota crédito</option>
              <option value="nd">Nota débito</option>
              <option value="ajuste">Ajuste</option>
            </select>
          </div>
          <div style={{ flex: '0 1 140px' }}>
            <label style={lblSt}>Desde</label>
            <input type="date" value={fDesde} onChange={e => { setFDesde(e.target.value); setPagina(1); }} style={inpSt} />
          </div>
          <div style={{ flex: '0 1 140px' }}>
            <label style={lblSt}>Hasta</label>
            <input type="date" value={fHasta} onChange={e => { setFHasta(e.target.value); setPagina(1); }} style={inpSt} />
          </div>
          {(busqCmp || filtroTipo || fDesde || fHasta) && (
            <button onClick={() => { setBusqCmp(''); setFiltroTipo(''); setFDesde(''); setFHasta(''); setPagina(1); }}
              style={{ ...btnSt('#EDF2F7', GRAY), alignSelf: 'flex-end' }}>Limpiar</button>
          )}
        </div>
      </div>

      {/* Tabla movimientos */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #EDF2F7', fontSize: '13px', color: GRAY }}>
          {total.toLocaleString('es-AR')} movimientos
        </div>
        {cargando ? (
          <div style={{ padding: '48px', textAlign: 'center', color: GRAY }}>Cargando...</div>
        ) : movs.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
            <p style={{ color: GRAY }}>Sin movimientos registrados.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '860px' }}>
              <thead>
                <tr style={{ backgroundColor: '#EBF4FF' }}>
                  {['Fecha', 'Tipo', 'Descripción', 'Comprobante', 'Debe', 'Haber', 'Saldo', 'Vencimiento', 'Estado'].map(col => (
                    <th key={col} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: NAVY, borderBottom: `2px solid ${SEP}`, whiteSpace: 'nowrap', fontSize: '12px' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movs.map((m, idx) => {
                  const vencido = m.fecha_vencimiento && new Date(m.fecha_vencimiento) < new Date() && m.estado === 'pendiente';
                  return (
                    <tr key={m.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                      <td style={{ padding: '8px 12px', color: GRAY, fontSize: '12px', whiteSpace: 'nowrap' }}>{fmtFecha(m.creado_en)}</td>
                      <td style={{ padding: '8px 12px' }}><BadgeTipo tipo={m.tipo} /></td>
                      <td style={{ padding: '8px 12px', color: TEXT, maxWidth: '200px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.descripcion || '—'}</div>
                      </td>
                      <td style={{ padding: '8px 12px', color: GRAY, fontSize: '12px', fontFamily: 'monospace' }}>{m.numero_comprobante || '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: m.debe > 0 ? 700 : 400, color: m.debe > 0 ? RED : GRAY, fontFamily: 'monospace' }}>
                        {m.debe > 0 ? fmt(m.debe) : ''}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: m.haber > 0 ? 700 : 400, color: m.haber > 0 ? GREEN : GRAY, fontFamily: 'monospace' }}>
                        {m.haber > 0 ? fmt(m.haber) : ''}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: Number(m.saldo_acumulado) > 0 ? RED : GREEN }}>
                        {fmt(m.saldo_acumulado)}
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: '12px', color: vencido ? RED : GRAY, fontWeight: vencido ? 700 : 400, whiteSpace: 'nowrap' }}>
                        {fmtFecha(m.fecha_vencimiento)}
                        {vencido && <span style={{ marginLeft: '4px' }}>⚠️</span>}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, backgroundColor: m.estado === 'cancelado' ? '#F0FFF4' : '#FFFFF0', color: m.estado === 'cancelado' ? GREEN : ORANGE }}>
                          {m.estado === 'cancelado' ? 'Cancelado' : 'Pendiente'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pag p={pagina} tp={totalPags} pp={porPagina} setP={setPagina} setPP={setPorPagina} />

      {/* Modales */}
      {modalCobro && (
        <ModalCobro clienteId={clienteId} token={token} cliente={cliente} movsPendientes={movsPendientes}
          onCobrado={() => { setModalCobro(false); cargarMovs(); cargarCliente(); }}
          onCerrar={() => setModalCobro(false)} />
      )}
      {modalVenta && (
        <ModalVentaManual clienteId={clienteId} token={token} cliente={cliente}
          onRegistrado={() => { setModalVenta(false); cargarMovs(); cargarCliente(); }}
          onCerrar={() => setModalVenta(false)} />
      )}
      {modalBloquear && (
        <ModalBloquear clienteId={clienteId} token={token} cliente={cliente}
          onActualizado={() => { setModalBloquear(false); cargarCliente(); }}
          onCerrar={() => setModalBloquear(false)} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// MODAL IMPORTAR CLIENTES DESDE EXCEL
// ═══════════════════════════════════════════════════════════════
const CAMPOS_CLIENTES = [
  { key: 'nombre',        label: 'Nombre *',         req: true  },
  { key: 'cuit',          label: 'CUIT',             req: false },
  { key: 'razon_social',  label: 'Razón social',     req: false },
  { key: 'email',         label: 'Email',            req: false },
  { key: 'telefono',      label: 'Teléfono',         req: false },
  { key: 'whatsapp',      label: 'WhatsApp',         req: false },
  { key: 'direccion',     label: 'Dirección',        req: false },
  { key: 'ciudad',        label: 'Ciudad',           req: false },
  { key: 'condicion_iva',     label: 'Condición IVA',     req: false },
  { key: 'limite_credito',    label: 'Límite crédito',    req: false },
  { key: 'plazo_pago_dias',   label: 'Plazo pago (días)', req: false },
  { key: 'descuento_especial',label: 'Descuento especial',req: false },
];

function normHdr(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

function autoDetectMap(cols: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const aliases: Record<string, string[]> = {
    nombre:        ['nombre', 'name', 'cliente', 'razon', 'razonsocial'],
    cuit:          ['cuit', 'cuil', 'rut', 'nif', 'documento'],
    razon_social:  ['razonsocial', 'razon', 'denominacion'],
    email:         ['email', 'mail', 'correo', 'emailaddress'],
    telefono:      ['telefono', 'tel', 'phone', 'celular'],
    whatsapp:      ['whatsapp', 'wsp', 'ws'],
    direccion:     ['direccion', 'domicilio', 'address', 'calle'],
    ciudad:        ['ciudad', 'localidad', 'city'],
    condicion_iva:     ['condicioniva', 'iva', 'condicion', 'condicionafip'],
    limite_credito:    ['limitecredito', 'limite', 'credito', 'creditlimit'],
    plazo_pago_dias:   ['plazopago', 'plazo', 'diaspago', 'paymentterm'],
    descuento_especial:['descuento', 'descuentoespecial', 'discount', 'dto'],
  };
  cols.forEach(col => {
    const n = normHdr(col);
    for (const [field, alts] of Object.entries(aliases)) {
      if (alts.some(a => n.includes(a)) && !map[field]) {
        map[field] = col;
      }
    }
  });
  return map;
}

interface ImportModalProps {
  cid: number | null;
  token: string | null;
  onClose: () => void;
  onDone: () => void;
}

function ModalImportarClientes({ cid, token, onClose, onDone }: ImportModalProps) {
  const [paso, setPaso] = useState(1);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [columnas, setColumnas] = useState<string[]>([]);
  const [muestra, setMuestra] = useState<string[][]>([]);
  const [mapeo, setMapeo] = useState<Record<string, string>>({});
  const [conflicto, setConflicto] = useState<'saltar' | 'actualizar'>('actualizar');
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<{ importados: number; actualizados: number; saltados: number; errores: number } | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [todasFilas, setTodasFilas] = useState<string[][]>([]);
  const [filaEncabezado, setFilaEncabezado] = useState<number>(0);

  function procesarArchivo(f: File) {
    setArchivo(f);
    setError('');
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: string[][] = (XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][])
          .map(r => r.map(c => String(c ?? '')));
        let hdrIdx = 0; let maxFull = 0;
        rows.slice(0, 10).forEach((row, i) => {
          const full = row.filter(c => c.trim()).length;
          if (full > maxFull) { maxFull = full; hdrIdx = i; }
        });
        setTodasFilas(rows);
        setFilaEncabezado(hdrIdx);
        setPaso(15);
      } catch {
        setError('No se pudo leer el archivo. Asegurate que sea .xlsx, .xls o .csv');
      }
    };
    reader.readAsArrayBuffer(f);
  }

  function confirmarEncabezado() {
    const filaCruda = todasFilas[filaEncabezado]?.map(c => c.trim()) ?? [];
    const posMap: Record<string, number> = {};
    filaCruda.forEach((c, i) => { if (c && !posMap[c]) posMap[c] = i; });
    const cols = filaCruda.filter(Boolean);
    const dataFilas = todasFilas.slice(filaEncabezado + 1).filter(r => r.some(c => c.trim()));
    const preview = dataFilas.slice(0, 3).map(r => cols.map(col => r[posMap[col]] ?? ''));
    setColumnas(cols);
    setMuestra(preview);
    setMapeo(autoDetectMap(cols));
    setPaso(2);
  }

  async function importar() {
    if (!cid || !archivo) return;
    if (!Object.values(mapeo).find((_, i) => Object.keys(mapeo)[i] === 'nombre') && !mapeo['nombre']) {
      setError('Debés mapear el campo Nombre.');
      return;
    }
    setCargando(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      fd.append('mapeo', JSON.stringify(mapeo));
      fd.append('conflicto', conflicto);
      fd.append('filaEncabezado', String(filaEncabezado));
      const res = await fetch(`${API_BASE}/api/superadmin/importador-entidades/clientes/${cid}/importar`, {
        method: 'POST', headers: { 'x-superadmin-token': token || '' }, body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al importar');
      setResultado(json);
      setPaso(3);
    } catch (e: any) {
      setError(e.message || 'Error al importar');
    } finally {
      setCargando(false);
    }
  }

  const ovStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
  };
  const panStyle: React.CSSProperties = {
    backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '620px',
    maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  };

  return (
    <div style={ovStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={panStyle}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #EDF2F7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, color: NAVY, fontSize: '16px', fontWeight: 700 }}>📥 Importar clientes desde Excel</h3>
            <p style={{ margin: '2px 0 0', color: GRAY, fontSize: '12px' }}>
              {paso === 1 ? 'Paso 1 de 3 — Seleccionar archivo' : paso === 15 ? 'Paso 1.5 de 3 — Seleccionar encabezado' : paso === 2 ? 'Paso 2 de 3 — Mapear columnas' : 'Paso 3 de 3 — Resultado'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: GRAY }}>✕</button>
        </div>

        <div style={{ padding: '24px' }}>
          {/* Step indicator */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
            {[1, 15, 2, 3].map(s => (
              <div key={s} style={{ flex: 1, height: '4px', borderRadius: '2px', backgroundColor: (paso === 3 ? 3 : paso === 2 ? 2 : paso === 15 ? 1.5 : 1) >= (s === 15 ? 1.5 : s) ? BLUE : '#E2E8F0' }} />
            ))}
          </div>

          {paso === 1 && (
            <div>
              <div
                onDragOver={e => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) procesarArchivo(f); }}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${drag ? BLUE : '#CBD5E0'}`, borderRadius: '12px',
                  padding: '48px 24px', textAlign: 'center', cursor: 'pointer',
                  backgroundColor: drag ? '#EBF4FF' : '#F7FAFC', transition: 'all 0.2s',
                }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>📂</div>
                <p style={{ color: NAVY, fontWeight: 600, margin: '0 0 6px' }}>Arrastrá tu archivo acá</p>
                <p style={{ color: GRAY, fontSize: '13px', margin: 0 }}>o hacé clic para seleccionar</p>
                <p style={{ color: GRAY, fontSize: '11px', marginTop: '8px' }}>Formatos: .xlsx, .xls, .csv</p>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) procesarArchivo(f); }} />
              {error && <p style={{ color: RED, fontSize: '13px', marginTop: '12px' }}>{error}</p>}
            </div>
          )}

          {paso === 15 && (
            <div>
              <p style={{ color: NAVY, fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                Hacé click en la fila que contiene los encabezados de columna (Nombre, CUIT, etc.)
              </p>
              <p style={{ color: GRAY, fontSize: '12px', marginBottom: '12px' }}>
                Archivo: <strong>{archivo?.name}</strong>
              </p>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <tbody>
                    {todasFilas.slice(0, 20).map((fila, idx) => {
                      const seleccionada = idx === filaEncabezado;
                      const arriba = idx < filaEncabezado;
                      return (
                        <tr
                          key={idx}
                          onClick={() => setFilaEncabezado(idx)}
                          style={{
                            cursor: 'pointer',
                            backgroundColor: seleccionada ? '#EBF4FF' : arriba ? '#F7FAFC' : '#fff',
                            borderLeft: seleccionada ? `3px solid ${BLUE}` : '3px solid transparent',
                            borderBottom: '1px solid #EDF2F7',
                          }}
                          onMouseEnter={e => { if (!seleccionada) (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '#F7FAFC'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = seleccionada ? '#EBF4FF' : arriba ? '#F7FAFC' : '#fff'; }}
                        >
                          <td style={{ padding: '6px 8px', color: GRAY, fontWeight: 600, whiteSpace: 'nowrap', userSelect: 'none', minWidth: '60px' }}>
                            Fila {idx + 1}
                          </td>
                          {fila.slice(0, 8).map((celda, j) => (
                            <td key={j} style={{
                              padding: '6px 10px',
                              maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              color: seleccionada ? NAVY : arriba ? '#A0AEC0' : TEXT,
                              fontWeight: seleccionada ? 700 : 400,
                              textDecoration: arriba ? 'line-through' : 'none',
                            }}>
                              {celda}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ color: GRAY, fontSize: '12px', marginTop: '10px' }}>
                📊 Se importarán <strong>{todasFilas.slice(filaEncabezado + 1).filter(r => r.some(c => c.trim())).length}</strong> filas de datos (de fila {filaEncabezado + 2} en adelante)
              </p>
              {error && <p style={{ color: RED, fontSize: '13px', marginTop: '8px' }}>{error}</p>}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button onClick={() => setPaso(1)} style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #CBD5E0', backgroundColor: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>
                  ← Volver
                </button>
                <button onClick={confirmarEncabezado}
                  style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', backgroundColor: BLUE, color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                  Continuar →
                </button>
              </div>
            </div>
          )}

          {paso === 2 && (
            <div>
              <p style={{ color: GRAY, fontSize: '13px', marginBottom: '16px' }}>
                Archivo: <strong>{archivo?.name}</strong> · Asigná cada campo del sistema a una columna de tu Excel.
              </p>

              {/* Preview table */}
              {muestra.length > 0 && (
                <div style={{ overflowX: 'auto', marginBottom: '20px', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F7FAFC' }}>
                        {columnas.map(c => (
                          <th key={c} style={{ padding: '6px 10px', textAlign: 'left', color: NAVY, fontWeight: 600, borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {muestra.map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j} style={{ padding: '5px 10px', color: TEXT, borderBottom: '1px solid #F0F0F0', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Mapping fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                {CAMPOS_CLIENTES.map(campo => (
                  <div key={campo.key}>
                    <label style={{ display: 'block', fontSize: '11px', color: GRAY, marginBottom: '3px', fontWeight: 600 }}>
                      {campo.label}
                    </label>
                    <select
                      value={mapeo[campo.key] || ''}
                      onChange={e => setMapeo(m => ({ ...m, [campo.key]: e.target.value }))}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: `1px solid ${mapeo[campo.key] ? BLUE : '#CBD5E0'}`, fontSize: '12px', color: TEXT, backgroundColor: mapeo[campo.key] ? '#EBF4FF' : '#fff' }}>
                      <option value="">— Sin mapear —</option>
                      {columnas.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {/* Conflicto */}
              <div style={{ backgroundColor: '#F7FAFC', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
                <p style={{ margin: '0 0 8px', fontSize: '12px', color: NAVY, fontWeight: 600 }}>Si ya existe un cliente con ese nombre o CUIT:</p>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {(['actualizar', 'saltar'] as const).map(op => (
                    <label key={op} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: TEXT }}>
                      <input type="radio" name="conflicto" value={op} checked={conflicto === op} onChange={() => setConflicto(op)} />
                      {op === 'actualizar' ? '✏️ Actualizar datos' : '⏭️ Saltar (no modificar)'}
                    </label>
                  ))}
                </div>
              </div>

              {error && <p style={{ color: RED, fontSize: '13px', marginBottom: '12px' }}>{error}</p>}

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setPaso(15)} style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #CBD5E0', backgroundColor: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>
                  ← Volver
                </button>
                <button onClick={importar} disabled={cargando || !mapeo['nombre']}
                  style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', backgroundColor: cargando || !mapeo['nombre'] ? '#A0AEC0' : BLUE, color: '#fff', cursor: cargando || !mapeo['nombre'] ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600 }}>
                  {cargando ? 'Importando...' : '📤 Importar'}
                </button>
              </div>
            </div>
          )}

          {paso === 3 && resultado && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '56px', marginBottom: '16px' }}>✅</div>
              <h3 style={{ color: NAVY, margin: '0 0 20px' }}>Importación completada</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                {[
                  { label: 'Importados', value: resultado.importados, color: GREEN },
                  { label: 'Actualizados', value: resultado.actualizados, color: BLUE },
                  { label: 'Saltados', value: resultado.saltados, color: ORANGE },
                  { label: 'Con errores', value: resultado.errores, color: RED },
                ].map(item => (
                  <div key={item.label} style={{ backgroundColor: '#F7FAFC', borderRadius: '10px', padding: '14px', border: `2px solid ${item.value > 0 ? item.color : '#E2E8F0'}` }}>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: item.value > 0 ? item.color : GRAY }}>{item.value}</div>
                    <div style={{ fontSize: '12px', color: GRAY, marginTop: '2px' }}>{item.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button onClick={() => { setPaso(1); setArchivo(null); setResultado(null); setError(''); }}
                  style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #CBD5E0', backgroundColor: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>
                  Importar otro
                </button>
                <button onClick={() => { onClose(); onDone(); }}
                  style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', backgroundColor: GREEN, color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                  ✓ Finalizar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export default function RobertoClientes() {
  const navigate  = useNavigate();
  const cid       = getClienteId();
  const token     = getToken();
  const authHdr   = { 'x-superadmin-token': token };

  const [vista,         setVista]         = useState<Vista>('lista');
  const [clienteCC,     setClienteCC]     = useState<ClienteFinal | null>(null);
  const [clientes,      setClientes]      = useState<ClienteFinal[]>([]);
  const [total,         setTotal]         = useState(0);
  const [pagina,        setPagina]        = useState(1);
  const [porPagina,     setPorPagina]     = useState(25);
  const [totalPags,     setTotalPags]     = useState(1);
  const [cargando,      setCargando]      = useState(false);
  const [dash,          setDash]          = useState<DashData | null>(null);
  const [busqueda,      setBusqueda]      = useState('');
  const [filtroEstado,  setFiltroEstado]  = useState('');
  const [filtroSaldo,   setFiltroSaldo]   = useState('');
  const [modalCliente,  setModalCliente]  = useState(false);
  const [editCliente,   setEditCliente]   = useState<ClienteFinal | null>(null);
  const [showImport,    setShowImport]    = useState(false);
  const [modalEliminar, setModalEliminar] = useState<{ id: number; desc: string } | null>(null);

  const cargarDash = useCallback(() => {
    if (!cid) return;
    fetch(`${API_BASE}/api/superadmin/clientes-finales/${cid}/dashboard`, { headers: authHdr })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setDash(d))
      .catch(() => {});
  }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargarClientes = useCallback(async () => {
    if (!cid) return;
    setCargando(true);
    try {
      const activo = filtroEstado === 'Bloqueado' ? 'bloqueado' : filtroEstado === 'Inactivo' ? 'false' : undefined;
      const conDeuda = filtroSaldo === 'deuda' ? 'true' : filtroSaldo === 'sin_deuda' ? 'false' : undefined;
      const p = new URLSearchParams({
        page: String(pagina), limit: String(porPagina),
        ...(busqueda   && { buscar:    busqueda }),
        ...(activo     && { activo               }),
        ...(conDeuda   && { con_deuda: conDeuda  }),
      });
      const r = await fetch(`${API_BASE}/api/superadmin/clientes-finales/${cid}?${p}`, { headers: authHdr });
      if (r.ok) {
        const d = await r.json();
        setClientes(d.clientes || []);
        setTotal(d.total || 0);
        setTotalPags(d.paginas || 1);
      }
    } catch { /* silent */ }
    finally { setCargando(false); }
  }, [cid, pagina, porPagina, busqueda, filtroEstado, filtroSaldo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargarDash(); }, [cargarDash]);

  useEffect(() => {
    const t = setTimeout(cargarClientes, 300);
    return () => clearTimeout(t);
  }, [cargarClientes]);

  // Si estamos en CC, mostrar esa pantalla
  if (vista === 'cc' && clienteCC) {
    return (
      <PantallaCuentaCorriente
        clienteId={cid!} token={token} cliente={clienteCC}
        onVolver={() => { setVista('lista'); setClienteCC(null); cargarClientes(); cargarDash(); }}
        onClienteUpdated={(c) => setClienteCC(c)}
      />
    );
  }

  const exportarExcel = () => {
    if (!clientes.length) { alert('No hay clientes para exportar'); return; }
    const rows = [
      ['Nombre', 'CUIT', 'Email', 'Teléfono', 'WhatsApp', 'Saldo', 'Estado', 'Última compra'].join('\t'),
      ...clientes.map(c => [
        c.comprador_nombre, c.comprador_cuit, c.comprador_email,
        c.comprador_telefono, c.comprador_whatsapp,
        c.saldo, c.bloqueado ? 'Bloqueado' : 'Activo', fmtFecha(c.ultima_compra),
      ].join('\t')),
    ].join('\n');
    const blob = new Blob([rows], { type: 'text/tab-separated-values;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'clientes.xls'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, padding: '28px', fontFamily: 'system-ui,-apple-system,sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/roberto/dashboard')} style={btnSt('#EDF2F7', GRAY)}>← Volver</button>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: NAVY, margin: '0 0 2px' }}>👥 Clientes</h2>
            <p style={{ fontSize: '13px', color: GRAY, margin: 0 }}>{total} clientes registrados</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => { setEditCliente(null); setModalCliente(true); }} style={btnSt(GREEN)}>＋ Nuevo cliente</button>
          <button onClick={() => setShowImport(true)} style={btnSt('#6B46C1', '#fff')}>📥 Importar Excel</button>
          <button onClick={exportarExcel} style={btnSt(BLUE)}>📤 Exportar Excel</button>
        </div>
      </div>

      {/* Dashboard 4 cards */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <Card icon="👥" label="Total activos"    valor={dash?.total_activos  ?? '—'} color={BLUE}   />
        <Card icon="⚠️" label="Con deuda"        valor={dash?.con_deuda      ?? '—'} color={ORANGE} />
        <Card icon="🔴" label="Deuda vencida"    valor={dash?.deuda_vencida  ?? '—'} color={RED}    />
        <Card icon="✨" label="Nuevos este mes"  valor={dash?.nuevos_mes     ?? '—'} color={GREEN}  />
      </div>

      {/* Filtros */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 220px' }}>
            <label style={lblSt}>Buscar</label>
            <input value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
              placeholder="Nombre, CUIT o razón social..." style={inpSt} />
          </div>
          <div style={{ flex: '0 1 160px' }}>
            <label style={lblSt}>Estado</label>
            <select value={filtroEstado} onChange={e => { setFiltroEstado(e.target.value); setPagina(1); }} style={{ ...inpSt, cursor: 'pointer' }}>
              <option value="">Todos</option>
              <option value="Activo">Activo</option>
              <option value="Bloqueado">Bloqueado</option>
            </select>
          </div>
          <div style={{ flex: '0 1 160px' }}>
            <label style={lblSt}>Saldo</label>
            <select value={filtroSaldo} onChange={e => { setFiltroSaldo(e.target.value); setPagina(1); }} style={{ ...inpSt, cursor: 'pointer' }}>
              <option value="">Todos</option>
              <option value="deuda">Con deuda</option>
              <option value="sin_deuda">Sin deuda</option>
            </select>
          </div>
          {(busqueda || filtroEstado || filtroSaldo) && (
            <button onClick={() => { setBusqueda(''); setFiltroEstado(''); setFiltroSaldo(''); setPagina(1); }}
              style={{ ...btnSt('#EDF2F7', GRAY), alignSelf: 'flex-end' }}>Limpiar</button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #EDF2F7', fontSize: '13px', color: GRAY }}>
          {total.toLocaleString('es-AR')} clientes
        </div>
        {cargando ? (
          <div style={{ padding: '48px', textAlign: 'center', color: GRAY }}>Cargando...</div>
        ) : clientes.length === 0 ? (
          <div style={{ padding: '64px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '52px', marginBottom: '12px' }}>👥</div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>No hay clientes</h3>
            <p style={{ fontSize: '14px', color: GRAY, margin: '0 0 20px' }}>Agregá el primer cliente para comenzar.</p>
            <button onClick={() => { setEditCliente(null); setModalCliente(true); }} style={btnSt(GREEN)}>＋ Nuevo cliente</button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '900px' }}>
              <thead>
                <tr style={{ backgroundColor: '#EBF4FF' }}>
                  {['Nombre / CUIT', 'Teléfono / WhatsApp', 'Saldo cta. cte.', 'Lista precio', 'Estado', 'Última compra', 'Acciones'].map(col => (
                    <th key={col} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600, color: NAVY, borderBottom: `2px solid ${SEP}`, whiteSpace: 'nowrap' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientes.map((c, idx) => {
                  const saldo = Number(c.saldo) || 0;
                  return (
                    <tr key={c.id}
                      style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}
                      onMouseEnter={ev => { ev.currentTarget.style.backgroundColor = '#EBF8FF'; }}
                      onMouseLeave={ev => { ev.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#fff' : '#F7FAFC'; }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 600, color: TEXT }}>{c.comprador_nombre}</div>
                        {c.comprador_cuit && <div style={{ fontSize: '11px', color: GRAY, fontFamily: 'monospace' }}>{c.comprador_cuit}</div>}
                        {c.comprador_razon_social && <div style={{ fontSize: '11px', color: GRAY }}>{c.comprador_razon_social}</div>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ color: TEXT }}>{c.comprador_telefono || '—'}</div>
                        {c.comprador_whatsapp && <div style={{ fontSize: '11px', color: GREEN }}>💬 {c.comprador_whatsapp}</div>}
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: saldo > 0 ? RED : saldo < 0 ? GREEN : GRAY }}>
                        {fmt(Math.abs(saldo))}
                        {saldo > 0 && <div style={{ fontSize: '10px', color: RED, fontWeight: 400 }}>deuda</div>}
                        {Number(c.saldo_vencido) > 0 && <div style={{ fontSize: '10px', color: RED }}>Venc: {fmt(c.saldo_vencido)}</div>}
                      </td>
                      <td style={{ padding: '10px 14px', color: GRAY, fontSize: '12px' }}>Lista {c.lista_precio_id}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: c.bloqueado ? '#FFF5F5' : '#F0FFF4', color: c.bloqueado ? RED : GREEN }}>
                          {c.bloqueado ? '🔒 Bloqueado' : 'Activo'}
                        </span>
                        {c.es_mostrador && <div style={{ fontSize: '10px', color: BLUE, marginTop: '2px' }}>Mostrador</div>}
                      </td>
                      <td style={{ padding: '10px 14px', color: GRAY, fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {fmtFecha(c.ultima_compra)}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          <button onClick={() => { setClienteCC(c); setVista('cc'); }}
                            style={{ backgroundColor: '#EBF4FF', color: BLUE, border: 'none', borderRadius: '5px', padding: '5px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>💳 CC</button>
                          <button onClick={() => { setEditCliente(c); setModalCliente(true); }}
                            style={{ backgroundColor: '#EDF2F7', color: GRAY, border: 'none', borderRadius: '5px', padding: '5px 8px', fontSize: '11px', cursor: 'pointer' }}>✏️</button>
                          <button onClick={() => { setClienteCC(c); setVista('cc'); }}
                            style={{ backgroundColor: '#EDF2F7', color: GRAY, border: 'none', borderRadius: '5px', padding: '5px 8px', fontSize: '11px', cursor: 'pointer' }}>👁️</button>
                          <button onClick={() => setModalEliminar({ id: c.id, desc: c.comprador_nombre })}
                            style={{ backgroundColor: '#FFF5F5', color: RED, border: 'none', borderRadius: '5px', padding: '5px 8px', fontSize: '11px', cursor: 'pointer' }}>🗑️</button>
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

      <Pag p={pagina} tp={totalPags} pp={porPagina} setP={setPagina} setPP={setPorPagina} />

      {showImport && (
        <ModalImportarClientes cid={cid} token={token}
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); cargarClientes(); cargarDash(); }} />
      )}

      {/* Modal nuevo/editar */}
      {modalCliente && cid && (
        <ModalCliente
          clienteId={cid} token={token}
          cliente={editCliente}
          onGuardado={() => { setModalCliente(false); setEditCliente(null); cargarClientes(); cargarDash(); }}
          onCerrar={() => { setModalCliente(false); setEditCliente(null); }}
        />
      )}
      {modalEliminar && cid && token && (
        <ModalEliminar
          tabla="cuentas_corrientes_clientes"
          id={modalEliminar.id}
          descripcion={modalEliminar.desc}
          clienteId={cid}
          token={token}
          onClose={() => setModalEliminar(null)}
          onDone={() => { setModalEliminar(null); cargarClientes(); cargarDash(); }}
        />
      )}
    </div>
  );
}
