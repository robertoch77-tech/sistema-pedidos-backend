import React, { useState, useEffect } from 'react';

const Logo = ({ size = 28 }: { size?: number }) => (
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

interface Notificacion {
  id: number;
  titulo: string;
  mensaje: string;
  tipo: string;
  leida: boolean;
  fecha: string;
  cliente_cuit: string | null;
}

const API = 'https://sistema-pedidos-backend-2hec.onrender.com';

function MisNotificaciones() {
  const cliente = JSON.parse(localStorage.getItem('cliente') || '{}');
  const mayorista_id = cliente.mayorista_id;

  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [cargando, setCargando] = useState(false);
  const [razonSocial, setRazonSocial] = useState('');

  useEffect(() => {
    if (!mayorista_id) return;
    fetch(`${API}/api/mayoristas/${mayorista_id}/configuracion`)
      .then(r => r.json())
      .then(data => setRazonSocial(data.razon_social || ''))
      .catch(() => {});
  }, [mayorista_id]);

  useEffect(() => {
    if (!mayorista_id || !cliente.cuit) return;
    cargar();
  }, []);

  const cargar = async () => {
    setCargando(true);
    try {
      const res = await fetch(`${API}/api/notificaciones/cliente/${mayorista_id}/${encodeURIComponent(cliente.cuit)}`);
      const data = await res.json();
      setNotificaciones(Array.isArray(data) ? data : []);
    } catch {} finally { setCargando(false); }
  };

  const marcarLeida = async (id: number) => {
    try {
      await fetch(`${API}/api/notificaciones/${id}/leida`, { method: 'PUT' });
      setNotificaciones(prev => prev.map(n => n.id === id ? { ...n, leida: true } : n));
    } catch {}
  };

  const formatFecha = (fecha: string) => {
    const d = new Date(fecha);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Logo size={26} />
          <div>
            <p className="text-xs text-gray-400 leading-none">
              Gestión Integral Pedidos{razonSocial ? ` | ${razonSocial}` : ''}
            </p>
            <h1 className="text-lg font-bold text-blue-600">🔔 Mis Notificaciones</h1>
          </div>
        </div>
        <a href="/cliente" className="text-sm text-gray-500 hover:text-gray-700 font-medium">← Volver</a>
      </nav>

      <div className="p-4 max-w-lg mx-auto">
        {cargando ? (
          <div className="text-center py-12 text-gray-400">Cargando...</div>
        ) : notificaciones.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-6xl mb-4">🔔</div>
            <p className="text-lg font-medium">No tenés notificaciones</p>
            <p className="text-sm mt-1">Acá aparecerán los avisos de tu proveedor</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notificaciones.map(n => (
              <div
                key={n.id}
                onClick={() => { if (!n.leida) marcarLeida(n.id); }}
                className={`bg-white rounded-xl shadow-sm p-4 cursor-pointer transition-colors ${
                  !n.leida ? 'border-l-4 border-blue-500' : 'border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm ${!n.leida ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                    {n.titulo}
                  </p>
                  {!n.leida && (
                    <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
                  )}
                </div>
                <p className={`text-sm mt-1 ${!n.leida ? 'text-gray-800' : 'text-gray-500'}`}>{n.mensaje}</p>
                <p className="text-xs text-gray-400 mt-2">{formatFecha(n.fecha)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="bg-white border-t text-center py-2 text-xs text-gray-400 mt-4">
        Gestión Integral Pedidos
      </footer>
    </div>
  );
}

export default MisNotificaciones;
