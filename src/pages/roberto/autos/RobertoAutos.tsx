import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../../config/api';

// ── PALETA EXCLUSIVA MÓDULO AUTOS ────────────────────────────
const BG      = '#F8F9FA';
const CARD    = '#FFFFFF';
const TEXTO   = '#1A1A2E';
const DORADO  = '#C9A84C';
const VERDE   = '#2D6A4F';
const ROJO    = '#C1121F';
const BORDE   = '#E9ECEF';
const GRIS    = '#6C757D';

const CLOUD_NAME    = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME    || '';
const UPLOAD_PRESET = process.env.REACT_APP_CLOUDINARY_UPLOAD_PRESET || '';
const MAX_FOTOS = 10;

// ── TIPOS ────────────────────────────────────────────────────
interface Sesion {
  token: string;
  cliente: { id: number; nombre_comercial: string };
  modulos: Record<string, boolean>;
}

interface Vehiculo {
  id: number;
  marca: string; modelo: string; anio: number | null; version: string;
  color: string; patente: string; vin: string; km: number;
  tipo: 'propio' | 'consignacion' | 'permuta';
  estado: 'disponible' | 'reservado' | 'vendido';
  precio_compra: number; precio_venta: number;
  precio_minimo_consignacion: number; valor_permuta: number;
  consignante_nombre: string; consignante_cuit: string; consignante_telefono: string;
  fotos: string[]; observaciones: string;
  creado_en: string;
}

interface VentaAuto {
  id: number;
  vehiculo_id: number; marca: string; modelo: string; anio: number | null; patente: string;
  version: string | null; color: string | null; vin: string | null; km: number | null;
  comprador_nombre: string; comprador_cuit: string; comprador_telefono: string; comprador_email?: string;
  precio_venta: number; precio_costo: number; ganancia: number; dinero_transito: number;
  forma_pago: string; estado: string;
  socio_id: number | null; socio_nombre: string | null; comision_socio: number;
  observaciones: string; fecha: string; creado_en: string;
}

interface Socio {
  id: number;
  nombre: string; telefono: string;
  comision_default: number; tipo_comision: string;
  activo: boolean; total_comisiones: number;
}

interface Liquidacion {
  id: number;
  vehiculo_id: number; venta_auto_id: number | null;
  consignante_nombre: string;
  marca: string; modelo: string; anio: number | null; patente: string;
  precio_venta: number; precio_consignante: number; comision: number;
  estado: string; fecha: string;
}

interface Dashboard {
  disponibles: number; reservados: number;
  vendidos_mes: number; ganancia_mes: number; comisiones_socios_mes: number; dinero_transito: number;
}

// ── HELPERS ──────────────────────────────────────────────────
function getSuperadminToken(): string {
  try {
    const s = localStorage.getItem('superadmin_session');
    return s ? JSON.parse(s).token : '';
  } catch { return ''; }
}

const fmt  = (n: number) => `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
const fmtF = (s: string) => { if (!s) return ''; const d = new Date(s + 'T00:00:00'); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; };
const hoy  = () => new Date().toISOString().slice(0, 10);

function vehiculoLabel(v: Vehiculo | VentaAuto | Liquidacion) {
  const anio = v.anio ? ` ${v.anio}` : '';
  return `${v.marca} ${v.modelo}${anio}`.trim() || 'Vehículo';
}

const FORMAS_PAGO = ['efectivo','transferencia','tarjeta_debito','tarjeta_credito','cheque','permuta','otro'];
const fmtPago = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function getConfigNegocio(clienteId: number) {
  try {
    const raw = localStorage.getItem(`roberto_config_${clienteId}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

// ── ESTILOS BASE ─────────────────────────────────────────────
const inputSt: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: `1px solid ${BORDE}`,
  borderRadius: '7px', fontSize: '13px', color: TEXTO, outline: 'none',
  boxSizing: 'border-box', backgroundColor: CARD,
};
const selectSt: React.CSSProperties = { ...inputSt };
const btnDorado: React.CSSProperties = {
  backgroundColor: DORADO, color: '#fff', border: 'none', borderRadius: '8px',
  padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
};
const btnGris: React.CSSProperties = {
  backgroundColor: BORDE, color: TEXTO, border: 'none', borderRadius: '8px',
  padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
};
const btnIcono: React.CSSProperties = {
  background: 'none', border: `1px solid ${BORDE}`, borderRadius: '6px',
  padding: '4px 8px', fontSize: '12px', cursor: 'pointer', color: GRIS,
};

function Campo({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div style={{ marginBottom: '14px', gridColumn: full ? '1/-1' : undefined }}>
      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: GRIS, marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</label>
      {children}
    </div>
  );
}

function BadgeTipo({ tipo }: { tipo: string }) {
  const estilos: Record<string, React.CSSProperties> = {
    propio:       { backgroundColor: TEXTO, color: '#fff' },
    consignacion: { backgroundColor: DORADO, color: TEXTO },
    permuta:      { backgroundColor: BORDE, color: TEXTO },
  };
  const labels: Record<string, string> = { propio: 'Propio', consignacion: 'Consignación', permuta: 'Permuta' };
  return (
    <span style={{ fontSize: '11px', fontWeight: 600, borderRadius: '4px', padding: '2px 7px', ...estilos[tipo] }}>
      {labels[tipo] || tipo}
    </span>
  );
}

function BadgeEstado({ estado }: { estado: string }) {
  const estilos: Record<string, React.CSSProperties> = {
    disponible: { color: VERDE,  border: `1px solid ${VERDE}`,  backgroundColor: '#f0faf4' },
    reservado:  { color: DORADO, border: `1px solid ${DORADO}`, backgroundColor: '#fdf9f0' },
    vendido:    { color: GRIS,   border: `1px solid ${BORDE}`,  backgroundColor: BG },
  };
  const labels: Record<string, string> = { disponible: 'Disponible', reservado: 'Reservado', vendido: 'Vendido' };
  return (
    <span style={{ fontSize: '11px', fontWeight: 600, borderRadius: '4px', padding: '2px 7px', ...estilos[estado] }}>
      {labels[estado] || estado}
    </span>
  );
}

// ── MODAL OVERLAY ─────────────────────────────────────────────
function ModalOverlay({ titulo, onClose, children, ancho = 560 }: { titulo: string; onClose: () => void; children: React.ReactNode; ancho?: number }) {
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ backgroundColor: CARD, borderRadius: '14px', width: '100%', maxWidth: `${ancho}px`, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${BORDE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: CARD, zIndex: 1 }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: TEXTO }}>{titulo}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: GRIS, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '20px 22px' }}>{children}</div>
      </div>
    </div>
  );
}

