import React, { useState, useEffect } from 'react';
import Productos from './Productos';
import Clientes from './Clientes';
import Configuracion from './Configuracion';
import Pedidos from './Pedidos';
import DemandaNoSatisfecha from './DemandaNoSatisfecha';
import Ofertas from './Ofertas';
import ProductosSolicitados from './ProductosSolicitados'; // === NUEVO ===

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

// === NUEVO: gestión de banners para el mayorista (mismo patrón que Ofertas) ===

interface Banner {
  id: number;
  mayorista_id: number;
  imagen_url: string;
  titulo: string | null;
  descripcion: string | null;
  link_destino: string | null;
  orden: number;
  activo: boolean;
  fecha_inicio: string | null;
  fecha_fin: string | null;
}

interface ProductoBusquedaBanner {
  id_producto: number;
  cod_producto: string;
  des_producto: string;
  imagen_producto: string;
}

const emptyBannerForm = {
  imagen_url: '',
  titulo: '',
  descripcion: '',
  link_destino: '',
  orden: '0',
  activo: true,
  fecha_inicio: '',
  fecha_fin: '',
};

const arreglarNombreBanner = (txt?: string) => (txt || '').replace(/�/g, 'Ñ');

function Banners() {
  const mayorista = JSON.parse(localStorage.getItem('mayorista') || '{}');

  const [banners, setBanners] = useState<Banner[]>([]);
  const [cargando, setCargando] = useState(false);
  const [vista, setVista] = useState<'lista' | 'form'>('lista');
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyBannerForm });
  const [origenImagen, setOrigenImagen] = useState<'ivan' | 'url'>('ivan');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [previewRota, setPreviewRota] = useState(false);

  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [resultadosProducto, setResultadosProducto] = useState<ProductoBusquedaBanner[]>([]);
  const [buscandoProducto, setBuscandoProducto] = useState(false);

  useEffect(() => { cargarBanners(); /* eslint-disable-next-line */ }, []);

  const cargarBanners = async () => {
    setCargando(true);
    try {
      const res = await fetch(`${API}/api/banners/${mayorista.id}`);
      const data = await res.json();
      setBanners(Array.isArray(data) ? data : []);
    } catch {} finally { setCargando(false); }
  };

  useEffect(() => {
    if (busquedaProducto.trim().length < 3) { setResultadosProducto([]); return; }
    const timer = setTimeout(async () => {
      setBuscandoProducto(true);
      try {
        const res = await fetch(`${API}/api/productos/${mayorista.id}?busqueda=${encodeURIComponent(busquedaProducto.trim())}&pagina=1`);
        const data = await res.json();
        setResultadosProducto(data.productos || []);
      } catch {} finally { setBuscandoProducto(false); }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line
  }, [busquedaProducto]);

  const abrirNuevo = () => {
    setForm({ ...emptyBannerForm });
    setEditandoId(null);
    setOrigenImagen('ivan');
    setError('');
    setPreviewRota(false);
    setBusquedaProducto(''); setResultadosProducto([]);
    setVista('form');
  };

  const abrirEditar = (b: Banner) => {
    setForm({
      imagen_url: b.imagen_url,
      titulo: b.titulo || '',
      descripcion: b.descripcion || '',
      link_destino: b.link_destino || '',
      orden: String(b.orden ?? 0),
      activo: b.activo,
      fecha_inicio: b.fecha_inicio ? b.fecha_inicio.substring(0, 10) : '',
      fecha_fin: b.fecha_fin ? b.fecha_fin.substring(0, 10) : '',
    });
    setEditandoId(b.id);
    setOrigenImagen('url');
    setError('');
    setPreviewRota(false);
    setBusquedaProducto(''); setResultadosProducto([]);
    setVista('form');
  };

  const seleccionarProducto = (p: ProductoBusquedaBanner) => {
    if (!p.imagen_producto) { setError('Ese producto no tiene imagen cargada en Ivan'); return; }
    setError('');
    setPreviewRota(false);
    setForm(prev => ({ ...prev, imagen_url: p.imagen_producto }));
    setBusquedaProducto(''); setResultadosProducto([]);
  };

  const guardar = async () => {
    setError('');
    if (!form.imagen_url.trim()) { setError('Elegí una imagen de Ivan o pegá una URL'); return; }
    const body = {
      mayorista_id: mayorista.id,
      imagen_url: form.imagen_url.trim(),
      titulo: form.titulo.trim() || null,
      descripcion: form.descripcion.trim() || null,
      link_destino: form.link_destino.trim() || null,
      orden: parseInt(form.orden) || 0,
      activo: form.activo,
      fecha_inicio: form.fecha_inicio || null,
      fecha_fin: form.fecha_fin || null,
    };
    setGuardando(true);
    try {
      const url = editandoId ? `${API}/api/banners/${editandoId}` : `${API}/api/banners`;
      const method = editandoId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('Error al guardar');
      setVista('lista');
      cargarBanners();
    } catch {
      setError('Error al guardar el banner');
    } finally { setGuardando(false); }
  };

  const toggleBanner = async (id: number) => {
    try {
      await fetch(`${API}/api/banners/${id}/toggle`, { method: 'PUT' });
      setBanners(prev => prev.map(b => b.id === id ? { ...b, activo: !b.activo } : b));
    } catch {}
  };

  const eliminarBanner = async (id: number) => {
    if (!window.confirm('¿Eliminar este banner?')) return;
    try {
      await fetch(`${API}/api/banners/${id}`, { method: 'DELETE' });
      setBanners(prev => prev.filter(b => b.id !== id));
    } catch {}
  };

  const vigencia = (b: Banner) => {
    const hoy = new Date().toISOString().substring(0, 10);
    if (b.fecha_inicio && hoy < b.fecha_inicio.substring(0, 10)) return 'Programado';
    if (b.fecha_fin && hoy > b.fecha_fin.substring(0, 10)) return 'Vencido';
    return 'Vigente';
  };

  const proxyImg = (url: string) => `${API}/api/imagen?url=${encodeURIComponent(url)}`;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">🖼️ Banners</h2>
      </div>

      {vista === 'lista' && (
        <>
          <button onClick={abrirNuevo}
            className="mb-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
            + Nuevo banner
          </button>

          {cargando ? (
            <div className="text-center py-12 text-gray-400">Cargando...</div>
          ) : banners.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No hay banners creados todavía</div>
          ) : (
            <div className="space-y-3">
              {banners.map(b => (
                <div key={b.id} className="bg-white rounded-xl shadow-sm p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-32 h-20 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
                      <img src={proxyImg(b.imagen_url)} alt={b.titulo || 'Banner'}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800">{b.titulo || <span className="text-gray-400 italic">Sin título</span>}</p>
                      {b.descripcion && <p className="text-sm text-gray-600 mt-0.5">{b.descripcion}</p>}
                      <p className="text-xs text-gray-400 mt-1">
                        Orden: {b.orden}
                        {b.link_destino && <> · Link: {b.link_destino}</>}
                        {(b.fecha_inicio || b.fecha_fin) && (
                          <> · Vigencia: {b.fecha_inicio ? b.fecha_inicio.substring(0, 10) : '...'} a {b.fecha_fin ? b.fecha_fin.substring(0, 10) : '...'}</>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                        !b.activo ? 'bg-gray-100 text-gray-500' :
                        vigencia(b) === 'Vigente' ? 'bg-green-100 text-green-700' :
                        vigencia(b) === 'Vencido' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {!b.activo ? 'Inactivo' : vigencia(b)}
                      </span>
                      <div className="flex gap-2">
                        <button onClick={() => abrirEditar(b)} className="text-xs text-blue-600 hover:underline">Editar</button>
                        <button onClick={() => toggleBanner(b.id)} className="text-xs text-gray-600 hover:underline">
                          {b.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        <button onClick={() => eliminarBanner(b.id)} className="text-xs text-red-500 hover:underline">Eliminar</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {vista === 'form' && (
        <div className="bg-white rounded-xl shadow-sm p-6 max-w-2xl">
          <h3 className="text-lg font-bold text-gray-800 mb-4">{editandoId ? 'Editar banner' : 'Nuevo banner'}</h3>

          {/* ORIGEN DE LA IMAGEN */}
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 block mb-2">Imagen del banner</label>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setOrigenImagen('ivan')}
                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium ${
                  origenImagen === 'ivan' ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-600'
                }`}>📦 Imagen de un producto</button>
              <button onClick={() => setOrigenImagen('url')}
                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium ${
                  origenImagen === 'url' ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-600'
                }`}>🔗 URL externa</button>
            </div>

            {origenImagen === 'ivan' && (
              <div>
                <input type="text" placeholder="Buscar producto por código o descripción (mín. 3 caracteres)"
                  value={busquedaProducto} onChange={e => setBusquedaProducto(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {buscandoProducto && <p className="text-xs text-gray-400 mt-1">Buscando...</p>}
                {resultadosProducto.length > 0 && (
                  <div className="mt-2 border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                    {resultadosProducto.map(p => (
                      <button key={p.id_producto} onClick={() => seleccionarProducto(p)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-center gap-2">
                        {p.imagen_producto ? (
                          <img src={proxyImg(p.imagen_producto)} alt=""
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            className="w-8 h-8 object-contain flex-shrink-0" />
                        ) : <span className="w-8 h-8 flex-shrink-0 text-gray-300 text-xs flex items-center justify-center">—</span>}
                        <span className="truncate">{arreglarNombreBanner(p.des_producto)} <span className="text-gray-400 font-mono text-xs">({p.cod_producto})</span></span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {origenImagen === 'url' && (
              <input type="text" placeholder="https://ejemplo.com/imagen.jpg"
                value={form.imagen_url}
                onChange={e => { setForm(prev => ({ ...prev, imagen_url: e.target.value })); setPreviewRota(false); }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
            )}

            {/* PREVIEW SIEMPRE VISIBLE */}
            <div className="mt-3 h-36 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
              {form.imagen_url.trim() && !previewRota ? (
                <img src={proxyImg(form.imagen_url.trim())} alt="Preview del banner"
                  onError={() => setPreviewRota(true)}
                  className="w-full h-full object-cover" />
              ) : (
                <p className="text-sm text-gray-400">
                  {previewRota ? 'No se pudo cargar la imagen' : 'Sin imagen seleccionada'}
                </p>
              )}
            </div>
          </div>

          {/* CAMPOS COMUNES */}
          <div className="space-y-3 mb-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Título (opcional)</label>
              <input type="text" value={form.titulo}
                onChange={e => setForm(prev => ({ ...prev, titulo: e.target.value }))}
                placeholder="Ej: Ofertas de invierno"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Descripción (opcional)</label>
              <textarea value={form.descripcion}
                onChange={e => setForm(prev => ({ ...prev, descripcion: e.target.value }))}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Link destino (opcional)</label>
              <input type="text" value={form.link_destino}
                onChange={e => setForm(prev => ({ ...prev, link_destino: e.target.value }))}
                placeholder="Ej: /catalogo"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-gray-400 mt-1">A qué sección lleva el banner al hacerle clic (ej: /catalogo, /mis-precios)</p>
            </div>
            <div className="flex items-center gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Orden</label>
                <input type="number" value={form.orden}
                  onChange={e => setForm(prev => ({ ...prev, orden: e.target.value }))}
                  className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex items-center gap-2 mt-5">
                <button onClick={() => setForm(prev => ({ ...prev, activo: !prev.activo }))}
                  className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 ${form.activo ? 'bg-blue-600' : 'bg-gray-300'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${form.activo ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
                <span className="text-sm text-gray-700">{form.activo ? 'Activo' : 'Inactivo'}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Fecha inicio (opcional)</label>
                <input type="date" value={form.fecha_inicio}
                  onChange={e => setForm(prev => ({ ...prev, fecha_inicio: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Fecha fin (opcional)</label>
                <input type="date" value={form.fecha_fin}
                  onChange={e => setForm(prev => ({ ...prev, fecha_fin: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

          <div className="flex gap-3">
            <button onClick={() => setVista('lista')}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-sm font-semibold">
              Cancelar
            </button>
            <button onClick={guardar} disabled={guardando}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
              {guardando ? 'Guardando...' : 'Guardar banner'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Dashboard() {
  const mayorista = JSON.parse(localStorage.getItem('mayorista') || '{}');
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [paginaActual, setPaginaActual] = useState('dashboard');
  const [pedidosNuevos, setPedidosNuevos] = useState(0);
  const [stats, setStats] = useState({
    pedidos_hoy: 0, total_productos: 0, total_clientes: 0, pedidos_pendientes: 0
  });
  const [pedidosSinImprimir, setPedidosSinImprimir] = useState<any[]>([]);
  const [subseccionLabel, setSubseccionLabel] = useState('');
  // === NUEVO: el flag habilitar_banners no viene en el login ni en /configuracion,
  // se consulta al endpoint propio de banners ===
  const [bannersHabilitado, setBannersHabilitado] = useState(false);

  useEffect(() => {
    if (paginaActual === 'dashboard') cargarStats();
  }, [paginaActual]);

  useEffect(() => {
    if (!mayorista.id) return;
    fetch(`${API}/api/banners/habilitado/${mayorista.id}`)
      .then(r => r.json())
      .then(data => setBannersHabilitado(data.habilitado === true))
      .catch(() => {});
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    const fetchNuevos = async () => {
      try {
        const res = await fetch(`${API}/api/pedidos/${mayorista.id}/nuevos`);
        const data = await res.json();
        setPedidosNuevos(data.cantidad || 0);
      } catch {}
    };
    fetchNuevos();
    const interval = setInterval(fetchNuevos, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    document.title = pedidosNuevos > 0
      ? `(${pedidosNuevos}) Pedidos sin imprimir — Gestión Integral`
      : 'Gestión Integral Pedidos';
  }, [pedidosNuevos]);

  const cargarStats = async () => {
    try {
      const res = await fetch(`${API}/api/mayoristas/${mayorista.id}/stats`);
      const data = await res.json();
      setStats(data.stats);
      setPedidosSinImprimir(data.ultimos_pedidos || []);
    } catch (error) { console.error(error); }
  };

  const cerrarSesion = () => {
    localStorage.removeItem('mayorista');
    window.location.href = '/login';
  };

  const labelMap: Record<string, string> = {
    productos: 'Productos', clientes: 'Clientes', pedidos: 'Pedidos',
    demanda: 'Demanda', ofertas: 'Ofertas',
    'productos-solicitados': 'Más/Menos solicitados', configuracion: 'Configuración',
  };

  const navegar = (key: string) => { setPaginaActual(key); setSubseccionLabel(''); setMenuAbierto(false); };

  const menuItems = [
    { icon: '🏠', label: 'Inicio',        key: 'dashboard' },
    { icon: '📦', label: 'Productos',      key: 'productos' },
    { icon: '👥', label: 'Clientes',       key: 'clientes' },
    { icon: '📋', label: 'Pedidos',        key: 'pedidos', badge: pedidosNuevos },
    ...(mayorista.habilitar_demanda ? [{ icon: '📊', label: 'Demanda', key: 'demanda' }] : []),
    ...(mayorista.habilitar_ofertas ? [{ icon: '🎁', label: 'Ofertas', key: 'ofertas' }] : []),
    // === NUEVO ===
    ...(mayorista.habilitar_productos_solicitados ? [{ icon: '📈', label: 'Más/Menos solicitados', key: 'productos-solicitados' }] : []),
    // === NUEVO ===
    ...(bannersHabilitado ? [{ icon: '🖼️', label: 'Banners', key: 'banners' }] : []),
    { icon: '⚙️', label: 'Configuración',  key: 'configuracion' },
  ];

  const renderPagina = () => {
    switch(paginaActual) {
      case 'productos':     return <Productos />;
      case 'clientes':      return <Clientes />;
      case 'configuracion': return <Configuracion />;
      case 'pedidos':       return <Pedidos />;
      case 'demanda':       return <DemandaNoSatisfecha />;
      case 'ofertas':       return <Ofertas />;
      case 'productos-solicitados': return <ProductosSolicitados />; // === NUEVO ===
      case 'banners':       return <Banners />; // === NUEVO ===
      default: return (
        <main className="flex-1 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm p-5">
              <p className="text-gray-500 text-sm">Pedidos hoy</p>
              <p className="text-3xl font-bold text-blue-600 mt-1">{stats.pedidos_hoy}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-5">
              <p className="text-gray-500 text-sm">Productos</p>
              <p className="text-3xl font-bold text-green-600 mt-1">{stats.total_productos.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-5">
              <p className="text-gray-500 text-sm">Clientes</p>
              <p className="text-3xl font-bold text-purple-600 mt-1">{stats.total_clientes.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-5">
              <p className="text-gray-500 text-sm">Sin imprimir</p>
              <p className="text-3xl font-bold text-orange-500 mt-1">{stats.pedidos_pendientes}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Pedidos sin imprimir</h2>
              {pedidosSinImprimir.length > 0 && (
                <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                  {pedidosSinImprimir.length}
                </span>
              )}
            </div>
            {pedidosSinImprimir.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-4xl mb-2">✅</p>
                <p className="text-gray-500 font-medium">Sin pedidos sin imprimir</p>
                <p className="text-gray-400 text-sm mt-1">Todos los pedidos están impresos</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pedidosSinImprimir.map(pedido => (
                  <div key={pedido.id}
                    className="flex justify-between items-center p-3 bg-orange-50 border border-orange-100 rounded-lg cursor-pointer hover:bg-orange-100 transition-colors"
                    onClick={() => setPaginaActual('pedidos')}>
                    <div>
                      <span className="font-semibold text-gray-800">#{pedido.numero_pedido}</span>
                      <span className="text-sm text-gray-600 ml-2">{pedido.cliente_nombre}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">{new Date(pedido.fecha_pedido).toLocaleDateString('es-AR')}</span>
                      <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full">sin imprimir</span>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-gray-400 text-center mt-2">Hacé clic para ir a Pedidos e imprimir</p>
              </div>
            )}
          </div>
        </main>
      );
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* NAVBAR */}
      <nav className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setMenuAbierto(!menuAbierto)} className="md:hidden text-gray-600 text-2xl">☰</button>
          <div className="flex items-center gap-2">
            <Logo size={30} />
            <div>
              <p className="text-xs text-gray-400 leading-none">Gestión Integral Pedidos{mayorista.razon_social ? ` | ${mayorista.razon_social}` : ''}</p>
              <h1 className="text-base font-bold text-blue-600 leading-tight">{mayorista.nombre || 'Panel'}</h1>
              <p className="text-xs text-gray-400 leading-none mt-0.5">Panel Mayorista</p>
            </div>
          </div>
        </div>
        <button onClick={cerrarSesion} className="text-sm text-red-500 hover:text-red-700 font-medium">
          Cerrar sesión
        </button>
      </nav>

      <div className="flex flex-1">
        {/* SIDEBAR */}
        <aside className={`${menuAbierto ? 'block' : 'hidden'} md:block w-64 bg-white shadow-sm min-h-screen p-4 absolute md:relative z-10`}>
          <nav className="space-y-1">
            {menuItems.map(item => (
              <button key={item.key}
                onClick={() => navegar(item.key)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left ${
                  paginaActual === item.key ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
                }`}>
                <span>{item.icon}</span>
                <span className="font-medium flex-1">{item.label}</span>
                {(item as any).badge > 0 && (
                  <span className="bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                    {(item as any).badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1">
          {paginaActual !== 'dashboard' && (
            <div className="px-6 pt-4 pb-0">
              <nav className="flex items-center gap-1.5 text-xs text-gray-400">
                <button onClick={() => navegar('dashboard')} className="hover:text-blue-600 transition-colors">Inicio</button>
                <span>›</span>
                {subseccionLabel ? (
                  <>
                    <button onClick={() => setSubseccionLabel('')} className="hover:text-blue-600 transition-colors">
                      {labelMap[paginaActual] ?? paginaActual}
                    </button>
                    <span>›</span>
                    <span className="text-gray-600 font-medium">{subseccionLabel}</span>
                  </>
                ) : (
                  <span className="text-gray-600 font-medium">{labelMap[paginaActual] ?? paginaActual}</span>
                )}
              </nav>
            </div>
          )}
          {renderPagina()}
        </main>
      </div>

      {/* FOOTER */}
      <footer className="bg-white border-t text-center py-2 text-xs text-gray-400">
        Gestión Integral Pedidos
      </footer>
    </div>
  );
}

export default Dashboard;