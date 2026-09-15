const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ruta = require.resolve('../routes/superadmin/arca');
const soap = (m,x) => `<Envelope><Body><${m}Response><${m}Result>${x}</${m}Result></${m}Response></Body></Envelope>`;
function entorno(opciones={}) {
  const llamadas=[], diarios=[], remoto=[];
  const nota={id:7,cliente_id:11,tipo:'emitida',estado:'emitida',anulada:false,venta_id:9,
    subtotal:'100',total_iva:'21',total:'121',...opciones.nota};
  const item={cantidad:1,descripcion:'PRODUCTO FICTICIO',subtotal:nota.subtotal,total_item:nota.total,modo_iva:'agregar',alicuota_iva:21,...opciones.item};
  const db={release(){llamadas.push('release');},async query(sql,p){
    llamadas.push({sql,p});
    if(sql.includes('pg_try_advisory')) return {rows:[{ok:opciones.lock!==false}]};
    if(sql.includes('SELECT * FROM arca_configuracion')) return {rows:[{punto_venta:4,modo:'produccion',cuit:'30000000007',emite_nota_credito:true}]};
    if(sql.includes('SELECT * FROM notas_credito')) return {rows:opciones.ausente?[]:[nota]};
    if(sql.includes('SELECT response FROM arca_logs')) return {rows:opciones.previo?[{response:opciones.previo}]:[]};
    if(sql.includes('SELECT ac.*')) return {rows:[{id:3,tipo_comprobante:'6',numero:99,punto_venta:3,
      importe_total:'500',cae:'71111111111111',receptor_cond_iva:'5',receptor_cuit:'0',receptor_nombre:'CF'}]};
    if(sql.includes('SELECT to_jsonb(i)')) return {rows:[{item}]};
    if(sql.includes('SELECT a.cuit,a.razon_social')) return {rows:[{cuit:'30000000007',razon_social:'EMISOR FICTICIO',condicion_iva:'1',
      direccion_fiscal:'DOMICILIO FICTICIO',ingresos_brutos:'FICTICIO',inicio_actividades:'2000-01-01'}]};
    if(sql.includes('SELECT request FROM arca_logs')) return {rows:[]};
    if(sql.includes('SELECT * FROM arca_comprobantes WHERE id=')) return {rows:[{tipo_comprobante:'8',cae:'71111111111111',numero_completo:'NCB-00004-00000001',importe_total:'121'}]};
    if(sql.includes('SELECT * FROM libros_iva_ventas WHERE comprobante_id=')) return {rows:[{cae:'71111111111111',importe_total:'-121'}]};
    if(sql.includes('INSERT INTO arca_comprobantes')) return {rows:[{id:8}]};
    if(sql.includes('INSERT INTO libros_iva_ventas') && opciones.fallaLibro) throw new Error('Fallo de libro simulado');
    return {rows:[],rowCount:1};
  }};
  const pool={async connect(){return db;},async query(sql,p){
    diarios.push({sql,p}); return {rows:[{id:10}],rowCount:1};
  }};
  const axios={async post(_url,xml){
    remoto.push(xml);
    if(xml.includes('<ar:FECompUltimoAutorizado>')) return {data:soap('FECompUltimoAutorizado','<CbteNro>0</CbteNro>')};
    assert(diarios.some(d=>d.sql.includes('INSERT INTO arca_logs')),'diario previo al CAE');
    if(opciones.timeout) throw new Error('Timeout simulado');
    const r=opciones.rechazo?'R':'A';
    return {data:soap('FECAESolicitar',`<FeCabResp><PtoVta>4</PtoVta><CbteTipo>8</CbteTipo><Resultado>${r}</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><Resultado>${r}</Resultado><CbteDesde>1</CbteDesde><CbteHasta>1</CbteHasta><CAE>71111111111111</CAE><CAEFchVto>20260923</CAEFchVto></FECAEDetResponse></FeDetResp>`)};
  }};
  let handler;
  const fuente=fs.readFileSync(ruta,'utf8');
  const inicio=fuente.indexOf("router.post('/emitir-nc/:cliente_id'");
  const fin=fuente.indexOf('// ─── CONCILIAR N/C',inicio);
  vm.runInNewContext(fuente.slice(inicio,fin),{router:{post(_ruta,_auth,h){handler=h;}},verificarClienteId(){},
    require:createRequire(ruta),pool,axios,obtenerToken:async()=>({token:'SIMULADO',sign:'SIMULADO'}),
    fechaComprobanteARCA:()=> '20260913',alicuotaAfipId:a=>a===21?5:4,
    WSFE_PROD:'SIMULADO',WSFE_HOMO:'SIMULADO',logARCA:async()=>{},console:{error(){}}});
  const res={code:200,status(n){this.code=n;return this;},json(b){this.body=b;return this;}};
  return {llamadas,diarios,remoto,res,async ejecutar(){await handler({params:{cliente_id:11},body:{nota_id:7,
    punto_venta_origen:123,items:[{precio_unitario:99999}]}},res);return res;}};
}
test('N/C simulada: usa nota guardada, emite por 4, asocia origen 3 y no mueve CC/stock/caja',async()=>{
  const e=entorno();const r=await e.ejecutar();assert.equal(r.code,200);assert.equal(r.body.importe_total,'121.00');
  const xml=e.remoto[1];assert(xml.includes('<ar:ImpTotal>121.00</ar:ImpTotal>'));
  assert(xml.includes('<ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>4</ar:PtoVta>'));
  assert(xml.includes('<ar:PtoVta>3</ar:PtoVta>')); assert(xml.includes('<ar:CondicionIVAReceptorId>5</ar:CondicionIVAReceptorId>'));
  const textos=e.llamadas.filter(x=>x.sql).map(x=>x.sql).join('\n');
  assert(!/UPDATE notas_credito|movimientos_cuentas_corrientes|UPDATE ventas|stock_movimientos|caja_movimientos/.test(textos));
  assert(textos.includes('COMMIT'));assert.equal(e.llamadas.at(-1),'release');
});
test('N/C simulada: off no agrega IVA; discriminar no duplica el IVA incluido',async()=>{
  for(const opciones of [{nota:{subtotal:'100',total_iva:'0',total:'100'},item:{modo_iva:'off'}},{item:{modo_iva:'discriminar'}}]) {
    const e=entorno(opciones);assert.equal((await e.ejecutar()).code,200);
    const xml=e.remoto[1];const off=opciones.item.modo_iva==='off';
    assert(xml.includes(`<ar:ImpTotal>${off?'100.00':'121.00'}</ar:ImpTotal>`));
    assert(xml.includes(`<ar:ImpIVA>${off?'0.00':'21.00'}</ar:ImpIVA>`));
  }
});
test('N/C simulada: borrador, anulada, otro cliente y lock ocupado no llaman ARCA',async()=>{
  for(const opciones of [{nota:{estado:'borrador'}},{nota:{anulada:true}},{ausente:true},{lock:false}]) {
    const e=entorno(opciones);assert.equal((await e.ejecutar()).code,409);assert.equal(e.remoto.length,0);
  }
});
test('N/C simulada: mismo intento pendiente bloquea; registrado devuelve resultado sin nueva solicitud',async()=>{
  const e=entorno({previo:''});e.res.code=200;
  const pendiente=entorno({previo:'{"cae":"71111111111111"}'});
  assert.equal((await pendiente.ejecutar()).code,409);assert.equal(pendiente.remoto.length,0);
  const registrado=entorno({previo:'registrada|{"ok":true,"cae":"71111111111111","comprobante_id":8,"numero_completo":"NCB-00004-00000001","importe_total":"121.00"}'});
  assert.equal((await registrado.ejecutar()).body.ya_emitida,true);assert.equal(registrado.remoto.length,0);
});
test('N/C simulada: timeout conserva diario pendiente; rechazo explicito marca rechazado',async()=>{
  const timeout=entorno({timeout:true});assert.equal((await timeout.ejecutar()).code,409);
  assert(timeout.diarios.some(x=>x.sql.includes('INSERT INTO arca_logs')));
  assert(!timeout.diarios.some(x=>x.sql.includes("response='rechazada'")));
  const rechazo=entorno({rechazo:true});assert.equal((await rechazo.ejecutar()).code,409);
  assert(rechazo.diarios.some(x=>x.sql.includes("response='rechazada'")));
});
test('N/C simulada: fallo posterior al CAE revierte guardado y conserva autorizacion para revision',async()=>{
  const e=entorno({fallaLibro:true});const r=await e.ejecutar();assert.equal(r.code,409);
  assert(r.body.error.includes('ARCA autorizo'));assert(e.llamadas.some(x=>x.sql==='ROLLBACK'));
  assert(!e.llamadas.some(x=>x.sql==='COMMIT'));assert(e.diarios.some(x=>x.sql.includes('UPDATE arca_logs SET exitoso=true')));
});
