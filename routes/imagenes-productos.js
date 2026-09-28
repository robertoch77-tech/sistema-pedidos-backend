const express = require('express');
const crypto = require('crypto');
const dns = require('dns').promises;
const https = require('https');
const net = require('net');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const conexionCompartida = require('../services/conexionMayorista');

const router = express.Router();
const MAX_OPERACIONES_30_DIAS = 20;
const MAX_COPIAS = 20;
const MAX_IMAGEN_BYTES = 8 * 1024 * 1024;

async function validarMayorista(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ mensaje: 'Iniciá sesión como mayorista para administrar imágenes.' });
  try {
    const sesion = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (sesion.tipo !== undefined || sesion.mayorista_id !== undefined || !sesion.email || !Number.isSafeInteger(Number(sesion.id)) || Number(sesion.id) <= 0 || Number(sesion.id) !== Number(req.params.mayorista_id)) {
      return res.status(403).json({ mensaje: 'No tenés permiso para administrar estas imágenes.' });
    }
    const activo = await pool.query("SELECT id FROM mayoristas WHERE id=$1 AND activo=true AND email=$2 AND COALESCE(tipo_fuente,'ivan') <> 'roberto'", [Number(sesion.id), sesion.email]);
    if (!activo.rowCount) return res.status(403).json({ mensaje: 'La cuenta mayorista no está activa.' });
    req.mayoristaSesion = sesion;
    next();
  } catch (_) {
    return res.status(401).json({ mensaje: 'La sesión venció. Volvé a iniciar sesión.' });
  }
}

function cloudinaryConfig() {
  // Iván-only variables: never reuse generic Cloudinary settings from shared services.
  let cloud = process.env.IVAN_CLOUDINARY_CLOUD_NAME;
  let key = process.env.IVAN_CLOUDINARY_API_KEY;
  let secret = process.env.IVAN_CLOUDINARY_API_SECRET;
  if ((!cloud || !key || !secret) && process.env.IVAN_CLOUDINARY_URL) {
    try {
      const parsed = new URL(process.env.IVAN_CLOUDINARY_URL);
      if (parsed.protocol !== 'cloudinary:' || !parsed.hostname || !parsed.username || !parsed.password) return null;
      cloud ||= parsed.hostname;
      key ||= decodeURIComponent(parsed.username);
      secret ||= decodeURIComponent(parsed.password);
    } catch (_) { return null; }
  }
  if (!cloud || !key || !secret) return null;
  return { cloud, key, secret };
}

function firma(params, secret) {
  const base = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  return crypto.createHash('sha1').update(base + secret).digest('hex');
}

function ipv4Publica(value) {
  if (!net.isIPv4(value)) return false;
  const [a, b] = value.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && (b === 0 || b === 2)) || (a === 198 && b === 51) || (a === 203 && b === 0) || (a === 198 && (b === 18 || b === 19)));
}

