import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../../config/api';
import { getToken } from '../../../utils/auth';

// ─── COLORES ─────────────────────────────────────────────────
const NAVY   = '#1B2A4A';
const BLUE   = '#2B6CB0';
const GREEN  = '#38A169';
const RED    = '#E53E3E';
const SEP    = '#63B3ED';
const GRAY   = '#718096';
const TEXT   = '#2D3748';
const BG     = '#F4F6F9';
const ORANGE = '#DD6B20';

// ─── AUTH ─────────────────────────────────────────────────────
function getClienteId(): number | null {
  try { const s = localStorage.getItem('roberto_portal_session'); return s ? JSON.parse(s).cliente?.id ?? null : null; } catch { return null; }
}
function hdr() { return { 'x-superadmin-token': getToken() } as Record<string, string>; }

// ─── HELPERS ─────────────────────────────────────────────────
function n(v: number | string | undefined): number { return parseFloat(String(v)) || 0; }
function fmt(v: number | string | undefined) {
  return `$${n(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtNum(v: number | string | undefined) { return n(v).toLocaleString('es-AR'); }

function hoy() { return new Date().toISOString().slice(0, 10); }
function primerDiaMes(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); }
function ultimoDiaMes(d = new Date()) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10); }
function primerDiaSemana() {
  const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1);
  return d.toISOString().slice(0, 10);
}
function primerDiaAnio() { return `${new Date().getFullYear()}-01-01`; }

type TabId = 'ventas' | 'stock' | 'iva' | 'cobranzas' | 'rentabilidad';
type PeriodoId = 'hoy' | 'semana' | 'mes' | 'mes_anterior' | 'anio' | 'personalizado';

// ─── SKELETON ─────────────────────────────────────────────────
function Skeleton({ w = '100%', h = 16, mb = 8, radius = 6 }: { w?: string | number; h?: number; mb?: number; radius?: number }) {
  return (
    <div style={{
      width: w, height: h, marginBottom: mb, borderRadius: radius,
      background: 'linear-gradient(90deg, #E2E8F0 25%, #EDF2F7 50%, #E2E8F0 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s infinite',
    }} />
  );
}

// ─── CARD ─────────────────────────────────────────────────────
interface CardProps { icon: string; label: string; valor: React.ReactNode; color: string; cargando?: boolean; }
function Card({ icon, label, valor, color, cargando }: CardProps) {
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '18px 20px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${color}`, flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: '22px', marginBottom: '6px' }}>{icon}</div>
      {cargando ? <Skeleton h={22} mb={4} /> : (
        <div style={{ fontSize: '18px', fontWeight: 700, color, marginBottom: '2px', wordBreak: 'break-all' }}>{valor}</div>
      )}
      <div style={{ fontSize: '12px', color: GRAY }}>{label}</div>
    </div>
  );
}

