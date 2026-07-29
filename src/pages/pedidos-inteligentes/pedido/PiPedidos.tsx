import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../../config/api';

const NAVY   = '#1B2A4A';
const BLUE   = '#2B6CB0';
const GREEN  = '#38A169';
const RED    = '#E53E3E';
const ORANGE = '#DD6B20';
const SEP    = '#63B3ED';
const GRAY   = '#718096';
const TEXT   = '#2D3748';
const BG     = '#F4F6F9';

function getToken() {
  try { const s = localStorage.getItem('pi_session'); return s ? JSON.parse(s).token : ''; } catch { return ''; }
}
function hdr(): Record<string, string> {
  return { 'x-pi-token': getToken(), 'Content-Type': 'application/json' };
}

// ── Tipos ────────────────────────────────────────────────────
interface Pedido {
  id: number;
  numero_completo: string;
  fecha_pedido: string;
  cliente_nombre: string;
  total_items: number;
  estado: 'confirmado' | 'preparando' | 'facturado' | 'anulado';
  origen: 'foto' | 'texto' | 'excel' | 'manual';
}

interface ItemDetalle {
  id: number;
  codigo: string;
  descripcion: string;
  cantidad: number;
  rubro: string | null;
  preparado: boolean;
  facturado: boolean;
}

interface Stats {
  hoy: string;
  pendientes: string;
  preparando: string;
  facturados_hoy: string;
}

// ── Badges ───────────────────────────────────────────────────
const ORIGEN_MAP: Record<string, string> = {
  foto: '📷', texto: '💬', excel: '📊', manual: '✏️',
};

const ESTADO_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  confirmado: { label: 'Confirmado', bg: '#EBF8FF', color: BLUE },
  preparando: { label: 'Preparando', bg: '#FFFAF0', color: ORANGE },
  facturado:  { label: 'Facturado',  bg: '#F0FFF4', color: GREEN },
  anulado:    { label: 'Anulado',    bg: '#FFF5F5', color: RED },
};

