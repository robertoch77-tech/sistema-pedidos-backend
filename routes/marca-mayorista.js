const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { randomUUID } = require('node:crypto');
const { rateLimit } = require('express-rate-limit');
const multer = require('multer');
const { crearManifest, rutaLogoCloudinary } = require('../services/ivanManifestCliente');

const router = express.Router();
const MAX_LOGO = 3 * 1024 * 1024;
const recibirLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO, files: 1, fields: 0, parts: 2 },
}).single('logo');
const limitarLogo = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => String(req.mayoristaMarca.id),
  message: { mensaje: 'Ya se hicieron varios intentos de carga. Probá más tarde.' },
});

// Manifiesto exclusivo del cliente Iván. No consulta productos ni permite
// elegir roles, CUIT, destinos arbitrarios o accesos administrativos.
router.get('/publico/:codigo/manifest.json', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const codigo = String(req.params.codigo || '').trim();
    if (!codigo || codigo.length > 100 || /[\u0000-\u001f\u007f]/.test(codigo)) return res.status(400).json({ mensaje: 'Código inválido.' });
    const r = await pool.query(`SELECT nombre,razon_social,logo_url FROM mayoristas
      WHERE codigo=$1 AND activo=true AND tipo_fuente IS DISTINCT FROM 'roberto' LIMIT 1`, [codigo]);
    if (!r.rows[0]) return res.status(404).json({ mensaje: 'Mayorista no encontrado.' });
    const manifest = crearManifest(codigo,
      r.rows[0].razon_social || r.rows[0].nombre, req.query.origen, r.rows[0].logo_url);
    res.type('application/manifest+json').json(manifest);
  } catch (e) { res.status(e.status || 503).json({ mensaje: e.status ? e.message : 'No se pudo preparar la instalación.' }); }
});

function verificarSesionMayorista(req, res, next) {
  const authorization = String(req.headers.authorization || '');
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return res.status(401).json({ mensaje: 'Iniciá sesión para continuar.' });

  try {
    const sesion = jwt.verify(token, process.env.JWT_SECRET);
    if (sesion.tipo === 'cliente' || !Number.isSafeInteger(Number(sesion.id)) || !sesion.email) {
      return res.status(403).json({ mensaje: 'Solo el mayorista puede cambiar su logo.' });
    }
    req.mayoristaMarca = { id: Number(sesion.id), email: String(sesion.email) };
    next();
  } catch {
    return res.status(401).json({ mensaje: 'La sesión venció. Volvé a ingresar.' });
  }
}

