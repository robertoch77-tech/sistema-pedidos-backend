import React, { useState, useEffect } from 'react';

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

  useEffect(() => {
    if (!mayorista_id) return;
    fetch(`${API}/api/mayoristas/${mayorista_id}/configuracion`)
      .then(r => r.json())
      .then(data => setRazonSocial(data.razon_social || ''))
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

  const totalDeuda = ctasCtes.reduce((acc, m) => acc + Math.max(0, m.saldo || 0), 0);

  const imprimirCtasCte = () => {
    const ventana = window.open('', '_blank');
    if (!ventana) return;
    const filas = ctasCtes.map(m => `
      <tr>
        <td>${new Date(m.fecha_comp).toLocaleDateString('es-AR')}</td>
        <td>${m.fecha_venc ? new Date(m.fecha_venc).toLocaleDateString('es-AR') : '—'}</td>
        <td>${m.tipo || ''}</td>
        <td>${m.letra || ''}${m.letra ? '-' : ''}${m.nro_suc_comprobante || ''}-${m.nro_comprobante || ''}</td>
        <td style="text-align:right">${(m.importe || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
        <td style="text-align:right; font-weight:bold; color: ${(m.saldo || 0) > 0 ? '#b91c1c' : '#065f46'}">${(m.saldo || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
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
        .total-deuda { margin-top: 12px; background: #fef2f2; border: 1px solid #fecaca; padding: 10px 14px; border-radius: 8px; font-size: 14px; font-weight: bold; color: #b91c1c; }
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
        <div class="total-deuda">Total deuda: $${totalDeuda.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
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
        <div className="flex gap-3 mb-4">
          <button onClick={verDeudaActual} disabled={cargando}
            className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
              modoVista === 'deuda' ? 'bg-teal-700 text-white' : 'bg-teal-600 hover:bg-teal-700 text-white'
            }`}>
            {cargando && modoVista === 'deuda' ? 'Cargando...' : '📒 Ver deuda actual'}
          </button>
          <button onClick={() => setMostrarFiltroFechas(v => !v)}
            className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
              mostrarFiltroFechas ? 'bg-gray-700 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}>
            📅 Buscar por fechas
          </button>
          {ctasCtes.length > 0 && (
            <button onClick={imprimirCtasCte}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-3 rounded-xl text-sm font-semibold transition-colors">
              🖨️ Imprimir
            </button>
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

        {/* TOTAL DEUDA */}
        {ctasCtes.length > 0 && totalDeuda > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-red-500 font-medium">Total deuda</p>
              <p className="text-2xl font-bold text-red-600">${totalDeuda.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
            </div>
            <span className="text-3xl">⚠️</span>
          </div>
        )}
        {ctasCtes.length > 0 && totalDeuda === 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-green-600 font-medium">Sin deuda</p>
              <p className="text-2xl font-bold text-green-600">$0,00</p>
            </div>
            <span className="text-3xl">✅</span>
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
                  {ctasCtes.map((m, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 text-gray-600">{new Date(m.fecha_comp).toLocaleDateString('es-AR')}</td>
                      <td className="px-4 py-3 text-gray-600">{m.fecha_venc ? new Date(m.fecha_venc).toLocaleDateString('es-AR') : '—'}</td>
                      <td className="px-4 py-3 text-gray-800">{m.tipo || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">{m.letra}{m.letra ? '-' : ''}{m.nro_suc_comprobante}-{m.nro_comprobante}</td>
                      <td className="px-4 py-3 text-right text-gray-800">${(m.importe || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                      <td className={`px-4 py-3 text-right font-bold ${(m.saldo || 0) > 0 ? 'text-red-600' : 'text-teal-700'}`}>
                        ${(m.saldo || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 bg-gray-50 border-t flex justify-between items-center">
              <span className="text-xs text-gray-500">{ctasCtes.length} movimientos</span>
            </div>
          </div>
        )}
      </div>

      <footer className="bg-white border-t text-center py-2 text-xs text-gray-400 mt-4">
        Gestión Integral Pedidos
      </footer>
    </div>
  );
}

export default CtasCtes;