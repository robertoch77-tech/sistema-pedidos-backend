const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

function fechaFiscal(valor) {
  const fecha = valor instanceof Date
    ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(valor)
    : String(valor || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(Date.parse(fecha)) ||
      new Date(fecha).toISOString().slice(0, 10) !== fecha) {
    throw new Error('Fecha fiscal ausente o invalida');
  }
  return fecha;
}

function validarEmisor(emisor) {
  if (!/^\d{11}$/.test(String(emisor.cuit || '').replace(/-/g, '')) ||
      !emisor.razon_social || !emisor.direccion_fiscal || !emisor.condicion_iva ||
      !emisor.ingresos_brutos || !emisor.inicio_actividades) {
    throw new Error('Faltan datos fiscales del emisor: domicilio, IVA, ingresos brutos o inicio de actividades');
  }
  fechaFiscal(emisor.inicio_actividades);
}

function validarDetalle(comp, items) {
  const { centavos } = require('./arcaEmision');
  if (!items.length) throw new Error('Sin detalle fiscal');
  let neto = 0, iva = 0;
  for (const item of items) {
    if (!Number.isFinite(Number(item.cantidad)) || Number(item.cantidad) <= 0 ||
        !(item.descripcion_libre || item.producto_descripcion)) throw new Error('Detalle fiscal invalido');
    neto += centavos(item.subtotal);
    iva += centavos(item.iva_monto);
  }
  if (neto !== centavos(comp.importe_neto) || iva !== centavos(comp.importe_iva)) {
    throw new Error('El detalle no coincide con los importes fiscales guardados');
  }
}

function generarDatosQR(comp, emisor) {
  const cuit = String(emisor.cuit || '').replace(/-/g, '').trim();
  const cae = String(comp.cae || '').trim();
  const importe = Number(comp.importe_total);
  const tipo = Number(comp.tipo_comprobante);
  const ptoVta = Number(comp.punto_venta);
  const nroCmp = Number(comp.numero);
  if (!/^\d{11}$/.test(cuit) || !/^\d{14}$/.test(cae) || Number(cae)===0 || !Number.isFinite(importe) || importe <= 0 ||
      !Number.isInteger(ptoVta) || ptoVta < 1 || ptoVta > 99999 ||
      !Number.isInteger(nroCmp) || nroCmp < 1 || nroCmp > 99999999 ||
      ![1, 2, 3, 6, 7, 8, 11, 12, 13].includes(tipo)) {
    throw new Error('Datos fiscales incompletos o invalidos para generar el QR');
  }
  const datos = { ver: 1, fecha: fechaFiscal(comp.fecha_emision), cuit: Number(cuit), ptoVta,
    tipoCmp: tipo, nroCmp, importe, moneda: 'PES', ctz: 1, tipoCodAut: 'E', codAut: Number(cae) };
  const receptor = String(comp.receptor_cuit || '').replace(/-/g, '').trim();
  if (receptor && receptor !== '0') {
    if (!/^\d{11}$/.test(receptor)) throw new Error('CUIT del receptor invalido');
    datos.tipoDocRec = 80;
    datos.nroDocRec = Number(receptor);
  }
  return datos;
}

