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

interface OfertaItem {
  id: number;
  producto_id: number;
  codigo: string;
  descripcion: string;
  precio: number | null;
  cantidad_minima: number | null;
  cantidad: number | null;
}

interface Oferta {
  id: number;
  tipo: number;
  titulo: string;
  descripcion: string;
  precio: number | null;
  cantidad_minima: number | null;
  producto_gratis_id: number | null;
  codigo_gratis: string | null;
  descripcion_gratis: string | null;
  cantidad_gratis: number | null;
  porcentaje_descuento: number | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  activa: boolean;
  items: OfertaItem[];
}

const API = 'https://sistema-pedidos-backend-2hec.onrender.com';

const tipoInfo: Record<number, { icon: string; label: string; bg: string; text: string; border: string }> = {
  1: { icon: '🛍️', label: 'Surtido especial', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  2: { icon: '📦', label: 'Combo', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  3: { icon: '🎯', label: 'Precio especial por volumen', bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  4: { icon: '🎁', label: 'Regalo por compra', bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  5: { icon: '💰', label: 'Descuento por cantidad', bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
};

const formatPrecio = (n?: number | null) => (n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const arreglarNombre = (txt?: string | null) => (txt || '').replace(/�/g, 'Ñ');

interface Props {
  mayorista_id: number;
  onVolver: () => void;
}

function MisPromociones({ mayorista_id, onVolver }: Props) {
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!mayorista_id) { setCargando(false); return; }
    setCargando(true);
    fetch(`${API}/api/ofertas/cliente/${mayorista_id}`)
      .then(r => r.json())
      .then(data => setOfertas(Array.isArray(data) ? data : []))
      .catch(() => setOfertas([]))
      .finally(() => setCargando(false));
  }, [mayorista_id]);

  const detalleOferta = (o: Oferta) => {
    if (o.tipo === 2) {
      return (
        <>
          {o.precio != null && <p className="font-bold text-gray-800">Precio del combo: ${formatPrecio(o.precio)}</p>}
          {o.cantidad_minima && <p className="text-xs text-gray-500">Mínimo {o.cantidad_minima} paquete{o.cantidad_minima !== 1 ? 's' : ''}</p>}
        </>
      );
    }
    if (o.tipo === 5) {
      return (
        <>
          {o.precio != null && <p className="font-bold text-gray-800">${formatPrecio(o.precio)}</p>}
          {o.porcentaje_descuento != null && o.cantidad_minima != null && (
            <p className="text-xs text-gray-500">+ {o.porcentaje_descuento}% off desde {o.cantidad_minima} unidades</p>
          )}
        </>
      );
    }
    if (o.tipo === 4) {
      return (
        <p className="text-sm text-gray-700">
          Cada {o.cantidad_minima ?? '—'} unidades → {o.cantidad_gratis ?? 1} u. gratis de <strong>{arreglarNombre(o.descripcion_gratis)}</strong>
        </p>
      );
    }
    // tipo 1 y tipo 3 — surtido, precios especiales por producto
    return (
      <>
        <p className="text-sm text-gray-700">{o.items.length} producto{o.items.length !== 1 ? 's' : ''} con precio especial</p>
        {o.tipo === 3 && o.cantidad_minima && (
          <p className="text-xs text-gray-500">Mínimo surtido: {o.cantidad_minima} unidades entre todos</p>
        )}
      </>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* NAVBAR */}
      <nav className="bg-white shadow-sm px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Logo size={26} />
          <div>
            <p className="text-xs text-gray-400 leading-none">Gestión Integral Pedidos</p>
            <h1 className="text-lg font-bold text-orange-600">🎁 Mis Promociones</h1>
          </div>
        </div>
        <button onClick={onVolver} className="text-sm text-gray-500 hover:text-gray-700 font-medium">
          ← Volver
        </button>
      </nav>

      {/* CONTENIDO */}
      <div className="p-4 max-w-2xl mx-auto">
        {cargando ? (
          <div className="text-center py-16 text-gray-400">Cargando promociones...</div>
        ) : ofertas.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-3">🎁</div>
            <p className="text-lg">Todavía no hay promociones disponibles.</p>
            <p className="text-sm mt-1">¡Volvé pronto, siempre puede haber alguna nueva!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {ofertas.map(o => {
              const info = tipoInfo[o.tipo] || tipoInfo[1];
              return (
                <div key={o.id} className={`bg-white rounded-xl shadow-sm border ${info.border} overflow-hidden`}>
                  <div className={`${info.bg} px-4 py-2 flex items-center justify-between`}>
                    <span className={`text-xs font-semibold ${info.text} flex items-center gap-1`}>
                      {info.icon} {info.label}
                    </span>
                    <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-bold">¡Oferta!</span>
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-gray-800 text-base mb-1">{o.titulo}</h3>
                    {o.descripcion && <p className="text-sm text-gray-600 mb-2">{o.descripcion}</p>}
                    <div className="mb-2">{detalleOferta(o)}</div>
                    {o.fecha_fin && (
                      <p className="text-xs text-gray-400 mb-3">
                        Válido hasta {new Date(o.fecha_fin).toLocaleDateString('es-AR')}
                      </p>
                    )}
                    <a href="/catalogo?ofertas=1"
                      className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
                      Ver en catálogo
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FOOTER */}
      <footer className="bg-white border-t text-center py-2 text-xs text-gray-400 mt-8">
        Gestión Integral Pedidos
      </footer>
    </div>
  );
}

export default MisPromociones;
