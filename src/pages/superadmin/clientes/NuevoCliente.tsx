import React, { useState } from 'react';

const BLUE = '#2B6CB0';
const NAVY = '#1B2A4A';
const SEPARATOR = '#63B3ED';
const GRAY = '#718096';
const TEXT = '#2D3748';
const ERROR_COLOR = '#E53E3E';
const GREEN = '#38A169';
const BG = '#F4F6F9';
const BASE_URL = 'sistemagestiopedidos.netlify.app';
const API_BASE = (process.env.REACT_APP_API_URL || 'http://localhost:4000');

// ─── PASO 1 ───────────────────────────────────────────────────
const rubros = ['Ferretería', 'Distribuidora', 'Librería-Imprenta', 'Supermercado', 'Otro'];
const condicionesIVA = ['Responsable inscripto', 'Monotributista', 'Exento', 'Consumidor final'];
const planes = ['Básico', 'Estándar', 'Completo', 'Personalizado'];

interface Paso1Data {
  nombreComercial: string;
  cuit: string;
  rubro: string;
  email: string;
  whatsapp: string;
  telefono: string;
  razonSocial: string;
  condicionIVA: string;
  direccion: string;
  ciudad: string;
  provincia: string;
  plan: string;
}

const initialPaso1: Paso1Data = {
  nombreComercial: '',
  cuit: '',
  rubro: '',
  email: '',
  whatsapp: '',
  telefono: '',
  razonSocial: '',
  condicionIVA: '',
  direccion: '',
  ciudad: '',
  provincia: '',
  plan: 'Estándar',
};

// ─── PASO 2 ───────────────────────────────────────────────────
interface Modulo {
  id: string;
  nombre: string;
  descripcion: string;
  obligatorio?: boolean;
}

interface GrupoModulos {
  titulo: string;
  modulos: Modulo[];
}

const gruposModulos: GrupoModulos[] = [
  {
    titulo: 'Comercial',
    modulos: [
      { id: 'catalogo', nombre: 'Catálogo y pedidos', descripcion: 'Acceso al catálogo y toma de pedidos', obligatorio: true },
      { id: 'presupuestos', nombre: 'Presupuestos', descripcion: 'Cotizaciones para clientes' },
      { id: 'ventas', nombre: 'Ventas', descripcion: 'Registro de ventas en el sistema' },
      { id: 'remitos', nombre: 'Remitos', descripcion: 'Entrega de mercadería' },
    ],
  },
  {
    titulo: 'Stock',
    modulos: [
      { id: 'stock', nombre: 'Gestión de stock', descripcion: 'Control de inventario' },
      { id: 'transferencias', nombre: 'Transferencias entre sucursales', descripcion: 'Mover stock entre locales' },
    ],
  },
  {
    titulo: 'Finanzas',
    modulos: [
      { id: 'cc_clientes', nombre: 'Cuenta corriente clientes', descripcion: 'Lo que le deben al cliente' },
      { id: 'cc_proveedores', nombre: 'Cuenta corriente proveedores', descripcion: 'Lo que el cliente le debe a proveedores' },
      { id: 'caja', nombre: 'Caja', descripcion: 'Apertura y cierre por sucursal' },
      { id: 'cheques', nombre: 'Cheques', descripcion: 'Propios y de terceros' },
    ],
  },
  {
    titulo: 'Facturación',
    modulos: [
      { id: 'arca', nombre: 'ARCA', descripcion: 'Factura electrónica' },
    ],
  },
  {
    titulo: 'Comunicación',
    modulos: [
      { id: 'chat', nombre: 'Chat con clientes', descripcion: 'Mensajería interna' },
      { id: 'notificaciones', nombre: 'Notificaciones', descripcion: 'Avisos y alertas' },
      { id: 'banners', nombre: 'Banners y novedades', descripcion: 'Comunicación visual' },
    ],
  },
  {
    titulo: 'Análisis',
    modulos: [
      { id: 'analytics', nombre: 'Analytics', descripcion: 'Reportes y estadísticas' },
    ],
  },
  {
    titulo: 'Estructura',
    modulos: [
      { id: 'sucursales', nombre: 'Múltiples sucursales', descripcion: 'Habilitar más de un local' },
      { id: 'empleados', nombre: 'Acceso para empleados', descripcion: 'Usuarios adicionales con roles' },
    ],
  },
];

