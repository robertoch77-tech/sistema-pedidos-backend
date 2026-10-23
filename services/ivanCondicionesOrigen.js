'use strict';

const pool = require('../db');
const conexion = require('./conexionMayorista');
const configuracion = require('./ivanDescuentosComerciales');
const cascada = require('./ivanCascadaOrigen');
const { mayoristaValido } = require('./ivanFuncionesCatalogo');
const { errorCliente, idSeguro } = require('./ivanImagenesDatos');

const VISTAS = { clientes: 'viewClientes', productos: 'viewProductos', reglas: 'view_clientes_descuentos_x_rubros' };
const CAMPOS = {
  cliente_id: ['clientes', 'ID del cliente'], general: ['clientes', 'Descuento general'], extra: ['clientes', 'Descuento extra'],
  producto_rubro: ['productos', 'ID de rubro del producto'], producto_marca: ['productos', 'ID de marca del producto'], producto_tipo: ['productos', 'ID de tipo del producto'],
  regla_cliente: ['reglas', 'Cliente de la condición'], regla_porcentaje: ['reglas', 'Porcentaje de la condición'],
  regla_rubro: ['reglas', 'Rubro de la condición'], regla_marca: ['reglas', 'Marca de la condición'], regla_tipo: ['reglas', 'Tipo de la condición']
};
const SIN_DESCUENTO = '__no_aplica__';
const CAMPOS_CONSULTA = ['cliente_id', 'regla_cliente', 'regla_porcentaje', 'regla_rubro', 'regla_marca', 'regla_tipo'];
const estructuras = new WeakMap();
const documento = v => String(v || '').replace(/\D/g, '');
const campoSql = v => {
  if (typeof v !== 'string' || !v || Buffer.byteLength(v, 'utf8') > 63 || v.includes('\0')) throw errorCliente('Nombre de campo inválido.');
  return '"' + v.replace(/"/g, '""') + '"';
};
function normalizar(valor) {
  const v = valor || {};
  if (typeof v !== 'object' || Array.isArray(v)) throw errorCliente('Configuración de origen inválida.');
  if (v.campos !== undefined && (!v.campos || typeof v.campos !== 'object' || Array.isArray(v.campos))) throw errorCliente('Vínculos de campos inválidos.');
  const campos = { cliente_id: 'id_cliente', general: null, extra: null,
    producto_rubro: null, producto_marca: null, producto_tipo: null,
    regla_cliente: 'fk_id_cliente', regla_porcentaje: 'porcentaje', regla_rubro: 'fk_id_producto_rubro',
    regla_marca: 'fk_id_producto_marca', regla_tipo: 'fk_id_producto_tipo', ...(v.campos || {}) };
  for (const k of Object.keys(CAMPOS)) {
    if (campos[k] === '' || campos[k] === undefined) campos[k] = null;
    if (campos[k] !== null && !(['general', 'extra'].includes(k) && campos[k] === SIN_DESCUENTO)) campoSql(campos[k]);
  }
  if (v.habilitado !== undefined && typeof v.habilitado !== 'boolean') throw errorCliente('Permiso de consulta inválido.');
  if (v.aplicar_catalogo !== undefined && typeof v.aplicar_catalogo !== 'boolean') throw errorCliente('Aplicación al catálogo inválida.');
  const vacio = v.dimension_vacia || 'nulo';
  if (!['nulo', 'nulo_o_cero'].includes(vacio)) throw errorCliente('Elegí qué significa una dimensión sin restricción.');
  return { habilitado: v.habilitado === true, aplicar_catalogo: v.habilitado === true && v.aplicar_catalogo === true,
    dimension_vacia: vacio, campos: Object.fromEntries(Object.keys(CAMPOS).map(k => [k, campos[k]])) };
}
function pendientes(cfg) { return Object.keys(CAMPOS).filter(k => !cfg.campos[k]).map(k => CAMPOS[k][1]); }
function desdeConfig(cfg) {
  const origen = normalizar(cfg.datos?.ivan);
  return { disponible: cfg.disponible, permiso: cfg.habilitado, version: Number(cfg.version), origen, pendientes: pendientes(origen),
    pendientes_consulta: CAMPOS_CONSULTA.filter(k => !origen.campos[k]).map(k => CAMPOS[k][1]) };
}
async function leer(id) { return desdeConfig(await configuracion.leer(id)); }
async function estructura(db, refrescar = false) {
  const anterior = estructuras.get(db);
  if (!refrescar && anterior && Date.now() - anterior.fecha < 60000) return anterior.vistas;
  const vistas = {};
  for (const [k, nombre] of Object.entries(VISTAS)) {
    try {
      const r = await db.query(`SELECT * FROM ${campoSql(nombre)} LIMIT 0`);
      const tipos = new Set([20, 21, 23, 700, 701, 1700]);
      const otros = [...new Set(r.fields.map(f => f.dataTypeID).filter(t => !tipos.has(t)))];
      if (otros.length) {
        const n = await db.query("SELECT oid FROM pg_type WHERE oid=ANY($1::oid[]) AND typcategory='N'", [otros]);
        n.rows.forEach(f => tipos.add(Number(f.oid)));
      }
      vistas[k] = { nombre, disponible: true, campos: r.fields.map(f => ({ nombre: f.name, numerico: tipos.has(f.dataTypeID) })) };
    } catch (e) {
      if (!['42P01', '42501'].includes(e.code)) throw e;
      vistas[k] = { nombre, disponible: false, campos: [], mensaje: 'Vista no disponible para esta conexión.' };
    }
  }
  estructuras.set(db, { fecha: Date.now(), vistas }); return vistas;
}
async function comprobar(db, cfg) {
  const vistas = await estructura(db);
  for (const [k, [vista, etiqueta]] of Object.entries(CAMPOS)) {
    const nombre = cfg.campos[k];
    if (!nombre || (['general', 'extra'].includes(k) && nombre === SIN_DESCUENTO)) continue;
    const campo = vistas[vista].campos.find(f => f.nombre === nombre);
    if (!campo) throw errorCliente('Campo no disponible: ' + etiqueta + '. Consultá los campos en admin.', 409);
    if (['general', 'extra', 'regla_porcentaje'].includes(k) && !campo.numerico) throw errorCliente(etiqueta + ' debe ser un campo numérico.', 409);
  }
}
async function validarPrecioBase(id) {
  const precio = await require('./ivanPrecioOrigen').leer(id), o = precio.origen;
  if (o.campo_precio !== 'precio_producto' || o.unidad_precio !== 'unidad' || o.iva_origen !== 'no_incluido') {
    throw errorCliente('Antes de aplicar la cascada, confirmá en Origen del precio: precio_producto por unidad y sin IVA.', 409);
  }
  if (['dto_general', 'dto_pago', 'dto_cliente'].some(k => o[k] === 'incluido')) {
    throw errorCliente('El origen declara descuentos ya incluidos. Revisá esa declaración antes de aplicar otra cascada; no se descontó dos veces.', 409);
  }
}
async function guardar(id, body) {
  await mayoristaValido(id);
  if (!Number.isSafeInteger(body?.version) || body.version < 0) throw errorCliente('Recargá la configuración antes de guardar.');
  if (!body.origen || typeof body.origen.habilitado !== 'boolean' || typeof body.origen.aplicar_catalogo !== 'boolean') throw errorCliente('Indicá la modalidad que querés guardar.');
  const origen = normalizar(body.origen);
  if (origen.habilitado && origen.campos.general && origen.campos.general !== SIN_DESCUENTO && origen.campos.general === origen.campos.extra) throw errorCliente('General y extra no pueden leer el mismo campo dos veces. Confirmá sus fuentes o elegí «No aplica».');
  const actual = await configuracion.leer(id);
  if (['cuit_reglas_v1', 'cuit_reglas_v2'].includes(actual.datos?.ivan?.integracion)) throw errorCliente('Actualizá la pantalla y usá Precios y descuentos de los clientes para esta integración.', 409);
  if (!actual.disponible) throw errorCliente('Faltan las tablas existentes de descuentos.', 503);
  if (origen.habilitado && !actual.habilitado) throw errorCliente('Primero habilitá el permiso de Descuentos comerciales para este mayorista.', 409);
  if (origen.habilitado && actual.activo) throw errorCliente('Pausá primero las condiciones manuales de este mayorista. No se combinaron dos motores de descuentos.', 409);
  if (origen.habilitado) {
    const precio = await require('./ivanPrecioOrigen').leer(id);
    if (precio.origen.iva_origen === 'incluido' || precio.origen.catalogo_iva.modo === 'desglosar') throw errorCliente('El precio base de esta modalidad viene sin IVA. Revisá la declaración de origen de IVA en admin antes de habilitarla.', 409);
  }
  if (origen.aplicar_catalogo && pendientes(origen).length) throw errorCliente('Falta vincular: ' + pendientes(origen).join(', '), 409);
  // Desactivar o preparar un borrador no depende de que la conexión externa responda.
  if (origen.habilitado) {
    const db = await conexion.getConexionMayorista(id);
    if (!db) throw errorCliente('No se pudo consultar la estructura de Iván.', 503);
    await estructura(db, true); await comprobar(db, origen);
  }
  if (origen.aplicar_catalogo) {
    if (body.confirmar_aplicacion !== true) throw errorCliente('Confirmá la activación de la cascada de Iván.');
    await validarPrecioBase(id);
    const m = await pool.query('SELECT modelo_precio_catalogo FROM mayoristas WHERE id=$1', [id]);
    if (m.rows[0]?.modelo_precio_catalogo !== 'precio_recibido') throw errorCliente('Esta modalidad requiere precio recibido. No cambia automáticamente el modelo actual.', 409);
  }
  await configuracion.transaccion(id, 'admin', body.version, c => {
    if (origen.habilitado && (!c.habilitado || c.activo)) throw errorCliente('Cambió el permiso o se activaron reglas manuales. Recargá antes de guardar.', 409);
    const previa = normalizar(c.datos?.ivan);
    if ((previa.aplicar_catalogo || origen.aplicar_catalogo) && body.confirmar_aplicacion !== true) throw errorCliente('Confirmá el cambio que afecta nuevas consultas del catálogo.');
    return { ...c, datos: { ...c.datos, ivan: origen } };
  });
  return leer(id);
}
function idOrigen(valor, ceroVacio = false) {
  if (valor === null || valor === undefined) return null;
  if (!/^\d+$/.test(String(valor).trim())) throw errorCliente('Un identificador de Iván no es válido. Revisá los campos vinculados.', 409);
  const id = BigInt(String(valor).trim()).toString();
  return ceroVacio && id === '0' ? null : id;
}
function idSql(campo) {
  const texto = `BTRIM(${campoSql(campo)}::text)`;
  return `(CASE WHEN ${texto} ~ '^[0-9]+$' THEN (${texto})::numeric::text ELSE NULL END)`;
}
async function cliente(db, cfg, cuit) {
  const doc = documento(cuit), c = cfg.campos;
  if (!/^\d{7,20}$/.test(doc)) throw errorCliente('Elegí un CUIT válido de este mayorista.');
  const seleccion = k => !c[k] ? 'NULL::text' : c[k] === SIN_DESCUENTO ? "'0'::text" : campoSql(c[k]) + '::text';
  const r = await db.query(`SELECT ${campoSql(c.cliente_id)}::text AS id,
    COALESCE(NULLIF(BTRIM(nom_fan_cliente),''),BTRIM(raz_soc_cliente),'') AS nombre,
    ${seleccion('general')} AS general,${seleccion('extra')} AS extra
    FROM "viewClientes" WHERE es_activo=true AND regexp_replace(doc_cliente::text,'[^0-9]','','g')=$1 LIMIT 2`, [doc]);
  if (!r.rows.length) throw errorCliente('El cliente no está activo en este mayorista.', 404);
  if (r.rows.length > 1) throw errorCliente('Este CUIT identifica varios clientes en Iván. Debe resolverse allí antes de calcular su precio.', 409);
  const p = r.rows[0];
  if (p.id === null || idOrigen(p.id) === '0') throw errorCliente('El cliente no tiene un ID válido en la vista de Iván.', 409);
  return { id: idOrigen(p.id), cuit: doc, nombre: p.nombre, general: c.general ? cascada.porcentaje(p.general) : null,
    extra: c.extra ? cascada.porcentaje(p.extra) : null };
}
async function cargarReglas(db, cfg, idCliente) {
  const c = cfg.campos;
  const vistas = await estructura(db);
  const fk = vistas.reglas.campos.find(f => f.nombre === c.regla_cliente);
  const clienteSql = fk?.numerico ? campoSql(c.regla_cliente) : idSql(c.regla_cliente);
  const r = await db.query(`SELECT ${campoSql(c.regla_porcentaje)}::text AS porcentaje,
    ${campoSql(c.regla_rubro)}::text AS rubro,${campoSql(c.regla_marca)}::text AS marca,${campoSql(c.regla_tipo)}::text AS tipo
    FROM "view_clientes_descuentos_x_rubros" WHERE ${clienteSql}=$1 LIMIT 1001`, [idCliente]);
  if (r.rows.length > 1000) throw errorCliente('El cliente supera 1.000 condiciones. Revisá el origen antes de calcular.', 409);
  const reglas = r.rows.map(p => ({ porcentaje: cascada.porcentaje(p.porcentaje),
    ...Object.fromEntries(['rubro', 'marca', 'tipo'].map(k => [k, idOrigen(p[k], cfg.dimension_vacia === 'nulo_o_cero')])) }));
  const clave = p => JSON.stringify([p.rubro, p.marca, p.tipo, Number(p.porcentaje)]);
  reglas.sort((a, b) => clave(a).localeCompare(clave(b)));
  // Dos filas iguales no se interpretan silenciosamente como dos descuentos.
  if (new Set(reglas.map(clave)).size !== reglas.length) throw errorCliente('Hay condiciones duplicadas en Iván para este cliente. Revisalas allí antes de calcular.', 409);
  return reglas.map((r, i) => ({ ...r, id: String(i + 1), etiqueta: ['rubro', 'marca', 'tipo'].filter(k => r[k] !== null).join(' + ') || 'Condición sin restricción de producto' }));
}
async function contexto(id, db, cuit, soloConsulta = false, configuracionLeida = null) {
  const cfg = configuracionLeida || await leer(id), origen = cfg.origen;
  if (!cfg.permiso || !origen.habilitado || (!soloConsulta && !origen.aplicar_catalogo)) return null;
  const faltan = pendientes(origen);
  if (faltan.length) throw errorCliente('Falta vincular en admin: ' + faltan.join(', '), 409);
  if (origen.aplicar_catalogo) await validarPrecioBase(id);
  await comprobar(db, origen);
  const persona = await cliente(db, origen, cuit), reglas = await cargarReglas(db, origen, persona.id);
  return { id, db, version: Number(cfg.version), cfg: origen, cliente: persona, reglas,
    todas: [{ etiqueta: 'General del cliente', porcentaje: persona.general, rubro: null, marca: null, tipo: null },
      { etiqueta: 'Extra del cliente', porcentaje: persona.extra, rubro: null, marca: null, tipo: null }, ...reglas] };
}
async function aplicar(productos, ctx, detallar = false) {
  if (!ctx || !productos.length) return productos;
  const ids = [...new Set(productos.map(p => idSeguro(p.id_producto)))], c = ctx.cfg.campos;
  const r = await ctx.db.query(`SELECT id_producto::text AS id,${campoSql(c.producto_rubro)}::text AS rubro,
    ${campoSql(c.producto_marca)}::text AS marca,${campoSql(c.producto_tipo)}::text AS tipo
    FROM "viewProductos" WHERE id_producto=ANY($1::integer[])`, [ids]);
  const dimensiones = new Map(r.rows.map(p => [p.id, Object.fromEntries(['rubro', 'marca', 'tipo'].map(k => [k, idOrigen(p[k])]))]));
  if (dimensiones.size !== r.rows.length) throw errorCliente('La vista de Iván devuelve un ID de producto duplicado. Revisá su origen antes de calcular.', 409);
  const filas = productos.map(p => {
    const d = dimensiones.get(String(p.id_producto));
    if (!d) throw errorCliente('Un producto ya no está en la vista de Iván.', 409);
    return { id: String(p.id_producto), base: p.precio_producto, reglas: ctx.todas.filter(regla => cascada.coincide(regla, d)) };
  });
  const calculadas = [];
  for (let desde = 0; desde < filas.length; desde += 100) {
    calculadas.push(...await cascada.calcular(filas.slice(desde, desde + 100), detallar));
  }
  const porId = new Map(calculadas.map(p => [p.id, p])), cantidades = new Map(filas.map(p => [p.id, p.reglas.length]));
  return productos.map(p => { const v = porId.get(String(p.id_producto)); return { ...p, precio_producto: Number(v.importe),
    descuentos_comerciales: { origen_ivan: true, recibido: Number(v.base), importe: Number(v.importe),
      version: ctx.version, perfil: 'Condiciones de Iván', pasos: v.pasos, total_pasos: cantidades.get(String(p.id_producto)) } }; });
}
function ordenarSql(ctx, parametros) {
  return cascada.expresionOrden('precio_producto', ctx.todas,
    Object.fromEntries(['rubro', 'marca', 'tipo'].map(k => [k, idSql(ctx.cfg.campos['producto_' + k])])), parametros);
}
async function nombresReglas(ctx) {
  const nombres = {};
  for (const k of ['rubro', 'marca', 'tipo']) {
    const ids = [...new Set(ctx.reglas.map(r => r[k]).filter(v => v !== null))];
    if (!ids.length || !ctx.cfg.campos['producto_' + k]) { nombres[k] = new Map(); continue; }
    const campo = idSql(ctx.cfg.campos['producto_' + k]);
    const r = await ctx.db.query(`SELECT ${campo} AS id,MIN(NULLIF(BTRIM(${campoSql('des_producto_' + k)}),'')) AS nombre
      FROM "viewProductos" WHERE ${campo}=ANY($1::text[]) GROUP BY ${campo}`, [ids]);
    nombres[k] = new Map(r.rows.map(p => [p.id, p.nombre]));
  }
  return ctx.reglas.map(r => ({ ...r, nombres: Object.fromEntries(['rubro', 'marca', 'tipo'].map(k =>
    [k, r[k] === null ? 'Todos' : nombres[k].get(r[k]) || k + ' #' + r[k]])) }));
}
async function consultarCliente(id, cuit) {
  const cfg = await leer(id);
  if (!cfg.permiso || !cfg.origen.habilitado) throw errorCliente('La consulta de condiciones de Iván no está habilitada.', 403);
  if (cfg.pendientes_consulta.length) throw errorCliente('Falta vincular la consulta en admin: ' + cfg.pendientes_consulta.join(', '), 409);
  const db = await conexion.getConexionMayorista(id);
  if (!db) throw errorCliente('La conexión de este mayorista no está disponible.', 503);
  // Leer condiciones no requiere una fuente de general/extra ni activar precios.
  // Solo se reconocen nombres exactos y no ambiguos de IDs; no se guardan cambios.
  const vistas = await estructura(db), origen = normalizar(cfg.origen);
  for (const dimension of ['rubro', 'marca', 'tipo']) {
    const clave = 'producto_' + dimension;
    if (origen.campos[clave]) continue;
    const candidatos = ['fk_id_producto_' + dimension, 'id_producto_' + dimension]
      .filter(nombre => vistas.productos.campos.some(c => c.nombre === nombre));
    if (candidatos.length === 1) origen.campos[clave] = candidatos[0];
  }
  await comprobar(db, origen);
  const persona = await cliente(db, origen, cuit), reglas = await cargarReglas(db, origen, persona.id);
  const ctx = { version: cfg.version, db, cfg: origen, cliente: persona, reglas };
  return { version: ctx.version, cliente: ctx.cliente, reglas: await nombresReglas(ctx),
    aplicada_catalogo: ctx.cfg.aplicar_catalogo, solo_lectura: true, calculo_disponible: cfg.pendientes.length === 0 };
}
async function consultarProducto(id, datos) {
  const db = await conexion.getConexionMayorista(id);
  if (!db) throw errorCliente('La conexión de este mayorista no está disponible.', 503);
  const ctx = await contexto(id, db, datos?.cuit, true);
  if (!ctx) throw errorCliente('La consulta de condiciones de Iván no está habilitada.', 403);
  if (datos.version !== ctx.version) throw errorCliente('Cambió la configuración. Actualizá la consulta antes de continuar.', 409);
  const r = await db.query('SELECT id_producto,cod_producto,des_producto,precio_producto,des_producto_rubro,des_producto_marca,des_producto_tipo FROM "viewProductos" WHERE id_producto=$1', [idSeguro(datos.producto_id)]);
  if (r.rows.length !== 1) throw errorCliente('El producto no está disponible en este catálogo.', 404);
  const [producto] = await aplicar(r.rows, ctx, true);
  const iva = require('./ivanIvaCatalogo');
  const contextoIva = await iva.contexto(id, db, ctx.cliente.cuit);
  if (contextoIva && contextoIva.modo !== 'agregar') throw errorCliente('La cascada de origen parte de precio sin IVA. Revisá el modo de IVA configurado.', 409);
  const [final] = await iva.aplicar([producto], contextoIva, r.rows);
  let detalleIva = null;
  if (final.iva_catalogo) { const { firma, ...detalle } = final.iva_catalogo; detalleIva = detalle; }
  return { version: ctx.version, cliente: ctx.cliente, producto: { id: final.id_producto, codigo: final.cod_producto,
    descripcion: final.des_producto, rubro: final.des_producto_rubro, marca: final.des_producto_marca, tipo: final.des_producto_tipo },
    desglose: final.descuentos_comerciales, iva: detalleIva, total: final.precio_producto,
    aplicada_catalogo: ctx.cfg.aplicar_catalogo, solo_lectura: true };
}
async function buscarProductos(id, consulta) {
  const cfg = await leer(id);
  if (!cfg.permiso || !cfg.origen.habilitado) throw errorCliente('La consulta de Iván no está habilitada.', 403);
  const q = String(consulta.q || '').trim(), pagina = Number(consulta.pagina || 1);
  if (q.length > 80 || !Number.isSafeInteger(pagina) || pagina < 1 || pagina > 1000000) throw errorCliente('Filtro o página inválidos.');
  const db = await conexion.getConexionMayorista(id);
  if (!db) throw errorCliente('El catálogo de este mayorista no está disponible.', 503);
  const parametros = [], filtros = [];
  if (q) {
    parametros.push('%' + q.replace(/[ñÑáéíóúÁÉÍÓÚ\uFFFD]/g, '_') + '%');
    filtros.push('(cod_producto ILIKE $1 OR des_producto ILIKE $1)');
  }
  for (const k of ['rubro', 'marca', 'tipo']) {
    const valor = String(consulta[k] || '').trim();
    if (valor.length > 200) throw errorCliente('Filtro demasiado largo.');
    if (valor) { parametros.push(valor); filtros.push(`BTRIM(${campoSql('des_producto_' + k)})=$${parametros.length}`); }
  }
  const where = filtros.length ? 'WHERE ' + filtros.join(' AND ') : '';
  const cuenta = await db.query('SELECT COUNT(*)::integer AS total FROM "viewProductos" ' + where, parametros);
  const total = Number(cuenta.rows[0]?.total || 0), totalPaginas = Math.ceil(total / 30), actual = Math.min(pagina, Math.max(1, totalPaginas));
  const r = await db.query(`SELECT id_producto,cod_producto,des_producto,des_producto_rubro,des_producto_marca,des_producto_tipo
    FROM "viewProductos" ${where} ORDER BY cod_producto,id_producto LIMIT 30 OFFSET $${parametros.length + 1}`, [...parametros, (actual - 1) * 30]);
  let opciones;
  if (consulta.opciones === '1') {
    opciones = {};
    for (const k of ['rubro', 'marca', 'tipo']) {
      const campo = campoSql('des_producto_' + k);
      const n = await db.query(`SELECT DISTINCT BTRIM(${campo}) AS nombre FROM "viewProductos" WHERE NULLIF(BTRIM(${campo}),'') IS NOT NULL ORDER BY nombre LIMIT 2001`);
      if (n.rows.length > 2000) throw errorCliente('Hay más de 2.000 valores de filtro. Revisá la fuente antes de cargar sus opciones.', 409);
      opciones[k] = n.rows.map(v => v.nombre);
    }
  }
  return { productos: r.rows, total, pagina: actual, totalPaginas, opciones };
}
module.exports = { CAMPOS, VISTAS, SIN_DESCUENTO, normalizar, pendientes, desdeConfig, leer, guardar, estructura,
  contexto, aplicar, ordenarSql, consultarCliente, consultarProducto, buscarProductos, cargarReglas, nombresReglas };
