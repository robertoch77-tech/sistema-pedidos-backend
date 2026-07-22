import React, { useEffect, useState } from 'react';

import { API_BASE } from '../../config/api';

const BLUE  = '#2B6CB0';
const NAVY  = '#1B2A4A';
const GREEN = '#38A169';
const RED   = '#E53E3E';
const GRAY  = '#718096';
const TEXT  = '#2D3748';

const LogoRCH = ({ size = 36 }: { size?: number }) => (
  <svg viewBox="0 0 80 80" width={size} height={size} style={{ display: 'block' }}>
    <circle cx="15" cy="15" r="11" fill={NAVY} />
    <circle cx="40" cy="15" r="11" fill={BLUE} />
    <circle cx="65" cy="15" r="11" fill={BLUE} />
    <circle cx="27" cy="40" r="11" fill={BLUE} />
    <circle cx="52" cy="40" r="11" fill={NAVY} />
    <circle cx="15" cy="65" r="11" fill={NAVY} />
    <circle cx="40" cy="65" r="11" fill={NAVY} />
    <circle cx="65" cy="65" r="11" fill={BLUE} />
  </svg>
);

interface PortalData {
  nombre_comercial: string;
  plan: string;
  cliente_id: number;
  mayorista_id: number;
  habilitar_mensajes: boolean;
  habilitar_notificaciones: boolean;
  habilitar_banners: boolean;
  habilitar_analiticas: boolean;
  habilitar_ctas_ctes: boolean;
  habilitar_cotizaciones: boolean;
  habilitar_sucursales: boolean;
  habilitar_empleados: boolean;
  arca_habilitado: boolean;
  habilitar_cheques:  boolean;
  habilitar_caja:     boolean;
  habilitar_ventas:   boolean;
  habilitar_remitos:  boolean;
  habilitar_stock:    boolean;
  habilitar_compras:  boolean;
  habilitar_autos:            boolean;
  habilitar_cc_proveedores:   boolean;
  habilitar_catalogo:         boolean;
}

