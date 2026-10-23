'use strict';

const pool = require('../db');
const conexion = require('./conexionMayorista');
const descuentos = require('./ivanDescuentosComerciales');
const origen = require('./ivanCondicionesOrigen');
const cascada = require('./ivanCascadaOrigen');
const { mayoristaValido } = require('./ivanFuncionesCatalogo');
const { errorCliente, idSeguro } = require('./ivanImagenesDatos');

const INTEGRACION = 'cuit_reglas_v2';
const FUENTE_DESCUENTOS = 'view_clientes_descuentos_x_rubros';
const soloVista = cfg => cfg?.datos?.ivan?.integracion === INTEGRACION;
const esCircuito = cfg => ['cuit_reglas_v1', INTEGRACION].includes(cfg?.datos?.ivan?.integracion);
const activo = cfg => esCircuito(cfg) && cfg.habilitado === true && cfg.datos.ivan.habilitado === true && cfg.datos.ivan.aplicar_catalogo === true;
const documento = v => String(v || '').replace(/\D/g, '');
const idOrigen = v => {
  if (v === null || v === undefined || !/^\d+$/.test(String(v).trim()) || BigInt(String(v).trim()) === 0n) throw errorCliente('Iván devolvió un ID de cliente inválido.', 409);
  return BigInt(String(v).trim()).toString();
};

async function configuracionMayorista(id, incluirDescuentoAnterior = false) {
  const r = await pool.query(`SELECT modelo_precio_catalogo,iva${incluirDescuentoAnterior ? ',dto_pago_termino' : ''} FROM mayoristas WHERE id=$1`, [id]);
  if (!r.rows[0]) throw errorCliente('Mayorista no disponible.', 404);
  const c = r.rows[0];
  const tasa = c.iva === null || c.iva === undefined || String(c.iva).trim() === '' ? null : Number(c.iva);
  return { ...c, tasa: tasa !== null && Number.isFinite(tasa) && tasa >= 0 && tasa <= 100 ? tasa : null };
}

async function leerAdmin(id, cfgLeida = null) {
  const cfg = cfgLeida || await descuentos.leer(id), c = await configuracionMayorista(id, !soloVista(cfg));
  const anterior = esCircuito(cfg) ? null : await require('./ivanPrecioOrigen').leer(id);
  return { disponible: cfg.disponible, version: Number(cfg.version), habilitado: activo(cfg),
    preferir_simple: esCircuito(cfg) || cfg.datos?.ivan?.habilitado === true,
    permitir_iva: esCircuito(cfg) ? cfg.datos.ivan.permitir_iva === true : anterior.habilitado && anterior.origen.catalogo_iva.permitido,
    con_iva: activo(cfg) && cfg.datos.ivan.permitir_iva === true && cfg.datos.ivan.con_iva === true,
    tasa: c.tasa, fuente_descuentos: soloVista(cfg) ? FUENTE_DESCUENTOS : 'circuito_anterior',
    ...(!soloVista(cfg) ? { dto_pago_termino: c.dto_pago_termino ?? 0 } : {}) };
}

// Contrato conocido, no un formulario de columnas intercambiables.
async function campos(db, exclusiva) {
  const vistas = await origen.estructura(db);
  const exigir = (vista, nombre) => {
    if (!vistas[vista].campos.some(c => c.nombre === nombre)) throw errorCliente(`La vista ${vistas[vista].nombre} no expone ${nombre}. No se calculó un precio.`, 409);
    return nombre;
  };
  if (!exclusiva) exigir('clientes', 'porcentaje_descuento_items');
  const c = { cliente_id: exigir('clientes', 'id_cliente'), regla_cliente: exigir('reglas', 'fk_id_cliente'),
    regla_porcentaje: exigir('reglas', 'porcentaje'), regla_rubro: exigir('reglas', 'fk_id_producto_rubro'),
    regla_marca: exigir('reglas', 'fk_id_producto_marca'), regla_tipo: exigir('reglas', 'fk_id_producto_tipo') };
  for (const dimension of ['rubro', 'marca', 'tipo']) {
    const reconocidos = ['id_producto_' + dimension, 'fk_id_producto_' + dimension, 'id_' + dimension, 'fk_id_' + dimension];
    const nombre = reconocidos.map(n => vistas.productos.campos.find(campo => campo.nombre.toLowerCase() === n)?.nombre).find(Boolean);
    if (!nombre) throw errorCliente(`viewProductos no expone el ID de ${dimension} del producto. No se usa id_producto en su lugar.`, 409);
    c['producto_' + dimension] = nombre;
  }
  return c;
}

