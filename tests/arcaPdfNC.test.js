const {test}=require('node:test');
const assert=require('node:assert/strict');
const {generarPdfArca}=require('../services/arcaPdf');
const {detalleNC,snapshotPdfNC}=require('../services/arcaPdfNC');
const emisor={cuit:'30000000007',razon_social:'EMISOR FICTICIO',condicion_iva:'1',direccion_fiscal:'DOMICILIO FICTICIO',
  ingresos_brutos:'FICTICIO',inicio_actividades:'2000-01-01'};
const asociado={tipo:6,punto:3,numero:99};
const item={cantidad:2,descripcion:'PRODUCTO FICTICIO',subtotal:'100',total_item:'121',modo_iva:'discriminar',alicuota_iva:21};
const items=detalleNC([item]);
const comp={id:8,tipo_comprobante:'8',punto_venta:4,numero:1,numero_completo:'NCB-00004-00000001',fecha_emision:'2026-09-13',
  cae:'71111111111111',cae_vencimiento:'2026-09-23',receptor_cuit:'0',receptor_nombre:'CF',receptor_cond_iva:'5',
  importe_neto:'100',importe_iva:'21',importe_total:'121',comprobante_asociado:asociado};
test('PDF/QR N/C A y B: usa tipo, punto 4, CAE y total guardado positivo; conserva detalle comercial',async()=>{
  for(const tipo of [3,8]) {
    const c={...comp,tipo_comprobante:String(tipo),receptor_cond_iva:tipo===3?'1':'5',receptor_cuit:tipo===3?'30000000007':'0',
      comprobante_asociado:{...asociado,tipo:tipo===3?1:6}};
    const antes=JSON.stringify({c,emisor,items});const resultado=await generarPdfArca(c,emisor,items);
    assert.equal(resultado.pdf.subarray(0,5).toString(),'%PDF-');
    const qr=JSON.parse(Buffer.from(new URL(resultado.qrUrl).searchParams.get('p'),'base64').toString());
    assert.equal(qr.tipoCmp,tipo);assert.equal(qr.ptoVta,4);assert.equal(qr.importe,121);assert.equal(qr.codAut,71111111111111);
    assert.equal(JSON.stringify({c,emisor,items}),antes);
  }
});
test('PDF N/C: bloquea origen ausente, letra incompatible, CAE cero y diferencia de importes',async()=>{
  for(const cambio of [{comprobante_asociado:null},{comprobante_asociado:{...asociado,tipo:1}},{cae:'00000000000000'},{importe_total:122}]) {
    await assert.rejects(generarPdfArca({...comp,...cambio},emisor,items));
  }
});
test('PDF N/C: obtiene snapshot registrado por comprobante y CAE sin leer datos comerciales actuales',async()=>{
  const datos={tipo:8,punto:4,numero:1,fecha:'20260913',neto:100,iva:21,total:121,receptor_cuit:'0',condicionReceptor:5,
    emisor,items,comprobante_asociado:asociado};
  const resultado={comprobante_id:8,cae:comp.cae,numero_completo:comp.numero_completo,vencimiento_cae:comp.cae_vencimiento};
  const filas=[{request:`nc:7|${JSON.stringify(datos)}`,response:`registrada|${JSON.stringify(resultado)}`}];
  const pool={query:async(sql,p)=>{assert(sql.includes('arca_logs'));assert.deepEqual(p,[11]);return {rows:filas};}};
  const snapshot=await snapshotPdfNC(pool,11,comp);assert.deepEqual(snapshot.items,items);assert.deepEqual(snapshot.comp.comprobante_asociado,asociado);
  await assert.rejects(snapshotPdfNC(pool,11,{...comp,importe_total:122}));
  await assert.rejects(snapshotPdfNC(pool,11,{...comp,cae:'72222222222222'}));
  filas.push(filas[0]);await assert.rejects(snapshotPdfNC(pool,11,comp));
});
