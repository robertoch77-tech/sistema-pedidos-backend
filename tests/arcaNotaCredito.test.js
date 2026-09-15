const { test } = require('node:test');
const assert = require('node:assert/strict');
const { importesGuardados } = require('../services/arcaNotaCredito');
test('N/C: agregar conserva 100 neto + 21 IVA = 121, sin agregar dos veces', () => {
  const r=importesGuardados({subtotal:'100',total_iva:'21',total:'121'},
    [{subtotal:'100',total_item:'121',modo_iva:'agregar',alicuota_iva:21}]);
  assert.equal(r.importe_total,121); assert.equal(r.impIVA,21);
});
test('N/C: discriminar conserva total 121 e IVA incluido 21', () => {
  const r=importesGuardados({subtotal:'100',total_iva:'21',total:'121'},
    [{subtotal:'100',total_item:'121',precio_unitario:'121',modo_iva:'discriminar',alicuota_iva:21}]);
  assert.equal(r.importe_total,121); assert.equal(r.importe_neto,100);
});
test('N/C: off conserva total sin IVA aunque el item tenga tasa comercial 21', () => {
  const r=importesGuardados({subtotal:'100',total_iva:'0',total:'100'},
    [{subtotal:'100',total:'100',modo_iva:'off',alicuota_iva:21}]);
  assert.equal(r.importe_total,100); assert.equal(r.impIVA,0); assert.equal(r.alicuotas[0].alicuota,0);
});
test('N/C: alicuota cero no se convierte en 21 y 10.5 se mantiene', () => {
  const r=importesGuardados({subtotal:'200',total_iva:'10.5',total:'210.5'},
    [{subtotal:'100',total_item:'100',modo_iva:'agregar',alicuota_iva:0},
     {subtotal:'100',total_item:'110.5',modo_iva:'discriminar',alicuota_iva:10.5}]);
  assert.equal(r.impIVA,10.5); assert.equal(r.alicuotas[0].alicuota,0);
});
test('N/C: bloquea diferencias sin recalcular importes ni mutar la nota/items', () => {
  const nota={subtotal:'100',total_iva:'21',total:'122'};
  const items=[{subtotal:'100',total_item:'121',modo_iva:'agregar',alicuota_iva:21}];
  const antes=JSON.stringify({nota,items});
  assert.throws(()=>importesGuardados(nota,items));
  assert.equal(JSON.stringify({nota,items}),antes);
  assert.throws(()=>importesGuardados({...nota,total:121},[{...items[0],modo_iva:'off'}]));
  assert.throws(()=>importesGuardados({...nota,total:121},[{...items[0],modo_iva:'desconocido'}]));
});
