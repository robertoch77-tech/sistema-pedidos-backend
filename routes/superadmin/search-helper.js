const SINONIMOS = [
  ['caño', 'tubo', 'caños', 'tubos'],
  ['codo', 'codos', 'curva'],
  ['cupla', 'cuplas', 'acople', 'acoples'],
  ['buje', 'bujes', 'reduccion', 'reducción'],
  ['tapon', 'tapón', 'tapa', 'tapones', 'tapas'],
  ['union', 'unión', 'uniones'],
  ['niple', 'niples', 'nipple'],
  ['valvula', 'válvula', 'valvulas', 'válvulas', 'llave'],
  ['ramal', 'ramales', 'derivacion', 'derivación'],
  ['hembra', 'hh'],
  ['macho', 'mm'],
  ['polipropileno', 'pp'],
  ['pvc', 'policloruro'],
  ['bronce', 'bce'],
  ['½', '1/2'],
  ['¾', '3/4'],
  ['1½', '1 1/2'],
  ['amanco', 'amancofusion'],
  ['tubohogar', 'tubo hogar'],
  ['tubofusion', 'tubo fusion'],
  ['90°', '90º', '90 grados'],
  ['45°', '45º', '45 grados'],
  ['termofusor', 'termofusora', 'soldador', 'soldadora'],
  ['tanque', 'tanques', 'cisterna'],
  ['rejilla', 'rejillas'],
  ['pileta', 'piletas', 'bacha', 'bachas'],
  ['inodoro', 'inodoros', 'wc'],
  ['griferia', 'grifería', 'canilla', 'canillas', 'grifo', 'grifos'],
];

function buildSearchConditions(buscar, startIdx, values, campos = ['codigo', 'descripcion', 'marca']) {
  if (!buscar || !buscar.trim()) return { condition: null, newIdx: startIdx };

  const palabras = buscar.trim().toLowerCase().split(/\s+/).filter(p => p.length > 0);
  if (!palabras.length) return { condition: null, newIdx: startIdx };

  let idx = startIdx;
  const wordConditions = [];

  for (const palabra of palabras) {
    const variantes = [palabra];
    for (const grupo of SINONIMOS) {
      const grupoLower = grupo.map(s => s.toLowerCase());
      if (grupoLower.includes(palabra)) {
        for (const sin of grupoLower) {
          if (sin !== palabra && !variantes.includes(sin)) {
            variantes.push(sin);
          }
        }
        break;
      }
    }

    const orParts = [];
    for (const variante of variantes) {
      values.push(`%${variante}%`);
      for (const campo of campos) {
        orParts.push(`${campo} ILIKE $${idx}`);
      }
      idx++;
    }
    wordConditions.push(`(${orParts.join(' OR ')})`);
  }

  const condition = wordConditions.join(' AND ');
  return { condition, newIdx: idx };
}

module.exports = { buildSearchConditions, SINONIMOS };
