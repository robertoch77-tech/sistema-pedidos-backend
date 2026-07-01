import React, { useState, useEffect } from 'react';

const API = 'https://sistema-pedidos-backend-2hec.onrender.com';

interface Cliente {
  id_cliente: number;
  doc_cliente: string;       // CUIT
  nom_fan_cliente: string;   // nombre fantasía
  raz_soc_cliente: string;   // razón social
  es_activo: boolean;
}

interface Resultado {
  clientes: Cliente[];
  total: number;
  pagina: number;
  totalPaginas: number;
}

function arreglarNombre(texto?: string): string {
  if (!texto) return '';
  return texto.replace(/\uFFFD/g, 'Ñ');
}

function Clientes() {
  const mayorista = JSON.parse(localStorage.getItem('mayorista') || '{}');
  const [busqueda, setBusqueda] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [cargando, setCargando] = useState(false);
  const [paginaActual, setPaginaActual] = useState(1);
  const [resetStates, setResetStates] = useState<Record<string, string>>({});

  // Búsqueda dinámica: debounce 400ms a partir de 3 caracteres
  useEffect(() => {
    if (busqueda.trim() === '') { setResultado(null); return; }
    if (busqueda.trim().length < 3) return;
    const timer = setTimeout(() => buscar(1), 400);
    return () => clearTimeout(timer);
  }, [busqueda]);

  const buscar = async (pagina = 1) => {
    setCargando(true);
    try {
      const params = new URLSearchParams({ pagina: String(pagina) });
      if (busqueda.trim()) params.set('busqueda', busqueda.trim());
      const res = await fetch(`${API}/api/clientes/${mayorista.id}?${params}`);
      const data = await res.json();
      setResultado(data);
      setPaginaActual(pagina);
    } catch (error) {
      console.error(error);
    } finally {
      setCargando(false);
    }
  };

  const resetearClave = async (cuit: string) => {
    setResetStates(prev => ({ ...prev, [cuit]: 'cargando' }));
    try {
      const res = await fetch(`${API}/api/mayoristas/${mayorista.id}/resetear-clave-cliente`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuit })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje);
      const estado = data.borradas > 0 ? 'ok' : 'sin_clave';
      setResetStates(prev => ({ ...prev, [cuit]: estado }));
    } catch {
      setResetStates(prev => ({ ...prev, [cuit]: 'error' }));
    } finally {
      setTimeout(() => {
        setResetStates(prev => { const n = { ...prev }; delete n[cuit]; return n; });
      }, 3000);
    }
  };

  const botonReset = (cuit: string) => {
    const estado = resetStates[cuit];
    if (estado === 'cargando') return <span className="text-xs text-gray-400">Reseteando...</span>;
    if (estado === 'ok') return <span className="text-xs text-green-600">✅ Reseteada</span>;
    if (estado === 'sin_clave') return <span className="text-xs text-gray-400">⚠️ Sin clave</span>;
    if (estado === 'error') return <span className="text-xs text-red-500">❌ Error</span>;
    return (
      <button
        onClick={() => resetearClave(cuit)}
        className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-700 px-2 py-1 rounded transition-colors"
      >
        🔑 Resetear clave
      </button>
    );
  };

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Clientes</h2>
      </div>

      {/* Búsqueda */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Buscar por CUIT, nombre o razón social (3 letras para buscar solo)..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && buscar(1)}
          className="flex-1 sm:max-w-lg border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => buscar(1)}
          disabled={cargando}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {cargando ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {/* Estado inicial */}
      {!resultado && !cargando && (
        <div className="text-center py-12 text-gray-400">
          Escribí 3 letras para buscar, o hacé clic en Buscar para ver todos
        </div>
      )}

      {cargando && (
        <div className="text-center py-12 text-gray-400">Buscando...</div>
      )}

      {resultado && !cargando && (
        <>
          <p className="text-sm text-gray-500 mb-3">
            {resultado.total.toLocaleString()} cliente{resultado.total !== 1 ? 's' : ''}
            {resultado.totalPaginas > 1 && ` · Página ${resultado.pagina} de ${resultado.totalPaginas}`}
          </p>

          {resultado.clientes.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No se encontraron clientes</div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">CUIT</th>
                    <th className="px-4 py-3 text-left">Nombre / Razón social</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                    <th className="px-4 py-3 text-center">Clave</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {resultado.clientes.map(c => (
                    <tr key={c.id_cliente} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-gray-500 whitespace-nowrap">
                        {c.doc_cliente}
                      </td>
                      <td className="px-4 py-3 text-gray-800">
                        {arreglarNombre(c.nom_fan_cliente || c.raz_soc_cliente)}
                        {c.nom_fan_cliente && c.raz_soc_cliente && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {arreglarNombre(c.raz_soc_cliente)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          c.es_activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {c.es_activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {botonReset(c.doc_cliente)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {resultado.totalPaginas > 1 && (
            <div className="flex justify-center items-center gap-2 mt-4">
              <button
                onClick={() => buscar(paginaActual - 1)}
                disabled={paginaActual === 1}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                ← Anterior
              </button>
              <span className="px-4 py-2 text-sm text-gray-600">
                {paginaActual} / {resultado.totalPaginas}
              </span>
              <button
                onClick={() => buscar(paginaActual + 1)}
                disabled={paginaActual === resultado.totalPaginas}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Clientes;