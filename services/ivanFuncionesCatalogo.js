const pool=require('../db');
const {idSeguro,errorCliente}=require('./ivanImagenesDatos');
async function mayoristaValido(valor,soloActivo=false) {
  const id=idSeguro(valor);
  const r=await pool.query("SELECT id FROM mayoristas WHERE id=$1 AND COALESCE(tipo_fuente,'ivan') <> 'roberto' AND ($2::boolean=false OR activo=true)",[id,soloActivo]);
  if(!r.rowCount)throw errorCliente('Mayorista no encontrado.',404);
  return id;
}
async function leer(id,estricto=false) {
  try {
    const r=await pool.query("SELECT COALESCE(f.catalogo_costo_habilitado,false) AS catalogo_costo_habilitado, COALESCE(f.stock_consulta_habilitada,false) AS stock_consulta_habilitada, COALESCE(f.stock_mostrar_cantidad,false) AS stock_mostrar_cantidad, COALESCE((to_jsonb(f)->>'catalogo_observaciones_destacadas')::boolean,false) AS catalogo_observaciones_destacadas, EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.ivan_funciones_config'::regclass AND attname='catalogo_observaciones_destacadas' AND NOT attisdropped) AS observaciones_config_disponible, COALESCE(to_jsonb(f)->>'equivalencias_campo','obs_producto') AS equivalencias_campo, EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.ivan_funciones_config'::regclass AND attname='equivalencias_campo' AND NOT attisdropped) AS equivalencias_config_disponible FROM (SELECT $1::bigint AS id) m LEFT JOIN public.ivan_funciones_config f ON f.mayorista_id=m.id",[id]);
    return {...(r.rows[0] || {catalogo_costo_habilitado:false,stock_consulta_habilitada:false,stock_mostrar_cantidad:false,catalogo_observaciones_destacadas:false,observaciones_config_disponible:false,equivalencias_campo:'obs_producto',equivalencias_config_disponible:false}),stock_config_disponible:true};
   }catch(e){
    if(e.code==='42703'){const r=await pool.query('SELECT catalogo_costo_habilitado FROM ivan_funciones_config WHERE mayorista_id=$1',[id]);return {...(r.rows[0] || {catalogo_costo_habilitado:false}),stock_consulta_habilitada:false,stock_mostrar_cantidad:false,stock_config_disponible:false,catalogo_observaciones_destacadas:false,observaciones_config_disponible:false,equivalencias_campo:'obs_producto',equivalencias_config_disponible:false};}
    if(e.code==='42P01' && !estricto)return {catalogo_costo_habilitado:false,stock_consulta_habilitada:false,stock_mostrar_cantidad:false,catalogo_observaciones_destacadas:false,observaciones_config_disponible:false,equivalencias_campo:'obs_producto',equivalencias_config_disponible:false};throw e;}
}
module.exports={mayoristaValido,leer};