// ── GALERÍA EDITOR DE FOTOS ───────────────────────────────────
function GaleriaFotosEditor({ fotos, onChange }: { fotos: string[]; onChange: (f: string[]) => void }) {
  const [subiendo, setSubiendo] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [mostrarUrl, setMostrarUrl] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const subirCloudinary = async (file: File) => {
    if (!CLOUD_NAME || !UPLOAD_PRESET) { setMostrarUrl(true); return; }
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', UPLOAD_PRESET);
      const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
      const d = await r.json();
      if (d.secure_url) onChange([...fotos, d.secure_url]);
      else throw new Error();
    } catch { alert('Error al subir. Usá "Pegar URL".'); }
    finally { setSubiendo(false); }
  };

  const agregarUrl = () => {
    const url = urlInput.trim();
    if (!url) return;
    onChange([...fotos, url]);
    setUrlInput('');
    setMostrarUrl(false);
  };

  const quitar = (i: number) => onChange(fotos.filter((_, idx) => idx !== i));

  const mover = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= fotos.length) return;
    const next = [...fotos]; [next[i], next[j]] = [next[j], next[i]]; onChange(next);
  };

  return (
    <div>
      {/* Grid de fotos */}
      {fotos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {fotos.map((url, i) => (
            <div key={i} style={{ position: 'relative', width: 80, height: 80 }}>
              <img src={url} alt={`foto ${i + 1}`}
                style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: `2px solid ${i === 0 ? DORADO : BORDE}` }} />
              {i === 0 && (
                <span style={{ position: 'absolute', bottom: 2, left: 2, fontSize: 9, backgroundColor: DORADO, color: '#fff', borderRadius: 4, padding: '1px 4px', fontWeight: 700 }}>PRINCIPAL</span>
              )}
              <button onClick={() => quitar(i)}
                style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', backgroundColor: ROJO, color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              <div style={{ position: 'absolute', bottom: 2, right: 2, display: 'flex', gap: 2 }}>
                {i > 0 && <button onClick={() => mover(i, -1)} style={{ width: 16, height: 16, fontSize: 9, border: 'none', borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff', cursor: 'pointer' }}>◀</button>}
                {i < fotos.length - 1 && <button onClick={() => mover(i, 1)} style={{ width: 16, height: 16, fontSize: 9, border: 'none', borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff', cursor: 'pointer' }}>▶</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Botones agregar */}
      {fotos.length < MAX_FOTOS && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" disabled={subiendo} onClick={() => fileRef.current?.click()}
            style={{ fontSize: 12, padding: '6px 12px', border: `1.5px solid ${DORADO}`, borderRadius: 7, backgroundColor: '#fdf9f0', color: TEXTO, cursor: subiendo ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
            {subiendo ? '⏳ Subiendo...' : '📷 Subir foto'}
          </button>
          <button type="button" onClick={() => setMostrarUrl(v => !v)}
            style={{ fontSize: 12, padding: '6px 12px', border: `1.5px solid ${BORDE}`, borderRadius: 7, backgroundColor: CARD, color: GRIS, cursor: 'pointer', fontWeight: 600 }}>
            🔗 Pegar URL
          </button>
          <span style={{ fontSize: 11, color: GRIS }}>{fotos.length}/{MAX_FOTOS} fotos · Primera = principal</span>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) subirCloudinary(f); e.target.value = ''; }} />

      {mostrarUrl && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="https://..."
            style={{ flex: 1, border: `1.5px solid ${BORDE}`, borderRadius: 7, padding: '6px 10px', fontSize: 13 }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarUrl(); } }} />
          <button onClick={agregarUrl}
            style={{ padding: '6px 12px', backgroundColor: DORADO, color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
            Agregar
          </button>
        </div>
      )}
    </div>
  );
}

// ── MODAL NUEVO VEHÍCULO ──────────────────────────────────────
function ModalNuevoVehiculo({ clienteId, token, onGuardado, onClose }: {
  clienteId: number; token: string;
  onGuardado: () => void; onClose: () => void;
}) {
  const [paso, setPaso] = useState(1);
  const [tipo, setTipo] = useState<'propio' | 'consignacion' | 'permuta'>('propio');
  const [form, setForm] = useState({
    marca: '', modelo: '', anio: '', version: '',
    color: '', patente: '', vin: '', km: '',
    observaciones: '',
    precio_compra: '', precio_venta: '',
    precio_minimo_consignacion: '', valor_permuta: '',
    consignante_nombre: '', consignante_cuit: '', consignante_telefono: '',
  });
  const [fotos, setFotos] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const tiposConfig = [
    { key: 'propio' as const, titulo: 'PROPIO', desc: 'Lo compraste vos' },
    { key: 'consignacion' as const, titulo: 'CONSIGNACIÓN', desc: 'Es de un tercero' },
    { key: 'permuta' as const, titulo: 'PERMUTA', desc: 'Entró como parte de pago' },
  ];

  const validarPaso2 = () => {
    if (!form.marca.trim()) { setError('La marca es requerida'); return false; }
    if (!form.modelo.trim()) { setError('El modelo es requerido'); return false; }
    return true;
  };

  const guardar = async () => {
    setError('');
    if (tipo === 'consignacion' && !form.consignante_nombre.trim()) {
      setError('El nombre del consignante es requerido');
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(`${API_BASE}/api/superadmin/autos/${clienteId}/vehiculos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-superadmin-token': token },
        body: JSON.stringify({ ...form, tipo, km: parseInt(form.km) || 0, fotos }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'Error al guardar');
      onGuardado();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ModalOverlay titulo="Nuevo vehículo" onClose={onClose} ancho={620}>
      {/* Indicador de pasos */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {['Tipo', 'Datos del auto', 'Datos económicos'].map((s, i) => (
          <div key={s} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ height: '3px', backgroundColor: paso > i ? DORADO : BORDE, borderRadius: '2px', marginBottom: '4px' }} />
            <span style={{ fontSize: '11px', color: paso === i + 1 ? DORADO : GRIS, fontWeight: paso === i + 1 ? 700 : 400 }}>{i + 1}. {s}</span>
          </div>
        ))}
      </div>

      {/* PASO 1 */}
      {paso === 1 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
            {tiposConfig.map(t => (
              <button key={t.key} onClick={() => setTipo(t.key)}
                style={{ border: `2px solid ${tipo === t.key ? DORADO : BORDE}`, borderRadius: '10px', padding: '20px 12px', cursor: 'pointer', backgroundColor: tipo === t.key ? '#fdf9f0' : CARD, textAlign: 'center', transition: 'all .15s' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: TEXTO, marginBottom: '6px' }}>{t.titulo}</div>
                <div style={{ fontSize: '11px', color: GRIS }}>{t.desc}</div>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button style={btnDorado} onClick={() => setPaso(2)}>Siguiente →</button>
          </div>
        </div>
      )}

      {/* PASO 2 */}
      {paso === 2 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Campo label="Marca *"><input style={inputSt} value={form.marca} onChange={e => set('marca', e.target.value)} placeholder="Toyota" /></Campo>
            <Campo label="Modelo *"><input style={inputSt} value={form.modelo} onChange={e => set('modelo', e.target.value)} placeholder="Corolla" /></Campo>
            <Campo label="Año"><input style={inputSt} type="number" value={form.anio} onChange={e => set('anio', e.target.value)} placeholder="2020" /></Campo>
            <Campo label="Versión"><input style={inputSt} value={form.version} onChange={e => set('version', e.target.value)} placeholder="XEi" /></Campo>
            <Campo label="Color"><input style={inputSt} value={form.color} onChange={e => set('color', e.target.value)} placeholder="Blanco" /></Campo>
            <Campo label="Patente"><input style={inputSt} value={form.patente} onChange={e => set('patente', e.target.value)} placeholder="AB123CD" /></Campo>
            <Campo label="VIN"><input style={inputSt} value={form.vin} onChange={e => set('vin', e.target.value)} /></Campo>
            <Campo label="Km"><input style={inputSt} type="number" value={form.km} onChange={e => set('km', e.target.value)} placeholder="45000" /></Campo>
            <Campo label="Observaciones" full><textarea style={{ ...inputSt, resize: 'vertical', minHeight: '60px' }} value={form.observaciones} onChange={e => set('observaciones', e.target.value)} /></Campo>
            <Campo label="Fotos del vehículo" full>
              <GaleriaFotosEditor fotos={fotos} onChange={setFotos} />
            </Campo>
          </div>
          {error && <p style={{ color: ROJO, fontSize: '12px', margin: '8px 0' }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
            <button style={btnGris} onClick={() => { setPaso(1); setError(''); }}>← Anterior</button>
            <button style={btnDorado} onClick={() => { setError(''); if (validarPaso2()) setPaso(3); }}>Siguiente →</button>
          </div>
        </div>
      )}

      {/* PASO 3 */}
      {paso === 3 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            {tipo === 'propio' && <>
              <Campo label="Precio de compra"><input style={inputSt} type="number" value={form.precio_compra} onChange={e => set('precio_compra', e.target.value)} /></Campo>
              <Campo label="Precio de venta"><input style={inputSt} type="number" value={form.precio_venta} onChange={e => set('precio_venta', e.target.value)} /></Campo>
            </>}
            {tipo === 'consignacion' && <>
              <Campo label="Nombre del dueño *" full><input style={inputSt} value={form.consignante_nombre} onChange={e => set('consignante_nombre', e.target.value)} /></Campo>
              <Campo label="CUIT"><input style={inputSt} value={form.consignante_cuit} onChange={e => set('consignante_cuit', e.target.value)} /></Campo>
              <Campo label="Teléfono"><input style={inputSt} value={form.consignante_telefono} onChange={e => set('consignante_telefono', e.target.value)} /></Campo>
              <Campo label="Precio mínimo acordado"><input style={inputSt} type="number" value={form.precio_minimo_consignacion} onChange={e => set('precio_minimo_consignacion', e.target.value)} /></Campo>
              <Campo label="Precio de venta"><input style={inputSt} type="number" value={form.precio_venta} onChange={e => set('precio_venta', e.target.value)} /></Campo>
            </>}
            {tipo === 'permuta' && <>
              <Campo label="Valor de entrada"><input style={inputSt} type="number" value={form.valor_permuta} onChange={e => set('valor_permuta', e.target.value)} /></Campo>
              <Campo label="Precio de venta"><input style={inputSt} type="number" value={form.precio_venta} onChange={e => set('precio_venta', e.target.value)} /></Campo>
            </>}
          </div>
          {error && <p style={{ color: ROJO, fontSize: '12px', margin: '8px 0' }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
            <button style={btnGris} onClick={() => { setPaso(2); setError(''); }}>← Anterior</button>
            <button style={btnDorado} onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar auto'}
            </button>
          </div>
        </div>
      )}
    </ModalOverlay>
  );
}

// ── MODAL EDITAR VEHÍCULO ─────────────────────────────────────
function ModalEditarVehiculo({ v, clienteId, token, onGuardado, onClose }: {
  v: Vehiculo; clienteId: number; token: string;
  onGuardado: () => void; onClose: () => void;
}) {
  const [form, setForm] = useState({
    marca: v.marca, modelo: v.modelo, anio: v.anio ? String(v.anio) : '',
    version: v.version, color: v.color, patente: v.patente,
    vin: v.vin, km: String(v.km), observaciones: v.observaciones,
    precio_compra: String(v.precio_compra),
    precio_venta: String(v.precio_venta),
    precio_minimo_consignacion: String(v.precio_minimo_consignacion),
    valor_permuta: String(v.valor_permuta),
    consignante_nombre: v.consignante_nombre,
    consignante_cuit: v.consignante_cuit,
    consignante_telefono: v.consignante_telefono,
  });
  const [fotos, setFotos] = useState<string[]>(Array.isArray(v.fotos) ? v.fotos : []);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, val: string) => setForm(f => ({ ...f, [k]: val }));

  const guardar = async () => {
    setError('');
    setGuardando(true);
    try {
      const res = await fetch(`${API_BASE}/api/superadmin/autos/${clienteId}/vehiculos/${v.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-superadmin-token': token },
        body: JSON.stringify({ ...form, km: parseInt(form.km) || 0, fotos }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'Error al guardar');
      onGuardado();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ModalOverlay titulo={`Editar — ${v.marca} ${v.modelo}`} onClose={onClose} ancho={620}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Campo label="Marca"><input style={inputSt} value={form.marca} onChange={e => set('marca', e.target.value)} /></Campo>
        <Campo label="Modelo"><input style={inputSt} value={form.modelo} onChange={e => set('modelo', e.target.value)} /></Campo>
        <Campo label="Año"><input style={inputSt} type="number" value={form.anio} onChange={e => set('anio', e.target.value)} /></Campo>
        <Campo label="Versión"><input style={inputSt} value={form.version} onChange={e => set('version', e.target.value)} /></Campo>
        <Campo label="Color"><input style={inputSt} value={form.color} onChange={e => set('color', e.target.value)} /></Campo>
        <Campo label="Patente"><input style={inputSt} value={form.patente} onChange={e => set('patente', e.target.value)} /></Campo>
        <Campo label="VIN"><input style={inputSt} value={form.vin} onChange={e => set('vin', e.target.value)} /></Campo>
        <Campo label="Km"><input style={inputSt} type="number" value={form.km} onChange={e => set('km', e.target.value)} /></Campo>

        {v.tipo === 'propio' && <>
          <Campo label="Precio de compra"><input style={inputSt} type="number" value={form.precio_compra} onChange={e => set('precio_compra', e.target.value)} /></Campo>
          <Campo label="Precio de venta"><input style={inputSt} type="number" value={form.precio_venta} onChange={e => set('precio_venta', e.target.value)} /></Campo>
        </>}
        {v.tipo === 'consignacion' && <>
          <Campo label="Nombre consignante" full><input style={inputSt} value={form.consignante_nombre} onChange={e => set('consignante_nombre', e.target.value)} /></Campo>
          <Campo label="CUIT"><input style={inputSt} value={form.consignante_cuit} onChange={e => set('consignante_cuit', e.target.value)} /></Campo>
          <Campo label="Teléfono"><input style={inputSt} value={form.consignante_telefono} onChange={e => set('consignante_telefono', e.target.value)} /></Campo>
          <Campo label="Precio mínimo"><input style={inputSt} type="number" value={form.precio_minimo_consignacion} onChange={e => set('precio_minimo_consignacion', e.target.value)} /></Campo>
          <Campo label="Precio de venta"><input style={inputSt} type="number" value={form.precio_venta} onChange={e => set('precio_venta', e.target.value)} /></Campo>
        </>}
        {v.tipo === 'permuta' && <>
          <Campo label="Valor de entrada"><input style={inputSt} type="number" value={form.valor_permuta} onChange={e => set('valor_permuta', e.target.value)} /></Campo>
          <Campo label="Precio de venta"><input style={inputSt} type="number" value={form.precio_venta} onChange={e => set('precio_venta', e.target.value)} /></Campo>
        </>}

        <Campo label="Observaciones" full><textarea style={{ ...inputSt, resize: 'vertical', minHeight: '60px' }} value={form.observaciones} onChange={e => set('observaciones', e.target.value)} /></Campo>
        <Campo label="Fotos del vehículo" full>
          <GaleriaFotosEditor fotos={fotos} onChange={setFotos} />
        </Campo>
      </div>
      {error && <p style={{ color: ROJO, fontSize: '12px', margin: '8px 0' }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
        <button style={btnGris} onClick={onClose}>Cancelar</button>
        <button style={btnDorado} onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
      </div>
    </ModalOverlay>
  );
}

// ── MODAL REGISTRAR VENTA ─────────────────────────────────────
function ModalVenta({ v, socios, clienteId, token, onVendido, onClose }: {
  v: Vehiculo; socios: Socio[]; clienteId: number; token: string;
  onVendido: () => void; onClose: () => void;
}) {
  const [form, setForm] = useState({
    comprador_nombre: '', comprador_cuit: '', comprador_telefono: '',
    precio_venta: String(v.precio_venta || ''),
    forma_pago: 'efectivo',
    monto_recibido: '',
    socio_id: '',
    comision_manual: '',
    tipo_comision: 'porcentaje',
    observaciones: '',
    fecha: hoy(),
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string, val: string) => setForm(f => ({ ...f, [k]: val }));

  const pv        = parseFloat(form.precio_venta) || 0;
  const comManual = parseFloat(form.comision_manual) || 0;

  let costo = 0;
  let ganancia = 0;
  let transito = 0;
  if (v.tipo === 'propio') {
    costo    = parseFloat(String(v.precio_compra)) || 0;
    ganancia = pv - costo;
  } else if (v.tipo === 'consignacion') {
    costo    = parseFloat(String(v.precio_minimo_consignacion)) || 0;
    ganancia = pv - costo;
    transito = costo;
  } else if (v.tipo === 'permuta') {
    costo    = parseFloat(String(v.valor_permuta)) || 0;
    ganancia = pv - costo;
  }

  let comisionSocio = 0;
  if (form.socio_id && comManual > 0) {
    comisionSocio = form.tipo_comision === 'porcentaje'
      ? ganancia * (comManual / 100)
      : comManual;
  }

  const vuelto = form.forma_pago === 'efectivo' && form.monto_recibido
    ? (parseFloat(form.monto_recibido) || 0) - pv
    : null;

  const labelCosto = v.tipo === 'consignacion' ? 'Al consignante' : v.tipo === 'permuta' ? 'Valor entrada' : 'Precio compra';

  const confirmar = async () => {
    if (!pv) { setError('El precio de venta es requerido'); return; }
    setError('');
    setGuardando(true);
    try {
      const socioSeleccionado = socios.find(s => String(s.id) === form.socio_id);
      const res = await fetch(`${API_BASE}/api/superadmin/autos/${clienteId}/ventas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-superadmin-token': token },
        body: JSON.stringify({
          vehiculo_id: v.id,
          comprador_nombre: form.comprador_nombre,
          comprador_cuit: form.comprador_cuit,
          comprador_telefono: form.comprador_telefono,
          precio_venta: pv,
          forma_pago: form.forma_pago,
          socio_id: form.socio_id ? parseInt(form.socio_id) : null,
          comision_socio_manual: comManual || null,
          tipo_comision: form.tipo_comision,
          observaciones: form.observaciones,
          fecha: form.fecha,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'Error al registrar venta');
      onVendido();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ModalOverlay titulo={`Vender — ${vehiculoLabel(v as any)}`} onClose={onClose} ancho={560}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Campo label="Nombre comprador" full><input style={inputSt} value={form.comprador_nombre} onChange={e => set('comprador_nombre', e.target.value)} /></Campo>
        <Campo label="CUIT"><input style={inputSt} value={form.comprador_cuit} onChange={e => set('comprador_cuit', e.target.value)} /></Campo>
        <Campo label="Teléfono"><input style={inputSt} value={form.comprador_telefono} onChange={e => set('comprador_telefono', e.target.value)} /></Campo>
        <Campo label="Precio de venta *"><input style={inputSt} type="number" value={form.precio_venta} onChange={e => set('precio_venta', e.target.value)} /></Campo>
        <Campo label="Forma de pago">
          <select style={selectSt} value={form.forma_pago} onChange={e => set('forma_pago', e.target.value)}>
            {FORMAS_PAGO.map(f => <option key={f} value={f}>{fmtPago(f)}</option>)}
          </select>
        </Campo>
        {form.forma_pago === 'efectivo' && (
          <Campo label="Monto recibido"><input style={inputSt} type="number" value={form.monto_recibido} onChange={e => set('monto_recibido', e.target.value)} /></Campo>
        )}
        <Campo label="Fecha"><input style={inputSt} type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} /></Campo>
      </div>

      {/* Resumen */}
      <div style={{ backgroundColor: BG, border: `1px solid ${BORDE}`, borderRadius: '8px', padding: '14px 16px', margin: '8px 0 16px', fontSize: '13px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ color: GRIS }}>Precio de venta</span>
          <span style={{ fontWeight: 600, color: TEXTO }}>{fmt(pv)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ color: GRIS }}>{labelCosto}</span>
          <span style={{ color: ROJO }}>-{fmt(costo)}</span>
        </div>
        <div style={{ borderTop: `1px solid ${BORDE}`, marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, color: TEXTO }}>Tu ganancia</span>
          <span style={{ fontWeight: 700, color: ganancia >= 0 ? VERDE : ROJO }}>{fmt(ganancia)}</span>
        </div>
        {transito > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ color: GRIS }}>Dinero en tránsito</span>
            <span style={{ color: DORADO, fontWeight: 600 }}>{fmt(transito)}</span>
          </div>
        )}
        {vuelto !== null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ color: GRIS }}>Vuelto</span>
            <span style={{ color: vuelto >= 0 ? VERDE : ROJO, fontWeight: 600 }}>{fmt(vuelto)}</span>
          </div>
        )}
        {comisionSocio > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ color: GRIS }}>Comisión socio</span>
            <span style={{ color: DORADO }}>{fmt(comisionSocio)}</span>
          </div>
        )}
      </div>

      {/* Socio */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Campo label="Socio (opcional)">
          <select style={selectSt} value={form.socio_id} onChange={e => {
            const s = socios.find(x => String(x.id) === e.target.value);
            set('socio_id', e.target.value);
            if (s) { set('comision_manual', String(s.comision_default)); set('tipo_comision', s.tipo_comision); }
          }}>
            <option value="">Sin socio</option>
            {socios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </Campo>
        {form.socio_id && <>
          <Campo label="Tipo comisión">
            <select style={selectSt} value={form.tipo_comision} onChange={e => set('tipo_comision', e.target.value)}>
              <option value="porcentaje">Porcentaje %</option>
              <option value="fijo">Monto fijo</option>
            </select>
          </Campo>
          <Campo label={form.tipo_comision === 'porcentaje' ? 'Comisión %' : 'Comisión $'} full>
            <input style={inputSt} type="number" value={form.comision_manual} onChange={e => set('comision_manual', e.target.value)} />
          </Campo>
        </>}
        <Campo label="Observaciones" full>
          <textarea style={{ ...inputSt, resize: 'vertical', minHeight: '50px' }} value={form.observaciones} onChange={e => set('observaciones', e.target.value)} />
        </Campo>
      </div>

      {error && <p style={{ color: ROJO, fontSize: '12px', margin: '8px 0' }}>{error}</p>}
      <button style={{ ...btnDorado, width: '100%', padding: '12px', fontSize: '14px', marginTop: '4px' }} onClick={confirmar} disabled={guardando}>
        {guardando ? 'Procesando…' : 'Confirmar venta'}
      </button>
    </ModalOverlay>
  );
}

// ── MODAL AGREGAR SOCIO ───────────────────────────────────────
function ModalSocio({ clienteId, token, onGuardado, onClose }: {
  clienteId: number; token: string; onGuardado: () => void; onClose: () => void;
}) {
  const [form, setForm] = useState({ nombre: '', telefono: '', comision_default: '', tipo_comision: 'porcentaje' });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const guardar = async () => {
    if (!form.nombre.trim()) { setError('Nombre requerido'); return; }
    setGuardando(true);
    try {
      const res = await fetch(`${API_BASE}/api/superadmin/autos/${clienteId}/socios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-superadmin-token': token },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'Error');
      onGuardado();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ModalOverlay titulo="Agregar socio" onClose={onClose} ancho={440}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Campo label="Nombre *" full><input style={inputSt} value={form.nombre} onChange={e => set('nombre', e.target.value)} /></Campo>
        <Campo label="Teléfono"><input style={inputSt} value={form.telefono} onChange={e => set('telefono', e.target.value)} /></Campo>
        <Campo label="Tipo comisión">
          <select style={selectSt} value={form.tipo_comision} onChange={e => set('tipo_comision', e.target.value)}>
            <option value="porcentaje">Porcentaje %</option>
            <option value="fijo">Monto fijo</option>
          </select>
        </Campo>
        <Campo label="Comisión default"><input style={inputSt} type="number" value={form.comision_default} onChange={e => set('comision_default', e.target.value)} /></Campo>
      </div>
      {error && <p style={{ color: ROJO, fontSize: '12px', margin: '4px 0' }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
        <button style={btnGris} onClick={onClose}>Cancelar</button>
        <button style={btnDorado} onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </ModalOverlay>
  );
}

// ── MODAL IMPORTAR EXCEL ──────────────────────────────────────
function ModalImportar({ clienteId, token, onImportado, onClose }: {
  clienteId: number; token: string; onImportado: () => void; onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<{ importados: number; errores: string[] } | null>(null);
  const [error, setError] = useState('');

  const importar = async (file: File) => {
    setCargando(true);
    setError('');
    const fd = new FormData();
    fd.append('archivo', file);
    try {
      const res = await fetch(`${API_BASE}/api/superadmin/autos/${clienteId}/vehiculos/importar`, {
        method: 'POST',
        headers: { 'x-superadmin-token': token },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'Error al importar');
      setResultado(data);
      if (data.importados > 0) onImportado();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <ModalOverlay titulo="Importar desde Excel" onClose={onClose} ancho={480}>
      <p style={{ fontSize: '13px', color: GRIS, margin: '0 0 16px' }}>
        El archivo debe tener las columnas: <strong>marca</strong>, <strong>modelo</strong> (requeridas).<br />
        Opcionales: anio, version, color, patente, km, tipo, precio_venta, precio_compra, observaciones.
      </p>
      {!resultado && (
        <>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.[0]) importar(e.target.files[0]); }} />
          <button style={{ ...btnDorado, width: '100%' }} onClick={() => inputRef.current?.click()} disabled={cargando}>
            {cargando ? 'Importando…' : '↑ Seleccionar archivo Excel'}
          </button>
          {error && <p style={{ color: ROJO, fontSize: '12px', marginTop: '8px' }}>{error}</p>}
        </>
      )}
      {resultado && (
        <div>
          <p style={{ color: VERDE, fontWeight: 600, marginBottom: '8px' }}>✓ {resultado.importados} vehículos importados</p>
          {resultado.errores.length > 0 && (
            <div style={{ backgroundColor: '#fff5f5', border: `1px solid ${ROJO}`, borderRadius: '6px', padding: '10px', maxHeight: '160px', overflowY: 'auto' }}>
              {resultado.errores.map((e, i) => <p key={i} style={{ margin: '2px 0', fontSize: '12px', color: ROJO }}>{e}</p>)}
            </div>
          )}
          <button style={{ ...btnDorado, marginTop: '16px' }} onClick={onClose}>Cerrar</button>
        </div>
      )}
    </ModalOverlay>
  );
}

// ════════════════════════════════════════════════════════════════
// ── NUMERO A LETRAS ──────────────────────────────────────────────
function numeroALetras(n: number): string {
  const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
                    'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS',
                    'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const decenas  = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA',
                    'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const centenas = ['', 'CIEN', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
                    'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  if (n === 0) return 'CERO';

  function menorMil(num: number): string {
    if (num === 0) return '';
    if (num === 100) return 'CIEN';
    if (num < 20) return unidades[num];
    if (num < 100) {
      const d = Math.floor(num / 10);
      const u = num % 10;
      return u === 0 ? decenas[d] : `${decenas[d]} Y ${unidades[u]}`;
    }
    const c = Math.floor(num / 100);
    const resto = num % 100;
    const centStr = c === 1 && resto > 0 ? 'CIENTO' : centenas[c];
    return resto === 0 ? centStr : `${centStr} ${menorMil(resto)}`;
  }

  const millones = Math.floor(n / 1_000_000);
  const miles    = Math.floor((n % 1_000_000) / 1_000);
  const resto    = n % 1_000;

  let resultado = '';
  if (millones > 0) {
    resultado += millones === 1 ? 'UN MILLÓN ' : `${menorMil(millones)} MILLONES `;
  }
  if (miles > 0) {
    resultado += miles === 1 ? 'MIL ' : `${menorMil(miles)} MIL `;
  }
  if (resto > 0) {
    resultado += menorMil(resto);
  }
  return resultado.trim();
}

// ── CONTRATO PDF ─────────────────────────────────────────────────
function generarContratoPDF(venta: VentaAuto, clienteId: number) {
  const cfg = (() => {
    try { return JSON.parse(localStorage.getItem(`roberto_config_${clienteId}`) || '{}'); }
    catch { return {}; }
  })();

  const fecha   = venta.fecha ? new Date(venta.fecha + 'T00:00:00') : new Date();
  const dia     = fecha.getDate();
  const mes     = fecha.toLocaleDateString('es-AR', { month: 'long' });
  const anio    = fecha.getFullYear();
  const ciudad  = cfg.ciudad || '[Ciudad]';
  const precio  = Number(venta.precio_venta) || 0;
  const fmtPrecio = precio.toLocaleString('es-AR');
  const enLetras  = numeroALetras(Math.round(precio));

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Contrato de Compraventa — ${venta.marca} ${venta.modelo}</title>
<style>
  @media print { body { margin: 0; } .no-print { display: none; } }
  body { font-family: Arial, sans-serif; font-size: 14px; color: #333; max-width: 800px; margin: 0 auto; padding: 40px; }
  h1 { text-align: center; font-size: 20px; text-transform: uppercase; border-bottom: 2px solid #333; padding-bottom: 10px; }
  h2 { font-size: 14px; margin-top: 20px; text-transform: uppercase; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0; }
  .field label { font-weight: bold; font-size: 12px; color: #666; }
  .field span { display: block; }
  .precio { font-size: 18px; font-weight: bold; margin: 15px 0; }
  .firmas { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 60px; }
  .firma-box { border-top: 1px solid #333; padding-top: 10px; text-align: center; }
  .aclaracion { font-size: 11px; color: #999; text-align: center; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px; }
  .btn-imprimir { display: block; margin: 0 auto 20px; padding: 10px 24px; background: #1a1a2e; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
</style>
</head>
<body>
<button class="btn-imprimir no-print" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
<h1>Contrato de Compraventa de Vehículo</h1>
<p>En <strong>${ciudad}</strong>, a los <strong>${dia}</strong> días del mes de <strong>${mes}</strong> de <strong>${anio}</strong></p>

<h2>Vendedor</h2>
<div class="grid">
  <div class="field"><label>Razón Social</label><span>${cfg.nombre_comercial || '___________'}</span></div>
  <div class="field"><label>CUIT</label><span>${cfg.cuit || '___________'}</span></div>
  <div class="field"><label>Dirección</label><span>${cfg.direccion || '___________'}</span></div>
</div>

<h2>Comprador</h2>
<div class="grid">
  <div class="field"><label>Nombre y Apellido</label><span>${venta.comprador_nombre || '___________'}</span></div>
  <div class="field"><label>Teléfono</label><span>${venta.comprador_telefono || '___________'}</span></div>
  <div class="field"><label>Email</label><span>${venta.comprador_email || '—'}</span></div>
  <div class="field"><label>CUIT/DNI</label><span>${venta.comprador_cuit || '___________'}</span></div>
</div>

<h2>Vehículo</h2>
<div class="grid">
  <div class="field"><label>Marca</label><span>${venta.marca || '—'}</span></div>
  <div class="field"><label>Modelo</label><span>${venta.modelo || '—'}</span></div>
  <div class="field"><label>Año</label><span>${venta.anio || '—'}</span></div>
  <div class="field"><label>Versión</label><span>${venta.version || '—'}</span></div>
  <div class="field"><label>Color</label><span>${venta.color || '—'}</span></div>
  <div class="field"><label>Patente/Dominio</label><span>${venta.patente || '—'}</span></div>
  <div class="field"><label>Número de Chasis (VIN)</label><span>${venta.vin || '___________'}</span></div>
  <div class="field"><label>Kilometraje</label><span>${venta.km != null ? venta.km.toLocaleString('es-AR') + ' km' : '—'}</span></div>
</div>

<h2>Precio y Forma de Pago</h2>
<p class="precio">$ ${fmtPrecio}</p>
<p>${enLetras} PESOS</p>
<p><strong>Forma de pago:</strong> ${venta.forma_pago || '—'}</p>

<p style="margin-top:20px;line-height:1.8">
  El vendedor declara que el vehículo descripto es de su legítima propiedad y se encuentra libre de todo gravamen,
  prenda, embargo o inhibición. Las partes acuerdan que la transferencia del dominio se realizará conforme a las
  disposiciones legales vigentes ante el Registro Nacional del Automotor correspondiente.
</p>

<div class="firmas">
  <div class="firma-box">
    <p>${cfg.nombre_comercial || 'VENDEDOR'}</p>
    <p style="font-size:12px;color:#666">CUIT: ${cfg.cuit || ''}</p>
  </div>
  <div class="firma-box">
    <p>${venta.comprador_nombre || 'COMPRADOR'}</p>
    <p style="font-size:12px;color:#666">DNI/CUIT: ___________</p>
  </div>
</div>

<p class="aclaracion">
  Este documento es un comprobante comercial interno. Para su validez legal debe ser certificado ante
  escribano público o en el Registro Nacional del Automotor correspondiente.
</p>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════════════════
function RobertoAutos() {
  const navigate = useNavigate();

  const [sesion,    setSesion]    = useState<Sesion | null>(null);
  const [tab,       setTab]       = useState<'stock' | 'ventas' | 'socios' | 'liquidaciones'>('stock');
  const [dash,      setDash]      = useState<Dashboard>({ disponibles: 0, reservados: 0, vendidos_mes: 0, ganancia_mes: 0, comisiones_socios_mes: 0, dinero_transito: 0 });

  // Stock
  const [vehiculos,   setVehiculos]   = useState<Vehiculo[]>([]);
  const [vTotal,      setVTotal]      = useState(0);
  const [vPagina,     setVPagina]     = useState(1);
  const [vBuscar,     setVBuscar]     = useState('');
  const [vEstado,     setVEstado]     = useState('');
  const [vTipo,       setVTipo]       = useState('');

  // Ventas
  const [ventas,      setVentas]      = useState<VentaAuto[]>([]);
  const [venTotal,    setVenTotal]    = useState(0);
  const [venPagina,   setVenPagina]   = useState(1);
  const [venDesde,    setVenDesde]    = useState('');
  const [venHasta,    setVenHasta]    = useState('');

  // Socios
  const [socios,      setSocios]      = useState<Socio[]>([]);

  // Liquidaciones
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([]);

  // Modales
  const [modalNuevo,   setModalNuevo]   = useState(false);
  const [modalEditar,  setModalEditar]  = useState<Vehiculo | null>(null);
  const [modalVenta,   setModalVenta]   = useState<Vehiculo | null>(null);
  const [modalSocio,   setModalSocio]   = useState(false);
  const [modalImport,  setModalImport]  = useState(false);

  const [cargando, setCargando] = useState(true);

  // ── AUTH ──────────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem('roberto_portal_session');
      if (!raw) { navigate('/roberto/login'); return; }
      const s: Sesion = JSON.parse(raw);
      if (!s.token) { navigate('/roberto/login'); return; }
      setSesion(s);
    } catch {
      navigate('/roberto/login');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const token     = getSuperadminToken();
  const clienteId = sesion?.cliente.id || 0;

  // ── CARGA DASHBOARD ──────────────────────────────────────
  const cargarDash = useCallback(async () => {
    if (!clienteId || !token) return;
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/autos/${clienteId}/dashboard`, {
        headers: { 'x-superadmin-token': token },
      });
      if (r.ok) setDash(await r.json());
    } catch {}
  }, [clienteId, token]);

  // ── CARGA STOCK ───────────────────────────────────────────
  const cargarVehiculos = useCallback(async (pagina = 1) => {
    if (!clienteId || !token) return;
    setCargando(true);
    try {
      const params = new URLSearchParams({ page: String(pagina), limit: '25' });
      if (vBuscar)  params.set('buscar', vBuscar);
      if (vEstado)  params.set('estado', vEstado);
      if (vTipo)    params.set('tipo',   vTipo);
      const r = await fetch(`${API_BASE}/api/superadmin/autos/${clienteId}/vehiculos?${params}`, {
        headers: { 'x-superadmin-token': token },
      });
      if (r.ok) { const d = await r.json(); setVehiculos(d.vehiculos); setVTotal(d.total); setVPagina(pagina); }
    } catch {}
    setCargando(false);
  }, [clienteId, token, vBuscar, vEstado, vTipo]);

  // ── CARGA VENTAS ──────────────────────────────────────────
  const cargarVentas = useCallback(async (pagina = 1) => {
    if (!clienteId || !token) return;
    const params = new URLSearchParams({ page: String(pagina), limit: '25' });
    if (venDesde) params.set('fecha_desde', venDesde);
    if (venHasta) params.set('fecha_hasta', venHasta);
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/autos/${clienteId}/ventas?${params}`, {
        headers: { 'x-superadmin-token': token },
      });
      if (r.ok) { const d = await r.json(); setVentas(d.ventas); setVenTotal(d.total); setVenPagina(pagina); }
    } catch {}
  }, [clienteId, token, venDesde, venHasta]);

  // ── CARGA SOCIOS ──────────────────────────────────────────
  const cargarSocios = useCallback(async () => {
    if (!clienteId || !token) return;
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/autos/${clienteId}/socios`, {
        headers: { 'x-superadmin-token': token },
      });
      if (r.ok) { const d = await r.json(); setSocios(d.socios); }
    } catch {}
  }, [clienteId, token]);

  // ── CARGA LIQUIDACIONES ───────────────────────────────────
  const cargarLiquidaciones = useCallback(async () => {
    if (!clienteId || !token) return;
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/autos/${clienteId}/liquidaciones`, {
        headers: { 'x-superadmin-token': token },
      });
      if (r.ok) { const d = await r.json(); setLiquidaciones(d.liquidaciones); }
    } catch {}
  }, [clienteId, token]);

  // ── EFECTOS POR TAB ───────────────────────────────────────
  useEffect(() => {
    if (!sesion) return;
    cargarDash();
    cargarVehiculos(1);
    cargarSocios();
  }, [sesion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sesion) return;
    if (tab === 'ventas')       cargarVentas(1);
    if (tab === 'liquidaciones') cargarLiquidaciones();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sesion && tab === 'stock') cargarVehiculos(1);
  }, [vBuscar, vEstado, vTipo]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── CAMBIAR ESTADO VEHÍCULO ───────────────────────────────
  const cambiarEstado = async (id: number, estado: string) => {
    try {
      await fetch(`${API_BASE}/api/superadmin/autos/${clienteId}/vehiculos/${id}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-superadmin-token': token },
        body: JSON.stringify({ estado }),
      });
      cargarVehiculos(vPagina);
      cargarDash();
    } catch {}
  };

  // ── PAGAR LIQUIDACIÓN ─────────────────────────────────────
  const pagarLiquidacion = async (id: number) => {
    if (!window.confirm('¿Marcar esta liquidación como pagada?')) return;
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/autos/${clienteId}/liquidaciones/${id}/pagar`, {
        method: 'PUT',
        headers: { 'x-superadmin-token': token },
      });
      if (r.ok) { cargarLiquidaciones(); cargarDash(); }
    } catch {}
  };

  // ── EXPORTAR EXCEL CLIENT-SIDE ────────────────────────────
  const exportarExcel = (datos: any[], nombre: string) => {
    import('xlsx').then(XLSX => {
      const ws = XLSX.utils.json_to_sheet(datos);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Datos');
      XLSX.writeFile(wb, `${nombre}_${hoy()}.xlsx`);
    });
  };

  // ── IMPRIMIR ──────────────────────────────────────────────
  const imprimir = (contenido: string, titulo: string) => {
    const cfg = getConfigNegocio(clienteId);
    const membrete = `
      <div style="margin-bottom:24px;border-bottom:2px solid #333;padding-bottom:12px">
        <strong style="font-size:18px">${cfg.nombre_comercial || 'Mi Negocio'}</strong><br/>
        ${cfg.direccion ? `${cfg.direccion}<br/>` : ''}
        ${cfg.cuit ? `CUIT: ${cfg.cuit}` : ''} ${cfg.telefono ? `· Tel: ${cfg.telefono}` : ''}
      </div>
      <h2 style="margin:0 0 16px">${titulo}</h2>
    `;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html><head><title>${titulo}</title><style>body{font-family:sans-serif;padding:32px;font-size:13px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f5f5f5}</style></head><body>${membrete}${contenido}</body></html>`);
    win.document.close();
    win.print();
  };

  if (!sesion) return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '32px', height: '32px', border: `3px solid ${BORDE}`, borderTopColor: DORADO, borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── RENDER TABS ───────────────────────────────────────────
  const TABS = [
    { id: 'stock' as const, label: 'Stock' },
    { id: 'ventas' as const, label: 'Ventas' },
    { id: 'socios' as const, label: 'Socios' },
    { id: 'liquidaciones' as const, label: 'Liquidaciones' },
  ];

  const paginas = Math.ceil(vTotal / 25) || 1;
  const venPaginas = Math.ceil(venTotal / 25) || 1;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, color: TEXTO }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* HEADER */}
      <div style={{ backgroundColor: CARD, borderBottom: `1px solid ${BORDE}`, padding: '0 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/roberto/dashboard')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: GRIS, fontSize: '13px' }}>← Dashboard</button>
          <span style={{ color: BORDE }}>|</span>
          <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: TEXTO }}>Autos</h1>
        </div>
        <button style={btnDorado} onClick={() => setModalNuevo(true)}>+ Nuevo auto</button>
      </div>

      <div style={{ padding: '24px 28px', maxWidth: '1280px', margin: '0 auto' }}>

        {/* DASHBOARD CARDS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px', marginBottom: '24px' }}>
          {[
            { label: 'Disponibles',      valor: dash.disponibles,              color: VERDE  },
            { label: 'Reservados',        valor: dash.reservados,               color: DORADO },
            { label: 'Vendidos este mes', valor: dash.vendidos_mes,             color: TEXTO  },
            { label: 'Ganancia mes',      valor: fmt(dash.ganancia_mes),        color: VERDE  },
            { label: 'Comisiones socios', valor: fmt(dash.comisiones_socios_mes), color: DORADO },
          ].map(c => (
            <div key={c.label} style={{ backgroundColor: CARD, borderRadius: '10px', border: `1px solid ${BORDE}`, borderLeft: `4px solid ${c.color}`, padding: '16px 18px' }}>
              <div style={{ fontSize: '22px', fontWeight: 700, color: c.color, marginBottom: '4px' }}>{c.valor}</div>
              <div style={{ fontSize: '12px', color: GRIS }}>{c.label}</div>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div style={{ display: 'flex', borderBottom: `2px solid ${BORDE}`, marginBottom: '20px', gap: '4px' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 18px', fontSize: '13px', fontWeight: 600, color: tab === t.id ? TEXTO : GRIS, borderBottom: `2px solid ${tab === t.id ? DORADO : 'transparent'}`, marginBottom: '-2px', transition: 'all .15s' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── TAB STOCK ─────────────────────────────────────── */}
        {tab === 'stock' && (
          <div>
            {/* Filtros */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input style={{ ...inputSt, maxWidth: '260px' }} placeholder="Buscar marca, modelo, patente…"
                value={vBuscar} onChange={e => setVBuscar(e.target.value)} />
              <select style={{ ...selectSt, maxWidth: '140px' }} value={vEstado} onChange={e => setVEstado(e.target.value)}>
                <option value="">Todos los estados</option>
                <option value="disponible">Disponible</option>
                <option value="reservado">Reservado</option>
                <option value="vendido">Vendido</option>
              </select>
              <select style={{ ...selectSt, maxWidth: '140px' }} value={vTipo} onChange={e => setVTipo(e.target.value)}>
                <option value="">Todos los tipos</option>
                <option value="propio">Propio</option>
                <option value="consignacion">Consignación</option>
                <option value="permuta">Permuta</option>
              </select>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                <button style={btnGris} onClick={() => setModalImport(true)}>↑ Importar Excel</button>
                <button style={btnGris} onClick={() => exportarExcel(vehiculos.map(v => ({
                  Marca: v.marca, Modelo: v.modelo, Año: v.anio, Versión: v.version,
                  Color: v.color, Patente: v.patente, Km: v.km, Tipo: v.tipo,
                  Estado: v.estado, 'Precio venta': v.precio_venta,
                })), 'stock_autos')}>↓ Excel</button>
              </div>
            </div>

            {/* Tabla */}
            <div style={{ backgroundColor: CARD, borderRadius: '10px', border: `1px solid ${BORDE}`, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: BG }}>
                    {['Vehículo', 'Patente', 'Tipo', 'Estado', 'Precio', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: '11px', color: GRIS, textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: `1px solid ${BORDE}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cargando ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: GRIS }}>Cargando…</td></tr>
                  ) : vehiculos.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: GRIS }}>No hay vehículos</td></tr>
                  ) : vehiculos.map((v, i) => (
                    <tr key={v.id} style={{ borderBottom: `1px solid ${BORDE}`, backgroundColor: i % 2 === 0 ? CARD : BG }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 600, color: TEXTO }}>{v.marca} {v.modelo} {v.anio || ''}</div>
                        {v.version && <div style={{ fontSize: '11px', color: GRIS }}>{v.version}</div>}
                      </td>
                      <td style={{ padding: '10px 14px', color: GRIS }}>{v.patente || '—'}</td>
                      <td style={{ padding: '10px 14px' }}><BadgeTipo tipo={v.tipo} /></td>
                      <td style={{ padding: '10px 14px' }}><BadgeEstado estado={v.estado} /></td>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{fmt(v.precio_venta)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button style={btnIcono} title="Editar" onClick={() => setModalEditar(v)}>✏️</button>
                          {v.estado !== 'vendido' && (
                            <button style={btnIcono} title="Registrar venta" onClick={() => setModalVenta(v)}>💰</button>
                          )}
                          {v.estado === 'disponible' && (
                            <button style={btnIcono} title="Marcar reservado" onClick={() => cambiarEstado(v.id, 'reservado')}>🔒</button>
                          )}
                          {v.estado === 'reservado' && (
                            <button style={btnIcono} title="Volver a disponible" onClick={() => cambiarEstado(v.id, 'disponible')}>🔓</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {paginas > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
                <button style={btnGris} disabled={vPagina <= 1} onClick={() => cargarVehiculos(vPagina - 1)}>← Anterior</button>
                <span style={{ padding: '9px 14px', fontSize: '13px', color: GRIS }}>{vPagina} / {paginas}</span>
                <button style={btnGris} disabled={vPagina >= paginas} onClick={() => cargarVehiculos(vPagina + 1)}>Siguiente →</button>
              </div>
            )}
          </div>
        )}

        {/* ── TAB VENTAS ────────────────────────────────────── */}
        {tab === 'ventas' && (
          <div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
              <input style={{ ...inputSt, maxWidth: '150px' }} type="date" value={venDesde} onChange={e => { setVenDesde(e.target.value); cargarVentas(1); }} />
              <span style={{ color: GRIS, fontSize: '12px' }}>hasta</span>
              <input style={{ ...inputSt, maxWidth: '150px' }} type="date" value={venHasta} onChange={e => { setVenHasta(e.target.value); cargarVentas(1); }} />
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                <button style={btnGris} onClick={() => exportarExcel(ventas.map(v => ({
                  Fecha: fmtF(v.fecha), Auto: `${v.marca} ${v.modelo} ${v.anio || ''}`.trim(),
                  Comprador: v.comprador_nombre, 'Precio venta': v.precio_venta,
                  Ganancia: v.ganancia, Socio: v.socio_nombre || '',
                })), 'ventas_autos')}>↓ Excel</button>
                <button style={btnGris} onClick={() => {
                  const filas = ventas.map(v => `<tr><td>${fmtF(v.fecha)}</td><td>${v.marca} ${v.modelo}</td><td>${v.comprador_nombre}</td><td>${fmt(v.precio_venta)}</td><td>${fmt(v.ganancia)}</td><td>${v.socio_nombre || '—'}</td></tr>`).join('');
                  imprimir(`<table><thead><tr><th>Fecha</th><th>Auto</th><th>Comprador</th><th>Precio</th><th>Ganancia</th><th>Socio</th></tr></thead><tbody>${filas}</tbody></table>`, 'Ventas de autos');
                }}>🖨 Imprimir</button>
              </div>
            </div>

            <div style={{ backgroundColor: CARD, borderRadius: '10px', border: `1px solid ${BORDE}`, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: BG }}>
                    {['Fecha', 'Auto', 'Comprador', 'Precio venta', 'Ganancia', 'Socio', 'Forma pago', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: '11px', color: GRIS, textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: `1px solid ${BORDE}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ventas.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: GRIS }}>No hay ventas</td></tr>
                  ) : ventas.map((v, i) => (
                    <tr key={v.id} style={{ borderBottom: `1px solid ${BORDE}`, backgroundColor: i % 2 === 0 ? CARD : BG }}>
                      <td style={{ padding: '10px 14px', color: GRIS }}>{fmtF(v.fecha)}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{v.marca} {v.modelo} {v.anio || ''}</td>
                      <td style={{ padding: '10px 14px' }}>{v.comprador_nombre || '—'}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{fmt(v.precio_venta)}</td>
                      <td style={{ padding: '10px 14px', color: v.ganancia >= 0 ? VERDE : ROJO, fontWeight: 600 }}>{fmt(v.ganancia)}</td>
                      <td style={{ padding: '10px 14px', color: GRIS }}>{v.socio_nombre || '—'}</td>
                      <td style={{ padding: '10px 14px', color: GRIS }}>{fmtPago(v.forma_pago)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <button onClick={() => generarContratoPDF(v, clienteId)}
                          style={{ background: 'none', border: `1px solid ${BORDE}`, borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: TEXTO }}>
                          📄 Contrato
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {venPaginas > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
                <button style={btnGris} disabled={venPagina <= 1} onClick={() => cargarVentas(venPagina - 1)}>← Anterior</button>
                <span style={{ padding: '9px 14px', fontSize: '13px', color: GRIS }}>{venPagina} / {venPaginas}</span>
                <button style={btnGris} disabled={venPagina >= venPaginas} onClick={() => cargarVentas(venPagina + 1)}>Siguiente →</button>
              </div>
            )}
          </div>
        )}

        {/* ── TAB SOCIOS ────────────────────────────────────── */}
        {tab === 'socios' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <button style={btnDorado} onClick={() => setModalSocio(true)}>+ Agregar socio</button>
            </div>
            <div style={{ backgroundColor: CARD, borderRadius: '10px', border: `1px solid ${BORDE}`, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: BG }}>
                    {['Nombre', 'Teléfono', 'Comisión default', 'Total comisiones'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: '11px', color: GRIS, textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: `1px solid ${BORDE}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {socios.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: GRIS }}>No hay socios registrados</td></tr>
                  ) : socios.map((s, i) => (
                    <tr key={s.id} style={{ borderBottom: `1px solid ${BORDE}`, backgroundColor: i % 2 === 0 ? CARD : BG }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{s.nombre}</td>
                      <td style={{ padding: '10px 14px', color: GRIS }}>{s.telefono || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {s.tipo_comision === 'porcentaje' ? `${s.comision_default}%` : fmt(s.comision_default)}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: DORADO }}>{fmt(s.total_comisiones)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB LIQUIDACIONES ────────────────────────────── */}
        {tab === 'liquidaciones' && (
          <div>
            {dash.dinero_transito > 0 && (
              <div style={{ backgroundColor: '#fdf9f0', border: `1px solid ${DORADO}`, borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px' }}>
                <strong style={{ color: DORADO }}>Dinero en tránsito total:</strong> <span style={{ fontWeight: 700, color: TEXTO }}>{fmt(dash.dinero_transito)}</span>
                <span style={{ color: GRIS, marginLeft: '8px' }}>— pendiente de liquidar a consignantes</span>
              </div>
            )}
            <div style={{ backgroundColor: CARD, borderRadius: '10px', border: `1px solid ${BORDE}`, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: BG }}>
                    {['Consignante', 'Auto', 'Precio venta', 'A liquidar', 'Tu comisión', 'Estado', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: '11px', color: GRIS, textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: `1px solid ${BORDE}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {liquidaciones.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: GRIS }}>No hay liquidaciones</td></tr>
                  ) : liquidaciones.map((liq, i) => (
                    <tr key={liq.id} style={{ borderBottom: `1px solid ${BORDE}`, backgroundColor: i % 2 === 0 ? CARD : BG }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{liq.consignante_nombre}</td>
                      <td style={{ padding: '10px 14px' }}>{liq.marca} {liq.modelo} {liq.anio || ''}</td>
                      <td style={{ padding: '10px 14px' }}>{fmt(liq.precio_venta)}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: TEXTO }}>{fmt(liq.precio_consignante)}</td>
                      <td style={{ padding: '10px 14px', color: VERDE }}>{fmt(liq.comision)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, borderRadius: '4px', padding: '2px 7px',
                          ...(liq.estado === 'pendiente'
                            ? { color: DORADO, border: `1px solid ${DORADO}`, backgroundColor: '#fdf9f0' }
                            : { color: VERDE,  border: `1px solid ${VERDE}`,  backgroundColor: '#f0faf4' }) }}>
                          {liq.estado === 'pendiente' ? 'Pendiente' : 'Pagada'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {liq.estado === 'pendiente' && (
                          <button style={{ ...btnIcono, color: VERDE, borderColor: VERDE }} onClick={() => pagarLiquidacion(liq.id)}>
                            ✓ Pagar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* MODALES */}
      {modalNuevo && (
        <ModalNuevoVehiculo clienteId={clienteId} token={token}
          onGuardado={() => { cargarVehiculos(1); cargarDash(); }}
          onClose={() => setModalNuevo(false)} />
      )}
      {modalEditar && (
        <ModalEditarVehiculo v={modalEditar} clienteId={clienteId} token={token}
          onGuardado={() => cargarVehiculos(vPagina)}
          onClose={() => setModalEditar(null)} />
      )}
      {modalVenta && (
        <ModalVenta v={modalVenta} socios={socios} clienteId={clienteId} token={token}
          onVendido={() => { cargarVehiculos(1); cargarDash(); cargarLiquidaciones(); }}
          onClose={() => setModalVenta(null)} />
      )}
      {modalSocio && (
        <ModalSocio clienteId={clienteId} token={token}
          onGuardado={cargarSocios}
          onClose={() => setModalSocio(false)} />
      )}
      {modalImport && (
        <ModalImportar clienteId={clienteId} token={token}
          onImportado={() => { cargarVehiculos(1); cargarDash(); }}
          onClose={() => setModalImport(false)} />
      )}
    </div>
  );
}

export default RobertoAutos;
