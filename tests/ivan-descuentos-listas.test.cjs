'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),http=require('node:http'),express=require('express');
const reglas=require('../services/ivanDescuentosReglas');
test('listado inicial, páginas, selección filtrada completa y autorización permanecen aislados',async()=>{
 let datos=Array.from({length:120},(_,i)=>({cuit:String(20000000000+i),nombre:i===0?'PE\uFFFD A REPUESTOS':'CLIENTE '+String(i).padStart(3,'0')}));
 const consultas=[];
 const externo={query:async(sql,params)=>{consultas.push({sql,params});assert.ok(sql.includes('"viewClientes"'));assert.ok(!/\b(INSERT|UPDATE|DELETE|ALTER)\b/.test(sql));assert.ok(sql.includes('es_activo=true'));
  const valor=params[0].slice(1,-1).replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/_/g,'.');const filtro=new RegExp(valor,'i');const filtrados=datos.filter(c=>filtro.test(c.nombre)||filtro.test(c.cuit));
  if(sql.includes('COUNT(*)'))return {rows:[{total:filtrados.length}]};
  return {rows:sql.includes('LIMIT 5001')?filtrados.slice(0,5001):filtrados.slice(params[1],params[1]+50)};
 }};
 const modulo={exports:{}};const archivo=path.resolve(__dirname,'../routes/descuentos-comerciales.js');
 vm.runInNewContext(fs.readFileSync(archivo,'utf8'),{module:modulo,exports:modulo.exports,process:{env:{JWT_SECRET:'local'}},require:n=>{
  if(n==='express')return express;if(n==='jsonwebtoken')return {verify:t=>{if(t==='propio')return {id:23};if(t==='otro')return {id:99};throw new Error();}};
  if(n==='express-rate-limit')return ()=>((req,res,next)=>next());
  if(n==='../services/conexionMayorista')return {getConexionMayorista:async id=>{assert.equal(id,23);return externo;}};
  if(n==='../services/ivanFuncionesCatalogo')return {mayoristaValido:async id=>Number(id)};
  if(n==='../services/ivanDescuentosComerciales')return {leer:async()=>({habilitado:true,disponible:true}),sesionCliente:()=>false};
  if(n==='../services/ivanDescuentosReglas')return reglas;throw new Error(n);
 }},{filename:archivo});
 const app=express();app.use('/d',modulo.exports);const server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/d/23/clientes';
 const consultar=async(sufijo='',token='propio')=>{const r=await fetch(base+sufijo,{headers:{Authorization:'Bearer '+token}});return {status:r.status,body:await r.json()};};
 try{
  let r=await consultar();assert.equal(r.status,200);assert.equal(r.body.total,120);assert.equal(r.body.clientes.length,50);assert.equal(r.body.totalPaginas,3);assert.equal(r.body.clientes[0].nombre,datos[0].nombre,'No altera texto o identificadores del origen');
  r=await consultar('?pagina=2');assert.equal(r.body.clientes[0].cuit,datos[50].cuit);
  r=await consultar('?q=CLIENTE&todos=1');assert.equal(r.body.clientes.length,119,'Todos los resultados, no solo primera página');
  r=await consultar('?q=PE%C3%91');assert.equal(r.status,200);assert.ok(consultas.at(-1).params[0].includes('PE_'),'Búsqueda tolerante de ñ sin cambiar la conexión');
  const ataques="' OR true--";await consultar('?q='+encodeURIComponent(ataques));assert.ok(consultas.at(-1).params[0].includes(ataques));assert.ok(!consultas.at(-1).sql.includes(ataques));
  let prev=consultas.length;r=await consultar('', 'otro');assert.equal(r.status,401);assert.equal(consultas.length,prev);
  r=await consultar('?pagina=0');assert.equal(r.status,400);assert.equal(consultas.length,prev);
  r=await consultar('?q='+'x'.repeat(101));assert.equal(r.status,400);assert.equal(consultas.length,prev);
  datos=Array.from({length:5001},(_,i)=>({cuit:String(20000000000+i),nombre:'CLIENTE'}));r=await consultar('?todos=1');assert.equal(r.status,400);assert.match(r.body.mensaje,/5.000/);
 }finally{await new Promise(r=>server.close(r));}
});