import React, { useState, useEffect, useCallback } from 'react';
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
interface Proveedor {
  id: number;
  nombre: string;
  nombre_corto: string;
  cuit: string;
  condicion_iva: string;
  email: string;
  telefono: string;
  whatsapp: string;
  sitio_web: string;
  contacto_nombre: string;
  contacto_cargo: string;
  direccion: string;
  ciudad: string;
  provincia: string;
  plazo_pago_dias: number;
  descuento_general: number;
  moneda: string;
  limite_credito: number;
  notas: string;
  saldo: number;
  saldo_vencido: number;
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
  fecha_comprobante: string | null;
  fecha_vencimiento: string | null;
  referencia_pago: string;
  es_cheque: boolean;
  cheque_numero: string;
  cheque_banco: string;
  estado: string;
  creado_en: string;
}

interface DashData {
  total_activos: number;
  con_saldo_pendiente: number;
  vencimientos_7dias: number;
  total_deuda: number;
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
    compra: { bg: '#FFF5F5', c: RED,    label: 'Compra'  },
    pago:   { bg: '#F0FFF4', c: GREEN,  label: 'Pago'    },
    nc:     { bg: '#EBF8FF', c: BLUE,   label: 'NC'      },
    nd:     { bg: '#FFFFF0', c: ORANGE, label: 'ND'      },
    ajuste: { bg: '#EDF2F7', c: GRAY,   label: 'Ajuste'  },
  };
  const s = map[tipo] || { bg: '#EDF2F7', c: GRAY, label: tipo };
  return (
    <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, backgroundColor: s.bg, color: s.c, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODAL NUEVO / EDITAR PROVEEDOR
// ═══════════════════════════════════════════════════════════════
const COND_IVA = ['Responsable Inscripto', 'Monotributista', 'Exento', 'No Responsable', 'Consumidor Final'];

interface FormProv {
  nombre: string; nombre_corto: string; cuit: string;
  condicion_iva: string; email: string; telefono: string; whatsapp: string;
  sitio_web: string; contacto_nombre: string; contacto_cargo: string;
  direccion: string; ciudad: string; provincia: string; notas: string;
  plazo_pago_dias: string; descuento_general: string;
  moneda: string; limite_credito: string;
}

function ModalProveedor({ clienteId, token, proveedor, onGuardado, onCerrar }: {
  clienteId: number; token: string;
  proveedor: Proveedor | null;
  onGuardado: () => void; onCerrar: () => void;
}) {
  const jsonHdr = { 'x-superadmin-token': token, 'Content-Type': 'application/json' };
  const [tab, setTab] = useState<'datos' | 'condiciones'>('datos');
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState('');

  const [form, setForm] = useState<FormProv>({
    nombre:            proveedor?.nombre            || '',
    nombre_corto:      proveedor?.nombre_corto      || '',
    cuit:              proveedor?.cuit              || '',
    condicion_iva:     proveedor?.condicion_iva     || 'Responsable Inscripto',
    email:             proveedor?.email             || '',
    telefono:          proveedor?.telefono          || '',
    whatsapp:          proveedor?.whatsapp          || '',
    sitio_web:         proveedor?.sitio_web         || '',
    contacto_nombre:   proveedor?.contacto_nombre   || '',
    contacto_cargo:    proveedor?.contacto_cargo    || '',
    direccion:         proveedor?.direccion         || '',
    ciudad:            proveedor?.ciudad            || '',
    provincia:         proveedor?.provincia         || '',
    notas:             proveedor?.notas             || '',
    plazo_pago_dias:   String(proveedor?.plazo_pago_dias   || 0),
    descuento_general: String(proveedor?.descuento_general || 0),
    moneda:            proveedor?.moneda            || 'ARS',
    limite_credito:    String(proveedor?.limite_credito    || 0),
  });

  const set = (k: keyof FormProv, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const guardar = async () => {
    if (!form.nombre.trim()) { setErr('El nombre es requerido'); return; }
    setGuardando(true); setErr('');
    try {
      const body = {
        ...form,
        plazo_pago_dias:   parseInt(form.plazo_pago_dias,   10) || 0,
        descuento_general: parseFloat(form.descuento_general)   || 0,
        limite_credito:    parseFloat(form.limite_credito)       || 0,
      };
      const url    = proveedor
        ? `${API_BASE}/api/superadmin/proveedores/${clienteId}/${proveedor.id}`
        : `${API_BASE}/api/superadmin/proveedores/${clienteId}`;
      const method = proveedor ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers: jsonHdr, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { setErr(d.mensaje || 'Error'); return; }
      onGuardado();
    } catch { setErr('Error de red'); }
    finally { setGuardando(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '16px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '640px', boxShadow: '0 24px 72px rgba(0,0,0,0.3)', margin: 'auto' }}>
        <div style={{ padding: '18px 28px', borderBottom: `2px solid ${SEP}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: NAVY, margin: 0 }}>
            {proveedor ? '✏️ Editar proveedor' : '＋ Nuevo proveedor'}
          </h2>
          <button onClick={onCerrar} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: GRAY }}>×</button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #EDF2F7', padding: '0 28px' }}>
          {(['datos', 'condiciones'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 600, border: 'none', borderBottom: `2px solid ${tab === t ? BLUE : 'transparent'}`, cursor: 'pointer', backgroundColor: 'transparent', color: tab === t ? BLUE : GRAY }}>
              {t === 'datos' ? '📋 Datos' : '💰 Condiciones comerciales'}
            </button>
          ))}
        </div>

        <div style={{ padding: '24px 28px', maxHeight: '70vh', overflowY: 'auto' }}>
          {tab === 'datos' && (
            <>
              <div style={secSt}>Datos del proveedor</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={lblSt}>Nombre *</label>
                  <input value={form.nombre} onChange={e => set('nombre', e.target.value)} autoFocus style={inpSt} placeholder="Nombre del proveedor" />
                </div>
                <div>
                  <label style={lblSt}>Nombre corto</label>
                  <input value={form.nombre_corto} onChange={e => set('nombre_corto', e.target.value)} style={inpSt} placeholder="Apodo o abreviación" />
                </div>
                <div>
                  <label style={lblSt}>CUIT</label>
                  <input value={form.cuit} onChange={e => set('cuit', e.target.value)} style={inpSt} placeholder="XX-XXXXXXXX-X" />
                </div>
                <div>
                  <label style={lblSt}>Condición IVA</label>
                  <select value={form.condicion_iva} onChange={e => set('condicion_iva', e.target.value)} style={{ ...inpSt, cursor: 'pointer' }}>
                    {COND_IVA.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lblSt}>Email</label>
                  <input type="email" value={form.email} onChange={e => set('email', e.target.value)} style={inpSt} placeholder="proveedor@empresa.com" />
                </div>
                <div>
                  <label style={lblSt}>Teléfono</label>
                  <input value={form.telefono} onChange={e => set('telefono', e.target.value)} style={inpSt} placeholder="0XX XXXXXXXX" />
                </div>
                <div>
                  <label style={lblSt}>WhatsApp</label>
                  <input value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} style={inpSt} placeholder="549XXXXXXXXXX" />
                </div>
                <div>
                  <label style={lblSt}>Sitio web</label>
                  <input value={form.sitio_web} onChange={e => set('sitio_web', e.target.value)} style={inpSt} placeholder="https://..." />
                </div>
              </div>

              <div style={secSt}>Contacto</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={lblSt}>Nombre contacto</label>
                  <input value={form.contacto_nombre} onChange={e => set('contacto_nombre', e.target.value)} style={inpSt} placeholder="Nombre" />
                </div>
                <div>
                  <label style={lblSt}>Cargo</label>
                  <input value={form.contacto_cargo} onChange={e => set('contacto_cargo', e.target.value)} style={inpSt} placeholder="Vendedor, Gerente, etc." />
                </div>
              </div>

              <div style={secSt}>Ubicación</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={lblSt}>Dirección</label>
                  <input value={form.direccion} onChange={e => set('direccion', e.target.value)} style={inpSt} placeholder="Calle y número" />
                </div>
                <div>
                  <label style={lblSt}>Ciudad</label>
                  <input value={form.ciudad} onChange={e => set('ciudad', e.target.value)} style={inpSt} placeholder="Ciudad" />
                </div>
                <div>
                  <label style={lblSt}>Provincia</label>
                  <input value={form.provincia} onChange={e => set('provincia', e.target.value)} style={inpSt} placeholder="Provincia" />
                </div>
              </div>

              <div style={secSt}>Notas internas</div>
              <textarea value={form.notas} onChange={e => set('notas', e.target.value)} rows={3}
                style={{ ...inpSt, resize: 'vertical', fontFamily: 'inherit', height: '72px' }}
                placeholder="Observaciones internas del proveedor..." />
            </>
          )}

          {tab === 'condiciones' && (
            <>
              <div style={secSt}>Condiciones comerciales</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={lblSt}>Plazo de pago (días)</label>
                  <input type="number" min="0" step="1" value={form.plazo_pago_dias}
                    onChange={e => set('plazo_pago_dias', e.target.value)} style={inpSt} placeholder="0" />
                </div>
                <div>
                  <label style={lblSt}>Descuento general %</label>
                  <input type="number" min="0" max="100" step="0.01" value={form.descuento_general}
                    onChange={e => set('descuento_general', e.target.value)} style={inpSt} placeholder="0" />
                </div>
                <div>
                  <label style={lblSt}>Moneda</label>
                  <select value={form.moneda} onChange={e => set('moneda', e.target.value)} style={{ ...inpSt, cursor: 'pointer' }}>
                    <option value="ARS">ARS — Peso argentino</option>
                    <option value="USD">USD — Dólar</option>
                  </select>
                </div>
                <div>
                  <label style={lblSt}>Límite de crédito ($)</label>
                  <input type="number" min="0" step="0.01" value={form.limite_credito}
                    onChange={e => set('limite_credito', e.target.value)} style={inpSt} placeholder="0" />
                </div>
              </div>
            </>
          )}

          {err && (
            <div style={{ backgroundColor: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: RED, margin: '12px 0' }}>{err}</div>
          )}

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
// MODAL REGISTRAR PAGO
// ═══════════════════════════════════════════════════════════════
const MEDIOS_PAGO = ['Efectivo', 'Transferencia', 'Débito', 'Crédito', 'Cheque', 'QR/MercadoPago', 'Otro'];

function ModalPago({ clienteId, token, proveedor, movsPendientes, onPagado, onCerrar }: {
  clienteId: number; token: string; proveedor: Proveedor;
  movsPendientes: Movimiento[];
  onPagado: () => void; onCerrar: () => void;
}) {
  const jsonHdr = { 'x-superadmin-token': token, 'Content-Type': 'application/json' };
  const [monto,      setMonto]      = useState('');
  const [fecha,      setFecha]      = useState(isoHoy());
  const [medioPago,  setMedioPago]  = useState('Transferencia');
  const [referencia, setReferencia] = useState('');
  const [observ,     setObserv]     = useState('');
  const [nroCheque,  setNroCheque]  = useState('');
  const [banco,      setBanco]      = useState('');
  const [fchCobro,   setFchCobro]   = useState('');
  const [tipoCheque, setTipoCheque] = useState('tercero');
  const [selMovs,    setSelMovs]    = useState<number[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [err, setErr] = useState('');

  const esCheque = medioPago === 'Cheque';

  const registrar = async () => {
    if (!monto || parseFloat(monto) <= 0) { setErr('Ingresá un monto válido'); return; }
    setProcesando(true); setErr('');
    try {
      const ref = esCheque ? `Cheque #${nroCheque} - ${banco} - ${tipoCheque}` : referencia;
      const r = await fetch(`${API_BASE}/api/superadmin/proveedores/${clienteId}/${proveedor.id}/movimiento`, {
        method: 'POST', headers: jsonHdr,
        body: JSON.stringify({
          tipo: 'pago', haber: parseFloat(monto), debe: 0,
          descripcion: `Pago ${medioPago}${observ ? ` - ${observ}` : ''}`,
          numero_comprobante: ref,
          fecha_comprobante: fecha,
          referencia_pago: ref,
          es_cheque: esCheque,
          cheque_numero: nroCheque,
          cheque_banco: banco,
          cheque_fecha_cobro: fchCobro || null,
          cheque_tipo: tipoCheque,
          estado: 'cancelado',
          observaciones: observ,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.mensaje || 'Error'); return; }
      alert(`✅ Pago de ${fmt(parseFloat(monto))} registrado`);
      onPagado();
    } catch { setErr('Error de red'); }
    finally { setProcesando(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '16px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '560px', boxShadow: '0 24px 72px rgba(0,0,0,0.3)', margin: 'auto' }}>
        <div style={{ padding: '18px 28px', borderBottom: `2px solid ${SEP}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: NAVY, margin: 0 }}>💵 Registrar pago — {proveedor.nombre}</h2>
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
              <label style={lblSt}>Referencia / N° transferencia</label>
              <input value={referencia} onChange={e => setReferencia(e.target.value)} style={inpSt} placeholder="Nro. de referencia" />
            </div>
          </div>

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
              </div>
            </div>
          )}

          {movsPendientes.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <label style={lblSt}>Comprobantes que cancela</label>
              <div style={{ border: '1px solid #EDF2F7', borderRadius: '8px', maxHeight: '160px', overflowY: 'auto' }}>
                {movsPendientes.map(m => (
                  <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderBottom: '1px solid #F7FAFC', cursor: 'pointer', fontSize: '13px' }}>
                    <input type="checkbox" checked={selMovs.includes(m.id)}
                      onChange={e => setSelMovs(prev => e.target.checked ? [...prev, m.id] : prev.filter(x => x !== m.id))} />
                    <span style={{ flex: 1 }}>{m.descripcion || m.numero_comprobante || `Mov. #${m.id}`}</span>
                    <span style={{ fontWeight: 700, color: RED, fontFamily: 'monospace' }}>{fmt(m.debe)}</span>
                    {m.fecha_vencimiento && (
                      <span style={{ fontSize: '11px', color: new Date(m.fecha_vencimiento) < new Date() ? RED : GRAY }}>
                        {fmtFecha(m.fecha_vencimiento)}
                      </span>
                    )}
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
            <button onClick={onCerrar} style={btnSt('#EDF2F7', GRAY)}>Cancelar</button>
            <button onClick={registrar} disabled={procesando} style={btnSt(GREEN, '#fff', procesando)}>
              {procesando ? '⏳...' : '✅ Registrar pago'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODAL REGISTRAR COMPRA MANUAL
// ═══════════════════════════════════════════════════════════════
function ModalCompra({ clienteId, token, proveedor, onRegistrado, onCerrar }: {
  clienteId: number; token: string; proveedor: Proveedor;
  onRegistrado: () => void; onCerrar: () => void;
}) {
  const jsonHdr = { 'x-superadmin-token': token, 'Content-Type': 'application/json' };
  const [nroFactura,  setNroFactura]  = useState('');
  const [fechaFact,   setFechaFact]   = useState(isoHoy());
  const [fechaVenc,   setFechaVenc]   = useState('');
  const [monto,       setMonto]       = useState('');
  const [ivaIncl,     setIvaIncl]     = useState(true);
  const [descripcion, setDescripcion] = useState('');
  const [procesando,  setProcesando]  = useState(false);
  const [err, setErr] = useState('');

  const registrar = async () => {
    if (!monto || parseFloat(monto) <= 0) { setErr('Ingresá un monto válido'); return; }
    setProcesando(true); setErr('');
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/proveedores/${clienteId}/${proveedor.id}/movimiento`, {
        method: 'POST', headers: jsonHdr,
        body: JSON.stringify({
          tipo: 'compra', debe: parseFloat(monto), haber: 0,
          descripcion: descripcion || `Factura proveedor${nroFactura ? ` ${nroFactura}` : ''}${ivaIncl ? ' (IVA incluido)' : ''}`,
          numero_comprobante: nroFactura,
          fecha_comprobante: fechaFact,
          fecha_vencimiento: fechaVenc || null,
          estado: 'pendiente',
        }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.mensaje || 'Error'); return; }
      alert('✅ Compra registrada');
      onRegistrado();
    } catch { setErr('Error de red'); }
    finally { setProcesando(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '480px', boxShadow: '0 24px 72px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '18px 28px', borderBottom: `2px solid ${SEP}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: NAVY, margin: 0 }}>🧾 Registrar compra — {proveedor.nombre}</h2>
          <button onClick={onCerrar} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: GRAY }}>×</button>
        </div>
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={lblSt}>Número de factura</label>
              <input value={nroFactura} onChange={e => setNroFactura(e.target.value)} autoFocus style={inpSt} placeholder="A 0001-00000001" />
            </div>
            <div>
              <label style={lblSt}>Fecha factura</label>
              <input type="date" value={fechaFact} onChange={e => setFechaFact(e.target.value)} style={inpSt} />
            </div>
            <div>
              <label style={lblSt}>Fecha vencimiento</label>
              <input type="date" value={fechaVenc} onChange={e => setFechaVenc(e.target.value)} style={inpSt} />
            </div>
            <div>
              <label style={lblSt}>Monto total *</label>
              <input type="number" value={monto} onChange={e => setMonto(e.target.value)} style={inpSt} placeholder="0.00" min="0.01" step="0.01" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '20px' }}>
              <button onClick={() => setIvaIncl(!ivaIncl)}
                style={{ width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer', backgroundColor: ivaIncl ? GREEN : '#CBD5E0', position: 'relative', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: '3px', left: ivaIncl ? '21px' : '3px', width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.2s' }} />
              </button>
              <span style={{ fontSize: '13px', color: TEXT }}>IVA incluido</span>
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={lblSt}>Descripción</label>
              <input value={descripcion} onChange={e => setDescripcion(e.target.value)} style={inpSt} placeholder="Descripción de la compra" />
            </div>
          </div>
          {err && <div style={{ backgroundColor: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: RED, marginBottom: '12px' }}>{err}</div>}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button onClick={onCerrar} style={btnSt('#EDF2F7', GRAY)}>Cancelar</button>
            <button onClick={registrar} disabled={procesando} style={btnSt(BLUE, '#fff', procesando)}>
              {procesando ? '⏳...' : '🧾 Registrar compra'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANTALLA CUENTA CORRIENTE PROVEEDOR
// ═══════════════════════════════════════════════════════════════
function PantallaCuentaCorriente({ clienteId, token, proveedor: provInicial, onVolver }: {
  clienteId: number; token: string;
  proveedor: Proveedor; onVolver: () => void;
}) {
  const authHdr = { 'x-superadmin-token': token };
  const [movs,       setMovs]       = useState<Movimiento[]>([]);
  const [saldo,      setSaldo]      = useState(Number(provInicial.saldo) || 0);
  const [saldoVenc,  setSaldoVenc]  = useState(Number(provInicial.saldo_vencido) || 0);
  const [total,      setTotal]      = useState(0);
  const [pagina,     setPagina]     = useState(1);
  const [porPagina,  setPorPagina]  = useState(25);
  const [totalPags,  setTotalPags]  = useState(1);
  const [cargando,   setCargando]   = useState(false);
  const [fDesde,     setFDesde]     = useState('');
  const [fHasta,     setFHasta]     = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [busqCmp,    setBusqCmp]    = useState('');
  const [modalPago,  setModalPago]  = useState(false);
  const [modalCompra,setModalCompra]= useState(false);

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
      const r = await fetch(`${API_BASE}/api/superadmin/proveedores/${clienteId}/${provInicial.id}/cuenta-corriente?${p}`, { headers: authHdr });
      if (r.ok) {
        const d = await r.json();
        setMovs(d.movimientos || []);
        setTotal(d.total || 0);
        setTotalPags(d.paginas || 1);
        setSaldo(d.saldo_actual || 0);
        setSaldoVenc(d.saldo_vencido || 0);
      }
    } catch { /* silent */ }
    finally { setCargando(false); }
  }, [clienteId, provInicial.id, pagina, porPagina, fDesde, fHasta, filtroTipo, busqCmp]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(cargarMovs, 300);
    return () => clearTimeout(t);
  }, [cargarMovs]);

  const movsPendientes = movs.filter(m => m.estado === 'pendiente' && m.debe > 0);
  const hayVencidos    = movs.some(m => m.estado === 'pendiente' && m.fecha_vencimiento && new Date(m.fecha_vencimiento) < new Date());

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
    a.href = url; a.download = `CC-${provInicial.nombre}.xls`; a.click();
    URL.revokeObjectURL(url);
  };

  const imprimirPDF = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const filas = movs.map(m => {
      const vencido = m.fecha_vencimiento && new Date(m.fecha_vencimiento) < new Date() && m.estado === 'pendiente';
      return `<tr>
        <td>${fmtFecha(m.creado_en)}</td><td>${m.tipo}</td>
        <td>${m.descripcion || '—'}</td><td>${m.numero_comprobante || '—'}</td>
        <td style="text-align:right">${m.debe > 0 ? fmt(m.debe) : ''}</td>
        <td style="text-align:right">${m.haber > 0 ? fmt(m.haber) : ''}</td>
        <td style="text-align:right;font-weight:bold">${fmt(m.saldo_acumulado)}</td>
        <td style="color:${vencido ? '#E53E3E' : '#000'}">${fmtFecha(m.fecha_vencimiento)}</td>
        <td>${m.estado}</td>
      </tr>`;
    }).join('');
    const saldoColor = saldo > 0 ? '#E53E3E' : '#38A169';
    const cfgPro = (() => { try { return JSON.parse(localStorage.getItem(`roberto_config_${getClienteId()}`) || '{}'); } catch { return {}; } })();
    const logoUrlPro = cfgPro.logo_url         || '';
    const negNomPro  = cfgPro.nombre_comercial || '';
    const negDirPro  = cfgPro.direccion        || '';
    const negCuitPro = cfgPro.cuit             || '';
    const logoBlockPro = `<div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #e2e8f0">
      ${logoUrlPro ? `<img src="${logoUrlPro}" alt="" style="max-width:120px;max-height:50px;object-fit:contain;flex-shrink:0">` : ''}
      <div>
        ${negNomPro  ? `<div style="font-size:14px;font-weight:700">${negNomPro}</div>`   : ''}
        ${negDirPro  ? `<div style="font-size:10px;color:#666">${negDirPro}</div>`        : ''}
        ${negCuitPro ? `<div style="font-size:10px;color:#666">CUIT: ${negCuitPro}</div>` : ''}
      </div>
    </div>`;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>CC ${provInicial.nombre}</title>
<style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;font-size:10px}
h2{color:#1B2A4A;margin:0 0 4px}.saldo{font-size:22px;font-weight:800;color:${saldoColor};margin-bottom:12px}
table{width:100%;border-collapse:collapse}
th{background:#1B2A4A;color:#fff;padding:5px 8px;text-align:left;font-size:9px}
td{padding:4px 8px;border-bottom:1px solid #eee;font-size:9px}</style>
</head><body>
${logoBlockPro}
<h2>CC Proveedor — ${provInicial.nombre}</h2>
${provInicial.cuit ? `<p style="font-size:10px;color:#718096">CUIT: ${provInicial.cuit}</p>` : ''}
<div class="saldo">Saldo: ${fmt(Math.abs(saldo))}${saldo > 0 ? ' (deuda)' : ' (a favor)'}</div>
<table><thead><tr>
<th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Comprobante</th>
<th>Debe</th><th>Haber</th><th>Saldo</th><th>Vencimiento</th><th>Estado</th>
</tr></thead><tbody>${filas}</tbody></table>
<p style="margin-top:12px;font-size:9px;color:#A0AEC0">Impreso el ${new Date().toLocaleDateString('es-AR')}</p>
</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 350);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, padding: '28px', fontFamily: 'system-ui,-apple-system,sans-serif' }}>

      {hayVencidos && (
        <div style={{ backgroundColor: '#FFF5F5', border: '2px solid #FEB2B2', borderRadius: '10px', padding: '12px 20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '20px' }}>⚠️</span>
          <div style={{ fontWeight: 700, color: RED }}>Hay comprobantes vencidos sin pagar</div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={onVolver} style={btnSt('#EDF2F7', GRAY)}>← Volver</button>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: NAVY, margin: '0 0 2px' }}>💳 {provInicial.nombre}</h2>
            {provInicial.cuit && <p style={{ fontSize: '12px', color: GRAY, margin: 0 }}>CUIT: {provInicial.cuit}</p>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setModalPago(true)}   style={btnSt(GREEN)}>💵 Registrar pago</button>
          <button onClick={() => setModalCompra(true)} style={btnSt(BLUE)}>🧾 Registrar compra</button>
          <button onClick={exportarExcel}              style={btnSt('#EDF2F7', GRAY)}>📤 Excel</button>
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
              {saldo > 0 ? 'Le debemos al proveedor' : saldo < 0 ? 'Saldo a nuestro favor' : 'Sin deuda'}
            </div>
          </div>
          {saldoVenc > 0 && (
            <div>
              <div style={{ fontSize: '12px', color: GRAY, fontWeight: 600, textTransform: 'uppercase' }}>Vencido</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: RED }}>{fmt(saldoVenc)}</div>
            </div>
          )}
          <div>
            <div style={{ fontSize: '12px', color: GRAY, fontWeight: 600, textTransform: 'uppercase' }}>Plazo pago</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: NAVY }}>{provInicial.plazo_pago_dias} días</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: GRAY, fontWeight: 600, textTransform: 'uppercase' }}>Moneda</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: NAVY }}>{provInicial.moneda}</div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', padding: '14px 20px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 180px' }}>
            <label style={lblSt}>Buscar comprobante</label>
            <input value={busqCmp} onChange={e => { setBusqCmp(e.target.value); setPagina(1); }}
              placeholder="Nro. o descripción..." style={inpSt} />
          </div>
          <div style={{ flex: '0 1 150px' }}>
            <label style={lblSt}>Tipo</label>
            <select value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setPagina(1); }} style={{ ...inpSt, cursor: 'pointer' }}>
              <option value="">Todos</option>
              <option value="compra">Compra</option>
              <option value="pago">Pago</option>
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
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '12px' }}>
              <button onClick={() => setModalCompra(true)} style={btnSt(BLUE)}>🧾 Registrar compra</button>
            </div>
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
                        {m.es_cheque && m.cheque_numero && (
                          <div style={{ fontSize: '10px', color: BLUE }}>Cheque #{m.cheque_numero} — {m.cheque_banco}</div>
                        )}
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

      {modalPago && (
        <ModalPago clienteId={clienteId} token={token} proveedor={provInicial} movsPendientes={movsPendientes}
          onPagado={() => { setModalPago(false); cargarMovs(); }}
          onCerrar={() => setModalPago(false)} />
      )}
      {modalCompra && (
        <ModalCompra clienteId={clienteId} token={token} proveedor={provInicial}
          onRegistrado={() => { setModalCompra(false); cargarMovs(); }}
          onCerrar={() => setModalCompra(false)} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export default function RobertoProveedores() {
  const navigate = useNavigate();
  const cid      = getClienteId();
  const token    = getToken();
  const authHdr  = { 'x-superadmin-token': token };

  const [vista,        setVista]        = useState<Vista>('lista');
  const [provCC,       setProvCC]       = useState<Proveedor | null>(null);
  const [proveedores,  setProveedores]  = useState<Proveedor[]>([]);
  const [total,        setTotal]        = useState(0);
  const [pagina,       setPagina]       = useState(1);
  const [porPagina,    setPorPagina]    = useState(25);
  const [totalPags,    setTotalPags]    = useState(1);
  const [cargando,     setCargando]     = useState(false);
  const [dash,         setDash]         = useState<DashData | null>(null);
  const [busqueda,     setBusqueda]     = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroSaldo,  setFiltroSaldo]  = useState('');
  const [modalProv,    setModalProv]    = useState(false);
  const [editProv,     setEditProv]     = useState<Proveedor | null>(null);

  const cargarDash = useCallback(() => {
    if (!cid) return;
    fetch(`${API_BASE}/api/superadmin/proveedores/${cid}/dashboard`, { headers: authHdr })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setDash(d))
      .catch(() => {});
  }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargarProveedores = useCallback(async () => {
    if (!cid) return;
    setCargando(true);
    try {
      const conDeuda = filtroSaldo === 'deuda' ? 'true' : filtroSaldo === 'sin_deuda' ? 'false' : undefined;
      const activo   = filtroEstado === 'Inactivo' ? 'false' : undefined;
      const p = new URLSearchParams({
        page: String(pagina), limit: String(porPagina),
        ...(busqueda && { buscar:    busqueda }),
        ...(activo   && { activo              }),
        ...(conDeuda && { con_deuda: conDeuda }),
      });
      const r = await fetch(`${API_BASE}/api/superadmin/proveedores/${cid}?${p}`, { headers: authHdr });
      if (r.ok) {
        const d = await r.json();
        setProveedores(d.proveedores || []);
        setTotal(d.total || 0);
        setTotalPags(d.paginas || 1);
      }
    } catch { /* silent */ }
    finally { setCargando(false); }
  }, [cid, pagina, porPagina, busqueda, filtroEstado, filtroSaldo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargarDash(); }, [cargarDash]);

  useEffect(() => {
    const t = setTimeout(cargarProveedores, 300);
    return () => clearTimeout(t);
  }, [cargarProveedores]);

  const desactivar = async (p: Proveedor) => {
    if (!window.confirm(`¿Desactivar a ${p.nombre}?`)) return;
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/proveedores/${cid}/${p.id}`, {
        method: 'DELETE', headers: authHdr,
      });
      if (r.ok) { cargarProveedores(); cargarDash(); }
    } catch { alert('Error de red'); }
  };

  const exportarExcel = () => {
    if (!proveedores.length) { alert('No hay proveedores para exportar'); return; }
    const rows = [
      ['Nombre', 'CUIT', 'Email', 'Teléfono', 'Ciudad', 'Saldo', 'Estado'].join('\t'),
      ...proveedores.map(p => [
        p.nombre, p.cuit, p.email, p.telefono, p.ciudad,
        p.saldo, p.activo ? 'Activo' : 'Inactivo',
      ].join('\t')),
    ].join('\n');
    const blob = new Blob([rows], { type: 'text/tab-separated-values;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'proveedores.xls'; a.click();
    URL.revokeObjectURL(url);
  };

  if (vista === 'cc' && provCC) {
    return (
      <PantallaCuentaCorriente
        clienteId={cid!} token={token} proveedor={provCC}
        onVolver={() => { setVista('lista'); setProvCC(null); cargarProveedores(); cargarDash(); }}
      />
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, padding: '28px', fontFamily: 'system-ui,-apple-system,sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/roberto/dashboard')} style={btnSt('#EDF2F7', GRAY)}>← Volver</button>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: NAVY, margin: '0 0 2px' }}>🏭 Proveedores</h2>
            <p style={{ fontSize: '13px', color: GRAY, margin: 0 }}>{total} proveedores registrados</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => { setEditProv(null); setModalProv(true); }} style={btnSt(GREEN)}>＋ Nuevo proveedor</button>
          <button onClick={exportarExcel} style={btnSt(BLUE)}>📤 Exportar Excel</button>
        </div>
      </div>

      {/* Dashboard 4 cards */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <Card icon="🏭" label="Total activos"          valor={dash?.total_activos       ?? '—'} color={BLUE}   />
        <Card icon="⚠️" label="Con saldo pendiente"    valor={dash?.con_saldo_pendiente ?? '—'} color={ORANGE} />
        <Card icon="🔴" label="Vencimientos próx. 7d"  valor={dash?.vencimientos_7dias  ?? '—'} color={RED}    />
        <Card icon="💰" label="Total deuda"            valor={dash ? fmt(dash.total_deuda) : '—'} color={NAVY} />
      </div>

      {/* Filtros */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 220px' }}>
            <label style={lblSt}>Buscar</label>
            <input value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
              placeholder="Nombre, nombre corto o CUIT..." style={inpSt} />
          </div>
          <div style={{ flex: '0 1 160px' }}>
            <label style={lblSt}>Estado</label>
            <select value={filtroEstado} onChange={e => { setFiltroEstado(e.target.value); setPagina(1); }} style={{ ...inpSt, cursor: 'pointer' }}>
              <option value="">Todos</option>
              <option value="Activo">Activo</option>
              <option value="Inactivo">Inactivo</option>
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
          {total.toLocaleString('es-AR')} proveedores
        </div>
        {cargando ? (
          <div style={{ padding: '48px', textAlign: 'center', color: GRAY }}>Cargando...</div>
        ) : proveedores.length === 0 ? (
          <div style={{ padding: '64px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '52px', marginBottom: '12px' }}>🏭</div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>No hay proveedores</h3>
            <p style={{ fontSize: '14px', color: GRAY, margin: '0 0 20px' }}>Agregá el primer proveedor para comenzar.</p>
            <button onClick={() => { setEditProv(null); setModalProv(true); }} style={btnSt(GREEN)}>＋ Nuevo proveedor</button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '860px' }}>
              <thead>
                <tr style={{ backgroundColor: '#EBF4FF' }}>
                  {['Nombre / CUIT', 'Teléfono / WhatsApp', 'Saldo CC', 'Última compra', 'Estado', 'Acciones'].map(col => (
                    <th key={col} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600, color: NAVY, borderBottom: `2px solid ${SEP}`, whiteSpace: 'nowrap' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {proveedores.map((p, idx) => {
                  const saldo = Number(p.saldo) || 0;
                  return (
                    <tr key={p.id}
                      style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}
                      onMouseEnter={ev => { ev.currentTarget.style.backgroundColor = '#EBF8FF'; }}
                      onMouseLeave={ev => { ev.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#fff' : '#F7FAFC'; }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 600, color: TEXT }}>{p.nombre}</div>
                        {p.nombre_corto && <div style={{ fontSize: '11px', color: BLUE }}>{p.nombre_corto}</div>}
                        {p.cuit && <div style={{ fontSize: '11px', color: GRAY, fontFamily: 'monospace' }}>{p.cuit}</div>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div>{p.telefono || '—'}</div>
                        {p.whatsapp && <div style={{ fontSize: '11px', color: GREEN }}>💬 {p.whatsapp}</div>}
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: saldo > 0 ? RED : saldo < 0 ? GREEN : GRAY }}>
                        {fmt(Math.abs(saldo))}
                        {saldo > 0 && <div style={{ fontSize: '10px', color: RED, fontWeight: 400 }}>deuda</div>}
                        {Number(p.saldo_vencido) > 0 && <div style={{ fontSize: '10px', color: RED }}>Venc: {fmt(p.saldo_vencido)}</div>}
                      </td>
                      <td style={{ padding: '10px 14px', color: GRAY, fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {fmtFecha(p.ultima_compra)}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: p.activo ? '#F0FFF4' : '#FFF5F5', color: p.activo ? GREEN : RED }}>
                          {p.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          <button onClick={() => { setProvCC(p); setVista('cc'); }}
                            style={{ backgroundColor: '#EBF4FF', color: BLUE, border: 'none', borderRadius: '5px', padding: '5px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>💳 CC</button>
                          <button onClick={() => { setEditProv(p); setModalProv(true); }}
                            style={{ backgroundColor: '#EDF2F7', color: GRAY, border: 'none', borderRadius: '5px', padding: '5px 8px', fontSize: '11px', cursor: 'pointer' }}>✏️</button>
                          <button onClick={() => { setProvCC(p); setVista('cc'); }}
                            style={{ backgroundColor: '#EDF2F7', color: GRAY, border: 'none', borderRadius: '5px', padding: '5px 8px', fontSize: '11px', cursor: 'pointer' }}>👁️</button>
                          {p.activo && (
                            <button onClick={() => desactivar(p)}
                              style={{ backgroundColor: '#FFF5F5', color: RED, border: 'none', borderRadius: '5px', padding: '5px 8px', fontSize: '11px', cursor: 'pointer' }}>🗑️</button>
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

      <Pag p={pagina} tp={totalPags} pp={porPagina} setP={setPagina} setPP={setPorPagina} />

      {modalProv && cid && (
        <ModalProveedor
          clienteId={cid} token={token}
          proveedor={editProv}
          onGuardado={() => { setModalProv(false); setEditProv(null); cargarProveedores(); cargarDash(); }}
          onCerrar={() => { setModalProv(false); setEditProv(null); }}
        />
      )}
    </div>
  );
}
