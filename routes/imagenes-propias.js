const express=require('express');
const crypto=require('crypto');
const multer=require('multer');
const rateLimit=require('express-rate-limit');
const pool=require('../db');
const conexion=require('../services/conexionMayorista');
const {herramientasImagenes}=require('./imagenes-productos');
const {validarMayorista,cloudinaryConfig,cloudinaryPost,descargarImagenPublica}=herramientasImagenes;
const {UUID,errorCliente,idSeguro,productosSeguros,principalSeguro,imagenSegura}=require('../services/ivanImagenesDatos');
const {configuracion,conBloqueo,exigirHabilitada,asignar,uso,periodoActual}=require('../services/ivanImagenesPropias');
const router=express.Router();
const ruta=f=>(req,res,next)=>Promise.resolve(f(req,res)).catch(next);
const carga=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1,fields:4,fieldSize:40000,parts:5}}).single('imagen');
const limite=rateLimit({windowMs:15*60*1000,max:30,keyGenerator:req=>String(req.params.mayorista_id),standardHeaders:true,legacyHeaders:false,
  message:{mensaje:'Esperá unos minutos antes de volver a cargar imágenes.'}});
router.use('/:mayorista_id',validarMayorista);
async function validarProductos(id,productos) {
  const db=await conexion.getConexionMayorista(id);
  if(!db) throw errorCliente('No hay catálogo disponible para este mayorista.',503);
  const r=await db.query('SELECT id_producto,cod_producto FROM "viewProductos" WHERE id_producto=ANY($1::bigint[])',[productos.map(p=>p.id)]);
  const mapa=new Map(r.rows.map(p=>[String(p.id_producto),String(p.cod_producto).trim()]));
  if(productos.some(p=>mapa.get(String(p.id))!==p.codigo)) throw errorCliente('Uno de los productos ya no coincide con el catálogo. Actualizá la búsqueda.',409);
}
router.get('/:mayorista_id/estado',ruta(async(req,res)=>{
  const id=idSeguro(req.params.mayorista_id);
  try { res.json({...await configuracion(pool,id),disponible:!!cloudinaryConfig()}); }
  catch(e) { if(e.code==='42P01') return res.json({habilitada:false,disponible:false}); throw e; }
}));
router.get('/:mayorista_id/archivos',ruta(async(req,res)=>{
  const id=idSeguro(req.params.mayorista_id); await exigirHabilitada(pool,id);
  const r=await pool.query("SELECT id,url,bytes,creado_en FROM ivan_imagenes_archivos WHERE mayorista_id=$1 AND estado='lista' ORDER BY creado_en DESC LIMIT 100",[id]);
  res.json({archivos:r.rows});
}));
router.post('/:mayorista_id/asignar',ruta(async(req,res)=>{
  const id=idSeguro(req.params.mayorista_id); await exigirHabilitada(pool,id);
  const productos=productosSeguros(req.body?.productos), principal=principalSeguro(req.body?.principal), archivo=req.body?.archivo_id;
  if(!UUID.test(String(archivo))) throw errorCliente('Imagen inválida.');
  await validarProductos(id,productos);
  await conBloqueo(id,db=>asignar(db,id,archivo,productos,principal));
  res.json({ok:true,mensaje:`Imagen asignada a ${productos.length} productos. No se modificaron las imágenes de Iván.`});
}));
router.patch('/:mayorista_id/principal',ruta(async(req,res)=>{
  const id=idSeguro(req.params.mayorista_id); await exigirHabilitada(pool,id);
  const productos=productosSeguros(req.body?.productos),principal=principalSeguro(req.body?.principal);
  await validarProductos(id,productos);
  const r=await conBloqueo(id,async db=>{await exigirHabilitada(db,id); return db.query(`UPDATE ivan_imagenes_productos p SET principal=$2,actualizado_en=now()
    FROM jsonb_to_recordset($3::jsonb) AS x(id bigint,codigo text)
    WHERE p.mayorista_id=$1 AND p.producto_id=x.id AND p.codigo_producto=x.codigo RETURNING p.producto_id`,[id,principal,JSON.stringify(productos)]);});
  res.json({ok:true,mensaje:`Imagen principal actualizada en ${r.rowCount} productos con imagen propia.`});
}));
router.delete('/:mayorista_id/asignaciones',ruta(async(req,res)=>{
  const id=idSeguro(req.params.mayorista_id); await exigirHabilitada(pool,id);
  const productos=productosSeguros(req.body?.productos); await validarProductos(id,productos);
  const r=await conBloqueo(id,async db=>{await exigirHabilitada(db,id); return db.query(`DELETE FROM ivan_imagenes_productos p
    USING jsonb_to_recordset($2::jsonb) AS x(id bigint,codigo text)
    WHERE p.mayorista_id=$1 AND p.producto_id=x.id AND p.codigo_producto=x.codigo RETURNING p.producto_id`,[id,JSON.stringify(productos)]);});
  res.json({ok:true,mensaje:`Se quitaron ${r.rowCount} asignaciones. Los archivos se conservan para reutilizarlos y siguen ocupando espacio.`});
}));
router.post('/:mayorista_id/cargar',limite,ruta(async(req,res)=>{
  await exigirHabilitada(pool,idSeguro(req.params.mayorista_id));
  await new Promise((resolve,reject)=>carga(req,res,e=>e?reject(e):resolve()));
  const id=idSeguro(req.params.mayorista_id),cfg=cloudinaryConfig();
  if(!cfg) throw errorCliente('Cloudinary para Iván no está disponible.',503);
  const productos=productosSeguros(req.body?.productos),principal=principalSeguro(req.body?.principal);
  const solicitud=String(req.headers['idempotency-key'] || '');
  if(!UUID.test(solicitud)) throw errorCliente('Identificador de carga inválido.');
  if((!!req.file)+(!!String(req.body?.url || '').trim())!==1) throw errorCliente('Elegí una URL o un archivo.');
  await validarProductos(id,productos);
  let buffer;
  if(req.file) buffer=req.file.buffer;
  else {
    const file=await descargarImagenPublica(String(req.body.url).trim());
    buffer=Buffer.from(file.slice(file.indexOf(',')+1),'base64');
  }
  const imagen=imagenSegura(buffer);
  const hash=crypto.createHash('sha256').update(JSON.stringify({productos,principal,sha256:imagen.sha256})).digest('hex');
  const nuevoId=crypto.randomUUID(),publicId=`sistema-pedidos/ivan-propias/${id}/${nuevoId}`;
  const reservado=await conBloqueo(id,async db=>{
    const config=await exigirHabilitada(db,id);
    const anterior=await db.query('SELECT id,estado,solicitud_hash FROM ivan_imagenes_archivos WHERE mayorista_id=$1 AND solicitud_id=$2',[id,solicitud]);
    if(anterior.rowCount) {
      if(anterior.rows[0].solicitud_hash!==hash) throw errorCliente('Esta solicitud corresponde a otra selección o imagen.',409);
      if(anterior.rows[0].estado!=='lista') throw errorCliente('La carga ya está registrada y no se confirmó. Consultá al administrador; no se repetirá.',409);
      await asignar(db,id,anterior.rows[0].id,productos,principal);
      return {reutilizado:true,id:anterior.rows[0].id};
    }
    const igual=await db.query("SELECT id,estado FROM ivan_imagenes_archivos WHERE mayorista_id=$1 AND sha256=$2 AND estado IN ('subiendo','lista','revisar')",[id,imagen.sha256]);
    if(igual.rowCount) {
      if(igual.rows[0].estado!=='lista') throw errorCliente('Esta imagen tiene una carga sin confirmar. No se volverá a subir.',409);
      await asignar(db,id,igual.rows[0].id,productos,principal);
      return {reutilizado:true,id:igual.rows[0].id};
    }
    const u=await uso(db,id,periodoActual());
    if(u.archivos+u.inciertos>=config.limite_archivos || u.cargas_periodo>=config.limite_cargas_mes) throw errorCliente('Se alcanzó el límite de imágenes o cargas del mes. Consultá al administrador.',429);
    await db.query(`INSERT INTO ivan_imagenes_archivos(id,mayorista_id,solicitud_id,solicitud_hash,sha256,public_id,estado)
      VALUES($1,$2,$3,$4,$5,$6,'subiendo')`,[nuevoId,id,solicitud,hash,imagen.sha256,publicId]);
    return {reutilizado:false,id:nuevoId};
  });
  if(reservado.reutilizado) return res.json({ok:true,mensaje:`Imagen reutilizada en ${productos.length} productos. No se subió otro archivo.`});
  let inicioProveedor=false,asset;
  try {
    inicioProveedor=true;
    asset=await cloudinaryPost('image/upload',{file:imagen.file,public_id:publicId,overwrite:'false',transformation:'c_limit,w_1600,h_1600',tags:`ivan_propias,mayorista_${id}`},cfg);
    if(asset.public_id!==publicId || typeof asset.secure_url!=='string' || !asset.secure_url.startsWith(`https://res.cloudinary.com/${cfg.cloud}/image/upload/`)
       || !Number.isSafeInteger(asset.bytes) || asset.bytes<0) throw new Error('respuesta_proveedor_invalida');
    await pool.query("UPDATE ivan_imagenes_archivos SET estado='lista',url=$1,bytes=$2,formato=$3,actualizado_en=now() WHERE mayorista_id=$4 AND id=$5 AND estado='subiendo'",[asset.secure_url,asset.bytes,asset.format,id,nuevoId]);
    await conBloqueo(id,db=>asignar(db,id,nuevoId,productos,principal));
    res.status(201).json({ok:true,mensaje:`Imagen guardada y asignada a ${productos.length} productos. La original de Iván se conserva.`});
  } catch(e) {
    // Si el proveedor pudo haber recibido la carga, conservar la reserva y no reintentar automáticamente.
    await pool.query("UPDATE ivan_imagenes_archivos SET estado=$1,actualizado_en=now() WHERE mayorista_id=$2 AND id=$3 AND estado='subiendo'",[inicioProveedor?'revisar':'error',id,nuevoId]).catch(()=>{});
    if(e.status) throw e;
    throw errorCliente('No se confirmó toda la operación. La carga queda registrada; consultá al administrador antes de repetirla.',502);
  }
}));
router.use((e,req,res,next)=>res.status(e.code==='LIMIT_FILE_SIZE'?413:e.code==='42P01'?503:e.status || 500).json({mensaje:e.code==='LIMIT_FILE_SIZE'
  ? 'La imagen supera 8 MB.' : e.code==='42P01' ? 'La función todavía no está preparada en la base de datos.'
  : e.status?e.message:'No se pudo completar la operación de imágenes.'}));
module.exports=router;
