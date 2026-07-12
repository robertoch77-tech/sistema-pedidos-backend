import React, { useState } from 'react';

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

const btnStyle = (bg: string, color = '#fff'): React.CSSProperties => ({
  backgroundColor: bg, color, border: 'none', borderRadius: '8px',
  padding: '9px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
});

const selectStyle: React.CSSProperties = {
  border: '1.5px solid #CBD5E0', borderRadius: '8px', padding: '8px 12px',
  fontSize: '13px', color: TEXT, backgroundColor: '#fff', outline: 'none',
};

const labelSt: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600, color: GRAY,
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px',
};

type EstadoRemito = 'pendiente' | 'en_camino' | 'entregado';
type TipoRemito   = 'salida' | 'entrada';

const ESTADO_BADGE: Record<EstadoRemito, { label: string; bg: string; color: string }> = {
  pendiente:  { label: 'Pendiente',  bg: '#FFFAF0', color: YELLOW },
  en_camino:  { label: 'En camino',  bg: '#EBF4FF', color: BLUE   },
  entregado:  { label: 'Entregado',  bg: '#F0FFF4', color: GREEN  },
};

const TIPO_BADGE: Record<TipoRemito, { label: string; bg: string; color: string }> = {
  salida:  { label: 'Salida',  bg: '#FFF5F0', color: ORANGE },
  entrada: { label: 'Entrada', bg: '#EBF4FF', color: NAVY   },
};

function BadgeEstado({ estado }: { estado: EstadoRemito }) {
  const b = ESTADO_BADGE[estado] || { label: estado, bg: '#EDF2F7', color: GRAY };
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, backgroundColor: b.bg, color: b.color }}>
      {b.label}
    </span>
  );
}

function BadgeTipo({ tipo }: { tipo: TipoRemito }) {
  const b = TIPO_BADGE[tipo] || { label: tipo, bg: '#EDF2F7', color: GRAY };
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, backgroundColor: b.bg, color: b.color }}>
      {b.label}
    </span>
  );
}

const COLS = ['Número', 'Fecha', 'Tipo', 'Cliente / Proveedor', 'Estado', 'Bultos', 'Acciones'];
const POR_PAGINA_OPTS = [10, 25, 50];

