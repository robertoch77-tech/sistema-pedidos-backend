const pool = require('../db');
const { combinarImagenes, errorCliente } = require('./ivanImagenesDatos');
const CONFIG_DEFAULT = { habilitada:false, limite_archivos:200, limite_cargas_mes:50 };
async function configuracion(db, id) {
  const r=await db.query('SELECT habilitada, limite_archivos, limite_cargas_mes FROM ivan_imagenes_config WHERE mayorista_id=$1',[id]);
  return r.rows[0] || {...CONFIG_DEFAULT};
}
async function aplicarImagenesPropias(actuales, mayoristaId, originales) {
  if (!actuales.length) return actuales;
  try {
    const cfg=await configuracion(pool,mayoristaId);
    if (!cfg.habilitada) return actuales;
    const r=await pool.query(`SELECT p.mayorista_id,p.producto_id,p.codigo_producto,p.principal,a.url
      FROM ivan_imagenes_productos p JOIN ivan_imagenes_archivos a
      ON a.mayorista_id=p.mayorista_id AND a.id=p.archivo_id AND a.estado='lista'
      WHERE p.mayorista_id=$1 AND p.producto_id=ANY($2::bigint[])`,[mayoristaId,actuales.map(p=>p.id_producto)]);
    return combinarImagenes(actuales,originales,r.rows,mayoristaId);
  } catch (e) {
    if(e.code!=='42P01') console.error('[IVAN_IMAGENES_PROPIAS] Lectura no disponible',e.code || 'sin_codigo');
    return actuales;
  }
}
async function conBloqueo(id, tarea) {
  const db=await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(72820,$1::integer)',[id]);
    const result=await tarea(db);
    await db.query('COMMIT');
    return result;
  } catch(e) { await db.query('ROLLBACK').catch(()=>{}); throw e; }
  finally { db.release(); }
}
async function exigirHabilitada(db,id) {
  const cfg=await configuracion(db,id);
  if(!cfg.habilitada) throw errorCliente('El administrador no habilitó imágenes propias para este mayorista.',403);
  return cfg;
}
async function asignar(db,id,archivoId,productos,principal) {
  await exigirHabilitada(db,id);
  const archivo=await db.query("SELECT id FROM ivan_imagenes_archivos WHERE id=$1 AND mayorista_id=$2 AND estado='lista'",[archivoId,id]);
  if(!archivo.rowCount) throw errorCliente('La imagen no pertenece a este mayorista o todavía no está disponible.',404);
  await db.query(`INSERT INTO ivan_imagenes_productos(mayorista_id,producto_id,codigo_producto,archivo_id,principal)
    SELECT $1,x.id,x.codigo,$2,$3 FROM jsonb_to_recordset($4::jsonb) AS x(id bigint,codigo text)
    ON CONFLICT(mayorista_id,producto_id) DO UPDATE SET codigo_producto=EXCLUDED.codigo_producto,
    archivo_id=EXCLUDED.archivo_id,principal=EXCLUDED.principal,actualizado_en=now()`,[id,archivoId,principal,JSON.stringify(productos)]);
}
async function uso(db,id,periodo) {
  const r=await db.query(`SELECT
    COUNT(*) FILTER(WHERE estado='lista')::int AS archivos,
    COALESCE(SUM(bytes) FILTER(WHERE estado='lista'),0)::text AS bytes,
    COUNT(*) FILTER(WHERE estado IN ('subiendo','revisar'))::int AS inciertos,
    COUNT(*) FILTER(WHERE creado_en >= ($2::date::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
       AND creado_en < (($2::date + INTERVAL '1 month')::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'))::int AS cargas_periodo,
    COUNT(*) FILTER(WHERE estado='lista' AND creado_en >= ($2::date::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
       AND creado_en < (($2::date + INTERVAL '1 month')::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'))::int AS cargas_confirmadas
    FROM ivan_imagenes_archivos WHERE mayorista_id=$1`,[id,periodo+'-01']);
  const p=await db.query(`SELECT COUNT(*)::int AS productos FROM ivan_imagenes_productos WHERE mayorista_id=$1`,[id]);
  const h=await db.query(`SELECT COUNT(*)::int AS sin_asignar FROM ivan_imagenes_archivos a
    WHERE a.mayorista_id=$1 AND a.estado='lista' AND NOT EXISTS
    (SELECT 1 FROM ivan_imagenes_productos p WHERE p.mayorista_id=a.mayorista_id AND p.archivo_id=a.id)`,[id]);
  return {...r.rows[0],...p.rows[0],...h.rows[0]};
}
const periodoActual=()=>{ const partes=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit'}).formatToParts(new Date()); return partes.find(p=>p.type==='year').value+'-'+partes.find(p=>p.type==='month').value; };
function periodoSeguro(valor) {
  const p=valor || periodoActual();
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(p)) throw errorCliente('Período inválido.');
  return p;
}
module.exports={CONFIG_DEFAULT,configuracion,aplicarImagenesPropias,conBloqueo,exigirHabilitada,asignar,uso,periodoActual,periodoSeguro};
