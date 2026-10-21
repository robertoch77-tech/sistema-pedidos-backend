'use strict';
const pool = require('../db');
const conexion = require('./conexionMayorista');
const { mayoristaValido } = require('./ivanFuncionesCatalogo');
const { errorCliente, idSeguro } = require('./ivanImagenesDatos');
const estructuras = new WeakMap();
const base = () => ({ campo_precio: null, iva_origen: 'sin_confirmar', iva_fuente: 'general', campo_iva: null,
  alicuota_general: null, unidad_precio: 'sin_confirmar', dto_general: 'sin_confirmar', dto_pago: 'sin_confirmar', dto_cliente: 'sin_confirmar' });
const vacia = () => ({ disponible: false, habilitado: false, origen: base(), presentacion: 'conservar', version: 0 });
const campoSql = campo => {
  if (typeof campo !== 'string' || !campo || Buffer.byteLength(campo, 'utf8') > 63 || campo.includes('\0')) throw errorCliente('Nombre de campo inválido.');
  return '"' + campo.replace(/"/g, '""') + '"';
};
const enumVal = (valor, opciones, mensaje) => { if (!opciones.includes(valor)) throw errorCliente(mensaje); return valor; };
const campoOpcional = valor => { if (valor === null || valor === '') return null; campoSql(valor); return valor; };
function normalizarOrigen(datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw errorCliente('Indicá los datos de origen.');
  const o = { ...base(), ...datos };
  let tasa = o.alicuota_general;
  if (tasa === '' || tasa === null) tasa = null;
  else {
    if (!['number', 'string'].includes(typeof tasa) || !String(tasa).trim()) throw errorCliente('Alícuota inválida.');
    tasa = Number(String(tasa).replace(',', '.'));
    if (!Number.isFinite(tasa) || tasa < 0 || tasa > 100 || Number(tasa.toFixed(4)) !== tasa) throw errorCliente('Usá una alícuota de 0 a 100, con hasta cuatro decimales.');
  }
  return {
    campo_precio: campoOpcional(o.campo_precio),
    iva_origen: enumVal(o.iva_origen, ['sin_confirmar', 'incluido', 'no_incluido'], 'Indicá cómo llega el IVA.'),
    iva_fuente: enumVal(o.iva_fuente, ['general', 'producto'], 'Indicá de dónde tomar la alícuota.'),
    campo_iva: campoOpcional(o.campo_iva), alicuota_general: tasa,
    unidad_precio: enumVal(o.unidad_precio, ['sin_confirmar', 'unidad', 'envase'], 'Indicá la unidad del precio.'),
    ...Object.fromEntries(['dto_general', 'dto_pago', 'dto_cliente'].map(k => [k,
      enumVal(o[k], ['sin_confirmar', 'incluido', 'no_incluido'], 'Revisá qué descuentos incluye el precio.')]))
  };
}
function salida(row) { return { ...row, disponible: true, version: Number(row.version), origen: normalizarOrigen(row.origen || {}) }; }
async function leer(id) {
  try {
    const r = await pool.query('SELECT * FROM public.ivan_precio_origen_config WHERE mayorista_id=$1', [id]);
    return r.rows[0] ? salida(r.rows[0]) : { ...vacia(), disponible: true };
  } catch (e) { if (e.code === '42P01') return vacia(); throw e; }
}
async function campos(db, refrescar = false) {
  const previo = estructuras.get(db);
  if (!refrescar && previo && Date.now() - previo.fecha < 60000) return previo.campos;
  const r = await db.query('SELECT * FROM "viewProductos" LIMIT 0');
  if (!Array.isArray(r.fields)) throw errorCliente('No se pudo leer la estructura del catálogo.', 503);
  const tipos = new Set([20, 21, 23, 700, 701, 1700]);
  const otros = [...new Set(r.fields.map(f => f.dataTypeID).filter(t => !tipos.has(t)))];
  if (otros.length) { const t = await db.query("SELECT oid FROM pg_type WHERE oid=ANY($1::oid[]) AND typcategory='N'", [otros]); t.rows.forEach(f => tipos.add(Number(f.oid))); }
  const nombres = r.fields.filter(f => tipos.has(f.dataTypeID)).map(f => f.name);
  estructuras.set(db, { fecha: Date.now(), campos: nombres }); return nombres;
}
async function dbOrigen(id, origen, refrescar = false) {
  const db = await conexion.getConexionMayorista(id);
  if (!db) throw errorCliente('No se pudo consultar la vista del mayorista.', 503);
  const disponibles = await campos(db, refrescar);
  if (origen.campo_precio && !disponibles.includes(origen.campo_precio)) throw errorCliente('El campo de precio numérico no está disponible en viewProductos.', 409);
  if (origen.iva_fuente === 'producto' && origen.campo_iva && !disponibles.includes(origen.campo_iva)) throw errorCliente('El campo numérico de IVA no está disponible en viewProductos.', 409);
  return db;
}
function validarPresentacion(valor, origen) {
  enumVal(valor, ['conservar', 'agregar', 'desglosar'], 'Elegí una presentación válida.');
  if (valor === 'conservar') return;
  if (!origen.campo_precio || origen.unidad_precio === 'sin_confirmar') throw errorCliente('El administrador debe confirmar el campo y la unidad del precio.');
  if ((valor === 'agregar' && origen.iva_origen !== 'no_incluido') || (valor === 'desglosar' && origen.iva_origen !== 'incluido')) throw errorCliente('Esa presentación no coincide con el IVA declarado. No se suma IVA dos veces.');
  if (origen.iva_fuente === 'general' && origen.alicuota_general === null) throw errorCliente('Falta confirmar la alícuota general.');
  if (origen.iva_fuente === 'producto' && !origen.campo_iva) throw errorCliente('Falta confirmar el campo de alícuota del producto.');
}
async function transaccion(id, version, actor, editar) {
  if (!Number.isSafeInteger(version) || version < 0) throw errorCliente('Versión inválida. Recargá la configuración.');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('INSERT INTO public.ivan_precio_origen_config(mayorista_id) VALUES($1) ON CONFLICT DO NOTHING', [id]);
    const r = await db.query('SELECT * FROM public.ivan_precio_origen_config WHERE mayorista_id=$1 FOR UPDATE', [id]);
    const actual = salida(r.rows[0]);
    if (actual.version !== version) throw errorCliente('Otra sesión cambió esta configuración. Recargá antes de guardar.', 409);
    const siguiente = editar(actual);
    const cambio = await db.query(`UPDATE public.ivan_precio_origen_config SET habilitado=$2,origen=$3::jsonb,
      presentacion=$4,version=version+1,actualizado_en=now() WHERE mayorista_id=$1 RETURNING *`,
      [id, siguiente.habilitado, JSON.stringify(siguiente.origen), siguiente.presentacion]);
    const guardado = cambio.rows[0];
    await db.query('INSERT INTO public.ivan_precio_origen_historial(mayorista_id,version,actor,configuracion) VALUES($1,$2,$3,$4::jsonb)', [id, guardado.version, actor, JSON.stringify(guardado)]);
    await db.query('COMMIT'); return salida(guardado);
  } catch (e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
}
async function guardarAdmin(id, datos) {
  await mayoristaValido(id);
  if (typeof datos?.habilitado !== 'boolean') throw errorCliente('Elegí habilitar o deshabilitar la vista previa.');
  const origen = normalizarOrigen(datos.origen);
  if (origen.campo_precio || (origen.iva_fuente === 'producto' && origen.campo_iva)) await dbOrigen(id, origen, true);
  return transaccion(id, datos.version, 'admin', actual => ({ ...actual, habilitado: datos.habilitado, origen,
    presentacion: JSON.stringify(actual.origen) === JSON.stringify(origen) ? actual.presentacion : 'conservar' }));
}
async function habilitada(id) {
  await mayoristaValido(id, true);
  const cfg = await leer(id);
  if (!cfg.disponible) throw errorCliente('Falta aplicar el SQL de origen y vista previa.', 503);
  if (!cfg.habilitado) throw errorCliente('El administrador no habilitó esta vista previa.', 403);
  return cfg;
}
async function guardarPresentacion(id, datos) {
  await habilitada(id);
  return transaccion(id, datos?.version, 'mayorista', actual => {
    if (!actual.habilitado) throw errorCliente('El permiso fue deshabilitado. No se guardaron cambios.', 403);
    validarPresentacion(datos.presentacion, actual.origen);
    return { ...actual, presentacion: datos.presentacion };
  });
}
async function productos(id, busqueda) {
  const cfg = await habilitada(id);
  if (!cfg.origen.campo_precio) throw errorCliente('El administrador debe seleccionar el campo de precio.', 409);
  const q = String(busqueda || '').trim();
  if (q.length < 2 || q.length > 80) throw errorCliente('Buscá por código o descripción, entre 2 y 80 caracteres.');
  const db = await dbOrigen(id, cfg.origen);
  const patron = '%' + q.replace(/[ñÑáéíóúÁÉÍÓÚ\uFFFD]/g, '_') + '%';
  const r = await db.query(`SELECT id_producto,cod_producto,des_producto,${campoSql(cfg.origen.campo_precio)}::text AS valor_recibido
    FROM "viewProductos" WHERE cod_producto ILIKE $1 OR des_producto ILIKE $1 ORDER BY cod_producto LIMIT 20`, [patron]);
  return { productos: r.rows, version: cfg.version };
}
async function previa(id, datos) {
  const cfg = await habilitada(id);
  if (datos?.version !== cfg.version) throw errorCliente('Cambió el origen del precio. Recargá antes de consultar.', 409);
  const modo = datos.presentacion;
  validarPresentacion(modo, cfg.origen);
  if (!cfg.origen.campo_precio) throw errorCliente('Falta seleccionar el campo de precio.', 409);
  const productoId = idSeguro(datos.producto_id);
  const db = await dbOrigen(id, cfg.origen);
  const ivaCol = cfg.origen.iva_fuente === 'producto' && cfg.origen.campo_iva ? campoSql(cfg.origen.campo_iva) + '::text' : 'NULL::text';
  const r = await db.query(`SELECT id_producto,cod_producto,des_producto,${campoSql(cfg.origen.campo_precio)}::text AS recibido,
    ${ivaCol} AS tasa FROM "viewProductos" WHERE id_producto=$1 LIMIT 1`, [productoId]);
  const p = r.rows[0];
  if (!p) throw errorCliente('Producto no encontrado en este mayorista.', 404);
  if (p.recibido === null || !String(p.recibido).trim() || !Number.isFinite(Number(p.recibido)) || Number(p.recibido) < 0) throw errorCliente('El campo recibido no contiene un precio válido. No se reemplazó por cero.', 409);
  const tasaRaw = cfg.origen.iva_fuente === 'producto' ? p.tasa : cfg.origen.alicuota_general;
  const tasa = tasaRaw === null || tasaRaw === undefined || String(tasaRaw).trim() === '' ? null : Number(tasaRaw);
  if (modo !== 'conservar' && (tasa === null || !Number.isFinite(tasa) || tasa < 0 || tasa > 100)) throw errorCliente('Falta una alícuota válida para este producto. No se usó una tasa automática.', 409);
  // Solo SELECT numérico: no cambia precios, impuestos, pedidos ni tablas de Iván.
  const calculo = await pool.query(`WITH v AS (SELECT $1::numeric AS recibido,$2::numeric AS tasa),
    c AS (SELECT recibido,CASE WHEN $3='agregar' THEN ROUND(recibido*(1+tasa/100),2) ELSE ROUND(recibido,2) END AS total,
      CASE WHEN $3='desglosar' THEN ROUND(recibido/(1+tasa/100),2) WHEN $3='agregar' THEN ROUND(recibido,2) ELSE NULL END AS neto FROM v)
    SELECT recibido::text,neto::text,CASE WHEN neto IS NULL THEN NULL ELSE (total-neto)::text END AS iva,total::text FROM c`,
    [p.recibido, modo === 'conservar' ? null : tasaRaw, modo]);
  return { producto: { id: p.id_producto, codigo: p.cod_producto, descripcion: p.des_producto }, ...calculo.rows[0],
    tasa: tasa !== null && Number.isFinite(tasa) && tasa >= 0 && tasa <= 100 ? tasa : null,
    presentacion: modo, unidad: cfg.origen.unidad_precio, version: cfg.version, aplicada: false,
    mensaje: 'Solo vista previa del precio recibido e IVA. No aplica descuentos ni cambia el catálogo o los pedidos.' };
}
module.exports = { leer, campos, guardarAdmin, habilitada, guardarPresentacion, productos, previa };
