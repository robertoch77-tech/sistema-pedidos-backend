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

function Dashboard() {
  const mayorista = JSON.parse(localStorage.getItem('mayorista') || '{}');
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [paginaActual, setPaginaActual] = useState('dashboard');
  const [pedidosNuevos, setPedidosNuevos] = useState(0);
  const [stats, setStats] = useState({
    pedidos_hoy: 0, total_productos: 0, total_clientes: 0, pedidos_pendientes: 0
  });
  const [pedidosSinImprimir, setPedidosSinImprimir] = useState<any[]>([]);

  useEffect(() => {
    if (paginaActual === 'dashboard') cargarStats();
  }, [paginaActual]);

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

  const menuItems = [
    { icon: '🏠', label: 'Inicio',        key: 'dashboard' },
    { icon: '📦', label: 'Productos',      key: 'productos' },
    { icon: '👥', label: 'Clientes',       key: 'clientes' },
    { icon: '📋', label: 'Pedidos',        key: 'pedidos', badge: pedidosNuevos },
    ...(mayorista.habilitar_demanda ? [{ icon: '📊', label: 'Demanda', key: 'demanda' }] : []),
    ...(mayorista.habilitar_ofertas ? [{ icon: '🎁', label: 'Ofertas', key: 'ofertas' }] : []),
    // === NUEVO ===
    ...(mayorista.habilitar_productos_solicitados ? [{ icon: '📈', label: 'Más/Menos solicitados', key: 'productos-solicitados' }] : []),
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
            <button
              onClick={() => { setPaginaActual('dashboard'); setMenuAbierto(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left ${
                paginaActual === 'dashboard' ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
              }`}>
              <span>🏠</span>
              <span className="font-medium flex-1">Inicio</span>
            </button>
            {menuItems.map(item => (
              <button key={item.key}
                onClick={() => { setPaginaActual(item.key); setMenuAbierto(false); }}
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

        <main className="flex-1">{renderPagina()}</main>
      </div>

      {/* FOOTER */}
      <footer className="bg-white border-t text-center py-2 text-xs text-gray-400">
        Gestión Integral Pedidos
      </footer>
    </div>
  );
}

export default Dashboard;