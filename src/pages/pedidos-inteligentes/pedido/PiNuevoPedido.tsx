import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../../config/api';

// ─── COLORES ─────────────────────────────────────────────────
const NAVY   = '#1B2A4A';
const BLUE   = '#2B6CB0';
const GREEN  = '#38A169';
const RED    = '#E53E3E';
const ORANGE = '#DD6B20';
const SEP    = '#63B3ED';
const GRAY   = '#718096';
const TEXT   = '#2D3748';
const BG     = '#F4F6F9';

function getToken() {
  try { const s = localStorage.getItem('pi_session'); return s ? JSON.parse(s).token : ''; } catch { return ''; }
}
function hdr() { return { 'x-pi-token': getToken() } as Record<string, string>; }

// ─── TIPOS ───────────────────────────────────────────────────
interface Cliente { id: number; numero_cliente: string; razon_social: string; zona?: string; condicion_venta?: string; }
interface Alternativa { id: number; codigo: string; detalle: string; rubro?: string; marca?: string; precio_venta?: number; confianza?: number; }
interface ItemPedido {
  texto_original: string;
  cantidad: number;
  cantidad_original: number;
  producto_id: number | null;
  codigo: string | null;
  descripcion: string;
  rubro: string | null;
  marca: string | null;
  precio_venta: number | null;
  estado_matcheo: 'exacto' | 'parcial' | 'precio' | 'no_encontrado';
  confianza_matcheo: number;
  alternativas: Alternativa[];
  es_manual: boolean;
  // UI
  _editando?: boolean;
  _viendo_alt?: boolean;
  _desc_manual?: string;
}

type PasoId = 1 | 2 | 3;
type MetodoId = 'foto' | 'texto' | 'excel' | 'manual';

// ─── BADGE ESTADO ─────────────────────────────────────────────
function BadgeEstado({ estado }: { estado: ItemPedido['estado_matcheo'] }) {
  const MAP = {
    exacto:          { label: 'Exacto',         bg: '#F0FFF4', color: GREEN,  emoji: '🟢' },
    precio:          { label: 'Precio bajo',     bg: '#F0FFF4', color: GREEN,  emoji: '🟢' },
    parcial:         { label: 'Revisar',         bg: '#FFFAF0', color: ORANGE, emoji: '🟡' },
    no_encontrado:   { label: 'Sin identificar', bg: '#FFF5F5', color: RED,    emoji: '🔴' },
  };
  const c = MAP[estado];
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '10px',
      color: c.color, backgroundColor: c.bg, border: `1px solid ${c.color}`, whiteSpace: 'nowrap' }}>
      {c.emoji} {c.label}
    </span>
  );
}

