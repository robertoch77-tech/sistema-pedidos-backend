import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../../config/api';

const NAVY = '#1B2A4A';
const BLUE = '#2B6CB0';
const GREEN = '#38A169';
const RED = '#E53E3E';
const ORANGE = '#DD6B20';
const GRAY = '#718096';
const TEXT = '#2D3748';
const BG = '#F4F6F9';

interface Cliente {
  id: number;
  nombre_comercial: string;
  codigo_acceso: string;
  estado: string;
  email: string;
}

interface Sesion {
  token: string;
}

function OjoBtn({ ver, toggle }: { ver: boolean; toggle: () => void }) {
  return (
    <button type="button" onClick={toggle}
      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: GRAY, padding: 0 }}>
      {ver ? '🙈' : '👁️'}
    </button>
  );
}

function InputClave({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [ver, setVer] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, color: GRAY, fontWeight: 600, marginBottom: 4 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={ver ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || '••••••'}
          style={{ width: '100%', boxSizing: 'border-box', padding: '9px 40px 9px 12px', borderRadius: 8, border: '1px solid #CBD5E0', fontSize: 14, color: TEXT, outline: 'none' }}
        />
        <OjoBtn ver={ver} toggle={() => setVer(v => !v)} />
      </div>
    </div>
  );
}

function Feedback({ msg, ok }: { msg: string; ok: boolean }) {
  if (!msg) return null;
  return (
    <div style={{ padding: '10px 14px', borderRadius: 8, backgroundColor: ok ? '#F0FFF4' : '#FFF5F5', color: ok ? GREEN : RED, fontSize: 13, fontWeight: 600, marginTop: 12, border: `1px solid ${ok ? '#C6F6D5' : '#FED7D7'}` }}>
      {ok ? '✅ ' : '❌ '}{msg}
    </div>
  );
}

