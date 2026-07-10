import React, { useEffect, useState } from 'react';

const Logo = ({ size = 26 }: { size?: number }) => (
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

interface Novedad {
  id: number;
  producto_codigo: string | null;
  producto_nombre: string;
  imagen_url: string | null;
  precio: number | null;
  fecha_hasta: string | null;
  activa: boolean;
}

const proxyImg = (url: string) => `${API}/api/imagen?url=${encodeURIComponent(url)}`;
const arreglarNombre = (txt?: string) => (txt || '').replace(/�/g, 'Ñ');

function MisNovedades() {
  const cliente = JSON.parse(localStorage.getItem('cliente') || '{}');
  const mayorista_id = cliente.mayorista_id;

  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [razonSocial, setRazonSocial] = useState('');
  const [mostrarPrecios, setMostrarPrecios] = useState(false);
  const [imagenesRotas, setImagenesRotas] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!mayorista_id) return;
    fetch(`${API}/api/mayoristas/${mayorista_id}/configuracion`)
      .then(r => r.json())
      .then(data => {
        setRazonSocial(data.razon_social || '');
        setMostrarPrecios(data.mostrar_precios ?? false);
      })
      .catch(() => {});
  }, [mayorista_id]);

  useEffect(() => {
    if (!mayorista_id) return;
    setCargando(true);
    fetch(`${API}/api/novedades/cliente/${mayorista_id}`)
      .then(r => r.json())
      .then(data => setNovedades(Array.isArray(data) ? data : []))
      .catch(() => setNovedades([]))
      .finally(() => setCargando(false));
  }, [mayorista_id]);

  const verEnCatalogo = (codigo: string | null) => {
    if (!codigo) {
      window.location.href = '/catalogo';
      return;
    }
    localStorage.setItem('busqueda_catalogo_inicial', codigo);
    window.location.href = '/catalogo';
  };

  const marcarRotа = (id: number) =>
    setImagenesRotas(prev => new Set(prev).add(id));

  return (
    <div className="min-h-screen bg-gray-100">
      {/* NAVBAR */}
      <nav className="bg-white shadow-sm px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Logo size={26} />
          <div>
            <p className="text-xs text-gray-400 leading-none">
              Gestión Integral Pedidos{razonSocial ? ` | ${razonSocial}` : ''}
            </p>
            <h1 className="text-lg font-bold text-blue-600">🆕 Novedades</h1>
          </div>
        </div>
        <a href="/cliente" className="text-sm text-gray-500 hover:text-gray-700 font-medium">← Volver</a>
      </nav>

      <div className="p-4 max-w-2xl mx-auto">
        {cargando ? (
          <div className="text-center py-20 text-gray-400">Cargando novedades...</div>
        ) : novedades.length === 0 ? (
          <div className="text-center py-24 text-gray-400">
            <div className="text-6xl mb-4">📭</div>
            <p className="text-lg font-medium">No hay novedades por el momento</p>
            <p className="text-sm mt-1">Volvé a revisar pronto</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">
              {novedades.length} novedad{novedades.length !== 1 ? 'es' : ''} disponible{novedades.length !== 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {novedades.map(n => (
                <div key={n.id}
                  className="bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col border border-gray-100">

                  {/* Badge NUEVO */}
                  <div className="relative">
                    <div className="absolute top-3 left-3 z-10">
                      <span className="bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-sm tracking-wide">
                        🆕 NUEVO
                      </span>
                    </div>

                    {/* Imagen */}
                    <div className="h-44 bg-gray-50 flex items-center justify-center overflow-hidden">
                      {n.imagen_url && !imagenesRotas.has(n.id) ? (
                        <img
                          src={proxyImg(n.imagen_url)}
                          alt={arreglarNombre(n.producto_nombre)}
                          onError={() => marcarRotа(n.id)}
                          className="w-full h-full object-contain p-3"
                        />
                      ) : (
                        <span className="text-5xl text-gray-200">📦</span>
                      )}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4 flex flex-col flex-1">
                    {n.producto_codigo && (
                      <p className="text-xs text-gray-400 font-mono mb-1">{n.producto_codigo}</p>
                    )}
                    <p className="font-semibold text-gray-800 text-sm leading-snug flex-1">
                      {arreglarNombre(n.producto_nombre)}
                    </p>

                    {mostrarPrecios && n.precio != null && (
                      <p className="text-lg font-bold text-green-600 mt-2">
                        ${(n.precio).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </p>
                    )}

                    {n.fecha_hasta && (
                      <p className="text-xs text-gray-400 mt-1">
                        Disponible hasta {new Date(n.fecha_hasta + 'T12:00:00').toLocaleDateString('es-AR')}
                      </p>
                    )}

                    <button
                      onClick={() => verEnCatalogo(n.producto_codigo)}
                      className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
                      🛒 Ver en catálogo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <footer className="bg-white border-t text-center py-2 text-xs text-gray-400 mt-8">
        Gestión Integral Pedidos
      </footer>
    </div>
  );
}

export default MisNovedades;
