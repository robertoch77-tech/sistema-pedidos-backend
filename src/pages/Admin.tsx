import React, { useState, useEffect } from 'react';

const API = 'https://sistema-pedidos-backend-2hec.onrender.com';

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

interface Mayorista {
  id: number; nombre: string; email: string; codigo: string;
  activo: boolean; config_habilitada: boolean; db_connection?: string;
  ivan_activo?: boolean; habilitar_ctas_ctes?: boolean; razon_social?: string;
  habilitar_demanda?: boolean; habilitar_ofertas?: boolean;
  habilitar_productos_solicitados?: boolean; // === NUEVO ===
}
interface ConfigForm {
  mostrar_precios: boolean; mostrar_stock: boolean; mostrar_marca: boolean;
  mostrar_rubro: boolean; mostrar_tipo: boolean; pedir_clave: boolean;
  tamanio_hoja: string; items_por_hoja: number; numero_pedido_inicio: number;
  orden_pdf: string; habilitar_calculadora: boolean;
  descuento_1: number; descuento_2: number; descuento_3: number; iva: number;
  habilitar_ctas_ctes: boolean; habilitar_demanda: boolean; habilitar_ofertas: boolean;
  habilitar_productos_solicitados: boolean; // === NUEVO ===
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
const defaultConfig: ConfigForm = {
  mostrar_precios: true, mostrar_stock: true, mostrar_marca: true,
  mostrar_rubro: true, mostrar_tipo: true, pedir_clave: false,
  tamanio_hoja: 'A4', items_por_hoja: 30, numero_pedido_inicio: 1,
  orden_pdf: 'codigo', habilitar_calculadora: false,
  descuento_1: 0, descuento_2: 0, descuento_3: 0, iva: 21,
  habilitar_ctas_ctes: false, habilitar_demanda: false, habilitar_ofertas: false,
  habilitar_productos_solicitados: false, // === NUEVO ===
};
const defaultIvan: IvanForm = {
  ivan_activo: false, ivan_id_deposito: 1, ivan_id_operario: '',
  ivan_id_vendedor: '', ivan_id_tipo_pedido: 1, ivan_id_sucursal: 1, ivan_porc_iva: 21,
  ivan_id_condicion_venta: '',
};

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
  const [expandidoTab, setExpandidoTab] = useState<'datos' | 'config' | 'ivan'>('datos');
  const [editForms, setEditForms] = useState<Record<number, { nombre: string; email: string; db_connection: string; razon_social: string }>>({});
  const [configForms, setConfigForms] = useState<Record<number, ConfigForm>>({});
  const [ivanForms, setIvanForms] = useState<Record<number, IvanForm>>({});
  const [guardandoDatos, setGuardandoDatos] = useState<number | null>(null);
  const [guardandoConfig, setGuardandoConfig] = useState<number | null>(null);
  const [guardandoIvan, setGuardandoIvan] = useState<number | null>(null);
  const [msgDatos, setMsgDatos] = useState<Record<number, string>>({});
  const [msgConfig, setMsgConfig] = useState<Record<number, string>>({});
  const [msgIvan, setMsgIvan] = useState<Record<number, string>>({});

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

  const expandir = async (id: number, tab: 'datos' | 'config' | 'ivan') => {
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
        habilitar_productos_solicitados: configForms[id].habilitar_productos_solicitados // === NUEVO ===
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
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

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

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm px-6 py-3 flex items-center gap-3">
        <Logo size={28} />
        <div>
          <p className="text-xs text-gray-400">Gestión Integral Pedidos</p>
          <h1 className="text-base font-bold text-blue-600">Panel Admin</h1>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto p-6 space-y-6">

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

          {mayoristas.length === 0 ? (
            <p className="text-gray-400 text-center py-6">No hay mayoristas cargados</p>
          ) : (
            <div className="space-y-2">
              {mayoristas.map(m => (
                <div key={m.id} className="border border-gray-100 rounded-xl overflow-hidden">

                  {/* FILA PRINCIPAL */}
                  <div className="flex items-center justify-between p-3 bg-gray-50">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-800">{m.nombre}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {m.email} · <span className="font-mono">?m={m.codigo}</span>
                        {m.ivan_activo && <span className="ml-2 text-purple-600 font-semibold">· Ivan ✓</span>}
                        {m.habilitar_ctas_ctes && <span className="ml-2 text-teal-600 font-semibold">· Ctas ✓</span>}
                        {m.habilitar_demanda && <span className="ml-2 text-blue-600 font-semibold">· Demanda ✓</span>}
                        {m.habilitar_ofertas && <span className="ml-2 text-orange-600 font-semibold">· Ofertas ✓</span>}
                        {m.habilitar_productos_solicitados && <span className="ml-2 text-pink-600 font-semibold">· Prod.Solicitados ✓</span>} {/* === NUEVO === */}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <button onClick={() => expandir(m.id, 'datos')}
                        className={`text-xs px-2.5 py-1.5 rounded-lg font-medium border transition-colors ${
                          expandidoId === m.id && expandidoTab === 'datos'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
                        }`}>✏️ Editar</button>
                      <button onClick={() => expandir(m.id, 'config')}
                        className={`text-xs px-2.5 py-1.5 rounded-lg font-medium border transition-colors ${
                          expandidoId === m.id && expandidoTab === 'config'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
                        }`}>⚙️ Config</button>
                      <button onClick={() => expandir(m.id, 'ivan')}
                        className={`text-xs px-2.5 py-1.5 rounded-lg font-medium border transition-colors ${
                          expandidoId === m.id && expandidoTab === 'ivan'
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-purple-400'
                        }`}>🔗 Ivan</button>
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

                  {/* EXPANDIDO — EDITAR DATOS */}
                  {expandidoId === m.id && expandidoTab === 'datos' && editForms[m.id] && (
                    <div className="p-4 border-t border-gray-100 bg-white space-y-3">
                      <p className="text-sm font-semibold text-gray-600 mb-2">✏️ Editar datos</p>
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
                      {/* === NUEVO: switch Productos más/menos solicitados === */}
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
                    </div>
                  )}

                  {/* EXPANDIDO — IVAN */}
                  {expandidoId === m.id && expandidoTab === 'ivan' && ivanForms[m.id] && (
                    <div className="p-4 border-t border-purple-100 bg-white space-y-4">
                      <p className="text-sm font-semibold text-purple-700 mb-2">🔗 Integración Ivan — {m.nombre}</p>
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

                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-4">
            🔒 Config OFF = el mayorista ve la config bloqueada · Config ON = puede modificarla él mismo
          </p>
        </div>

      </div>
    </div>
  );
}

export default Admin;