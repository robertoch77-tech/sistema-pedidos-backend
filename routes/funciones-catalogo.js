const router=require('express').Router();
const pool=require('../db');
const conexion=require('../services/conexionMayorista');
const rateLimit=require('express-rate-limit');
const {idSeguro,errorCliente}=require('../services/ivanImagenesDatos');
const {estadoStock}=require('../services/ivanStockConsulta');
const {mayoristaValido,leer}=require('../services/ivanFuncionesCatalogo');
const bultos=require('../services/ivanBultos');
router.get('/:id',async(req,res)=>{
  try{const id=await mayoristaValido(req.params.id,true);const cfg=await leer(id);res.set('Cache-Control','no-store');res.json({...cfg,...await bultos.publica(id)});}
  catch(e){res.status(e.status || 503).json({mensaje:e.status?e.message:'No se pudo consultar la presentación del catálogo.'});}
});
const limiteBultos=rateLimit({windowMs:60000,limit:120,standardHeaders:true,legacyHeaders:false,message:{mensaje:'Esperá un momento antes de consultar los bultos.'}});
router.get('/:id/bultos',limiteBultos,async(req,res)=>{
  try{const id=await mayoristaValido(req.params.id,true);const ids=String(req.query.ids || '').split(',').filter(Boolean);if(ids.length>200)throw errorCliente('Consultá hasta 200 productos por vez.');res.set('Cache-Control','no-store');res.json(await bultos.reglas(id,ids));}
  catch(e){res.status(e.status || 503).json({mensaje:e.status?e.message:'No se pudieron consultar las unidades por bulto.'});}
});
router.post('/:id/bultos/validar',limiteBultos,async(req,res)=>{
  try{const id=await mayoristaValido(req.params.id,true);const fallo=await bultos.validarPedido(id,req.body?.items);res.set('Cache-Control','no-store');if(fallo)return res.status(fallo.status).json(fallo);res.json({ok:true});}
  catch(e){res.status(e.status || 503).json({mensaje:e.status?e.message:'No se pudieron comprobar las cantidades.'});}
});
const limiteStock=rateLimit({windowMs:60000,limit:120,standardHeaders:true,legacyHeaders:false,message:{mensaje:'Esperá un momento antes de volver a consultar el stock.'}});
router.get('/:id/stock/:productoId',limiteStock,async(req,res)=>{
  try{
    const id=await mayoristaValido(req.params.id,true);
    const productoId=idSeguro(req.params.productoId);
    const codigo=String(req.query.codigo || '').trim();
    if(!codigo || codigo.length>200)throw errorCliente('Código de producto inválido.');
    const cfg=await leer(id);
    const visibilidad=await pool.query('SELECT mostrar_stock FROM mayoristas WHERE id=$1',[id]);
    if(!cfg.stock_consulta_habilitada || !visibilidad.rows[0]?.mostrar_stock)throw errorCliente('La consulta de stock no está habilitada para este mayorista.',403);
    const db=await conexion.getConexionMayorista(id);
    if(!db)throw errorCliente('No se pudo consultar el stock. Intentá nuevamente más tarde.',503);
    const r=await db.query('SELECT cod_producto,stock_temporal FROM "viewProductos" WHERE id_producto=$1 LIMIT 1',[productoId]);
    if(!r.rowCount || String(r.rows[0].cod_producto).trim()!==codigo)throw errorCliente('El producto ya no coincide con el catálogo. Actualizá la búsqueda.',409);
    const resultado=estadoStock(r.rows[0].stock_temporal);
    res.set('Cache-Control','no-store');
    res.json({estado:resultado.estado,...(cfg.stock_mostrar_cantidad && resultado.cantidad!==null?{cantidad:resultado.cantidad}:{})});
  }catch(e){res.status(e.status || 503).json({mensaje:e.status?e.message:'No se pudo consultar el stock. Intentá nuevamente más tarde.'});}
});
module.exports=router;
