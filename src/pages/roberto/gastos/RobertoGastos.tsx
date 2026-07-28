import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../../config/api';

const NAVY  = '#1B2A4A';
const BLUE  = '#2B6CB0';
const GREEN = '#38A169';
const RED   = '#E53E3E';
const ORANGE= '#DD6B20';
const SEP   = '#63B3ED';
const GRAY  = '#718096';
const TEXT  = '#2D3748';
const BG    = '#F4F6F9';

// ── TIPOS ─────────────────────────────────────────────────
interface Sesion { token: string; cliente: { id: number; nombre_comercial: string }; }
interface GastoFijo {
  id: number; descripcion: string; monto: number; categoria: string;
  periodicidad: string; mes: number | null; anio: number | null;
  activo: boolean; observaciones: string | null;
}
interface GastoVariable {
  id: number; descripcion: string; monto: number; categoria: string;
  fecha: string; comprobante: string | null; proveedor_id: number | null;
  proveedor_nombre: string | null; observaciones: string | null;
}
interface Proveedor { id: number; nombre: string; }

const CATS_FIJO     = ['alquiler','sueldos','servicios','impuestos','seguros','otro'];
const CATS_VARIABLE = ['flete','comision','publicidad','mantenimiento','otro'];
const PERIODOS      = ['mensual','trimestral','anual'];
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ── HELPERS ───────────────────────────────────────────────
const fmt = (n: number) => `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
const fmtFecha = (s: string) => {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};
const hoy = () => new Date().toISOString().slice(0,10);
const primeroMes = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; };

// ── MODAL ─────────────────────────────────────────────────
function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.45)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
      <div style={{ backgroundColor:'#fff', borderRadius:'14px', width:'100%', maxWidth:'520px', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(0,0,0,0.18)' }}>
        <div style={{ padding:'18px 22px', borderBottom:`2px solid ${SEP}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h3 style={{ margin:0, fontSize:'16px', fontWeight:700, color:NAVY }}>{titulo}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:GRAY }}>×</button>
        </div>
        <div style={{ padding:'20px 22px' }}>{children}</div>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom:'14px' }}>
      <label style={{ display:'block', fontSize:'12px', fontWeight:600, color:GRAY, marginBottom:'5px', textTransform:'uppercase', letterSpacing:'0.4px' }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width:'100%', padding:'9px 12px', border:`1px solid #CBD5E0`, borderRadius:'7px',
  fontSize:'13px', color:TEXT, outline:'none', boxSizing:'border-box',
};
const selectStyle: React.CSSProperties = { ...inputStyle, backgroundColor:'#fff' };

