import React, { useEffect, useState } from 'react';
import LogoRCH from '../../components/superadmin/LogoRCH';
import ClientesRoberto from './clientes/ClientesRoberto';
import GestionClaves from '../roberto/configuracion/GestionClaves';

type Pagina = 'inicio' | 'clientes' | 'claves' | 'configuracion';

const menuItems: { icon: string; label: string; key: Pagina }[] = [
  { icon: '🏠', label: 'Inicio', key: 'inicio' },
  { icon: '👥', label: 'Clientes', key: 'clientes' },
  { icon: '🔐', label: 'Gestión de claves', key: 'claves' },
  { icon: '⚙️', label: 'Configuración', key: 'configuracion' },
];

const SIDEBAR_COLOR = '#1B2A4A';
const ACTIVE_COLOR = '#2B6CB0';
const SEPARATOR_COLOR = '#63B3ED';

function SuperAdminDashboard() {
  const [sesion, setSesion] = useState<any>(null);
  const [pagina, setPagina] = useState<Pagina>(
    window.location.pathname.includes('/clientes') ? 'clientes' : 'inicio'
  );
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem('superadmin_session');
    if (!raw) { window.location.href = '/superadmin/login'; return; }
    try { setSesion(JSON.parse(raw)); } catch { window.location.href = '/superadmin/login'; }
  }, []);

  const cerrarSesion = () => {
    localStorage.removeItem('superadmin_session');
    window.location.href = '/superadmin/login';
  };

  if (!sesion) return null;

  const titulos: Record<Pagina, string> = {
    inicio: 'Resumen general',
    clientes: 'Clientes',
    claves: 'Gestión de claves',
    configuracion: 'Configuración',
  };

  const renderContenido = () => {
    switch (pagina) {
      case 'clientes':
        return <ClientesRoberto />;
      case 'claves':
        return <GestionClaves />;
      case 'configuracion':
        return (
          <div style={{ padding: '28px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#2D3748', marginBottom: '20px' }}>
              ⚙️ Datos del SuperAdmin
            </h2>
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: '24px', maxWidth: '420px' }}>
              {[
                { label: 'Nombre', value: sesion.usuario?.nombre },
                { label: 'CUIT', value: sesion.usuario?.cuit },
                { label: 'Email', value: sesion.usuario?.email },
                { label: 'Rol', value: sesion.usuario?.rol },
              ].map(item => (
                <div key={item.label} style={{ marginBottom: '16px', borderBottom: '1px solid #EDF2F7', paddingBottom: '12px' }}>
                  <p style={{ fontSize: '11px', color: '#718096', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.label}</p>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: '#2D3748' }}>{item.value || '—'}</p>
                </div>
              ))}
            </div>
          </div>
        );
      default:
        return (
          <div style={{ padding: '28px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#2D3748', marginBottom: '24px' }}>
              Resumen general
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
              {[
                { label: 'Total clientes', value: '0', color: '#2B6CB0', border: '#2B6CB0' },
                { label: 'Clientes activos', value: '0', color: '#38A169', border: '#38A169' },
                { label: 'Clientes suspendidos', value: '0', color: '#E53E3E', border: '#E53E3E' },
                { label: 'Ingresos del mes', value: '$0', color: '#63B3ED', border: '#63B3ED' },
              ].map(card => (
                <div
                  key={card.label}
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: '12px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    padding: '20px',
                    borderLeft: `4px solid ${card.border}`,
                  }}
                >
                  <p style={{ fontSize: '12px', color: '#718096', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{card.label}</p>
                  <p style={{ fontSize: '32px', fontWeight: 700, color: card.color }}>{card.value}</p>
                </div>
              ))}
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: '24px' }}>
              <p style={{ color: '#718096', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
                Panel SuperAdmin operativo. Los módulos se completarán en las próximas fases.
              </p>
            </div>
          </div>
        );
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#F4F6F9' }}>
      {/* HEADER */}
      <header style={{
        backgroundColor: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        padding: '0 24px',
        height: '60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => setMenuAbierto(!menuAbierto)}
            style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#2D3748' }}
            className="mobile-menu-btn"
          >
            ☰
          </button>
          <h1 style={{ fontSize: '16px', fontWeight: 700, color: '#2D3748' }}>
            {titulos[pagina]}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#2D3748' }}>
            {sesion.usuario?.nombre}
          </span>
          <button
            onClick={cerrarSesion}
            style={{
              backgroundColor: '#E53E3E',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1 }}>
        {/* SIDEBAR */}
        <aside style={{
          width: '220px',
          backgroundColor: SIDEBAR_COLOR,
          minHeight: 'calc(100vh - 60px)',
          padding: '24px 0',
          flexShrink: 0,
        }}>
          <div style={{ padding: '0 20px 20px', display: 'flex', justifyContent: 'center' }}>
            <LogoRCH />
          </div>

          <div style={{ height: '2px', backgroundColor: SEPARATOR_COLOR, margin: '0 16px 20px' }} />

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '0 12px' }}>
            {menuItems.map(item => (
              <button
                key={item.key}
                onClick={() => { setPagina(item.key); setMenuAbierto(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: pagina === item.key ? ACTIVE_COLOR : 'transparent',
                  color: pagina === item.key ? '#fff' : '#BEE3F8',
                  fontSize: '14px',
                  fontWeight: pagina === item.key ? 600 : 400,
                  textAlign: 'left',
                  width: '100%',
                  transition: 'background-color 0.15s',
                }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* CONTENIDO */}
        <main style={{ flex: 1, overflow: 'auto' }}>
          {renderContenido()}
        </main>
      </div>
    </div>
  );
}

export default SuperAdminDashboard;
