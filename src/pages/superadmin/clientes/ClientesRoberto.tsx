import React, { useEffect, useState } from 'react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:4000';

const BLUE = '#2B6CB0';
const GREEN = '#38A169';
const RED = '#E53E3E';
const GRAY = '#718096';
const TEXT = '#2D3748';
const NAVY = '#1B2A4A';
const SEPARATOR = '#63B3ED';

interface ClienteRoberto {
  id: number;
  nombre_comercial: string;
  cuit: string;
  rubro: string;
  plan: string;
  estado: string;
  codigo_acceso: string;
  fecha_alta: string | null;
  mayorista_id: number;
  email: string;
  whatsapp: string;
}

function formatFecha(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function badgePlan(plan: string) {
  const map: Record<string, { bg: string; color: string }> = {
    'Básico':        { bg: '#EDF2F7', color: GRAY },
    'Estándar':      { bg: '#EBF4FF', color: BLUE },
    'Completo':      { bg: '#F0FFF4', color: GREEN },
    'Personalizado': { bg: '#FFFAF0', color: '#C05621' },
  };
  const s = map[plan] || { bg: '#EDF2F7', color: GRAY };
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: '20px',
      fontSize: '12px', fontWeight: 600, backgroundColor: s.bg, color: s.color,
    }}>
      {plan || '—'}
    </span>
  );
}

function badgeEstado(estado: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    'activo':     { bg: '#F0FFF4', color: GREEN,   label: 'Activo' },
    'suspendido': { bg: '#FFF5F5', color: RED,     label: 'Suspendido' },
    'prueba':     { bg: '#FFFFF0', color: '#B7791F', label: 'Prueba' },
  };
  const s = map[estado?.toLowerCase()] || { bg: '#EDF2F7', color: GRAY, label: estado || '—' };
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: '20px',
      fontSize: '12px', fontWeight: 600, backgroundColor: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  );
}

