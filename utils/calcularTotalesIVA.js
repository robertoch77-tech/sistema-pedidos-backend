'use strict';

const r2 = (n) => Math.round(n * 100) / 100;

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

    const sub = r2(precio * cantidad * (1 - dto_pct / 100));
    sumaSubtotales = r2(sumaSubtotales + sub);
    itemsSub.push({ iva_pct, sub, cantidad, precio, dto_pct });
  }

  const descPct    = parseFloat(descuentoGlobal) || 0;
  const recargoPct = parseFloat(recargoGlobal)   || 0;

  const descuentoMonto = r2(sumaSubtotales * (descPct / 100));
  const base           = r2(sumaSubtotales - descuentoMonto);
  const recargoMonto   = r2(base * (recargoPct / 100));
  const baseConRecargo = r2(base + recargoMonto);
  const factor         = sumaSubtotales > 0 ? baseConRecargo / sumaSubtotales : 1;

  const ivaByAlic = {};
  const itemsDetalle = [];

  if (modoIva === 'agregar') {
    for (const { iva_pct, sub } of itemsSub) {
      const netoAj  = r2(sub * factor);
      const ivaItem = r2(netoAj * (iva_pct / 100));
      ivaByAlic[iva_pct] = (ivaByAlic[iva_pct] || 0) + ivaItem;
      itemsDetalle.push({
        sub_bruto: sub,
        neto_ajustado: netoAj,
        iva_monto: ivaItem,
        total_item: r2(netoAj + ivaItem),
      });
    }
  } else if (modoIva === 'discriminar') {
    for (const { iva_pct, sub } of itemsSub) {
      const brutoAj = r2(sub * factor);
      const ivaItem = r2(brutoAj * (iva_pct / (100 + iva_pct)));
      ivaByAlic[iva_pct] = (ivaByAlic[iva_pct] || 0) + ivaItem;
      itemsDetalle.push({
        sub_bruto: sub,
        neto_ajustado: r2(brutoAj - ivaItem),
        iva_monto: ivaItem,
        total_item: brutoAj,
      });
    }
  } else {
    for (const { sub } of itemsSub) {
      const ajustado = r2(sub * factor);
      itemsDetalle.push({
        sub_bruto: sub,
        neto_ajustado: ajustado,
        iva_monto: 0,
        total_item: ajustado,
      });
    }
  }

  const ivaTotal = r2(Object.values(ivaByAlic).reduce((a, b) => a + b, 0));
  const total = modoIva === 'agregar' ? r2(baseConRecargo + ivaTotal) : baseConRecargo;

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