async function guardarAdmin(id, datos) {
  await mayoristaValido(id);
  if (!Number.isSafeInteger(datos?.version) || typeof datos.habilitado !== 'boolean' || typeof datos.permitir_iva !== 'boolean') throw errorCliente('Configuración inválida.');
  if (datos.habilitado) {
    const c = await configuracionMayorista(id);
    if (c.modelo_precio_catalogo !== 'precio_recibido') throw errorCliente('Este mayorista usa un modelo de precio diferente. No se modificó su configuración.', 409);
    const db = await conexion.getConexionMayorista(id);
    if (!db) throw errorCliente('La conexión del mayorista no está disponible.', 503);
    await campos(db, true);
    if (datos.permitir_iva && c.tasa === null) throw errorCliente('Completá el IVA del mayorista en su configuración existente.', 409);
  }
  await descuentos.transaccion(id, 'admin', datos.version, c => {
    const anterior = c.datos?.ivan || {};
    return { ...c, habilitado: datos.habilitado ? true : c.habilitado, activo: datos.habilitado ? false : c.activo,
      datos: { ...c.datos, ivan: { ...anterior, integracion: INTEGRACION, habilitado: datos.habilitado,
        aplicar_catalogo: datos.habilitado, permitir_iva: datos.permitir_iva,
        con_iva: esCircuito(c) && datos.habilitado && datos.permitir_iva && anterior.con_iva === true } } };
  });
  return leerAdmin(id);
}

async function resumen(id, cfgLeida = null) {
  const cfg = cfgLeida || await descuentos.leer(id), estado = await leerAdmin(id, cfg);
  return { disponible: cfg.disponible, permiso: cfg.habilitado, version: Number(cfg.version), modo_circuito: true,
    origen: { habilitado: cfg.habilitado === true && cfg.datos?.ivan?.habilitado === true, aplicar_catalogo: activo(cfg) },
    pendientes: [], pendientes_consulta: [], fuente_descuentos: soloVista(cfg) ? FUENTE_DESCUENTOS : 'circuito_anterior', iva: estado };
}

async function guardarIva(id, datos) {
  const cfg = await descuentos.leer(id);
  if (!activo(cfg)) throw errorCliente('La integración de descuentos de Iván no está habilitada.', 403);
  if (typeof datos?.con_iva !== 'boolean' || !Number.isSafeInteger(datos.version)) throw errorCliente('Elegí Sin IVA o Con IVA.');
  if (datos.con_iva) {
    if (!cfg.datos.ivan.permitir_iva) throw errorCliente('El administrador no habilitó esta opción.', 403);
    if ((await configuracionMayorista(id)).tasa === null) throw errorCliente('Falta el IVA en la configuración del mayorista.', 409);
    const tabla = await pool.query("SELECT to_regclass('public.ivan_pedido_iva_snapshot') AS nombre");
    if (!tabla.rows[0]?.nombre) throw errorCliente('No está disponible el detalle de IVA de pedidos.', 503);
  }
  const nueva = await descuentos.transaccion(id, 'mayorista', datos.version, c => {
    if (!activo(c) || (datos.con_iva && !c.datos.ivan.permitir_iva)) throw errorCliente('Cambió el permiso. Actualizá la pantalla.', 409);
    return { ...c, datos: { ...c.datos, ivan: { ...c.datos.ivan, con_iva: datos.con_iva } } };
  });
  return resumen(id, nueva);
}

