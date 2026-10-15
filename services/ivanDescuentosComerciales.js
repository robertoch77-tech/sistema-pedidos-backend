'use strict';
const pool=require('../db');
const jwt=require('jsonwebtoken');
const conexion=require('./conexionMayorista');
const reglas=require('./ivanDescuentosReglas');
const {mayoristaValido}=require('./ivanFuncionesCatalogo');
const vacia=()=>({disponible:false,habilitado:false,activo:false,dto_general:0,origen_precio:'',perfil_default:'',datos:{perfiles:[],asignaciones:[]},version:0});
async function leer(id,db=pool){try{const r=await db.query('SELECT * FROM public.ivan_descuentos_config WHERE mayorista_id=$1',[id]);return {...vacia(),...r.rows[0],disponible:true};}catch(e){if(e.code==='42P01')return vacia();throw e;}}
async function transaccion(id,actor,version,editar){
  const db=await pool.connect();try{await db.query('BEGIN');
    await db.query('INSERT INTO public.ivan_descuentos_config(mayorista_id) VALUES($1) ON CONFLICT DO NOTHING',[id]);
    const r=await db.query('SELECT * FROM public.ivan_descuentos_config WHERE mayorista_id=$1 FOR UPDATE',[id]);const anterior=r.rows[0];
    if(Number(anterior.version)!==version)throw reglas.error('Otra sesión modificó la configuración. Recargá antes de guardar.',409);
    const siguiente=await editar(anterior);
    const actualizado=await db.query(`UPDATE public.ivan_descuentos_config SET habilitado=$2,activo=$3,dto_general=$4,origen_precio=$5,perfil_default=$6,datos=$7::jsonb,version=version+1,actualizado_en=now() WHERE mayorista_id=$1 RETURNING *`,[id,siguiente.habilitado,siguiente.activo,siguiente.dto_general,siguiente.origen_precio,siguiente.perfil_default,JSON.stringify(siguiente.datos)]);
    const cfg=actualizado.rows[0];await db.query('INSERT INTO public.ivan_descuentos_historial(mayorista_id,version,actor,configuracion) VALUES($1,$2,$3,$4::jsonb)',[id,cfg.version,actor,JSON.stringify(cfg)]);
    await db.query('COMMIT');return {...cfg,disponible:true};
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
async function habilitar(id,body){
  if(typeof body.habilitado!=='boolean'||!Number.isSafeInteger(body.version)||body.version<0)throw reglas.error('Configuración inválida.');
  await mayoristaValido(id);return transaccion(id,'admin',body.version,c=>({...c,habilitado:body.habilitado,activo:body.habilitado?c.activo:false}));
}
async function guardar(id,body){
  const normal=reglas.validar(body);await mayoristaValido(id);
  const actual=await leer(id);if(!actual.disponible)throw reglas.error('Falta crear las tablas de descuentos.',503);if(!actual.habilitado)throw reglas.error('El administrador no habilitó esta función.',403);
  if(normal.activo){const modelo=await pool.query('SELECT modelo_precio_catalogo FROM mayoristas WHERE id=$1',[id]);if(modelo.rows[0]?.modelo_precio_catalogo!=='precio_recibido')throw reglas.error('Este módulo requiere el modelo de precio recibido. No cambia el modelo actual.',409);}
  const dbExterno=await conexion.getConexionMayorista(id);if(!dbExterno)throw reglas.error('No se pudo comprobar clientes y rubros. No se guardó la configuración.',503);
  const catalogo=await dbExterno.query('SELECT DISTINCT BTRIM(des_producto_rubro) AS rubro,BTRIM(des_producto_marca) AS marca FROM "viewProductos"');
  const rubros=new Set(catalogo.rows.map(r=>r.rubro)),marcas=new Set(catalogo.rows.map(r=>r.marca));
  if(normal.datos.perfiles.some(p=>p.reglas.some(r=>(r.rubro&&!rubros.has(r.rubro))||(r.marca&&!marcas.has(r.marca)))))throw reglas.error('Un rubro o marca ya no coincide con el catálogo. Actualizá las opciones.',409);
  if(normal.datos.asignaciones.length){const documentos=normal.datos.asignaciones.map(a=>a.cuit);const clientes=await dbExterno.query(`SELECT regexp_replace(doc_cliente::text,'[^0-9]','','g') AS cuit FROM "viewClientes" WHERE es_activo=true AND regexp_replace(doc_cliente::text,'[^0-9]','','g')=ANY($1::text[])`,[documentos]);const validos=new Set(clientes.rows.map(r=>r.cuit));if(documentos.some(d=>!validos.has(d)))throw reglas.error('Un cliente asignado no está activo en este mayorista.',409);}
  return transaccion(id,'mayorista',body.version,c=>{if(!c.habilitado)throw reglas.error('La función fue deshabilitada. No se guardaron cambios.',403);return {...c,...normal};});
}
function sesionCliente(req,id){try{const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!token)return null;const s=jwt.verify(token,process.env.JWT_SECRET);return s.tipo==='cliente'&&Number(s.mayorista_id)===Number(id)&&reglas.cuit(s.cuit)?s:null;}catch{return null;}}
async function condicion(req,id){const sesion=sesionCliente(req,id);if(!sesion)return null;const cfg=await leer(id);const cond=reglas.resolver(cfg,sesion.cuit);if(cond){const r=await pool.query("SELECT modelo_precio_catalogo FROM mayoristas WHERE id=$1 AND activo=true AND COALESCE(tipo_fuente,'ivan')<>'roberto'",[id]);if(r.rows[0]?.modelo_precio_catalogo!=='precio_recibido')throw reglas.error('La configuración de descuentos necesita revisión del mayorista.',503);}return cond;}
module.exports={leer,guardar,habilitar,condicion,sesionCliente};