type ModulosState = Record<string, boolean>;

function initialModulos(): ModulosState {
  const state: ModulosState = {};
  gruposModulos.forEach(g => g.modulos.forEach(m => { state[m.id] = !!m.obligatorio; }));
  return state;
}

// ─── HELPERS ──────────────────────────────────────────────────
function generarCodigo(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function modulosActivos(modulos: ModulosState): string[] {
  const todos = gruposModulos.flatMap(g => g.modulos);
  return todos.filter(m => modulos[m.id]).map(m => m.nombre);
}

// ─── ESTILOS COMUNES ──────────────────────────────────────────
const pasos = [
  { num: 1, label: 'Datos del negocio' },
  { num: 2, label: 'Módulos' },
  { num: 3, label: 'Acceso' },
];

function inputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: '100%',
    border: `1.5px solid ${hasError ? ERROR_COLOR : '#CBD5E0'}`,
    borderRadius: '7px',
    padding: '9px 12px',
    fontSize: '14px',
    color: TEXT,
    backgroundColor: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
  };
}

const labelBase: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 500,
  color: TEXT,
  marginBottom: '5px',
};

// ─── TOGGLE ───────────────────────────────────────────────────
function Toggle({ activo, onChange, disabled }: { activo: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <div
      onClick={disabled ? undefined : onChange}
      style={{
        width: '42px', height: '24px', borderRadius: '12px',
        backgroundColor: activo ? GREEN : '#CBD5E0',
        position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer',
        flexShrink: 0, transition: 'background-color 0.2s', opacity: disabled ? 0.7 : 1,
      }}
    >
      <div style={{
        position: 'absolute', top: '3px', left: activo ? '21px' : '3px',
        width: '18px', height: '18px', borderRadius: '50%',
        backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s',
      }} />
    </div>
  );
}