async function contexto(id, db, cuit, cfgLeida = null) {
  const cfg = cfgLeida || await descuentos.leer(id);
  if (!activo(cfg)) return null;
  const doc = documento(cuit);
  if (!/^\d{7,20}$/.test(doc)) throw errorCliente('Ingresá con el CUIT del cliente.', 401);
  const exclusiva = soloVista(cfg);
  const c = await configuracionMayorista(id, !exclusiva);
  if (c.modelo_precio_catalogo !== 'precio_recibido') throw errorCliente('El modelo de precio del mayorista cambió.', 409);
  const vinculos = await campos(db, exclusiva);
  const r = await db.query(`SELECT id_cliente::text AS id,
    COALESCE(NULLIF(BTRIM(nom_fan_cliente),''),BTRIM(raz_soc_cliente),'') AS nombre
    ${exclusiva ? '' : ',porcentaje_descuento_items::text AS descuento'} FROM "viewClientes"
    WHERE es_activo=true AND regexp_replace(doc_cliente::text,'[^0-9]','','g')=$1 LIMIT 2`, [doc]);
  if (r.rows.length !== 1) throw errorCliente(r.rows.length ? 'El CUIT identifica más de un cliente en Iván.' : 'El cliente no está activo en este mayorista.', 409);
  // v2 usa solamente porcentajes de la vista nueva. v1 se conserva hasta que
  // admin elija guardar la nueva lectura para este mayorista expresamente.
  const cliente = { id: idOrigen(r.rows[0].id), cuit: doc, nombre: r.rows[0].nombre,
    general: exclusiva ? null : cascada.porcentaje(c.dto_pago_termino ?? 0),
    extra: exclusiva ? null : cascada.porcentaje(r.rows[0].descuento ?? 0) };
  const configuracion = { campos: vinculos, dimension_vacia: cfg.datos.ivan.dimension_vacia === 'nulo_o_cero' ? 'nulo_o_cero' : 'nulo', aplicar_catalogo: true };
  const reglas = (await origen.cargarReglas(db, configuracion, cliente.id)).map(r => ({ ...r,
    etiqueta: exclusiva && ['rubro', 'marca', 'tipo'].every(k => r[k] === null) ? 'General para todos sus productos' : r.etiqueta }));
  return { id, db, version: Number(cfg.version), configDescuentos: cfg, cfg: configuracion, cliente, reglas,
    todas: exclusiva ? reglas : [
      { etiqueta: 'Descuento general / por pago', porcentaje: cliente.general, rubro: null, marca: null, tipo: null },
      { etiqueta: 'Descuento del cliente', porcentaje: cliente.extra, rubro: null, marca: null, tipo: null }, ...reglas] };
}

async function consultarCliente(id, cuit) {
  const db = await conexion.getConexionMayorista(id);
  if (!db) throw errorCliente('La conexión del mayorista no está disponible.', 503);
  const ctx = await contexto(id, db, cuit);
  if (!ctx) throw errorCliente('La integración no está habilitada.', 403);
  return { version: ctx.version, cliente: ctx.cliente, reglas: await origen.nombresReglas(ctx),
    aplicada_catalogo: true, calculo_disponible: true, modo_circuito: true, solo_lectura: true };
}

