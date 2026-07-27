import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../../config/api';
import { getToken } from '../../../utils/auth';

// ── Colores ───────────────────────────────────────────────────
const NAVY   = '#1B2A4A';
const BLUE   = '#2B6CB0';
const GREEN  = '#38A169';
const RED    = '#E53E3E';
const SEP    = '#63B3ED';
const GRAY   = '#718096';
const TEXT   = '#2D3748';
const BG     = '#F4F6F9';
const ORANGE = '#DD6B20';
const YELLOW = '#D69E2E';

// ── Helpers ───────────────────────────────────────────────────
const fmt = (n: number | string) =>
  `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtNum = (n: number | string) =>
  Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const fmtFecha = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};

const fmtFechaHora = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${fmtFecha(iso)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

function getClienteId(): number | null {
  try { const s = localStorage.getItem('roberto_portal_session'); return s ? JSON.parse(s).cliente?.id ?? null : null; }
  catch { return null; }
}

// ── Tipos ─────────────────────────────────────────────────────
type TabPrincipal = 'stock' | 'movimientos' | 'transferencias' | 'valorizado';

interface ItemStock {
  id: number;
  codigo: string;
  descripcion: string;
  marca: string;
  rubro: string;
  stock_actual: number;
  stock_minimo: number;
  precio_costo_final: number;
  precio_venta_1: number;
  imagen_url: string | null;
  proveedor_nombre: string | null;
  ultimo_movimiento: string | null;
  modificado_en: string | null;
}

interface Movimiento {
  id: number;
  tipo: string;
  cantidad: number;
  stock_anterior: number;
  stock_posterior: number;
  motivo: string;
  observaciones: string;
  numero_documento: string;
  usuario: string;
  creado_en: string;
  producto_descripcion: string | null;
  producto_codigo: string | null;
}

interface DashMetrics {
  bajo_minimo: number;
  sin_stock: number;
  valor_costo: number;
  valor_venta: number;
  activos: number;
}

interface Proveedor { id: number; nombre: string; }

interface Valorizado {
  total_productos: number;
  total_unidades: number;
  valor_total_costo: number;
  valor_total_venta: number;
  por_proveedor: ValRow[];
  por_rubro: ValRow[];
}
interface ValRow {
  proveedor?: string;
  rubro?: string;
  productos: number;
  unidades: number;
  valor_costo: number;
  valor_venta: number;
}

interface ProductoBusq {
  id: number;
  codigo: string;
  descripcion: string;
  stock_actual: number;
}

// ── Estilos ───────────────────────────────────────────────────
const btnStyle = (bg: string, color = '#fff', disabled = false): React.CSSProperties => ({
  backgroundColor: disabled ? '#CBD5E0' : bg,
  color: disabled ? '#A0AEC0' : color,
  border: 'none', borderRadius: '8px', padding: '9px 16px',
  fontSize: '13px', fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
});

const inputSt: React.CSSProperties = {
  border: '1.5px solid #CBD5E0', borderRadius: '8px', padding: '8px 12px',
  fontSize: '13px', color: TEXT, outline: 'none', width: '100%',
  boxSizing: 'border-box', backgroundColor: '#fff',
};

const labelSt: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600, color: GRAY,
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px',
};

const secSt: React.CSSProperties = {
  fontSize: '12px', fontWeight: 700, color: NAVY, textTransform: 'uppercase',
  letterSpacing: '0.5px', borderBottom: `2px solid ${SEP}`,
  paddingBottom: '6px', marginBottom: '12px',
};

// ── Estado stock ──────────────────────────────────────────────
function estadoStock(item: ItemStock): { label: string; bg: string; c: string } {
  const act = Number(item.stock_actual) || 0;
  const min = Number(item.stock_minimo) || 0;
  if (act <= 0)          return { label: 'Sin stock',    bg: '#FFF5F5', c: RED    };
  if (min > 0 && act <= min) return { label: 'Bajo mínimo', bg: '#FFFFF0', c: YELLOW };
  return                       { label: 'Normal',        bg: '#F0FFF4', c: GREEN  };
}

function BadgeEstado({ item }: { item: ItemStock }) {
  const s = estadoStock(item);
  return (
    <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, backgroundColor: s.bg, color: s.c }}>
      {s.label}
    </span>
  );
}

function BadgeTipoMov({ tipo }: { tipo: string }) {
  const map: Record<string, { bg: string; c: string }> = {
    ajuste_positivo:      { bg: '#F0FFF4', c: GREEN  },
    ajuste_negativo:      { bg: '#FFF5F5', c: RED    },
    transferencia_salida: { bg: '#FFFAF0', c: ORANGE },
    transferencia_entrada:{ bg: '#EBF8FF', c: BLUE   },
    venta:                { bg: '#FFF5F5', c: RED    },
    compra:               { bg: '#F0FFF4', c: GREEN  },
  };
  const s = map[tipo] || { bg: '#EDF2F7', c: GRAY };
  const label = tipo.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  return (
    <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, backgroundColor: s.bg, color: s.c, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

// ── Card métrica ──────────────────────────────────────────────
function Card({ icon, label, valor, color, alerta }: { icon: string; label: string; valor: string; color: string; alerta?: boolean }) {
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '20px 24px', borderLeft: `4px solid ${color}`, flex: '1 1 160px', position: 'relative' }}>
      {alerta && <span style={{ position: 'absolute', top: '12px', right: '14px', fontSize: '16px' }}>🔔</span>}
      <div style={{ fontSize: '22px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color, marginBottom: '4px' }}>{valor}</div>
      <div style={{ fontSize: '12px', color: GRAY, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

// ── Paginación reutilizable ───────────────────────────────────
function Paginacion({ pagina, totalPags, porPagina, setPagina, setPorPagina }: {
  pagina: number; totalPags: number;
  porPagina: number; setPagina: (p: number) => void; setPorPagina: (n: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', flexWrap: 'wrap', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: GRAY }}>
        Filas:
        {[10, 25, 50].map(n => (
          <button key={n} onClick={() => { setPorPagina(n); setPagina(1); }}
            style={{ backgroundColor: porPagina === n ? BLUE : '#EDF2F7', color: porPagina === n ? '#fff' : GRAY, border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            {n}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: GRAY }}>
        Página {pagina} de {totalPags}
        <button disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}
          style={{ backgroundColor: pagina <= 1 ? '#EDF2F7' : NAVY, color: pagina <= 1 ? GRAY : '#fff', border: 'none', borderRadius: '6px', padding: '5px 14px', fontSize: '12px', fontWeight: 600, cursor: pagina <= 1 ? 'not-allowed' : 'pointer' }}>
          ← Anterior
        </button>
        <button disabled={pagina >= totalPags} onClick={() => setPagina(pagina + 1)}
          style={{ backgroundColor: pagina >= totalPags ? '#EDF2F7' : NAVY, color: pagina >= totalPags ? GRAY : '#fff', border: 'none', borderRadius: '6px', padding: '5px 14px', fontSize: '12px', fontWeight: 600, cursor: pagina >= totalPags ? 'not-allowed' : 'pointer' }}>
          Siguiente →
        </button>
      </div>
    </div>
  );
}

// ── Modal ajuste ──────────────────────────────────────────────
function ModalAjuste({ item, onAplicar, onCerrar }: {
  item: ItemStock;
  onAplicar: (data: any) => Promise<void>;
  onCerrar: () => void;
}) {
  const [tipo,      setTipo]      = useState<'ajuste_positivo' | 'ajuste_negativo'>('ajuste_positivo');
  const [cantidad,  setCantidad]  = useState('');
  const [motivo,    setMotivo]    = useState('Compra');
  const [observ,    setObserv]    = useState('');
  const [nroDoc,    setNroDoc]    = useState('');
  const [procesando, setProcesando] = useState(false);
  const [err, setErr]             = useState('');

  const stockActual   = Number(item.stock_actual) || 0;
  const delta         = tipo === 'ajuste_positivo' ? (parseFloat(cantidad) || 0) : -(parseFloat(cantidad) || 0);
  const stockResultante = Math.max(0, stockActual + delta);

  const MOTIVOS_POSITIVO = ['Compra', 'Devolución cliente', 'Corrección', 'Otro'];
  const MOTIVOS_NEGATIVO = ['Venta', 'Devolución proveedor', 'Pérdida', 'Rotura', 'Corrección', 'Otro'];
  const motivos = tipo === 'ajuste_positivo' ? MOTIVOS_POSITIVO : MOTIVOS_NEGATIVO;

  const aplicar = async () => {
    if (!cantidad || parseFloat(cantidad) <= 0) { setErr('Ingresá una cantidad válida.'); return; }
    setProcesando(true); setErr('');
    await onAplicar({ tipo, cantidad: parseFloat(cantidad), motivo, observaciones: observ, numero_documento: nroDoc });
    setProcesando(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '480px', boxShadow: '0 24px 72px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '18px 28px', borderBottom: `2px solid ${SEP}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: NAVY, margin: 0 }}>✏️ Ajuste de stock</h2>
          <button onClick={onCerrar} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: GRAY }}>×</button>
        </div>
        <div style={{ padding: '24px 28px' }}>
          {/* Producto info */}
          <div style={{ backgroundColor: '#EBF8FF', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px' }}>
            <div style={{ fontWeight: 700, color: NAVY, fontSize: '14px' }}>{item.descripcion}</div>
            <div style={{ fontSize: '12px', color: GRAY, marginTop: '2px' }}>{item.codigo}</div>
            <div style={{ marginTop: '8px', display: 'flex', gap: '24px' }}>
              <div><span style={{ fontSize: '11px', color: GRAY }}>Stock actual</span><br />
                <span style={{ fontSize: '20px', fontWeight: 800, color: stockActual <= 0 ? RED : NAVY }}>{fmtNum(stockActual)}</span>
              </div>
              <div><span style={{ fontSize: '11px', color: GRAY }}>Mínimo</span><br />
                <span style={{ fontSize: '16px', fontWeight: 600, color: GRAY }}>{fmtNum(item.stock_minimo)}</span>
              </div>
              <div><span style={{ fontSize: '11px', color: GRAY }}>Resultante</span><br />
                <span style={{ fontSize: '20px', fontWeight: 800, color: stockResultante <= 0 ? RED : GREEN }}>{fmtNum(stockResultante)}</span>
              </div>
            </div>
          </div>

          {/* Tipo */}
          <div style={{ marginBottom: '16px' }}>
            <label style={labelSt}>Tipo de ajuste</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setTipo('ajuste_positivo'); setMotivo('Compra'); }}
                style={{ ...btnStyle(tipo === 'ajuste_positivo' ? GREEN : '#EDF2F7', tipo === 'ajuste_positivo' ? '#fff' : GRAY), flex: 1, justifyContent: 'center' }}>
                ➕ Ingreso
              </button>
              <button onClick={() => { setTipo('ajuste_negativo'); setMotivo('Pérdida'); }}
                style={{ ...btnStyle(tipo === 'ajuste_negativo' ? RED : '#EDF2F7', tipo === 'ajuste_negativo' ? '#fff' : GRAY), flex: 1, justifyContent: 'center' }}>
                ➖ Egreso
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelSt}>Cantidad *</label>
              <input type="number" min="0.01" step="0.01" value={cantidad}
                onChange={e => setCantidad(e.target.value)}
                autoFocus style={inputSt} placeholder="0" />
            </div>
            <div>
              <label style={labelSt}>Motivo</label>
              <select value={motivo} onChange={e => setMotivo(e.target.value)} style={{ ...inputSt, cursor: 'pointer' }}>
                {motivos.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={labelSt}>Número documento (opcional)</label>
            <input value={nroDoc} onChange={e => setNroDoc(e.target.value)}
              placeholder="Factura, remito, etc." style={inputSt} />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelSt}>Observaciones</label>
            <textarea value={observ} onChange={e => setObserv(e.target.value)} rows={2}
              style={{ ...inputSt, resize: 'vertical', fontFamily: 'inherit', height: '56px' }} />
          </div>

          {err && <div style={{ backgroundColor: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: RED, marginBottom: '12px' }}>{err}</div>}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button onClick={onCerrar} style={btnStyle('#EDF2F7', GRAY)}>Cancelar</button>
            <button onClick={aplicar} disabled={procesando} style={btnStyle(GREEN, '#fff', procesando)}>
              {procesando ? '⏳ Aplicando...' : '✅ Aplicar ajuste'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal transferencia ───────────────────────────────────────
function ModalTransferencia({ cid, token, onCrear, onCerrar }: {
  cid: number; token: string;
  onCrear: () => void; onCerrar: () => void;
}) {
  const authHdr = { 'x-superadmin-token': token };
  const jsonHdr = { 'x-superadmin-token': token, 'Content-Type': 'application/json' };

  const [origen,   setOrigen]   = useState('');
  const [destino,  setDestino]  = useState('');
  const [observ,   setObserv]   = useState('');
  const [items,    setItems]    = useState<{ producto_id: number; descripcion: string; codigo: string; stock: number; cantidad: string }[]>([]);
  const [busq,     setBusq]     = useState('');
  const [prods,    setProds]    = useState<ProductoBusq[]>([]);
  const [showDrop, setShowDrop] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [err,      setErr]      = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = busq.trim();
    if (!q) { setProds([]); setShowDrop(false); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${API_BASE}/api/superadmin/importador/productos/${cid}?buscar=${encodeURIComponent(q)}&limit=8`, { headers: authHdr });
        if (r.ok) { const d = await r.json(); const lista = d.productos || d.items || []; setProds(lista); setShowDrop(lista.length > 0); }
      } catch { /* silent */ }
    }, 300);
    return () => clearTimeout(t);
  }, [busq]); // eslint-disable-line react-hooks/exhaustive-deps

  const agregar = (p: ProductoBusq) => {
    if (!items.find(i => i.producto_id === p.id)) {
      setItems(prev => [...prev, { producto_id: p.id, descripcion: p.descripcion, codigo: p.codigo, stock: Number(p.stock_actual) || 0, cantidad: '1' }]);
    }
    setBusq(''); setProds([]); setShowDrop(false);
    setTimeout(() => ref.current?.focus(), 60);
  };

  const confirmar = async () => {
    if (!items.length) { setErr('Agregá al menos un producto.'); return; }
    setProcesando(true); setErr('');
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/stock/${cid}/transferencia`, {
        method: 'POST', headers: jsonHdr,
        body: JSON.stringify({
          sucursal_origen_id:  origen  ? parseInt(origen,  10) : null,
          sucursal_destino_id: destino ? parseInt(destino, 10) : null,
          observaciones: observ,
          items: items.map(i => ({ producto_id: i.producto_id, cantidad_solicitada: parseFloat(i.cantidad) || 0 })),
        }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.mensaje || 'Error'); return; }
      alert(`✅ Transferencia #${d.transferencia_id} registrada`);
      onCrear();
    } catch { setErr('Error de red'); }
    finally { setProcesando(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '16px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '640px', boxShadow: '0 24px 72px rgba(0,0,0,0.3)', margin: 'auto' }}>
        <div style={{ padding: '18px 28px', borderBottom: `2px solid ${SEP}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: NAVY, margin: 0 }}>🔄 Nueva Transferencia</h2>
          <button onClick={onCerrar} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: GRAY }}>×</button>
        </div>
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={labelSt}>Sucursal origen</label>
              <input value={origen} onChange={e => setOrigen(e.target.value)} placeholder="Nombre o ID origen" style={inputSt} />
            </div>
            <div>
              <label style={labelSt}>Sucursal destino</label>
              <input value={destino} onChange={e => setDestino(e.target.value)} placeholder="Nombre o ID destino" style={inputSt} />
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelSt}>Productos</label>
            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <input ref={ref} value={busq} onChange={e => setBusq(e.target.value)}
                placeholder="🔍 Buscar producto..." style={inputSt} />
              {showDrop && prods.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1.5px solid #CBD5E0', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 20, marginTop: '2px', maxHeight: '220px', overflowY: 'auto' }}>
                  {prods.slice(0, 8).map(p => (
                    <div key={p.id} onClick={() => agregar(p)}
                      style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #F7FAFC', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#EBF8FF'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}>
                      <div>
                        <span style={{ fontWeight: 600 }}>{p.descripcion}</span>
                        <span style={{ color: GRAY, fontSize: '11px', marginLeft: '8px' }}>{p.codigo}</span>
                      </div>
                      <span style={{ color: Number(p.stock_actual) > 0 ? GREEN : RED, fontWeight: 700, fontSize: '12px' }}>
                        Stock: {fmtNum(p.stock_actual)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {items.length > 0 && (
              <div style={{ border: '1px solid #EDF2F7', borderRadius: '10px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F7FAFC' }}>
                      {['Producto', 'Stock disp.', 'Cantidad', '×'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: GRAY, fontSize: '11px', borderBottom: '1px solid #EDF2F7' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={it.producto_id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ fontWeight: 500 }}>{it.descripcion}</div>
                          <div style={{ fontSize: '11px', color: GRAY }}>{it.codigo}</div>
                        </td>
                        <td style={{ padding: '8px 12px', color: it.stock <= 0 ? RED : TEXT, fontWeight: 700 }}>{fmtNum(it.stock)}</td>
                        <td style={{ padding: '6px 10px' }}>
                          <input type="number" value={it.cantidad} min="0.01" step="0.01"
                            onChange={e => setItems(prev => prev.map(i => i.producto_id === it.producto_id ? { ...i, cantidad: e.target.value } : i))}
                            style={{ ...inputSt, width: '80px', padding: '4px 8px', textAlign: 'right' }} />
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <button onClick={() => setItems(prev => prev.filter(i => i.producto_id !== it.producto_id))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: RED, fontSize: '18px' }}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelSt}>Observaciones</label>
            <textarea value={observ} onChange={e => setObserv(e.target.value)} rows={2}
              style={{ ...inputSt, resize: 'vertical', fontFamily: 'inherit', height: '56px' }} />
          </div>

          {err && <div style={{ backgroundColor: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: RED, marginBottom: '12px' }}>{err}</div>}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button onClick={onCerrar} style={btnStyle('#EDF2F7', GRAY)}>Cancelar</button>
            <button onClick={confirmar} disabled={procesando || items.length === 0} style={btnStyle(GREEN, '#fff', procesando || items.length === 0)}>
              {procesando ? '⏳ Procesando...' : '🔄 Confirmar transferencia'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═════════════════════════════════════════════════════════════
export default function RobertoStock() {
  const navigate = useNavigate();
  const cid      = getClienteId();
  const token    = getToken();
  const authHdr  = { 'x-superadmin-token': token };
  const jsonHdr  = { 'x-superadmin-token': token, 'Content-Type': 'application/json' };

  const [tab, setTab] = useState<TabPrincipal>('stock');

  // ── Dashboard ────────────────────────────────────────────────
  const [dash, setDash] = useState<DashMetrics | null>(null);

  // ── Tab Stock ────────────────────────────────────────────────
  const [items,         setItems]         = useState<ItemStock[]>([]);
  const [totalReg,      setTotalReg]      = useState(0);
  const [pagina,        setPagina]        = useState(1);
  const [porPagina,     setPorPagina]     = useState(25);
  const [totalPags,     setTotalPags]     = useState(1);
  const [cargando,      setCargando]      = useState(false);
  const [busqueda,      setBusqueda]      = useState('');
  const [filtroProveedor, setFiltroProveedor] = useState('');
  const [filtroRubro,   setFiltroRubro]   = useState('');
  const [filtroEstado,  setFiltroEstado]  = useState('');
  const [fechaDesde,    setFechaDesde]    = useState('');
  const [fechaHasta,    setFechaHasta]    = useState('');
  const [proveedores,   setProveedores]   = useState<Proveedor[]>([]);
  const [rubros,        setRubros]        = useState<string[]>([]);
  const [itemAjuste,    setItemAjuste]    = useState<ItemStock | null>(null);

  // ── Tab Movimientos ──────────────────────────────────────────
  const [movs,          setMovs]          = useState<Movimiento[]>([]);
  const [movTotal,      setMovTotal]      = useState(0);
  const [movPagina,     setMovPagina]     = useState(1);
  const [movPorPagina,  setMovPorPagina]  = useState(25);
  const [movTotalPags,  setMovTotalPags]  = useState(1);
  const [movCargando,   setMovCargando]   = useState(false);
  const [movBusq,       setMovBusq]       = useState('');
  const [movTipo,       setMovTipo]       = useState('');
  const [movDesde,      setMovDesde]      = useState('');
  const [movHasta,      setMovHasta]      = useState('');

  // ── Tab Transferencias ───────────────────────────────────────
  const [modalTransf,   setModalTransf]   = useState(false);
  const [transferencias, setTransferencias] = useState<any[]>([]);

  // ── Tab Valorizado ───────────────────────────────────────────
  const [valorizado,    setValorizado]    = useState<Valorizado | null>(null);
  const [valCargando,   setValCargando]   = useState(false);

  // ── Cargar dashboard ─────────────────────────────────────────
  const cargarDash = useCallback(() => {
    if (!cid) return;
    fetch(`${API_BASE}/api/superadmin/stock/${cid}/dashboard`, { headers: authHdr })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setDash(d))
      .catch(() => {});
  }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargarDash(); }, [cargarDash]);

  // ── Cargar proveedores y rubros ──────────────────────────────
  useEffect(() => {
    if (!cid) return;
    Promise.all([
      fetch(`${API_BASE}/api/superadmin/stock/${cid}/proveedores`, { headers: authHdr }).then(r => r.ok ? r.json() : null),
      fetch(`${API_BASE}/api/superadmin/stock/${cid}/rubros`,      { headers: authHdr }).then(r => r.ok ? r.json() : null),
    ]).then(([pd, rd]) => {
      if (pd) setProveedores(pd.proveedores || []);
      if (rd) setRubros(rd.rubros || []);
    }).catch(() => {});
  }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cargar stock (debounced 300ms) ───────────────────────────
  const cargarStock = useCallback(async () => {
    if (!cid) return;
    setCargando(true);
    try {
      const p = new URLSearchParams({
        page: String(pagina), limit: String(porPagina),
        ...(busqueda      && { buscar:        busqueda      }),
        ...(filtroProveedor && { proveedor_id: filtroProveedor }),
        ...(filtroRubro   && { rubro:         filtroRubro   }),
        ...(filtroEstado  && { estado_stock:  filtroEstado  }),
        ...(fechaDesde    && { fecha_desde:   fechaDesde    }),
        ...(fechaHasta    && { fecha_hasta:   fechaHasta    }),
      });
      const r = await fetch(`${API_BASE}/api/superadmin/stock/${cid}?${p}`, { headers: authHdr });
      if (r.ok) {
        const d = await r.json();
        setItems(d.items || []);
        setTotalReg(d.total || 0);
        setTotalPags(d.paginas || 1);
      }
    } catch { /* silent */ }
    finally { setCargando(false); }
  }, [cid, pagina, porPagina, busqueda, filtroProveedor, filtroRubro, filtroEstado, fechaDesde, fechaHasta]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== 'stock') return;
    const t = setTimeout(cargarStock, 300);
    return () => clearTimeout(t);
  }, [cargarStock, tab]);

  // ── Cargar movimientos (debounced) ───────────────────────────
  const cargarMovs = useCallback(async () => {
    if (!cid) return;
    setMovCargando(true);
    try {
      const p = new URLSearchParams({
        page: String(movPagina), limit: String(movPorPagina),
        ...(movBusq  && { buscar:      movBusq  }),
        ...(movTipo  && { tipo:        movTipo  }),
        ...(movDesde && { fecha_desde: movDesde }),
        ...(movHasta && { fecha_hasta: movHasta }),
      });
      const r = await fetch(`${API_BASE}/api/superadmin/stock/${cid}/movimientos?${p}`, { headers: authHdr });
      if (r.ok) {
        const d = await r.json();
        setMovs(d.movimientos || []);
        setMovTotal(d.total || 0);
        setMovTotalPags(d.paginas || 1);
      }
    } catch { /* silent */ }
    finally { setMovCargando(false); }
  }, [cid, movPagina, movPorPagina, movBusq, movTipo, movDesde, movHasta]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== 'movimientos') return;
    const t = setTimeout(cargarMovs, 300);
    return () => clearTimeout(t);
  }, [cargarMovs, tab]);

  // ── Cargar valorizado ────────────────────────────────────────
  const cargarValorizado = useCallback(async () => {
    if (!cid) return;
    setValCargando(true);
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/stock/${cid}/valorizado`, { headers: authHdr });
      if (r.ok) { const d = await r.json(); setValorizado(d); }
    } catch { /* silent */ }
    finally { setValCargando(false); }
  }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'valorizado') cargarValorizado();
  }, [tab, cargarValorizado]);

  // ── Aplicar ajuste ───────────────────────────────────────────
  const aplicarAjuste = async (data: any) => {
    if (!cid || !itemAjuste) return;
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/stock/${cid}/ajuste`, {
        method: 'POST', headers: jsonHdr,
        body: JSON.stringify({ producto_id: itemAjuste.id, ...data }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.mensaje || 'Error'); return; }
      // Actualizar item en tabla sin recargar toda la página
      setItems(prev => prev.map(it => it.id === itemAjuste.id
        ? { ...it, stock_actual: d.stock_actual }
        : it
      ));
      cargarDash();
      setItemAjuste(null);
    } catch { alert('Error de red'); }
  };

  // ── Exportar Excel ───────────────────────────────────────────
  const exportarExcel = () => {
    if (!items.length) { alert('No hay datos para exportar'); return; }
    const rows = [
      ['Código', 'Descripción', 'Marca', 'Rubro', 'Proveedor', 'Stock actual', 'Stock mínimo', 'Estado', 'Costo', 'Precio venta'].join('\t'),
      ...items.map(it => {
        const e = estadoStock(it);
        return [it.codigo, it.descripcion, it.marca || '', it.rubro || '', it.proveedor_nombre || '',
          it.stock_actual, it.stock_minimo, e.label, it.precio_costo_final, it.precio_venta_1].join('\t');
      }),
    ].join('\n');
    const blob = new Blob([rows], { type: 'text/tab-separated-values;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'stock.xls'; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Imprimir PDF ─────────────────────────────────────────────
  const imprimirPDF = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const filas = items.map(it => {
      const e = estadoStock(it);
      return `<tr>
        <td>${it.codigo || '—'}</td>
        <td>${it.descripcion}</td>
        <td style="text-align:center">${fmtNum(it.stock_actual)}</td>
        <td style="text-align:center">${fmtNum(it.stock_minimo)}</td>
        <td><span style="color:${e.c}">${e.label}</span></td>
        <td style="text-align:right">${fmt(it.precio_costo_final)}</td>
        <td style="text-align:right">${fmt(it.precio_venta_1)}</td>
      </tr>`;
    }).join('');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Stock</title>
<style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;font-size:11px}
h2{color:#1B2A4A}table{width:100%;border-collapse:collapse}
th{background:#1B2A4A;color:#fff;padding:6px 8px;text-align:left;font-size:10px}
td{padding:5px 8px;border-bottom:1px solid #eee;font-size:10px}</style>
</head><body>
<h2>📊 Reporte de Stock — ${new Date().toLocaleDateString('es-AR')}</h2>
<table><thead><tr><th>Código</th><th>Descripción</th><th>Stock</th><th>Mínimo</th><th>Estado</th><th>Costo</th><th>Precio</th></tr></thead>
<tbody>${filas}</tbody></table></body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 350);
  };

  // ── Imprimir PDF valorizado ───────────────────────────────────
  const imprimirValorizado = () => {
    if (!valorizado) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const filasP = valorizado.por_proveedor.map(r =>
      `<tr><td>${r.proveedor || 'Sin proveedor'}</td><td style="text-align:center">${r.productos}</td><td style="text-align:center">${fmtNum(r.unidades)}</td><td style="text-align:right">${fmt(r.valor_costo)}</td><td style="text-align:right">${fmt(r.valor_venta)}</td></tr>`
    ).join('');
    const filasR = valorizado.por_rubro.map(r =>
      `<tr><td>${r.rubro || 'Sin rubro'}</td><td style="text-align:center">${r.productos}</td><td style="text-align:center">${fmtNum(r.unidades)}</td><td style="text-align:right">${fmt(r.valor_costo)}</td><td style="text-align:right">${fmt(r.valor_venta)}</td></tr>`
    ).join('');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Stock Valorizado</title>
<style>@page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;font-size:12px}
h2{color:#1B2A4A}table{width:100%;border-collapse:collapse;margin-bottom:20px}
th{background:#1B2A4A;color:#fff;padding:6px 8px;text-align:left;font-size:11px}
td{padding:6px 8px;border-bottom:1px solid #eee;font-size:11px}
.kpi{display:inline-block;margin:0 16px 16px 0;padding:12px 20px;border-left:4px solid #2B6CB0;background:#EBF8FF;border-radius:8px}
</style></head><body>
<h2>📊 Stock Valorizado — ${new Date().toLocaleDateString('es-AR')}</h2>
<div>
<div class="kpi"><strong>${valorizado.total_productos}</strong><br/>Productos</div>
<div class="kpi"><strong>${fmtNum(valorizado.total_unidades)}</strong><br/>Unidades</div>
<div class="kpi"><strong>${fmt(valorizado.valor_total_costo)}</strong><br/>Valor costo</div>
<div class="kpi"><strong>${fmt(valorizado.valor_total_venta)}</strong><br/>Valor venta</div>
</div>
<h3>Por proveedor</h3>
<table><thead><tr><th>Proveedor</th><th>Productos</th><th>Unidades</th><th>Valor costo</th><th>Valor venta</th></tr></thead><tbody>${filasP}</tbody></table>
<h3>Por rubro</h3>
<table><thead><tr><th>Rubro</th><th>Productos</th><th>Unidades</th><th>Valor costo</th><th>Valor venta</th></tr></thead><tbody>${filasR}</tbody></table>
</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 350);
  };

  // ── Exportar valorizado Excel ─────────────────────────────────
  const exportarValorizadoExcel = () => {
    if (!valorizado) return;
    const rows = [
      'POR PROVEEDOR',
      ['Proveedor', 'Productos', 'Unidades', 'Valor costo', 'Valor venta'].join('\t'),
      ...valorizado.por_proveedor.map(r => [r.proveedor, r.productos, r.unidades, r.valor_costo, r.valor_venta].join('\t')),
      '',
      'POR RUBRO',
      ['Rubro', 'Productos', 'Unidades', 'Valor costo', 'Valor venta'].join('\t'),
      ...valorizado.por_rubro.map(r => [r.rubro, r.productos, r.unidades, r.valor_costo, r.valor_venta].join('\t')),
    ].join('\n');
    const blob = new Blob([rows], { type: 'text/tab-separated-values;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'stock-valorizado.xls'; a.click();
    URL.revokeObjectURL(url);
  };

  const TABS: { key: TabPrincipal; label: string }[] = [
    { key: 'stock',         label: '📦 Stock actual'    },
    { key: 'movimientos',   label: '📋 Movimientos'     },
    { key: 'transferencias',label: '🔄 Transferencias'  },
    { key: 'valorizado',    label: '📊 Valorizado'      },
  ];

  // ── RENDER ────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, padding: '28px', fontFamily: 'system-ui,-apple-system,sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/roberto/dashboard')} style={btnStyle('#EDF2F7', GRAY)}>← Volver</button>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: NAVY, margin: '0 0 2px' }}>📊 Stock</h2>
            <p style={{ fontSize: '13px', color: GRAY, margin: 0 }}>Control de inventario</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={exportarExcel}              style={btnStyle(BLUE)}>📤 Exportar Excel</button>
          <button onClick={imprimirPDF}                style={btnStyle(NAVY)}>🖨️ Imprimir PDF</button>
          <button onClick={() => { if (items.length > 0) setItemAjuste(items[0]); else alert('Cargá el stock primero.'); }}
            style={btnStyle(ORANGE)}>✏️ Ajuste masivo</button>
        </div>
      </div>

      {/* Dashboard */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <Card icon="⚠️" label="Bajo mínimo"        valor={dash ? String(dash.bajo_minimo) : '—'} color={RED}    alerta={dash ? dash.bajo_minimo > 0 : false} />
        <Card icon="🚫" label="Sin stock"           valor={dash ? String(dash.sin_stock)   : '—'} color={RED}    alerta={dash ? dash.sin_stock > 0 : false} />
        <Card icon="💰" label="Valor total (costo)" valor={dash ? fmt(dash.valor_costo)    : '—'} color={BLUE}   />
        <Card icon="📦" label="Productos activos"   valor={dash ? String(dash.activos)     : '—'} color={GREEN}  />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: `2px solid ${SEP}`, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '10px 18px', fontSize: '13px', fontWeight: 600, border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', backgroundColor: tab === t.key ? '#fff' : 'transparent', color: tab === t.key ? NAVY : GRAY, borderBottom: tab === t.key ? '2px solid #fff' : 'none', marginBottom: '-2px' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════
          TAB STOCK ACTUAL
      ════════════════════════════════════════════════════ */}
      {tab === 'stock' && (
        <>
          {/* Filtros */}
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', padding: '16px 20px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 200px' }}>
                <label style={labelSt}>Buscar</label>
                <input value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
                  placeholder="Código o descripción..." style={inputSt} />
              </div>
              <div style={{ flex: '0 1 160px' }}>
                <label style={labelSt}>Proveedor</label>
                <select value={filtroProveedor} onChange={e => { setFiltroProveedor(e.target.value); setPagina(1); }} style={{ ...inputSt, cursor: 'pointer' }}>
                  <option value="">Todos</option>
                  {proveedores.map(p => <option key={p.id} value={String(p.id)}>{p.nombre}</option>)}
                </select>
              </div>
              <div style={{ flex: '0 1 140px' }}>
                <label style={labelSt}>Rubro</label>
                <select value={filtroRubro} onChange={e => { setFiltroRubro(e.target.value); setPagina(1); }} style={{ ...inputSt, cursor: 'pointer' }}>
                  <option value="">Todos</option>
                  {rubros.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{ flex: '0 1 150px' }}>
                <label style={labelSt}>Estado stock</label>
                <select value={filtroEstado} onChange={e => { setFiltroEstado(e.target.value); setPagina(1); }} style={{ ...inputSt, cursor: 'pointer' }}>
                  <option value="">Todos</option>
                  <option value="normal">Normal</option>
                  <option value="bajo">Bajo mínimo</option>
                  <option value="sin_stock">Sin stock</option>
                </select>
              </div>
              <div style={{ flex: '0 1 140px' }}>
                <label style={labelSt}>Desde</label>
                <input type="date" value={fechaDesde} onChange={e => { setFechaDesde(e.target.value); setPagina(1); }} style={inputSt} />
              </div>
              <div style={{ flex: '0 1 140px' }}>
                <label style={labelSt}>Hasta</label>
                <input type="date" value={fechaHasta} onChange={e => { setFechaHasta(e.target.value); setPagina(1); }} style={inputSt} />
              </div>
              {(busqueda || filtroProveedor || filtroRubro || filtroEstado || fechaDesde || fechaHasta) && (
                <button onClick={() => { setBusqueda(''); setFiltroProveedor(''); setFiltroRubro(''); setFiltroEstado(''); setFechaDesde(''); setFechaHasta(''); setPagina(1); }}
                  style={{ ...btnStyle('#EDF2F7', GRAY), alignSelf: 'flex-end' }}>
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {/* Tabla stock */}
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #EDF2F7', fontSize: '13px', color: GRAY }}>
              {totalReg.toLocaleString('es-AR')} productos
            </div>
            {cargando ? (
              <div style={{ padding: '48px', textAlign: 'center', color: GRAY }}>Cargando...</div>
            ) : items.length === 0 ? (
              <div style={{ padding: '64px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: '52px', marginBottom: '12px' }}>📊</div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>No hay productos</h3>
                <p style={{ fontSize: '14px', color: GRAY, margin: 0 }}>Importá productos para comenzar el control de stock.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '900px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#EBF4FF' }}>
                      {['Producto', 'Stock actual', 'Mínimo', 'Estado', 'Costo prom.', 'Último mov.', 'Acciones'].map(col => (
                        <th key={col} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600, color: NAVY, borderBottom: `2px solid ${SEP}`, whiteSpace: 'nowrap' }}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => {
                      const e   = estadoStock(it);
                      const act = Number(it.stock_actual) || 0;
                      return (
                        <tr key={it.id}
                          style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}
                          onMouseEnter={ev => { ev.currentTarget.style.backgroundColor = '#EBF8FF'; }}
                          onMouseLeave={ev => { ev.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#fff' : '#F7FAFC'; }}>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ fontWeight: 600, color: TEXT }}>{it.descripcion}</div>
                            <div style={{ fontSize: '11px', color: GRAY }}>
                              {it.codigo && <span style={{ fontFamily: 'monospace' }}>{it.codigo}</span>}
                              {it.marca && <span> · {it.marca}</span>}
                              {it.proveedor_nombre && <span style={{ color: BLUE }}> · {it.proveedor_nombre}</span>}
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <span style={{ fontSize: '18px', fontWeight: 800, color: act <= 0 ? RED : act <= (Number(it.stock_minimo) || 0) && Number(it.stock_minimo) > 0 ? YELLOW : TEXT }}>
                              {fmtNum(act)}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', color: GRAY }}>{fmtNum(it.stock_minimo)}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <BadgeEstado item={it} />
                            {e.label === 'Bajo mínimo' && <span style={{ marginLeft: '4px', fontSize: '14px' }}>⚠️</span>}
                          </td>
                          <td style={{ padding: '10px 14px', color: GRAY, fontFamily: 'monospace' }}>{fmt(it.precio_costo_final)}</td>
                          <td style={{ padding: '10px 14px', color: GRAY, fontSize: '12px', whiteSpace: 'nowrap' }}>
                            {fmtFecha(it.ultimo_movimiento || it.modificado_en)}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button onClick={() => setItemAjuste(it)}
                                style={{ backgroundColor: '#EBF4FF', color: BLUE, border: 'none', borderRadius: '5px', padding: '5px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                                ✏️ Ajustar
                              </button>
                              <button onClick={() => { setTab('movimientos'); setMovBusq(it.descripcion); }}
                                style={{ backgroundColor: '#EDF2F7', color: GRAY, border: 'none', borderRadius: '5px', padding: '5px 8px', fontSize: '11px', cursor: 'pointer' }}>
                                📋
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <Paginacion pagina={pagina} totalPags={totalPags} porPagina={porPagina} setPagina={setPagina} setPorPagina={setPorPagina} />
        </>
      )}

      {/* ════════════════════════════════════════════════════
          TAB MOVIMIENTOS
      ════════════════════════════════════════════════════ */}
      {tab === 'movimientos' && (
        <>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', padding: '16px 20px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 200px' }}>
                <label style={labelSt}>Buscar producto / motivo</label>
                <input value={movBusq} onChange={e => { setMovBusq(e.target.value); setMovPagina(1); }}
                  placeholder="Código, descripción o motivo..." style={inputSt} />
              </div>
              <div style={{ flex: '0 1 180px' }}>
                <label style={labelSt}>Tipo movimiento</label>
                <select value={movTipo} onChange={e => { setMovTipo(e.target.value); setMovPagina(1); }} style={{ ...inputSt, cursor: 'pointer' }}>
                  <option value="">Todos</option>
                  <option value="ajuste_positivo">Ajuste positivo</option>
                  <option value="ajuste_negativo">Ajuste negativo</option>
                  <option value="venta">Venta</option>
                  <option value="compra">Compra</option>
                  <option value="transferencia_salida">Transferencia salida</option>
                  <option value="transferencia_entrada">Transferencia entrada</option>
                </select>
              </div>
              <div style={{ flex: '0 1 140px' }}>
                <label style={labelSt}>Desde</label>
                <input type="date" value={movDesde} onChange={e => { setMovDesde(e.target.value); setMovPagina(1); }} style={inputSt} />
              </div>
              <div style={{ flex: '0 1 140px' }}>
                <label style={labelSt}>Hasta</label>
                <input type="date" value={movHasta} onChange={e => { setMovHasta(e.target.value); setMovPagina(1); }} style={inputSt} />
              </div>
              {(movBusq || movTipo || movDesde || movHasta) && (
                <button onClick={() => { setMovBusq(''); setMovTipo(''); setMovDesde(''); setMovHasta(''); setMovPagina(1); }}
                  style={{ ...btnStyle('#EDF2F7', GRAY), alignSelf: 'flex-end' }}>
                  Limpiar
                </button>
              )}
            </div>
          </div>

          <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #EDF2F7', fontSize: '13px', color: GRAY }}>
              {movTotal.toLocaleString('es-AR')} movimientos
            </div>
            {movCargando ? (
              <div style={{ padding: '48px', textAlign: 'center', color: GRAY }}>Cargando...</div>
            ) : movs.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
                <p style={{ color: GRAY }}>No hay movimientos registrados.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '860px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#EBF4FF' }}>
                      {['Fecha', 'Tipo', 'Producto', 'Cantidad', 'Stock ant.', 'Stock post.', 'Motivo', 'Doc.'].map(col => (
                        <th key={col} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: NAVY, borderBottom: `2px solid ${SEP}`, whiteSpace: 'nowrap' }}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {movs.map((m, idx) => {
                      const esPos = ['ajuste_positivo', 'compra', 'transferencia_entrada'].includes(m.tipo);
                      return (
                        <tr key={m.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                          <td style={{ padding: '8px 14px', color: GRAY, whiteSpace: 'nowrap', fontSize: '12px' }}>{fmtFechaHora(m.creado_en)}</td>
                          <td style={{ padding: '8px 14px' }}><BadgeTipoMov tipo={m.tipo} /></td>
                          <td style={{ padding: '8px 14px' }}>
                            <div style={{ fontWeight: 500 }}>{m.producto_descripcion || '—'}</div>
                            {m.producto_codigo && <div style={{ fontSize: '11px', color: GRAY, fontFamily: 'monospace' }}>{m.producto_codigo}</div>}
                          </td>
                          <td style={{ padding: '8px 14px', textAlign: 'center', fontWeight: 700, color: esPos ? GREEN : RED, fontFamily: 'monospace' }}>
                            {esPos ? '+' : '−'}{fmtNum(m.cantidad)}
                          </td>
                          <td style={{ padding: '8px 14px', textAlign: 'center', color: GRAY, fontFamily: 'monospace' }}>{fmtNum(m.stock_anterior)}</td>
                          <td style={{ padding: '8px 14px', textAlign: 'center', fontWeight: 600, fontFamily: 'monospace' }}>{fmtNum(m.stock_posterior)}</td>
                          <td style={{ padding: '8px 14px', color: GRAY, fontSize: '12px' }}>{m.motivo || '—'}</td>
                          <td style={{ padding: '8px 14px', color: GRAY, fontSize: '12px', fontFamily: 'monospace' }}>{m.numero_documento || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <Paginacion pagina={movPagina} totalPags={movTotalPags} porPagina={movPorPagina} setPagina={setMovPagina} setPorPagina={setMovPorPagina} />
        </>
      )}

      {/* ════════════════════════════════════════════════════
          TAB TRANSFERENCIAS
      ════════════════════════════════════════════════════ */}
      {tab === 'transferencias' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button onClick={() => setModalTransf(true)} style={btnStyle(GREEN)}>＋ Nueva transferencia</button>
          </div>

          <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
            {transferencias.length === 0 ? (
              <div style={{ padding: '64px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔄</div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>Sin transferencias</h3>
                <p style={{ fontSize: '13px', color: GRAY, margin: '0 0 20px' }}>Las transferencias entre sucursales aparecerán aquí.</p>
                <button onClick={() => setModalTransf(true)} style={btnStyle(GREEN)}>＋ Nueva transferencia</button>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#EBF4FF' }}>
                      {['#', 'Origen', 'Destino', 'Estado', 'Fecha', 'Obs.'].map(col => (
                        <th key={col} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: NAVY, borderBottom: `2px solid ${SEP}` }}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transferencias.map((t, idx) => (
                      <tr key={t.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                        <td style={{ padding: '8px 14px', fontFamily: 'monospace', color: NAVY, fontWeight: 700 }}>#{t.id}</td>
                        <td style={{ padding: '8px 14px' }}>{t.sucursal_origen_id || '—'}</td>
                        <td style={{ padding: '8px 14px' }}>{t.sucursal_destino_id || '—'}</td>
                        <td style={{ padding: '8px 14px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, backgroundColor: '#F0FFF4', color: GREEN }}>{t.estado}</span>
                        </td>
                        <td style={{ padding: '8px 14px', color: GRAY, fontSize: '12px' }}>{fmtFecha(t.creado_en)}</td>
                        <td style={{ padding: '8px 14px', color: GRAY, fontSize: '12px' }}>{t.observaciones || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════
          TAB VALORIZADO
      ════════════════════════════════════════════════════ */}
      {tab === 'valorizado' && (
        <>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button onClick={exportarValorizadoExcel} style={btnStyle(BLUE)}>📤 Exportar Excel</button>
            <button onClick={imprimirValorizado}      style={btnStyle(NAVY)}>🖨️ Imprimir PDF</button>
          </div>

          {valCargando ? (
            <div style={{ padding: '48px', textAlign: 'center', color: GRAY }}>Cargando valorizado...</div>
          ) : !valorizado ? (
            <div style={{ padding: '48px', textAlign: 'center', color: GRAY }}>No hay datos.</div>
          ) : (
            <>
              {/* KPIs */}
              <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
                {[
                  { label: 'Productos activos',  valor: String(valorizado.total_productos),    color: GREEN },
                  { label: 'Total unidades',      valor: fmtNum(valorizado.total_unidades),     color: BLUE  },
                  { label: 'Valor total (costo)', valor: fmt(valorizado.valor_total_costo),     color: NAVY  },
                  { label: 'Valor total (venta)', valor: fmt(valorizado.valor_total_venta),     color: GREEN },
                ].map(k => (
                  <div key={k.label} style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '20px 24px', borderLeft: `4px solid ${k.color}`, flex: '1 1 160px' }}>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: k.color, marginBottom: '4px' }}>{k.valor}</div>
                    <div style={{ fontSize: '12px', color: GRAY }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {/* Por proveedor */}
              <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden', marginBottom: '20px' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #EDF2F7', fontWeight: 700, color: NAVY, fontSize: '14px' }}>Por proveedor</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#EBF4FF' }}>
                        {['Proveedor', 'Productos', 'Unidades', 'Valor costo', 'Valor venta'].map(col => (
                          <th key={col} style={{ padding: '10px 14px', textAlign: col === 'Proveedor' ? 'left' : 'right', fontWeight: 600, color: NAVY, borderBottom: `2px solid ${SEP}` }}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {valorizado.por_proveedor.map((r, idx) => (
                        <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                          <td style={{ padding: '8px 14px', fontWeight: 500 }}>{r.proveedor || 'Sin proveedor'}</td>
                          <td style={{ padding: '8px 14px', textAlign: 'right', color: GRAY }}>{r.productos}</td>
                          <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600 }}>{fmtNum(r.unidades)}</td>
                          <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(r.valor_costo)}</td>
                          <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: GREEN }}>{fmt(r.valor_venta)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Por rubro */}
              <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #EDF2F7', fontWeight: 700, color: NAVY, fontSize: '14px' }}>Por rubro</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#EBF4FF' }}>
                        {['Rubro', 'Productos', 'Unidades', 'Valor costo', 'Valor venta'].map(col => (
                          <th key={col} style={{ padding: '10px 14px', textAlign: col === 'Rubro' ? 'left' : 'right', fontWeight: 600, color: NAVY, borderBottom: `2px solid ${SEP}` }}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {valorizado.por_rubro.map((r, idx) => (
                        <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                          <td style={{ padding: '8px 14px', fontWeight: 500 }}>{r.rubro || 'Sin rubro'}</td>
                          <td style={{ padding: '8px 14px', textAlign: 'right', color: GRAY }}>{r.productos}</td>
                          <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600 }}>{fmtNum(r.unidades)}</td>
                          <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(r.valor_costo)}</td>
                          <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: GREEN }}>{fmt(r.valor_venta)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Modal ajuste */}
      {itemAjuste && (
        <ModalAjuste
          item={itemAjuste}
          onAplicar={aplicarAjuste}
          onCerrar={() => setItemAjuste(null)}
        />
      )}

      {/* Modal transferencia */}
      {modalTransf && cid && (
        <ModalTransferencia
          cid={cid} token={token}
          onCrear={() => { setModalTransf(false); setTransferencias(prev => [...prev]); }}
          onCerrar={() => setModalTransf(false)}
        />
      )}

    </div>
  );
}
