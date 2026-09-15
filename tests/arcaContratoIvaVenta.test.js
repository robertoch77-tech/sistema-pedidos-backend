// Diagnostico local: calculador real de Ventas y validacion real de ARCA.
// Sin DB, HTTP, .env, import de rutas, ni emision de comprobantes.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {calcularTotalesIVA}=require('../utils/calcularTotalesIVA');
const {validarImportes}=require('../services/arcaEmision');

function venta(modo,alicuota=21){
  const items=[{cantidad:1,precio_unitario:121,descuento_porcentaje:0,alicuota_iva:alicuota}];
  const antes=JSON.stringify(items);
  const calc=calcularTotalesIVA(items,0,0,modo);
  assert.equal(JSON.stringify(items),antes,'No alterar precios ni alicuotas');
  // Mismos campos que guarda el INSERT de ventas_items.
  return {total:calc.total,alicuotas:items.map((it,i)=>({alicuota:it.alicuota_iva,
    base:calc.itemsDetalle[i].neto_ajustado,iva:calc.itemsDetalle[i].iva_monto}))};
}

test('+IVA: conserva 121 neto + 25.41 IVA = 146.41',()=>{
  const v=venta('agregar');assert.equal(v.total,146.41);
  assert.deepEqual(v.alicuotas,[{alicuota:21,base:121,iva:25.41}]);
  assert.doesNotThrow(()=>validarImportes(v.total,v.alicuotas));
});
test('IVA incluido: conserva total 121, neto 100 e IVA 21 sin sumarlo otra vez',()=>{
  const v=venta('discriminar');assert.equal(v.total,121);
  assert.deepEqual(v.alicuotas,[{alicuota:21,base:100,iva:21}]);
  assert.doesNotThrow(()=>validarImportes(v.total,v.alicuotas));
});
test('INCOMPATIBILIDAD ACTUAL: Sin IVA con alicuota 21 conserva total pero validacion fiscal lo rechaza',()=>{
  const v=venta('off');assert.equal(v.total,121);
  assert.deepEqual(v.alicuotas,[{alicuota:21,base:121,iva:0}]);
  assert.throws(()=>validarImportes(v.total,v.alicuotas),/IVA no coincide/);
});
test('Sin IVA con alicuota original 0 no representa el caso gravado anterior',()=>{
  const v=venta('off',0);assert.equal(v.total,121);
  assert.doesNotThrow(()=>validarImportes(v.total,v.alicuotas));
});
