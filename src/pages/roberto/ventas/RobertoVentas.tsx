import React, { useState } from 'react';

const NAVY   = '#1B2A4A';
const BLUE   = '#2B6CB0';
const GREEN  = '#38A169';
const RED    = '#E53E3E';
const SEP    = '#63B3ED';
const GRAY   = '#718096';
const TEXT   = '#2D3748';
const BG     = '#F4F6F9';
const CELESTE = '#3182CE';

type EstadoVenta = 'Confirmada' | 'Cobrada' | 'Anulada';

interface Venta {
  id: number;
  numero: string;
  fecha: string;
  cliente: string;
  total: number;
  estado: EstadoVenta;
  facturada_arca: boolean;
}

const COLUMNAS = ['Número', 'Fecha', 'Cliente', 'Total', 'Estado', 'Facturada ARCA', 'Acciones'];
const POR_PAGINA_OPCIONES = [10, 25, 50];

const ESTADO_STYLE: Record<EstadoVenta, { bg: string; color: string }> = {
  Confirmada: { bg: '#EBF8FF', color: CELESTE },
  Cobrada:    { bg: '#F0FFF4', color: GREEN },
  Anulada:    { bg: '#FFF5F5', color: RED },
};

const btnStyle = (bg: string, color = '#fff'): React.CSSProperties => ({
  backgroundColor: bg, color, border: 'none', borderRadius: '8px',
  padding: '9px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
});

const selectStyle: React.CSSProperties = {
  border: '1.5px solid #CBD5E0', borderRadius: '8px', padding: '8px 12px',
  fontSize: '13px', color: TEXT, backgroundColor: '#fff', outline: 'none', cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  ...selectStyle, boxSizing: 'border-box' as const, width: '100%',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600, color: GRAY,
  textTransform: 'uppercase' as const, letterSpacing: '0.4px', marginBottom: '4px',
};

function BadgeEstado({ estado }: { estado: EstadoVenta }) {
  const s = ESTADO_STYLE[estado] || { bg: '#EDF2F7', color: GRAY };
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: s.bg, color: s.color }}>
      {estado}
    </span>
  );
}

function BadgeArca({ si }: { si: boolean }) {
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: si ? '#F0FFF4' : '#EDF2F7', color: si ? GREEN : GRAY }}>
      {si ? 'Sí' : 'No'}
    </span>
  );
}