export default function RobertoRemitos() {
  const [busqueda,     setBusqueda]     = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroTipo,   setFiltroTipo]   = useState('');
  const [fechaDesde,   setFechaDesde]   = useState('');
  const [fechaHasta,   setFechaHasta]   = useState('');
  const [porPagina,    setPorPagina]    = useState(25);
  const [pagina,       setPagina]       = useState(1);

  const hayFiltros = busqueda || filtroEstado || filtroTipo || fechaDesde || fechaHasta;

  const limpiar = () => {
    setBusqueda(''); setFiltroEstado(''); setFiltroTipo('');
    setFechaDesde(''); setFechaHasta(''); setPagina(1);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, padding: '28px' }}>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: NAVY, margin: '0 0 3px' }}>🚚 Remitos</h2>
          <p style={{ fontSize: 13, color: GRAY, margin: 0 }}>Control de salidas y entradas de mercadería</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btnStyle(GREEN)} onClick={() => alert('Nuevo remito — próximamente')}>＋ Nuevo</button>
          <button style={btnStyle(BLUE)}  onClick={() => alert('Exportar — próximamente')}>📤 Exportar Excel</button>
          <button style={btnStyle('#718096')} onClick={() => alert('Imprimir — próximamente')}>🖨️ Imprimir/PDF</button>
        </div>
      </div>

      {/* ── CARDS MÉTRICAS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 22 }}>
        {[
          { icon: '🚚', label: 'Remitos del mes',  valor: '—', color: NAVY   },
          { icon: '📦', label: 'En camino',         valor: '—', color: BLUE   },
          { icon: '✅', label: 'Entregados',         valor: '—', color: GREEN  },
        ].map(c => (
          <div key={c.label} style={{ backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: 20, borderLeft: `4px solid ${c.color}` }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{c.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color, marginBottom: 4 }}>{c.valor}</div>
            <div style={{ fontSize: 12, color: GRAY, fontWeight: 500 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* ── FILTROS ── */}
      <div style={{ backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={labelSt}>Buscar</label>
            <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Número o cliente..." style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: '0 0 140px' }}>
            <label style={labelSt}>Tipo</label>
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
              <option value="">Todos</option>
              <option value="salida">Salida</option>
              <option value="entrada">Entrada</option>
            </select>
          </div>
          <div style={{ flex: '0 0 160px' }}>
            <label style={labelSt}>Estado</label>
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
              <option value="">Todos</option>
              {(Object.keys(ESTADO_BADGE) as EstadoRemito[]).map(k => (
                <option key={k} value={k}>{ESTADO_BADGE[k].label}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '0 0 150px' }}>
            <label style={labelSt}>Fecha desde</label>
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={{ ...selectStyle, width: '100%' }} />
          </div>
          <div style={{ flex: '0 0 150px' }}>
            <label style={labelSt}>Fecha hasta</label>
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={{ ...selectStyle, width: '100%' }} />
          </div>
          {hayFiltros && (
            <button onClick={limpiar} style={{ ...btnStyle('#EDF2F7', GRAY), alignSelf: 'flex-end' }}>Limpiar</button>
          )}
        </div>
      </div>

      {/* ── TABLA ── */}
      <div style={{ backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>🚚</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>
            {hayFiltros ? 'Sin resultados' : 'No hay remitos'}
          </h3>
          <p style={{ fontSize: 14, color: GRAY, margin: '0 0 24px' }}>
            {hayFiltros ? 'Probá cambiando los filtros.' : 'Registrá el primer movimiento de mercadería.'}
          </p>
          {!hayFiltros && (
            <button style={btnStyle(GREEN)} onClick={() => alert('Nuevo remito — próximamente')}>＋ Nuevo remito</button>
          )}
        </div>

        <div style={{ display: 'none', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 800 }}>
            <thead>
              <tr style={{ backgroundColor: '#EBF4FF' }}>
                {COLS.map((col, i) => (
                  <th key={col} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600, color: NAVY, borderBottom: `2px solid ${SEP}`, borderRight: i < COLS.length - 1 ? `1px solid rgba(99,179,237,0.3)` : 'none', whiteSpace: 'nowrap' }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* ejemplo de fila con badges — para referencia de compilación */}
              {([] as { numero: string; fecha: string; tipo: TipoRemito; destinatario: string; estado: EstadoRemito; bultos: number }[]).map((r, idx) => (
                <tr key={r.numero} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                  <td style={{ padding: '10px 14px' }}>{r.numero}</td>
                  <td style={{ padding: '10px 14px', color: GRAY }}>{r.fecha}</td>
                  <td style={{ padding: '10px 14px' }}><BadgeTipo tipo={r.tipo} /></td>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{r.destinatario}</td>
                  <td style={{ padding: '10px 14px' }}><BadgeEstado estado={r.estado} /></td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>{r.bultos}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={{ backgroundColor: '#EBF4FF', color: BLUE, border: 'none', borderRadius: 5, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>👁️ Ver</button>
                      <button style={{ backgroundColor: '#F0FFF4', color: GREEN, border: 'none', borderRadius: 5, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🖨️ Imprimir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── PAGINACIÓN ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: GRAY }}>
          <span>Filas:</span>
          {POR_PAGINA_OPTS.map(n => (
            <button key={n} onClick={() => { setPorPagina(n); setPagina(1); }}
              style={{ backgroundColor: porPagina === n ? BLUE : '#EDF2F7', color: porPagina === n ? '#fff' : GRAY, border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {n}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: GRAY }}>
          <span>0 remitos</span>
          <button disabled style={{ ...btnStyle('#EDF2F7', GRAY), opacity: 0.5 }}>←</button>
          <span style={{ backgroundColor: BLUE, color: '#fff', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>{pagina}</span>
          <button disabled style={{ ...btnStyle('#EDF2F7', GRAY), opacity: 0.5 }}>→</button>
        </div>
      </div>

    </div>
  );
}
