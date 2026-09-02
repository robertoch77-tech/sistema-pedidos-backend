'use strict';

function resultado(estado, original, valor = null, motivo = null) {
  return { estado, original, valor, motivo };
}

function parseNumeroImportacion(input) {
  const original = input === undefined || input === null ? '' : String(input);

  if (typeof input === 'number') {
    return Number.isFinite(input)
      ? resultado('valido', original, input)
      : resultado('invalido', original, null, 'El número no es finito');
  }

  let texto = original.trim();
  if (!texto) return resultado('vacio', original, null, 'Celda vacía');

  texto = texto
    .replace(/[\s\u00a0]/g, '')
    .replace(/^(?:ARS|\$)+/i, '')
    .replace(/(?:ARS|\$)+$/i, '');

  if (!texto) return resultado('invalido', original, null, 'No contiene un número');
  if (!/^[+-]?\d[\d.,]*$/.test(texto)) {
    return resultado('invalido', original, null, 'Contiene caracteres no numéricos');
  }

  const signo = texto[0] === '-' ? '-' : '';
  if (texto[0] === '-' || texto[0] === '+') texto = texto.slice(1);

  const puntos = (texto.match(/\./g) || []).length;
  const comas = (texto.match(/,/g) || []).length;
  let normalizado;

  if (puntos > 0 && comas > 0) {
    const separadorDecimal = texto.lastIndexOf('.') > texto.lastIndexOf(',') ? '.' : ',';
    const separadorMiles = separadorDecimal === '.' ? ',' : '.';
    const partes = texto.split(separadorDecimal);
    if (partes.length !== 2 || !/^\d{1,2}$/.test(partes[1])) {
      return resultado('invalido', original, null, 'Separadores decimales inválidos');
    }
    const grupos = partes[0].split(separadorMiles);
    if (grupos.length > 1 && (!/^\d{1,3}$/.test(grupos[0]) || grupos.slice(1).some(g => !/^\d{3}$/.test(g)))) {
      return resultado('invalido', original, null, 'Separadores de miles inválidos');
    }
    normalizado = `${grupos.join('')}.${partes[1]}`;
  } else if (puntos > 0 || comas > 0) {
    const separador = puntos > 0 ? '.' : ',';
    const partes = texto.split(separador);
    if (partes.some(p => !/^\d+$/.test(p))) {
      return resultado('invalido', original, null, 'Separadores inválidos');
    }
    if (partes.length === 2) {
      normalizado = partes[1].length === 3 && partes[0].length <= 3
        ? partes.join('')
        : `${partes[0]}.${partes[1]}`;
    } else if (partes.length > 2 && /^\d{1,3}$/.test(partes[0]) && partes.slice(1).every(p => /^\d{3}$/.test(p))) {
      normalizado = partes.join('');
    } else {
      return resultado('invalido', original, null, 'Separadores inválidos');
    }
  } else {
    normalizado = texto;
  }

  const valor = Number(`${signo}${normalizado}`);
  return Number.isFinite(valor)
    ? resultado('valido', original, valor)
    : resultado('invalido', original, null, 'No se pudo interpretar el número');
}

module.exports = { parseNumeroImportacion };
