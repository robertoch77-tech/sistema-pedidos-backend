import React, { useState } from 'react';
import * as XLSX from 'xlsx';

const API = 'https://sistema-pedidos-backend-2hec.onrender.com';

type TipoTab = 'no_encontrado' | 'removido_carrito' | 'visto_no_comprado' | 'resumen';

interface Demanda {
  busqueda: string;
  tipo: string;
  veces: number;
  ultima_vez: string;
  clientes: string[];
}

type SortKey = 'busqueda' | 'veces' | 'ultima_vez';
type SortDir = 'asc' | 'desc';

const TABS: { id: TipoTab; label: string; color: string; activeBg: string; activeText: string }[] = [
  { id: 'no_encontrado',     label: '🔍 No encontrados',      color: 'border-blue-500',   activeBg: 'bg-blue-500',   activeText: 'text-white' },
  { id: 'removido_carrito',  label: '🛒 Removidos del carrito', color: 'border-orange-500', activeBg: 'bg-orange-500', activeText: 'text-white' },
  { id: 'visto_no_comprado', label: '👁️ Vistos sin comprar',   color: 'border-purple-500', activeBg: 'bg-purple-500', activeText: 'text-white' },
  { id: 'resumen',           label: '📊 Resumen',              color: 'border-gray-500',   activeBg: 'bg-gray-700',   activeText: 'text-white' },
];

function ClientesCelda({ clientes }: { clientes: string[] }) {
  const [expandido, setExpandido] = useState(false);
  const lista = (clientes || []).filter(Boolean);
  if (lista.length === 0) return <span className="text-gray-400">—</span>;
  if (lista.length <= 2 || expandido) return (
    <span>
      {lista.join(', ')}
      {lista.length > 2 && (
        <button onClick={() => setExpandido(false)} className="ml-1 text-blue-500 text-xs underline">menos</button>
      )}
    </span>
  );
  return (
    <span>
      {lista.slice(0, 2).join(', ')}
      <button onClick={() => setExpandido(true)} className="ml-1 text-blue-500 text-xs underline">+{lista.length - 2} más</button>
    </span>
  );
}

