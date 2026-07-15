import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE } from '../../../config/api';

// ─── COLORES ─────────────────────────────────────────────────
const NAVY  = '#1B2A4A';
const BLUE  = '#2B6CB0';
const GREEN = '#38A169';
const SEP   = '#63B3ED';
const GRAY  = '#718096';
const TEXT  = '#2D3748';
const BG    = '#F4F6F9';

const MAPEO_KEY = 'pi_mapeo_productos';

function getToken() {
  try { const s = localStorage.getItem('pi_session'); return s ? JSON.parse(s).token : ''; } catch { return ''; }
}
function hdr(): Record<string, string> { return { 'x-pi-token': getToken() }; }
function fmtFecha(f: string | null) {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── SKELETON ─────────────────────────────────────────────────
function Sk({ w = '80%', h = 14 }: { w?: string; h?: number }) {
  return <div style={{ width: w, height: h, borderRadius: 5, background: '#E2E8F0', display: 'inline-block' }} />;
}

// ─── CAMPOS DEL SISTEMA ───────────────────────────────────────
const CAMPOS: { campo: string; label: string; requerido: boolean }[] = [
  { campo: 'codigo',        label: 'Código',              requerido: true  },
  { campo: 'detalle',       label: 'Descripción',          requerido: true  },
  { campo: 'precio_venta',  label: 'Precio venta',         requerido: false },
  { campo: 'rubro',         label: 'Rubro / Observaciones',requerido: false },
  { campo: 'marca',         label: 'Marca',                requerido: false },
  { campo: 'unidad_medida', label: 'Unidad de medida',     requerido: false },
  { campo: 'ean',           label: 'EAN / Código barras',  requerido: false },
  { campo: 'proveedor',     label: 'Proveedor',            requerido: false },
];

type Mapeo = Record<string, string>;
type Analisis = { columnas: string[]; muestra: Record<string, string>[]; total_filas: number };

// ─── MODAL IMPORTAR EXCEL (2 PASOS) ──────────────────────────
function ModalImportarExcel({ onCerrar, onExito }: { onCerrar: () => void; onExito: () => void }) {
  const [paso, setPaso]           = useState<1 | 2>(1);
  const [archivo, setArchivo]     = useState<File | null>(null);
  const [analisis, setAnalisis]   = useState<Analisis | null>(null);
  const [mapeo, setMapeo]         = useState<Mapeo>(() => {
    try { return JSON.parse(localStorage.getItem(MAPEO_KEY) || '{}'); } catch { return {}; }
  });
  const [analizando, setAnalizando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<{ importados: number; errores: number; total: number } | null>(null);
  const [error, setError]         = useState('');

  // ── Paso 1: analizar archivo ──────────────────────────────
  const analizar = async (f: File) => {
    setError(''); setAnalizando(true);
    try {
      const fd = new FormData();
      fd.append('archivo', f);
      const r = await fetch(`${API_BASE}/api/pi/importar/productos/analizar`, { method: 'POST', headers: hdr(), body: fd });
      const d = await r.json();
      if (!r.ok || !d.ok) { setError(d.error || 'Error al analizar el archivo'); setAnalizando(false); return; }
      setAnalisis(d);
      setPaso(2);
    } catch { setError('Error de conexión'); }
    setAnalizando(false);
  };

  const onSeleccionarArchivo = (f: File) => {
    if (!f.name.endsWith('.xls') && !f.name.endsWith('.xlsx')) {
      setError('Solo se aceptan archivos .xls y .xlsx');
      return;
    }
    setArchivo(f); setError('');
    analizar(f);
  };

  // ── Paso 2: importar con mapeo ────────────────────────────
  const importar = async () => {
    if (!archivo || !analisis) return;
    const faltantes = CAMPOS.filter(c => c.requerido && !mapeo[c.campo]);
    if (faltantes.length > 0) {
      setError(`Campos obligatorios sin mapear: ${faltantes.map(c => c.label).join(', ')}`);
      return;
    }
    setError(''); setImportando(true);
    try {
      // Guardar mapeo en localStorage
      localStorage.setItem(MAPEO_KEY, JSON.stringify(mapeo));

      const fd = new FormData();
      fd.append('archivo', archivo);
      fd.append('mapeo', JSON.stringify(mapeo));
      const r = await fetch(`${API_BASE}/api/pi/importar/productos`, { method: 'POST', headers: hdr(), body: fd });
      const d = await r.json();
      if (!r.ok || !d.ok) { setError(d.error || 'Error al importar'); setImportando(false); return; }
      setResultado(d);
      onExito();
    } catch { setError('Error de conexión'); }
    setImportando(false);
  };

  const inp: React.CSSProperties = {
    padding: '7px 10px', border: '1px solid #CBD5E0', borderRadius: '6px',
    fontSize: '13px', background: '#fff', color: TEXT, width: '100%',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '14px', width: '100%', maxWidth: '640px',
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.20)' }}>

        {/* Cabecera */}
        <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid #EDF2F7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: NAVY }}>
              📥 Importar productos desde Excel
            </h3>
            <button onClick={onCerrar}
              style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: GRAY, lineHeight: 1 }}>✕</button>
          </div>
          {/* Indicador de pasos */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px', alignItems: 'center' }}>
            {[1, 2].map(n => (
              <React.Fragment key={n}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '12px', fontWeight: 700,
                  backgroundColor: paso >= n ? BLUE : '#EDF2F7',
                  color: paso >= n ? '#fff' : GRAY,
                }}>
                  {resultado && n === 2 ? '✓' : n}
                </div>
                <span style={{ fontSize: '12px', color: paso === n ? BLUE : GRAY, fontWeight: paso === n ? 700 : 400 }}>
                  {n === 1 ? 'Subir archivo' : 'Mapear columnas'}
                </span>
                {n < 2 && <div style={{ flex: 1, height: 2, backgroundColor: paso >= 2 ? BLUE : '#EDF2F7' }} />}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div style={{ padding: '24px 28px' }}>

          {/* ── RESULTADO FINAL ── */}
          {resultado ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
              <p style={{ fontSize: '18px', fontWeight: 700, color: GREEN, margin: '0 0 8px' }}>
                {resultado.importados.toLocaleString('es-AR')} productos importados
              </p>
              {resultado.errores > 0 && (
                <p style={{ fontSize: '13px', color: '#DD6B20', margin: '0 0 6px' }}>
                  ⚠️ {resultado.errores} filas con errores (omitidas)
                </p>
              )}
              <p style={{ fontSize: '12px', color: GRAY, margin: '0 0 20px' }}>
                Total procesado: {resultado.total.toLocaleString('es-AR')} filas
              </p>
              <button onClick={onCerrar}
                style={{ padding: '10px 32px', backgroundColor: BLUE, color: '#fff', border: 'none',
                  borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 700 }}>
                Cerrar
              </button>
            </div>
          ) : paso === 1 ? (
            /* ── PASO 1: Dropzone ── */
            <>
              <div
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onSeleccionarArchivo(f); }}
                onDragOver={e => e.preventDefault()}
                onClick={() => document.getElementById('pi-file-input')?.click()}
                style={{
                  border: `2px dashed ${archivo ? GREEN : SEP}`, borderRadius: '12px', padding: '40px 24px',
                  textAlign: 'center', cursor: analizando ? 'wait' : 'pointer',
                  backgroundColor: archivo ? '#F0FFF4' : '#F7FAFC', marginBottom: '16px',
                }}>
                <input id="pi-file-input" type="file" accept=".xls,.xlsx" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) onSeleccionarArchivo(f); }} />
                <div style={{ fontSize: '36px', marginBottom: '10px' }}>{analizando ? '⏳' : archivo ? '✅' : '📂'}</div>
                <p style={{ margin: 0, fontSize: '13px', color: archivo ? GREEN : GRAY, fontWeight: archivo ? 700 : 400 }}>
                  {analizando ? 'Analizando columnas...' : archivo ? archivo.name : 'Arrastrá o hacé clic para seleccionar .xls / .xlsx'}
                </p>
              </div>
              {error && (
                <div style={{ backgroundColor: '#FFF5F5', color: '#E53E3E', padding: '10px 14px',
                  borderRadius: '7px', fontSize: '13px' }}>{error}</div>
              )}
            </>
          ) : (
            /* ── PASO 2: Mapeo de columnas ── */
            <>
              {/* Info del archivo */}
              {analisis && (
                <div style={{ backgroundColor: '#EBF8FF', borderRadius: '8px', padding: '10px 14px',
                  marginBottom: '20px', fontSize: '13px', color: BLUE }}>
                  📄 <strong>{archivo?.name}</strong> — {analisis.total_filas.toLocaleString('es-AR')} filas —{' '}
                  {analisis.columnas.length} columnas detectadas
                </div>
              )}

              {/* Grilla de mapeo */}
              <div style={{ marginBottom: '20px' }}>
                <p style={{ margin: '0 0 12px', fontSize: '13px', color: GRAY, fontWeight: 600 }}>
                  Asigná cada campo del sistema a la columna de tu Excel:
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {CAMPOS.map(({ campo, label, requerido }) => (
                    <div key={campo}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700,
                        color: requerido ? NAVY : GRAY, marginBottom: '4px' }}>
                        {label}{requerido && <span style={{ color: '#E53E3E' }}> *</span>}
                      </label>
                      <select
                        value={mapeo[campo] || ''}
                        onChange={e => setMapeo(prev => ({ ...prev, [campo]: e.target.value }))}
                        style={inp}>
                        <option value="">— sin asignar —</option>
                        {analisis?.columnas.filter(c => c !== '').map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Vista previa con mapeo actual */}
              {analisis && analisis.muestra.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 700, color: GRAY }}>
                    Vista previa (3 primeras filas con el mapeo actual):
                  </p>
                  <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #EDF2F7' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: '11px', width: '100%', minWidth: '400px' }}>
                      <thead style={{ backgroundColor: '#F7FAFC' }}>
                        <tr>
                          {CAMPOS.filter(c => mapeo[c.campo]).map(c => (
                            <th key={c.campo} style={{ padding: '7px 10px', textAlign: 'left',
                              color: GRAY, fontWeight: 600, borderBottom: '1px solid #EDF2F7', whiteSpace: 'nowrap' }}>
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analisis.muestra.map((fila, i) => (
                          <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                            {CAMPOS.filter(c => mapeo[c.campo]).map(c => (
                              <td key={c.campo} style={{ padding: '6px 10px', color: TEXT,
                                borderBottom: '1px solid #EDF2F7', maxWidth: '150px',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {String(fila[mapeo[c.campo]] ?? '—')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <p style={{ margin: '0 0 16px', fontSize: '11px', color: GRAY, fontStyle: 'italic' }}>
                💾 Este mapeo se guardará automáticamente para la próxima importación.
              </p>

              {error && (
                <div style={{ backgroundColor: '#FFF5F5', color: '#E53E3E', padding: '10px 14px',
                  borderRadius: '7px', fontSize: '13px', marginBottom: '12px' }}>{error}</div>
              )}

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between', alignItems: 'center' }}>
                <button onClick={() => { setPaso(1); setArchivo(null); setAnalisis(null); setError(''); }}
                  style={{ padding: '9px 16px', border: '1px solid #CBD5E0', borderRadius: '8px',
                    background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>
                  ← Volver
                </button>
                <button onClick={importar} disabled={importando}
                  style={{ padding: '10px 28px', backgroundColor: importando ? '#BEE3F8' : GREEN,
                    color: '#fff', border: 'none', borderRadius: '8px',
                    cursor: importando ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 700 }}>
                  {importando ? '⏳ Importando...' : `✅ Importar ${analisis ? analisis.total_filas.toLocaleString('es-AR') : ''} productos`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────
function PiProductos() {
  const [productos, setProductos]   = useState<any[]>([]);
  const [total, setTotal]           = useState(0);
  const [stats, setStats]           = useState<any>(null);
  const [rubros, setRubros]         = useState<string[]>([]);
  const [marcas, setMarcas]         = useState<string[]>([]);
  const [cargando, setCargando]     = useState(true);
  const [modalExcel, setModalExcel] = useState(false);

  const [buscar, setBuscar]             = useState('');
  const [filtroRubro, setFiltroRubro]   = useState('');
  const [filtroMarca, setFiltroMarca]   = useState('');
  const [filtroActivo, setFiltroActivo] = useState(true);
  const [page, setPage]                 = useState(1);
  const [limit, setLimit]               = useState(25);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargarStats = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/pi/importar/productos/stats`, { headers: hdr() });
      if (r.ok) setStats(await r.json());
    } catch { /* silencioso */ }
  }, []);

  const cargar = useCallback(async (pg: number, q: string) => {
    setCargando(true);
    try {
      const p = new URLSearchParams({ page: String(pg), limit: String(limit), activo: String(filtroActivo) });
      if (q) p.set('q', q);
      if (filtroRubro) p.set('rubro', filtroRubro);
      if (filtroMarca) p.set('marca', filtroMarca);
      const r = await fetch(`${API_BASE}/api/pi/importar/productos?${p}`, { headers: hdr() });
      if (r.ok) {
        const d = await r.json();
        setProductos(d.productos ?? []);
        setTotal(d.total ?? 0);
        if (d.productos?.length) {
          setRubros(prev => Array.from(new Set([...prev, ...d.productos.map((p: any) => p.rubro).filter(Boolean)])).sort());
          setMarcas(prev => Array.from(new Set([...prev, ...d.productos.map((p: any) => p.marca).filter(Boolean)])).sort());
        }
      }
    } finally { setCargando(false); }
  }, [limit, filtroRubro, filtroMarca, filtroActivo]);

  useEffect(() => { cargarStats(); cargar(1, ''); }, []); // eslint-disable-line

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => { setPage(1); cargar(1, buscar); }, 300);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [buscar]); // eslint-disable-line

  useEffect(() => { setPage(1); cargar(1, buscar); }, [filtroRubro, filtroMarca, filtroActivo, limit]); // eslint-disable-line

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const exportarExcel = () => {
    const sep  = '\t';
    const cols = ['Código', 'Descripción', 'Rubro', 'Marca', 'Unidad', 'Proveedor', 'Precio Venta', 'Activo'];
    const filas = productos.map(p => [p.codigo, p.detalle, p.rubro, p.marca, p.unidad_medida, p.proveedor, p.precio_venta, p.activo ? 'Sí' : 'No']);
    const contenido = [cols.join(sep), ...filas.map(f => f.join(sep))].join('\n');
    const blob = new Blob([contenido], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url; a.download = 'productos.xls'; a.click();
    URL.revokeObjectURL(url);
  };

  const inp: React.CSSProperties = { padding: '8px 12px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', background: '#fff', color: TEXT };

  return (
    <div style={{ padding: '24px', backgroundColor: BG, minHeight: '100vh' }}>
      {modalExcel && (
        <ModalImportarExcel
          onCerrar={() => setModalExcel(false)}
          onExito={() => { cargarStats(); cargar(page, buscar); }} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: NAVY }}>🛒 Productos</h1>
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
          { label: 'Total activos',     valor: stats ? String(stats.total)  : <Sk />, color: BLUE },
          { label: 'Rubros distintos',  valor: stats ? String(stats.rubros) : <Sk />, color: SEP  },
          { label: 'Última importación',valor: stats ? fmtFecha(stats.ultima_importacion) : <Sk />, color: GRAY },
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
          placeholder="🔍 Código o descripción..." style={{ ...inp, minWidth: '200px' }} />
        <select value={filtroRubro} onChange={e => setFiltroRubro(e.target.value)} style={inp}>
          <option value="">Todos los rubros</option>
          {rubros.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={filtroMarca} onChange={e => setFiltroMarca(e.target.value)} style={inp}>
          <option value="">Todas las marcas</option>
          {marcas.map(m => <option key={m} value={m}>{m}</option>)}
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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '700px' }}>
            <thead style={{ backgroundColor: '#F7FAFC', borderBottom: `2px solid ${SEP}` }}>
              <tr>
                {['Código', 'Descripción', 'Rubro', 'Marca', 'Unidad', 'Proveedor', 'Estado'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: GRAY, fontWeight: 600, fontSize: '11px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#F7FAFC', borderBottom: '1px solid #EDF2F7' }}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} style={{ padding: '11px 14px' }}><Sk w={j === 1 ? '90%' : '65%'} /></td>
                    ))}
                  </tr>
                ))
              ) : productos.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: GRAY }}>
                  {total === 0 ? 'Sin productos. Cargá un Excel para empezar.' : 'Sin resultados para los filtros actuales.'}
                </td></tr>
              ) : productos.map((p, i) => (
                <tr key={p.id} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#F7FAFC', borderBottom: '1px solid #EDF2F7' }}>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '12px', color: NAVY, fontWeight: 600 }}>{p.codigo || '—'}</td>
                  <td style={{ padding: '10px 14px', color: TEXT, maxWidth: '260px' }}>{p.detalle || '—'}</td>
                  <td style={{ padding: '10px 14px', color: GRAY, fontSize: '12px' }}>{p.rubro || '—'}</td>
                  <td style={{ padding: '10px 14px', color: GRAY, fontSize: '12px' }}>{p.marca || '—'}</td>
                  <td style={{ padding: '10px 14px', color: GRAY, fontSize: '12px' }}>{p.unidad_medida || '—'}</td>
                  <td style={{ padding: '10px 14px', color: GRAY, fontSize: '12px' }}>{p.proveedor || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px',
                      color: p.activo ? GREEN : GRAY, backgroundColor: p.activo ? '#F0FFF4' : '#F7FAFC',
                      border: `1px solid ${p.activo ? GREEN : '#CBD5E0'}` }}>
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #EDF2F7', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: GRAY }}>
          <span>Total: {total.toLocaleString('es-AR')} productos</span>
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

export default PiProductos;
