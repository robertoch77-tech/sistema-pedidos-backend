'use strict';
const crypto=require('crypto');
const pool=require('../db');
const origen=require('./ivanPrecioOrigen');
const calculo=require('./ivanIvaCalculo');
const {errorCliente,idSeguro}=require('./ivanImagenesDatos');
const documento=v=>String(v||'').replace(/\D/g,'');
const contenido=d=>JSON.stringify([String(d.mayorista_id),documento(d.cuit),String(d.producto_id),d.version,d.modo,d.envio,d.tasa,d.neto,d.impuesto,d.total,d.base,d.recibido]);
const firma=d=>crypto.createHmac('sha256',process.env.JWT_SECRET).update(contenido(d)).digest('hex');
async function contexto(id,db,cuit=''){
  const cfg=await origen.leer(id),o=cfg.origen;
  if(!cfg.disponible||!cfg.habilitado||!o.catalogo_iva.permitido||o.catalogo_iva.modo==='conservar')return null;
  calculo.validar(o,o.catalogo_iva.modo);
  const modelo=await pool.query('SELECT modelo_precio_catalogo,dto_pago_termino FROM mayoristas WHERE id=$1',[id]);
  if(modelo.rows[0]?.modelo_precio_catalogo!=='precio_recibido')throw errorCliente('Hay dos modelos de precio incompatibles. Revisá el IVA opcional de este mayorista.',409);
  await origen.dbOrigen(id,o);
  return {id,db,cuit:documento(cuit),version:cfg.version,origen:o,modo:o.catalogo_iva.modo,envio:o.catalogo_iva.envio,dtoPago:parseFloat(modelo.rows[0].dto_pago_termino)||0};
}
async function aplicar(productos,ctx,recibidos=productos){
  if(!ctx||!productos.length)return productos;
  const ids=[...new Set(productos.map(p=>idSeguro(p.id_producto)))];
  let tasas=new Map();
  if(ctx.origen.iva_fuente==='producto'){
    const r=await ctx.db.query(`SELECT id_producto,${origen.campoSql(ctx.origen.campo_iva)}::text AS tasa FROM "viewProductos" WHERE id_producto=ANY($1::integer[])`,[ids]);
    tasas=new Map(r.rows.map(p=>[String(p.id_producto),p.tasa]));
  }
  const originales=new Map(recibidos.map(p=>[String(p.id_producto),p.precio_producto]));
  const importes=await calculo.calcular(productos.map(p=>({id:String(p.id_producto),base:p.precio_producto,tasa:ctx.origen.iva_fuente==='producto'?tasas.get(String(p.id_producto)):ctx.origen.alicuota_general})),ctx.modo);
  const porId=new Map(importes.map(p=>[p.id,p]));
  return productos.map(p=>{
    const v=porId.get(String(p.id_producto));
    const detalle={mayorista_id:String(ctx.id),cuit:ctx.cuit,producto_id:String(p.id_producto),version:ctx.version,modo:ctx.modo,envio:ctx.envio,
      tasa:Number(v.tasa),neto:Number(v.neto),impuesto:Number(v.impuesto),total:Number(v.total),base:Number(v.base),recibido:String(originales.get(String(p.id_producto)))};
    return {...p,precio_producto:detalle.total,precio_catalogo_incluye_iva:true,iva_producto_aplicada:detalle.tasa,iva_catalogo:{...detalle,firma:firma(detalle)}};
  });
}
function ordenarSql(expresion,ctx,parametros){
  if(!ctx||ctx.modo!=='agregar')return expresion;
  let tasa;
  if(ctx.origen.iva_fuente==='producto')tasa=origen.campoSql(ctx.origen.campo_iva);
  else{parametros.push(ctx.origen.alicuota_general);tasa='$'+parametros.length+'::numeric';}
  return `ROUND((${expresion})::numeric*(1+(${tasa})::numeric/100),2)`;
}
async function validarPedido(id,cuit,items,pedidoId){
  const cfg=await origen.leer(id);
  const activo=cfg.disponible&&cfg.habilitado&&cfg.origen.catalogo_iva.permitido&&cfg.origen.catalogo_iva.modo!=='conservar';
  let tenia=false;
  if(pedidoId){try{const r=await pool.query('SELECT 1 FROM public.ivan_pedido_iva_snapshot WHERE pedido_id=$1 LIMIT 1',[pedidoId]);tenia=!!r.rows.length;}catch(e){if(e.code!=='42P01')throw e;}}
  const requiere=activo||tenia||items.some(p=>p.iva_catalogo);
  if(!requiere)return items.map(()=>null);
  const filas=[];
  for(const [pos,item] of items.entries()){
    const d=item.iva_catalogo;
    if(!d){if(!item.es_oferta)throw errorCliente('Actualizá el catálogo antes de guardar: falta el detalle del IVA elegido. No se modificó el pedido.',409);continue;}
    const recibida=String(d.firma||''),esperada=firma(d);
    if(!/^[a-f0-9]{64}$/.test(recibida)||!crypto.timingSafeEqual(Buffer.from(recibida,'hex'),Buffer.from(esperada,'hex'))||String(d.mayorista_id)!==String(id)||documento(d.cuit)!==documento(cuit)||String(d.producto_id)!==String(item.producto_id)||!Number.isFinite(Number(item.precio_unitario))||Number(item.precio_unitario)!==d.total)throw errorCliente('El precio o detalle de IVA cambió. Actualizá el catálogo antes de guardar.',409);
    if(!Number.isFinite(Number(item.cantidad))||Number(item.cantidad)<=0)throw errorCliente('Cantidad inválida.');
    filas.push({pos:String(pos),unitario:d.envio==='neto'?d.neto:d.total,cantidad:item.cantidad,tasa:d.envio==='neto'?d.tasa:0});
  }
  if(!filas.length)return items.map(()=>null);
  const r=await pool.query(`SELECT pos,ROUND(unitario*cantidad,2)::text AS importe,tasa::text FROM jsonb_to_recordset($1::jsonb) AS f(pos text,unitario numeric,cantidad numeric,tasa numeric)`,[JSON.stringify(filas)]);
  const mapa=new Map(r.rows.map(p=>[Number(p.pos),{importe:p.importe,tasa:Number(p.tasa)}]));
  return items.map((_,i)=>mapa.get(i)||null);
}
async function guardarSnapshot(db,pedidoId,itemId,item){
  if(item.iva_catalogo)await db.query('INSERT INTO public.ivan_pedido_iva_snapshot(pedido_item_id,pedido_id,producto_id,datos) VALUES($1,$2,$3,$4::jsonb)',[itemId,pedidoId,item.producto_id,JSON.stringify(item.iva_catalogo)]);
}
async function anexar(pedidos){
  if(pedidos.every(p=>!Array.isArray(p.items)))return pedidos;
  const limpios=pedidos.map(p=>({...p,items:(p.items||[]).map(({id_item,...item})=>item)}));
  if(!pedidos.length)return limpios;
  try{
    const r=await pool.query('SELECT pedido_item_id,datos FROM public.ivan_pedido_iva_snapshot WHERE pedido_id=ANY($1::bigint[])',[pedidos.map(p=>p.id)]);
    if(!r.rows.length)return limpios;
    const mapa=new Map(r.rows.map(p=>[String(p.pedido_item_id),p.datos]));
    return pedidos.map((p,i)=>({...limpios[i],items:p.items.map(({id_item,...item})=>mapa.has(String(id_item))?{...item,iva_catalogo:mapa.get(String(id_item))}:item)}));
  }catch(e){if(e.code==='42P01')return limpios;throw e;}
}
module.exports={contexto,aplicar,ordenarSql,validarPedido,guardarSnapshot,anexar};
