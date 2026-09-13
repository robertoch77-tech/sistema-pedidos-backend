const assert = require('node:assert/strict');
const { test } = require('node:test');
const { generarDatosQR, generarPdfArca } = require('../services/arcaPdf');
const comp = { tipo_comprobante: '6', punto_venta: 4, numero: '23', importe_total: '1210.00',
  fecha_emision: '2026-09-13', cae: '70417054367476', cae_vencimiento: '2026-09-23',
  receptor_cuit: '0', receptor_nombre: 'Consumidor Final', numero_completo: 'FB-0004-00000023' };
const emisor = { cuit: '24259173554', razon_social: 'EMISOR DE PRUEBA', condicion_iva: 'Responsable Inscripto', direccion_fiscal: 'Domicilio de prueba 123' };
const item = { cantidad: 2, descripcion_libre: 'Producto de prueba', precio_unitario: '605.00', subtotal: '1210.00' };
test('QR con campos y tipos oficiales, sin documento inventado', () => {
  const qr = generarDatosQR(comp, emisor);
  assert.equal(qr.ptoVta, 4);
  assert.equal(qr.cuit, 24259173554);
  assert.equal(qr.codAut, 70417054367476);
  assert.equal(qr.fecha, '2026-09-13');
  assert.equal(qr.importe, 1210);
  assert.equal(qr.tipoDocRec, undefined);
  assert.equal(qr.ptovta, undefined);
  assert.equal(generarDatosQR({ ...comp, receptor_cuit: '30-00000000-7' }, emisor).nroDocRec, 30000000007);
});
test('rechaza CUIT, CAE, fecha, numero y receptor invalidos', () => {
  assert.throws(() => generarDatosQR(comp, { ...emisor, cuit: '' }));
  for (const cambio of [{ cae: '' }, { fecha_emision: '' }, { numero: '0' }, { punto_venta: 0 }, { importe_total: 'NaN' }, { receptor_cuit: 'abc' }]) {
    assert.throws(() => generarDatosQR({ ...comp, ...cambio }, emisor));
  }
});
test('PDF real, QR decodificable desde la URL y detalle obligatorio', async () => {
  const resultado = await generarPdfArca(comp, emisor, [item]);
  assert.equal(resultado.pdf.subarray(0, 5).toString(), '%PDF-');
  assert(resultado.pdf.subarray(-20).toString().includes('%%EOF'));
  const qr = JSON.parse(Buffer.from(new URL(resultado.qrUrl).searchParams.get('p'), 'base64').toString());
  assert.deepEqual(qr, generarDatosQR(comp, emisor));
  await assert.rejects(() => generarPdfArca(comp, emisor, []));
});
