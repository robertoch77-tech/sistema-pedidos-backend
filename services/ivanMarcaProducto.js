const { TextDecoder } = require('util');
const pool = require('../db');
const conexion = require('./conexionMayorista');
const { errorCliente } = require('./ivanImagenesDatos');

const COLUMNAS = ['catalogo_marca_producto_habilitada', 'marca_producto_campo', 'marca_producto_logos', 'marca_producto_revision'];
const estructuras = new WeakMap();
const vacia = () => ({ disponible: false, habilitado: false, campo: null, logos: [], revision: 0 });
const claveMarca = nombre => nombre.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
function identificador(campo) {
  if (typeof campo !== 'string' || !campo || Buffer.byteLength(campo, 'utf8') > 63 || campo.includes('\0')) throw errorCliente('Campo de marca inválido.');
  return '"' + campo.replace(/"/g, '""') + '"';
}
function validarLogos(logos) {
  if (!Array.isArray(logos) || logos.length > 200 || Buffer.byteLength(JSON.stringify(logos), 'utf8') > 48 * 1024) throw errorCliente('La lista admite hasta 200 logos y 48 KB en total.');
  const nombres = new Set();
  const normalizados = logos.map(logo => {
    if (!logo || typeof logo.marca !== 'string' || !logo.marca.trim() || logo.marca.length > 120 || typeof logo.url !== 'string' || logo.url.length > 1000) throw errorCliente('Cada logo necesita una marca y una URL HTTPS válida.');
    const marca = logo.marca.trim();
    let url;
    try { url = new URL(logo.url); } catch { throw errorCliente('El logo de ' + marca + ' necesita una URL HTTPS válida.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 1000) throw errorCliente('El logo de ' + marca + ' debe usar HTTPS sin credenciales y hasta 1000 caracteres.');
    const clave = claveMarca(marca);
    if (nombres.has(clave)) throw errorCliente('La marca ' + marca + ' está repetida en los logos.');
    nombres.add(clave);
    return { marca, url: url.href };
  });
  if (Buffer.byteLength(JSON.stringify(normalizados), 'utf8') > 48 * 1024) throw errorCliente('La lista de logos supera los 48 KB. Usá URLs más cortas o menos logos.');
  return normalizados;
}
async function leer(id) {
  try {
    const r = await pool.query(`SELECT
      COALESCE((to_jsonb(f)->>'catalogo_marca_producto_habilitada')::boolean, false) AS habilitado,
      to_jsonb(f)->>'marca_producto_campo' AS campo,
      COALESCE(to_jsonb(f)->'marca_producto_logos', '[]'::jsonb) AS logos,
      COALESCE((to_jsonb(f)->>'marca_producto_revision')::bigint, 0) AS revision,
      (SELECT count(*) = 4 FROM pg_attribute WHERE attrelid = 'public.ivan_funciones_config'::regclass
        AND attname = ANY($2::text[]) AND NOT attisdropped) AS disponible
      FROM mayoristas m LEFT JOIN public.ivan_funciones_config f ON f.mayorista_id=m.id
      WHERE m.id=$1 AND COALESCE(m.tipo_fuente,'ivan') <> 'roberto'`, [id, COLUMNAS]);
    const cfg = r.rows[0];
    return cfg ? { ...cfg, revision: Number(cfg.revision), logos: validarLogos(cfg.logos) } : vacia();
  } catch (e) {
    if (e.code === '42P01') return vacia();
    throw e;
  }
}
async function camposDisponibles(db, refrescar = false) {
  const cache = estructuras.get(db);
  if (!refrescar && cache && Date.now() - cache.fecha < 60000) return cache.campos;
  const r = await db.query('SELECT * FROM "viewProductos" LIMIT 0');
  if (!Array.isArray(r.fields)) throw errorCliente('No se pudo consultar la estructura del catálogo.', 503);
  const tiposTexto = new Set([25, 1042, 1043]);
  const otros = [...new Set(r.fields.map(f => f.dataTypeID).filter(t => !tiposTexto.has(t)))];
  if (otros.length) {
    const tipos = await db.query("SELECT oid FROM pg_type WHERE oid=ANY($1::oid[]) AND typcategory='S'", [otros]);
    tipos.rows.forEach(t => tiposTexto.add(Number(t.oid)));
  }
  const campos = r.fields.filter(f => tiposTexto.has(f.dataTypeID)).map(f => f.name);
  estructuras.set(db, { campos, fecha: Date.now() });
  return campos;
}
async function guardar(id, datos) {
  if (typeof datos?.habilitado !== 'boolean' || !Number.isSafeInteger(datos.revision) || datos.revision < 0) throw errorCliente('Configuración inválida. Recargá este mayorista.');
  const campo = datos.campo === null || datos.campo === '' ? null : datos.campo;
  if (campo !== null) identificador(campo);
  const logos = validarLogos(datos.logos);
  if (!(await leer(id)).disponible) throw errorCliente('Falta aplicar el SQL de marca del producto. No se guardaron cambios.', 503);
  if (datos.habilitado) {
    if (!campo) throw errorCliente('Antes de habilitar, elegí el campo real de la marca del producto.');
    const db = await conexion.getConexionMayorista(id);
    if (!db || !(await camposDisponibles(db, true)).includes(campo)) throw errorCliente('El campo elegido no está disponible como texto en viewProductos. No se habilitó la función.', 409);
  }
  const r = await pool.query(`INSERT INTO public.ivan_funciones_config AS f
      (mayorista_id, catalogo_marca_producto_habilitada, marca_producto_campo, marca_producto_logos, marca_producto_revision)
      SELECT $1,$2,$3,$4::jsonb,1 WHERE $5::bigint=0 OR EXISTS(SELECT 1 FROM public.ivan_funciones_config WHERE mayorista_id=$1)
      ON CONFLICT(mayorista_id) DO UPDATE SET
        catalogo_marca_producto_habilitada=EXCLUDED.catalogo_marca_producto_habilitada,
        marca_producto_campo=EXCLUDED.marca_producto_campo, marca_producto_logos=EXCLUDED.marca_producto_logos,
        marca_producto_revision=f.marca_producto_revision+1, actualizado_en=now()
      WHERE f.marca_producto_revision=$5::bigint RETURNING marca_producto_revision AS revision`,
    [id, datos.habilitado, campo, JSON.stringify(logos), datos.revision]);
  if (!r.rowCount) throw errorCliente('Otra sesión modificó esta configuración. Recargá antes de guardar; no se sobrescribieron sus cambios.', 409);
  return { disponible: true, habilitado: datos.habilitado, campo, logos, revision: Number(r.rows[0].revision) };
}
async function aplicarMarcaProducto(productos, id) {
  if (!productos.length) return productos;
  try {
    const cfg = await leer(id);
    if (!cfg.disponible || !cfg.habilitado || !cfg.campo) return productos;
    const db = await conexion.getConexionMayorista(id);
    if (!db || !(await camposDisponibles(db)).includes(cfg.campo)) return productos;
    const ids = [...new Set(productos.map(p => String(p.id_producto)))];
    if (!ids.every(v => /^\d+$/.test(v))) return productos;
    const r = await db.query(`SELECT id_producto, current_setting('client_encoding') AS codificacion,
      encode(convert_to(${identificador(cfg.campo)}::text, current_setting('client_encoding')::name), 'base64') AS marca_b64
      FROM "viewProductos" WHERE id_producto=ANY($1::bigint[])`, [ids]);
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const logos = new Map(cfg.logos.map(logo => [claveMarca(logo.marca), logo.url]));
    const marcas = new Map(r.rows.map(f => {
      if (typeof f.marca_b64 !== 'string') return [String(f.id_producto), null];
      const bytes = Buffer.from(f.marca_b64, 'base64');
      let nombre;
      if (f.codificacion === 'LATIN1') nombre = bytes.toString('latin1').trim();
      else if (f.codificacion === 'UTF8') nombre = decoder.decode(bytes).trim();
      else throw new Error('Codificación de presentación no admitida');
      return [String(f.id_producto), nombre ? { marca_producto_nombre: nombre, marca_producto_logo_url: logos.get(claveMarca(nombre)) || null } : null];
    }));
    return productos.map(p => ({ ...p, ...marcas.get(String(p.id_producto)) }));
  } catch (e) {
    console.error('[IVAN_MARCA_PRODUCTO] No se pudo aplicar la presentación.', /^[0-9A-Z]{5}$/.test(e.code || '') ? e.code : 'NO_DISPONIBLE');
    return productos;
  }
}
module.exports = { leer, guardar, camposDisponibles, aplicarMarcaProducto };
