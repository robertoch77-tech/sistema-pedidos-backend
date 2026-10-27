'use strict';

const pool = require('../db');
const { errorCliente } = require('./ivanImagenesDatos');

function porcentaje(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === '') {
    throw errorCliente('Falta un porcentaje en Iván. No se sustituyó por cero.', 409);
  }
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw errorCliente('Iván devolvió un descuento fuera de 0 a 100. Revisá sus condiciones.', 409);
  }
  return String(valor);
}

function coincide(regla, producto) {
  return ['rubro', 'marca', 'tipo'].every(k => regla[k] === null || regla[k] === producto[k]);
}

async function calcular(filas, detallar = false) {
  if (!filas.length) return [];
  for (const fila of filas) {
    if (fila.base === null || fila.base === undefined || String(fila.base).trim() === '' ||
        !Number.isFinite(Number(fila.base)) || Number(fila.base) < 0) {
      throw errorCliente('El producto no tiene un precio base válido en Iván.', 409);
    }
    fila.reglas.forEach(r => porcentaje(r.porcentaje));
  }
  // La multiplicación conserva NUMERIC en cada paso; se redondea al mostrar el resultado.
  const r = await pool.query(`WITH RECURSIVE
    filas AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS f(id text,base numeric,reglas jsonb)),
    cadena AS (
      SELECT id,base,reglas,0 AS paso,base AS importe FROM filas
      UNION ALL
      SELECT id,base,reglas,paso+1,importe*(1-(reglas->paso->>'porcentaje')::numeric/100)
      FROM cadena WHERE paso<jsonb_array_length(reglas)
    )
    SELECT id,base::text,ROUND(importe,2)::text AS importe,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('etiqueta',f.reglas->(c.paso-1)->>'etiqueta',
        'porcentaje',f.reglas->(c.paso-1)->>'porcentaje','importe',ROUND(c.importe,2)::text)
        ORDER BY c.paso),'[]'::jsonb) FROM cadena c WHERE c.id=f.id AND c.paso>0
        AND ($2::boolean OR c.paso<=6)) AS pasos
    FROM cadena f WHERE paso=jsonb_array_length(reglas)`, [JSON.stringify(filas), detallar]);
  return r.rows;
}

function expresionOrden(base, reglas, dimensiones, parametros) {
  parametros.push(JSON.stringify(reglas));
  const json = '$' + parametros.length + '::jsonb';
  const filtros = ['rubro', 'marca', 'tipo'].map(k =>
    `(r->>'${k}' IS NULL OR r->>'${k}'=(${dimensiones[k]})::text)`);
  return `(WITH RECURSIVE aplicables AS (
    SELECT ROW_NUMBER() OVER(ORDER BY orden) AS paso,(r->>'porcentaje')::numeric AS porcentaje
    FROM jsonb_array_elements(${json}) WITH ORDINALITY AS fila(r,orden)
    WHERE ${filtros.join(' AND ')}
  ), cadena AS (
    SELECT 0::bigint AS paso,(${base})::numeric AS importe
    UNION ALL SELECT c.paso+1,c.importe*(1-a.porcentaje/100)
    FROM cadena c JOIN aplicables a ON a.paso=c.paso+1
  ) SELECT ROUND(importe,2) FROM cadena ORDER BY paso DESC LIMIT 1)`;
}

// Cuatro parametros, aunque existan miles de condiciones. Solo lo usa la lectura
// completa de Moreschi. Compatible con PostgreSQL 9.3: arrays, sin JSONB externo.
function expresionOrdenArreglos(base, reglas, dimensiones, parametros) {
  parametros.push(reglas.map(r => porcentaje(r.porcentaje)));
  const porcentajes = '$' + parametros.length + '::numeric[]';
  const filtros = ['rubro', 'marca', 'tipo'].map(k => {
    parametros.push(reglas.map(r => r[k]));
    const arreglo = '$' + parametros.length + '::text[]';
    return `((${arreglo})[indice] IS NULL OR (${arreglo})[indice]=(${dimensiones[k]})::text)`;
  });
  return `(WITH RECURSIVE aplicables AS (
    SELECT ROW_NUMBER() OVER(ORDER BY indice) AS paso,(${porcentajes})[indice] AS porcentaje
    FROM generate_subscripts(${porcentajes},1) AS fila(indice)
    WHERE ${filtros.join(' AND ')}
  ), cadena AS (
    SELECT 0::bigint AS paso,(${base})::numeric AS importe
    UNION ALL SELECT c.paso+1,c.importe*(1-a.porcentaje/100)
    FROM cadena c JOIN aplicables a ON a.paso=c.paso+1
  ) SELECT ROUND(importe,2) FROM cadena ORDER BY paso DESC LIMIT 1)`;
}

module.exports = { porcentaje, coincide, calcular, expresionOrden, expresionOrdenArreglos };
