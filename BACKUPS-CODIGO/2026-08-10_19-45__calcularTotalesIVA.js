'use strict';

function calcularTotalesIVA(items, descuentoGlobal, recargoGlobal, modoIva) {
  if (!['off', 'agregar', 'discriminar'].includes(modoIva)) {
    throw new Error(`modo_iva invalido: "${modoIva}". Valores permitidos: off, agregar, discriminar`);
  }

  let sumaSubtotales = 0;
  const itemsSub = [];

  for (const it of items) {
    const cantidad = parseFloat(it.cantidad) || 0;
    const precio   = parseFloat(it.precio_unitario) || 0;
    const dto_pct  = parseFloat(it.descuento_porcentaje) || 0;
    const iva_pct  = parseFloat(it.alicuota_iva);

    if (isNaN(iva_pct) || iva_pct < 0) {
      throw new Error(
        `Alicuota IVA invalida (${it.alicuota_iva}) en producto "${it.descripcion || it.descripcion_libre || 'sin nombre'}". ` +
        `Debe ser un numero >= 0 (ej: 0, 10.5, 21, 27).`
      );
    }

    const sub = precio * cantidad * (1 - dto_pct / 100);
    sumaSubtotales += sub;
    itemsSub.push({ iva_pct, sub, cantidad, precio, dto_pct });
  }

  const descPct    = parseFloat(descuentoGlobal) || 0;
  const recargoPct = parseFloat(recargoGlobal)   || 0;

  const descuentoMonto = sumaSubtotales * (descPct / 100);
  const base           = sumaSubtotales * (1 - descPct / 100);
  const recargoMonto   = base * (recargoPct / 100);
  const baseConRecargo = base * (1 + recargoPct / 100);
  const factor         = sumaSubtotales > 0 ? baseConRecargo / sumaSubtotales : 1;

  const ivaByAlic = {};
  const itemsDetalle = [];

  if (modoIva === 'agregar') {
    for (const { iva_pct, sub } of itemsSub) {
      const ivaItem = sub * factor * (iva_pct / 100);
      ivaByAlic[iva_pct] = (ivaByAlic[iva_pct] || 0) + ivaItem;
      itemsDetalle.push({
        sub_bruto: sub,
        neto_ajustado: sub * factor,
        iva_monto: ivaItem,
        total_item: sub * factor + ivaItem,
      });
    }
  } else if (modoIva === 'discriminar') {
    for (const { iva_pct, sub } of itemsSub) {
      const ivaItem = sub * factor * (iva_pct / (100 + iva_pct));
      ivaByAlic[iva_pct] = (ivaByAlic[iva_pct] || 0) + ivaItem;
      itemsDetalle.push({
        sub_bruto: sub,
        neto_ajustado: sub * factor - ivaItem,
        iva_monto: ivaItem,
        total_item: sub * factor,
      });
    }
  } else {
    for (const { sub } of itemsSub) {
      itemsDetalle.push({
        sub_bruto: sub,
        neto_ajustado: sub * factor,
        iva_monto: 0,
        total_item: sub * factor,
      });
    }
  }

  const ivaTotal = Object.values(ivaByAlic).reduce((a, b) => a + b, 0);
  const total = modoIva === 'agregar' ? baseConRecargo + ivaTotal : baseConRecargo;

  return {
    sumaSubtotales,
    descuentoMonto,
    recargoMonto,
    baseConRecargo,
    factor,
    ivaByAlic,
    ivaTotal,
    total,
    itemsDetalle,
  };
}

module.exports = { calcularTotalesIVA };
