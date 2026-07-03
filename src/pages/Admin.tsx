import React, { useState } from 'react';

const API = 'https://sistema-pedidos-backend-2hec.onrender.com';
const LINK_BASE = 'sistemagestiopedidos.netlify.app';

const Logo = ({ size = 32 }: { size?: number }) => (
  <svg viewBox="0 0 80 80" width={size} height={size} style={{ display: 'block' }}>
    <circle cx="15" cy="15" r="11" fill="#0D2B6B" />
    <circle cx="40" cy="15" r="11" fill="#06B6D4" />
    <circle cx="65" cy="15" r="11" fill="#06B6D4" />
    <circle cx="27" cy="40" r="11" fill="#06B6D4" />
    <circle cx="52" cy="40" r="11" fill="#0D2B6B" />
    <circle cx="15" cy="65" r="11" fill="#0D2B6B" />
    <circle cx="40" cy="65" r="11" fill="#0D2B6B" />
    <circle cx="65" cy="65" r="11" fill="#06B6D4" />
  </svg>
);

const SW = ({ activo, onClick }: { activo: boolean; onClick: () => void }) => (
  <button onClick={onClick}
    className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 ${activo ? 'bg-blue-600' : 'bg-gray-300'}`}>
    <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${activo ? 'translate-x-5' : 'translate-x-0'}`} />
  </button>
);

type Tab = 'datos' | 'config' | 'ivan' | 'descuentos' | 'clientes' | 'pagos' | 'analytics';

interface Mayorista {
  id: number; nombre: string; email: string; codigo: string;
  activo: boolean; config_habilitada: boolean; db_connection?: string;
  ivan_activo?: boolean; habilitar_ctas_ctes?: boolean; razon_social?: string;
  habilitar_demanda?: boolean; habilitar_ofertas?: boolean;
  habilitar_productos_solicitados?: boolean;
  habilitar_descuentos_por_cliente?: boolean;
  habilitar_banners?: boolean;
  habilitar_mensajes?: boolean;
  habilitar_notificaciones?: boolean;
  habilitar_cotizaciones?: boolean;
  habilitar_pedido_sugerido?: boolean;
  habilitar_cross_selling?: boolean;
  habilitar_lector_barras?: boolean;
  habilitar_mis_promociones?: boolean;
  habilitar_estados_avanzados?: boolean;
  habilitar_medios_de_pago?: boolean;
  habilitar_analiticas?: boolean;
}
interface ConfigForm {
  mostrar_precios: boolean; mostrar_stock: boolean; mostrar_marca: boolean;
  mostrar_rubro: boolean; mostrar_tipo: boolean; pedir_clave: boolean;
  tamanio_hoja: string; items_por_hoja: number; numero_pedido_inicio: number;
  orden_pdf: string; habilitar_calculadora: boolean;
  descuento_1: number; descuento_2: number; descuento_3: number; iva: number;
  habilitar_ctas_ctes: boolean; habilitar_demanda: boolean; habilitar_ofertas: boolean;
  habilitar_productos_solicitados: boolean;
}
interface IvanForm {
  ivan_activo: boolean;
  ivan_id_deposito: number;
  ivan_id_operario: number | '';
  ivan_id_vendedor: number | '';
  ivan_id_tipo_pedido: number;
  ivan_id_sucursal: number;
  ivan_porc_iva: number;
  ivan_id_condicion_venta: number | '';
}
interface DescuentoCliente {
  cuit: string;
  descuento_1: number | string | null;
  descuento_2: number | string | null;
  descuento_3: number | string | null;
}
interface EdicionDescuento { descuento_1: string; descuento_2: string; descuento_3: string; }
interface ClienteRegistrado { cuit: string; creada_en: string | null; }
interface Analytics {
  total_pedidos: number; pedidos_este_mes: number; pedidos_mes_pasado: number;
  total_clientes: number; ultimo_pedido: string | null; demanda_este_mes: number;
  producto_mas_pedido: string | null; producto_mas_pedido_cantidad: number;
}
interface Pago {
  id: string;
  tipo: 'implementacion' | 'mantenimiento';
  monto_total: number;
  fecha_pago: string;
  fecha_vencimiento: string;
  estado: 'pagado' | 'pendiente' | 'vencido';
}
interface PagoForm {
  tipo: 'implementacion' | 'mantenimiento';
  monto_total: string;
  fecha_pago: string;
  fecha_vencimiento: string;
  estado: 'pagado' | 'pendiente' | 'vencido';
}

const defaultConfig: ConfigForm = {
  mostrar_precios: true, mostrar_stock: true, mostrar_marca: true,
  mostrar_rubro: true, mostrar_tipo: true, pedir_clave: false,
  tamanio_hoja: 'A4', items_por_hoja: 30, numero_pedido_inicio: 1,
  orden_pdf: 'codigo', habilitar_calculadora: false,
  descuento_1: 0, descuento_2: 0, descuento_3: 0, iva: 21,
  habilitar_ctas_ctes: false, habilitar_demanda: false, habilitar_ofertas: false,
  habilitar_productos_solicitados: false,
};
const defaultIvan: IvanForm = {
  ivan_activo: false, ivan_id_deposito: 1, ivan_id_operario: '',
  ivan_id_vendedor: '', ivan_id_tipo_pedido: 1, ivan_id_sucursal: 1, ivan_porc_iva: 21,
  ivan_id_condicion_venta: '',
};
const defaultPagoForm: PagoForm = {
  tipo: 'implementacion', monto_total: '', fecha_pago: '', fecha_vencimiento: '', estado: 'pendiente',
} as any;

// Flags nuevos preparados para módulos futuros (Módulo 9). Se guardan al instante
// vía toggle individual en admin.js — no pasan por el guardado batch de Config
// porque ese endpoint vive en mayoristas.js (fuera del alcance de esta tarea).
const FLAGS_NUEVOS: { campo: keyof Mayorista; endpoint: string; label: string; nota: string }[] = [
  { campo: 'habilitar_descuentos_por_cliente', endpoint: 'toggle-descuentos-cliente', label: 'Descuentos por cliente', nota: 'Habilita la pestaña 🎁 Descuentos y que MisPrecios use descuentos propios' },
  { campo: 'habilitar_banners', endpoint: 'toggle-banners', label: 'Banners', nota: 'Preparado — sin funcionalidad todavía' },
  { campo: 'habilitar_mensajes', endpoint: 'toggle-mensajes', label: 'Mensajes', nota: 'Preparado — sin funcionalidad todavía' },
  { campo: 'habilitar_notificaciones', endpoint: 'toggle-notificaciones', label: 'Notificaciones', nota: 'Preparado — sin funcionalidad todavía' },
  { campo: 'habilitar_cotizaciones', endpoint: 'toggle-cotizaciones', label: 'Cotizaciones', nota: 'Preparado — sin funcionalidad todavía' },
  { campo: 'habilitar_pedido_sugerido', endpoint: 'toggle-pedido-sugerido', label: 'Pedido sugerido', nota: 'Preparado — sin funcionalidad todavía' },
  { campo: 'habilitar_cross_selling', endpoint: 'toggle-cross-selling', label: 'Cross-selling', nota: 'Preparado — sin funcionalidad todavía' },
  { campo: 'habilitar_lector_barras', endpoint: 'toggle-lector-barras', label: 'Lector de códigos de barras', nota: 'Preparado — sin funcionalidad todavía' },
  { campo: 'habilitar_mis_promociones', endpoint: 'toggle-mis-promociones', label: 'Mis promociones', nota: 'Preparado — sin funcionalidad todavía' },
  { campo: 'habilitar_estados_avanzados', endpoint: 'toggle-estados-avanzados', label: 'Estados avanzados de pedido', nota: 'Preparado — sin funcionalidad todavía' },
  { campo: 'habilitar_medios_de_pago', endpoint: 'toggle-medios-de-pago', label: 'Medios de pago', nota: 'Preparado — sin funcionalidad todavía' },
  { campo: 'habilitar_analiticas', endpoint: 'toggle-analiticas', label: 'Analíticas para el mayorista', nota: 'Preparado — sin funcionalidad todavía' },
];

