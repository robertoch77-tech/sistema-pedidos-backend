import React, { useState } from 'react';
import LogoRCH from '../../components/superadmin/LogoRCH';

const API = 'https://sistema-pedidos-backend-2hec.onrender.com';

function SuperAdminLogin() {
  const [cuit, setCuit] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (cuit.length < 6) {
      setError('El CUIT debe tener al menos 6 dígitos');
      return;
    }
    setCargando(true);
    try {
      const res = await fetch(`${API}/api/superadmin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuit, clave }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'Error al iniciar sesión');
      localStorage.setItem('superadmin_session', JSON.stringify(data));
      window.location.href = '/superadmin/dashboard';
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#1B2A4A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
          width: '100%',
          maxWidth: '380px',
          padding: '40px 36px 36px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '28px' }}>
          <LogoRCH />
        </div>

        <h2
          style={{
            textAlign: 'center',
            fontSize: '16px',
            fontWeight: 600,
            color: '#2D3748',
            marginBottom: '24px',
          }}
        >
          Acceso SuperAdmin
        </h2>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#718096', marginBottom: '6px' }}>
              CUIT
            </label>
            <input
              type="text"
              value={cuit}
              onChange={e => setCuit(e.target.value.replace(/\D/g, '').slice(0, 11))}
              placeholder="000000"
              required
              style={{
                width: '100%',
                border: '1.5px solid #CBD5E0',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '14px',
                color: '#2D3748',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#718096', marginBottom: '6px' }}>
              Clave
            </label>
            <input
              type="password"
              value={clave}
              onChange={e => setClave(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%',
                border: '1.5px solid #CBD5E0',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '14px',
                color: '#2D3748',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div
              style={{
                backgroundColor: '#FFF5F5',
                border: '1px solid #FEB2B2',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '13px',
                color: '#E53E3E',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={cargando}
            style={{
              backgroundColor: cargando ? '#90CDF4' : '#2B6CB0',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: cargando ? 'not-allowed' : 'pointer',
              marginTop: '4px',
            }}
          >
            {cargando ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default SuperAdminLogin;
