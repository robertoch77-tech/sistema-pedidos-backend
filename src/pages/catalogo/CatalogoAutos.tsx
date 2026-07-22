import React, { useEffect, useState, useCallback } from 'react';

const API = process.env.REACT_APP_API_URL || '';

// ─── PALETA ───────────────────────────────────────────────────
const C = {
  bg:     '#F5F5F5',
  card:   '#FFFFFF',
  texto:  '#333333',
  precio: '#333333',
  acento: '#2B6CB0',
  verde:  '#00A650',
  gris:   '#999999',
  borde:  '#EEEEEE',
};

// ─── TIPOS ────────────────────────────────────────────────────
interface CatConfig {
  nombre_comercial: string;
  logo_url:         string;
  direccion:        string;
  whatsapp:         string;
  banners:          string[];
  tipo:             string;
  activo:           boolean;
  mostrar_stock:    string;
  color_primario:   string;
}

interface Auto {
  id:            number;
  marca:         string;
  modelo:        string;
  anio:          number;
  version:       string;
  color:         string;
  patente:       string;
  km:            number;
  tipo:          string;
  precio_venta:  number;
  fotos:         string[];
  destacado:     boolean;
  observaciones: string;
}

// ─── HOOKS ────────────────────────────────────────────────────
function useDebounce<T>(val: T, ms: number): T {
  const [d, setD] = useState(val);
  useEffect(() => { const t = setTimeout(() => setD(val), ms); return () => clearTimeout(t); }, [val, ms]);
  return d;
}

// ─── PLACEHOLDER ─────────────────────────────────────────────
const ImgPlaceholder = ({ ratio = '16/9' }: { ratio?: string }) => (
  <div style={{
    width: '100%', aspectRatio: ratio,
    backgroundColor: '#F0F0F0',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    <svg width="56" height="40" viewBox="0 0 56 40" fill="none">
      <rect x="2" y="12" width="52" height="26" rx="4" stroke="#CCC" strokeWidth="2" fill="none"/>
      <path d="M8 12L14 4h28l6 8" stroke="#CCC" strokeWidth="2" strokeLinejoin="round"/>
      <circle cx="14" cy="36" r="4" fill="#CCC"/>
      <circle cx="42" cy="36" r="4" fill="#CCC"/>
    </svg>
  </div>
);

// ─── BADGE TIPO ───────────────────────────────────────────────
const TIPO_LABELS: Record<string, string> = {
  auto:       '🚗 Auto',
  camioneta:  '🛻 Camioneta',
  moto:       '🏍️ Moto',
  utilitario: '🚐 Utilitario',
  camion:     '🚛 Camión',
};

// ─── GALERÍA FOTOS ────────────────────────────────────────────
function Galeria({ fotos, alt }: { fotos: string[]; alt: string }) {
  const [idx, setIdx] = useState(0);
  const [startX, setStartX] = useState<number | null>(null);

  const prev = () => setIdx(i => (i - 1 + fotos.length) % fotos.length);
  const next = () => setIdx(i => (i + 1) % fotos.length);

  const onTouchStart = (e: React.TouchEvent) => setStartX(e.touches[0].clientX);
  const onTouchEnd   = (e: React.TouchEvent) => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (dx < -40) next();
    else if (dx > 40) prev();
    setStartX(null);
  };

  if (!fotos.length) return (
    <div style={{ borderRadius: '12px 12px 0 0', overflow: 'hidden' }}>
      <ImgPlaceholder ratio="16/9" />
    </div>
  );

  return (
    <div style={{ position: 'relative', borderRadius: '12px 12px 0 0', overflow: 'hidden', backgroundColor: '#000' }}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <img src={fotos[idx]} alt={`${alt} ${idx + 1}`} style={{
        width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block',
        transition: 'opacity 0.3s',
      }} />

      {fotos.length > 1 && (
        <>
          <button onClick={prev} style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(0,0,0,0.45)', border: 'none', borderRadius: '50%',
            width: 36, height: 36, color: '#fff', fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>‹</button>
          <button onClick={next} style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(0,0,0,0.45)', border: 'none', borderRadius: '50%',
            width: 36, height: 36, color: '#fff', fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>›</button>
          <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6 }}>
            {fotos.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)} style={{
                width: i === idx ? 20 : 8, height: 8, borderRadius: 4,
                backgroundColor: i === idx ? '#fff' : 'rgba(255,255,255,0.5)',
                border: 'none', cursor: 'pointer', padding: 0, transition: 'all 0.3s',
              }} />
            ))}
          </div>
          <div style={{
            position: 'absolute', top: 10, right: 10,
            backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff',
            fontSize: 11, fontWeight: 600, borderRadius: 10, padding: '2px 8px',
          }}>{idx + 1}/{fotos.length}</div>
        </>
      )}
    </div>
  );
}

