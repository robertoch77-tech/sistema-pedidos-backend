import React, { useEffect, useState, useCallback } from 'react';

const API = process.env.REACT_APP_API_URL || '';

// ─── PALETA ───────────────────────────────────────────────────
const C = {
  bg:      '#F5F5F5',
  card:    '#FFFFFF',
  texto:   '#333333',
  precio:  '#333333',
  acento:  '#2B6CB0',
  verde:   '#00A650',
  gris:    '#999999',
  borde:   '#EEEEEE',
};

// ─── TIPOS ────────────────────────────────────────────────────
interface CatConfig {
  nombre_comercial:  string;
  logo_url:          string;
  direccion:         string;
  whatsapp:          string;
  banners:           string[];
  tipo:              string;
  activo:            boolean;
  mostrar_stock:     string;
  color_primario:    string;
  texto_bienvenida?: string;
  mensaje_cierre?:   string;
  modo_catalogo?:    string;
}

interface Producto {
  id:                 number;
  codigo:             string;
  descripcion:        string;
  marca:              string;
  rubro:              string;
  precio_venta_final: number;
  stock?:             number;
  disponible?:        boolean;
  imagen_url:         string;
  destacado:          boolean;
}

interface ItemCarrito {
  id:          number;
  codigo:      string;
  descripcion: string;
  precio:      number;
  imagen_url:  string;
  cantidad:    number;
}

interface Filtros {
  rubros:     string[];
  marcas:     string[];
  precio_min: number;
  precio_max: number;
}

// ─── HOOKS ────────────────────────────────────────────────────
function useDebounce<T>(val: T, ms: number): T {
  const [d, setD] = useState(val);
  useEffect(() => { const t = setTimeout(() => setD(val), ms); return () => clearTimeout(t); }, [val, ms]);
  return d;
}

// ─── OPTIMIZAR URL CLOUDINARY ────────────────────────────────
const optimizarUrl = (url: string) => {
  if (!url) return url;
  if (!url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/f_auto,q_auto,w_600/');
};

// ─── PLACEHOLDER IMAGEN ───────────────────────────────────────
const ImgPlaceholder = ({ size = 160 }: { size?: number }) => (
  <div style={{
    width: '100%', height: size, backgroundColor: '#F0F0F0',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 4,
  }}>
    <span style={{ fontSize: 13, color: '#CCCCCC', fontWeight: 500 }}>Próximamente</span>
  </div>
);

// ─── CAROUSEL ─────────────────────────────────────────────────
function Carousel({ banners }: { banners: string[] }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % banners.length), 4000);
    return () => clearInterval(t);
  }, [banners.length]);
  if (!banners.length) return null;
  return (
    <div style={{ position: 'relative', width: '100%', height: 260, overflow: 'hidden', backgroundColor: '#000', marginBottom: 16 }}>
      {banners.map((b, i) => (
        <img key={i} src={b} alt={`Banner ${i+1}`} style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover',
          opacity: i === idx ? 1 : 0,
          transition: 'opacity 0.6s ease',
        }} />
      ))}
      <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6 }}>
        {banners.map((_, i) => (
          <button key={i} onClick={() => setIdx(i)} style={{
            width: i === idx ? 20 : 8, height: 8, borderRadius: 4,
            backgroundColor: i === idx ? '#fff' : 'rgba(255,255,255,0.5)',
            border: 'none', cursor: 'pointer', padding: 0,
            transition: 'all 0.3s',
          }} />
        ))}
      </div>
    </div>
  );
}

