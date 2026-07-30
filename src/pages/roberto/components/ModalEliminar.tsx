import React, { useState } from 'react';
import { API_BASE } from '../../../config/api';

const NAVY = '#1B2A4A';
const RED  = '#E53E3E';
const GRAY = '#718096';

interface ModalEliminarProps {
  tabla: string;
  id: number;
  descripcion: string;
  clienteId: number;
  token: string;
  tokenHeader?: string;
  onClose: () => void;
  onDone: () => void;
}

export default function ModalEliminar({
  tabla, id, descripcion, clienteId, token,
  tokenHeader = 'x-superadmin-token',
  onClose, onDone,
}: ModalEliminarProps) {
  const [clave,      setClave]      = useState('');
  const [mostrar,    setMostrar]    = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error,      setError]      = useState('');

  const eliminar = async () => {
    if (!clave) { setError('Ingresá la clave de superadmin'); return; }
    setProcesando(true);
    setError('');
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/eliminar-registro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [tokenHeader]: token },
        body: JSON.stringify({ tabla, id, clave_superadmin: clave, cliente_id: clienteId }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.mensaje || 'Error al eliminar'); return; }
      onDone();
    } catch {
      setError('Error de conexión');
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ backgroundColor: NAVY, borderRadius: '12px', padding: '28px', width: '380px', maxWidth: '90vw', color: '#fff' }}>
        <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>🗑️ Eliminar registro</div>
        <div style={{ fontSize: '13px', color: '#CBD5E0', marginBottom: '20px', wordBreak: 'break-word' }}>
          ¿Eliminar definitivamente: <strong style={{ color: '#fff' }}>{descripcion}</strong>?
          <br />Esta acción no se puede deshacer.
        </div>

        <label style={{ fontSize: '12px', color: '#A0AEC0', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
          CLAVE DE SUPERADMIN
        </label>
        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <input
            type={mostrar ? 'text' : 'password'}
            value={clave}
            onChange={e => setClave(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && eliminar()}
            placeholder="Tu clave de acceso"
            autoFocus
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 40px 10px 12px', borderRadius: '8px', border: '1px solid #2D3748', backgroundColor: '#0F1D30', color: '#fff', fontSize: '14px', outline: 'none' }}
          />
          <button
            onClick={() => setMostrar(v => !v)}
            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: GRAY }}
          >{mostrar ? '🙈' : '👁️'}</button>
        </div>

        {error && (
          <div style={{ backgroundColor: '#742A2A', color: '#FEB2B2', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', backgroundColor: '#2D3748', color: '#CBD5E0', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            onClick={eliminar}
            disabled={procesando}
            style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', backgroundColor: procesando ? '#9B2C2C' : RED, color: '#fff', fontSize: '13px', fontWeight: 700, cursor: procesando ? 'not-allowed' : 'pointer', opacity: procesando ? 0.8 : 1 }}>
            {procesando ? '⏳ Eliminando...' : '🗑️ Eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
}
