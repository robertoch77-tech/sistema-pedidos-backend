'use strict';
const pool = require('../db');
const conexion = require('./conexionMayorista');
const servicio = require('./ivanDescuentosComerciales');
const reglas = require('./ivanDescuentosReglas');
const { idSeguro } = require('./ivanImagenesDatos');
const ivaCatalogo=require('./ivanIvaCatalogo');
const {aplicarPreciosCatalogo}=require('./precioCatalogoMayorista');
const {obtenerDescuentoItems}=require('./descuentoClienteIvan');

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

async function seleccionarProductos(id, consulta) {
  const q=String(consulta.q||'').trim(),pagina=Number(consulta.pagina||1),todos=consulta.todos==='1';
  if(q.length>80||!Number.isSafeInteger(pagina)||pagina<1||pagina>1000000)throw reglas.error('Filtro o página de productos inválidos.');
  const db=await conexion.getConexionMayorista(id);
  if(!db)throw reglas.error('El catálogo de este mayorista no está disponible.',503);
  const patron='%'+q.replace(/[ñÑáéíóúÁÉÍÓÚ\uFFFD]/g,'_')+'%';
  const filtro='cod_producto ILIKE $1 OR des_producto ILIKE $1';
  if(todos){
    const r=await db.query(`SELECT id_producto,cod_producto,des_producto FROM "viewProductos" WHERE ${filtro} ORDER BY cod_producto,id_producto LIMIT 301`,[patron]);
    if(r.rows.length>300)throw reglas.error('El filtro supera 300 productos. Acotá la búsqueda para seleccionar todos sus resultados.');
    return {productos:r.rows,total:r.rows.length,pagina:1,totalPaginas:1};
  }
  const cuenta=await db.query(`SELECT COUNT(*)::integer AS total FROM "viewProductos" WHERE ${filtro}`,[patron]);
  const total=Number(cuenta.rows[0]?.total||0),totalPaginas=Math.ceil(total/50),actual=Math.min(pagina,Math.max(1,totalPaginas));
  const r=await db.query(`SELECT id_producto,cod_producto,des_producto FROM "viewProductos" WHERE ${filtro} ORDER BY cod_producto,id_producto LIMIT 50 OFFSET $2`,[patron,(actual-1)*50]);
  return {productos:r.rows,total,pagina:actual,totalPaginas};
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
  let detalleIva=null;
  const ctx=await ivaCatalogo.contexto(id,db,documento);
  if(ctx){
    const actuales=desglose?[{...producto,precio_producto:desglose.importe}]:aplicarPreciosCatalogo([producto],{modelo_precio_catalogo:'precio_recibido',dto_pago_termino:ctx.dtoPago,descuento_items_pct:await obtenerDescuentoItems(db,id,documento)});
    const [conIva]=await ivaCatalogo.aplicar(actuales,ctx,[producto]);const {firma,...detalle}=conIva.iva_catalogo;detalleIva=detalle;
  }
  return {
    version: Number(cfg.version), activo: cfg.activo, aplicada: (!!desglose && cfg.activo)||(!desglose&&!!detalleIva),
    cliente: { cuit: documento, nombre: clientes.rows[0].nombre },
    producto: { id: producto.id_producto, codigo: producto.cod_producto, descripcion: producto.des_producto },
    desglose,iva_catalogo:detalleIva,
    mensaje: !condicion ? detalleIva?'Este cliente no tiene un perfil nuevo asignado. Se muestra el precio de su circuito vigente con el IVA elegido expresamente.':'Este cliente conserva su circuito actual: no tiene una condición comercial asignada. No se muestra un precio calculado con este módulo.'
      : cfg.activo ? 'Esta condición se aplica al precio normal en nuevas consultas del catálogo de este cliente.'
        : 'Condición guardada sin aplicar. Este sería su precio al activarla; el catálogo mantiene su circuito actual.'
  };
}
module.exports = { buscarProductos, seleccionarProductos, consultar };
