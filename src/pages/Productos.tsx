import React, { useState, useEffect } from 'react';

const API = 'https://sistema-pedidos-backend-2hec.onrender.com';

interface Producto {
  id_producto: number;
  cod_producto: string;
  des_producto: string;
  imagen_producto: string;
  precio_producto: number;
  stock_temporal: number;
  des_producto_marca: string;
  des_producto_rubro: string;
  des_producto_tipo: string;
}

interface Resultado {
  productos: Producto[];
  total: number;
  pagina: number;
  totalPaginas: number;
}

function arreglarNombre(texto?: string): string {
  if (!texto) return '';
  return texto.replace(/\uFFFD/g, 'Ñ');
}

function Productos() {
  const mayorista = JSON.parse(localStorage.getItem('mayorista') || '{}');
  const [busqueda, setBusqueda] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [cargando, setCargando] = useState(false);
  const [paginaActual, setPaginaActual] = useState(1);
  const [imagenModal, setImagenModal] = useState<string | null>(null);

  useEffect(() => {
    if (busqueda.trim() === '') { setResultado(null); return; }
    if (busqueda.trim().length < 3) return;
    const timer = setTimeout(() => buscar(1), 400);
    return () => clearTimeout(timer);
  }, [busqueda]);

  const buscar = async (pagina = 1) => {
    setCargando(true);
    try {
      const params = new URLSearchParams({ pagina: String(pagina) });
      if (busqueda.trim()) params.set('busqueda', busqueda.trim());
      const res = await fetch(`${API}/api/productos/${mayorista.id}?${params}`);
      const data = await res.json();
      setResultado(data);
      setPaginaActual(pagina);
    } catch (error) {
      console.error(error);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Productos</h2>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Buscar por código, descripción o marca (3 letras para buscar solo)..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && buscar(1)}
          className="flex-1 sm:max-w-lg border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => buscar(1)}
          disabled={cargando}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {cargando ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {!resultado && !cargando && (
        <div className="text-center py-12 text-gray-400">
          Escribí 3 letras para buscar, o hacé clic en Buscar para ver todos
        </div>
      )}

      {cargando && (
        <div className="text-center py-12 text-gray-400">Buscando...</div>
      )}

      {resultado && !cargando && (
        <>
          <p className="text-sm text-gray-500 mb-3">
            {resultado.total.toLocaleString()} resultado{resultado.total !== 1 ? 's' : ''}
            {resultado.totalPaginas > 1 && ` · Página ${resultado.pagina} de ${resultado.totalPaginas}`}
          </p>

          {resultado.productos.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No se encontraron productos</div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left w-16">Imagen</th>
                    <th className="px-4 py-3 text-left">Código</th>
                    <th className="px-4 py-3 text-left">Descripción</th>
                    <th className="px-4 py-3 text-left">Marca</th>
                    <th className="px-4 py-3 text-left">Rubro</th>
                    {mayorista.mostrar_precios && <th className="px-4 py-3 text-right">Precio</th>}
                    {mayorista.mostrar_stock && <th className="px-4 py-3 text-right">Stock</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {resultado.productos.map(p => (
                    <tr key={p.id_producto} className="hover:bg-gray-50">

                      {/* Imagen */}
                      <td className="px-4 py-2">
                        {p.imagen_producto ? (
                          <img
                            src={`${API}/api/imagen?url=${encodeURIComponent(p.imagen_producto)}`}
                            alt={arreglarNombre(p.des_producto)}
                            onClick={() => setImagenModal(p.imagen_producto)}
                            onError={e => (e.currentTarget.style.display = 'none')}
                            className="w-10 h-10 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                          />
                        ) : (
                          <span className="text-xs text-gray-300 italic">Agregar imagen</span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-mono text-gray-500 whitespace-nowrap">{p.cod_producto}</td>
                      <td className="px-4 py-3 text-gray-800">{arreglarNombre(p.des_producto)}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{arreglarNombre(p.des_producto_marca)}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{arreglarNombre(p.des_producto_rubro)}</td>
                      {mayorista.mostrar_precios && (
                        <td className="px-4 py-3 text-right font-semibold text-blue-600 whitespace-nowrap">
                          ${Number(p.precio_producto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </td>
                      )}
                      {mayorista.mostrar_stock && (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            p.stock_temporal > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {p.stock_temporal > 0 ? p.stock_temporal : 'Sin stock'}
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {resultado.totalPaginas > 1 && (
            <div className="flex justify-center items-center gap-2 mt-4">
              <button
                onClick={() => buscar(paginaActual - 1)}
                disabled={paginaActual === 1}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                ← Anterior
              </button>
              <span className="px-4 py-2 text-sm text-gray-600">
                {paginaActual} / {resultado.totalPaginas}
              </span>
              <button
                onClick={() => buscar(paginaActual + 1)}
                disabled={paginaActual === resultado.totalPaginas}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}

      {/* Modal de imagen */}
      {imagenModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4"
          onClick={() => setImagenModal(null)}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full p-4"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setImagenModal(null)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 text-2xl font-bold leading-none"
            >
              ×
            </button>
            <img
              src={`${API}/api/imagen?url=${encodeURIComponent(imagenModal)}`}
              alt="Imagen del producto"
              className="w-full max-h-96 object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default Productos;