import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LogoPi from '../../components/pi/LogoPi';
import { API_BASE } from '../../config/api';

function PiLogin() {
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const r = await fetch(`${API_BASE}/api/pi/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setError(d.error || 'Credenciales incorrectas');
        return;
      }
      localStorage.setItem('pi_session', JSON.stringify({ token: d.token, usuario: d.usuario }));
      navigate('/pedidos-inteligentes/dashboard');
    } catch {
      setError('Error de conexión. Intentá de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1px solid #CBD5E0',
    borderRadius: '8px', fontSize: '14px', color: '#2D3748', boxSizing: 'border-box',
    outline: 'none',
  };
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: '13px', fontWeight: 600, color: '#4A5568', marginBottom: '6px',
  };

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#1B2A4A',
      background: 'linear-gradient(135deg, #1B2A4A 0%, #2B6CB0 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        backgroundColor: '#fff', borderRadius: '16px', padding: '40px 36px',
        width: '100%', maxWidth: '400px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <LogoPi size="lg" showText={true} />
        </div>

        <h2 style={{ margin: '0 0 24px', fontSize: '18px', fontWeight: 700, color: '#1B2A4A', textAlign: 'center' }}>
          Acceso al Sistema
        </h2>

        {error && (
          <div style={{ backgroundColor: '#FFF5F5', color: '#E53E3E', padding: '10px 14px',
            borderRadius: '8px', fontSize: '13px', marginBottom: '16px', border: '1px solid #FED7D7' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={lbl}>Email *</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="usuario@ejemplo.com" required style={inp} />
          </div>
          <div>
            <label style={lbl}>Contraseña *</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required style={inp} />
          </div>
          <button type="submit" disabled={cargando}
            style={{
              padding: '12px', backgroundColor: cargando ? '#BEE3F8' : '#2B6CB0',
              color: '#fff', border: 'none', borderRadius: '8px', cursor: cargando ? 'not-allowed' : 'pointer',
              fontSize: '15px', fontWeight: 700, marginTop: '4px',
              transition: 'background-color 0.15s',
            }}>
            {cargando ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default PiLogin;
