import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { API_BASE } from '../../config/api';

const NAVY  = '#1B2A4A';
const BLUE  = '#2B6CB0';
const GREEN = '#38A169';
const RED   = '#E53E3E';
const SEP   = '#63B3ED';
const GRAY  = '#718096';
const TEXT  = '#2D3748';
const BG    = '#F4F6F9';

// ─── TIPOS ───────────────────────────────────────────────────
interface UltimaVenta {
  id: number;
  numero: number;
  numero_completo: string;
  comprador_nombre: string;
  total: number;
  estado: string;
  fecha: string;
}

interface ChequePendiente {
  id: number;
  numero: string;
  banco: string;
  titular_nombre: string;
  monto: number;
  fecha_cobro: string;
  tipo: string;
}

interface Sesion {
  token: string;
  cliente: {
    id: number;
    nombre_comercial: string;
    plan: string;
    codigo_acceso: string;
    mayorista_id: number;
  };
  modulos: Record<string, boolean>;
}

interface MetricCard {
  icon: string;
  label: string;
  valor: string | number;
  color: string;
  link: string;
}

// ─── SIDEBAR CONFIG ───────────────────────────────────────────
const MENU_ITEMS = [
  { id: 'inicio',        icon: '🏠', label: 'Inicio',           flag: null },
  { id: 'productos',     icon: '📦', label: 'Productos',         flag: null },
  { id: 'ventas',        icon: '💰', label: 'Ventas',            flag: 'ventas' },
  { id: 'presupuestos',  icon: '📋', label: 'Presupuestos',      flag: 'cotizaciones' },
  { id: 'remitos',       icon: '🚚', label: 'Remitos',           flag: 'remitos' },
  { id: 'stock',         icon: '📊', label: 'Stock',             flag: 'stock' },
  { id: 'clientes',      icon: '👥', label: 'Clientes',          flag: null },
  { id: 'proveedores',   icon: '🏢', label: 'Proveedores',       flag: null },
  { id: 'cuentacorriente',icon: '💳',label: 'Cuenta Corriente',  flag: null },
  { id: 'compras',       icon: '🛒', label: 'Compras',           flag: 'compras' },
  { id: 'caja',          icon: '🏦', label: 'Caja',              flag: 'habilitar_caja' },
  { id: 'cheques',       icon: '🧾', label: 'Cheques',           flag: 'habilitar_cheques' },
  { id: 'notas',         icon: '📄', label: 'NC/ND',             flag: null },
  { id: 'facturacion',   icon: '🧾', label: 'Facturación',       flag: 'arca' },
  { id: 'gastos',        icon: '💸', label: 'Gastos',             flag: null },
  { id: 'reportes',      icon: '📈', label: 'Reportes',          flag: null },
  { id: 'configuracion', icon: '⚙️', label: 'Configuración',     flag: null },
];

// ─── LOGO ────────────────────────────────────────────────────
const LogoRCH = ({ size = 28 }: { size?: number }) => (
  <svg viewBox="0 0 80 80" width={size} height={size} style={{ display: 'block' }}>
    <circle cx="15" cy="15" r="11" fill={NAVY} />
    <circle cx="40" cy="15" r="11" fill={SEP} />
    <circle cx="65" cy="15" r="11" fill={SEP} />
    <circle cx="27" cy="40" r="11" fill={SEP} />
    <circle cx="52" cy="40" r="11" fill={NAVY} />
    <circle cx="15" cy="65" r="11" fill={NAVY} />
    <circle cx="40" cy="65" r="11" fill={NAVY} />
    <circle cx="65" cy="65" r="11" fill={SEP} />
  </svg>
);

