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
    const r=await pool.query('SELECT catalogo_costo_habilitado,stock_consulta_habilitada,stock_mostrar_cantidad FROM ivan_funciones_config WHERE mayorista_id=$1',[id]);
    return {...(r.rows[0] || {catalogo_costo_habilitado:false,stock_consulta_habilitada:false,stock_mostrar_cantidad:false}),stock_config_disponible:true};
   }catch(e){
    if(e.code==='42703'){const r=await pool.query('SELECT catalogo_costo_habilitado FROM ivan_funciones_config WHERE mayorista_id=$1',[id]);return {...(r.rows[0] || {catalogo_costo_habilitado:false}),stock_consulta_habilitada:false,stock_mostrar_cantidad:false,stock_config_disponible:false};}
    if(e.code==='42P01' && !estricto)return {catalogo_costo_habilitado:false,stock_consulta_habilitada:false,stock_mostrar_cantidad:false};throw e;}
}
module.exports={mayoristaValido,leer};