// ══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════
function RobertoGastos() {
  const navigate  = useNavigate();
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [tab, setTab]       = useState<'fijos'|'variables'>('fijos');

  // Dashboard cards
  const [resumen, setResumen] = useState({ fijos_mes: 0, variables_periodo: 0, total_egresos: 0 });

  // Gastos fijos
  const [fijos, setFijos]         = useState<GastoFijo[]>([]);
  const [totalFijosMes, setTotalFijosMes] = useState(0);
  const [filtroMes, setFiltroMes] = useState(String(new Date().getMonth()+1));
  const [filtroAnio, setFiltroAnio] = useState(String(new Date().getFullYear()));
  const [filtroCatFijo, setFiltroCatFijo] = useState('');
  const [modalFijo, setModalFijo] = useState(false);
  const [editFijo, setEditFijo]   = useState<GastoFijo | null>(null);
  const [formFijo, setFormFijo]   = useState({ descripcion:'', monto:'', categoria:'otro', periodicidad:'mensual', mes:'', anio:'', observaciones:'' });

  // Gastos variables
  const [variables, setVariables]     = useState<GastoVariable[]>([]);
  const [totalVar, setTotalVar]       = useState(0);
  const [paginaVar, setPaginaVar]     = useState(1);
  const [limitVar, setLimitVar]       = useState(25);
  const [filtroDesde, setFiltroDesde] = useState(primeroMes());
  const [filtroHasta, setFiltroHasta] = useState(hoy());
  const [filtroCatVar, setFiltroCatVar] = useState('');
  const [filtroBuscar, setFiltroBuscar] = useState('');
  const [modalVar, setModalVar]       = useState(false);
  const [editVar, setEditVar]         = useState<GastoVariable | null>(null);
  const [formVar, setFormVar]         = useState({ descripcion:'', monto:'', categoria:'otro', fecha:hoy(), comprobante:'', proveedor_id:'', observaciones:'' });
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);

  const [cargando, setCargando]   = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── SESIÓN ─────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem('roberto_portal_session');
      if (!raw) { window.location.href = '/roberto/login'; return; }
      const s: Sesion = JSON.parse(raw);
      if (!s.token) { window.location.href = '/roberto/login'; return; }
      setSesion(s);
    } catch { window.location.href = '/roberto/login'; }
  }, []);

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-roberto-token': sesion?.token || '',
  }), [sesion]);

  const cid = sesion?.cliente?.id;

  // ── CARGAR RESUMEN ─────────────────────────────────────
  const cargarResumen = useCallback(async () => {
    if (!cid) return;
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/gastos/resumen/${cid}?fecha_desde=${primeroMes()}&fecha_hasta=${hoy()}`, { headers: headers() });
      if (r.ok) {
        const d = await r.json();
        setResumen({ fijos_mes: d.fijos_mes || 0, variables_periodo: d.variables_periodo || 0, total_egresos: d.total_egresos || 0 });
      }
    } catch { /* degradación elegante */ }
  }, [cid, headers]);

  // ── CARGAR FIJOS ───────────────────────────────────────
  const cargarFijos = useCallback(async () => {
    if (!cid) return;
    setCargando(true);
    try {
      const params = new URLSearchParams();
      if (filtroMes)     params.set('mes', filtroMes);
      if (filtroAnio)    params.set('anio', filtroAnio);
      if (filtroCatFijo) params.set('categoria', filtroCatFijo);
      const r = await fetch(`${API_BASE}/api/superadmin/gastos/fijos/${cid}?${params}`, { headers: headers() });
      if (r.ok) {
        const d = await r.json();
        setFijos(d.gastos || []);
        setTotalFijosMes(d.total_mes || 0);
      }
    } catch { setError('Error cargando gastos fijos'); }
    finally { setCargando(false); }
  }, [cid, filtroMes, filtroAnio, filtroCatFijo, headers]);

  // ── CARGAR VARIABLES ───────────────────────────────────
  const cargarVariables = useCallback(async (pagina = paginaVar, lim = limitVar) => {
    if (!cid) return;
    setCargando(true);
    try {
      const params = new URLSearchParams({ page: String(pagina), limit: String(lim) });
      if (filtroDesde)  params.set('fecha_desde', filtroDesde);
      if (filtroHasta)  params.set('fecha_hasta', filtroHasta);
      if (filtroCatVar) params.set('categoria', filtroCatVar);
      if (filtroBuscar) params.set('buscar', filtroBuscar);
      const r = await fetch(`${API_BASE}/api/superadmin/gastos/variables/${cid}?${params}`, { headers: headers() });
      if (r.ok) {
        const d = await r.json();
        setVariables(d.gastos || []);
        setTotalVar(d.total || 0);
        setPaginaVar(d.pagina || 1);
      }
    } catch { setError('Error cargando gastos variables'); }
    finally { setCargando(false); }
  }, [cid, filtroDesde, filtroHasta, filtroCatVar, filtroBuscar, paginaVar, limitVar, headers]);

  // ── CARGAR PROVEEDORES ─────────────────────────────────
  const cargarProveedores = useCallback(async () => {
    if (!cid) return;
    try {
      const r = await fetch(`${API_BASE}/api/superadmin/proveedores/${cid}`, { headers: headers() });
      if (r.ok) { const d = await r.json(); setProveedores(d.proveedores || d || []); }
    } catch { /* opcional */ }
  }, [cid, headers]);

  useEffect(() => { if (sesion) { cargarResumen(); cargarFijos(); cargarVariables(); cargarProveedores(); } },
    [sesion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (sesion) cargarFijos(); }, [filtroMes, filtroAnio, filtroCatFijo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sesion) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => cargarVariables(1, limitVar), 300);
  }, [filtroDesde, filtroHasta, filtroCatVar, filtroBuscar]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── CRUD FIJOS ─────────────────────────────────────────
  const abrirModalFijo = (g?: GastoFijo) => {
    if (g) {
      setEditFijo(g);
      setFormFijo({ descripcion: g.descripcion, monto: String(g.monto), categoria: g.categoria, periodicidad: g.periodicidad, mes: g.mes ? String(g.mes) : '', anio: g.anio ? String(g.anio) : '', observaciones: g.observaciones || '' });
    } else {
      setEditFijo(null);
      setFormFijo({ descripcion:'', monto:'', categoria:'otro', periodicidad:'mensual', mes: String(new Date().getMonth()+1), anio: String(new Date().getFullYear()), observaciones:'' });
    }
    setModalFijo(true);
  };

  const guardarFijo = async () => {
    if (!formFijo.descripcion || !formFijo.monto) { setError('Descripción y monto son obligatorios'); return; }
    setGuardando(true); setError('');
    try {
      const body = { ...formFijo, monto: parseFloat(formFijo.monto), mes: formFijo.mes ? parseInt(formFijo.mes) : null, anio: formFijo.anio ? parseInt(formFijo.anio) : null };
      const url  = editFijo
        ? `${API_BASE}/api/superadmin/gastos/fijos/${cid}/${editFijo.id}`
        : `${API_BASE}/api/superadmin/gastos/fijos/${cid}`;
      const r = await fetch(url, { method: editFijo ? 'PUT' : 'POST', headers: headers(), body: JSON.stringify(body) });
      if (!r.ok) throw new Error('Error al guardar');
      setModalFijo(false);
      cargarFijos();
      cargarResumen();
    } catch (e: any) { setError(e.message); }
    finally { setGuardando(false); }
  };

  const eliminarFijo = async (id: number) => {
    if (!window.confirm('¿Desactivar este gasto fijo?')) return;
    const r = await fetch(`${API_BASE}/api/superadmin/gastos/fijos/${cid}/${id}`, { method: 'DELETE', headers: headers() });
    if (r.ok) {
      cargarFijos(); cargarResumen();
    } else {
      alert('Error al eliminar el gasto fijo. Intentá de nuevo.');
    }
  };

  // ── CRUD VARIABLES ─────────────────────────────────────
  const abrirModalVar = (g?: GastoVariable) => {
    if (g) {
      setEditVar(g);
      setFormVar({ descripcion: g.descripcion, monto: String(g.monto), categoria: g.categoria, fecha: g.fecha?.slice(0,10) || hoy(), comprobante: g.comprobante || '', proveedor_id: g.proveedor_id ? String(g.proveedor_id) : '', observaciones: g.observaciones || '' });
    } else {
      setEditVar(null);
      setFormVar({ descripcion:'', monto:'', categoria:'otro', fecha: hoy(), comprobante:'', proveedor_id:'', observaciones:'' });
    }
    setModalVar(true);
  };

  const guardarVar = async () => {
    if (!formVar.descripcion || !formVar.monto || !formVar.fecha) { setError('Descripción, monto y fecha son obligatorios'); return; }
    setGuardando(true); setError('');
    try {
      const body = { ...formVar, monto: parseFloat(formVar.monto), proveedor_id: formVar.proveedor_id ? parseInt(formVar.proveedor_id) : null };
      const url  = editVar
        ? `${API_BASE}/api/superadmin/gastos/variables/${cid}/${editVar.id}`
        : `${API_BASE}/api/superadmin/gastos/variables/${cid}`;
      const r = await fetch(url, { method: editVar ? 'PUT' : 'POST', headers: headers(), body: JSON.stringify(body) });
      if (!r.ok) throw new Error('Error al guardar');
      setModalVar(false);
      cargarVariables(paginaVar, limitVar);
      cargarResumen();
    } catch (e: any) { setError(e.message); }
    finally { setGuardando(false); }
  };

  const eliminarVar = async (id: number) => {
    if (!window.confirm('¿Eliminar este gasto variable?')) return;
    const r = await fetch(`${API_BASE}/api/superadmin/gastos/variables/${cid}/${id}`, { method: 'DELETE', headers: headers() });
    if (r.ok) {
      cargarVariables(paginaVar, limitVar);
      cargarResumen();
    } else {
      alert('Error al eliminar el gasto variable. Intentá de nuevo.');
    }
  };

  // ── EXPORTAR EXCEL ─────────────────────────────────────
  const exportarExcel = (datos: any[], nombre: string, columnas: string[], campos: string[]) => {
    const sep = ';';
    const bom = '﻿';
    const header = columnas.join(sep);
    const filas  = datos.map(r => campos.map(c => {
      const v = r[c];
      if (v == null) return '';
      if (typeof v === 'number') return String(v).replace('.', ',');
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(sep));
    const csv = bom + [header, ...filas].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${nombre}.csv`;
    a.click();
  };

  // ── EXPORTAR PDF ───────────────────────────────────────
  const exportarPDF = (datos: any[], titulo: string, columnas: string[], campos: string[]) => {
    const filas = datos.map(r => campos.map(c => {
      const v = r[c];
      if (v == null) return '';
      if (c === 'monto' || c === 'precio') return fmt(Number(v));
      if (c === 'fecha') return fmtFecha(String(v));
      return String(v);
    }));
    const anchos = columnas.map(() => Math.floor(190 / columnas.length));
    let html = `<html><head><meta charset="UTF-8"><style>body{font-family:Arial;font-size:12px;}table{width:100%;border-collapse:collapse;}th{background:#1B2A4A;color:#fff;padding:6px;}td{padding:5px;border-bottom:1px solid #eee;}tr:nth-child(even){background:#F7FAFC;}h2{color:#1B2A4A;}</style></head><body>`;
    html += `<h2>${titulo}</h2><p>Fecha: ${fmtFecha(hoy())}</p><table><thead><tr>${columnas.map((c,i)=>`<th width="${anchos[i]}px">${c}</th>`).join('')}</tr></thead><tbody>`;
    html += filas.map(f => `<tr>${f.map(v => `<td>${v}</td>`).join('')}</tr>`).join('');
    html += `</tbody></table></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  if (!sesion) return (
    <div style={{ minHeight:'100vh', backgroundColor:BG, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:'32px', height:'32px', border:`3px solid #BEE3F8`, borderTopColor:BLUE, borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const totalPaginas = Math.ceil(totalVar / limitVar);

  // ════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight:'100vh', backgroundColor:BG, fontFamily:'system-ui,-apple-system,sans-serif' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* HEADER */}
      <div style={{ backgroundColor:'#fff', borderBottom:`2px solid ${SEP}`, padding:'14px 24px', display:'flex', alignItems:'center', gap:'16px', position:'sticky', top:0, zIndex:50 }}>
        <button onClick={() => navigate('/roberto/dashboard')}
          style={{ backgroundColor:NAVY, color:'#fff', border:'none', borderRadius:'8px', padding:'7px 14px', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
          ← Volver
        </button>
        <div>
          <h1 style={{ margin:0, fontSize:'17px', fontWeight:800, color:NAVY }}>💸 Gastos</h1>
          <p style={{ margin:0, fontSize:'12px', color:GRAY }}>{sesion.cliente.nombre_comercial}</p>
        </div>
      </div>

      <div style={{ padding:'20px 24px', maxWidth:'1200px', margin:'0 auto' }}>

        {/* CARDS RESUMEN */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px', marginBottom:'24px' }}>
          {[
            { label:'Gastos fijos este mes', valor: resumen.fijos_mes, color: RED,           icon:'📋' },
            { label:'Gastos variables período', valor: resumen.variables_periodo, color: ORANGE, icon:'🧾' },
            { label:'Total egresos',          valor: resumen.total_egresos, color:'#742A2A',  icon:'💸' },
          ].map(c => (
            <div key={c.label} style={{ backgroundColor:'#fff', borderRadius:'12px', padding:'20px', borderLeft:`4px solid ${c.color}`, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize:'22px', marginBottom:'6px' }}>{c.icon}</div>
              <div style={{ fontSize:'22px', fontWeight:700, color:c.color }}>{fmt(c.valor)}</div>
              <div style={{ fontSize:'12px', color:GRAY, marginTop:'4px', fontWeight:500 }}>{c.label}</div>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div style={{ display:'flex', gap:'4px', marginBottom:'20px', backgroundColor:'#fff', borderRadius:'10px', padding:'4px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)', width:'fit-content' }}>
          {([['fijos','📋 Gastos fijos'],['variables','🧾 Gastos variables']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ padding:'8px 20px', borderRadius:'8px', border:'none', cursor:'pointer', fontSize:'13px', fontWeight:700,
                backgroundColor: tab === id ? BLUE : 'transparent',
                color: tab === id ? '#fff' : GRAY,
                transition:'all 0.15s' }}>
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ backgroundColor:'#FFF5F5', border:`1px solid ${RED}`, color:RED, borderRadius:'8px', padding:'10px 14px', fontSize:'13px', marginBottom:'16px' }}>
            {error}
          </div>
        )}

        {/* ══════════ TAB GASTOS FIJOS ══════════ */}
        {tab === 'fijos' && (
          <div style={{ backgroundColor:'#fff', borderRadius:'12px', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', overflow:'hidden' }}>
            <div style={{ padding:'16px 20px', borderBottom:`2px solid ${SEP}`, display:'flex', flexWrap:'wrap', gap:'10px', alignItems:'center' }}>
              <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)}
                style={{ ...selectStyle, width:'130px' }}>
                <option value=''>Todos los meses</option>
                {MESES.map((m,i) => <option key={i+1} value={String(i+1)}>{m}</option>)}
              </select>
              <select value={filtroAnio} onChange={e => setFiltroAnio(e.target.value)}
                style={{ ...selectStyle, width:'100px' }}>
                {[2024,2025,2026,2027].map(y => <option key={y} value={String(y)}>{y}</option>)}
              </select>
              <select value={filtroCatFijo} onChange={e => setFiltroCatFijo(e.target.value)}
                style={{ ...selectStyle, width:'140px' }}>
                <option value=''>Todas las categorías</option>
                {CATS_FIJO.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
              </select>

              <div style={{ marginLeft:'auto', display:'flex', gap:'8px' }}>
                <button onClick={() => exportarExcel(fijos,'gastos_fijos',['Descripción','Categoría','Monto','Periodicidad','Mes','Año'],['descripcion','categoria','monto','periodicidad','mes','anio'])}
                  style={{ backgroundColor:'#276749', color:'#fff', border:'none', borderRadius:'7px', padding:'7px 14px', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>
                  📊 Excel
                </button>
                <button onClick={() => exportarPDF(fijos,'Gastos Fijos',['Descripción','Categoría','Monto','Periodicidad','Mes','Año'],['descripcion','categoria','monto','periodicidad','mes','anio'])}
                  style={{ backgroundColor:RED, color:'#fff', border:'none', borderRadius:'7px', padding:'7px 14px', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>
                  🖨️ PDF
                </button>
                <button onClick={() => abrirModalFijo()}
                  style={{ backgroundColor:GREEN, color:'#fff', border:'none', borderRadius:'7px', padding:'7px 14px', fontSize:'13px', fontWeight:700, cursor:'pointer' }}>
                  ＋ Agregar gasto fijo
                </button>
              </div>
            </div>

            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
                <thead>
                  <tr style={{ backgroundColor:'#EDF2F7' }}>
                    {['Descripción','Categoría','Monto','Periodicidad','Mes / Año','Acciones'].map(h => (
                      <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:700, color:NAVY, fontSize:'11px', textTransform:'uppercase', letterSpacing:'0.4px', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cargando ? (
                    <tr><td colSpan={6} style={{ textAlign:'center', padding:'32px', color:GRAY }}>Cargando...</td></tr>
                  ) : fijos.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign:'center', padding:'32px', color:GRAY }}>Sin gastos fijos registrados.</td></tr>
                  ) : fijos.map((g, i) => (
                    <tr key={g.id} style={{ backgroundColor: i%2===0 ? '#fff' : '#F7FAFC', borderBottom:'1px solid #EDF2F7' }}>
                      <td style={{ padding:'10px 14px', color:TEXT, fontWeight:500 }}>{g.descripcion}</td>
                      <td style={{ padding:'10px 14px' }}>
                        <span style={{ fontSize:'11px', backgroundColor:'#EBF8FF', color:BLUE, borderRadius:'12px', padding:'2px 9px', fontWeight:600, textTransform:'capitalize' }}>{g.categoria}</span>
                      </td>
                      <td style={{ padding:'10px 14px', fontWeight:700, color:RED }}>{fmt(g.monto)}</td>
                      <td style={{ padding:'10px 14px', color:GRAY, textTransform:'capitalize' }}>{g.periodicidad}</td>
                      <td style={{ padding:'10px 14px', color:GRAY }}>{g.mes ? `${MESES[(g.mes||1)-1]} ${g.anio||''}` : '—'}</td>
                      <td style={{ padding:'10px 14px' }}>
                        <div style={{ display:'flex', gap:'6px' }}>
                          <button onClick={() => abrirModalFijo(g)}
                            style={{ backgroundColor:BLUE, color:'#fff', border:'none', borderRadius:'6px', padding:'5px 10px', fontSize:'11px', fontWeight:600, cursor:'pointer' }}>
                            ✏️ Editar
                          </button>
                          <button onClick={() => eliminarFijo(g.id)}
                            style={{ backgroundColor:'#FFF5F5', color:RED, border:`1px solid ${RED}`, borderRadius:'6px', padding:'5px 10px', fontSize:'11px', fontWeight:600, cursor:'pointer' }}>
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Total mes */}
            <div style={{ padding:'14px 20px', borderTop:`2px solid ${SEP}`, display:'flex', justifyContent:'flex-end', alignItems:'center', gap:'12px' }}>
              <span style={{ fontSize:'13px', color:GRAY, fontWeight:600 }}>Total del mes:</span>
              <span style={{ fontSize:'20px', fontWeight:800, color:RED }}>{fmt(totalFijosMes)}</span>
            </div>
          </div>
        )}

        {/* ══════════ TAB GASTOS VARIABLES ══════════ */}
        {tab === 'variables' && (
          <div style={{ backgroundColor:'#fff', borderRadius:'12px', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', overflow:'hidden' }}>
            <div style={{ padding:'16px 20px', borderBottom:`2px solid ${SEP}`, display:'flex', flexWrap:'wrap', gap:'10px', alignItems:'center' }}>
              <input type='date' value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} style={{ ...inputStyle, width:'140px' }} />
              <input type='date' value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} style={{ ...inputStyle, width:'140px' }} />
              <select value={filtroCatVar} onChange={e => setFiltroCatVar(e.target.value)} style={{ ...selectStyle, width:'140px' }}>
                <option value=''>Todas las categorías</option>
                {CATS_VARIABLE.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
              </select>
              <input type='text' placeholder='Buscar descripción...' value={filtroBuscar}
                onChange={e => setFiltroBuscar(e.target.value)}
                style={{ ...inputStyle, width:'180px' }} />

              <div style={{ marginLeft:'auto', display:'flex', gap:'8px' }}>
                <button onClick={() => exportarExcel(variables,'gastos_variables',['Fecha','Descripción','Categoría','Proveedor','Comprobante','Monto'],['fecha','descripcion','categoria','proveedor_nombre','comprobante','monto'])}
                  style={{ backgroundColor:'#276749', color:'#fff', border:'none', borderRadius:'7px', padding:'7px 14px', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>
                  📊 Excel
                </button>
                <button onClick={() => exportarPDF(variables,'Gastos Variables',['Fecha','Descripción','Categoría','Comprobante','Monto'],['fecha','descripcion','categoria','comprobante','monto'])}
                  style={{ backgroundColor:RED, color:'#fff', border:'none', borderRadius:'7px', padding:'7px 14px', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>
                  🖨️ PDF
                </button>
                <button onClick={() => abrirModalVar()}
                  style={{ backgroundColor:ORANGE, color:'#fff', border:'none', borderRadius:'7px', padding:'7px 14px', fontSize:'13px', fontWeight:700, cursor:'pointer' }}>
                  ＋ Agregar gasto
                </button>
              </div>
            </div>

            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
                <thead>
                  <tr style={{ backgroundColor:'#EDF2F7' }}>
                    {['Fecha','Descripción','Categoría','Proveedor','Comprobante','Monto','Acciones'].map(h => (
                      <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:700, color:NAVY, fontSize:'11px', textTransform:'uppercase', letterSpacing:'0.4px', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cargando ? (
                    <tr><td colSpan={7} style={{ textAlign:'center', padding:'32px', color:GRAY }}>Cargando...</td></tr>
                  ) : variables.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign:'center', padding:'32px', color:GRAY }}>Sin gastos variables registrados.</td></tr>
                  ) : variables.map((g, i) => (
                    <tr key={g.id} style={{ backgroundColor: i%2===0 ? '#fff' : '#F7FAFC', borderBottom:'1px solid #EDF2F7' }}>
                      <td style={{ padding:'10px 14px', color:GRAY, whiteSpace:'nowrap' }}>{fmtFecha(g.fecha)}</td>
                      <td style={{ padding:'10px 14px', color:TEXT, fontWeight:500 }}>{g.descripcion}</td>
                      <td style={{ padding:'10px 14px' }}>
                        <span style={{ fontSize:'11px', backgroundColor:'#FFFAF0', color:ORANGE, borderRadius:'12px', padding:'2px 9px', fontWeight:600, textTransform:'capitalize' }}>{g.categoria}</span>
                      </td>
                      <td style={{ padding:'10px 14px', color:GRAY }}>{g.proveedor_nombre || '—'}</td>
                      <td style={{ padding:'10px 14px', color:GRAY, fontFamily:'monospace' }}>{g.comprobante || '—'}</td>
                      <td style={{ padding:'10px 14px', fontWeight:700, color:ORANGE }}>{fmt(g.monto)}</td>
                      <td style={{ padding:'10px 14px' }}>
                        <div style={{ display:'flex', gap:'6px' }}>
                          <button onClick={() => abrirModalVar(g)}
                            style={{ backgroundColor:BLUE, color:'#fff', border:'none', borderRadius:'6px', padding:'5px 10px', fontSize:'11px', fontWeight:600, cursor:'pointer' }}>
                            ✏️ Editar
                          </button>
                          <button onClick={() => eliminarVar(g.id)}
                            style={{ backgroundColor:'#FFF5F5', color:RED, border:`1px solid ${RED}`, borderRadius:'6px', padding:'5px 10px', fontSize:'11px', fontWeight:600, cursor:'pointer' }}>
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            <div style={{ padding:'12px 20px', borderTop:`1px solid #EDF2F7`, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'10px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'13px', color:GRAY }}>
                <span>Filas por página:</span>
                {[10,25,50].map(l => (
                  <button key={l} onClick={() => { setLimitVar(l); cargarVariables(1, l); }}
                    style={{ padding:'4px 10px', borderRadius:'6px', border:`1px solid ${l===limitVar ? BLUE : '#CBD5E0'}`, backgroundColor: l===limitVar ? BLUE : '#fff', color: l===limitVar ? '#fff' : GRAY, fontSize:'12px', fontWeight:600, cursor:'pointer' }}>
                    {l}
                  </button>
                ))}
              </div>
              <div style={{ fontSize:'13px', color:GRAY }}>
                {totalVar} resultado{totalVar!==1?'s':''} · Pág {paginaVar}/{totalPaginas||1}
              </div>
              <div style={{ display:'flex', gap:'6px' }}>
                <button onClick={() => cargarVariables(paginaVar-1, limitVar)} disabled={paginaVar<=1}
                  style={{ padding:'5px 12px', borderRadius:'7px', border:`1px solid #CBD5E0`, backgroundColor: paginaVar<=1 ? '#EDF2F7' : '#fff', color: paginaVar<=1 ? '#CBD5E0' : NAVY, fontSize:'13px', cursor: paginaVar<=1 ? 'default' : 'pointer', fontWeight:600 }}>
                  ‹ Ant
                </button>
                <button onClick={() => cargarVariables(paginaVar+1, limitVar)} disabled={paginaVar>=totalPaginas}
                  style={{ padding:'5px 12px', borderRadius:'7px', border:`1px solid #CBD5E0`, backgroundColor: paginaVar>=totalPaginas ? '#EDF2F7' : '#fff', color: paginaVar>=totalPaginas ? '#CBD5E0' : NAVY, fontSize:'13px', cursor: paginaVar>=totalPaginas ? 'default' : 'pointer', fontWeight:600 }}>
                  Sig ›
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══════════ MODAL GASTO FIJO ══════════ */}
      {modalFijo && (
        <Modal titulo={editFijo ? 'Editar gasto fijo' : 'Nuevo gasto fijo'} onClose={() => setModalFijo(false)}>
          <Campo label="Descripción *">
            <input style={inputStyle} value={formFijo.descripcion} onChange={e => setFormFijo(p => ({ ...p, descripcion: e.target.value }))} placeholder="Ej: Alquiler local" />
          </Campo>
          <Campo label="Monto *">
            <input type='number' min='0' step='0.01' style={inputStyle} value={formFijo.monto} onChange={e => setFormFijo(p => ({ ...p, monto: e.target.value }))} placeholder="0.00" />
          </Campo>
          <Campo label="Categoría">
            <select style={selectStyle} value={formFijo.categoria} onChange={e => setFormFijo(p => ({ ...p, categoria: e.target.value }))}>
              {CATS_FIJO.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
            </select>
          </Campo>
          <Campo label="Periodicidad">
            <select style={selectStyle} value={formFijo.periodicidad} onChange={e => setFormFijo(p => ({ ...p, periodicidad: e.target.value }))}>
              {PERIODOS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
            </select>
          </Campo>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
            <Campo label="Mes que aplica">
              <select style={selectStyle} value={formFijo.mes} onChange={e => setFormFijo(p => ({ ...p, mes: e.target.value }))}>
                <option value=''>—</option>
                {MESES.map((m,i) => <option key={i+1} value={String(i+1)}>{m}</option>)}
              </select>
            </Campo>
            <Campo label="Año que aplica">
              <select style={selectStyle} value={formFijo.anio} onChange={e => setFormFijo(p => ({ ...p, anio: e.target.value }))}>
                <option value=''>—</option>
                {[2024,2025,2026,2027].map(y => <option key={y} value={String(y)}>{y}</option>)}
              </select>
            </Campo>
          </div>
          <Campo label="Observaciones">
            <textarea style={{ ...inputStyle, minHeight:'64px', resize:'vertical' }} value={formFijo.observaciones} onChange={e => setFormFijo(p => ({ ...p, observaciones: e.target.value }))} placeholder="Opcional" />
          </Campo>
          {error && <p style={{ color:RED, fontSize:'12px', margin:'0 0 12px' }}>{error}</p>}
          <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end' }}>
            <button onClick={() => setModalFijo(false)}
              style={{ padding:'9px 18px', borderRadius:'8px', border:`1px solid #CBD5E0`, backgroundColor:'#fff', color:GRAY, fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
              Cancelar
            </button>
            <button onClick={guardarFijo} disabled={guardando}
              style={{ padding:'9px 18px', borderRadius:'8px', border:'none', backgroundColor:GREEN, color:'#fff', fontSize:'13px', fontWeight:700, cursor:'pointer', opacity: guardando ? 0.7 : 1 }}>
              {guardando ? 'Guardando...' : '✓ Guardar'}
            </button>
          </div>
        </Modal>
      )}

      {/* ══════════ MODAL GASTO VARIABLE ══════════ */}
      {modalVar && (
        <Modal titulo={editVar ? 'Editar gasto variable' : 'Nuevo gasto variable'} onClose={() => setModalVar(false)}>
          <Campo label="Descripción *">
            <input style={inputStyle} value={formVar.descripcion} onChange={e => setFormVar(p => ({ ...p, descripcion: e.target.value }))} placeholder="Ej: Flete entrega" />
          </Campo>
          <Campo label="Monto *">
            <input type='number' min='0' step='0.01' style={inputStyle} value={formVar.monto} onChange={e => setFormVar(p => ({ ...p, monto: e.target.value }))} placeholder="0.00" />
          </Campo>
          <Campo label="Fecha *">
            <input type='date' style={inputStyle} value={formVar.fecha} onChange={e => setFormVar(p => ({ ...p, fecha: e.target.value }))} />
          </Campo>
          <Campo label="Categoría">
            <select style={selectStyle} value={formVar.categoria} onChange={e => setFormVar(p => ({ ...p, categoria: e.target.value }))}>
              {CATS_VARIABLE.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
            </select>
          </Campo>
          <Campo label="Proveedor (opcional)">
            <select style={selectStyle} value={formVar.proveedor_id} onChange={e => setFormVar(p => ({ ...p, proveedor_id: e.target.value }))}>
              <option value=''>Sin proveedor</option>
              {proveedores.map(p => <option key={p.id} value={String(p.id)}>{p.nombre}</option>)}
            </select>
          </Campo>
          <Campo label="N° Comprobante">
            <input style={inputStyle} value={formVar.comprobante} onChange={e => setFormVar(p => ({ ...p, comprobante: e.target.value }))} placeholder="Ej: FC-0001-00001234" />
          </Campo>
          <Campo label="Observaciones">
            <textarea style={{ ...inputStyle, minHeight:'64px', resize:'vertical' }} value={formVar.observaciones} onChange={e => setFormVar(p => ({ ...p, observaciones: e.target.value }))} placeholder="Opcional" />
          </Campo>
          {error && <p style={{ color:RED, fontSize:'12px', margin:'0 0 12px' }}>{error}</p>}
          <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end' }}>
            <button onClick={() => setModalVar(false)}
              style={{ padding:'9px 18px', borderRadius:'8px', border:`1px solid #CBD5E0`, backgroundColor:'#fff', color:GRAY, fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
              Cancelar
            </button>
            <button onClick={guardarVar} disabled={guardando}
              style={{ padding:'9px 18px', borderRadius:'8px', border:'none', backgroundColor:GREEN, color:'#fff', fontSize:'13px', fontWeight:700, cursor:'pointer', opacity: guardando ? 0.7 : 1 }}>
              {guardando ? 'Guardando...' : '✓ Guardar'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default RobertoGastos;
