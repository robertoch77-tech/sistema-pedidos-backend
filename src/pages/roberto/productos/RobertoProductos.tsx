import React, { useState, useRef, useCallback } from 'react';

const NAVY   = '#1B2A4A';
const BLUE   = '#2B6CB0';
const GREEN  = '#38A169';
const RED    = '#E53E3E';
const SEP    = '#63B3ED';
const GRAY   = '#718096';
const TEXT   = '#2D3748';
const BG     = '#F4F6F9';
const ORANGE = '#DD6B20';
const YELLOW = '#D69E2E';

const API = process.env.REACT_APP_API_URL || 'http://localhost:4000';

// ── helpers ─────────────────────────────────────────────────────────────────

function getToken() {
  try {
    const s = localStorage.getItem('superadmin_session');
    return s ? JSON.parse(s).token : '';
  } catch { return ''; }
}

function getClienteId() {
  try {
    const s = localStorage.getItem('roberto_portal_session');
    return s ? JSON.parse(s).cliente?.id : null;
  } catch { return null; }
}

// ── types ────────────────────────────────────────────────────────────────────

interface ItemDetalle {
  codigo: string; descripcion: string; precio_actual: number | null;
  precio_nuevo: number | null; variacion_porcentaje: number | null;
  tipo: 'nuevo' | 'subio' | 'bajo' | 'sin_cambio' | 'quitado';
  marca?: string; unidad_medida?: string; ean?: string;
  aprobado?: boolean;
}

interface Resumen {
  total_excel: number; nuevos: number; subieron: number; bajaron: number;
  sin_cambio: number; quitados: number; variacion_promedio: number;
}

interface MapeoState {
  codigo: string; descripcion: string; precio_costo: string; precio_venta_1: string;
  precio_venta_2: string; precio_venta_final: string; marca: string; rubro: string;
  unidad_medida: string; stock: string; ean: string;
  descuento_1: string; descuento_2: string; descuento_3: string; descuento_4: string;
  iva: string;
}

const MAPEO_INICIAL: MapeoState = {
  codigo: '', descripcion: '', precio_costo: '', precio_venta_1: '', precio_venta_2: '',
  precio_venta_final: '', marca: '', rubro: '', unidad_medida: '', stock: '', ean: '',
  descuento_1: '', descuento_2: '', descuento_3: '', descuento_4: '', iva: '',
};

// ── estilos reutilizables ────────────────────────────────────────────────────

const btnStyle = (bg: string, color = '#fff', disabled = false): React.CSSProperties => ({
  backgroundColor: disabled ? '#CBD5E0' : bg, color: disabled ? '#A0AEC0' : color,
  border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '13px',
  fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
  opacity: disabled ? 0.7 : 1,
});

const selectStyle: React.CSSProperties = {
  border: '1.5px solid #CBD5E0', borderRadius: '8px', padding: '8px 12px',
  fontSize: '13px', color: TEXT, backgroundColor: '#fff', outline: 'none', cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  ...selectStyle, boxSizing: 'border-box', width: '100%',
};

const labelSt: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600, color: GRAY,
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px',
};

// ── BadgeEstado ──────────────────────────────────────────────────────────────

function BadgeEstado({ activo }: { activo: boolean }) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: '20px',
      fontSize: '12px', fontWeight: 600,
      backgroundColor: activo ? '#F0FFF4' : '#FFF5F5',
      color: activo ? GREEN : RED,
    }}>
      {activo ? 'Activo' : 'Inactivo'}
    </span>
  );
}

// ── BadgeTipo ────────────────────────────────────────────────────────────────

function BadgeTipo({ tipo }: { tipo: ItemDetalle['tipo'] }) {
  const MAP: Record<string, [string, string, string]> = {
    nuevo:     ['Nuevo',      '#F0FFF4', GREEN],
    subio:     ['Subió ↑',   '#FFF5F5', RED],
    bajo:      ['Bajó ↓',    '#EBF8FF', BLUE],
    sin_cambio:['Sin cambio', '#F7FAFC', GRAY],
    quitado:   ['Quitado',   '#FFFAF0', YELLOW],
  };
  const [label, bg, color] = MAP[tipo] || ['?', '#EDF2F7', GRAY];
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, backgroundColor: bg, color }}>
      {label}
    </span>
  );
}

// ── BarraProgreso ────────────────────────────────────────────────────────────