async function revisarLectura(id, datos, cfg) {
  if (!esCircuito(cfg) || !cfg.habilitado || !cfg.datos.ivan.habilitado) throw errorCliente('Esta revisión requiere la integración de condiciones habilitada.', 403);
  const doc = documento(datos?.cuit);
  if (!/^\d{7,20}$/.test(doc)) throw errorCliente('Elegí un cliente para revisar la lectura.');
  const productoId = datos.producto_id === undefined ? null : idSeguro(datos.producto_id);
  let client, etapa = 'conexión';
  try {
    const db = await conexion.getConexionMayorista(id);
    if (!db) throw errorCliente('La conexión del mayorista no está disponible.', 503);
    client = await db.connect();
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    await client.query("SET LOCAL statement_timeout = '5000ms'");
    etapa = 'versión del servidor';
    const servidor = await client.query('SHOW server_version');
    etapa = 'estructura de las vistas';
    const vistas = await origen.estructura(client, true);
    const vinculos = await campos(client, soloVista(cfg));
    etapa = 'esquema de la vista de condiciones';
    const esquema = await client.query(`SELECT n.nspname AS esquema FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relname=$1 AND pg_table_is_visible(c.oid)`, [FUENTE_DESCUENTOS]);
    etapa = 'cliente por CUIT';
    // Solo columnas ID conocidas y devueltas por los metadatos de esta vista.
    // No depende de funciones JSON/JSONB del servidor del proveedor.
    const citar = nombre => '"' + nombre.replace(/"/g, '""') + '"';
    const camposId = vistas.clientes.campos.filter(c => ['id', 'id_cliente'].includes(c.nombre.toLowerCase()));
    const seleccionId = camposId.map((c, i) => `${citar(c.nombre)}::text AS identificador_${i}`).join(',');
    const persona = await client.query(`SELECT id_cliente::text AS id,
      ${seleccionId} FROM "viewClientes"
      WHERE es_activo=true AND regexp_replace(doc_cliente::text,'[^0-9]','','g')=$1 LIMIT 2`, [doc]);
    if (persona.rows.length !== 1) throw errorCliente('El CUIT no identifica un único cliente activo en esta conexión.', 409);
    const idUsado = idOrigen(persona.rows[0].id);
    etapa = 'existencia de condiciones';
    const existencia = await client.query(`SELECT
      EXISTS(SELECT 1 FROM "view_clientes_descuentos_x_rubros") AS tiene_filas,
      EXISTS(SELECT 1 FROM "view_clientes_descuentos_x_rubros" WHERE fk_id_cliente IS NULL OR BTRIM(fk_id_cliente::text)='0') AS tiene_fk_vacio_o_cero`);
    const grupos = new Map();
    for (const [i, { nombre: campo }] of camposId.entries()) {
      const valor = persona.rows[0]['identificador_' + i];
      if (valor === null || !/^\d+$/.test(String(valor).trim()) || BigInt(String(valor).trim()) === 0n) continue;
      const clave = idOrigen(valor);
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave).push(campo);
    }
    const numerico = vistas.reglas.campos.find(c => c.nombre === 'fk_id_cliente')?.numerico;
    const fk = numerico ? '"fk_id_cliente"' : `(CASE WHEN BTRIM(fk_id_cliente::text) ~ '^[0-9]+$' THEN BTRIM(fk_id_cliente::text)::numeric::text ELSE NULL END)`;
    const coincidencias = [];
    for (const [valor, camposId] of grupos) {
      etapa = 'condiciones vinculadas al identificador';
      const r = await client.query(`SELECT porcentaje::text,fk_id_cliente::text,fk_id_producto_rubro::text,
        fk_id_producto_marca::text,fk_id_producto_tipo::text
        FROM "view_clientes_descuentos_x_rubros" WHERE ${fk}=$1 LIMIT 21`, [valor]);
      coincidencias.push({ campos: camposId, valor, usado_en_calculo: valor === idUsado,
        filas: Math.min(r.rows.length, 20), mas_de_20: r.rows.length > 20, muestra: r.rows.slice(0, 20) });
    }
    let producto = null;
    if (productoId !== null) {
      etapa = 'identificadores del producto';
      const r = await client.query(`SELECT id_producto::text AS id,cod_producto AS codigo,
        ${citar(vinculos.producto_rubro)}::text AS rubro,${citar(vinculos.producto_marca)}::text AS marca,
        ${citar(vinculos.producto_tipo)}::text AS tipo FROM "viewProductos" WHERE id_producto=$1 LIMIT 2`, [productoId]);
      if (r.rows.length !== 1) throw errorCliente('El producto no identifica una única fila en esta conexión.', 409);
      producto = r.rows[0];
    }
    return { solo_lectura: true, cuit: doc, integracion: cfg.datos.ivan.integracion, id_cliente_usado: idUsado,
      version_servidor: servidor.rows[0]?.server_version || null,
      vista: FUENTE_DESCUENTOS, esquema: esquema.rows[0]?.esquema || null,
      vista_tiene_filas: existencia.rows[0].tiene_filas, hay_fk_vacio_o_cero: existencia.rows[0].tiene_fk_vacio_o_cero,
      coincidencias, campos_producto: { rubro: vinculos.producto_rubro, marca: vinculos.producto_marca, tipo: vinculos.producto_tipo }, producto };
  } catch (e) {
    if (e.status) throw e;
    const codigo = /^[A-Z0-9]{5}$/.test(String(e.code || '')) ? e.code : 'LECTURA';
    throw errorCliente(`No se pudo revisar ${etapa} (código ${codigo}). No se modificaron datos.`, 503);
  } finally {
    if (client) {
      let descartar = false;
      try { await client.query('ROLLBACK'); } catch (_) { descartar = true; }
      client.release(descartar);
    }
  }
}

