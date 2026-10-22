'use strict';
const pool=require('../db');
const {errorCliente}=require('./ivanImagenesDatos');
function normalizar(valor){
  const v={permitido:false,modo:'conservar',envio:'sin_confirmar',...(valor||{})};
  if((valor&&typeof valor!=='object')||Array.isArray(valor)||typeof v.permitido!=='boolean'||!['conservar','agregar','desglosar'].includes(v.modo)||!['sin_confirmar','neto','final'].includes(v.envio))throw errorCliente('Revisá la configuración de IVA opcional.');
  return {permitido:v.permitido,modo:v.modo,envio:v.envio};
}
function validar(o,modo){
  if(!['conservar','agregar','desglosar'].includes(modo))throw errorCliente('Elegí cómo tratar el IVA.');
  if(modo==='conservar')return;
  if(!o.catalogo_iva.permitido)throw errorCliente('El administrador debe permitir el cálculo opcional.');
  if(o.campo_precio!=='precio_producto'||o.unidad_precio!=='unidad')throw errorCliente('Para aplicar al catálogo confirmá precio_producto por unidad. Los precios por envase u otros campos quedan para revisión.');
  if(o.catalogo_iva.envio==='sin_confirmar')throw errorCliente('Falta confirmar con Iván cómo enviar el precio del pedido.');
  if((modo==='agregar'&&o.iva_origen!=='no_incluido')||(modo==='desglosar'&&o.iva_origen!=='incluido'))throw errorCliente('El modo no coincide con el IVA recibido. No se agrega IVA dos veces.');
  if(o.iva_fuente==='producto'?!o.campo_iva:o.alicuota_general===null)throw errorCliente('Falta confirmar la alícuota, general o por producto.');
}
async function calcular(filas,modo){
  if(!filas.length)return [];
  for(const f of filas){if(f.base===null||f.base===undefined||String(f.base).trim()===''||!Number.isFinite(Number(f.base))||Number(f.base)<0||f.tasa===null||f.tasa===undefined||String(f.tasa).trim()===''||!Number.isFinite(Number(f.tasa))||Number(f.tasa)<0||Number(f.tasa)>100)throw errorCliente('Hay un precio o una alícuota sin confirmar. No se usó cero ni una tasa automática.',409);}
  const r=await pool.query(`WITH f AS(SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(id text,base numeric,tasa numeric)),
    c AS(SELECT id,base,tasa,CASE WHEN $2='agregar' THEN ROUND(base*(1+tasa/100),2) ELSE ROUND(base,2) END AS total,
      CASE WHEN $2='agregar' THEN ROUND(base,2) ELSE ROUND(base/(1+tasa/100),2) END AS neto FROM f)
    SELECT id,base::text,tasa::text,total::text,neto::text,(total-neto)::text AS impuesto FROM c`,[JSON.stringify(filas),modo]);
  return r.rows;
}
module.exports={normalizar,validar,calcular};
