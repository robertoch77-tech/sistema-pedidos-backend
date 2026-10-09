const router=require('express').Router();
const pool=require('../db');
const {mayoristaValido,leer}=require('../services/ivanFuncionesCatalogo');
const {errorCliente}=require('../services/ivanImagenesDatos');
router.get('/:id',async(req,res,next)=>{try{const id=await mayoristaValido(req.params.id);res.set('Cache-Control','no-store');res.json(await leer(id,true));}catch(e){next(e);}});
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
router.use((e,req,res,next)=>res.status(e.code==='42P01'?503:e.status || 500).json({mensaje:e.code==='42P01'?'Falta crear la tabla de funciones del catálogo. No se guardaron cambios.':e.status?e.message:'No se pudo consultar o guardar esta función.'}));
module.exports=router;
