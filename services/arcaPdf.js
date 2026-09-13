const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

function fechaFiscal(valor) {
  const fecha = valor instanceof Date
    ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(valor)
    : String(valor || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(Date.parse(fecha))) {
    throw new Error('Fecha fiscal ausente o invalida');
  }
  return fecha;
}

function generarDatosQR(comp, emisor) {
  const cuit = String(emisor.cuit || '').replace(/-/g, '').trim();
  const cae = String(comp.cae || '').trim();
  const importe = Number(comp.importe_total);
  const tipo = Number(comp.tipo_comprobante);
  const ptoVta = Number(comp.punto_venta);
  const nroCmp = Number(comp.numero);
  if (!/^\d{11}$/.test(cuit) || !/^\d{14}$/.test(cae) || !Number.isFinite(importe) || importe < 0 ||
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
  const datos = generarDatosQR(comp, emisor);
  if (!emisor.razon_social || !items.length) throw new Error('Faltan emisor o detalle del comprobante');
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
  doc.fontSize(11).text(`Codigo ${String(datos.tipoCmp).padStart(3, '0')} - ORIGINAL`);
  doc.moveDown().fontSize(13).text(emisor.razon_social);
  doc.font('Helvetica').fontSize(10).text(`CUIT emisor: ${emisor.cuit}`);
  doc.text(`Condicion IVA: ${emisor.condicion_iva || 'No informada'}`);
  if (emisor.direccion_fiscal) doc.text(`Domicilio: ${emisor.direccion_fiscal}`);
  doc.text(`Comprobante: ${comp.numero_completo}`);
  doc.text(`Fecha: ${datos.fecha}`);
  doc.moveDown().text(`Receptor: ${comp.receptor_nombre || 'Consumidor Final'}`);
  doc.text(`Documento receptor: ${datos.nroDocRec || 'Consumidor Final'}`);
  doc.moveDown();
  for (const item of items) {
    const texto = `${item.cantidad} x ${item.descripcion_libre || item.producto_descripcion || 'Producto'} | Precio unitario: $${dinero(item.precio_unitario)} | Subtotal: $${dinero(item.subtotal)}`;
    const alto = doc.heightOfString(texto, { width: 510 }) + 10;
    if (doc.y + alto > 730) doc.addPage();
    doc.text(texto, { width: 510 }).moveDown(0.4);
  }
  if (doc.y > 470) doc.addPage();
  doc.moveDown().font('Helvetica-Bold').fontSize(12).text(`TOTAL: $${dinero(comp.importe_total)}`);
  if (datos.tipoCmp === 1) {
    doc.font('Helvetica').fontSize(10).text(`Neto: $${dinero(comp.importe_neto)} - IVA: $${dinero(comp.importe_iva)}`);
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

module.exports = { generarDatosQR, generarPdfArca };
