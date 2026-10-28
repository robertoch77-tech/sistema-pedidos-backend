'use strict';

const pool = require('../db');
const conexion = require('./conexionMayorista');
const origen = require('./ivanCondicionesOrigen');
const cascada = require('./ivanCascadaOrigen');
const iva = require('./ivanIvaCatalogo');
const { errorCliente, idSeguro } = require('./ivanImagenesDatos');

const REVISION = 1;
const DIMENSIONES = ['rubro', 'marca', 'tipo'];
const SENSIBLE = /(clave|password|passwd|token|secret|credencial|connection|conexion|banc|cuenta|cbu|cvu|iban|tarjeta|cuit|documento|contacto|mail|telefono|domicilio|direccion)/i;
const INTERES = /(descu|(^|_)dto|bonif|anticip|pronto|contado|pago|condicion_venta|lista_precio|(^|_)iva|alicuota)/i;
const citar = valor => '"' + String(valor).replace(/"/g, '""') + '"';
const codigoError = e => /^[A-Z0-9]{5}$/.test(String(e.code || '')) ? e.code : 'LECTURA';
const normalizarId = valor => {
  if (valor === null || valor === undefined) return null;
  if (!/^\d+$/.test(String(valor).trim())) throw errorCliente('Un ID de producto no es numerico.', 409);
  return BigInt(String(valor).trim()).toString();
};
const seleccion = campos => campos.map(c => `${c === 'precio_producto' ? citar(c) + '::text' : 'LEFT(' + citar(c) + '::text,200)'} AS ${citar(c)}`).join(',');

async function revisar(id, datos, cfg, funciones) {
  if (Number(id) !== 23) throw errorCliente('Diagnostico disponible solo para Moreschi.', 403);
  if (!funciones.esCircuito(cfg) || !cfg.habilitado || !cfg.datos?.ivan?.habilitado) throw errorCliente('La lectura de Iván de Moreschi no está habilitada.', 403);
  const doc = String(datos?.cuit || '').replace(/\D/g, '');
  if (!/^\d{7,20}$/.test(doc)) throw errorCliente('Ingresá el CUIT que querés diagnosticar.');
  const codigo = String(datos?.codigo_producto || '').trim();
  if (codigo.length > 100 || /[\x00-\x1f\x7f]/.test(codigo)) throw errorCliente('Código de producto inválido.');
  const productoId = datos?.producto_id === undefined ? null : idSeguro(datos.producto_id);
  if (!codigo && productoId === null) throw errorCliente('Ingresá el código exacto del producto, incluyendo sus ceros.');
  const inicio = Date.now();
  const informe = { solo_lectura: true, revision_diagnostico: REVISION, mayorista_id: 23,
    cuit: doc, codigo_solicitado: codigo || null, fecha: new Date().toISOString(),
    integracion: cfg.datos.ivan.integracion, version_configuracion: Number(cfg.version),
    estado: 'completo', tiempos: [], advertencias: [
      'El importe recibido se muestra tal como llega de Iván. Su nombre no confirma si contiene IVA o descuentos.',
      'Los campos encontrados son candidatos para investigar: no se vinculan ni se aplican automáticamente.',
      'Este informe consulta únicamente este mayorista. No modifica configuración, precios, descuentos ni pedidos.',
      'precio_producto conserva su texto exacto; los demás valores se limitan a 200 caracteres por campo.'
    ] };
  let client;
  const leer = async (nombre, ejecutar) => {
    if (Date.now() - inicio > 25000) { informe.estado = 'incompleto'; return { estado: 'omitido', mensaje: 'Presupuesto de lectura agotado. No se interpreta como cero ni como ausencia de datos.' }; }
    const desde = Date.now();
    await client.query('SAVEPOINT diagnostico_moreschi');
    try {
      await client.query("SET LOCAL statement_timeout='5000ms'");
      const resultado = await ejecutar();
      await client.query('RELEASE SAVEPOINT diagnostico_moreschi');
      return { estado: 'ok', datos: resultado };
    } catch (e) {
      await client.query('ROLLBACK TO SAVEPOINT diagnostico_moreschi');
      await client.query('RELEASE SAVEPOINT diagnostico_moreschi');
      informe.estado = 'incompleto';
      return { estado: 'error', codigo: codigoError(e), mensaje: e.status ? e.message : `No se pudo leer ${nombre}. Se conservaron los otros resultados.` };
    } finally { informe.tiempos.push({ etapa: nombre, ms: Date.now() - desde }); }
  };
  try {
    const db = await conexion.getConexionMayorista(id);
    if (!db) throw errorCliente('No está disponible la conexión de Moreschi.', 503);
    client = await db.connect();
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    await client.query("SET LOCAL statement_timeout='5000ms'");
    informe.servidor = await leer('versión y esquema', async () => {
      const r = await client.query('SELECT version() AS version,current_schema() AS esquema');
      // No se exportan host, usuario, conexión ni direcciones de red.
      return r.rows[0];
    });
    informe.configuracion = await leer('configuración de Moreschi', async () => {
      const r = await pool.query({ text: `SELECT modelo_precio_catalogo,iva::text,dto_pago_termino::text,
        precio_incluye_iva,usar_iva_producto FROM mayoristas WHERE id=$1`, values: [23], query_timeout: 5000 });
      if (r.rows.length !== 1) throw errorCliente('No se encontró la configuración de Moreschi.', 404);
      return { ...r.rows[0], permitir_iva: cfg.datos.ivan.permitir_iva === true,
        con_iva: cfg.datos.ivan.con_iva === true,
        fuente_pago_termino: 'nuestra tabla mayoristas; no es un campo de Iván',
        pago_termino_usado_como_general: !['cuit_reglas_v2', 'cuit_reglas_v3'].includes(cfg.datos.ivan.integracion) };
    });
    informe.campos_encontrados = await leer('campos de descuento, pago, precio e IVA', async () => {
      const r = await client.query(`SELECT n.nspname AS esquema,c.relname AS relacion,
        CASE c.relkind WHEN 'v' THEN 'vista' WHEN 'm' THEN 'vista materializada' ELSE 'tabla' END AS clase,
        a.attname AS campo,pg_catalog.format_type(a.atttypid,a.atttypmod) AS tipo,COUNT(*) OVER()::text AS total
        FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','v','m','f')
        AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
        AND has_table_privilege(c.oid,'SELECT')
        AND (c.relname IN ('viewClientes','viewProductos','view_clientes_descuentos_x_rubros')
          OR a.attname ~* '(porc|descu|(^|_)dto|bonif|anticip|pronto|contado|pago|condicion.*venta|lista.*precio|(^|_)iva|alicuota)'
          OR c.relname ~* '(descu|bonif|anticip|pronto|condicion.*venta|lista.*precio)')
        ORDER BY CASE WHEN a.attname ~* '(anticip|pronto|contado|pago)' THEN 0
          WHEN c.relname IN ('viewClientes','viewProductos','view_clientes_descuentos_x_rubros') THEN 1 ELSE 2 END,
          n.nspname,c.relname,a.attnum LIMIT 1001`);
      return { total: Number(r.rows[0]?.total || 0), limite: 1000, truncado: r.rows.length > 1000,
        campos: r.rows.slice(0, 1000).map(({ total, ...campo }) => campo),
        alcance: 'Nombres y tipos de objetos con permiso SELECT de esta conexión. No son valores de clientes ni confirman el significado de un descuento.' };
    });
    const estructura = await leer('estructura de las tres vistas', () => origen.estructura(client, true));
    informe.estructura = estructura;
    const camposCliente = estructura.datos?.clientes?.campos || [];
    const camposProducto = estructura.datos?.productos?.campos || [];
    const clientePermitidos = ['id_cliente', 'porcentaje_descuento', 'porcentaje_descuento_items', 'fk_id_lista_precio',
      'fk_id_condicion_venta', 'des_condicion_venta', 'dias_condicion_venta', 'fk_id_tipo_iva', 'des_tipo_iva'];
    const nombresCliente = camposCliente.filter(c => !SENSIBLE.test(c.nombre) && (clientePermitidos.includes(c.nombre) ||
      ((INTERES.test(c.nombre) && c.numerico) || /(porc|descu|(^|_)dto|bonif|anticip|pronto|contado)/i.test(c.nombre)))).map(c => c.nombre);
    informe.cliente_origen = await leer('fila del cliente', async () => {
      if (!nombresCliente.includes('id_cliente')) throw errorCliente('viewClientes no expone id_cliente.', 409);
      const r = await client.query(`SELECT ${seleccion(nombresCliente)} FROM "viewClientes"
        WHERE es_activo=true AND regexp_replace(doc_cliente::text,'[^0-9]','','g')=$1 LIMIT 2`, [doc]);
      if (r.rows.length !== 1) throw errorCliente(r.rows.length ? 'El CUIT identifica más de un cliente activo.' : 'El CUIT no tiene un cliente activo en esta conexión.', 409);
      return r.rows[0];
    });
    const productoPermitidos = ['id_producto', 'cod_producto', 'des_producto', 'precio_producto', 'des_producto_rubro', 'des_producto_marca', 'des_producto_tipo'];
    const nombresProducto = camposProducto.filter(c => !SENSIBLE.test(c.nombre) && (productoPermitidos.includes(c.nombre) ||
      /^(fk_)?id_(producto_)?(rubro|marca|tipo)$/i.test(c.nombre) || INTERES.test(c.nombre) || /precio|costo/i.test(c.nombre))).map(c => c.nombre);
    informe.producto_origen = await leer('fila y precio crudo del producto', async () => {
      if (!['id_producto', 'cod_producto', 'precio_producto'].every(c => nombresProducto.includes(c))) throw errorCliente('Faltan campos de identificación o precio en viewProductos.', 409);
      const filtro = codigo ? 'BTRIM(cod_producto::text)=$1' : 'id_producto=$1';
      const r = await client.query(`SELECT ${seleccion(nombresProducto)} FROM "viewProductos" WHERE ${filtro} LIMIT 2`, [codigo || productoId]);
      if (r.rows.length !== 1) throw errorCliente(r.rows.length ? 'El código identifica varios productos. No se eligió uno automáticamente.' : 'No se encontró el producto por su código exacto.', 409);
      return { fuente_precio: 'viewProductos.precio_producto', iva_en_origen: 'no determinado por el nombre del campo', campos: r.rows[0] };
    });
    informe.condiciones_origen = await leer('filas originales de condiciones del CUIT', async () => {
      const idCliente = informe.cliente_origen.datos?.id_cliente;
      if (!idCliente) throw errorCliente('No se pudo identificar al cliente. No se consultaron condiciones de otros clientes.', 409);
      const numerico = estructura.datos?.reglas?.campos.find(c => c.nombre === 'fk_id_cliente')?.numerico;
      const fk = numerico ? '"fk_id_cliente"' : `(CASE WHEN BTRIM(fk_id_cliente::text) ~ '^[0-9]+$' THEN BTRIM(fk_id_cliente::text)::numeric::text ELSE NULL END)`;
      const r = await client.query(`SELECT porcentaje::text,fk_id_cliente::text,fk_id_producto_rubro::text,
        fk_id_producto_marca::text,fk_id_producto_tipo::text,COUNT(*) OVER()::text AS total
        FROM "view_clientes_descuentos_x_rubros" WHERE ${fk}=$1
        ORDER BY fk_id_producto_rubro::text,fk_id_producto_marca::text,fk_id_producto_tipo::text,porcentaje::text LIMIT 101`, [normalizarId(idCliente)]);
      return { vista: 'view_clientes_descuentos_x_rubros', total: Number(r.rows[0]?.total || 0), muestra_truncada: r.rows.length > 100,
        muestra: r.rows.slice(0, 100).map(({ total, ...fila }) => fila),
        alcance: 'Filas originales del CUIT antes de validar o calcular. La muestra no determina qué filas coinciden con el producto.' };
    });
    informe.motor = await leer('lectura y cálculo del motor vigente', async () => {
      if (!informe.producto_origen.datos) throw errorCliente('Primero debe poder leerse el producto de origen.', 409);
      const ctx = await funciones.contexto(id, client, doc, cfg);
      if (!ctx) throw errorCliente('El cálculo de condiciones no está activo.', 409);
      const p = informe.producto_origen.datos.campos;
      const dimensiones = Object.fromEntries(DIMENSIONES.map(k => [k, normalizarId(p[ctx.cfg.campos['producto_' + k]])]));
      const aplicables = ctx.reglas.filter(r => cascada.coincide(r, dimensiones));
      const [calculado] = await origen.aplicar([p], ctx, true);
      const contextoIva = await funciones.contextoIva(id, client, doc, cfg, cfg.version);
      const [final] = await iva.aplicar([calculado], contextoIva, [p]);
      const { firma, ...detalleIva } = final.iva_catalogo || {};
      const desglose = calculado.descuentos_comerciales;
      return { id_cliente_usado: ctx.cliente.id, general: ctx.cliente.general, adicional: ctx.cliente.extra,
        campos_enlace: ctx.cfg.campos, dimensiones_producto: dimensiones, dimension_vacia: ctx.cfg.dimension_vacia,
        total_condiciones_cliente: ctx.reglas.length, total_aplicables_producto: aplicables.length,
        total_no_aplicables: ctx.reglas.length - aplicables.length,
        condiciones_aplicables: aplicables.slice(0, 100), aplicables_truncadas: aplicables.length > 100,
        muestra_no_aplicables: ctx.reglas.filter(r => !cascada.coincide(r, dimensiones)).slice(0, 10),
        precio_recibido_exacto: p.precio_producto, con_descuentos: desglose.importe,
        pasos: desglose.pasos.slice(0, 100), total_pasos: desglose.total_pasos, pasos_truncados: desglose.pasos.length > 100,
        iva_agregada_por_sistema: !!final.iva_catalogo, iva: final.iva_catalogo ? detalleIva : null, total_catalogo: final.precio_producto,
        pago_anticipado_identificado_automaticamente: false };
    });
    informe.referencias = await leer('claves de condición de venta y lista', async () => {
      const r = await client.query(`SELECT DISTINCT ns.nspname AS esquema,t.relname AS tabla,k.confrelid::text AS objeto_id,
        a.attname AS campo_cliente,b.attname AS clave_destino,has_table_privilege(t.oid,'SELECT') AS permiso_lectura
        FROM pg_constraint k JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=k.conkey[1]
        JOIN pg_attribute b ON b.attrelid=k.confrelid AND b.attnum=k.confkey[1]
        JOIN pg_class t ON t.oid=k.confrelid JOIN pg_namespace ns ON ns.oid=t.relnamespace
        WHERE k.contype='f' AND array_length(k.conkey,1)=1 AND array_length(k.confkey,1)=1
        AND a.attname IN ('fk_id_condicion_venta','fk_id_lista_precio','fk_id_tipo_iva')
        AND EXISTS(SELECT 1 FROM pg_depend d JOIN pg_rewrite w ON w.oid=d.objid
          WHERE d.classid='pg_rewrite'::regclass AND d.refclassid='pg_class'::regclass
          AND d.refobjid=k.conrelid AND w.ev_class='"viewClientes"'::regclass)
        ORDER BY ns.nspname,t.relname,a.attname LIMIT 21`);
      return { enlaces: r.rows.slice(0, 20), truncado: r.rows.length > 20,
        criterio: 'FK de tablas de las que depende viewClientes; no son vínculos nuevos ni se usan para cambiar el cálculo.' };
    });
    informe.valores_referencias = [];
    const enlaces = informe.referencias.datos?.enlaces || [];
    const cliente = informe.cliente_origen.datos;
    for (const enlace of enlaces.slice(0, 6)) {
      const valor = cliente?.[enlace.campo_cliente];
      const destinos = new Set(enlaces.filter(e => e.campo_cliente === enlace.campo_cliente).map(e => [e.esquema, e.tabla, e.clave_destino].join('.')));
      if (valor === null || valor === undefined || destinos.size !== 1 || !enlace.permiso_lectura) {
        informe.valores_referencias.push({ enlace, estado: 'omitido', mensaje: 'Referencia ambigua, sin valor o sin permiso SELECT. No se interpretó automáticamente.' });
        continue;
      }
      const bloque = await leer('valores de ' + enlace.campo_cliente, async () => {
        const columnas = await client.query(`SELECT a.attname AS nombre FROM pg_attribute a WHERE a.attrelid=$1::oid
          AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`, [enlace.objeto_id]);
        const permitidos = columnas.rows.map(c => c.nombre).filter(n => !SENSIBLE.test(n) &&
          (n === enlace.clave_destino || INTERES.test(n) || /^(porc|precio|costo|des_|nom_|nombre$|descripcion$|codigo$|dias)/i.test(n)));
        if (!permitidos.length) throw errorCliente('La referencia no tiene campos aptos para este diagnóstico.', 409);
        const r = await client.query(`SELECT ${seleccion(permitidos.slice(0, 40))} FROM ${citar(enlace.esquema)}.${citar(enlace.tabla)}
          WHERE ${citar(enlace.clave_destino)}::text=$1 LIMIT 2`, [valor]);
        return { filas: r.rows, campos_truncados: permitidos.length > 40 };
      });
      informe.valores_referencias.push({ enlace, ...bloque });
    }
    if (enlaces.length > 6) informe.advertencias.push('Las claves encontradas se incluyen, pero se consultan valores de hasta seis referencias.');

  } catch (e) {
    informe.estado = 'incompleto';
    informe.error_general = { codigo: codigoError(e), mensaje: e.status ? e.message : 'No se pudo completar la lectura. No se modificaron datos.' };
  } finally {
    if (client) {
      let descartar = false;
      try { await client.query('ROLLBACK'); } catch (_) { descartar = true; }
      client.release(descartar);
    }
    informe.duracion_ms = Date.now() - inicio;
  }
  return informe;
}

module.exports = { revisar, REVISION };
