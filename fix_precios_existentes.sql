-- Parte B: recalcular precios en productos existentes que tienen precio_costo > 0
-- pero precio_venta_final = 0 (o NULL).
-- Fórmula:
--   precio_costo_final = precio_costo * (1 - dto_1/100) * (1 - dto_2/100) * (1 - dto_3/100)
--   precio_venta_N     = precio_costo_final * (1 + imp_1/100) * (1 + imp_2/100) * (1 + utilidad_N/100)
--   precio_venta_final = precio_venta_1

UPDATE productos_propios
SET
  precio_costo_final =
    precio_costo
    * (1 - COALESCE(dto_1, 0) / 100)
    * (1 - COALESCE(dto_2, 0) / 100)
    * (1 - COALESCE(dto_3, 0) / 100),

  precio_venta_1 =
    precio_costo
    * (1 - COALESCE(dto_1, 0) / 100)
    * (1 - COALESCE(dto_2, 0) / 100)
    * (1 - COALESCE(dto_3, 0) / 100)
    * (1 + COALESCE(imp_1, 0) / 100)
    * (1 + COALESCE(imp_2, 0) / 100)
    * CASE WHEN COALESCE(utilidad_1, 0) > 0 THEN (1 + utilidad_1 / 100) ELSE 1 END,

  precio_venta_final =
    precio_costo
    * (1 - COALESCE(dto_1, 0) / 100)
    * (1 - COALESCE(dto_2, 0) / 100)
    * (1 - COALESCE(dto_3, 0) / 100)
    * (1 + COALESCE(imp_1, 0) / 100)
    * (1 + COALESCE(imp_2, 0) / 100)
    * CASE WHEN COALESCE(utilidad_1, 0) > 0 THEN (1 + utilidad_1 / 100) ELSE 1 END,

  precio_venta_2 =
    precio_costo
    * (1 - COALESCE(dto_1, 0) / 100)
    * (1 - COALESCE(dto_2, 0) / 100)
    * (1 - COALESCE(dto_3, 0) / 100)
    * (1 + COALESCE(imp_1, 0) / 100)
    * (1 + COALESCE(imp_2, 0) / 100)
    * CASE WHEN COALESCE(utilidad_2, 0) > 0 THEN (1 + utilidad_2 / 100) ELSE 1 END,

  precio_venta_3 =
    precio_costo
    * (1 - COALESCE(dto_1, 0) / 100)
    * (1 - COALESCE(dto_2, 0) / 100)
    * (1 - COALESCE(dto_3, 0) / 100)
    * (1 + COALESCE(imp_1, 0) / 100)
    * (1 + COALESCE(imp_2, 0) / 100)
    * CASE WHEN COALESCE(utilidad_3, 0) > 0 THEN (1 + utilidad_3 / 100) ELSE 1 END,

  modificado_en = now()

WHERE
  precio_costo > 0
  AND COALESCE(precio_venta_final, 0) = 0;

-- Verificar cuántos registros se actualizaron:
-- SELECT COUNT(*) FROM productos_propios WHERE precio_costo > 0 AND COALESCE(precio_venta_final, 0) = 0;
