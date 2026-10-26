'use strict';
const router=require('express').Router();
const jwt=require('jsonwebtoken');
const rateLimit=require('express-rate-limit');
const conexion=require('../services/conexionMayorista');
const {mayoristaValido}=require('../services/ivanFuncionesCatalogo');
const servicio=require('../services/ivanDescuentosComerciales');
const reglas=require('../services/ivanDescuentosReglas');
const precioOrigen=require('../services/ivanPrecioOrigen');
const consultaCondicion=require('../services/ivanConsultaCondicion');
const condicionesOrigen=require('../services/ivanCondicionesOrigen');
const circuitoCliente=require('../services/ivanCircuitoCliente');
const ruta=f=>(req,res,next)=>Promise.resolve(f(req,res)).catch(next);
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.get('/habilitacion-precios/:id',ruta(async(req,res)=>{const id=await mayoristaValido(req.params.id,true);const cfg=await precioOrigen.leer(id);res.json({habilitado:cfg.disponible&&cfg.habilitado,disponible:cfg.disponible,iva_opcional_disponible:true,sesion_costos_verificada:true,sesion_costos_revision:2});}));
router.get('/habilitacion/:id',ruta(async(req,res)=>{const id=await mayoristaValido(req.params.id,true);const cfg=await servicio.leer(id);res.json({habilitado:cfg.habilitado,disponible:cfg.disponible,productos_disponibles:true,condiciones_ivan_disponibles:true,condiciones_ivan_consulta_independiente:true,condiciones_ivan_cuit_reglas:true,condiciones_ivan_iva_efectivo:true,condiciones_ivan_solo_vista:true,condiciones_ivan_revision_lectura:true,condiciones_ivan_revision_compatible:true,condiciones_ivan_muestra_vista:true,condiciones_ivan_cliente_origen:true,condiciones_ivan_cascada_completa:true});}));
router.get('/mi-condicion/:id',ruta(async(req,res)=>{const id=await mayoristaValido(req.params.id,true);if(!servicio.sesionCliente(req,id))throw reglas.error('Sesión de cliente requerida para este mayorista.',401);res.json({condicion:await servicio.condicion(req,id)});}));
router.use('/:id',(req,res,next)=>{try{const s=jwt.verify(String(req.headers.authorization||'').replace(/^Bearer\s+/i,''),process.env.JWT_SECRET);if(s.tipo||!s.id||Number(s.id)!==Number(req.params.id))throw new Error();req.mayoristaDescuentos=Number(s.id);next();}catch{res.status(401).json({mensaje:'Ingresá con la cuenta de este mayorista.'});}});
router.get('/:id/origen-precio',ruta(async(req,res)=>res.json(await precioOrigen.habilitada(req.mayoristaDescuentos))));
router.put('/:id/origen-precio',rateLimit({windowMs:60000,max:12,standardHeaders:true,legacyHeaders:false}),ruta(async(req,res)=>res.json(await precioOrigen.guardarPresentacion(req.mayoristaDescuentos,req.body))));
router.put('/:id/origen-precio/iva-catalogo',rateLimit({windowMs:60000,max:12,standardHeaders:true,legacyHeaders:false}),ruta(async(req,res)=>res.json(await precioOrigen.guardarIva(req.mayoristaDescuentos,req.body))));
router.get('/:id/origen-precio/productos',ruta(async(req,res)=>res.json(await precioOrigen.productos(req.mayoristaDescuentos,req.query.q))));
router.post('/:id/origen-precio/vista-previa',rateLimit({windowMs:60000,max:60,standardHeaders:true,legacyHeaders:false}),ruta(async(req,res)=>res.json(await precioOrigen.previa(req.mayoristaDescuentos,req.body))));
router.use('/:id',(req,res,next)=>{Promise.resolve().then(async()=>{await mayoristaValido(req.params.id,true);const cfg=await servicio.leer(req.params.id);if(!cfg.habilitado)throw reglas.error(cfg.disponible?'El administrador debe habilitar los descuentos comerciales.':'Falta crear las tablas de descuentos.',cfg.disponible?403:503);req.configDescuentos=cfg;next();}).catch(next);});
router.get('/:id',ruta(async(req,res)=>res.json(req.configDescuentos)));
router.get('/:id/origen-ivan',ruta(async(req,res)=>res.json(circuitoCliente.esCircuito(req.configDescuentos)?await circuitoCliente.resumen(req.mayoristaDescuentos,req.configDescuentos):await condicionesOrigen.leer(req.mayoristaDescuentos))));
router.put('/:id/origen-ivan/iva',rateLimit({windowMs:60000,max:12,standardHeaders:true,legacyHeaders:false}),ruta(async(req,res)=>res.json(await circuitoCliente.guardarIva(req.mayoristaDescuentos,req.body))));
router.get('/:id/origen-ivan/cliente',rateLimit({windowMs:60000,max:60,standardHeaders:true,legacyHeaders:false}),ruta(async(req,res)=>res.json(circuitoCliente.esCircuito(req.configDescuentos)?await circuitoCliente.consultarCliente(req.mayoristaDescuentos,req.query.cuit):await condicionesOrigen.consultarCliente(req.mayoristaDescuentos,req.query.cuit))));
router.get('/:id/origen-ivan/lectura',ruta(async(req,res)=>res.status(403).json({mensaje:'La revisión técnica está disponible en el panel admin.'})));
router.get('/:id/origen-ivan/productos',rateLimit({windowMs:60000,max:60,standardHeaders:true,legacyHeaders:false}),ruta(async(req,res)=>res.json(await condicionesOrigen.buscarProductos(req.mayoristaDescuentos,req.query))));
router.post('/:id/origen-ivan/producto',rateLimit({windowMs:60000,max:60,standardHeaders:true,legacyHeaders:false}),ruta(async(req,res)=>res.json(circuitoCliente.esCircuito(req.configDescuentos)?await circuitoCliente.consultarProducto(req.mayoristaDescuentos,req.body):await condicionesOrigen.consultarProducto(req.mayoristaDescuentos,req.body))));
router.get('/:id/consulta-productos',rateLimit({windowMs:60000,max:60,standardHeaders:true,legacyHeaders:false}),ruta(async(req,res)=>res.json(await consultaCondicion.buscarProductos(req.mayoristaDescuentos,req.query.q))));
router.get('/:id/productos-seleccion',rateLimit({windowMs:60000,max:60,standardHeaders:true,legacyHeaders:false}),ruta(async(req,res)=>res.json(await consultaCondicion.seleccionarProductos(req.mayoristaDescuentos,req.query))));
router.post('/:id/consulta-precio',rateLimit({windowMs:60000,max:60,standardHeaders:true,legacyHeaders:false}),ruta(async(req,res)=>{if(req.configDescuentos.datos?.ivan?.habilitado)throw reglas.error('Recargá el panel para consultar las condiciones de Iván.',409);res.json(await consultaCondicion.consultar(req.mayoristaDescuentos,req.body));}));
router.put('/:id',rateLimit({windowMs:60000,max:12,standardHeaders:true,legacyHeaders:false}),ruta(async(req,res)=>res.json(await servicio.guardar(req.mayoristaDescuentos,req.body))));
router.get('/:id/opciones',ruta(async(req,res)=>{const db=await conexion.getConexionMayorista(req.mayoristaDescuentos);if(!db)throw reglas.error('Catálogo no disponible.',503);const r=await db.query('SELECT DISTINCT BTRIM(des_producto_rubro) AS rubro,BTRIM(des_producto_marca) AS marca FROM "viewProductos"');res.json({rubros:[...new Set(r.rows.map(p=>p.rubro).filter(Boolean))].sort(),marcas:[...new Set(r.rows.map(p=>p.marca).filter(Boolean))].sort(),productos_disponibles:true});}));
router.get('/:id/clientes',ruta(async(req,res)=>{
  const busqueda=String(req.query.q||'').trim();
  if(busqueda.length>100)throw reglas.error('Búsqueda demasiado larga.');
  const pagina=Number(req.query.pagina||1),todos=req.query.todos==='1';
  if(!Number.isSafeInteger(pagina)||pagina<1||pagina>1000000)throw reglas.error('Página inválida.');
  const db=await conexion.getConexionMayorista(req.mayoristaDescuentos);
  if(!db)throw reglas.error('Clientes no disponibles.',503);
  // Mismo criterio de búsqueda tolerante de las pantallas anteriores; no cambia datos.
  const patron='%'+busqueda.replace(/[ñÑáéíóúÁÉÍÓÚ\uFFFD]/g,'_')+'%';
  const cte=`WITH clientes AS (
    SELECT DISTINCT ON (regexp_replace(doc_cliente::text,'[^0-9]','','g'))
      regexp_replace(doc_cliente::text,'[^0-9]','','g') AS cuit,
      COALESCE(NULLIF(BTRIM(nom_fan_cliente),''),BTRIM(raz_soc_cliente),'') AS nombre,
      COALESCE(raz_soc_cliente,'') AS razon_social
    FROM "viewClientes" WHERE es_activo=true AND doc_cliente IS NOT NULL
    ORDER BY regexp_replace(doc_cliente::text,'[^0-9]','','g'),id_cliente
  ) `;
  const filtro="char_length(cuit) BETWEEN 7 AND 20 AND (cuit ILIKE $1 OR nombre ILIKE $1 OR razon_social ILIKE $1)";
  if(todos){
    const r=await db.query(cte+'SELECT cuit,nombre FROM clientes WHERE '+filtro+' ORDER BY nombre,cuit LIMIT 5001',[patron]);
    if(r.rows.length>5000)throw reglas.error('El filtro supera los 5.000 clientes. Acotá la búsqueda para seleccionar sus resultados.',400);
    return res.json({clientes:r.rows,total:r.rows.length,pagina:1,totalPaginas:1});
  }
  const cuenta=await db.query(cte+'SELECT COUNT(*)::integer AS total FROM clientes WHERE '+filtro,[patron]);
  const total=Number(cuenta.rows[0]?.total||0),totalPaginas=Math.ceil(total/50),actual=Math.min(pagina,Math.max(1,totalPaginas));
  const r=await db.query(cte+'SELECT cuit,nombre FROM clientes WHERE '+filtro+' ORDER BY nombre,cuit LIMIT 50 OFFSET $2',[patron,(actual-1)*50]);
  res.json({clientes:r.rows,total,pagina:actual,totalPaginas});
}));
router.use((e,req,res,next)=>res.status(e.status||503).json({mensaje:e.status?e.message:'No se pudo consultar o guardar los descuentos. No se modificó la configuración.'}));
module.exports=router;
