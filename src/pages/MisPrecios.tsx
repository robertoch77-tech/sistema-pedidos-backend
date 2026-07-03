import React, { useState, useEffect } from 'react';

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

interface Producto {
  id_producto: number;
  cod_producto: string;
  des_producto: string;
  imagen_producto: string;
  precio_producto?: number;
  stock_temporal?: number;
  des_producto_marca?: string;
  des_producto_rubro?: string;
  des_producto_tipo?: string;
}

const API = 'https://sistema-pedidos-backend-2hec.onrender.com';

function MisPrecios() {
  const cliente = JSON.parse(localStorage.getItem('cliente') || '{}');
  const mayorista_id = cliente.mayorista_id;

  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(0);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [ganancia, setGanancia] = useState(30);
  const [productoModal, setProductoModal] = useState<Producto | null>(null);
  const [imagenesRotas, setImagenesRotas] = useState<Set<number>>(new Set());
  const marcarImagenRota = (id: number) => setImagenesRotas(prev => new Set(prev).add(id));

  const [cfg, setCfg] = useState({
    razon_social: '', descuento_1: 0, descuento_2: 0, descuento_3: 0, iva: 21,
    mostrar_precios: false, mostrar_stock: false, mostrar_marca: false,
    mostrar_rubro: false, mostrar_tipo: false,
  });

  useEffect(() => {
    if (!mayorista_id) return;
    fetch(`${API}/api/mayoristas/${mayorista_id}/configuracion`)
      .then(r => r.json())
      .then(data => setCfg({
        razon_social: data.razon_social || '',
        descuento_1: data.descuento_1 || 0,
        descuento_2: data.descuento_2 || 0,
        descuento_3: data.descuento_3 || 0,
        iva: data.iva ?? 21,
        mostrar_precios: data.mostrar_precios ?? false,
        mostrar_stock: data.mostrar_stock ?? false,
        mostrar_marca: data.mostrar_marca ?? false,
        mostrar_rubro: data.mostrar_rubro ?? false,
        mostrar_tipo: data.mostrar_tipo ?? false,
      }))
      .catch(() => {});
  }, [mayorista_id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (busqueda.trim() === '') { setProductos([]); setTotal(0); setTotalPaginas(0); return; }
      cargarProductos();
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line
  }, [busqueda, pagina]);

  const cargarProductos = async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams({ busqueda, pagina: String(pagina) });
      const res = await fetch(`${API}/api/productos/${mayorista_id}?${params.toString()}`);
      const data = await res.json();
      setProductos(data.productos || []); setTotal(data.total || 0); setTotalPaginas(data.totalPaginas || 0);
    } catch (error) { console.error(error); } finally { setCargando(false); }
  };

  const calcularPrecios = (precioBase: number) => {
    const neto = precioBase
      * (1 - (cfg.descuento_1 || 0) / 100)
      * (1 - (cfg.descuento_2 || 0) / 100)
      * (1 - (cfg.descuento_3 || 0) / 100);
    const costo = neto * (1 + (cfg.iva || 0) / 100);
    const venta = costo * (1 + (ganancia || 0) / 100);
    return { neto, costo, venta };
  };

  const formatPrecio = (n?: number) => (n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const arreglarNombre = (txt?: string) => (txt || '').replace(/\uFFFD/g, 'Ñ');

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
            <h1 className="text-lg font-bold text-green-600">🧮 Mis Precios</h1>
          </div>
        </div>
        <a href="/cliente" className="text-sm text-gray-500 hover:text-gray-700 font-medium">← Volver</a>
      </nav>

      <div className="p-4">
        {/* CONFIGURACIÓN DE GANANCIA */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <div className="flex flex-wrap items-start gap-6">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Mi ganancia (%)</label>
              <div className="flex items-center gap-2">
                <input type="number" min="0" value={ganancia}
                  onChange={e => setGanancia(parseFloat(e.target.value) || 0)}
                  className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <span className="text-gray-500">%</span>
              </div>
            </div>
            <div className="text-xs text-gray-400 space-y-0.5">
              <p className="font-medium text-gray-500 mb-1">Cálculo aplicado:</p>
              <p>Precio de lista</p>
              {cfg.descuento_1 > 0 && <p className="text-orange-500">→ − {cfg.descuento_1}% (descuento 1)</p>}
              {cfg.descuento_2 > 0 && <p className="text-orange-500">→ − {cfg.descuento_2}% (descuento 2)</p>}
              {cfg.descuento_3 > 0 && <p className="text-orange-500">→ − {cfg.descuento_3}% (descuento 3)</p>}
              <p className="text-blue-500">→ + {cfg.iva}% IVA = Tu costo</p>
              <p className="text-green-500">→ + {ganancia}% ganancia = Precio de venta</p>
            </div>
          </div>
        </div>

        {/* BUSCADOR */}
        <input type="text" placeholder="Buscar por código o descripción..."
          value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
          className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-green-500"
        />

        {cargando ? (
          <div className="text-center py-12 text-gray-400">Buscando...</div>
        ) : busqueda.trim() === '' ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-3">🧮</div>
            <p className="text-lg">Buscá un producto para ver tu precio de venta</p>
          </div>
        ) : productos.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No se encontraron productos</div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-3">{total} productos</p>
            <div className="space-y-2">
              {productos.map(producto => {
                const { costo, venta } = calcularPrecios(producto.precio_producto || 0);
                return (
                  <div key={producto.id_producto} className="bg-white rounded-xl shadow-sm p-3 flex items-center gap-3">
                    <div className="w-14 h-14 flex-shrink-0 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                      {producto.imagen_producto && !imagenesRotas.has(producto.id_producto) ? (
                        <img src={`${API}/api/imagen?url=${encodeURIComponent(producto.imagen_producto)}`}
                          onError={() => marcarImagenRota(producto.id_producto)}
                          onClick={() => setProductoModal(producto)}
                          className="w-full h-full object-contain cursor-pointer"
                        />
                      ) : <span className="text-xs text-gray-400">Próx.</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 font-mono">{producto.cod_producto}</p>
                      <p className="font-medium text-gray-800 text-sm leading-tight">{arreglarNombre(producto.des_producto)}</p>
                    </div>
                    <div className="flex-shrink-0 text-right space-y-1">
                      <div>
                        <p className="text-xs text-gray-400">Tu costo</p>
                        <p className="text-sm font-semibold text-gray-600">${formatPrecio(costo)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Precio de venta</p>
                        <p className="text-base font-bold text-green-600">${formatPrecio(venta)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {totalPaginas > 1 && (
              <div className="flex items-center justify-center gap-4 mt-6">
                <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-40">← Anterior</button>
                <span className="text-sm text-gray-600">Página {pagina} de {totalPaginas}</span>
                <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-40">Siguiente →</button>
              </div>
            )}
          </>
        )}
      </div>

      <footer className="bg-white border-t text-center py-2 text-xs text-gray-400 mt-4">
        Gestión Integral Pedidos
      </footer>

      {/* MODAL PRODUCTO */}
      {productoModal && (() => {
        const obs = (productoModal as any).observaciones || null;
        const pres = (productoModal as any).presentacion || null;
        const { costo, venta } = calcularPrecios(productoModal.precio_producto || 0);
        return (
          <div className="fixed inset-0 bg-black bg-opacity-60 z-[60] flex items-center justify-center p-4"
            onClick={() => setProductoModal(null)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}>
              <div className="bg-gray-50 rounded-t-2xl flex items-center justify-center p-4" style={{ minHeight: 220 }}>
                {productoModal.imagen_producto && !imagenesRotas.has(productoModal.id_producto) ? (
                  <img src={`${API}/api/imagen?url=${encodeURIComponent(productoModal.imagen_producto)}`}
                    onError={() => marcarImagenRota(productoModal.id_producto)}
                    className="max-h-52 object-contain" alt={productoModal.des_producto}
                  />
                ) : (
                  <div className="text-gray-300 text-5xl">📦</div>
                )}
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <p className="text-xs text-gray-400 font-mono mb-0.5">{productoModal.cod_producto}</p>
                  <h2 className="font-bold text-gray-800 text-base leading-tight">{arreglarNombre(productoModal.des_producto)}</h2>
                </div>
                {cfg.mostrar_precios && productoModal.precio_producto != null && (
                  <div className="bg-green-50 rounded-xl p-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Tu costo</span>
                      <span className="font-semibold text-gray-700">${formatPrecio(costo)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 text-sm">Precio de venta</span>
                      <span className="font-bold text-green-600 text-base">${formatPrecio(venta)}</span>
                    </div>
                  </div>
                )}
                {cfg.mostrar_stock && productoModal.stock_temporal != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Stock</span>
                    <span className="font-medium text-gray-700">{productoModal.stock_temporal}</span>
                  </div>
                )}
                {cfg.mostrar_marca && productoModal.des_producto_marca && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Marca</span>
                    <span className="font-medium text-gray-700">{arreglarNombre(productoModal.des_producto_marca)}</span>
                  </div>
                )}
                {cfg.mostrar_rubro && productoModal.des_producto_rubro && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Rubro</span>
                    <span className="font-medium text-gray-700">{arreglarNombre(productoModal.des_producto_rubro)}</span>
                  </div>
                )}
                {cfg.mostrar_tipo && productoModal.des_producto_tipo && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Tipo</span>
                    <span className="font-medium text-gray-700">{arreglarNombre(productoModal.des_producto_tipo)}</span>
                  </div>
                )}
                {obs && (
                  <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                    <p className="font-medium text-gray-500 text-xs mb-1">Observaciones</p>
                    <p>{arreglarNombre(obs)}</p>
                  </div>
                )}
                {pres && (
                  <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                    <p className="font-medium text-gray-500 text-xs mb-1">Presentación</p>
                    <p>{arreglarNombre(pres)}</p>
                  </div>
                )}
                <button onClick={() => setProductoModal(null)}
                  className="w-full mt-2 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200 transition-colors">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default MisPrecios;