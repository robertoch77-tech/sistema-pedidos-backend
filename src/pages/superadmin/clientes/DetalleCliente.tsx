import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { API_BASE } from '../../../config/api';
const BASE_URL = 'sistemagestionpedidos.netlify.app';

const BLUE  = '#2B6CB0';
const NAVY  = '#1B2A4A';
const SEP   = '#63B3ED';
const GRAY  = '#718096';
const TEXT  = '#2D3748';
const GREEN = '#38A169';
const RED   = '#E53E3E';
const BG    = '#F4F6F9';

// ─── TIPOS ───────────────────────────────────────────────────
interface ClienteDetalle {
  id: number;
  nombre_comercial: string;
  razon_social: string;
  cuit: string;
  condicion_iva: string;
  rubro: string;
  email: string;
  whatsapp: string;
  telefono: string;
  direccion_fiscal: string;
  ciudad_fiscal: string;
  provincia_fiscal: string;
  plan: string;
  estado: string;
  codigo_acceso: string;
  fecha_alta: string | null;
  mayorista_id: number;
  arca_habilitado: boolean;
  habilitar_sucursales: boolean;
  habilitar_empleados: boolean;
  habilitar_mensajes: boolean;
  habilitar_notificaciones: boolean;
  habilitar_banners: boolean;
  habilitar_analiticas: boolean;
  habilitar_ctas_ctes: boolean;
  habilitar_cotizaciones: boolean;
  habilitar_ventas:   boolean;
  habilitar_remitos:  boolean;
  habilitar_stock:    boolean;
  habilitar_cheques:  boolean;
  habilitar_caja:     boolean;
  habilitar_compras:          boolean;
  habilitar_autos:            boolean;
  habilitar_cc_proveedores:   boolean;
  habilitar_catalogo:         boolean;
}

interface EditForm {
  nombre_comercial: string;
  razon_social: string;
  cuit: string;
  rubro: string;
  email: string;
  whatsapp: string;
  telefono: string;
  direccion: string;
  ciudad: string;
  provincia: string;
  plan: string;
  condicion_iva: string;
}

type ModulosState = Record<string, boolean>;

// ─── CONSTANTES ──────────────────────────────────────────────
const rubros       = ['Ferretería', 'Distribuidora', 'Librería-Imprenta', 'Supermercado', 'Otro'];
const condicionesIVA = ['Responsable inscripto', 'Monotributista', 'Exento', 'Consumidor final'];
const planes       = ['Básico', 'Estándar', 'Completo', 'Personalizado'];

const gruposModulos = [
  { titulo: 'Comercial', modulos: [
    { id: 'catalogo',      nombre: 'Catálogo y pedidos',        obligatorio: true },
    { id: 'presupuestos',  nombre: 'Presupuestos' },
    { id: 'ventas',        nombre: 'Ventas' },
    { id: 'remitos',       nombre: 'Remitos' },
    { id: 'compras',       nombre: 'Compras' },
    { id: 'autos',         nombre: 'Autos / Vehículos' },
    { id: 'catalogo_pub',  nombre: 'Catálogo público' },
  ]},
  { titulo: 'Stock', modulos: [
    { id: 'stock',         nombre: 'Gestión de stock' },
  ]},
  { titulo: 'Finanzas', modulos: [
    { id: 'cc_clientes',    nombre: 'Cuenta corriente clientes' },
    { id: 'cc_proveedores', nombre: 'Cuenta corriente proveedores' },
    { id: 'caja',          nombre: 'Caja' },
    { id: 'cheques',       nombre: 'Cheques' },
  ]},
  { titulo: 'Facturación', modulos: [
    { id: 'arca',          nombre: 'ARCA' },
  ]},
  { titulo: 'Comunicación', modulos: [
    { id: 'chat',          nombre: 'Chat con clientes' },
    { id: 'notificaciones',nombre: 'Notificaciones' },
    { id: 'banners',       nombre: 'Banners y novedades' },
  ]},
  { titulo: 'Análisis', modulos: [
    { id: 'analytics',     nombre: 'Analytics' },
  ]},
  { titulo: 'Estructura', modulos: [
    { id: 'sucursales',    nombre: 'Múltiples sucursales' },
    { id: 'empleados',     nombre: 'Acceso para empleados' },
  ]},
];

