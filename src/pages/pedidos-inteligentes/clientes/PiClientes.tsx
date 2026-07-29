import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE } from '../../../config/api';

const NAVY  = '#1B2A4A';
const BLUE  = '#2B6CB0';
const GREEN = '#38A169';
const SEP   = '#63B3ED';
const GRAY  = '#718096';
const TEXT  = '#2D3748';
const BG    = '#F4F6F9';

function getToken() {
  try { const s = localStorage.getItem('pi_session'); return s ? JSON.parse(s).token : ''; } catch { return ''; }
}
function hdr() { return { 'x-pi-token': getToken() } as Record<string, string>; }
function fmtFecha(f: string | null) {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function Sk({ w = '80%', h = 14 }: { w?: string; h?: number }) {
  return <div style={{ width: w, height: h, borderRadius: 5, background: '#E2E8F0', display: 'inline-block' }} />;
}

// ─── MODAL CARGAR EXCEL ───────────────────────────────────────
function ModalCargarExcel({ onCerrar, onExito }: { onCerrar: () => void; onExito: () => void }) {
  const [archivo, setArchivo]     = useState<File | null>(null);
  const [cargando, setCargando]   = useState(false);
  const [resultado, setResultado] = useState<{ importados: number; errores: number; total: number } | null>(null);
  const [error, setError]         = useState('');
  const [progreso, setProgreso]   = useState(0);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.xls') || f.name.endsWith('.xlsx'))) setArchivo(f);
    else setError('Solo se aceptan archivos .xls y .xlsx');
  };

  const subir = async () => {
    if (!archivo) return;
    setError(''); setCargando(true); setProgreso(10);
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      setProgreso(30);
      const r = await fetch(`${API_BASE}/api/pi/importar/clientes`, { method: 'POST', headers: hdr(), body: fd });
      setProgreso(90);
      const d = await r.json();
      if (!r.ok || !d.ok) { setError(d.error || 'Error al importar'); setCargando(false); setProgreso(0); return; }
      setResultado(d);
      setProgreso(100);
      onExito();
    } catch { setError('Error de conexión'); } finally { setCargando(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '32px', width: '460px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700, color: NAVY }}>
          📥 Cargar Excel — Clientes
        </h3>

        {!resultado ? (
          <>
            <div onDrop={onDrop} onDragOver={e => e.preventDefault()}
              onClick={() => document.getElementById('pi-cli-input')?.click()}
              style={{ border: `2px dashed ${archivo ? GREEN : SEP}`, borderRadius: '10px', padding: '32px',
                textAlign: 'center', cursor: 'pointer', backgroundColor: archivo ? '#F0FFF4' : '#F7FAFC',
                marginBottom: '16px' }}>
              <input id="pi-cli-input" type="file" accept=".xls,.xlsx" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) setArchivo(f); }} />
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>{archivo ? '✅' : '📂'}</div>
              <p style={{ margin: 0, fontSize: '13px', color: archivo ? GREEN : GRAY, fontWeight: archivo ? 700 : 400 }}>
                {archivo ? archivo.name : 'Arrastrá o hacé clic para seleccionar .xls / .xlsx'}
              </p>
            </div>

            {error && (
              <div style={{ backgroundColor: '#FFF5F5', color: '#E53E3E', padding: '10px 14px',
                borderRadius: '7px', fontSize: '13px', marginBottom: '12px' }}>{error}</div>
            )}

            {cargando && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ height: '6px', backgroundColor: '#EDF2F7', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progreso}%`, backgroundColor: BLUE,
                    transition: 'width 0.3s', borderRadius: '3px' }} />
                </div>
                <p style={{ margin: '6px 0 0', fontSize: '12px', color: GRAY, textAlign: 'center' }}>Importando...</p>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={onCerrar}
                style={{ padding: '9px 18px', border: '1px solid #CBD5E0', borderRadius: '8px',
                  background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>
                Cancelar
              </button>
              <button onClick={subir} disabled={!archivo || cargando}
                style={{ padding: '9px 18px', backgroundColor: !archivo || cargando ? '#BEE3F8' : GREEN,
                  color: '#fff', border: 'none', borderRadius: '8px',
                  cursor: !archivo || cargando ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 700 }}>
                {cargando ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
              <p style={{ fontSize: '16px', fontWeight: 700, color: GREEN, margin: '0 0 6px' }}>
                {resultado.importados} clientes importados
              </p>
              {resultado.errores > 0 && (
                <p style={{ fontSize: '13px', color: '#DD6B20', margin: '0 0 12px' }}>
                  ⚠️ {resultado.errores} filas con errores (omitidas)
                </p>
              )}
              <p style={{ fontSize: '12px', color: GRAY, margin: 0 }}>Total procesado: {resultado.total} filas</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
              <button onClick={onCerrar}
                style={{ padding: '10px 28px', backgroundColor: BLUE, color: '#fff', border: 'none',
                  borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 700 }}>
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────
function PiClientes() {
  const [clientes, setClientes]   = useState<any[]>([]);
  const [total, setTotal]         = useState(0);
  const [stats, setStats]         = useState<any>(null);
  const [zonas, setZonas]         = useState<string[]>([]);
  const [cargando, setCargando]   = useState(true);
  const [modalExcel, setModalExcel] = useState(false);

  const [buscar, setBuscar]           = useState('');
  const [filtroZona, setFiltroZona]   = useState('');
  const [filtroActivo, setFiltroActivo] = useState(true);
  const [page, setPage]               = useState(1);
  const [limit, setLimit]             = useState(25);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargarStats = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/pi/importar/clientes/stats`, { headers: hdr() });
      if (r.ok) setStats(await r.json());
    } catch { /* silencioso */ }
  }, []);

  const cargar = useCallback(async (pg: number, q: string) => {
    setCargando(true);
    try {
      const p = new URLSearchParams({ page: String(pg), limit: String(limit), activo: String(filtroActivo) });
      if (q) p.set('q', q);
      if (filtroZona) p.set('zona', filtroZona);
      const r = await fetch(`${API_BASE}/api/pi/importar/clientes?${p}`, { headers: hdr() });
      if (r.ok) {
        const d = await r.json();
        setClientes(d.clientes ?? []);
        setTotal(d.total ?? 0);
        if (d.clientes?.length)
          setZonas(prev => Array.from(new Set([...prev, ...d.clientes.map((c: any) => c.zona).filter(Boolean)])).sort());
      }
    } finally { setCargando(false); }
  }, [limit, filtroZona, filtroActivo]);

  useEffect(() => { cargarStats(); cargar(1, ''); }, []); // eslint-disable-line

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => { setPage(1); cargar(1, buscar); }, 300);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [buscar]); // eslint-disable-line

  useEffect(() => { setPage(1); cargar(1, buscar); }, [filtroZona, filtroActivo, limit]); // eslint-disable-line

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const exportarExcel = () => {
    const sep = '\t';
    const cols = ['Número', 'Razón Social', 'CUIT', 'Localidad', 'Teléfono', 'Zona', 'Lista Precio', 'Activo'];
    const filas = clientes.map(c => [c.numero_cliente, c.razon_social, c.cuit, c.localidad, c.telefono, c.zona, c.lista_precio, c.activo ? 'Sí' : 'No']);
    const contenido = [cols.join(sep), ...filas.map(f => f.join(sep))].join('\n');
    const blob = new Blob([contenido], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'clientes.xls'; a.click();
    URL.revokeObjectURL(url);
  };

  const inp: React.CSSProperties = { padding: '8px 12px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', background: '#fff', color: TEXT };

  return (
    <div style={{ padding: '24px', backgroundColor: BG, minHeight: '100vh' }}>
      {modalExcel && (
        <ModalCargarExcel onCerrar={() => setModalExcel(false)}
          onExito={() => { cargarStats(); cargar(page, buscar); }} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: NAVY }}>👥 Clientes</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setModalExcel(true)}
            style={{ padding: '9px 16px', backgroundColor: GREEN, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
            📥 Cargar Excel
          </button>
          <button onClick={exportarExcel}
            style={{ padding: '9px 16px', backgroundColor: BLUE, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
            📤 Exportar Excel
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '14px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { label: 'Total activos',      valor: stats ? String(stats.total) : <Sk />, color: BLUE  },
          { label: 'Zonas distintas',    valor: stats ? String(stats.zonas) : <Sk />, color: SEP   },
          { label: 'Última importación', valor: stats ? fmtFecha(stats.ultima_importacion) : <Sk />, color: GRAY },
        ].map(c => (
          <div key={c.label} style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '16px 20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${c.color}`, flex: 1, minWidth: '160px' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: c.color, marginBottom: '2px' }}>{c.valor}</div>
            <div style={{ fontSize: '12px', color: GRAY }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '14px 18px', marginBottom: '16px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={buscar} onChange={e => setBuscar(e.target.value)}
          placeholder="🔍 Número o razón social..." style={{ ...inp, minWidth: '220px' }} />
        <select value={filtroZona} onChange={e => setFiltroZona(e.target.value)} style={inp}>
          <option value="">Todas las zonas</option>
          {zonas.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: GRAY, cursor: 'pointer' }}>
          <input type="checkbox" checked={filtroActivo} onChange={e => setFiltroActivo(e.target.checked)} />
          Solo activos
        </label>
        <select value={limit} onChange={e => setLimit(Number(e.target.value))} style={inp}>
          {[25, 50, 100].map(v => <option key={v} value={v}>{v} por página</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '750px' }}>
            <thead style={{ backgroundColor: '#F7FAFC', borderBottom: `2px solid ${SEP}` }}>
              <tr>
                {['Número', 'Razón Social', 'CUIT', 'Localidad', 'Teléfono', 'Zona', 'Lista', 'Estado'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: GRAY, fontWeight: 600, fontSize: '11px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#F7FAFC', borderBottom: '1px solid #EDF2F7' }}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} style={{ padding: '11px 14px' }}><Sk w={j === 1 ? '90%' : '60%'} /></td>
                    ))}
                  </tr>
                ))
              ) : clientes.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: GRAY }}>
                  {total === 0 ? 'Sin clientes. Cargá un Excel para empezar.' : 'Sin resultados para los filtros actuales.'}
                </td></tr>
              ) : clientes.map((c, i) => (
                <tr key={c.id} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#F7FAFC', borderBottom: '1px solid #EDF2F7' }}>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '12px', color: NAVY, fontWeight: 600 }}>{c.numero_cliente || '—'}</td>
                  <td style={{ padding: '10px 14px', color: TEXT, maxWidth: '200px' }}>{c.razon_social || '—'}</td>
                  <td style={{ padding: '10px 14px', color: GRAY, fontSize: '12px', whiteSpace: 'nowrap' }}>{c.cuit || '—'}</td>
                  <td style={{ padding: '10px 14px', color: GRAY, fontSize: '12px' }}>{c.localidad || '—'}</td>
                  <td style={{ padding: '10px 14px', color: GRAY, fontSize: '12px', whiteSpace: 'nowrap' }}>{c.telefono || c.celular || '—'}</td>
                  <td style={{ padding: '10px 14px', color: GRAY, fontSize: '12px' }}>{c.zona || '—'}</td>
                  <td style={{ padding: '10px 14px', color: GRAY, fontSize: '12px' }}>{c.lista_precio || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px',
                      color: c.activo ? GREEN : GRAY, backgroundColor: c.activo ? '#F0FFF4' : '#F7FAFC',
                      border: `1px solid ${c.activo ? GREEN : '#CBD5E0'}` }}>
                      {c.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid #EDF2F7', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: GRAY }}>
          <span>Total: {total} clientes</span>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button onClick={() => { const p = Math.max(1, page - 1); setPage(p); cargar(p, buscar); }} disabled={page === 1}
              style={{ padding: '4px 10px', border: '1px solid #CBD5E0', borderRadius: '5px',
                cursor: page === 1 ? 'default' : 'pointer', background: '#fff', opacity: page === 1 ? 0.4 : 1 }}>‹</button>
            <span>{page} / {totalPages}</span>
            <button onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); cargar(p, buscar); }} disabled={page === totalPages}
              style={{ padding: '4px 10px', border: '1px solid #CBD5E0', borderRadius: '5px',
                cursor: page === totalPages ? 'default' : 'pointer', background: '#fff', opacity: page === totalPages ? 0.4 : 1 }}>›</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PiClientes;
