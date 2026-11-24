const reglas = Object.create(null);
for (const [receptor, factura, nombres] of [
  [1, 1, ['ri', 'responsable inscripto', 'iva responsable inscripto']],
  [6, 1, ['monotributista', 'monotributo', 'responsable monotributo']],
  [4, 6, ['exento', 'iva exento', 'iva sujeto exento', 'exento en iva']],
  [5, 6, ['cf', 'consumidor final']],
]) {
  for (const nombre of [String(receptor), ...nombres]) reglas[nombre] = { receptor, factura };
}

function normalizar(valor) {
  return String(valor ?? '').trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
}

function esGongora(clienteId) {
  return String(clienteId) === '11';
}

function emisorInscripto(condicion) {
  return reglas[normalizar(condicion)]?.receptor === 1;
}

function validarLetra(condicionVenta, receptor, factura) {
  const regla = reglas[normalizar(condicionVenta)];
  if (!regla) throw new Error('Revisá la condición de IVA guardada en la venta antes de emitir.');
  if (regla.receptor !== receptor || regla.factura !== factura)
    throw new Error('La condición de IVA o la letra elegida difiere de la venta. Volvé a seleccionar la venta.');
}

module.exports = { reglas, esGongora, emisorInscripto, validarLetra };
