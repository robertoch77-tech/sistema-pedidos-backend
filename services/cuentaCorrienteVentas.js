// Cuenta corriente: identidad persistente, sin cambios en precios ni IVA.
// Todas las llamadas reciben la transacción del documento que las origina.
const { createHash } = require('node:crypto');
function huellaOperacion(datos) {
  const ordenar = v => Array.isArray(v) ? v.map(ordenar)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, ordenar(v[k])])) : v;
  return createHash('sha256').update(JSON.stringify(ordenar(datos))).digest('hex');
}
function fallo(mensaje, statusCode = 400) {
  return Object.assign(new Error(mensaje), { statusCode });
}

async function bloquearCuenta(client, clienteId, cuentaId) {
  if (!Number.isSafeInteger(Number(cuentaId)) || Number(cuentaId) <= 0) {
    throw fallo('Elegí una cuenta corriente válida.');
  }
  const r = await client.query(
    `SELECT id, saldo, comprador_nombre FROM cuentas_corrientes_clientes
     WHERE id=$1 AND cliente_id=$2 AND activo=true FOR UPDATE`, [cuentaId, clienteId]);
  if (!r.rows[0]) throw fallo('La cuenta no existe, está inactiva o pertenece a otro negocio.');
  return r.rows[0];
}

async function resolverCuentaVenta(client, clienteId, body) {
  // Un ID recibido inválido nunca se reemplaza por una búsqueda por nombre.
  if (body.cuenta_corriente_cliente_id != null) {
    return bloquearCuenta(client, clienteId, body.cuenta_corriente_cliente_id);
  }
  const nombre = String(body.comprador_nombre || '').trim();
  if (!nombre) throw fallo('Ingresá el nombre de quien queda debiendo.');
  if (body.crear_cuenta_corriente !== true) {
    throw fallo('Elegí una cuenta existente o confirmá crear una nueva para este cliente.');
  }
  const r = await client.query(
    `INSERT INTO cuentas_corrientes_clientes
       (cliente_id, comprador_nombre, comprador_cuit, comprador_telefono,
        comprador_email, comprador_direccion, comprador_ciudad, saldo, activo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,0,true) RETURNING id, saldo, comprador_nombre`,
    [clienteId, nombre, body.comprador_cuit || '', body.comprador_telefono || '',
      body.comprador_email || '', body.comprador_direccion || '', body.comprador_ciudad || '']);
  return r.rows[0];
}

async function cuentaDeVenta(client, clienteId, ventaId) {
  const r = await client.query(
    `SELECT DISTINCT cuenta_corriente_id FROM movimientos_cuentas_corrientes
     WHERE cliente_id=$1 AND venta_id=$2 AND tipo='venta'`, [clienteId, ventaId]);
  if (r.rows.length !== 1) {
    throw fallo('No se puede identificar con certeza la cuenta de esta venta. Revisá sus movimientos; no se cobró nada.', 409);
  }
  return r.rows[0].cuenta_corriente_id;
}

// Un solo bloqueo por negocio coordina ventas CC y cobros de ambos módulos.
async function bloquearOperacion(client, clienteId) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('roberto-cc'), hashtext($1))", [String(clienteId)]);
}

module.exports = { fallo, bloquearCuenta, resolverCuentaVenta, cuentaDeVenta, bloquearOperacion, huellaOperacion };
