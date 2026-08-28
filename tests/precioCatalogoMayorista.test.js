'use strict';

const assert = require('node:assert/strict');
const {
  aplicarPreciosCatalogo,
  asegurarColumnasPrecioMayorista,
  debeEnviarPrecioSinIva,
  precioUnitarioParaIvan,
} = require('../services/precioCatalogoMayorista');

const bobinar = [{ id_producto: 1, precio_producto: 10000 }];
const sinCambios = aplicarPreciosCatalogo(bobinar, { modelo_precio_catalogo: 'precio_recibido' });
assert.strictEqual(sinCambios, bobinar, 'Bobinar debe conservar incluso la misma colección cuando no hay descuentos');
assert.equal(sinCambios[0].precio_producto, 10000);

const bobinarConDto = aplicarPreciosCatalogo(bobinar, {
  modelo_precio_catalogo: 'precio_recibido', dto_pago_termino: 10, descuento_items_pct: 5,
});
assert.equal(bobinarConDto[0].precio_producto, 8550, 'Debe preservar la regla histórica de descuentos sucesivos');

const lumac = aplicarPreciosCatalogo([
  { id_producto: 2, precio_producto: 10348.46, iva_producto: 21 },
  { id_producto: 3, precio_producto: 10000, iva_producto: 10.5 },
  { id_producto: 4, precio_producto: 0, iva_producto: 21 },
], {
  modelo_precio_catalogo: 'costo_margen_iva', margen_catalogo: 40,
  iva_catalogo_default: 21, usar_iva_producto: true,
  dto_pago_termino: 50, descuento_items_pct: 50,
});
assert.equal(lumac[0].precio_producto, 17530.29);
assert.equal(lumac[1].precio_producto, 15470);
assert.equal(lumac[2].precio_producto, 0, 'El cero debe seguir siendo cero');
assert.equal(lumac[0].iva_producto_aplicada, 21);

const fallbackIva = aplicarPreciosCatalogo([{ precio_producto: 10000, iva_producto: null }], {
  modelo_precio_catalogo: 'costo_margen_iva', margen_catalogo: 40,
  iva_catalogo_default: 21, usar_iva_producto: true,
});
assert.equal(fallbackIva[0].precio_producto, 16940);

assert.equal(precioUnitarioParaIvan(16940, 21, false), 16940, 'Toggle apagado conserva exactamente el carrito');
assert.equal(precioUnitarioParaIvan(16940, 21, true), 14000, 'Toggle encendido separa el IVA del precio derivado');
assert.equal(debeEnviarPrecioSinIva({ modelo_precio_catalogo: 'precio_recibido', ivan_enviar_precio_sin_iva: true }), false,
  'El modo histórico nunca debe quitar IVA aunque el toggle haya quedado guardado');
assert.equal(debeEnviarPrecioSinIva({ modelo_precio_catalogo: 'costo_margen_iva', ivan_enviar_precio_sin_iva: true }), true);

let ejecucionesMigracion = 0;
const poolSimulado = {
  query: async sql => {
    ejecucionesMigracion += 1;
    assert.match(sql, /DEFAULT 'precio_recibido'/);
  },
};

Promise.all([
  asegurarColumnasPrecioMayorista(poolSimulado),
  asegurarColumnasPrecioMayorista(poolSimulado),
]).then(() => {
  assert.equal(ejecucionesMigracion, 1, 'La inicialización concurrente debe ejecutar un solo ALTER seguro');
  console.log('precioCatalogoMayorista: OK');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
