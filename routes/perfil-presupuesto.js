const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();
let tablaLista = null;

function asegurarTabla() {
  if (!tablaLista) {
    tablaLista = pool.query(`
      CREATE TABLE IF NOT EXISTS perfiles_presupuesto_clientes (
        id BIGSERIAL PRIMARY KEY,
        mayorista_id BIGINT NOT NULL,
        cliente_cuit TEXT NOT NULL,
        nombre_comercial TEXT,
        razon_social TEXT,
        cuit TEXT,
        condicion_iva TEXT,
        direccion TEXT,
        telefono TEXT,
        logo_url TEXT,
        logo_ancho NUMERIC DEFAULT 24,
        actualizado_en TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (mayorista_id, cliente_cuit)
      )
    `).catch(error => {
      tablaLista = null;
      throw error;
    });
  }
  return tablaLista;
}

function verificarCliente(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ mensaje: 'Sesión requerida' });
  try {
    const sesion = jwt.verify(token, process.env.JWT_SECRET);
    if (sesion.tipo !== 'cliente' || !sesion.mayorista_id || !sesion.cuit) {
      return res.status(403).json({ mensaje: 'Acceso exclusivo para clientes' });
    }
    req.clienteSesion = sesion;
    next();
  } catch (_) {
    return res.status(401).json({ mensaje: 'Sesión inválida o vencida' });
  }
}

router.use(verificarCliente);

router.get('/', async (req, res) => {
  try {
    await asegurarTabla();
    const { mayorista_id, cuit } = req.clienteSesion;
    const permiso = await pool.query('SELECT permitir_presupuesto_clientes FROM mayoristas WHERE id=$1', [mayorista_id]);
    if (!permiso.rows[0]) return res.status(404).json({ mensaje: 'Mayorista no encontrado' });
    const permitido = permiso.rows[0].permitir_presupuesto_clientes === true;
    const perfil = permitido
      ? await pool.query(`SELECT nombre_comercial, razon_social, cuit, condicion_iva, direccion, telefono, logo_url, logo_ancho
                          FROM perfiles_presupuesto_clientes WHERE mayorista_id=$1 AND cliente_cuit=$2`, [mayorista_id, String(cuit)])
      : { rows: [] };
    res.json({ permitido, perfil: perfil.rows[0] || null });
  } catch (error) {
    console.error('Perfil presupuesto GET:', error.message);
    res.status(500).json({ mensaje: 'Error al cargar datos del presupuesto' });
  }
});

router.put('/', async (req, res) => {
  try {
    await asegurarTabla();
    const { mayorista_id, cuit: cuitSesion } = req.clienteSesion;
    const permiso = await pool.query('SELECT permitir_presupuesto_clientes FROM mayoristas WHERE id=$1', [mayorista_id]);
    if (permiso.rows[0]?.permitir_presupuesto_clientes !== true) {
      return res.status(403).json({ mensaje: 'El mayorista no habilitó esta personalización' });
    }
    const { nombre_comercial, razon_social, cuit, condicion_iva, direccion, telefono, logo_url, logo_ancho } = req.body;
    const ancho = Math.min(50, Math.max(12, Number(logo_ancho) || 24));
    const { rows } = await pool.query(`
      INSERT INTO perfiles_presupuesto_clientes
        (mayorista_id, cliente_cuit, nombre_comercial, razon_social, cuit, condicion_iva, direccion, telefono, logo_url, logo_ancho, actualizado_en)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
      ON CONFLICT (mayorista_id, cliente_cuit) DO UPDATE SET
        nombre_comercial=EXCLUDED.nombre_comercial, razon_social=EXCLUDED.razon_social,
        cuit=EXCLUDED.cuit, condicion_iva=EXCLUDED.condicion_iva, direccion=EXCLUDED.direccion,
        telefono=EXCLUDED.telefono, logo_url=EXCLUDED.logo_url, logo_ancho=EXCLUDED.logo_ancho,
        actualizado_en=NOW()
      RETURNING nombre_comercial, razon_social, cuit, condicion_iva, direccion, telefono, logo_url, logo_ancho
    `, [mayorista_id, String(cuitSesion), nombre_comercial || null, razon_social || null, cuit || null,
        condicion_iva || null, direccion || null, telefono || null, logo_url || null, ancho]);
    res.json({ ok: true, perfil: rows[0] });
  } catch (error) {
    console.error('Perfil presupuesto PUT:', error.message);
    res.status(500).json({ mensaje: 'Error al guardar datos del presupuesto' });
  }
});

module.exports = router;