async function descargarImagenPublica(urlTexto) {
  let url;
  try { url = new URL(urlTexto); } catch (_) { throw new Error('La imagen de origen no tiene una dirección válida.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') {
    throw new Error('Por seguridad, solo se procesan imágenes HTTPS públicas.');
  }
  const direcciones = await dns.lookup(url.hostname, { family: 4, all: true, verbatim: true });
  const ipv4 = direcciones.filter(x => net.isIPv4(x.address));
  if (!ipv4.length || direcciones.some(x => !net.isIPv4(x.address) || !ipv4Publica(x.address))) {
    throw new Error('No se pudo validar el servidor de la imagen como público.');
  }
  const address = ipv4[0].address;
  const agent = new https.Agent({ lookup: (_host, opts, cb) => opts && opts.all ? cb(null, [{ address, family: 4 }]) : cb(null, address, 4) });
  const response = await axios.get(url.href, {
    proxy: false, responseType: 'arraybuffer', timeout: 15000, maxRedirects: 0,
    maxContentLength: MAX_IMAGEN_BYTES, httpsAgent: agent,
    validateStatus: status => status >= 200 && status < 300,
  });
  const mime = String(response.headers['content-type'] || '').split(';')[0].toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
    throw new Error('Formato no compatible. Usá una imagen JPG, PNG o WebP.');
  }
  const buffer = Buffer.from(response.data);
  if (!buffer.length || buffer.length > MAX_IMAGEN_BYTES) throw new Error('La imagen supera el límite de 8 MB.');
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function cloudinaryPost(path, params, config) {
  const firmado = { ...params, timestamp: Math.floor(Date.now() / 1000) };
  const parametrosFirma = { ...firmado };
  delete parametrosFirma.file;
  const body = new URLSearchParams({ ...Object.fromEntries(Object.entries(firmado).map(([k, v]) => [k, String(v)])), api_key: config.key, signature: firma(parametrosFirma, config.secret) });
  const response = await axios.post(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloud)}/${path}`, body, {
    maxRedirects: 0, proxy: false, timeout: 60000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, maxBodyLength: 14 * 1024 * 1024,
  });
  return response.data;
}

async function consultarProducto(mayoristaId, productoId) {
  const conexion = await conexionCompartida.getConexionMayorista(mayoristaId);
  if (!conexion) throw new Error('No hay conexión de catálogo para este mayorista.');
  const result = await conexion.query(
    `SELECT id_producto, cod_producto, des_producto, imagen_producto
     FROM "viewProductos" WHERE id_producto=$1 LIMIT 1`, [productoId]
  );
  return result.rows[0] || null;
}

function codigoDiagnosticoSeguro(error) {
  const mensaje = String(error?.message || '');
  const conocidos = [
    [/producto_no_encontrado/i, 'producto_no_encontrado'],
    [/sin_original/i, 'producto_sin_imagen'],
    [/No hay conexión de catálogo/i, 'catalogo_sin_conexion'],
    [/dirección válida/i, 'url_invalida'],
    [/solo se procesan imágenes HTTPS/i, 'url_no_https'],
    [/validar el servidor.*público/i, 'servidor_no_publico'],
    [/Formato no compatible/i, 'formato_no_compatible'],
    [/supera el límite de 8 MB/i, 'imagen_supera_8mb'],
    [/respuesta_proveedor_invalida/i, 'respuesta_proveedor_invalida'],
  ];
  const coincidencia = conocidos.find(([patron]) => patron.test(mensaje));
  if (coincidencia) return coincidencia[1];
  if (typeof error?.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(error.code)) return error.code;
  if (Number.isInteger(error?.response?.status)) return 'http_' + error.response.status;
  return 'no_clasificado';
}

const ESTADOS_COPIA = "('procesando','pendiente','aprobada','revisar','eliminando')";
const TRANSFORMACION = 'c_limit,w_1200,h_1200/e_contrast:10/e_sharpen:60';
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
async function cupos(db, id) {
  const result = await db.query(
    "SELECT COUNT(*) FILTER (WHERE creado_en > now() - interval '30 days')::int AS operaciones_usadas," +
    " COUNT(*) FILTER (WHERE estado IN " + ESTADOS_COPIA + ")::int AS copias_guardadas" +
    " FROM ivan_imagen_producto_procesos WHERE mayorista_id=$1", [id]);
  return { ...result.rows[0], operaciones_limite: MAX_OPERACIONES_30_DIAS, copias_limite: MAX_COPIAS };
}
router.use('/:mayorista_id', validarMayorista);
router.get('/:mayorista_id/cupos', asyncRoute(async (req, res) => {
  res.json({ ...await cupos(pool, Number(req.params.mayorista_id)), disponible: !!cloudinaryConfig() });
}));
router.get('/:mayorista_id', asyncRoute(async (req, res) => {
  const result = await pool.query(
    "SELECT id, producto_id, codigo_producto, descripcion, imagen_original_url," +
    " imagen_mejorada_url, estado, creado_en FROM ivan_imagen_producto_procesos" +
    " WHERE mayorista_id=$1 AND estado IN " + ESTADOS_COPIA + " ORDER BY creado_en DESC",
    [Number(req.params.mayorista_id)]);
  res.json({ imagenes: result.rows });
}));
router.post('/:mayorista_id/:producto_id/procesar', asyncRoute(async (req, res) => {
  const config = cloudinaryConfig();
  if (!config) return res.status(503).json({ mensaje: 'Herramienta no disponible. Consultá al administrador; no se consumió cupo.' });
  const mayoristaId = Number(req.params.mayorista_id);
  const productoId = Number(req.params.producto_id);
  const solicitud = String(req.headers['idempotency-key'] || '');
  if (!Number.isSafeInteger(productoId) || productoId <= 0 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(solicitud)) {
    return res.status(400).json({ mensaje: 'Producto o identificador de solicitud inválido.' });
  }
  // Reserve before external I/O; serialize quota checks by tenant.
  const client = await pool.connect();
  let proceso;
  const publicId = 'sistema-pedidos/ivan-mejoras/' + mayoristaId + '/' + crypto.randomUUID();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(72819, $1::integer)', [mayoristaId]);
    const anterior = await client.query(
      'SELECT id, producto_id, estado FROM ivan_imagen_producto_procesos WHERE mayorista_id=$1 AND solicitud_id=$2',
      [mayoristaId, solicitud]);
    if (anterior.rows[0]) {
      await client.query('ROLLBACK');
      const row = anterior.rows[0];
      if (String(row.producto_id) !== String(productoId)) return res.status(409).json({ mensaje: 'La solicitud pertenece a otro producto.' });
      return res.status(200).json({ id: row.id, estado: row.estado, mensaje: 'Solicitud ya registrada. Consultá el estado; no se repitió el procesamiento.' });
    }
    const cuotas = await cupos(client, mayoristaId);
    if (cuotas.operaciones_usadas >= MAX_OPERACIONES_30_DIAS || cuotas.copias_guardadas >= MAX_COPIAS) {
      await client.query('ROLLBACK');
      return res.status(429).json({ mensaje: 'Cupo alcanzado: hasta 20 intentos en 30 días y 20 copias conservadas. No se inició otra operación.' });
    }
    const existing = await client.query(
      'SELECT id FROM ivan_imagen_producto_procesos WHERE mayorista_id=$1 AND producto_id=$2 AND estado IN ' + ESTADOS_COPIA,
      [mayoristaId, productoId]);
    if (existing.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ mensaje: 'El producto ya tiene una copia o un proceso pendiente. Revisalo antes de generar otra mejora.' });
    }
    const inserted = await client.query(
      "INSERT INTO ivan_imagen_producto_procesos (mayorista_id, producto_id, solicitud_id, cloudinary_public_id, estado)" +
      " VALUES ($1,$2,$3,$4,'procesando') RETURNING id", [mayoristaId, productoId, solicitud, publicId]);
    proceso = inserted.rows[0].id;
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
  let uploadIniciado = false;
  let uploadConfirmado = false;
  let etapaFallida = 'consulta_producto';
  try {
    const producto = await consultarProducto(mayoristaId, productoId);
    if (!producto) throw new Error('producto_no_encontrado');
    if (!producto.imagen_producto) throw new Error('sin_original');
    etapaFallida = 'guardar_referencia_original';
    await pool.query(
      'UPDATE ivan_imagen_producto_procesos SET codigo_producto=$1, descripcion=$2, imagen_original_url=$3 WHERE id=$4 AND mayorista_id=$5',
      [producto.cod_producto, producto.des_producto, producto.imagen_producto, proceso, mayoristaId]);
    etapaFallida = 'descargar_validar_original';
    const file = await descargarImagenPublica(producto.imagen_producto);
    etapaFallida = 'cloudinary_upload';
    uploadIniciado = true;
    const asset = await cloudinaryPost('image/upload', {
      file, public_id: publicId, overwrite: 'false', transformation: TRANSFORMACION,
    }, config);
    uploadConfirmado = true;
    if (asset.public_id !== publicId || !asset.secure_url ||
        !asset.secure_url.startsWith('https://res.cloudinary.com/' + config.cloud + '/image/upload/')) {
      throw new Error('respuesta_proveedor_invalida');
    }
    etapaFallida = 'guardar_resultado';
    await pool.query(
      "UPDATE ivan_imagen_producto_procesos SET imagen_mejorada_url=$1, estado='pendiente', actualizado_en=now()" +
      " WHERE id=$2 AND mayorista_id=$3 AND estado='procesando'", [asset.secure_url, proceso, mayoristaId]);
    return res.status(201).json({ id: proceso, mensaje: 'Vista previa lista. Aprobala para usar la copia en el catálogo.' });
  } catch (error) {
    const etapa = uploadIniciado ? 'cloudinary_upload' : etapaFallida;
    console.error('[IVAN_IMAGENES] Falló el procesamiento', { etapa, codigo: codigoDiagnosticoSeguro(error) });
    let estado = uploadIniciado ? 'revisar' : 'error';
    if (uploadConfirmado) {
      try {
        const deleted = await cloudinaryPost('image/destroy', { public_id: publicId, invalidate: 'true' }, config);
        if (['ok', 'not found'].includes(deleted.result)) estado = 'error';
      } catch (_) { /* Keep the slot; never assume deletion. */ }
    }
    await pool.query(
      "UPDATE ivan_imagen_producto_procesos SET estado=$1, error_codigo='procesamiento_fallido', actualizado_en=now()" +
      ' WHERE id=$2 AND mayorista_id=$3', [estado, proceso, mayoristaId]).catch(() => {});
    return res.status(502).json({ mensaje: estado === 'revisar'
      ? 'Resultado incierto del proveedor. El cupo queda reservado; contactá al administrador. No vuelvas a procesar este producto.'
      : 'No se pudo mejorar la imagen. El intento cuenta dentro del límite de 30 días; el original sigue intacto.' });
  }
}));
router.post('/:mayorista_id/:id/aprobar', asyncRoute(async (req, res) => {
  const result = await pool.query(
    "UPDATE ivan_imagen_producto_procesos SET estado='aprobada', actualizado_en=now()" +
    " WHERE id=$1 AND mayorista_id=$2 AND estado IN ('pendiente','aprobada') AND imagen_mejorada_url IS NOT NULL RETURNING id",
    [req.params.id, Number(req.params.mayorista_id)]);
  if (!result.rowCount) return res.status(404).json({ mensaje: 'La vista previa no está disponible.' });
  res.json({ ok: true, mensaje: 'Copia aprobada para el catálogo. La imagen de Iván permanece intacta.' });
}));
router.delete('/:mayorista_id/:id', asyncRoute(async (req, res) => {
  const config = cloudinaryConfig();
  if (!config) return res.status(503).json({ mensaje: 'Herramienta no disponible; consultá al administrador.' });
  const mayoristaId = Number(req.params.mayorista_id);
  const result = await pool.query(
    "UPDATE ivan_imagen_producto_procesos SET estado='eliminando', actualizado_en=now()" +
    " WHERE id=$1 AND mayorista_id=$2 AND estado IN ('pendiente','aprobada','eliminando') RETURNING id, cloudinary_public_id",
    [req.params.id, mayoristaId]);
  const row = result.rows[0];
  if (!row) return res.status(404).json({ mensaje: 'La copia no está disponible para eliminar.' });
  try {
    const deleted = await cloudinaryPost('image/destroy', { public_id: row.cloudinary_public_id, invalidate: 'true' }, config);
    if (!['ok', 'not found'].includes(deleted.result)) throw new Error('eliminacion_no_confirmada');
    await pool.query(
      "UPDATE ivan_imagen_producto_procesos SET estado='eliminada', cloudinary_public_id=NULL," +
      " imagen_mejorada_url=NULL, actualizado_en=now() WHERE id=$1 AND mayorista_id=$2 AND estado='eliminando'", [row.id, mayoristaId]);
    res.json({ ok: true, mensaje: 'Copia eliminada. Se recupera el original al recargar; el intento consumido no se reintegra.' });
  } catch (_) {
    res.status(502).json({ mensaje: 'El catálogo usa el original, pero no se confirmó la eliminación. Reintentá eliminar: el cupo sigue reservado.' });
  }
}));
router.use((error, req, res, next) => {
  res.status(503).json({ mensaje: 'Herramienta de imágenes no disponible. Consultá al administrador.' });
});
module.exports = router;
