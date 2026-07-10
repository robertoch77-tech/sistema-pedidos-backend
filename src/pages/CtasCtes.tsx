import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const Logo = ({ size = 28 }: { size?: number }) => (
  <svg viewBox="0 0 80 80" width={size} height={size} style={{ display: 'block' }}>
    <circle cx="15" cy="15" r="11" fill="#0D2B6B" />
    <circle cx="40" cy="15" r="11" fill="#06B6D4" />
    <circle cx="65" cy="15" r="11" fill="#06B6D4" />
    <circle cx="27" cy="40" r="11" fill="#06B6D4" />
    <circle cx="52" cy="40" r="11" fill="#0D2B6B" />
    <circle cx="15" cy="65" r="11" fill="#0D2B6B" />
    <circle cx="40" cy="65" r="11" fill="#0D2B6B" />
    <circle cx="65" cy="65" r="11" fill="#06B6D4" />
  </svg>
);

interface CtaCte {
  id_tipo: number; tipo: string; fk_id_cliente: number;
  id_cta_cte_cliente_temp: number; importe: number; saldo: number;
  fecha_comp: string; fecha_venc: string; fecha_generacion: string;
  nro_suc_comprobante: number; nro_comprobante: number; letra: string;
}

const API = 'https://sistema-pedidos-backend-2hec.onrender.com';

const HOY = new Date();
HOY.setHours(0, 0, 0, 0);

