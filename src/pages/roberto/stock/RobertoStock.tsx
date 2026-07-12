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
const YELLOW = '#B7791F';

type EstadoStock = 'Normal' | 'Bajo' | 'Sin stock';

interface ItemStock {
  id: number;
  codigo: string;
  descripcion: string;
  marca: string;
  stock_actual: number;
  stock_minimo: number;
  estado: EstadoStock;
  ultimo_movimiento: string;
}

const COLUMNAS = ['Código / Descripción / Marca', 'Stock actual', 'Stock mínimo', 'Estado', 'Último movimiento', 'Acciones'];
const POR_PAGINA_OPCIONES = [10, 25, 50];

const ESTADO_BADGE: Record<EstadoStock, { bg: string; color: string }> = {
  Normal:     { bg: '#F0FFF4', color: GREEN },
  Bajo:       { bg: '#FFFFF0', color: YELLOW },
  'Sin stock':{ bg: '#FFF5F5', color: RED },
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

const inputStyle: React.CSSProperties = { ...selectStyle, boxSizing: 'border-box' as const, width: '100%' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, color: GRAY, textTransform: 'uppercase' as const, letterSpacing: '0.4px', marginBottom: '4px' };

function BadgeEstadoStock({ estado }: { estado: EstadoStock }) {
  const s = ESTADO_BADGE[estado] || { bg: '#EDF2F7', color: GRAY };
  return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: s.bg, color: s.color }}>{estado}</span>;
}

