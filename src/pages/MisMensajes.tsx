import React, { useEffect, useRef, useState } from 'react';

const Logo = ({ size = 26 }: { size?: number }) => (
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

const API = 'https://sistema-pedidos-backend-2hec.onrender.com';

interface Mensaje {
  id: number;
  mayorista_id: number;
  cliente_cuit: string;
  cliente_nombre: string;
  texto: string;
  origen: 'cliente' | 'mayorista';
  leido: boolean;
  fecha: string;
}

const formatHora = (fecha: string) => {
  const d = new Date(fecha);
  const hoy = new Date();
  const esHoy = d.toDateString() === hoy.toDateString();
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return esHoy ? hora : `${d.toLocaleDateString('es-AR')} ${hora}`;
};

interface Props {
  onVolver: () => void;
}

function MisMensajes({ onVolver }: Props) {
  const cliente = JSON.parse(localStorage.getItem('cliente') || '{}');
  const mayorista_id = cliente.mayorista_id;
  const cuit = cliente.cuit;

  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const finRef = useRef<HTMLDivElement | null>(null);

  const cargarHilo = async (marcarLeidos: boolean) => {
    if (!mayorista_id || !cuit) { setCargando(false); return; }
    try {
      const res = await fetch(`${API}/api/mensajes/${mayorista_id}/${encodeURIComponent(cuit)}`);
      const data = await res.json();
      if (Array.isArray(data)) setMensajes(data);
      if (marcarLeidos) {
        await fetch(`${API}/api/mensajes/${mayorista_id}/${encodeURIComponent(cuit)}/leidos?lector=cliente`, { method: 'PUT' });
      }
    } catch {} finally { setCargando(false); }
  };

  // Carga inicial + marcar leídos los del mayorista
  useEffect(() => {
    cargarHilo(true);
    // eslint-disable-next-line
  }, []);

  // Polling cada 15s — también marca leídos porque el hilo está abierto
  useEffect(() => {
    const interval = setInterval(() => cargarHilo(true), 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line
  }, []);

  // Scroll automático al último mensaje
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes.length, cargando]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || enviando || !mayorista_id || !cuit) return;
    setEnviando(true);
    // Agregado local optimista
    const local: Mensaje = {
      id: -Date.now(),
      mayorista_id,
      cliente_cuit: cuit,
      cliente_nombre: cliente.nombre || '',
      texto: t,
      origen: 'cliente',
      leido: false,
      fecha: new Date().toISOString(),
    };
    setMensajes(prev => [...prev, local]);
    setTexto('');
    try {
      const res = await fetch(`${API}/api/mensajes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mayorista_id,
          cliente_cuit: cuit,
          cliente_nombre: cliente.nombre || '',
          texto: t,
          origen: 'cliente',
        }),
      });
      const guardado = await res.json();
      if (guardado && guardado.id) {
        setMensajes(prev => prev.map(m => (m.id === local.id ? guardado : m)));
      }
    } catch {} finally { setEnviando(false); }
  };

  return (
    <div className="h-screen bg-gray-100 flex flex-col">
      {/* HEADER */}
      <nav className="bg-white shadow-sm px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Logo size={26} />
          <div>
            <p className="text-xs text-gray-400 leading-none">Gestión Integral Pedidos</p>
            <h1 className="text-lg font-bold text-blue-600">💬 Mis Mensajes</h1>
          </div>
        </div>
        <button onClick={onVolver} className="text-sm text-gray-500 hover:text-gray-700 font-medium">
          ← Volver
        </button>
      </nav>

      {/* MENSAJES */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-2">
          {cargando ? (
            <div className="text-center py-16 text-gray-400">Cargando mensajes...</div>
          ) : mensajes.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-5xl mb-3">💬</div>
              <p className="text-lg">Todavía no hay mensajes. ¡Escribinos!</p>
            </div>
          ) : (
            mensajes.map(m => (
              <div key={m.id} className={`flex ${m.origen === 'cliente' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] sm:max-w-[65%] rounded-2xl px-4 py-2 shadow-sm ${
                  m.origen === 'cliente'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-white text-gray-800 rounded-bl-sm'
                }`}>
                  <p className="text-sm whitespace-pre-wrap break-words">{m.texto}</p>
                  <p className={`text-[10px] mt-1 text-right ${m.origen === 'cliente' ? 'text-blue-200' : 'text-gray-400'}`}>
                    {formatHora(m.fecha)}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={finRef} />
        </div>
      </div>

      {/* INPUT FIJO AL PIE */}
      <div className="bg-white border-t p-3 flex-shrink-0">
        <div className="max-w-2xl mx-auto flex gap-2">
          <input
            type="text"
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') enviar(); }}
            placeholder="Escribí tu mensaje..."
            className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={enviar}
            disabled={!texto.trim() || enviando}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-full text-sm font-semibold">
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

export default MisMensajes;