function RobertoLogin() {
  const params   = new URLSearchParams(window.location.search);
  const codigo   = params.get('m') || '';

  const [portal,      setPortal]      = useState<PortalData | null>(null);
  const [cargando,    setCargando]    = useState(true);
  const [clave,       setClave]       = useState('');
  const [enviando,    setEnviando]    = useState(false);
  const [error,       setError]       = useState('');
  const [mostrarClave, setMostrarClave] = useState(false);

  useEffect(() => {
    if (!codigo) { window.location.href = '/login'; return; }

    fetch(`${API_BASE}/api/superadmin/portal/${codigo}`)
      .then(r => {
        if (r.status === 403 || r.status === 404) {
          window.location.href = `/?m=${codigo}`;
          return null;
        }
        return r.json();
      })
      .then(data => {
        if (!data) return;
        if (data.tipo_fuente !== 'roberto') {
          window.location.href = `/?m=${codigo}`;
          return;
        }
        setPortal(data);
        setCargando(false);
      })
      .catch(() => {
        window.location.href = `/?m=${codigo}`;
      });
  }, [codigo]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clave.trim()) { setError('Ingresá tu clave'); return; }
    setEnviando(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/superadmin/portal-auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo, clave }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'Error al ingresar');

      // Guardar datos del negocio para comprobantes
      localStorage.setItem(`roberto_config_${data.cliente.id}`, JSON.stringify({
        nombre_comercial: data.cliente.nombre_comercial || '',
        razon_social:     data.cliente.razon_social     || '',
        cuit:             data.cliente.cuit             || '',
        condicion_iva:    data.cliente.condicion_iva    || '',
        direccion:        data.cliente.direccion        || '',
        ciudad:           data.cliente.ciudad           || '',
        provincia:        data.cliente.provincia        || '',
        telefono:         data.cliente.telefono         || '',
        whatsapp:         data.cliente.whatsapp         || '',
      }));

      localStorage.setItem('roberto_portal_session', JSON.stringify({
        token:   data.token,
        cliente: data.cliente,
        modulos: {
          mensajes:       portal?.habilitar_mensajes       ?? false,
          notificaciones: portal?.habilitar_notificaciones ?? false,
          banners:        portal?.habilitar_banners        ?? false,
          analiticas:     portal?.habilitar_analiticas     ?? false,
          ctas_ctes:      portal?.habilitar_ctas_ctes      ?? false,
          cotizaciones:   portal?.habilitar_cotizaciones   ?? false,
          habilitar_cheques: portal?.habilitar_cheques     ?? false,
          habilitar_caja:    portal?.habilitar_caja        ?? false,
          ventas:            portal?.habilitar_ventas      ?? false,
          remitos:           portal?.habilitar_remitos     ?? false,
          stock:             portal?.habilitar_stock       ?? false,
          compras:           portal?.habilitar_compras  ?? false,
          autos:             portal?.habilitar_autos          ?? false,
          cc_proveedores:    portal?.habilitar_cc_proveedores ?? false,
          catalogo:          portal?.habilitar_catalogo       ?? false,
          sucursales:     data.cliente.habilitar_sucursales,
          empleados:      data.cliente.habilitar_empleados,
          arca:           data.cliente.arca_habilitado,
        },
      }));

      window.location.href = '/roberto/dashboard';
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F4F6F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '36px', height: '36px', border: `3px solid #BEE3F8`, borderTopColor: BLUE, borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />
        <p style={{ color: GRAY, fontSize: '14px' }}>Verificando acceso...</p>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F4F6F9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '18px', boxShadow: '0 4px 24px rgba(0,0,0,0.10)', width: '100%', maxWidth: '400px', padding: '40px 36px' }}>

        {/* Logo + título */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
            <LogoRCH size={48} />
          </div>
          <p style={{ fontSize: '11px', fontWeight: 600, color: GRAY, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px' }}>
            SaaS de Gestión Comercial
          </p>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: NAVY, margin: '0 0 4px' }}>
            {portal?.nombre_comercial}
          </h1>
          <p style={{ fontSize: '13px', color: GRAY, margin: 0 }}>Ingresá con tu clave</p>
        </div>

        <div style={{ height: '2px', backgroundColor: '#EDF2F7', marginBottom: '24px' }} />

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: TEXT, marginBottom: '6px' }}>
              Clave de acceso
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={mostrarClave ? 'text' : 'password'}
                value={clave}
                onChange={e => { setClave(e.target.value); setError(''); }}
                autoFocus
                placeholder="••••••••"
                style={{
                  width: '100%', border: `1.5px solid ${error ? RED : '#CBD5E0'}`,
                  borderRadius: '9px', padding: '11px 44px 11px 14px',
                  fontSize: '15px', color: TEXT, outline: 'none',
                  boxSizing: 'border-box', letterSpacing: '2px',
                }}
              />
              <button
                type="button"
                onClick={() => setMostrarClave(v => !v)}
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: GRAY }}
              >
                {mostrarClave ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {error && (
            <div style={{ backgroundColor: '#FFF5F5', border: `1px solid ${RED}`, borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: RED, fontWeight: 500 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={enviando}
            style={{
              width: '100%', backgroundColor: enviando ? '#90CDF4' : BLUE,
              color: '#fff', border: 'none', borderRadius: '10px',
              padding: '13px', fontSize: '15px', fontWeight: 700,
              cursor: enviando ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s',
            }}
          >
            {enviando ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '12px', color: GRAY, marginTop: '20px' }}>
          ¿Olvidaste tu clave? Contactá a tu administrador.
        </p>

        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #EDF2F7', textAlign: 'center' }}>
          <span style={{ fontSize: '11px', color: '#BEE3F8', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <LogoRCH size={14} />
            <span style={{ color: GRAY }}>Gestionado por RCH SaaS</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default RobertoLogin;
