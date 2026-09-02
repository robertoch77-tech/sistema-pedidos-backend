const assert = require('assert');

function respuestaMock() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function cargarRouter(pool) {
  const dbPath = require.resolve('../db');
  const authPath = require.resolve('../routes/superadmin/authMiddleware');
  const routePath = require.resolve('../routes/superadmin/notas');
  delete require.cache[routePath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: {
      verificarCualquierToken: (_req, _res, next) => next(),
      verificarClienteId: (_req, _res, next) => next(),
    },
  };
  return require(routePath);
}

function handler(router) {
  const layer = router.stack.find(l =>
    l.route && l.route.path === '/:cliente_id/:tipo_nota/:id/anular' && l.route.methods.put
  );
  if (!layer) throw new Error('Ruta de anulación no encontrada');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

async function ejecutarAnulacion(nota) {
  const llamadas = [];
  const client = {
    async query(sql, params) {
      const q = String(sql);
      llamadas.push({ q, params });
      if (q.includes('SELECT * FROM notas_credito') && q.includes('FOR UPDATE')) {
        return { rows: nota ? [nota] : [] };
      }
      if (q.includes('SELECT id, saldo FROM cuentas_corrientes_clientes')) {
        return { rows: [{ id: 77, saldo: '1000.0000' }] };
      }
      if (q.includes('UPDATE cuentas_corrientes_clientes')) return { rows: [], rowCount: 1 };
      if (q.includes('INSERT INTO movimientos_cuentas_corrientes')) return { rows: [], rowCount: 1 };
      if (q.includes('UPDATE notas_credito')) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release() { llamadas.push({ q: 'RELEASE' }); },
  };
  const pool = {
    query: async () => ({ rows: [], rowCount: 0 }),
    connect: async () => client,
  };
  const router = cargarRouter(pool);
  const req = {
    params: { cliente_id: '12', tipo_nota: 'credito', id: '44' },
    body: { motivo_anulacion: 'Carga equivocada' },
  };
  const res = respuestaMock();
  await handler(router)(req, res);
  return { res, llamadas };
}

async function main() {
  const nota = {
    id: 44,
    anulada: false,
    tipo: 'emitida',
    afecta_cuenta_corriente: true,
    afecta_stock: false,
    comprador_cuit: '30-12345678-9',
    comprador_nombre: 'Cliente Uno',
    numero_completo: 'NC-000044',
    total: '250.0000',
  };

  const ok = await ejecutarAnulacion(nota);
  assert.strictEqual(ok.res.statusCode, 200);
  assert.deepStrictEqual(ok.res.body, { ok: true });
  const actualizarCuenta = ok.llamadas.find(c => c.q.includes('UPDATE cuentas_corrientes_clientes'));
  assert(actualizarCuenta, 'Debe actualizar la cuenta identificada');
  assert(actualizarCuenta.q.includes('WHERE id = $2 AND cliente_id = $3'));
  assert.deepStrictEqual(actualizarCuenta.params, ['1250.0000', 77, '12']);
  assert(!ok.llamadas.some(c => c.q.includes('WHERE cliente_id = $2')),
    'No debe actualizar todas las cuentas del cliente');
  assert(ok.llamadas.some(c => c.q === 'COMMIT'));
  assert(ok.llamadas.some(c => c.q === 'RELEASE'));

  const repetida = await ejecutarAnulacion({ ...nota, anulada: true });
  assert.strictEqual(repetida.res.statusCode, 409);
  assert(!repetida.llamadas.some(c => c.q.includes('UPDATE cuentas_corrientes_clientes')));
  assert(!repetida.llamadas.some(c => c.q.includes('UPDATE notas_credito')));
  assert(repetida.llamadas.some(c => c.q === 'ROLLBACK'));
  assert(repetida.llamadas.some(c => c.q === 'RELEASE'));

  console.log('notas-anulacion-segura: 2 escenarios OK');
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
