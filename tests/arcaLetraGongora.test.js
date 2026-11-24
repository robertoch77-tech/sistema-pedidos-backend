const test = require('node:test');
const assert = require('node:assert/strict');
const { validarLetra, esGongora, emisorInscripto } = require('../services/arcaLetraGongora');
test('Góngora: regla limitada a su ficha', () => {
  assert(esGongora('11')); assert(!esGongora(12)); assert(emisorInscripto('Responsable inscripto'));
});
for (const [valor, receptor, factura] of [['R.I.',1,1],['Monotributista',6,1],['IVA Sujeto Exento',4,6],['Consumidor Final',5,6]]) {
  test(valor, () => {
    validarLetra(valor,receptor,factura);
    assert.throws(()=>validarLetra(valor,receptor,factura===1?6:1));
    assert.throws(()=>validarLetra(valor,receptor===1?6:1,factura));
  });
}
test('No asignar consumidor final si falta el dato', () => {
  for(const valor of ['',null,'Sin categorizar','constructor']) assert.throws(()=>validarLetra(valor,5,6));
});
