import React, { useState, useEffect } from 'react';

const API = 'https://sistema-pedidos-backend-2hec.onrender.com';

function Configuracion() {
  const mayorista = JSON.parse(localStorage.getItem('mayorista') || '{}');
  const [configHabilitada, setConfigHabilitada] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [cuitReset, setCuitReset] = useState('');
  const [reseteando, setReseteando] = useState(false);
  const [msgReset, setMsgReset] = useState('');
  const [claveActual, setClaveActual] = useState('');
  const [claveNueva, setClaveNueva] = useState('');
  const [claveNueva2, setClaveNueva2] = useState('');
  const [cambiandoPassword, setCambiandoPassword] = useState(false);
  const [msgPassword, setMsgPassword] = useState('');

  const [config, setConfig] = useState({
    mostrar_precios: true, mostrar_stock: true,
    mostrar_marca: true, mostrar_rubro: true, mostrar_tipo: true,
    pedir_clave: false,
    tamanio_hoja: 'A4', items_por_hoja: 30, numero_pedido_inicio: 1,
    orden_pdf: 'codigo',
    habilitar_calculadora: false, descuento_1: 0, descuento_2: 0, descuento_3: 0, iva: 21,
    habilitar_ctas_ctes: false,
  });

  useEffect(() => {
    fetch(`${API}/api/mayoristas/${mayorista.id}/configuracion`)
      .then(r => r.json())
      .then(data => {
        setConfigHabilitada(data.config_habilitada ?? false);
        setConfig({
          mostrar_precios: data.mostrar_precios ?? true,
          mostrar_stock: data.mostrar_stock ?? true,
          mostrar_marca: data.mostrar_marca ?? true,
          mostrar_rubro: data.mostrar_rubro ?? true,
          mostrar_tipo: data.mostrar_tipo ?? true,
          pedir_clave: data.pedir_clave ?? false,
          tamanio_hoja: data.tamanio_hoja || 'A4',
          items_por_hoja: Math.max(30, data.items_por_hoja || 30),
          numero_pedido_inicio: data.numero_pedido_inicio || 1,
          orden_pdf: data.orden_pdf || 'codigo',
          habilitar_calculadora: data.habilitar_calculadora ?? false,
          descuento_1: data.descuento_1 || 0,
          descuento_2: data.descuento_2 || 0,
          descuento_3: data.descuento_3 || 0,
          iva: data.iva ?? 21,
          habilitar_ctas_ctes: data.habilitar_ctas_ctes ?? false,
        });
      })
      .catch(() => {});
  }, []);

  const guardar = async () => {
    setGuardando(true);
    try {
      const res = await fetch(`${API}/api/mayoristas/${mayorista.id}/configuracion`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config)
      });
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      localStorage.setItem('mayorista', JSON.stringify({ ...mayorista, ...data }));
      setGuardado(true); setTimeout(() => setGuardado(false), 3000);
    } catch { alert('Error al guardar'); } finally { setGuardando(false); }
  };

  const resetearClave = async () => {
    setReseteando(true); setMsgReset('');
    try {
      const res = await fetch(`${API}/api/mayoristas/${mayorista.id}/resetear-clave-cliente`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cuit: cuitReset })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'Error');
      setMsgReset(data.borradas > 0
        ? '✅ Clave reseteada. El cliente creará una nueva la próxima vez que entre.'
        : '⚠️ Ese CUIT no tenía clave guardada.');
      if (data.borradas > 0) setCuitReset('');
    } catch (e: any) { setMsgReset('Error: ' + e.message); } finally { setReseteando(false); }
  };

  const cambiarPassword = async () => {
    if (claveNueva.length < 4) { setMsgPassword('❌ La clave nueva debe tener al menos 4 caracteres.'); return; }
    if (claveNueva !== claveNueva2) { setMsgPassword('❌ Las claves nuevas no coinciden.'); return; }
    setCambiandoPassword(true); setMsgPassword('');
    try {
      const res = await fetch(`${API}/api/auth/cambiar-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: mayorista.id, clave_actual: claveActual, clave_nueva: claveNueva })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'Error');
      setMsgPassword('✅ Contraseña actualizada correctamente.');
      setClaveActual(''); setClaveNueva(''); setClaveNueva2('');
    } catch (e: any) { setMsgPassword('❌ ' + e.message); } finally { setCambiandoPassword(false); }
  };

  const Switch = ({ activo, onClick }: { activo: boolean; onClick: () => void }) => (
    <button onClick={onClick}
      className={`w-12 h-6 rounded-full transition-colors ${activo ? 'bg-blue-600' : 'bg-gray-300'}`}>
      <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${activo ? 'translate-x-6' : 'translate-x-0'}`} />
    </button>
  );

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-xl font-bold text-gray-800 mb-6">⚙️ Configuración</h2>

      <div className="mb-6">
        {!configHabilitada && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3 flex items-center gap-3">
            <span className="text-2xl">🔒</span>
            <div>
              <p className="font-semibold text-amber-800 text-sm">Configuración bloqueada</p>
              <p className="text-amber-700 text-xs">Contactá al administrador para habilitar el acceso y poder modificar estas opciones.</p>
            </div>
          </div>
        )}
        {(() => {
        return (
        <div className={`bg-white rounded-xl shadow-sm p-6 space-y-6 ${!configHabilitada ? 'opacity-50 pointer-events-none select-none' : ''}`}>
          <div className="flex items-center justify-between">
            <div><p className="font-medium text-gray-800">Mostrar precios a clientes</p>
            <p className="text-sm text-gray-500">Los clientes verán los precios y totales</p></div>
            <Switch activo={config.mostrar_precios} onClick={() => setConfig(prev => ({ ...prev, mostrar_precios: !prev.mostrar_precios }))} />
          </div>
          <div className="flex items-center justify-between">
            <div><p className="font-medium text-gray-800">Mostrar stock a clientes</p>
            <p className="text-sm text-gray-500">Los clientes verán la cantidad disponible</p></div>
            <Switch activo={config.mostrar_stock} onClick={() => setConfig(prev => ({ ...prev, mostrar_stock: !prev.mostrar_stock }))} />
          </div>
          <div className="flex items-center justify-between">
            <div><p className="font-medium text-gray-800">Mostrar filtro de marca</p></div>
            <Switch activo={config.mostrar_marca} onClick={() => setConfig(prev => ({ ...prev, mostrar_marca: !prev.mostrar_marca }))} />
          </div>
          <div className="flex items-center justify-between">
            <div><p className="font-medium text-gray-800">Mostrar filtro de rubro</p></div>
            <Switch activo={config.mostrar_rubro} onClick={() => setConfig(prev => ({ ...prev, mostrar_rubro: !prev.mostrar_rubro }))} />
          </div>
          <div className="flex items-center justify-between">
            <div><p className="font-medium text-gray-800">Mostrar filtro de tipo</p></div>
            <Switch activo={config.mostrar_tipo} onClick={() => setConfig(prev => ({ ...prev, mostrar_tipo: !prev.mostrar_tipo }))} />
          </div>
          <hr />
          <div className="flex items-center justify-between">
            <div><p className="font-medium text-gray-800">Pedir clave a los clientes</p>
            <p className="text-sm text-gray-500">El cliente entra con CUIT + clave</p></div>
            <Switch activo={config.pedir_clave} onClick={() => setConfig(prev => ({ ...prev, pedir_clave: !prev.pedir_clave }))} />
          </div>
          <hr />
          <div>
            <div className="flex items-center justify-between">
              <div><p className="font-medium text-gray-800">Calculadora de precios para reventa</p>
              <p className="text-sm text-gray-500">El cliente podrá calcular su precio de venta</p></div>
              <Switch activo={config.habilitar_calculadora} onClick={() => setConfig(prev => ({ ...prev, habilitar_calculadora: !prev.habilitar_calculadora }))} />
            </div>
            {config.habilitar_calculadora && (
              <div className="mt-4 bg-gray-50 rounded-lg p-4 space-y-4">
                <p className="text-xs text-gray-500 font-medium">Descuentos en cascada: precio → −D1 → −D2 → −D3 → +IVA</p>
                <div className="grid grid-cols-3 gap-3">
                  {[1,2,3].map(n => (
                    <div key={n}>
                      <p className="text-sm font-medium text-gray-700 mb-1">Descuento {n} (%)</p>
                      <input type="number" min="0" max="100"
                        value={(config as any)[`descuento_${n}`]}
                        onChange={e => setConfig(prev => ({ ...prev, [`descuento_${n}`]: parseFloat(e.target.value) || 0 }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">IVA (%)</p>
                  <input type="number" min="0" value={config.iva}
                    onChange={e => setConfig(prev => ({ ...prev, iva: parseFloat(e.target.value) || 0 }))}
                    className="w-32 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            )}
          </div>
          <hr />
          <div>
            <p className="font-medium text-gray-800 mb-2">Tamaño de hoja para PDF</p>
            <div className="flex gap-3">
              {['A4','A5'].map(tam => (
                <button key={tam} onClick={() => setConfig(prev => ({ ...prev, tamanio_hoja: tam }))}
                  className={`px-6 py-3 rounded-lg font-semibold border-2 transition-colors ${
                    config.tamanio_hoja === tam ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-600'
                  }`}>{tam}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="font-medium text-gray-800 mb-1">Ítems por hoja (mínimo 30)</p>
            <input type="number" min="30" max="50" value={config.items_por_hoja}
              onChange={e => setConfig(prev => ({ ...prev, items_por_hoja: parseInt(e.target.value) || 30 }))}
              className="w-32 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <p className="font-medium text-gray-800 mb-1">Orden de ítems en el PDF</p>
            <div className="flex gap-2">
              {[{value:'codigo',label:'# Por código'},{value:'descripcion',label:'A·Z Descripción'},{value:'rubro',label:'📦 Por rubro'}].map(op => (
                <button key={op.value} onClick={() => setConfig(prev => ({ ...prev, orden_pdf: op.value }))}
                  className={`flex-1 py-2 px-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                    config.orden_pdf === op.value ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-600'
                  }`}>{op.label}</button>
              ))}
            </div>
          </div>
          <hr />
          <div>
            <p className="font-medium text-gray-800 mb-1">Numeración de pedidos</p>
            <input type="number" min="1" value={config.numero_pedido_inicio}
              onChange={e => setConfig(prev => ({ ...prev, numero_pedido_inicio: parseInt(e.target.value) || 1 }))}
              className="w-32 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <hr />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-800">Mostrar cuenta corriente a clientes</p>
              <p className="text-sm text-gray-500">Los clientes podrán consultar e imprimir su cuenta corriente</p>
            </div>
            <Switch activo={config.habilitar_ctas_ctes} onClick={() => setConfig(prev => ({ ...prev, habilitar_ctas_ctes: !prev.habilitar_ctas_ctes }))} />
          </div>
          <button onClick={guardar} disabled={guardando}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-50">
            {guardando ? 'Guardando...' : guardado ? '✅ Guardado' : 'Guardar cambios'}
          </button>
        </div>
        );
        })()}
      </div>

      {/* RESETEAR CLAVE — siempre visible */}
      <div className="bg-white rounded-xl shadow-sm p-6 mt-6">
        <p className="font-medium text-gray-800 mb-1">Resetear clave de un cliente</p>
        <p className="text-sm text-gray-500 mb-3">Si un cliente olvidó su clave, ingresá su CUIT y reseteala.</p>
        <div className="flex gap-3">
          <input type="text" value={cuitReset} onChange={e => { setCuitReset(e.target.value); setMsgReset(''); }}
            placeholder="CUIT del cliente"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={resetearClave} disabled={reseteando || !cuitReset}
            className="bg-amber-500 hover:bg-amber-600 text-white px-5 py-2 rounded-lg font-semibold disabled:opacity-50">
            {reseteando ? 'Reseteando...' : 'Resetear'}
          </button>
        </div>
        {msgReset && <p className="text-sm mt-2 text-gray-700">{msgReset}</p>}
      </div>

      {/* CAMBIAR CONTRASEÑA — siempre visible */}
      <div className="bg-white rounded-xl shadow-sm p-6 mt-6">
        <p className="font-medium text-gray-800 mb-1">Cambiar contraseña</p>
        <p className="text-sm text-gray-500 mb-3">Para cambiar tu contraseña, ingresá la actual y elegí una nueva.</p>
        <div className="space-y-3">
          <input type="password" value={claveActual} onChange={e => { setClaveActual(e.target.value); setMsgPassword(''); }}
            placeholder="Contraseña actual"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="password" value={claveNueva} onChange={e => { setClaveNueva(e.target.value); setMsgPassword(''); }}
            placeholder="Nueva contraseña"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="password" value={claveNueva2} onChange={e => { setClaveNueva2(e.target.value); setMsgPassword(''); }}
            placeholder="Repetí la nueva contraseña"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={cambiarPassword} disabled={cambiandoPassword || !claveActual || !claveNueva || !claveNueva2}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-semibold disabled:opacity-50">
            {cambiandoPassword ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
          {msgPassword && <p className="text-sm text-gray-700">{msgPassword}</p>}
        </div>
      </div>
    </div>
  );
}

export default Configuracion;