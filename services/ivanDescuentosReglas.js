'use strict';
const {randomUUID}=require('crypto');
const {idSeguro}=require('./ivanImagenesDatos');
const error=(mensaje,status=400)=>Object.assign(new Error(mensaje),{status});
const texto=v=>String(v??'').trim();
const cuit=v=>texto(v).replace(/\D/g,'');
const pct=v=>{if(v===null||v===undefined||texto(v)==='')throw error('Indicá el porcentaje, incluido 0 si no hay descuento.');const n=Number(String(v).replace(',','.'));if(!Number.isFinite(n)||n<0||n>100)throw error('Los descuentos deben estar entre 0 y 100.');if(Number(n.toFixed(4))!==n)throw error('Usá hasta cuatro decimales para los porcentajes.');return n;};
const uuid=v=>/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(texto(v));
const peso=r=>r.producto_id?4:(r.rubro?2:0)+(r.marca?1:0);
function validar(body){
  if(!body||typeof body.activo!=='boolean'||!Number.isSafeInteger(body.version)||body.version<0)throw error('Configuración o versión inválida.');
  const origen=body.origen_precio;if(!['','lista','general_incluido'].includes(origen))throw error('Indicá cómo llega el precio de Iván.');
  const dto_general=pct(body.dto_general);if(body.activo&&!origen)throw error('Antes de activar, confirmá si el precio recibido ya incluye el descuento general.');
  if(!Array.isArray(body.perfiles)||body.perfiles.length>100||!Array.isArray(body.asignaciones)||body.asignaciones.length>5000)throw error('Límite: 100 perfiles y 5.000 asignaciones.');
  const ids=new Set(),nombres=new Set();let total=0;
  const perfiles=body.perfiles.map(p=>{
    const id=texto(p.id),nombre=texto(p.nombre);if(!uuid(id)||ids.has(id)||!nombre||nombre.length>80||nombres.has(nombre.toLocaleLowerCase()))throw error('Los perfiles necesitan un nombre e identificador únicos.');ids.add(id);nombres.add(nombre.toLocaleLowerCase());
    if(!Array.isArray(p.reglas)||p.reglas.length>300)throw error('Cada perfil admite hasta 300 reglas.');total+=p.reglas.length;if(total>2000)throw error('Límite de 2.000 reglas entre todos los perfiles.');
    const claves=new Set();const reglas=p.reglas.map(r=>{
      const rubro=texto(r.rubro),marca=texto(r.marca);
      const producto=r.producto_id===undefined||r.producto_id===null||r.producto_id===''?'':String(idSeguro(r.producto_id));
      const key=producto?'producto:'+producto:JSON.stringify([rubro,marca]);
      if((!producto&&!rubro&&!marca)||(producto&&(rubro||marca))||rubro.length>200||marca.length>200||claves.has(key))throw error('Revisá reglas repetidas: elegí producto o rubro/marca, sin mezclarlos en la misma regla.');
      claves.add(key);return {id:uuid(r.id)?r.id:randomUUID(),rubro,marca,descuento:pct(r.descuento),
        ...(producto?{producto_id:producto,producto_codigo:texto(r.producto_codigo).slice(0,200),producto_descripcion:texto(r.producto_descripcion).slice(0,300)}:{})};
    });
    return {id,nombre,descuento_base:pct(p.descuento_base),reglas};
  });
  const documentos=new Set();const asignaciones=body.asignaciones.map(a=>{const documento=cuit(a.cuit),perfil_id=texto(a.perfil_id);if(documento.length<7||documento.length>20||documentos.has(documento)||!ids.has(perfil_id))throw error('Cliente repetido, documento inválido o perfil inexistente.');documentos.add(documento);return {cuit:documento,perfil_id};});
  const perfil_default=texto(body.perfil_default);if(perfil_default&&!ids.has(perfil_default))throw error('El perfil predeterminado ya no existe.');
  if(body.activo&&!perfiles.length)throw error('Creá al menos un perfil antes de activar.');
  return {activo:body.activo,dto_general,origen_precio:origen,perfil_default,datos:{perfiles,asignaciones}};
}
function resolver(config,documento){
  if(!config?.habilitado||!config.activo)return null;
  const perfiles=config.datos?.perfiles||[],asignaciones=config.datos?.asignaciones||[];
  const id=asignaciones.find(a=>a.cuit===cuit(documento))?.perfil_id||config.perfil_default;
  const perfil=perfiles.find(p=>p.id===id);if(!perfil)return null;
  if(!['lista','general_incluido'].includes(config.origen_precio))throw error('Falta confirmar el origen del precio.',503);
  return {dto_general:Number(config.dto_general),origen_precio:config.origen_precio,perfil,version:Number(config.version)};
}
function elegir(producto,perfil){return perfil.reglas.filter(r=>r.producto_id?String(r.producto_id)===String(producto.id_producto):(!r.rubro||r.rubro===texto(producto.des_producto_rubro))&&(!r.marca||r.marca===texto(producto.des_producto_marca))).sort((a,b)=>peso(b)-peso(a))[0]||null;}
function calcular(precio,condicion,producto={}){
  if(precio===null||precio===undefined||precio==='')return null;
  const recibido=Number(precio);if(!Number.isFinite(recibido)||recibido<0)throw error('El producto no tiene un precio válido.',503);
  const regla=elegir(producto,condicion.perfil),adicional=regla?regla.descuento:condicion.perfil.descuento_base;
  const factorGeneral=condicion.origen_precio==='lista'?1-condicion.dto_general/100:1;
  const importe=Math.round((recibido*factorGeneral*(1-adicional/100)+Number.EPSILON)*100)/100;
  return {importe,recibido,general:condicion.dto_general,general_incluido:condicion.origen_precio==='general_incluido',adicional,perfil:condicion.perfil.nombre,regla:regla?{rubro:regla.rubro,marca:regla.marca,...(regla.producto_id?{producto_id:regla.producto_id,producto_codigo:regla.producto_codigo,producto_descripcion:regla.producto_descripcion}:{})}:null,version:condicion.version};
}
function aplicar(productos,condicion){return productos.map(p=>{const d=calcular(p.precio_producto,condicion,p);return d?{...p,precio_producto:d.importe,descuentos_comerciales:d}:p;});}
function ordenSql(condicion,params){
  const parametro=v=>{params.push(v);return '$'+params.length;};
  const reglas=[...condicion.perfil.reglas].sort((a,b)=>peso(b)-peso(a));
  const casos=reglas.map(r=>{const filtros=[];if(r.producto_id)filtros.push(`id_producto=${parametro(r.producto_id)}::integer`);if(r.rubro)filtros.push(`BTRIM(COALESCE(des_producto_rubro,''))=${parametro(r.rubro)}`);if(r.marca)filtros.push(`BTRIM(COALESCE(des_producto_marca,''))=${parametro(r.marca)}`);return `WHEN ${filtros.join(' AND ')} THEN ${parametro(1-r.descuento/100)}::numeric`;});
  const base=parametro(1-condicion.perfil.descuento_base/100),general=parametro(condicion.origen_precio==='lista'?1-condicion.dto_general/100:1);
  return `ROUND((precio_producto::numeric * ${general}::numeric * ${casos.length?'(CASE '+casos.join(' ')+' ELSE '+base+'::numeric END)':base+'::numeric'})::numeric,2)`;
}
module.exports={validar,resolver,elegir,calcular,aplicar,ordenSql,cuit,error};