function CardMetrica({ icon, label, valor, color }: { icon: string; label: string; valor: string; color: string }) {
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '20px 24px', borderLeft: `4px solid ${color}`, flex: 1 }}>
      <div style={{ fontSize: '22px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color, marginBottom: '4px' }}>{valor}</div>
      <div style={{ fontSize: '12px', color: GRAY, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function RobertoVentas() {
  const [busqueda,     setBusqueda]     = useState('');
  const [fechaDesde,   setFechaDesde]   = useState('');
  const [fechaHasta,   setFechaHasta]   = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [porPagina,    setPorPagina]    = useState(10);
  const [pagina,       setPagina]       = useState(1);

  // Sin datos reales aún — estructura lista para conectar
  const ventas: Venta[] = [];
  const totalPaginas = Math.max(1, Math.ceil(ventas.length / porPagina));
  const paginadas = ventas.slice((pagina - 1) * porPagina, pagina * porPagina);

  const limpiarFiltros = () => {
    setBusqueda(''); setFechaDesde(''); setFechaHasta(''); setFiltroEstado(''); setPagina(1);
  };
  const hayFiltros = busqueda || fechaDesde || fechaHasta || filtroEstado;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, padding: '28px' }}>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '22px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: NAVY, margin: '0 0 3px' }}>💰 Ventas</h2>
          <p style={{ fontSize: '13px', color: GRAY, margin: 0 }}>{ventas.length} ventas registradas</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button style={btnStyle(GREEN)} onClick={() => alert('Nueva venta — próximamente')}>
            ＋ Nueva venta
          </button>
          <button style={btnStyle(BLUE)} onClick={() => alert('Exportar Excel — próximamente')}>
            📊 Exportar Excel
          </button>
          <button style={btnStyle('#EDF2F7', GRAY)} onClick={() => alert('Exportar PDF — próximamente')}>
            📄 Exportar PDF
          </button>
        </div>
      </div>

      {/* ── 3 CARDS MÉTRICAS ───────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <CardMetrica icon="💰" label="Ventas hoy"      valor="$0"  color={GREEN} />
        <CardMetrica icon="📅" label="Ventas del mes"  valor="$0"  color={BLUE} />
        <CardMetrica icon="🎯" label="Ticket promedio" valor="$0"  color={CELESTE} />
      </div>

      {/* ── FILTROS ─────────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={labelStyle}>Buscar</label>
            <input type="text" value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
              placeholder="Número o cliente..." style={inputStyle} />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label style={labelStyle}>Fecha desde</label>
            <input type="date" value={fechaDesde} onChange={e => { setFechaDesde(e.target.value); setPagina(1); }}
              style={inputStyle} />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label style={labelStyle}>Fecha hasta</label>
            <input type="date" value={fechaHasta} onChange={e => { setFechaHasta(e.target.value); setPagina(1); }}
              style={inputStyle} />
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label style={labelStyle}>Estado</label>
            <select value={filtroEstado} onChange={e => { setFiltroEstado(e.target.value); setPagina(1); }} style={selectStyle}>
              <option value="">Todas</option>
              <option value="Confirmada">Confirmada</option>
              <option value="Cobrada">Cobrada</option>
              <option value="Anulada">Anulada</option>
            </select>
          </div>
          {hayFiltros && (
            <button onClick={limpiarFiltros} style={{ ...btnStyle('#EDF2F7', GRAY), alignSelf: 'flex-end' }}>
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* ── TABLA ───────────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        {paginadas.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '800px' }}>
              <thead>
                <tr style={{ backgroundColor: '#EBF4FF' }}>
                  {COLUMNAS.map((col, i) => (
                    <th key={col} style={{
                      padding: '11px 14px', textAlign: 'left', fontWeight: 600, color: NAVY,
                      borderBottom: `2px solid ${SEP}`,
                      borderRight: i < COLUMNAS.length - 1 ? `1px solid rgba(99,179,237,0.3)` : 'none',
                      whiteSpace: 'nowrap',
                    }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginadas.map((v, idx) => (
                  <tr key={v.id}
                    style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#EBF8FF'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#fff' : '#F7FAFC'; }}
                  >
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 600, color: NAVY, borderRight: '1px solid rgba(99,179,237,0.15)' }}>{v.numero}</td>
                    <td style={{ padding: '10px 14px', color: GRAY, whiteSpace: 'nowrap', borderRight: '1px solid rgba(99,179,237,0.15)' }}>{v.fecha}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 500, color: TEXT, borderRight: '1px solid rgba(99,179,237,0.15)' }}>{v.cliente}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: GREEN, fontFamily: 'monospace', borderRight: '1px solid rgba(99,179,237,0.15)' }}>
                      ${v.total.toLocaleString('es-AR')}
                    </td>
                    <td style={{ padding: '10px 14px', borderRight: '1px solid rgba(99,179,237,0.15)' }}>
                      <BadgeEstado estado={v.estado} />
                    </td>
                    <td style={{ padding: '10px 14px', borderRight: '1px solid rgba(99,179,237,0.15)' }}>
                      <BadgeArca si={v.facturada_arca} />
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <button onClick={() => alert(`Ver venta ${v.numero}`)}
                          style={{ backgroundColor: '#EBF4FF', color: BLUE, border: 'none', borderRadius: '5px', padding: '5px 9px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                          👁️ Ver
                        </button>
                        <button onClick={() => alert(`Imprimir ${v.numero}`)}
                          style={{ backgroundColor: '#EDF2F7', color: GRAY, border: 'none', borderRadius: '5px', padding: '5px 9px', fontSize: '12px', cursor: 'pointer' }}>
                          🖨️
                        </button>
                        <button onClick={() => alert(`PDF ${v.numero}`)}
                          style={{ backgroundColor: '#EDF2F7', color: GRAY, border: 'none', borderRadius: '5px', padding: '5px 9px', fontSize: '12px', cursor: 'pointer' }}>
                          📄
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* ── ESTADO VACÍO ──────────────────────────────────── */
          <div style={{ padding: '64px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>💰</div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>
              No hay ventas registradas
            </h3>
            <p style={{ fontSize: '14px', color: GRAY, margin: '0 0 28px' }}>
              Las ventas que registres aparecerán aquí.
            </p>
            <button style={btnStyle(GREEN)} onClick={() => alert('Nueva venta — próximamente')}>
              ＋ Registrar primera venta
            </button>
          </div>
        )}
      </div>

      {/* ── PAGINACIÓN ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: GRAY }}>
          <span>Filas por página:</span>
          {POR_PAGINA_OPCIONES.map(n => (
            <button key={n} onClick={() => { setPorPagina(n); setPagina(1); }}
              style={{ backgroundColor: porPagina === n ? BLUE : '#EDF2F7', color: porPagina === n ? '#fff' : GRAY, border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
              {n}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: GRAY }}>
          <span>Página {pagina} de {totalPaginas}</span>
          <button disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}
            style={{ backgroundColor: pagina <= 1 ? '#EDF2F7' : NAVY, color: pagina <= 1 ? GRAY : '#fff', border: 'none', borderRadius: '6px', padding: '5px 14px', fontSize: '12px', fontWeight: 600, cursor: pagina <= 1 ? 'not-allowed' : 'pointer' }}>
            ← Anterior
          </button>
          <button disabled={pagina >= totalPaginas} onClick={() => setPagina(p => p + 1)}
            style={{ backgroundColor: pagina >= totalPaginas ? '#EDF2F7' : NAVY, color: pagina >= totalPaginas ? GRAY : '#fff', border: 'none', borderRadius: '6px', padding: '5px 14px', fontSize: '12px', fontWeight: 600, cursor: pagina >= totalPaginas ? 'not-allowed' : 'pointer' }}>
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  );
}

export default RobertoVentas;