function CardMetrica({ icon, label, valor, color }: { icon: string; label: string; valor: string | number; color: string }) {
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '20px 24px', borderLeft: `4px solid ${color}`, flex: 1 }}>
      <div style={{ fontSize: '22px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color, marginBottom: '4px' }}>{valor}</div>
      <div style={{ fontSize: '12px', color: GRAY, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function RobertoStock() {
  const [busqueda,     setBusqueda]     = useState('');
  const [filtroProveedor, setFiltroProveedor] = useState('');
  const [filtroRubro,  setFiltroRubro]  = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [porPagina,    setPorPagina]    = useState(10);
  const [pagina,       setPagina]       = useState(1);

  const items: ItemStock[] = [];
  const totalPaginas = Math.max(1, Math.ceil(items.length / porPagina));
  const paginados = items.slice((pagina - 1) * porPagina, pagina * porPagina);

  const limpiarFiltros = () => { setBusqueda(''); setFiltroProveedor(''); setFiltroRubro(''); setFiltroEstado(''); setPagina(1); };
  const hayFiltros = busqueda || filtroProveedor || filtroRubro || filtroEstado;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, padding: '28px' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '22px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: NAVY, margin: '0 0 3px' }}>📊 Stock</h2>
          <p style={{ fontSize: '13px', color: GRAY, margin: 0 }}>Control de inventario</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button style={btnStyle(GREEN)} onClick={() => alert('Ajuste manual — próximamente')}>＋ Ajuste manual</button>
          <button style={btnStyle(BLUE)}  onClick={() => alert('Exportar Excel — próximamente')}>📊 Exportar Excel</button>
        </div>
      </div>

      {/* 3 CARDS */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <CardMetrica icon="⚠️"  label="Bajo mínimo"           valor={0} color={RED} />
        <CardMetrica icon="💰"  label="Valor total del stock"  valor="$0" color={BLUE} />
        <CardMetrica icon="📦"  label="Sin stock"              valor={0} color={ORANGE} />
      </div>

      {/* FILTROS */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={labelStyle}>Buscar</label>
            <input type="text" value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(1); }} placeholder="Código o descripción..." style={inputStyle} />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label style={labelStyle}>Proveedor</label>
            <select value={filtroProveedor} onChange={e => { setFiltroProveedor(e.target.value); setPagina(1); }} style={selectStyle}>
              <option value="">Todos</option>
            </select>
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label style={labelStyle}>Rubro</label>
            <select value={filtroRubro} onChange={e => { setFiltroRubro(e.target.value); setPagina(1); }} style={selectStyle}>
              <option value="">Todos</option>
            </select>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label style={labelStyle}>Estado stock</label>
            <select value={filtroEstado} onChange={e => { setFiltroEstado(e.target.value); setPagina(1); }} style={selectStyle}>
              <option value="">Todos</option>
              <option value="Normal">Normal</option>
              <option value="Bajo">Bajo mínimo</option>
              <option value="Sin stock">Sin stock</option>
            </select>
          </div>
          {hayFiltros && <button onClick={limpiarFiltros} style={{ ...btnStyle('#EDF2F7', GRAY), alignSelf: 'flex-end' }}>Limpiar filtros</button>}
        </div>
      </div>

      {/* TABLA */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        {paginados.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '780px' }}>
              <thead>
                <tr style={{ backgroundColor: '#EBF4FF' }}>
                  {COLUMNAS.map((col, i) => (
                    <th key={col} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600, color: NAVY, borderBottom: `2px solid ${SEP}`, borderRight: i < COLUMNAS.length - 1 ? `1px solid rgba(99,179,237,0.3)` : 'none', whiteSpace: 'nowrap' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginados.map((item, idx) => (
                  <tr key={item.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#EBF8FF'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#fff' : '#F7FAFC'; }}>
                    <td style={{ padding: '10px 14px', borderRight: '1px solid rgba(99,179,237,0.15)' }}>
                      <div style={{ fontWeight: 600, color: TEXT }}>{item.descripcion}</div>
                      <div style={{ fontSize: '11px', color: GRAY }}>{item.codigo} · {item.marca}</div>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: item.stock_actual <= 0 ? RED : TEXT, borderRight: '1px solid rgba(99,179,237,0.15)' }}>{item.stock_actual}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', color: GRAY, borderRight: '1px solid rgba(99,179,237,0.15)' }}>{item.stock_minimo}</td>
                    <td style={{ padding: '10px 14px', borderRight: '1px solid rgba(99,179,237,0.15)' }}><BadgeEstadoStock estado={item.estado} /></td>
                    <td style={{ padding: '10px 14px', color: GRAY, fontSize: '12px', whiteSpace: 'nowrap', borderRight: '1px solid rgba(99,179,237,0.15)' }}>{item.ultimo_movimiento}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <button onClick={() => alert(`Ajustar: ${item.descripcion}`)} style={{ backgroundColor: '#EBF4FF', color: BLUE, border: 'none', borderRadius: '5px', padding: '5px 9px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>✏️ Ajustar</button>
                        <button onClick={() => alert(`Movimientos: ${item.descripcion}`)} style={{ backgroundColor: '#EDF2F7', color: GRAY, border: 'none', borderRadius: '5px', padding: '5px 9px', fontSize: '12px', cursor: 'pointer' }}>📋</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '64px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>📊</div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>No hay productos en stock</h3>
            <p style={{ fontSize: '14px', color: GRAY, margin: 0 }}>Agregá productos para comenzar el control de inventario.</p>
          </div>
        )}
      </div>

      {/* PAGINACIÓN */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: GRAY }}>
          <span>Filas por página:</span>
          {POR_PAGINA_OPCIONES.map(n => (
            <button key={n} onClick={() => { setPorPagina(n); setPagina(1); }} style={{ backgroundColor: porPagina === n ? BLUE : '#EDF2F7', color: porPagina === n ? '#fff' : GRAY, border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>{n}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: GRAY }}>
          <span>Página {pagina} de {totalPaginas}</span>
          <button disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)} style={{ backgroundColor: pagina <= 1 ? '#EDF2F7' : NAVY, color: pagina <= 1 ? GRAY : '#fff', border: 'none', borderRadius: '6px', padding: '5px 14px', fontSize: '12px', fontWeight: 600, cursor: pagina <= 1 ? 'not-allowed' : 'pointer' }}>← Anterior</button>
          <button disabled={pagina >= totalPaginas} onClick={() => setPagina(p => p + 1)} style={{ backgroundColor: pagina >= totalPaginas ? '#EDF2F7' : NAVY, color: pagina >= totalPaginas ? GRAY : '#fff', border: 'none', borderRadius: '6px', padding: '5px 14px', fontSize: '12px', fontWeight: 600, cursor: pagina >= totalPaginas ? 'not-allowed' : 'pointer' }}>Siguiente →</button>
        </div>
      </div>
    </div>
  );
}

export default RobertoStock;