function BadgeEstado({ estado }: { estado: string }) {
  const s = ESTADO_STYLE[estado] || { label: estado, bg: '#F7FAFC', color: GRAY };
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '10px',
      color: s.color, backgroundColor: s.bg, border: `1px solid ${s.color}`, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

// ── Card métrica ─────────────────────────────────────────────
function Card({ icon, label, valor, color }: { icon: string; label: string; valor: string | number; color: string }) {
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '18px 22px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.07)', borderLeft: `4px solid ${color}`, flex: 1, minWidth: '130px' }}>
      <div style={{ fontSize: '22px', marginBottom: '6px' }}>{icon}</div>
      <div style={{ fontSize: '24px', fontWeight: 800, color, marginBottom: '2px' }}>{valor}</div>
      <div style={{ fontSize: '12px', color: GRAY, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────
function Sk({ w = '100%', h = '16px' }: { w?: string; h?: string }) {
  return (
    <div style={{ width: w, height: h, borderRadius: '4px', background: 'linear-gradient(90deg,#EDF2F7 25%,#E2E8F0 50%,#EDF2F7 75%)',
      backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
  );
}

// ── Modal detalle items ───────────────────────────────────────
function ModalDetalle({ pedidoId, numero, onCerrar }: { pedidoId: number; numero: string; onCerrar: () => void }) {
  const [items, setItems]       = useState<ItemDetalle[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [cambios, setCambios]   = useState<Record<number, { preparado: boolean; facturado: boolean }>>({});

  useEffect(() => {
    (async () => {
      setCargando(true);
      try {
        const r = await fetch(`${API_BASE}/api/pi/pedidos/${pedidoId}`, { headers: hdr() });
        const d = await r.json();
        if (r.ok && d.ok) setItems(d.items.map((it: any, i: number) => ({ ...it, id: it.id ?? i })));
      } catch { /* silencioso */ } finally { setCargando(false); }
    })();
  }, [pedidoId]);

  const toggle = (id: number, campo: 'preparado' | 'facturado', valor: boolean) => {
    setCambios(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [campo]: valor } }));
    setItems(prev => prev.map(it => it.id === id ? { ...it, [campo]: valor } : it));
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      await Promise.all(
        Object.entries(cambios).map(([item_id, vals]) =>
          fetch(`${API_BASE}/api/pi/pedidos/${pedidoId}/item/${item_id}/checklist`, {
            method: 'PUT', headers: hdr(), body: JSON.stringify(vals),
          })
        )
      );
      setCambios({});
    } catch { /* silencioso */ } finally { setGuardando(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '14px', width: '100%', maxWidth: '700px',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        {/* Header modal */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #EDF2F7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: NAVY }}>
            Detalle — {numero}
          </h3>
          <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: GRAY }}>✕</button>
        </div>
        {/* Body modal */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 22px' }}>
          {cargando ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[...Array(6)].map((_, i) => <Sk key={i} h="36px" />)}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead style={{ backgroundColor: '#F7FAFC' }}>
                <tr>
                  {['Código', 'Descripción', 'Cant.', 'Rubro', 'P', 'F'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: GRAY,
                      fontWeight: 600, fontSize: '11px', borderBottom: '2px solid #EDF2F7' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={it.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC', borderBottom: '1px solid #EDF2F7' }}>
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: '11px', color: NAVY }}>{it.codigo || '—'}</td>
                    <td style={{ padding: '7px 10px', color: TEXT }}>{it.descripcion}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700 }}>{it.cantidad}</td>
                    <td style={{ padding: '7px 10px', color: GRAY, fontSize: '11px' }}>{it.rubro || '—'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                      <input type="checkbox" checked={it.preparado}
                        onChange={e => toggle(it.id, 'preparado', e.target.checked)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                      <input type="checkbox" checked={it.facturado}
                        onChange={e => toggle(it.id, 'facturado', e.target.checked)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {/* Footer modal */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid #EDF2F7', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onCerrar}
            style={{ padding: '8px 16px', border: '1px solid #CBD5E0', borderRadius: '7px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>
            Cerrar
          </button>
          {Object.keys(cambios).length > 0 && (
            <button onClick={guardar} disabled={guardando}
              style={{ padding: '8px 18px', backgroundColor: guardando ? '#BEE3F8' : GREEN, color: '#fff',
                border: 'none', borderRadius: '7px', cursor: guardando ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 700 }}>
              {guardando ? '⏳ Guardando...' : '💾 Guardar checklist'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Modal cambiar estado ──────────────────────────────────────
function ModalEstado({ pedidoId, estadoActual, onCerrar, onActualizado }: {
  pedidoId: number; estadoActual: string; onCerrar: () => void; onActualizado: () => void;
}) {
  const [estado, setEstado]     = useState(estadoActual);
  const [guardando, setGuardando] = useState(false);

  const confirmar = async () => {
    setGuardando(true);
    try {
      await fetch(`${API_BASE}/api/pi/pedidos/${pedidoId}/estado`, {
        method: 'PUT', headers: hdr(), body: JSON.stringify({ estado }),
      });
      onActualizado();
    } catch { /* silencioso */ } finally { setGuardando(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '14px', width: '360px', padding: '24px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 18px', fontSize: '15px', fontWeight: 700, color: NAVY }}>Cambiar estado del pedido</h3>
        <select value={estado} onChange={e => setEstado(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #CBD5E0', borderRadius: '8px',
            fontSize: '14px', color: TEXT, marginBottom: '18px', background: '#fff' }}>
          <option value="confirmado">Confirmado</option>
          <option value="preparando">Preparando</option>
          <option value="facturado">Facturado</option>
          <option value="anulado">Anulado</option>
        </select>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCerrar}
            style={{ padding: '8px 16px', border: '1px solid #CBD5E0', borderRadius: '7px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>
            Cancelar
          </button>
          <button onClick={confirmar} disabled={guardando || estado === estadoActual}
            style={{ padding: '8px 18px', backgroundColor: guardando || estado === estadoActual ? '#BEE3F8' : BLUE,
              color: '#fff', border: 'none', borderRadius: '7px',
              cursor: guardando || estado === estadoActual ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 700 }}>
            {guardando ? '⏳...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════
function PiPedidos() {
  const navigate = useNavigate();

  const [pedidos, setPedidos]     = useState<Pedido[]>([]);
  const [stats, setStats]         = useState<Stats | null>(null);
  const [total, setTotal]         = useState(0);
  const [paginas, setPaginas]     = useState(1);
  const [cargando, setCargando]   = useState(true);

  // Filtros
  const [buscar, setBuscar]       = useState('');
  const [estado, setEstado]       = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [pagina, setPagina]       = useState(1);
  const [limit, setLimit]         = useState(25);

  // Modales
  const [modalDetalle, setModalDetalle] = useState<{ id: number; numero: string } | null>(null);
  const [modalEstado, setModalEstado]   = useState<{ id: number; estado: string } | null>(null);

  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargar = useCallback(async (q: {
    buscar: string; estado: string; fechaDesde: string; fechaHasta: string; pagina: number; limit: number;
  }) => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      if (q.buscar)     params.set('buscar', q.buscar);
      if (q.estado)     params.set('estado', q.estado);
      if (q.fechaDesde) params.set('fecha_desde', q.fechaDesde);
      if (q.fechaHasta) params.set('fecha_hasta', q.fechaHasta);
      params.set('page',  String(q.pagina));
      params.set('limit', String(q.limit));

      const r = await fetch(`${API_BASE}/api/pi/pedidos?${params}`, { headers: hdr() });
      const d = await r.json();
      if (r.ok && d.ok) {
        setPedidos(d.pedidos);
        setTotal(d.total);
        setPaginas(d.paginas);
        if (d.stats) setStats(d.stats);
      }
    } catch { /* silencioso */ } finally { setCargando(false); }
  }, []);

  // Dispara carga con debounce en buscar, inmediato en el resto
  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => {
      cargar({ buscar, estado, fechaDesde, fechaHasta, pagina, limit });
    }, 300);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [buscar, estado, fechaDesde, fechaHasta, pagina, limit, cargar]);

  const exportarExcel = () => {
    const filas = [
      ['Número', 'Fecha', 'Cliente', 'Items', 'Origen', 'Estado'],
      ...pedidos.map(p => [
        p.numero_completo,
        p.fecha_pedido ? new Date(p.fecha_pedido).toLocaleDateString('es-AR') : '',
        p.cliente_nombre,
        p.total_items,
        ORIGEN_MAP[p.origen] || p.origen,
        p.estado,
      ]),
    ];
    const tsv  = filas.map(r => r.join('\t')).join('\n');
    const blob = new Blob([tsv], { type: 'application/vnd.ms-excel' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `pedidos_${new Date().toISOString().slice(0, 10)}.xls`;
    a.click(); URL.revokeObjectURL(url);
  };

  const inp: React.CSSProperties = { padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', color: TEXT, background: '#fff' };
  const fmtFecha = (s: string) => s ? new Date(s).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

  return (
    <>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>

      {modalDetalle && (
        <ModalDetalle pedidoId={modalDetalle.id} numero={modalDetalle.numero}
          onCerrar={() => setModalDetalle(null)} />
      )}
      {modalEstado && (
        <ModalEstado pedidoId={modalEstado.id} estadoActual={modalEstado.estado}
          onCerrar={() => setModalEstado(null)}
          onActualizado={() => { setModalEstado(null); cargar({ buscar, estado, fechaDesde, fechaHasta, pagina, limit }); }} />
      )}

      <div style={{ padding: '24px', backgroundColor: BG, minHeight: '100vh' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: NAVY }}>📦 Pedidos</h1>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={exportarExcel}
              style={{ padding: '9px 16px', border: `1px solid ${SEP}`, borderRadius: '8px', background: '#fff',
                cursor: 'pointer', fontSize: '13px', color: BLUE, fontWeight: 600 }}>
              📤 Exportar Excel
            </button>
            <button onClick={() => navigate('/pedidos-inteligentes/nuevo-pedido')}
              style={{ padding: '9px 18px', backgroundColor: GREEN, color: '#fff', border: 'none',
                borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
              ＋ Nuevo pedido
            </button>
          </div>
        </div>

        {/* Cards métricas */}
        <div style={{ display: 'flex', gap: '14px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <Card icon="📋" label="Pedidos hoy"          valor={stats ? stats.hoy          : '…'} color={BLUE}   />
          <Card icon="⏳" label="Pendientes preparar"  valor={stats ? stats.pendientes   : '…'} color={ORANGE} />
          <Card icon="🔧" label="Preparando"           valor={stats ? stats.preparando   : '…'} color={SEP}    />
          <Card icon="✅" label="Facturados hoy"       valor={stats ? stats.facturados_hoy : '…'} color={GREEN} />
        </div>

        {/* Filtros */}
        <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '14px 18px', marginBottom: '16px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: '180px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: GRAY, marginBottom: '4px' }}>Buscar</label>
            <input value={buscar} onChange={e => { setBuscar(e.target.value); setPagina(1); }}
              placeholder="Número o cliente..." style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div style={{ minWidth: '140px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: GRAY, marginBottom: '4px' }}>Estado</label>
            <select value={estado} onChange={e => { setEstado(e.target.value); setPagina(1); }}
              style={{ ...inp, width: '100%' }}>
              <option value="">Todos</option>
              <option value="confirmado">Confirmado</option>
              <option value="preparando">Preparando</option>
              <option value="facturado">Facturado</option>
              <option value="anulado">Anulado</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: GRAY, marginBottom: '4px' }}>Desde</label>
            <input type="date" value={fechaDesde} onChange={e => { setFechaDesde(e.target.value); setPagina(1); }} style={inp} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: GRAY, marginBottom: '4px' }}>Hasta</label>
            <input type="date" value={fechaHasta} onChange={e => { setFechaHasta(e.target.value); setPagina(1); }} style={inp} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: GRAY, marginBottom: '4px' }}>Por página</label>
            <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setPagina(1); }} style={{ ...inp }}>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
          {(buscar || estado || fechaDesde || fechaHasta) && (
            <button onClick={() => { setBuscar(''); setEstado(''); setFechaDesde(''); setFechaHasta(''); setPagina(1); }}
              style={{ padding: '8px 14px', border: '1px solid #CBD5E0', borderRadius: '7px', background: '#fff',
                cursor: 'pointer', fontSize: '12px', color: GRAY, alignSelf: 'flex-end' }}>
              ✕ Limpiar
            </button>
          )}
        </div>

        {/* Tabla */}
        <div style={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '700px' }}>
              <thead style={{ backgroundColor: '#F7FAFC', borderBottom: `2px solid ${SEP}` }}>
                <tr>
                  {['Número', 'Fecha', 'Cliente', 'Items', 'Origen', 'Estado', 'Acciones'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: GRAY, fontWeight: 600, fontSize: '11px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cargando ? (
                  [...Array(8)].map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #EDF2F7' }}>
                      {[...Array(7)].map((_, j) => (
                        <td key={j} style={{ padding: '12px' }}><Sk /></td>
                      ))}
                    </tr>
                  ))
                ) : pedidos.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: GRAY }}>
                    No hay pedidos para mostrar
                  </td></tr>
                ) : (
                  pedidos.map((p, idx) => (
                    <tr key={p.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC', borderBottom: '1px solid #EDF2F7' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: NAVY, fontFamily: 'monospace', fontSize: '12px' }}>
                        {p.numero_completo}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '12px', color: TEXT }}>
                        {fmtFecha(p.fecha_pedido)}
                      </td>
                      <td style={{ padding: '10px 12px', color: TEXT, maxWidth: '200px' }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.cliente_nombre || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: GRAY }}>
                        {p.total_items}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: '16px' }}>
                        {ORIGEN_MAP[p.origen] || '✏️'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <BadgeEstado estado={p.estado} />
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button title="Ver detalle" onClick={() => setModalDetalle({ id: p.id, numero: p.numero_completo })}
                            style={{ padding: '5px 9px', border: '1px solid #CBD5E0', borderRadius: '6px',
                              background: '#fff', cursor: 'pointer', fontSize: '13px' }}>
                            👁️
                          </button>
                          <button title="Reimprimir nota" onClick={() => navigate(`/pedidos-inteligentes/nota/${p.id}`)}
                            style={{ padding: '5px 9px', border: '1px solid #CBD5E0', borderRadius: '6px',
                              background: '#fff', cursor: 'pointer', fontSize: '13px' }}>
                            🖨️
                          </button>
                          <button title="Cambiar estado" onClick={() => setModalEstado({ id: p.id, estado: p.estado })}
                            style={{ padding: '5px 9px', border: '1px solid #CBD5E0', borderRadius: '6px',
                              background: '#fff', cursor: 'pointer', fontSize: '13px' }}>
                            ✏️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {!cargando && total > 0 && (
            <div style={{ padding: '14px 16px', borderTop: '1px solid #EDF2F7', display: 'flex',
              justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: GRAY }}>
                {total} resultado{total !== 1 ? 's' : ''} · Página {pagina} de {paginas}
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina <= 1}
                  style={{ padding: '6px 12px', border: '1px solid #CBD5E0', borderRadius: '6px',
                    background: pagina <= 1 ? '#F7FAFC' : '#fff', cursor: pagina <= 1 ? 'not-allowed' : 'pointer',
                    fontSize: '12px', color: pagina <= 1 ? GRAY : TEXT }}>
                  ← Anterior
                </button>
                {[...Array(Math.min(paginas, 5))].map((_, i) => {
                  const n = Math.max(1, pagina - 2) + i;
                  if (n > paginas) return null;
                  return (
                    <button key={n} onClick={() => setPagina(n)}
                      style={{ padding: '6px 10px', border: `1px solid ${n === pagina ? BLUE : '#CBD5E0'}`,
                        borderRadius: '6px', background: n === pagina ? BLUE : '#fff',
                        color: n === pagina ? '#fff' : TEXT, cursor: 'pointer', fontSize: '12px', fontWeight: n === pagina ? 700 : 400 }}>
                      {n}
                    </button>
                  );
                })}
                <button onClick={() => setPagina(p => Math.min(paginas, p + 1))} disabled={pagina >= paginas}
                  style={{ padding: '6px 12px', border: '1px solid #CBD5E0', borderRadius: '6px',
                    background: pagina >= paginas ? '#F7FAFC' : '#fff', cursor: pagina >= paginas ? 'not-allowed' : 'pointer',
                    fontSize: '12px', color: pagina >= paginas ? GRAY : TEXT }}>
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default PiPedidos;
