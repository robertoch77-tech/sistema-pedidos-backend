'use strict';

const pool = require('../db');
const { errorCliente } = require('./ivanImagenesDatos');
const { getConexionMayorista } = require('./conexionMayorista');

const CODIGO_LUMAC = 'lumac_sas_1787930168848';
const CUENTA_LUMAC = "id = $1 AND codigo = $2 AND activo = true AND tipo_fuente IS DISTINCT FROM 'roberto'";

async function leer(id, incluirDisponibilidad = false) {
  const disponibilidad = incluirDisponibilidad
    ? `, EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = to_regclass('public.ivan_funciones_config')
          AND attname = 'lector_ean_lumac_habilitado' AND NOT attisdropped
      ) AS disponible`
    : '';
  try {
    const resultado = await pool.query(`
      SELECT COALESCE(to_jsonb(f)->>'lector_ean_lumac_habilitado' = 'true', false) AS habilitado${disponibilidad}
      FROM (SELECT id FROM mayoristas WHERE ${CUENTA_LUMAC}) m
      LEFT JOIN public.ivan_funciones_config f ON f.mayorista_id = m.id`,
    [id, CODIGO_LUMAC]);
    return resultado.rows[0] || { habilitado: false, disponible: false };
  } catch (error) {
    if (error.code !== '42P01') throw error;
    return { habilitado: false, disponible: false };
  }
}

async function guardar(id, habilitado) {
  if (typeof habilitado !== 'boolean') throw errorCliente('Elegí si querés usar el campo ean_producto.');
  const config = await leer(id, true);
  if (!config.disponible) throw errorCliente('La configuración del lector de Lumac no está disponible.', 409);
  if (habilitado) {
    const conexion = await getConexionMayorista(id);
    if (!conexion) throw errorCliente('No se pudo consultar el catálogo de Lumac.', 503);
    try {
      await conexion.query('SELECT ean_producto FROM "viewProductos" LIMIT 0');
    } catch (error) {
      if (error.code !== '42703') throw error;
      throw errorCliente('El campo ean_producto no está disponible en viewProductos de Lumac.', 409);
    }
  }
  const resultado = await pool.query(`
    INSERT INTO public.ivan_funciones_config (mayorista_id, lector_ean_lumac_habilitado)
    SELECT id, $3 FROM mayoristas WHERE ${CUENTA_LUMAC}
    ON CONFLICT (mayorista_id) DO UPDATE
      SET lector_ean_lumac_habilitado = EXCLUDED.lector_ean_lumac_habilitado
    RETURNING lector_ean_lumac_habilitado AS habilitado`, [id, CODIGO_LUMAC, habilitado]);
  if (!resultado.rows.length) throw errorCliente('No se encontró la cuenta activa de Lumac.', 404);
  return { ...resultado.rows[0], disponible: true };
}

module.exports = { leer, guardar };