function BarraProgreso({ paso }: { paso: number }) {
  const pasos = ['Subir archivo', 'Mapear columnas', 'Informe'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '16px 24px 0', marginBottom: '4px' }}>
      {pasos.map((p, i) => {
        const num = i + 1;
        const activo = num === paso;
        const hecho  = num < paso;
        return (
          <React.Fragment key={p}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700,
                backgroundColor: hecho ? GREEN : activo ? BLUE : '#E2E8F0',
                color: hecho || activo ? '#fff' : GRAY,
                marginBottom: 4,
              }}>
                {hecho ? '✓' : num}
              </div>
              <span style={{ fontSize: '11px', fontWeight: activo ? 700 : 400, color: activo ? BLUE : GRAY, whiteSpace: 'nowrap' }}>{p}</span>
            </div>
            {i < pasos.length - 1 && (
              <div style={{ flex: 2, height: 2, backgroundColor: hecho ? GREEN : '#E2E8F0', marginBottom: 16 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MODAL IMPORTADOR
// ════════════════════════════════════════════════════════════════════════════

function ModalImportador({ onCerrar, onExito }: { onCerrar: () => void; onExito: () => void }) {
  const [paso, setPaso]                     = useState(1);
  const [drag, setDrag]                     = useState(false);
  const [archivo, setArchivo]               = useState<File | null>(null);
  const [proveedor, setProveedor]           = useState('');
  const [cargando, setCargando]             = useState(false);
  const [error, setError]                   = useState('');
  const [columnas, setColumnas]             = useState<string[]>([]);
  const [filaEnc, setFilaEnc]               = useState(0);
  const [muestra, setMuestra]               = useState<Record<string, string>[]>([]);
  const [mapeo, setMapeo]                   = useState<MapeoState>(MAPEO_INICIAL);
  const [proveedorId, setProveedorId]       = useState<number | null>(null);
  const [resumen, setResumen]               = useState<Resumen | null>(null);
  const [detalle, setDetalle]               = useState<ItemDetalle[]>([]);
  const [filtroTipo, setFiltroTipo]         = useState('');
  const [busDetalle, setBusDetalle]         = useState('');
  const [selTodos, setSelTodos]             = useState(false);
  const [exito, setExito]                   = useState<{ aplicados: number; nuevos: number } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const token    = getToken();
  const clienteId = getClienteId();

  // ── Paso 1 — drop/select ─────────────────────────────────────────────────

  const aceptarArchivo = (f: File) => {
    if (!f.name.match(/\.(xlsx|xls)$/i)) {
      setError('Solo se aceptan archivos .xls y .xlsx');
      return;
    }
    setError('');
    setArchivo(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) aceptarArchivo(f);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analizar = async () => {
    if (!archivo) { setError('Seleccioná un archivo'); return; }
    if (!proveedor.trim()) { setError('Ingresá el nombre del proveedor'); return; }
    setError(''); setCargando(true);
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      const r = await fetch(`${API}/api/superadmin/importador/analizar`, {
        method: 'POST', headers: { 'x-superadmin-token': token }, body: fd,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.mensaje || 'Error al analizar');
      setColumnas(d.columnas);
      setFilaEnc(d.fila_encabezado);
      setMuestra(d.muestra || []);
      setMapeo(prev => ({
        ...prev,
        codigo:      d.columnas.find((c: string) => /codi?g/i.test(c)) || '',
        descripcion: d.columnas.find((c: string) => /desc/i.test(c)) || '',
        precio_costo: d.columnas.find((c: string) => /precio|costo/i.test(c)) || '',
      }));
      setPaso(2);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  // ── Paso 2 — mapear + comparar ───────────────────────────────────────────

  const previaMuestra = muestra.slice(0, 3);

  const comparar = async () => {
    if (!mapeo.codigo) { setError('El campo Código es obligatorio'); return; }
    if (!mapeo.descripcion) { setError('El campo Descripción es obligatorio'); return; }
    setError(''); setCargando(true);
    try {
      // mapear
      const mapObj: Record<string, string> = {};
      (Object.keys(mapeo) as (keyof MapeoState)[]).forEach(k => {
        if (mapeo[k]) mapObj[k] = mapeo[k];
      });
      const rm = await fetch(`${API}/api/superadmin/importador/mapear`, {
        method: 'POST',
        headers: { 'x-superadmin-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: clienteId, proveedor_nombre: proveedor.trim(),
          fila_encabezado: filaEnc, mapeo: mapObj,
        }),
      });
      const dm = await rm.json();
      if (!rm.ok) throw new Error(dm.mensaje || 'Error al guardar mapeo');
      setProveedorId(dm.proveedor_id);

      // comparar
      const fd = new FormData();
      fd.append('archivo', archivo!);
      fd.append('cliente_id', String(clienteId));
      fd.append('proveedor_id', String(dm.proveedor_id));
      fd.append('mapeo', JSON.stringify(mapObj));
      fd.append('fila_encabezado', String(filaEnc));
      const rc = await fetch(`${API}/api/superadmin/importador/comparar`, {
        method: 'POST', headers: { 'x-superadmin-token': token }, body: fd,
      });
      const dc = await rc.json();
      if (!rc.ok) throw new Error(dc.mensaje || 'Error al comparar');
      setResumen(dc.resumen);
      const items: ItemDetalle[] = dc.detalle.map((x: ItemDetalle) => ({ ...x, aprobado: x.tipo !== 'sin_cambio' }));
      setDetalle(items);
      setPaso(3);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  // ── Paso 3 — filtros y selección ─────────────────────────────────────────

  const detalleVisible = detalle.filter(x => {
    if (filtroTipo && x.tipo !== filtroTipo) return false;
    if (busDetalle && !x.descripcion.toLowerCase().includes(busDetalle.toLowerCase())) return false;
    return true;
  });

  const toggleAprobado = (codigo: string) => {
    setDetalle(prev => prev.map(x => x.codigo === codigo ? { ...x, aprobado: !x.aprobado } : x));
  };

  const toggleTodos = () => {
    const nuevo = !selTodos;
    setSelTodos(nuevo);
    setDetalle(prev => prev.map(x => {
      const visible = detalleVisible.find(v => v.codigo === x.codigo);
      return visible ? { ...x, aprobado: nuevo } : x;
    }));
  };

  const aprobados = detalle.filter(x => x.aprobado);

  const aplicar = async () => {
    if (!aprobados.length) return;
    setError(''); setCargando(true);
    try {
      const r = await fetch(`${API}/api/superadmin/importador/aplicar`, {
        method: 'POST',
        headers: { 'x-superadmin-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: clienteId, proveedor_id: proveedorId,
          productos_aprobados: aprobados,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.mensaje || 'Error al aplicar');
      setExito({
        aplicados: d.aplicados,
        nuevos: aprobados.filter(x => x.tipo === 'nuevo').length,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const titulos = ['Subir lista de precios', 'Configurar columnas', 'Informe de cambios'];

  const CAMPOS_MAPEO: { key: keyof MapeoState; label: string; obligatorio?: boolean }[] = [
    { key: 'codigo',          label: 'Código',              obligatorio: true },
    { key: 'descripcion',     label: 'Descripción',         obligatorio: true },
    { key: 'precio_costo',    label: 'Precio costo' },
    { key: 'precio_venta_1',  label: 'Precio venta 1' },
    { key: 'precio_venta_2',  label: 'Precio venta 2' },
    { key: 'precio_venta_final', label: 'Precio venta final' },
    { key: 'marca',           label: 'Marca' },
    { key: 'rubro',           label: 'Rubro' },
    { key: 'unidad_medida',   label: 'Unidad de medida' },
    { key: 'stock',           label: 'Stock' },
    { key: 'ean',             label: 'Código de barras (EAN)' },
    { key: 'descuento_1',     label: 'Descuento 1' },
    { key: 'descuento_2',     label: 'Descuento 2' },
    { key: 'descuento_3',     label: 'Descuento 3' },
    { key: 'descuento_4',     label: 'Descuento 4' },
    { key: 'iva',             label: 'IVA' },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '16px',
    }}
      onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}
    >
      <div style={{
        backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: 700,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>

        {/* ── Header modal ────────────────────────────────────────────── */}
        <div style={{
          backgroundColor: NAVY, borderRadius: '16px 16px 0 0',
          padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '11px', color: SEP, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
              {exito ? 'Importación completada' : `Paso ${paso} de 3`}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>
              {exito ? '✅ ¡Importación completada!' : titulos[paso - 1]}
            </div>
          </div>
          <button onClick={onCerrar} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '18px', width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
            ✕
          </button>
        </div>

        {/* ── Barra progreso ──────────────────────────────────────────── */}
        {!exito && <BarraProgreso paso={paso} />}

        {/* ── Cuerpo ──────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* Error global */}
          {error && (
            <div style={{ backgroundColor: '#FFF5F5', border: `1px solid ${RED}`, borderRadius: '8px', padding: '10px 14px', color: RED, fontSize: '13px', marginBottom: '16px', fontWeight: 500 }}>
              ⚠️ {error}
            </div>
          )}

          {/* ══ ÉXITO ════════════════════════════════════════════════ */}
          {exito && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: '64px', marginBottom: '16px' }}>✅</div>
              <h3 style={{ fontSize: '22px', fontWeight: 700, color: NAVY, margin: '0 0 12px' }}>
                ¡Importación completada!
              </h3>
              <p style={{ color: GRAY, fontSize: '14px', margin: '0 0 6px' }}>
                <strong style={{ color: GREEN }}>{exito.aplicados}</strong> productos actualizados
              </p>
              <p style={{ color: GRAY, fontSize: '14px', margin: '0 0 32px' }}>
                <strong style={{ color: BLUE }}>{exito.nuevos}</strong> productos nuevos agregados
              </p>
              <button style={btnStyle(GREEN)} onClick={() => { onExito(); onCerrar(); }}>
                Ver productos
              </button>
            </div>
          )}

          {/* ══ PASO 1 ═══════════════════════════════════════════════ */}
          {!exito && paso === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                style={{
                  border: `2px dashed ${drag ? BLUE : archivo ? GREEN : '#CBD5E0'}`,
                  borderRadius: '12px', padding: '36px 24px', textAlign: 'center',
                  cursor: 'pointer', transition: 'all 0.2s',
                  backgroundColor: drag ? '#EBF8FF' : archivo ? '#F0FFF4' : '#FAFAFA',
                }}
              >
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>
                  {archivo ? '✅' : '📊'}
                </div>
                {archivo ? (
                  <>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: GREEN, marginBottom: '4px' }}>{archivo.name}</div>
                    <div style={{ fontSize: '12px', color: GRAY }}>Clic para cambiar archivo</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: TEXT, marginBottom: '6px' }}>Arrastrá tu Excel aquí</div>
                    <div style={{ fontSize: '13px', color: GRAY }}>o hacé clic para seleccionar</div>
                    <div style={{ fontSize: '11px', color: GRAY, marginTop: '8px' }}>Acepta .xls y .xlsx</div>
                  </>
                )}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".xls,.xlsx"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) aceptarArchivo(f); }}
              />

              {/* Campo proveedor */}
              <div>
                <label style={labelSt}>Nombre del proveedor <span style={{ color: RED }}>*</span></label>
                <input
                  type="text"
                  value={proveedor}
                  onChange={e => setProveedor(e.target.value)}
                  placeholder="Ej: BERGER, LALO GAS, LEKONS"
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {/* ══ PASO 2 ═══════════════════════════════════════════════ */}
          {!exito && paso === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: GRAY }}>
                Se detectaron <strong>{columnas.length}</strong> columnas. Indicá cuál corresponde a cada campo del sistema.
              </p>

              {/* Grid de mapeo */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {CAMPOS_MAPEO.map(({ key, label, obligatorio }) => (
                  <div key={key}>
                    <label style={labelSt}>
                      {label} {obligatorio && <span style={{ color: RED }}>*</span>}
                    </label>
                    <select
                      value={mapeo[key]}
                      onChange={e => setMapeo(prev => ({ ...prev, [key]: e.target.value }))}
                      style={{ ...selectStyle, width: '100%' }}
                    >
                      <option value="">— No usar —</option>
                      {columnas.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {/* Previa de datos */}
              {previaMuestra.length > 0 && (
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: NAVY, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    Vista previa con mapeo actual
                  </div>
                  <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#EBF4FF' }}>
                          {(['codigo','descripcion','precio_costo','marca','ean'] as (keyof MapeoState)[])
                            .filter(k => mapeo[k])
                            .map(k => (
                              <th key={k} style={{ padding: '8px 10px', textAlign: 'left', color: NAVY, fontWeight: 600, borderBottom: `1px solid ${SEP}`, whiteSpace: 'nowrap' }}>
                                {CAMPOS_MAPEO.find(f => f.key === k)?.label}
                              </th>
                            ))
                          }
                        </tr>
                      </thead>
                      <tbody>
                        {previaMuestra.map((fila, i) => (
                          <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                            {(['codigo','descripcion','precio_costo','marca','ean'] as (keyof MapeoState)[])
                              .filter(k => mapeo[k])
                              .map(k => (
                                <td key={k} style={{ padding: '7px 10px', color: TEXT, borderBottom: '1px solid #EDF2F7' }}>
                                  {mapeo[k] ? String(fila[mapeo[k]] ?? '—') : '—'}
                                </td>
                              ))
                            }
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{ backgroundColor: '#EBF4FF', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: BLUE }}>
                💾 Este mapeo se guardará automáticamente para <strong>{proveedor}</strong>. La próxima vez se cargará solo.
              </div>
            </div>
          )}

          {/* ══ PASO 3 ═══════════════════════════════════════════════ */}
          {!exito && paso === 3 && resumen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Cards resumen */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {[
                  { icon: '🟢', label: 'Nuevos',      val: resumen.nuevos,    color: GREEN  },
                  { icon: '🔴', label: 'Subieron',    val: resumen.subieron,  color: RED    },
                  { icon: '🔵', label: 'Bajaron',     val: resumen.bajaron,   color: BLUE   },
                  { icon: '⚪', label: 'Sin cambio',  val: resumen.sin_cambio,color: GRAY   },
                  { icon: '🟡', label: 'Quitados',    val: resumen.quitados,  color: YELLOW },
                  { icon: '📊', label: 'Var. promedio', val: `${resumen.variacion_promedio}%`, color: NAVY },
                ].map(({ icon, label, val, color }) => (
                  <div key={label} style={{ backgroundColor: '#F7FAFC', borderRadius: '10px', padding: '12px', textAlign: 'center', borderLeft: `3px solid ${color}` }}>
                    <div style={{ fontSize: '18px', marginBottom: '4px' }}>{icon}</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color }}>{val}</div>
                    <div style={{ fontSize: '11px', color: GRAY, fontWeight: 500 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Controles tabla */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: TEXT, cursor: 'pointer', fontWeight: 600 }}>
                  <input type="checkbox" checked={selTodos} onChange={toggleTodos} style={{ width: 15, height: 15, cursor: 'pointer' }} />
                  Sel. todos
                </label>
                <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ ...selectStyle, fontSize: '12px', padding: '6px 10px' }}>
                  <option value="">Todos los tipos</option>
                  <option value="nuevo">Solo nuevos</option>
                  <option value="subio">Solo subieron</option>
                  <option value="bajo">Solo bajaron</option>
                  <option value="quitado">Solo quitados</option>
                </select>
                <input
                  type="text" value={busDetalle}
                  onChange={e => setBusDetalle(e.target.value)}
                  placeholder="Buscar descripción..."
                  style={{ ...selectStyle, fontSize: '12px', padding: '6px 10px', flex: 1, minWidth: 140 }}
                />
                <span style={{ fontSize: '12px', color: GRAY, whiteSpace: 'nowrap' }}>
                  {aprobados.length} seleccionados
                </span>
              </div>

              {/* Tabla detalle */}
              <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #E2E8F0', maxHeight: 300, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: 560 }}>
                  <thead style={{ position: 'sticky', top: 0 }}>
                    <tr style={{ backgroundColor: '#EBF4FF' }}>
                      <th style={{ padding: '9px 10px', width: 32 }}></th>
                      <th style={{ padding: '9px 10px', textAlign: 'left', color: NAVY, fontWeight: 600, borderBottom: `1px solid ${SEP}` }}>Código / Descripción</th>
                      <th style={{ padding: '9px 10px', textAlign: 'right', color: NAVY, fontWeight: 600, borderBottom: `1px solid ${SEP}`, whiteSpace: 'nowrap' }}>Precio actual</th>
                      <th style={{ padding: '9px 10px', textAlign: 'right', color: NAVY, fontWeight: 600, borderBottom: `1px solid ${SEP}`, whiteSpace: 'nowrap' }}>Precio nuevo</th>
                      <th style={{ padding: '9px 10px', textAlign: 'center', color: NAVY, fontWeight: 600, borderBottom: `1px solid ${SEP}` }}>Var %</th>
                      <th style={{ padding: '9px 10px', textAlign: 'center', color: NAVY, fontWeight: 600, borderBottom: `1px solid ${SEP}` }}>Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalleVisible.length === 0 ? (
                      <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: GRAY }}>Sin resultados</td></tr>
                    ) : (
                      detalleVisible.map((x, i) => {
                        const varPct = x.variacion_porcentaje;
                        const varColor = varPct === null ? GRAY : varPct > 0 ? RED : GREEN;
                        return (
                          <tr key={x.codigo} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#F7FAFC' }}>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={!!x.aprobado}
                                onChange={() => toggleAprobado(x.codigo)}
                                style={{ width: 14, height: 14, cursor: 'pointer' }}
                              />
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <div style={{ fontFamily: 'monospace', fontSize: '11px', color: GRAY }}>{x.codigo}</div>
                              <div style={{ color: TEXT, fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.descripcion}</div>
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', color: GRAY }}>
                              {x.precio_actual != null ? `$${Number(x.precio_actual).toLocaleString('es-AR')}` : '—'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: TEXT }}>
                              {x.precio_nuevo != null ? `$${Number(x.precio_nuevo).toLocaleString('es-AR')}` : '—'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: varColor }}>
                              {varPct != null ? `${varPct > 0 ? '+' : ''}${varPct}%` : '—'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <BadgeTipo tipo={x.tipo} />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer botones ───────────────────────────────────────────── */}
        {!exito && (
          <div style={{
            borderTop: '1px solid #E2E8F0', padding: '14px 24px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderRadius: '0 0 16px 16px', backgroundColor: '#FAFAFA',
          }}>
            <div>
              {paso > 1 && (
                <button
                  onClick={() => { setError(''); setPaso(p => p - 1); }}
                  disabled={cargando}
                  style={btnStyle('#EDF2F7', GRAY, cargando)}
                >
                  ← {paso === 3 ? 'Volver a mapeo' : 'Anterior'}
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {cargando && (
                <span style={{ fontSize: '13px', color: GRAY, fontStyle: 'italic' }}>
                  {paso === 1 ? 'Analizando...' : paso === 2 ? 'Comparando con tu base...' : 'Aplicando cambios...'}
                </span>
              )}
              {paso === 1 && (
                <button onClick={analizar} disabled={cargando} style={btnStyle(BLUE, '#fff', cargando)}>
                  {cargando ? '⏳' : 'Analizar →'}
                </button>
              )}
              {paso === 2 && (
                <button onClick={comparar} disabled={cargando} style={btnStyle(BLUE, '#fff', cargando)}>
                  {cargando ? '⏳' : 'Comparar →'}
                </button>
              )}
              {paso === 3 && (
                <button
                  onClick={aplicar}
                  disabled={cargando || aprobados.length === 0}
                  style={btnStyle(GREEN, '#fff', cargando || aprobados.length === 0)}
                >
                  {cargando ? '⏳' : `✅ Aplicar seleccionados (${aprobados.length})`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════

interface ProductoReal {
  id: number; codigo: string; descripcion: string; descripcion_corta: string;
  marca: string; proveedor_id: number | null; rubro: string; tipo: string;
  precio_costo: number; precio_costo_final: number;
  precio_venta_1: number; precio_venta_2: number; precio_venta_final: number;
  alicuota_iva: number; stock: number; stock_minimo: number;
  unidad_medida: string; ean: string; imagen_url: string | null; activo: boolean;
  fecha_importacion: string;
}

interface FiltrosOpciones {
  proveedores: { id: number; nombre: string }[];
  marcas: string[];
  rubros: string[];
}

// ════════════════════════════════════════════════════════════════════════════
// MODAL PRODUCTO (Agregar / Editar)
// ════════════════════════════════════════════════════════════════════════════

interface ProductoForm {
  codigo: string; descripcion: string; descripcion_corta: string;
  marca: string; proveedor_id: string; rubro: string; tipo: string;
  unidad_medida: string; ean: string; imagen_url: string; activo: boolean;
  precio_costo: string; dto_1: string; dto_2: string; dto_3: string; dto_4: string;
  precio_costo_final: string;
  imp_1: string; imp_2: string; alicuota_iva: string;
  utilidad_1: string; utilidad_2: string;
  precio_venta_1: string; precio_venta_2: string; precio_venta_final: string;
  stock: string; stock_minimo: string; punto_reposicion: string;
}

const FORM_INICIAL: ProductoForm = {
  codigo: '', descripcion: '', descripcion_corta: '',
  marca: '', proveedor_id: '', rubro: '', tipo: '',
  unidad_medida: '', ean: '', imagen_url: '', activo: true,
  precio_costo: '', dto_1: '', dto_2: '', dto_3: '', dto_4: '',
  precio_costo_final: '',
  imp_1: '', imp_2: '', alicuota_iva: '21',
  utilidad_1: '', utilidad_2: '',
  precio_venta_1: '', precio_venta_2: '', precio_venta_final: '',
  stock: '', stock_minimo: '', punto_reposicion: '',
};

function calcCostoFinal(f: ProductoForm): number {
  const costo = parseFloat(f.precio_costo) || 0;
  const d1 = (parseFloat(f.dto_1) || 0) / 100;
  const d2 = (parseFloat(f.dto_2) || 0) / 100;
  const d3 = (parseFloat(f.dto_3) || 0) / 100;
  const d4 = (parseFloat(f.dto_4) || 0) / 100;
  return costo * (1 - d1) * (1 - d2) * (1 - d3) * (1 - d4);
}

function calcVenta(costoFinal: number, utilidad: string): number {
  const u = parseFloat(utilidad) || 0;
  return costoFinal * (1 + u / 100);
}

function fmt2(n: number): string {
  return n === 0 ? '' : n.toFixed(2);
}

function ModalProducto({
  producto, proveedores, onCerrar, onGuardado, clienteId, token,
}: {
  producto: ProductoReal | null;
  proveedores: { id: number; nombre: string }[];
  onCerrar: () => void;
  onGuardado: () => void;
  clienteId: number | null;
  token: string;
}) {
  const esEdicion = producto !== null;

  const formDesdeProducto = (p: ProductoReal): ProductoForm => ({
    codigo: p.codigo || '',
    descripcion: p.descripcion || '',
    descripcion_corta: p.descripcion_corta || '',
    marca: p.marca || '',
    proveedor_id: p.proveedor_id ? String(p.proveedor_id) : '',
    rubro: p.rubro || '',
    tipo: p.tipo || '',
    unidad_medida: p.unidad_medida || '',
    ean: p.ean || '',
    imagen_url: p.imagen_url || '',
    activo: p.activo,
    precio_costo: p.precio_costo ? String(p.precio_costo) : '',
    dto_1: (p as any).dto_1 ? String((p as any).dto_1) : '',
    dto_2: (p as any).dto_2 ? String((p as any).dto_2) : '',
    dto_3: (p as any).dto_3 ? String((p as any).dto_3) : '',
    dto_4: (p as any).dto_4 ? String((p as any).dto_4) : '',
    precio_costo_final: p.precio_costo_final ? String(p.precio_costo_final) : '',
    imp_1: (p as any).imp_1 ? String((p as any).imp_1) : '',
    imp_2: (p as any).imp_2 ? String((p as any).imp_2) : '',
    alicuota_iva: p.alicuota_iva != null ? String(p.alicuota_iva) : '21',
    utilidad_1: (p as any).utilidad_1 ? String((p as any).utilidad_1) : '',
    utilidad_2: (p as any).utilidad_2 ? String((p as any).utilidad_2) : '',
    precio_venta_1: p.precio_venta_1 ? String(p.precio_venta_1) : '',
    precio_venta_2: p.precio_venta_2 ? String(p.precio_venta_2) : '',
    precio_venta_final: p.precio_venta_final ? String(p.precio_venta_final) : '',
    stock: p.stock ? String(p.stock) : '',
    stock_minimo: p.stock_minimo ? String(p.stock_minimo) : '',
    punto_reposicion: (p as any).punto_reposicion ? String((p as any).punto_reposicion) : '',
  });

  const [form, setForm] = useState<ProductoForm>(
    esEdicion ? formDesdeProducto(producto!) : FORM_INICIAL
  );
  const [tab, setTab]         = useState<'general' | 'precios'>('general');
  const [guardando, setGuardando] = useState(false);
  const [error, setError]     = useState('');

  // Recalcular precios automáticamente al cambiar costos/utilidades
  React.useEffect(() => {
    const costoFinal = calcCostoFinal(form);
    const venta1     = calcVenta(costoFinal, form.utilidad_1);
    const venta2     = calcVenta(costoFinal, form.utilidad_2);
    const cfStr      = fmt2(costoFinal);
    const v1Str      = fmt2(venta1);
    const v2Str      = fmt2(venta2);
    setForm(prev => {
      if (prev.precio_costo_final === cfStr &&
          prev.precio_venta_1 === v1Str &&
          prev.precio_venta_2 === v2Str) return prev;
      return { ...prev, precio_costo_final: cfStr, precio_venta_1: v1Str, precio_venta_2: v2Str };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.precio_costo, form.dto_1, form.dto_2, form.dto_3, form.dto_4, form.utilidad_1, form.utilidad_2]);

  const set = (k: keyof ProductoForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const guardar = async () => {
    if (!form.descripcion.trim()) { setError('La descripción es obligatoria'); return; }
    if (!clienteId) { setError('No se encontró el cliente'); return; }
    setGuardando(true); setError('');
    const body = {
      ...form,
      precio_costo: parseFloat(form.precio_costo) || 0,
      dto_1: parseFloat(form.dto_1) || 0,
      dto_2: parseFloat(form.dto_2) || 0,
      dto_3: parseFloat(form.dto_3) || 0,
      dto_4: parseFloat(form.dto_4) || 0,
      precio_costo_final: parseFloat(form.precio_costo_final) || 0,
      imp_1: parseFloat(form.imp_1) || 0,
      imp_2: parseFloat(form.imp_2) || 0,
      alicuota_iva: parseFloat(form.alicuota_iva) || 0,
      utilidad_1: parseFloat(form.utilidad_1) || 0,
      utilidad_2: parseFloat(form.utilidad_2) || 0,
      precio_venta_1: parseFloat(form.precio_venta_1) || 0,
      precio_venta_2: parseFloat(form.precio_venta_2) || 0,
      precio_venta_final: parseFloat(form.precio_venta_final) || 0,
      stock: parseFloat(form.stock) || 0,
      stock_minimo: parseFloat(form.stock_minimo) || 0,
      punto_reposicion: parseFloat(form.punto_reposicion) || 0,
      proveedor_id: form.proveedor_id ? parseInt(form.proveedor_id, 10) : null,
    };
    try {
      const url = esEdicion
        ? `${API}/api/superadmin/importador/productos/${clienteId}/${producto!.id}`
        : `${API}/api/superadmin/importador/productos/${clienteId}`;
      const r = await fetch(url, {
        method: esEdicion ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', 'x-superadmin-token': token },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.mensaje || 'Error al guardar'); return; }
      onGuardado();
      onCerrar();
    } catch { setError('Error de conexión'); }
    finally { setGuardando(false); }
  };

  const inpN = (label: string, k: keyof ProductoForm, readOnly = false) => (
    <div>
      <label style={labelSt}>{label}</label>
      <input type="number" step="any" value={form[k] as string}
        onChange={readOnly ? undefined : set(k)}
        readOnly={readOnly}
        style={{ ...inputStyle, backgroundColor: readOnly ? '#F7FAFC' : '#fff', color: readOnly ? BLUE : TEXT, fontWeight: readOnly ? 700 : 400 }} />
    </div>
  );

  const inpT = (label: string, k: keyof ProductoForm, placeholder = '') => (
    <div>
      <label style={labelSt}>{label}</label>
      <input type="text" value={form[k] as string} onChange={set(k)}
        placeholder={placeholder} style={inputStyle} />
    </div>
  );

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 20px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', border: 'none',
    borderBottom: active ? `3px solid ${BLUE}` : '3px solid transparent',
    backgroundColor: 'transparent', color: active ? BLUE : GRAY,
  });

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1002, padding: '24px 16px', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 680, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', marginTop: 8, marginBottom: 24 }}>
        {/* Header */}
        <div style={{ backgroundColor: NAVY, borderRadius: '16px 16px 0 0', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{esEdicion ? '✏️ Editar producto' : '＋ Agregar producto'}</span>
          <button onClick={onCerrar} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 18, width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #EDF2F7', backgroundColor: '#F7FAFC' }}>
          <button style={tabStyle(tab === 'general')} onClick={() => setTab('general')}>📋 Datos generales</button>
          <button style={tabStyle(tab === 'precios')} onClick={() => setTab('precios')}>💲 Precios y stock</button>
        </div>

        <div style={{ padding: '20px 24px', maxHeight: '65vh', overflowY: 'auto' }}>

          {/* ── TAB 1: Datos generales ── */}
          {tab === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {inpT('Código', 'codigo', 'Ej: ART-001')}
                <div>
                  <label style={labelSt}>Proveedor</label>
                  <select value={form.proveedor_id} onChange={set('proveedor_id')} style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' }}>
                    <option value="">Sin proveedor</option>
                    {proveedores.map(p => <option key={p.id} value={String(p.id)}>{p.nombre}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={labelSt}>Descripción <span style={{ color: RED }}>*</span></label>
                <input type="text" value={form.descripcion} onChange={set('descripcion')}
                  placeholder="Nombre del producto" style={inputStyle} />
              </div>
              {inpT('Descripción corta', 'descripcion_corta', 'Subtítulo breve')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {inpT('Marca', 'marca', 'Ej: Samsung')}
                {inpT('Rubro', 'rubro', 'Ej: Electrónica')}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {inpT('Tipo', 'tipo', 'Ej: Producto / Servicio')}
                {inpT('Unidad de medida', 'unidad_medida', 'Ej: UN / KG / LT')}
              </div>
              {inpT('Código de barras EAN', 'ean', 'Ej: 7790001234567')}
              <div>
                <label style={labelSt}>Imagen URL</label>
                <input type="text" value={form.imagen_url} onChange={set('imagen_url')}
                  placeholder="https://..." style={inputStyle} />
                {form.imagen_url && (
                  <div style={{ marginTop: 8, textAlign: 'center' }}>
                    <img src={form.imagen_url} alt="Vista previa"
                      style={{ maxWidth: '100%', maxHeight: 140, objectFit: 'contain', borderRadius: 8, border: '1px solid #EDF2F7' }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ ...labelSt, marginBottom: 0 }}>Estado</label>
                <button onClick={() => setForm(p => ({ ...p, activo: !p.activo }))}
                  style={{ padding: '6px 18px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    backgroundColor: form.activo ? '#F0FFF4' : '#FFF5F5', color: form.activo ? GREEN : RED }}>
                  {form.activo ? '● Activo' : '○ Inactivo'}
                </button>
              </div>
            </div>
          )}

          {/* ── TAB 2: Precios y stock ── */}
          {tab === 'precios' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* COSTOS */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 12, paddingBottom: 6, borderBottom: `2px solid ${SEP}` }}>COSTOS</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {inpN('Precio costo', 'precio_costo')}
                  {inpN('Descuento 1 (%)', 'dto_1')}
                  {inpN('Descuento 2 (%)', 'dto_2')}
                  {inpN('Descuento 3 (%)', 'dto_3')}
                  {inpN('Descuento 4 (%)', 'dto_4')}
                  {inpN('Precio costo final', 'precio_costo_final', true)}
                </div>
              </div>

              {/* IMPUESTOS */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 12, paddingBottom: 6, borderBottom: `2px solid ${SEP}` }}>IMPUESTOS</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {inpN('Impuesto 1 (%)', 'imp_1')}
                  {inpN('Impuesto 2 (%)', 'imp_2')}
                  <div>
                    <label style={labelSt}>IVA %</label>
                    <select value={form.alicuota_iva} onChange={set('alicuota_iva')} style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' }}>
                      <option value="0">0%</option>
                      <option value="10.5">10.5%</option>
                      <option value="21">21%</option>
                      <option value="27">27%</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* UTILIDAD Y VENTA */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 12, paddingBottom: 6, borderBottom: `2px solid ${SEP}` }}>UTILIDAD Y PRECIO DE VENTA</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {inpN('Utilidad 1 (%)', 'utilidad_1')}
                  {inpN('Precio venta 1', 'precio_venta_1', true)}
                  {inpN('Utilidad 2 (%)', 'utilidad_2')}
                  {inpN('Precio venta 2', 'precio_venta_2', true)}
                </div>
                <div style={{ marginTop: 12 }}>
                  <label style={labelSt}>Precio venta final <span style={{ color: GRAY, fontWeight: 400, textTransform: 'none' }}>(editable)</span></label>
                  <input type="number" step="any" value={form.precio_venta_final}
                    onChange={set('precio_venta_final')}
                    placeholder="Precio final de venta al público"
                    style={{ ...inputStyle, fontWeight: 700, color: GREEN }} />
                </div>
              </div>

              {/* STOCK */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 12, paddingBottom: 6, borderBottom: `2px solid ${SEP}` }}>STOCK</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  {inpN('Stock actual', 'stock')}
                  {inpN('Stock mínimo', 'stock_minimo')}
                  {inpN('Punto de reposición', 'punto_reposicion')}
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Footer */}
        {error && (
          <div style={{ margin: '0 24px', padding: '10px 14px', backgroundColor: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: 8, color: RED, fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}
        <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid #EDF2F7' }}>
          <button style={btnStyle('#EDF2F7', GRAY)} onClick={onCerrar}>Cancelar</button>
          <button style={btnStyle(GREEN, '#fff', guardando)} onClick={guardar} disabled={guardando}>
            {guardando ? '⏳ Guardando...' : '✓ Guardar producto'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MODAL CONFIRMAR DESACTIVAR
// ════════════════════════════════════════════════════════════════════════════

function ModalConfirmarDesactivar({
  producto, onCerrar, onConfirmado, clienteId, token,
}: {
  producto: ProductoReal;
  onCerrar: () => void;
  onConfirmado: () => void;
  clienteId: number | null;
  token: string;
}) {
  const [cargando, setCargando] = useState(false);
  const [error, setError]       = useState('');

  const desactivar = async () => {
    if (!clienteId) return;
    setCargando(true); setError('');
    try {
      const r = await fetch(`${API}/api/superadmin/importador/productos/${clienteId}/${producto.id}`, {
        method: 'DELETE',
        headers: { 'x-superadmin-token': token },
      });
      const d = await r.json();
      if (!r.ok) { setError(d.mensaje || 'Error'); return; }
      onConfirmado();
      onCerrar();
    } catch { setError('Error de conexión'); }
    finally { setCargando(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1003, padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
        <div style={{ backgroundColor: RED, padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>🗑️ Desactivar producto</span>
          <button onClick={onCerrar} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 18, width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>✕</button>
        </div>
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: 42, marginBottom: 12 }}>⚠️</div>
          <p style={{ fontSize: 15, fontWeight: 700, color: TEXT, margin: '0 0 8px' }}>¿Desactivar este producto?</p>
          <p style={{ fontSize: 13, color: GRAY, margin: '0 0 6px' }}><strong>{producto.descripcion}</strong></p>
          <p style={{ fontSize: 13, color: GRAY, margin: 0 }}>El producto no se eliminará,<br />solo quedará inactivo.</p>
          {error && <p style={{ color: RED, fontSize: 13, marginTop: 10 }}>⚠️ {error}</p>}
        </div>
        <div style={{ padding: '0 24px 20px', display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button style={btnStyle('#EDF2F7', GRAY)} onClick={onCerrar}>Cancelar</button>
          <button style={btnStyle(RED, '#fff', cargando)} onClick={desactivar} disabled={cargando}>
            {cargando ? '⏳ Desactivando...' : '🗑️ Desactivar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal Imprimir ────────────────────────────────────────────────────────────

const COLS_IMPRESION = [
  { key: 'codigo',            label: 'Código',             def: true  },
  { key: 'descripcion',       label: 'Descripción',        def: true  },
  { key: 'marca',             label: 'Marca',              def: true  },
  { key: 'precio_venta_final',label: 'Precio venta final', def: true  },
  { key: 'stock',             label: 'Stock',              def: true  },
  { key: 'precio_costo',      label: 'Precio costo',       def: false },
  { key: 'rubro',             label: 'Rubro',              def: false },
  { key: 'ean',               label: 'EAN',                def: false },
];

function ModalImpresion({
  productos, nombreNegocio, filtrosDesc, onCerrar,
}: {
  productos: ProductoReal[]; nombreNegocio: string; filtrosDesc: string; onCerrar: () => void;
}) {
  const [orientacion, setOrientacion] = useState<'A4v' | 'A4h' | 'A5'>('A4v');
  const [cols, setCols]               = useState<Record<string, boolean>>(
    Object.fromEntries(COLS_IMPRESION.map(c => [c.key, c.def]))
  );

  const colsActivas = COLS_IMPRESION.filter(c => cols[c.key]);
  const fecha       = new Date().toLocaleDateString('es-AR');

  const generarHTML = () => {
    const pageSize = orientacion === 'A4v' ? 'A4 portrait' : orientacion === 'A4h' ? 'A4 landscape' : 'A5 portrait';
    const filas    = productos.map(p => `<tr>${colsActivas.map(c => {
      const v = (p as any)[c.key];
      const s = v == null ? '—' : typeof v === 'number' ? `$${Number(v).toLocaleString('es-AR')}` : String(v);
      return `<td>${s}</td>`;
    }).join('')}</tr>`).join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Lista de Productos</title>
<style>
  @page { size: ${pageSize}; margin: 15mm; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #222; }
  h1 { font-size: 16px; margin: 0 0 2px; color: #1B2A4A; }
  .sub { font-size: 11px; color: #718096; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1B2A4A; color: #fff; padding: 6px 8px; text-align: left; font-size: 10px; }
  td { padding: 5px 8px; border-bottom: 1px solid #E2E8F0; font-size: 10px; }
  tr:nth-child(even) td { background: #F7FAFC; }
  @media print { button { display: none; } }
</style></head><body>
<h1>📦 Lista de Productos — ${nombreNegocio}</h1>
<div class="sub">Fecha: ${fecha} &nbsp;|&nbsp; ${productos.length} productos &nbsp;|&nbsp; ${filtrosDesc || 'Sin filtros'}</div>
<table><thead><tr>${colsActivas.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
<tbody>${filas}</tbody></table>
</body></html>`;
  };

  const vistaPrevia = () => {
    const w = window.open('', '_blank');
    if (w) { w.document.write(generarHTML()); w.document.close(); }
  };

  const imprimir = () => {
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(generarHTML());
      w.document.close();
      w.focus();
      setTimeout(() => { w.print(); }, 500);
    }
  };

  const descargarPDF = () => {
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(generarHTML() + `<script>window.onload=()=>{window.print();}<\/script>`);
      w.document.close();
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
        {/* header */}
        <div style={{ backgroundColor: NAVY, padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>🖨️ Imprimir lista de productos</span>
          <button onClick={onCerrar} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 18, width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>✕</button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* orientación */}
          <div>
            <div style={labelSt}>Tamaño de página</div>
            <div style={{ display: 'flex', gap: 12 }}>
              {(['A4v', 'A4h', 'A5'] as const).map(o => (
                <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: TEXT }}>
                  <input type="radio" name="orientacion" value={o} checked={orientacion === o} onChange={() => setOrientacion(o)} />
                  {o === 'A4v' ? 'A4 vertical' : o === 'A4h' ? 'A4 horizontal' : 'A5'}
                </label>
              ))}
            </div>
          </div>
          {/* columnas */}
          <div>
            <div style={labelSt}>Columnas a incluir</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
              {COLS_IMPRESION.map(c => (
                <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, cursor: 'pointer', color: TEXT }}>
                  <input type="checkbox" checked={!!cols[c.key]} onChange={() => setCols(prev => ({ ...prev, [c.key]: !prev[c.key] }))} />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
          {/* info */}
          <div style={{ backgroundColor: '#EBF4FF', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: BLUE }}>
            📄 Se imprimirán <strong>{productos.length}</strong> productos con los filtros activos en pantalla.
          </div>
          {/* botones */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button style={btnStyle('#EDF2F7', GRAY)} onClick={vistaPrevia}>Vista previa</button>
            <button style={btnStyle(NAVY)} onClick={imprimir}>🖨️ Imprimir</button>
            <button style={btnStyle(BLUE)} onClick={descargarPDF}>⬇️ Descargar PDF</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SheetJS (usa el xlsx ya instalado en node_modules via importador backend) ─
// En el frontend lo cargamos dinámicamente para no añadir dependencia nueva
async function exportarExcel(productos: any[], nombreCliente: string) {
  // Cargamos SheetJS desde CDN de forma dinámica (ya disponible en React CRA)
  // Si ya está en window lo usamos
  let XLSX: any = (window as any).XLSX;
  if (!XLSX) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = () => resolve();
      s.onerror = reject;
      document.head.appendChild(s);
    }).catch(() => null);
    XLSX = (window as any).XLSX;
  }
  if (!XLSX) { alert('No se pudo cargar la librería Excel. Intentá de nuevo.'); return; }

  const cabeceras = ['Código','Descripción','Marca','Proveedor','Rubro','Precio Costo','Precio Venta 1','Precio Venta 2','Precio Venta Final','IVA%','Stock','Stock Mínimo','Unidad','EAN','Activo','Fecha Importación'];
  const filas = productos.map((p: any) => [
    p.codigo || '', p.descripcion || '', p.marca || '', p.proveedor || '',
    p.rubro || '', p.precio_costo || 0, p.precio_venta_1 || 0,
    p.precio_venta_2 || 0, p.precio_venta_final || 0, p.alicuota_iva || 0,
    p.stock || 0, p.stock_minimo || 0, p.unidad_medida || '', p.ean || '',
    p.activo ? 'Sí' : 'No', p.fecha_importacion ? new Date(p.fecha_importacion).toLocaleDateString('es-AR') : '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([cabeceras, ...filas]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');
  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Productos_${nombreCliente}_${fecha}.xlsx`);
}

const COLUMNAS_TABLA = ['Imagen', 'Código', 'Descripción', 'Marca', 'Precio costo', 'Precio venta', 'Stock', 'Estado', 'Acciones'];
const POR_PAGINA_OPCIONES = [10, 25, 50];

function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debouncedValue;
}

function RobertoProductos() {
  const [busqueda,        setBusqueda]        = useState('');
  const [filtroProveedor, setFiltroProveedor] = useState('');
  const [filtroMarca,     setFiltroMarca]     = useState('');
  const [filtroRubro,     setFiltroRubro]     = useState('');
  const [filtroEstado,    setFiltroEstado]    = useState('');
  const [fechaDesde,      setFechaDesde]      = useState('');
  const [fechaHasta,      setFechaHasta]      = useState('');
  const [fechaTipo,       setFechaTipo]       = useState<'importacion' | 'actualizacion'>('importacion');
  const [porPagina,       setPorPagina]       = useState(25);
  const [pagina,          setPagina]          = useState(1);
  const [modalAbierto,    setModalAbierto]    = useState(false);
  const [modalImprimir,   setModalImprimir]   = useState(false);
  const [exportando,      setExportando]      = useState(false);
  const [modalProducto,   setModalProducto]   = useState(false);
  const [productoEditar,  setProductoEditar]  = useState<ProductoReal | null>(null);
  const [productoDesactivar, setProductoDesactivar] = useState<ProductoReal | null>(null);
  const [productos,       setProductos]       = useState<ProductoReal[]>([]);
  const [total,           setTotal]           = useState(0);
  const [totalPaginas,    setTotalPaginas]    = useState(1);
  const [cargandoLista,   setCargandoLista]   = useState(false);
  const [filtrosOpts,     setFiltrosOpts]     = useState<FiltrosOpciones>({ proveedores: [], marcas: [], rubros: [] });

  const busquedaDebounced = useDebounce(busqueda, 300);
  const token     = getToken();
  const clienteId = getClienteId();

  const nombreNegocio = (() => {
    try { return JSON.parse(localStorage.getItem('roberto_portal_session') || '{}').cliente?.nombre_comercial || 'Mi Negocio'; } catch { return 'Mi Negocio'; }
  })();

  const buildParams = useCallback((extra: Record<string, string> = {}) => {
    const p = new URLSearchParams(extra);
    if (busquedaDebounced.trim()) p.set('buscar', busquedaDebounced.trim());
    if (filtroProveedor) p.set('proveedor_id', filtroProveedor);
    if (filtroMarca)     p.set('marca', filtroMarca);
    if (filtroRubro)     p.set('rubro', filtroRubro);
    if (filtroEstado)    p.set('activo', filtroEstado === 'activo' ? 'true' : 'false');
    if (fechaDesde)      p.set('fecha_desde', fechaDesde);
    if (fechaHasta)      p.set('fecha_hasta', fechaHasta);
    if (fechaDesde || fechaHasta) p.set('fecha_tipo', fechaTipo);
    return p;
  }, [busquedaDebounced, filtroProveedor, filtroMarca, filtroRubro, filtroEstado, fechaDesde, fechaHasta, fechaTipo]);

  const cargarFiltros = useCallback(async () => {
    if (!clienteId) return;
    try {
      const r = await fetch(`${API}/api/superadmin/importador/productos/${clienteId}/filtros`, {
        headers: { 'x-superadmin-token': token },
      });
      if (r.ok) setFiltrosOpts(await r.json());
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const cargarProductos = useCallback(async (pg: number) => {
    if (!clienteId) return;
    setCargandoLista(true);
    try {
      const params = buildParams({ page: String(pg), limit: String(porPagina) });
      const r = await fetch(`${API}/api/superadmin/importador/productos/${clienteId}?${params}`, {
        headers: { 'x-superadmin-token': token },
      });
      if (r.ok) {
        const d = await r.json();
        setProductos(d.productos || []);
        setTotal(d.total || 0);
        setTotalPaginas(d.paginas || 1);
      }
    } catch {}
    finally { setCargandoLista(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, buildParams, porPagina]);

  const handleExportar = async () => {
    if (!clienteId || exportando) return;
    setExportando(true);
    try {
      const params = buildParams();
      const r = await fetch(`${API}/api/superadmin/importador/productos/${clienteId}/exportar?${params}`, {
        headers: { 'x-superadmin-token': token },
      });
      if (r.ok) {
        const d = await r.json();
        await exportarExcel(d.productos || [], nombreNegocio);
      }
    } catch (e) { alert('Error al exportar'); }
    finally { setExportando(false); }
  };

  React.useEffect(() => { cargarFiltros(); }, [cargarFiltros]);
  React.useEffect(() => { setPagina(1); cargarProductos(1); }, [cargarProductos]);

  const irAPagina = (pg: number) => { setPagina(pg); cargarProductos(pg); };

  const limpiarFiltros = () => {
    setBusqueda(''); setFiltroProveedor(''); setFiltroMarca('');
    setFiltroRubro(''); setFiltroEstado(''); setPagina(1);
  };

  const limpiarFechas = () => { setFechaDesde(''); setFechaHasta(''); };

  const hayFiltros   = busqueda || filtroProveedor || filtroMarca || filtroRubro || filtroEstado;
  const hayFechas    = fechaDesde || fechaHasta;

  const filtrosDesc = [
    busqueda && `Búsqueda: "${busqueda}"`,
    filtroMarca && `Marca: ${filtroMarca}`,
    filtroRubro && `Rubro: ${filtroRubro}`,
    filtroEstado && `Estado: ${filtroEstado}`,
    fechaDesde && `Desde: ${fechaDesde}`,
    fechaHasta && `Hasta: ${fechaHasta}`,
  ].filter(Boolean).join(' | ');

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, padding: '28px' }}>

      {modalAbierto && (
        <ModalImportador
          onCerrar={() => setModalAbierto(false)}
          onExito={() => { cargarProductos(1); cargarFiltros(); }}
        />
      )}
      {modalImprimir && (
        <ModalImpresion
          productos={productos}
          nombreNegocio={nombreNegocio}
          filtrosDesc={filtrosDesc}
          onCerrar={() => setModalImprimir(false)}
        />
      )}
      {modalProducto && (
        <ModalProducto
          producto={productoEditar}
          proveedores={filtrosOpts.proveedores}
          clienteId={clienteId}
          token={token}
          onCerrar={() => { setModalProducto(false); setProductoEditar(null); }}
          onGuardado={() => { cargarProductos(pagina); cargarFiltros(); }}
        />
      )}
      {productoDesactivar && (
        <ModalConfirmarDesactivar
          producto={productoDesactivar}
          clienteId={clienteId}
          token={token}
          onCerrar={() => setProductoDesactivar(null)}
          onConfirmado={() => { cargarProductos(pagina); }}
        />
      )}

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '22px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: NAVY, margin: '0 0 3px' }}>📦 Productos</h2>
          <p style={{ fontSize: '13px', color: GRAY, margin: 0 }}>
            {cargandoLista ? 'Cargando...' : `${total} productos registrados`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button style={btnStyle(GREEN)} onClick={() => { setProductoEditar(null); setModalProducto(true); }}>
            ＋ Agregar producto
          </button>
          <button style={btnStyle(BLUE)} onClick={() => setModalAbierto(true)}>
            📥 Importar Excel
          </button>
          <button style={btnStyle(ORANGE)} onClick={() => alert('Actualizar precios — próximamente')}>
            💲 Actualizar precios
          </button>
          <button style={btnStyle('#2F855A')} onClick={handleExportar} disabled={exportando}>
            {exportando ? '⏳ Exportando...' : '📤 Exportar Excel'}
          </button>
          <button style={btnStyle(NAVY)} onClick={() => setModalImprimir(true)}>
            🖨️ Imprimir / PDF
          </button>
        </div>
      </div>

      {/* ── BUSCADOR Y FILTROS ──────────────────────────────────── */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 220px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>Buscar</label>
            <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Código o descripción..." style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>Proveedor</label>
            <select value={filtroProveedor} onChange={e => { setFiltroProveedor(e.target.value); setPagina(1); }} style={selectStyle}>
              <option value="">Todos</option>
              {filtrosOpts.proveedores.map(p => <option key={p.id} value={String(p.id)}>{p.nombre}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>Marca</label>
            <select value={filtroMarca} onChange={e => { setFiltroMarca(e.target.value); setPagina(1); }} style={selectStyle}>
              <option value="">Todas</option>
              {filtrosOpts.marcas.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>Rubro</label>
            <select value={filtroRubro} onChange={e => { setFiltroRubro(e.target.value); setPagina(1); }} style={selectStyle}>
              <option value="">Todos</option>
              {filtrosOpts.rubros.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>Estado</label>
            <select value={filtroEstado} onChange={e => { setFiltroEstado(e.target.value); setPagina(1); }} style={selectStyle}>
              <option value="">Todos</option>
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
          </div>
          {hayFiltros && (
            <button onClick={limpiarFiltros} style={{ ...btnStyle('#EDF2F7', GRAY), alignSelf: 'flex-end' }}>
              Limpiar filtros
            </button>
          )}
        </div>

        {/* ── Filtros de fecha ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #EDF2F7' }}>
          <div style={{ flex: '0 0 auto' }}>
            <label style={labelSt}>Filtrar por fecha</label>
            <select value={fechaTipo} onChange={e => setFechaTipo(e.target.value as 'importacion' | 'actualizacion')} style={{ ...selectStyle, width: 160 }}>
              <option value="importacion">Fecha importación</option>
              <option value="actualizacion">Fecha actualización</option>
            </select>
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <label style={labelSt}>Desde</label>
            <input type="date" value={fechaDesde} onChange={e => { setFechaDesde(e.target.value); setPagina(1); }}
              style={{ ...selectStyle, width: 150 }} />
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <label style={labelSt}>Hasta</label>
            <input type="date" value={fechaHasta} onChange={e => { setFechaHasta(e.target.value); setPagina(1); }}
              style={{ ...selectStyle, width: 150 }} />
          </div>
          {hayFechas && (
            <button onClick={limpiarFechas} style={{ ...btnStyle('#EDF2F7', GRAY), alignSelf: 'flex-end' }}>
              Limpiar fechas
            </button>
          )}
        </div>
      </div>

      {/* ── TABLA ───────────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        {cargandoLista ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: GRAY, fontSize: '14px' }}>
            ⏳ Cargando productos...
          </div>
        ) : productos.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '900px' }}>
              <thead>
                <tr style={{ backgroundColor: '#EBF4FF' }}>
                  {COLUMNAS_TABLA.map((col, i) => (
                    <th key={col} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600, color: NAVY, borderBottom: `2px solid ${SEP}`, borderRight: i < COLUMNAS_TABLA.length - 1 ? `1px solid rgba(99,179,237,0.3)` : 'none', whiteSpace: 'nowrap' }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {productos.map((p, idx) => {
                  const stockBajo = Number(p.stock) <= Number(p.stock_minimo) && Number(p.stock_minimo) > 0;
                  return (
                    <tr key={p.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F7FAFC' }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#EBF8FF'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#fff' : '#F7FAFC'; }}>
                      <td style={{ padding: '10px 14px', borderRight: '1px solid rgba(99,179,237,0.15)' }}>
                        {p.imagen_url
                          ? <img src={p.imagen_url} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #EDF2F7' }} />
                          : <div style={{ width: '40px', height: '40px', backgroundColor: '#EDF2F7', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>📦</div>
                        }
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '12px', color: GRAY, borderRight: '1px solid rgba(99,179,237,0.15)' }}>{p.codigo || '—'}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 500, color: TEXT, borderRight: '1px solid rgba(99,179,237,0.15)', maxWidth: '220px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descripcion}</div>
                        {p.descripcion_corta && <div style={{ fontSize: '11px', color: GRAY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descripcion_corta}</div>}
                      </td>
                      <td style={{ padding: '10px 14px', color: GRAY, borderRight: '1px solid rgba(99,179,237,0.15)' }}>
                        <div style={{ fontWeight: 600, color: TEXT }}>{p.marca || '—'}</div>
                        {p.rubro && <div style={{ fontSize: '11px', color: GRAY }}>{p.rubro}</div>}
                      </td>
                      <td style={{ padding: '10px 14px', color: GRAY, fontFamily: 'monospace', borderRight: '1px solid rgba(99,179,237,0.15)' }}>
                        ${Number(p.precio_costo || 0).toLocaleString('es-AR')}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: GREEN, fontFamily: 'monospace', borderRight: '1px solid rgba(99,179,237,0.15)' }}>
                        ${Number(p.precio_venta_final || p.precio_venta_1 || 0).toLocaleString('es-AR')}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', borderRight: '1px solid rgba(99,179,237,0.15)' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 700,
                          backgroundColor: stockBajo ? '#FFF5F5' : '#F0FFF4',
                          color: stockBajo ? RED : GREEN,
                        }}>
                          {Number(p.stock || 0)}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', borderRight: '1px solid rgba(99,179,237,0.15)' }}>
                        <BadgeEstado activo={p.activo} />
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => { setProductoEditar(p); setModalProducto(true); }}
                            style={{ backgroundColor: '#EBF4FF', color: BLUE, border: 'none', borderRadius: '5px', padding: '5px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                            ✏️ Editar
                          </button>
                          <button onClick={() => setProductoDesactivar(p)}
                            style={{ backgroundColor: '#FFF5F5', color: RED, border: 'none', borderRadius: '5px', padding: '5px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '64px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>📦</div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>
              {hayFiltros ? 'Sin resultados' : 'No hay productos cargados'}
            </h3>
            <p style={{ fontSize: '14px', color: GRAY, margin: '0 0 28px', lineHeight: '1.6' }}>
              {hayFiltros ? 'Probá cambiando los filtros.' : 'Importá tu primera lista desde Excel\no agregá productos manualmente.'}
            </p>
            {!hayFiltros && (
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button style={btnStyle(GREEN)} onClick={() => setModalAbierto(true)}>
                  📥 Importar Excel
                </button>
                <button style={btnStyle(BLUE)} onClick={() => alert('Agregar manual — próximamente')}>
                  ＋ Agregar manual
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── PAGINACIÓN ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: GRAY }}>
          <span>Filas por página:</span>
          {POR_PAGINA_OPCIONES.map(n => (
            <button key={n} onClick={() => { setPorPagina(n); setPagina(1); }}
              style={{ backgroundColor: porPagina === n ? BLUE : '#EDF2F7', color: porPagina === n ? '#fff' : GRAY, border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
              {n}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: GRAY }}>
          <span>{total > 0 ? `${(pagina - 1) * porPagina + 1}–${Math.min(pagina * porPagina, total)} de ${total}` : '0 productos'}</span>
          <button disabled={pagina <= 1} onClick={() => irAPagina(pagina - 1)}
            style={{ backgroundColor: pagina <= 1 ? '#EDF2F7' : NAVY, color: pagina <= 1 ? GRAY : '#fff', border: 'none', borderRadius: '6px', padding: '5px 14px', fontSize: '12px', fontWeight: 600, cursor: pagina <= 1 ? 'not-allowed' : 'pointer' }}>
            ← Anterior
          </button>
          <button disabled={pagina >= totalPaginas} onClick={() => irAPagina(pagina + 1)}
            style={{ backgroundColor: pagina >= totalPaginas ? '#EDF2F7' : NAVY, color: pagina >= totalPaginas ? GRAY : '#fff', border: 'none', borderRadius: '6px', padding: '5px 14px', fontSize: '12px', fontWeight: 600, cursor: pagina >= totalPaginas ? 'not-allowed' : 'pointer' }}>
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  );
}

export default RobertoProductos;