async function generarPdfArca(comp, emisor, items) {
  validarEmisor(emisor);
  const datos = generarDatosQR(comp, emisor);
  if (!emisor.razon_social || !items.length) throw new Error('Faltan emisor o detalle del comprobante');
  const { centavos } = require('./arcaEmision');
  if (centavos(comp.importe_neto) + centavos(comp.importe_iva) !== centavos(comp.importe_total)) {
    throw new Error('Neto, IVA y total del comprobante no coinciden');
  }
  validarDetalle(comp, items);
  const esNC=[3,8,13].includes(datos.tipoCmp);
  if(esNC) {
    const origen=comp.comprobante_asociado;
    const tipoEsperado={3:1,8:6,13:11}[datos.tipoCmp];
    if(!origen||Number(origen.tipo)!==tipoEsperado||!Number.isInteger(Number(origen.punto))||
        Number(origen.punto)<1||Number(origen.punto)>99999||!Number.isSafeInteger(Number(origen.numero))||
        Number(origen.numero)<1||Number(origen.numero)>99999999) throw new Error('Falta factura asociada valida para el PDF de N/C');
  }
  const qrUrl = `https://www.arca.gob.ar/fe/qr/?p=${encodeURIComponent(Buffer.from(JSON.stringify(datos)).toString('base64'))}`;
  const qr = await QRCode.toBuffer(qrUrl, { type: 'png', width: 450, margin: 4, errorCorrectionLevel: 'M' });
  const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true });
  const chunks = [];
  const terminado = new Promise((resolve, reject) => {
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const dinero = valor => Number(valor).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nombres = { 1: 'FACTURA A', 6: 'FACTURA B', 11: 'FACTURA C', 2: 'NOTA DE DEBITO A',
    3: 'NOTA DE CREDITO A', 7: 'NOTA DE DEBITO B', 8: 'NOTA DE CREDITO B', 12: 'NOTA DE DEBITO C', 13: 'NOTA DE CREDITO C' };
  doc.font('Helvetica-Bold').fontSize(18).text(nombres[datos.tipoCmp]);
  if (comp.simulado) doc.fontSize(12).fillColor('red').text('SIMULACION - SIN VALIDEZ FISCAL').fillColor('black');
  doc.fontSize(11).text(`Codigo ${String(datos.tipoCmp).padStart(3, '0')} - ORIGINAL`);
  doc.moveDown().fontSize(13).text(emisor.razon_social);
  doc.font('Helvetica').fontSize(10).text(`CUIT emisor: ${emisor.cuit}`);
  const ivaEmisor = { 1: 'Responsable Inscripto', 4: 'Exento', 6: 'Monotributista' };
  doc.text(`Condicion IVA: ${ivaEmisor[emisor.condicion_iva] || emisor.condicion_iva}`);
  doc.text(`Domicilio: ${emisor.direccion_fiscal}`);
  doc.text(`Ingresos brutos: ${emisor.ingresos_brutos}`);
  doc.text(`Inicio de actividades: ${fechaFiscal(emisor.inicio_actividades)}`);
  doc.text(`Comprobante: ${comp.numero_completo}`);
  doc.text(`Fecha: ${datos.fecha}`);
  if(esNC) doc.text(`Factura asociada: ${String(comp.comprobante_asociado.punto).padStart(5,'0')}-${String(comp.comprobante_asociado.numero).padStart(8,'0')} (codigo ${comp.comprobante_asociado.tipo})`);
  doc.moveDown().text(`Receptor: ${comp.receptor_nombre || 'Consumidor Final'}`);
  doc.text(`Documento receptor: ${datos.nroDocRec || 'Consumidor Final'}`);
  const condiciones = { 1: 'Responsable Inscripto', 4: 'Exento', 5: 'Consumidor Final', 6: 'Monotributista',
    7: 'No categorizado', 8: 'Proveedor del exterior', 9: 'Cliente del exterior', 10: 'Liberado',
    13: 'Monotributista social', 15: 'No alcanzado', 16: 'Monotributo trabajador independiente promovido' };
  const condicion = condiciones[Number(comp.receptor_cond_iva)];
  if (!condicion) throw new Error('Falta condicion IVA del receptor');
  doc.text(`Condicion IVA receptor: ${condicion}`);
  if (comp.receptor_direccion) doc.text(`Domicilio receptor: ${comp.receptor_direccion}`);
  doc.moveDown();
  for (const item of items) {
    const incluyeIVA=[6,8].includes(datos.tipoCmp);
    const importeLinea = (centavos(item.subtotal) + (incluyeIVA ? centavos(item.iva_monto) : 0)) / 100;
    const texto = `${item.cantidad} x ${item.descripcion_libre || item.producto_descripcion} | Unitario ${incluyeIVA ? 'con IVA' : 'neto'} (descuento aplicado): $${dinero(importeLinea / Number(item.cantidad))} | Importe: $${dinero(importeLinea)}`;
    const alto = doc.heightOfString(texto, { width: 510 }) + 10;
    if (doc.y + alto > 730) doc.addPage();
    doc.text(texto, { width: 510 }).moveDown(0.4);
  }
  if (doc.y > 470) doc.addPage();
  doc.moveDown().font('Helvetica-Bold').fontSize(12).text(`${esNC?'TOTAL ACREDITADO':'TOTAL'}: $${dinero(comp.importe_total)}`);
  if ([1,3].includes(datos.tipoCmp)) {
    doc.font('Helvetica').fontSize(10).text(`Neto: $${dinero(comp.importe_neto)} - IVA: $${dinero(comp.importe_iva)}`);
  } else if ([6,8].includes(datos.tipoCmp)) {
    doc.font('Helvetica').fontSize(10).text('Regimen de Transparencia Fiscal al Consumidor (Ley 27.743)');
    doc.text(`IVA contenido: $${dinero(comp.importe_iva)}`);
    // No se inventan impuestos internos: el flujo de emision soporta solamente neto e IVA.
  }
  doc.moveDown().font('Helvetica').fontSize(10).text(`CAE: ${comp.cae}`);
  doc.text(`Vencimiento CAE: ${fechaFiscal(comp.cae_vencimiento)}`);
  const yQR = doc.y + 12;
  doc.image(qr, 42, yQR, { width: 125, height: 125 });
  doc.text('QR para consultar el comprobante en ARCA', 180, yQR + 35, { width: 330 });
  const paginas = doc.bufferedPageRange();
  for (let i = paginas.start; i < paginas.start + paginas.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).text(`Pagina ${i + 1} de ${paginas.count}`, 42, 770, { lineBreak: false });
  }
  doc.end();
  return { pdf: await terminado, qrUrl };
}

module.exports = { generarDatosQR, generarPdfArca, validarEmisor, validarDetalle, fechaFiscal };