// ─── CARD PRODUCTO ────────────────────────────────────────────
function CardProducto({
  p, config, onAgregar, onDetalle,
}: {
  p: Producto; config: CatConfig;
  onAgregar: (p: Producto) => void;
  onDetalle: (p: Producto) => void;
}) {
  const [hover, setHover] = useState(false);
  const stockLabel = config.mostrar_stock === 'cantidad'
    ? (p.stock != null && p.stock > 0 ? `${p.stock} en stock` : '')
    : config.mostrar_stock === 'disponibilidad'
    ? (p.disponible ? '● Disponible' : '')
    : '';
  const stockColor = C.verde;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        backgroundColor: C.card,
        borderRadius: 8,
        border: `1px solid ${C.borde}`,
        boxShadow: hover ? '0 4px 16px rgba(0,0,0,0.10)' : '0 1px 4px rgba(0,0,0,0.06)',
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        transition: 'box-shadow 0.2s',
        position: 'relative',
      }}
    >
      {p.destacado && (
        <div style={{
          position: 'absolute', top: 8, right: 8, zIndex: 2,
          backgroundColor: '#F6C23E', color: '#7A4F01',
          fontSize: 10, fontWeight: 700, borderRadius: 12,
          padding: '2px 8px',
        }}>⭐ Destacado</div>
      )}

      <div onClick={() => onDetalle(p)} style={{ flexShrink: 0 }}>
        {p.imagen_url ? (
          <img src={optimizarUrl(p.imagen_url)} alt={p.descripcion} style={{
            width: '100%', height: 180, objectFit: 'cover', display: 'block',
          }} />
        ) : <ImgPlaceholder size={180} />}
      </div>

      <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <p onClick={() => onDetalle(p)} style={{
          fontSize: 13, color: C.texto, margin: '0 0 4px', fontWeight: 500,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', lineHeight: 1.4, cursor: 'pointer',
        }}>{p.descripcion}</p>

        {p.marca && (
          <span style={{ fontSize: 11, color: C.gris, marginBottom: 6 }}>{p.marca}</span>
        )}

        <div style={{ marginTop: 'auto' }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: C.precio, margin: '0 0 4px' }}>
            ${Number(p.precio_venta_final).toLocaleString('es-AR')}
          </p>
          {stockLabel && (
            <p style={{ fontSize: 11, color: stockColor, margin: '0 0 8px', fontWeight: 600 }}>
              {stockLabel}
            </p>
          )}
          <button
            onClick={() => onAgregar(p)}
            style={{
              width: '100%', backgroundColor: C.acento, color: '#fff',
              border: 'none', borderRadius: 6, padding: '8px 0',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            + Agregar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL DETALLE ────────────────────────────────────────────
function ModalDetalle({
  p, config, onClose, onAgregar,
}: {
  p: Producto; config: CatConfig;
  onClose: () => void;
  onAgregar: (p: Producto) => void;
}) {
  const stockLabel = config.mostrar_stock === 'cantidad'
    ? (p.stock != null && p.stock > 0 ? `${p.stock} en stock` : '')
    : config.mostrar_stock === 'disponibilidad'
    ? (p.disponible ? '● Disponible' : '')
    : '';
  const stockColor = C.verde;

  const waText = encodeURIComponent(
    `Hola! Me interesa: ${p.descripcion}\nCódigo: ${p.codigo}\n¿Tienen disponibilidad?`
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }} onClick={onClose}>
      <div style={{
        backgroundColor: C.card, borderRadius: 12, maxWidth: 640, width: '100%',
        maxHeight: '90vh', overflowY: 'auto', position: 'relative',
      }} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 12, right: 12, zIndex: 10,
          background: '#F0F0F0', border: 'none', borderRadius: '50%',
          width: 32, height: 32, fontSize: 16, cursor: 'pointer', color: C.gris,
        }}>✕</button>

        {p.imagen_url ? (
          <img src={optimizarUrl(p.imagen_url)} alt={p.descripcion} style={{
            width: '100%', height: 320, objectFit: 'cover',
            borderRadius: '12px 12px 0 0',
          }} />
        ) : (
          <div style={{ borderRadius: '12px 12px 0 0', overflow: 'hidden' }}>
            <ImgPlaceholder size={280} />
          </div>
        )}

        <div style={{ padding: '20px 24px 24px' }}>
          <p style={{ fontSize: 11, color: C.gris, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {p.rubro}{p.marca ? ` · ${p.marca}` : ''}
          </p>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.texto, margin: '0 0 4px', lineHeight: 1.4 }}>
            {p.descripcion}
          </h2>
          {p.codigo && (
            <p style={{ fontSize: 12, color: C.gris, margin: '0 0 16px' }}>Código: {p.codigo}</p>
          )}

          <p style={{ fontSize: 28, fontWeight: 700, color: C.precio, margin: '0 0 4px' }}>
            ${Number(p.precio_venta_final).toLocaleString('es-AR')}
          </p>
          {stockLabel && (
            <p style={{ fontSize: 13, color: stockColor, fontWeight: 600, margin: '0 0 20px' }}>
              {stockLabel}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => { onAgregar(p); onClose(); }} style={{
              backgroundColor: C.acento, color: '#fff', border: 'none',
              borderRadius: 8, padding: '13px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}>
              + Agregar al carrito
            </button>
            {config.whatsapp && (
              <a
                href={`https://wa.me/${config.whatsapp.replace(/\D/g, '')}?text=${waText}`}
                target="_blank" rel="noreferrer"
                style={{
                  backgroundColor: '#25D366', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '13px', fontSize: 15, fontWeight: 700,
                  cursor: 'pointer', textDecoration: 'none', textAlign: 'center', display: 'block',
                }}
              >
                💬 Consultar por WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CARRITO ──────────────────────────────────────────────────
function PanelCarrito({
  items, onClose, onCambiarCantidad, onEliminar, onPedido,
}: {
  items: ItemCarrito[];
  onClose: () => void;
  onCambiarCantidad: (id: number, delta: number) => void;
  onEliminar: (id: number) => void;
  onPedido: () => void;
}) {
  const total = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 900,
      }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 360,
        backgroundColor: C.card, zIndex: 901, display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.borde}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.texto }}>🛒 Tu carrito</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.gris }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: C.gris }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🛒</div>
              <p>Tu carrito está vacío</p>
            </div>
          ) : items.map(item => (
            <div key={item.id} style={{
              display: 'flex', gap: 12, paddingBottom: 12, marginBottom: 12,
              borderBottom: `1px solid ${C.borde}`,
            }}>
              {item.imagen_url ? (
                <img src={optimizarUrl(item.imagen_url)} alt={item.descripcion} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 60, height: 60, backgroundColor: '#F0F0F0', borderRadius: 6, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, color: C.texto, margin: '0 0 2px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.descripcion}
                </p>
                <p style={{ fontSize: 13, color: C.precio, fontWeight: 700, margin: '0 0 6px' }}>
                  ${Number(item.precio).toLocaleString('es-AR')}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => onCambiarCantidad(item.id, -1)} style={{
                    width: 28, height: 28, border: `1px solid ${C.borde}`, borderRadius: 6,
                    background: C.card, cursor: 'pointer', fontSize: 16, fontWeight: 700, color: C.texto,
                  }}>−</button>
                  <span style={{ fontSize: 14, fontWeight: 600, minWidth: 20, textAlign: 'center' }}>{item.cantidad}</span>
                  <button onClick={() => onCambiarCantidad(item.id, +1)} style={{
                    width: 28, height: 28, border: `1px solid ${C.borde}`, borderRadius: 6,
                    background: C.card, cursor: 'pointer', fontSize: 16, fontWeight: 700, color: C.texto,
                  }}>+</button>
                  <button onClick={() => onEliminar(item.id)} style={{
                    marginLeft: 'auto', background: 'none', border: 'none',
                    cursor: 'pointer', fontSize: 14, color: C.gris,
                  }}>✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {items.length > 0 && (
          <div style={{ padding: '16px 20px', borderTop: `1px solid ${C.borde}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: C.texto }}>Total</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: C.precio }}>
                ${total.toLocaleString('es-AR')}
              </span>
            </div>
            <button onClick={onPedido} style={{
              width: '100%', backgroundColor: C.acento, color: '#fff',
              border: 'none', borderRadius: 8, padding: '14px', fontSize: 15,
              fontWeight: 700, cursor: 'pointer',
            }}>
              Finalizar pedido
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── MODAL PEDIDO ─────────────────────────────────────────────
function ModalPedido({
  items, config, codigo, onClose,
}: {
  items: ItemCarrito[];
  config: CatConfig;
  codigo: string;
  onClose: (limpiar?: boolean) => void;
}) {
  const [form, setForm] = useState({
    nombre: '', telefono: '', email: '', direccion: '', notas: '',
  });
  const [enviando, setEnviando] = useState(false);
  const [exito, setExito] = useState<{ numero: string } | null>(null);
  const [error, setError] = useState('');

  const setF = (f: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }));

  const total = items.reduce((s, i) => s + i.precio * i.cantidad, 0);

  const confirmar = async () => {
    if (!form.nombre.trim()) { setError('El nombre es requerido'); return; }
    if (!form.telefono.trim()) { setError('El teléfono es requerido'); return; }
    setEnviando(true); setError('');
    try {
      const res = await fetch(`${API}/api/catalogo/${codigo}/pedido`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comprador_nombre:    form.nombre,
          comprador_telefono:  form.telefono,
          comprador_email:     form.email,
          comprador_direccion: form.direccion,
          notas:               form.notas,
          items: items.map(i => ({
            id: i.id, codigo: i.codigo,
            descripcion: i.descripcion,
            cantidad: i.cantidad, precio: i.precio,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al enviar');
      setExito({ numero: data.numero });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  if (exito) {
    const resumen = items.map(i => `• ${i.descripcion} x${i.cantidad} — $${(i.precio*i.cantidad).toLocaleString('es-AR')}`).join('\n');
    const waText = encodeURIComponent(
      `¡Hola! Hice un pedido en su catálogo.\nPedido ${exito.numero}\n\n${resumen}\n\nTotal: $${total.toLocaleString('es-AR')}`
    );
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1100, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ backgroundColor: C.card, borderRadius: 16, maxWidth: 460, width: '100%', padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.texto, margin: '0 0 8px' }}>
            ¡Pedido {exito.numero} recibido!
          </h2>
          <p style={{ color: C.gris, fontSize: 14, margin: '0 0 28px' }}>
            {config.mensaje_cierre || 'Te contactamos a la brevedad.'}
          </p>
          {config.whatsapp && (
            <a
              href={`https://wa.me/${config.whatsapp.replace(/\D/g, '')}?text=${waText}`}
              target="_blank" rel="noreferrer"
              style={{
                display: 'block', backgroundColor: '#25D366', color: '#fff',
                borderRadius: 8, padding: '13px', fontSize: 15, fontWeight: 700,
                textDecoration: 'none', marginBottom: 12,
              }}
            >
              💬 Ver resumen por WhatsApp
            </a>
          )}
          <button onClick={() => onClose(true)} style={{
            width: '100%', backgroundColor: C.bg, color: C.texto,
            border: `1px solid ${C.borde}`, borderRadius: 8, padding: '12px',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: C.card, borderRadius: 12, maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '28px 28px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.texto }}>Finalizar pedido</h3>
          <button onClick={() => onClose()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.gris }}>✕</button>
        </div>

        {/* Resumen */}
        <div style={{ backgroundColor: C.bg, borderRadius: 8, padding: '12px 14px', marginBottom: 20, fontSize: 13, color: C.gris }}>
          {items.map(i => (
            <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>{i.descripcion} ×{i.cantidad}</span>
              <span style={{ fontWeight: 600, color: C.texto }}>${(i.precio*i.cantidad).toLocaleString('es-AR')}</span>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${C.borde}`, marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: C.texto, fontSize: 14 }}>
            <span>Total</span>
            <span>${total.toLocaleString('es-AR')}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { label: 'Nombre y Apellido *', field: 'nombre' as const, type: 'text', ph: 'Juan Pérez' },
            { label: 'Teléfono *', field: 'telefono' as const, type: 'tel', ph: '+54 9 11 1234-5678' },
            { label: 'Email', field: 'email' as const, type: 'email', ph: 'juan@email.com' },
            { label: 'Dirección (opcional)', field: 'direccion' as const, type: 'text', ph: 'Av. Corrientes 1234, CABA' },
          ].map(({ label, field, type, ph }) => (
            <div key={field}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.gris, marginBottom: 4 }}>{label}</label>
              <input type={type} value={form[field]} onChange={setF(field)} placeholder={ph}
                style={{
                  width: '100%', border: `1.5px solid ${C.borde}`, borderRadius: 7,
                  padding: '9px 12px', fontSize: 14, color: C.texto, outline: 'none',
                  boxSizing: 'border-box',
                }} />
            </div>
          ))}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.gris, marginBottom: 4 }}>Notas adicionales</label>
            <textarea value={form.notas} onChange={setF('notas')} placeholder="Horario de entrega, referencias..."
              rows={3}
              style={{
                width: '100%', border: `1.5px solid ${C.borde}`, borderRadius: 7,
                padding: '9px 12px', fontSize: 14, color: C.texto, outline: 'none',
                boxSizing: 'border-box', resize: 'vertical',
              }} />
          </div>
        </div>

        {error && (
          <p style={{ color: '#E53E3E', fontSize: 13, margin: '12px 0 0', fontWeight: 500 }}>{error}</p>
        )}

        <button onClick={confirmar} disabled={enviando} style={{
          width: '100%', marginTop: 20,
          backgroundColor: enviando ? '#90CDF4' : C.acento,
          color: '#fff', border: 'none', borderRadius: 8, padding: '14px',
          fontSize: 15, fontWeight: 700, cursor: enviando ? 'not-allowed' : 'pointer',
        }}>
          {enviando ? 'Enviando...' : 'Confirmar pedido'}
        </button>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────
export default function CatalogoPublico() {
  const codigo = window.location.pathname.split('/').pop() || '';

  const [config,       setConfig]       = useState<CatConfig | null>(null);
  const [productos,    setProductos]    = useState<Producto[]>([]);
  const [destacados,   setDestacados]   = useState<Producto[]>([]);
  const [filtros,      setFiltros]      = useState<Filtros>({ rubros: [], marcas: [], precio_min: 0, precio_max: 0 });
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [cargando,     setCargando]     = useState(true);
  const [noDisponible, setNoDisponible] = useState(false);

  // Filtros aplicados
  const [buscar,        setBuscar]        = useState('');
  const [rubrosSelec,   setRubrosSelec]   = useState<string[]>([]);
  const [marcasSelec,   setMarcasSelec]   = useState<string[]>([]);
  const [precioMin,     setPrecioMin]     = useState('');
  const [precioMax,     setPrecioMax]     = useState('');
  const [soloDisponible,  setSoloDisponible]  = useState(false);
  const [soloDestacados,  setSoloDestacados]  = useState(false);
  const [rubroOpen,       setRubroOpen]       = useState(true);
  const [marcaOpen,       setMarcaOpen]       = useState(true);

  const buscarDb = useDebounce(buscar, 400);

  // UI
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [carritoOpen,   setCarritoOpen]   = useState(false);
  const [pedidoOpen,    setPedidoOpen]    = useState(false);
  const [detalleItem,   setDetalleItem]   = useState<Producto | null>(null);
  const LIMIT = 24;

  // Carrito
  const carritoKey = `carrito_${codigo}`;
  const [carrito, setCarrito] = useState<ItemCarrito[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(carritoKey) || '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    sessionStorage.setItem(carritoKey, JSON.stringify(carrito));
  }, [carrito, carritoKey]);

  // ── CARGA INICIAL ────────────────────────────────────────────
  useEffect(() => {
    if (!codigo) { setNoDisponible(true); setCargando(false); return; }
    fetch(`${API}/api/catalogo/${codigo}/config`)
      .then(r => {
        if (r.status === 404) { setNoDisponible(true); setCargando(false); return null; }
        return r.json();
      })
      .then(d => {
        if (!d) return;
        if (!d.activo) { setNoDisponible(true); setCargando(false); return; }
        setConfig(d);

        // PWA — manifest dinámico por cliente
        const existingManifest = document.querySelector('link[rel="manifest"]');
        if (existingManifest) {
          existingManifest.setAttribute('href', `/api/catalogo/${codigo}/manifest.json`);
        } else {
          const link = document.createElement('link');
          link.rel = 'manifest';
          link.href = `/api/catalogo/${codigo}/manifest.json`;
          document.head.appendChild(link);
        }
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) metaTheme.setAttribute('content', '#2B6CB0');
        document.title = d.nombre_comercial || 'Catálogo';

        // Cargar filtros
        fetch(`${API}/api/catalogo/${codigo}/filtros`)
          .then(r => r.json()).then(setFiltros).catch(() => {});
        setCargando(false);
      })
      .catch(() => { setNoDisponible(true); setCargando(false); });

    return () => {
      document.title = 'Gestión Integral Pedidos';
      const m = document.querySelector('link[rel="manifest"]');
      if (m) m.setAttribute('href', '/manifest.json');
    };
  }, [codigo]);

  // ── CARGAR PRODUCTOS ─────────────────────────────────────────
  const cargarProductos = useCallback(() => {
    if (!codigo) return;
    const params = new URLSearchParams({
      page: String(page), limit: String(LIMIT),
    });
    if (buscarDb)                  params.set('buscar',          buscarDb);
    if (rubrosSelec.length > 0)    params.set('rubro',           rubrosSelec.join(','));
    if (marcasSelec.length > 0)    params.set('marca',           marcasSelec.join(','));
    if (precioMin)                 params.set('precio_min',      precioMin);
    if (precioMax)                 params.set('precio_max',      precioMax);
    if (soloDisponible)            params.set('solo_disponible', 'true');
    const modoCat = config?.modo_catalogo || 'todos';
    if (soloDestacados || modoCat === 'solo_destacados') params.set('destacado', 'true');

    fetch(`${API}/api/catalogo/${codigo}/productos?${params}`)
      .then(r => r.json())
      .then(d => {
        setProductos(d.productos || []);
        setTotal(d.total || 0);
        // Destacados separados solo en modo 'destacados_primero', primera carga sin filtros
        if (page === 1 && !buscarDb && !rubrosSelec.length && !marcasSelec.length && modoCat === 'destacados_primero') {
          const dest = (d.productos || []).filter((p: Producto) => p.destacado);
          setDestacados(dest);
        } else if (modoCat !== 'destacados_primero') {
          setDestacados([]);
        }
      })
      .catch(() => {});
  }, [codigo, page, buscarDb, rubrosSelec, marcasSelec, precioMin, precioMax, soloDisponible, soloDestacados, config]);

  useEffect(() => {
    if (config) cargarProductos();
  }, [config, cargarProductos]);

  // Reset página al cambiar filtros
  useEffect(() => { setPage(1); }, [buscarDb, rubrosSelec, marcasSelec, precioMin, precioMax, soloDisponible, soloDestacados]);

  // ── CARRITO HELPERS ──────────────────────────────────────────
  const agregar = (p: Producto) => {
    setCarrito(prev => {
      const exist = prev.find(i => i.id === p.id);
      if (exist) return prev.map(i => i.id === p.id ? { ...i, cantidad: i.cantidad + 1 } : i);
      return [...prev, {
        id: p.id, codigo: p.codigo, descripcion: p.descripcion,
        precio: p.precio_venta_final, imagen_url: p.imagen_url, cantidad: 1,
      }];
    });
  };

  const cambiarCantidad = (id: number, delta: number) => {
    setCarrito(prev =>
      prev.map(i => i.id === id ? { ...i, cantidad: Math.max(1, i.cantidad + delta) } : i)
    );
  };

  const eliminar = (id: number) => {
    setCarrito(prev => prev.filter(i => i.id !== id));
  };

  const limpiarCarrito = () => setCarrito([]);

  const limpiarFiltros = () => {
    setBuscar(''); setRubrosSelec([]); setMarcasSelec([]);
    setPrecioMin(''); setPrecioMax(''); setSoloDisponible(false); setSoloDestacados(false);
  };

  const toggleRubro = (r: string) =>
    setRubrosSelec(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  const toggleMarca = (m: string) =>
    setMarcasSelec(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);

  const totalPages = Math.ceil(total / LIMIT);
  const cantCarrito = carrito.reduce((s, i) => s + i.cantidad, 0);
  const hayFiltros = !!(buscar || rubrosSelec.length || marcasSelec.length || precioMin || precioMax || soloDisponible || soloDestacados);

  // ── PANTALLAS DE ESTADO ──────────────────────────────────────
  if (cargando) return (
    <div style={{ minHeight: '100vh', backgroundColor: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, border: `3px solid #E0E0E0`, borderTopColor: C.acento, borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />
        <p style={{ color: C.gris, fontSize: 14 }}>Cargando catálogo...</p>
      </div>
    </div>
  );

  if (noDisponible || !config) return (
    <div style={{ minHeight: '100vh', backgroundColor: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🔒</div>
        <h2 style={{ fontSize: 20, color: C.texto, fontWeight: 700, margin: '0 0 8px' }}>Catálogo no disponible</h2>
        <p style={{ color: C.gris, fontSize: 14 }}>Este catálogo no está activo o el código es incorrecto.</p>
      </div>
    </div>
  );

  // ── SIDEBAR FILTROS ──────────────────────────────────────────
  const secTitleStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    cursor: 'pointer', userSelect: 'none', marginBottom: 0,
    padding: '6px 0',
  };
  const secLabelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: C.gris,
    textTransform: 'uppercase', letterSpacing: '0.6px',
  };

  const SidebarFiltros = ({ inline }: { inline?: boolean }) => (
    <div style={{ width: inline ? 240 : '100%', flexShrink: 0 }}>

      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.texto }}>Filtros</span>
        {hayFiltros && (
          <button onClick={limpiarFiltros} style={{ background: 'none', border: 'none', color: C.acento, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
            Limpiar todo
          </button>
        )}
      </div>

      {/* Solo destacados */}
      {(config?.modo_catalogo || 'todos') !== 'solo_destacados' && (
        <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${C.borde}` }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: C.texto }}>
            <input type="checkbox" checked={soloDestacados} onChange={e => setSoloDestacados(e.target.checked)}
              style={{ accentColor: C.acento, width: 15, height: 15 }} />
            <span>⭐ Solo destacados</span>
          </label>
        </div>
      )}

      {/* Categoría */}
      {filtros.rubros.length > 0 && (
        <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.borde}` }}>
          <div style={secTitleStyle} onClick={() => setRubroOpen(v => !v)}>
            <span style={secLabelStyle}>
              Categoría{rubrosSelec.length > 0 ? ` (${rubrosSelec.length})` : ''}
            </span>
            <span style={{ fontSize: 10, color: C.gris }}>{rubroOpen ? '▲' : '▼'}</span>
          </div>
          {rubroOpen && (
            <div style={{ marginTop: 8, maxHeight: filtros.rubros.length > 5 ? 150 : 'none', overflowY: filtros.rubros.length > 5 ? 'auto' : 'visible' }}>
              {filtros.rubros.map(r => (
                <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, cursor: 'pointer', fontSize: 13, color: C.texto }}>
                  <input type="checkbox" checked={rubrosSelec.includes(r)} onChange={() => toggleRubro(r)}
                    style={{ accentColor: C.acento, width: 15, height: 15, flexShrink: 0 }} />
                  <span style={{ lineHeight: 1.3 }}>{r}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Marca */}
      {filtros.marcas.length > 0 && (
        <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.borde}` }}>
          <div style={secTitleStyle} onClick={() => setMarcaOpen(v => !v)}>
            <span style={secLabelStyle}>
              Marca{marcasSelec.length > 0 ? ` (${marcasSelec.length})` : ''}
            </span>
            <span style={{ fontSize: 10, color: C.gris }}>{marcaOpen ? '▲' : '▼'}</span>
          </div>
          {marcaOpen && (
            <div style={{ marginTop: 8, maxHeight: filtros.marcas.length > 5 ? 150 : 'none', overflowY: filtros.marcas.length > 5 ? 'auto' : 'visible' }}>
              {filtros.marcas.map(m => (
                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, cursor: 'pointer', fontSize: 13, color: C.texto }}>
                  <input type="checkbox" checked={marcasSelec.includes(m)} onChange={() => toggleMarca(m)}
                    style={{ accentColor: C.acento, width: 15, height: 15, flexShrink: 0 }} />
                  <span style={{ lineHeight: 1.3 }}>{m}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Precio */}
      <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.borde}` }}>
        <p style={{ ...secLabelStyle, margin: '0 0 8px' }}>Precio</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="number" placeholder="Mín" value={precioMin} onChange={e => setPrecioMin(e.target.value)}
            style={{ width: '50%', border: `1px solid ${C.borde}`, borderRadius: 6, padding: '6px 8px', fontSize: 13, outline: 'none' }} />
          <span style={{ fontSize: 11, color: C.gris, flexShrink: 0 }}>—</span>
          <input type="number" placeholder="Máx" value={precioMax} onChange={e => setPrecioMax(e.target.value)}
            style={{ width: '50%', border: `1px solid ${C.borde}`, borderRadius: 6, padding: '6px 8px', fontSize: 13, outline: 'none' }} />
        </div>
      </div>

      {/* Solo disponibles */}
      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: C.texto }}>
          <input type="checkbox" checked={soloDisponible} onChange={e => setSoloDisponible(e.target.checked)}
            style={{ accentColor: C.acento, width: 15, height: 15 }} />
          Solo disponibles
        </label>
      </div>
    </div>
  );

  // ── RENDER ───────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: C.bg, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`
        @media (max-width: 768px) {
          .cat-grid { grid-template-columns: repeat(2,1fr) !important; }
          .cat-layout { flex-direction: column !important; }
          .cat-sidebar-inline { display: none !important; }
          .cat-hero { height: 180px !important; }
          .cat-sidebar-mobile { display: flex !important; }
        }
        @media (min-width: 769px) and (max-width: 1100px) {
          .cat-grid { grid-template-columns: repeat(2,1fr) !important; }
        }
        @media (min-width: 1101px) {
          .cat-grid { grid-template-columns: repeat(4,1fr) !important; }
        }
      `}</style>

      {/* ── HEADER ──────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 200,
        backgroundColor: C.card, borderBottom: `1px solid ${C.borde}`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 20px', height: 64, display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Logo + nombre */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {config.logo_url ? (
              <img src={config.logo_url} alt={config.nombre_comercial} style={{ height: 40, objectFit: 'contain' }} />
            ) : (
              <div style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: config.color_primario, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16 }}>
                {config.nombre_comercial?.[0] || '?'}
              </div>
            )}
            <span style={{ fontSize: 14, fontWeight: 700, color: C.texto, whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {config.nombre_comercial}
            </span>
          </div>

          {/* Búsqueda */}
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              type="text"
              value={buscar}
              onChange={e => setBuscar(e.target.value)}
              placeholder="Buscar productos..."
              style={{
                width: '100%', border: `2px solid ${C.borde}`, borderRadius: 8,
                padding: '9px 40px 9px 14px', fontSize: 14, color: C.texto,
                outline: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = C.acento; }}
              onBlur={e => { e.currentTarget.style.borderColor = C.borde; }}
            />
            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: C.gris, fontSize: 16 }}>🔍</span>
          </div>

          {/* Carrito */}
          <button onClick={() => setCarritoOpen(true)} style={{
            position: 'relative', background: 'none', border: 'none',
            cursor: 'pointer', fontSize: 24, padding: '4px 6px', flexShrink: 0,
          }}>
            🛒
            {cantCarrito > 0 && (
              <span style={{
                position: 'absolute', top: 0, right: 0,
                backgroundColor: C.acento, color: '#fff',
                fontSize: 10, fontWeight: 700, borderRadius: '50%',
                width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{cantCarrito}</span>
            )}
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 20px' }}>

        {/* ── BANNERS ─────────────────────────────────────── */}
        {config.banners.length > 0 && (
          <div style={{ margin: '16px 0' }}>
            <Carousel banners={config.banners} />
          </div>
        )}

        {/* ── TEXTO BIENVENIDA ────────────────────────────── */}
        {config.texto_bienvenida && (
          <div style={{
            textAlign: 'center',
            padding: '16px 20px',
            fontSize: 15,
            color: '#555555',
            background: '#FFFFFF',
            borderBottom: '1px solid #EEEEEE',
          }}>
            {config.texto_bienvenida}
          </div>
        )}

        {/* ── DESTACADOS (solo en modo 'destacados_primero') ── */}
        {!hayFiltros && destacados.length > 0 && (config?.modo_catalogo || 'todos') === 'destacados_primero' && (
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: C.texto, margin: '0 0 12px' }}>⭐ Destacados</h2>
            <div style={{
              display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8,
              scrollbarWidth: 'thin',
            }}>
              {destacados.map(p => (
                <div key={p.id} style={{ minWidth: 200, maxWidth: 200, flexShrink: 0 }}>
                  <CardProducto p={p} config={config} onAgregar={agregar} onDetalle={setDetalleItem} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── FILTROS MOBILE ──────────────────────────────── */}
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            className="cat-sidebar-mobile"
            onClick={() => setSidebarOpen(true)}
            style={{
              display: 'none',
              backgroundColor: C.card, border: `1px solid ${C.borde}`,
              borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', color: C.texto,
            }}
          >
            ⚙️ Filtros {hayFiltros ? '•' : ''}
          </button>
          <p style={{ fontSize: 13, color: C.gris, margin: 0 }}>
            {total > 0 ? `Mostrando ${(page - 1) * LIMIT + 1}–${Math.min(page * LIMIT, total)} de ${total} productos` : `${total} productos`}
          </p>
        </div>

        {/* ── LAYOUT PRINCIPAL ────────────────────────────── */}
        <div className="cat-layout" style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

          {/* Sidebar inline (desktop) */}
          <div className="cat-sidebar-inline" style={{ width: 240, flexShrink: 0, backgroundColor: C.card, borderRadius: 10, border: `1px solid ${C.borde}`, padding: '16px', position: 'sticky', top: 80 }}>
            <SidebarFiltros inline />
          </div>

          {/* Grilla */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {productos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
                <p style={{ color: C.gris, fontSize: 15 }}>No encontramos productos con esos criterios.</p>
                {hayFiltros && (
                  <button onClick={limpiarFiltros} style={{ marginTop: 12, backgroundColor: C.acento, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                    Limpiar filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="cat-grid" style={{ display: 'grid', gap: 12 }}>
                {productos.map(p => (
                  <CardProducto key={p.id} p={p} config={config} onAgregar={agregar} onDetalle={setDetalleItem} />
                ))}
              </div>
            )}

            {/* Paginación */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 32, flexWrap: 'wrap' }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ padding: '8px 16px', border: `1px solid ${C.borde}`, borderRadius: 8, background: page === 1 ? C.bg : C.card, cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 13, color: page === 1 ? C.gris : C.texto }}>
                  ← Anterior
                </button>
                {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      style={{
                        width: 36, height: 36, border: `1px solid ${p === page ? C.acento : C.borde}`,
                        borderRadius: 8, background: p === page ? C.acento : C.card,
                        color: p === page ? '#fff' : C.texto, fontWeight: p === page ? 700 : 400,
                        cursor: 'pointer', fontSize: 13,
                      }}>
                      {p}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  style={{ padding: '8px 16px', border: `1px solid ${C.borde}`, borderRadius: 8, background: page === totalPages ? C.bg : C.card, cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: 13, color: page === totalPages ? C.gris : C.texto }}>
                  Siguiente →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── SIDEBAR MOBILE (overlay) ────────────────────────── */}
      {sidebarOpen && (
        <>
          <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 800 }} />
          <div style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: 300, backgroundColor: C.card, zIndex: 801, overflowY: 'auto', boxShadow: '4px 0 24px rgba(0,0,0,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${C.borde}` }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Filtros</h3>
              <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.gris }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px' }}><SidebarFiltros /></div>
          </div>
        </>
      )}

      {/* ── MODAL DETALLE ───────────────────────────────────── */}
      {detalleItem && (
        <ModalDetalle p={detalleItem} config={config} onClose={() => setDetalleItem(null)} onAgregar={agregar} />
      )}

      {/* ── CARRITO ─────────────────────────────────────────── */}
      {carritoOpen && (
        <PanelCarrito
          items={carrito}
          onClose={() => setCarritoOpen(false)}
          onCambiarCantidad={cambiarCantidad}
          onEliminar={eliminar}
          onPedido={() => { setCarritoOpen(false); setPedidoOpen(true); }}
        />
      )}

      {/* ── MODAL PEDIDO ────────────────────────────────────── */}
      {pedidoOpen && (
        <ModalPedido
          items={carrito}
          config={config}
          codigo={codigo}
          onClose={(limpiar) => {
            setPedidoOpen(false);
            if (limpiar) limpiarCarrito();
          }}
        />
      )}
    </div>
  );
}
