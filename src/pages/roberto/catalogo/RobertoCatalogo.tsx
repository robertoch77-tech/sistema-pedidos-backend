import React, { useEffect, useState, useCallback, useRef } from 'react';

const API = process.env.REACT_APP_API_URL || '';
// Para Cloudinary unsigned upload: definir en .env
// REACT_APP_CLOUDINARY_CLOUD_NAME=xxxxx
// REACT_APP_CLOUDINARY_UPLOAD_PRESET=xxxxx
const CLOUD_NAME     = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME     || '';
const UPLOAD_PRESET  = process.env.REACT_APP_CLOUDINARY_UPLOAD_PRESET  || '';
const BASE_URL_CAT   = 'https://sistemagestionpedidos.netlify.app';

// ─── PALETA ───────────────────────────────────────────────────
const NAVY  = '#1B2A4A';
const BLUE  = '#2B6CB0';
const GREEN = '#38A169';
const RED   = '#E53E3E';
const GRAY  = '#718096';
const TEXT  = '#2D3748';
const BG    = '#F4F6F9';
const BORDE = '#E2E8F0';
const GOLD  = '#C9A84C';

// ─── TIPOS ────────────────────────────────────────────────────
interface CatConfig {
  cliente_id:        number;
  tipo:              string;
  activo:            boolean;
  mostrar_stock:     string;
  whatsapp:          string;
  banners:           string[];
  texto_bienvenida:  string;
  mensaje_cierre:    string;
  modo_catalogo:     string;
}

interface Pedido {
  id:                 number;
  numero:             string;
  comprador_nombre:   string;
  comprador_telefono: string;
  comprador_email:    string;
  total:              number;
  estado:             string;
  creado_en:          string;
  items?:             PedidoItem[];
  notas?:             string;
  comprador_direccion?: string;
}

interface PedidoItem {
  id:          number;
  codigo:      string;
  descripcion: string;
  cantidad:    number;
  precio:      number;
  imagen_url?: string;
}

interface Producto {
  id:          number;
  codigo:      string;
  descripcion: string;
  marca:       string;
  imagen_url:  string;
  destacado:   boolean;
}

// ─── AUTH HELPERS ─────────────────────────────────────────────
function getSuperToken(): string {
  try { return JSON.parse(localStorage.getItem('superadmin_session') || '{}').token || ''; }
  catch { return ''; }
}
function getPortalSession(): { token: string; cliente: { id: number; codigo_acceso: string } } | null {
  try { return JSON.parse(localStorage.getItem('roberto_portal_session') || 'null'); }
  catch { return null; }
}

// ─── ESTADO BADGE ────────────────────────────────────────────
const ESTADO_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  nuevo:      { bg: '#EBF8FF', color: BLUE,  label: 'Nuevo' },
  visto:      { bg: '#EDF2F7', color: GRAY,  label: 'Visto' },
  en_proceso: { bg: '#FEFCBF', color: '#744210', label: 'En proceso' },
  entregado:  { bg: '#F0FFF4', color: GREEN, label: 'Entregado' },
  cancelado:  { bg: '#FFF5F5', color: RED,   label: 'Cancelado' },
};

