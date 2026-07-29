import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../config/api';

const NAVY   = '#1B2A4A';
const BLUE   = '#2B6CB0';
const GREEN  = '#38A169';
const GRAY   = '#718096';
const TEXT   = '#2D3748';
const BG     = '#F4F6F9';
const RED    = '#E53E3E';

function getToken() {
  try { const s = localStorage.getItem('pi_session'); return s ? JSON.parse(s).token : ''; } catch { return ''; }
}
function hdr(): Record<string, string> {
  return { 'x-pi-token': getToken(), 'Content-Type': 'application/json' };
}

type TabId = 'empresa' | 'membrete' | 'impresion' | 'numeracion';

interface Config {
  id?: number;
  nombre_empresa: string;
  razon_social: string;
  cuit: string;
  direccion: string;
  telefono: string;
  email: string;
  logo_url: string;
  membrete_linea_1: string;
  membrete_linea_2: string;
  membrete_linea_3: string;
  membrete_linea_4: string;
  tamano_hoja: 'A4' | 'A5';
  items_por_hoja: number;
  prefijo_pedido: string;
  ultimo_numero_pedido?: number;
}

const DEFAULTS: Config = {
  nombre_empresa: '', razon_social: '', cuit: '', direccion: '',
  telefono: '', email: '', logo_url: '',
  membrete_linea_1: '', membrete_linea_2: '', membrete_linea_3: '', membrete_linea_4: '',
  tamano_hoja: 'A4', items_por_hoja: 30, prefijo_pedido: 'NP',
};

// ── Inputs ────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #CBD5E0',
  borderRadius: '8px', fontSize: '13px', color: TEXT, boxSizing: 'border-box', background: '#fff',
};

function Campo({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: GRAY, marginBottom: '4px' }}>
        {label}{required && <span style={{ color: RED }}> *</span>}
      </label>
      {children}
    </div>
  );
}

// ── Vista previa membrete ─────────────────────────────────────
function PreviewMembrete({ cfg }: { cfg: Config }) {
  const lineas = [cfg.membrete_linea_1, cfg.membrete_linea_2, cfg.membrete_linea_3, cfg.membrete_linea_4].filter(Boolean);
  return (
    <div style={{ border: '1px solid #CBD5E0', borderRadius: '10px', padding: '16px', backgroundColor: '#fff', marginTop: '16px' }}>
      <p style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: 700, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Vista previa del membrete
      </p>
      <div style={{ borderLeft: `3px solid ${BLUE}`, paddingLeft: '12px' }}>
        {cfg.logo_url && (
          <img src={cfg.logo_url} alt="logo" style={{ height: '36px', objectFit: 'contain', marginBottom: '6px', display: 'block' }}
            onError={e => (e.currentTarget.style.display = 'none')} />
        )}
        {lineas.length === 0 ? (
          <p style={{ margin: 0, color: '#CBD5E0', fontSize: '12px', fontStyle: 'italic' }}>
            Completá las líneas del membrete para ver la vista previa
          </p>
        ) : lineas.map((l, i) => (
          <p key={i} style={{ margin: '2px 0', fontSize: i === 0 ? '13px' : '11px',
            fontWeight: i === 0 ? 700 : 400, color: i === 0 ? NAVY : GRAY }}>
            {l}
          </p>
        ))}
      </div>
      <hr style={{ border: 'none', borderTop: '1px solid #999', margin: '10px 0 0' }} />
    </div>
  );
}

