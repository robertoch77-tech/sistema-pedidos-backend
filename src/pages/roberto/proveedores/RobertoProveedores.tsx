import React, { useState } from 'react';

const NAVY  = '#1B2A4A';
const BLUE  = '#2B6CB0';
const GREEN = '#38A169';
const RED   = '#E53E3E';
const SEP   = '#63B3ED';
const GRAY  = '#718096';
const TEXT  = '#2D3748';
const BG    = '#F4F6F9';

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

const COLS = ['Nombre', 'CUIT', 'Teléfono', 'WhatsApp', 'Saldo CC', 'Última compra', 'Acciones'];
const POR_PAGINA_OPTS = [10, 25, 50];

interface ProveedorRow {
  id: number;
  nombre: string;
  cuit: string;
  telefono: string;
  whatsapp: string;
  saldo_cc: number;
  ultima_compra: string | null;
  activo: boolean;
}

export default function RobertoProveedores() {
  const [busqueda,   setBusqueda]   = useState('');
  const [filtroAct,  setFiltroAct]  = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [porPagina,  setPorPagina]  = useState(25);
  const [pagina,     setPagina]     = useState(1);

  // datos vacíos por ahora — el backend de proveedores se integrará después
  const proveedores: ProveedorRow[] = [];
  const total = 0;

  const hayFiltros = busqueda || filtroAct || fechaDesde || fechaHasta;

  const limpiar = () => {
    setBusqueda(''); setFiltroAct(''); setFechaDesde(''); setFechaHasta(''); setPagina(1);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, padding: '28px' }}>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: NAVY, margin: '0 0 3px' }}>🏢 Proveedores</h2>
          <p style={{ fontSize: 13, color: GRAY, margin: 0 }}>Directorio y cuenta corriente de proveedores</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btnStyle(GREEN)} onClick={() => alert('Nuevo proveedor — próximamente')}>＋ Nuevo</button>
          <button style={btnStyle(BLUE)}  onClick={() => alert('Exportar — próximamente')}>📤 Exportar Excel</button>
          <button style={btnStyle('#718096')} onClick={() => alert('Imprimir — próximamente')}>🖨️ Imprimir/PDF</button>
        </div>
      </div>

      {/* ── CARDS MÉTRICAS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 22 }}>
        {[
          { icon: '🏢', label: 'Total proveedores', valor: total > 0 ? String(total) : '—', color: NAVY  },
          { icon: '✅', label: 'Proveedores activos', valor: '—', color: GREEN },
          { icon: '💳', label: 'Saldo total a pagar', valor: '—', color: RED   },
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
              placeholder="Nombre o CUIT..." style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: '0 0 140px' }}>
            <label style={labelSt}>Estado</label>
            <select value={filtroAct} onChange={e => setFiltroAct(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
              <option value="">Todos</option>
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
          </div>
          <div style={{ flex: '0 0 150px' }}>
            <label style={labelSt}>Última compra desde</label>
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={{ ...selectStyle, width: '100%' }} />
          </div>
          <div style={{ flex: '0 0 150px' }}>
            <label style={labelSt}>Última compra hasta</label>
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={{ ...selectStyle, width: '100%' }} />
          </div>
          {hayFiltros && (
            <button onClick={limpiar} style={{ ...btnStyle('#EDF2F7', GRAY), alignSelf: 'flex-end' }}>Limpiar</button>
          )}
        </div>
      </div>

      {/* ── TABLA ── */}
      <div style={{ backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        {proveedores.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 860 }}>
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
                {proveedores.map((p, idx) => (
                  <tr key={p.id}
                    style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#EBF8FF'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#fff' : '#F7FAFC'; }}
                  >
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: TEXT, borderRight: '1px solid rgba(99,179,237,0.15)' }}>
                      {p.nombre}
                      {!p.activo && <span style={{ marginLeft: 6, fontSize: 10, backgroundColor: '#FFF5F5', color: RED, borderRadius: 12, padding: '2px 6px', fontWeight: 700 }}>Inactivo</span>}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: GRAY, borderRight: '1px solid rgba(99,179,237,0.15)' }}>{p.cuit || '—'}</td>
                    <td style={{ padding: '10px 14px', color: GRAY, borderRight: '1px solid rgba(99,179,237,0.15)' }}>{p.telefono || '—'}</td>
                    <td style={{ padding: '10px 14px', color: GRAY, borderRight: '1px solid rgba(99,179,237,0.15)' }}>{p.whatsapp || '—'}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 600, color: p.saldo_cc > 0 ? RED : GREEN, borderRight: '1px solid rgba(99,179,237,0.15)' }}>
                      ${Number(p.saldo_cc || 0).toLocaleString('es-AR')}
                    </td>
                    <td style={{ padding: '10px 14px', color: GRAY, fontSize: 12, borderRight: '1px solid rgba(99,179,237,0.15)' }}>
                      {p.ultima_compra ? new Date(p.ultima_compra).toLocaleDateString('es-AR') : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => alert(`Ver: ${p.nombre}`)}
                          style={{ backgroundColor: '#EBF4FF', color: BLUE, border: 'none', borderRadius: 5, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          👁️ Ver
                        </button>
                        <button onClick={() => alert(`CC: ${p.nombre}`)}
                          style={{ backgroundColor: '#F0FFF4', color: GREEN, border: 'none', borderRadius: 5, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          💳 CC
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🏢</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>
              {hayFiltros ? 'Sin resultados' : 'No hay proveedores'}
            </h3>
            <p style={{ fontSize: 14, color: GRAY, margin: '0 0 24px' }}>
              {hayFiltros ? 'Probá cambiando los filtros.' : 'Agregá tu primer proveedor para comenzar.'}
            </p>
            {!hayFiltros && (
              <button style={btnStyle(GREEN)} onClick={() => alert('Nuevo proveedor — próximamente')}>＋ Nuevo proveedor</button>
            )}
          </div>
        )}
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
          <span>{total} proveedores</span>
          <button disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}
            style={{ ...btnStyle('#EDF2F7', GRAY), opacity: pagina <= 1 ? 0.5 : 1 }}>←</button>
          <span style={{ backgroundColor: BLUE, color: '#fff', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>{pagina}</span>
          <button disabled style={{ ...btnStyle('#EDF2F7', GRAY), opacity: 0.5 }}>→</button>
        </div>
      </div>

    </div>
  );
}
