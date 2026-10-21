const pool = require('../db');
const conexion = require('./conexionMayorista');
const { errorCliente } = require('./ivanImagenesDatos');
const estructuras = new WeakMap();
const columnas = ['catalogo_bultos_habilitados', 'bultos_campo', 'bultos_revision'];
const vacia = () => ({ disponible: false, habilitado: false, campo: null, revision: 0 });
function identificador(campo) {
  if (typeof campo !== 'string' || !campo || Buffer.byteLength(campo, 'utf8') > 63 || campo.includes('\0')) throw errorCliente('Campo de unidades por bulto inválido.');
  return '"' + campo.replace(/"/g, '""') + '"';
}
async function leer(id) {
  try {
    const r = await pool.query(`SELECT
      COALESCE((to_jsonb(f)->>'catalogo_bultos_habilitados')::boolean,false) AS habilitado,
      to_jsonb(f)->>'bultos_campo' AS campo,
      COALESCE((to_jsonb(f)->>'bultos_revision')::bigint,0) AS revision,
      (SELECT count(*)=3 FROM pg_attribute WHERE attrelid='public.ivan_funciones_config'::regclass
       AND attname=ANY($2::text[]) AND NOT attisdropped) AS disponible
      FROM mayoristas m LEFT JOIN public.ivan_funciones_config f ON f.mayorista_id=m.id
      WHERE m.id=$1 AND COALESCE(m.tipo_fuente,'ivan')<>'roberto'`, [id, columnas]);
    return r.rows[0] ? { ...r.rows[0], revision: Number(r.rows[0].revision) } : vacia();
  } catch (e) { if (e.code === '42P01') return vacia(); throw e; }
}
async function publica(id) {
  try { const c = await leer(id); return { bultos_habilitados: c.disponible && c.habilitado }; }
  catch { return { bultos_habilitados: false }; }
}
async function camposDisponibles(db, refrescar = false) {
  const cache = estructuras.get(db);
  if (!refrescar && cache && Date.now() - cache.fecha < 60000) return cache.campos;
  const r = await db.query('SELECT * FROM "viewProductos" LIMIT 0');
  if (!Array.isArray(r.fields)) throw errorCliente('No se pudo consultar la estructura del catálogo.', 503);
  const tipos = new Set([20, 21, 23, 700, 701, 1700]);
  const otros = [...new Set(r.fields.map(f => f.dataTypeID).filter(t => !tipos.has(t)))];
  if (otros.length) {
    const t = await db.query("SELECT oid FROM pg_type WHERE oid=ANY($1::oid[]) AND typcategory='N'", [otros]);
    t.rows.forEach(f => tipos.add(Number(f.oid)));
  }
  const campos = r.fields.filter(f => tipos.has(f.dataTypeID)).map(f => f.name);
  estructuras.set(db, { campos, fecha: Date.now() });
  return campos;
}
async function guardar(id, datos) {
  if (typeof datos?.habilitado !== 'boolean' || !Number.isSafeInteger(datos.revision) || datos.revision < 0) throw errorCliente('Configuración inválida. Recargá este mayorista.');
  const campo = datos.campo === null || datos.campo === '' ? null : datos.campo;
  if (campo !== null) identificador(campo);
  if (!(await leer(id)).disponible) throw errorCliente('Falta aplicar el SQL de unidades por bulto.', 503);
  if (datos.habilitado) {
    if (!campo) throw errorCliente('Elegí el campo real de unidades por bulto antes de habilitar.');
    const db = await conexion.getConexionMayorista(id);
    if (!db || !(await camposDisponibles(db, true)).includes(campo)) throw errorCliente('Ese campo numérico no está disponible en viewProductos. No se habilitó la función.', 409);
  }
  const r = await pool.query(`INSERT INTO public.ivan_funciones_config AS f
      (mayorista_id,catalogo_bultos_habilitados,bultos_campo,bultos_revision)
      SELECT $1,$2,$3,1 WHERE $4::bigint=0 OR EXISTS(SELECT 1 FROM public.ivan_funciones_config WHERE mayorista_id=$1)
      ON CONFLICT(mayorista_id) DO UPDATE SET catalogo_bultos_habilitados=EXCLUDED.catalogo_bultos_habilitados,
        bultos_campo=EXCLUDED.bultos_campo,bultos_revision=f.bultos_revision+1,actualizado_en=now()
      WHERE f.bultos_revision=$4::bigint RETURNING bultos_revision AS revision`, [id, datos.habilitado, campo, datos.revision]);
  if (!r.rowCount) throw errorCliente('Otra sesión cambió esta configuración. Recargá antes de guardar; no se sobrescribieron cambios.', 409);
  return { disponible: true, habilitado: datos.habilitado, campo, revision: Number(r.rows[0].revision) };
}
function multiplo(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === '') return 1;
  const n = Number(valor);
  if (n === 0 || n === 1) return 1;
  return Number.isSafeInteger(n) && n > 1 ? n : null;
}
async function reglas(id, ids, config) {
  const c = config || await leer(id);
  if (!c.disponible || !c.habilitado) return { habilitado: false, reglas: [] };
  if (!c.campo) throw errorCliente('El mayorista debe configurar el campo de unidades por bulto.', 503);
  const unicos = [...new Set(ids.map(String))];
  if (!unicos.every(v => /^[1-9][0-9]*$/.test(v) && v.length <= 19)) throw errorCliente('Hay productos sin identificar. Actualizá el catálogo.', 409);
  if (!unicos.length) return { habilitado: true, reglas: [] };
  const db = await conexion.getConexionMayorista(id);
  if (!db || !(await camposDisponibles(db)).includes(c.campo)) throw errorCliente('No se pudo comprobar el campo de unidades por bulto. No se envió el pedido.', 503);
  const r = await db.query(`SELECT id_producto, ${identificador(c.campo)}::text AS unidades_bulto
    FROM "viewProductos" WHERE id_producto=ANY($1::bigint[])`, [unicos]);
  const porId = new Map(r.rows.map(f => [String(f.id_producto), multiplo(f.unidades_bulto)]));
  return { habilitado: true, reglas: unicos.map(producto_id => ({ producto_id, multiplo: porId.has(producto_id) ? porId.get(producto_id) : null })) };
}
// Solo lectura y antes de cualquier escritura de pedidos. No cambia cantidades,
// importes, promociones, numeración ni la integración de entrega a Iván.
async function validarPedido(id, items) {
  try {
    const c = await leer(id);
    if (!c.disponible || !c.habilitado) return null;
    if (!Array.isArray(items)) return { status: 400, codigo: 'BULTOS_INVALIDOS', mensaje: 'No se pudo comprobar la lista de productos.' };
    const datos = await reglas(id, items.map(i => i.producto_id), c);
    const porId = new Map(datos.reglas.map(r => [r.producto_id, r.multiplo]));
    for (const item of items) {
      const paso = porId.get(String(item.producto_id));
      const codigo = String(item.codigo || item.producto_id).slice(0, 100);
      if (paso === null || paso === undefined) return { status: 409, codigo: 'BULTOS_INVALIDOS', mensaje: 'No se pudo comprobar el bulto del producto ' + codigo + '. Actualizá el catálogo o consultá al mayorista.' };
      if (paso > 1 && (!Number.isSafeInteger(Number(item.cantidad)) || Number(item.cantidad) <= 0 || Number(item.cantidad) % paso !== 0)) return { status: 400, codigo: 'BULTOS_INVALIDOS', mensaje: 'El producto ' + codigo + ' se pide en múltiplos de ' + paso + '. Corregí su cantidad antes de guardar o enviar.' };
    }
    return null;
  } catch (e) {
    console.error('[IVAN_BULTOS] No se pudieron validar cantidades.', /^[0-9A-Z]{5}$/.test(e.code || '') ? e.code : 'NO_DISPONIBLE');
    return { status: e.status || 503, codigo: 'BULTOS_NO_DISPONIBLES', mensaje: e.status ? e.message : 'No se pudieron comprobar los bultos. El pedido no se guardó; intentá nuevamente más tarde.' };
  }
}
module.exports = { leer, publica, camposDisponibles, guardar, reglas, validarPedido };
