import React, { useState, useEffect } from 'react';

const Logo = ({ size = 32 }: { size?: number }) => (
  <svg viewBox="0 0 80 80" width={size} height={size} style={{ display: 'block' }}>
    <circle cx="15" cy="15" r="11" fill="#0D2B6B" />
    <circle cx="40" cy="15" r="11" fill="#06B6D4" />
    <circle cx="65" cy="15" r="11" fill="#06B6D4" />
    <circle cx="27" cy="40" r="11" fill="#06B6D4" />
    <circle cx="52" cy="40" r="11" fill="#0D2B6B" />
    <circle cx="15" cy="65" r="11" fill="#0D2B6B" />
    <circle cx="40" cy="65" r="11" fill="#0D2B6B" />
    <circle cx="65" cy="65" r="11" fill="#06B6D4" />
  </svg>
);

const API_ROBERTO = process.env.REACT_APP_API_URL || 'http://localhost:4000';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cuit, setCuit] = useState('');
  const [clave, setClave] = useState('');
  const [clave2, setClave2] = useState('');
  const [requiereClave, setRequiereClave] = useState(false);
  const [primeraVez, setPrimeraVez] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [verificandoTipo, setVerificandoTipo] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const codigoUrl = params.get('m');

  // Si hay ?m=codigo en la URL → modo cliente forzado; si no → mayorista forzado.
  // El toggle se elimina: el tipo se deriva de la URL, no del estado.
  const tipo: 'mayorista' | 'cliente' = codigoUrl ? 'cliente' : 'mayorista';

  useEffect(() => {
    if (codigoUrl) localStorage.setItem('codigo_mayorista', codigoUrl);
  }, [codigoUrl]);

  // Detección de cliente Roberto: si el código pertenece a tipo_fuente='roberto'
  // redirigir al login de Roberto en lugar de mostrar el formulario de Ivan.
  useEffect(() => {
    if (!codigoUrl) return;
    setVerificandoTipo(true);
    fetch(`${API_ROBERTO}/api/superadmin/portal/${codigoUrl}`)
      .then(r => r.json())
      .then(data => {
        if (data?.tipo_fuente === 'roberto') {
          window.location.href = `/roberto/login?m=${codigoUrl}`;
        } else {
          setVerificandoTipo(false);
        }
      })
      .catch(() => setVerificandoTipo(false));
  }, [codigoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const codigoMayorista = codigoUrl || localStorage.getItem('codigo_mayorista') || '';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setError('');

    try {
      if (tipo === 'mayorista') {
        const res = await fetch('https://sistema-pedidos-backend-2hec.onrender.com/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.mensaje || 'Error al iniciar sesión');
        localStorage.setItem('mayorista', JSON.stringify(data.mayorista));
        window.location.href = '/dashboard';
      } else {
        if (!codigoMayorista) {
          throw new Error('Link inválido. Pedile el link correcto a tu proveedor.');
        }

        if (requiereClave && primeraVez) {
          if (clave.length < 4) throw new Error('La clave debe tener al menos 4 caracteres.');
          if (clave !== clave2) throw new Error('Las claves no coinciden.');
        }

        const res = await fetch('https://sistema-pedidos-backend-2hec.onrender.com/api/auth/login-cliente', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cuit, codigo: codigoMayorista, clave: requiereClave ? clave : '' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.mensaje || 'Error al iniciar sesión');

        if (data.requiere_clave) {
          setRequiereClave(true);
          setPrimeraVez(!!data.primera_vez);
          setError('');
          return;
        }

        localStorage.setItem('cliente', JSON.stringify(data.cliente));
        window.location.href = '/bienvenida';
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  if (verificandoTipo) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '32px', height: '32px', border: '3px solid #BEE3F8', borderTopColor: '#2B6CB0', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: '#718096', fontSize: '14px' }}>Verificando acceso...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">

        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <Logo size={44} />
          </div>
          <h1 className="text-3xl font-bold text-gray-800">Gestión Integral Pedidos</h1>
          <p className="text-gray-500 mt-2">Ingresá con tu cuenta</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">

          {tipo === 'mayorista' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="tu@email.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="••••••••"
                  required
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CUIT</label>
                <input
                  type="text"
                  value={cuit}
                  onChange={e => { setCuit(e.target.value); setRequiereClave(false); }}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="20123456789"
                  required
                />
              </div>

              {requiereClave && (
                primeraVez ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Creá tu clave</label>
                      <input
                        type="password"
                        value={clave}
                        onChange={e => setClave(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Nueva clave"
                        required
                      />
                      <p className="text-xs text-gray-500 mt-1">Es la primera vez que entrás. Elegí una clave para tus próximos ingresos.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Repetí la clave</label>
                      <input
                        type="password"
                        value={clave2}
                        onChange={e => setClave2(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Repetí la clave"
                        required
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Clave</label>
                    <input
                      type="password"
                      value={clave}
                      onChange={e => setClave(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Tu clave"
                      required
                    />
                  </div>
                )
              )}
            </>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-3 transition-colors disabled:opacity-50"
          >
            {cargando ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;