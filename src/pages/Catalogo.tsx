import React, { useState, useEffect, useMemo, useRef } from 'react';
import CajonOfertas from './CajonOfertas';


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

export interface Producto {
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

export interface ItemCarrito {
  id: string;
  producto: Producto;
  cantidad: number;
  es_oferta?: boolean;
  oferta_id?: number;
  oferta_titulo?: string;
  precio_oferta?: number;
  oferta_id_auto?: number;
}
export interface OfertaItem {
  id: number;
  producto_id: number;
  codigo: string;
  descripcion: string;
  precio: number | null;
  cantidad_minima: number | null;
  cantidad: number | null;
}

export interface Oferta {
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
interface Opciones { marcas: string[]; rubros: string[]; tipos: string[]; }

// === NUEVO (Mejora 4): alerta de oferta activa no aprovechada del todo ===
interface AlertaOferta { oferta: Oferta; mensaje: string; }

const API = 'https://sistema-pedidos-backend-2hec.onrender.com';

function Catalogo() {
  const cliente = JSON.parse(localStorage.getItem('cliente') || '{}');
  const mayorista_id = cliente.mayorista_id;

  const [productos, setProductos] = useState<Producto[]>([]);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(0);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [observaciones, setObservaciones] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [pedidoEditandoId, setPedidoEditandoId] = useState<number | null>(null);
  const [pedidoEditandoNumero, setPedidoEditandoNumero] = useState<string>('');

  const [filtroMarca, setFiltroMarca] = useState('');
  const [filtroRubro, setFiltroRubro] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [ordenPrecio, setOrdenPrecio] = useState('');
  const [opciones, setOpciones] = useState<Opciones>({ marcas: [], rubros: [], tipos: [] });
  const [rubrosFiltrados, setRubrosFiltrados] = useState<string[]>([]);
  const [tiposFiltrados, setTiposFiltrados] = useState<string[]>([]);

  const [productoModal, setProductoModal] = useState<Producto | null>(null);
  const [imagenesRotas, setImagenesRotas] = useState<Set<number>>(new Set());
  const marcarImagenRota = (id: number) => setImagenesRotas(prev => new Set(prev).add(id));

  const [vistaProductos, setVistaProductos] = useState<'tarjetas' | 'lista'>(
    (localStorage.getItem('vista_catalogo') as 'tarjetas' | 'lista') || 'tarjetas'
  );
  const cambiarVista = (v: 'tarjetas' | 'lista') => {
    setVistaProductos(v); localStorage.setItem('vista_catalogo', v);
  };

  const [cfg, setCfg] = useState({
    mostrar_precios: true, mostrar_stock: true,
    mostrar_marca: true, mostrar_rubro: true, mostrar_tipo: true,
    razon_social: '', habilitar_ofertas: false,
    // === NUEVO: estos dos flags todavía no vienen de /configuracion (fuera
    // de alcance tocar mayoristas.js en esta tarea) — quedan leídos
    // defensivamente, listos para funcionar apenas se agreguen al SELECT.
    habilitar_lector_barras: false,
    habilitar_cross_selling: false,
  });

  const [ofertas, setOfertas] = useState<Oferta[]>([]);

  // === NUEVO (Mejora 2): auto-abrir cajón de ofertas al venir de Mis Promociones ===
  // Se calcula de forma síncrona (lazy initializer) porque CajonOfertas solo lee
  // este valor como estado inicial propio — si llegara vía useEffect, ya sería
  // tarde: CajonOfertas habría montado con el valor viejo.
  const [autoAbrirOfertas] = useState(() => new URLSearchParams(window.location.search).get('ofertas') === '1');

  // === NUEVO (Mejora 1): lector de código de barras ===
  const [escanerAbierto, setEscanerAbierto] = useState(false);
  const [escaneoSoportado, setEscaneoSoportado] = useState<boolean | null>(null);
  const [errorEscaneo, setErrorEscaneo] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // === NUEVO (Mejora 3): cross selling ===
  const [crossSelling, setCrossSelling] = useState<Producto[]>([]);
  const [cargandoCrossSelling, setCargandoCrossSelling] = useState(false);

  // === NUEVO (Mejora 4): alertas de ofertas no aprovechadas al confirmar ===
  const [alertasOfertas, setAlertasOfertas] = useState<AlertaOferta[]>([]);
  const [modalAlertasAbierto, setModalAlertasAbierto] = useState(false);

  const hayFiltros = !!(filtroMarca || filtroRubro || filtroTipo);

  useEffect(() => {
    if (!mayorista_id) return;
    fetch(`${API}/api/productos/${mayorista_id}/opciones`)
      .then(r => r.json())
      .then(data => {
        setOpciones({ marcas: data.marcas || [], rubros: data.rubros || [], tipos: data.tipos || [] });
        setRubrosFiltrados(data.rubros || []);
        setTiposFiltrados(data.tipos || []);
      })
      .catch(() => {});
  }, [mayorista_id]);

  // Actualiza rubros y tipos según la marca y rubro seleccionados
  useEffect(() => {
    if (!mayorista_id) return;
    if (!filtroMarca) {
      setRubrosFiltrados(opciones.rubros);
      setTiposFiltrados(opciones.tipos);
      return;
    }
    const params = new URLSearchParams({ marca: filtroMarca });
    if (filtroRubro) params.append('rubro', filtroRubro);
    fetch(`${API}/api/productos/${mayorista_id}/opciones?${params}`)
      .then(r => r.json())
      .then(data => {
        const nuevosRubros = data.rubros || [];
        const nuevosTipos = data.tipos || [];
        setRubrosFiltrados(nuevosRubros);
        setTiposFiltrados(nuevosTipos);
        if (filtroRubro && !nuevosRubros.includes(filtroRubro)) {
          setFiltroRubro('');
          setFiltroTipo('');
        } else if (filtroTipo && !nuevosTipos.includes(filtroTipo)) {
          setFiltroTipo('');
        }
      })
      .catch(() => {});
    // eslint-disable-next-line
  }, [filtroMarca, filtroRubro, mayorista_id]);

  useEffect(() => {
    if (!mayorista_id) return;
    fetch(`${API}/api/mayoristas/${mayorista_id}/configuracion`)
      .then(r => r.json())
      .then(data => setCfg({
        mostrar_precios: data.mostrar_precios ?? true,
        mostrar_stock: data.mostrar_stock ?? true,
        mostrar_marca: data.mostrar_marca ?? true,
        mostrar_rubro: data.mostrar_rubro ?? true,
        mostrar_tipo: data.mostrar_tipo ?? true,
        razon_social: data.razon_social || '',
        habilitar_ofertas: data.habilitar_ofertas ?? false,
        habilitar_lector_barras: data.habilitar_lector_barras ?? false,
        habilitar_cross_selling: data.habilitar_cross_selling ?? false,
      }))
      .catch(() => {});
  }, [mayorista_id]);

  useEffect(() => {
    if (!mayorista_id) return;
    fetch(`${API}/api/ofertas/cliente/${mayorista_id}`)
      .then(r => r.json())
      .then(data => setOfertas(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [mayorista_id]);

  // === NUEVO (Mejora 3): recalcula cross selling 1s después de cada cambio en el carrito ===
  useEffect(() => {
    if (!cfg.habilitar_cross_selling || !mayorista_id || carrito.length === 0) { setCrossSelling([]); return; }
    const timer = setTimeout(() => cargarCrossSelling(), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line
  }, [carrito, cfg.habilitar_cross_selling, mayorista_id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editarId = params.get('editar');
    if (!editarId) return;
    fetch(`${API}/api/pedidos/detalle/${editarId}`)
      .then(r => r.json())
      .then(pedido => {
        if (!pedido || !pedido.items) return;
        const itemsCarrito: ItemCarrito[] = pedido.items.filter((item: any) => item.nombre).map((item: any, idx: number) => ({
          id: item.es_oferta ? `oferta-edit-${idx}` : `prod-${item.producto_id || idx}`,
          producto: {
            id_producto: item.producto_id || 0,
            cod_producto: item.codigo || '',
            des_producto: item.nombre,
            imagen_producto: '',
            precio_producto: item.precio_unitario,
            stock_temporal: 0,
            des_producto_rubro: item.rubro || ''
          },
          cantidad: item.cantidad,
          es_oferta: item.es_oferta || false,
          oferta_titulo: item.oferta_titulo || undefined,
          precio_oferta: item.es_oferta ? item.precio_unitario : undefined,
        }));
        setCarrito(itemsCarrito);
        setPedidoEditandoId(pedido.id);
        setPedidoEditandoNumero(pedido.numero_pedido);
        setCarritoAbierto(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (busqueda.trim() === '' && !hayFiltros) { setProductos([]); setTotal(0); setTotalPaginas(0); return; }
      cargarProductos();
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line
  }, [busqueda, pagina, filtroMarca, filtroRubro, filtroTipo, ordenPrecio]);

  useEffect(() => {
    if (busqueda.trim().length < 3) return;
    const timer = setTimeout(() => {
      if (total === 0 && !cargando) guardarDemanda(busqueda);
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line
  }, [total, busqueda]);

  const productosEnOferta = useMemo(() => {
    const ids = new Set<number>();
    ofertas.forEach(o => {
      if (o.tipo === 3 || o.tipo === 4 || o.tipo === 5) {
        o.items.forEach(it => ids.add(it.producto_id));
      }
    });
    return ids;
  }, [ofertas]);

  const cargarProductos = async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams({ busqueda, pagina: String(pagina) });
      if (filtroMarca) params.append('marca', filtroMarca);
      if (filtroRubro) params.append('rubro', filtroRubro);
      if (filtroTipo) params.append('tipo', filtroTipo);
      if (ordenPrecio) params.append('orden_precio', ordenPrecio);
      const res = await fetch(`${API}/api/productos/${mayorista_id}?${params.toString()}`);
      const data = await res.json();
      setProductos(data.productos || []); setTotal(data.total || 0); setTotalPaginas(data.totalPaginas || 0);
    } catch (error) { console.error(error); } finally { setCargando(false); }
  };

  const limpiarFiltros = () => { setFiltroMarca(''); setFiltroRubro(''); setFiltroTipo(''); setOrdenPrecio(''); setBusqueda(''); setPagina(1); };

  // === NUEVO (Mejora 3): cross selling ===
  const cargarCrossSelling = async () => {
    const codigos = Array.from(new Set(carrito.map(i => i.producto.cod_producto).filter(Boolean)));
    if (codigos.length === 0) { setCrossSelling([]); return; }
    setCargandoCrossSelling(true);
    try {
      const res = await fetch(`${API}/api/productos/${mayorista_id}/cross-selling?codigos=${encodeURIComponent(codigos.join(','))}`);
      const data = await res.json();
      setCrossSelling(Array.isArray(data) ? data : []);
    } catch { setCrossSelling([]); } finally { setCargandoCrossSelling(false); }
  };

  // === NUEVO (Mejora 1): lector de código de barras ===
  const cerrarEscaner = () => {
    setEscanerAbierto(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const procesarCodigoEscaneado = async (codigo: string) => {
    cerrarEscaner();
    try {
      const res = await fetch(`${API}/api/productos/${mayorista_id}/buscar-ean/${encodeURIComponent(codigo)}`);
      const data = await res.json();
      if (data.producto) { setProductoModal(data.producto); return; }
    } catch {}
    // Modo texto: sin match por EAN (o Ivan no soporta ese campo) — buscamos el código como texto
    setBusqueda(codigo);
    setPagina(1);
  };

  const abrirEscaner = async () => {
    setErrorEscaneo('');
    setEscanerAbierto(true);
    if (!('BarcodeDetector' in window)) {
      setEscaneoSoportado(false);
      return;
    }
    setEscaneoSoportado(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const BarcodeDetectorCtor = (window as any).BarcodeDetector;
      const detector = new BarcodeDetectorCtor({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'] });
      const detectar = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codigosDetectados = await detector.detect(videoRef.current);
          if (codigosDetectados.length > 0) { procesarCodigoEscaneado(codigosDetectados[0].rawValue); return; }
        } catch {}
        if (streamRef.current) requestAnimationFrame(detectar);
      };
      requestAnimationFrame(detectar);
    } catch {
      setErrorEscaneo('No se pudo acceder a la cámara. Podés escanear igual con un lector USB/Bluetooth: hacé clic en el buscador y escaneá directamente.');
    }
  };

  // === NUEVO (Mejora 4): alertas de ofertas activas no aprovechadas del todo ===
  const calcularAlertasOfertas = (): AlertaOferta[] => {
    const alertas: AlertaOferta[] = [];
    for (const oferta of ofertasActivas) {
      if (alertas.length >= 5) break;
      const idsGrupo = oferta.items.map(it => it.producto_id);
      const enCarritoGrupo = carrito.filter(i => idsGrupo.includes(i.producto.id_producto) && !i.id.startsWith('regalo-'));
      const totalGrupo = enCarritoGrupo.reduce((acc, i) => acc + i.cantidad, 0);

      if (oferta.tipo === 1 || oferta.tipo === 2) {
        if (enCarritoGrupo.length === 0) {
          alertas.push({ oferta, mensaje: `No aprovechaste la oferta "${oferta.titulo}"` });
        }
      } else if (oferta.tipo === 3 && oferta.cantidad_minima) {
        if (totalGrupo > 0 && totalGrupo < oferta.cantidad_minima) {
          alertas.push({ oferta, mensaje: `Te faltan ${oferta.cantidad_minima - totalGrupo} unidades para el precio especial de "${oferta.titulo}"` });
        }
      } else if (oferta.tipo === 4 && oferta.cantidad_minima) {
        if (totalGrupo > 0 && totalGrupo < oferta.cantidad_minima) {
          alertas.push({ oferta, mensaje: `Te faltan ${oferta.cantidad_minima - totalGrupo} unidades para el regalo de "${oferta.titulo}"` });
        }
      } else if (oferta.tipo === 5 && oferta.cantidad_minima) {
        const item = oferta.items[0];
        if (item) {
          const enCarrito = carrito.find(i => i.producto.id_producto === item.producto_id);
          if (enCarrito && enCarrito.cantidad < oferta.cantidad_minima) {
            alertas.push({ oferta, mensaje: `Agregá ${oferta.cantidad_minima - enCarrito.cantidad} más para el ${oferta.porcentaje_descuento}% de descuento en "${oferta.titulo}"` });
          }
        }
      }
    }
    return alertas;
  };

  const agregarDesdeAlerta = (oferta: Oferta) => {
    if (oferta.tipo === 1) {
      setCarrito(prev => {
        const nuevo = [...prev];
        oferta.items.forEach(item => {
          const id = `oferta-${oferta.id}-${item.id}`;
          const cantidad = item.cantidad_minima || 1;
          const idx = nuevo.findIndex(i => i.id === id);
          if (idx >= 0) nuevo[idx] = { ...nuevo[idx], cantidad: nuevo[idx].cantidad + cantidad };
          else nuevo.push({
            id, cantidad, es_oferta: true, oferta_id: oferta.id, oferta_titulo: oferta.titulo, precio_oferta: item.precio || 0,
            producto: { id_producto: item.producto_id, cod_producto: item.codigo, des_producto: item.descripcion, imagen_producto: '', precio_producto: item.precio || 0 },
          });
        });
        return nuevo;
      });
    } else if (oferta.tipo === 2) {
      const paquetes = oferta.cantidad_minima || 1;
      const totalUnidadesCombo = oferta.items.reduce((acc, i) => acc + (i.cantidad || 0), 0);
      if (totalUnidadesCombo === 0 || !oferta.precio) return;
      const precioPorUnidad = oferta.precio / totalUnidadesCombo;
      setCarrito(prev => {
        const nuevo = [...prev];
        oferta.items.forEach(item => {
          const id = `oferta-${oferta.id}-${item.id}`;
          const cantidad = (item.cantidad || 0) * paquetes;
          const nuevoItem: ItemCarrito = {
            id, cantidad, es_oferta: true, oferta_id: oferta.id, oferta_titulo: oferta.titulo, precio_oferta: precioPorUnidad,
            producto: { id_producto: item.producto_id, cod_producto: item.codigo, des_producto: item.descripcion, imagen_producto: '', precio_producto: precioPorUnidad },
          };
          const idx = nuevo.findIndex(i => i.id === id);
          if (idx >= 0) nuevo[idx] = nuevoItem; else nuevo.push(nuevoItem);
        });
        return nuevo;
      });
    } else if (oferta.tipo === 3 || oferta.tipo === 4) {
      const item = oferta.items[0];
      if (!item) return;
      const idsGrupo = oferta.items.map(it => it.producto_id);
      setCarrito(prev => {
        const totalGrupo = prev.filter(i => idsGrupo.includes(i.producto.id_producto)).reduce((acc, i) => acc + i.cantidad, 0);
        const faltante = Math.max(1, (oferta.cantidad_minima || 1) - totalGrupo);
        const id = `prod-${item.producto_id}`;
        const idx = prev.findIndex(i => i.id === id);
        if (idx >= 0) {
          const nuevo = [...prev];
          nuevo[idx] = { ...nuevo[idx], cantidad: nuevo[idx].cantidad + faltante };
          return nuevo;
        }
        return [...prev, { id, cantidad: faltante, producto: { id_producto: item.producto_id, cod_producto: item.codigo, des_producto: item.descripcion, imagen_producto: '', precio_producto: item.precio || 0 } }];
      });
    } else if (oferta.tipo === 5) {
      const item = oferta.items[0];
      if (!item) return;
      setCarrito(prev => {
        const id = `prod-${item.producto_id}`;
        const cantidadObjetivo = oferta.cantidad_minima || 1;
        const idx = prev.findIndex(i => i.id === id);
        if (idx >= 0) {
          const nuevo = [...prev];
          nuevo[idx] = { ...nuevo[idx], cantidad: Math.max(nuevo[idx].cantidad, cantidadObjetivo) };
          return nuevo;
        }
        return [...prev, { id, cantidad: cantidadObjetivo, producto: { id_producto: item.producto_id, cod_producto: item.codigo, des_producto: item.descripcion, imagen_producto: '', precio_producto: item.precio || 0 } }];
      });
    }
  };

  const confirmarEnviar = () => {
    if (!cfg.habilitar_ofertas) { enviarPedido('enviado'); return; }
    const alertas = calcularAlertasOfertas();
    if (alertas.length === 0) { enviarPedido('enviado'); return; }
    setAlertasOfertas(alertas);
    setModalAlertasAbierto(true);
  };

  const guardarDemanda = async (texto: string) => {
    if (!texto || texto.trim().length < 3 || !mayorista_id) return;
    try {
      await fetch(`${API}/api/demanda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mayorista_id,
          busqueda: texto.trim(),
          cliente_nombre: cliente.nombre || ''
        })
      });
    } catch {}
  };

  const agregarAlCarrito = (producto: Producto) => {
    const id = `prod-${producto.id_producto}`;
    setCarrito(prev => {
      const existe = prev.find(i => i.id === id);
      if (existe) return prev.map(i => i.id === id ? { ...i, cantidad: i.cantidad + 1 } : i);
      return [...prev, { id, producto, cantidad: 1 }];
    });
  };

  const cambiarCantidad = (id: string, cantidad: number) => {
    if (cantidad <= 0) setCarrito(prev => prev.filter(i => i.id !== id));
    else setCarrito(prev => prev.map(i => i.id === id ? { ...i, cantidad } : i));
  };

  const enviarPedido = async (estado: 'borrador' | 'enviado') => {
    if (carrito.length === 0) return;
    setEnviando(true);
    try {
      let numeroPedido = pedidoEditandoNumero;
      if (!pedidoEditandoId) {
        if (estado === 'enviado') {
          const resNum = await fetch(`${API}/api/mayoristas/${mayorista_id}/proximo-numero`);
          const dataNum = await resNum.json();
          numeroPedido = String(dataNum.numero);
        } else {
          numeroPedido = `PED-${Date.now()}`;
        }
      }
      const url = pedidoEditandoId ? `${API}/api/pedidos/${pedidoEditandoId}` : `${API}/api/pedidos`;
      const method = pedidoEditandoId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mayorista_id: cliente.mayorista_id, cliente_cuit: cliente.cuit, cliente_nombre: cliente.nombre,
          numero_pedido: numeroPedido,
          descuento: 0, total_estimado: total_carrito, observaciones, tamanio_hoja: 'A4', estado,
          items: carrito.map(i => ({
            producto_id: i.producto.id_producto, codigo: i.producto.cod_producto,
            nombre: i.producto.des_producto, rubro: i.producto.des_producto_rubro || '',
            cantidad: i.cantidad, precio_unitario: i.precio_oferta ?? i.producto.precio_producto ?? 0,
            es_oferta: i.es_oferta || false, oferta_titulo: i.oferta_titulo || null
          }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error('Error');
      setCarrito([]); setCarritoAbierto(false); setObservaciones('');
      setPedidoEditandoId(null); setPedidoEditandoNumero('');
      if (estado === 'enviado' && data.ivan_error) {
        alert('✅ Pedido enviado correctamente a nuestro sistema.\n⚠️ Atención: no llegó al sistema del mayorista. Comunicate con el mayorista.');
      } else {
        alert(estado === 'borrador' ? '✅ Borrador guardado' : '✅ Pedido enviado al mayorista');
      }
    } catch (error) { alert('Error al guardar el pedido'); } finally { setEnviando(false); }
  };

  const formatPrecio = (n?: number) => (n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const arreglarNombre = (txt?: string) => (txt || '').replace(/\uFFFD/g, 'Ñ');
  const totalItems = carrito.reduce((acc, i) => acc + i.cantidad, 0);
  const total_carrito = Math.round(carrito.reduce((acc, i) => acc + ((i.precio_oferta ?? i.producto.precio_producto ?? 0) * i.cantidad), 0) * 100) / 100;

  const ControlCantidad = ({ producto }: { producto: Producto }) => {
    const id = `prod-${producto.id_producto}`;
    const enCarrito = carrito.find(i => i.id === id);
    if (!enCarrito) return (
      <button onClick={() => agregarAlCarrito(producto)}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors whitespace-nowrap">
        Agregar
      </button>
    );
    return (
      <div className="flex items-center border border-blue-300 rounded-lg overflow-hidden">
        <button onClick={() => cambiarCantidad(id, enCarrito.cantidad - 1)}
          className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold">−</button>
        <input type="number" min="1" value={enCarrito.cantidad}
          onChange={e => cambiarCantidad(id, parseInt(e.target.value) || 1)}
          className="w-12 text-center font-semibold text-gray-800 border-none outline-none py-2"
        />
        <button onClick={() => cambiarCantidad(id, enCarrito.cantidad + 1)}
          className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold">+</button>
      </div>
    );
  };

  const ofertasActivas = cfg.habilitar_ofertas ? ofertas : [];

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
            <h1 className="text-lg font-bold text-blue-600">
              {pedidoEditandoId ? '✏️ Editando borrador' : 'Catálogo'}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href="/cliente" className="text-sm text-gray-500 hover:text-gray-700 font-medium">← Volver</a>
          <button onClick={() => setCarritoAbierto(true)}
            className="relative bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
            🛒 {pedidoEditandoId ? 'Borrador' : 'Carrito'}
            {totalItems > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                {totalItems}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* CAJÓN DE OFERTAS */}
      <CajonOfertas
        ofertas={ofertasActivas}
        carrito={carrito}
        setCarrito={setCarrito}
        mayorista_id={mayorista_id}
        cliente={cliente}
        onAgregado={() => setCarritoAbierto(true)}
        autoAbrir={autoAbrirOfertas}
      />

      {/* CATÁLOGO */}
      <div className="p-4">
        <div className="flex gap-2 mb-3">
          <input type="text" placeholder="Buscar por código, descripción o marca. (mín. 3 caracteres)"
            value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
            className="flex-1 border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {/* === NUEVO (Mejora 1): lector de código de barras === */}
          {cfg.habilitar_lector_barras && (
            <button onClick={abrirEscaner} title="Escanear código de barras"
              className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium whitespace-nowrap">
              📷 Escanear
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {cfg.mostrar_marca && (
            <select value={filtroMarca} onChange={e => { setFiltroMarca(e.target.value); setPagina(1); }}
              className="flex-1 min-w-[140px] border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todas las marcas</option>
              {opciones.marcas.map(m => <option key={m} value={m}>{arreglarNombre(m)}</option>)}
            </select>
          )}
          {cfg.mostrar_rubro && (
            <select value={filtroRubro} onChange={e => { setFiltroRubro(e.target.value); setPagina(1); }}
              className="flex-1 min-w-[140px] border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todos los rubros</option>
              {rubrosFiltrados.map(r => <option key={r} value={r}>{arreglarNombre(r)}</option>)}
            </select>
          )}
          {cfg.mostrar_tipo && (
            <select value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setPagina(1); }}
              className="flex-1 min-w-[140px] border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todos los tipos</option>
              {tiposFiltrados.map(t => <option key={t} value={t}>{arreglarNombre(t)}</option>)}
            </select>
          )}
          <select value={ordenPrecio} onChange={e => { setOrdenPrecio(e.target.value); setPagina(1); }}
            className="flex-1 min-w-[140px] border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Orden por defecto</option>
            <option value="asc">Precio: menor a mayor</option>
            <option value="desc">Precio: mayor a menor</option>
          </select>
          {(hayFiltros || busqueda || ordenPrecio) && (
            <button onClick={limpiarFiltros}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors whitespace-nowrap">
              Limpiar
            </button>
          )}
        </div>

        {cargando ? (
          <div className="text-center py-12 text-gray-400">Buscando productos...</div>
        ) : (busqueda.trim() === '' && !hayFiltros) ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-6xl mb-4">🔍</div>
            <p className="text-lg">Buscá por código o descripción, o filtrá por marca, rubro o tipo</p>
          </div>
        ) : productos.length === 0 ? (
          <div className="text-center py-20 text-gray-400">No se encontraron productos con esos criterios</div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-500">{total} productos encontrados</p>
              <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                <button onClick={() => cambiarVista('tarjetas')} title="Vista tarjetas"
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${vistaProductos === 'tarjetas' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>⊞</button>
                <button onClick={() => cambiarVista('lista')} title="Vista lista"
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${vistaProductos === 'lista' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>☰</button>
              </div>
            </div>

            {vistaProductos === 'tarjetas' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {productos.map(producto => (
                  <div key={producto.id_producto} className="bg-white rounded-xl shadow-sm overflow-hidden">
                    <div className="h-48 bg-gray-100 flex items-center justify-center p-2">
                      {producto.imagen_producto && !imagenesRotas.has(producto.id_producto) ? (
                        <img src={`${API}/api/imagen?url=${encodeURIComponent(producto.imagen_producto)}`} alt=""
                          onClick={() => setProductoModal(producto)}
                          onError={() => marcarImagenRota(producto.id_producto)}
                          className="max-w-full max-h-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
                        />
                      ) : <span className="text-sm font-medium text-gray-400 select-none">Próximamente</span>}
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-gray-600 font-mono font-semibold">{producto.cod_producto}</p>
                        {productosEnOferta.has(producto.id_producto) && (
                          <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-semibold">🎁 Oferta</span>
                        )}
                      </div>
                      <h3 className="font-semibold text-gray-800 mb-1">{arreglarNombre(producto.des_producto)}</h3>
                      {cfg.mostrar_precios && <p className="text-lg font-bold text-blue-600 mb-3">${formatPrecio(producto.precio_producto)}</p>}
                      <ControlCantidad producto={producto} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {vistaProductos === 'lista' && (
              <div className="space-y-2">
                {productos.map(producto => (
                  <div key={producto.id_producto} className="bg-white rounded-xl shadow-sm p-3 flex items-center gap-3">
                    <div className="w-16 h-16 flex-shrink-0 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                      {producto.imagen_producto && !imagenesRotas.has(producto.id_producto) ? (
                        <img src={`${API}/api/imagen?url=${encodeURIComponent(producto.imagen_producto)}`} alt=""
                          onClick={() => setProductoModal(producto)}
                          onError={() => marcarImagenRota(producto.id_producto)}
                          className="max-w-full max-h-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
                        />
                      ) : <span className="text-xs text-gray-400 text-center leading-tight">Próx.</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-gray-500 font-mono font-semibold">{producto.cod_producto}</p>
                        {productosEnOferta.has(producto.id_producto) && (
                          <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-semibold">🎁 Oferta</span>
                        )}
                      </div>
                      <p className="font-medium text-gray-800 text-sm leading-tight">{arreglarNombre(producto.des_producto)}</p>
                      {cfg.mostrar_precios && <p className="text-blue-600 font-bold text-sm mt-0.5">${formatPrecio(producto.precio_producto)}</p>}
                    </div>
                    <div className="flex-shrink-0"><ControlCantidad producto={producto} /></div>
                  </div>
                ))}
              </div>
            )}

            {/* === NUEVO (Mejora 3): cross selling === */}
            {cfg.habilitar_cross_selling && carrito.length > 0 && (cargandoCrossSelling || crossSelling.length > 0) && (
              <div className="mt-6 border-t pt-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">También te puede interesar</p>
                {cargandoCrossSelling ? (
                  <p className="text-sm text-gray-400">Buscando sugerencias...</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {crossSelling.map(p => (
                      <div key={p.id_producto} className="bg-white rounded-lg shadow-sm p-2">
                        <div className="h-20 bg-gray-100 rounded flex items-center justify-center mb-1 overflow-hidden">
                          {p.imagen_producto ? (
                            <img src={`${API}/api/imagen?url=${encodeURIComponent(p.imagen_producto)}`} alt=""
                              className="max-h-full max-w-full object-contain" />
                          ) : <span className="text-xs text-gray-400">Sin imagen</span>}
                        </div>
                        <p className="text-xs text-gray-800 font-medium leading-tight">{arreglarNombre(p.des_producto)}</p>
                        {cfg.mostrar_precios && <p className="text-xs text-blue-600 font-bold mt-0.5">${formatPrecio(p.precio_producto)}</p>}
                        <button onClick={() => agregarAlCarrito(p)}
                          className="mt-1 w-full bg-blue-600 hover:bg-blue-700 text-white text-xs py-1 rounded">
                          + Agregar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

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

      {/* CARRITO */}
      {carritoAbierto && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-end">
          <div className="bg-white w-full max-w-md h-full flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">{pedidoEditandoId ? '✏️ Editando borrador' : 'Mi pedido'}</h2>
              <button onClick={() => setCarritoAbierto(false)} className="text-gray-500 text-2xl">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {carrito.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No hay productos en el pedido</p>
              ) : carrito.map(item => (
                <div key={item.id} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                  <div className="flex-1">
                    <p className="text-xs text-gray-400">{item.producto.cod_producto}</p>
                    <p className="font-medium text-gray-800">{arreglarNombre(item.producto.des_producto)}</p>
                    {item.es_oferta && (
                      <p className="text-xs text-orange-600 font-semibold">🎁 {item.oferta_titulo}</p>
                    )}
                    {cfg.mostrar_precios && (
                      <p className="text-sm text-blue-600">
                        ${formatPrecio((item.precio_oferta ?? item.producto.precio_producto ?? 0) * item.cantidad)}
                      </p>
                    )}
                  </div>
                  {item.id.startsWith('regalo-') ? (
                    <span className="text-green-600 font-bold text-sm whitespace-nowrap">GRATIS x{item.cantidad}</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button onClick={() => cambiarCantidad(item.id, item.cantidad - 1)}
                        className="w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center text-gray-600">−</button>
                      <input type="number" min="1" value={item.cantidad}
                        onChange={e => cambiarCantidad(item.id, parseInt(e.target.value) || 1)}
                        className="w-10 text-center font-semibold border border-gray-200 rounded"
                      />
                      <button onClick={() => cambiarCantidad(item.id, item.cantidad + 1)}
                        className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">+</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {carrito.length > 0 && cfg.mostrar_precios && (
              <div className="p-4 border-t">
                <div className="flex justify-between font-bold text-lg text-gray-800">
                  <span>Total estimado</span><span>${formatPrecio(total_carrito)}</span>
                </div>
              </div>
            )}
            {carrito.length > 0 && (
              <div className="p-4 space-y-3">
                <textarea placeholder="Observaciones (opcional)" value={observaciones}
                  onChange={e => setObservaciones(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" rows={2}
                />
                <button onClick={() => enviarPedido('borrador')} disabled={enviando}
                  className="w-full bg-gray-500 hover:bg-gray-600 text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-50">
                  💾 Guardar borrador
                </button>
                <button onClick={confirmarEnviar} disabled={enviando}
                  className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-50">
                  {enviando ? 'Enviando...' : '✅ Confirmar y enviar'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="bg-white border-t text-center py-2 text-xs text-gray-400">
        Gestión Integral Pedidos
      </footer>

      {/* MODAL PRODUCTO */}
      {productoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[60] flex items-end sm:items-center justify-center"
          onClick={() => setProductoModal(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>

            {/* Encabezado */}
            <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-white z-10">
              <p className="text-xs text-gray-400 font-mono font-semibold tracking-wide">{productoModal.cod_producto}</p>
              <button onClick={() => setProductoModal(null)}
                className="text-gray-400 hover:text-gray-600 text-3xl leading-none w-8 h-8 flex items-center justify-center">×</button>
            </div>

            {/* Imagen */}
            <div className="bg-gray-50 flex items-center justify-center py-6 px-4 min-h-[180px]">
              {productoModal.imagen_producto && !imagenesRotas.has(productoModal.id_producto) ? (
                <img
                  src={`${API}/api/imagen?url=${encodeURIComponent(productoModal.imagen_producto)}`}
                  alt=""
                  onError={() => marcarImagenRota(productoModal.id_producto)}
                  className="max-h-56 max-w-full object-contain"
                />
              ) : (
                <span className="text-sm text-gray-400">Sin imagen disponible</span>
              )}
            </div>

            {/* Detalles */}
            <div className="p-4 space-y-4">
              <h2 className="text-base font-bold text-gray-800 leading-snug">{arreglarNombre(productoModal.des_producto)}</h2>

              {cfg.mostrar_precios && (
                <p className="text-2xl font-bold text-blue-600">${formatPrecio(productoModal.precio_producto)}</p>
              )}

              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {cfg.mostrar_stock && productoModal.stock_temporal != null && (
                  <div>
                    <p className="text-xs text-gray-400">Stock</p>
                    <p className="font-medium text-gray-700">{productoModal.stock_temporal}</p>
                  </div>
                )}
                {cfg.mostrar_marca && productoModal.des_producto_marca && (
                  <div>
                    <p className="text-xs text-gray-400">Marca</p>
                    <p className="font-medium text-gray-700">{arreglarNombre(productoModal.des_producto_marca)}</p>
                  </div>
                )}
                {cfg.mostrar_rubro && productoModal.des_producto_rubro && (
                  <div>
                    <p className="text-xs text-gray-400">Rubro</p>
                    <p className="font-medium text-gray-700">{arreglarNombre(productoModal.des_producto_rubro)}</p>
                  </div>
                )}
                {cfg.mostrar_tipo && productoModal.des_producto_tipo && (
                  <div>
                    <p className="text-xs text-gray-400">Tipo</p>
                    <p className="font-medium text-gray-700">{arreglarNombre(productoModal.des_producto_tipo)}</p>
                  </div>
                )}
              </div>

              {(() => {
                const obs = (productoModal as any).observaciones || null;
                const pres = (productoModal as any).presentacion || null;
                return (obs || pres) ? (
                  <div className="space-y-2">
                    {obs && (
                      <div>
                        <p className="text-xs text-gray-400">Observaciones</p>
                        <p className="text-sm text-gray-700">{obs}</p>
                      </div>
                    )}
                    {pres && (
                      <div>
                        <p className="text-xs text-gray-400">Presentación</p>
                        <p className="text-sm text-gray-700">{pres}</p>
                      </div>
                    )}
                  </div>
                ) : null;
              })()}

              <div className="pt-2 border-t">
                <ControlCantidad producto={productoModal} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ESCÁNER (Mejora 1) */}
      {escanerAbierto && (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-[70] flex items-center justify-center p-4" onClick={cerrarEscaner}>
          <div className="bg-white rounded-2xl p-4 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-800">📷 Escanear código</h3>
              <button onClick={cerrarEscaner} className="text-gray-400 text-2xl leading-none">×</button>
            </div>
            {escaneoSoportado === false ? (
              <div className="text-center py-6">
                <p className="text-sm text-gray-600 mb-2">Tu navegador no soporta escaneo por cámara.</p>
                <p className="text-sm text-gray-500">Si tenés un lector de código de barras USB/Bluetooth, hacé clic en el buscador y escaneá directamente — funciona como un teclado.</p>
              </div>
            ) : errorEscaneo ? (
              <p className="text-sm text-red-500 text-center py-6">{errorEscaneo}</p>
            ) : (
              <>
                <video ref={videoRef} className="w-full rounded-lg bg-black" muted playsInline />
                <p className="text-xs text-gray-400 text-center mt-2">Apuntá la cámara al código de barras</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL ALERTAS DE OFERTAS (Mejora 4) */}
      {modalAlertasAbierto && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[70] flex items-center justify-center p-4"
          onClick={() => setModalAlertasAbierto(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-1">¿Aprovechás antes de confirmar?</h3>
            <p className="text-sm text-gray-500 mb-4">Estas ofertas están disponibles y todavía no las sumaste del todo:</p>
            <div className="space-y-2 mb-4">
              {alertasOfertas.map((a, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2 bg-orange-50 border border-orange-100 rounded-lg p-3">
                  <p className="text-sm text-gray-700 flex-1">{a.mensaje}</p>
                  <button onClick={() => agregarDesdeAlerta(a.oferta)}
                    className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap">
                    Agregar
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModalAlertasAbierto(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg text-sm font-semibold">
                Seguir revisando
              </button>
              <button onClick={() => { setModalAlertasAbierto(false); enviarPedido('enviado'); }}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg text-sm font-semibold">
                Confirmar igual
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Catalogo;