// Respuesta fiscal ficticia para pruebas; no hay conexion a ARCA.
function consultaXML(datos, cambios = {}) {
  const doc = String(datos.receptor_cuit || '0').replace(/-/g,'');
  const suma = (alic,campo) => datos.alicuotas.filter(alic).reduce((s,a) => s + Number(a[campo]),0);
  const campos = { Concepto: 1,DocTipo: doc !== '0' || datos.tipo === 1 ? 80 : 99,DocNro: doc,
    CbteDesde: datos.numero,CbteHasta: datos.numero,CbteFch: datos.fecha,PtoVta: datos.punto,CbteTipo: datos.tipo,
    ImpTotal: datos.total,ImpNeto: suma(a => a.alicuota > 0,'base'),ImpIVA: datos.iva,
    ImpOpEx: suma(a => a.alicuota === 0,'base'),ImpTotConc: 0,ImpTrib: 0,MonId: 'PES',MonCotiz: 1,
    Resultado: 'A',EmisionTipo: 'CAE',CodAutorizacion: '71111111111111',FchVto: '20260923', ...cambios };
  const contenido = Object.entries(campos).map(([k,v]) => `<${k}>${v}</${k}>`).join('');
  const iva = datos.alicuotas.filter(a => a.alicuota > 0).map(a => `<AlicIva><Id>${a.alicuota === 21 ? 5 : 4}</Id><BaseImp>${a.base}</BaseImp><Importe>${a.iva}</Importe></AlicIva>`).join('');
  return `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FECompConsultarResponse><FECompConsultarResult><ResultGet>${contenido}<Iva>${iva}</Iva></ResultGet></FECompConsultarResult></FECompConsultarResponse></s:Body></s:Envelope>`;
}
module.exports = { consultaXML };
