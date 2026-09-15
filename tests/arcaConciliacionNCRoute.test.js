const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('Endpoint conciliacion N/C: SOAP es solo FECompConsultar y respeta identidad del intento, sin solicitar CAE',async()=>{
  const fuente=fs.readFileSync(require.resolve('../routes/superadmin/arca'),'utf8');
  const inicio=fuente.indexOf('// ─── CONCILIAR N/C');
  const fin=fuente.indexOf('module.exports = router;',inicio);
  let handler,solicitudes=0;
  vm.runInNewContext(fuente.slice(inicio,fin),{
    router:{post(r,_auth,h){assert.equal(r,'/conciliar-nc/:cliente_id/:nota_id');handler=h;}},
    verificarClienteId(){},pool:{},obtenerToken:async()=>{},WSFE_PROD:'PRODUCCION_SIMULADA',WSFE_HOMO:'HOMO_SIMULADA',
    require:()=>({conciliarNC:async(deps,cliente,nota)=>{
      assert.equal(cliente,11);assert.equal(nota,7);
      const xml=await deps.consultar({modo:'produccion',cuit:'30000000007'},{token:'SIMULADO',sign:'SIMULADO'},
        {tipo:8,numero:99,punto:4});assert.equal(xml,'RESPUESTA_SIMULADA');return {ok:true,conciliada:true};
    }}),
    axios:{post:async(url,xml,opciones)=>{
      solicitudes++;assert.equal(url,'PRODUCCION_SIMULADA');
      assert(xml.includes('<ar:FECompConsultar>'));assert(!xml.includes('FECAESolicitar'));
      assert(xml.includes('<ar:FeCompConsReq><ar:CbteTipo>8</ar:CbteTipo><ar:CbteNro>99</ar:CbteNro><ar:PtoVta>4</ar:PtoVta>'));
      assert.equal(opciones.headers.SOAPAction,'http://ar.gov.afip.dif.FEV1/FECompConsultar');
      return {data:'RESPUESTA_SIMULADA'};
    }}
  });
  const res={status(){return this;},json(b){this.body=b;}};
  await handler({params:{cliente_id:11,nota_id:7}},res);
  assert.equal(res.body.conciliada,true);assert.equal(solicitudes,1);
});
