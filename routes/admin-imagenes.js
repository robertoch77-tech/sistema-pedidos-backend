const express=require('express');
const router=express.Router();
const pool=require('../db');
const {idSeguro,errorCliente}=require('../services/ivanImagenesDatos');
const {configuracion,conBloqueo,uso,periodoSeguro}=require('../services/ivanImagenesPropias');
const {cloudinaryConfig}=require('./imagenes-productos').herramientasImagenes;
const ruta=f=>(req,res,next)=>Promise.resolve(f(req,res)).catch(next);
async function mayorista(id) {
  const r=await pool.query("SELECT id,nombre,codigo FROM mayoristas WHERE id=$1 AND COALESCE(tipo_fuente,'ivan') <> 'roberto'",[id]);
  if(!r.rowCount) throw errorCliente('Mayorista no encontrado.',404);
  return r.rows[0];
}
router.get('/uso',ruta(async(req,res)=>{
  const periodo=periodoSeguro(req.query.periodo);
  const listado=await pool.query(`WITH a AS (
    SELECT mayorista_id,
      COUNT(*) FILTER(WHERE estado='lista')::int AS archivos,
      COALESCE(SUM(bytes) FILTER(WHERE estado='lista'),0)::text AS bytes,
      COUNT(*) FILTER(WHERE estado IN ('subiendo','revisar'))::int AS inciertos,
      COUNT(*) FILTER(WHERE creado_en >= ($1::date::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires') AND creado_en < (($1::date + INTERVAL '1 month')::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'))::int AS cargas_periodo,
      COUNT(*) FILTER(WHERE estado='lista' AND creado_en >= ($1::date::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires') AND creado_en < (($1::date + INTERVAL '1 month')::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'))::int AS cargas_confirmadas,
      COUNT(*) FILTER(WHERE estado='lista' AND NOT EXISTS(SELECT 1 FROM ivan_imagenes_productos p WHERE p.mayorista_id=f.mayorista_id AND p.archivo_id=f.id))::int AS sin_asignar
    FROM ivan_imagenes_archivos f GROUP BY mayorista_id
  ), p AS (SELECT mayorista_id,COUNT(*)::int AS productos FROM ivan_imagenes_productos GROUP BY mayorista_id)
  SELECT m.id,m.nombre,m.codigo,COALESCE(c.habilitada,false) AS habilitada,
    COALESCE(c.limite_archivos,200) AS limite_archivos,COALESCE(c.limite_cargas_mes,50) AS limite_cargas_mes,
    COALESCE(a.archivos,0) AS archivos,COALESCE(a.bytes,'0') AS bytes,COALESCE(a.inciertos,0) AS inciertos,
    COALESCE(a.cargas_periodo,0) AS cargas_periodo,COALESCE(a.cargas_confirmadas,0) AS cargas_confirmadas,
    COALESCE(a.sin_asignar,0) AS sin_asignar,COALESCE(p.productos,0) AS productos
  FROM mayoristas m LEFT JOIN a ON a.mayorista_id=m.id LEFT JOIN p ON p.mayorista_id=m.id
    LEFT JOIN ivan_imagenes_config c ON c.mayorista_id=m.id
  WHERE COALESCE(m.tipo_fuente,'ivan') <> 'roberto' ORDER BY m.nombre`,[periodo+'-01']);
  res.json({periodo,mayoristas:listado.rows});
}));
router.get('/:id',ruta(async(req,res)=>{
  const id=idSeguro(req.params.id); await mayorista(id);
  const periodo=periodoSeguro(req.query.periodo);
  res.json({...await configuracion(pool,id),...await uso(pool,id,periodo),periodo,disponible:!!cloudinaryConfig()});
}));
router.put('/:id',ruta(async(req,res)=>{
  const id=idSeguro(req.params.id); await mayorista(id);
  const {habilitada,limite_archivos,limite_cargas_mes}=req.body || {};
  if(typeof habilitada!=='boolean' || !Number.isInteger(limite_archivos) || limite_archivos<1 || limite_archivos>10000
    || !Number.isInteger(limite_cargas_mes) || limite_cargas_mes<1 || limite_cargas_mes>5000) throw errorCliente('Configuración inválida.');
  if(habilitada && !cloudinaryConfig()) throw errorCliente('Cloudinary para Iván no está configurado. No se habilitó la función.',503);
  await conBloqueo(id,db=>db.query(`INSERT INTO ivan_imagenes_config(mayorista_id,habilitada,limite_archivos,limite_cargas_mes)
    VALUES($1,$2,$3,$4) ON CONFLICT(mayorista_id) DO UPDATE SET habilitada=EXCLUDED.habilitada,
    limite_archivos=EXCLUDED.limite_archivos,limite_cargas_mes=EXCLUDED.limite_cargas_mes,actualizado_en=now()`,[id,habilitada,limite_archivos,limite_cargas_mes]));
  res.json({ok:true,mensaje:'Configuración de imágenes guardada para este mayorista.'});
}));
router.use((e,req,res,next)=>res.status(e.code==='42P01'?503:e.status || 500).json({mensaje:e.code==='42P01'
  ? 'La función necesita la migración de imágenes propias. No se cambió la configuración.'
  : e.status?e.message:'No se pudo consultar o guardar la configuración de imágenes.'}));
module.exports=router;