// ─── TABLA SKELETON ───────────────────────────────────────────
function TablaSkeleton({ cols, rows = 5 }: { cols: string[]; rows?: number }) {
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead style={{ backgroundColor: '#F7FAFC', borderBottom: `2px solid ${SEP}` }}>
          <tr>
            {cols.map(c => (
              <th key={c} style={{ padding: '10px 14px', textAlign: 'left', color: GRAY, fontWeight: 600, fontSize: '11px' }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#F7FAFC', borderBottom: '1px solid #EDF2F7' }}>
              {cols.map((c, j) => (
                <td key={c} style={{ padding: '10px 14px' }}>
                  <Skeleton h={14} mb={0} w={j === 0 ? '80%' : '60%'} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── TABLA REAL ───────────────────────────────────────────────
function TablaReal({ cols, rows, cargando, empty = 'Sin datos' }: {
  cols: { key: string; label: string; render?: (v: any, row: any) => React.ReactNode }[];
  rows: any[];
  cargando: boolean;
  empty?: string;
}) {
  if (cargando) return <TablaSkeleton cols={cols.map(c => c.label)} />;
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead style={{ backgroundColor: '#F7FAFC', borderBottom: `2px solid ${SEP}` }}>
          <tr>
            {cols.map(c => (
              <th key={c.key} style={{ padding: '10px 14px', textAlign: 'left', color: GRAY, fontWeight: 600, fontSize: '11px' }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={cols.length} style={{ padding: '32px', textAlign: 'center', color: GRAY, fontSize: '13px' }}>{empty}</td></tr>
          ) : rows.map((row, i) => (
            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#F7FAFC', borderBottom: '1px solid #EDF2F7' }}>
              {cols.map(c => (
                <td key={c.key} style={{ padding: '10px 14px', color: TEXT }}>
                  {c.render ? c.render(row[c.key], row) : row[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── BOTONES EXCEL / PDF ──────────────────────────────────────
function BotonesExportacion({ onExcel, onPDF }: { onExcel: () => void; onPDF: () => void }) {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <button onClick={onExcel}
        style={{ padding: '8px 14px', backgroundColor: GREEN, color: '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
        📊 Excel
      </button>
      <button onClick={onPDF}
        style={{ padding: '8px 14px', backgroundColor: NAVY, color: '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
        📄 PDF
      </button>
    </div>
  );
}

// ─── EXPORT HELPERS ───────────────────────────────────────────
function exportarExcel(nombre: string, encabezados: string[], filas: any[][]) {
  const sep = '\t';
  const contenido = [encabezados.join(sep), ...filas.map(f => f.join(sep))].join('\n');
  const blob = new Blob([contenido], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href = url; a.download = `${nombre}.xls`; a.click();
  URL.revokeObjectURL(url);
}

function exportarPDF(titulo: string, encabezados: string[], filas: any[][]) {
  const w = window.open('', '_blank');
  if (!w) return;
  const cfg = (() => { try { return JSON.parse(localStorage.getItem(`roberto_config_${getClienteId()}`) || '{}'); } catch { return {}; } })();
  const logoUrl  = cfg.logo_url         || '';
  const negNom   = cfg.nombre_comercial || '';
  const negDir   = cfg.direccion        || '';
  const negCuit  = cfg.cuit             || '';
  const logoBlock = `<div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #e2e8f0">
    ${logoUrl ? `<img src="${logoUrl}" alt="" style="max-width:150px;max-height:70px;object-fit:contain;flex-shrink:0">` : ''}
    <div>
      ${negNom  ? `<div style="font-size:18px;font-weight:700">${negNom}</div>`   : ''}
      ${negDir  ? `<div style="font-size:12px;color:#666">${negDir}</div>`        : ''}
      ${negCuit ? `<div style="font-size:12px;color:#666">CUIT: ${negCuit}</div>` : ''}
    </div>
  </div>`;
  const filaHtml = (celdas: any[], tag = 'td') =>
    `<tr>${celdas.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
  w.document.write(`<!DOCTYPE html><html><head><title>${titulo}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px;color:#2D3748;font-size:12px}
    h1{font-size:18px;color:#1B2A4A;margin-bottom:16px}
    table{width:100%;border-collapse:collapse}
    th{background:#F7FAFC;padding:8px;text-align:left;border-bottom:2px solid #63B3ED;font-size:11px;color:#718096}
    td{padding:8px;border-bottom:1px solid #EDF2F7}
    tr:nth-child(even){background:#F7FAFC}</style></head><body>
    ${logoBlock}
    <h1>${titulo}</h1>
    <table><thead>${filaHtml(encabezados, 'th')}</thead>
    <tbody>${filas.map(f => filaHtml(f)).join('')}</tbody></table>
    <script>window.print()</script></body></html>`);
  w.document.close();
}

// ═══════════════════════════════════════════════════════════════
// TAB VENTAS
// ═══════════════════════════════════════════════════════════════
function TabVentas({ cid, desde, hasta }: { cid: number; desde: string; hasta: string }) {
  const [datos, setDatos]     = useState<any>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    setDatos(null);
    fetch(`${API_BASE}/api/superadmin/reportes/ventas/${cid}?fecha_desde=${desde}&fecha_hasta=${hasta}`, { headers: hdr() })
      .then(r => r.json()).then(d => setDatos(d)).catch(() => setDatos({}))
      .finally(() => setCargando(false));
  }, [cid, desde, hasta]);

  const resumen = datos?.resumen ?? {};
  const productos = datos?.por_producto ?? [];
  const clientes  = datos?.por_cliente  ?? [];

  const variacion = n(resumen.variacion_vs_anterior);
  const varColor  = variacion >= 0 ? GREEN : RED;
  const varLabel  = variacion === null ? '—' : `${variacion >= 0 ? '+' : ''}${variacion}%`;

  const xlsProd = () => exportarExcel('ventas_por_producto', ['Ranking', 'Producto', 'Cantidad', 'Monto'],
    productos.map((r: any) => [r.ranking, r.descripcion, r.cantidad, r.monto]));
  const pdfProd = () => exportarPDF('Reporte de Ventas', ['Ranking', 'Producto', 'Cantidad', 'Monto'],
    productos.map((r: any) => [r.ranking, r.descripcion, r.cantidad, fmt(r.monto)]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Cards */}
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <Card icon="💰" label="Total monto"     valor={fmt(resumen.total_monto)}     color={BLUE}    cargando={cargando} />
        <Card icon="🧾" label="Cantidad ventas"  valor={fmtNum(resumen.total_ventas)} color={NAVY}    cargando={cargando} />
        <Card icon="🎫" label="Ticket promedio"  valor={fmt(resumen.ticket_promedio)} color={ORANGE}  cargando={cargando} />
        <Card icon="📈" label="Variación %"      valor={<span style={{ color: varColor }}>{varLabel}</span>} color={varColor} cargando={cargando} />
      </div>

      {/* Top productos */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: NAVY }}>Top 10 productos</h4>
          <BotonesExportacion onExcel={xlsProd} onPDF={pdfProd} />
        </div>
        <TablaReal cargando={cargando} empty="Sin ventas en el período" rows={productos.slice(0, 10)}
          cols={[
            { key: 'ranking',     label: '#' },
            { key: 'descripcion', label: 'Producto' },
            { key: 'cantidad',    label: 'Cantidad', render: (v: any) => fmtNum(v) },
            { key: 'monto',       label: 'Monto',    render: (v: any) => <span style={{ color: BLUE, fontWeight: 700 }}>{fmt(v)}</span> },
          ]}
        />
      </div>

      {/* Top clientes */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: NAVY }}>Top 10 clientes</h4>
          <BotonesExportacion
            onExcel={() => exportarExcel('ventas_por_cliente', ['Ranking', 'Cliente', 'Compras', 'Monto'],
              clientes.map((r: any) => [r.ranking, r.nombre, r.cantidad, r.monto]))}
            onPDF={() => exportarPDF('Top Clientes', ['Ranking', 'Cliente', 'Compras', 'Monto'],
              clientes.map((r: any) => [r.ranking, r.nombre, r.cantidad, fmt(r.monto)]))}
          />
        </div>
        <TablaReal cargando={cargando} empty="Sin datos" rows={clientes.slice(0, 10)}
          cols={[
            { key: 'ranking',  label: '#' },
            { key: 'nombre',   label: 'Cliente' },
            { key: 'cantidad', label: 'Compras', render: (v: any) => fmtNum(v) },
            { key: 'monto',    label: 'Monto',   render: (v: any) => <span style={{ color: BLUE, fontWeight: 700 }}>{fmt(v)}</span> },
          ]}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB STOCK
// ═══════════════════════════════════════════════════════════════
function TabStock({ cid }: { cid: number }) {
  const [datos, setDatos]     = useState<any>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    fetch(`${API_BASE}/api/superadmin/reportes/stock/${cid}`, { headers: hdr() })
      .then(r => r.json()).then(d => setDatos(d)).catch(() => setDatos({}))
      .finally(() => setCargando(false));
  }, [cid]);

  const res       = datos?.resumen    ?? {};
  const rotacion  = datos?.rotacion   ?? [];
  const porProv   = datos?.por_proveedor ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <Card icon="💰" label="Valor al costo"  valor={fmt(res.valor_costo)}                 color={BLUE}   cargando={cargando} />
        <Card icon="🏷️" label="Valor de venta"  valor={fmt(res.valor_venta)}                 color={GREEN}  cargando={cargando} />
        <Card icon="⚠️" label="Bajo mínimo"     valor={`${(datos?.bajo_minimo ?? []).length} productos`}   color={ORANGE} cargando={cargando} />
        <Card icon="❌" label="Sin stock"        valor={`${(datos?.sin_stock ?? []).length} productos`}    color={RED}    cargando={cargando} />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: NAVY }}>Rotación de productos</h4>
          <BotonesExportacion
            onExcel={() => exportarExcel('rotacion_stock', ['Producto', 'Ventas 30d', 'Stock', 'Días cobertura'],
              rotacion.map((r: any) => [r.producto, r.ventas_mes, r.stock_actual, r.dias_cobertura ?? '—']))}
            onPDF={() => exportarPDF('Rotación de Stock', ['Producto', 'Ventas 30d', 'Stock', 'Días cobertura'],
              rotacion.map((r: any) => [r.producto, r.ventas_mes, r.stock_actual, r.dias_cobertura ?? '—']))}
          />
        </div>
        <TablaReal cargando={cargando} empty="Sin datos de rotación" rows={rotacion}
          cols={[
            { key: 'producto',       label: 'Producto' },
            { key: 'ventas_mes',     label: 'Ventas 30d', render: (v: any) => fmtNum(v) },
            { key: 'stock_actual',   label: 'Stock',      render: (v: any) => fmtNum(v) },
            { key: 'dias_cobertura', label: 'Días cobertura',
              render: (v: any) => v == null ? <span style={{ color: GRAY }}>Sin rotación</span>
                : <span style={{ color: n(v) < 15 ? RED : n(v) < 30 ? ORANGE : GREEN, fontWeight: 700 }}>{fmtNum(v)} días</span> },
          ]}
        />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: NAVY }}>Stock por proveedor</h4>
          <BotonesExportacion
            onExcel={() => exportarExcel('stock_por_proveedor', ['Proveedor', 'Productos', 'Valor costo'],
              porProv.map((r: any) => [r.proveedor, r.productos, r.valor]))}
            onPDF={() => exportarPDF('Stock por Proveedor', ['Proveedor', 'Productos', 'Valor costo'],
              porProv.map((r: any) => [r.proveedor, r.productos, fmt(r.valor)]))}
          />
        </div>
        <TablaReal cargando={cargando} empty="Sin datos" rows={porProv}
          cols={[
            { key: 'proveedor', label: 'Proveedor' },
            { key: 'productos', label: 'Productos', render: (v: any) => fmtNum(v) },
            { key: 'valor',     label: 'Valor costo', render: (v: any) => <span style={{ color: BLUE, fontWeight: 700 }}>{fmt(v)}</span> },
          ]}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB IVA
// ═══════════════════════════════════════════════════════════════
function TabIVA({ cid }: { cid: number }) {
  const mesActual = new Date().toISOString().slice(0, 7);
  const [periodo, setPeriodo] = useState(mesActual);
  const [datos, setDatos]     = useState<any>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    fetch(`${API_BASE}/api/superadmin/reportes/iva/${cid}?periodo=${periodo}`, { headers: hdr() })
      .then(r => r.json()).then(d => setDatos(d)).catch(() => setDatos({}))
      .finally(() => setCargando(false));
  }, [cid, periodo]);

  const ventas   = datos?.ventas    ?? {};
  const compras  = datos?.compras   ?? {};
  const resultado = datos?.resultado ?? {};
  const aFavor   = n(resultado.saldo_a_favor) > 0;

  const filaVentas = [
    { alicuota: 'IVA 10.5%', neto: n(ventas.total_neto) / 2, iva: n(ventas.iva_105) },
    { alicuota: 'IVA 21%',   neto: n(ventas.total_neto) / 2, iva: n(ventas.iva_21)  },
    { alicuota: 'IVA 27%',   neto: 0,                         iva: n(ventas.iva_27)  },
  ].filter(f => f.iva > 0 || f.neto > 0);

  const filaCompras = [
    { alicuota: 'IVA 10.5%', neto: n(compras.total_neto) / 2, iva: n(compras.iva_105) },
    { alicuota: 'IVA 21%',   neto: n(compras.total_neto) / 2, iva: n(compras.iva_21)  },
    { alicuota: 'IVA 27%',   neto: 0,                          iva: n(compras.iva_27)  },
  ].filter(f => f.iva > 0 || f.neto > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Selector mes */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <label style={{ fontSize: '13px', fontWeight: 600, color: GRAY }}>Período:</label>
        <input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)}
          style={{ padding: '7px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '13px', color: TEXT }} />
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <Card icon="📤" label="IVA ventas"   valor={fmt(resultado.iva_ventas)}  color={BLUE}  cargando={cargando} />
        <Card icon="📥" label="IVA compras"  valor={fmt(resultado.iva_compras)} color={ORANGE} cargando={cargando} />
        <Card icon={aFavor ? '✅' : '⚠️'}
          label={aFavor ? 'Saldo a favor' : 'Saldo a pagar'}
          valor={fmt(aFavor ? resultado.saldo_a_favor : resultado.saldo_a_pagar)}
          color={aFavor ? GREEN : RED} cargando={cargando} />
      </div>

      {/* Tabla IVA ventas */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: NAVY }}>Libro IVA Ventas</h4>
          <BotonesExportacion
            onExcel={() => exportarExcel(`iva_ventas_${periodo}`, ['Alícuota', 'Neto gravado', 'IVA'],
              filaVentas.map(r => [r.alicuota, r.neto.toFixed(2), r.iva.toFixed(2)]))}
            onPDF={() => exportarPDF(`IVA Ventas ${periodo}`, ['Alícuota', 'Neto gravado', 'IVA'],
              filaVentas.map(r => [r.alicuota, fmt(r.neto), fmt(r.iva)]))}
          />
        </div>
        <TablaReal cargando={cargando} empty="Sin comprobantes en este período" rows={filaVentas}
          cols={[
            { key: 'alicuota', label: 'Alícuota' },
            { key: 'neto',     label: 'Neto gravado', render: (v: any) => fmt(v) },
            { key: 'iva',      label: 'IVA',          render: (v: any) => <span style={{ color: BLUE, fontWeight: 700 }}>{fmt(v)}</span> },
          ]}
        />
      </div>

      {/* Tabla IVA compras */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: NAVY }}>Libro IVA Compras</h4>
          <BotonesExportacion
            onExcel={() => exportarExcel(`iva_compras_${periodo}`, ['Alícuota', 'Neto gravado', 'IVA'],
              filaCompras.map(r => [r.alicuota, r.neto.toFixed(2), r.iva.toFixed(2)]))}
            onPDF={() => exportarPDF(`IVA Compras ${periodo}`, ['Alícuota', 'Neto gravado', 'IVA'],
              filaCompras.map(r => [r.alicuota, fmt(r.neto), fmt(r.iva)]))}
          />
        </div>
        <TablaReal cargando={cargando} empty="Sin comprobantes de compra en este período" rows={filaCompras}
          cols={[
            { key: 'alicuota', label: 'Alícuota' },
            { key: 'neto',     label: 'Neto gravado', render: (v: any) => fmt(v) },
            { key: 'iva',      label: 'IVA',          render: (v: any) => <span style={{ color: ORANGE, fontWeight: 700 }}>{fmt(v)}</span> },
          ]}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB COBRANZAS
// ═══════════════════════════════════════════════════════════════
function TabCobranzas({ cid, desde, hasta }: { cid: number; desde: string; hasta: string }) {
  const [datos, setDatos]       = useState<any>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    fetch(`${API_BASE}/api/superadmin/reportes/cobranzas/${cid}?fecha_desde=${desde}&fecha_hasta=${hasta}`, { headers: hdr() })
      .then(r => r.json()).then(d => setDatos(d)).catch(() => setDatos({}))
      .finally(() => setCargando(false));
  }, [cid, desde, hasta]);

  const res      = datos?.resumen          ?? {};
  const porCli   = datos?.por_cliente      ?? [];
  const porMedio = datos?.por_medio_pago   ?? [];
  const pendiente = datos?.pendiente_cobrar ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <Card icon="💵" label="Total cobrado"      valor={fmt(res.total_cobrado)}   color={GREEN}  cargando={cargando} />
        <Card icon="🔢" label="Cantidad cobros"    valor={fmtNum(res.cantidad_cobros)} color={BLUE} cargando={cargando} />
        <Card icon="📊" label="Promedio por cobro" valor={fmt(res.promedio)}        color={NAVY}   cargando={cargando} />
        <Card icon="⏳" label="Pendiente cobrar"   valor={fmt(pendiente.reduce((s: number, r: any) => s + n(r.monto), 0))} color={ORANGE} cargando={cargando} />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: NAVY }}>Por cliente</h4>
          <BotonesExportacion
            onExcel={() => exportarExcel('cobranzas_por_cliente', ['Cliente', 'Cobros', 'Monto'],
              porCli.map((r: any) => [r.nombre, r.cobros, r.monto]))}
            onPDF={() => exportarPDF('Cobranzas por Cliente', ['Cliente', 'Cobros', 'Monto'],
              porCli.map((r: any) => [r.nombre, r.cobros, fmt(r.monto)]))}
          />
        </div>
        <TablaReal cargando={cargando} empty="Sin cobros en el período" rows={porCli}
          cols={[
            { key: 'nombre', label: 'Cliente' },
            { key: 'cobros', label: 'Cobros',  render: (v: any) => fmtNum(v) },
            { key: 'monto',  label: 'Monto',   render: (v: any) => <span style={{ color: GREEN, fontWeight: 700 }}>{fmt(v)}</span> },
          ]}
        />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: NAVY }}>Por medio de pago</h4>
          <BotonesExportacion
            onExcel={() => exportarExcel('cobranzas_medio_pago', ['Medio', 'Cantidad', 'Monto'],
              porMedio.map((r: any) => [r.tipo, r.cantidad, r.monto]))}
            onPDF={() => exportarPDF('Por Medio de Pago', ['Medio', 'Cantidad', 'Monto'],
              porMedio.map((r: any) => [r.tipo, r.cantidad, fmt(r.monto)]))}
          />
        </div>
        <TablaReal cargando={cargando} empty="Sin datos de medios de pago" rows={porMedio}
          cols={[
            { key: 'tipo',     label: 'Medio de pago' },
            { key: 'cantidad', label: 'Cantidad', render: (v: any) => fmtNum(v) },
            { key: 'monto',    label: 'Monto',    render: (v: any) => <span style={{ color: BLUE, fontWeight: 700 }}>{fmt(v)}</span> },
          ]}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB RENTABILIDAD
// ═══════════════════════════════════════════════════════════════
function TabRentabilidad({ cid, desde, hasta }: { cid: number; desde: string; hasta: string }) {
  const [datos, setDatos]       = useState<any>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    fetch(`${API_BASE}/api/superadmin/reportes/rentabilidad/${cid}?fecha_desde=${desde}&fecha_hasta=${hasta}`, { headers: hdr() })
      .then(r => r.json()).then(d => setDatos(d)).catch(() => setDatos({}))
      .finally(() => setCargando(false));
  }, [cid, desde, hasta]);

  const ing       = datos?.ingresos    ?? {};
  const egr       = datos?.egresos     ?? {};
  const res       = datos?.resultado   ?? {};
  const porProd   = datos?.por_producto  ?? [];
  const porProv   = datos?.por_proveedor ?? [];

  const netoPositivo = n(res.neto) >= 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Nota gastos */}
      <div style={{ backgroundColor: '#FFF8E1', border: '1px solid #F6E05E', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#92400E', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>💡</span>
        <span>Cargá tus gastos fijos y variables en <strong>Caja</strong> para ver la rentabilidad real</span>
      </div>

      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <Card icon="📈" label="Ingresos (ventas)" valor={fmt(ing.ventas)}        color={GREEN}  cargando={cargando} />
        <Card icon="📉" label="Egresos (compras)" valor={fmt(n(egr.compras) + n(egr.gastos_fijos) + n(egr.gastos_variables))} color={RED}   cargando={cargando} />
        <Card icon={netoPositivo ? '✅' : '⚠️'} label="Resultado neto" valor={fmt(res.neto)} color={netoPositivo ? GREEN : RED} cargando={cargando} />
        <Card icon="💹" label="Margen neto %"
          valor={<span style={{ color: netoPositivo ? GREEN : RED }}>{n(res.margen_neto_pct).toFixed(1)}%</span>}
          color={netoPositivo ? GREEN : RED} cargando={cargando} />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: NAVY }}>Margen por producto</h4>
          <BotonesExportacion
            onExcel={() => exportarExcel('margen_por_producto', ['Producto', 'Ventas', 'Costo', 'Margen'],
              porProd.map((r: any) => [r.descripcion, r.ventas, r.costo, r.margen]))}
            onPDF={() => exportarPDF('Margen por Producto', ['Producto', 'Ventas', 'Costo', 'Margen'],
              porProd.map((r: any) => [r.descripcion, fmt(r.ventas), fmt(r.costo), fmt(r.margen)]))}
          />
        </div>
        <TablaReal cargando={cargando} empty="Sin ventas en el período" rows={porProd}
          cols={[
            { key: 'descripcion', label: 'Producto' },
            { key: 'ventas',      label: 'Ventas',  render: (v: any) => fmt(v) },
            { key: 'costo',       label: 'Costo',   render: (v: any) => fmt(v) },
            { key: 'margen',      label: 'Margen',
              render: (v: any) => <span style={{ color: n(v) >= 0 ? GREEN : RED, fontWeight: 700 }}>{fmt(v)}</span> },
          ]}
        />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: NAVY }}>Margen por proveedor</h4>
          <BotonesExportacion
            onExcel={() => exportarExcel('margen_por_proveedor', ['Proveedor', 'Compras', 'Ventas', 'Margen'],
              porProv.map((r: any) => [r.nombre, r.compras, r.ventas_productos, r.margen]))}
            onPDF={() => exportarPDF('Margen por Proveedor', ['Proveedor', 'Compras', 'Ventas', 'Margen'],
              porProv.map((r: any) => [r.nombre, fmt(r.compras), fmt(r.ventas_productos), fmt(r.margen)]))}
          />
        </div>
        <TablaReal cargando={cargando} empty="Sin datos de proveedores" rows={porProv}
          cols={[
            { key: 'nombre',           label: 'Proveedor' },
            { key: 'compras',          label: 'Compras',  render: (v: any) => fmt(v) },
            { key: 'ventas_productos', label: 'Ventas',   render: (v: any) => fmt(v) },
            { key: 'margen',           label: 'Margen',
              render: (v: any) => <span style={{ color: n(v) >= 0 ? GREEN : RED, fontWeight: 700 }}>{fmt(v)}</span> },
          ]}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════
const PERIODOS: { id: PeriodoId; label: string }[] = [
  { id: 'hoy',          label: 'Hoy' },
  { id: 'semana',       label: 'Esta semana' },
  { id: 'mes',          label: 'Este mes' },
  { id: 'mes_anterior', label: 'Mes anterior' },
  { id: 'anio',         label: 'Este año' },
  { id: 'personalizado',label: 'Personalizado' },
];

const TABS: { id: TabId; label: string }[] = [
  { id: 'ventas',        label: '📊 Ventas'       },
  { id: 'stock',         label: '📦 Stock'        },
  { id: 'iva',           label: '🧾 IVA'          },
  { id: 'cobranzas',     label: '💵 Cobranzas'    },
  { id: 'rentabilidad',  label: '📈 Rentabilidad' },
];

function calcFechas(periodo: PeriodoId): { desde: string; hasta: string } {
  switch (periodo) {
    case 'hoy':          return { desde: hoy(), hasta: hoy() };
    case 'semana':       return { desde: primerDiaSemana(), hasta: hoy() };
    case 'mes':          return { desde: primerDiaMes(), hasta: ultimoDiaMes() };
    case 'mes_anterior': {
      const d = new Date(); d.setMonth(d.getMonth() - 1);
      return { desde: primerDiaMes(d), hasta: ultimoDiaMes(d) };
    }
    case 'anio':         return { desde: primerDiaAnio(), hasta: hoy() };
    default:             return { desde: primerDiaMes(), hasta: ultimoDiaMes() };
  }
}

function RobertoReportes() {
  const navigate = useNavigate();
  const cid = getClienteId();

  const [periodo, setPeriodo]         = useState<PeriodoId>('mes');
  const [tab, setTab]                 = useState<TabId>('ventas');
  const [desdePers, setDesdePers]     = useState(primerDiaMes());
  const [hastaPers, setHastaPers]     = useState(ultimoDiaMes());
  const [fechasActivas, setFechasActivas] = useState(calcFechas('mes'));

  const aplicar = useCallback(() => {
    if (periodo === 'personalizado') {
      setFechasActivas({ desde: desdePers, hasta: hastaPers });
    } else {
      setFechasActivas(calcFechas(periodo));
    }
  }, [periodo, desdePers, hastaPers]);

  // Aplicar automáticamente al cambiar período (excepto personalizado)
  useEffect(() => {
    if (periodo !== 'personalizado') setFechasActivas(calcFechas(periodo));
  }, [periodo]);

  if (!cid) return <div style={{ padding: '40px', textAlign: 'center', color: GRAY }}>Sin sesión activa.</div>;

  return (
    <div style={{ padding: '24px', backgroundColor: BG, minHeight: '100vh' }}>
      {/* Animación shimmer */}
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: NAVY }}>📈 Reportes</h1>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: GRAY }}>
            {fechasActivas.desde} → {fechasActivas.hasta}
          </p>
        </div>
        <button onClick={() => navigate('/roberto/dashboard')}
          style={{ padding: '9px 16px', border: '1px solid #CBD5E0', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: GRAY }}>
          ← Dashboard
        </button>
      </div>

      {/* Filtros período */}
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '16px 20px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {PERIODOS.map(p => (
            <button key={p.id} onClick={() => setPeriodo(p.id)}
              style={{ padding: '7px 14px', border: `1px solid ${periodo === p.id ? BLUE : '#CBD5E0'}`,
                borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: periodo === p.id ? 700 : 400,
                backgroundColor: periodo === p.id ? '#EBF8FF' : '#fff',
                color: periodo === p.id ? BLUE : GRAY, transition: 'all 0.15s' }}>
              {p.label}
            </button>
          ))}

          {periodo === 'personalizado' && (
            <>
              <input type="date" value={desdePers} onChange={e => setDesdePers(e.target.value)}
                style={{ padding: '7px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '12px', color: TEXT }} />
              <span style={{ color: GRAY, fontSize: '12px' }}>→</span>
              <input type="date" value={hastaPers} onChange={e => setHastaPers(e.target.value)}
                style={{ padding: '7px 10px', border: '1px solid #CBD5E0', borderRadius: '7px', fontSize: '12px', color: TEXT }} />
              <button onClick={aplicar}
                style={{ padding: '7px 16px', backgroundColor: BLUE, color: '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
                Actualizar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', backgroundColor: '#fff', borderRadius: '10px',
        padding: '4px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
              fontWeight: tab === t.id ? 700 : 400, whiteSpace: 'nowrap',
              backgroundColor: tab === t.id ? NAVY : 'transparent',
              color: tab === t.id ? '#fff' : GRAY, transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {tab === 'ventas'       && <TabVentas       cid={cid} desde={fechasActivas.desde} hasta={fechasActivas.hasta} />}
      {tab === 'stock'        && <TabStock         cid={cid} />}
      {tab === 'iva'          && <TabIVA           cid={cid} />}
      {tab === 'cobranzas'    && <TabCobranzas     cid={cid} desde={fechasActivas.desde} hasta={fechasActivas.hasta} />}
      {tab === 'rentabilidad' && <TabRentabilidad  cid={cid} desde={fechasActivas.desde} hasta={fechasActivas.hasta} />}
    </div>
  );
}

export default RobertoReportes;
