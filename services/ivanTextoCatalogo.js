const { TextDecoder } = require('util');
const { leer } = require('./ivanFuncionesCatalogo');
const conexion = require('./conexionMayorista');

// La conexión existente se conserva. El contenido viaja como ASCII/base64 para
// que los bytes de letras y símbolos no se pierdan al decodificar la respuesta.
// Los campos originales siguen disponibles para equivalencias y otros flujos.
async function aplicarTextosCatalogo(productos, mayoristaId) {
  if (!productos.length) return productos;
  try {
    const config = await leer(mayoristaId);
    if (!config.catalogo_observaciones_destacadas) return productos;

    const ids = [...new Set(productos.map(p => String(p.id_producto)))];
    if (!ids.every(id => /^\d+$/.test(id))) return productos;
    const conObservaciones = productos.some(p => Object.prototype.hasOwnProperty.call(p, 'obs_producto'));
    const db = await conexion.getConexionMayorista(mayoristaId);
    if (!db) return productos;
    const resultado = await db.query(
      `SELECT id_producto,
              encode(convert_to(des_producto::text, 'UTF8'), 'base64') AS descripcion_b64
              ${conObservaciones ? ", encode(convert_to(obs_producto::text, 'UTF8'), 'base64') AS observaciones_b64" : ''}
       FROM "viewProductos" WHERE id_producto = ANY($1::bigint[])`,
      [ids]
    );
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const textos = new Map(resultado.rows.map(fila => [String(fila.id_producto), {
      ...(typeof fila.descripcion_b64 === 'string'
        ? { descripcion_catalogo: decoder.decode(Buffer.from(fila.descripcion_b64, 'base64')) } : {}),
      ...(typeof fila.observaciones_b64 === 'string'
        ? { observaciones_catalogo: decoder.decode(Buffer.from(fila.observaciones_b64, 'base64')) } : {}),
    }]));
    return productos.map(producto => ({ ...producto, ...textos.get(String(producto.id_producto)) }));
  } catch (error) {
    // Una presentación opcional no debe impedir consultar productos ni revelar
    // errores de conexión. Si el origen ya está dañado, no inventar caracteres.
    console.error('No se pudo recuperar el texto del catálogo:', /^[0-9A-Z]{5}$/.test(error.code || '') ? error.code : 'texto_no_disponible');
    return productos;
  }
}

module.exports = { aplicarTextosCatalogo };
