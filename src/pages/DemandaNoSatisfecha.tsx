import React, { useState } from 'react';

const API = 'https://sistema-pedidos-backend-2hec.onrender.com';

interface Demanda {
  busqueda: string;
  veces: number;
  ultima_vez: string;
  clientes: string[];
}

function DemandaNoSatisfecha() {
  const mayorista = JSON.parse(localStorage.getItem('mayorista') || '{}');

  const [demanda, setDemanda] = useState<Demanda[]>([]);
  const [cargando, setCargando] = useState(false);
  const [busquedaFiltro, setBusquedaFiltro] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [borrando, setBorrando] = useState(false);
  const [mostrado, setMostrado] = useState(false);

  const cargar = async () => {
    if (!fechaDesde || !fechaHasta) {
      alert('Seleccioná un rango de fechas para consultar');
      return;
    }
    setCargando(true);
    setMostrado(false);
    try {
      const params = new URLSearchParams();
      params.append('fecha_desde', fechaDesde);
      params.append('fecha_hasta', fechaHasta);
      if (busquedaFiltro) params.append('busqueda', busquedaFiltro);
      const res = await fetch(`${API}/api/demanda/${mayorista.id}?${params.toString()}`);
      const data = await res.json();
      setDemanda(Array.isArray(data) ? data : []);
      setMostrado(true);
    } catch { setDemanda([]); } finally { setCargando(false); }
  };

  const marcarAtendida = async (busqueda: string) => {
    try {
      const params = new URLSearchParams();
      params.append('busqueda', busqueda);
      params.append('fecha_desde', fechaDesde);
      params.append('fecha_hasta', fechaHasta);
      await fetch(`${API}/api/demanda/${mayorista.id}/atender`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ busqueda })
      });
      setDemanda(prev => prev.filter(d => d.busqueda !== busqueda));
    } catch {}
  };

  const borrarTodo = async () => {
    if (!window.confirm('¿Borrar todos los registros de demanda no satisfecha?')) return;
    setBorrando(true);
    try {
      await fetch(`${API}/api/demanda/${mayorista.id}`, { method: 'DELETE' });
      setDemanda([]);
    } catch {} finally { setBorrando(false); }
  };

  const imprimir = () => {
    const ventana = window.open('', '_blank');
    if (!ventana) return;
    const totalBusquedas = demanda.reduce((acc, d) => acc + Number(d.veces), 0);
    const clientesUnicos = demanda.flatMap(d => d.clientes || []).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).length;
    const filas = demanda.map(d => `
      <tr>
        <td style="font-weight:bold">${d.busqueda}</td>
        <td style="text-align:center">${d.veces}</td>
        <td>${new Date(d.ultima_vez).toLocaleDateString('es-AR')}</td>
        <td>${(d.clientes || []).filter(Boolean).join(', ')}</td>
      </tr>
    `).join('');
    ventana.document.write(`
      <html><head><title>Demanda No Satisfecha</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
        .membrete { font-size: 16px; font-weight: bold; color: #0D2B6B; margin-bottom: 2px; }
        .sistema { font-size: 11px; color: #888; margin-bottom: 12px; }
        h2 { color: #1d4ed8; margin-bottom: 4px; }
        .periodo { font-size: 11px; color: #888; margin-bottom: 8px; }
        .resumen { display: flex; gap: 24px; margin-bottom: 16px; }
        .resumen-item { background: #f0f9ff; border: 1px solid #bae6fd; padding: 8px 16px; border-radius: 8px; }
        .resumen-num { font-size: 20px; font-weight: bold; color: #0369a1; }
        .resumen-label { font-size: 10px; color: #64748b; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { background: #1d4ed8; color: white; padding: 8px; text-align: left; font-size: 11px; }
        td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
        tr:nth-child(even) { background: #f9fafb; }
      </style></head>
      <body>
        <div class="membrete">${mayorista.nombre || 'Gestión Integral Pedidos'}</div>
        <div class="sistema">Gestión Integral Pedidos</div>
        <h2>📊 Demanda No Satisfecha</h2>
        <div class="periodo">Período: ${fechaDesde} al ${fechaHasta} · Emitido: ${new Date().toLocaleDateString('es-AR')}</div>
        <div class="resumen">
          <div class="resumen-item"><div class="resumen-num">${demanda.length}</div><div class="resumen-label">Búsquedas distintas</div></div>
          <div class="resumen-item"><div class="resumen-num">${totalBusquedas}</div><div class="resumen-label">Total búsquedas</div></div>
          <div class="resumen-item"><div class="resumen-num">${clientesUnicos}</div><div class="resumen-label">Clientes</div></div>
        </div>
        <table>
          <thead><tr>
            <th>Búsqueda</th>
            <th style="text-align:center">Veces</th>
            <th>Última vez</th>
            <th>Clientes</th>
          </tr></thead>
          <tbody>${filas}</tbody>
        </table>
        <script>window.print(); window.close();</script>
      </body></html>
    `);
    ventana.document.close();
  };

  const totalBusquedas = demanda.reduce((acc, d) => acc + Number(d.veces), 0);
 const clientesUnicos = demanda.flatMap(d => d.clientes || []).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">📊 Demanda No Satisfecha</h2>
        <div className="flex gap-2">
          {demanda.length > 0 && (
            <button onClick={imprimir}
              className="text-sm bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium">
              🖨️ Imprimir
            </button>
          )}
          {demanda.length > 0 && (
            <button onClick={borrarTodo} disabled={borrando}
              className="text-sm bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50">
              🗑️ Limpiar todo
            </button>
          )}
        </div>
      </div>

      {/* FILTROS */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Desde</label>
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Hasta</label>
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-gray-500 block mb-1">Filtrar por texto (opcional)</label>
            <input type="text" value={busquedaFiltro} onChange={e => setBusquedaFiltro(e.target.value)}
              placeholder="Ej: caño, llave..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button onClick={cargar} disabled={cargando}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
            {cargando ? 'Cargando...' : '🔍 Mostrar'}
          </button>
        </div>
      </div>

      {/* RESUMEN */}
      {mostrado && demanda.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-white rounded-xl shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{demanda.length}</p>
            <p className="text-xs text-gray-500 mt-1">Búsquedas distintas</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-orange-500">{totalBusquedas}</p>
            <p className="text-xs text-gray-500 mt-1">Total búsquedas</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">{clientesUnicos}</p>
            <p className="text-xs text-gray-500 mt-1">Clientes distintos</p>
          </div>
        </div>
      )}

      {/* RESULTADOS */}
      {!mostrado ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-6xl mb-4">📊</div>
          <p className="text-lg">Seleccioná un rango de fechas y apretá Mostrar</p>
        </div>
      ) : cargando ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : demanda.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">No hay búsquedas sin resultado en ese período</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <span className="text-xs text-gray-500">{demanda.length} búsquedas distintas — ordenadas por frecuencia</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-600 text-white">
                  <th className="px-4 py-3 text-left font-medium">Búsqueda</th>
                  <th className="px-4 py-3 text-center font-medium">Veces</th>
                  <th className="px-4 py-3 text-left font-medium">Última vez</th>
                  <th className="px-4 py-3 text-left font-medium">Clientes</th>
                  <th className="px-4 py-3 text-center font-medium">Acción</th>
                </tr>
              </thead>
              <tbody>
                {demanda.map((d, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 font-semibold text-gray-800">{d.busqueda}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                        d.veces >= 5 ? 'bg-red-100 text-red-700' :
                        d.veces >= 3 ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{d.veces}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(d.ultima_vez).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {(d.clientes || []).filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => marcarAtendida(d.busqueda)}
                        className="text-xs bg-green-100 hover:bg-green-200 text-green-700 px-2 py-1 rounded-lg font-medium">
                        ✓ Atendida
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default DemandaNoSatisfecha;