// ─── CARD AUTO ────────────────────────────────────────────────
function CardAuto({
  auto, onDetalle,
}: {
  auto: Auto;
  onDetalle: (a: Auto) => void;
}) {
  const [hover, setHover] = useState(false);
  const foto = Array.isArray(auto.fotos) && auto.fotos.length > 0 ? auto.fotos[0] : '';

  return (
    <div
      onClick={() => onDetalle(auto)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        backgroundColor: C.card, borderRadius: 10,
        border: `1px solid ${C.borde}`,
        boxShadow: hover ? '0 4px 16px rgba(0,0,0,0.10)' : '0 1px 4px rgba(0,0,0,0.06)',
        overflow: 'hidden', cursor: 'pointer',
        display: 'flex', flexDirection: 'column',
        transition: 'box-shadow 0.2s',
        position: 'relative',
      }}
    >
      {auto.destacado && (
        <div style={{
          position: 'absolute', top: 8, right: 8, zIndex: 2,
          backgroundColor: '#F6C23E', color: '#7A4F01',
          fontSize: 10, fontWeight: 700, borderRadius: 12, padding: '2px 8px',
        }}>⭐ Destacado</div>
      )}

      {/* Foto 16:9 */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {foto ? (
          <img src={foto} alt={`${auto.marca} ${auto.modelo}`} style={{
            width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block',
          }} />
        ) : <ImgPlaceholder ratio="16/9" />}

        {/* Badge tipo */}
        {auto.tipo && (
          <span style={{
            position: 'absolute', bottom: 8, left: 8,
            backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff',
            fontSize: 11, fontWeight: 600, borderRadius: 10, padding: '2px 8px',
          }}>{TIPO_LABELS[auto.tipo] || auto.tipo}</span>
        )}
      </div>

      <div style={{ padding: '12px 14px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: C.texto, margin: '0 0 4px' }}>
          {auto.marca} {auto.modelo}
        </p>
        <div style={{ display: 'flex', gap: 10, fontSize: 12, color: C.gris, marginBottom: 6 }}>
          <span>{auto.anio}</span>
          {auto.km != null && <span>· {Number(auto.km).toLocaleString('es-AR')} km</span>}
        </div>
        {(auto.color || auto.patente) && (
          <div style={{ display: 'flex', gap: 10, fontSize: 12, color: C.gris, marginBottom: 8 }}>
            {auto.color   && <span>{auto.color}</span>}
            {auto.patente && <span>· {auto.patente}</span>}
          </div>
        )}

        <div style={{ marginTop: 'auto' }}>
          <p style={{ fontSize: 20, fontWeight: 700, color: C.precio, margin: '0 0 10px' }}>
            ${Number(auto.precio_venta).toLocaleString('es-AR')}
          </p>
          <div style={{
            width: '100%', backgroundColor: C.acento, color: '#fff',
            border: 'none', borderRadius: 7, padding: '9px 0',
            fontSize: 13, fontWeight: 600, textAlign: 'center',
          }}>
            Ver más →
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL AUTO ───────────────────────────────────────────────
function ModalAuto({
  auto, config, codigo, onClose,
}: {
  auto: Auto; config: CatConfig; codigo: string; onClose: () => void;
}) {
  const [consultaOpen, setConsultaOpen] = useState(false);

  const titulo = `${auto.marca} ${auto.modelo} ${auto.anio}`;
  const waText = encodeURIComponent(
    `Hola! Me interesa el ${auto.marca} ${auto.modelo} ${auto.anio} - ${auto.color}. ¿Está disponible?`
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      backgroundColor: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }} onClick={onClose}>
      <div style={{
        backgroundColor: C.card, borderRadius: 14,
        maxWidth: 680, width: '100%',
        maxHeight: '92vh', overflowY: 'auto',
        position: 'relative',
      }} onClick={e => e.stopPropagation()}>

        <button onClick={onClose} style={{
          position: 'absolute', top: 12, right: 12, zIndex: 10,
          background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%',
          width: 34, height: 34, fontSize: 16, cursor: 'pointer', color: '#fff',
        }}>✕</button>

        {/* Galería */}
        <Galeria fotos={Array.isArray(auto.fotos) ? auto.fotos : []} alt={titulo} />

        {/* Info */}
        <div style={{ padding: '20px 24px 24px' }}>
          {auto.tipo && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: C.acento,
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>{TIPO_LABELS[auto.tipo] || auto.tipo}</span>
          )}
          <h2 style={{ fontSize: 22, fontWeight: 700, color: C.texto, margin: '4px 0 12px', lineHeight: 1.3 }}>
            {titulo}
          </h2>

          {/* Ficha técnica */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: '10px 24px', marginBottom: 20,
            padding: '14px 16px', backgroundColor: C.bg, borderRadius: 10,
          }}>
            {[
              { label: 'Versión',   value: auto.version  },
              { label: 'Color',     value: auto.color    },
              { label: 'Km',        value: auto.km != null ? `${Number(auto.km).toLocaleString('es-AR')} km` : undefined },
              { label: 'Patente',   value: auto.patente  },
            ].filter(f => f.value).map(({ label, value }) => (
              <div key={label}>
                <p style={{ fontSize: 11, fontWeight: 600, color: C.gris, textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 2px' }}>{label}</p>
                <p style={{ fontSize: 14, fontWeight: 500, color: C.texto, margin: 0 }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Precio */}
          <p style={{ fontSize: 30, fontWeight: 700, color: C.precio, margin: '0 0 16px' }}>
            ${Number(auto.precio_venta).toLocaleString('es-AR')}
          </p>

          {/* Observaciones */}
          {auto.observaciones && (
            <p style={{ fontSize: 14, color: C.gris, lineHeight: 1.6, margin: '0 0 20px', whiteSpace: 'pre-wrap' }}>
              {auto.observaciones}
            </p>
          )}

          {/* Acciones */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => setConsultaOpen(true)} style={{
              backgroundColor: C.acento, color: '#fff', border: 'none',
              borderRadius: 9, padding: '14px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}>
              Consultar este vehículo
            </button>
            {config.whatsapp && (
              <a
                href={`https://wa.me/${config.whatsapp.replace(/\D/g, '')}?text=${waText}`}
                target="_blank" rel="noreferrer"
                style={{
                  display: 'block', backgroundColor: '#25D366', color: '#fff',
                  borderRadius: 9, padding: '14px', fontSize: 15, fontWeight: 700,
                  textDecoration: 'none', textAlign: 'center',
                }}
              >
                💬 Consultar por WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Modal consulta */}
      {consultaOpen && (
        <ModalConsulta
          auto={auto}
          config={config}
          codigo={codigo}
          onClose={() => setConsultaOpen(false)}
        />
      )}
    </div>
  );
}

// ─── MODAL CONSULTA ───────────────────────────────────────────
function ModalConsulta({
  auto, config, codigo, onClose,
}: {
  auto: Auto; config: CatConfig; codigo: string; onClose: () => void;
}) {
  const [form, setForm] = useState({
    nombre:   '',
    telefono: '',
    email:    '',
    mensaje:  `Hola! Me interesa el ${auto.marca} ${auto.modelo} ${auto.anio} - ${auto.color}. ¿Está disponible?`,
  });
  const [enviando, setEnviando] = useState(false);
  const [exito, setExito]       = useState(false);
  const [error, setError]       = useState('');

  const setF = (f: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }));

  const confirmar = async () => {
    if (!form.nombre.trim())   { setError('El nombre es requerido');   return; }
    if (!form.telefono.trim()) { setError('El teléfono es requerido'); return; }
    setEnviando(true); setError('');
    try {
      const res = await fetch(`${API}/api/catalogo/${codigo}/pedido`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comprador_nombre:   form.nombre,
          comprador_telefono: form.telefono,
          comprador_email:    form.email,
          notas:              form.mensaje,
          items: [{
            id:          auto.id,
            codigo:      auto.patente || String(auto.id),
            descripcion: `${auto.marca} ${auto.modelo} ${auto.anio}`,
            cantidad:    1,
            precio:      auto.precio_venta,
            tipo:        'consulta_auto',
          }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al enviar');
      setExito(true);
      // Abrir WhatsApp al mismo tiempo
      if (config.whatsapp) {
        const waText = encodeURIComponent(form.mensaje);
        window.open(`https://wa.me/${config.whatsapp.replace(/\D/g, '')}?text=${waText}`, '_blank');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      backgroundColor: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onClose}>
      <div style={{
        backgroundColor: C.card, borderRadius: 14, maxWidth: 460, width: '100%',
        maxHeight: '90vh', overflowY: 'auto', padding: '28px 28px 24px',
      }} onClick={e => e.stopPropagation()}>

        {exito ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 52, marginBottom: 14 }}>✅</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: C.texto, margin: '0 0 8px' }}>
              ¡Consulta enviada!
            </h3>
            <p style={{ color: C.gris, fontSize: 14, margin: '0 0 24px' }}>
              Nos ponemos en contacto a la brevedad.
            </p>
            <button onClick={onClose} style={{
              backgroundColor: C.bg, color: C.texto,
              border: `1px solid ${C.borde}`, borderRadius: 8,
              padding: '11px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>Cerrar</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.texto }}>
                Consultar vehículo
              </h3>
              <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.gris }}>✕</button>
            </div>

            {/* Resumen auto */}
            <div style={{
              backgroundColor: C.bg, borderRadius: 8, padding: '10px 14px',
              marginBottom: 18, fontSize: 13, color: C.gris,
            }}>
              <span style={{ fontWeight: 700, color: C.texto }}>
                {auto.marca} {auto.modelo} {auto.anio}
              </span>
              {auto.color && <span> · {auto.color}</span>}
              <span style={{ float: 'right', fontWeight: 700, color: C.precio }}>
                ${Number(auto.precio_venta).toLocaleString('es-AR')}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Nombre y Apellido *', field: 'nombre'   as const, type: 'text', ph: 'Juan Pérez' },
                { label: 'Teléfono *',          field: 'telefono' as const, type: 'tel',  ph: '+54 9 11 1234-5678' },
                { label: 'Email',               field: 'email'    as const, type: 'email',ph: 'juan@email.com' },
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
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.gris, marginBottom: 4 }}>Mensaje</label>
                <textarea value={form.mensaje} onChange={setF('mensaje')} rows={3}
                  style={{
                    width: '100%', border: `1.5px solid ${C.borde}`, borderRadius: 7,
                    padding: '9px 12px', fontSize: 14, color: C.texto, outline: 'none',
                    boxSizing: 'border-box', resize: 'vertical',
                  }} />
              </div>
            </div>

            {error && (
              <p style={{ color: '#E53E3E', fontSize: 13, margin: '10px 0 0', fontWeight: 500 }}>{error}</p>
            )}

            <button onClick={confirmar} disabled={enviando} style={{
              width: '100%', marginTop: 18,
              backgroundColor: enviando ? '#90CDF4' : C.acento,
              color: '#fff', border: 'none', borderRadius: 8, padding: '13px',
              fontSize: 15, fontWeight: 700, cursor: enviando ? 'not-allowed' : 'pointer',
            }}>
              {enviando ? 'Enviando...' : 'Enviar consulta'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── SIDEBAR FILTROS ──────────────────────────────────────────
interface FiltrosAuto {
  marca:     string;
  modelo:    string;
  anioDesde: string;
  anioHasta: string;
  kmMax:     string;
  tipo:      string;
  precioMin: string;
  precioMax: string;
}

const TIPOS_AUTO = ['auto', 'camioneta', 'moto', 'utilitario', 'camion'];

function SidebarFiltrosAutos({
  filtros, onChange, onLimpiar, marcas, hayFiltros,
}: {
  filtros:   FiltrosAuto;
  onChange:  (f: Partial<FiltrosAuto>) => void;
  onLimpiar: () => void;
  marcas:    string[];
  hayFiltros: boolean;
}) {
  const inp: React.CSSProperties = {
    width: '100%', border: `1px solid ${C.borde}`, borderRadius: 6,
    padding: '7px 9px', fontSize: 13, color: C.texto, boxSizing: 'border-box',
  };
  const lbl: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: C.gris,
    textTransform: 'uppercase', letterSpacing: '0.5px',
    display: 'block', margin: '0 0 6px',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.texto }}>Filtrar</h3>
        {hayFiltros && (
          <button onClick={onLimpiar} style={{ background: 'none', border: 'none', color: C.acento, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Limpiar
          </button>
        )}
      </div>

      {/* Marca */}
      {marcas.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <label style={lbl}>Marca</label>
          <select value={filtros.marca} onChange={e => onChange({ marca: e.target.value, modelo: '' })}
            style={{ ...inp, backgroundColor: '#fff' }}>
            <option value="">Todas</option>
            {marcas.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      )}

      {/* Modelo */}
      <div style={{ marginBottom: 18 }}>
        <label style={lbl}>Modelo</label>
        <input type="text" value={filtros.modelo} onChange={e => onChange({ modelo: e.target.value })}
          placeholder="Ej: Hilux, Focus..." style={inp} />
      </div>

      {/* Tipo */}
      <div style={{ marginBottom: 18 }}>
        <label style={lbl}>Tipo</label>
        <select value={filtros.tipo} onChange={e => onChange({ tipo: e.target.value })}
          style={{ ...inp, backgroundColor: '#fff' }}>
          <option value="">Todos</option>
          {TIPOS_AUTO.map(t => <option key={t} value={t}>{TIPO_LABELS[t] || t}</option>)}
        </select>
      </div>

      {/* Año */}
      <div style={{ marginBottom: 18 }}>
        <label style={lbl}>Año</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="number" placeholder="Desde" value={filtros.anioDesde}
            onChange={e => onChange({ anioDesde: e.target.value })}
            style={{ ...inp, width: '50%' }} />
          <input type="number" placeholder="Hasta" value={filtros.anioHasta}
            onChange={e => onChange({ anioHasta: e.target.value })}
            style={{ ...inp, width: '50%' }} />
        </div>
      </div>

      {/* Km */}
      <div style={{ marginBottom: 18 }}>
        <label style={lbl}>Km máximo</label>
        <input type="number" placeholder="Ej: 100000" value={filtros.kmMax}
          onChange={e => onChange({ kmMax: e.target.value })} style={inp} />
      </div>

      {/* Precio */}
      <div style={{ marginBottom: 8 }}>
        <label style={lbl}>Precio</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="number" placeholder="Mín" value={filtros.precioMin}
            onChange={e => onChange({ precioMin: e.target.value })}
            style={{ ...inp, width: '50%' }} />
          <input type="number" placeholder="Máx" value={filtros.precioMax}
            onChange={e => onChange({ precioMax: e.target.value })}
            style={{ ...inp, width: '50%' }} />
        </div>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────
export default function CatalogoAutos() {
  const codigo = window.location.pathname.split('/').find((_, i, arr) => arr[i - 1] === 'catalogo') || '';

  const [config,       setConfig]       = useState<CatConfig | null>(null);
  const [autos,        setAutos]        = useState<Auto[]>([]);
  const [marcas,       setMarcas]       = useState<string[]>([]);
  const [cargando,     setCargando]     = useState(true);
  const [noDisponible, setNoDisponible] = useState(false);
  const [detalleAuto,  setDetalleAuto]  = useState<Auto | null>(null);
  const [sidebarOpen,  setSidebarOpen]  = useState(false);

  const FILTROS_INIT: FiltrosAuto = {
    marca: '', modelo: '', anioDesde: '', anioHasta: '',
    kmMax: '', tipo: '', precioMin: '', precioMax: '',
  };
  const [filtros, setFiltros] = useState<FiltrosAuto>(FILTROS_INIT);
  const filtrosDb = useDebounce(filtros, 400);

  const hayFiltros = Object.values(filtros).some(v => v !== '');

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
        setCargando(false);
      })
      .catch(() => { setNoDisponible(true); setCargando(false); });
  }, [codigo]);

  // ── CARGAR AUTOS ─────────────────────────────────────────────
  const cargarAutos = useCallback(() => {
    if (!codigo) return;
    fetch(`${API}/api/catalogo/${codigo}/autos`)
      .then(r => r.json())
      .then(d => {
        const todos: Auto[] = d.autos || [];
        // Extraer marcas únicas para el filtro
        const ms = Array.from(new Set(todos.map((a: Auto) => a.marca).filter(Boolean))).sort() as string[];
        setMarcas(ms);
        setAutos(todos);
      })
      .catch(() => {});
  }, [codigo]);

  useEffect(() => { if (config) cargarAutos(); }, [config, cargarAutos]);

  // ── FILTRADO LOCAL ────────────────────────────────────────────
  const autosFiltrados = autos.filter(a => {
    if (filtrosDb.marca     && a.marca?.toLowerCase()  !== filtrosDb.marca.toLowerCase())  return false;
    if (filtrosDb.modelo    && !a.modelo?.toLowerCase().includes(filtrosDb.modelo.toLowerCase())) return false;
    if (filtrosDb.tipo      && a.tipo !== filtrosDb.tipo) return false;
    if (filtrosDb.anioDesde && a.anio < Number(filtrosDb.anioDesde)) return false;
    if (filtrosDb.anioHasta && a.anio > Number(filtrosDb.anioHasta)) return false;
    if (filtrosDb.kmMax     && a.km   > Number(filtrosDb.kmMax))     return false;
    if (filtrosDb.precioMin && a.precio_venta < Number(filtrosDb.precioMin)) return false;
    if (filtrosDb.precioMax && a.precio_venta > Number(filtrosDb.precioMax)) return false;
    return true;
  });

  const destacados = autosFiltrados.filter(a => a.destacado);

  const onChange = (partial: Partial<FiltrosAuto>) =>
    setFiltros(prev => ({ ...prev, ...partial }));
  const limpiarFiltros = () => setFiltros(FILTROS_INIT);

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

  // ── RENDER ───────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: C.bg, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`
        @media (max-width: 768px) {
          .aut-grid { grid-template-columns: repeat(1,1fr) !important; }
          .aut-sidebar-inline { display: none !important; }
          .aut-layout { flex-direction: column !important; }
        }
        @media (min-width: 769px) and (max-width: 1100px) {
          .aut-grid { grid-template-columns: repeat(2,1fr) !important; }
        }
        @media (min-width: 1101px) {
          .aut-grid { grid-template-columns: repeat(3,1fr) !important; }
        }
      `}</style>

      {/* ── HEADER ──────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 200,
        backgroundColor: C.card, borderBottom: `1px solid ${C.borde}`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 20px', height: 64, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {config.logo_url ? (
              <img src={config.logo_url} alt={config.nombre_comercial} style={{ height: 40, objectFit: 'contain' }} />
            ) : (
              <div style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: config.color_primario, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16 }}>
                {config.nombre_comercial?.[0] || '?'}
              </div>
            )}
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.texto, margin: 0 }}>{config.nombre_comercial}</p>
              <p style={{ fontSize: 11, color: C.gris, margin: 0 }}>Vehículos disponibles</p>
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {config.whatsapp && (
            <a
              href={`https://wa.me/${config.whatsapp.replace(/\D/g, '')}`}
              target="_blank" rel="noreferrer"
              style={{
                backgroundColor: '#25D366', color: '#fff', borderRadius: 8,
                padding: '8px 16px', fontSize: 13, fontWeight: 700,
                textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              💬 WhatsApp
            </a>
          )}
        </div>
      </header>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 20px 40px' }}>

        {/* ── DESTACADOS ──────────────────────────────────── */}
        {!hayFiltros && destacados.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: C.texto, margin: '0 0 14px' }}>⭐ Destacados</h2>
            <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'thin' }}>
              {destacados.map(a => (
                <div key={a.id} style={{ minWidth: 280, maxWidth: 280, flexShrink: 0 }}>
                  <CardAuto auto={a} onDetalle={setDetalleAuto} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Botón filtros mobile + contador */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button onClick={() => setSidebarOpen(true)} style={{
            backgroundColor: C.card, border: `1px solid ${C.borde}`,
            borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', color: C.texto, display: 'none',
          }} className="aut-filtros-btn">
            ⚙️ Filtros {hayFiltros ? '•' : ''}
          </button>
          <p style={{ fontSize: 13, color: C.gris, margin: 0 }}>
            {autosFiltrados.length === 1
              ? '1 vehículo disponible'
              : `${autosFiltrados.length} vehículos disponibles`}
          </p>
        </div>

        {/* ── LAYOUT ──────────────────────────────────────── */}
        <div className="aut-layout" style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

          {/* Sidebar inline */}
          <div className="aut-sidebar-inline" style={{
            width: 240, flexShrink: 0,
            backgroundColor: C.card, borderRadius: 10,
            border: `1px solid ${C.borde}`, padding: 16,
            position: 'sticky', top: 80,
          }}>
            <SidebarFiltrosAutos
              filtros={filtros} onChange={onChange}
              onLimpiar={limpiarFiltros} marcas={marcas}
              hayFiltros={hayFiltros}
            />
          </div>

          {/* Grilla */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {autosFiltrados.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <div style={{ fontSize: 52, marginBottom: 12 }}>🚗</div>
                <p style={{ color: C.gris, fontSize: 15 }}>
                  {hayFiltros
                    ? 'No encontramos vehículos con esos criterios.'
                    : 'No hay vehículos disponibles en este momento.'}
                </p>
                {hayFiltros && (
                  <button onClick={limpiarFiltros} style={{
                    marginTop: 12, backgroundColor: C.acento, color: '#fff',
                    border: 'none', borderRadius: 8, padding: '10px 24px',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}>Limpiar filtros</button>
                )}
              </div>
            ) : (
              <div className="aut-grid" style={{ display: 'grid', gap: 16 }}>
                {autosFiltrados.map(a => (
                  <CardAuto key={a.id} auto={a} onDetalle={setDetalleAuto} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── SIDEBAR MOBILE ──────────────────────────────────── */}
      {sidebarOpen && (
        <>
          <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 800 }} />
          <div style={{
            position: 'fixed', top: 0, left: 0, bottom: 0, width: 300,
            backgroundColor: C.card, zIndex: 801, overflowY: 'auto',
            boxShadow: '4px 0 24px rgba(0,0,0,0.12)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${C.borde}` }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Filtros</h3>
              <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.gris }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <SidebarFiltrosAutos
                filtros={filtros} onChange={onChange}
                onLimpiar={limpiarFiltros} marcas={marcas}
                hayFiltros={hayFiltros}
              />
            </div>
          </div>
        </>
      )}

      {/* ── MODAL DETALLE ───────────────────────────────────── */}
      {detalleAuto && (
        <ModalAuto
          auto={detalleAuto}
          config={config}
          codigo={codigo}
          onClose={() => setDetalleAuto(null)}
        />
      )}
    </div>
  );
}