router.get('/publico/:codigo', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT logo_url
       FROM mayoristas
       WHERE codigo = $1 AND activo = true
         AND tipo_fuente IS DISTINCT FROM 'roberto'
       LIMIT 1`,
      [String(req.params.codigo || '').trim()]
    );
    if (!resultado.rows[0]) return res.status(404).json({ mensaje: 'Mayorista no encontrado.' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ logo_url: resultado.rows[0].logo_url || '' });
  } catch (error) {
    console.error('marca-mayorista público:', error.message);
    res.status(500).json({ mensaje: 'No se pudo cargar la marca del mayorista.' });
  }
});

router.get('/:id', verificarSesionMayorista, async (req, res) => {
  if (Number(req.params.id) !== req.mayoristaMarca.id) {
    return res.status(403).json({ mensaje: 'No podés ver la marca de otro mayorista.' });
  }
  try {
    const resultado = await pool.query(
      `SELECT logo_url FROM mayoristas
       WHERE id = $1 AND email = $2 AND activo = true
         AND tipo_fuente IS DISTINCT FROM 'roberto'
       LIMIT 1`,
      [req.mayoristaMarca.id, req.mayoristaMarca.email]
    );
    if (!resultado.rows[0]) return res.status(404).json({ mensaje: 'Mayorista no encontrado.' });
    res.json({ logo_url: resultado.rows[0].logo_url || '' });
  } catch (error) {
    console.error('marca-mayorista privada:', error.message);
    res.status(500).json({ mensaje: 'No se pudo cargar el logo.' });
  }
});

async function verificarCuentaParaCarga(req, res, next) {
  const { id, email } = req.mayoristaMarca;
  if (Number(req.params.id) !== id) return res.status(403).json({ mensaje: 'Solo podés cargar el logo de tu cuenta.' });
  try {
    const cuenta = await pool.query(`SELECT 1 FROM mayoristas
      WHERE id=$1 AND email=$2 AND activo=true AND tipo_fuente IS DISTINCT FROM 'roberto'`, [id, email]);
    if (!cuenta.rows.length) return res.status(404).json({ mensaje: 'Mayorista no encontrado.' });
    next();
  } catch { return res.status(503).json({ mensaje: 'No pudimos verificar tu cuenta.' }); }
}

function tipoImagen(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png';
  if (bytes.subarray(0, 3).toString('hex') === 'ffd8ff') return 'image/jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

router.post('/:id/logo', verificarSesionMayorista, verificarCuentaParaCarga, limitarLogo, (req, res, next) => {
  recibirLogo(req, res, error => {
    if (error) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
      .json({ mensaje: 'Elegí una sola imagen PNG, JPG o WebP de hasta 3 MB.' });
    next();
  });
}, async (req, res) => {
  const bytes = req.file?.buffer;
  const mime = tipoImagen(bytes);
  if (!mime) return res.status(400).json({ mensaje: 'Elegí una imagen PNG, JPG o WebP válida.' });

  const { cloudinaryConfig, cloudinaryPost } = require('./imagenes-productos').herramientasImagenes;
  const config = cloudinaryConfig();
  if (!config) return res.status(503).json({ mensaje: 'La carga de archivos requiere configurar Cloudinary para Iván. Si ya tenés el logo en Cloudinary, podés guardar su enlace.' });

  const { id, email } = req.mayoristaMarca;
  const publicId = `ivan_logos/${id}/${randomUUID()}`;
  try {
    const imagen = await cloudinaryPost('image/upload', {
      file: `data:${mime};base64,${bytes.toString('base64')}`,
      public_id: publicId,
      overwrite: 'false',
      allowed_formats: 'png,jpg,jpeg,webp',
      transformation: 'c_limit,w_1024,h_1024',
    }, config);
    if (imagen.public_id !== publicId || rutaLogoCloudinary(imagen.secure_url)?.[1] !== config.cloud + '/image/upload') {
      return res.status(502).json({ mensaje: 'Cloudinary no devolvió una imagen válida. Volvé a intentar.' });
    }
    const resultado = await pool.query(`UPDATE mayoristas SET logo_url=$1
      WHERE id=$2 AND email=$3 AND activo=true AND tipo_fuente IS DISTINCT FROM 'roberto'
      RETURNING logo_url`, [imagen.secure_url, id, email]);
    if (!resultado.rows.length) return res.status(404).json({ mensaje: 'Mayorista no encontrado.' });
    res.json({ logo_url: resultado.rows[0].logo_url });
  } catch {
    res.status(502).json({ mensaje: 'No pudimos subir o guardar el logo. Volvé a intentar.' });
  }
});

router.put('/:id/logo', verificarSesionMayorista, async (req, res) => {
  if (Number(req.params.id) !== req.mayoristaMarca.id) {
    return res.status(403).json({ mensaje: 'No podés cambiar la marca de otro mayorista.' });
  }

  const logoUrl = typeof req.body?.logo_url === 'string' ? req.body.logo_url.trim() : null;
  if (logoUrl === null || logoUrl.length > 1000) {
    return res.status(400).json({ mensaje: 'El enlace del logo no es válido.' });
  }
  if (logoUrl) {
    try {
      const url = new URL(logoUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || !/^\/[^/]+\/image\/upload\//.test(url.pathname)) {
        return res.status(400).json({ mensaje: 'Usá un logo HTTPS cargado en Cloudinary.' });
      }
    } catch {
      return res.status(400).json({ mensaje: 'El enlace del logo no es válido.' });
    }
  }

  try {
    const resultado = await pool.query(
      `UPDATE mayoristas SET logo_url = $1
       WHERE id = $2 AND email = $3 AND activo = true
         AND tipo_fuente IS DISTINCT FROM 'roberto'
       RETURNING logo_url`,
      [logoUrl || null, req.mayoristaMarca.id, req.mayoristaMarca.email]
    );
    if (!resultado.rows[0]) return res.status(404).json({ mensaje: 'Mayorista no encontrado.' });
    res.json({ logo_url: resultado.rows[0].logo_url || '' });
  } catch (error) {
    console.error('marca-mayorista guardar:', error.message);
    res.status(500).json({ mensaje: 'No se pudo guardar el logo.' });
  }
});

module.exports = router;
