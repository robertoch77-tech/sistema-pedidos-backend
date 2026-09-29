const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

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