// ─── PANTALLA EN CONSTRUCCIÓN ─────────────────────────────────
function PantallaEnConstruccion({ nombre, icon, onDashboard }: { nombre: string; icon: string; onDashboard: () => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: BG }}>
      <div style={{ textAlign: 'center', maxWidth: '380px' }}>
        <div style={{ fontSize: '52px', marginBottom: '16px' }}>{icon}</div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>{nombre}</h2>
        <p style={{ fontSize: '14px', color: GRAY, margin: '0 0 24px' }}>Este módulo está en desarrollo.</p>
        <button onClick={onDashboard}
          style={{ backgroundColor: BLUE, color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 22px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
          ← Ver Dashboard
        </button>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────
function RobertoDashboard() {
  const navigate = useNavigate();
  const [sesion,           setSesion]          = useState<Sesion | null>(null);
  const [seccion,          setSeccion]         = useState('inicio');
  const [metricas,         setMetricas]        = useState<MetricCard[]>([]);
  const [sidebar,          setSidebar]         = useState(true);
  const [ultimasVentas,    setUltimasVentas]   = useState<UltimaVenta[]>([]);
  const [chequesPend,      setChequesPend]     = useState<ChequePendiente[]>([]);
  const [filtroCheques,    setFiltroCheques]   = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('roberto_portal_session');
      if (!raw) { window.location.href = '/roberto/login'; return; }
      const s: Sesion = JSON.parse(raw);
      if (!s.token) { window.location.href = '/roberto/login'; return; }
      setSesion(s);
      cargarMetricas(s);
    } catch {
      window.location.href = '/roberto/login';
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cargarMetricas = useCallback(async (s: Sesion) => {
    let data: any = {};
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/portal/dashboard/${s.cliente.id}`, {
        headers: { 'x-roberto-token': s.token },
      });
      if (r.ok) data = await r.json();
    } catch { /* degradación elegante: muestra 0 si el endpoint falla */ }

    const fmt = (n: number) => `$${Number(n).toLocaleString('es-AR')}`;

    setMetricas([
      { icon: '💰', label: 'Ventas hoy',        valor: data.ventas_hoy_monto     != null ? fmt(data.ventas_hoy_monto)    : '$0', color: GREEN,     link: 'ventas' },
      { icon: '📦', label: 'Productos activos',  valor: data.productos_activos    ?? 0,                                          color: BLUE,      link: 'productos' },
      { icon: '⚠️', label: 'Stock bajo mínimo', valor: data.stock_bajo_minimo    ?? 0,                                          color: '#E67E22', link: 'stock' },
      { icon: '💳', label: 'Cobros pendientes',  valor: data.cobros_pendientes    != null ? fmt(data.cobros_pendientes)   : '$0', color: RED,       link: 'cuentacorriente' },
    ]);

    if (Array.isArray(data.ultimas_ventas))   setUltimasVentas(data.ultimas_ventas);
    if (Array.isArray(data.cheques_pendientes)) setChequesPend(data.cheques_pendientes);

    const filtroGuardado = localStorage.getItem(`dashboard_cheques_filtro_${s.cliente.id}`);
    setFiltroCheques(filtroGuardado ? Number(filtroGuardado) : null);
  }, []);

  const cerrarSesion = () => {
    localStorage.removeItem('roberto_portal_session');
    window.location.href = '/roberto/login';
  };

  if (!sesion) return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ width: '32px', height: '32px', border: `3px solid #BEE3F8`, borderTopColor: BLUE, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    </div>
  );

  const modulos = sesion.modulos || {};
  const menuVisible = MENU_ITEMS.filter(m => m.flag === null || !!modulos[m.flag]);

  const RUTAS: Record<string, string> = {
    configuracion:    '/roberto/config',
    productos:        '/roberto/productos',
    ventas:           '/roberto/ventas',
    stock:            '/roberto/stock',
    clientes:         '/roberto/clientes',
    presupuestos:     '/roberto/presupuestos',
    remitos:          '/roberto/remitos',
    compras:          '/roberto/compras',
    proveedores:      '/roberto/proveedores',
    gastos:           '/roberto/gastos',
    cuentacorriente:  '/roberto/cuenta-corriente',
    caja:             '/roberto/caja',
    cheques:          '/roberto/cheques',
    notas:            '/roberto/notas',
    facturacion:      '/roberto/arca',
    reportes:         '/roberto/reportes',
  };

  const irA = (id: string) => {
    if (RUTAS[id]) { navigate(RUTAS[id]); return; }
    setSeccion(id);
  };

  // ── CONTENIDO INICIO ─────────────────────────────────────
  const ContenidoInicio = () => (
    <div style={{ padding: '28px', flex: 1 }}>
      <h2 style={{ fontSize: '18px', fontWeight: 700, color: NAVY, margin: '0 0 6px' }}>
        Bienvenido, {sesion.cliente.nombre_comercial}
      </h2>
      <p style={{ fontSize: '13px', color: GRAY, margin: '0 0 24px' }}>
        Plan {sesion.cliente.plan} · Resumen del día
      </p>

      {/* Fila 1: 4 cards métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {metricas.map(m => (
          <div key={m.label}
            style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '20px', borderLeft: `4px solid ${m.color}`, cursor: 'pointer' }}
            onClick={() => irA(m.link)}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; }}
          >
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>{m.icon}</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: m.color, marginBottom: '4px' }}>{m.valor}</div>
            <div style={{ fontSize: '12px', color: GRAY, fontWeight: 500 }}>{m.label}</div>
            <button onClick={e => { e.stopPropagation(); irA(m.link); }}
              style={{ marginTop: '10px', fontSize: '11px', color: BLUE, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>
              Ver detalle →
            </button>
          </div>
        ))}
      </div>

      {/* Fila 2: 2 cards grandes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Últimas ventas */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `2px solid ${SEP}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: NAVY, margin: 0 }}>💰 Últimas ventas del día</h3>
            <button onClick={() => navigate('/roberto/ventas')}
              style={{ fontSize: '11px', color: BLUE, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              Ver todas →
            </button>
          </div>
          <div style={{ padding: '16px 20px' }}>
            {ultimasVentas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: GRAY, fontSize: '13px' }}>
                No hay ventas registradas hoy.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>
                    {['#', 'Cliente', 'Total', 'Estado'].map((h, i) => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: GRAY, fontWeight: 600, fontSize: '11px', borderBottom: '1px solid #EDF2F7', paddingLeft: i === 0 ? 0 : '8px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ultimasVentas.map((v, i) => {
                    const badgeColor =
                      v.estado === 'pagada'   ? { bg: '#C6F6D5', text: '#276749' } :
                      v.estado === 'anulada'  ? { bg: '#FED7D7', text: '#9B2C2C' } :
                                                { bg: '#FEFCBF', text: '#744210' };
                    return (
                      <tr key={v.id} style={{ backgroundColor: i % 2 === 0 ? '#F7FAFC' : '#fff' }}>
                        <td style={{ padding: '8px 0', color: GRAY, fontSize: '12px' }}>{v.numero_completo || v.numero}</td>
                        <td style={{ padding: '8px', color: TEXT, fontWeight: 500 }}>{v.comprador_nombre || '—'}</td>
                        <td style={{ padding: '8px', color: GREEN, fontWeight: 600 }}>${Number(v.total).toLocaleString('es-AR')}</td>
                        <td style={{ padding: '8px' }}>
                          <span style={{ fontSize: '11px', color: badgeColor.text, backgroundColor: badgeColor.bg, borderRadius: '12px', padding: '2px 8px' }}>
                            {v.estado}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Cheques a vencer */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `2px solid ${SEP}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: NAVY, margin: 0 }}>🧾 Cheques a vencer (7 días)</h3>
            <button onClick={() => irA('cheques')}
              style={{ fontSize: '11px', color: BLUE, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              Ver todos →
            </button>
          </div>
          <div style={{ padding: '16px 20px' }}>
            {modulos.habilitar_cheques ? (() => {
              const hoy = new Date();
              const limite = filtroCheques
                ? new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + filtroCheques)
                : null;
              const visibles = limite
                ? chequesPend.filter(c => new Date(c.fecha_cobro) <= limite)
                : chequesPend;

              const guardarFiltro = (dias: number | null) => {
                if (sesion) {
                  if (dias === null) localStorage.removeItem(`dashboard_cheques_filtro_${sesion.cliente.id}`);
                  else localStorage.setItem(`dashboard_cheques_filtro_${sesion.cliente.id}`, String(dias));
                }
                setFiltroCheques(dias);
              };

              return (
                <>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                    {([null, 7, 15, 30] as (number | null)[]).map(d => (
                      <button key={String(d)} onClick={() => guardarFiltro(d)}
                        style={{
                          fontSize: '11px', padding: '3px 10px', borderRadius: '12px', border: '1px solid',
                          cursor: 'pointer', fontWeight: 600,
                          backgroundColor: filtroCheques === d ? NAVY : '#EDF2F7',
                          color:           filtroCheques === d ? '#fff' : GRAY,
                          borderColor:     filtroCheques === d ? NAVY : '#CBD5E0',
                        }}>
                        {d === null ? 'Todos' : `${d} días`}
                      </button>
                    ))}
                  </div>
                  {visibles.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '16px 0', color: GRAY, fontSize: '13px' }}>
                      No hay cheques pendientes.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr>
                          {['Número', 'Banco', 'Monto', 'Vencimiento'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '4px 6px', color: GRAY, fontWeight: 600, fontSize: '11px', borderBottom: '1px solid #EDF2F7' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visibles.map((c, i) => {
                          const dias = Math.ceil((new Date(c.fecha_cobro).getTime() - hoy.getTime()) / 86400000);
                          const vencido = dias < 0;
                          return (
                            <tr key={c.id} style={{ backgroundColor: i % 2 === 0 ? '#F7FAFC' : '#fff' }}>
                              <td style={{ padding: '6px', color: TEXT, fontWeight: 500 }}>{c.numero}</td>
                              <td style={{ padding: '6px', color: GRAY }}>{c.banco}</td>
                              <td style={{ padding: '6px', color: GREEN, fontWeight: 600 }}>${Number(c.monto).toLocaleString('es-AR')}</td>
                              <td style={{ padding: '6px' }}>
                                <span style={{ fontSize: '11px' }}>
                                  {new Date(c.fecha_cobro).toLocaleDateString('es-AR')}
                                </span>
                                {vencido && (
                                  <span style={{ marginLeft: '4px', fontSize: '10px', color: RED, fontWeight: 700 }}>VENCIDO</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </>
              );
            })() : (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <p style={{ fontSize: '13px', color: GRAY, margin: '0 0 12px' }}>Módulo de cheques no habilitado.</p>
                <span style={{ fontSize: '11px', color: BLUE, fontWeight: 600 }}>Consultá con tu administrador para activarlo.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // ── RENDER SECCIÓN ACTUAL ─────────────────────────────────
  const renderSeccion = () => {
    if (seccion === 'inicio') return <ContenidoInicio />;
    const item = MENU_ITEMS.find(m => m.id === seccion);
    return <PantallaEnConstruccion nombre={item?.label || seccion} icon={item?.icon || '📄'} onDashboard={() => setSeccion('inicio')} />;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── HEADER FIJO ──────────────────────────────────────── */}
      <header style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '56px', backgroundColor: '#fff', borderBottom: '1px solid #EDF2F7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', zIndex: 100, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => setSidebar(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: GRAY, padding: '4px' }}>
            ☰
          </button>
          <LogoRCH size={28} />
          <span style={{ fontSize: '13px', fontWeight: 700, color: NAVY }}>RCH SaaS</span>
        </div>

        <h1 style={{ fontSize: '15px', fontWeight: 700, color: NAVY, margin: 0, flex: 1, textAlign: 'center' }}>
          {sesion.cliente.nombre_comercial}
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {modulos.notificaciones && (
            <button title="Notificaciones"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', position: 'relative', padding: '4px' }}>
              🔔
              <span style={{ position: 'absolute', top: 0, right: 0, width: '8px', height: '8px', backgroundColor: RED, borderRadius: '50%', border: '2px solid #fff' }} />
            </button>
          )}
          <button onClick={() => navigate('/roberto/config')} title="Configuración"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', padding: '4px' }}>
            ⚙️
          </button>
          <button onClick={cerrarSesion}
            style={{ backgroundColor: '#EDF2F7', color: GRAY, border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            Salir
          </button>
        </div>
      </header>

      {/* ── CONTENIDO BAJO HEADER ────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, marginTop: '56px' }}>

        {/* ── SIDEBAR ────────────────────────────────────────── */}
        {sidebar && (
          <aside style={{ width: '220px', backgroundColor: NAVY, minHeight: 'calc(100vh - 56px)', position: 'fixed', top: '56px', left: 0, bottom: 0, overflowY: 'auto', zIndex: 50, flexShrink: 0 }}>
            <nav style={{ padding: '12px 0' }}>
              {menuVisible.map(item => {
                const activo = seccion === item.id;
                return (
                  <button key={item.id} onClick={() => irA(item.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      width: '100%', padding: '11px 20px', border: 'none', cursor: 'pointer',
                      backgroundColor: activo ? BLUE : 'transparent',
                      color: activo ? '#fff' : '#BEE3F8',
                      fontSize: '13px', fontWeight: activo ? 700 : 400,
                      textAlign: 'left', borderLeft: activo ? `3px solid ${SEP}` : '3px solid transparent',
                      transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={e => { if (!activo) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.07)'; }}
                    onMouseLeave={e => { if (!activo) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <span style={{ fontSize: '16px', lineHeight: 1, flexShrink: 0 }}>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '8px' }}>
              <p style={{ fontSize: '10px', color: 'rgba(190,227,248,0.5)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Plan</p>
              <p style={{ fontSize: '12px', color: '#BEE3F8', margin: '2px 0 0', fontWeight: 600 }}>{sesion.cliente.plan}</p>
            </div>
          </aside>
        )}

        {/* ── ÁREA PRINCIPAL ───────────────────────────────────── */}
        <main style={{ flex: 1, marginLeft: sidebar ? '220px' : 0, backgroundColor: BG, display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 56px)', transition: 'margin-left 0.2s' }}>
          {renderSeccion()}
        </main>
      </div>
    </div>
  );
}

export default RobertoDashboard;
