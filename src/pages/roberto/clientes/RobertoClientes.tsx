import React, { useState } from 'react';

const NAVY  = '#1B2A4A';
const BLUE  = '#2B6CB0';
const GREEN = '#38A169';
const RED   = '#E53E3E';
const SEP   = '#63B3ED';
const GRAY  = '#718096';
const TEXT  = '#2D3748';
const BG    = '#F4F6F9';

interface Cliente {
  id: number;
  nombre: string;
  cuit: string;
  telefono: string;
  whatsapp: string;
  saldo: number;
  estado: 'Activo' | 'Bloqueado';
  ultimo_movimiento: string;
}

const COLUMNAS = ['Nombre / CUIT', 'Teléfono / WhatsApp', 'Saldo cta. cte.', 'Estado', 'Último movimiento', 'Acciones'];
const POR_PAGINA_OPCIONES = [10, 25, 50];

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

function BadgeEstado({ estado }: { estado: 'Activo' | 'Bloqueado' }) {
  const activo = estado === 'Activo';
  return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: activo ? '#F0FFF4' : '#FFF5F5', color: activo ? GREEN : RED }}>{estado}</span>;
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

function RobertoClientes() {
  const [busqueda,     setBusqueda]     = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroSaldo,  setFiltroSaldo]  = useState('');
  const [porPagina,    setPorPagina]    = useState(10);
  const [pagina,       setPagina]       = useState(1);

  const clientes: Cliente[] = [];
  const totalPaginas = Math.max(1, Math.ceil(clientes.length / porPagina));
  const paginados = clientes.slice((pagina - 1) * porPagina, pagina * porPagina);

  const limpiarFiltros = () => { setBusqueda(''); setFiltroEstado(''); setFiltroSaldo(''); setPagina(1); };
  const hayFiltros = busqueda || filtroEstado || filtroSaldo;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, padding: '28px' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '22px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: NAVY, margin: '0 0 3px' }}>👥 Clientes</h2>
          <p style={{ fontSize: '13px', color: GRAY, margin: 0 }}>{clientes.length} clientes registrados</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button style={btnStyle(GREEN)} onClick={() => alert('Nuevo cliente — próximamente')}>＋ Nuevo cliente</button>
          <button style={btnStyle(BLUE)}  onClick={() => alert('Exportar Excel — próximamente')}>📊 Exportar Excel</button>
        </div>
      </div>

      {/* 3 CARDS */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <CardMetrica icon="👥" label="Clientes activos"   valor={0}   color={BLUE} />
        <CardMetrica icon="⚠️" label="Con deuda vencida"  valor={0}   color={RED} />
        <CardMetrica icon="✨" label="Nuevos este mes"    valor={0}   color={GREEN} />
      </div>

      {/* FILTROS */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 220px' }}>
            <label style={labelStyle}>Buscar</label>
            <input type="text" value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(1); }} placeholder="Nombre o CUIT..." style={inputStyle} />
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label style={labelStyle}>Estado</label>
            <select value={filtroEstado} onChange={e => { setFiltroEstado(e.target.value); setPagina(1); }} style={selectStyle}>
              <option value="">Todos</option>
              <option value="Activo">Activo</option>
              <option value="Bloqueado">Bloqueado</option>
            </select>
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label style={labelStyle}>Saldo</label>
            <select value={filtroSaldo} onChange={e => { setFiltroSaldo(e.target.value); setPagina(1); }} style={selectStyle}>
              <option value="">Todos</option>
              <option value="deuda">Con deuda</option>
              <option value="sin_deuda">Sin deuda</option>
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
                {paginados.map((c, idx) => (
                  <tr key={c.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#EBF8FF'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#fff' : '#F7FAFC'; }}>
                    <td style={{ padding: '10px 14px', borderRight: '1px solid rgba(99,179,237,0.15)' }}>
                      <div style={{ fontWeight: 600, color: TEXT }}>{c.nombre}</div>
                      <div style={{ fontSize: '11px', color: GRAY, fontFamily: 'monospace' }}>{c.cuit}</div>
                    </td>
                    <td style={{ padding: '10px 14px', borderRight: '1px solid rgba(99,179,237,0.15)' }}>
                      <div style={{ fontSize: '13px', color: TEXT }}>{c.telefono || '—'}</div>
                      {c.whatsapp && <div style={{ fontSize: '11px', color: GREEN }}>💬 {c.whatsapp}</div>}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: c.saldo < 0 ? RED : c.saldo > 0 ? GREEN : GRAY, borderRight: '1px solid rgba(99,179,237,0.15)' }}>
                      ${Math.abs(c.saldo).toLocaleString('es-AR')}{c.saldo < 0 ? ' (deuda)' : ''}
                    </td>
                    <td style={{ padding: '10px 14px', borderRight: '1px solid rgba(99,179,237,0.15)' }}><BadgeEstado estado={c.estado} /></td>
                    <td style={{ padding: '10px 14px', color: GRAY, fontSize: '12px', whiteSpace: 'nowrap', borderRight: '1px solid rgba(99,179,237,0.15)' }}>{c.ultimo_movimiento}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <button onClick={() => alert(`Ver: ${c.nombre}`)} style={{ backgroundColor: '#EBF4FF', color: BLUE, border: 'none', borderRadius: '5px', padding: '5px 9px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>👁️ Ver</button>
                        <button onClick={() => alert(`Cuenta corriente: ${c.nombre}`)} style={{ backgroundColor: '#EDF2F7', color: GRAY, border: 'none', borderRadius: '5px', padding: '5px 9px', fontSize: '12px', cursor: 'pointer' }}>💳</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '64px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>👥</div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>No hay clientes registrados</h3>
            <p style={{ fontSize: '14px', color: GRAY, margin: '0 0 28px' }}>Los clientes que agregues aparecerán aquí.</p>
            <button style={btnStyle(GREEN)} onClick={() => alert('Nuevo cliente — próximamente')}>＋ Nuevo cliente</button>
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

export default RobertoClientes;