// ── Modal asignar clave ──────────────────────────────────────
function ModalAsignar({ cliente, token, onClose }: { cliente: Cliente; token: string; onClose: () => void }) {
  const [clave, setClave] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [superClave, setSuperClave] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);

  const asignar = async () => {
    if (clave !== confirmar) { setMsg('Las claves no coinciden'); setOk(false); return; }
    if (clave.length < 4) { setMsg('La clave debe tener al menos 4 caracteres'); setOk(false); return; }
    if (!superClave) { setMsg('Ingresá tu clave de superadmin'); setOk(false); return; }
    setProcesando(true); setMsg('');
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/gestion-claves/cliente/${cliente.id}/asignar-clave`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-superadmin-token': token },
        body: JSON.stringify({ clave_nueva: clave, clave_superadmin: superClave }),
      });
      const d = await r.json();
      if (!r.ok) { setMsg(d.mensaje || 'Error'); setOk(false); return; }
      setMsg('Clave asignada correctamente'); setOk(true);
      setTimeout(onClose, 1500);
    } catch { setMsg('Error de conexión'); setOk(false); }
    finally { setProcesando(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: 28, width: 380, maxWidth: '90vw' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 4 }}>🔑 Asignar clave</div>
        <div style={{ fontSize: 13, color: GRAY, marginBottom: 20 }}>Cliente: <strong style={{ color: TEXT }}>{cliente.nombre_comercial}</strong></div>

        <InputClave label="NUEVA CLAVE PARA EL CLIENTE" value={clave} onChange={setClave} placeholder="Mínimo 4 caracteres" />
        <InputClave label="CONFIRMAR CLAVE" value={confirmar} onChange={setConfirmar} />
        <InputClave label="TU CLAVE DE SUPERADMIN" value={superClave} onChange={setSuperClave} placeholder="Para autorizar" />

        <Feedback msg={msg} ok={ok} />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #CBD5E0', background: '#fff', cursor: 'pointer', fontSize: 13, color: GRAY }}>Cancelar</button>
          <button onClick={asignar} disabled={procesando}
            style={{ padding: '9px 20px', borderRadius: 8, border: 'none', backgroundColor: procesando ? '#90CDF4' : BLUE, color: '#fff', cursor: procesando ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
            {procesando ? '⏳...' : '🔑 Asignar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal resetear clave ─────────────────────────────────────
function ModalResetear({ cliente, token, onClose }: { cliente: Cliente; token: string; onClose: () => void }) {
  const [superClave, setSuperClave] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const [claveTemporal, setClaveTemporal] = useState('');

  const resetear = async () => {
    if (!superClave) { setMsg('Ingresá tu clave de superadmin'); setOk(false); return; }
    setProcesando(true); setMsg('');
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/gestion-claves/cliente/${cliente.id}/resetear-clave`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-superadmin-token': token },
        body: JSON.stringify({ clave_superadmin: superClave }),
      });
      const d = await r.json();
      if (!r.ok) { setMsg(d.mensaje || 'Error'); setOk(false); return; }
      setClaveTemporal(d.clave_temporal);
      setMsg('Clave reseteada correctamente'); setOk(true);
    } catch { setMsg('Error de conexión'); setOk(false); }
    finally { setProcesando(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: 28, width: 400, maxWidth: '90vw' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 4 }}>🔄 Resetear clave</div>
        <div style={{ fontSize: 13, color: TEXT, marginBottom: 8 }}>
          ¿Resetear la clave de <strong>{cliente.nombre_comercial}</strong>?
        </div>
        <div style={{ fontSize: 13, color: GRAY, marginBottom: 20, backgroundColor: '#F7FAFC', padding: '10px 14px', borderRadius: 8 }}>
          La nueva clave temporal será el código de acceso: <strong style={{ color: NAVY, fontFamily: 'monospace', fontSize: 15 }}>{cliente.codigo_acceso}</strong>
        </div>

        {!claveTemporal && (
          <>
            <InputClave label="TU CLAVE DE SUPERADMIN" value={superClave} onChange={setSuperClave} placeholder="Para autorizar" />
            <Feedback msg={msg} ok={ok} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #CBD5E0', background: '#fff', cursor: 'pointer', fontSize: 13, color: GRAY }}>Cancelar</button>
              <button onClick={resetear} disabled={procesando}
                style={{ padding: '9px 20px', borderRadius: 8, border: 'none', backgroundColor: procesando ? '#FBD38D' : ORANGE, color: '#fff', cursor: procesando ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
                {procesando ? '⏳...' : '🔄 Resetear'}
              </button>
            </div>
          </>
        )}

        {claveTemporal && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 13, color: GRAY, marginBottom: 8 }}>✅ Clave reseteada. Comunicale al cliente:</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: GREEN, fontFamily: 'monospace', letterSpacing: 3, backgroundColor: '#F0FFF4', padding: '16px', borderRadius: 10, border: '2px solid #C6F6D5' }}>
              {claveTemporal}
            </div>
            <div style={{ fontSize: 11, color: GRAY, marginTop: 8 }}>Esta es la clave temporal del cliente.</div>
            <button onClick={onClose} style={{ marginTop: 16, padding: '9px 24px', borderRadius: 8, border: 'none', backgroundColor: GREEN, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>✓ Cerrar</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────
export default function GestionClaves() {
  const navigate = useNavigate();
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(false);

  // Cambiar clave propia
  const [claveActual, setClaveActual] = useState('');
  const [claveNueva, setClaveNueva] = useState('');
  const [claveConfirm, setClaveConfirm] = useState('');
  const [msgPropia, setMsgPropia] = useState('');
  const [okPropia, setOkPropia] = useState(false);
  const [guardandoPropia, setGuardandoPropia] = useState(false);

  // Modales
  const [modalAsignar, setModalAsignar] = useState<Cliente | null>(null);
  const [modalResetear, setModalResetear] = useState<Cliente | null>(null);

  useEffect(() => {
    try {
      const rawSA = localStorage.getItem('superadmin_session');
      const rawPortal = localStorage.getItem('roberto_portal_session');
      const s = JSON.parse(rawSA || rawPortal || '{}');
      if (!s?.token) { navigate('/roberto/login'); return; }
      setSesion({ token: s.token });
    } catch { navigate('/roberto/login'); }
  }, [navigate]);

  const cargarClientes = useCallback(async () => {
    if (!sesion) return;
    setCargando(true);
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/clientes`, {
        headers: { 'x-superadmin-token': sesion.token },
      });
      if (r.ok) setClientes(await r.json());
    } catch { /* silencioso */ }
    finally { setCargando(false); }
  }, [sesion]);

  useEffect(() => { if (sesion) cargarClientes(); }, [sesion, cargarClientes]);

  const cambiarClavePropia = async () => {
    if (claveNueva !== claveConfirm) { setMsgPropia('Las claves nuevas no coinciden'); setOkPropia(false); return; }
    if (claveNueva.length < 6) { setMsgPropia('La nueva clave debe tener al menos 6 caracteres'); setOkPropia(false); return; }
    if (!claveActual) { setMsgPropia('Ingresá tu clave actual'); setOkPropia(false); return; }
    setGuardandoPropia(true); setMsgPropia('');
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/gestion-claves/superadmin/cambiar-clave`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-superadmin-token': sesion!.token },
        body: JSON.stringify({ clave_actual: claveActual, clave_nueva: claveNueva }),
      });
      const d = await r.json();
      if (!r.ok) { setMsgPropia(d.mensaje || 'Error'); setOkPropia(false); return; }
      setMsgPropia('Clave actualizada correctamente'); setOkPropia(true);
      setClaveActual(''); setClaveNueva(''); setClaveConfirm('');
    } catch { setMsgPropia('Error de conexión'); setOkPropia(false); }
    finally { setGuardandoPropia(false); }
  };

  const token = sesion?.token || '';

  const estadoColor = (e: string) => e === 'activo' ? GREEN : e === 'suspendido' ? RED : GRAY;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG }}>
      {/* Header */}
      <div style={{ backgroundColor: NAVY, padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => navigate('/roberto/dashboard')}
          style={{ padding: '6px 14px', borderRadius: 6, border: 'none', backgroundColor: '#2D3748', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
          ← Volver
        </button>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>🔐 Gestión de claves</div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 20px' }}>

        {/* ── SECCIÓN A: Mi clave ──────────────────────────── */}
        <div style={{ backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', padding: 28, marginBottom: 28 }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: NAVY }}>🔐 Mi clave de superadmin</h2>

          <div style={{ maxWidth: 400 }}>
            <InputClave label="CLAVE ACTUAL" value={claveActual} onChange={setClaveActual} />
            <InputClave label="NUEVA CLAVE" value={claveNueva} onChange={setClaveNueva} placeholder="Mínimo 6 caracteres" />
            <InputClave label="CONFIRMAR NUEVA CLAVE" value={claveConfirm} onChange={setClaveConfirm} />

            <Feedback msg={msgPropia} ok={okPropia} />

            <button onClick={cambiarClavePropia} disabled={guardandoPropia}
              style={{ marginTop: 16, padding: '10px 24px', borderRadius: 8, border: 'none', backgroundColor: guardandoPropia ? '#90CDF4' : BLUE, color: '#fff', cursor: guardandoPropia ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700 }}>
              {guardandoPropia ? '⏳ Guardando...' : '🔐 Cambiar mi clave'}
            </button>
          </div>
        </div>

        {/* ── SECCIÓN B: Claves de clientes ───────────────── */}
        <div style={{ backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', padding: 28 }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: NAVY }}>🏢 Claves de clientes</h2>

          {cargando ? (
            <div style={{ textAlign: 'center', padding: 40, color: GRAY }}>Cargando clientes...</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ backgroundColor: '#EDF2F7' }}>
                    {['Nombre', 'Código acceso', 'Estado', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: NAVY, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clientes.map((c, i) => (
                    <tr key={c.id} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#F7FAFC', borderBottom: '1px solid #EDF2F7' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: TEXT }}>{c.nombre_comercial}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: NAVY, fontWeight: 700, fontSize: 14 }}>{c.codigo_acceso}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ backgroundColor: `${estadoColor(c.estado)}20`, color: estadoColor(c.estado), borderRadius: 12, padding: '3px 10px', fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>
                          {c.estado}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button onClick={() => setModalAsignar(c)}
                            style={{ padding: '5px 12px', borderRadius: 6, border: 'none', backgroundColor: '#EBF4FF', color: BLUE, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                            🔑 Asignar clave
                          </button>
                          <button onClick={() => setModalResetear(c)}
                            style={{ padding: '5px 12px', borderRadius: 6, border: 'none', backgroundColor: '#FFFAF0', color: ORANGE, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                            🔄 Resetear
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {clientes.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: 32, color: GRAY }}>Sin clientes</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {modalAsignar && <ModalAsignar cliente={modalAsignar} token={token} onClose={() => setModalAsignar(null)} />}
      {modalResetear && <ModalResetear cliente={modalResetear} token={token} onClose={() => setModalResetear(null)} />}
    </div>
  );
}
