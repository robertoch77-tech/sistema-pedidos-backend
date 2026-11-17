const { createHash, randomUUID } = require('node:crypto');

function registroProducto(tipo, origen, id = randomUUID()) {
  return { tipo, origen, id };
}

function fijarRegistro(client, registro) {
  return client.query("SELECT set_config('roberto.registro_producto', $1, true)", [JSON.stringify(registro)]);
}

async function escribirProducto(pool, registro, sql, params) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await fijarRegistro(client, registro);
    const respuesta = await client.query(sql, params);
    await client.query('COMMIT');
    return respuesta;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function guardarEvidencia(client, { clienteId, operacionId, archivo, nombre, vistaPrevia }) {
  const huella = createHash('sha256').update(archivo).digest('hex');
  await client.query(
    'INSERT INTO roberto_archivos_importacion (cliente_id,huella,contenido) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
    [clienteId, huella, archivo]
  );
  await client.query(
    `INSERT INTO roberto_importacion_evidencia
       (cliente_id,operacion_id,huella,nombre_archivo,vista_previa) VALUES ($1,$2,$3,$4,$5)`,
    [clienteId, operacionId, huella, nombre, vistaPrevia]
  );
}

module.exports = { registroProducto, fijarRegistro, escribirProducto, guardarEvidencia };
