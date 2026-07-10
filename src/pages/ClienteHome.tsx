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

// === NUEVO: carrusel de banners ===
// El backend ya devuelve lista vacía si habilitar_banners=false o si no hay
// banners vigentes — en ese caso este componente no renderiza nada.

interface Banner {
  id: number;
  imagen_url: string;
  titulo: string | null;
  descripcion: string | null;
  link_destino: string | null;
  orden: number;
}

function CarruselBanners({ banners }: { banners: Banner[] }) {
  const [actual, setActual] = useState(0);
  const [rotas, setRotas] = useState<Set<number>>(new Set());
  const total = banners.length;

  useEffect(() => {
    if (total <= 1) return;
    const timer = setInterval(() => setActual(prev => (prev + 1) % total), 4000);
    return () => clearInterval(timer);
  }, [total]);

  if (total === 0) return null;

  const anterior = () => setActual(prev => (prev - 1 + total) % total);
  const siguiente = () => setActual(prev => (prev + 1) % total);
  const banner = banners[actual];
  const rota = rotas.has(banner.id);

  const contenido = (
    <>
      {rota ? (
        <div className="w-full h-full bg-gradient-to-r from-blue-100 to-cyan-100 flex items-center justify-center">
          <span className="text-4xl">🖼️</span>
        </div>
      ) : (
        <img src={`${API}/api/imagen?url=${encodeURIComponent(banner.imagen_url)}`}
          alt={banner.titulo || 'Banner'}
          onError={() => setRotas(prev => new Set(prev).add(banner.id))}
          className="w-full h-full object-contain p-2"
        />
      )}
      {(banner.titulo || banner.descripcion) && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8">
          {banner.titulo && <p className="text-white font-bold text-sm leading-tight">{banner.titulo}</p>}
          {banner.descripcion && <p className="text-white/80 text-xs leading-tight mt-0.5">{banner.descripcion}</p>}
        </div>
      )}
    </>
  );

  return (
    <div className="relative rounded-xl overflow-hidden shadow-sm mb-6 h-48 sm:h-64 bg-gray-50">
      {banner.link_destino ? (
        <a href={banner.link_destino} className="block w-full h-full relative">{contenido}</a>
      ) : (
        <div className="w-full h-full relative">{contenido}</div>
      )}

      {total > 1 && (
        <>
          <button onClick={anterior} aria-label="Banner anterior"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center text-lg leading-none">
            ‹
          </button>
          <button onClick={siguiente} aria-label="Banner siguiente"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center text-lg leading-none">
            ›
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {banners.map((b, idx) => (
              <button key={b.id} onClick={() => setActual(idx)} aria-label={`Ir al banner ${idx + 1}`}
                className={`w-2 h-2 rounded-full transition-colors ${idx === actual ? 'bg-white' : 'bg-white/40'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ClienteHome() {
  const cliente = JSON.parse(localStorage.getItem('cliente') || '{}');
  const mayorista_id = cliente.mayorista_id;

  const [cfg, setCfg] = useState({
    razon_social: '',
    habilitar_calculadora: false,
    habilitar_ctas_ctes: false,
    habilitar_mensajes: false,
    habilitar_mis_promociones: false,
    habilitar_notificaciones: false,
    habilitar_calculadora_venta: false,
    habilitar_historial_ventas: false,
    habilitar_cotizaciones: false,
    habilitar_novedades: false,
  });
  const [banners, setBanners] = useState<Banner[]>([]);
  const [mensajesNoLeidos, setMensajesNoLeidos] = useState(0);
  const [notificacionesNoLeidas, setNotificacionesNoLeidas] = useState(0);
  const [cantidadNovedades, setCantidadNovedades] = useState(0);

  useEffect(() => {
    if (!mayorista_id) return;
    fetch(`${API}/api/mayoristas/${mayorista_id}/configuracion`)
      .then(r => r.json())
      .then(data => setCfg({
        razon_social: data.razon_social || '',
        habilitar_calculadora: data.habilitar_calculadora ?? false,
        habilitar_ctas_ctes: data.habilitar_ctas_ctes ?? false,
        habilitar_mensajes: data.habilitar_mensajes ?? false,
        habilitar_mis_promociones: data.habilitar_mis_promociones ?? false,
        habilitar_notificaciones: data.habilitar_notificaciones ?? false,
        habilitar_calculadora_venta: data.habilitar_calculadora_venta ?? false,
        habilitar_historial_ventas: data.habilitar_historial_ventas ?? false,
        habilitar_cotizaciones: data.habilitar_cotizaciones ?? false,
        habilitar_novedades: data.habilitar_novedades ?? false,
      }))
      .catch(() => {});
  }, [mayorista_id]);

  // Badge de mensajes no leídos — se refresca cada vez que se monta /cliente
  useEffect(() => {
    if (!mayorista_id || !cliente.cuit || !cfg.habilitar_mensajes) return;
    fetch(`${API}/api/mensajes/${mayorista_id}/${encodeURIComponent(cliente.cuit)}/no-leidos`)
      .then(r => r.json())
      .then(data => setMensajesNoLeidos(data.total || 0))
      .catch(() => {});
    // eslint-disable-next-line
  }, [mayorista_id, cfg.habilitar_mensajes]);

  // Polling de notificaciones no leídas cada 60s
  useEffect(() => {
    if (!mayorista_id || !cliente.cuit || !cfg.habilitar_notificaciones) return;
    const fetchCount = () => {
      fetch(`${API}/api/notificaciones/cliente/${mayorista_id}/${encodeURIComponent(cliente.cuit)}/count`)
        .then(r => r.json())
        .then(data => setNotificacionesNoLeidas(data.total || 0))
        .catch(() => {});
    };
    fetchCount();
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line
  }, [mayorista_id, cfg.habilitar_notificaciones]);

  // === NUEVO: banners activos y vigentes (vacío si habilitar_banners=false) ===
  useEffect(() => {
    if (!mayorista_id) return;
    fetch(`${API}/api/banners/cliente/${mayorista_id}`)
      .then(r => r.json())
      .then(data => setBanners(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [mayorista_id]);

  // Novedades activas — para mostrar badge con cantidad
  useEffect(() => {
    if (!mayorista_id || !cfg.habilitar_novedades) return;
    fetch(`${API}/api/novedades/cliente/${mayorista_id}`)
      .then(r => r.json())
      .then(data => setCantidadNovedades(Array.isArray(data) ? data.length : 0))
      .catch(() => {});
    // eslint-disable-next-line
  }, [mayorista_id, cfg.habilitar_novedades]);

  const cerrarSesion = () => {
    const codigoMayorista = localStorage.getItem('codigo_mayorista');
    localStorage.removeItem('cliente');
    window.location.href = codigoMayorista ? `/?m=${codigoMayorista}` : '/login';
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
            <p className="text-xs text-gray-400 leading-none mt-0.5">Panel Cliente</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {cfg.habilitar_notificaciones && (
            <a href="/mis-notificaciones" className="relative text-gray-500 hover:text-blue-600">
              <span className="text-xl">🔔</span>
              {notificacionesNoLeidas > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs min-w-[18px] h-[18px] px-0.5 rounded-full flex items-center justify-center font-bold leading-none">
                  {notificacionesNoLeidas}
                </span>
              )}
            </a>
          )}
          <button onClick={cerrarSesion} className="text-sm text-red-500 hover:text-red-700 font-medium">
            Cerrar sesión
          </button>
        </div>
      </nav>

      {/* CONTENIDO */}
      <div className="p-4 max-w-lg mx-auto">
        <p className="text-gray-500 text-sm mb-6 mt-2">Hola, <strong>{cliente.nombre}</strong>. ¿Qué querés hacer hoy?</p>

        {/* === NUEVO: carrusel de banners (no renderiza nada si no hay) === */}
        <CarruselBanners banners={banners} />

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

          {cfg.habilitar_mensajes && (
            <a href="/mis-mensajes"
              className="flex items-center gap-4 p-4 rounded-xl border-2 transition-colors cursor-pointer bg-cyan-50 border-cyan-200 hover:bg-cyan-100">
              <span className="text-3xl text-cyan-600 relative">
                💬
                {mensajesNoLeidos > 0 && (
                  <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center font-bold">
                    {mensajesNoLeidos}
                  </span>
                )}
              </span>
              <div>
                <p className="font-bold text-gray-800">Mis Mensajes</p>
                <p className="text-sm text-gray-500">
                  {mensajesNoLeidos > 0
                    ? `Tenés ${mensajesNoLeidos} mensaje${mensajesNoLeidos !== 1 ? 's' : ''} sin leer`
                    : 'Chateá con tu proveedor'}
                </p>
              </div>
              <span className="ml-auto text-gray-400 text-lg">›</span>
            </a>
          )}

          {cfg.habilitar_mis_promociones && (
            <a href="/mis-promociones"
              className="flex items-center gap-4 p-4 rounded-xl border-2 transition-colors cursor-pointer bg-orange-50 border-orange-200 hover:bg-orange-100">
              <span className="text-3xl text-orange-500">🎁</span>
              <div>
                <p className="font-bold text-gray-800">Mis Promociones</p>
                <p className="text-sm text-gray-500">Ofertas y descuentos especiales</p>
              </div>
              <span className="ml-auto text-gray-400 text-lg">›</span>
            </a>
          )}

          <a href="/mis-tickets"
            className="flex items-center gap-4 p-4 rounded-xl border-2 transition-colors cursor-pointer bg-yellow-50 border-yellow-200 hover:bg-yellow-100">
            <span className="text-3xl text-yellow-600">🧾</span>
            <div>
              <p className="font-bold text-gray-800">Mis Tickets</p>
              <p className="text-sm text-gray-500">Armá un ticket de venta para tu cliente</p>
            </div>
            <span className="ml-auto text-gray-400 text-lg">›</span>
          </a>

          {cfg.habilitar_calculadora_venta && (
            <a href="/calculadora-venta"
              className="flex items-center gap-4 p-4 rounded-xl border-2 transition-colors cursor-pointer bg-indigo-50 border-indigo-200 hover:bg-indigo-100">
              <span className="text-3xl text-indigo-600">🖩</span>
              <div>
                <p className="font-bold text-gray-800">Calculadora de Venta</p>
                <p className="text-sm text-gray-500">Armá un comprobante con productos libres o del catálogo</p>
              </div>
              <span className="ml-auto text-gray-400 text-lg">›</span>
            </a>
          )}

          {cfg.habilitar_historial_ventas && (
            <a href="/mi-historial"
              className="flex items-center gap-4 p-4 rounded-xl border-2 transition-colors cursor-pointer bg-slate-50 border-slate-200 hover:bg-slate-100">
              <span className="text-3xl text-slate-600">📋</span>
              <div>
                <p className="font-bold text-gray-800">Mi Historial</p>
                <p className="text-sm text-gray-500">Consultá y reimprimí tickets y ventas anteriores</p>
              </div>
              <span className="ml-auto text-gray-400 text-lg">›</span>
            </a>
          )}

          {cfg.habilitar_novedades && cantidadNovedades > 0 && (
            <a href="/mis-novedades"
              className="flex items-center gap-4 p-4 rounded-xl border-2 transition-colors cursor-pointer bg-blue-50 border-blue-200 hover:bg-blue-100">
              <span className="text-3xl text-blue-600 relative">
                🆕
                <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center font-bold">
                  {cantidadNovedades}
                </span>
              </span>
              <div>
                <p className="font-bold text-gray-800">Novedades</p>
                <p className="text-sm text-gray-500">
                  {cantidadNovedades} producto{cantidadNovedades !== 1 ? 's' : ''} nuevo{cantidadNovedades !== 1 ? 's' : ''} para vos
                </p>
              </div>
              <span className="ml-auto text-gray-400 text-lg">›</span>
            </a>
          )}

          {cfg.habilitar_cotizaciones && (
            <a href="/presupuesto"
              className="flex items-center gap-4 p-4 rounded-xl border-2 transition-colors cursor-pointer bg-emerald-50 border-emerald-200 hover:bg-emerald-100">
              <span className="text-3xl text-emerald-600">📄</span>
              <div>
                <p className="font-bold text-gray-800">Presupuestos</p>
                <p className="text-sm text-gray-500">Creá y enviá presupuestos a clientes o proveedores</p>
              </div>
              <span className="ml-auto text-gray-400 text-lg">›</span>
            </a>
          )}
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