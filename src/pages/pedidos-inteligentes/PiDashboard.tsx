import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import LogoPi from '../../components/pi/LogoPi';
import { API_BASE } from '../../config/api';

// ─── AUTH ─────────────────────────────────────────────────────
function getSession() {
  try {
    const s = localStorage.getItem('pi_session');
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

// ─── TIPOS ───────────────────────────────────────────────────
type SeccionId = 'inicio' | 'nuevo_pedido' | 'pedidos' | 'clientes' | 'productos' | 'configuracion';

const MENU_ITEMS: { id: SeccionId; icon: string; label: string }[] = [
  { id: 'inicio',        icon: '🏠', label: 'Inicio'         },
  { id: 'nuevo_pedido',  icon: '📋', label: 'Nuevo pedido'   },
  { id: 'pedidos',       icon: '📦', label: 'Pedidos'        },
  { id: 'clientes',      icon: '👥', label: 'Clientes'       },
  { id: 'productos',     icon: '🛒', label: 'Productos'      },
  { id: 'configuracion', icon: '⚙️', label: 'Configuración'  },
];

// ─── CARD MÉTRICA ─────────────────────────────────────────────
function CardMetrica({ icon, label, valor, color }: { icon: string; label: string; valor: string | number; color: string }) {
  return (
    <div style={{
      backgroundColor: '#fff', borderRadius: '12px', padding: '20px 22px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.07)', borderLeft: `4px solid ${color}`,
      flex: 1, minWidth: '140px',
    }}>
      <div style={{ fontSize: '24px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontSize: '26px', fontWeight: 800, color, marginBottom: '4px' }}>{valor}</div>
      <div style={{ fontSize: '12px', color: '#718096', fontWeight: 500 }}>{label}</div>
    </div>
  );
}

// ─── CONTENIDO INICIO ────────────────────────────────────────
function SeccionInicio() {
  const [statsP, setStatsP] = useState<any>(null);
  const [statsC, setStatsC] = useState<any>(null);
  const [statsD, setStatsD] = useState<any>(null);

  const cargarStats = useCallback(async () => {
    try {
      const token = (() => {
        try { const s = localStorage.getItem('pi_session'); return s ? JSON.parse(s).token : ''; } catch { return ''; }
      })();
      const h = { 'x-pi-token': token };
      const [rp, rc, rd] = await Promise.all([
        fetch(`${API_BASE}/api/pi/importar/productos/stats`, { headers: h }),
        fetch(`${API_BASE}/api/pi/importar/clientes/stats`,  { headers: h }),
        fetch(`${API_BASE}/api/pi/pedidos?limit=1`,          { headers: h }),
      ]);
      if (rp.ok) setStatsP(await rp.json());
      if (rc.ok) setStatsC(await rc.json());
      if (rd.ok) { const d = await rd.json(); if (d.stats) setStatsD(d.stats); }
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { cargarStats(); }, [cargarStats]);

  return (
    <div>
      <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700, color: '#1B2A4A' }}>
        Resumen del día
      </h2>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '32px' }}>
        <CardMetrica icon="📋" label="Pedidos hoy"        valor={statsD ? String(statsD.hoy)           : '…'} color="#2B6CB0" />
        <CardMetrica icon="⏳" label="Pendientes preparar" valor={statsD ? String(statsD.pendientes)    : '…'} color="#DD6B20" />
        <CardMetrica icon="👥" label="Clientes activos"   valor={statsC ? String(statsC.total)         : '…'} color="#38A169" />
        <CardMetrica icon="🛒" label="Productos cargados" valor={statsP ? String(statsP.total)         : '…'} color="#718096" />
      </div>
    </div>
  );
}

// ─── PLACEHOLDER SECCIONES ────────────────────────────────────
function SeccionPlaceholder({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚧</div>
        <p style={{ color: '#718096', fontSize: '15px', margin: 0 }}>{label} — próximamente</p>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────
function PiDashboard() {
  const navigate = useNavigate();
  const [session, setSession] = useState<ReturnType<typeof getSession>>(null);
  const [seccion, setSeccion] = useState<SeccionId>('inicio');

  useEffect(() => {
    const s = getSession();
    if (!s?.token) { navigate('/pedidos-inteligentes/login'); return; }
    setSession(s);
  }, [navigate]);

  const cerrarSesion = () => {
    localStorage.removeItem('pi_session');
    navigate('/pedidos-inteligentes/login');
  };

  if (!session) return null;

  const seccionActual = MENU_ITEMS.find(m => m.id === seccion);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* HEADER fijo */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        backgroundColor: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 24px', height: '60px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <LogoPi size="sm" showText={false} />
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#1B2A4A' }}>
            Sistema de Pedidos Inteligentes
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/pedidos-inteligentes/nuevo-pedido')}
            style={{ padding: '7px 16px', backgroundColor: '#2B6CB0', color: '#fff', border: 'none',
              borderRadius: '7px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
            ＋ Nuevo pedido
          </button>
          <span style={{ fontSize: '13px', color: '#718096' }}>
            {session.usuario?.nombre || session.usuario?.email}
          </span>
          <button onClick={cerrarSesion}
            style={{ padding: '7px 14px', border: '1px solid #CBD5E0', borderRadius: '7px',
              background: '#fff', cursor: 'pointer', fontSize: '12px', color: '#718096', fontWeight: 600 }}>
            Salir
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', paddingTop: '60px', height: '100vh' }}>
        {/* SIDEBAR */}
        <nav style={{
          width: '220px', backgroundColor: '#1B2A4A', flexShrink: 0,
          overflowY: 'auto', paddingTop: '16px',
          position: 'fixed', top: '60px', bottom: 0, left: 0,
        }}>
          {MENU_ITEMS.map((item, idx) => (
            <React.Fragment key={item.id}>
              <button onClick={() => {
                  if (item.id === 'productos')   { navigate('/pedidos-inteligentes/productos');  return; }
                  if (item.id === 'clientes')    { navigate('/pedidos-inteligentes/clientes');   return; }
                  if (item.id === 'nuevo_pedido') { navigate('/pedidos-inteligentes/nuevo-pedido'); return; }
                  if (item.id === 'pedidos')       { navigate('/pedidos-inteligentes/pedidos');       return; }
                  if (item.id === 'configuracion') { navigate('/pedidos-inteligentes/configuracion'); return; }
                  setSeccion(item.id);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  width: '100%', padding: '12px 20px', border: 'none', cursor: 'pointer',
                  fontSize: '13px', fontWeight: seccion === item.id ? 700 : 400,
                  backgroundColor: seccion === item.id ? 'rgba(99,179,237,0.15)' : 'transparent',
                  color: seccion === item.id ? '#63B3ED' : 'rgba(255,255,255,0.8)',
                  textAlign: 'left', borderRight: seccion === item.id ? '3px solid #63B3ED' : '3px solid transparent',
                  transition: 'all 0.15s',
                }}>
                <span style={{ fontSize: '16px' }}>{item.icon}</span>
                {item.label}
              </button>
              {idx < MENU_ITEMS.length - 1 && (
                <div style={{ height: '1px', backgroundColor: '#63B3ED', opacity: 0.15, margin: '0 16px' }} />
              )}
            </React.Fragment>
          ))}
        </nav>

        {/* CONTENIDO PRINCIPAL */}
        <main style={{
          marginLeft: '220px', flex: 1, backgroundColor: '#F4F6F9',
          padding: '28px', overflowY: 'auto', minHeight: 'calc(100vh - 60px)',
        }}>
          {seccion === 'inicio'       && <SeccionInicio />}
          {seccion !== 'inicio'       && <SeccionPlaceholder label={seccionActual?.label ?? seccion} />}
        </main>
      </div>
    </div>
  );
}

export default PiDashboard;