// ── Modal confirmación ────────────────────────────────────────
function ModalConfirmar({ onConfirmar, onCerrar }: { onConfirmar: () => void; onCerrar: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '28px', maxWidth: '380px', width: '100%',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ fontSize: '36px', textAlign: 'center', marginBottom: '12px' }}>⚠️</div>
        <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700, color: NAVY, textAlign: 'center' }}>
          Reiniciar numeración
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: '13px', color: GRAY, textAlign: 'center' }}>
          El contador volverá a cero. El próximo pedido será <strong>{'{prefijo}-000001'}</strong>.
          Esta acción no se puede deshacer.
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button onClick={onCerrar}
            style={{ padding: '9px 20px', border: '1px solid #CBD5E0', borderRadius: '8px',
              background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY, fontWeight: 600 }}>
            Cancelar
          </button>
          <button onClick={onConfirmar}
            style={{ padding: '9px 20px', backgroundColor: RED, color: '#fff', border: 'none',
              borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
            Sí, reiniciar
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════
function PiConfig() {
  const navigate = useNavigate();
  const [tab, setTab]         = useState<TabId>('empresa');
  const [cfg, setCfg]         = useState<Config>(DEFAULTS);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito]     = useState(false);
  const [error, setError]     = useState('');
  const [modalReinicio, setModalReinicio] = useState(false);
  const [reiniciando, setReiniciando]     = useState(false);

  // Carga inicial
  useEffect(() => {
    (async () => {
      setCargando(true);
      try {
        const r = await fetch(`${API_BASE}/api/pi/config`, { headers: hdr() });
        const d = await r.json();
        if (r.ok && d.ok) setCfg({ ...DEFAULTS, ...d.config });
      } catch { setError('Error al cargar configuración'); } finally { setCargando(false); }
    })();
  }, []);

  const set = (campo: keyof Config, valor: string | number) =>
    setCfg(prev => ({ ...prev, [campo]: valor }));

  const guardar = async () => {
    if (!cfg.nombre_empresa.trim()) { setError('El nombre de empresa es obligatorio'); return; }
    setGuardando(true); setError(''); setExito(false);
    try {
      const r = await fetch(`${API_BASE}/api/pi/config`, {
        method: 'PUT', headers: hdr(), body: JSON.stringify(cfg),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) { setError(d.error || 'Error al guardar'); return; }
      setExito(true);
      setTimeout(() => setExito(false), 3000);
    } catch { setError('Error de conexión'); } finally { setGuardando(false); }
  };

  const reiniciarNumeracion = async () => {
    setReiniciando(true);
    try {
      await fetch(`${API_BASE}/api/pi/config/reiniciar-numeracion`, { method: 'POST', headers: hdr() });
      setCfg(prev => ({ ...prev, ultimo_numero_pedido: 0 }));
      setModalReinicio(false);
    } catch { /* silencioso */ } finally { setReiniciando(false); }
  };

  const TABS: { id: TabId; label: string }[] = [
    { id: 'empresa',    label: '🏢 Empresa'    },
    { id: 'membrete',   label: '🖨️ Membrete'   },
    { id: 'impresion',  label: '📄 Impresión'  },
    { id: 'numeracion', label: '🔢 Numeración' },
  ];

  if (cargando) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <p style={{ color: GRAY, fontSize: '14px' }}>⏳ Cargando configuración...</p>
    </div>
  );

  return (
    <>
      {modalReinicio && (
        <ModalConfirmar
          onConfirmar={reiniciarNumeracion}
          onCerrar={() => setModalReinicio(false)} />
      )}

      <div style={{ padding: '24px', backgroundColor: BG, minHeight: '100vh' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: NAVY }}>⚙️ Configuración</h1>
          <button onClick={() => navigate('/pedidos-inteligentes/dashboard')}
            style={{ padding: '8px 16px', border: '1px solid #CBD5E0', borderRadius: '8px',
              background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>
            ← Volver
          </button>
        </div>

        <div style={{ maxWidth: '680px' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '4px', backgroundColor: '#fff', borderRadius: '10px',
            padding: '4px', marginBottom: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ flex: 1, padding: '9px 8px', border: 'none', borderRadius: '7px', cursor: 'pointer',
                  fontSize: '12px', fontWeight: tab === t.id ? 700 : 400,
                  backgroundColor: tab === t.id ? NAVY : 'transparent',
                  color: tab === t.id ? '#fff' : GRAY, transition: 'all 0.15s' }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Panel */}
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>

            {/* TAB EMPRESA */}
            {tab === 'empresa' && (
              <div>
                <h3 style={{ margin: '0 0 18px', fontSize: '15px', fontWeight: 700, color: NAVY }}>Datos de la empresa</h3>
                <Campo label="Nombre empresa" required>
                  <input value={cfg.nombre_empresa} onChange={e => set('nombre_empresa', e.target.value)}
                    placeholder="Ej: Distribuidora Rodríguez" style={inp} />
                </Campo>
                <Campo label="Razón social">
                  <input value={cfg.razon_social} onChange={e => set('razon_social', e.target.value)}
                    placeholder="Ej: Rodríguez Hnos S.R.L." style={inp} />
                </Campo>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <Campo label="CUIT">
                      <input value={cfg.cuit} onChange={e => set('cuit', e.target.value)}
                        placeholder="20-12345678-9" style={inp} />
                    </Campo>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Campo label="Teléfono">
                      <input value={cfg.telefono} onChange={e => set('telefono', e.target.value)}
                        placeholder="0351 123-4567" style={inp} />
                    </Campo>
                  </div>
                </div>
                <Campo label="Dirección">
                  <input value={cfg.direccion} onChange={e => set('direccion', e.target.value)}
                    placeholder="Av. Colón 1234, Córdoba" style={inp} />
                </Campo>
                <Campo label="Email">
                  <input type="email" value={cfg.email} onChange={e => set('email', e.target.value)}
                    placeholder="info@empresa.com" style={inp} />
                </Campo>
                <Campo label="URL del logo">
                  <input value={cfg.logo_url} onChange={e => set('logo_url', e.target.value)}
                    placeholder="https://..." style={inp} />
                </Campo>
                {cfg.logo_url && (
                  <div style={{ marginTop: '10px', padding: '12px', backgroundColor: BG, borderRadius: '8px',
                    display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img src={cfg.logo_url} alt="Logo"
                      style={{ height: '48px', objectFit: 'contain', borderRadius: '4px' }}
                      onError={e => { e.currentTarget.style.display = 'none'; }} />
                    <span style={{ fontSize: '12px', color: GRAY }}>Vista previa del logo</span>
                  </div>
                )}
              </div>
            )}

            {/* TAB MEMBRETE */}
            {tab === 'membrete' && (
              <div>
                <h3 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 700, color: NAVY }}>Líneas del membrete</h3>
                <p style={{ margin: '0 0 18px', fontSize: '12px', color: GRAY }}>
                  Estas líneas aparecen en el encabezado de cada hoja impresa.
                </p>
                {[1, 2, 3, 4].map(n => (
                  <Campo key={n} label={`Línea ${n}${n === 1 ? ' — nombre empresa' : n === 2 ? ' — dirección' : n === 3 ? ' — teléfono / email' : ' — slogan o texto extra'}`}>
                    <input
                      value={cfg[`membrete_linea_${n}` as keyof Config] as string}
                      onChange={e => set(`membrete_linea_${n}` as keyof Config, e.target.value)}
                      placeholder={n === 1 ? 'Nombre empresa' : n === 2 ? 'Dirección' : n === 3 ? 'Tel: 0351 123-4567 | info@empresa.com' : 'Texto adicional'}
                      style={inp} />
                  </Campo>
                ))}
                <PreviewMembrete cfg={cfg} />
              </div>
            )}

            {/* TAB IMPRESIÓN */}
            {tab === 'impresion' && (
              <div>
                <h3 style={{ margin: '0 0 18px', fontSize: '15px', fontWeight: 700, color: NAVY }}>Configuración de impresión</h3>
                <Campo label="Tamaño de hoja">
                  <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
                    {(['A4', 'A5'] as const).map(t => (
                      <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '8px',
                        cursor: 'pointer', fontSize: '13px', color: TEXT }}>
                        <input type="radio" name="tamano_hoja" value={t} checked={cfg.tamano_hoja === t}
                          onChange={() => set('tamano_hoja', t)}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                        <span style={{ fontWeight: cfg.tamano_hoja === t ? 700 : 400 }}>
                          {t} {t === 'A4' ? '(210 × 297 mm)' : '(148 × 210 mm)'}
                        </span>
                        {t === 'A4' && <span style={{ fontSize: '11px', color: GRAY }}>(por defecto)</span>}
                      </label>
                    ))}
                  </div>
                </Campo>
                <Campo label="Ítems máximos por hoja">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input type="number" min={10} max={50} value={cfg.items_por_hoja}
                      onChange={e => set('items_por_hoja', Math.min(50, Math.max(10, Number(e.target.value))))}
                      style={{ ...inp, width: '90px' }} />
                    <span style={{ fontSize: '12px', color: GRAY }}>Mínimo 10 · Máximo 50 · Default 30</span>
                  </div>
                </Campo>
                <div style={{ backgroundColor: '#EBF8FF', borderRadius: '8px', padding: '12px 16px', marginTop: '8px' }}>
                  <p style={{ margin: 0, fontSize: '12px', color: BLUE }}>
                    💡 Con <strong>{cfg.items_por_hoja} ítems por hoja</strong> en <strong>{cfg.tamano_hoja}</strong>,
                    un pedido de 90 productos generará <strong>{Math.ceil(90 / cfg.items_por_hoja)} hojas</strong>.
                  </p>
                </div>
              </div>
            )}

            {/* TAB NUMERACIÓN */}
            {tab === 'numeracion' && (
              <div>
                <h3 style={{ margin: '0 0 18px', fontSize: '15px', fontWeight: 700, color: NAVY }}>Numeración de pedidos</h3>
                <Campo label="Prefijo del pedido">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input value={cfg.prefijo_pedido} onChange={e => set('prefijo_pedido', e.target.value.toUpperCase())}
                      placeholder="NP" maxLength={6}
                      style={{ ...inp, width: '100px', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '1px' }} />
                    <span style={{ fontSize: '13px', color: GRAY }}>
                      → Ejemplo: <strong style={{ color: NAVY, fontFamily: 'monospace' }}>
                        {cfg.prefijo_pedido || 'NP'}-000001
                      </strong>
                    </span>
                  </div>
                </Campo>
                <div style={{ backgroundColor: BG, borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ margin: '0 0 4px', fontSize: '12px', fontWeight: 600, color: GRAY }}>Último número usado</p>
                      <p style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: NAVY, fontFamily: 'monospace' }}>
                        {cfg.ultimo_numero_pedido ?? 0}
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: '11px', color: GRAY }}>
                        Próximo pedido: <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                          {cfg.prefijo_pedido || 'NP'}-{String((cfg.ultimo_numero_pedido ?? 0) + 1).padStart(6, '0')}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid #EDF2F7', paddingTop: '18px' }}>
                  <p style={{ margin: '0 0 10px', fontSize: '13px', color: GRAY }}>
                    ⚠️ Reiniciar la numeración hará que el próximo pedido comience desde <strong>000001</strong>.
                  </p>
                  <button onClick={() => setModalReinicio(true)} disabled={reiniciando}
                    style={{ padding: '9px 18px', backgroundColor: '#FFF5F5', color: RED, border: `1px solid ${RED}`,
                      borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
                    🔄 Reiniciar numeración
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mensajes y botón guardar */}
          {error && (
            <div style={{ marginTop: '14px', backgroundColor: '#FFF5F5', color: RED,
              padding: '10px 14px', borderRadius: '8px', fontSize: '13px' }}>
              {error}
            </div>
          )}
          {exito && (
            <div style={{ marginTop: '14px', backgroundColor: '#F0FFF4', color: GREEN,
              padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}>
              ✅ Configuración guardada correctamente
            </div>
          )}
          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={guardar} disabled={guardando}
              style={{ padding: '11px 28px', backgroundColor: guardando ? '#BEE3F8' : GREEN, color: '#fff',
                border: 'none', borderRadius: '9px', cursor: guardando ? 'not-allowed' : 'pointer',
                fontSize: '14px', fontWeight: 700, transition: 'background 0.15s' }}>
              {guardando ? '⏳ Guardando...' : '💾 Guardar configuración'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default PiConfig;
