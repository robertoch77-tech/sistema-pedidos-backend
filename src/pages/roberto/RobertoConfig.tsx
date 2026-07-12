import React, { useState, useEffect } from 'react';

const NAVY  = '#1B2A4A';
const BLUE  = '#2B6CB0';
const GREEN = '#38A169';
const SEP   = '#63B3ED';
const GRAY  = '#718096';
const TEXT  = '#2D3748';
const BG    = '#F4F6F9';
const RED   = '#E53E3E';

interface Config {
  tamano_defecto: 'A4' | 'A5';
  tamano_tickets: 'A4' | 'A5';
  membrete: string;
  campana: boolean;
  whatsapp_notif: boolean;
  whatsapp_numero: string;
  nombre_comercial: string;
  cuit: string;
  direccion: string;
  logo_url: string;
}

const inputStyle: React.CSSProperties = {
  width: '100%', border: '1.5px solid #CBD5E0', borderRadius: '8px',
  padding: '9px 12px', fontSize: '14px', color: TEXT,
  outline: 'none', boxSizing: 'border-box', backgroundColor: '#fff',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600, color: GRAY,
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px',
};

function Toggle({ activo, onChange }: { activo: boolean; onChange: () => void }) {
  return (
    <div onClick={onChange} style={{ width: '42px', height: '24px', borderRadius: '12px', backgroundColor: activo ? GREEN : '#CBD5E0', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background-color 0.2s' }}>
      <div style={{ position: 'absolute', top: '3px', left: activo ? '21px' : '3px', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
    </div>
  );
}

function RadioGroup({ opciones, valor, onChange }: { opciones: string[]; valor: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: '16px' }}>
      {opciones.map(op => (
        <label key={op} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px', color: TEXT, fontWeight: valor === op ? 600 : 400 }}>
          <input type="radio" checked={valor === op} onChange={() => onChange(op)}
            style={{ accentColor: BLUE, width: '16px', height: '16px', cursor: 'pointer' }} />
          {op}
        </label>
      ))}
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', overflow: 'hidden', marginBottom: '20px' }}>
      <div style={{ padding: '16px 24px', borderBottom: `2px solid ${SEP}` }}>
        <h3 style={{ fontSize: '13px', fontWeight: 700, color: NAVY, margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{titulo}</h3>
      </div>
      <div style={{ padding: '20px 24px' }}>{children}</div>
    </div>
  );
}

function RobertoConfig() {
  const [config, setConfig] = useState<Config>({
    tamano_defecto: 'A4',
    tamano_tickets: 'A4',
    membrete: '',
    campana: true,
    whatsapp_notif: false,
    whatsapp_numero: '',
    nombre_comercial: '',
    cuit: '',
    direccion: '',
    logo_url: '',
  });
  const [logoError, setLogoError] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem('roberto_portal_session');
      if (!raw) { window.location.href = '/roberto/login'; return; }
      const s = JSON.parse(raw);
      if (!s.token) { window.location.href = '/roberto/login'; return; }
      // Pre-populate con datos del cliente
      setConfig(prev => ({
        ...prev,
        nombre_comercial: s.cliente?.nombre_comercial || '',
        campana: !!s.modulos?.notificaciones,
      }));
      // Cargar config guardada si existe
      const savedCfg = localStorage.getItem(`roberto_config_${s.cliente?.id}`);
      if (savedCfg) setConfig(JSON.parse(savedCfg));
    } catch {
      window.location.href = '/roberto/login';
    }
  }, []);

  const setF = <K extends keyof Config>(field: K) => (val: Config[K]) =>
    setConfig(prev => ({ ...prev, [field]: val }));

  const guardar = async () => {
    setGuardando(true);
    setError('');
    try {
      await new Promise(r => setTimeout(r, 600));
      const raw = localStorage.getItem('roberto_portal_session');
      if (raw) {
        const s = JSON.parse(raw);
        localStorage.setItem(`roberto_config_${s.cliente?.id}`, JSON.stringify(config));
      }
      setExito('Configuración guardada correctamente');
      setTimeout(() => setExito(''), 3000);
    } catch {
      setError('Error al guardar. Intentá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, padding: '28px', maxWidth: '860px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: NAVY, margin: '0 0 4px' }}>⚙️ Configuración</h1>
          <p style={{ fontSize: '13px', color: GRAY, margin: 0 }}>Ajustá las preferencias de tu sistema</p>
        </div>
        <button onClick={() => window.location.href = '/roberto/dashboard'}
          style={{ backgroundColor: '#EDF2F7', color: GRAY, border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          ← Volver
        </button>
      </div>

      {exito && <div style={{ backgroundColor: '#F0FFF4', border: `1px solid ${GREEN}`, borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', fontSize: '13px', color: GREEN, fontWeight: 600 }}>✅ {exito}</div>}
      {error && <div style={{ backgroundColor: '#FFF5F5', border: `1px solid ${RED}`, borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', fontSize: '13px', color: RED, fontWeight: 600 }}>❌ {error}</div>}

      {/* ── SECCIÓN IMPRESIÓN ──────────────────────────────── */}
      <Seccion titulo="🖨️ Impresión">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '20px' }}>
          <div>
            <label style={labelStyle}>Tamaño por defecto</label>
            <RadioGroup opciones={['A4', 'A5']} valor={config.tamano_defecto} onChange={v => setF('tamano_defecto')(v as 'A4' | 'A5')} />
          </div>
          <div>
            <label style={labelStyle}>Tickets de venta</label>
            <RadioGroup opciones={['A4', 'A5']} valor={config.tamano_tickets} onChange={v => setF('tamano_tickets')(v as 'A4' | 'A5')} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Membrete del negocio</label>
          <textarea
            value={config.membrete}
            onChange={e => setF('membrete')(e.target.value)}
            rows={4}
            placeholder="Nombre del negocio&#10;Dirección&#10;Teléfono / WhatsApp&#10;CUIT"
            style={{ ...inputStyle, resize: 'vertical', lineHeight: '1.5' }}
          />
          {config.membrete && (
            <div style={{ marginTop: '12px' }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>Vista previa</p>
              <div style={{ border: '1px dashed #CBD5E0', borderRadius: '8px', padding: '16px', backgroundColor: '#FAFAFA', whiteSpace: 'pre-line', fontSize: '13px', color: TEXT, lineHeight: '1.6' }}>
                {config.membrete}
              </div>
            </div>
          )}
        </div>
      </Seccion>

      {/* ── SECCIÓN NOTIFICACIONES ─────────────────────────── */}
      <Seccion titulo="🔔 Notificaciones">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #EDF2F7' }}>
            <div>
              <p style={{ fontSize: '14px', fontWeight: 600, color: TEXT, margin: '0 0 2px' }}>Campana de notificaciones</p>
              <p style={{ fontSize: '12px', color: GRAY, margin: 0 }}>Muestra alertas en el panel</p>
            </div>
            <Toggle activo={config.campana} onChange={() => setF('campana')(!config.campana)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #EDF2F7' }}>
            <div>
              <p style={{ fontSize: '14px', fontWeight: 600, color: TEXT, margin: '0 0 2px' }}>Notificaciones por WhatsApp</p>
              <p style={{ fontSize: '12px', color: GRAY, margin: 0 }}>Recibí alertas en tu celular</p>
            </div>
            <Toggle activo={config.whatsapp_notif} onChange={() => setF('whatsapp_notif')(!config.whatsapp_notif)} />
          </div>
          {config.whatsapp_notif && (
            <div>
              <label style={labelStyle}>Número de WhatsApp</label>
              <input type="tel" value={config.whatsapp_numero} onChange={e => setF('whatsapp_numero')(e.target.value)}
                placeholder="5491123456789" style={inputStyle} />
              <p style={{ fontSize: '12px', color: GRAY, marginTop: '4px' }}>Formato internacional sin + (ej: 5491123456789)</p>
            </div>
          )}
        </div>
      </Seccion>

      {/* ── SECCIÓN DATOS DEL NEGOCIO ──────────────────────── */}
      <Seccion titulo="🏢 Datos del negocio">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={labelStyle}>Nombre comercial</label>
            <input type="text" value={config.nombre_comercial} onChange={e => setF('nombre_comercial')(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>CUIT</label>
            <input type="text" value={config.cuit} onChange={e => setF('cuit')(e.target.value)} placeholder="20-12345678-9" style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Dirección</label>
            <input type="text" value={config.direccion} onChange={e => setF('direccion')(e.target.value)} placeholder="Av. Ejemplo 1234, Ciudad" style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>URL del logo</label>
          <input type="url" value={config.logo_url} onChange={e => { setF('logo_url')(e.target.value); setLogoError(false); }}
            placeholder="https://mi-negocio.com/logo.png" style={inputStyle} />
          {config.logo_url && !logoError && (
            <div style={{ marginTop: '12px' }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>Vista previa del logo</p>
              <div style={{ border: '1px dashed #CBD5E0', borderRadius: '8px', padding: '16px', display: 'inline-block', backgroundColor: '#FAFAFA' }}>
                <img src={config.logo_url} alt="Logo" onError={() => setLogoError(true)}
                  style={{ maxHeight: '80px', maxWidth: '240px', objectFit: 'contain' }} />
              </div>
            </div>
          )}
          {logoError && (
            <p style={{ fontSize: '12px', color: RED, marginTop: '6px' }}>No se pudo cargar la imagen. Verificá la URL.</p>
          )}
        </div>
      </Seccion>

      {/* Botones */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <button onClick={guardar} disabled={guardando}
          style={{ backgroundColor: guardando ? '#C6F6D5' : GREEN, color: '#fff', border: 'none', borderRadius: '9px', padding: '11px 28px', fontSize: '14px', fontWeight: 700, cursor: guardando ? 'not-allowed' : 'pointer' }}>
          {guardando ? 'Guardando...' : '✅ Guardar configuración'}
        </button>
        <button onClick={() => window.location.href = '/roberto/dashboard'}
          style={{ backgroundColor: '#EDF2F7', color: GRAY, border: 'none', borderRadius: '9px', padding: '11px 22px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
          ← Volver
        </button>
      </div>
    </div>
  );
}

export default RobertoConfig;
