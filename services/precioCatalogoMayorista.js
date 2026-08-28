'use strict';

const MODELO_PRECIO_RECIBIDO = 'precio_recibido';
const MODELO_COSTO_MARGEN_IVA = 'costo_margen_iva';
let promesaColumnasPrecio = null;

function asegurarColumnasPrecioMayorista(pool) {
  if (!promesaColumnasPrecio) {
    promesaColumnasPrecio = pool.query(`
      ALTER TABLE mayoristas
        ADD COLUMN IF NOT EXISTS modelo_precio_catalogo TEXT NOT NULL DEFAULT 'precio_recibido',
        ADD COLUMN IF NOT EXISTS margen_catalogo NUMERIC(8,3) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS iva_catalogo_default NUMERIC(5,2) NOT NULL DEFAULT 21,
        ADD COLUMN IF NOT EXISTS usar_iva_producto BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS ivan_enviar_precio_sin_iva BOOLEAN NOT NULL DEFAULT false
    `).catch(error => {
      promesaColumnasPrecio = null;
      throw error;
    });
  }
  return promesaColumnasPrecio;
}

function numeroFinito(valor, fallback = 0) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : fallback;
}

function limitarPorcentaje(valor, fallback = 0, maximo = 999) {
  return Math.min(maximo, Math.max(0, numeroFinito(valor, fallback)));
}

function redondearMoneda(valor) {
  return Math.round((numeroFinito(valor) + Number.EPSILON) * 100) / 100;
}

function normalizarConfiguracion(config = {}) {
  const modelo = config.modelo_precio_catalogo === MODELO_COSTO_MARGEN_IVA
    ? MODELO_COSTO_MARGEN_IVA
    : MODELO_PRECIO_RECIBIDO;
  return {
    modelo,
    margen: limitarPorcentaje(config.margen_catalogo, 0),
    ivaDefault: limitarPorcentaje(config.iva_catalogo_default, 21, 100),
    usarIvaProducto: config.usar_iva_producto !== false,
    dtoPagoTermino: limitarPorcentaje(config.dto_pago_termino, 0, 100),
    descuentoItems: limitarPorcentaje(config.descuento_items_pct, 0, 100),
  };
}

/**
 * Transforma exclusivamente el precio que consume el catálogo.
 * El modo predeterminado replica literalmente aplicarDto() para no modificar
 * ningún mayorista existente.
 */
function aplicarPreciosCatalogo(productos, config = {}) {
  const cfg = normalizarConfiguracion(config);

  if (cfg.modelo === MODELO_PRECIO_RECIBIDO) {
    const factor = (1 - cfg.dtoPagoTermino / 100) * (1 - cfg.descuentoItems / 100);
    if (factor === 1) return productos;
    return productos.map(producto => ({
      ...producto,
      precio_producto: producto.precio_producto != null
        ? redondearMoneda(producto.precio_producto * factor)
        : producto.precio_producto,
    }));
  }

  return productos.map(producto => {
    if (producto.precio_producto == null) return producto;
    const costoSinIva = numeroFinito(producto.precio_producto);
    const ivaProducto = producto.iva_producto === null || producto.iva_producto === undefined || producto.iva_producto === ''
      ? NaN
      : numeroFinito(producto.iva_producto, NaN);
    const ivaAplicada = cfg.usarIvaProducto && Number.isFinite(ivaProducto) && ivaProducto >= 0 && ivaProducto <= 100
      ? ivaProducto
      : cfg.ivaDefault;
    const precioPublicoNeto = costoSinIva * (1 + cfg.margen / 100);
    const precioPublico = precioPublicoNeto * (1 + ivaAplicada / 100);
    return {
      ...producto,
      precio_producto: redondearMoneda(precioPublico),
      iva_producto_aplicada: ivaAplicada,
      precio_catalogo_incluye_iva: true,
    };
  });
}

function precioUnitarioParaIvan(precioCarrito, ivaAplicada, enviarSinIva) {
  const precio = numeroFinito(precioCarrito);
  if (!enviarSinIva) return precio;
  const iva = limitarPorcentaje(ivaAplicada, 21, 100);
  return redondearMoneda(precio / (1 + iva / 100));
}

function debeEnviarPrecioSinIva(config = {}) {
  return config.modelo_precio_catalogo === MODELO_COSTO_MARGEN_IVA
    && config.ivan_enviar_precio_sin_iva === true;
}

module.exports = {
  MODELO_PRECIO_RECIBIDO,
  MODELO_COSTO_MARGEN_IVA,
  asegurarColumnasPrecioMayorista,
  aplicarPreciosCatalogo,
  debeEnviarPrecioSinIva,
  precioUnitarioParaIvan,
  redondearMoneda,
};