async function consultarProducto(id, datos) {
  const db = await conexion.getConexionMayorista(id);
  if (!db) throw errorCliente('El catálogo no está disponible.', 503);
  const ctx = await contexto(id, db, datos?.cuit);
  if (!ctx) throw errorCliente('La integración no está habilitada.', 403);
  if (datos.version !== ctx.version) throw errorCliente('Cambió la configuración. Actualizá la consulta.', 409);
  const r = await db.query('SELECT id_producto,cod_producto,des_producto,precio_producto,des_producto_rubro,des_producto_marca,des_producto_tipo FROM "viewProductos" WHERE id_producto=$1', [idSeguro(datos.producto_id)]);
  if (r.rows.length !== 1) throw errorCliente('Producto no disponible.', 404);
  const [p] = await origen.aplicar(r.rows, ctx, true);
  const iva = require('./ivanIvaCatalogo');
  const [final] = await iva.aplicar([p], await iva.contexto(id, db, ctx.cliente.cuit, ctx.configDescuentos), r.rows);
  let detalle = null;
  if (final.iva_catalogo) { const { firma, ...visible } = final.iva_catalogo; detalle = visible; }
  return { version: ctx.version, cliente: ctx.cliente, producto: { id: final.id_producto, codigo: final.cod_producto, descripcion: final.des_producto,
    rubro: final.des_producto_rubro, marca: final.des_producto_marca, tipo: final.des_producto_tipo },
    desglose: final.descuentos_comerciales, iva: detalle, total: final.precio_producto, aplicada_catalogo: true, solo_lectura: true };
}

async function contextoIva(id, db, cuit, cfg, version) {
  if (!activo(cfg) || !cfg.datos.ivan.permitir_iva || !cfg.datos.ivan.con_iva) return null;
  const c = await configuracionMayorista(id, !soloVista(cfg));
  if (c.tasa === null) throw errorCliente('El mayorista no tiene una tasa de IVA válida.', 409);
  // Igual que el circuito de pedidos existente: importe neto + alícuota.
  return { id, db, cuit: documento(cuit), version: Number(version), modo: 'agregar', envio: 'neto', dtoPago: soloVista(cfg) ? 0 : c.dto_pago_termino ?? 0,
    origen: { campo_precio: 'precio_producto', unidad_precio: 'unidad', iva_origen: 'no_incluido', iva_fuente: 'general',
      alicuota_general: c.tasa, catalogo_iva: { permitido: true, modo: 'agregar', envio: 'neto' } } };
}

module.exports = { esCircuito, activo, leerAdmin, guardarAdmin, resumen, guardarIva, contexto, consultarCliente, consultarProducto, contextoIva, revisarLectura };
