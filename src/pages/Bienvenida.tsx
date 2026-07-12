import React, { useEffect, useState } from 'react';

const Logo = ({ size = 36 }: { size?: number }) => (
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
const proxyImg = (url: string) => `${API}/api/imagen?url=${encodeURIComponent(url)}`;
const arreglarNombre = (txt?: string) => (txt || '').replace(/�/g, 'Ñ');

interface Banner {
  id: number;
  imagen_url: string;
  titulo: string | null;
  descripcion: string | null;
  link_destino: string | null;
}

interface Novedad {
  id: number;
  producto_codigo: string | null;
  producto_nombre: string;
  imagen_url: string | null;
  precio: number | null;
}

interface Oferta {
  id: number;
  titulo: string;
  descripcion: string | null;
  imagen_url: string | null;
  precio_oferta: number | null;
}

function CarruselBanners({ banners }: { banners: Banner[] }) {
  const [actual, setActual] = useState(0);
  const [rotas, setRotas] = useState<Set<number>>(new Set());
  const total = banners.length;

  useEffect(() => {
    if (total <= 1) return;
    const t = setInterval(() => setActual(p => (p + 1) % total), 4000);
    return () => clearInterval(t);
  }, [total]);

  if (total === 0) return null;

  const banner = banners[actual];
  const rota = rotas.has(banner.id);

  const img = (
    <div className="w-full h-full relative">
      {rota ? (
        <div className="w-full h-full bg-gradient-to-r from-blue-100 to-cyan-100 flex items-center justify-center">
          <span className="text-4xl">🖼️</span>
        </div>
      ) : (
        <img src={proxyImg(banner.imagen_url)}
          alt={banner.titulo || 'Banner'}
          onError={() => setRotas(prev => new Set(prev).add(banner.id))}
          className="w-full h-full object-contain p-2" />
      )}
      {(banner.titulo || banner.descripcion) && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8">
          {banner.titulo && <p className="text-white font-bold text-sm">{banner.titulo}</p>}
          {banner.descripcion && <p className="text-white/80 text-xs mt-0.5">{banner.descripcion}</p>}
        </div>
      )}
    </div>
  );

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-md mb-6 h-52 sm:h-64 bg-gray-50">
      {banner.link_destino
        ? <a href={banner.link_destino} className="block w-full h-full">{img}</a>
        : img}
      {total > 1 && (
        <>
          <button onClick={() => setActual(p => (p - 1 + total) % total)}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center text-xl leading-none">‹</button>
          <button onClick={() => setActual(p => (p + 1) % total)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center text-xl leading-none">›</button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {banners.map((b, i) => (
              <button key={b.id} onClick={() => setActual(i)}
                className={`w-2 h-2 rounded-full transition-colors ${i === actual ? 'bg-white' : 'bg-white/40'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Bienvenida() {
  const cliente = JSON.parse(localStorage.getItem('cliente') || '{}');
  const mayorista_id = cliente.mayorista_id;

  const [razonSocial, setRazonSocial] = useState('');
  const [mostrarPrecios, setMostrarPrecios] = useState(false);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [imagenesRotas, setImagenesRotas] = useState<Set<number>>(new Set());
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!mayorista_id) { setCargando(false); return; }

    Promise.all([
      fetch(`${API}/api/mayoristas/${mayorista_id}/configuracion`).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/api/banners/cliente/${mayorista_id}`).then(r => r.json()).catch(() => []),
      fetch(`${API}/api/novedades/cliente/${mayorista_id}`).then(r => r.json()).catch(() => []),
      fetch(`${API}/api/ofertas/cliente/${mayorista_id}`).then(r => r.json()).catch(() => []),
    ]).then(([cfg, bans, novs, ofs]) => {
      setRazonSocial(cfg.razon_social || '');
      setMostrarPrecios(cfg.mostrar_precios ?? false);
      setBanners(Array.isArray(bans) ? bans : []);
      setNovedades(Array.isArray(novs) ? novs.slice(0, 6) : []);
      setOfertas(Array.isArray(ofs) ? ofs.slice(0, 6) : []);
    }).finally(() => setCargando(false));
  }, [mayorista_id]);

  const marcarRota = (id: number) =>
    setImagenesRotas(prev => new Set(prev).add(id));

  const hayContenido = banners.length > 0 || novedades.length > 0 || ofertas.length > 0;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* HEADER */}
      <div className="bg-white shadow-sm px-4 py-5 text-center">
        <div className="flex justify-center mb-2">
          <Logo size={40} />
        </div>
        <h1 className="text-xl font-bold text-blue-700">
          {razonSocial || 'Gestión Integral Pedidos'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Hola, <strong>{cliente.nombre}</strong> — bienvenido
        </p>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {cargando ? (
          <div className="text-center py-20 text-gray-400">Cargando...</div>
        ) : (
          <>
            {/* BANNERS */}
            {banners.length > 0 && (
              <CarruselBanners banners={banners} />
            )}

            {/* NOVEDADES */}
            {novedades.length > 0 && (
              <div className="mb-6">
                <h2 className="text-base font-bold text-gray-700 mb-3 flex items-center gap-2">
                  🆕 <span>Novedades</span>
                  <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">{novedades.length}</span>
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {novedades.map(n => (
                    <div key={n.id} className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                      <div className="h-28 bg-gray-50 flex items-center justify-center relative">
                        <span className="absolute top-1.5 left-1.5 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full z-10">🆕 NUEVO</span>
                        {n.imagen_url && !imagenesRotas.has(n.id) ? (
                          <img src={proxyImg(n.imagen_url)} alt=""
                            onError={() => marcarRota(n.id)}
                            className="w-full h-full object-contain p-2" />
                        ) : <span className="text-3xl text-gray-200">📦</span>}
                      </div>
                      <div className="p-2">
                        {n.producto_codigo && (
                          <p className="text-[10px] text-gray-400 font-mono">{n.producto_codigo}</p>
                        )}
                        <p className="text-xs font-semibold text-gray-800 leading-snug line-clamp-2">
                          {arreglarNombre(n.producto_nombre)}
                        </p>
                        {mostrarPrecios && n.precio != null && (
                          <p className="text-sm font-bold text-green-600 mt-1">
                            ${n.precio.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* OFERTAS */}
            {ofertas.length > 0 && (
              <div className="mb-6">
                <h2 className="text-base font-bold text-gray-700 mb-3 flex items-center gap-2">
                  🎁 <span>Ofertas destacadas</span>
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {ofertas.map(o => (
                    <div key={o.id} className="bg-white rounded-xl shadow-sm overflow-hidden border border-orange-100">
                      <div className="h-28 bg-orange-50 flex items-center justify-center">
                        {o.imagen_url && !imagenesRotas.has(-o.id) ? (
                          <img src={proxyImg(o.imagen_url)} alt=""
                            onError={() => marcarRota(-o.id)}
                            className="w-full h-full object-contain p-2" />
                        ) : <span className="text-3xl text-orange-200">🎁</span>}
                      </div>
                      <div className="p-2">
                        <p className="text-xs font-semibold text-gray-800 leading-snug line-clamp-2">
                          {arreglarNombre(o.titulo)}
                        </p>
                        {mostrarPrecios && o.precio_oferta != null && (
                          <p className="text-sm font-bold text-orange-600 mt-1">
                            ${o.precio_oferta.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mensaje si no hay contenido */}
            {!hayContenido && (
              <div className="text-center py-10 text-gray-400">
                <div className="text-5xl mb-3">👋</div>
                <p className="text-base font-medium">¡Bienvenido al sistema de pedidos!</p>
              </div>
            )}
          </>
        )}

        {/* BOTÓN INGRESAR */}
        <a href="/cliente"
          className="block w-full bg-blue-600 hover:bg-blue-700 text-white text-center font-bold py-4 rounded-2xl text-base transition-colors shadow-md mt-2">
          Ingresar al sistema de pedidos →
        </a>
      </div>

      <footer className="bg-white border-t text-center py-2 text-xs text-gray-400 mt-8">
        Gestión Integral Pedidos
      </footer>
    </div>
  );
}

export default Bienvenida;