function TablaFilas({
  filas,
  maxVeces,
  onAtendida,
}: {
  filas: Demanda[];
  maxVeces: number;
  onAtendida: (busqueda: string, tipo: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('veces');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = [...filas].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'veces') cmp = a.veces - b.veces;
    else if (sortKey === 'busqueda') cmp = a.busqueda.localeCompare(b.busqueda);
    else cmp = new Date(a.ultima_vez).getTime() - new Date(b.ultima_vez).getTime();
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const SortBtn = ({ col, label }: { col: SortKey; label: string }) => (
    <th
      className="px-4 py-3 text-left font-medium cursor-pointer select-none hover:bg-blue-700 transition-colors"
      onClick={() => toggleSort(col)}
    >
      {label} {sortKey === col ? (sortDir === 'asc' ? '▲' : '▼') : <span className="opacity-40">↕</span>}
    </th>
  );

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-blue-600 text-white text-xs">
              <SortBtn col="busqueda" label="Búsqueda" />
              <SortBtn col="veces" label="Veces" />
              <SortBtn col="ultima_vez" label="Última vez" />
              <th className="px-4 py-3 text-left font-medium">Clientes</th>
              <th className="px-4 py-3 text-center font-medium">Acción</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((d, idx) => {
              const esMayor = d.veces === maxVeces && maxVeces > 0;
              const pct = maxVeces > 0 ? Math.round((d.veces / maxVeces) * 100) : 0;
              const badgeColor =
                pct >= 80 ? 'bg-red-100 text-red-700' :
                pct >= 50 ? 'bg-orange-100 text-orange-700' :
                'bg-gray-100 text-gray-600';

              return (
                <tr key={idx}
                  className={`${esMayor ? 'bg-yellow-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} transition-colors`}
                >
                  <td className={`px-4 py-3 font-semibold text-gray-800 ${esMayor ? 'text-yellow-700' : ''}`}>
                    {esMayor && <span className="mr-1">⭐</span>}
                    {d.busqueda}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${badgeColor}`}>{d.veces}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(d.ultima_vez).toLocaleDateString('es-AR')}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs max-w-[200px]">
                    <ClientesCelda clientes={d.clientes} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => onAtendida(d.busqueda, d.tipo)}
                      className="text-xs bg-green-100 hover:bg-green-200 text-green-700 px-2 py-1 rounded-lg font-medium"
                    >
                      ✓ Atendida
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
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
  const [tabActiva, setTabActiva] = useState<TipoTab>('no_encontrado');

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

  const marcarAtendida = async (busqueda: string, tipo: string) => {
    try {
      await fetch(`${API}/api/demanda/${mayorista.id}/atender`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ busqueda })
      });
      setDemanda(prev => prev.filter(d => !(d.busqueda === busqueda && d.tipo === tipo)));
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
    const datos = tabActiva === 'resumen' ? demanda : demanda.filter(d => d.tipo === tabActiva);
    const totalBusquedas = datos.reduce((acc, d) => acc + Number(d.veces), 0);
    const clientesUnicos = datos.flatMap(d => d.clientes || []).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).length;
    const filas = datos.map(d => `
      <tr>
        <td style="font-weight:bold">${d.busqueda}</td>
        <td style="text-align:center">${d.tipo}</td>
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
          <div class="resumen-item"><div class="resumen-num">${datos.length}</div><div class="resumen-label">Búsquedas distintas</div></div>
          <div class="resumen-item"><div class="resumen-num">${totalBusquedas}</div><div class="resumen-label">Total búsquedas</div></div>
          <div class="resumen-item"><div class="resumen-num">${clientesUnicos}</div><div class="resumen-label">Clientes</div></div>
        </div>
        <table>
          <thead><tr>
            <th>Búsqueda</th>
            <th style="text-align:center">Tipo</th>
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

  const exportarExcel = () => {
    const datos = tabActiva === 'resumen' ? demanda : demanda.filter(d => d.tipo === tabActiva);
    const filas = datos.map(d => ({
      Búsqueda: d.busqueda,
      Tipo: d.tipo,
      Veces: d.veces,
      'Última vez': new Date(d.ultima_vez).toLocaleDateString('es-AR'),
      Clientes: (d.clientes || []).filter(Boolean).join(', '),
    }));
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Demanda');
    XLSX.writeFile(wb, `demanda-${tabActiva}-${fechaDesde}-${fechaHasta}.xlsx`);
  };

  // Datos filtrados por tab
  const filasTab = (tipo: TipoTab) =>
    tipo === 'resumen' ? demanda : demanda.filter(d => d.tipo === tipo);

  const totalBusquedas = demanda.reduce((acc, d) => acc + Number(d.veces), 0);
  const clientesUnicos = demanda.flatMap(d => d.clientes || []).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).length;

  const conteo = {
    no_encontrado:     demanda.filter(d => d.tipo === 'no_encontrado').reduce((a, d) => a + d.veces, 0),
    removido_carrito:  demanda.filter(d => d.tipo === 'removido_carrito').reduce((a, d) => a + d.veces, 0),
    visto_no_comprado: demanda.filter(d => d.tipo === 'visto_no_comprado').reduce((a, d) => a + d.veces, 0),
  };
  const tipoMayor = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

  const filasActivas = filasTab(tabActiva);
  const maxVecesActiva = Math.max(0, ...filasActivas.map(d => d.veces));

  return (
    <div className="p-6">
      {/* ENCABEZADO */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">📊 Demanda No Satisfecha</h2>
        <div className="flex gap-2">
          {mostrado && demanda.length > 0 && (
            <button onClick={exportarExcel}
              className="text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium">
              ⬇ Excel
            </button>
          )}
          {mostrado && demanda.length > 0 && (
            <button onClick={imprimir}
              className="text-sm bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium">
              🖨️ Imprimir
            </button>
          )}
          {mostrado && demanda.length > 0 && (
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

      {/* RESUMEN CARDS */}
      {mostrado && demanda.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <div className="bg-white rounded-xl shadow-sm p-4 text-center col-span-1">
            <p className="text-2xl font-bold text-blue-600">{demanda.length}</p>
            <p className="text-xs text-gray-500 mt-1">Búsquedas distintas</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center col-span-1">
            <p className="text-2xl font-bold text-orange-500">{totalBusquedas}</p>
            <p className="text-xs text-gray-500 mt-1">Total registros</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center col-span-1">
            <p className="text-2xl font-bold text-purple-600">{clientesUnicos}</p>
            <p className="text-xs text-gray-500 mt-1">Clientes distintos</p>
          </div>
          <div className={`bg-white rounded-xl shadow-sm p-4 text-center col-span-1 ${tipoMayor === 'no_encontrado' ? 'ring-2 ring-blue-400' : ''}`}>
            <p className="text-2xl font-bold text-blue-500">{conteo.no_encontrado}</p>
            <p className="text-xs text-gray-500 mt-1">🔍 No encontrados</p>
          </div>
          <div className={`bg-white rounded-xl shadow-sm p-4 text-center col-span-1 ${tipoMayor === 'removido_carrito' ? 'ring-2 ring-orange-400' : ''}`}>
            <p className="text-2xl font-bold text-orange-500">{conteo.removido_carrito}</p>
            <p className="text-xs text-gray-500 mt-1">🛒 Removidos</p>
          </div>
          <div className={`bg-white rounded-xl shadow-sm p-4 text-center col-span-1 ${tipoMayor === 'visto_no_comprado' ? 'ring-2 ring-purple-400' : ''}`}>
            <p className="text-2xl font-bold text-purple-500">{conteo.visto_no_comprado}</p>
            <p className="text-xs text-gray-500 mt-1">👁️ Vistos</p>
          </div>
        </div>
      )}

      {/* ESTADO VACÍO INICIAL */}
      {!mostrado ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-6xl mb-4">📊</div>
          <p className="text-lg">Seleccioná un rango de fechas y apretá Mostrar</p>
        </div>
      ) : cargando ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : demanda.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">No hay registros en ese período</p>
        </div>
      ) : (
        <>
          {/* TABS */}
          <div className="flex gap-1 mb-4 flex-wrap">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setTabActiva(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors border-2 ${
                  tabActiva === tab.id
                    ? `${tab.activeBg} ${tab.activeText} ${tab.color}`
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}>
                {tab.label}
                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${tabActiva === tab.id ? 'bg-white bg-opacity-30' : 'bg-gray-100'}`}>
                  {filasTab(tab.id).length}
                </span>
              </button>
            ))}
          </div>

          {/* CONTENIDO TAB */}
          {filasActivas.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>No hay registros de este tipo en el período seleccionado</p>
            </div>
          ) : (
            <>
              <div className="px-1 pb-2 text-xs text-gray-400">
                {filasActivas.length} búsquedas distintas — ordená haciendo click en los encabezados
              </div>
              <TablaFilas
                filas={filasActivas}
                maxVeces={maxVecesActiva}
                onAtendida={marcarAtendida}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

export default DemandaNoSatisfecha;
