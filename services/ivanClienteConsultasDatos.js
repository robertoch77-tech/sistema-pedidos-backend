'use strict';
const { fallo } = require('./ivanClienteConsultasConfig');
const dimensiones = ['rubro', 'marca', 'tipo'];
const normal = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
const texto = v => String(v ?? '').trim();
function filtros(query) {
  if (Object.keys(query).some(k => !['busqueda', 'pagina', 'marca', 'rubro', 'tipo', 'orden_precio', 'formato', 'actualizar'].includes(k))) throw fallo('Consulta inválida.');
  for (const k of ['busqueda', ...dimensiones]) if (query[k] !== undefined && (typeof query[k] !== 'string' || query[k].length > 200)) throw fallo('Filtro inválido.');
  if (query.pagina !== undefined && !/^[1-9]\d{0,5}$/.test(query.pagina)) throw fallo('Página inválida.');
  if (query.orden_precio !== undefined && !['asc', 'desc'].includes(query.orden_precio)) throw fallo('Orden inválido.');
  if (query.actualizar !== undefined && query.actualizar !== '1') throw fallo('Consulta inválida.');
  return query;
}
// Misma semántica ILIKE de las dimensiones del lector existente. Solo filtra
// resultados ya valorados: no calcula ni redondea un precio.
function coincide(valor, filtro) {
  if (!filtro) return true;
  const patron = filtro.replace(/[ñÑáéíóúÁÉÍÓÚ\uFFFD]/g, '_').split('').map(c =>
    c === '%' ? '.*' : c === '_' ? '.' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
  return new RegExp('^' + patron + '$', 'iu').test(String(valor || ''));
}
function producto(p) {
  if (!p || p.id_producto === null || p.id_producto === undefined || p.precio_producto === null || p.precio_producto === undefined || String(p.precio_producto).trim() === '' ||
      !Number.isFinite(Number(p.precio_producto)) || Number(p.precio_producto) < 0) throw fallo('No pudimos confirmar todos los precios. Reintentá la consulta.', 503);
  return { id: String(p.id_producto), codigo: texto(p.cod_producto), descripcion: texto(p.des_producto),
    rubro: texto(p.des_producto_rubro), marca: texto(p.des_producto_marca), tipo: texto(p.des_producto_tipo), precio: Number(p.precio_producto) };
}
function lista(datos, query, exportacion) {
  if (!Array.isArray(datos?.productos)) throw fallo('No se pudo leer la lista de precios.', 503);
  const total = Number(datos.total), pagina = Number(datos.pagina || 1), paginas = Math.max(1, Number(datos.totalPaginas ?? 1));
  if (!Number.isSafeInteger(total) || total < datos.productos.length || !Number.isSafeInteger(pagina) || pagina < 1 ||
      !Number.isSafeInteger(paginas) || paginas < 1 || (exportacion && total !== datos.productos.length)) throw fallo('No se pudo verificar la lista completa. Reintentá la consulta.', 503);
  let productos = datos.productos.map(producto);
  if (exportacion) {
    productos = productos.filter(p => dimensiones.every(k => coincide(p[k], query[k])));
    if (query.orden_precio) productos.sort((a, b) => (query.orden_precio === 'asc' ? a.precio - b.precio : b.precio - a.precio) || a.descripcion.localeCompare(b.descripcion, 'es'));
  }
  return { productos, total: exportacion ? productos.length : total, pagina,
    paginas: exportacion ? 1 : paginas, generado: new Date().toISOString() };
}
function condiciones(datos, query) {
  if (!Array.isArray(datos?.reglas) || !datos.cliente || datos.reglas.some(r => r.porcentaje === null || r.porcentaje === undefined || !Number.isFinite(Number(r.porcentaje)))) throw fallo('No se pudieron confirmar tus condiciones. Reintentá la consulta.', 503);
  const q = normal(query.busqueda), pagina = Number(query.pagina || 1);
  const todas = datos.reglas.map((r, i) => ({ id: String(i), porcentaje: String(r.porcentaje),
    ...Object.fromEntries(dimensiones.map(k => [k, r[k] === null ? 'Todos' : texto(r.nombres?.[k]) || 'Sin nombre'])),
    alcance: dimensiones.every(k => r[k] === null) ? 'Todos tus productos' : 'Según rubro, marca y tipo' }));
  const opciones = Object.fromEntries(dimensiones.map(k => [k, [...new Set(todas.map(r => r[k]))].sort((a, b) => a.localeCompare(b, 'es'))]));
  const filtradas = todas.filter(r => (!q || normal([...dimensiones.map(k => r[k]), r.porcentaje].join(' ')).includes(q)) &&
    dimensiones.every(k => !query[k] || r[k] === query[k]));
  return { cliente: { cuit: datos.cliente.cuit, nombre: datos.cliente.nombre },
    general: datos.cliente.general, adicional: datos.cliente.extra,
    pago_termino: datos.pago_termino?.habilitado ? String(datos.pago_termino.porcentaje) : null,
    reglas: filtradas.slice((pagina - 1) * 40, pagina * 40), total: filtradas.length, total_condiciones: todas.length,
    pagina, paginas: Math.max(1, Math.ceil(filtradas.length / 40)), opciones, generado: new Date().toISOString() };
}
module.exports = { filtros, condiciones, lista };