// ─── PASO 1 — SELECCIONAR CLIENTE ────────────────────────────
function PasoCliente({ onSeleccionar }: { onSeleccionar: (cliente: { id: number | null; nombre: string }) => void }) {
  const [buscar, setBuscar]           = useState('');
  const [resultados, setResultados]   = useState<Cliente[]>([]);
  const [clienteSel, setClienteSel]   = useState<Cliente | null>(null);
  const [ocasional, setOcasional]     = useState(false);
  const [nombreLib, setNombreLib]     = useState('');
  const [abierto, setAbierto]         = useState(false);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscarClientes = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setResultados([]); return; }
    try {
      const r = await fetch(`${API_BASE}/api/pi/importar/clientes?q=${encodeURIComponent(q)}&limit=8`, { headers: hdr() });
      if (r.ok) { const d = await r.json(); setResultados(d.clientes ?? []); setAbierto(true); }
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => buscarClientes(buscar), 300);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [buscar, buscarClientes]);

  const seleccionar = (c: Cliente) => {
    setClienteSel(c); setBuscar(''); setResultados([]); setAbierto(false); setOcasional(false);
    onSeleccionar({ id: c.id, nombre: c.razon_social });
  };

  const confirmarOcasional = () => {
    if (!nombreLib.trim()) return;
    onSeleccionar({ id: null, nombre: nombreLib.trim() });
  };

  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #CBD5E0',
    borderRadius: '8px', fontSize: '14px', color: TEXT, boxSizing: 'border-box' };

  return (
    <div style={{ maxWidth: '580px', margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700, color: NAVY }}>Paso 1 — Seleccionar cliente</h2>

      {clienteSel && !ocasional ? (
        <div style={{ backgroundColor: '#EBF8FF', border: `1px solid ${SEP}`, borderRadius: '10px', padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ margin: '0 0 4px', fontWeight: 700, color: NAVY, fontSize: '15px' }}>{clienteSel.razon_social}</p>
              <p style={{ margin: 0, fontSize: '13px', color: GRAY }}>
                #{clienteSel.numero_cliente} · Zona: {clienteSel.zona || '—'} · {clienteSel.condicion_venta || '—'}
              </p>
            </div>
            <button onClick={() => { setClienteSel(null); onSeleccionar({ id: -1, nombre: '' }); }}
              style={{ padding: '5px 12px', border: '1px solid #CBD5E0', borderRadius: '6px', background: '#fff',
                cursor: 'pointer', fontSize: '12px', color: GRAY }}>
              Cambiar
            </button>
          </div>
        </div>
      ) : ocasional ? (
        <div style={{ backgroundColor: '#FFFAF0', border: `1px solid ${ORANGE}`, borderRadius: '10px', padding: '16px 20px' }}>
          <p style={{ margin: '0 0 10px', fontWeight: 600, color: ORANGE, fontSize: '13px' }}>Cliente ocasional</p>
          <input value={nombreLib} onChange={e => setNombreLib(e.target.value)} placeholder="Nombre del cliente *"
            style={{ ...inp, marginBottom: '10px' }} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setOcasional(false)}
              style={{ padding: '8px 16px', border: '1px solid #CBD5E0', borderRadius: '7px', background: '#fff',
                cursor: 'pointer', fontSize: '13px', color: GRAY }}>
              Cancelar
            </button>
            <button onClick={confirmarOcasional} disabled={!nombreLib.trim()}
              style={{ padding: '8px 18px', backgroundColor: !nombreLib.trim() ? '#BEE3F8' : BLUE, color: '#fff',
                border: 'none', borderRadius: '7px', cursor: !nombreLib.trim() ? 'not-allowed' : 'pointer',
                fontSize: '13px', fontWeight: 700 }}>
              Confirmar
            </button>
          </div>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="🔍 Buscar por número o nombre..."
            style={inp} onFocus={() => buscar.length >= 2 && setAbierto(true)} />
          {abierto && resultados.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
              backgroundColor: '#fff', border: '1px solid #CBD5E0', borderRadius: '8px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)', marginTop: '4px', maxHeight: '280px', overflowY: 'auto' }}>
              {resultados.map(c => (
                <div key={c.id} onClick={() => seleccionar(c)}
                  style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #EDF2F7', fontSize: '13px' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F7FAFC')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                  <span style={{ fontWeight: 600, color: NAVY }}>{c.numero_cliente}</span>
                  <span style={{ color: TEXT, marginLeft: '8px' }}>{c.razon_social}</span>
                  {c.zona && <span style={{ color: GRAY, marginLeft: '8px', fontSize: '11px' }}>{c.zona}</span>}
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: '12px', textAlign: 'center' }}>
            <button onClick={() => { setOcasional(true); setClienteSel(null); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: BLUE,
                textDecoration: 'underline', fontWeight: 600 }}>
              + Cliente ocasional (sin cuenta)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PASO 2 — INGRESAR PEDIDO ─────────────────────────────────
function PasoIngreso({ onItems }: { onItems: (items: ItemPedido[]) => void }) {
  const [metodo, setMetodo] = useState<MetodoId | null>(null);

  // Foto
  const [foto, setFoto]             = useState<File | null>(null);
  const [previewFoto, setPreviewFoto] = useState('');
  const [cargandoFoto, setCargandoFoto] = useState(false);

  // Texto
  const [texto, setTexto]           = useState('');
  const [cargandoTexto, setCargandoTexto] = useState(false);

  // Excel
  const [excelFile, setExcelFile]   = useState<File | null>(null);
  const [columnas, setColumnas]     = useState<string[]>([]);
  const [colCant, setColCant]       = useState('');
  const [colDesc, setColDesc]       = useState('');
  const [cargandoExcel, setCargandoExcel] = useState(false);

  // Manual
  const [buscarProd, setBuscarProd] = useState('');
  const [prodResults, setProdResults] = useState<any[]>([]);
  const [manualItems, setManualItems] = useState<ItemPedido[]>([]);
  const [cantManual, setCantManual] = useState(1);
  const debManual = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [error, setError] = useState('');

  // ── FOTO ──
  const seleccionarFoto = (f: File) => {
    setFoto(f);
    const reader = new FileReader();
    reader.onload = e => setPreviewFoto(e.target?.result as string);
    reader.readAsDataURL(f);
  };

  const procesarFoto = async () => {
    if (!foto) return;
    setError(''); setCargandoFoto(true);
    try {
      const fd = new FormData(); fd.append('imagen', foto);
      const r  = await fetch(`${API_BASE}/api/pi/procesar/foto`, { method: 'POST', headers: hdr(), body: fd });
      const d  = await r.json();
      if (!r.ok || !d.ok) { setError(d.error || 'Error al procesar foto'); return; }
      onItems(d.items);
    } catch { setError('Error de conexión'); } finally { setCargandoFoto(false); }
  };

  // ── TEXTO ──
  const procesarTexto = async () => {
    if (!texto.trim()) return;
    setError(''); setCargandoTexto(true);
    try {
      const r = await fetch(`${API_BASE}/api/pi/procesar/texto`, {
        method: 'POST', headers: { ...hdr(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) { setError(d.error || 'Error al procesar texto'); return; }
      onItems(d.items);
    } catch { setError('Error de conexión'); } finally { setCargandoTexto(false); }
  };

  // ── EXCEL ──
  const subirExcel = async (f: File) => {
    setExcelFile(f); setError(''); setCargandoExcel(true);
    try {
      const fd = new FormData(); fd.append('archivo', f);
      const r  = await fetch(`${API_BASE}/api/pi/procesar/excel`, { method: 'POST', headers: hdr(), body: fd });
      const d  = await r.json();
      if (!r.ok) { setError(d.error || 'Error al leer Excel'); return; }
      setColumnas(d.columnas || []);
      setColCant(d.columnas_detectadas?.cantidad || d.columnas?.[0] || '');
      setColDesc(d.columnas_detectadas?.descripcion || d.columnas?.[1] || '');
      if (d.ok && d.items) onItems(d.items);
    } catch { setError('Error de conexión'); } finally { setCargandoExcel(false); }
  };

  const reprocesarExcel = async () => {
    if (!excelFile || !colCant || !colDesc) return;
    setError(''); setCargandoExcel(true);
    try {
      const fd = new FormData(); fd.append('archivo', excelFile);
      fd.append('col_cantidad', colCant); fd.append('col_descripcion', colDesc);
      const r = await fetch(`${API_BASE}/api/pi/procesar/excel`, { method: 'POST', headers: hdr(), body: fd });
      const d = await r.json();
      if (!r.ok || !d.ok) { setError(d.error || 'Error'); return; }
      onItems(d.items);
    } catch { setError('Error de conexión'); } finally { setCargandoExcel(false); }
  };

  // ── MANUAL ──
  const buscarProductos = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setProdResults([]); return; }
    try {
      const r = await fetch(`${API_BASE}/api/pi/importar/productos?q=${encodeURIComponent(q)}&limit=8`, { headers: hdr() });
      if (r.ok) { const d = await r.json(); setProdResults(d.productos ?? []); }
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    if (debManual.current) clearTimeout(debManual.current);
    debManual.current = setTimeout(() => buscarProductos(buscarProd), 300);
    return () => { if (debManual.current) clearTimeout(debManual.current); };
  }, [buscarProd, buscarProductos]);

  const agregarManual = (p: any) => {
    setManualItems(prev => [...prev, {
      texto_original: p.detalle, cantidad: cantManual, cantidad_original: cantManual,
      producto_id: p.id, codigo: p.codigo, descripcion: p.detalle, rubro: p.rubro,
      marca: p.marca, precio_venta: p.precio_venta, estado_matcheo: 'exacto',
      confianza_matcheo: 100, alternativas: [], es_manual: true,
    }]);
    setBuscarProd(''); setProdResults([]); setCantManual(1);
  };

  const confirmarManual = () => { if (manualItems.length) onItems(manualItems); };

  // Botón de método
  const BtnMetodo = ({ id, icon, label }: { id: MetodoId; icon: string; label: string }) => (
    <button onClick={() => setMetodo(metodo === id ? null : id)}
      style={{ flex: 1, padding: '20px 12px', border: `2px solid ${metodo === id ? BLUE : '#CBD5E0'}`,
        borderRadius: '12px', backgroundColor: metodo === id ? '#EBF8FF' : '#fff', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', transition: 'all 0.15s' }}>
      <span style={{ fontSize: '28px' }}>{icon}</span>
      <span style={{ fontSize: '13px', fontWeight: 700, color: metodo === id ? BLUE : TEXT }}>{label}</span>
    </button>
  );

  const inp: React.CSSProperties = { padding: '9px 12px', border: '1px solid #CBD5E0', borderRadius: '8px', fontSize: '13px', color: TEXT };

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700, color: NAVY }}>Paso 2 — Ingresar pedido</h2>

      {error && <div style={{ backgroundColor: '#FFF5F5', color: RED, padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' }}>{error}</div>}

      {/* 4 botones método */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <BtnMetodo id="foto"   icon="📷" label="Foto"   />
        <BtnMetodo id="texto"  icon="💬" label="Texto"  />
        <BtnMetodo id="excel"  icon="📊" label="Excel"  />
        <BtnMetodo id="manual" icon="✏️" label="Manual" />
      </div>

      {/* ── PANEL FOTO ── */}
      {metodo === 'foto' && (
        <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          {!foto ? (
            <div onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) seleccionarFoto(f); }}
              onDragOver={e => e.preventDefault()}
              onClick={() => document.getElementById('pi-foto-input')?.click()}
              style={{ border: `2px dashed ${SEP}`, borderRadius: '10px', padding: '40px', textAlign: 'center', cursor: 'pointer', backgroundColor: '#F7FAFC' }}>
              <input id="pi-foto-input" type="file" accept="image/jpeg,image/png,image/jpg" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) seleccionarFoto(f); }} />
              <div style={{ fontSize: '40px', marginBottom: '10px' }}>📷</div>
              <p style={{ margin: 0, color: GRAY, fontSize: '13px' }}>Arrastrá o hacé clic — JPG/PNG</p>
            </div>
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <img src={previewFoto} alt="preview" style={{ maxWidth: '100%', maxHeight: '280px', borderRadius: '8px', objectFit: 'contain' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button onClick={() => { setFoto(null); setPreviewFoto(''); }}
                  style={{ padding: '8px 16px', border: '1px solid #CBD5E0', borderRadius: '7px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>
                  Cambiar foto
                </button>
                <button onClick={procesarFoto} disabled={cargandoFoto}
                  style={{ padding: '8px 20px', backgroundColor: cargandoFoto ? '#BEE3F8' : BLUE, color: '#fff',
                    border: 'none', borderRadius: '7px', cursor: cargandoFoto ? 'not-allowed' : 'pointer',
                    fontSize: '13px', fontWeight: 700, minWidth: '180px' }}>
                  {cargandoFoto ? '🤖 Leyendo imagen con IA...' : '🤖 Procesar foto'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── PANEL TEXTO ── */}
      {metodo === 'texto' && (
        <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={10}
            placeholder={`Pegá aquí el pedido del cliente.\nEjemplo:\n10 codo pvc 110x90\n5 tee pp 1/2\n20 union doble 25...`}
            style={{ ...inp, width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'monospace', marginBottom: '12px' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={procesarTexto} disabled={!texto.trim() || cargandoTexto}
              style={{ padding: '10px 24px', backgroundColor: !texto.trim() || cargandoTexto ? '#BEE3F8' : BLUE,
                color: '#fff', border: 'none', borderRadius: '8px', cursor: !texto.trim() || cargandoTexto ? 'not-allowed' : 'pointer',
                fontSize: '14px', fontWeight: 700 }}>
              {cargandoTexto ? '⏳ Procesando...' : '💬 Procesar texto'}
            </button>
          </div>
        </div>
      )}

      {/* ── PANEL EXCEL ── */}
      {metodo === 'excel' && (
        <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          {!excelFile ? (
            <div onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) subirExcel(f); }}
              onDragOver={e => e.preventDefault()}
              onClick={() => document.getElementById('pi-excel-input')?.click()}
              style={{ border: `2px dashed ${SEP}`, borderRadius: '10px', padding: '40px', textAlign: 'center', cursor: 'pointer', backgroundColor: '#F7FAFC' }}>
              <input id="pi-excel-input" type="file" accept=".xls,.xlsx" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) subirExcel(f); }} />
              <div style={{ fontSize: '40px', marginBottom: '10px' }}>📊</div>
              <p style={{ margin: 0, color: GRAY, fontSize: '13px' }}>Arrastrá o hacé clic — .xls / .xlsx</p>
            </div>
          ) : columnas.length > 0 && (
            <>
              <p style={{ margin: '0 0 12px', fontWeight: 600, color: NAVY, fontSize: '13px' }}>✅ {excelFile.name} — Seleccioná las columnas:</p>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ fontSize: '12px', color: GRAY, display: 'block', marginBottom: '4px' }}>Columna cantidad</label>
                  <select value={colCant} onChange={e => setColCant(e.target.value)} style={{ ...inp, background: '#fff' }}>
                    {columnas.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: GRAY, display: 'block', marginBottom: '4px' }}>Columna descripción</label>
                  <select value={colDesc} onChange={e => setColDesc(e.target.value)} style={{ ...inp, background: '#fff' }}>
                    {columnas.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setExcelFile(null); setColumnas([]); }}
                  style={{ padding: '8px 14px', border: '1px solid #CBD5E0', borderRadius: '7px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>
                  Cambiar archivo
                </button>
                <button onClick={reprocesarExcel} disabled={cargandoExcel}
                  style={{ padding: '8px 18px', backgroundColor: cargandoExcel ? '#BEE3F8' : BLUE, color: '#fff',
                    border: 'none', borderRadius: '7px', cursor: cargandoExcel ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 700 }}>
                  {cargandoExcel ? '⏳ Procesando...' : '📊 Procesar Excel'}
                </button>
              </div>
            </>
          )}
          {cargandoExcel && <p style={{ textAlign: 'center', color: GRAY, fontSize: '13px', marginTop: '12px' }}>Procesando Excel...</p>}
        </div>
      )}

      {/* ── PANEL MANUAL ── */}
      {metodo === 'manual' && (
        <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input value={buscarProd} onChange={e => setBuscarProd(e.target.value)}
                placeholder="🔍 Buscar producto..." style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
              {prodResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                  backgroundColor: '#fff', border: '1px solid #CBD5E0', borderRadius: '8px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)', marginTop: '4px', maxHeight: '220px', overflowY: 'auto' }}>
                  {prodResults.map(p => (
                    <div key={p.id} onClick={() => agregarManual(p)}
                      style={{ padding: '8px 14px', cursor: 'pointer', borderBottom: '1px solid #EDF2F7', fontSize: '12px' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F7FAFC')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                      <span style={{ fontWeight: 600, color: NAVY }}>{p.codigo}</span>
                      <span style={{ color: TEXT, marginLeft: '8px' }}>{p.detalle}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <input type="number" min={1} value={cantManual} onChange={e => setCantManual(Number(e.target.value))}
              style={{ ...inp, width: '70px', textAlign: 'center' }} />
          </div>

          {manualItems.length > 0 && (
            <>
              <div style={{ marginBottom: '12px', maxHeight: '200px', overflowY: 'auto' }}>
                {manualItems.map((it, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 10px', backgroundColor: i % 2 === 0 ? '#fff' : '#F7FAFC',
                    borderRadius: '6px', fontSize: '12px' }}>
                    <span><strong>{it.cantidad}x</strong> {it.descripcion}</span>
                    <button onClick={() => setManualItems(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: RED, fontSize: '14px' }}>✕</button>
                  </div>
                ))}
              </div>
              <button onClick={confirmarManual}
                style={{ width: '100%', padding: '10px', backgroundColor: GREEN, color: '#fff', border: 'none',
                  borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 700 }}>
                ✅ Confirmar {manualItems.length} item{manualItems.length !== 1 ? 's' : ''}
              </button>
            </>
          )}
          {manualItems.length === 0 && (
            <p style={{ textAlign: 'center', color: GRAY, fontSize: '13px', padding: '20px 0 0' }}>
              Buscá y agregá productos uno por uno
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PASO 3 — REVISIÓN DE MATCHEO ────────────────────────────
function PasoRevision({
  items, onChange, clienteNombre, clienteId, onConfirmado,
}: {
  items: ItemPedido[];
  onChange: (items: ItemPedido[]) => void;
  clienteNombre: string;
  clienteId: number | null;
  onConfirmado: (resultado: { numero_completo: string; total_items: number; pedido_id: number }) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError]             = useState('');

  const exactos  = items.filter(it => it.estado_matcheo === 'exacto' || it.estado_matcheo === 'precio').length;
  const revisar  = items.filter(it => it.estado_matcheo === 'parcial').length;
  const sinId    = items.filter(it => it.estado_matcheo === 'no_encontrado').length;

  const actualizar = (idx: number, cambios: Partial<ItemPedido>) => {
    const nuevo = [...items];
    nuevo[idx]  = { ...nuevo[idx], ...cambios };
    onChange(nuevo);
  };

  const elegirAlternativa = (idx: number, alt: Alternativa) => {
    actualizar(idx, {
      producto_id:    alt.id,
      codigo:         alt.codigo,
      descripcion:    alt.detalle,
      rubro:          alt.rubro || null,
      estado_matcheo: 'exacto',
      _viendo_alt:    false,
    });
  };

  const confirmar = async () => {
    setError(''); setConfirmando(true);
    try {
      const r = await fetch(`${API_BASE}/api/pi/procesar/confirmar`, {
        method: 'POST', headers: { ...hdr(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id:     clienteId,
          cliente_nombre: clienteNombre,
          items: items.map(it => ({
            texto_original:    it.texto_original,
            cantidad:          it.cantidad,
            cantidad_original: it.cantidad_original,
            producto_id:       it.producto_id,
            codigo:            it.codigo,
            descripcion:       it._desc_manual || it.descripcion,
            rubro:             it.rubro,
            estado_matcheo:    it.estado_matcheo,
            confianza_matcheo: it.confianza_matcheo,
            es_manual:         it.es_manual,
          })),
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) { setError(d.error || 'Error al confirmar'); return; }
      onConfirmado({ numero_completo: d.numero_completo, total_items: d.total_items, pedido_id: d.pedido_id });
    } catch { setError('Error de conexión'); } finally { setConfirmando(false); }
  };

  const puedeConfirmar = sinId === 0 || items.every(
    it => it.estado_matcheo !== 'no_encontrado' || (it._desc_manual || it.descripcion)?.trim()
  );

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 700, color: NAVY }}>Paso 3 — Revisión del pedido</h2>

      {/* Barra resumen */}
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '14px 20px', marginBottom: '16px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: GREEN,  fontWeight: 700, fontSize: '13px' }}>🟢 {exactos} exactos</span>
        <span style={{ color: ORANGE, fontWeight: 700, fontSize: '13px' }}>🟡 {revisar} a revisar</span>
        <span style={{ color: RED,    fontWeight: 700, fontSize: '13px' }}>🔴 {sinId} sin identificar</span>
        <span style={{ color: GRAY,   fontSize: '12px', marginLeft: 'auto' }}>Total: {items.length} items</span>
      </div>

      {error && <div style={{ backgroundColor: '#FFF5F5', color: RED, padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '12px' }}>{error}</div>}

      {/* Tabla items */}
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '600px' }}>
            <thead style={{ backgroundColor: '#F7FAFC', borderBottom: `2px solid ${SEP}` }}>
              <tr>
                {['Cant.', 'Original', 'Código', 'Descripción', 'Rubro', 'Estado', 'Acción'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: GRAY, fontWeight: 600, fontSize: '11px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <React.Fragment key={idx}>
                  <tr style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC', borderBottom: '1px solid #EDF2F7' }}>
                    {/* Cantidad */}
                    <td style={{ padding: '8px 12px' }}>
                      <input type="number" min={1} value={it.cantidad}
                        onChange={e => actualizar(idx, { cantidad: Number(e.target.value) })}
                        style={{ width: '56px', padding: '4px 6px', border: '1px solid #CBD5E0', borderRadius: '5px', fontSize: '13px', textAlign: 'center' }} />
                    </td>
                    {/* Texto original */}
                    <td style={{ padding: '8px 12px', color: GRAY, fontSize: '11px', maxWidth: '120px' }}>
                      <span style={{ wordBreak: 'break-word' }}>{it.texto_original}</span>
                    </td>
                    {/* Código */}
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '11px', color: NAVY }}>{it.codigo || '—'}</td>
                    {/* Descripción */}
                    <td style={{ padding: '8px 12px', maxWidth: '220px' }}>
                      {it.estado_matcheo === 'no_encontrado' ? (
                        <input value={it._desc_manual !== undefined ? it._desc_manual : it.descripcion}
                          onChange={e => actualizar(idx, { _desc_manual: e.target.value, descripcion: e.target.value })}
                          placeholder="Ingresá el nombre del producto"
                          style={{ width: '100%', padding: '5px 8px', border: `1px solid ${RED}`, borderRadius: '5px',
                            fontSize: '12px', boxSizing: 'border-box', color: RED }} />
                      ) : (
                        <span style={{ color: TEXT, fontSize: '12px' }}>{it.descripcion}</span>
                      )}
                    </td>
                    {/* Rubro */}
                    <td style={{ padding: '8px 12px', color: GRAY, fontSize: '11px' }}>{it.rubro || '—'}</td>
                    {/* Badge */}
                    <td style={{ padding: '8px 12px' }}><BadgeEstado estado={it.estado_matcheo} /></td>
                    {/* Acción */}
                    <td style={{ padding: '8px 12px' }}>
                      {(it.estado_matcheo === 'parcial' || it.estado_matcheo === 'precio') && it.alternativas.length > 0 && (
                        <button onClick={() => actualizar(idx, { _viendo_alt: !it._viendo_alt })}
                          style={{ padding: '4px 10px', border: `1px solid ${ORANGE}`, borderRadius: '6px',
                            background: '#fff', cursor: 'pointer', fontSize: '11px', color: ORANGE, fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {it._viendo_alt ? 'Cerrar' : 'Ver alternativas'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {/* Panel alternativas */}
                  {it._viendo_alt && (
                    <tr key={`alt-${idx}`}>
                      <td colSpan={7} style={{ padding: '0 12px 12px 40px', backgroundColor: '#FFFAF0' }}>
                        <p style={{ margin: '8px 0 6px', fontSize: '11px', color: ORANGE, fontWeight: 700 }}>Elegí el producto correcto:</p>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {it.alternativas.map(alt => (
                            <button key={alt.id} onClick={() => elegirAlternativa(idx, alt)}
                              style={{ padding: '6px 12px', border: `1px solid ${SEP}`, borderRadius: '7px',
                                background: '#fff', cursor: 'pointer', fontSize: '12px', textAlign: 'left', maxWidth: '260px' }}>
                              <span style={{ fontWeight: 700, color: NAVY }}>{alt.codigo || '—'}</span>
                              <span style={{ color: TEXT, marginLeft: '6px' }}>{alt.detalle}</span>
                              {alt.confianza && <span style={{ color: GRAY, fontSize: '10px', marginLeft: '6px' }}>{alt.confianza}%</span>}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Botón confirmar */}
      <button onClick={confirmar} disabled={!puedeConfirmar || confirmando}
        style={{ width: '100%', padding: '14px', backgroundColor: !puedeConfirmar || confirmando ? '#BEE3F8' : GREEN,
          color: '#fff', border: 'none', borderRadius: '10px',
          cursor: !puedeConfirmar || confirmando ? 'not-allowed' : 'pointer',
          fontSize: '15px', fontWeight: 700, transition: 'background 0.15s' }}>
        {confirmando ? '⏳ Generando pedido...' : `✅ Confirmar pedido (${items.length} items)`}
      </button>
      {!puedeConfirmar && (
        <p style={{ textAlign: 'center', color: RED, fontSize: '12px', marginTop: '8px' }}>
          Completá los productos en rojo antes de confirmar
        </p>
      )}
    </div>
  );
}

// ─── PANTALLA RESULTADO ───────────────────────────────────────
function PantallaResultado({ resultado, clienteNombre, onNuevo, navigateTo }: {
  resultado: { numero_completo: string; total_items: number; pedido_id: number };
  clienteNombre: string;
  onNuevo: () => void;
  navigateTo: (path: string) => void;
}) {
  const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', textAlign: 'center', padding: '32px 0' }}>
      <div style={{ fontSize: '60px', marginBottom: '16px' }}>✅</div>
      <h2 style={{ margin: '0 0 8px', fontSize: '22px', fontWeight: 800, color: GREEN }}>¡Pedido generado!</h2>
      <div style={{ fontSize: '28px', fontWeight: 700, color: BLUE, marginBottom: '20px' }}>{resultado.numero_completo}</div>
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '24px', textAlign: 'left' }}>
        {[
          { label: 'Cliente',      valor: clienteNombre },
          { label: 'Total items',  valor: String(resultado.total_items) },
          { label: 'Fecha',        valor: fecha },
        ].map(r => (
          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #EDF2F7', fontSize: '13px' }}>
            <span style={{ color: GRAY }}>{r.label}</span>
            <span style={{ fontWeight: 600, color: TEXT }}>{r.valor}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => navigateTo(`/pedidos-inteligentes/nota/${resultado.pedido_id}`)}
          style={{ padding: '10px 18px', backgroundColor: NAVY, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
          🖨️ Imprimir nota de pedido
        </button>
        <button onClick={onNuevo}
          style={{ padding: '10px 18px', backgroundColor: GREEN, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
          ✅ Nuevo pedido
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════
function PiNuevoPedido() {
  const navigate = useNavigate();
  const [paso, setPaso]               = useState<PasoId>(1);
  const [cliente, setCliente]         = useState<{ id: number | null; nombre: string } | null>(null);
  const [items, setItems]             = useState<ItemPedido[]>([]);
  const [resultado, setResultado]     = useState<{ numero_completo: string; total_items: number; pedido_id: number } | null>(null);

  const resetear = () => { setPaso(1); setCliente(null); setItems([]); setResultado(null); };

  const onClienteSeleccionado = (c: { id: number | null; nombre: string }) => {
    if (c.id === -1) { setCliente(null); return; }
    setCliente(c);
    setPaso(2);
  };

  const onItems = (nuevosItems: ItemPedido[]) => {
    setItems(nuevosItems);
    setPaso(3);
  };

  // Indicadores de paso
  const pasos = [
    { n: 1, label: 'Cliente' },
    { n: 2, label: 'Pedido'  },
    { n: 3, label: 'Revisión'},
  ];

  return (
    <div style={{ padding: '24px', backgroundColor: BG, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: NAVY }}>📋 Nuevo Pedido</h1>
        <button onClick={() => navigate('/pedidos-inteligentes/dashboard')}
          style={{ padding: '8px 16px', border: '1px solid #CBD5E0', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>
          ← Volver
        </button>
      </div>

      {resultado ? (
        <PantallaResultado resultado={resultado} clienteNombre={cliente?.nombre || '—'} onNuevo={resetear} navigateTo={navigate} />
      ) : (
        <>
          {/* Stepper */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '28px', maxWidth: '500px' }}>
            {pasos.map((p, i) => (
              <React.Fragment key={p.n}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: paso >= p.n ? BLUE : '#CBD5E0', color: '#fff', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>
                    {paso > p.n ? '✓' : p.n}
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: paso === p.n ? 700 : 400, color: paso >= p.n ? NAVY : GRAY }}>
                    {p.label}
                  </span>
                </div>
                {i < pasos.length - 1 && (
                  <div style={{ flex: 1, height: '2px', backgroundColor: paso > p.n ? BLUE : '#EDF2F7', margin: '0 12px' }} />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Contenido por paso */}
          {paso === 1 && <PasoCliente onSeleccionar={onClienteSeleccionado} />}
          {paso === 2 && (
            <>
              {cliente && (
                <div style={{ marginBottom: '16px', padding: '10px 16px', backgroundColor: '#EBF8FF', borderRadius: '8px', fontSize: '13px', color: NAVY, fontWeight: 600 }}>
                  Cliente: {cliente.nombre}
                  <button onClick={() => setPaso(1)} style={{ marginLeft: '12px', background: 'none', border: 'none', cursor: 'pointer', color: BLUE, fontSize: '12px', textDecoration: 'underline' }}>Cambiar</button>
                </div>
              )}
              <PasoIngreso onItems={onItems} />
            </>
          )}
          {paso === 3 && items.length > 0 && (
            <PasoRevision
              items={items} onChange={setItems}
              clienteNombre={cliente?.nombre || '—'} clienteId={cliente?.id ?? null}
              onConfirmado={r => { setResultado(r); }}
            />
          )}
        </>
      )}
    </div>
  );
}

export default PiNuevoPedido;
