const assert = require('node:assert/strict');
const Module = require('node:module');

const servicePath = require.resolve('../services/conexionMayorista');

const pools = [];

class PoolFalso {
  constructor(options) {
    this.options = options;
    this.endCalls = 0;
    pools.push(this);
  }

  on() {}

  async end() {
    this.endCalls += 1;
  }
}

const poolCentralFalso = {
  query: async (_sql, params) => ({
    rows: [{ id: Number(params[0]), db_connection: `postgresql://usuario:clave@host:5432/test_${params[0]}` }],
  }),
};

const cargarOriginal = Module._load;
Module._load = function cargarConMocks(request, parent, isMain) {
  if (request === 'pg') return { Pool: PoolFalso };
  if (request === '../db' && parent?.filename === servicePath) return poolCentralFalso;
  return cargarOriginal.call(this, request, parent, isMain);
};

delete require.cache[servicePath];
const { getConexionMayorista, invalidarConexion } = require(servicePath);
Module._load = cargarOriginal;

(async () => {
  const pool7Inicial = await getConexionMayorista(7);
  const pool7Reutilizado = await getConexionMayorista(7);
  assert.strictEqual(pool7Reutilizado, pool7Inicial, 'Debe reutilizar el pool cacheado');

  const pool8 = await getConexionMayorista(8);
  await invalidarConexion(7);
  assert.equal(pool7Inicial.endCalls, 1, 'Debe cerrar el pool invalidado');
  assert.equal(pool8.endCalls, 0, 'No debe cerrar el pool de otro mayorista');

  const pool7Nuevo = await getConexionMayorista(7);
  assert.notStrictEqual(pool7Nuevo, pool7Inicial, 'Debe crear un pool nuevo después de invalidar');
  assert.strictEqual(await getConexionMayorista(8), pool8, 'Otro mayorista debe conservar su pool');

  console.log('conexion-ivan-cache.test.js: OK — invalidación aislada verificada con Pool simulado');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