function BadgeEstado({ estado }: { estado: string }) {
  const s = ESTADO_BADGE[estado] || { bg: '#EDF2F7', color: GRAY, label: estado };
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, backgroundColor: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

// ─── TOGGLE ──────────────────────────────────────────────────
function Toggle({ activo, onChange }: { activo: boolean; onChange: () => void }) {
  return (
    <div onClick={onChange} style={{ width: 44, height: 24, borderRadius: 12, backgroundColor: activo ? GREEN : '#CBD5E0', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background-color 0.2s' }}>
      <div style={{ position: 'absolute', top: 3, left: activo ? 23 : 3, width: 18, height: 18, borderRadius: '50%', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
    </div>
  );
}

// ─── MODAL DETALLE PEDIDO ────────────────────────────────────
function ModalPedido({
  pedido, superToken, clienteId, onClose, onEstadoCambiado,
}: {
  pedido: Pedido; superToken: string; clienteId: number;
  onClose: () => void;
  onEstadoCambiado: (id: number, estado: string) => void;
}) {
  const [detalle,   setDetalle]  = useState<Pedido | null>(null);
  const [estado,    setEstado]   = useState(pedido.estado);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/superadmin/catalogo/${clienteId}/pedidos/${pedido.id}`, {
      headers: { 'x-superadmin-token': superToken },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setDetalle(d); })
      .catch(() => {});
  }, [pedido.id, clienteId, superToken]);

  const cambiarEstado = async () => {
    setGuardando(true);
    try {
      const r = await fetch(`${API}/api/superadmin/catalogo/${clienteId}/pedidos/${pedido.id}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-superadmin-token': superToken },
        body: JSON.stringify({ estado }),
      });
      if (r.ok) onEstadoCambiado(pedido.id, estado);
    } finally { setGuardando(false); }
  };

  const data = detalle || pedido;
  const items: PedidoItem[] = Array.isArray(data.items) ? data.items : [];

  const waText = encodeURIComponent(
    `Hola ${data.comprador_nombre}! Te contactamos por tu pedido ${data.numero} en nuestro catálogo.`
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <div style={{ backgroundColor: '#fff', borderRadius: 14, maxWidth: 600, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '24px 28px' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: NAVY }}>{data.numero}</h3>
            <span style={{ fontSize: 12, color: GRAY }}>{new Date(data.creado_en).toLocaleString('es-AR')}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: GRAY }}>✕</button>
        </div>

        {/* Comprador */}
        <div style={{ backgroundColor: BG, borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: NAVY, margin: '0 0 8px' }}>Datos del comprador</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 13, color: TEXT }}>
            <span><strong>Nombre:</strong> {data.comprador_nombre || '—'}</span>
            <span><strong>Teléfono:</strong> {data.comprador_telefono || '—'}</span>
            <span><strong>Email:</strong> {(data as any).comprador_email || '—'}</span>
            {(data as any).comprador_direccion && (
              <span><strong>Dirección:</strong> {(data as any).comprador_direccion}</span>
            )}
          </div>
          {data.notas && (
            <p style={{ fontSize: 12, color: GRAY, margin: '8px 0 0' }}><strong>Notas:</strong> {data.notas}</p>
          )}
        </div>

        {/* Productos */}
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: NAVY, margin: '0 0 8px' }}>Productos</p>
          {items.length === 0 ? (
            <p style={{ fontSize: 13, color: GRAY }}>Sin detalle de productos</p>
          ) : items.map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 10, marginBottom: 10, borderBottom: `1px solid ${BORDE}` }}>
              {it.imagen_url ? (
                <img src={it.imagen_url} alt={it.descripcion} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 48, height: 48, backgroundColor: '#F0F0F0', borderRadius: 6, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: TEXT, margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.descripcion}</p>
                <p style={{ fontSize: 12, color: GRAY, margin: 0 }}>Cód: {it.codigo} · x{it.cantidad}</p>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: TEXT, flexShrink: 0 }}>
                ${(it.precio * it.cantidad).toLocaleString('es-AR')}
              </span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', fontWeight: 700, fontSize: 15, color: NAVY }}>
            Total: ${Number(data.total).toLocaleString('es-AR')}
          </div>
        </div>

        {/* Estado */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={estado} onChange={e => setEstado(e.target.value)}
            style={{ border: `1.5px solid ${BORDE}`, borderRadius: 7, padding: '7px 10px', fontSize: 13, color: TEXT }}>
            {Object.entries(ESTADO_BADGE).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <button onClick={cambiarEstado} disabled={guardando || estado === pedido.estado}
            style={{
              backgroundColor: guardando || estado === pedido.estado ? '#CBD5E0' : BLUE,
              color: '#fff', border: 'none', borderRadius: 7,
              padding: '7px 16px', fontSize: 13, fontWeight: 600,
              cursor: guardando || estado === pedido.estado ? 'not-allowed' : 'pointer',
            }}>
            {guardando ? 'Guardando...' : 'Actualizar estado'}
          </button>
          {data.comprador_telefono && (
            <a href={`https://wa.me/${data.comprador_telefono.replace(/\D/g, '')}?text=${waText}`}
              target="_blank" rel="noreferrer"
              style={{ backgroundColor: '#25D366', color: '#fff', borderRadius: 7, padding: '7px 14px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              💬 WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── TAB PEDIDOS ─────────────────────────────────────────────
function TabPedidos({ clienteId, superToken }: { clienteId: number; superToken: string }) {
  const [pedidos,    setPedidos]    = useState<Pedido[]>([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [filtroEst,  setFiltroEst]  = useState('');
  const [cargando,   setCargando]   = useState(true);
  const [selPedido,  setSelPedido]  = useState<Pedido | null>(null);
  const LIMIT = 20;

  const cargar = useCallback(() => {
    setCargando(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (filtroEst) params.set('estado', filtroEst);
    fetch(`${API}/api/superadmin/catalogo/${clienteId}/pedidos?${params}`, {
      headers: { 'x-superadmin-token': superToken },
    })
      .then(r => r.ok ? r.json() : { pedidos: [], total: 0 })
      .then(d => { setPedidos(d.pedidos || []); setTotal(d.total || 0); })
      .finally(() => setCargando(false));
  }, [clienteId, superToken, page, filtroEst]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { setPage(1); }, [filtroEst]);

  const onEstadoCambiado = (id: number, estado: string) => {
    setPedidos(prev => prev.map(p => p.id === id ? { ...p, estado } : p));
    setSelPedido(prev => prev?.id === id ? { ...prev, estado } : prev);
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <>
      {/* Filtro */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['', ...Object.keys(ESTADO_BADGE)].map(est => (
          <button key={est} onClick={() => setFiltroEst(est)}
            style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              border: `1.5px solid ${filtroEst === est ? BLUE : BORDE}`,
              backgroundColor: filtroEst === est ? BLUE : '#fff',
              color: filtroEst === est ? '#fff' : GRAY, cursor: 'pointer',
            }}>
            {est === '' ? 'Todos' : ESTADO_BADGE[est].label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: GRAY }}>Cargando...</div>
      ) : pedidos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <p style={{ fontSize: 40, margin: '0 0 12px' }}>📭</p>
          <p style={{ color: GRAY }}>No hay pedidos{filtroEst ? ` con estado "${ESTADO_BADGE[filtroEst]?.label}"` : ''}</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: BG }}>
                {['# Pedido', 'Fecha', 'Comprador', 'Teléfono', 'Ítems', 'Total', 'Estado'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: GRAY, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: `2px solid ${BORDE}`, whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p, i) => (
                <tr key={p.id} onClick={() => setSelPedido(p)}
                  style={{ backgroundColor: i % 2 === 0 ? '#fff' : BG, cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#EBF4FF'; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = i % 2 === 0 ? '#fff' : BG; }}
                >
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: BLUE }}>{p.numero}</td>
                  <td style={{ padding: '10px 12px', color: GRAY, whiteSpace: 'nowrap' }}>
                    {new Date(p.creado_en).toLocaleDateString('es-AR')}
                  </td>
                  <td style={{ padding: '10px 12px', color: TEXT, fontWeight: 500 }}>{p.comprador_nombre || '—'}</td>
                  <td style={{ padding: '10px 12px', color: GRAY }}>{p.comprador_telefono || '—'}</td>
                  <td style={{ padding: '10px 12px', color: GRAY, textAlign: 'center' }}>
                    {Array.isArray(p.items) ? p.items.length : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: TEXT }}>
                    ${Number(p.total).toLocaleString('es-AR')}
                  </td>
                  <td style={{ padding: '10px 12px' }}><BadgeEstado estado={p.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: '6px 14px', border: `1px solid ${BORDE}`, borderRadius: 7, background: page === 1 ? BG : '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 13 }}>
            ← Anterior
          </button>
          <span style={{ padding: '6px 12px', fontSize: 13, color: GRAY }}>Pág {page} de {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: '6px 14px', border: `1px solid ${BORDE}`, borderRadius: 7, background: page === totalPages ? BG : '#fff', cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: 13 }}>
            Siguiente →
          </button>
        </div>
      )}

      {selPedido && (
        <ModalPedido
          pedido={selPedido} superToken={superToken} clienteId={clienteId}
          onClose={() => setSelPedido(null)}
          onEstadoCambiado={onEstadoCambiado}
        />
      )}
    </>
  );
}

// ─── TAB CONFIG ──────────────────────────────────────────────
function TabConfig({
  clienteId, superToken, codigoAcceso, configInicial, onConfigGuardada,
}: {
  clienteId: number; superToken: string; codigoAcceso: string;
  configInicial: CatConfig;
  onConfigGuardada: (c: CatConfig) => void;
}) {
  const [cfg,          setCfg]          = useState<CatConfig>(configInicial);
  const [guardando,    setGuardando]    = useState(false);
  const [msgGuardar,   setMsgGuardar]   = useState('');

  // Banners
  const [urlInput,     setUrlInput]     = useState('');
  const [subiendo,     setSubiendo]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Productos destacados
  const [buscarProd,   setBuscarProd]   = useState('');
  const [productos,    setProductos]    = useState<Producto[]>([]);
  const [toggleando,   setToggleando]   = useState<number | null>(null);

  const linkPublico = `${BASE_URL_CAT}/catalogo/${cfg.tipo === 'autos' ? 'autos' : 'productos'}/${codigoAcceso}`;
  const [copiado, setCopiado] = useState(false);

  // Cargar productos
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams({ page: '1', limit: '40' });
      if (buscarProd) params.set('buscar', buscarProd);
      fetch(`${API}/api/superadmin/catalogo/${clienteId}/productos-destacados?${params}`, {
        headers: { 'x-superadmin-token': superToken },
      })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.productos) setProductos(d.productos); })
        .catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [buscarProd, clienteId, superToken]);

  // Cargar productos fallback via importador si no existe endpoint específico
  const cargarProductos = useCallback(() => {
    const params = new URLSearchParams({ page: '1', limit: '40' });
    if (buscarProd) params.set('buscar', buscarProd);
    fetch(`${API}/api/superadmin/importador/productos/${clienteId}?${params}`, {
      headers: { 'x-superadmin-token': superToken },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (Array.isArray(d)) setProductos(d);
        else if (d?.productos) setProductos(d.productos);
      })
      .catch(() => {});
  }, [buscarProd, clienteId, superToken]);

  useEffect(() => {
    const t = setTimeout(cargarProductos, 400);
    return () => clearTimeout(t);
  }, [cargarProductos]);

  // Subir a Cloudinary
  const subirImagen = async (file: File): Promise<string | null> => {
    if (!CLOUD_NAME || !UPLOAD_PRESET) {
      alert('Cloudinary no configurado. Usá la opción "Pegar URL".');
      return null;
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', UPLOAD_PRESET);
    setSubiendo(true);
    try {
      const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) return null;
      return d.secure_url || null;
    } catch (err) { console.error('Cloudinary fetch error:', err); return null; }
    finally { setSubiendo(false); }
  };

  const agregarBannerArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await subirImagen(file);
    if (url) setCfg(prev => ({ ...prev, banners: [...(prev.banners || []), url].slice(0, 5) }));
    if (fileRef.current) fileRef.current.value = '';
  };

  const agregarBannerUrl = () => {
    const url = urlInput.trim();
    if (!url) return;
    setCfg(prev => ({ ...prev, banners: [...(prev.banners || []), url].slice(0, 5) }));
    setUrlInput('');
  };

  const eliminarBanner = (idx: number) =>
    setCfg(prev => ({ ...prev, banners: prev.banners.filter((_, i) => i !== idx) }));

  const toggleDestacado = async (prod: Producto) => {
    setToggleando(prod.id);
    try {
      const r = await fetch(`${API}/api/superadmin/catalogo/${clienteId}/productos/${prod.id}/destacado`, {
        method: 'PUT', headers: { 'x-superadmin-token': superToken },
      });
      if (r.ok) {
        const d = await r.json();
        setProductos(prev => prev.map(p => p.id === prod.id ? { ...p, destacado: d.destacado } : p));
      }
    } finally { setToggleando(null); }
  };

  const guardar = async () => {
    setGuardando(true); setMsgGuardar('');
    try {
      const r = await fetch(`${API}/api/superadmin/catalogo/${clienteId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-superadmin-token': superToken },
        body: JSON.stringify(cfg),
      });
      if (r.ok) {
        const d = await r.json();
        setMsgGuardar('✅ Configuración guardada');
        onConfigGuardada(d.config || cfg);
      } else {
        setMsgGuardar('❌ Error al guardar');
      }
    } catch {
      setMsgGuardar('❌ Error de conexión');
    } finally {
      setGuardando(false);
      setTimeout(() => setMsgGuardar(''), 3000);
    }
  };

  const copiarLink = () => {
    navigator.clipboard.writeText(linkPublico).then(() => {
      setCopiado(true); setTimeout(() => setCopiado(false), 2000);
    });
  };

  const destCount = productos.filter(p => p.destacado).length;

  const seccionStyle: React.CSSProperties = {
    backgroundColor: '#fff', borderRadius: 12, border: `1px solid ${BORDE}`,
    overflow: 'hidden', marginBottom: 20,
  };
  const seccionHeader: React.CSSProperties = {
    padding: '14px 20px', borderBottom: `2px solid #EBF4FF`,
    fontSize: 13, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.5px',
  };
  const seccionBody: React.CSSProperties = { padding: '18px 20px' };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: GRAY, display: 'block', marginBottom: 4 };
  const inp: React.CSSProperties = { width: '100%', border: `1.5px solid ${BORDE}`, borderRadius: 7, padding: '8px 12px', fontSize: 14, color: TEXT, boxSizing: 'border-box' };

  return (
    <div>
      {/* ── GENERAL ─────────────────────────────────────────── */}
      <div style={seccionStyle}>
        <div style={seccionHeader}>General</div>
        <div style={seccionBody}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>

            {/* Toggle activo */}
            <div>
              <label style={lbl}>Estado del catálogo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <Toggle activo={cfg.activo} onChange={() => setCfg(p => ({ ...p, activo: !p.activo }))} />
                <span style={{ fontSize: 13, fontWeight: 600, color: cfg.activo ? GREEN : GRAY }}>
                  {cfg.activo ? 'Activo — visible al público' : 'Inactivo — oculto al público'}
                </span>
              </div>
            </div>

            {/* Tipo */}
            <div>
              <label style={lbl}>Tipo de catálogo</label>
              <select value={cfg.tipo} onChange={e => setCfg(p => ({ ...p, tipo: e.target.value }))}
                style={{ ...inp, backgroundColor: '#fff' }}>
                <option value="productos">Productos</option>
                <option value="autos">Vehículos / Autos</option>
              </select>
            </div>

            {/* Mostrar stock */}
            <div>
              <label style={lbl}>Mostrar stock</label>
              <select value={cfg.mostrar_stock} onChange={e => setCfg(p => ({ ...p, mostrar_stock: e.target.value }))}
                style={{ ...inp, backgroundColor: '#fff' }}>
                <option value="oculto">No mostrar</option>
                <option value="disponibilidad">Solo disponible/no disponible</option>
                <option value="cantidad">Cantidad exacta</option>
              </select>
            </div>

            {/* WhatsApp */}
            <div>
              <label style={lbl}>WhatsApp de contacto</label>
              <input type="tel" value={cfg.whatsapp} onChange={e => setCfg(p => ({ ...p, whatsapp: e.target.value }))}
                placeholder="+54 9 11 1234-5678" style={inp} />
            </div>

            {/* Texto de bienvenida */}
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#4A5568', display: 'block', marginBottom: 4 }}>
                Texto de bienvenida
              </label>
              <input
                type="text"
                value={cfg.texto_bienvenida}
                onChange={e => setCfg(p => ({ ...p, texto_bienvenida: e.target.value }))}
                maxLength={150}
                placeholder="Bienvenidos a nuestra tienda, encontrá todo lo que necesitás"
                style={{ ...inp }}
              />
              <div style={{ fontSize: 11, color: '#718096', marginTop: 2 }}>
                {(cfg.texto_bienvenida || '').length}/150
              </div>
            </div>

            {/* Mostrar productos */}
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#4A5568', display: 'block', marginBottom: 8 }}>
                Mostrar productos en catálogo
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {([
                  { value: 'todos',              label: 'Todos los productos' },
                  { value: 'destacados_primero', label: 'Destacados primero + resto' },
                  { value: 'solo_destacados',    label: 'Solo productos destacados' },
                ] as const).map(op => (
                  <label key={op.value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: TEXT }}>
                    <input
                      type="radio"
                      name="modo_catalogo"
                      value={op.value}
                      checked={(cfg.modo_catalogo || 'todos') === op.value}
                      onChange={() => setCfg(p => ({ ...p, modo_catalogo: op.value }))}
                      style={{ accentColor: BLUE }}
                    />
                    {op.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Mensaje al confirmar pedido */}
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#4A5568', display: 'block', marginBottom: 4 }}>
                Mensaje al confirmar pedido
              </label>
              <input
                type="text"
                value={cfg.mensaje_cierre}
                onChange={e => setCfg(p => ({ ...p, mensaje_cierre: e.target.value }))}
                maxLength={150}
                placeholder="¡Gracias por tu pedido! Te contactamos en menos de 24hs."
                style={{ ...inp }}
              />
              <div style={{ fontSize: 11, color: '#718096', marginTop: 2 }}>
                {(cfg.mensaje_cierre || '').length}/150
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── APARIENCIA ──────────────────────────────────────── */}
      <div style={seccionStyle}>
        <div style={seccionHeader}>Apariencia y acceso</div>
        <div style={seccionBody}>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>URL pública del catálogo</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly value={linkPublico}
                style={{ ...inp, color: GRAY, backgroundColor: BG, cursor: 'default' }} />
              <button onClick={copiarLink} style={{
                backgroundColor: copiado ? GREEN : '#fff', color: copiado ? '#fff' : BLUE,
                border: `1.5px solid ${copiado ? GREEN : BLUE}`, borderRadius: 7,
                padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {copiado ? '✅ Copiado' : '📋 Copiar'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── BANNERS ─────────────────────────────────────────── */}
      <div style={seccionStyle}>
        <div style={seccionHeader}>Banners {cfg.banners?.length > 0 ? `(${cfg.banners.length}/5)` : ''}</div>
        <div style={seccionBody}>
          {/* Preview banners */}
          {(cfg.banners || []).length > 0 && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              {cfg.banners.map((b, i) => (
                <div key={i} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: `1px solid ${BORDE}` }}>
                  <img src={b} alt={`Banner ${i+1}`} style={{ width: 160, height: 90, objectFit: 'cover', display: 'block' }} />
                  <button onClick={() => eliminarBanner(i)} style={{
                    position: 'absolute', top: 4, right: 4,
                    backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff',
                    border: 'none', borderRadius: '50%', width: 22, height: 22,
                    fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {(cfg.banners || []).length < 5 && (
            <>
              <p style={{ fontSize: 12, fontWeight: 700, color: GRAY, margin: '0 0 8px' }}>Agregar banner</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {/* Opción A — subir */}
                <div>
                  <input ref={fileRef} type="file" accept="image/*" onChange={agregarBannerArchivo} style={{ display: 'none' }} />
                  <button onClick={() => fileRef.current?.click()} disabled={subiendo}
                    style={{ backgroundColor: subiendo ? '#EDF2F7' : BLUE, color: '#fff', border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: subiendo ? 'not-allowed' : 'pointer' }}>
                    {subiendo ? '⏳ Subiendo...' : '📤 Subir imagen'}
                  </button>
                  {!CLOUD_NAME && (
                    <span style={{ fontSize: 11, color: GRAY, marginLeft: 8 }}>
                      (Requiere REACT_APP_CLOUDINARY_CLOUD_NAME)
                    </span>
                  )}
                </div>
                {/* Opción B — URL */}
                <div style={{ display: 'flex', gap: 6, flex: 1, minWidth: 240 }}>
                  <input type="url" value={urlInput} onChange={e => setUrlInput(e.target.value)}
                    placeholder="https://... (pegar URL de imagen)"
                    onKeyDown={e => { if (e.key === 'Enter') agregarBannerUrl(); }}
                    style={{ ...inp, flex: 1 }} />
                  <button onClick={agregarBannerUrl} disabled={!urlInput.trim()}
                    style={{ backgroundColor: urlInput.trim() ? '#fff' : BG, color: urlInput.trim() ? BLUE : GRAY, border: `1.5px solid ${urlInput.trim() ? BLUE : BORDE}`, borderRadius: 7, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: urlInput.trim() ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
                    + Agregar
                  </button>
                </div>
              </div>
            </>
          )}
          {(cfg.banners || []).length >= 5 && (
            <p style={{ fontSize: 12, color: GRAY }}>Máximo 5 banners. Eliminá uno para agregar otro.</p>
          )}
        </div>
      </div>

      {/* ── PRODUCTOS DESTACADOS ─────────────────────────────── */}
      {cfg.tipo !== 'autos' && (
        <div style={seccionStyle}>
          <div style={seccionHeader}>
            Productos destacados ({destCount}/12)
          </div>
          <div style={seccionBody}>
            <input type="text" value={buscarProd} onChange={e => setBuscarProd(e.target.value)}
              placeholder="Buscar producto..."
              style={{ ...inp, marginBottom: 14 }} />

            {productos.length === 0 ? (
              <p style={{ fontSize: 13, color: GRAY }}>Sin resultados</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 360, overflowY: 'auto', border: `1px solid ${BORDE}`, borderRadius: 8 }}>
                {productos.map((p, i) => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 12px',
                    backgroundColor: i % 2 === 0 ? '#fff' : BG,
                    borderBottom: i < productos.length - 1 ? `1px solid ${BORDE}` : 'none',
                  }}>
                    {p.imagen_url ? (
                      <img src={p.imagen_url} alt={p.descripcion} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 40, height: 40, backgroundColor: '#F0F0F0', borderRadius: 6, flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: TEXT, margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.descripcion}
                      </p>
                      {p.marca && <span style={{ fontSize: 11, color: GRAY }}>{p.marca}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {p.destacado && (
                        <span style={{ fontSize: 11, color: GOLD, fontWeight: 700 }}>⭐</span>
                      )}
                      <button
                        onClick={() => toggleDestacado(p)}
                        disabled={toggleando === p.id || (!p.destacado && destCount >= 12)}
                        style={{
                          fontSize: 11, fontWeight: 600,
                          padding: '4px 10px', borderRadius: 6, border: 'none',
                          cursor: toggleando === p.id || (!p.destacado && destCount >= 12) ? 'not-allowed' : 'pointer',
                          backgroundColor: p.destacado ? '#FFF5F5' : '#EBF8FF',
                          color: p.destacado ? RED : BLUE,
                          opacity: toggleando === p.id ? 0.6 : 1,
                        }}>
                        {p.destacado ? 'Quitar' : 'Destacar'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {destCount >= 12 && (
              <p style={{ fontSize: 12, color: GRAY, marginTop: 8 }}>Máximo 12 productos destacados.</p>
            )}
          </div>
        </div>
      )}

      {/* ── GUARDAR ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={guardar} disabled={guardando}
          style={{
            backgroundColor: guardando ? '#C6F6D5' : GREEN, color: '#fff',
            border: 'none', borderRadius: 8, padding: '11px 28px',
            fontSize: 14, fontWeight: 700, cursor: guardando ? 'not-allowed' : 'pointer',
          }}>
          {guardando ? 'Guardando...' : '💾 Guardar configuración'}
        </button>
        {msgGuardar && (
          <span style={{ fontSize: 13, fontWeight: 600, color: msgGuardar.startsWith('✅') ? GREEN : RED }}>
            {msgGuardar}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────
export default function RobertoCatalogo() {
  const session    = getPortalSession();
  const superToken = getSuperToken();
  const clienteId  = session?.cliente?.id ?? 0;
  const codigoAcc  = session?.cliente?.codigo_acceso ?? '';

  const [tab,        setTab]        = useState<'pedidos' | 'config'>('pedidos');
  const [config,     setConfig]     = useState<CatConfig | null>(null);
  const [cargConfig, setCargConfig] = useState(true);

  useEffect(() => {
    if (!clienteId) return;
    fetch(`${API}/api/superadmin/catalogo/${clienteId}/config`, {
      headers: { 'x-superadmin-token': superToken },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setConfig(d); })
      .finally(() => setCargConfig(false));
  }, [clienteId, superToken]);

  const urlPublica = `${BASE_URL_CAT}/catalogo/${config?.tipo === 'autos' ? 'autos' : 'productos'}/${codigoAcc}`;

  if (!clienteId) return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: RED }}>Sesión inválida. Cerrá sesión y volvé a ingresar.</p>
    </div>
  );

  const tabStyle = (t: typeof tab): React.CSSProperties => ({
    padding: '10px 22px', fontWeight: 700, fontSize: 14,
    border: 'none', background: 'none', cursor: 'pointer',
    color: tab === t ? BLUE : GRAY,
    borderBottom: tab === t ? `3px solid ${BLUE}` : '3px solid transparent',
    transition: 'color 0.15s',
  });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, padding: '28px 24px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── HEADER ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: NAVY, margin: 0 }}>Catálogo público</h1>
          {!cargConfig && config && (
            <span style={{
              display: 'inline-block', padding: '3px 12px', borderRadius: 12,
              fontSize: 12, fontWeight: 700,
              backgroundColor: config.activo ? '#F0FFF4' : '#EDF2F7',
              color: config.activo ? GREEN : GRAY,
            }}>
              {config.activo ? '● Activo' : '● Inactivo'}
            </span>
          )}
        </div>
        <a href={urlPublica} target="_blank" rel="noreferrer"
          style={{
            backgroundColor: BLUE, color: '#fff', textDecoration: 'none',
            borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700,
          }}>
          🔗 Ver catálogo
        </a>
      </div>

      {/* ── TABS ────────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px 12px 0 0', border: `1px solid ${BORDE}`, borderBottom: 'none', display: 'flex', overflowX: 'auto' }}>
        <button style={tabStyle('pedidos')} onClick={() => setTab('pedidos')}>📦 Pedidos</button>
        <button style={tabStyle('config')}  onClick={() => setTab('config')}>⚙️ Configuración</button>
      </div>

      {/* ── CONTENIDO ───────────────────────────────────────── */}
      <div style={{ backgroundColor: '#fff', borderRadius: '0 0 12px 12px', border: `1px solid ${BORDE}`, padding: '24px 20px' }}>
        {tab === 'pedidos' && (
          <TabPedidos clienteId={clienteId} superToken={superToken} />
        )}
        {tab === 'config' && (
          cargConfig ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: GRAY }}>Cargando configuración...</div>
          ) : (
            <TabConfig
              clienteId={clienteId}
              superToken={superToken}
              codigoAcceso={codigoAcc}
              configInicial={config || {
                cliente_id: clienteId, tipo: 'productos', activo: false,
                mostrar_stock: 'disponibilidad', whatsapp: '', banners: [],
                texto_bienvenida: '', mensaje_cierre: '', modo_catalogo: 'todos',
              }}
              onConfigGuardada={setConfig}
            />
          )
        )}
      </div>
    </div>
  );
}
