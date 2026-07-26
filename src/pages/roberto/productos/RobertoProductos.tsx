import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../../config/api';

const API   = API_BASE;
const NAVY  = '#1B2A4A';
const BLUE  = '#2B6CB0';
const GREEN = '#38A169';
const RED   = '#E53E3E';
const SEP   = '#63B3ED';
const GRAY  = '#718096';
const TEXT  = '#2D3748';
const BG    = '#F4F6F9';
const ORANGE = '#DD6B20';
const YELLOW = '#D69E2E';
const CALC_BG = '#EBF8FF';
const CALC_BG2 = '#F0FFF4';

const CLOUD_NAME    = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME    || '';
const UPLOAD_PRESET = process.env.REACT_APP_CLOUDINARY_UPLOAD_PRESET || '';

// ── helpers ──────────────────────────────────────────────────────────────────

function getToken() {
  try { const s = localStorage.getItem('superadmin_session'); return s ? JSON.parse(s).token : ''; } catch { return ''; }
}
function getClienteId() {
  try { const s = localStorage.getItem('roberto_portal_session'); return s ? JSON.parse(s).cliente?.id : null; } catch { return null; }
}
function getClienteNombre() {
  try { return JSON.parse(localStorage.getItem('roberto_portal_session') || '{}').cliente?.nombre_comercial || 'Negocio'; } catch { return 'Negocio'; }
}
function numFmt(n: number | null | undefined, dec = 2): string {
  if (!n && n !== 0) return '—';
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: dec });
}
function pctFmt(n: number | null | undefined): string {
  return (!n && n !== 0) ? '—' : `${Number(n)}%`;
}
function fmtFecha(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR');
}
function calcPcFinal(pc: number, d1: number, d2: number, d3: number) {
  return pc * (1 - d1 / 100) * (1 - d2 / 100) * (1 - d3 / 100);
}
function calcPv(pcFinal: number, i1: number, i2: number, iva: number, ut: number) {
  return pcFinal * (1 + i1 / 100) * (1 + i2 / 100) * (1 + iva / 100) * (1 + ut / 100);
}

// ── types ────────────────────────────────────────────────────────────────────

interface ProductoReal {
  id: number;
  codigo: string | null;
  descripcion: string;
  marca: string | null;
  rubro: string | null;
  proveedor_id: number | null;
  unidad_medida: string | null;
  ean: string | null;
  imagen_url: string | null;
  precio_costo: number;
  dto_1: number; dto_2: number; dto_3: number;
  imp_1: number; imp_2: number;
  alicuota_iva: number;
  utilidad_1: number; utilidad_2: number; utilidad_3: number;
  precio_venta_final: number;
  precio_venta_2: number;
  precio_venta_3: number;
  stock_actual: number;
  stock_minimo: number;
  activo: boolean;
  destacado: boolean;
  creado_en: string;
  modificado_en: string;
}

interface EditState {
  precio_costo: string;
  dto_1: string; dto_2: string; dto_3: string;
  imp_1: string; imp_2: string; alicuota_iva: string;
  utilidad_1: string; utilidad_2: string; utilidad_3: string;
  marca: string; rubro: string; unidad_medida: string;
  ean: string; stock_minimo: string;
}

interface FiltrosOpts { proveedores: { id: number; nombre: string }[]; marcas: string[]; rubros: string[]; }

interface HojaInfo { nombre: string; columnas: string[]; total_filas: number; muestra: Record<string, string>[]; }

interface DiffItem {
  campo: string; label: string;
  anterior: number | string | null;
  nuevo: number | string | null;
}
interface DiffAnalisis {
  temp_id: string;
  resumen: {
    nuevos: number; actualizar: number; prefijados: number; ausentes: number;
    precios_suben: number; precios_bajan: number; precios_sin_cambio: number;
    variacion_promedio: number;
  };
  actualizar: { codigo: string; descripcion: string; id: number; diffs: DiffItem[] }[];
  prefijados: { codigo_original: string; codigo_nuevo: string; descripcion: string; proveedor_existente: string }[];
  ausentes: { codigo: string; descripcion: string; precio_costo: number }[];
}

// ── estilos ───────────────────────────────────────────────────────────────────

const btnStyle = (bg: string, color = '#fff', disabled = false): React.CSSProperties => ({
  backgroundColor: disabled ? '#CBD5E0' : bg, color: disabled ? '#A0AEC0' : color,
  border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px',
  fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap',
  opacity: disabled ? 0.7 : 1, transition: 'opacity 0.15s',
});
const inputSt: React.CSSProperties = {
  border: '1.5px solid #CBD5E0', borderRadius: '6px', padding: '5px 8px',
  fontSize: '12px', color: TEXT, backgroundColor: '#fff', outline: 'none',
  width: '100%', boxSizing: 'border-box',
};
const selectSt: React.CSSProperties = { ...inputSt, cursor: 'pointer' };
const labelSt: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600, color: GRAY,
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px',
};
const thSt = (sorted = false): React.CSSProperties => ({
  padding: '8px 10px', textAlign: 'left', fontSize: '11px', fontWeight: 700,
  color: sorted ? BLUE : TEXT, backgroundColor: '#EBF4FF',
  borderBottom: '2px solid #BEE3F8', whiteSpace: 'nowrap', cursor: 'pointer',
  userSelect: 'none', position: 'sticky', top: 0, zIndex: 1,
});
const tdSt: React.CSSProperties = {
  padding: '6px 8px', fontSize: '12px', color: TEXT, borderBottom: '1px solid #EDF2F7',
  whiteSpace: 'nowrap',
};
const calcTd: React.CSSProperties = { ...tdSt, backgroundColor: CALC_BG, fontWeight: 600, color: BLUE };
const calcTd2: React.CSSProperties = { ...tdSt, backgroundColor: CALC_BG2, fontWeight: 600, color: GREEN };

// ── BadgeEstado ───────────────────────────────────────────────────────────────

function BadgeEstado({ activo }: { activo: boolean }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
      backgroundColor: activo ? '#F0FFF4' : '#FFF5F5', color: activo ? GREEN : RED,
    }}>{activo ? 'Activo' : 'Inactivo'}</span>
  );
}

// ── BarraProgreso ─────────────────────────────────────────────────────────────

