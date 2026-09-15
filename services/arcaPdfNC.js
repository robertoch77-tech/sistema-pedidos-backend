const { centavos }=require('./arcaEmision');
const { validarDetalle,validarEmisor,fechaFiscal }=require('./arcaPdf');
function detalleNC(items) {
  return items.map(i=>({cantidad:i.cantidad,descripcion_libre:i.descripcion,
    subtotal:i.subtotal,iva_monto:(centavos(i.total_item??i.total)-centavos(i.subtotal))/100,
    modo_iva:i.modo_iva,alicuota_iva:i.alicuota_iva}));
}
async function snapshotPdfNC(pool,cliente,comp) {
  const diarios=await pool.query(`SELECT request,response FROM arca_logs WHERE cliente_id=$1
    AND tipo='nc_intento' AND response LIKE 'registrada|%'`,[cliente]);
  const snapshots=diarios.rows.map(r=>({datos:JSON.parse(r.request.slice(r.request.indexOf('|')+1)),
    resultado:JSON.parse(r.response.slice(11))})).filter(r=>String(r.resultado.comprobante_id)===String(comp.id)&&r.resultado.cae===comp.cae);
  if(snapshots.length!==1) throw new Error('Sin snapshot fiscal unico de N/C; requiere revision');
  const {datos,resultado}=snapshots[0];
  if(datos.tipo!==Number(comp.tipo_comprobante)||datos.punto!==Number(comp.punto_venta)||datos.numero!==Number(comp.numero)||
      centavos(datos.neto)!==centavos(comp.importe_neto)||centavos(datos.iva)!==centavos(comp.importe_iva)||
      centavos(datos.total)!==centavos(comp.importe_total)||resultado.numero_completo!==comp.numero_completo||
      resultado.vencimiento_cae!==fechaFiscal(comp.cae_vencimiento)||
      `${datos.fecha.slice(0,4)}-${datos.fecha.slice(4,6)}-${datos.fecha.slice(6,8)}`!==fechaFiscal(comp.fecha_emision)||
      String(datos.receptor_cuit)!==String(comp.receptor_cuit)||datos.condicionReceptor!==Number(comp.receptor_cond_iva)) {
    throw new Error('Comprobante N/C difiere del snapshot fiscal guardado');
  }
  validarEmisor(datos.emisor);validarDetalle(comp,datos.items);
  return {comp:{...comp,comprobante_asociado:datos.comprobante_asociado},emisor:datos.emisor,items:datos.items};
}
module.exports={detalleNC,snapshotPdfNC};
