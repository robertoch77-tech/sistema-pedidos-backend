const router=require('express').Router();
const pool=require('../db');
const {mayoristaValido,leer}=require('../services/ivanFuncionesCatalogo');
const {errorCliente}=require('../services/ivanImagenesDatos');
const conexion=require('../services/conexionMayorista');
const {CAMPO_ACTUAL,camposDisponibles,validarCampo}=require('../services/ivanCampoEquivalencias');
const descuentosComerciales=require('../services/ivanDescuentosComerciales');
router.get('/descuentos/:id',async(req,res,next)=>{try{const id=await mayoristaValido(req.params.id);res.set('Cache-Control','no-store');const cfg=await descuentosComerciales.leer(id);res.json({habilitado:cfg.habilitado,activo:cfg.activo,disponible:cfg.disponible,version:Number(cfg.version)});}catch(e){next(e);}});
router.put('/descuentos/:id',async(req,res,next)=>{try{const id=await mayoristaValido(req.params.id);const cfg=await descuentosComerciales.habilitar(id,req.body);res.json({habilitado:cfg.habilitado,activo:cfg.activo,disponible:true,version:Number(cfg.version)});}catch(e){next(e);}});
router.get('/:id',async(req,res,next)=>{try{const id=await mayoristaValido(req.params.id);res.set('Cache-Control','no-store');res.json(await leer(id,true));}catch(e){next(e);}});
router.put('/codigos-destacados/:id',async(req,res,next)=>{
  try{
    const id=await mayoristaValido(req.params.id);
    const habilitado=req.body?.catalogo_codigos_destacados;
    if(typeof habilitado!=='boolean')throw errorCliente('Elegí habilitar o deshabilitar los códigos destacados.');
    await pool.query('INSERT INTO ivan_funciones_config(mayorista_id,catalogo_codigos_destacados) VALUES($1,$2) ON CONFLICT(mayorista_id) DO UPDATE SET catalogo_codigos_destacados=EXCLUDED.catalogo_codigos_destacados,actualizado_en=now()',[id,habilitado]);
    res.json({ok:true,mensaje:'Presentación de códigos guardada para este mayorista. Recargá el catálogo para usarla.'});
  }catch(e){next(e);}
});
router.put('/cantidad-directa/:id',async(req,res,next)=>{
  try{
    const id=await mayoristaValido(req.params.id);
    const habilitado=req.body?.catalogo_cantidad_directa;
    if(typeof habilitado!=='boolean')throw errorCliente('Elegí habilitar o deshabilitar la cantidad directa.');
    await pool.query('INSERT INTO ivan_funciones_config(mayorista_id,catalogo_cantidad_directa) VALUES($1,$2) ON CONFLICT(mayorista_id) DO UPDATE SET catalogo_cantidad_directa=EXCLUDED.catalogo_cantidad_directa,actualizado_en=now()',[id,habilitado]);
    res.json({ok:true,mensaje:'Modo de cantidad guardado para este mayorista. Recargá el catálogo para usarlo.'});
  }catch(e){next(e);}
});
router.put('/envio-parcial/:id',async(req,res,next)=>{
  try{
    const id=await mayoristaValido(req.params.id);
    const habilitado=req.body?.pedido_envio_parcial_habilitado;
    if(typeof habilitado!=='boolean')throw errorCliente('Elegí habilitar o deshabilitar el envío de seleccionados.');
    await pool.query('INSERT INTO ivan_funciones_config(mayorista_id,pedido_envio_parcial_habilitado) VALUES($1,$2) ON CONFLICT(mayorista_id) DO UPDATE SET pedido_envio_parcial_habilitado=EXCLUDED.pedido_envio_parcial_habilitado,actualizado_en=now()',[id,habilitado]);
    res.json({ok:true,mensaje:'Envío de seleccionados guardado para este mayorista.'});
  }catch(e){next(e);}
});
router.get('/equivalencias/:id/campos',async(req,res,next)=>{
  try{
    const id=await mayoristaValido(req.params.id);
    const db=await conexion.getConexionMayorista(id);
    if(!db)throw errorCliente('No se pudo consultar la vista del catálogo. La configuración actual se conserva.',503);
    const campos=await camposDisponibles(db);
    res.set('Cache-Control','no-store');res.json({campos});
  }catch(e){next(e);}
});
router.put('/equivalencias/:id',async(req,res,next)=>{
  try{
    const id=await mayoristaValido(req.params.id);
    const campo=req.body?.equivalencias_campo;
    if(typeof campo!=='string')throw errorCliente('Elegí el campo de equivalencias.');
    if(campo!==CAMPO_ACTUAL){const db=await conexion.getConexionMayorista(id);if(!db)throw errorCliente('No se pudo comprobar el campo de Ubicación. No se guardaron cambios.',503);await validarCampo(db,campo);}
    await pool.query('INSERT INTO ivan_funciones_config(mayorista_id,equivalencias_campo) VALUES($1,$2) ON CONFLICT(mayorista_id) DO UPDATE SET equivalencias_campo=EXCLUDED.equivalencias_campo,actualizado_en=now()',[id,campo]);
    res.json({ok:true,mensaje:'Campo de equivalencias guardado para este mayorista. Recargá el catálogo para usarlo.'});
  }catch(e){next(e);}
});
router.put('/observaciones/:id',async(req,res,next)=>{
  try{
    const id=await mayoristaValido(req.params.id);
    const habilitado=req.body?.catalogo_observaciones_destacadas;
    if(typeof habilitado!=='boolean')throw errorCliente('Elegí habilitar o deshabilitar los detalles del producto.');
    await pool.query('INSERT INTO ivan_funciones_config(mayorista_id,catalogo_observaciones_destacadas) VALUES($1,$2) ON CONFLICT(mayorista_id) DO UPDATE SET catalogo_observaciones_destacadas=EXCLUDED.catalogo_observaciones_destacadas,actualizado_en=now()',[id,habilitado]);
    res.json({ok:true,mensaje:'Detalles del producto guardados para este mayorista.'});
  }catch(e){next(e);}
});
router.put('/stock/:id',async(req,res,next)=>{
  try{
    const id=await mayoristaValido(req.params.id);
    const {stock_consulta_habilitada,stock_mostrar_cantidad}=req.body || {};
    if(typeof stock_consulta_habilitada!=='boolean' || typeof stock_mostrar_cantidad!=='boolean')throw errorCliente('Elegí cómo consultar y mostrar el stock.');
    await pool.query('INSERT INTO ivan_funciones_config(mayorista_id,stock_consulta_habilitada,stock_mostrar_cantidad) VALUES($1,$2,$3) ON CONFLICT(mayorista_id) DO UPDATE SET stock_consulta_habilitada=EXCLUDED.stock_consulta_habilitada,stock_mostrar_cantidad=EXCLUDED.stock_mostrar_cantidad,actualizado_en=now()',[id,stock_consulta_habilitada,stock_mostrar_cantidad]);
    res.json({ok:true,mensaje:'Consulta de stock guardada para este mayorista.'});
  }catch(e){next(e);}
});
router.put('/:id',async(req,res,next)=>{
  try{
    const id=await mayoristaValido(req.params.id);
    const habilitado=req.body?.catalogo_costo_habilitado;
    if(typeof habilitado!=='boolean')throw errorCliente('Elegí habilitar o deshabilitar la presentación de costo.');
    await pool.query(`INSERT INTO ivan_funciones_config(mayorista_id,catalogo_costo_habilitado) VALUES($1,$2)
      ON CONFLICT(mayorista_id) DO UPDATE SET catalogo_costo_habilitado=EXCLUDED.catalogo_costo_habilitado,actualizado_en=now()`,[id,habilitado]);
    res.json({ok:true,mensaje:'Presentación del costo guardada para este mayorista.'});
  }catch(e){next(e);}
});
router.use((e,req,res,next)=>res.status(['42P01','42703'].includes(e.code)?503:e.status || 500).json({mensaje:['42P01','42703'].includes(e.code)?'Falta aplicar la migración de funciones del catálogo. No se guardaron cambios.':e.status?e.message:'No se pudo consultar o guardar esta función.'}));
module.exports=router;