function BarraProgreso({ paso, labels }: { paso: number; labels: string[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '14px 24px 0' }}>
      {labels.map((p, i) => {
        const num = i + 1; const activo = num === paso; const hecho = num < paso;
        return (
          <React.Fragment key={p}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '12px', fontWeight: 700, marginBottom: 3,
                backgroundColor: hecho ? GREEN : activo ? BLUE : '#E2E8F0',
                color: hecho || activo ? '#fff' : GRAY,
              }}>{hecho ? '✓' : num}</div>
              <span style={{ fontSize: '10px', fontWeight: activo ? 700 : 400, color: activo ? BLUE : GRAY, whiteSpace: 'nowrap' }}>{p}</span>
            </div>
            {i < labels.length - 1 && <div style={{ flex: 2, height: 2, backgroundColor: hecho ? GREEN : '#E2E8F0', marginBottom: 14 }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MODAL IMPORTADOR V2
// ════════════════════════════════════════════════════════════════════════════

const CAMPOS_MAPEO = [
  { campo: 'codigo',       label: 'Código',          obligatorio: true },
  { campo: 'precio_costo', label: 'Precio costo' },
  { campo: 'precio_venta_1', label: 'Precio venta 1' },
  { campo: 'precio_venta_2', label: 'Precio venta 2' },
  { campo: 'precio_venta_3', label: 'Precio venta 3' },
  { campo: 'marca',        label: 'Marca' },
  { campo: 'rubro',        label: 'Rubro' },
  { campo: 'unidad_medida', label: 'Unidad medida' },
  { campo: 'ean',          label: 'EAN' },
  { campo: 'descuento_1',  label: 'Descuento 1%' },
  { campo: 'descuento_2',  label: 'Descuento 2%' },
  { campo: 'descuento_3',  label: 'Descuento 3%' },
  { campo: 'iva',          label: 'IVA%' },
  { campo: 'stock',        label: 'Stock' },
  { campo: 'stock_minimo', label: 'Stock mínimo' },
];

const letraCol = (i: number): string =>
  i < 26
    ? String.fromCharCode(65 + i)
    : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26));

function ModalImportadorV2({ onCerrar, onExito }: { onCerrar: () => void; onExito: () => void }) {
  const [paso, setPaso]           = useState(1);
  const [drag, setDrag]           = useState(false);
  const [archivo, setArchivo]     = useState<File | null>(null);
  const [proveedor, setProveedor] = useState('');
  const [cargando, setCargando]   = useState(false);
  const [error, setError]         = useState('');
  const [hojas, setHojas]         = useState<HojaInfo[]>([]);
  const [hojasOk, setHojasOk]    = useState<string[]>([]);
  const [mapeo, setMapeo]         = useState<Record<string, string>>({});
  const [descCols, setDescCols]   = useState<string[]>([]);
  const [marcaDef, setMarcaDef]   = useState('');
  const [rubroDef, setRubroDef]   = useState('');
  const [subId, setSubId]               = useState('');
  const [guardarMapeo, setGuardarMapeo] = useState(true);
  const [mapeoMsg, setMapeoMsg]         = useState('');
  const [mapeoDisponible, setMapeoDisponible] = useState<any>(null);
  const [claveMapeoActual, setClaveMapeoActual] = useState('');
  const [analisisDiff, setAnalisisDiff] = useState<DiffAnalisis | null>(null);
  const [resultado, setResultado] = useState<{ importados: number; nuevos: number; actualizados: number; errores: number; por_hoja: {hoja:string;nuevos:number;actualizados:number;errores:number}[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const token    = getToken();
  const clienteId = getClienteId();
  const proveedorDb = useDebounce(proveedor, 700);
  const subIdDb     = useDebounce(subId, 700);

  const claveMapeo = (prov: string, sub: string) =>
    sub.trim() ? `${prov.trim()}_${sub.trim()}` : prov.trim();

  const aplicarMapeo = (d: any) => {
    const { descripcion, ...restoMapeo } = d.mapeo;
    setMapeo(restoMapeo || {});
    setDescCols(Array.isArray(descripcion) ? descripcion : []);
    if (d.marca_defecto !== undefined) setMarcaDef(d.marca_defecto || '');
    if (d.rubro_defecto !== undefined) setRubroDef(d.rubro_defecto || '');
    setGuardarMapeo(true);
  };

  useEffect(() => {
    const nombre = proveedorDb.trim();
    if (!nombre || nombre.length < 2 || !clienteId) { setMapeoMsg(''); setMapeoDisponible(null); return; }
    const clave = claveMapeo(nombre, subIdDb);
    fetch(`${API}/api/superadmin/importador/mapeo-proveedor/${clienteId}/${encodeURIComponent(clave)}`, {
      headers: { 'x-superadmin-token': token },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.mapeo) { setMapeoMsg(''); setMapeoDisponible(null); return; }
        setMapeoDisponible(d);
        setClaveMapeoActual(clave);
        setMapeoMsg('');
      })
      .catch(() => { setMapeoMsg(''); setMapeoDisponible(null); });
  }, [proveedorDb, subIdDb, clienteId, token]);

  const allColumnas = Array.from(new Set(
    hojas.filter(h => hojasOk.includes(h.nombre)).flatMap(h => h.columnas)
  ));

  const muestraActual = hojas.find(h => hojasOk[0] === h.nombre)?.muestra || [];
  const aceptar = (f: File) => {
    if (!f.name.match(/\.(xlsx|xls)$/i)) { setError('Solo archivos .xls o .xlsx'); return; }
    setError(''); setArchivo(f);
  };

  const analizar = async () => {
    if (!archivo) { setError('Seleccioná un archivo'); return; }
    if (!proveedor.trim()) { setError('Nombre del proveedor requerido'); return; }
    setError(''); setCargando(true);
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      const r = await fetch(`${API}/api/superadmin/importador/analizar-v2`, {
        method: 'POST', headers: { 'x-superadmin-token': token }, body: fd,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.mensaje || 'Error al analizar');
      const hojasData: HojaInfo[] = d.hojas || [];
      setHojas(hojasData);
      const conDatos = hojasData.filter(h => h.total_filas > 0).map(h => h.nombre);
      setHojasOk(conDatos.length ? conDatos : hojasData.map(h => h.nombre));
      setPaso(2);
    } catch (e: any) { setError(e.message); }
    finally { setCargando(false); }
  };

  const analizarDiff = async () => {
    if (!descCols.length) { setError('Indicá al menos una columna para la Descripción'); return; }
    setError(''); setCargando(true);
    try {
      if (guardarMapeo && proveedor.trim()) {
        try {
          await fetch(`${API}/api/superadmin/importador/mapeo-proveedor/${clienteId}`, {
            method: 'POST',
            headers: { 'x-superadmin-token': token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ proveedor: claveMapeo(proveedor, subId), mapeo: { ...mapeo, descripcion: descCols } }),
          });
        } catch {}
      }
      const fd = new FormData();
      fd.append('archivo', archivo!);
      fd.append('cliente_id', String(clienteId));
      fd.append('proveedor', proveedor.trim());
      fd.append('configuracion', JSON.stringify({
        hojas_seleccionadas: hojasOk,
        mapeo: { ...mapeo, descripcion: descCols },
        marca_defecto: marcaDef || undefined,
        rubro_defecto: rubroDef || undefined,
      }));
      const r = await fetch(`${API}/api/superadmin/importador/analizar-diff`, {
        method: 'POST', headers: { 'x-superadmin-token': token }, body: fd,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.mensaje || 'Error al analizar');
      setAnalisisDiff(d);
      setPaso(3);
    } catch (e: any) { setError(e.message); }
    finally { setCargando(false); }
  };

  const importar = async () => {
    setError(''); setCargando(true); setPaso(4);
    try {
      const fd = new FormData();
      fd.append('cliente_id', String(clienteId));
      fd.append('proveedor', proveedor.trim());
      fd.append('temp_id', analisisDiff!.temp_id);
      fd.append('configuracion', JSON.stringify({
        hojas_seleccionadas: hojasOk,
        mapeo: { ...mapeo, descripcion: descCols },
        marca_defecto: marcaDef || undefined,
        rubro_defecto: rubroDef || undefined,
      }));
      const r = await fetch(`${API}/api/superadmin/importador/importar-v2`, {
        method: 'POST', headers: { 'x-superadmin-token': token }, body: fd,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.mensaje || 'Error al importar');
      setResultado(d);
    } catch (e: any) { setError(e.message); setPaso(3); }
    finally { setCargando(false); }
  };

  const toggleHoja = (nombre: string) => {
    setHojasOk(prev => {
      const next = prev.includes(nombre) ? prev.filter(h => h !== nombre) : [...prev, nombre];
      if (!prev.includes(nombre)) setRubroDef(r => r || nombre);
      return next;
    });
  };

  const addDescCol = (col: string) => {
    if (col && !descCols.includes(col)) setDescCols(prev => [...prev, col]);
  };
  const removeDescCol = (i: number) => setDescCols(prev => prev.filter((_, idx) => idx !== i));
  const moveDescCol = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= descCols.length) return;
    const next = [...descCols]; [next[i], next[j]] = [next[j], next[i]]; setDescCols(next);
  };

  const previewFilas = muestraActual.slice(0, 5).map(fila => {
    const desc = descCols.map(c => fila[c] || '').filter(Boolean).join(' ');
    const fields: Record<string, string> = {};
    if (descCols.length > 0) fields['Descripción'] = desc || '—';
    CAMPOS_MAPEO.forEach(cm => { if (mapeo[cm.campo]) fields[cm.label] = String(fila[mapeo[cm.campo]] ?? '—'); });
    return fields;
  });
  const previewCols = Array.from(new Set(previewFilas.flatMap(f => Object.keys(f))));

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 1100, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div style={{ backgroundColor: NAVY, borderRadius: '16px 16px 0 0', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, color: SEP, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {paso < 4 ? `Paso ${paso} de 4` : resultado ? 'Completado' : 'Importando...'}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
              {paso === 1 ? 'Subir archivo' : paso === 2 ? 'Mapear columnas' : paso === 3 ? 'Confirmar importación' : resultado ? 'Importación completada' : 'Importando...'}
            </div>
          </div>
          <button onClick={onCerrar} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 18, width: 34, height: 34, cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
        {!resultado && <BarraProgreso paso={paso} labels={['Subir archivo', 'Mapear columnas', 'Confirmar', 'Resultado']} />}

        {/* Cuerpo */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {error && <div style={{ backgroundColor: '#FFF5F5', border: `1px solid ${RED}`, borderRadius: 8, padding: '10px 14px', color: RED, fontSize: 13, marginBottom: 14, fontWeight: 500 }}>⚠️ {error}</div>}

          {/* ══ PASO 1 ══ */}
          {paso === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) aceptar(f); }}
                onClick={() => inputRef.current?.click()}
                style={{ border: `2px dashed ${drag ? BLUE : archivo ? GREEN : '#CBD5E0'}`, borderRadius: 12, padding: '32px 24px', textAlign: 'center', cursor: 'pointer', backgroundColor: drag ? '#EBF8FF' : archivo ? '#F0FFF4' : '#FAFAFA' }}>
                <div style={{ fontSize: 42, marginBottom: 10 }}>{archivo ? '✅' : '📊'}</div>
                {archivo
                  ? <><div style={{ fontSize: 15, fontWeight: 700, color: GREEN }}>{archivo.name}</div><div style={{ fontSize: 12, color: GRAY }}>Clic para cambiar</div></>
                  : <><div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>Arrastrá tu Excel aquí</div><div style={{ fontSize: 12, color: GRAY, marginTop: 4 }}>o hacé clic — acepta .xls y .xlsx</div></>}
              </div>
              <input ref={inputRef} type="file" accept=".xls,.xlsx" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) aceptar(f); }} />
              <div>
                <label style={labelSt}>Nombre del proveedor <span style={{ color: RED }}>*</span></label>
                <input style={{ ...inputSt, fontSize: 14, padding: '8px 12px' }} value={proveedor} onChange={e => { setProveedor(e.target.value); setMapeoMsg(''); }} placeholder="Ej: BERGER, LALO GAS, LEKONS" />
              </div>
              {mapeoDisponible && (
                <div style={{ background: '#EBF4FF', border: '1px solid #2B6CB0', borderRadius: 8, padding: '10px 14px', marginBottom: 4, display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}>
                  <span>📋 Hay mapeo guardado para <strong>{claveMapeoActual}</strong></span>
                  <button style={{ ...btnStyle('#2B6CB0', '#fff'), padding: '4px 10px', fontSize: 12 }} onClick={() => { aplicarMapeo(mapeoDisponible); setMapeoDisponible(null); setMapeoMsg(`✅ Mapeo aplicado para ${claveMapeoActual}`); }}>✅ Usar</button>
                  <button style={{ ...btnStyle('#EDF2F7', GRAY), padding: '4px 10px', fontSize: 12 }} onClick={() => setMapeoDisponible(null)}>❌ Ignorar</button>
                </div>
              )}
              {claveMapeoActual && !mapeoDisponible && (
                <button style={{ ...btnStyle('#FFF5F5', RED), padding: '4px 10px', fontSize: 12, marginBottom: 4 }} onClick={async () => {
                  await fetch(`${API}/api/superadmin/importador/mapeo-proveedor/${clienteId}/${encodeURIComponent(claveMapeoActual)}`, { method: 'DELETE', headers: { 'x-superadmin-token': token } });
                  setClaveMapeoActual('');
                  setMapeoMsg('✅ Mapeo eliminado');
                }}>🗑 Borrar mapeo guardado</button>
              )}
              {mapeoMsg && (
                <div style={{ backgroundColor: '#F0FFF4', border: `1px solid ${GREEN}`, borderRadius: 8, padding: '8px 14px', color: '#276749', fontSize: 13, fontWeight: 500 }}>
                  {mapeoMsg}
                </div>
              )}
              {hojas.length === 0 && archivo && proveedor.trim() && (
                <div style={{ fontSize: 13, color: GRAY }}>Listo para analizar. El sistema detectará las hojas y columnas.</div>
              )}
            </div>
          )}

          {/* ══ PASO 2 ══ */}
          {paso === 2 && (
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

              {/* ── COLUMNA IZQUIERDA: controles de mapeo ── */}
              <div style={{ flex: '0 0 420px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Hoja / Rubro — solo si hay más de una hoja */}
                {hojas.length > 1 && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#4A5568', display: 'block', marginBottom: 4 }}>
                      Hoja / Rubro (opcional)
                    </label>
                    <input
                      type="text"
                      value={subId}
                      onChange={e => setSubId(e.target.value)}
                      placeholder="Ej: Tubos, Accesorios, Lista1"
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #CBD5E0', borderRadius: 6, fontSize: 13 }}
                    />
                    <div style={{ fontSize: 11, color: '#718096', marginTop: 3 }}>
                      Diferencia mapeos del mismo proveedor por hoja o categoría
                    </div>
                  </div>
                )}

                {/* 1. Hojas detectadas */}
                <div style={{ backgroundColor: '#F7FAFC', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    Hojas detectadas — seleccioná las que importar:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {hojas.map(h => (
                      <label key={h.nombre} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '5px 10px', borderRadius: 8, border: `1.5px solid ${hojasOk.includes(h.nombre) ? BLUE : '#CBD5E0'}`, backgroundColor: hojasOk.includes(h.nombre) ? '#EBF8FF' : '#fff', fontSize: 13 }}>
                        <input type="checkbox" checked={hojasOk.includes(h.nombre)} onChange={() => toggleHoja(h.nombre)} style={{ accentColor: BLUE }} />
                        <strong>{h.nombre}</strong>
                        <span style={{ color: GRAY, fontSize: 11 }}>({h.total_filas} filas, {h.columnas.length} cols)</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 2. CAMPOS REQUERIDOS */}
                <div style={{ backgroundColor: '#FFFBEB', borderRadius: 10, padding: '12px 16px', border: `1.5px solid #F6C23E` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#744210', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    ⚠️ Campos requeridos
                  </div>

                  {/* PASO 1 — Código */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 12 }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: '5px 8px 5px 0', fontWeight: 700, color: NAVY, width: '45%', fontSize: 12 }}>
                          Código <span style={{ color: RED }}>*</span>
                        </td>
                        <td style={{ padding: '4px 0' }}>
                          <select style={{ ...selectSt, width: '100%', fontSize: 12 }} value={mapeo['codigo'] || ''} onChange={e => setMapeo(prev => ({ ...prev, codigo: e.target.value }))}>
                            <option value="">— No usar —</option>
                            {allColumnas.map(c => <option key={c} value={c}>Columna {letraCol(allColumnas.indexOf(c))} — {muestraActual[0]?.[c] ?? ''}</option>)}
                          </select>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* PASO 2 — Descripción multi-columna */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: NAVY, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                      Descripción <span style={{ color: RED }}>*</span> — columnas que la forman (en orden):
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                      {descCols.map((c, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3, backgroundColor: '#fff', border: `1px solid #F6C23E`, borderRadius: 8, padding: '3px 8px', fontSize: 12 }}>
                          <span style={{ fontWeight: 600 }}>{i + 1}.</span> {c}
                          <button onClick={() => moveDescCol(i, -1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: GRAY, fontSize: 13, padding: '0 2px' }} title="Subir">↑</button>
                          <button onClick={() => moveDescCol(i, 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: GRAY, fontSize: 13, padding: '0 2px' }} title="Bajar">↓</button>
                          <button onClick={() => removeDescCol(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: RED, fontWeight: 700, fontSize: 13, padding: '0 2px' }}>✕</button>
                        </div>
                      ))}
                    </div>
                    <select style={{ ...selectSt, width: 'auto', minWidth: 180, fontSize: 12 }} onChange={e => { if (e.target.value) addDescCol(e.target.value); e.target.value = ''; }} defaultValue="">
                      <option value="">＋ Agregar columna...</option>
                      {allColumnas.filter(c => !descCols.includes(c)).map(c => <option key={c} value={c}>Columna {letraCol(allColumnas.indexOf(c))} — {muestraActual[0]?.[c] ?? ''}</option>)}
                    </select>
                  </div>

                  {/* PASO 3 — Precio costo */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: '5px 8px 5px 0', fontWeight: 700, color: NAVY, width: '45%', fontSize: 12 }}>
                          Precio costo <span style={{ color: RED }}>*</span>
                        </td>
                        <td style={{ padding: '4px 0' }}>
                          <select style={{ ...selectSt, width: '100%', fontSize: 12 }} value={mapeo['precio_costo'] || ''} onChange={e => setMapeo(prev => ({ ...prev, precio_costo: e.target.value }))}>
                            <option value="">— No usar —</option>
                            {allColumnas.map(c => <option key={c} value={c}>Columna {letraCol(allColumnas.indexOf(c))} — {muestraActual[0]?.[c] ?? ''}</option>)}
                          </select>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 3. CAMPOS OPCIONALES — colapsable */}
                <details open={Object.keys(mapeo).filter(k => k !== 'codigo' && k !== 'precio_costo' && mapeo[k]).length === 0 && descCols.length === 0}
                  style={{ backgroundColor: '#F7FAFC', borderRadius: 10, border: '1px solid #E2E8F0' }}>
                  <summary style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.4px', userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                    📦 Campos opcionales
                  </summary>
                  <div style={{ padding: '0 14px 12px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ backgroundColor: '#EBF4FF' }}>
                          <th style={{ padding: '6px 8px', textAlign: 'left', color: NAVY, fontWeight: 700, borderBottom: `2px solid ${SEP}`, width: '45%' }}>Campo sistema</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', color: NAVY, fontWeight: 700, borderBottom: `2px solid ${SEP}` }}>Columna del Excel</th>
                        </tr>
                      </thead>
                      <tbody>
                        {CAMPOS_MAPEO.filter(c => c.campo !== 'codigo' && c.campo !== 'precio_costo').map(({ campo, label }) => (
                          <tr key={campo} style={{ backgroundColor: '#fff' }}>
                            <td style={{ padding: '5px 8px', borderBottom: '1px solid #EDF2F7', fontSize: 12 }}>{label}</td>
                            <td style={{ padding: '4px 8px', borderBottom: '1px solid #EDF2F7' }}>
                              <select style={{ ...selectSt, width: '100%', fontSize: 12 }} value={mapeo[campo] || ''} onChange={e => setMapeo(prev => ({ ...prev, [campo]: e.target.value }))}>
                                <option value="">— No usar —</option>
                                {allColumnas.map(c => <option key={c} value={c}>Columna {letraCol(allColumnas.indexOf(c))} — {muestraActual[0]?.[c] ?? ''}</option>)}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                      <div>
                        <label style={labelSt}>Marca por defecto</label>
                        <input style={{ ...inputSt, fontSize: 12, padding: '6px 10px' }} value={marcaDef} onChange={e => setMarcaDef(e.target.value)} placeholder="Ej: BERGER" />
                      </div>
                      <div>
                        <label style={labelSt}>Rubro por defecto</label>
                        <input style={{ ...inputSt, fontSize: 12, padding: '6px 10px' }} value={rubroDef} onChange={e => setRubroDef(e.target.value)} placeholder="Ej: CAÑOS" />
                      </div>
                    </div>
                  </div>
                </details>

                {/* 4. Checkbox guardar mapeo */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: TEXT, cursor: 'pointer' }}>
                  <input type="checkbox" checked={guardarMapeo} onChange={e => setGuardarMapeo(e.target.checked)} style={{ accentColor: BLUE }} />
                  Guardar este mapeo para <strong>{claveMapeo(proveedor, subId) || proveedor}</strong>
                </label>
              </div>

              {/* ── COLUMNA DERECHA: preview en tiempo real ── */}
              <div style={{ flex: 1, minWidth: 0, position: 'sticky', top: 0 }}>
                <div style={{ backgroundColor: '#F7FAFC', borderRadius: 10, border: '1px solid #BEE3F8', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: BLUE, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      👁 Preview — cómo quedarán en la base
                    </span>
                    <span style={{ fontSize: 11, color: '#BEE3F8' }}>
                      {muestraActual.length > 0 ? `${previewFilas.length} filas de muestra` : 'Sin datos'}
                    </span>
                  </div>

                  {muestraActual.length === 0 ? (
                    <div style={{ padding: '32px 16px', textAlign: 'center', color: GRAY, fontSize: 13 }}>
                      Sin datos de muestra disponibles
                    </div>
                  ) : previewCols.length === 0 ? (
                    <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>←</div>
                      <div style={{ fontSize: 13, color: GRAY }}>Seleccioná columnas en el mapeo<br />para ver el preview aquí</div>
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ backgroundColor: '#EBF4FF' }}>
                            {previewCols.map(k => (
                              <th key={k} style={{ padding: '7px 10px', textAlign: 'left', color: NAVY, fontWeight: 700, borderBottom: `2px solid ${SEP}`, whiteSpace: 'nowrap', fontSize: 11 }}>{k}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewFilas.map((f, i) => (
                            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                              {previewCols.map(k => (
                                <td key={k} style={{ padding: '6px 10px', borderBottom: '1px solid #EDF2F7', color: f[k] && f[k] !== '—' ? TEXT : '#CBD5E0', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                  title={f[k]}>
                                  {f[k] || '—'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Aviso si no está mapeado el código */}
                  {!mapeo['codigo'] && (
                    <div style={{ margin: '10px 14px', padding: '8px 12px', backgroundColor: '#FFFBEB', border: `1px solid ${YELLOW}`, borderRadius: 8, fontSize: 12, color: '#744210' }}>
                      ⚠️ Sin columna de <strong>Código</strong> mapeada — no se podrán detectar duplicados al importar.
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ══ PASO 3 — CONFIRMAR ══ */}
          {paso === 3 && analisisDiff && (() => {
            const r = analisisDiff.resumen;
            const varProm = r.variacion_promedio;
            const varColor = varProm > 0 ? RED : varProm < 0 ? GREEN : GRAY;
            const varSign  = varProm > 0 ? '+' : '';
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Tarjetas resumen */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  {([
                    ['🆕 Nuevos',          r.nuevos,     BLUE,   'Se agregarán con su código original'],
                    ['🔄 A actualizar',    r.actualizar, ORANGE, 'Mismo proveedor, código coincide'],
                    ['⚠️ Con prefijo',    r.prefijados, YELLOW, 'Distinto proveedor, código en uso'],
                    ['📋 Ausentes en Excel', r.ausentes, GRAY,  'Están en tu base pero no en este Excel'],
                  ] as [string, number, string, string][]).map(([lbl, val, col, sub]) => (
                    <div key={lbl} style={{ backgroundColor: '#fff', border: `1.5px solid ${col}`, borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: col }}>{val}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, marginTop: 2 }}>{lbl}</div>
                      <div style={{ fontSize: 11, color: GRAY, marginTop: 2 }}>{sub}</div>
                    </div>
                  ))}
                </div>

                {/* Resumen de precios */}
                {(r.precios_suben > 0 || r.precios_bajan > 0 || r.precios_sin_cambio > 0) && (
                  <div style={{ backgroundColor: '#F7FAFC', borderRadius: 10, padding: '12px 16px', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      Variación de precios (precio costo)
                    </div>
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: varColor }}>{varSign}{varProm}% promedio</div>
                      <div style={{ display: 'flex', gap: 14, fontSize: 13 }}>
                        <span style={{ color: RED }}>↑ {r.precios_suben} suben</span>
                        <span style={{ color: GREEN }}>↓ {r.precios_bajan} bajan</span>
                        <span style={{ color: GRAY }}>= {r.precios_sin_cambio} sin cambio</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Lista de actualizaciones con diffs */}
                {analisisDiff.actualizar.length > 0 && (
                  <details style={{ backgroundColor: '#FFFAF0', borderRadius: 10, border: `1px solid ${ORANGE}` }}>
                    <summary style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: ORANGE, userSelect: 'none' }}>
                      🔄 {analisisDiff.actualizar.length} productos a actualizar — ver detalle
                    </summary>
                    <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ backgroundColor: '#FFF3CD' }}>
                            <th style={{ padding: '6px 10px', textAlign: 'left', color: NAVY, fontWeight: 700, borderBottom: `1px solid ${ORANGE}`, width: 90 }}>Código</th>
                            <th style={{ padding: '6px 10px', textAlign: 'left', color: NAVY, fontWeight: 700, borderBottom: `1px solid ${ORANGE}`, width: 200 }}>Descripción</th>
                            <th style={{ padding: '6px 10px', textAlign: 'left', color: NAVY, fontWeight: 700, borderBottom: `1px solid ${ORANGE}` }}>Cambios</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analisisDiff.actualizar.map((p, i) => (
                            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#FFFBF0' }}>
                              <td style={{ padding: '5px 10px', borderBottom: '1px solid #EDF2F7', fontWeight: 600, color: NAVY, verticalAlign: 'top' }}>{p.codigo || '—'}</td>
                              <td style={{ padding: '5px 10px', borderBottom: '1px solid #EDF2F7', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'top' }} title={p.descripcion}>{p.descripcion}</td>
                              <td style={{ padding: '5px 10px', borderBottom: '1px solid #EDF2F7' }}>
                                {p.diffs.length === 0
                                  ? <span style={{ color: GRAY, fontStyle: 'italic' }}>Sin cambios detectados</span>
                                  : p.diffs.map((d, j) => (
                                    <div key={j} style={{ fontSize: 11, marginBottom: 2 }}>
                                      <span style={{ fontWeight: 600, color: NAVY }}>{d.label}:</span>{' '}
                                      <span style={{ color: RED, textDecoration: 'line-through' }}>{String(d.anterior ?? '—')}</span>
                                      {' → '}
                                      <span style={{ color: GREEN, fontWeight: 600 }}>{String(d.nuevo ?? '—')}</span>
                                    </div>
                                  ))
                                }
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}

                {/* Lista de prefijados */}
                {analisisDiff.prefijados.length > 0 && (
                  <details style={{ backgroundColor: '#FFFFF0', borderRadius: 10, border: `1px solid ${YELLOW}` }}>
                    <summary style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#744210', userSelect: 'none' }}>
                      ⚠️ {analisisDiff.prefijados.length} con prefijo automático — ver detalle
                    </summary>
                    <div style={{ padding: '8px 14px 12px', fontSize: 12, color: '#744210', borderBottom: `1px solid ${YELLOW}` }}>
                      El código ya existe en tu base asignado a otro proveedor. Se agrega como nuevo con prefijo para no pisar el original.
                    </div>
                    <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ backgroundColor: '#FEFCBF' }}>
                            <th style={{ padding: '6px 10px', textAlign: 'left', color: NAVY, fontWeight: 700, borderBottom: `1px solid ${YELLOW}` }}>Código original</th>
                            <th style={{ padding: '6px 10px', textAlign: 'left', color: NAVY, fontWeight: 700, borderBottom: `1px solid ${YELLOW}` }}>Código nuevo</th>
                            <th style={{ padding: '6px 10px', textAlign: 'left', color: NAVY, fontWeight: 700, borderBottom: `1px solid ${YELLOW}` }}>Proveedor que tiene el original</th>
                            <th style={{ padding: '6px 10px', textAlign: 'left', color: NAVY, fontWeight: 700, borderBottom: `1px solid ${YELLOW}` }}>Descripción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analisisDiff.prefijados.map((p, i) => (
                            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#FEFCBF' }}>
                              <td style={{ padding: '5px 10px', borderBottom: '1px solid #EDF2F7', fontWeight: 600, color: NAVY }}>{p.codigo_original}</td>
                              <td style={{ padding: '5px 10px', borderBottom: '1px solid #EDF2F7', fontWeight: 700, color: ORANGE }}>{p.codigo_nuevo}</td>
                              <td style={{ padding: '5px 10px', borderBottom: '1px solid #EDF2F7', color: GRAY }}>{p.proveedor_existente}</td>
                              <td style={{ padding: '5px 10px', borderBottom: '1px solid #EDF2F7', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.descripcion}>{p.descripcion}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}

                {/* Ausentes en Excel */}
                {analisisDiff.ausentes.length > 0 && (
                  <details style={{ backgroundColor: '#F7FAFC', borderRadius: 10, border: '1px solid #CBD5E0' }}>
                    <summary style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: GRAY, userSelect: 'none' }}>
                      📋 {analisisDiff.ausentes.length} productos en tu base que NO están en este Excel
                    </summary>
                    <div style={{ padding: '8px 14px 12px', fontSize: 12, color: GRAY, borderBottom: '1px solid #CBD5E0' }}>
                      ℹ️ Estos productos <strong>NO se eliminarán automáticamente</strong>. Quedan en tu base sin cambios.
                    </div>
                    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ backgroundColor: '#EDF2F7' }}>
                            <th style={{ padding: '6px 10px', textAlign: 'left', color: NAVY, fontWeight: 700, borderBottom: '1px solid #CBD5E0', width: 100 }}>Código</th>
                            <th style={{ padding: '6px 10px', textAlign: 'left', color: NAVY, fontWeight: 700, borderBottom: '1px solid #CBD5E0' }}>Descripción</th>
                            <th style={{ padding: '6px 10px', textAlign: 'right', color: NAVY, fontWeight: 700, borderBottom: '1px solid #CBD5E0', width: 100 }}>PC actual</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analisisDiff.ausentes.map((p, i) => (
                            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                              <td style={{ padding: '5px 10px', borderBottom: '1px solid #EDF2F7', color: GRAY }}>{p.codigo || '—'}</td>
                              <td style={{ padding: '5px 10px', borderBottom: '1px solid #EDF2F7', color: TEXT }}>{p.descripcion}</td>
                              <td style={{ padding: '5px 10px', borderBottom: '1px solid #EDF2F7', textAlign: 'right', color: GRAY }}>${p.precio_costo.toLocaleString('es-AR')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </div>
            );
          })()}

          {/* ══ PASO 4 — RESULTADO ══ */}
          {paso === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {cargando && !resultado && (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: NAVY }}>Importando productos...</div>
                  <div style={{ fontSize: 13, color: GRAY, marginTop: 6 }}>Esto puede tomar hasta 5 minutos para archivos grandes.</div>
                </div>
              )}
              {resultado && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                    {[['Importados', resultado.importados, GREEN], ['Nuevos', resultado.nuevos, BLUE], ['Actualizados', resultado.actualizados, ORANGE], ['Errores', resultado.errores, RED]].map(([l, v, c]) => (
                      <div key={String(l)} style={{ backgroundColor: '#fff', border: `1px solid ${c}`, borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: String(c) }}>{v}</div>
                        <div style={{ fontSize: 12, color: GRAY }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ backgroundColor: '#F7FAFC', borderRadius: 10, padding: '12px 16px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Por hoja:</div>
                    {resultado.por_hoja.map(h => (
                      <div key={h.hoja} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #EDF2F7', fontSize: 13 }}>
                        <span style={{ fontWeight: 600 }}>{h.hoja}</span>
                        <span style={{ color: GRAY }}>
                          <span style={{ color: GREEN }}>{h.nuevos} nuevos</span>
                          {' · '}
                          <span style={{ color: ORANGE }}>{h.actualizados} actualizados</span>
                          {h.errores > 0 && <> · <span style={{ color: RED }}>{h.errores} errores</span></>}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #E2E8F0', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {paso === 2 && !cargando && (
              <button style={btnStyle('#EDF2F7', GRAY)} onClick={() => { setPaso(1); setError(''); }}>← Anterior</button>
            )}
            {paso === 3 && !cargando && (
              <button style={btnStyle('#EDF2F7', GRAY)} onClick={() => { setPaso(2); setError(''); }}>← Volver al mapeo</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {paso === 1 && (
              <button style={btnStyle(BLUE, '#fff', cargando)} disabled={cargando} onClick={analizar}>
                {cargando ? '⏳ Analizando...' : 'Analizar Excel →'}
              </button>
            )}
            {paso === 2 && (
              <button style={btnStyle(BLUE, '#fff', cargando || hojasOk.length === 0)} disabled={cargando || hojasOk.length === 0} onClick={analizarDiff}>
                {cargando ? '⏳ Analizando...' : `Ver resumen antes de importar →`}
              </button>
            )}
            {paso === 3 && (
              <button style={btnStyle(GREEN, '#fff', cargando)} disabled={cargando} onClick={importar}>
                {cargando ? '⏳ Analizando...' : '✅ Confirmar e importar'}
              </button>
            )}
            {paso === 4 && resultado && (
              <>
                <button style={btnStyle('#EDF2F7', GRAY)} onClick={() => { setPaso(1); setArchivo(null); setHojas([]); setHojasOk([]); setMapeo({}); setDescCols([]); setResultado(null); setAnalisisDiff(null); setError(''); setProveedor(''); }}>
                  Importar otro
                </button>
                <button style={btnStyle(GREEN)} onClick={() => { onExito(); onCerrar(); }}>Cerrar</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MODAL EDITAR PRODUCTO
// ════════════════════════════════════════════════════════════════════════════

interface ModalEditProps {
  producto: ProductoReal;
  proveedores: { id: number; nombre: string }[];
  clienteId: number | null;
  token: string;
  onCerrar: () => void;
  onGuardado: (p: ProductoReal) => void;
}

function ModalEditarProducto({ producto, proveedores, clienteId, token, onCerrar, onGuardado }: ModalEditProps) {
  const [tab, setTab]           = useState<'datos' | 'precios' | 'stock'>('datos');
  const [form, setForm]         = useState({ ...producto, alicuota_iva_str: String(producto.alicuota_iva || 0) });
  const [guardando, setGuardando] = useState(false);
  const [error, setError]       = useState('');
  const [historial, setHistorial] = useState<{ precio_costo_anterior: number; precio_venta_anterior: number; fecha: string }[]>([]);
  const [pvActivo, setPvActivo] = useState<1 | 2 | 3>(1);
  const [subiendoImg, setSubiendoImg] = useState(false);
  const [modoUrl, setModoUrl]         = useState(false);
  const imgInputRef = useRef<HTMLInputElement>(null);

  const subirImagenCloudinary = async (file: File) => {
    if (!CLOUD_NAME || !UPLOAD_PRESET) { setModoUrl(true); return; }
    setSubiendoImg(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', UPLOAD_PRESET);
      const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
      const d = await r.json();
      if (d.secure_url) setForm(prev => ({ ...prev, imagen_url: d.secure_url }));
      else { throw new Error(JSON.stringify(d)); }
    } catch (err) { console.error('Cloudinary fetch error:', err); alert('Error al subir la imagen. Usá la opción "Pegar URL".'); }
    finally { setSubiendoImg(false); }
  };

  const n = (v: any) => parseFloat(String(v)) || 0;
  const pcFinal = calcPcFinal(n(form.precio_costo), n(form.dto_1), n(form.dto_2), n(form.dto_3));
  const pv1 = calcPv(pcFinal, n(form.imp_1), n(form.imp_2), n(form.alicuota_iva), n(form.utilidad_1));
  const pv2 = calcPv(pcFinal, n(form.imp_1), n(form.imp_2), n(form.alicuota_iva), n(form.utilidad_2));
  const pv3 = calcPv(pcFinal, n(form.imp_1), n(form.imp_2), n(form.alicuota_iva), n(form.utilidad_3));

  const set = (campo: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [campo]: e.target.value }));

  useEffect(() => {
    if (tab === 'stock') {
      fetch(`${API}/api/superadmin/importador/productos/${clienteId}/${producto.id}/historial`, {
        headers: { 'x-superadmin-token': token },
      }).then(r => r.json()).then(d => setHistorial(d.historial || [])).catch(() => {});
    }
  }, [tab, clienteId, producto.id, token]);

  const guardar = async () => {
    if (!form.descripcion.trim()) { setError('La descripción es obligatoria'); return; }
    setError(''); setGuardando(true);
    try {
      const pvFinal = pvActivo === 1 ? pv1 : pvActivo === 2 ? pv2 : pv3;
      const body = {
        cliente_id: clienteId,
        productos: [{
          id: producto.id,
          precio_costo:    n(form.precio_costo),
          descuento_1:     n(form.dto_1),    descuento_2: n(form.dto_2),    descuento_3: n(form.dto_3),
          impuesto_1:      n(form.imp_1),    impuesto_2: n(form.imp_2),
          iva:             n(form.alicuota_iva),
          utilidad_1:      n(form.utilidad_1), utilidad_2: n(form.utilidad_2), utilidad_3: n(form.utilidad_3),
          precio_venta_final: pvFinal,
          precio_venta_1: pv1, precio_venta_2: pv2, precio_venta_3: pv3,
          marca:           form.marca || null, rubro: form.rubro || null,
          unidad_medida:   form.unidad_medida || null,
          stock_minimo:    n(form.stock_minimo),
          activo:          form.activo,
          imagen_url:      form.imagen_url || null,
        }],
      };
      const r = await fetch(`${API}/api/superadmin/importador/actualizar-precios-v2`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-superadmin-token': token },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.mensaje || 'Error al guardar');
      onGuardado({ ...producto, ...form, precio_venta_final: pvFinal, precio_venta_2: pv2, precio_venta_3: pv3 });
    } catch (e: any) { setError(e.message); }
    finally { setGuardando(false); }
  };

  const tabBtn = (t: 'datos' | 'precios' | 'stock', label: string) => (
    <button onClick={() => setTab(t)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: tab === t ? 700 : 400, color: tab === t ? BLUE : GRAY, background: tab === t ? '#EBF8FF' : 'transparent', border: 'none', borderBottom: `2px solid ${tab === t ? BLUE : 'transparent'}`, cursor: 'pointer' }}>{label}</button>
  );

  const numInput = (campo: string, label: string, suffix = '') => (
    <div>
      <label style={labelSt}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input type="number" step="any" style={{ ...inputSt, fontSize: 13, padding: '7px 10px' }} value={(form as any)[campo]} onChange={set(campo)} />
        {suffix && <span style={{ fontSize: 12, color: GRAY }}>{suffix}</span>}
      </div>
    </div>
  );
  const calcRow = (label: string, value: number, color = BLUE) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: color === BLUE ? CALC_BG : CALC_BG2, borderRadius: 8, marginTop: 4 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color }}>${numFmt(value)}</span>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ backgroundColor: NAVY, borderRadius: '16px 16px 0 0', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>✏️ Editar producto</div>
          <button onClick={onCerrar} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 18, width: 32, height: 32, cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
        <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0' }}>
          {tabBtn('datos', '📋 Datos')} {tabBtn('precios', '💰 Precios')} {tabBtn('stock', '📦 Stock')}
        </div>
        {error && <div style={{ backgroundColor: '#FFF5F5', borderLeft: `4px solid ${RED}`, padding: '8px 16px', color: RED, fontSize: 13, margin: '0 16px 0' }}>⚠️ {error}</div>}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {/* TAB DATOS */}
          {tab === 'datos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelSt}>Código</label>
                  <input style={{ ...inputSt, fontSize: 13, padding: '7px 10px' }} value={form.codigo || ''} onChange={set('codigo')} />
                </div>
                <div>
                  <label style={labelSt}>Unidad de medida</label>
                  <input style={{ ...inputSt, fontSize: 13, padding: '7px 10px' }} value={form.unidad_medida || ''} onChange={set('unidad_medida')} />
                </div>
              </div>
              <div>
                <label style={labelSt}>Descripción <span style={{ color: RED }}>*</span></label>
                <textarea style={{ ...inputSt, fontSize: 13, padding: '7px 10px', minHeight: 64, resize: 'vertical' }} value={form.descripcion} onChange={set('descripcion')} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelSt}>Marca</label>
                  <input style={{ ...inputSt, fontSize: 13, padding: '7px 10px' }} value={form.marca || ''} onChange={set('marca')} />
                </div>
                <div>
                  <label style={labelSt}>Rubro</label>
                  <input style={{ ...inputSt, fontSize: 13, padding: '7px 10px' }} value={form.rubro || ''} onChange={set('rubro')} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelSt}>Proveedor</label>
                  <select style={{ ...selectSt, fontSize: 13, padding: '7px 10px' }} value={form.proveedor_id || ''} onChange={set('proveedor_id')}>
                    <option value="">Sin proveedor</option>
                    {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelSt}>EAN / Código de barras</label>
                  <input style={{ ...inputSt, fontSize: 13, padding: '7px 10px' }} value={form.ean || ''} onChange={set('ean')} />
                </div>
              </div>
              {/* ── IMAGEN DEL PRODUCTO ── */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelSt}>Imagen del producto</label>
                {form.imagen_url ? (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                    <img src={form.imagen_url} alt="preview" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #E2E8F0', flexShrink: 0 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <button type="button" onClick={() => imgInputRef.current?.click()} disabled={subiendoImg}
                        style={{ ...btnStyle(BLUE, '#fff', subiendoImg), fontSize: 12, padding: '5px 10px' }}>
                        {subiendoImg ? '⏳ Subiendo...' : '📷 Cambiar foto'}
                      </button>
                      <button type="button" onClick={() => setForm(prev => ({ ...prev, imagen_url: null }))}
                        style={{ ...btnStyle('#EDF2F7', RED), fontSize: 12, padding: '5px 10px' }}>
                        ✕ Quitar imagen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <button type="button" onClick={() => imgInputRef.current?.click()} disabled={subiendoImg}
                      style={{ ...btnStyle(BLUE, '#fff', subiendoImg), fontSize: 12, padding: '7px 12px' }}>
                      {subiendoImg ? '⏳ Subiendo...' : '📷 Subir foto'}
                    </button>
                    <button type="button" onClick={() => setModoUrl(v => !v)}
                      style={{ ...btnStyle('#EDF2F7', GRAY), fontSize: 12, padding: '7px 12px' }}>
                      🔗 Pegar URL
                    </button>
                  </div>
                )}
                <input ref={imgInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) subirImagenCloudinary(f); e.target.value = ''; }} />
                {(modoUrl || (!form.imagen_url && CLOUD_NAME === '')) && (
                  <input style={{ ...inputSt, fontSize: 13, padding: '7px 10px' }}
                    placeholder="https://..."
                    value={form.imagen_url || ''}
                    onChange={e => setForm(prev => ({ ...prev, imagen_url: e.target.value || null }))} />
                )}
                {!CLOUD_NAME && (
                  <div style={{ fontSize: 11, color: GRAY, marginTop: 4 }}>Requiere REACT_APP_CLOUDINARY_CLOUD_NAME</div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: TEXT, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.activo} onChange={e => setForm(prev => ({ ...prev, activo: e.target.checked }))} style={{ accentColor: GREEN }} />
                  Producto activo
                </label>
              </div>
              <div style={{ fontSize: 12, color: GRAY }}>Fecha importación: {fmtFecha(form.creado_en)}</div>
            </div>
          )}

          {/* TAB PRECIOS */}
          {tab === 'precios' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {numInput('precio_costo', 'PC Base (precio costo)', '$')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {numInput('dto_1', 'Descuento 1%', '%')}
                {numInput('dto_2', 'Descuento 2%', '%')}
                {numInput('dto_3', 'Descuento 3%', '%')}
              </div>
              {calcRow('PC Final', pcFinal)}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {numInput('imp_1', 'Impuesto 1%', '%')}
                {numInput('imp_2', 'Impuesto 2%', '%')}
                {numInput('alicuota_iva', 'IVA%', '%')}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {numInput('utilidad_1', 'Utilidad 1%', '%')}
                {numInput('utilidad_2', 'Utilidad 2%', '%')}
                {numInput('utilidad_3', 'Utilidad 3%', '%')}
              </div>
              {calcRow('PV1', pv1, GREEN)}
              {calcRow('PV2', pv2, GREEN)}
              {calcRow('PV3', pv3, GREEN)}
              <div style={{ marginTop: 8 }}>
                <label style={labelSt}>PV activo (precio de venta principal):</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {([1, 2, 3] as const).map(n => (
                    <label key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                      <input type="radio" name="pvActivo" checked={pvActivo === n} onChange={() => setPvActivo(n)} style={{ accentColor: GREEN }} />
                      PV{n} (${numFmt(n === 1 ? pv1 : n === 2 ? pv2 : pv3)})
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB STOCK */}
          {tab === 'stock' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelSt}>Stock actual (solo lectura)</label>
                  <div style={{ padding: '8px 12px', backgroundColor: '#F7FAFC', borderRadius: 8, fontSize: 14, fontWeight: 700, color: NAVY }}>{numFmt(form.stock_actual, 0)}</div>
                </div>
                {numInput('stock_minimo', 'Stock mínimo')}
              </div>
              <div>
                <label style={labelSt}>Historial de precios (últimas 5):</label>
                {historial.length === 0
                  ? <div style={{ color: GRAY, fontSize: 13 }}>Sin historial registrado.</div>
                  : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 4 }}>
                      <thead><tr style={{ backgroundColor: '#EBF4FF' }}>
                        <th style={{ padding: '6px 10px', textAlign: 'left', color: NAVY }}>Fecha</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right', color: NAVY }}>PC anterior</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right', color: NAVY }}>PV anterior</th>
                      </tr></thead>
                      <tbody>{historial.map((h, i) => (
                        <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                          <td style={{ padding: '5px 10px', borderBottom: '1px solid #EDF2F7' }}>{fmtFecha(h.fecha)}</td>
                          <td style={{ padding: '5px 10px', borderBottom: '1px solid #EDF2F7', textAlign: 'right' }}>${numFmt(h.precio_costo_anterior)}</td>
                          <td style={{ padding: '5px 10px', borderBottom: '1px solid #EDF2F7', textAlign: 'right' }}>${numFmt(h.precio_venta_anterior)}</td>
                        </tr>
                      ))}</tbody>
                    </table>}
              </div>
            </div>
          )}
        </div>
        <div style={{ borderTop: '1px solid #E2E8F0', padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={btnStyle('#EDF2F7', GRAY)} onClick={onCerrar}>Cancelar</button>
          <button style={btnStyle(GREEN, '#fff', guardando)} disabled={guardando} onClick={guardar}>
            {guardando ? '⏳ Guardando...' : '✅ Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MODAL NUEVO PRODUCTO
// ════════════════════════════════════════════════════════════════════════════

interface ModalNuevoProps {
  proveedores: { id: number; nombre: string }[];
  clienteId: number | null;
  token: string;
  onCerrar: () => void;
  onGuardado: () => void;
}

const FORM_VACIO = {
  codigo: '', descripcion: '', descripcion_corta: '', marca: '', rubro: '',
  proveedor_id: '' as string | number,
  unidad_medida: '', ean: '', imagen_url: null as string | null,
  precio_costo: 0, dto_1: 0, dto_2: 0, dto_3: 0,
  imp_1: 0, imp_2: 0, alicuota_iva: 0,
  utilidad_1: 0, utilidad_2: 0, utilidad_3: 0,
  stock_actual: 0, stock_minimo: 0,
  activo: true,
};

function ModalNuevoProducto({ proveedores, clienteId, token, onCerrar, onGuardado }: ModalNuevoProps) {
  const [tab, setTab]       = useState<'datos' | 'precios' | 'stock'>('datos');
  const [form, setForm]     = useState({ ...FORM_VACIO });
  const [guardando, setGuardando] = useState(false);
  const [error, setError]   = useState('');
  const [pvActivo, setPvActivo] = useState<1 | 2 | 3>(1);
  const [subiendoImg, setSubiendoImg] = useState(false);
  const [modoUrl, setModoUrl] = useState(false);
  const imgInputRef = useRef<HTMLInputElement>(null);

  const subirImagenCloudinary = async (file: File) => {
    if (!CLOUD_NAME || !UPLOAD_PRESET) { setModoUrl(true); return; }
    setSubiendoImg(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', UPLOAD_PRESET);
      const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
      const d = await r.json();
      if (d.secure_url) setForm(prev => ({ ...prev, imagen_url: d.secure_url }));
      else throw new Error(JSON.stringify(d));
    } catch (err) { console.error('Cloudinary error:', err); alert('Error al subir imagen. Usá "Pegar URL".'); }
    finally { setSubiendoImg(false); }
  };

  const nv = (v: any) => parseFloat(String(v)) || 0;
  const pcFinal = calcPcFinal(nv(form.precio_costo), nv(form.dto_1), nv(form.dto_2), nv(form.dto_3));
  const pv1 = calcPv(pcFinal, nv(form.imp_1), nv(form.imp_2), nv(form.alicuota_iva), nv(form.utilidad_1));
  const pv2 = calcPv(pcFinal, nv(form.imp_1), nv(form.imp_2), nv(form.alicuota_iva), nv(form.utilidad_2));
  const pv3 = calcPv(pcFinal, nv(form.imp_1), nv(form.imp_2), nv(form.alicuota_iva), nv(form.utilidad_3));

  const set = (campo: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [campo]: e.target.value }));

  const guardar = async () => {
    if (!form.descripcion.trim()) { setError('La descripción es obligatoria'); return; }
    setError(''); setGuardando(true);
    try {
      const pvFinal = pvActivo === 1 ? pv1 : pvActivo === 2 ? pv2 : pv3;
      const body = {
        codigo:           form.codigo || null,
        descripcion:      form.descripcion.trim(),
        descripcion_corta: form.descripcion_corta || null,
        marca:            form.marca || null,
        rubro:            form.rubro || null,
        proveedor_id:     form.proveedor_id || null,
        unidad_medida:    form.unidad_medida || null,
        ean:              form.ean || null,
        imagen_url:       form.imagen_url || null,
        precio_costo:     nv(form.precio_costo),
        dto_1:            nv(form.dto_1), dto_2: nv(form.dto_2), dto_3: nv(form.dto_3),
        precio_costo_final: pcFinal,
        imp_1:            nv(form.imp_1), imp_2: nv(form.imp_2),
        alicuota_iva:     nv(form.alicuota_iva),
        utilidad_1:       nv(form.utilidad_1), utilidad_2: nv(form.utilidad_2),
        precio_venta_1:   pv1, precio_venta_2: pv2, precio_venta_final: pvFinal,
        stock:            nv(form.stock_actual),
        stock_minimo:     nv(form.stock_minimo),
        activo:           form.activo,
      };
      const r = await fetch(`${API}/api/superadmin/importador/productos/${clienteId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-superadmin-token': token },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.mensaje || 'Error al crear producto');
      onGuardado();
    } catch (e: any) { setError(e.message); }
    finally { setGuardando(false); }
  };

  const tabBtn = (t: 'datos' | 'precios' | 'stock', label: string) => (
    <button onClick={() => setTab(t)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: tab === t ? 700 : 400, color: tab === t ? BLUE : GRAY, background: tab === t ? '#EBF8FF' : 'transparent', border: 'none', borderBottom: `2px solid ${tab === t ? BLUE : 'transparent'}`, cursor: 'pointer' }}>{label}</button>
  );

  const numInput = (campo: string, label: string, suffix = '') => (
    <div>
      <label style={labelSt}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input type="number" step="any" style={{ ...inputSt, fontSize: 13, padding: '7px 10px' }} value={(form as any)[campo]} onChange={set(campo)} />
        {suffix && <span style={{ fontSize: 12, color: GRAY }}>{suffix}</span>}
      </div>
    </div>
  );

  const calcRowN = (label: string, value: number, color = BLUE) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: color === BLUE ? CALC_BG : CALC_BG2, borderRadius: 8, marginTop: 4 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color }}>${numFmt(value)}</span>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ backgroundColor: BLUE, borderRadius: '16px 16px 0 0', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>➕ Nuevo producto</div>
          <button onClick={onCerrar} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 18, width: 32, height: 32, cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
        <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0' }}>
          {tabBtn('datos', '📋 Datos')} {tabBtn('precios', '💰 Precios')} {tabBtn('stock', '📦 Stock')}
        </div>
        {error && <div style={{ backgroundColor: '#FFF5F5', borderLeft: `4px solid ${RED}`, padding: '8px 16px', color: RED, fontSize: 13, margin: '0 16px 0' }}>⚠️ {error}</div>}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {/* TAB DATOS */}
          {tab === 'datos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelSt}>Código</label>
                  <input style={{ ...inputSt, fontSize: 13, padding: '7px 10px' }} value={form.codigo} onChange={set('codigo')} />
                </div>
                <div>
                  <label style={labelSt}>Unidad de medida</label>
                  <input style={{ ...inputSt, fontSize: 13, padding: '7px 10px' }} value={form.unidad_medida} onChange={set('unidad_medida')} />
                </div>
              </div>
              <div>
                <label style={labelSt}>Descripción <span style={{ color: RED }}>*</span></label>
                <textarea style={{ ...inputSt, fontSize: 13, padding: '7px 10px', minHeight: 64, resize: 'vertical' }} value={form.descripcion} onChange={set('descripcion')} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelSt}>Marca</label>
                  <input style={{ ...inputSt, fontSize: 13, padding: '7px 10px' }} value={form.marca} onChange={set('marca')} />
                </div>
                <div>
                  <label style={labelSt}>Rubro</label>
                  <input style={{ ...inputSt, fontSize: 13, padding: '7px 10px' }} value={form.rubro} onChange={set('rubro')} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelSt}>Proveedor</label>
                  <select style={{ ...selectSt, fontSize: 13, padding: '7px 10px' }} value={form.proveedor_id} onChange={set('proveedor_id')}>
                    <option value="">Sin proveedor</option>
                    {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelSt}>EAN / Código de barras</label>
                  <input style={{ ...inputSt, fontSize: 13, padding: '7px 10px' }} value={form.ean} onChange={set('ean')} />
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelSt}>Imagen del producto</label>
                {form.imagen_url ? (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                    <img src={form.imagen_url} alt="preview" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #E2E8F0', flexShrink: 0 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <button type="button" onClick={() => imgInputRef.current?.click()} disabled={subiendoImg}
                        style={{ ...btnStyle(BLUE, '#fff', subiendoImg), fontSize: 12, padding: '5px 10px' }}>
                        {subiendoImg ? '⏳ Subiendo...' : '📷 Cambiar foto'}
                      </button>
                      <button type="button" onClick={() => setForm(prev => ({ ...prev, imagen_url: null }))}
                        style={{ ...btnStyle('#EDF2F7', RED), fontSize: 12, padding: '5px 10px' }}>
                        ✕ Quitar imagen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <button type="button" onClick={() => imgInputRef.current?.click()} disabled={subiendoImg}
                      style={{ ...btnStyle(BLUE, '#fff', subiendoImg), fontSize: 12, padding: '7px 12px' }}>
                      {subiendoImg ? '⏳ Subiendo...' : '📷 Subir foto'}
                    </button>
                    <button type="button" onClick={() => setModoUrl(v => !v)}
                      style={{ ...btnStyle('#EDF2F7', GRAY), fontSize: 12, padding: '7px 12px' }}>
                      🔗 Pegar URL
                    </button>
                  </div>
                )}
                <input ref={imgInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) subirImagenCloudinary(f); e.target.value = ''; }} />
                {(modoUrl || (!form.imagen_url && CLOUD_NAME === '')) && (
                  <input style={{ ...inputSt, fontSize: 13, padding: '7px 10px' }}
                    placeholder="https://..."
                    value={form.imagen_url || ''}
                    onChange={e => setForm(prev => ({ ...prev, imagen_url: e.target.value || null }))} />
                )}
                {!CLOUD_NAME && (
                  <div style={{ fontSize: 11, color: GRAY, marginTop: 4 }}>Requiere REACT_APP_CLOUDINARY_CLOUD_NAME</div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: TEXT, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.activo} onChange={e => setForm(prev => ({ ...prev, activo: e.target.checked }))} style={{ accentColor: GREEN }} />
                  Producto activo
                </label>
              </div>
            </div>
          )}

          {/* TAB PRECIOS */}
          {tab === 'precios' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {numInput('precio_costo', 'PC Base (precio costo)', '$')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {numInput('dto_1', 'Descuento 1%', '%')}
                {numInput('dto_2', 'Descuento 2%', '%')}
                {numInput('dto_3', 'Descuento 3%', '%')}
              </div>
              {calcRowN('PC Final', pcFinal)}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {numInput('imp_1', 'Impuesto 1%', '%')}
                {numInput('imp_2', 'Impuesto 2%', '%')}
                {numInput('alicuota_iva', 'IVA%', '%')}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {numInput('utilidad_1', 'Utilidad 1%', '%')}
                {numInput('utilidad_2', 'Utilidad 2%', '%')}
                {numInput('utilidad_3', 'Utilidad 3%', '%')}
              </div>
              {calcRowN('PV1', pv1, GREEN)}
              {calcRowN('PV2', pv2, GREEN)}
              {calcRowN('PV3', pv3, GREEN)}
              <div style={{ marginTop: 8 }}>
                <label style={labelSt}>PV activo (precio de venta principal):</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {([1, 2, 3] as const).map(n => (
                    <label key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                      <input type="radio" name="pvActivoNuevo" checked={pvActivo === n} onChange={() => setPvActivo(n)} style={{ accentColor: GREEN }} />
                      PV{n} (${numFmt(n === 1 ? pv1 : n === 2 ? pv2 : pv3)})
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB STOCK */}
          {tab === 'stock' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {numInput('stock_actual', 'Stock actual')}
                {numInput('stock_minimo', 'Stock mínimo')}
              </div>
            </div>
          )}
        </div>
        <div style={{ borderTop: '1px solid #E2E8F0', padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={btnStyle('#EDF2F7', GRAY)} onClick={onCerrar}>Cancelar</button>
          <button style={btnStyle(BLUE, '#fff', guardando)} disabled={guardando} onClick={guardar}>
            {guardando ? '⏳ Guardando...' : '➕ Agregar producto'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// HOOK useDebounce
// ════════════════════════════════════════════════════════════════════════════

function useDebounce<T>(value: T, delay: number): T {
  const [dv, setDv] = useState(value);
  useEffect(() => { const t = setTimeout(() => setDv(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return dv;
}

// ════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════

const COLS: { key: string; label: string; width?: number }[] = [
  { key: 'codigo',          label: 'Código',       width: 90 },
  { key: 'descripcion',     label: 'Descripción',  width: 250 },
  { key: 'marca',           label: 'Marca',        width: 90 },
  { key: 'rubro',           label: 'Rubro',        width: 90 },
  { key: 'proveedor',       label: 'Proveedor',    width: 100 },
  { key: 'ean',             label: 'EAN',          width: 110 },
  { key: 'precio_costo',    label: 'PC Base',      width: 80 },
  { key: 'dto_1',           label: 'Dt1%',         width: 60 },
  { key: 'dto_2',           label: 'Dt2%',         width: 60 },
  { key: 'dto_3',           label: 'Dt3%',         width: 60 },
  { key: '_pcf',            label: 'PC Final',     width: 80 },
  { key: 'imp_1',           label: 'Imp1%',        width: 60 },
  { key: 'imp_2',           label: 'Imp2%',        width: 60 },
  { key: 'alicuota_iva',    label: 'IVA%',         width: 60 },
  { key: 'utilidad_1',      label: 'Ut1%',         width: 60 },
  { key: 'utilidad_2',      label: 'Ut2%',         width: 60 },
  { key: 'utilidad_3',      label: 'Ut3%',         width: 60 },
  { key: '_pv1',            label: 'PV1',          width: 80 },
  { key: '_pv2',            label: 'PV2',          width: 80 },
  { key: '_pv3',            label: 'PV3',          width: 80 },
  { key: 'stock_actual',    label: 'Stock',        width: 60 },
  { key: 'stock_minimo',    label: 'Stock Min',    width: 70 },
  { key: 'unidad_medida',   label: 'Unidad',       width: 70 },
  { key: 'creado_en',       label: 'F. Import',    width: 90 },
  { key: 'activo',          label: 'Estado',       width: 75 },
  { key: 'destacado',       label: '⭐',            width: 50 },
];

const CAMPOS_MASIVOS = [
  { campo: 'marca',         label: 'Marca',          tipo: 'text' },
  { campo: 'rubro',         label: 'Rubro',          tipo: 'text' },
  { campo: 'utilidad_1',    label: 'Utilidad 1%',    tipo: 'number' },
  { campo: 'utilidad_2',    label: 'Utilidad 2%',    tipo: 'number' },
  { campo: 'utilidad_3',    label: 'Utilidad 3%',    tipo: 'number' },
  { campo: 'alicuota_iva',  label: 'IVA%',           tipo: 'number' },
  { campo: 'stock_minimo',  label: 'Stock mínimo',   tipo: 'number' },
  { campo: 'unidad_medida', label: 'Unidad medida',  tipo: 'text' },
  { campo: 'activo',        label: 'Estado',         tipo: 'bool' },
];

const POR_PAG_OPTS = [10, 25, 50, 100];

function RobertoProductos() {
  const navigate = useNavigate();
  const token     = getToken();
  const clienteId = getClienteId();
  // Filtros
  const [busqueda,        setBusqueda]        = useState('');
  const [filtroProveedor, setFiltroProveedor] = useState('');
  const [busqProv,        setBusqProv]        = useState('');
  const [busqProvText,    setBusqProvText]    = useState('');
  const [dropProvOpen,    setDropProvOpen]    = useState(false);
  const busqProvTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filtroMarca,     setFiltroMarca]     = useState('');
  const [filtroRubro,     setFiltroRubro]     = useState('');
  const [filtroEstado,    setFiltroEstado]    = useState('');
  const [fechaDesde,      setFechaDesde]      = useState('');
  const [fechaHasta,      setFechaHasta]      = useState('');
  const [fechaTipo,       setFechaTipo]       = useState<'importacion' | 'actualizacion'>('importacion');
  const [porPagina,       setPorPagina]       = useState(25);
  const [pagina,          setPagina]          = useState(1);
  const busquedaDb = useDebounce(busqueda, 350);

  // Datos
  const [productos,    setProductos]    = useState<ProductoReal[]>([]);
  const [total,        setTotal]        = useState(0);
  const [totalPags,    setTotalPags]    = useState(1);
  const [cargando,     setCargando]     = useState(false);
  const [filtrosOpts,  setFiltrosOpts]  = useState<FiltrosOpts>({ proveedores: [], marcas: [], rubros: [] });
  const [exportando,   setExportando]   = useState(false);

  // Orden
  const [ordenCol, setOrdenCol] = useState('');
  const [ordenDir, setOrdenDir] = useState<'asc' | 'desc'>('asc');

  // Selección
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [modoAplicar, setModoAplicar] = useState<'seleccionados' | 'filtrados'>('seleccionados');

  // Edición inline
  const [modoEdit,   setModoEdit]   = useState(false);
  const [edits,      setEdits]      = useState<Record<string, EditState>>({});
  const [pvActivo,   setPvActivo]   = useState<1 | 2 | 3>(1);
  const [guardando,  setGuardando]  = useState(false);
  const [msgGuardar, setMsgGuardar] = useState('');

  // Columnas visibles
  const COLS_DEFAULT = COLS.map(c => c.key);
  const [colsVisibles, setColsVisibles] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`columnas_productos_${clienteId}`);
      return saved ? JSON.parse(saved) : COLS_DEFAULT;
    } catch { return COLS_DEFAULT; }
  });
  const [colsMenuOpen, setColsMenuOpen] = useState(false);
  const colsMenuRef = useRef<HTMLDivElement>(null);
  const colVisible = (key: string) => colsVisibles.includes(key);

  // Acciones masivas
  const [campoMasivo, setCampoMasivo] = useState('');
  const [valorMasivo, setValorMasivo] = useState('');
  const [aplicandoMasivo, setAplicandoMasivo] = useState(false);
  const [eliminando,      setEliminando]       = useState(false);

  // Ajuste % precio
  const [modoAjuste, setModoAjuste] = useState(false);
  const [ajusteTipo, setAjusteTipo] = useState<'aumento_costo' | 'descuento_costo' | 'cambio_utilidad' | ''>('');
  const [ajustePct, setAjustePct] = useState('');
  const [ajusteUtilAnt, setAjusteUtilAnt] = useState('');
  const [ajusteUtilNueva, setAjusteUtilNueva] = useState('');
  const [ajustePreview, setAjustePreview] = useState<{
    id: number; codigo: string | null; descripcion: string;
    precio_costo_anterior: number; precio_costo_nuevo: number;
    pv1_anterior: number; pv1_nuevo: number;
    pv2_anterior: number; pv2_nuevo: number;
    pv3_anterior: number; pv3_nuevo: number;
  }[] | null>(null);
  const [ajusteCargando, setAjusteCargando] = useState(false);
  const [ajusteError, setAjusteError] = useState('');

  // Modals
  const [modalImportador, setModalImportador] = useState(false);
  const [modalEditar, setModalEditar]         = useState<ProductoReal | null>(null);
  const [modalNuevo, setModalNuevo]           = useState(false);

  // ── Helpers edición ──────────────────────────────────────────
  const defEdit = (p: ProductoReal): EditState => ({
    precio_costo: String(p.precio_costo || 0),
    dto_1: String(p.dto_1 || 0), dto_2: String(p.dto_2 || 0), dto_3: String(p.dto_3 || 0),
    imp_1: String(p.imp_1 || 0), imp_2: String(p.imp_2 || 0),
    alicuota_iva: String(p.alicuota_iva || 0),
    utilidad_1: String(p.utilidad_1 || 0), utilidad_2: String(p.utilidad_2 || 0), utilidad_3: String(p.utilidad_3 || 0),
    marca: p.marca || '', rubro: p.rubro || '', unidad_medida: p.unidad_medida || '',
    ean: p.ean || '', stock_minimo: String(p.stock_minimo || 0),
  });

  const getE = (p: ProductoReal, campo: keyof EditState): string => {
    const e = edits[p.id];
    return e ? (e[campo] ?? '') : (defEdit(p)[campo] ?? '');
  };

  const setE = (p: ProductoReal, campo: keyof EditState, v: string) => {
    setEdits(prev => ({ ...prev, [p.id]: { ...defEdit(p), ...prev[p.id], [campo]: v } }));
  };

  const n = (v: string) => parseFloat(v) || 0;

  const calcRow = (p: ProductoReal) => {
    const pc = n(getE(p, 'precio_costo'));
    const d1 = n(getE(p, 'dto_1')), d2 = n(getE(p, 'dto_2')), d3 = n(getE(p, 'dto_3'));
    const i1 = n(getE(p, 'imp_1')), i2 = n(getE(p, 'imp_2')), iva = n(getE(p, 'alicuota_iva'));
    const u1 = n(getE(p, 'utilidad_1')), u2 = n(getE(p, 'utilidad_2')), u3 = n(getE(p, 'utilidad_3'));
    const pcF = calcPcFinal(pc, d1, d2, d3);
    return { pcF, pv1: calcPv(pcF, i1, i2, iva, u1), pv2: calcPv(pcF, i1, i2, iva, u2), pv3: calcPv(pcF, i1, i2, iva, u3) };
  };

  // ── Carga datos ──────────────────────────────────────────────
  const buildParams = useCallback((extra: Record<string, string> = {}) => {
    const p = new URLSearchParams(extra);
    if (busquedaDb.trim()) p.set('buscar', busquedaDb.trim());
    if (filtroProveedor) p.set('proveedor_id', filtroProveedor);
    if (filtroMarca) p.set('marca', filtroMarca);
    if (filtroRubro) p.set('rubro', filtroRubro);
    if (filtroEstado) p.set('activo', filtroEstado === 'activo' ? 'true' : 'false');
    if (fechaDesde) p.set('fecha_desde', fechaDesde);
    if (fechaHasta) p.set('fecha_hasta', fechaHasta);
    if (fechaDesde || fechaHasta) p.set('fecha_tipo', fechaTipo);
    return p;
  }, [busquedaDb, filtroProveedor, filtroMarca, filtroRubro, filtroEstado, fechaDesde, fechaHasta, fechaTipo]);

  const toggleDestacado = async (p: ProductoReal) => {
    const r = await fetch(`${API}/api/superadmin/catalogo/${clienteId}/productos/${p.id}/destacado`, {
      method: 'PUT', headers: { 'x-superadmin-token': token },
    });
    if (r.ok) {
      const data = await r.json();
      setProductos(prev => prev.map(x => x.id === p.id ? { ...x, destacado: data.destacado } : x));
    }
  };

  const cargarProductos = useCallback(async (pg: number) => {
    if (!clienteId) return;
    setCargando(true);
    try {
      const params = buildParams({ page: String(pg), limit: String(porPagina) });
      const r = await fetch(`${API}/api/superadmin/importador/productos/${clienteId}?${params}`, { headers: { 'x-superadmin-token': token } });
      if (r.ok) { const d = await r.json(); setProductos(d.productos || []); setTotal(d.total || 0); setTotalPags(d.paginas || 1); }
    } catch {} finally { setCargando(false); }
  }, [clienteId, token, buildParams, porPagina]);

  const cargarFiltros = useCallback(async () => {
    if (!clienteId) return;
    try {
      const r = await fetch(`${API}/api/superadmin/importador/productos/${clienteId}/filtros`, { headers: { 'x-superadmin-token': token } });
      if (r.ok) setFiltrosOpts(await r.json());
    } catch {}
  }, [clienteId, token]);

  useEffect(() => { cargarFiltros(); }, [cargarFiltros]);
  useEffect(() => { setPagina(1); cargarProductos(1); }, [cargarProductos]);

  useEffect(() => {
    if (clienteId) localStorage.setItem(`columnas_productos_${clienteId}`, JSON.stringify(colsVisibles));
  }, [colsVisibles, clienteId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colsMenuRef.current && !colsMenuRef.current.contains(e.target as Node)) setColsMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Orden ────────────────────────────────────────────────────
  const handleOrden = (key: string) => {
    if (key.startsWith('_')) return;
    if (ordenCol === key) setOrdenDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setOrdenCol(key); setOrdenDir('asc'); }
  };

  const productosSorted = [...productos].sort((a, b) => {
    if (!ordenCol) return 0;
    const va = (a as any)[ordenCol] ?? ''; const vb = (b as any)[ordenCol] ?? '';
    const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es-AR');
    return ordenDir === 'asc' ? cmp : -cmp;
  });

  const provNombre = (id: number | null) => filtrosOpts.proveedores.find(p => p.id === id)?.nombre || '—';

  // ── Selección ────────────────────────────────────────────────
  const toggleSel = (id: number) => setSeleccionados(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleTodos = () => {
    if (seleccionados.size === productos.length) setSeleccionados(new Set());
    else setSeleccionados(new Set(productos.map(p => p.id)));
  };

  // ── Guardar edición inline ────────────────────────────────────
  const handleGuardar = async () => {
    const modificados = Object.keys(edits);
    if (!modificados.length) { setModoEdit(false); return; }
    setGuardando(true); setMsgGuardar('');
    try {
      const body = {
        cliente_id: clienteId,
        productos: modificados.map(id => {
          const e = edits[id];
          const pc = n(e.precio_costo);
          const d1 = n(e.dto_1), d2 = n(e.dto_2), d3 = n(e.dto_3);
          const i1 = n(e.imp_1), i2 = n(e.imp_2), iva = n(e.alicuota_iva);
          const u1 = n(e.utilidad_1), u2 = n(e.utilidad_2), u3 = n(e.utilidad_3);
          const pcF = calcPcFinal(pc, d1, d2, d3);
          const pv1 = calcPv(pcF, i1, i2, iva, u1);
          const pv2 = calcPv(pcF, i1, i2, iva, u2);
          const pv3 = calcPv(pcF, i1, i2, iva, u3);
          const pvFinal = pvActivo === 1 ? pv1 : pvActivo === 2 ? pv2 : pv3;
          return {
            id:                 Number(id),
            precio_costo:       pc,
            descuento_1:        d1, descuento_2: d2, descuento_3: d3,
            impuesto_1:         i1, impuesto_2:  i2,
            iva,
            utilidad_1:         u1, utilidad_2: u2, utilidad_3: u3,
            precio_venta_final: pvFinal, precio_venta_1: pv1, precio_venta_2: pv2, precio_venta_3: pv3,
            marca:              e.marca || null,
            rubro:              e.rubro || null,
            unidad_medida:      e.unidad_medida || null,
            stock_minimo:       n(e.stock_minimo),
          };
        }),
      };
      const r = await fetch(`${API}/api/superadmin/importador/actualizar-precios-v2`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-superadmin-token': token }, body: JSON.stringify(body),
      });
      const d = await r.json();
      if (r.ok && d.ok) { setMsgGuardar(`✅ ${d.actualizados} actualizados`); setModoEdit(false); setEdits({}); cargarProductos(pagina); }
      else setMsgGuardar(`❌ ${d.mensaje || 'Error'}`);
    } catch { setMsgGuardar('❌ Error de conexión'); }
    finally { setGuardando(false); }
  };

  // ── Acciones masivas ──────────────────────────────────────────
  const handleMasivo = async () => {
    if (!campoMasivo) return;
    if (modoAplicar === 'seleccionados' && seleccionados.size === 0) return;
    const meta = CAMPOS_MASIVOS.find(c => c.campo === campoMasivo);
    const valorParsed = meta?.tipo === 'number' ? parseFloat(valorMasivo) || 0
      : meta?.tipo === 'bool' ? (valorMasivo === 'true') : valorMasivo;
    setAplicandoMasivo(true);
    try {
      let ids: number[];
      if (modoAplicar === 'filtrados') {
        const params = new URLSearchParams({ limit: String(Math.min(total || 9999, 5000)) });
        if (busquedaDb.trim()) params.set('buscar', busquedaDb.trim());
        if (filtroProveedor) params.set('proveedor_id', filtroProveedor);
        if (filtroMarca) params.set('marca', filtroMarca);
        if (filtroRubro) params.set('rubro', filtroRubro);
        if (filtroEstado) params.set('activo', filtroEstado === 'activo' ? 'true' : 'false');
        if (fechaDesde) params.set('fecha_desde', fechaDesde);
        if (fechaHasta) params.set('fecha_hasta', fechaHasta);
        if (fechaDesde || fechaHasta) params.set('fecha_tipo', fechaTipo);
        const rIds = await fetch(`${API}/api/superadmin/importador/productos/${clienteId}?${params}`, {
          headers: { 'x-superadmin-token': token },
        });
        const dIds = await rIds.json();
        ids = (dIds.productos || []).map((p: any) => p.id);
        if (!ids.length) { alert('No hay productos con esos filtros'); setAplicandoMasivo(false); return; }
      } else {
        ids = Array.from(seleccionados);
      }
      const r = await fetch(`${API}/api/superadmin/importador/actualizar-masivo`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-superadmin-token': token },
        body: JSON.stringify({ cliente_id: clienteId, ids, campo: campoMasivo, valor: valorParsed }),
      });
      const d = await r.json();
      if (r.ok && d.ok) { setSeleccionados(new Set()); cargarProductos(pagina); cargarFiltros(); }
      else alert(d.mensaje || 'Error al aplicar');
    } catch { alert('Error de conexión'); }
    finally { setAplicandoMasivo(false); }
  };

  // ── Ajuste % precio ───────────────────────────────────────────
  const resetAjuste = () => {
    setModoAjuste(false); setAjusteTipo(''); setAjustePct('');
    setAjusteUtilAnt(''); setAjusteUtilNueva('');
    setAjustePreview(null); setAjusteError('');
  };

  const buildBodyAjuste = (confirmar: boolean): Record<string, any> => {
    const body: Record<string, any> = {
      cliente_id: clienteId,
      ids: Array.from(seleccionados),
      tipo: ajusteTipo,
      confirmar,
    };
    if (ajusteTipo === 'cambio_utilidad') {
      body.utilidad_anterior = parseFloat(ajusteUtilAnt) || 0;
      body.utilidad_nueva    = parseFloat(ajusteUtilNueva) || 0;
    } else {
      body.porcentaje = parseFloat(ajustePct) || 0;
    }
    return body;
  };

  const verPreviewAjuste = async () => {
    if (!ajusteTipo) return;
    setAjusteError(''); setAjusteCargando(true);
    try {
      const r = await fetch(`${API}/api/superadmin/importador/ajuste-porcentaje`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-superadmin-token': token },
        body: JSON.stringify(buildBodyAjuste(false)),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.mensaje || 'Error al calcular');
      setAjustePreview(d.productos);
    } catch (e: any) { setAjusteError(e.message); }
    finally { setAjusteCargando(false); }
  };

  const confirmarAjuste = async () => {
    if (!ajustePreview) return;
    setAjusteCargando(true); setAjusteError('');
    try {
      const r = await fetch(`${API}/api/superadmin/importador/ajuste-porcentaje`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-superadmin-token': token },
        body: JSON.stringify(buildBodyAjuste(true)),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.mensaje || 'Error al confirmar');
      await cargarProductos(pagina);
      await cargarFiltros();
      setSeleccionados(new Set());
      resetAjuste();
    } catch (e: any) { setAjusteError(e.message); }
    finally { setAjusteCargando(false); }
  };

  // ── Eliminar ──────────────────────────────────────────────────
  const handleEliminarSeleccionados = async () => {
    const n = seleccionados.size;
    if (n === 0) return;
    if (!window.confirm(`¿Seguro que querés eliminar ${n} producto${n !== 1 ? 's' : ''}?\nEsta acción no se puede deshacer.`)) return;
    setEliminando(true);
    try {
      const r = await fetch(`${API}/api/superadmin/importador/productos`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-superadmin-token': token },
        body: JSON.stringify({ cliente_id: clienteId, ids: Array.from(seleccionados) }),
      });
      const d = await r.json();
      if (r.ok && d.ok) { setSeleccionados(new Set()); cargarProductos(1); cargarFiltros(); }
      else alert(d.mensaje || 'Error al eliminar');
    } catch { alert('Error de conexión'); }
    finally { setEliminando(false); }
  };

  const handleEliminarFiltrados = async () => {
    if (!window.confirm(`¿Seguro que querés eliminar ${total} producto${total !== 1 ? 's' : ''} que coinciden con los filtros?\nEsta acción no se puede deshacer.`)) return;
    setEliminando(true);
    try {
      const body: Record<string, any> = { cliente_id: clienteId };
      if (busquedaDb.trim())       body.buscar       = busquedaDb.trim();
      if (filtroProveedor)         body.proveedor_id  = filtroProveedor;
      if (filtroMarca)             body.marca         = filtroMarca;
      if (filtroRubro)             body.rubro         = filtroRubro;
      if (filtroEstado)            body.activo        = filtroEstado === 'activo' ? 'true' : 'false';
      if (fechaDesde)              body.fecha_desde   = fechaDesde;
      if (fechaHasta)              body.fecha_hasta   = fechaHasta;
      if (fechaDesde || fechaHasta) body.fecha_tipo   = fechaTipo;
      const r = await fetch(`${API}/api/superadmin/importador/productos`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-superadmin-token': token },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (r.ok && d.ok) {
        setBusqueda(''); setFiltroProveedor(''); setBusqProvText(''); setBusqProv(''); setFiltroMarca(''); setFiltroRubro(''); setFiltroEstado('');
        setFechaDesde(''); setFechaHasta('');
        cargarProductos(1); cargarFiltros();
      } else alert(d.mensaje || 'Error al eliminar');
    } catch { alert('Error de conexión'); }
    finally { setEliminando(false); }
  };

  // ── Export ────────────────────────────────────────────────────
  const handleExportar = async () => {
    if (exportando) return;
    setExportando(true);
    try {
      const params = buildParams();
      const r = await fetch(`${API}/api/superadmin/importador/productos/${clienteId}/exportar?${params}`, { headers: { 'x-superadmin-token': token } });
      if (!r.ok) { alert('Error al exportar'); return; }
      const d = await r.json();
      let XLSX: any = (window as any).XLSX;
      if (!XLSX) {
        await new Promise<void>((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = () => res(); s.onerror = rej; document.head.appendChild(s); });
        XLSX = (window as any).XLSX;
      }
      const cabeceras = ['Código','Descripción','Marca','Proveedor','Rubro','PC Base','Dt1%','Dt2%','Dt3%','PC Final','Imp1%','Imp2%','IVA%','Ut1%','Ut2%','Ut3%','PV1','PV2','PV3','Stock','Stock Min','Unidad','EAN','Activo','F.Import'];
      const filas = (d.productos || []).map((p: any) => {
        const pcF = calcPcFinal(p.precio_costo||0, p.dto_1||0, p.dto_2||0, p.dto_3||0);
        const base = pcF*(1+(p.imp_1||0)/100)*(1+(p.imp_2||0)/100)*(1+(p.alicuota_iva||0)/100);
        return [p.codigo||'', p.descripcion||'', p.marca||'', p.proveedor||'', p.rubro||'',
          p.precio_costo||0, p.dto_1||0, p.dto_2||0, p.dto_3||0, +pcF.toFixed(2),
          p.imp_1||0, p.imp_2||0, p.alicuota_iva||0, p.utilidad_1||0, p.utilidad_2||0, p.utilidad_3||0,
          +(base*(1+(p.utilidad_1||0)/100)).toFixed(2),
          +(base*(1+(p.utilidad_2||0)/100)).toFixed(2),
          +(base*(1+(p.utilidad_3||0)/100)).toFixed(2),
          p.stock||0, p.stock_minimo||0, p.unidad_medida||'', p.ean||'',
          p.activo?'Sí':'No', p.fecha_importacion?new Date(p.fecha_importacion).toLocaleDateString('es-AR'):''];
      });
      const ws = XLSX.utils.aoa_to_sheet([cabeceras, ...filas]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Productos');
      XLSX.writeFile(wb, `Productos_${getClienteNombre()}_${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch (e) { alert('Error al exportar'); }
    finally { setExportando(false); }
  };

  // ── Render ────────────────────────────────────────────────────
  const cantEdit = Object.keys(edits).length;
  const cantSel  = seleccionados.size;
  const hayFiltros = busqueda || filtroProveedor || filtroMarca || filtroRubro || filtroEstado || fechaDesde || fechaHasta;

  const eInput = (p: ProductoReal, campo: keyof EditState, w = 60) => (
    modoEdit ? (
      <input type="number" step="any" style={{ ...inputSt, width: w, textAlign: 'right', padding: '3px 5px', fontSize: 11 }}
        value={getE(p, campo)} onChange={e => setE(p, campo, e.target.value)} />
    ) : null
  );
  const eText = (p: ProductoReal, campo: keyof EditState, w = 80) => (
    modoEdit ? (
      <input type="text" style={{ ...inputSt, width: w, padding: '3px 5px', fontSize: 11 }}
        value={getE(p, campo)} onChange={e => setE(p, campo, e.target.value)} />
    ) : null
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG }}>
      {/* MODALS */}
      {modalImportador && <ModalImportadorV2 onCerrar={() => setModalImportador(false)} onExito={() => { cargarProductos(1); cargarFiltros(); }} />}
      {modalEditar && <ModalEditarProducto producto={modalEditar} proveedores={filtrosOpts.proveedores} clienteId={clienteId} token={token}
        onCerrar={() => setModalEditar(null)}
        onGuardado={updated => { setProductos(prev => prev.map(p => p.id === updated.id ? updated : p)); setModalEditar(null); }} />}
      {modalNuevo && <ModalNuevoProducto proveedores={filtrosOpts.proveedores} clienteId={clienteId} token={token}
        onCerrar={() => setModalNuevo(false)}
        onGuardado={() => { setModalNuevo(false); cargarProductos(1); cargarFiltros(); }} />}

      {/* HEADER */}
      <div style={{ backgroundColor: NAVY, padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10 }}>
        <button style={{ ...btnStyle('#2D3748', '#fff'), fontSize: 13 }} onClick={() => navigate('/roberto/dashboard')}>
          ← Volver
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>📦 Productos</div>
          <div style={{ fontSize: 12, color: SEP }}>{cargando ? 'Cargando...' : `${total} productos`}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {modoEdit ? (
            <>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {([1,2,3] as const).map(v => (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#fff', fontSize: 12, cursor: 'pointer' }}>
                    <input type="radio" name="pvH" checked={pvActivo === v} onChange={() => setPvActivo(v)} style={{ accentColor: GREEN }} />PV{v}
                  </label>
                ))}
              </div>
              <button style={btnStyle(GREEN, '#fff', guardando || cantEdit === 0)} disabled={guardando || cantEdit === 0} onClick={() => { handleGuardar(); }}>
                {guardando ? '⏳ Guardando...' : `✅ Guardar${cantEdit > 0 ? ` (${cantEdit})` : ''}`}
              </button>
              <button style={btnStyle('#718096', '#fff')} onClick={() => { setModoEdit(false); setEdits({}); setMsgGuardar(''); }}>✗ Cancelar</button>
            </>
          ) : (
            <button style={btnStyle(ORANGE)} onClick={() => { setModoEdit(true); setEdits({}); setMsgGuardar(''); }}>✏️ Editar precios</button>
          )}
          {msgGuardar && <span style={{ color: msgGuardar.startsWith('✅') ? '#9AE6B4' : '#FC8181', fontSize: 12, alignSelf: 'center' }}>{msgGuardar}</span>}
          <button style={btnStyle(BLUE)} onClick={() => setModalNuevo(true)}>➕ Nuevo producto</button>
          <button style={btnStyle(BLUE)} onClick={() => setModalImportador(true)}>📥 Importar Excel</button>
          <button style={btnStyle('#2F855A', '#fff', exportando)} disabled={exportando} onClick={handleExportar}>
            {exportando ? '⏳' : '📤 Exportar'}
          </button>
        </div>
      </div>

      {/* BARRA ACCIONES MASIVAS */}
      {(cantSel > 0 || !!hayFiltros) && (
        <div style={{ backgroundColor: '#FFFBEB', borderBottom: `2px solid ${YELLOW}`, padding: '10px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Fila principal */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Selector Aplicar a */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1.5px solid ${ORANGE}`, borderRadius: 7, padding: '3px 8px', backgroundColor: '#fff' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: NAVY, whiteSpace: 'nowrap' }}>Aplicar a:</span>
              <label style={{ fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                <input type="radio" name="modoAplicar" value="seleccionados" checked={modoAplicar === 'seleccionados'} onChange={() => setModoAplicar('seleccionados')} style={{ accentColor: ORANGE }} />
                <span style={{ color: modoAplicar === 'seleccionados' ? ORANGE : GRAY }}>Seleccionados ({cantSel})</span>
              </label>
              <label style={{ fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                <input type="radio" name="modoAplicar" value="filtrados" checked={modoAplicar === 'filtrados'} onChange={() => setModoAplicar('filtrados')} style={{ accentColor: ORANGE }} />
                <span style={{ color: modoAplicar === 'filtrados' ? ORANGE : GRAY }}>Filtrados ({total})</span>
              </label>
            </div>

            <select style={{ ...selectSt, width: 'auto', minWidth: 160, fontSize: 13 }} value={modoAjuste ? '___ajuste___' : campoMasivo} onChange={e => {
              if (e.target.value === '___ajuste___') { setModoAjuste(true); setCampoMasivo(''); setValorMasivo(''); }
              else { setModoAjuste(false); resetAjuste(); setCampoMasivo(e.target.value); setValorMasivo(''); }
            }}>
              <option value="">Seleccionar acción...</option>
              {CAMPOS_MASIVOS.map(c => <option key={c.campo} value={c.campo}>{c.label}</option>)}
              <option value="___ajuste___">📊 Ajuste % precio</option>
            </select>

            {/* Acciones masivas campo fijo */}
            {!modoAjuste && campoMasivo && (() => {
              const meta = CAMPOS_MASIVOS.find(c => c.campo === campoMasivo);
              if (meta?.tipo === 'bool') return (
                <select style={{ ...selectSt, width: 'auto', fontSize: 13 }} value={valorMasivo} onChange={e => setValorMasivo(e.target.value)}>
                  <option value="">—</option><option value="true">Activo</option><option value="false">Inactivo</option>
                </select>
              );
              return <input type={meta?.tipo === 'number' ? 'number' : 'text'} step="any" placeholder="Valor..." style={{ ...inputSt, width: 120, fontSize: 13, padding: '6px 10px' }} value={valorMasivo} onChange={e => setValorMasivo(e.target.value)} />;
            })()}
            {!modoAjuste && campoMasivo && valorMasivo !== '' && (
              <button style={btnStyle(ORANGE, '#fff', aplicandoMasivo)} disabled={aplicandoMasivo} onClick={handleMasivo}>
                {aplicandoMasivo ? '⏳' : modoAplicar === 'filtrados' ? `Aplicar a ${total} filtrados` : `Aplicar a ${cantSel}`}
              </button>
            )}
            {cantSel > 0 && (
              <button style={btnStyle('#C53030', '#fff', eliminando)} disabled={eliminando} onClick={handleEliminarSeleccionados}>
                {eliminando ? '⏳' : `🗑 Eliminar (${cantSel})`}
              </button>
            )}
            <button style={btnStyle('#EDF2F7', GRAY)} onClick={() => { setSeleccionados(new Set()); resetAjuste(); setCampoMasivo(''); setValorMasivo(''); }}>✕ Limpiar</button>
          </div>

          {/* Panel ajuste % */}
          {modoAjuste && (
            <div style={{ backgroundColor: '#fff', border: `1.5px solid ${ORANGE}`, borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>📊 Ajuste de precio — {cantSel} producto{cantSel !== 1 ? 's' : ''} seleccionado{cantSel !== 1 ? 's' : ''}</div>

              {ajusteError && (
                <div style={{ backgroundColor: '#FFF5F5', border: `1px solid ${RED}`, borderRadius: 7, padding: '8px 12px', color: RED, fontSize: 13 }}>⚠️ {ajusteError}</div>
              )}

              {/* PASO 1 — Tipo */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {([
                  ['aumento_costo',   '📈 Aumentar precio costo X%'],
                  ['descuento_costo', '📉 Descontar precio costo X%'],
                  ['cambio_utilidad', '🔧 Cambiar utilidad de X% a Y%'],
                ] as const).map(([val, lbl]) => (
                  <button key={val} onClick={() => { setAjusteTipo(val); setAjustePreview(null); setAjusteError(''); }}
                    style={{
                      padding: '7px 14px', fontSize: 13, fontWeight: ajusteTipo === val ? 700 : 400,
                      border: `1.5px solid ${ajusteTipo === val ? ORANGE : '#CBD5E0'}`,
                      borderRadius: 8, cursor: 'pointer',
                      backgroundColor: ajusteTipo === val ? '#FFF3E0' : '#fff',
                      color: ajusteTipo === val ? ORANGE : TEXT,
                    }}>{lbl}</button>
                ))}
              </div>

              {/* PASO 2 — Valores */}
              {ajusteTipo && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  {ajusteTipo === 'cambio_utilidad' ? (
                    <>
                      <div>
                        <label style={labelSt}>Utilidad actual (%)</label>
                        <input type="number" step="any" style={{ ...inputSt, width: 100, fontSize: 13, padding: '6px 10px' }}
                          value={ajusteUtilAnt} onChange={e => { setAjusteUtilAnt(e.target.value); setAjustePreview(null); }} placeholder="Ej: 30" />
                      </div>
                      <span style={{ fontSize: 18, color: GRAY, alignSelf: 'flex-end', paddingBottom: 4 }}>→</span>
                      <div>
                        <label style={labelSt}>Utilidad nueva (%)</label>
                        <input type="number" step="any" style={{ ...inputSt, width: 100, fontSize: 13, padding: '6px 10px' }}
                          value={ajusteUtilNueva} onChange={e => { setAjusteUtilNueva(e.target.value); setAjustePreview(null); }} placeholder="Ej: 35" />
                      </div>
                    </>
                  ) : (
                    <div>
                      <label style={labelSt}>Porcentaje (%)</label>
                      <input type="number" step="any" min="0" style={{ ...inputSt, width: 110, fontSize: 13, padding: '6px 10px' }}
                        value={ajustePct} onChange={e => { setAjustePct(e.target.value); setAjustePreview(null); }} placeholder="Ej: 10" />
                    </div>
                  )}

                  {/* PASO 3 — Ver preview */}
                  {!ajustePreview && (
                    <button
                      style={{ ...btnStyle(BLUE, '#fff', ajusteCargando), alignSelf: 'flex-end' }}
                      disabled={ajusteCargando || (ajusteTipo === 'cambio_utilidad' ? (!ajusteUtilAnt || !ajusteUtilNueva) : !ajustePct)}
                      onClick={verPreviewAjuste}
                    >
                      {ajusteCargando ? '⏳ Calculando...' : '🔍 Ver previsualización'}
                    </button>
                  )}
                  {ajustePreview && (
                    <button style={{ ...btnStyle('#EDF2F7', GRAY), alignSelf: 'flex-end' }} onClick={() => { setAjustePreview(null); setAjusteError(''); }}>
                      ↩ Cambiar valores
                    </button>
                  )}
                </div>
              )}

              {/* PASO 3 — Tabla preview */}
              {ajustePreview && ajustePreview.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    Previsualización — {ajustePreview.length} producto{ajustePreview.length !== 1 ? 's' : ''}
                  </div>
                  <div style={{ maxHeight: 260, overflowY: 'auto', borderRadius: 8, border: '1px solid #E2E8F0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ backgroundColor: '#EBF4FF', position: 'sticky', top: 0 }}>
                          {['Código','Descripción','Costo actual','Costo nuevo','PV1 actual','PV1 nuevo','Variación %'].map(h => (
                            <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Descripción' ? 'left' : 'right', color: NAVY, fontWeight: 700, borderBottom: `2px solid ${SEP}`, whiteSpace: 'nowrap', fontSize: 11 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ajustePreview.map((p, i) => {
                          const variacion = p.precio_costo_anterior > 0
                            ? ((p.precio_costo_nuevo - p.precio_costo_anterior) / p.precio_costo_anterior * 100)
                            : 0;
                          const varColor = variacion > 0 ? RED : variacion < 0 ? GREEN : GRAY;
                          return (
                            <tr key={p.id} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                              <td style={{ padding: '5px 10px', borderBottom: '1px solid #EDF2F7', fontWeight: 600, color: NAVY, whiteSpace: 'nowrap' }}>{p.codigo || '—'}</td>
                              <td style={{ padding: '5px 10px', borderBottom: '1px solid #EDF2F7', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.descripcion}>{p.descripcion}</td>
                              <td style={{ padding: '5px 10px', borderBottom: '1px solid #EDF2F7', textAlign: 'right', color: GRAY }}>${numFmt(p.precio_costo_anterior)}</td>
                              <td style={{ padding: '5px 10px', borderBottom: '1px solid #EDF2F7', textAlign: 'right', fontWeight: 600, color: TEXT }}>${numFmt(p.precio_costo_nuevo)}</td>
                              <td style={{ padding: '5px 10px', borderBottom: '1px solid #EDF2F7', textAlign: 'right', color: GRAY }}>${numFmt(p.pv1_anterior)}</td>
                              <td style={{ padding: '5px 10px', borderBottom: '1px solid #EDF2F7', textAlign: 'right', fontWeight: 600, color: GREEN }}>${numFmt(p.pv1_nuevo)}</td>
                              <td style={{ padding: '5px 10px', borderBottom: '1px solid #EDF2F7', textAlign: 'right', fontWeight: 700, color: varColor }}>
                                {variacion > 0 ? '+' : ''}{variacion.toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* PASO 4 — Confirmar */}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button style={btnStyle('#EDF2F7', GRAY)} onClick={resetAjuste} disabled={ajusteCargando}>Cancelar</button>
                    <button style={btnStyle(GREEN, '#fff', ajusteCargando)} disabled={ajusteCargando} onClick={confirmarAjuste}>
                      {ajusteCargando ? '⏳ Aplicando...' : `✅ Confirmar ajuste (${ajustePreview.length} productos)`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* FILTROS */}
      <div style={{ backgroundColor: '#fff', margin: '16px 16px 0', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={labelSt}>Buscar</label>
            <input style={{ ...inputSt, fontSize: 13, padding: '7px 10px' }} value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Código o descripción..." />
          </div>
          <div style={{ flex: '1 1 200px', position: 'relative' }}>
            <label style={labelSt}>Proveedor</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                style={{ ...inputSt, fontSize: 13, padding: '7px 10px', paddingRight: filtroProveedor ? 28 : 10 }}
                value={busqProvText}
                placeholder={filtroProveedor ? filtrosOpts.proveedores.find(p => String(p.id) === filtroProveedor)?.nombre || 'Buscar proveedor...' : 'Todos los proveedores'}
                onChange={e => {
                  const v = e.target.value;
                  setBusqProvText(v);
                  setDropProvOpen(true);
                  if (busqProvTimer.current) clearTimeout(busqProvTimer.current);
                  busqProvTimer.current = setTimeout(() => setBusqProv(v), 300);
                }}
                onFocus={() => setDropProvOpen(true)}
                onBlur={() => setTimeout(() => setDropProvOpen(false), 150)}
              />
              {filtroProveedor && (
                <button
                  onClick={() => { setFiltroProveedor(''); setBusqProvText(''); setBusqProv(''); setPagina(1); }}
                  style={{ position: 'absolute', right: 6, background: 'none', border: 'none', cursor: 'pointer', color: GRAY, fontSize: 14, lineHeight: 1, padding: 2 }}
                  title="Limpiar filtro"
                >✕</button>
              )}
            </div>
            {dropProvOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1.5px solid #CBD5E0', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', zIndex: 50, marginTop: 2, overflow: 'hidden' }}>
                {(() => {
                  const txt = busqProv.toLowerCase();
                  const opts = txt
                    ? filtrosOpts.proveedores.filter(p => p.nombre.toLowerCase().includes(txt)).slice(0, 8)
                    : filtrosOpts.proveedores.slice(0, 8);
                  return opts.length === 0
                    ? <div style={{ padding: '8px 12px', fontSize: 13, color: GRAY }}>Sin resultados</div>
                    : opts.map(p => (
                      <button
                        key={p.id}
                        onMouseDown={() => {
                          setFiltroProveedor(String(p.id));
                          setBusqProvText('');
                          setBusqProv('');
                          setDropProvOpen(false);
                          setPagina(1);
                        }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, background: filtroProveedor === String(p.id) ? '#EBF8FF' : 'none', border: 'none', cursor: 'pointer', color: filtroProveedor === String(p.id) ? BLUE : TEXT, fontWeight: filtroProveedor === String(p.id) ? 600 : 400 }}
                      >
                        {p.nombre}
                      </button>
                    ));
                })()}
              </div>
            )}
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label style={labelSt}>Marca</label>
            <select style={{ ...selectSt, fontSize: 13, padding: '7px 10px' }} value={filtroMarca} onChange={e => { setFiltroMarca(e.target.value); setPagina(1); }}>
              <option value="">Todas</option>
              {filtrosOpts.marcas.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label style={labelSt}>Rubro</label>
            <select style={{ ...selectSt, fontSize: 13, padding: '7px 10px' }} value={filtroRubro} onChange={e => { setFiltroRubro(e.target.value); setPagina(1); }}>
              <option value="">Todos</option>
              {filtrosOpts.rubros.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 100px' }}>
            <label style={labelSt}>Estado</label>
            <select style={{ ...selectSt, fontSize: 13, padding: '7px 10px' }} value={filtroEstado} onChange={e => { setFiltroEstado(e.target.value); setPagina(1); }}>
              <option value="">Todos</option><option value="activo">Activo</option><option value="inactivo">Inactivo</option>
            </select>
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <label style={labelSt}>Fecha tipo</label>
            <select style={{ ...selectSt, fontSize: 13, padding: '7px 10px', width: 140 }} value={fechaTipo} onChange={e => setFechaTipo(e.target.value as 'importacion' | 'actualizacion')}>
              <option value="importacion">Importación</option><option value="actualizacion">Actualización</option>
            </select>
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <label style={labelSt}>Desde</label>
            <input type="date" style={{ ...inputSt, width: 140, fontSize: 13, padding: '7px 10px' }} value={fechaDesde} onChange={e => { setFechaDesde(e.target.value); setPagina(1); }} />
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <label style={labelSt}>Hasta</label>
            <input type="date" style={{ ...inputSt, width: 140, fontSize: 13, padding: '7px 10px' }} value={fechaHasta} onChange={e => { setFechaHasta(e.target.value); setPagina(1); }} />
          </div>
          {hayFiltros && (
            <button style={btnStyle('#EDF2F7', GRAY)} onClick={() => { setBusqueda(''); setFiltroProveedor(''); setBusqProvText(''); setBusqProv(''); setFiltroMarca(''); setFiltroRubro(''); setFiltroEstado(''); setFechaDesde(''); setFechaHasta(''); }}>
              ✕ Limpiar filtros
            </button>
          )}
          {hayFiltros && total > 0 && (
            <button style={btnStyle('#C53030', '#fff', eliminando)} disabled={eliminando} onClick={handleEliminarFiltrados}>
              {eliminando ? '⏳' : `🗑 Eliminar filtrados (${total})`}
            </button>
          )}
          <div style={{ position: 'relative', alignSelf: 'flex-end' }} ref={colsMenuRef}>
            <button style={btnStyle('#EDF2F7', NAVY)} onClick={() => setColsMenuOpen(v => !v)}>
              ⚙ Columnas {colsVisibles.length < COLS.length ? `(${colsVisibles.length}/${COLS.length})` : ''}
            </button>
            {colsMenuOpen && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 4,
                backgroundColor: '#fff', border: '1.5px solid #CBD5E0', borderRadius: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100,
                minWidth: 220, padding: '10px 0',
              }}>
                <div style={{ display: 'flex', gap: 6, padding: '0 12px 8px', borderBottom: '1px solid #EDF2F7', marginBottom: 6 }}>
                  <button onClick={() => setColsVisibles(COLS_DEFAULT)} style={{ flex: 1, padding: '4px', fontSize: 12, fontWeight: 600, border: '1px solid #CBD5E0', borderRadius: 6, cursor: 'pointer', backgroundColor: '#fff', color: NAVY }}>Todas</button>
                  <button onClick={() => setColsVisibles(['codigo', 'descripcion'])} style={{ flex: 1, padding: '4px', fontSize: 12, fontWeight: 600, border: '1px solid #CBD5E0', borderRadius: 6, cursor: 'pointer', backgroundColor: '#fff', color: GRAY }}>Ninguna</button>
                </div>
                <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                  {COLS.map(c => {
                    const fijo = c.key === 'codigo' || c.key === 'descripcion';
                    return (
                      <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', cursor: fijo ? 'not-allowed' : 'pointer', opacity: fijo ? 0.5 : 1 }}>
                        <input type="checkbox" checked={colVisible(c.key)} disabled={fijo}
                          onChange={() => {
                            if (fijo) return;
                            setColsVisibles(prev => prev.includes(c.key) ? prev.filter(k => k !== c.key) : [...prev, c.key]);
                          }}
                          style={{ accentColor: BLUE }} />
                        <span style={{ fontSize: 13 }}>{c.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TABLA */}
      <div style={{ margin: '12px 16px 16px', backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
          <table style={{ minWidth: 2400, borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...thSt(), width: 36, textAlign: 'center', position: 'sticky', top: 0, left: 0, zIndex: 4 }}>
                  <input type="checkbox" checked={seleccionados.size === productos.length && productos.length > 0} onChange={toggleTodos} style={{ accentColor: BLUE }} />
                </th>
                <th style={{ ...thSt(), width: 60, position: 'sticky', top: 0, left: 36, zIndex: 4 }}>Img</th>
                {COLS.filter(c => colVisible(c.key)).map(c => {
                  const stickyTh: React.CSSProperties =
                    c.key === 'codigo'
                      ? { position: 'sticky', top: 0, left: 96, zIndex: 4 }
                      : c.key === 'descripcion'
                      ? { position: 'sticky', top: 0, left: 186, zIndex: 4 }
                      : { position: 'sticky', top: 0, zIndex: 2 };
                  return (
                    <th key={c.key} style={{ ...thSt(ordenCol === c.key), width: c.width, cursor: c.key.startsWith('_') ? 'default' : 'pointer', ...stickyTh }}
                      onClick={() => handleOrden(c.key)}>
                      {c.label} {ordenCol === c.key ? (ordenDir === 'asc' ? '↑' : '↓') : ''}
                      {(c.key === '_pv1' || c.key === '_pv2' || c.key === '_pv3') && modoEdit && (
                        <span style={{ fontSize: 9, color: pvActivo === parseInt(c.key.slice(-1)) ? GREEN : GRAY }}>
                          {pvActivo === parseInt(c.key.slice(-1)) ? ' ★' : ''}
                        </span>
                      )}
                    </th>
                  );
                })}
                <th style={{ ...thSt(), width: 90, position: 'sticky', top: 0, zIndex: 2 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={colsVisibles.length + 3} style={{ textAlign: 'center', padding: 32, color: GRAY, fontSize: 14 }}>Cargando...</td></tr>
              ) : productosSorted.length === 0 ? (
                <tr><td colSpan={colsVisibles.length + 3} style={{ textAlign: 'center', padding: 32, color: GRAY, fontSize: 14 }}>Sin productos</td></tr>
              ) : productosSorted.map((p, idx) => {
                const { pcF, pv1, pv2, pv3 } = calcRow(p);
                const isSel = seleccionados.has(p.id);
                const isHov = hoveredId === p.id;
                const isEdit = !!edits[String(p.id)];
                const rowBg = isSel ? '#EBF8FF' : isHov ? '#EBF4FF' : idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
                const td = { ...tdSt, backgroundColor: rowBg };
                const calcTdR = { ...calcTd, backgroundColor: isSel ? '#C6E6FF' : CALC_BG };
                const calcTd2R = { ...calcTd2, backgroundColor: isSel ? '#B2F5D6' : CALC_BG2 };

                return (
                  <tr
                    key={p.id}
                    style={{ backgroundColor: rowBg, borderLeft: isEdit ? '3px solid #C9A84C' : '3px solid transparent' }}
                    onMouseEnter={() => setHoveredId(p.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onDoubleClick={() => !modoEdit && setModalEditar(p)}
                  >
                    <td style={{ ...td, textAlign: 'center', width: 36, position: 'sticky', left: 0, zIndex: 1 }}>
                      <input type="checkbox" checked={isSel} onChange={() => toggleSel(p.id)} style={{ accentColor: BLUE }} />
                    </td>
                    <td style={{ ...td, width: 60, textAlign: 'center', position: 'sticky', left: 36, zIndex: 1 }}>
                      {p.imagen_url
                        ? <img src={p.imagen_url} alt={p.descripcion} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid #EEEEEE' }} onError={e => { e.currentTarget.src = ''; e.currentTarget.style.display = 'none'; }} />
                        : <span style={{ fontSize: 20 }}>📦</span>}
                    </td>
                    {/* Código */}
                    {colVisible('codigo') && <td style={{ ...td, width: 90, fontWeight: 600, color: NAVY, position: 'sticky', left: 96, zIndex: 1 }}>{p.codigo || '—'}</td>}
                    {/* Descripción */}
                    {colVisible('descripcion') && (
                      <td style={{ ...td, width: 250, minWidth: 250, maxWidth: 250, whiteSpace: 'normal', position: 'sticky', left: 186, zIndex: 1 }} title={p.descripcion}>
                        <div style={{ overflow: 'hidden', display: '-webkit-box' as any, WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, wordBreak: 'break-word', lineHeight: '1.35em', maxHeight: '2.7em' }}>
                          {p.descripcion}
                        </div>
                      </td>
                    )}
                    {/* Marca */}
                    {colVisible('marca') && <td style={{ ...td, width: 90 }}>
                      {modoEdit ? eText(p, 'marca', 85) : (p.marca || '—')}
                    </td>}
                    {/* Rubro */}
                    {colVisible('rubro') && <td style={{ ...td, width: 90 }}>
                      {modoEdit ? eText(p, 'rubro', 85) : (p.rubro || '—')}
                    </td>}
                    {/* Proveedor */}
                    {colVisible('proveedor') && <td style={{ ...td, width: 100 }}>{provNombre(p.proveedor_id)}</td>}
                    {/* EAN */}
                    {colVisible('ean') && <td style={{ ...td, width: 110 }}>
                      {modoEdit ? eText(p, 'ean', 105) : (p.ean || '—')}
                    </td>}
                    {/* PC Base */}
                    {colVisible('precio_costo') && <td style={{ ...td, width: 80, textAlign: 'right' }}>
                      {modoEdit ? eInput(p, 'precio_costo', 74) : `$${numFmt(p.precio_costo)}`}
                    </td>}
                    {/* Dt1 */}
                    {colVisible('dto_1') && <td style={{ ...td, width: 60, textAlign: 'right' }}>
                      {modoEdit ? eInput(p, 'dto_1', 54) : pctFmt(p.dto_1)}
                    </td>}
                    {/* Dt2 */}
                    {colVisible('dto_2') && <td style={{ ...td, width: 60, textAlign: 'right' }}>
                      {modoEdit ? eInput(p, 'dto_2', 54) : pctFmt(p.dto_2)}
                    </td>}
                    {/* Dt3 */}
                    {colVisible('dto_3') && <td style={{ ...td, width: 60, textAlign: 'right' }}>
                      {modoEdit ? eInput(p, 'dto_3', 54) : pctFmt(p.dto_3)}
                    </td>}
                    {/* PC Final */}
                    {colVisible('_pcf') && <td style={{ ...calcTdR, width: 80, textAlign: 'right' }}>${numFmt(pcF)}</td>}
                    {/* Imp1 */}
                    {colVisible('imp_1') && <td style={{ ...td, width: 60, textAlign: 'right' }}>
                      {modoEdit ? eInput(p, 'imp_1', 54) : pctFmt(p.imp_1)}
                    </td>}
                    {/* Imp2 */}
                    {colVisible('imp_2') && <td style={{ ...td, width: 60, textAlign: 'right' }}>
                      {modoEdit ? eInput(p, 'imp_2', 54) : pctFmt(p.imp_2)}
                    </td>}
                    {/* IVA */}
                    {colVisible('alicuota_iva') && <td style={{ ...td, width: 60, textAlign: 'right' }}>
                      {modoEdit ? eInput(p, 'alicuota_iva', 54) : pctFmt(p.alicuota_iva)}
                    </td>}
                    {/* Ut1 */}
                    {colVisible('utilidad_1') && <td style={{ ...td, width: 60, textAlign: 'right' }}>
                      {modoEdit ? eInput(p, 'utilidad_1', 54) : pctFmt(p.utilidad_1)}
                    </td>}
                    {/* Ut2 */}
                    {colVisible('utilidad_2') && <td style={{ ...td, width: 60, textAlign: 'right' }}>
                      {modoEdit ? eInput(p, 'utilidad_2', 54) : pctFmt(p.utilidad_2)}
                    </td>}
                    {/* Ut3 */}
                    {colVisible('utilidad_3') && <td style={{ ...td, width: 60, textAlign: 'right' }}>
                      {modoEdit ? eInput(p, 'utilidad_3', 54) : pctFmt(p.utilidad_3)}
                    </td>}
                    {/* PV1 */}
                    {colVisible('_pv1') && <td style={{ ...calcTd2R, width: 80, textAlign: 'right', fontWeight: pvActivo === 1 ? 700 : 400 }}>${numFmt(pv1)}</td>}
                    {/* PV2 */}
                    {colVisible('_pv2') && <td style={{ ...calcTd2R, width: 80, textAlign: 'right', fontWeight: pvActivo === 2 ? 700 : 400 }}>${numFmt(pv2)}</td>}
                    {/* PV3 */}
                    {colVisible('_pv3') && <td style={{ ...calcTd2R, width: 80, textAlign: 'right', fontWeight: pvActivo === 3 ? 700 : 400 }}>${numFmt(pv3)}</td>}
                    {/* Stock */}
                    {colVisible('stock_actual') && <td style={{ ...td, width: 60, textAlign: 'right' }}>{numFmt(p.stock_actual, 0)}</td>}
                    {/* Stock Min */}
                    {colVisible('stock_minimo') && <td style={{ ...td, width: 70, textAlign: 'right' }}>
                      {modoEdit ? eInput(p, 'stock_minimo', 64) : numFmt(p.stock_minimo, 0)}
                    </td>}
                    {/* Unidad */}
                    {colVisible('unidad_medida') && <td style={{ ...td, width: 70 }}>
                      {modoEdit ? eText(p, 'unidad_medida', 64) : (p.unidad_medida || '—')}
                    </td>}
                    {/* F.Import */}
                    {colVisible('creado_en') && <td style={{ ...td, width: 90 }}>{fmtFecha(p.creado_en)}</td>}
                    {/* Estado */}
                    {colVisible('activo') && <td style={{ ...td, width: 75 }}><BadgeEstado activo={p.activo} /></td>}
                    {/* Destacado */}
                    {colVisible('destacado') && (
                      <td style={{ ...td, width: 50, textAlign: 'center' }}>
                        <button onClick={() => toggleDestacado(p)} title={p.destacado ? 'Quitar destacado' : 'Marcar destacado'}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, opacity: p.destacado ? 1 : 0.25, padding: 0 }}>
                          ⭐
                        </button>
                      </td>
                    )}
                    {/* Acciones */}
                    <td style={{ ...td, width: 90 }}>
                      <button style={{ ...btnStyle(BLUE, '#fff'), padding: '4px 10px', fontSize: 11 }} onClick={() => setModalEditar(p)}>✏️ Editar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #EDF2F7', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: GRAY }}>Filas por página:</span>
            <select style={{ ...selectSt, width: 70, fontSize: 13, padding: '4px 8px' }} value={porPagina} onChange={e => { setPorPagina(Number(e.target.value)); setPagina(1); }}>
              {POR_PAG_OPTS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span style={{ fontSize: 13, color: GRAY }}>Total: <strong>{total}</strong></span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={btnStyle('#EDF2F7', GRAY, pagina <= 1)} disabled={pagina <= 1} onClick={() => { setPagina(1); cargarProductos(1); }}>«</button>
            <button style={btnStyle('#EDF2F7', GRAY, pagina <= 1)} disabled={pagina <= 1} onClick={() => { const p = pagina - 1; setPagina(p); cargarProductos(p); }}>‹</button>
            <span style={{ fontSize: 13, color: TEXT, alignSelf: 'center', padding: '0 8px' }}>Pág {pagina} / {totalPags}</span>
            <button style={btnStyle('#EDF2F7', GRAY, pagina >= totalPags)} disabled={pagina >= totalPags} onClick={() => { const p = pagina + 1; setPagina(p); cargarProductos(p); }}>›</button>
            <button style={btnStyle('#EDF2F7', GRAY, pagina >= totalPags)} disabled={pagina >= totalPags} onClick={() => { setPagina(totalPags); cargarProductos(totalPags); }}>»</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RobertoProductos;
