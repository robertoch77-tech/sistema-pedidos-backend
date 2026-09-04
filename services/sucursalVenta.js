const { fallo } = require('./cuentaCorrienteVentas');

// La sucursal pertenece al negocio. Nunca se usa cliente_id como sucursal_id.
// El llamador mantiene una transacción y el bloqueo de operaciones del negocio.
async function resolverSucursalVenta(client, clienteId, sucursalId = null, { historica = false } = {}) {
  if (sucursalId != null) {
    if (!/^\d+$/.test(String(sucursalId)) || BigInt(sucursalId) <= 0n) throw fallo('La sucursal indicada no es válida.');
    const r = await client.query(
      `SELECT id FROM clientes_roberto_sucursales WHERE id=$1 AND cliente_id=$2
       AND (activo=true OR $3::boolean) FOR SHARE`, [sucursalId, clienteId, historica]);
    if (!r.rows[0]) throw fallo('La sucursal no pertenece al negocio o está inactiva. No se guardó la operación.');
    return r.rows[0].id;
  }
  const r = await client.query(
    `SELECT id, es_principal, activo FROM clientes_roberto_sucursales
     WHERE cliente_id=$1 ORDER BY id FOR SHARE`, [clienteId]);
  const activas = r.rows.filter(s => s.activo === true);
  const principales = activas.filter(s => s.es_principal === true);
  if (principales.length === 1) return principales[0].id;
  if (activas.length === 1) return activas[0].id;
  if (r.rows.length) throw fallo('Hay sucursales sin una principal activa única. Revisá la sucursal del negocio; no se modificó venta ni stock.', 409);
  // Negocio sin sucursales: alta real, con ID generado por PostgreSQL, en la
  // misma transacción de la venta. Un error posterior revierte también el alta.
  const creada = await client.query(
    `INSERT INTO clientes_roberto_sucursales (cliente_id,nombre,es_principal,activo)
     VALUES($1,'Principal',true,true) RETURNING id`, [clienteId]);
  return creada.rows[0].id;
}
module.exports = { resolverSucursalVenta };
