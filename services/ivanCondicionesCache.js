'use strict';

// Solo datos de condiciones, nunca precios ni autorización. La conexión forma
// parte de la identidad: reemplazar un pool invalida sus lecturas automáticamente.
function crearCache({ ahora = Date.now, duracion = 30000, maxClientes = 100, maxReglas = 100000 } = {}) {
  const conexiones = new WeakMap();
  return async function obtener(db, clave, cargar, refrescar = false) {
    let entradas = conexiones.get(db);
    if (!entradas) { entradas = new Map(); conexiones.set(db, entradas); }
    for (const [k, entrada] of entradas) {
      if (!entrada.pendiente && ahora() >= entrada.vence) entradas.delete(k);
    }
    const previa = entradas.get(clave);
    if (!refrescar && previa) {
      entradas.delete(clave); entradas.set(clave, previa);
      return previa.pendiente || previa.valor;
    }
    entradas.delete(clave);
    const entrada = { pendiente: null, valor: null, vence: 0, peso: 0 };
    entradas.set(clave, entrada);
    while (entradas.size > maxClientes) entradas.delete(entradas.keys().next().value);
    entrada.pendiente = Promise.resolve().then(cargar).then(valor => {
      entrada.valor = valor;
      entrada.peso = valor.reglas?.length || 0;
      entrada.vence = ahora() + duracion;
      entrada.pendiente = null;
      if (entradas.get(clave) === entrada) {
        let peso = [...entradas.values()].reduce((n, e) => n + e.peso, 0);
        while (peso > maxReglas && entradas.size) {
          const k = entradas.keys().next().value;
          peso -= entradas.get(k).peso; entradas.delete(k);
        }
      }
      return valor;
    }, error => {
      if (entradas.get(clave) === entrada) entradas.delete(clave);
      throw error;
    });
    return entrada.pendiente;
  };
}

module.exports = { crearCache };
