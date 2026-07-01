import React, { useState, useEffect } from 'react';
import type { ItemCarrito, Oferta, OfertaItem } from './Catalogo';

const API = 'https://sistema-pedidos-backend-2hec.onrender.com';

interface Props {
  ofertas: Oferta[];
  carrito: ItemCarrito[];
  setCarrito: React.Dispatch<React.SetStateAction<ItemCarrito[]>>;
  mayorista_id: number;
  cliente: { cuit?: string; nombre?: string };
  onAgregado: () => void;
}

const formatPrecio = (n?: number | null) => (n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const arreglarNombre = (txt?: string | null) => (txt || '').replace(/\uFFFD/g, 'Ñ');

function CajonOfertas({ ofertas, carrito, setCarrito, mayorista_id, cliente, onAgregado }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [cantidadesItemOferta, setCantidadesItemOferta] = useState<Record<string, number>>({});
  const [paquetesOferta, setPaquetesOferta] = useState<Record<number, number>>({});
  const [consultaEnviada, setConsultaEnviada] = useState<Record<number, boolean>>({});

  // Auto-aplicar ofertas tipo 3 (precio especial), 4 (regalo) y 5 (descuento por cantidad)
  useEffect(() => {
    if (ofertas.length === 0) return;

    setCarrito(prev => {
      let cambios = false;

      const autoPorProducto = new Map<number, { precio: number; titulo: string; ofertaId: number }>();

      ofertas.filter(o => o.tipo === 3 && o.activa && o.cantidad_minima).forEach(oferta => {
        const idsGrupo = oferta.items.map((it: OfertaItem) => it.producto_id);
        const totalGrupo = prev
          .filter(i => idsGrupo.includes(i.producto.id_producto))
          .reduce((acc, i) => acc + i.cantidad, 0);
        if (totalGrupo >= (oferta.cantidad_minima || 0)) {
          oferta.items.forEach((item: OfertaItem) => {
            if (item.precio != null) {
              autoPorProducto.set(item.producto_id, { precio: item.precio, titulo: oferta.titulo, ofertaId: oferta.id });
            }
          });
        }
      });

      ofertas.filter(o => o.tipo === 5 && o.activa).forEach(oferta => {
        const item = oferta.items[0];
        if (!item || item.precio == null) return;
        const enCarrito = prev.find(i => i.producto.id_producto === item.producto_id);
        if (!enCarrito) return;
        const cumpleMinimo = oferta.cantidad_minima ? enCarrito.cantidad >= oferta.cantidad_minima : false;
        const precioFinal = cumpleMinimo && oferta.porcentaje_descuento
          ? item.precio * (1 - oferta.porcentaje_descuento / 100)
          : item.precio;
        autoPorProducto.set(item.producto_id, { precio: precioFinal, titulo: oferta.titulo, ofertaId: oferta.id });
      });

      let nuevo = prev.map(i => {
        const auto = autoPorProducto.get(i.producto.id_producto);
        if (auto) {
          if (i.oferta_id_auto === auto.ofertaId && i.precio_oferta === auto.precio && i.oferta_titulo === auto.titulo) {
            return i;
          }
          cambios = true;
          return { ...i, oferta_id_auto: auto.ofertaId, precio_oferta: auto.precio, es_oferta: true, oferta_titulo: auto.titulo };
        } else if (i.oferta_id_auto) {
          cambios = true;
          const { oferta_id_auto: _a, precio_oferta: _p, es_oferta: _e, oferta_titulo: _t, ...resto } = i;
          return resto as ItemCarrito;
        }
        return i;
      });

      const regalosNecesarios = new Map<number, { oferta: Oferta; cantidad: number }>();
      ofertas.filter(o => o.tipo === 4 && o.activa && o.cantidad_minima && o.producto_gratis_id).forEach(oferta => {
        const idsGrupo = oferta.items.map((it: OfertaItem) => it.producto_id);
        const totalGrupo = nuevo
          .filter(i => idsGrupo.includes(i.producto.id_producto) && !i.id.startsWith('regalo-'))
          .reduce((acc, i) => acc + i.cantidad, 0);
        const veces = Math.floor(totalGrupo / (oferta.cantidad_minima || 1));
        if (veces > 0) {
          regalosNecesarios.set(oferta.id, { oferta, cantidad: (oferta.cantidad_gratis || 1) * veces });
        }
      });

      const regalosActuales = nuevo.filter(i => i.id.startsWith('regalo-'));
      regalosActuales.forEach(r => {
        const ofertaId = parseInt(r.id.replace('regalo-', ''));
        if (!regalosNecesarios.has(ofertaId)) {
          cambios = true;
          nuevo = nuevo.filter(i => i.id !== r.id);
        } else {
          const nec = regalosNecesarios.get(ofertaId)!;
          if (r.cantidad !== nec.cantidad) {
            cambios = true;
            nuevo = nuevo.map(i => i.id === r.id ? { ...i, cantidad: nec.cantidad } : i);
          }
          regalosNecesarios.delete(ofertaId);
        }
      });
      regalosNecesarios.forEach((nec, ofertaId) => {
        cambios = true;
        nuevo.push({
          id: `regalo-${ofertaId}`,
          producto: {
            id_producto: nec.oferta.producto_gratis_id || 0,
            cod_producto: nec.oferta.codigo_gratis || '',
            des_producto: nec.oferta.descripcion_gratis || 'Producto sin cargo',
            imagen_producto: '',
            precio_producto: 0,
          },
          cantidad: nec.cantidad,
          es_oferta: true,
          oferta_id: ofertaId,
          oferta_titulo: `${nec.oferta.titulo} (sin cargo)`,
          precio_oferta: 0,
        });
      });

      if (!cambios) return prev;
      return nuevo;
    });
  }, [carrito, ofertas, setCarrito]);

  const agregarOfertaTipo1 = (oferta: Oferta) => {
    const nuevosItems: ItemCarrito[] = [];
    oferta.items.forEach((item: OfertaItem) => {
      const mult = cantidadesItemOferta[`${oferta.id}-${item.id}`] || 0;
      if (mult > 0) {
        const cantidad = mult * (item.cantidad_minima || 1);
        nuevosItems.push({
          id: `oferta-${oferta.id}-${item.id}`,
          producto: {
            id_producto: item.producto_id,
            cod_producto: item.codigo,
            des_producto: item.descripcion,
            imagen_producto: '',
            precio_producto: item.precio || 0,
          },
          cantidad,
          es_oferta: true,
          oferta_id: oferta.id,
          oferta_titulo: oferta.titulo,
          precio_oferta: item.precio || 0,
        });
      }
    });
    if (nuevosItems.length === 0) return;
    setCarrito(prev => {
      let nuevo = [...prev];
      nuevosItems.forEach(ni => {
        const idx = nuevo.findIndex(i => i.id === ni.id);
        if (idx >= 0) nuevo[idx] = { ...nuevo[idx], cantidad: nuevo[idx].cantidad + ni.cantidad };
        else nuevo.push(ni);
      });
      return nuevo;
    });
    setCantidadesItemOferta(prev => {
      const copia = { ...prev };
      oferta.items.forEach((item: OfertaItem) => { delete copia[`${oferta.id}-${item.id}`]; });
      return copia;
    });
    setAbierto(false);
    onAgregado();
  };

  const agregarOfertaTipo2 = (oferta: Oferta) => {
    const paquetes = Math.max(paquetesOferta[oferta.id] || oferta.cantidad_minima || 1, oferta.cantidad_minima || 1);
    const totalUnidadesCombo = oferta.items.reduce((acc, i) => acc + (i.cantidad || 0), 0);
    if (totalUnidadesCombo === 0 || !oferta.precio) return;
    const precioPorUnidad = oferta.precio / totalUnidadesCombo;
    setCarrito(prev => {
      let nuevo = [...prev];
      oferta.items.forEach((item: OfertaItem) => {
        const id = `oferta-${oferta.id}-${item.id}`;
        const cantidad = (item.cantidad || 0) * paquetes;
        const nuevoItem: ItemCarrito = {
          id,
          producto: {
            id_producto: item.producto_id,
            cod_producto: item.codigo,
            des_producto: item.descripcion,
            imagen_producto: '',
            precio_producto: precioPorUnidad,
          },
          cantidad,
          es_oferta: true,
          oferta_id: oferta.id,
          oferta_titulo: oferta.titulo,
          precio_oferta: precioPorUnidad,
        };
        const idx = nuevo.findIndex(i => i.id === id);
        if (idx >= 0) nuevo[idx] = nuevoItem;
        else nuevo.push(nuevoItem);
      });
      return nuevo;
    });
    setAbierto(false);
    onAgregado();
  };

  const modificarCombo = async (oferta: Oferta) => {
    try {
      await fetch(`${API}/api/ofertas/${oferta.id}/consulta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mayorista_id, cliente_cuit: cliente.cuit, cliente_nombre: cliente.nombre })
      });
      setConsultaEnviada(prev => ({ ...prev, [oferta.id]: true }));
      alert('Tu consulta fue enviada. El mayorista se va a comunicar con vos.');
    } catch {
      alert('No se pudo enviar la consulta. Probá de nuevo.');
    }
  };

  if (ofertas.length === 0) return null;

  return (
    <>
      <div className="px-4 pt-4">
        <button onClick={() => setAbierto(true)}
          className="w-full bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-xl p-3 flex items-center justify-between shadow-md hover:shadow-lg transition-shadow">
          <span className="font-bold text-sm">🎁 {ofertas.length} oferta{ofertas.length !== 1 ? 's' : ''} disponible{ofertas.length !== 1 ? 's' : ''}</span>
          <span className="text-xs font-semibold">Ver ofertas →</span>
        </button>
      </div>

      {abierto && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={() => setAbierto(false)}>
          <div className="bg-white w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl p-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold text-gray-800">🎁 Ofertas</h2>
              <button onClick={() => setAbierto(false)} className="text-gray-500 text-2xl">×</button>
            </div>

            {ofertas.map(oferta => {
              if (oferta.tipo === 1) {
                return (
                  <div key={oferta.id} className="border rounded-lg p-3 mb-3">
                    <p className="font-bold text-gray-800">{oferta.titulo}</p>
                    {oferta.descripcion && <p className="text-sm text-gray-500 mb-2">{oferta.descripcion}</p>}
                    <div className="space-y-2">
                      {oferta.items.map(item => (
                        <div key={item.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg p-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 truncate">{arreglarNombre(item.descripcion)}</p>
                            <p className="text-xs text-gray-400">Mín. {item.cantidad_minima || 1} un. · ${formatPrecio(item.precio)} c/u</p>
                          </div>
                          <input type="number" min="0" placeholder="0"
                            value={cantidadesItemOferta[`${oferta.id}-${item.id}`] || ''}
                            onChange={e => setCantidadesItemOferta(prev => ({ ...prev, [`${oferta.id}-${item.id}`]: parseInt(e.target.value) || 0 }))}
                            className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-center" />
                          <span className="text-xs text-gray-400 whitespace-nowrap">x{item.cantidad_minima || 1}</span>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => agregarOfertaTipo1(oferta)}
                      className="mt-2 w-full bg-orange-500 hover:bg-orange-600 text-white py-2 rounded-lg text-sm font-semibold">
                      Agregar al pedido
                    </button>
                  </div>
                );
              }
              if (oferta.tipo === 2) {
                return (
                  <div key={oferta.id} className="border rounded-lg p-3 mb-3">
                    <p className="font-bold text-gray-800">{oferta.titulo}</p>
                    {oferta.descripcion && <p className="text-sm text-gray-500 mb-2">{oferta.descripcion}</p>}
                    <div className="space-y-1 mb-2">
                      {oferta.items.map(item => (
                        <p key={item.id} className="text-sm text-gray-600">• {item.cantidad} x {arreglarNombre(item.descripcion)}</p>
                      ))}
                    </div>
                    <p className="text-blue-600 font-bold mb-2">
                      Precio del combo: ${formatPrecio(oferta.precio)} (mín. {oferta.cantidad_minima || 1} combo{(oferta.cantidad_minima || 1) > 1 ? 's' : ''})
                    </p>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-gray-600">Cantidad de combos:</span>
                      <input type="number" min={oferta.cantidad_minima || 1}
                        value={paquetesOferta[oferta.id] || oferta.cantidad_minima || 1}
                        onChange={e => setPaquetesOferta(prev => ({ ...prev, [oferta.id]: parseInt(e.target.value) || 1 }))}
                        className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-center" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => agregarOfertaTipo2(oferta)}
                        className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-2 rounded-lg text-sm font-semibold">
                        Agregar combo
                      </button>
                      <button onClick={() => modificarCombo(oferta)} disabled={consultaEnviada[oferta.id]}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
                        {consultaEnviada[oferta.id] ? '✅ Consulta enviada' : 'Modificar combo'}
                      </button>
                    </div>
                  </div>
                );
              }
              if (oferta.tipo === 3) {
                return (
                  <div key={oferta.id} className="border rounded-lg p-3 mb-3 bg-blue-50">
                    <p className="font-bold text-gray-800">{oferta.titulo}</p>
                    {oferta.descripcion && <p className="text-sm text-gray-500 mb-2">{oferta.descripcion}</p>}
                    <p className="text-xs text-gray-500 mb-2">Si juntás {oferta.cantidad_minima} unidades entre estos productos, se les aplica el precio especial:</p>
                    <div className="space-y-1">
                      {oferta.items.map(item => (
                        <p key={item.id} className="text-sm text-gray-700">• {arreglarNombre(item.descripcion)} — <span className="text-green-600 font-semibold">${formatPrecio(item.precio)}</span></p>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">Agregá estos productos al carrito desde el catálogo — el precio especial se aplica automáticamente.</p>
                  </div>
                );
              }
              if (oferta.tipo === 4) {
                return (
                  <div key={oferta.id} className="border rounded-lg p-3 mb-3 bg-green-50">
                    <p className="font-bold text-gray-800">{oferta.titulo}</p>
                    {oferta.descripcion && <p className="text-sm text-gray-500 mb-2">{oferta.descripcion}</p>}
                    <p className="text-xs text-gray-500 mb-2">
                      Si juntás {oferta.cantidad_minima} unidades entre estos productos, te regalamos {oferta.cantidad_gratis} x {arreglarNombre(oferta.descripcion_gratis)}:
                    </p>
                    <div className="space-y-1">
                      {oferta.items.map(item => (
                        <p key={item.id} className="text-sm text-gray-700">• {arreglarNombre(item.descripcion)}</p>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">Agregá estos productos al carrito desde el catálogo — el regalo se agrega automáticamente.</p>
                  </div>
                );
              }
              if (oferta.tipo === 5) {
                const item = oferta.items[0];
                return (
                  <div key={oferta.id} className="border rounded-lg p-3 mb-3 bg-purple-50">
                    <p className="font-bold text-gray-800">{oferta.titulo}</p>
                    {oferta.descripcion && <p className="text-sm text-gray-500 mb-2">{oferta.descripcion}</p>}
                    {item && (
                      <>
                        <p className="text-sm text-gray-700">{arreglarNombre(item.descripcion)} — <span className="text-green-600 font-semibold">${formatPrecio(item.precio)}</span></p>
                        <p className="text-xs text-gray-500 mt-1">Si pedís {oferta.cantidad_minima} o más unidades, {oferta.porcentaje_descuento}% extra de descuento.</p>
                      </>
                    )}
                    <p className="text-xs text-gray-400 mt-2">Agregalo al carrito desde el catálogo — el precio y el descuento se aplican automáticamente.</p>
                  </div>
                );
              }
              return null;
            })}
          </div>
        </div>
      )}
    </>
  );
}

export default CajonOfertas;