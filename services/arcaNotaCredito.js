const { centavos } = require('./arcaEmision');

// Usa importes comerciales guardados; nunca agrega IVA sobre ellos otra vez.
function importesGuardados(nota, items) {
  if (!items.length) throw new Error('La N/C no tiene items guardados');
  const grupos = new Map();
  let neto = 0, iva = 0, total = 0;
  for (const item of items) {
    if (!['off', 'agregar', 'discriminar'].includes(item.modo_iva)) {
      throw new Error('Modo IVA guardado desconocido; requiere revision');
    }
    const base = centavos(item.subtotal);
    const bruto = centavos(item.total_item ?? item.total);
    if (bruto < base) throw new Error('Importes guardados de N/C inconsistentes');
    const impuesto = bruto - base;
    const tasa = item.modo_iva === 'off' ? 0 : Number(item.alicuota_iva);
    if (![0, 10.5, 21].includes(tasa) || (tasa === 0 && impuesto !== 0)) {
      throw new Error('IVA guardado no soportado o inconsistente');
    }
    // Verifica el comportamiento comercial, pero conserva sus importes exactos.
    if (Math.abs(impuesto - Math.round(base * tasa / 100)) > 2) {
      throw new Error('IVA guardado no coincide con la base; no recalcular la nota');
    }
    const grupo = grupos.get(tasa) || { alicuota: tasa, base: 0, iva: 0 };
    grupo.base += base; grupo.iva += impuesto; grupos.set(tasa, grupo);
    neto += base; iva += impuesto; total += bruto;
  }
  if (total <= 0 || total !== centavos(nota.total) || neto !== centavos(nota.subtotal) || iva !== centavos(nota.total_iva)) {
    throw new Error('Totales de N/C difieren de sus items guardados; requiere revision');
  }
  return { importe_neto: neto / 100, impIVA: iva / 100, importe_total: total / 100,
    alicuotas: [...grupos.values()].map(g => ({ alicuota: g.alicuota, base: g.base / 100, iva: g.iva / 100 })) };
}
module.exports = { importesGuardados };
