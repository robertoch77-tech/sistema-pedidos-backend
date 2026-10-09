const router=require('express').Router();
const {mayoristaValido,leer}=require('../services/ivanFuncionesCatalogo');
router.get('/:id',async(req,res)=>{
  try{const id=await mayoristaValido(req.params.id,true);res.set('Cache-Control','no-store');res.json(await leer(id));}
  catch(e){res.status(e.status || 503).json({mensaje:e.status?e.message:'No se pudo consultar la presentación del catálogo.'});}
});
module.exports=router;
