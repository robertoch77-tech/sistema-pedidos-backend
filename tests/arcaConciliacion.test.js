const { test } = require('node:test');
const assert = require('node:assert/strict');
const { interpretarConsulta } = require('../services/arcaConciliacion');
const { consultaXML } = require('./arcaConsultaFixture');
const datos = { punto: 4,tipo: 6,numero: 1,fecha: '20260913',receptor_cuit: '0',condicionReceptor: 5,
  total: 121,neto: 100,iva: 21,alicuotas: [{ alicuota: 21,base: 100,iva: 21 }] };

test('consulta: recupera CAE existente y fecha sin generar una nueva autorizacion', async () => {
  assert.deepEqual(await interpretarConsulta(consultaXML(datos),datos), { cae: '71111111111111',cae_vencimiento: '2026-09-23' });
});
test('consulta: rechaza distinta identidad fiscal, fecha, importes, moneda y receptor', async () => {
  for (const cambios of [{ PtoVta: 3 },{ CbteTipo: 1 },{ CbteDesde: 2 },{ CbteHasta: 2 },
    { CbteFch: '20260914' },{ ImpTotal: 120 },{ ImpNeto: 99 },{ ImpIVA: 22 },{ ImpTrib: 1 },
    { DocNro: '30000000007' },{ DocTipo: 80 },{ MonId: 'DOL' },{ MonCotiz: 2 },{ CondicionIVAReceptorId: 1 }]) {
    await assert.rejects(() => interpretarConsulta(consultaXML(datos,cambios),datos));
  }
});
test('consulta: rechazo, CAEA, respuesta vacia, error SOAP, vencimiento imposible y IVA distinto no liberan el intento', async () => {
  for (const cambios of [{ Resultado: 'R' },{ EmisionTipo: 'CAEA' },{ CodAutorizacion: '0' },{ FchVto: '20260230' }]) {
    await assert.rejects(() => interpretarConsulta(consultaXML(datos,cambios),datos));
  }
  await assert.rejects(() => interpretarConsulta('<Envelope><Body><Fault>error</Fault></Body></Envelope>',datos));
  await assert.rejects(() => interpretarConsulta('<Envelope><Body/></Envelope>',datos));
  await assert.rejects(() => interpretarConsulta(consultaXML(datos).replace('<Importe>21</Importe>','<Importe>20</Importe>'),datos));
});
