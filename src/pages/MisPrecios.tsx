import React, { useState, useEffect, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

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

interface ColumnaDescarga {
  key: string;
  label: string;
  default: boolean;
  esPrecio?: boolean;
}

const COLUMNAS_DESCARGA: ColumnaDescarga[] = [
  { key: 'codigo', label: 'Código', default: true },
  { key: 'descripcion', label: 'Descripción', default: true },
  { key: 'precio_lista', label: 'Precio lista', default: true, esPrecio: true },
  { key: 'precio_descuentos', label: 'Precio con descuentos', default: true, esPrecio: true },
  { key: 'precio_venta', label: 'Precio venta sugerido', default: true, esPrecio: true },
  { key: 'marca', label: 'Marca', default: false },
  { key: 'rubro', label: 'Rubro', default: false },
  { key: 'stock', label: 'Stock', default: false },
];

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
  const [ganancia, setGanancia] = useState<number>(() => {
    const g = parseFloat(localStorage.getItem('mis_precios_ganancia') || '');
    return isNaN(g) ? 30 : g;
  });
  const [productoModal, setProductoModal] = useState<Producto | null>(null);
  const [imagenesRotas, setImagenesRotas] = useState<Set<number>>(new Set());
  const marcarImagenRota = (id: number) => setImagenesRotas(prev => new Set(prev).add(id));

  const [descargaAbierta, setDescargaAbierta] = useState<'pdf' | 'excel' | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [columnasSel, setColumnasSel] = useState<string[]>(() => {
    try {
      const guardadas = JSON.parse(localStorage.getItem('mis_precios_columnas') || 'null');
      if (Array.isArray(guardadas)) return guardadas;
    } catch {}
    return COLUMNAS_DESCARGA.filter(c => c.default).map(c => c.key);
  });

  const [cfg, setCfg] = useState({
    razon_social: '', descuento_1: 0, descuento_2: 0, descuento_3: 0, iva: 21,
    mostrar_precios: true, mostrar_stock: true, mostrar_marca: true,
    mostrar_rubro: true, mostrar_tipo: true,
    habilitar_descuentos_por_cliente: false,
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
        mostrar_precios: data.mostrar_precios ?? true,
        mostrar_stock: data.mostrar_stock ?? true,
        mostrar_marca: data.mostrar_marca ?? true,
        mostrar_rubro: data.mostrar_rubro ?? true,
        mostrar_tipo: data.mostrar_tipo ?? true,
        habilitar_descuentos_por_cliente: data.habilitar_descuentos_por_cliente ?? false,
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

  // Descuentos que aplican: los propios del cliente (si el mayorista habilitó
  // la función y el Admin se los asignó) o los generales del mayorista.
  const descuentos = useMemo(() => {
    const propios = [cliente.descuento_1, cliente.descuento_2, cliente.descuento_3];
    if (cfg.habilitar_descuentos_por_cliente && propios.some(d => d != null)) {
      return {
        d1: Number(cliente.descuento_1) || 0,
        d2: Number(cliente.descuento_2) || 0,
        d3: Number(cliente.descuento_3) || 0,
        propios: true,
      };
    }
    return { d1: cfg.descuento_1 || 0, d2: cfg.descuento_2 || 0, d3: cfg.descuento_3 || 0, propios: false };
    // eslint-disable-next-line
  }, [cfg]);

  const cambiarGanancia = (v: number) => {
    setGanancia(v);
    localStorage.setItem('mis_precios_ganancia', String(v));
  };

  const calcularPrecios = (precioBase: number) => {
    const neto = precioBase
      * (1 - descuentos.d1 / 100)
      * (1 - descuentos.d2 / 100)
      * (1 - descuentos.d3 / 100);
    const costo = neto * (1 + (cfg.iva || 0) / 100);
    const venta = costo * (1 + (ganancia || 0) / 100);
    return { neto, costo, venta };
  };

  const formatPrecio = (n?: number) => (n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const arreglarNombre = (txt?: string) => (txt || '').replace(/�/g, 'Ñ');

  const toggleColumna = (key: string) => {
    setColumnasSel(prev => {
      const nuevas = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      localStorage.setItem('mis_precios_columnas', JSON.stringify(nuevas));
      return nuevas;
    });
  };

  const columnasVisibles = COLUMNAS_DESCARGA.filter(c => cfg.mostrar_precios || !c.esPrecio);

  const construirFilas = (prods: Producto[], cols: ColumnaDescarga[]) =>
    prods.map(p => {
      const { costo, venta } = calcularPrecios(p.precio_producto || 0);
      return cols.map(c => {
        switch (c.key) {
          case 'codigo': return p.cod_producto || '';
          case 'descripcion': return arreglarNombre(p.des_producto);
          case 'precio_lista': return formatPrecio(p.precio_producto);
          case 'precio_descuentos': return formatPrecio(costo);
          case 'precio_venta': return formatPrecio(venta);
          case 'marca': return arreglarNombre(p.des_producto_marca);
          case 'rubro': return arreglarNombre(p.des_producto_rubro);
          case 'stock': return String(p.stock_temporal ?? '');
          default: return '';
        }
      });
    });

  const descargarLista = async (formato: 'pdf' | 'excel') => {
    const cols = columnasVisibles.filter(c => columnasSel.includes(c.key));
    if (cols.length === 0) { alert('Seleccioná al menos una columna'); return; }
    setDescargando(true);
    try {
      const res = await fetch(`${API}/api/productos/${mayorista_id}/todos`);
      const data = await res.json();
      const todos: Producto[] = data.productos || [];
      if (todos.length === 0) { alert('No hay productos para descargar'); return; }
      const encabezados = cols.map(c => c.label);
      const filas = construirFilas(todos, cols);

      if (formato === 'pdf') {
        const doc = new jsPDF();
        doc.setFontSize(14);
        doc.text(`Lista de precios${cfg.razon_social ? ` — ${cfg.razon_social}` : ''}`, 14, 16);
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text(`Generada el ${new Date().toLocaleDateString('es-AR')} — ganancia ${ganancia}%`, 14, 22);
        autoTable(doc, {
          head: [encabezados],
          body: filas,
          startY: 26,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [22, 163, 74] },
        });
        doc.save('lista-precios.pdf');
      } else {
        const hoja = XLSX.utils.aoa_to_sheet([encabezados, ...filas]);
        hoja['!cols'] = cols.map(c => ({ wch: c.key === 'descripcion' ? 40 : 16 }));
        const libro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libro, hoja, 'Lista de precios');
        XLSX.writeFile(libro, 'lista-precios.xlsx');
      }
      setDescargaAbierta(null);
    } catch (error) {
      console.error(error);
      alert('Error al descargar la lista');
    } finally {
      setDescargando(false);
    }
  };

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
        {/* DESCUENTOS Y GANANCIA */}
        {cfg.mostrar_precios && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
            <div className="flex flex-wrap items-start gap-6">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">
                  {descuentos.propios ? 'Tus descuentos' : 'Descuentos aplicados'}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[descuentos.d1, descuentos.d2, descuentos.d3].filter(d => d > 0).length === 0 ? (
                    <span className="text-sm text-gray-400">Sin descuentos</span>
                  ) : (
                    [descuentos.d1, descuentos.d2, descuentos.d3].filter(d => d > 0).map((d, idx) => (
                      <React.Fragment key={idx}>
                        {idx > 0 && <span className="text-gray-300">+</span>}
                        <span className="bg-orange-50 text-orange-600 text-sm font-semibold px-2 py-0.5 rounded-full">−{d}%</span>
                      </React.Fragment>
                    ))
                  )}
                  {descuentos.propios && (
                    <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium ml-1">exclusivos</span>
                  )}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Mi ganancia (%)</label>
                <div className="flex items-center gap-2">
                  <input type="number" min="0" value={ganancia}
                    onChange={e => cambiarGanancia(parseFloat(e.target.value) || 0)}
                    className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <span className="text-gray-500">%</span>
                </div>
              </div>
              <div className="text-xs text-gray-400 space-y-0.5">
                <p className="font-medium text-gray-500 mb-1">Cálculo aplicado:</p>
                <p>Precio de lista</p>
                {descuentos.d1 > 0 && <p className="text-orange-500">→ − {descuentos.d1}% (descuento 1)</p>}
                {descuentos.d2 > 0 && <p className="text-orange-500">→ − {descuentos.d2}% (descuento 2)</p>}
                {descuentos.d3 > 0 && <p className="text-orange-500">→ − {descuentos.d3}% (descuento 3)</p>}
                <p className="text-blue-500">→ + {cfg.iva}% IVA = Tu costo</p>
                <p className="text-green-500">→ + {ganancia}% ganancia = Precio de venta</p>
              </div>
            </div>
          </div>
        )}

        {/* BUSCADOR + DESCARGA */}
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <input type="text" placeholder="Buscar por código o descripción..."
            value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
            className="flex-1 border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <div className="flex gap-2">
            <button onClick={() => setDescargaAbierta('pdf')}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap">
              ⬇ PDF
            </button>
            <button onClick={() => setDescargaAbierta('excel')}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap">
              ⬇ Excel
            </button>
          </div>
        </div>

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
                  <div key={producto.id_producto} className="bg-white rounded-xl shadow-sm p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-14 h-14 flex-shrink-0 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                        {producto.imagen_producto && !imagenesRotas.has(producto.id_producto) ? (
                          <img src={`${API}/api/imagen?url=${encodeURIComponent(producto.imagen_producto)}`}
                            onError={() => marcarImagenRota(producto.id_producto)}
                            onClick={() => setProductoModal(producto)}
                            className="w-full h-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
                          />
                        ) : <span className="text-xs text-gray-400">Próx.</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 font-mono">{producto.cod_producto}</p>
                        <p className="font-medium text-gray-800 text-sm leading-tight">{arreglarNombre(producto.des_producto)}</p>
                      </div>
                    </div>
                    {cfg.mostrar_precios && (
                      <div className="grid grid-cols-3 gap-2 sm:gap-4 flex-shrink-0 text-right sm:text-right">
                        <div>
                          <p className="text-xs text-gray-400">Lista</p>
                          <p className="text-sm font-semibold text-gray-500">${formatPrecio(producto.precio_producto)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Tu costo</p>
                          <p className="text-sm font-semibold text-blue-600">${formatPrecio(costo)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Venta sugerida</p>
                          <p className="text-base font-bold text-green-600">${formatPrecio(venta)}</p>
                        </div>
                      </div>
                    )}
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
        const { neto, costo, venta } = calcularPrecios(productoModal.precio_producto || 0);
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
                {cfg.mostrar_precios && (
                  <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Precio de lista</span>
                      <span className="font-semibold text-gray-500">${formatPrecio(productoModal.precio_producto)}</span>
                    </div>
                    {descuentos.d1 > 0 && <p className="text-xs text-orange-500 text-right">− {descuentos.d1}%</p>}
                    {descuentos.d2 > 0 && <p className="text-xs text-orange-500 text-right">− {descuentos.d2}%</p>}
                    {descuentos.d3 > 0 && <p className="text-xs text-orange-500 text-right">− {descuentos.d3}%</p>}
                    <div className="flex justify-between">
                      <span className="text-gray-500">Neto con descuentos</span>
                      <span className="font-semibold text-gray-600">${formatPrecio(neto)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Tu costo (+{cfg.iva}% IVA)</span>
                      <span className="font-semibold text-blue-600">${formatPrecio(costo)}</span>
                    </div>
                    <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
                      <span className="text-gray-600 font-medium">Venta sugerida (+{ganancia}%)</span>
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

      {/* MODAL SELECCIÓN DE COLUMNAS PARA DESCARGA */}
      {descargaAbierta && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[60] flex items-center justify-center p-4"
          onClick={() => !descargando && setDescargaAbierta(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm"
            onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b">
              <h2 className="font-bold text-gray-800">
                Descargar lista {descargaAbierta === 'pdf' ? 'en PDF' : 'en Excel'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Elegí las columnas a incluir. Trae todos los productos.</p>
            </div>
            <div className="p-4 space-y-2">
              {columnasVisibles.map(col => (
                <label key={col.key} className="flex items-center gap-3 cursor-pointer py-1">
                  <input type="checkbox" checked={columnasSel.includes(col.key)}
                    onChange={() => toggleColumna(col.key)}
                    className="w-4 h-4 accent-green-600"
                  />
                  <span className="text-sm text-gray-700">{col.label}</span>
                </label>
              ))}
            </div>
            <div className="p-4 pt-0 flex gap-2">
              <button onClick={() => setDescargaAbierta(null)} disabled={descargando}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200 transition-colors disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={() => descargarLista(descargaAbierta)} disabled={descargando}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-medium text-sm hover:bg-green-700 transition-colors disabled:opacity-50">
                {descargando ? 'Descargando...' : 'Descargar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MisPrecios;
