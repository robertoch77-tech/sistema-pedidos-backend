import React, { useState, useEffect } from 'react';

const API = 'https://sistema-pedidos-backend-2hec.onrender.com';

interface OfertaItem {
  id?: number;
  producto_id: number;
  codigo: string;
  descripcion: string;
  precio?: number | null;
  cantidad_minima?: number | null;
  cantidad?: number | null;
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
  imagen_url: string | null;
  activa: boolean;
  items: OfertaItem[];
}

interface Consulta {
  id: number;
  oferta_id: number;
  oferta_titulo: string;
  cliente_cuit: string;
  cliente_nombre: string;
  fecha: string;
  atendida: boolean;
}

interface ProductoBusqueda {
  id_producto: number;
  cod_producto: string;
  des_producto: string;
  precio_producto: number;
  imagen_producto?: string;
}

const tipoInfo: Record<number, { label: string; ayuda: string }> = {
  1: { label: 'Surtido — precio por producto', ayuda: 'Elegís varios productos. A cada uno le ponés su precio especial y su cantidad mínima propia. El cliente pide los que quiera, en múltiplos de la cantidad mínima de cada uno.' },
  2: { label: 'Combo fijo', ayuda: 'Armás un combo de productos en cantidades fijas, a un precio total. El cliente lo pide completo, en múltiplos de "cantidad de paquetes".' },
  3: { label: 'Surtido mixto — cantidad mínima', ayuda: 'Elegís varios productos, cada uno con su precio especial. Si el cliente junta entre todos ellos una cantidad mínima total, se le aplican esos precios especiales.' },
  4: { label: 'Cantidad mínima → producto gratis', ayuda: 'Elegís varios productos. Si el cliente junta entre todos ellos una cantidad mínima total, recibe gratis una cantidad de un producto que elijas.' },
  5: { label: 'Descuento por cantidad', ayuda: 'Un solo producto con un precio especial. Si el cliente pide una cantidad mínima, se le aplica además un % extra de descuento.' },
};

const emptyForm = {
  tipo: 1,
  titulo: '',
  descripcion: '',
  fecha_inicio: '',
  fecha_fin: '',
  precio: '',
  cantidad_minima: '',
  porcentaje_descuento: '',
  producto_gratis_id: null as number | null,
  codigo_gratis: '',
  descripcion_gratis: '',
  cantidad_gratis: '',
  imagen_url: '',
  items: [] as OfertaItem[],
};

