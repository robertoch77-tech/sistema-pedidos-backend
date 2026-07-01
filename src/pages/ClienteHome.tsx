import React, { useEffect, useState } from 'react';

const Logo = ({ size = 28 }: { size?: number }) => (
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

const API = 'https://sistema-pedidos-backend-2hec.onrender.com';

function ClienteHome() {
  const cliente = JSON.parse(localStorage.getItem('cliente') || '{}');
  const mayorista_id = cliente.mayorista_id;

  const [cfg, setCfg] = useState({
    razon_social: '',
    habilitar_calculadora: false,
    habilitar_ctas_ctes: false,
  });

  useEffect(() => {
    if (!mayorista_id) return;
    fetch(`${API}/api/mayoristas/${mayorista_id}/configuracion`)
      .then(r => r.json())
      .then(data => setCfg({
        razon_social: data.razon_social || '',
        habilitar_calculadora: data.habilitar_calculadora ?? false,
        habilitar_ctas_ctes: data.habilitar_ctas_ctes ?? false,
      }))
      .catch(() => {});
  }, [mayorista_id]);

  const cerrarSesion = () => {
    localStorage.removeItem('cliente');
    window.location.href = '/login';
  };

  const secciones = [
    {
      icon: '🛍️',
      titulo: 'Catálogo',
      descripcion: 'Buscá productos y hacé tu pedido',
      color: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
      iconColor: 'text-blue-600',
      href: '/catalogo',
      siempre: true,
    },
    {
      icon: '📋',
      titulo: 'Mis Pedidos',
      descripcion: 'Consultá el estado de tus pedidos',
      color: 'bg-purple-50 border-purple-200 hover:bg-purple-100',
      iconColor: 'text-purple-600',
      href: '/mis-pedidos',
      siempre: true,
    },
    {
      icon: '🧮',
      titulo: 'Mis Precios',
      descripcion: 'Calculá tu precio de venta',
      color: 'bg-green-50 border-green-200 hover:bg-green-100',
      iconColor: 'text-green-600',
      href: '/mis-precios',
      siempre: false,
      habilitado: cfg.habilitar_calculadora,
    },
    {
      icon: '📒',
      titulo: 'Mi Cuenta Corriente',
      descripcion: 'Consultá tu saldo y movimientos',
      color: 'bg-teal-50 border-teal-200 hover:bg-teal-100',
      iconColor: 'text-teal-600',
      href: '/ctas-ctes',
      siempre: false,
      habilitado: cfg.habilitar_ctas_ctes,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* NAVBAR */}
      <nav className="bg-white shadow-sm px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Logo size={26} />
          <div>
            <p className="text-xs text-gray-400 leading-none">
              Gestión Integral Pedidos{cfg.razon_social ? ` | ${cfg.razon_social}` : ''}
            </p>
            <h1 className="text-lg font-bold text-blue-600">Inicio</h1>
          </div>
        </div>
        <button onClick={cerrarSesion} className="text-sm text-red-500 hover:text-red-700 font-medium">
          Cerrar sesión
        </button>
      </nav>

      {/* CONTENIDO */}
      <div className="p-4 max-w-lg mx-auto">
        <p className="text-gray-500 text-sm mb-6 mt-2">Hola, <strong>{cliente.nombre}</strong>. ¿Qué querés hacer hoy?</p>

        <div className="space-y-3">
          {secciones
            .filter(s => s.siempre || s.habilitado)
            .map(s => (
              <a key={s.href} href={s.href}
                className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-colors cursor-pointer ${s.color}`}>
                <span className={`text-3xl ${s.iconColor}`}>{s.icon}</span>
                <div>
                  <p className={`font-bold text-gray-800`}>{s.titulo}</p>
                  <p className="text-sm text-gray-500">{s.descripcion}</p>
                </div>
                <span className="ml-auto text-gray-400 text-lg">›</span>
              </a>
            ))}
        </div>
      </div>

      {/* FOOTER */}
      <footer className="bg-white border-t text-center py-2 text-xs text-gray-400 mt-8">
        Gestión Integral Pedidos
      </footer>
    </div>
  );
}

export default ClienteHome;