function ClientesRoberto() {
  const [clientes, setClientes] = useState<ClienteRoberto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    const cargar = async () => {
      try {
        const sesion = JSON.parse(localStorage.getItem('superadmin_session') || '{}');
        const token = sesion.token || '';
        const res = await fetch(`${API_BASE}/api/superadmin/clientes`, {
          headers: { 'x-superadmin-token': token },
        });
        if (!res.ok) throw new Error('Error al cargar');
        const data = await res.json();
        setClientes(data);
      } catch {
        setError('Error al cargar clientes');
      } finally {
        setCargando(false);
      }
    };
    cargar();
  }, []);

  const toggleEstado = (id: number, estadoActual: string) => {
    const nuevo = estadoActual === 'activo' ? 'suspendido' : 'activo';
    setClientes(prev => prev.map(c => c.id === id ? { ...c, estado: nuevo } : c));
  };

  const filtrados = clientes.filter(c => {
    const q = busqueda.toLowerCase();
    return (
      c.nombre_comercial?.toLowerCase().includes(q) ||
      c.cuit?.toLowerCase().includes(q)
    );
  });

  const totalActivos    = clientes.filter(c => c.estado === 'activo').length;
  const totalSuspendidos = clientes.filter(c => c.estado === 'suspendido').length;

  const columnas = ['Nombre comercial', 'CUIT', 'Rubro', 'Plan', 'Estado', 'Código', 'Fecha alta', 'Acciones'];

  return (
    <div style={{ padding: '28px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: TEXT, margin: '0 0 4px' }}>👥 Clientes</h2>
          {!cargando && !error && (
            <p style={{ fontSize: '13px', color: GRAY, margin: 0 }}>
              <strong style={{ color: TEXT }}>{clientes.length}</strong> clientes registrados
              &nbsp;·&nbsp;
              <span style={{ color: GREEN }}>{totalActivos} activos</span>
              &nbsp;·&nbsp;
              <span style={{ color: RED }}>{totalSuspendidos} suspendidos</span>
            </p>
          )}
        </div>
        <button
          onClick={() => { window.location.href = '/superadmin/clientes/nuevo'; }}
          style={{ backgroundColor: GREEN, color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
        >
          + Nuevo cliente
        </button>
      </div>

      {/* Buscador */}
      {!cargando && !error && clientes.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <input
            type="text"
            placeholder="Buscar por nombre o CUIT..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{
              width: '320px', maxWidth: '100%',
              border: '1.5px solid #CBD5E0', borderRadius: '8px',
              padding: '8px 14px', fontSize: '14px', color: TEXT,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      {/* Estado de carga */}
      {cargando && (
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: '60px 24px', textAlign: 'center' }}>
          <div style={{
            width: '32px', height: '32px', border: `3px solid #BEE3F8`, borderTopColor: BLUE,
            borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 16px',
          }} />
          <p style={{ fontSize: '14px', color: GRAY }}>Cargando clientes...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Error */}
      {!cargando && error && (
        <div style={{ backgroundColor: '#FFF5F5', border: `1px solid ${RED}`, borderRadius: '12px', padding: '24px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', color: RED, fontWeight: 600, margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Estado vacío */}
      {!cargando && !error && clientes.length === 0 && (
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: '60px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: '40px', marginBottom: '12px' }}>👥</p>
          <p style={{ fontSize: '15px', fontWeight: 600, color: TEXT, marginBottom: '4px' }}>No hay clientes registrados</p>
          <p style={{ fontSize: '13px', color: GRAY, marginBottom: '20px' }}>Creá el primero para empezar.</p>
          <button
            onClick={() => { window.location.href = '/superadmin/clientes/nuevo'; }}
            style={{ backgroundColor: GREEN, color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 22px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
          >
            Crear primer cliente
          </button>
        </div>
      )}

      {/* Sin resultados de búsqueda */}
      {!cargando && !error && clientes.length > 0 && filtrados.length === 0 && (
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: '40px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', color: GRAY }}>No se encontraron clientes para <strong>"{busqueda}"</strong></p>
        </div>
      )}

      {/* Tabla */}
      {!cargando && !error && filtrados.length > 0 && (
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '900px' }}>
            <thead>
              <tr style={{ backgroundColor: '#EBF4FF' }}>
                {columnas.map((col, i) => (
                  <th key={col} style={{
                    padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: NAVY,
                    borderBottom: `2px solid ${SEPARATOR}`,
                    borderRight: i < columnas.length - 1 ? `1px solid rgba(99,179,237,0.3)` : 'none',
                    whiteSpace: 'nowrap',
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c, idx) => (
                <tr
                  key={c.id}
                  style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#EBF8FF')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#fff' : '#F7FAFC')}
                >
                  <td style={{ padding: '11px 14px', fontWeight: 600, color: TEXT, borderRight: '1px solid rgba(99,179,237,0.15)' }}>
                    {c.nombre_comercial}
                  </td>
                  <td style={{ padding: '11px 14px', color: GRAY, fontFamily: 'monospace', borderRight: '1px solid rgba(99,179,237,0.15)' }}>
                    {c.cuit}
                  </td>
                  <td style={{ padding: '11px 14px', color: GRAY, borderRight: '1px solid rgba(99,179,237,0.15)' }}>
                    {c.rubro || '—'}
                  </td>
                  <td style={{ padding: '11px 14px', borderRight: '1px solid rgba(99,179,237,0.15)' }}>
                    {badgePlan(c.plan)}
                  </td>
                  <td style={{ padding: '11px 14px', borderRight: '1px solid rgba(99,179,237,0.15)' }}>
                    {badgeEstado(c.estado)}
                  </td>
                  <td style={{ padding: '11px 14px', color: GRAY, fontFamily: 'monospace', fontSize: '12px', borderRight: '1px solid rgba(99,179,237,0.15)' }}>
                    {c.codigo_acceso}
                  </td>
                  <td style={{ padding: '11px 14px', color: GRAY, whiteSpace: 'nowrap', borderRight: '1px solid rgba(99,179,237,0.15)' }}>
                    {formatFecha(c.fecha_alta)}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap' }}>
                      <button
                        onClick={() => { window.location.href = `/superadmin/clientes/${c.id}`; }}
                        style={{ backgroundColor: BLUE, color: '#fff', border: 'none', borderRadius: '5px', padding: '4px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                        title="Ver detalle"
                      >
                        👁️ Ver
                      </button>
                      <button
                        onClick={() => { window.location.href = `/superadmin/clientes/${c.id}?editar=1`; }}
                        style={{ backgroundColor: '#fff', color: GRAY, border: '1px solid #CBD5E0', borderRadius: '5px', padding: '4px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                        title="Editar"
                      >
                        ✏️ Editar
                      </button>
                      <button
                        onClick={() => toggleEstado(c.id, c.estado)}
                        style={{
                          backgroundColor: c.estado === 'activo' ? '#FFF5F5' : '#F0FFF4',
                          color: c.estado === 'activo' ? RED : GREEN,
                          border: `1px solid ${c.estado === 'activo' ? RED : GREEN}`,
                          borderRadius: '5px', padding: '4px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                        }}
                        title={c.estado === 'activo' ? 'Suspender' : 'Activar'}
                      >
                        {c.estado === 'activo' ? '🔴 Suspender' : '🟢 Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ClientesRoberto;