function Admin() {
  const [autenticado, setAutenticado] = useState(false);
  const [claveAdmin, setClaveAdmin] = useState('');
  const [errorAuth, setErrorAuth] = useState('');
  const [mayoristas, setMayoristas] = useState<Mayorista[]>([]);
  const [cargando, setCargando] = useState(false);

  const [form, setForm] = useState({ nombre: '', email: '', codigo: '', db_connection: '', clave_inicial: '' });
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ link: string; nombre: string } | null>(null);
  const [errorAlta, setErrorAlta] = useState('');

  const [expandidoId, setExpandidoId] = useState<number | null>(null);
  const [expandidoTab, setExpandidoTab] = useState<Tab>('datos');
  const [editForms, setEditForms] = useState<Record<number, { nombre: string; email: string; db_connection: string; razon_social: string }>>({});
  const [configForms, setConfigForms] = useState<Record<number, ConfigForm>>({});
  const [ivanForms, setIvanForms] = useState<Record<number, IvanForm>>({});
  const [guardandoDatos, setGuardandoDatos] = useState<number | null>(null);
  const [guardandoConfig, setGuardandoConfig] = useState<number | null>(null);
  const [guardandoIvan, setGuardandoIvan] = useState<number | null>(null);
  const [msgDatos, setMsgDatos] = useState<Record<number, string>>({});
  const [msgConfig, setMsgConfig] = useState<Record<number, string>>({});
  const [msgIvan, setMsgIvan] = useState<Record<number, string>>({});

  // Módulo 5 — búsqueda
  const [busquedaMayoristas, setBusquedaMayoristas] = useState('');

  // Módulo 2 — link, copiar, regenerar código
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [regenerarModal, setRegenerarModal] = useState<{ mayoristaId: number; paso: 1 | 2; texto: string } | null>(null);
  const [regenerando, setRegenerando] = useState(false);
  const [msgRegenerar, setMsgRegenerar] = useState<Record<number, string>>({});

  // Módulo 3 — clientes registrados
  const [clientesPorMayorista, setClientesPorMayorista] = useState<Record<number, ClienteRegistrado[]>>({});
  const [cargandoClientes, setCargandoClientes] = useState<number | null>(null);
  const [confirmarEliminarCliente, setConfirmarEliminarCliente] = useState<{ mayoristaId: number; codigo: string; cuit: string } | null>(null);
  const [eliminandoCliente, setEliminandoCliente] = useState<string | null>(null);

  // Módulo 4 — clonar mayorista
  const [clonarAbierto, setClonarAbierto] = useState<Mayorista | null>(null);
  const [clonForm, setClonForm] = useState({ nombre: '', email: '', codigo: '', db_connection: '', clave_inicial: '' });
  const [clonando, setClonando] = useState(false);
  const [clonError, setClonError] = useState('');
  const [clonResultado, setClonResultado] = useState<{ link: string; nombre: string } | null>(null);

  // Módulo 10 — limpiar para producción
  const [limpiarModal, setLimpiarModal] = useState<{ mayoristaId: number; nombre: string; paso: 1 | 2; texto: string } | null>(null);
  const [limpiando, setLimpiando] = useState(false);
  const [errorLimpiar, setErrorLimpiar] = useState('');
  const [resumenLimpieza, setResumenLimpieza] = useState<{ pedidos: number; clientes: number; demanda: number; consultas: number } | null>(null);

  // Módulo 6 — cambiar clave admin
  const [cambiarClaveAbierto, setCambiarClaveAbierto] = useState(false);
  const [claveActualForm, setClaveActualForm] = useState('');
  const [claveNuevaForm, setClaveNuevaForm] = useState('');
  const [claveNuevaConfirm, setClaveNuevaConfirm] = useState('');
  const [cambiandoClave, setCambiandoClave] = useState(false);
  const [msgCambioClave, setMsgCambioClave] = useState('');

  // Módulo 7 — pagos (en memoria, sin backend)
  const [pagosPorMayorista, setPagosPorMayorista] = useState<Record<number, Pago[]>>({});
  const [pagoForms, setPagoForms] = useState<Record<number, PagoForm>>({});
  const [divisionPct, setDivisionPct] = useState({ ivan: 60, roberto: 40 });

  // Módulo 8 — analytics
  const [analyticsPorMayorista, setAnalyticsPorMayorista] = useState<Record<number, Analytics>>({});
  const [cargandoAnalytics, setCargandoAnalytics] = useState<number | null>(null);

  // Módulo 1 (tab Descuentos) — descuentos por cliente
  const [descuentosPorMayorista, setDescuentosPorMayorista] = useState<Record<number, DescuentoCliente[]>>({});
  const [cargandoDescuentos, setCargandoDescuentos] = useState<number | null>(null);
  const [editandoDescuento, setEditandoDescuento] = useState<Record<string, EdicionDescuento>>({});
  const [guardandoDescuento, setGuardandoDescuento] = useState<string | null>(null);
  const [nuevoDescuentoForm, setNuevoDescuentoForm] = useState<Record<number, { cuit: string; descuento_1: string; descuento_2: string; descuento_3: string }>>({});

  const headers = { 'Content-Type': 'application/json', 'x-admin-secret': claveAdmin };

  const verificarClave = async () => {
    setErrorAuth('');
    try {
      const res = await fetch(`${API}/api/admin/mayoristas`, { headers });
      if (res.status === 401) { setErrorAuth('Clave incorrecta'); return; }
      setMayoristas(await res.json());
      setAutenticado(true);
    } catch { setErrorAuth('Error de conexión'); }
  };

  const cargarMayoristas = async () => {
    setCargando(true);
    try {
      const res = await fetch(`${API}/api/admin/mayoristas`, { headers });
      setMayoristas(await res.json());
    } catch {} finally { setCargando(false); }
  };

  const crearMayorista = async () => {
    setErrorAlta(''); setResultado(null);
    if (!form.nombre || !form.email || !form.codigo || !form.clave_inicial) {
      setErrorAlta('Completá nombre, email, código y clave inicial'); return;
    }
    setGuardando(true);
    try {
      const res = await fetch(`${API}/api/admin/mayoristas`, {
        method: 'POST', headers, body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) { setErrorAlta(data.mensaje || 'Error'); return; }
      setResultado({ link: data.link_cliente, nombre: data.mayorista.nombre });
      setForm({ nombre: '', email: '', codigo: '', db_connection: '', clave_inicial: '' });
      cargarMayoristas();
    } catch { setErrorAlta('Error de conexión'); } finally { setGuardando(false); }
  };

  const toggleActivo = async (id: number) => {
    try {
      const res = await fetch(`${API}/api/admin/mayoristas/${id}/toggle`, { method: 'PUT', headers });
      const data = await res.json();
      setMayoristas(prev => prev.map(m => m.id === id ? { ...m, activo: data.activo } : m));
    } catch {}
  };

  const toggleConfig = async (id: number) => {
    try {
      const res = await fetch(`${API}/api/admin/mayoristas/${id}/toggle-config`, { method: 'PUT', headers });
      const data = await res.json();
      setMayoristas(prev => prev.map(m => m.id === id ? { ...m, config_habilitada: data.config_habilitada } : m));
    } catch {}
  };

  // Toggle genérico para los 12 flags nuevos (Módulo 9) — pega directo a admin.js
  const toggleFlag = async (id: number, endpoint: string, campo: keyof Mayorista) => {
    try {
      const res = await fetch(`${API}/api/admin/mayoristas/${id}/${endpoint}`, { method: 'PUT', headers });
      const data = await res.json();
      if (!res.ok) return;
      setMayoristas(prev => prev.map(m => m.id === id ? { ...m, [campo]: (data as any)[campo] } : m));
    } catch {}
  };

  const expandir = async (id: number, tab: Tab) => {
    if (expandidoId === id && expandidoTab === tab) { setExpandidoId(null); return; }
    setExpandidoId(id); setExpandidoTab(tab);
    if (tab === 'datos' && !editForms[id]) {
      const m = mayoristas.find(x => x.id === id);
      if (m) setEditForms(prev => ({ ...prev, [id]: { nombre: m.nombre, email: m.email, db_connection: m.db_connection || '', razon_social: m.razon_social || '' } }));
    }
    if (tab === 'config' && !configForms[id]) {
      try {
        const res = await fetch(`${API}/api/mayoristas/${id}/configuracion`);
        const data = await res.json();
        setConfigForms(prev => ({ ...prev, [id]: { ...defaultConfig, ...data } }));
      } catch {}
    }
    if (tab === 'ivan' && !ivanForms[id]) {
      try {
        const res = await fetch(`${API}/api/admin/mayoristas/${id}/ivan`, { headers });
        const data = await res.json();
        setIvanForms(prev => ({ ...prev, [id]: { ...defaultIvan, ...data } }));
      } catch {
        setIvanForms(prev => ({ ...prev, [id]: { ...defaultIvan } }));
      }
    }
    if (tab === 'descuentos' && !descuentosPorMayorista[id]) {
      cargarDescuentos(id);
    }
    if (tab === 'clientes' && !clientesPorMayorista[id]) {
      cargarClientesRegistrados(id);
    }
    if (tab === 'analytics' && !analyticsPorMayorista[id]) {
      cargarAnalytics(id);
    }
    if (tab === 'pagos' && !pagoForms[id]) {
      setPagoForms(prev => ({ ...prev, [id]: { ...defaultPagoForm } }));
      setPagosPorMayorista(prev => prev[id] ? prev : { ...prev, [id]: [] });
    }
  };

  const guardarDatos = async (id: number) => {
    setGuardandoDatos(id);
    try {
      const res = await fetch(`${API}/api/admin/mayoristas/${id}/datos`, {
        method: 'PUT', headers, body: JSON.stringify(editForms[id])
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje);
      setMayoristas(prev => prev.map(m => m.id === id ? { ...m, ...data } : m));
      setMsgDatos(prev => ({ ...prev, [id]: '✅ Guardado' }));
      setTimeout(() => setMsgDatos(prev => ({ ...prev, [id]: '' })), 3000);
    } catch (e: any) {
      setMsgDatos(prev => ({ ...prev, [id]: '❌ ' + e.message }));
    } finally { setGuardandoDatos(null); }
  };

  const guardarConfig = async (id: number) => {
    setGuardandoConfig(id);
    try {
      const res = await fetch(`${API}/api/mayoristas/${id}/configuracion`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(configForms[id])
      });
      if (!res.ok) throw new Error('Error');
      setMayoristas(prev => prev.map(m => m.id === id ? {
        ...m,
        habilitar_ctas_ctes: configForms[id].habilitar_ctas_ctes,
        habilitar_demanda: configForms[id].habilitar_demanda,
        habilitar_ofertas: configForms[id].habilitar_ofertas,
        habilitar_productos_solicitados: configForms[id].habilitar_productos_solicitados
      } : m));
      setMsgConfig(prev => ({ ...prev, [id]: '✅ Guardado' }));
      setTimeout(() => setMsgConfig(prev => ({ ...prev, [id]: '' })), 3000);
    } catch {
      setMsgConfig(prev => ({ ...prev, [id]: '❌ Error al guardar' }));
    } finally { setGuardandoConfig(null); }
  };

  const guardarIvan = async (id: number) => {
    setGuardandoIvan(id);
    try {
      const res = await fetch(`${API}/api/admin/mayoristas/${id}/ivan`, {
        method: 'PUT', headers, body: JSON.stringify(ivanForms[id])
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'Error');
      setMayoristas(prev => prev.map(m => m.id === id ? { ...m, ivan_activo: ivanForms[id].ivan_activo } : m));
      setMsgIvan(prev => ({ ...prev, [id]: '✅ Guardado' }));
      setTimeout(() => setMsgIvan(prev => ({ ...prev, [id]: '' })), 3000);
    } catch (e: any) {
      setMsgIvan(prev => ({ ...prev, [id]: '❌ ' + e.message }));
    } finally { setGuardandoIvan(null); }
  };

  const setI = (id: number, field: keyof IvanForm, value: any) =>
    setIvanForms(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const setC = (id: number, field: keyof ConfigForm, value: any) =>
    setConfigForms(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const codigoSugerido = form.nombre.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

  // ═══════════════ MÓDULO 2 — link, copiar mensaje, regenerar código ═══════════════

  const linkCliente = (codigo: string) => `https://${LINK_BASE}/?m=${codigo}`;

  const mensajeCliente = (codigo: string) =>
    `Hola! Tu acceso al sistema de pedidos es:\n${linkCliente(codigo)}\nIngresá con tu CUIT y la clave que te asignaron.`;

  const copiar = async (texto: string, id: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiadoId(id);
      setTimeout(() => setCopiadoId(null), 2000);
    } catch {}
  };

  const abrirRegenerar = (mayoristaId: number) => setRegenerarModal({ mayoristaId, paso: 1, texto: '' });
  const cerrarRegenerar = () => setRegenerarModal(null);
  const avanzarRegenerar = () => { if (regenerarModal) setRegenerarModal({ ...regenerarModal, paso: 2 }); };

  const ejecutarRegenerar = async () => {
    if (!regenerarModal || regenerarModal.texto !== 'CONFIRMAR') return;
    const { mayoristaId } = regenerarModal;
    setRegenerando(true);
    try {
      const res = await fetch(`${API}/api/admin/mayoristas/${mayoristaId}/regenerar-codigo`, { method: 'PUT', headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'Error');
      setMayoristas(prev => prev.map(m => m.id === mayoristaId ? { ...m, codigo: data.codigo } : m));
      setMsgRegenerar(prev => ({ ...prev, [mayoristaId]: `✅ Nuevo código: ${data.codigo}` }));
      setTimeout(() => setMsgRegenerar(prev => ({ ...prev, [mayoristaId]: '' })), 6000);
      setRegenerarModal(null);
    } catch (e: any) {
      setMsgRegenerar(prev => ({ ...prev, [mayoristaId]: '❌ ' + e.message }));
    } finally { setRegenerando(false); }
  };

  // ═══════════════ MÓDULO 3 — clientes registrados del mayorista ═══════════════

  const cargarClientesRegistrados = async (id: number) => {
    setCargandoClientes(id);
    try {
      const res = await fetch(`${API}/api/admin/mayoristas/${id}/clientes-registrados`, { headers });
      const data = await res.json();
      setClientesPorMayorista(prev => ({ ...prev, [id]: Array.isArray(data) ? data : [] }));
    } catch {} finally { setCargandoClientes(null); }
  };

  const eliminarCliente = async (mayoristaId: number, codigo: string, cuit: string) => {
    const key = `${mayoristaId}-${cuit}`;
    setEliminandoCliente(key);
    try {
      const res = await fetch(`${API}/api/admin/clientes/${codigo}/${cuit}`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error();
      setClientesPorMayorista(prev => ({ ...prev, [mayoristaId]: (prev[mayoristaId] || []).filter(c => c.cuit !== cuit) }));
      setConfirmarEliminarCliente(null);
    } catch {} finally { setEliminandoCliente(null); }
  };

  // ═══════════════ MÓDULO 4 — clonar mayorista ═══════════════

  const abrirClonar = (m: Mayorista) => {
    setClonError(''); setClonResultado(null);
    setClonForm({ nombre: `${m.nombre} - COPIA`, email: '', codigo: '', db_connection: m.db_connection || '', clave_inicial: '' });
    setClonarAbierto(m);
  };

  const crearClon = async () => {
    setClonError(''); setClonResultado(null);
    if (!clonForm.nombre || !clonForm.email || !clonForm.codigo || !clonForm.clave_inicial) {
      setClonError('Completá nombre, email, código y clave inicial'); return;
    }
    setClonando(true);
    try {
      const res = await fetch(`${API}/api/admin/mayoristas`, {
        method: 'POST', headers, body: JSON.stringify(clonForm)
      });
      const data = await res.json();
      if (!res.ok) { setClonError(data.mensaje || 'Error'); return; }
      setClonResultado({ link: data.link_cliente, nombre: data.mayorista.nombre });
      cargarMayoristas();
    } catch { setClonError('Error de conexión'); } finally { setClonando(false); }
  };

  // ═══════════════ MÓDULO 10 — limpiar para producción ═══════════════

  const abrirLimpiar = (m: Mayorista) => {
    setErrorLimpiar(''); setResumenLimpieza(null);
    setLimpiarModal({ mayoristaId: m.id, nombre: m.nombre, paso: 1, texto: '' });
  };
  const cerrarLimpiar = () => setLimpiarModal(null);
  const avanzarLimpiar = () => { if (limpiarModal) setLimpiarModal({ ...limpiarModal, paso: 2 }); };

  const ejecutarLimpiar = async () => {
    if (!limpiarModal || limpiarModal.texto !== limpiarModal.nombre) return;
    setErrorLimpiar(''); setLimpiando(true);
    try {
      const res = await fetch(`${API}/api/admin/mayoristas/${limpiarModal.mayoristaId}/limpiar-pruebas`, {
        method: 'DELETE', headers
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'Error');
      setResumenLimpieza({
        pedidos: data.pedidos_eliminados || 0,
        clientes: data.clientes_eliminados || 0,
        demanda: data.demanda_eliminada || 0,
        consultas: data.consultas_eliminadas || 0,
      });
    } catch (e: any) {
      setErrorLimpiar(e.message || 'Error al limpiar');
    } finally { setLimpiando(false); }
  };

  // ═══════════════ MÓDULO 6 — cambiar clave admin ═══════════════

  const cambiarClaveAdmin = async () => {
    setMsgCambioClave('');
    if (!claveActualForm || !claveNuevaForm) { setMsgCambioClave('❌ Completá ambos campos'); return; }
    if (claveNuevaForm !== claveNuevaConfirm) { setMsgCambioClave('❌ La confirmación no coincide'); return; }
    setCambiandoClave(true);
    try {
      const res = await fetch(`${API}/api/admin/cambiar-clave`, {
        method: 'PUT', headers, body: JSON.stringify({ clave_actual: claveActualForm, clave_nueva: claveNuevaForm })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'Error');
      // Actualizamos la clave en memoria del panel para no perder la sesión
      setClaveAdmin(claveNuevaForm);
      setMsgCambioClave('✅ Clave actualizada. Recordá guardarla también en el .env de Render (ADMIN_SECRET) para que no se pierda al reiniciar el servidor.');
      setClaveActualForm(''); setClaveNuevaForm(''); setClaveNuevaConfirm('');
    } catch (e: any) {
      setMsgCambioClave('❌ ' + e.message);
    } finally { setCambiandoClave(false); }
  };

  // ═══════════════ MÓDULO 7 — pagos (en memoria) ═══════════════

  const setPagoField = (id: number, campo: keyof PagoForm, valor: string) =>
    setPagoForms(prev => ({ ...prev, [id]: { ...(prev[id] || defaultPagoForm), [campo]: valor } }));

  const agregarPago = (id: number) => {
    const f = pagoForms[id];
    if (!f || !f.monto_total || !f.fecha_pago || !f.fecha_vencimiento) return;
    const nuevo: Pago = {
      id: `${Date.now()}`,
      tipo: f.tipo,
      monto_total: parseFloat(f.monto_total) || 0,
      fecha_pago: f.fecha_pago,
      fecha_vencimiento: f.fecha_vencimiento,
      estado: f.estado,
    };
    setPagosPorMayorista(prev => ({ ...prev, [id]: [nuevo, ...(prev[id] || [])] }));
    setPagoForms(prev => ({ ...prev, [id]: { ...defaultPagoForm } }));
  };

  const eliminarPago = (mayoristaId: number, pagoId: string) => {
    setPagosPorMayorista(prev => ({ ...prev, [mayoristaId]: (prev[mayoristaId] || []).filter(p => p.id !== pagoId) }));
  };

  const diasParaVencer = (fechaVencimiento: string) => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const venc = new Date(fechaVencimiento + 'T00:00:00');
    return Math.round((venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
  };

  const colorEstadoPago = (estado: Pago['estado']) =>
    estado === 'pagado' ? 'bg-green-50 border-green-200 text-green-700'
      : estado === 'vencido' ? 'bg-red-50 border-red-200 text-red-700'
      : 'bg-yellow-50 border-yellow-200 text-yellow-700';

  // ═══════════════ MÓDULO 8 — analytics ═══════════════

  const cargarAnalytics = async (id: number) => {
    setCargandoAnalytics(id);
    try {
      const res = await fetch(`${API}/api/admin/mayoristas/${id}/analytics`, { headers });
      const data = await res.json();
      setAnalyticsPorMayorista(prev => ({ ...prev, [id]: data }));
    } catch {} finally { setCargandoAnalytics(null); }
  };

  const indicadorActividad = (ultimoPedido: string | null) => {
    if (!ultimoPedido) return { emoji: '⚪', label: 'Sin pedidos registrados' };
    const dias = Math.round((Date.now() - new Date(ultimoPedido).getTime()) / (1000 * 60 * 60 * 24));
    if (dias <= 30) return { emoji: '🟢', label: `Activo — último pedido hace ${dias} día(s)` };
    if (dias <= 90) return { emoji: '🟡', label: `Poco activo — último pedido hace ${dias} día(s)` };
    return { emoji: '🔴', label: `Inactivo — último pedido hace ${dias} día(s)` };
  };

  // ═══════════════ Descuentos por cliente (tab 🎁) ═══════════════

  const cargarDescuentos = async (id: number) => {
    setCargandoDescuentos(id);
    try {
      const res = await fetch(`${API}/api/admin/mayoristas/${id}/clientes-descuentos`, { headers });
      const data = await res.json();
      setDescuentosPorMayorista(prev => ({ ...prev, [id]: Array.isArray(data) ? data : [] }));
    } catch {} finally { setCargandoDescuentos(null); }
  };

  const edicionDeFila = (mayoristaId: number, item: DescuentoCliente): EdicionDescuento => {
    const key = `${mayoristaId}-${item.cuit}`;
    return editandoDescuento[key] || {
      descuento_1: item.descuento_1 == null ? '' : String(item.descuento_1),
      descuento_2: item.descuento_2 == null ? '' : String(item.descuento_2),
      descuento_3: item.descuento_3 == null ? '' : String(item.descuento_3),
    };
  };

  const setEdicionFila = (mayoristaId: number, item: DescuentoCliente, campo: keyof EdicionDescuento, valor: string) => {
    const key = `${mayoristaId}-${item.cuit}`;
    setEditandoDescuento(prev => ({ ...prev, [key]: { ...edicionDeFila(mayoristaId, item), [campo]: valor } }));
  };

  const guardarDescuentoExistente = async (mayoristaId: number, codigo: string, item: DescuentoCliente) => {
    const key = `${mayoristaId}-${item.cuit}`;
    const edit = edicionDeFila(mayoristaId, item);
    setGuardandoDescuento(key);
    try {
      const res = await fetch(`${API}/api/admin/clientes/${codigo}/${item.cuit}/descuentos`, {
        method: 'PUT', headers, body: JSON.stringify({
          descuento_1: edit.descuento_1 === '' ? null : parseFloat(edit.descuento_1),
          descuento_2: edit.descuento_2 === '' ? null : parseFloat(edit.descuento_2),
          descuento_3: edit.descuento_3 === '' ? null : parseFloat(edit.descuento_3),
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'Error');
      setDescuentosPorMayorista(prev => ({
        ...prev,
        [mayoristaId]: (prev[mayoristaId] || []).map(c => c.cuit === item.cuit ? data : c)
      }));
    } catch {} finally { setGuardandoDescuento(null); }
  };

  const setNuevoDescuentoField = (id: number, campo: 'cuit' | 'descuento_1' | 'descuento_2' | 'descuento_3', valor: string) =>
    setNuevoDescuentoForm(prev => {
      const base = prev[id] || { cuit: '', descuento_1: '', descuento_2: '', descuento_3: '' };
      return { ...prev, [id]: { ...base, [campo]: valor } };
    });

  const agregarDescuentoCliente = async (mayoristaId: number, codigo: string) => {
    const f = nuevoDescuentoForm[mayoristaId];
    if (!f || !f.cuit.trim()) return;
    const key = `${mayoristaId}-${f.cuit.trim()}`;
    setGuardandoDescuento(key);
    try {
      const res = await fetch(`${API}/api/admin/clientes/${codigo}/${f.cuit.trim()}/descuentos`, {
        method: 'PUT', headers, body: JSON.stringify({
          descuento_1: f.descuento_1 === '' ? null : parseFloat(f.descuento_1),
          descuento_2: f.descuento_2 === '' ? null : parseFloat(f.descuento_2),
          descuento_3: f.descuento_3 === '' ? null : parseFloat(f.descuento_3),
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'Error');
      setDescuentosPorMayorista(prev => {
        const lista = prev[mayoristaId] || [];
        const existe = lista.some(c => c.cuit === data.cuit);
        return { ...prev, [mayoristaId]: existe ? lista.map(c => c.cuit === data.cuit ? data : c) : [data, ...lista] };
      });
      setNuevoDescuentoForm(prev => ({ ...prev, [mayoristaId]: { cuit: '', descuento_1: '', descuento_2: '', descuento_3: '' } }));
    } catch {} finally { setGuardandoDescuento(null); }
  };

  // ═══════════════ Módulo 5 — filtro en memoria ═══════════════

  const termino = busquedaMayoristas.trim().toLowerCase();
  const mayoristasFiltrados = termino
    ? mayoristas.filter(m =>
        m.nombre.toLowerCase().includes(termino) ||
        m.email.toLowerCase().includes(termino) ||
        m.codigo.toLowerCase().includes(termino))
    : mayoristas;

  if (!autenticado) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <div className="flex items-center gap-3 mb-6 justify-center">
            <Logo size={36} />
            <div>
              <p className="text-xs text-gray-400">Gestión Integral Pedidos</p>
              <h1 className="text-lg font-bold text-blue-600">Panel Admin</h1>
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-4 text-center">Ingresá la clave de administrador</p>
          <input type="password" placeholder="Clave admin" value={claveAdmin}
            onChange={e => setClaveAdmin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && verificarClave()}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {errorAuth && <p className="text-red-500 text-sm mb-3">{errorAuth}</p>}
          <button onClick={verificarClave}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold">
            Entrar
          </button>
        </div>
      </div>
    );
  }

  const TABS: { key: Tab; label: string; color: string }[] = [
    { key: 'datos', label: '📋 Datos', color: 'blue' },
    { key: 'config', label: '⚙️ Config', color: 'blue' },
    { key: 'ivan', label: '🔌 Ivan', color: 'purple' },
    { key: 'descuentos', label: '🎁 Descuentos', color: 'orange' },
    { key: 'clientes', label: '👥 Clientes', color: 'teal' },
    { key: 'pagos', label: '💰 Pagos', color: 'green' },
    { key: 'analytics', label: '📊 Analytics', color: 'indigo' },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* HEADER */}
      <nav className="bg-white shadow-sm px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={28} />
            <div>
              <p className="text-xs text-gray-400">Gestión Integral Pedidos</p>
              <h1 className="text-base font-bold text-blue-600">Panel Admin</h1>
            </div>
          </div>
          <button onClick={() => setCambiarClaveAbierto(prev => !prev)}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-blue-400 font-medium">
            🔑 Cambiar clave
          </button>
        </div>

        {/* MÓDULO 6 — cambiar clave admin */}
        {cambiarClaveAbierto && (
          <div className="mt-3 p-4 bg-gray-50 rounded-xl border border-gray-200 max-w-md">
            <p className="text-sm font-semibold text-gray-700 mb-2">Cambiar clave de administrador</p>
            <div className="space-y-2">
              <input type="password" placeholder="Clave actual" value={claveActualForm}
                onChange={e => setClaveActualForm(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="password" placeholder="Clave nueva" value={claveNuevaForm}
                onChange={e => setClaveNuevaForm(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="password" placeholder="Confirmar clave nueva" value={claveNuevaConfirm}
                onChange={e => setClaveNuevaConfirm(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2">
              ⚠️ La clave se resetea al reiniciar el servidor. Para hacerla permanente actualizá el .env en Render.
            </p>
            {msgCambioClave && <p className="text-xs text-gray-700 mt-2">{msgCambioClave}</p>}
            <button onClick={cambiarClaveAdmin} disabled={cambiandoClave}
              className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
              {cambiandoClave ? 'Cambiando...' : 'Cambiar clave'}
            </button>
          </div>
        )}
      </nav>

      <div className="max-w-4xl mx-auto p-6 space-y-6">

        {/* ALTA */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">➕ Dar de alta mayorista</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Nombre</label>
              <input type="text" placeholder="Ej: Sanitarios Rancagua" value={form.nombre}
                onChange={e => setForm(prev => ({ ...prev, nombre: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Email (para login)</label>
              <input type="email" placeholder="Ej: rancagua@sanitarios.com" value={form.email}
                onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Código <span className="text-gray-400 font-normal">(?m=código)</span></label>
              <div className="flex gap-2">
                <input type="text" placeholder="Ej: rancagua" value={form.codigo}
                  onChange={e => setForm(prev => ({ ...prev, codigo: e.target.value.toLowerCase().replace(/\s/g, '_') }))}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {codigoSugerido && codigoSugerido !== form.codigo && (
                  <button onClick={() => setForm(prev => ({ ...prev, codigo: codigoSugerido }))}
                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded-lg whitespace-nowrap">
                    Usar: {codigoSugerido}
                  </button>
                )}
              </div>
              {form.codigo && <p className="text-xs text-blue-500 mt-1">Link del cliente: <strong>?m={form.codigo}</strong></p>}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Cadena de conexión (db_connection)</label>
              <input type="text" placeholder="postgresql://usuario:clave@host:5432/base" value={form.db_connection}
                onChange={e => setForm(prev => ({ ...prev, db_connection: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-gray-400 mt-1">Dejalo vacío si todavía no tenés la conexión de Ivan</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Clave inicial</label>
              <input type="text" placeholder="La clave que le vas a dar para entrar" value={form.clave_inicial}
                onChange={e => setForm(prev => ({ ...prev, clave_inicial: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          {errorAlta && <p className="text-red-500 text-sm mt-3">{errorAlta}</p>}
          {resultado && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-700 font-semibold">✅ {resultado.nombre} creado</p>
              <p className="text-sm text-green-600 mt-1">Link del cliente: <strong>{resultado.link}</strong></p>
            </div>
          )}
          <button onClick={crearMayorista} disabled={guardando}
            className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold disabled:opacity-50">
            {guardando ? 'Creando...' : '✅ Crear mayorista'}
          </button>
        </div>

        {/* LISTA */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800">📋 Mayoristas cargados</h2>
            <button onClick={cargarMayoristas} disabled={cargando} className="text-sm text-blue-600 hover:text-blue-800">
              {cargando ? 'Cargando...' : '🔄 Actualizar'}
            </button>
          </div>

          {/* MÓDULO 5 — búsqueda */}
          <input type="text" placeholder="Buscar por nombre, email o código..."
            value={busquedaMayoristas} onChange={e => setBusquedaMayoristas(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p className="text-xs text-gray-400 mb-4">
            Mostrando {mayoristasFiltrados.length} de {mayoristas.length} mayoristas
          </p>

          {mayoristas.length === 0 ? (
            <p className="text-gray-400 text-center py-6">No hay mayoristas cargados</p>
          ) : mayoristasFiltrados.length === 0 ? (
            <p className="text-gray-400 text-center py-6">Ningún mayorista coincide con "{busquedaMayoristas}"</p>
          ) : (
            <div className="space-y-2">
              {mayoristasFiltrados.map(m => (
                <div key={m.id} className="border border-gray-100 rounded-xl overflow-hidden">

                  {/* FILA PRINCIPAL */}
                  <div className="p-3 bg-gray-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-800">{m.nombre}</p>
                        <p className="text-xs text-gray-500 truncate">{m.email}</p>
                        <p className="text-xs text-gray-400 flex flex-wrap gap-2 mt-1">
                          {m.ivan_activo && <span className="text-purple-600 font-semibold">Ivan ✓</span>}
                          {m.habilitar_ctas_ctes && <span className="text-teal-600 font-semibold">Ctas ✓</span>}
                          {m.habilitar_demanda && <span className="text-blue-600 font-semibold">Demanda ✓</span>}
                          {m.habilitar_ofertas && <span className="text-orange-600 font-semibold">Ofertas ✓</span>}
                          {m.habilitar_productos_solicitados && <span className="text-pink-600 font-semibold">Prod.Solicitados ✓</span>}
                          {m.habilitar_descuentos_por_cliente && <span className="text-amber-600 font-semibold">Desc.Cliente ✓</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => toggleConfig(m.id)}
                          className={`text-xs px-2.5 py-1.5 rounded-full font-semibold transition-colors ${
                            m.config_habilitada ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                          }`}>{m.config_habilitada ? 'Config ON' : '🔒 OFF'}</button>
                        <button onClick={() => toggleActivo(m.id)}
                          className={`text-xs px-2.5 py-1.5 rounded-full font-semibold transition-colors ${
                            m.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                          }`}>{m.activo ? 'Activo' : 'Inactivo'}</button>
                      </div>
                    </div>

                    {/* MÓDULO 2 — link de acceso, solo lectura */}
                    <div className="mt-3 p-2.5 bg-white border border-gray-200 rounded-lg">
                      <p className="text-xs text-gray-400 mb-0.5">Link de acceso para clientes (solo lectura)</p>
                      <p className="text-xs font-mono text-gray-700 break-all">{linkCliente(m.codigo)}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <button onClick={() => copiar(linkCliente(m.codigo), `${m.id}-link`)}
                          className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-2.5 py-1 rounded-lg font-medium">
                          {copiadoId === `${m.id}-link` ? '✅ Copiado' : '📋 Copiar link'}
                        </button>
                        <button onClick={() => copiar(mensajeCliente(m.codigo), `${m.id}-msg`)}
                          className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-2.5 py-1 rounded-lg font-medium">
                          {copiadoId === `${m.id}-msg` ? '✅ Copiado' : '📋 Copiar mensaje'}
                        </button>
                        <button onClick={() => abrirRegenerar(m.id)}
                          className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1 rounded-lg font-medium">
                          🔄 Regenerar link
                        </button>
                        <button onClick={() => abrirClonar(m)}
                          className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2.5 py-1 rounded-lg font-medium">
                          🧬 Clonar
                        </button>
                        <button onClick={() => abrirLimpiar(m)}
                          className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1 rounded-lg font-medium">
                          🧹 Limpiar para producción
                        </button>
                      </div>
                      {msgRegenerar[m.id] && <p className="text-xs text-gray-700 mt-1.5">{msgRegenerar[m.id]}</p>}
                    </div>

                    {/* TABS */}
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {TABS.map(t => (
                        <button key={t.key} onClick={() => expandir(m.id, t.key)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg font-medium border transition-colors ${
                            expandidoId === m.id && expandidoTab === t.key
                              ? `bg-${t.color}-600 text-white border-${t.color}-600`
                              : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
                          }`}
                          style={expandidoId === m.id && expandidoTab === t.key ? {
                            backgroundColor: t.color === 'blue' ? '#2563eb' : t.color === 'purple' ? '#9333ea'
                              : t.color === 'orange' ? '#ea580c' : t.color === 'teal' ? '#0d9488'
                              : t.color === 'green' ? '#16a34a' : '#4f46e5',
                            borderColor: 'transparent', color: '#fff',
                          } : undefined}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* EXPANDIDO — DATOS */}
                  {expandidoId === m.id && expandidoTab === 'datos' && editForms[m.id] && (
                    <div className="p-4 border-t border-gray-100 bg-white space-y-3">
                      <p className="text-sm font-semibold text-gray-600 mb-2">📋 Editar datos</p>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Nombre</label>
                        <input type="text" value={editForms[m.id].nombre}
                          onChange={e => setEditForms(prev => ({ ...prev, [m.id]: { ...prev[m.id], nombre: e.target.value } }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Email</label>
                        <input type="email" value={editForms[m.id].email}
                          onChange={e => setEditForms(prev => ({ ...prev, [m.id]: { ...prev[m.id], email: e.target.value } }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Razón social (membrete)</label>
                        <input type="text" value={editForms[m.id].razon_social}
                          onChange={e => setEditForms(prev => ({ ...prev, [m.id]: { ...prev[m.id], razon_social: e.target.value } }))}
                          placeholder="Ej: LUMAC S.A."
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <p className="text-xs text-gray-400 mt-1">Se muestra en el catálogo del cliente como: GESTIÓN INTEGRAL PEDIDOS | LUMAC S.A.</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Cadena de conexión (db_connection)</label>
                        <input type="text" value={editForms[m.id].db_connection}
                          onChange={e => setEditForms(prev => ({ ...prev, [m.id]: { ...prev[m.id], db_connection: e.target.value } }))}
                          placeholder="postgresql://usuario:clave@host:5432/base"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <p className="text-xs text-gray-400 mt-1">Solo se muestra y copia acá — el sistema no la procesa ni modifica.</p>
                      </div>
                      {msgDatos[m.id] && <p className="text-sm text-gray-700">{msgDatos[m.id]}</p>}
                      <button onClick={() => guardarDatos(m.id)} disabled={guardandoDatos === m.id}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
                        {guardandoDatos === m.id ? 'Guardando...' : 'Guardar datos'}
                      </button>
                    </div>
                  )}

                  {/* EXPANDIDO — CONFIGURACIÓN */}
                  {expandidoId === m.id && expandidoTab === 'config' && configForms[m.id] && (
                    <div className="p-4 border-t border-gray-100 bg-white space-y-4">
                      <p className="text-sm font-semibold text-gray-600 mb-2">⚙️ Configuración de {m.nombre}</p>
                      {[
                        { field: 'mostrar_precios', label: 'Mostrar precios a clientes' },
                        { field: 'mostrar_stock', label: 'Mostrar stock a clientes' },
                        { field: 'mostrar_marca', label: 'Mostrar filtro de marca' },
                        { field: 'mostrar_rubro', label: 'Mostrar filtro de rubro' },
                        { field: 'mostrar_tipo', label: 'Mostrar filtro de tipo' },
                        { field: 'pedir_clave', label: 'Pedir clave a los clientes' },
                      ].map(({ field, label }) => (
                        <div key={field} className="flex items-center justify-between">
                          <p className="text-sm text-gray-700">{label}</p>
                          <SW activo={(configForms[m.id] as any)[field]}
                            onClick={() => setC(m.id, field as keyof ConfigForm, !(configForms[m.id] as any)[field])} />
                        </div>
                      ))}
                      <hr />
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-700">Calculadora de precios para reventa</p>
                        <SW activo={configForms[m.id].habilitar_calculadora}
                          onClick={() => setC(m.id, 'habilitar_calculadora', !configForms[m.id].habilitar_calculadora)} />
                      </div>
                      {configForms[m.id].habilitar_calculadora && (
                        <div className="bg-gray-50 rounded-lg p-3 space-y-3">
                          <p className="text-xs text-gray-500">Descuentos en cascada: precio → −D1 → −D2 → −D3 → +IVA</p>
                          <div className="grid grid-cols-3 gap-2">
                            {[1,2,3].map(n => (
                              <div key={n}>
                                <p className="text-xs text-gray-600 mb-1">Descuento {n} (%)</p>
                                <input type="number" min="0" max="100"
                                  value={(configForms[m.id] as any)[`descuento_${n}`]}
                                  onChange={e => setC(m.id, `descuento_${n}` as keyof ConfigForm, parseFloat(e.target.value) || 0)}
                                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                              </div>
                            ))}
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 mb-1">IVA (%)</p>
                            <input type="number" min="0" value={configForms[m.id].iva}
                              onChange={e => setC(m.id, 'iva', parseFloat(e.target.value) || 0)}
                              className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          </div>
                        </div>
                      )}
                      <hr />
                      <div>
                        <p className="text-sm text-gray-700 mb-2">Tamaño de hoja PDF</p>
                        <div className="flex gap-2">
                          {['A4','A5'].map(t => (
                            <button key={t} onClick={() => setC(m.id, 'tamanio_hoja', t)}
                              className={`px-4 py-1.5 rounded-lg text-sm font-medium border-2 ${
                                configForms[m.id].tamanio_hoja === t ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-600'
                              }`}>{t}</button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Ítems por hoja (mín 30)</p>
                          <input type="number" min="30" max="50" value={configForms[m.id].items_por_hoja}
                            onChange={e => setC(m.id, 'items_por_hoja', parseInt(e.target.value) || 30)}
                            className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 mb-1">N° pedido inicial</p>
                          <input type="number" min="1" value={configForms[m.id].numero_pedido_inicio}
                            onChange={e => setC(m.id, 'numero_pedido_inicio', parseInt(e.target.value) || 1)}
                            className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-2">Orden PDF</p>
                        <div className="flex gap-2">
                          {[{v:'codigo',l:'# Código'},{v:'descripcion',l:'A·Z Descripción'},{v:'rubro',l:'📦 Rubro'}].map(op => (
                            <button key={op.v} onClick={() => setC(m.id, 'orden_pdf', op.v)}
                              className={`flex-1 py-1.5 px-2 rounded-lg border text-xs font-medium ${
                                configForms[m.id].orden_pdf === op.v ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-600'
                              }`}>{op.l}</button>
                          ))}
                        </div>
                      </div>
                      <hr />
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-700 font-medium">Cuenta corriente para clientes</p>
                          <p className="text-xs text-gray-400">Los clientes podrán consultar e imprimir su cta cte</p>
                        </div>
                        <SW activo={configForms[m.id].habilitar_ctas_ctes}
                          onClick={() => setC(m.id, 'habilitar_ctas_ctes', !configForms[m.id].habilitar_ctas_ctes)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-700 font-medium">Demanda no satisfecha</p>
                          <p className="text-xs text-gray-400">El mayorista verá las búsquedas sin resultado de sus clientes</p>
                        </div>
                        <SW activo={configForms[m.id].habilitar_demanda}
                          onClick={() => setC(m.id, 'habilitar_demanda', !configForms[m.id].habilitar_demanda)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-700 font-medium">Ofertas</p>
                          <p className="text-xs text-gray-400">El mayorista podrá crear ofertas y combos para sus clientes</p>
                        </div>
                        <SW activo={configForms[m.id].habilitar_ofertas}
                          onClick={() => setC(m.id, 'habilitar_ofertas', !configForms[m.id].habilitar_ofertas)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-700 font-medium">Productos más/menos solicitados</p>
                          <p className="text-xs text-gray-400">El mayorista verá un ranking de productos pedidos en un rango de fechas</p>
                        </div>
                        <SW activo={configForms[m.id].habilitar_productos_solicitados}
                          onClick={() => setC(m.id, 'habilitar_productos_solicitados', !configForms[m.id].habilitar_productos_solicitados)} />
                      </div>
                      {msgConfig[m.id] && <p className="text-sm text-gray-700">{msgConfig[m.id]}</p>}
                      <button onClick={() => guardarConfig(m.id)} disabled={guardandoConfig === m.id}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
                        {guardandoConfig === m.id ? 'Guardando...' : 'Guardar configuración'}
                      </button>

                      {/* MÓDULO 9 — flags preparados para módulos futuros */}
                      <hr />
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Funciones futuras (se guardan al instante)</p>
                      {FLAGS_NUEVOS.map(f => (
                        <div key={f.endpoint} className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-700 font-medium">{f.label}</p>
                            <p className="text-xs text-gray-400">{f.nota}</p>
                          </div>
                          <SW activo={!!(m as any)[f.campo]}
                            onClick={() => toggleFlag(m.id, f.endpoint, f.campo)} />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* EXPANDIDO — IVAN */}
                  {expandidoId === m.id && expandidoTab === 'ivan' && ivanForms[m.id] && (
                    <div className="p-4 border-t border-purple-100 bg-white space-y-4">
                      <p className="text-sm font-semibold text-purple-700 mb-2">🔌 Integración Ivan — {m.nombre}</p>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-700 font-medium">Replicar pedidos en sistema de Ivan</p>
                          <p className="text-xs text-gray-400">Si está OFF los pedidos solo se guardan en Supabase</p>
                        </div>
                        <SW activo={ivanForms[m.id].ivan_activo}
                          onClick={() => setI(m.id, 'ivan_activo', !ivanForms[m.id].ivan_activo)} />
                      </div>
                      {ivanForms[m.id].ivan_activo && (
                        <div className="bg-purple-50 rounded-lg p-3 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-gray-600 block mb-1">ID Depósito</label>
                              <input type="number" min="1" value={ivanForms[m.id].ivan_id_deposito}
                                onChange={e => setI(m.id, 'ivan_id_deposito', parseInt(e.target.value) || 1)}
                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600 block mb-1">ID Sucursal</label>
                              <input type="number" min="1" value={ivanForms[m.id].ivan_id_sucursal}
                                onChange={e => setI(m.id, 'ivan_id_sucursal', parseInt(e.target.value) || 1)}
                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600 block mb-1">ID Operario</label>
                              <input type="number" min="1" value={ivanForms[m.id].ivan_id_operario}
                                onChange={e => setI(m.id, 'ivan_id_operario', parseInt(e.target.value) || '')}
                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600 block mb-1">ID Vendedor</label>
                              <input type="number" min="1" value={ivanForms[m.id].ivan_id_vendedor}
                                onChange={e => setI(m.id, 'ivan_id_vendedor', parseInt(e.target.value) || '')}
                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600 block mb-1">ID Tipo Pedido</label>
                              <input type="number" min="1" value={ivanForms[m.id].ivan_id_tipo_pedido}
                                onChange={e => setI(m.id, 'ivan_id_tipo_pedido', parseInt(e.target.value) || 1)}
                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600 block mb-1">IVA % (default items)</label>
                              <input type="number" min="0" value={ivanForms[m.id].ivan_porc_iva}
                                onChange={e => setI(m.id, 'ivan_porc_iva', parseFloat(e.target.value) || 21)}
                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600 block mb-1">ID Condición Venta</label>
                              <input type="number" min="1" value={ivanForms[m.id].ivan_id_condicion_venta}
                                onChange={e => setI(m.id, 'ivan_id_condicion_venta', parseInt(e.target.value) || '')}
                                placeholder="Opcional"
                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                            </div>
                          </div>
                        </div>
                      )}
                      {msgIvan[m.id] && <p className="text-sm text-gray-700">{msgIvan[m.id]}</p>}
                      <button onClick={() => guardarIvan(m.id)} disabled={guardandoIvan === m.id}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
                        {guardandoIvan === m.id ? 'Guardando...' : 'Guardar integración Ivan'}
                      </button>
                    </div>
                  )}

                  {/* EXPANDIDO — DESCUENTOS POR CLIENTE */}
                  {expandidoId === m.id && expandidoTab === 'descuentos' && (
                    <div className="p-4 border-t border-orange-100 bg-white space-y-4">
                      <p className="text-sm font-semibold text-orange-700 mb-2">🎁 Descuentos por cliente — {m.nombre}</p>
                      <p className="text-xs text-gray-400">
                        Solo aplican si el switch "Descuentos por cliente" está activo en la pestaña ⚙️ Config.
                        Un cliente sin descuentos propios usa los descuentos generales del mayorista.
                      </p>

                      {/* agregar/editar por CUIT nuevo */}
                      <div className="bg-orange-50 rounded-lg p-3 space-y-2">
                        <p className="text-xs font-medium text-orange-700">Asignar a un CUIT</p>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                          <input type="text" placeholder="CUIT" value={nuevoDescuentoForm[m.id]?.cuit || ''}
                            onChange={e => setNuevoDescuentoField(m.id, 'cuit', e.target.value)}
                            className="col-span-2 sm:col-span-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                          <input type="number" placeholder="D1 %" value={nuevoDescuentoForm[m.id]?.descuento_1 || ''}
                            onChange={e => setNuevoDescuentoField(m.id, 'descuento_1', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                          <input type="number" placeholder="D2 %" value={nuevoDescuentoForm[m.id]?.descuento_2 || ''}
                            onChange={e => setNuevoDescuentoField(m.id, 'descuento_2', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                          <input type="number" placeholder="D3 %" value={nuevoDescuentoForm[m.id]?.descuento_3 || ''}
                            onChange={e => setNuevoDescuentoField(m.id, 'descuento_3', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                          <button onClick={() => agregarDescuentoCliente(m.id, m.codigo)}
                            disabled={!nuevoDescuentoForm[m.id]?.cuit.trim() || guardandoDescuento === `${m.id}-${(nuevoDescuentoForm[m.id]?.cuit || '').trim()}`}
                            className="bg-orange-600 hover:bg-orange-700 text-white rounded px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
                            Guardar
                          </button>
                        </div>
                      </div>

                      {cargandoDescuentos === m.id ? (
                        <p className="text-sm text-gray-400 text-center py-4">Cargando...</p>
                      ) : (descuentosPorMayorista[m.id] || []).length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">Ningún cliente tiene descuentos propios asignados</p>
                      ) : (
                        <div className="space-y-2">
                          {(descuentosPorMayorista[m.id] || []).map(item => {
                            const edit = edicionDeFila(m.id, item);
                            const key = `${m.id}-${item.cuit}`;
                            return (
                              <div key={item.cuit} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-center bg-gray-50 rounded-lg p-2">
                                <p className="text-sm font-mono text-gray-700 col-span-2 sm:col-span-1">{item.cuit}</p>
                                <input type="number" value={edit.descuento_1}
                                  onChange={e => setEdicionFila(m.id, item, 'descuento_1', e.target.value)}
                                  placeholder="D1 %"
                                  className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                                <input type="number" value={edit.descuento_2}
                                  onChange={e => setEdicionFila(m.id, item, 'descuento_2', e.target.value)}
                                  placeholder="D2 %"
                                  className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                                <input type="number" value={edit.descuento_3}
                                  onChange={e => setEdicionFila(m.id, item, 'descuento_3', e.target.value)}
                                  placeholder="D3 %"
                                  className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                                <button onClick={() => guardarDescuentoExistente(m.id, m.codigo, item)}
                                  disabled={guardandoDescuento === key}
                                  className="bg-orange-100 hover:bg-orange-200 text-orange-700 rounded px-2 py-1 text-xs font-semibold disabled:opacity-50">
                                  {guardandoDescuento === key ? '...' : 'Guardar'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* EXPANDIDO — CLIENTES REGISTRADOS */}
                  {expandidoId === m.id && expandidoTab === 'clientes' && (
                    <div className="p-4 border-t border-teal-100 bg-white space-y-3">
                      <p className="text-sm font-semibold text-teal-700 mb-2">👥 Clientes registrados — {m.nombre}</p>
                      {cargandoClientes === m.id ? (
                        <p className="text-sm text-gray-400 text-center py-4">Cargando...</p>
                      ) : (clientesPorMayorista[m.id] || []).length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">Todavía no hay clientes registrados con clave</p>
                      ) : (
                        <div className="space-y-1.5">
                          {(clientesPorMayorista[m.id] || []).map(c => (
                            <div key={c.cuit} className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                              <div>
                                <p className="text-sm font-mono text-gray-700">{c.cuit}</p>
                                <p className="text-xs text-gray-400">
                                  Registrado: {c.creada_en ? new Date(c.creada_en).toLocaleDateString('es-AR') : '—'}
                                </p>
                              </div>
                              <button onClick={() => setConfirmarEliminarCliente({ mayoristaId: m.id, codigo: m.codigo, cuit: c.cuit })}
                                className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1 rounded-lg font-medium">
                                🗑️ Eliminar
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* EXPANDIDO — PAGOS */}
                  {expandidoId === m.id && expandidoTab === 'pagos' && pagoForms[m.id] && (
                    <div className="p-4 border-t border-green-100 bg-white space-y-4">
                      <p className="text-sm font-semibold text-green-700 mb-2">💰 Registro de pagos — {m.nombre}</p>

                      <div className="bg-green-50 rounded-lg p-3">
                        <p className="text-xs font-medium text-green-700 mb-2">División de la facturación</p>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <label className="text-xs text-gray-600">% Ivan</label>
                            <input type="number" min="0" max="100" value={divisionPct.ivan}
                              onChange={e => {
                                const v = parseInt(e.target.value) || 0;
                                setDivisionPct({ ivan: v, roberto: 100 - v });
                              }}
                              className="w-16 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                          </div>
                          <div className="flex items-center gap-1">
                            <label className="text-xs text-gray-600">% Roberto</label>
                            <input type="number" min="0" max="100" value={divisionPct.roberto}
                              onChange={e => {
                                const v = parseInt(e.target.value) || 0;
                                setDivisionPct({ roberto: v, ivan: 100 - v });
                              }}
                              className="w-16 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs text-gray-600 block mb-1">Tipo</label>
                          <select value={pagoForms[m.id].tipo}
                            onChange={e => setPagoField(m.id, 'tipo', e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                            <option value="implementacion">Implementación</option>
                            <option value="mantenimiento">Mantenimiento</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-600 block mb-1">Monto total</label>
                          <input type="number" min="0" value={pagoForms[m.id].monto_total}
                            onChange={e => setPagoField(m.id, 'monto_total', e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600 block mb-1">Estado</label>
                          <select value={pagoForms[m.id].estado}
                            onChange={e => setPagoField(m.id, 'estado', e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                            <option value="pendiente">Pendiente</option>
                            <option value="pagado">Pagado</option>
                            <option value="vencido">Vencido</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-600 block mb-1">Fecha de pago</label>
                          <input type="date" value={pagoForms[m.id].fecha_pago}
                            onChange={e => setPagoField(m.id, 'fecha_pago', e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600 block mb-1">Fecha de vencimiento</label>
                          <input type="date" value={pagoForms[m.id].fecha_vencimiento}
                            onChange={e => setPagoField(m.id, 'fecha_vencimiento', e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                        </div>
                      </div>
                      <button onClick={() => agregarPago(m.id)}
                        className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-semibold">
                        Registrar pago
                      </button>

                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
                        ⚠️ Estos pagos se guardan solo en memoria (se pierden al recargar la página) — todavía no hay tabla en Supabase para persistirlos.
                      </p>

                      <hr />
                      {(pagosPorMayorista[m.id] || []).length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-3">Sin pagos registrados</p>
                      ) : (
                        <div className="space-y-2">
                          {(pagosPorMayorista[m.id] || []).map(p => {
                            const dias = diasParaVencer(p.fecha_vencimiento);
                            const proximoAVencer = p.estado !== 'pagado' && dias >= 0 && dias <= 30;
                            const montoIvan = Math.round(p.monto_total * (divisionPct.ivan / 100) * 100) / 100;
                            const montoRoberto = Math.round(p.monto_total * (divisionPct.roberto / 100) * 100) / 100;
                            return (
                              <div key={p.id} className={`rounded-lg p-3 border ${colorEstadoPago(p.estado)}`}>
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-semibold">
                                    {p.tipo === 'implementacion' ? 'Implementación' : 'Mantenimiento'} — ${p.monto_total.toLocaleString('es-AR')}
                                  </p>
                                  <button onClick={() => eliminarPago(m.id, p.id)} className="text-xs opacity-60 hover:opacity-100">🗑️</button>
                                </div>
                                <p className="text-xs mt-1">
                                  Pagado: {p.fecha_pago || '—'} · Vence: {p.fecha_vencimiento} · Estado: {p.estado}
                                </p>
                                <p className="text-xs mt-0.5">Ivan: ${montoIvan.toLocaleString('es-AR')} · Roberto: ${montoRoberto.toLocaleString('es-AR')}</p>
                                {proximoAVencer && (
                                  <p className="text-xs font-semibold mt-1">⚠️ Vence en {dias} día(s)</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* EXPANDIDO — ANALYTICS */}
                  {expandidoId === m.id && expandidoTab === 'analytics' && (
                    <div className="p-4 border-t border-indigo-100 bg-white space-y-4">
                      <p className="text-sm font-semibold text-indigo-700 mb-2">📊 Uso del sistema — {m.nombre}</p>
                      {cargandoAnalytics === m.id ? (
                        <p className="text-sm text-gray-400 text-center py-4">Cargando...</p>
                      ) : analyticsPorMayorista[m.id] ? (
                        <>
                          {(() => {
                            const a = analyticsPorMayorista[m.id];
                            const ind = indicadorActividad(a.ultimo_pedido);
                            return (
                              <>
                                <div className="bg-indigo-50 rounded-lg p-3 flex items-center gap-2">
                                  <span className="text-xl">{ind.emoji}</span>
                                  <p className="text-sm text-indigo-700 font-medium">{ind.label}</p>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                  <div className="bg-gray-50 rounded-lg p-3">
                                    <p className="text-xs text-gray-500">Pedidos históricos</p>
                                    <p className="text-2xl font-bold text-gray-800">{a.total_pedidos}</p>
                                  </div>
                                  <div className="bg-gray-50 rounded-lg p-3">
                                    <p className="text-xs text-gray-500">Pedidos este mes</p>
                                    <p className="text-2xl font-bold text-blue-600">{a.pedidos_este_mes}</p>
                                  </div>
                                  <div className="bg-gray-50 rounded-lg p-3">
                                    <p className="text-xs text-gray-500">Pedidos mes pasado</p>
                                    <p className="text-2xl font-bold text-gray-600">{a.pedidos_mes_pasado}</p>
                                  </div>
                                  <div className="bg-gray-50 rounded-lg p-3">
                                    <p className="text-xs text-gray-500">Clientes registrados</p>
                                    <p className="text-2xl font-bold text-teal-600">{a.total_clientes}</p>
                                  </div>
                                  <div className="bg-gray-50 rounded-lg p-3">
                                    <p className="text-xs text-gray-500">Búsquedas sin resultado (mes)</p>
                                    <p className="text-2xl font-bold text-orange-600">{a.demanda_este_mes}</p>
                                  </div>
                                  <div className="bg-gray-50 rounded-lg p-3">
                                    <p className="text-xs text-gray-500">Último pedido</p>
                                    <p className="text-sm font-bold text-gray-800 mt-1.5">
                                      {a.ultimo_pedido ? new Date(a.ultimo_pedido).toLocaleDateString('es-AR') : 'Sin pedidos'}
                                    </p>
                                  </div>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-3">
                                  <p className="text-xs text-gray-500">Producto más pedido históricamente</p>
                                  <p className="text-sm font-bold text-gray-800 mt-1">
                                    {a.producto_mas_pedido ? `${a.producto_mas_pedido} (${a.producto_mas_pedido_cantidad} unidades)` : 'Sin datos'}
                                  </p>
                                </div>
                              </>
                            );
                          })()}
                        </>
                      ) : (
                        <p className="text-sm text-gray-400 text-center py-4">Sin datos</p>
                      )}
                    </div>
                  )}

                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-4">
            🔒 Config OFF = el mayorista ve la config bloqueada · Config ON = puede modificarla él mismo
          </p>
        </div>

      </div>

      {/* MODAL — REGENERAR CÓDIGO (doble confirmación) */}
      {regenerarModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[70] flex items-center justify-center p-4" onClick={cerrarRegenerar}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            {regenerarModal.paso === 1 ? (
              <>
                <p className="text-lg font-bold text-gray-800 mb-2">¿Estás seguro?</p>
                <p className="text-sm text-gray-600 mb-4">
                  Todos los clientes perderán acceso con el link anterior. Vas a tener que reenviarles el link nuevo manualmente.
                </p>
                <div className="flex gap-2">
                  <button onClick={cerrarRegenerar} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200">
                    Cancelar
                  </button>
                  <button onClick={avanzarRegenerar} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-medium text-sm hover:bg-red-700">
                    Continuar
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-gray-800 mb-2">Confirmación final</p>
                <p className="text-sm text-gray-600 mb-3">Escribí <strong>CONFIRMAR</strong> para regenerar el código.</p>
                <input type="text" value={regenerarModal.texto}
                  onChange={e => setRegenerarModal({ ...regenerarModal, texto: e.target.value })}
                  placeholder="CONFIRMAR"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-500" />
                <div className="flex gap-2">
                  <button onClick={cerrarRegenerar} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200">
                    Cancelar
                  </button>
                  <button onClick={ejecutarRegenerar} disabled={regenerarModal.texto !== 'CONFIRMAR' || regenerando}
                    className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-medium text-sm hover:bg-red-700 disabled:opacity-50">
                    {regenerando ? 'Regenerando...' : 'Regenerar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL — LIMPIAR PARA PRODUCCIÓN (doble confirmación) */}
      {limpiarModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[70] flex items-center justify-center p-4" onClick={cerrarLimpiar}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            {resumenLimpieza ? (
              <>
                <p className="text-lg font-bold text-gray-800 mb-2">✅ Limpieza completada</p>
                <div className="text-sm text-gray-700 bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
                  <p>Limpieza completada:</p>
                  <p>- {resumenLimpieza.pedidos} pedidos eliminados</p>
                  <p>- {resumenLimpieza.clientes} clientes eliminados</p>
                  <p>- {resumenLimpieza.demanda} búsquedas eliminadas</p>
                  <p>- {resumenLimpieza.consultas} consultas eliminadas</p>
                </div>
                <button onClick={cerrarLimpiar}
                  className="mt-4 w-full bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-semibold hover:bg-gray-200">
                  Cerrar
                </button>
              </>
            ) : limpiarModal.paso === 1 ? (
              <>
                <p className="text-lg font-bold text-gray-800 mb-2">⚠️ Atención</p>
                <p className="text-sm text-gray-600 mb-4">
                  ⚠️ ATENCIÓN: Esto borrará TODOS los datos de prueba de <strong>{limpiarModal.nombre}</strong>:
                  <br />- Todos sus pedidos
                  <br />- Todos sus clientes registrados
                  <br />- Toda su demanda no satisfecha
                  <br />- Consultas de ofertas
                  <br /><br />
                  La conexión Ivan, el link y la configuración NO se modifican.
                </p>
                <div className="flex gap-2">
                  <button onClick={cerrarLimpiar} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200">
                    Cancelar
                  </button>
                  <button onClick={avanzarLimpiar} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-medium text-sm hover:bg-red-700">
                    Entiendo, continuar
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-gray-800 mb-2">Confirmación final</p>
                <p className="text-sm text-gray-600 mb-3">
                  Escribí exactamente <strong>{limpiarModal.nombre}</strong> para confirmar.
                </p>
                <input type="text" value={limpiarModal.texto}
                  onChange={e => setLimpiarModal({ ...limpiarModal, texto: e.target.value })}
                  placeholder={limpiarModal.nombre}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-red-500" />
                {errorLimpiar && <p className="text-red-500 text-sm mb-2">{errorLimpiar}</p>}
                <div className="flex gap-2 mt-2">
                  <button onClick={cerrarLimpiar} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200">
                    Cancelar
                  </button>
                  <button onClick={ejecutarLimpiar} disabled={limpiarModal.texto !== limpiarModal.nombre || limpiando}
                    className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-medium text-sm hover:bg-red-700 disabled:opacity-50">
                    {limpiando ? 'Limpiando...' : 'Limpiar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL — ELIMINAR CLIENTE */}
      {confirmarEliminarCliente && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[70] flex items-center justify-center p-4"
          onClick={() => setConfirmarEliminarCliente(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <p className="text-lg font-bold text-gray-800 mb-2">¿Eliminar cliente?</p>
            <p className="text-sm text-gray-600 mb-4">
              ¿Eliminar el acceso de CUIT <strong>{confirmarEliminarCliente.cuit}</strong>? Esto borra solo su clave — no toca Ivan ni pedidos existentes.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmarEliminarCliente(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200">
                Cancelar
              </button>
              <button
                onClick={() => eliminarCliente(confirmarEliminarCliente.mayoristaId, confirmarEliminarCliente.codigo, confirmarEliminarCliente.cuit)}
                disabled={eliminandoCliente === `${confirmarEliminarCliente.mayoristaId}-${confirmarEliminarCliente.cuit}`}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-medium text-sm hover:bg-red-700 disabled:opacity-50">
                {eliminandoCliente === `${confirmarEliminarCliente.mayoristaId}-${confirmarEliminarCliente.cuit}` ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL — CLONAR MAYORISTA */}
      {clonarAbierto && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[70] flex items-center justify-center p-4"
          onClick={() => setClonarAbierto(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <p className="text-lg font-bold text-gray-800 mb-1">🧬 Clonar {clonarAbierto.nombre}</p>
            <p className="text-xs text-gray-400 mb-4">Útil para pasar de un ambiente de prueba a producción limpio.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Nombre</label>
                <input type="text" value={clonForm.nombre}
                  onChange={e => setClonForm(prev => ({ ...prev, nombre: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Email (obligatorio, distinto al original)</label>
                <input type="email" value={clonForm.email}
                  onChange={e => setClonForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Código (obligatorio, distinto al original)</label>
                <input type="text" value={clonForm.codigo}
                  onChange={e => setClonForm(prev => ({ ...prev, codigo: e.target.value.toLowerCase().replace(/\s/g, '_') }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Cadena de conexión (copiada del original, editable)</label>
                <input type="text" value={clonForm.db_connection}
                  onChange={e => setClonForm(prev => ({ ...prev, db_connection: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Clave inicial</label>
                <input type="text" value={clonForm.clave_inicial}
                  onChange={e => setClonForm(prev => ({ ...prev, clave_inicial: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            {clonError && <p className="text-red-500 text-sm mt-3">{clonError}</p>}
            {clonResultado ? (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-700 font-semibold">✅ {clonResultado.nombre} creado</p>
                <p className="text-sm text-green-600 mt-1">Link del cliente: <strong>{clonResultado.link}</strong></p>
                <button onClick={() => setClonarAbierto(null)}
                  className="mt-3 w-full bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-semibold hover:bg-gray-200">
                  Cerrar
                </button>
              </div>
            ) : (
              <div className="flex gap-2 mt-4">
                <button onClick={() => setClonarAbierto(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200">
                  Cancelar
                </button>
                <button onClick={crearClon} disabled={clonando}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 disabled:opacity-50">
                  {clonando ? 'Creando...' : 'Crear clon'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Admin;