function parseFechaVenc(f: string): Date | null {
  if (!f) return null;
  const d = new Date(f);
  d.setHours(0, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

function diasDiff(fecha: Date): number {
  return Math.round((HOY.getTime() - fecha.getTime()) / 86400000);
}

function fmt2(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtFecha(f: string) {
  return new Date(f).toLocaleDateString('es-AR');
}

function CtasCtes() {
  const cliente = JSON.parse(localStorage.getItem('cliente') || '{}');
  const mayorista_id = cliente.mayorista_id;

  const [ctasCtes, setCtasCtes] = useState<CtaCte[]>([]);
  const [cargando, setCargando] = useState(false);
  const [ctaFechaDesde, setCtaFechaDesde] = useState('');
  const [ctaFechaHasta, setCtaFechaHasta] = useState('');
  const [mostrarFiltroFechas, setMostrarFiltroFechas] = useState(false);
  const [razonSocial, setRazonSocial] = useState('');
  const [modoVista, setModoVista] = useState<'deuda' | 'fechas' | null>(null);
  const [habilitarMediosDePago, setHabilitarMediosDePago] = useState(false);
  const [mediosDePago, setMediosDePago] = useState('');

  useEffect(() => {
    if (!mayorista_id) return;
    fetch(`${API}/api/mayoristas/${mayorista_id}/configuracion`)
      .then(r => r.json())
      .then(data => {
        setRazonSocial(data.razon_social || '');
        setHabilitarMediosDePago(data.habilitar_medios_de_pago ?? false);
        setMediosDePago(data.medios_de_pago || '');
      })
      .catch(() => {});
  }, [mayorista_id]);

  const cargarCtasCte = async (fechaDesde?: string, fechaHasta?: string, soloDeuda?: boolean) => {
    if (!cliente.cuit) return;
    setCargando(true);
    try {
      const params = new URLSearchParams();
      if (fechaDesde) params.append('fecha_desde', fechaDesde);
      if (fechaHasta) params.append('fecha_hasta', fechaHasta);
      const res = await fetch(`${API}/api/clientes/${mayorista_id}/ctas-ctes/${cliente.cuit}?${params.toString()}`);
      const data = await res.json();
      const registros = Array.isArray(data) ? data : [];
      setCtasCtes(soloDeuda ? registros.filter((m: CtaCte) => (m.saldo || 0) > 0) : registros);
    } catch { setCtasCtes([]); } finally { setCargando(false); }
  };

  const verDeudaActual = () => {
    const hasta = new Date();
    const desde = new Date();
    desde.setFullYear(desde.getFullYear() - 2);
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    setModoVista('deuda');
    setMostrarFiltroFechas(false);
    cargarCtasCte(fmt(desde), fmt(hasta), true);
  };

  const consultarConFiltro = () => {
    setModoVista('fechas');
    cargarCtasCte(ctaFechaDesde, ctaFechaHasta, false);
  };

  // ── CÁLCULOS DE RESUMEN ──────────────────────────────────────────────────
  const totalDeuda = ctasCtes.reduce((acc, m) => acc + Math.max(0, m.saldo || 0), 0);

  const deudaVencida = ctasCtes.reduce((acc, m) => {
    const fv = parseFechaVenc(m.fecha_venc);
    return fv && fv < HOY ? acc + Math.max(0, m.saldo || 0) : acc;
  }, 0);

  const deudaAVencer = ctasCtes.reduce((acc, m) => {
    const fv = parseFechaVenc(m.fecha_venc);
    return fv && fv >= HOY ? acc + Math.max(0, m.saldo || 0) : acc;
  }, 0);

  const comprobantesVencidos = ctasCtes.filter(m => {
    const fv = parseFechaVenc(m.fecha_venc);
    return fv && fv < HOY;
  }).length;

  // ── IMPRIMIR (ventana) ────────────────────────────────────────────────────
  const imprimirCtasCte = () => {
    const ventana = window.open('', '_blank');
    if (!ventana) return;
    const filas = ctasCtes.map(m => `
      <tr>
        <td>${fmtFecha(m.fecha_comp)}</td>
        <td>${m.fecha_venc ? fmtFecha(m.fecha_venc) : '—'}</td>
        <td>${m.tipo || ''}</td>
        <td>${m.letra || ''}${m.letra ? '-' : ''}${m.nro_suc_comprobante || ''}-${m.nro_comprobante || ''}</td>
        <td style="text-align:right">${fmt2(m.importe || 0)}</td>
        <td style="text-align:right; font-weight:bold; color: ${(m.saldo || 0) > 0 ? '#b91c1c' : '#065f46'}">${fmt2(m.saldo || 0)}</td>
      </tr>
    `).join('');
    ventana.document.write(`
      <html><head><title>Cuenta Corriente</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
        .membrete { font-size: 16px; font-weight: bold; color: #0D2B6B; margin-bottom: 2px; }
        .sistema { font-size: 11px; color: #888; margin-bottom: 12px; }
        h2 { color: #0f766e; margin-bottom: 4px; }
        .info { margin: 2px 0; color: #555; font-size: 12px; }
        .periodo { margin-top: 8px; font-size: 11px; color: #888; }
        .cards { display:flex; gap:12px; margin: 12px 0; }
        .card { flex:1; padding:10px 14px; border-radius:8px; font-size:12px; }
        .card-red { background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; }
        .card-green { background:#f0fdf4; border:1px solid #bbf7d0; color:#065f46; }
        .card-blue { background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; }
        .card-orange { background:#fff7ed; border:1px solid #fed7aa; color:#c2410c; }
        .card-val { font-size:15px; font-weight:bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th { background: #0f766e; color: white; padding: 8px; text-align: left; font-size: 11px; }
        td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
        tr:nth-child(even) { background: #f9fafb; }
      </style></head>
      <body>
        <div class="membrete">${razonSocial || 'Gestión Integral Pedidos'}</div>
        <div class="sistema">Gestión Integral Pedidos</div>
        <h2>Cuenta Corriente</h2>
        <p class="info"><strong>${cliente.nombre}</strong></p>
        <p class="info">CUIT: ${cliente.cuit}</p>
        <p class="periodo">Período: ${ctaFechaDesde || '—'} al ${ctaFechaHasta || '—'}</p>
        <p class="periodo">Fecha de emisión: ${new Date().toLocaleDateString('es-AR')}</p>
        <div class="cards">
          <div class="card ${totalDeuda > 0 ? 'card-red' : 'card-green'}">
            <div>💰 Total deuda</div>
            <div class="card-val">$${fmt2(totalDeuda)}</div>
          </div>
          <div class="card card-red">
            <div>⚠️ Deuda vencida</div>
            <div class="card-val">$${fmt2(deudaVencida)}</div>
          </div>
          <div class="card card-blue">
            <div>📅 A vencer</div>
            <div class="card-val">$${fmt2(deudaAVencer)}</div>
          </div>
          <div class="card card-orange">
            <div>📋 Comp. vencidos</div>
            <div class="card-val">${comprobantesVencidos}</div>
          </div>
        </div>
        <table>
          <thead><tr>
            <th>Fecha</th><th>Vencimiento</th><th>Tipo</th><th>Comprobante</th>
            <th style="text-align:right">Importe</th><th style="text-align:right">Saldo</th>
          </tr></thead>
          <tbody>${filas}</tbody>
        </table>
        <script>window.print(); window.close();</script>
      </body></html>
    `);
    ventana.document.close();
  };

  // ── DESCARGAR PDF ─────────────────────────────────────────────────────────
  const descargarPDF = () => {
    const doc = new jsPDF({ format: 'a4' });
    const mg = 14;
    let y = 14;

    // Membrete
    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(13, 43, 107);
    doc.text(razonSocial || 'Gestión Integral Pedidos', mg, y); y += 6;
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(120);
    doc.text('Gestión Integral Pedidos', mg, y); y += 6;
    doc.setTextColor(0);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 118, 110);
    doc.text('Cuenta Corriente', mg, y); y += 6;
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(0);
    doc.text(`Cliente: ${cliente.nombre || ''}`, mg, y); y += 4;
    doc.text(`CUIT: ${cliente.cuit || ''}`, mg, y); y += 4;
    doc.text(`Fecha de emisión: ${new Date().toLocaleDateString('es-AR')}`, mg, y); y += 8;

    // Cards de resumen
    const cardW = (210 - mg * 2 - 9) / 4;
    const cards = [
      { label: '💰 Total deuda',       valor: `$${fmt2(totalDeuda)}`,         r: 220, g: 38,  b: 38  },
      { label: '⚠️ Deuda vencida',     valor: `$${fmt2(deudaVencida)}`,        r: 185, g: 28,  b: 28  },
      { label: '📅 A vencer',           valor: `$${fmt2(deudaAVencer)}`,        r: 29,  g: 78,  b: 216 },
      { label: '📋 Comp. vencidos',    valor: String(comprobantesVencidos),     r: 194, g: 65,  b: 12  },
    ];
    cards.forEach((c, i) => {
      const x = mg + i * (cardW + 3);
      doc.setFillColor(245, 245, 245);
      doc.roundedRect(x, y, cardW, 14, 2, 2, 'F');
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
      doc.text(c.label, x + 2, y + 5);
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(c.r, c.g, c.b);
      doc.text(c.valor, x + 2, y + 11);
    });
    y += 20;

    // Tabla
    autoTable(doc, {
      head: [['Fecha', 'Vencimiento', 'Tipo', 'Comprobante', 'Importe', 'Saldo']],
      body: ctasCtes.map(m => [
        fmtFecha(m.fecha_comp),
        m.fecha_venc ? fmtFecha(m.fecha_venc) : '—',
        m.tipo || '—',
        `${m.letra || ''}${m.letra ? '-' : ''}${m.nro_suc_comprobante}-${m.nro_comprobante}`,
        `$${fmt2(m.importe || 0)}`,
        `$${fmt2(m.saldo || 0)}`,
      ]),
      startY: y,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 118, 110] },
      columnStyles: {
        4: { halign: 'right' },
        5: { halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 5) {
          const row = ctasCtes[data.row.index];
          if (row && (row.saldo || 0) > 0) data.cell.styles.textColor = [185, 28, 28];
          else data.cell.styles.textColor = [6, 95, 70];
        }
      },
    });

    const fechaHoy = new Date().toISOString().split('T')[0];
    doc.save(`estado-cuenta-${fechaHoy}.pdf`);
  };

  // ── RENDER ────────────────────────────────────────────────────────────────
  const hayDatos = ctasCtes.length > 0;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* NAVBAR */}
      <nav className="bg-white shadow-sm px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Logo size={26} />
          <div>
            <p className="text-xs text-gray-400 leading-none">
              Gestión Integral Pedidos{razonSocial ? ` | ${razonSocial}` : ''}
            </p>
            <h1 className="text-lg font-bold text-teal-600">📒 Mi Cuenta Corriente</h1>
          </div>
        </div>
        <a href="/cliente" className="text-sm text-gray-500 hover:text-gray-700 font-medium">← Volver</a>
      </nav>

      <div className="p-4">
        {/* BOTONES PRINCIPALES */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <button onClick={verDeudaActual} disabled={cargando}
            className={`flex-1 min-w-[130px] px-4 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
              modoVista === 'deuda' ? 'bg-teal-700 text-white' : 'bg-teal-600 hover:bg-teal-700 text-white'
            }`}>
            {cargando && modoVista === 'deuda' ? 'Cargando...' : '📒 Ver deuda actual'}
          </button>
          <button onClick={() => setMostrarFiltroFechas(v => !v)}
            className={`flex-1 min-w-[130px] px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
              mostrarFiltroFechas ? 'bg-gray-700 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}>
            📅 Buscar por fechas
          </button>
          {hayDatos && (
            <>
              <button onClick={imprimirCtasCte}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-3 rounded-xl text-sm font-semibold transition-colors">
                🖨️ Imprimir
              </button>
              <button onClick={descargarPDF}
                className="bg-teal-700 hover:bg-teal-800 text-white px-4 py-3 rounded-xl text-sm font-semibold transition-colors">
                ⬇ PDF
              </button>
            </>
          )}
        </div>

        {/* FILTRO FECHAS */}
        {mostrarFiltroFechas && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Desde</label>
                <input type="date" value={ctaFechaDesde} onChange={e => setCtaFechaDesde(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Hasta</label>
                <input type="date" value={ctaFechaHasta} onChange={e => setCtaFechaHasta(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <button onClick={consultarConFiltro} disabled={cargando}
                className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
                {cargando && modoVista === 'fechas' ? 'Cargando...' : '🔍 Consultar'}
              </button>
            </div>
          </div>
        )}

        {/* CARDS DE RESUMEN — solo cuando hay datos */}
        {hayDatos && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {/* Total deuda */}
            <div className={`rounded-xl p-4 border-2 ${
              totalDeuda > 0
                ? 'bg-red-50 border-red-200'
                : 'bg-green-50 border-green-200'
            }`}>
              <p className={`text-xs font-medium mb-1 ${totalDeuda > 0 ? 'text-red-500' : 'text-green-600'}`}>
                💰 Total deuda
              </p>
              <p className={`text-xl font-bold ${totalDeuda > 0 ? 'text-red-600' : 'text-green-600'}`}>
                ${fmt2(totalDeuda)}
              </p>
            </div>

            {/* Deuda vencida */}
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
              <p className="text-xs font-medium text-red-500 mb-1">⚠️ Deuda vencida</p>
              <p className="text-xl font-bold text-red-600">${fmt2(deudaVencida)}</p>
            </div>

            {/* A vencer */}
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
              <p className="text-xs font-medium text-blue-500 mb-1">📅 A vencer</p>
              <p className="text-xl font-bold text-blue-600">${fmt2(deudaAVencer)}</p>
            </div>

            {/* Comprobantes vencidos */}
            <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4">
              <p className="text-xs font-medium text-orange-500 mb-1">📋 Comp. vencidos</p>
              <p className="text-xl font-bold text-orange-600">{comprobantesVencidos}</p>
            </div>
          </div>
        )}

        {cargando ? (
          <div className="text-center py-12 text-gray-400">Cargando movimientos...</div>
        ) : modoVista === null ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-6xl mb-4">📒</div>
            <p className="text-lg">Presioná "Ver deuda actual" o buscá por fechas</p>
          </div>
        ) : ctasCtes.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-5xl mb-3">✅</div>
            <p className="text-lg">{modoVista === 'deuda' ? 'No tenés deuda pendiente' : 'No hay movimientos en ese período'}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-teal-600 text-white">
                    <th className="px-4 py-3 text-left font-medium">Fecha</th>
                    <th className="px-4 py-3 text-left font-medium">Vence</th>
                    <th className="px-4 py-3 text-left font-medium">Tipo</th>
                    <th className="px-4 py-3 text-left font-medium">Comprobante</th>
                    <th className="px-4 py-3 text-right font-medium">Importe</th>
                    <th className="px-4 py-3 text-right font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {ctasCtes.map((m, idx) => {
                    const fv = parseFechaVenc(m.fecha_venc);
                    const vencido = fv !== null && fv < HOY;
                    const proxVencer = fv !== null && fv >= HOY && diasDiff(fv) >= -6;
                    // diasDiff con fecha futura es negativo (HOY - fv < 0)
                    const diasHastaVencer = fv ? Math.round((fv.getTime() - HOY.getTime()) / 86400000) : null;
                    const diasAtrasado = fv ? diasDiff(fv) : null;

                    let rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                    if (vencido) rowBg = 'bg-red-50';
                    else if (proxVencer) rowBg = 'bg-yellow-50';

                    return (
                      <tr key={idx} className={rowBg}>
                        <td className="px-4 py-3 text-gray-600">{fmtFecha(m.fecha_comp)}</td>
                        <td className="px-4 py-3">
                          <span className="text-gray-600">
                            {m.fecha_venc ? fmtFecha(m.fecha_venc) : '—'}
                          </span>
                          {vencido && diasAtrasado !== null && (
                            <div className="text-xs text-red-500 mt-0.5">
                              Vencido hace {diasAtrasado} día{diasAtrasado !== 1 ? 's' : ''}
                            </div>
                          )}
                          {!vencido && proxVencer && diasHastaVencer !== null && (
                            <div className="text-xs text-orange-500 mt-0.5">
                              Vence en {diasHastaVencer} día{diasHastaVencer !== 1 ? 's' : ''}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-800">{m.tipo || '—'}</td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                          {m.letra}{m.letra ? '-' : ''}{m.nro_suc_comprobante}-{m.nro_comprobante}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-800">${fmt2(m.importe || 0)}</td>
                        <td className={`px-4 py-3 text-right font-bold ${(m.saldo || 0) > 0 ? 'text-red-600' : 'text-teal-700'}`}>
                          ${fmt2(m.saldo || 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 bg-gray-50 border-t flex justify-between items-center">
              <span className="text-xs text-gray-500">{ctasCtes.length} movimientos</span>
            </div>
          </div>
        )}
      </div>

      {habilitarMediosDePago && mediosDePago && (
        <div className="mx-4 mb-4 bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm font-semibold text-teal-700 mb-2">💳 Cómo pagar</p>
          <p className="text-sm text-gray-700 whitespace-pre-line">{mediosDePago}</p>
        </div>
      )}

      <footer className="bg-white border-t text-center py-2 text-xs text-gray-400 mt-4">
        Gestión Integral Pedidos
      </footer>
    </div>
  );
}

export default CtasCtes;