const formatPrecio = (n?: number | null) => (n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const arreglarNombre = (txt?: string) => (txt || '').replace(/\uFFFD/g, 'Ñ');

function Ofertas() {
  const mayorista = JSON.parse(localStorage.getItem('mayorista') || '{}');

  const [tab, setTab] = useState<'ofertas' | 'consultas'>('ofertas');
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [consultas, setConsultas] = useState<Consulta[]>([]);
  const [cargando, setCargando] = useState(false);

  const [vista, setVista] = useState<'lista' | 'form'>('lista');
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [resultadosProducto, setResultadosProducto] = useState<ProductoBusqueda[]>([]);
  const [buscandoProducto, setBuscandoProducto] = useState(false);

  const [busquedaGratis, setBusquedaGratis] = useState('');
  const [resultadosGratis, setResultadosGratis] = useState<ProductoBusqueda[]>([]);
  const [buscandoGratis, setBuscandoGratis] = useState(false);

  const [origenImagen, setOrigenImagen] = useState<'ivan' | 'url'>('ivan');
  const [busquedaImagen, setBusquedaImagen] = useState('');
  const [resultadosImagen, setResultadosImagen] = useState<ProductoBusqueda[]>([]);
  const [buscandoImagen, setBuscandoImagen] = useState(false);
  const [previewImagenRota, setPreviewImagenRota] = useState(false);

  useEffect(() => { cargarOfertas(); cargarConsultas(); }, []);

  const cargarOfertas = async () => {
    setCargando(true);
    try {
      const res = await fetch(`${API}/api/ofertas/${mayorista.id}`);
      const data = await res.json();
      setOfertas(Array.isArray(data) ? data : []);
    } catch {} finally { setCargando(false); }
  };

  const cargarConsultas = async () => {
    try {
      const res = await fetch(`${API}/api/ofertas/consultas/${mayorista.id}`);
      const data = await res.json();
      setConsultas(Array.isArray(data) ? data : []);
    } catch {}
  };

  useEffect(() => {
    if (busquedaProducto.trim().length < 3) { setResultadosProducto([]); return; }
    const timer = setTimeout(async () => {
      setBuscandoProducto(true);
      try {
        const res = await fetch(`${API}/api/productos/${mayorista.id}?busqueda=${encodeURIComponent(busquedaProducto.trim())}&pagina=1`);
        const data = await res.json();
        setResultadosProducto(data.productos || []);
      } catch {} finally { setBuscandoProducto(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [busquedaProducto]);

  useEffect(() => {
    if (busquedaGratis.trim().length < 3) { setResultadosGratis([]); return; }
    const timer = setTimeout(async () => {
      setBuscandoGratis(true);
      try {
        const res = await fetch(`${API}/api/productos/${mayorista.id}?busqueda=${encodeURIComponent(busquedaGratis.trim())}&pagina=1`);
        const data = await res.json();
        setResultadosGratis(data.productos || []);
      } catch {} finally { setBuscandoGratis(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [busquedaGratis]);

  useEffect(() => {
    if (origenImagen !== 'ivan' || busquedaImagen.trim().length < 3) { setResultadosImagen([]); return; }
    const timer = setTimeout(async () => {
      setBuscandoImagen(true);
      try {
        const res = await fetch(`${API}/api/productos/${mayorista.id}?busqueda=${encodeURIComponent(busquedaImagen.trim())}&pagina=1`);
        const data = await res.json();
        setResultadosImagen(data.productos || []);
      } catch {} finally { setBuscandoImagen(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [busquedaImagen, origenImagen]);

  const abrirNueva = () => {
    setForm({ ...emptyForm });
    setEditandoId(null);
    setError('');
    setBusquedaProducto(''); setResultadosProducto([]);
    setBusquedaGratis(''); setResultadosGratis([]);
    setOrigenImagen('ivan'); setBusquedaImagen(''); setResultadosImagen([]); setPreviewImagenRota(false);
    setVista('form');
  };

  const abrirEditar = (oferta: Oferta) => {
    setForm({
      tipo: oferta.tipo,
      titulo: oferta.titulo,
      descripcion: oferta.descripcion || '',
      fecha_inicio: oferta.fecha_inicio ? oferta.fecha_inicio.substring(0, 10) : '',
      fecha_fin: oferta.fecha_fin ? oferta.fecha_fin.substring(0, 10) : '',
      precio: oferta.precio != null ? String(oferta.precio) : '',
      cantidad_minima: oferta.cantidad_minima != null ? String(oferta.cantidad_minima) : '',
      porcentaje_descuento: oferta.porcentaje_descuento != null ? String(oferta.porcentaje_descuento) : '',
      producto_gratis_id: oferta.producto_gratis_id,
      codigo_gratis: oferta.codigo_gratis || '',
      descripcion_gratis: oferta.descripcion_gratis || '',
      cantidad_gratis: oferta.cantidad_gratis != null ? String(oferta.cantidad_gratis) : '',
      imagen_url: oferta.imagen_url || '',
      items: (oferta.items || []).map(i => ({ ...i })),
    });
    setEditandoId(oferta.id);
    setError('');
    setBusquedaProducto(''); setResultadosProducto([]);
    setBusquedaGratis(''); setResultadosGratis([]);
    setOrigenImagen('ivan'); setBusquedaImagen(''); setResultadosImagen([]); setPreviewImagenRota(false);
    setVista('form');
  };

  const agregarProducto = (p: ProductoBusqueda) => {
    if (form.items.some(i => i.producto_id === p.id_producto)) return;
    const nuevoItem: OfertaItem = {
      producto_id: p.id_producto,
      codigo: p.cod_producto,
      descripcion: arreglarNombre(p.des_producto),
      precio: (form.tipo === 1 || form.tipo === 3 || form.tipo === 5) ? p.precio_producto : null,
      cantidad_minima: form.tipo === 1 ? 1 : null,
      cantidad: form.tipo === 2 ? 1 : null,
    };
    setForm(prev => ({ ...prev, items: [...prev.items, nuevoItem] }));
    setBusquedaProducto(''); setResultadosProducto([]);
  };

  const quitarProducto = (idx: number) => {
    setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  };

  const actualizarItem = (idx: number, field: 'precio' | 'cantidad_minima' | 'cantidad', value: string) => {
    const num = value === '' ? null : parseFloat(value);
    setForm(prev => ({
      ...prev,
      items: prev.items.map((it, i) => i === idx ? { ...it, [field]: num } : it)
    }));
  };

  const seleccionarGratis = (p: ProductoBusqueda) => {
    setForm(prev => ({
      ...prev,
      producto_gratis_id: p.id_producto,
      codigo_gratis: p.cod_producto,
      descripcion_gratis: arreglarNombre(p.des_producto),
    }));
    setBusquedaGratis(''); setResultadosGratis([]);
  };

  const guardar = async () => {
    setError('');
    if (!form.titulo.trim()) { setError('Ponele un título a la oferta'); return; }
    if (form.items.length === 0) { setError('Agregá al menos un producto'); return; }
    if (form.tipo === 4 && !form.producto_gratis_id) { setError('Elegí el producto que se da gratis'); return; }
    if (form.tipo === 5 && form.items.length !== 1) { setError('El tipo 5 es para un solo producto'); return; }

    const body = {
      mayorista_id: mayorista.id,
      tipo: form.tipo,
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim(),
      precio: form.precio !== '' ? parseFloat(form.precio) : null,
      cantidad_minima: form.cantidad_minima !== '' ? parseFloat(form.cantidad_minima) : null,
      producto_gratis_id: form.producto_gratis_id,
      codigo_gratis: form.codigo_gratis || null,
      descripcion_gratis: form.descripcion_gratis || null,
      cantidad_gratis: form.cantidad_gratis !== '' ? parseFloat(form.cantidad_gratis) : null,
      porcentaje_descuento: form.porcentaje_descuento !== '' ? parseFloat(form.porcentaje_descuento) : null,
      fecha_inicio: form.fecha_inicio || null,
      fecha_fin: form.fecha_fin || null,
      imagen_url: form.imagen_url || null,
      items: form.items.map(i => ({
        producto_id: i.producto_id,
        codigo: i.codigo,
        descripcion: i.descripcion,
        precio: i.precio ?? null,
        cantidad_minima: i.cantidad_minima ?? null,
        cantidad: i.cantidad ?? null,
      })),
    };

    setGuardando(true);
    try {
      const url = editandoId ? `${API}/api/ofertas/${editandoId}` : `${API}/api/ofertas`;
      const method = editandoId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('Error al guardar');
      setVista('lista');
      cargarOfertas();
    } catch {
      setError('Error al guardar la oferta');
    } finally { setGuardando(false); }
  };

  const toggleOferta = async (id: number) => {
    try {
      await fetch(`${API}/api/ofertas/${id}/toggle`, { method: 'PUT' });
      setOfertas(prev => prev.map(o => o.id === id ? { ...o, activa: !o.activa } : o));
    } catch {}
  };

  const eliminarOferta = async (id: number) => {
    if (!window.confirm('¿Eliminar esta oferta?')) return;
    try {
      await fetch(`${API}/api/ofertas/${id}`, { method: 'DELETE' });
      setOfertas(prev => prev.filter(o => o.id !== id));
    } catch {}
  };

  const atenderConsulta = async (id: number) => {
    try {
      await fetch(`${API}/api/ofertas/consultas/${id}/atender`, { method: 'PUT' });
      setConsultas(prev => prev.map(c => c.id === id ? { ...c, atendida: true } : c));
    } catch {}
  };

  const vigencia = (o: Oferta) => {
    const hoy = new Date().toISOString().substring(0, 10);
    if (o.fecha_inicio && hoy < o.fecha_inicio) return 'Programada';
    if (o.fecha_fin && hoy > o.fecha_fin) return 'Vencida';
    return 'Vigente';
  };

  const pendientes = consultas.filter(c => !c.atendida).length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">🎁 Ofertas</h2>
        <div className="flex gap-2">
          <button onClick={() => setTab('ofertas')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'ofertas' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            Ofertas
          </button>
          <button onClick={() => setTab('consultas')}
            className={`relative px-4 py-2 rounded-lg text-sm font-medium ${tab === 'consultas' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            Consultas
            {pendientes > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                {pendientes}
              </span>
            )}
          </button>
        </div>
      </div>

      {tab === 'ofertas' && vista === 'lista' && (
        <>
          <button onClick={abrirNueva}
            className="mb-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
            + Nueva oferta
          </button>

          {cargando ? (
            <div className="text-center py-12 text-gray-400">Cargando...</div>
          ) : ofertas.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No hay ofertas creadas todavía</div>
          ) : (
            <div className="space-y-3">
              {ofertas.map(o => (
                <div key={o.id} className="bg-white rounded-xl shadow-sm p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {o.imagen_url && (
                        <img src={`${API}/api/imagen?url=${encodeURIComponent(o.imagen_url)}`}
                          alt={o.titulo}
                          className="w-14 h-14 object-contain rounded-lg border border-gray-100 bg-gray-50 flex-shrink-0" />
                      )}
                      <div>
                      <p className="font-semibold text-gray-800">{o.titulo}</p>
                      <p className="text-xs text-gray-500">{tipoInfo[o.tipo]?.label}</p>
                      {o.descripcion && <p className="text-sm text-gray-600 mt-1">{o.descripcion}</p>}
                      <p className="text-xs text-gray-400 mt-1">
                        {o.items.length} producto{o.items.length !== 1 ? 's' : ''}
                        {(o.fecha_inicio || o.fecha_fin) && (
                          <> · Vigencia: {o.fecha_inicio || '...'} a {o.fecha_fin || '...'}</>
                        )}
                      </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                        !o.activa ? 'bg-gray-100 text-gray-500' :
                        vigencia(o) === 'Vigente' ? 'bg-green-100 text-green-700' :
                        vigencia(o) === 'Vencida' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {!o.activa ? 'Inactiva' : vigencia(o)}
                      </span>
                      <div className="flex gap-2">
                        <button onClick={() => abrirEditar(o)} className="text-xs text-blue-600 hover:underline">Editar</button>
                        <button onClick={() => toggleOferta(o.id)} className="text-xs text-gray-600 hover:underline">
                          {o.activa ? 'Desactivar' : 'Activar'}
                        </button>
                        <button onClick={() => eliminarOferta(o.id)} className="text-xs text-red-500 hover:underline">Eliminar</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'ofertas' && vista === 'form' && (
        <div className="bg-white rounded-xl shadow-sm p-6 max-w-2xl">
          <h3 className="text-lg font-bold text-gray-800 mb-4">{editandoId ? 'Editar oferta' : 'Nueva oferta'}</h3>

          {!editandoId && (
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 block mb-2">Tipo de oferta</label>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(tipoInfo).map(([k, v]) => (
                  <label key={k} className={`flex items-start gap-2 border rounded-lg p-3 cursor-pointer ${form.tipo === Number(k) ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                    <input type="radio" name="tipo" className="mt-1" checked={form.tipo === Number(k)}
                      onChange={() => setForm(prev => ({ ...prev, tipo: Number(k), items: [] }))} />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{v.label}</p>
                      <p className="text-xs text-gray-500">{v.ayuda}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {editandoId && (
            <div className="mb-4 bg-blue-50 rounded-lg p-3">
              <p className="text-sm font-semibold text-blue-700">{tipoInfo[form.tipo]?.label}</p>
              <p className="text-xs text-blue-600">{tipoInfo[form.tipo]?.ayuda}</p>
            </div>
          )}

          <div className="space-y-3 mb-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Título</label>
              <input type="text" value={form.titulo} onChange={e => setForm(prev => ({ ...prev, titulo: e.target.value }))}
                placeholder="Ej: Combo limpieza x10"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Descripción (opcional)</label>
              <textarea value={form.descripcion} onChange={e => setForm(prev => ({ ...prev, descripcion: e.target.value }))}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Vigencia desde (opcional)</label>
                <input type="date" value={form.fecha_inicio} onChange={e => setForm(prev => ({ ...prev, fecha_inicio: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Vigencia hasta (opcional)</label>
                <input type="date" value={form.fecha_fin} onChange={e => setForm(prev => ({ ...prev, fecha_fin: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          {form.tipo === 2 && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Precio total del combo (neto)</label>
                <input type="number" min="0" value={form.precio} onChange={e => setForm(prev => ({ ...prev, precio: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Cantidad mínima de paquetes</label>
                <input type="number" min="1" value={form.cantidad_minima} onChange={e => setForm(prev => ({ ...prev, cantidad_minima: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          )}

          {(form.tipo === 3 || form.tipo === 4) && (
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 block mb-1">Cantidad mínima surtida (total entre todos los productos)</label>
              <input type="number" min="1" value={form.cantidad_minima} onChange={e => setForm(prev => ({ ...prev, cantidad_minima: e.target.value }))}
                className="w-full sm:w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}

          {form.tipo === 5 && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Cantidad mínima</label>
                <input type="number" min="1" value={form.cantidad_minima} onChange={e => setForm(prev => ({ ...prev, cantidad_minima: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">% Descuento extra</label>
                <input type="number" min="0" max="100" value={form.porcentaje_descuento} onChange={e => setForm(prev => ({ ...prev, porcentaje_descuento: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          )}

          {!(form.tipo === 5 && form.items.length >= 1) && (
            <div className="mb-3">
              <label className="text-sm font-medium text-gray-700 block mb-1">
                {form.tipo === 5 ? 'Buscar producto (uno solo)' : 'Agregar productos'}
              </label>
              <input type="text" placeholder="Buscar por código o descripción (mín. 3 caracteres)"
                value={busquedaProducto} onChange={e => setBusquedaProducto(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {buscandoProducto && <p className="text-xs text-gray-400 mt-1">Buscando...</p>}
              {resultadosProducto.length > 0 && (
                <div className="mt-2 border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                  {resultadosProducto.map(p => (
                    <button key={p.id_producto} onClick={() => agregarProducto(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0 flex justify-between">
                      <span>{arreglarNombre(p.des_producto)} <span className="text-gray-400 font-mono text-xs">({p.cod_producto})</span></span>
                      <span className="text-blue-600 font-semibold">${formatPrecio(p.precio_producto)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {form.items.length > 0 && (
            <div className="mb-4 space-y-2">
              {form.items.map((item, idx) => (
                <div key={item.producto_id} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{arreglarNombre(item.descripcion)}</p>
                    <p className="text-xs text-gray-400 font-mono">{item.codigo}</p>
                  </div>
                  {(form.tipo === 1 || form.tipo === 3 || form.tipo === 5) && (
                    <div>
                      <label className="text-xs text-gray-500 block">Precio</label>
                      <input type="number" min="0" value={item.precio ?? ''}
                        onChange={e => actualizarItem(idx, 'precio', e.target.value)}
                        className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  )}
                  {form.tipo === 1 && (
                    <div>
                      <label className="text-xs text-gray-500 block">Cant. mínima</label>
                      <input type="number" min="1" value={item.cantidad_minima ?? ''}
                        onChange={e => actualizarItem(idx, 'cantidad_minima', e.target.value)}
                        className="w-20 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  )}
                  {form.tipo === 2 && (
                    <div>
                      <label className="text-xs text-gray-500 block">Cant. en combo</label>
                      <input type="number" min="1" value={item.cantidad ?? ''}
                        onChange={e => actualizarItem(idx, 'cantidad', e.target.value)}
                        className="w-20 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  )}
                  <button onClick={() => quitarProducto(idx)} className="text-red-500 text-sm px-2">✕</button>
                </div>
              ))}
            </div>
          )}

          {form.tipo === 4 && (
            <div className="mb-4 border-t pt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Producto que se entrega sin cargo</p>
              {form.producto_gratis_id ? (
                <div className="flex items-center gap-2 bg-green-50 rounded-lg p-2 mb-2">
                  <div className="flex-1">
                    <p className="text-sm text-gray-800">{arreglarNombre(form.descripcion_gratis)}</p>
                    <p className="text-xs text-gray-400 font-mono">{form.codigo_gratis}</p>
                  </div>
                  <button onClick={() => setForm(prev => ({ ...prev, producto_gratis_id: null, codigo_gratis: '', descripcion_gratis: '' }))}
                    className="text-red-500 text-sm px-2">✕</button>
                </div>
              ) : (
                <>
                  <input type="text" placeholder="Buscar producto a regalar (mín. 3 caracteres)"
                    value={busquedaGratis} onChange={e => setBusquedaGratis(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  {buscandoGratis && <p className="text-xs text-gray-400 mt-1">Buscando...</p>}
                  {resultadosGratis.length > 0 && (
                    <div className="mt-2 border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                      {resultadosGratis.map(p => (
                        <button key={p.id_producto} onClick={() => seleccionarGratis(p)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0">
                          {arreglarNombre(p.des_producto)} <span className="text-gray-400 font-mono text-xs">({p.cod_producto})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              <div className="mt-2">
                <label className="text-sm text-gray-700 block mb-1">Cantidad sin cargo (al llegar al mínimo)</label>
                <input type="number" min="1" value={form.cantidad_gratis} onChange={e => setForm(prev => ({ ...prev, cantidad_gratis: e.target.value }))}
                  className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          )}

          {/* Imagen opcional */}
          <div className="mb-4 border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Imagen (opcional)</p>
            <div className="flex gap-2 mb-3">
              <button onClick={() => { setOrigenImagen('ivan'); setForm(prev => ({ ...prev, imagen_url: '' })); setPreviewImagenRota(false); setBusquedaImagen(''); setResultadosImagen([]); }}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium border ${origenImagen === 'ivan' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                Buscar producto
              </button>
              <button onClick={() => { setOrigenImagen('url'); setForm(prev => ({ ...prev, imagen_url: '' })); setPreviewImagenRota(false); setBusquedaImagen(''); setResultadosImagen([]); }}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium border ${origenImagen === 'url' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                Pegar URL
              </button>
            </div>

            {origenImagen === 'ivan' && (
              <>
                <input type="text" placeholder="Buscar por código o descripción (mín. 3 caracteres)"
                  value={busquedaImagen} onChange={e => setBusquedaImagen(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {buscandoImagen && <p className="text-xs text-gray-400 mt-1">Buscando...</p>}
                {resultadosImagen.length > 0 && (
                  <div className="mt-2 border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                    {resultadosImagen.map(p => (
                      <button key={p.id_producto} onClick={() => {
                        setForm(prev => ({ ...prev, imagen_url: p.imagen_producto || '' }));
                        setPreviewImagenRota(false);
                        setBusquedaImagen(''); setResultadosImagen([]);
                      }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-center gap-2">
                        {p.imagen_producto && (
                          <img src={`${API}/api/imagen?url=${encodeURIComponent(p.imagen_producto)}`}
                            alt="" className="w-8 h-8 object-contain rounded flex-shrink-0" />
                        )}
                        <span>{arreglarNombre(p.des_producto)} <span className="text-gray-400 font-mono text-xs">({p.cod_producto})</span></span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {origenImagen === 'url' && (
              <input type="text" placeholder="https://..."
                value={form.imagen_url} onChange={e => { setForm(prev => ({ ...prev, imagen_url: e.target.value })); setPreviewImagenRota(false); }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            )}

            {form.imagen_url && !previewImagenRota && (
              <div className="mt-3 flex items-center gap-3">
                <img src={`${API}/api/imagen?url=${encodeURIComponent(form.imagen_url)}`}
                  alt="Preview" onError={() => setPreviewImagenRota(true)}
                  className="w-20 h-20 object-contain rounded-lg border border-gray-200 bg-gray-50" />
                <button onClick={() => { setForm(prev => ({ ...prev, imagen_url: '' })); setPreviewImagenRota(false); }}
                  className="text-xs text-red-500 hover:underline">Quitar imagen</button>
              </div>
            )}
            {form.imagen_url && previewImagenRota && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-red-500">No se pudo cargar la imagen</span>
                <button onClick={() => { setForm(prev => ({ ...prev, imagen_url: '' })); setPreviewImagenRota(false); }}
                  className="text-xs text-gray-500 hover:underline">Limpiar</button>
              </div>
            )}
          </div>

          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

          <div className="flex gap-3">
            <button onClick={() => setVista('lista')} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-sm font-semibold">
              Cancelar
            </button>
            <button onClick={guardar} disabled={guardando}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
              {guardando ? 'Guardando...' : 'Guardar oferta'}
            </button>
          </div>
        </div>
      )}

      {tab === 'consultas' && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          {consultas.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No hay consultas de "modificar combo"</div>
          ) : (
            <div className="space-y-2">
              {consultas.map(c => (
                <div key={c.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{c.oferta_titulo}</p>
                    <p className="text-xs text-gray-500">{c.cliente_nombre} · {c.cliente_cuit} · {new Date(c.fecha).toLocaleString('es-AR')}</p>
                  </div>
                  {c.atendida ? (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Atendida</span>
                  ) : (
                    <button onClick={() => atenderConsulta(c.id)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg">
                      Marcar atendida
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Ofertas;