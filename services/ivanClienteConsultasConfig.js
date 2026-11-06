'use strict';
const pool = require('../db');
const fallo = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });
const apagada = disponible => ({ disponible, descuentos: false, pdf: false, excel: false, revision: '0' });
async function leer(id, db = pool, bloquear = false) {
  try {
    const r = await db.query(`SELECT descuentos,pdf,excel,revision::text FROM public.ivan_cliente_consultas_config
      WHERE mayorista_id=$1 ${bloquear ? 'FOR UPDATE' : ''}`, [id]);
    return { ...apagada(true), ...r.rows[0] };
  } catch (e) { if (e.code === '42P01' && !bloquear) return apagada(false); throw e; }
}
async function guardar(id, datos) {
  if (!datos || ['descuentos', 'pdf', 'excel'].some(k => typeof datos[k] !== 'boolean') ||
      typeof datos.revision !== 'string' || !/^(0|[1-9]\d{0,17})$/.test(datos.revision) ||
      Object.keys(datos).some(k => !['descuentos', 'pdf', 'excel', 'revision'].includes(k))) throw fallo('Revisá las opciones antes de guardar.');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('INSERT INTO public.ivan_cliente_consultas_config(mayorista_id) VALUES($1) ON CONFLICT DO NOTHING', [id]);
    const anterior = await leer(id, db, true);
    if (anterior.revision !== datos.revision) throw fallo('Otra sesión cambió estas opciones. Recargá antes de guardar.', 409);
    await db.query(`UPDATE public.ivan_cliente_consultas_config SET descuentos=$2,pdf=$3,excel=$4,
      revision=revision+1,actualizado_en=now() WHERE mayorista_id=$1`, [id, datos.descuentos, datos.pdf, datos.excel]);
    const resultado = await leer(id, db);
    await db.query('COMMIT'); return resultado;
  } catch (e) {
    await db.query('ROLLBACK');
    if (e.code === '42P01') throw fallo('Falta preparar la configuración nueva. Las funciones actuales se conservan.', 409);
    throw e;
  } finally { db.release(); }
}
module.exports = { leer, guardar, fallo };
