const xml2js = require('xml2js');

function centavos(valor) {
  const m = String(valor ?? '').match(/^(\d+)(?:\.(\d+))?$/);
  if (!m) throw new Error('Importe fiscal invalido');
  const dec = (m[2] || '').padEnd(3, '0');
  const n = BigInt(m[1]) * 100n + BigInt(dec.slice(0, 2)) + (dec[2] >= '5' ? 1n : 0n);
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Importe fuera de rango');
  return Number(n);
}

function validarImportes(total, alicuotas) {
  if (!alicuotas.length) throw new Error('Faltan items fiscales');
  let suma = 0;
  for (const a of alicuotas) {
    // El libro actual solo tiene columnas de IVA 21 y 10.5. No registrar 27 como si fuese cero.
    if (![0, 10.5, 21].includes(a.alicuota)) throw new Error('Alicuota no soportada en el libro IVA; requiere revision');
    const base = centavos(a.base), iva = centavos(a.iva);
    if (Math.abs(iva - Math.round(base * a.alicuota / 100)) > 2) {
      throw new Error('El IVA no coincide con la base imponible');
    }
    suma += base + iva;
  }
  if (centavos(total) <= 0 || centavos(total) !== suma) {
    throw new Error('El total de la venta no coincide con la suma de neto e IVA de sus items');
  }
}

async function resultadoSoap(xml, metodo) {
  const p = await xml2js.parseStringPromise(xml, { explicitArray: false,
    tagNameProcessors: [xml2js.processors.stripPrefix] });
  const body = p?.Envelope?.Body;
  if (body?.Fault) throw new Error('ARCA devolvio un error SOAP');
  const r = body?.[`${metodo}Response`]?.[`${metodo}Result`];
  if (!r || r.Errors) throw new Error('ARCA devolvio una respuesta incompleta o con errores');
  return r;
}

async function ultimoAutorizado(xml) {
  const r = await resultadoSoap(xml, 'FECompUltimoAutorizado');
  if (!/^\d+$/.test(String(r.CbteNro))) throw new Error('ARCA no informo el ultimo numero autorizado');
  const numero = Number(r.CbteNro);
  if (!Number.isSafeInteger(numero) || numero < 0 || numero >= 99999999) throw new Error('Numero fuera de rango');
  return numero;
}

async function autorizacion(xml, numero, punto, tipo) {
  const r = await resultadoSoap(xml, 'FECAESolicitar');
  const cab = r.FeCabResp, det = r.FeDetResp?.FECAEDetResponse;
  if (Array.isArray(det) || !det || Number(cab?.PtoVta) !== punto || Number(cab?.CbteTipo) !== tipo ||
      Number(det.CbteDesde) !== numero || Number(det.CbteHasta) !== numero) {
    throw new Error('Respuesta fiscal no corresponde al comprobante solicitado');
  }
  if (cab.Resultado === 'R' && det.Resultado === 'R') {
    const error = new Error('ARCA rechazo el comprobante; revisar sus observaciones');
    error.rechazoFiscal = true;
    throw error;
  }
  if (cab.Resultado !== 'A' || det.Resultado !== 'A' || !/^\d{14}$/.test(String(det.CAE)) ||
      !/^\d{8}$/.test(String(det.CAEFchVto))) throw new Error('ARCA no confirmo una autorizacion valida');
  const fecha = String(det.CAEFchVto);
  const iso = `${fecha.slice(0,4)}-${fecha.slice(4,6)}-${fecha.slice(6,8)}`;
  if (!Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString().slice(0,10) !== iso || Number(det.CAE) === 0) {
    throw new Error('CAE o vencimiento invalido');
  }
  return { cae: String(det.CAE), vencimiento: fecha };
}

// Una conexion dedicada: los locks y las tres escrituras pertenecen a la misma transaccion.
async function iniciarEmision(pool, cliente, venta) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query("SET LOCAL lock_timeout = '3s'");
    const lock = await db.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS ok',
      [`arca:venta:${cliente}:${venta}`]);
    if (!lock.rows[0]?.ok) throw new Error('Esta venta tiene una emision en curso');
    return db;
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    db.release();
    throw error;
  }
}

async function bloquearSerie(db, modo, cuit, punto, tipo) {
  const lock = await db.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS ok',
    [`arca:serie:${modo}:${cuit}:${punto}:${tipo}`]);
  if (!lock.rows[0]?.ok) throw new Error('Hay otra emision en curso para este punto y tipo de comprobante');
}

module.exports = { centavos, validarImportes, ultimoAutorizado, autorizacion, iniciarEmision, bloquearSerie };
