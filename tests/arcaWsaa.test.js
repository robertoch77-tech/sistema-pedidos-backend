const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const xml2js = require('xml2js');
const source = fs.readFileSync(path.join(__dirname, '../routes/superadmin/arca.js'), 'utf8');
const context = { xml2js, Date, Math, fechaHoraARCA: () => '2026-09-13T12:00:00' };
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function generarTRA('), source.indexOf('async function obtenerToken(')), context);
function respuesta(token = 'TEST_TOKEN', sign = 'TEST_SIGN', expiration = new Date(Date.now() + 3600000).toISOString(), prefijo = 'soapenv') {
  const ticket = `<loginTicketResponse><header><expirationTime>${expiration}</expirationTime></header><credentials><token>${token}</token><sign>${sign}</sign></credentials></loginTicketResponse>`;
  return `<${prefijo}:Envelope xmlns:${prefijo}="http://schemas.xmlsoap.org/soap/envelope/"><${prefijo}:Body><loginCmsResponse><loginCmsReturn><![CDATA[${ticket}]]></loginCmsReturn></loginCmsResponse></${prefijo}:Body></${prefijo}:Envelope>`;
}
test('identificador dentro del rango unsignedInt en ambos extremos', () => {
  for (const random of [0, 0.5, 0.9999999999999999]) {
    context.Math = Object.assign(Object.create(Math), { random: () => random });
    const xml = context.generarTRA('produccion');
    const id = Number(xml.match(/<uniqueId>(\d+)<\/uniqueId>/)[1]);
    assert(Number.isInteger(id) && id >= 0 && id <= 4294967295);
  }
  assert(source.includes("generarTRA(config.modo, 'ws_sr_constancia_inscripcion')"));
});
test('extrae ticket interno con distintos prefijos SOAP', async () => {
  for (const prefijo of ['soapenv', 'S', 'env']) {
    const r = await context.interpretarRespuestaWSAA(respuesta('TEST_TOKEN', 'TEST_SIGN', undefined, prefijo));
    assert.equal(r.token, 'TEST_TOKEN');
    assert.equal(r.sign, 'TEST_SIGN');
    assert(r.expira.getTime() > Date.now());
  }
});
test('rechaza credenciales vacias, expiracion invalida y SOAP fault', async () => {
  for (const xml of [respuesta(''), respuesta('TEST_TOKEN', ''), respuesta('TEST_TOKEN', 'TEST_SIGN', 'invalid'),
    respuesta('TEST_TOKEN', 'TEST_SIGN', '2000-01-01T00:00:00Z'), '<Envelope><Body><Fault/></Body></Envelope>',
    '<Envelope><Body/></Envelope>']) {
    await assert.rejects(() => context.interpretarRespuestaWSAA(xml));
  }
});