// ─── BARRA DE PROGRESO ────────────────────────────────────────
function BarraProgreso({ pasoActual }: { pasoActual: number }) {
  return (
    <div style={{ marginBottom: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {pasos.map((paso, i) => {
          const activo = paso.num === pasoActual;
          const completado = paso.num < pasoActual;
          const color = activo || completado ? BLUE : GRAY;
          return (
            <React.Fragment key={paso.num}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  backgroundColor: activo || completado ? BLUE : '#E2E8F0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: '14px',
                  color: activo || completado ? '#fff' : GRAY,
                  border: activo ? `2px solid ${BLUE}` : '2px solid transparent',
                }}>
                  {paso.num}
                </div>
                <span style={{ fontSize: '12px', fontWeight: activo ? 600 : 400, color, whiteSpace: 'nowrap' }}>
                  {paso.label}
                </span>
              </div>
              {i < pasos.length - 1 && (
                <div style={{
                  flex: 1, height: '2px',
                  backgroundColor: completado ? BLUE : '#E2E8F0',
                  margin: '0 8px', marginBottom: '20px',
                }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── BOTONES ──────────────────────────────────────────────────
const btnGris: React.CSSProperties = {
  backgroundColor: '#fff', color: GRAY, border: `1.5px solid #CBD5E0`,
  borderRadius: '8px', padding: '9px 22px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
};

// ─── SPINNER ──────────────────────────────────────────────────
function Spinner() {
  return (
    <span style={{
      display: 'inline-block', width: '14px', height: '14px',
      border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff',
      borderRadius: '50%', animation: 'spin 0.7s linear infinite',
      marginRight: '8px', verticalAlign: 'middle',
    }} />
  );
}

// ─── PANTALLA DE ÉXITO ────────────────────────────────────────
interface ExitoData {
  cliente_id: number;
  mayorista_id: number;
  codigo_acceso: string;
  link: string;
  nombre_comercial: string;
  clave: string;
}

function PantallaExito({ exito }: { exito: ExitoData }) {
  const [copiado, setCopiado] = useState(false);

  const copiarLink = () => {
    navigator.clipboard.writeText(exito.link).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  };

  const abrirWhatsApp = () => {
    const msg = encodeURIComponent(
      `¡Hola! Te comparto tu acceso al sistema.\nLink: ${exito.link}\nClave inicial: ${exito.clave}`
    );
    window.open(`https://api.whatsapp.com/send?text=${msg}`, '_blank');
  };

  const volverAClientes = () => { window.location.href = '/superadmin/clientes'; };

  return (
    <div style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Encabezado éxito */}
      <div style={{ textAlign: 'center', padding: '32px 24px 20px' }}>
        <div style={{ fontSize: '64px', lineHeight: 1, marginBottom: '16px' }}>✅</div>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: GREEN, margin: '0 0 8px' }}>
          ¡Cliente creado exitosamente!
        </h2>
        <p style={{ fontSize: '14px', color: GRAY, margin: 0 }}>
          El acceso ya está listo para compartir.
        </p>
      </div>

      {/* Card de datos */}
      <div style={{
        backgroundColor: '#EBF4FF',
        borderRadius: '14px',
        border: `2px solid ${GREEN}`,
        padding: '24px',
      }}>
        <div style={{ marginBottom: '16px' }}>
          <p style={{ fontSize: '11px', color: GRAY, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Cliente</p>
          <p style={{ fontSize: '16px', fontWeight: 700, color: TEXT, margin: 0 }}>{exito.nombre_comercial}</p>
        </div>

        <div style={{ height: '1px', backgroundColor: '#BEE3F8', margin: '14px 0' }} />

        <div style={{ marginBottom: '16px' }}>
          <p style={{ fontSize: '11px', color: GRAY, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Código de acceso</p>
          <div style={{
            display: 'inline-block',
            backgroundColor: NAVY, borderRadius: '10px', padding: '12px 28px',
            fontSize: '28px', fontWeight: 700, color: '#fff', letterSpacing: '6px',
            fontFamily: 'monospace',
          }}>
            {exito.codigo_acceso}
          </div>
        </div>

        <div style={{ height: '1px', backgroundColor: '#BEE3F8', margin: '14px 0' }} />

        <div>
          <p style={{ fontSize: '11px', color: GRAY, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Link de acceso</p>
          <div style={{
            backgroundColor: '#fff', border: '1px solid #BEE3F8', borderRadius: '8px',
            padding: '10px 14px', fontSize: '13px', color: BLUE,
            fontFamily: 'monospace', wordBreak: 'break-all',
          }}>
            {exito.link}
          </div>
        </div>
      </div>

      {/* Botones */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={copiarLink}
            style={{ flex: 1, backgroundColor: copiado ? GREEN : BLUE, color: '#fff', border: 'none', borderRadius: '8px', padding: '11px 16px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'background-color 0.2s' }}>
            {copiado ? '✅ Copiado' : '📋 Copiar link'}
          </button>
          <button onClick={abrirWhatsApp}
            style={{ flex: 1, backgroundColor: GREEN, color: '#fff', border: 'none', borderRadius: '8px', padding: '11px 16px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
            💬 Enviar por WhatsApp
          </button>
        </div>
        <button onClick={volverAClientes}
          style={{ ...btnGris, width: '100%', textAlign: 'center' }}>
          👥 Volver a Clientes
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────
function NuevoCliente() {
  const [paso, setPaso] = useState(1);

  // Paso 1
  const [data, setData] = useState<Paso1Data>(initialPaso1);
  const [touched, setTouched] = useState<Partial<Record<keyof Paso1Data, boolean>>>({});

  // Paso 2
  const [modulos, setModulos] = useState<ModulosState>(initialModulos);

  // Paso 3
  const [codigoAcceso, setCodigoAcceso] = useState('');
  const [clave, setClave] = useState('');
  const [repetirClave, setRepetirClave] = useState('');
  const [touchedClave, setTouchedClave] = useState(false);
  const [touchedRepetir, setTouchedRepetir] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // API state
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [exito, setExito] = useState<ExitoData | null>(null);

  // ── Paso 1 helpers
  const set = (field: keyof Paso1Data) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setData(prev => ({ ...prev, [field]: e.target.value }));

  const blur = (field: keyof Paso1Data) => () =>
    setTouched(prev => ({ ...prev, [field]: true }));

  const err = (field: keyof Paso1Data, value: string): boolean =>
    !!touched[field] && !value.trim();

  const obligatoriosCompletos =
    data.nombreComercial.trim() !== '' &&
    data.cuit.trim() !== '' &&
    data.rubro !== '' &&
    data.email.trim() !== '';

  // ── Paso 2 helpers
  const toggleModulo = (id: string) =>
    setModulos(prev => ({ ...prev, [id]: !prev[id] }));

  const irAPaso3 = () => {
    setCodigoAcceso(generarCodigo());
    setPaso(3);
  };

  // ── Paso 3 helpers
  const link = `${BASE_URL}/?m=${codigoAcceso}`;
  const clavesCoinciden = clave.trim() !== '' && clave === repetirClave;
  const errorClave = touchedRepetir && !clavesCoinciden;

  const copiarLink = () => {
    navigator.clipboard.writeText(link).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  };

  const abrirWhatsApp = () => {
    const msg = encodeURIComponent(
      `¡Hola! Te comparto tu acceso al sistema.\nLink: ${link}\nClave inicial: ${clave}`
    );
    window.open(`https://api.whatsapp.com/send?text=${msg}`, '_blank');
  };

  // ── Confirmar: llamada al backend
  const confirmar = async () => {
    setErrorMsg('');
    setCargando(true);

    let token = '';
    try {
      const sesion = JSON.parse(localStorage.getItem('superadmin_session') || '{}');
      token = sesion.token || '';
    } catch { token = ''; }

    const body = {
      nombre_comercial: data.nombreComercial,
      cuit: data.cuit,
      rubro: data.rubro,
      email: data.email,
      whatsapp: data.whatsapp,
      telefono: data.telefono,
      razon_social: data.razonSocial,
      condicion_iva: data.condicionIVA,
      direccion: data.direccion,
      ciudad: data.ciudad,
      provincia: data.provincia,
      plan: data.plan,
      modulos: {
        presupuestos: !!modulos.presupuestos,
        ventas: !!modulos.ventas,
        remitos: !!modulos.remitos,
        gestion_stock: !!modulos.stock,
        transferencias: !!modulos.transferencias,
        cta_cte_clientes: !!modulos.cc_clientes,
        cta_cte_proveedores: !!modulos.cc_proveedores,
        caja: !!modulos.caja,
        cheques: !!modulos.cheques,
        arca: !!modulos.arca,
        chat: !!modulos.chat,
        notificaciones: !!modulos.notificaciones,
        banners: !!modulos.banners,
        analytics: !!modulos.analytics,
        sucursales: !!modulos.sucursales,
        empleados: !!modulos.empleados,
      },
      codigo_acceso: codigoAcceso,
      clave_inicial: clave,
    };

    try {
      const res = await fetch(`${API_BASE}/api/superadmin/clientes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-superadmin-token': token,
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        const mensaje = json.mensaje || '';
        if (mensaje === 'CUIT ya registrado') {
          setErrorMsg('Este CUIT ya está registrado.');
        } else if (mensaje === 'Código ya en uso') {
          setErrorMsg('Este código ya está en uso — regenerá el código e intentá de nuevo.');
        } else {
          setErrorMsg('Error al crear el cliente. Intentá de nuevo.');
        }
        setCargando(false);
        return;
      }

      setExito({
        cliente_id: json.cliente_id,
        mayorista_id: json.mayorista_id,
        codigo_acceso: json.codigo_acceso,
        link: json.link,
        nombre_comercial: data.nombreComercial,
        clave,
      });
    } catch {
      setErrorMsg('Error al crear el cliente. Intentá de nuevo.');
      setCargando(false);
    }
  };

  const cancelar = () => { window.location.href = '/superadmin/clientes'; };

  const activos = modulosActivos(modulos);

  // ── Pantalla de éxito
  if (exito) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: BG, padding: '28px' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <PantallaExito exito={exito} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, padding: '28px' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <BarraProgreso pasoActual={paso} />

      {/* ══ PASO 1 ══════════════════════════════════════════════ */}
      {paso === 1 && (
        <div style={{ backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflow: 'hidden', maxWidth: '760px' }}>
          <div style={{ padding: '24px 28px 20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: NAVY, margin: '0 0 16px' }}>Datos del negocio</h3>
            <div style={{ height: '2px', backgroundColor: SEPARATOR, marginBottom: '20px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={labelBase}>Nombre comercial <span style={{ color: ERROR_COLOR }}>*</span></label>
                <input type="text" value={data.nombreComercial} onChange={set('nombreComercial')} onBlur={blur('nombreComercial')}
                  placeholder="Ej: Ferretería El Tornillo" style={inputStyle(err('nombreComercial', data.nombreComercial))} />
                {err('nombreComercial', data.nombreComercial) && <p style={{ color: ERROR_COLOR, fontSize: '11px', marginTop: '3px' }}>Campo obligatorio</p>}
              </div>
              <div>
                <label style={labelBase}>CUIT <span style={{ color: ERROR_COLOR }}>*</span></label>
                <input type="text" value={data.cuit}
                  onChange={e => setData(prev => ({ ...prev, cuit: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                  onBlur={blur('cuit')} placeholder="20123456789" style={inputStyle(err('cuit', data.cuit))} />
                {err('cuit', data.cuit) && <p style={{ color: ERROR_COLOR, fontSize: '11px', marginTop: '3px' }}>Campo obligatorio</p>}
              </div>
              <div>
                <label style={labelBase}>Rubro <span style={{ color: ERROR_COLOR }}>*</span></label>
                <select value={data.rubro} onChange={set('rubro')} onBlur={blur('rubro')}
                  style={{ ...inputStyle(err('rubro', data.rubro)), color: data.rubro ? TEXT : GRAY }}>
                  <option value="">Seleccionar rubro...</option>
                  {rubros.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                {err('rubro', data.rubro) && <p style={{ color: ERROR_COLOR, fontSize: '11px', marginTop: '3px' }}>Campo obligatorio</p>}
              </div>
              <div>
                <label style={labelBase}>Email <span style={{ color: ERROR_COLOR }}>*</span></label>
                <input type="email" value={data.email} onChange={set('email')} onBlur={blur('email')}
                  placeholder="contacto@negocio.com" style={inputStyle(err('email', data.email))} />
                {err('email', data.email) && <p style={{ color: ERROR_COLOR, fontSize: '11px', marginTop: '3px' }}>Campo obligatorio</p>}
              </div>
              <div>
                <label style={labelBase}>WhatsApp</label>
                <input type="text" value={data.whatsapp} onChange={set('whatsapp')} placeholder="Ej: 1123456789" style={inputStyle(false)} />
              </div>
              <div>
                <label style={labelBase}>Teléfono</label>
                <input type="text" value={data.telefono} onChange={set('telefono')} placeholder="Ej: 01145678901" style={inputStyle(false)} />
              </div>
              <div>
                <label style={labelBase}>Razón social</label>
                <input type="text" value={data.razonSocial} onChange={set('razonSocial')} placeholder="Nombre legal" style={inputStyle(false)} />
              </div>
              <div>
                <label style={labelBase}>Condición IVA</label>
                <select value={data.condicionIVA} onChange={set('condicionIVA')}
                  style={{ ...inputStyle(false), color: data.condicionIVA ? TEXT : GRAY }}>
                  <option value="">Seleccionar...</option>
                  {condicionesIVA.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={labelBase}>Dirección</label>
                <input type="text" value={data.direccion} onChange={set('direccion')} placeholder="Calle y número" style={inputStyle(false)} />
              </div>
              <div>
                <label style={labelBase}>Ciudad</label>
                <input type="text" value={data.ciudad} onChange={set('ciudad')} placeholder="Ej: Buenos Aires" style={inputStyle(false)} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelBase}>Provincia</label>
                <input type="text" value={data.provincia} onChange={set('provincia')} placeholder="Ej: Buenos Aires"
                  style={{ ...inputStyle(false), maxWidth: '340px' }} />
              </div>
            </div>
          </div>

          <div style={{ height: '2px', backgroundColor: SEPARATOR, margin: '0 28px' }} />

          <div style={{ padding: '20px 28px 24px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: NAVY, margin: '0 0 16px' }}>Plan</h3>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              {planes.map(plan => (
                <label key={plan} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: TEXT, fontWeight: data.plan === plan ? 600 : 400 }}>
                  <input type="radio" name="plan" value={plan} checked={data.plan === plan} onChange={set('plan')}
                    style={{ accentColor: BLUE, width: '16px', height: '16px' }} />
                  {plan}
                </label>
              ))}
            </div>
          </div>

          <div style={{ height: '1px', backgroundColor: '#E2E8F0' }} />
          <div style={{ padding: '18px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={cancelar} style={btnGris}>Cancelar</button>
            <button disabled={!obligatoriosCompletos} onClick={() => setPaso(2)}
              style={{ backgroundColor: obligatoriosCompletos ? BLUE : '#BEE3F8', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 22px', fontSize: '14px', fontWeight: 600, cursor: obligatoriosCompletos ? 'pointer' : 'not-allowed' }}>
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {/* ══ PASO 2 ══════════════════════════════════════════════ */}
      {paso === 2 && (
        <div style={{ backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflow: 'hidden', maxWidth: '760px' }}>
          <div style={{ padding: '24px 28px 8px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: NAVY, margin: '0 0 4px' }}>Módulos habilitados</h3>
            <p style={{ fontSize: '13px', color: GRAY, margin: '0 0 16px' }}>Seleccioná las funcionalidades disponibles para este cliente.</p>
          </div>

          {gruposModulos.map((grupo, gi) => (
            <div key={grupo.titulo}>
              <div style={{ padding: '0 28px 8px' }}>
                {gi > 0 && <div style={{ height: '2px', backgroundColor: SEPARATOR, marginBottom: '16px' }} />}
                <h4 style={{ fontSize: '13px', fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>
                  {grupo.titulo}
                </h4>
              </div>
              <div>
                {grupo.modulos.map((mod, mi) => (
                  <div key={mod.id}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 28px', backgroundColor: '#fff', borderTop: mi === 0 ? '1px solid #EDF2F7' : 'none', borderBottom: '1px solid #EDF2F7', cursor: mod.obligatorio ? 'default' : 'pointer', transition: 'background-color 0.12s' }}
                    onMouseEnter={e => { if (!mod.obligatorio) e.currentTarget.style.backgroundColor = '#EBF8FF'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}
                    onClick={() => { if (!mod.obligatorio) toggleModulo(mod.id); }}
                  >
                    <div style={{ flex: 1, paddingRight: '16px' }}>
                      <p style={{ fontSize: '14px', fontWeight: 500, color: TEXT, margin: '0 0 2px' }}>
                        {mod.nombre}
                        {mod.obligatorio && <span style={{ fontSize: '11px', color: GREEN, fontWeight: 600, marginLeft: '8px' }}>siempre activo</span>}
                      </p>
                      <p style={{ fontSize: '12px', color: GRAY, margin: 0 }}>{mod.descripcion}</p>
                    </div>
                    <Toggle activo={modulos[mod.id]} onChange={() => toggleModulo(mod.id)} disabled={mod.obligatorio} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div style={{ height: '1px', backgroundColor: '#E2E8F0' }} />
          <div style={{ padding: '18px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={() => setPaso(1)} style={btnGris}>← Anterior</button>
            <button onClick={irAPaso3}
              style={{ backgroundColor: BLUE, color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 22px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {/* ══ PASO 3 ══════════════════════════════════════════════ */}
      {paso === 3 && (
        <div style={{ maxWidth: '760px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Card principal */}
          <div style={{ backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflow: 'hidden' }}>

            {/* Código de acceso */}
            <div style={{ padding: '24px 28px 20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: NAVY, margin: '0 0 16px' }}>Código de acceso</h3>
              <div style={{ height: '2px', backgroundColor: SEPARATOR, marginBottom: '20px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  backgroundColor: NAVY, borderRadius: '10px', padding: '16px 32px',
                  fontSize: '32px', fontWeight: 700, color: '#fff', letterSpacing: '6px',
                  fontFamily: 'monospace',
                }}>
                  {codigoAcceso}
                </div>
                <button
                  onClick={() => setCodigoAcceso(generarCodigo())}
                  style={{ backgroundColor: '#fff', color: GRAY, border: `1.5px solid #CBD5E0`, borderRadius: '8px', padding: '9px 16px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
                >
                  🔄 Regenerar
                </button>
              </div>
            </div>

            <div style={{ height: '2px', backgroundColor: SEPARATOR, margin: '0 28px' }} />

            {/* Clave inicial */}
            <div style={{ padding: '20px 28px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: NAVY, margin: '0 0 16px' }}>Clave inicial</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={labelBase}>Clave inicial <span style={{ color: ERROR_COLOR }}>*</span></label>
                  <input
                    type="password"
                    value={clave}
                    onChange={e => setClave(e.target.value)}
                    onBlur={() => setTouchedClave(true)}
                    placeholder="Mínimo 6 caracteres"
                    style={inputStyle(touchedClave && clave.trim() === '')}
                  />
                  {touchedClave && clave.trim() === '' && (
                    <p style={{ color: ERROR_COLOR, fontSize: '11px', marginTop: '3px' }}>Campo obligatorio</p>
                  )}
                </div>
                <div>
                  <label style={labelBase}>Repetir clave <span style={{ color: ERROR_COLOR }}>*</span></label>
                  <input
                    type="password"
                    value={repetirClave}
                    onChange={e => setRepetirClave(e.target.value)}
                    onBlur={() => setTouchedRepetir(true)}
                    placeholder="Repetir clave"
                    style={inputStyle(errorClave)}
                  />
                  {errorClave && (
                    <p style={{ color: ERROR_COLOR, fontSize: '11px', marginTop: '3px' }}>Las claves no coinciden</p>
                  )}
                </div>
              </div>
            </div>

            <div style={{ height: '2px', backgroundColor: SEPARATOR, margin: '0 28px' }} />

            {/* Link de acceso */}
            <div style={{ padding: '20px 28px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: NAVY, margin: '0 0 16px' }}>Link de acceso</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{
                  flex: 1, backgroundColor: '#F7FAFC', border: '1px solid #E2E8F0',
                  borderRadius: '8px', padding: '10px 14px', fontSize: '13px',
                  color: TEXT, fontFamily: 'monospace', minWidth: '200px',
                }}>
                  {link}
                </div>
                <button onClick={copiarLink}
                  style={{ backgroundColor: copiado ? GREEN : BLUE, color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background-color 0.2s' }}>
                  {copiado ? '✅ Copiado' : '📋 Copiar link'}
                </button>
                <button onClick={abrirWhatsApp}
                  style={{ backgroundColor: GREEN, color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  💬 Enviar por WhatsApp
                </button>
              </div>
            </div>
          </div>

          {/* Resumen final */}
          <div style={{
            backgroundColor: '#EBF4FF', borderRadius: '14px',
            borderLeft: `4px solid ${BLUE}`, padding: '20px 24px',
          }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: NAVY, margin: '0 0 14px' }}>Resumen del cliente</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
              {[
                { label: 'Cliente', value: data.nombreComercial },
                { label: 'CUIT', value: data.cuit },
                { label: 'Plan', value: data.plan },
                { label: 'Código de acceso', value: codigoAcceso },
              ].map(item => (
                <div key={item.label}>
                  <p style={{ fontSize: '11px', color: GRAY, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{item.label}</p>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: TEXT, margin: 0, fontFamily: item.label === 'CUIT' || item.label === 'Código de acceso' ? 'monospace' : 'inherit' }}>{item.value}</p>
                </div>
              ))}
              <div style={{ gridColumn: '1 / -1' }}>
                <p style={{ fontSize: '11px', color: GRAY, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Módulos activos ({activos.length})
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {activos.map(nombre => (
                    <span key={nombre} style={{
                      backgroundColor: '#fff', border: `1px solid ${SEPARATOR}`, borderRadius: '20px',
                      padding: '2px 10px', fontSize: '12px', color: BLUE, fontWeight: 500,
                    }}>
                      {nombre}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Botones finales */}
          <div style={{ backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', padding: '18px 28px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {errorMsg && (
              <div style={{
                backgroundColor: '#FFF5F5', border: `1px solid ${ERROR_COLOR}`,
                borderRadius: '8px', padding: '10px 14px',
                fontSize: '13px', color: ERROR_COLOR, fontWeight: 500,
              }}>
                {errorMsg}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={() => setPaso(2)} disabled={cargando} style={{ ...btnGris, opacity: cargando ? 0.5 : 1 }}>← Anterior</button>
              <button
                disabled={!clavesCoinciden || cargando}
                onClick={confirmar}
                style={{
                  backgroundColor: !clavesCoinciden || cargando ? '#C6F6D5' : GREEN,
                  color: '#fff', border: 'none', borderRadius: '8px',
                  padding: '9px 22px', fontSize: '14px', fontWeight: 600,
                  cursor: !clavesCoinciden || cargando ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.15s',
                  display: 'flex', alignItems: 'center',
                }}
              >
                {cargando && <Spinner />}
                {cargando ? 'Creando cliente...' : '✅ Confirmar y crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default NuevoCliente;
