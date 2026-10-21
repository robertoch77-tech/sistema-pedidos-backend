'use strict';
const pool = require('../db');
const conexion = require('./conexionMayorista');
const servicio = require('./ivanDescuentosComerciales');
const reglas = require('./ivanDescuentosReglas');
const { idSeguro } = require('./ivanImagenesDatos');

async function buscarProductos(id, valor) {
  const q = String(valor || '').trim();
  if (q.length < 2 || q.length > 80) throw reglas.error('Buscá por código o descripción, entre 2 y 80 caracteres.');
  const db = await conexion.getConexionMayorista(id);
  if (!db) throw reglas.error('El catálogo de este mayorista no está disponible.', 503);
  const patron = '%' + q.replace(/[ñÑáéíóúÁÉÍÓÚ\uFFFD]/g, '_') + '%';
  const r = await db.query(`SELECT id_producto,cod_producto,des_producto FROM "viewProductos"
    WHERE cod_producto ILIKE $1 OR des_producto ILIKE $1 ORDER BY cod_producto,id_producto LIMIT 20`, [patron]);
  return { productos: r.rows };
}

async function consultar(id, datos) {
  const cfg = await servicio.leer(id);
  if (!cfg.disponible || !cfg.habilitado) throw reglas.error('El permiso de descuentos no está habilitado.', 403);
  if (!Number.isSafeInteger(datos?.version) || datos.version !== Number(cfg.version))
    throw reglas.error('Cambió la configuración guardada. Recargá Descuentos comerciales antes de consultar.', 409);
  const documento = reglas.cuit(datos.cuit);
  if (!/^\d{7,20}$/.test(documento)) throw reglas.error('Elegí un cliente válido de este mayorista.');
  const productoId = idSeguro(datos.producto_id);
  const db = await conexion.getConexionMayorista(id);
  if (!db) throw reglas.error('El catálogo de este mayorista no está disponible.', 503);
  const clientes = await db.query(`SELECT COALESCE(NULLIF(BTRIM(nom_fan_cliente),''),BTRIM(raz_soc_cliente),'') AS nombre
    FROM "viewClientes" WHERE es_activo=true AND regexp_replace(doc_cliente::text,'[^0-9]','','g')=$1
    ORDER BY id_cliente LIMIT 1`, [documento]);
  if (!clientes.rows.length) throw reglas.error('El cliente no está activo en este mayorista.', 404);
  const productos = await db.query(`SELECT id_producto,cod_producto,des_producto,precio_producto,des_producto_rubro,des_producto_marca
    FROM "viewProductos" WHERE id_producto=$1 LIMIT 1`, [productoId]);
  const producto = productos.rows[0];
  if (!producto) throw reglas.error('El producto no pertenece a este catálogo.', 404);

  // Solo la consulta permite explicar la condición guardada mientras está pausada.
  // No cambia cfg, no activa el motor y no escribe ni suplanta una sesión cliente.
  const condicion = reglas.resolver({ ...cfg, activo: true }, documento);
  if (condicion) {
    const modelo = await pool.query('SELECT modelo_precio_catalogo FROM mayoristas WHERE id=$1', [id]);
    if (modelo.rows[0]?.modelo_precio_catalogo !== 'precio_recibido')
      throw reglas.error('Este catálogo usa otro modelo de precio. No se puede aplicar esta condición sin revisarlo.', 409);
    if (producto.precio_producto === null || producto.precio_producto === undefined || String(producto.precio_producto).trim() === '')
      throw reglas.error('Este producto no tiene un precio recibido válido. No se sustituyó por cero.', 409);
  }
  const desglose = condicion ? reglas.calcular(producto.precio_producto, condicion, producto) : null;
  return {
    version: Number(cfg.version), activo: cfg.activo, aplicada: !!desglose && cfg.activo,
    cliente: { cuit: documento, nombre: clientes.rows[0].nombre },
    producto: { id: producto.id_producto, codigo: producto.cod_producto, descripcion: producto.des_producto },
    desglose,
    mensaje: !condicion ? 'Este cliente conserva su circuito actual: no tiene una condición comercial asignada. No se muestra un precio calculado con este módulo.'
      : cfg.activo ? 'Esta condición se aplica al precio normal en nuevas consultas del catálogo de este cliente.'
        : 'Condición guardada sin aplicar. Este sería su precio al activarla; el catálogo mantiene su circuito actual.'
  };
}
module.exports = { buscarProductos, consultar };