// ─── HELPERS ─────────────────────────────────────────────────
function formatFecha(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function modulosDesdeCliente(c: ClienteDetalle): ModulosState {
  return {
    catalogo:       true,
    presupuestos:   !!c.habilitar_cotizaciones,
    ventas:         !!c.habilitar_ventas,
    remitos:        !!c.habilitar_remitos,
    stock:          !!c.habilitar_stock,
    cc_clientes:    !!c.habilitar_ctas_ctes,
    cc_proveedores: !!c.habilitar_cc_proveedores,
    caja:           !!c.habilitar_caja,
    cheques:        !!c.habilitar_cheques,
    arca:           !!c.arca_habilitado,
    chat:           !!c.habilitar_mensajes,
    notificaciones: !!c.habilitar_notificaciones,
    banners:        !!c.habilitar_banners,
    analytics:      !!c.habilitar_analiticas,
    sucursales:     !!c.habilitar_sucursales,
    empleados:      !!c.habilitar_empleados,
    compras:        !!c.habilitar_compras,
    autos:          !!c.habilitar_autos,
    catalogo_pub:   !!c.habilitar_catalogo,
  };
}

function getToken(): string {
  try { return JSON.parse(localStorage.getItem('superadmin_session') || '{}').token || ''; }
  catch { return ''; }
}

// ─── SUB-COMPONENTES ─────────────────────────────────────────
function BadgeEstado({ estado }: { estado: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    activo:     { bg: '#F0FFF4', color: GREEN,    label: 'Activo' },
    suspendido: { bg: '#FFF5F5', color: RED,      label: 'Suspendido' },
    prueba:     { bg: '#FFFFF0', color: '#B7791F', label: 'Prueba' },
  };
  const s = map[estado?.toLowerCase()] || { bg: '#EDF2F7', color: GRAY, label: estado };
  return (
    <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 700, backgroundColor: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function Toggle({ activo, onChange, disabled }: { activo: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <div onClick={disabled ? undefined : onChange} style={{ width: '42px', height: '24px', borderRadius: '12px', backgroundColor: activo ? GREEN : '#CBD5E0', position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0, transition: 'background-color 0.2s', opacity: disabled ? 0.7 : 1 }}>
      <div style={{ position: 'absolute', top: '3px', left: activo ? '21px' : '3px', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', border: '1.5px solid #CBD5E0', borderRadius: '7px',
  padding: '8px 12px', fontSize: '14px', color: TEXT, backgroundColor: '#fff',
  outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600, color: GRAY,
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px',
};

const valorStyle: React.CSSProperties = {
  fontSize: '14px', fontWeight: 500, color: TEXT,
};

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────
function DetalleCliente() {
  const { id } = useParams<{ id: string }>();

  const [cliente, setCliente]     = useState<ClienteDetalle | null>(null);
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState('');
  const [editando, setEditando]   = useState(false);
  const [form, setForm]           = useState<EditForm>({
    nombre_comercial: '', razon_social: '', cuit: '', rubro: '', email: '',
    whatsapp: '', telefono: '', direccion: '', ciudad: '', provincia: '', plan: '', condicion_iva: '',
  });
  const [guardando, setGuardando] = useState(false);
  const [guardandoEstado, setGuardandoEstado] = useState(false);
  const [modulos, setModulos]           = useState<ModulosState>({});
  const [modulosOriginales, setModulosOriginales] = useState<ModulosState>({});
  const [modulosCambiados, setModulosCambiados]   = useState(false);
  const [guardandoModulos, setGuardandoModulos]   = useState(false);
  const [msgModulos, setMsgModulos]               = useState('');
  const [copiado, setCopiado]           = useState(false);
  const [exitoMsg, setExitoMsg]         = useState('');
  const [errorMsg, setErrorMsg]         = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('editar') === '1') setEditando(true);
    cargar();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargar = async () => {
    setCargando(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/superadmin/clientes/${id}`, {
        headers: { 'x-superadmin-token': getToken() },
      });
      if (!res.ok) throw new Error('No encontrado');
      const data: ClienteDetalle = await res.json();
      setCliente(data);
      setForm({
        nombre_comercial: data.nombre_comercial || '',
        razon_social:     data.razon_social     || '',
        cuit:             data.cuit             || '',
        rubro:            data.rubro            || '',
        email:            data.email            || '',
        whatsapp:         data.whatsapp         || '',
        telefono:         data.telefono         || '',
        direccion:        data.direccion_fiscal  || '',
        ciudad:           data.ciudad_fiscal     || '',
        provincia:        data.provincia_fiscal  || '',
        plan:             data.plan             || '',
        condicion_iva:    data.condicion_iva     || '',
      });
      setModulos(modulosDesdeCliente(data));
      setModulosOriginales(modulosDesdeCliente(data));
    } catch {
      setError('Error al cargar el cliente');
    } finally {
      setCargando(false);
    }
  };

  const guardarDatos = async () => {
    setGuardando(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/api/superadmin/clientes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-superadmin-token': getToken() },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Error');
      const json = await res.json();
      setCliente(prev => prev ? { ...prev, ...json.cliente } : prev);
      setEditando(false);
      setExitoMsg('Datos guardados correctamente');
      setTimeout(() => setExitoMsg(''), 3000);
    } catch {
      setErrorMsg('Error al guardar. Intentá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async () => {
    if (!cliente) return;
    const nuevoEstado = cliente.estado === 'activo' ? 'suspendido' : 'activo';
    setGuardandoEstado(true);
    try {
      const res = await fetch(`${API_BASE}/api/superadmin/clientes/${id}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-superadmin-token': getToken() },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      if (!res.ok) throw new Error('Error');
      setCliente(prev => prev ? { ...prev, estado: nuevoEstado } : prev);
      setExitoMsg(nuevoEstado === 'activo' ? 'Cliente activado' : 'Cliente suspendido');
      setTimeout(() => setExitoMsg(''), 3000);
    } catch {
      setErrorMsg('Error al cambiar estado');
    } finally {
      setGuardandoEstado(false);
    }
  };

  const toggleModulo = (moduloId: string, obligatorio?: boolean) => {
    if (obligatorio) return;
    const nuevos = { ...modulos, [moduloId]: !modulos[moduloId] };
    setModulos(nuevos);
    setModulosCambiados(true);
    setMsgModulos('');
  };

  const guardarModulos = async () => {
    setGuardandoModulos(true);
    setMsgModulos('');
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/clientes/${id}/modulos`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-superadmin-token': getToken() },
        body: JSON.stringify({ modulos: {
          presupuestos:     modulos.presupuestos,
          chat:             modulos.chat,
          notificaciones:   modulos.notificaciones,
          banners:          modulos.banners,
          analytics:        modulos.analytics,
          cta_cte_clientes:  modulos.cc_clientes,
          cc_proveedores:    modulos.cc_proveedores,
          sucursales:       modulos.sucursales,
          empleados:        modulos.empleados,
          arca:             modulos.arca,
          cheques:          modulos.cheques,
          caja:             modulos.caja,
          ventas:           modulos.ventas,
          remitos:          modulos.remitos,
          stock:            modulos.stock,
          compras:          modulos.compras,
          autos:            modulos.autos,
          catalogo:         modulos.catalogo_pub,
        }}),
      });
      if (r.ok) {
        setModulosOriginales({ ...modulos });
        setModulosCambiados(false);
        setMsgModulos('✅ Módulos guardados');
        setTimeout(() => setMsgModulos(''), 3000);
      } else {
        setMsgModulos('❌ Error al guardar. Intentá de nuevo.');
      }
    } catch {
      setMsgModulos('❌ Error de conexión.');
    } finally {
      setGuardandoModulos(false);
    }
  };

  const cancelarModulos = () => {
    setModulos({ ...modulosOriginales });
    setModulosCambiados(false);
    setMsgModulos('');
  };

  const copiarLink = () => {
    const link = `${BASE_URL}/roberto/login?m=${cliente?.codigo_acceso}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  };

  const abrirWhatsApp = () => {
    const link = `${BASE_URL}/roberto/login?m=${cliente?.codigo_acceso}`;
    const msg = encodeURIComponent(`¡Hola! Te comparto tu acceso al sistema.\nLink: ${link}`);
    window.open(`https://api.whatsapp.com/send?text=${msg}`, '_blank');
  };

  const setF = (field: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  // ── CARGA / ERROR ─────────────────────────────────────────
  if (cargando) return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: `3px solid #BEE3F8`, borderTopColor: BLUE, borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ color: GRAY, fontSize: '14px' }}>Cargando cliente...</p>
      </div>
    </div>
  );

  if (error || !cliente) return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: RED, fontSize: '16px', fontWeight: 600 }}>{error || 'Cliente no encontrado'}</p>
        <button onClick={() => { window.location.href = '/superadmin/clientes'; }} style={{ marginTop: '16px', backgroundColor: BLUE, color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontWeight: 600 }}>
          ← Volver a clientes
        </button>
      </div>
    </div>
  );

  const link = `${BASE_URL}/roberto/login?m=${cliente.codigo_acceso}`;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, padding: '28px' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── SECCIÓN 1: HEADER ──────────────────────────────── */}
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: NAVY, margin: 0 }}>{cliente.nombre_comercial}</h1>
            <BadgeEstado estado={cliente.estado} />
          </div>
          <p style={{ fontSize: '13px', color: GRAY, margin: 0 }}>CUIT {cliente.cuit} · {cliente.rubro || 'Sin rubro'} · Plan {cliente.plan}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={() => { window.location.href = '/superadmin/clientes'; }}
            style={{ backgroundColor: '#fff', color: GRAY, border: '1.5px solid #CBD5E0', borderRadius: '8px', padding: '8px 18px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
            ← Volver
          </button>
          <button onClick={cambiarEstado} disabled={guardandoEstado}
            style={{ backgroundColor: cliente.estado === 'activo' ? '#FFF5F5' : '#F0FFF4', color: cliente.estado === 'activo' ? RED : GREEN, border: `1.5px solid ${cliente.estado === 'activo' ? RED : GREEN}`, borderRadius: '8px', padding: '8px 18px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
            {guardandoEstado ? '...' : cliente.estado === 'activo' ? '🔴 Suspender' : '🟢 Activar'}
          </button>
          <button onClick={() => { setEditando(true); setErrorMsg(''); }}
            style={{ backgroundColor: BLUE, color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
            ✏️ Editar datos
          </button>
        </div>
      </div>

      {/* Mensajes globales */}
      {exitoMsg && (
        <div style={{ backgroundColor: '#F0FFF4', border: `1px solid ${GREEN}`, borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', fontSize: '13px', color: GREEN, fontWeight: 600 }}>
          ✅ {exitoMsg}
        </div>
      )}

      {/* ── SECCIÓN ARCA ──────────────────────────────────── */}
      {modulos['arca'] && (
        <div style={{ backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', overflow: 'hidden', marginBottom: '20px' }}>
          <div style={{ padding: '20px 24px', borderBottom: `2px solid ${SEP}` }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: NAVY, margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              📄 ARCA — Facturación Electrónica
            </h3>
          </div>
          <TabARCA clienteId={cliente.id} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '20px', alignItems: 'start' }}>

        {/* COLUMNA IZQUIERDA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* ── SECCIÓN 2: DATOS DEL NEGOCIO ────────────────── */}
          <div style={{ backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: `2px solid ${SEP}` }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: NAVY, margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Datos del negocio
              </h3>
            </div>
            <div style={{ padding: '20px 24px' }}>
              {editando ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                    {([
                      { label: 'Nombre comercial', field: 'nombre_comercial' as const, type: 'text' },
                      { label: 'Razón social', field: 'razon_social' as const, type: 'text' },
                      { label: 'CUIT', field: 'cuit' as const, type: 'text' },
                      { label: 'Email', field: 'email' as const, type: 'email' },
                      { label: 'WhatsApp', field: 'whatsapp' as const, type: 'text' },
                      { label: 'Teléfono', field: 'telefono' as const, type: 'text' },
                      { label: 'Dirección', field: 'direccion' as const, type: 'text' },
                      { label: 'Ciudad', field: 'ciudad' as const, type: 'text' },
                    ] as { label: string; field: keyof EditForm; type: string }[]).map(({ label, field, type }) => (
                      <div key={field}>
                        <label style={labelStyle}>{label}</label>
                        <input type={type} value={form[field]} onChange={setF(field)} style={inputStyle} />
                      </div>
                    ))}
                    <div>
                      <label style={labelStyle}>Provincia</label>
                      <input type="text" value={form.provincia} onChange={setF('provincia')} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Condición IVA</label>
                      <select value={form.condicion_iva} onChange={setF('condicion_iva')} style={{ ...inputStyle, color: form.condicion_iva ? TEXT : GRAY }}>
                        <option value="">Seleccionar...</option>
                        {condicionesIVA.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Rubro</label>
                      <select value={form.rubro} onChange={setF('rubro')} style={{ ...inputStyle, color: form.rubro ? TEXT : GRAY }}>
                        <option value="">Seleccionar...</option>
                        {rubros.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Plan</label>
                      <select value={form.plan} onChange={setF('plan')} style={inputStyle}>
                        {planes.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                  {errorMsg && <p style={{ color: RED, fontSize: '13px', marginBottom: '12px' }}>{errorMsg}</p>}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={guardarDatos} disabled={guardando}
                      style={{ backgroundColor: guardando ? '#C6F6D5' : GREEN, color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 22px', fontSize: '14px', fontWeight: 600, cursor: guardando ? 'not-allowed' : 'pointer' }}>
                      {guardando ? 'Guardando...' : '✅ Guardar cambios'}
                    </button>
                    <button onClick={() => { setEditando(false); setErrorMsg(''); }}
                      style={{ backgroundColor: '#fff', color: GRAY, border: '1.5px solid #CBD5E0', borderRadius: '8px', padding: '9px 22px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                      Cancelar
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {[
                    { label: 'Nombre comercial', value: cliente.nombre_comercial },
                    { label: 'Razón social',      value: cliente.razon_social },
                    { label: 'CUIT',              value: cliente.cuit, mono: true },
                    { label: 'Condición IVA',     value: cliente.condicion_iva },
                    { label: 'Rubro',             value: cliente.rubro },
                    { label: 'Plan',              value: cliente.plan },
                    { label: 'Email',             value: cliente.email },
                    { label: 'WhatsApp',          value: cliente.whatsapp },
                    { label: 'Teléfono',          value: cliente.telefono },
                    { label: 'Dirección',         value: cliente.direccion_fiscal },
                    { label: 'Ciudad',            value: cliente.ciudad_fiscal },
                    { label: 'Provincia',         value: cliente.provincia_fiscal },
                    { label: 'Fecha de alta',     value: formatFecha(cliente.fecha_alta) },
                  ].map(item => (
                    <div key={item.label}>
                      <p style={labelStyle}>{item.label}</p>
                      <p style={{ ...valorStyle, fontFamily: (item as any).mono ? 'monospace' : 'inherit', margin: 0 }}>
                        {item.value || '—'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── SECCIÓN 4: MÓDULOS ───────────────────────────── */}
          <div style={{ backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: `2px solid ${SEP}` }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: NAVY, margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Módulos habilitados
              </h3>
            </div>
            {modulosCambiados && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 12px', padding: '10px 14px', background: '#FFF3CD', borderRadius: '8px', border: '1px solid #F6C23E', flexWrap: 'wrap' }}>
                <span style={{ color: '#856404', fontSize: '13px' }}>⚠️ Cambios sin guardar</span>
                <button
                  onClick={guardarModulos}
                  disabled={guardandoModulos}
                  style={{ background: '#2B6CB0', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: guardandoModulos ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600 }}
                >
                  {guardandoModulos ? '⏳ Guardando...' : '💾 Guardar módulos'}
                </button>
                <button
                  onClick={cancelarModulos}
                  disabled={guardandoModulos}
                  style={{ background: 'transparent', color: '#856404', border: '1px solid #856404', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                >
                  ✕ Cancelar
                </button>
                {msgModulos && (
                  <span style={{ fontSize: '13px', fontWeight: 600, color: msgModulos.startsWith('✅') ? '#38A169' : '#E53E3E' }}>
                    {msgModulos}
                  </span>
                )}
              </div>
            )}
            {gruposModulos.map((grupo, gi) => (
              <div key={grupo.titulo}>
                <div style={{ padding: '10px 24px 4px' }}>
                  {gi > 0 && <div style={{ height: '2px', backgroundColor: SEP, marginBottom: '10px' }} />}
                  <p style={{ fontSize: '11px', fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>{grupo.titulo}</p>
                </div>
                {grupo.modulos.map((mod, mi) => (
                  <div key={mod.id}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 24px', borderTop: mi === 0 ? '1px solid #EDF2F7' : 'none', borderBottom: '1px solid #EDF2F7', cursor: (mod as any).obligatorio ? 'default' : 'pointer' }}
                    onMouseEnter={e => { if (!(mod as any).obligatorio) e.currentTarget.style.backgroundColor = '#F7FAFC'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}
                    onClick={() => toggleModulo(mod.id, (mod as any).obligatorio)}
                  >
                    <span style={{ fontSize: '13px', color: TEXT, fontWeight: 500 }}>
                      {mod.nombre}
                      {(mod as any).obligatorio && <span style={{ fontSize: '11px', color: GREEN, fontWeight: 600, marginLeft: '8px' }}>siempre activo</span>}
                    </span>
                    <Toggle activo={!!modulos[mod.id]} onChange={() => toggleModulo(mod.id, (mod as any).obligatorio)} disabled={(mod as any).obligatorio} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* COLUMNA DERECHA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* ── SECCIÓN 3: ACCESO AL SISTEMA ────────────────── */}
          <div style={{ backgroundColor: NAVY, borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', padding: '24px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#BEE3F8', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 16px' }}>Acceso al sistema</h3>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <p style={{ fontSize: '11px', color: '#90CDF4', margin: '0 0 8px', textTransform: 'uppercase' }}>Código de acceso</p>
              <div style={{ fontSize: '36px', fontWeight: 700, color: '#fff', letterSpacing: '8px', fontFamily: 'monospace', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '10px', padding: '14px' }}>
                {cliente.codigo_acceso}
              </div>
            </div>
            <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.15)', margin: '16px 0' }} />
            <p style={{ fontSize: '11px', color: '#90CDF4', margin: '0 0 6px', textTransform: 'uppercase' }}>Link de acceso</p>
            <div style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#BEE3F8', fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: '12px' }}>
              {link}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={copiarLink}
                style={{ flex: 1, backgroundColor: copiado ? GREEN : BLUE, color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'background-color 0.2s' }}>
                {copiado ? '✅ Copiado' : '📋 Copiar link'}
              </button>
              <button onClick={abrirWhatsApp}
                style={{ flex: 1, backgroundColor: GREEN, color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                💬 WhatsApp
              </button>
            </div>
          </div>

          {/* ── SECCIÓN 5: ESTADÍSTICAS ──────────────────────── */}
          <div style={{ backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', padding: '20px 24px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 16px' }}>Estadísticas rápidas</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {[
                { label: 'Plan actual',       value: cliente.plan,          color: BLUE },
                { label: 'Estado ARCA',       value: cliente.arca_habilitado ? 'Habilitado' : 'No habilitado', color: cliente.arca_habilitado ? GREEN : GRAY },
                { label: 'Sucursales',        value: cliente.habilitar_sucursales ? 'Habilitado' : 'No habilitado', color: cliente.habilitar_sucursales ? GREEN : GRAY },
                { label: 'Fecha de alta',     value: formatFecha(cliente.fecha_alta), color: TEXT },
              ].map(item => (
                <div key={item.label} style={{ backgroundColor: '#F7FAFC', borderRadius: '8px', padding: '12px', borderLeft: `3px solid ${item.color}` }}>
                  <p style={{ fontSize: '11px', color: GRAY, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{item.label}</p>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: item.color, margin: 0 }}>{item.value || '—'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TAB ARCA ──────────────────────────────────────────────────
function TabARCA({ clienteId }: { clienteId: number }) {
  const [config, setConfig]         = useState<any>(null);
  const [cargando, setCargando]     = useState(true);
  const [guardando, setGuardando]   = useState(false);
  const [probando, setProbando]     = useState(false);
  const [resultTest, setResultTest] = useState<{ ok: boolean; msg: string } | null>(null);
  const [form, setForm] = useState({
    cuit: '', razon_social: '', condicion_iva: '', punto_venta: '1',
    modo: 'homologacion', certificado: '', clave_privada: '',
    emite_factura_a: false, emite_factura_b: true, emite_factura_c: false,
    emite_nota_credito: false, emite_nota_debito: false,
  });

  const cargar = async () => {
    setCargando(true);
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/arca/config/${clienteId}`, {
        headers: { 'x-superadmin-token': getToken() },
      });
      if (r.ok) {
        const d = await r.json();
        setConfig(d);
        if (d.configurado) {
          setForm(f => ({ ...f,
            cuit: d.cuit || '', razon_social: d.razon_social || '',
            condicion_iva: d.condicion_iva || '', punto_venta: String(d.punto_venta || 1),
            modo: d.modo || 'homologacion',
            emite_factura_a: !!d.emite_factura_a, emite_factura_b: !!d.emite_factura_b,
            emite_factura_c: !!d.emite_factura_c, emite_nota_credito: !!d.emite_nota_credito,
            emite_nota_debito: !!d.emite_nota_debito,
          }));
        }
      }
    } finally { setCargando(false); }
  };

  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async () => {
    setGuardando(true);
    try {
      await fetch(`${API_BASE}/api/superadmin/arca/config/${clienteId}`, {
        method: 'PUT', headers: { 'x-superadmin-token': getToken(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, punto_venta: parseInt(form.punto_venta) || 1 }),
      });
      cargar();
    } finally { setGuardando(false); }
  };

  const probarConexion = async () => {
    setProbando(true); setResultTest(null);
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/arca/config/${clienteId}/test`, {
        method: 'POST', headers: { 'x-superadmin-token': getToken(), 'Content-Type': 'application/json' },
      });
      const d = await r.json();
      if (d.ok) {
        const exp = d.expira_en ? new Date(d.expira_en).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '—';
        setResultTest({ ok: true, msg: `✅ Conexión exitosa. Token válido hasta ${exp}` });
      } else {
        setResultTest({ ok: false, msg: `❌ Error: ${d.error || d.mensaje || 'Sin respuesta'}` });
      }
      cargar();
    } finally { setProbando(false); }
  };

  const badgeEstadoConexion = () => {
    const e = config?.estado_conexion || 'sin_configurar';
    if (e === 'ok')             return { icon: '🟢', label: 'Conectado',      color: '#38A169' };
    if (e === 'error')          return { icon: '🔴', label: 'Error',           color: '#E53E3E' };
    if (e === 'token_vencido')  return { icon: '🟡', label: 'Token vencido',   color: '#DD6B20' };
    return                             { icon: '⚪', label: 'Sin configurar',  color: '#718096' };
  };

  if (cargando) return <div style={{ padding: '24px', color: GRAY, textAlign: 'center' }}>Cargando configuración ARCA...</div>;

  const badge = badgeEstadoConexion();
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1.5px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' };
  const lbl: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 600, color: GRAY, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.4px' };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Estado conexión */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', borderLeft: `4px solid ${badge.color}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <span style={{ fontSize: '22px' }}>{badge.icon}</span>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: badge.color }}>{badge.label}</h3>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#fff',
            backgroundColor: form.modo === 'produccion' ? '#38A169' : '#DD6B20',
            borderRadius: '10px', padding: '2px 10px', marginLeft: '8px' }}>
            {form.modo === 'produccion' ? 'PRODUCCIÓN' : 'HOMOLOGACIÓN'}
          </span>
        </div>
        {config?.ultima_conexion && (
          <p style={{ margin: 0, fontSize: '12px', color: GRAY }}>
            Última conexión: {new Date(config.ultima_conexion).toLocaleString('es-AR')}
          </p>
        )}
        {config?.ultimo_error && config.estado_conexion === 'error' && (
          <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#E53E3E' }}>{config.ultimo_error}</p>
        )}
        {resultTest && (
          <div style={{ marginTop: '10px', padding: '10px 14px', borderRadius: '7px', fontSize: '13px', fontWeight: 600,
            backgroundColor: resultTest.ok ? '#F0FFF4' : '#FFF5F5', color: resultTest.ok ? '#38A169' : '#E53E3E' }}>
            {resultTest.msg}
          </div>
        )}
      </div>

      {/* Configuración */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `2px solid ${SEP}` }}>
          <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Configuración</h3>
        </div>
        <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div>
            <label style={lbl}>CUIT del cliente</label>
            <input value={form.cuit} onChange={e => setForm(f => ({ ...f, cuit: e.target.value }))} placeholder="20-12345678-9" style={inp} />
          </div>
          <div>
            <label style={lbl}>Razón social</label>
            <input value={form.razon_social} onChange={e => setForm(f => ({ ...f, razon_social: e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={lbl}>Condición IVA</label>
            <select value={form.condicion_iva} onChange={e => setForm(f => ({ ...f, condicion_iva: e.target.value }))} style={{ ...inp, background: '#fff' }}>
              <option value="">Seleccionar...</option>
              <option value="1">Responsable Inscripto</option>
              <option value="4">Exento</option>
              <option value="6">Monotributista</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Punto de venta</label>
            <input type="number" value={form.punto_venta} onChange={e => setForm(f => ({ ...f, punto_venta: e.target.value }))} min="1" max="9999" style={inp} />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={lbl}>Modo</label>
            <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
              {[{ v: 'homologacion', label: 'Homologación (pruebas)' }, { v: 'produccion', label: 'Producción (real)' }].map(m => (
                <label key={m.v} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                  <input type="radio" name="modo_arca" value={m.v} checked={form.modo === m.v} onChange={() => setForm(f => ({ ...f, modo: m.v }))} />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Certificado y clave */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `2px solid ${SEP}` }}>
          <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Certificado y clave privada</h3>
        </div>
        <div style={{ padding: '16px 20px', backgroundColor: '#FFFAF0', borderBottom: '1px solid #EDF2F7', fontSize: '12px', color: '#744210' }}>
          <strong>Instrucciones:</strong> 1. Entrá a ARCA con el CUIT del cliente · 2. Ir a Mis Servicios → WSFE · 3. Generar certificado de {form.modo === 'homologacion' ? 'homologación' : 'producción'} · 4. Pegar el contenido aquí
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={lbl}>Certificado (.crt)</label>
              {config?.tiene_certificado && <span style={{ fontSize: '11px', fontWeight: 700, color: '#38A169', backgroundColor: '#F0FFF4', borderRadius: '10px', padding: '2px 8px' }}>✓ Cargado</span>}
            </div>
            <textarea value={form.certificado} onChange={e => setForm(f => ({ ...f, certificado: e.target.value }))}
              placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
              rows={4} style={{ ...inp, resize: 'vertical', fontFamily: 'monospace', fontSize: '11px' }} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={lbl}>Clave privada (.key)</label>
              {config?.tiene_clave && <span style={{ fontSize: '11px', fontWeight: 700, color: '#38A169', backgroundColor: '#F0FFF4', borderRadius: '10px', padding: '2px 8px' }}>✓ Cargada</span>}
            </div>
            <textarea value={form.clave_privada} onChange={e => setForm(f => ({ ...f, clave_privada: e.target.value }))}
              placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
              rows={4} style={{ ...inp, resize: 'vertical', fontFamily: 'monospace', fontSize: '11px' }} />
          </div>
        </div>
      </div>

      {/* Tipos de comprobante */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `2px solid ${SEP}` }}>
          <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tipos de comprobante habilitados</h3>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {[
            { f: 'emite_factura_a',    label: 'Factura A' },
            { f: 'emite_factura_b',    label: 'Factura B' },
            { f: 'emite_factura_c',    label: 'Factura C' },
            { f: 'emite_nota_credito', label: 'Nota de Crédito' },
            { f: 'emite_nota_debito',  label: 'Nota de Débito' },
          ].map(({ f, label }) => (
            <label key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
              <input type="checkbox" checked={(form as any)[f]} onChange={e => setForm(prev => ({ ...prev, [f]: e.target.checked }))} />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Botones */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={guardar} disabled={guardando}
          style={{ padding: '10px 22px', backgroundColor: guardando ? '#C6F6D5' : '#38A169', color: '#fff', border: 'none', borderRadius: '8px', cursor: guardando ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 700 }}>
          {guardando ? 'Guardando...' : '✅ Guardar configuración'}
        </button>
        <button onClick={probarConexion} disabled={probando}
          style={{ padding: '10px 22px', backgroundColor: probando ? '#BEE3F8' : BLUE, color: '#fff', border: 'none', borderRadius: '8px', cursor: probando ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 700 }}>
          {probando ? '⏳ Conectando...' : '🔌 Probar conexión'}
        </button>
      </div>
    </div>
  );
}

export default DetalleCliente;
