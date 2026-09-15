const xml2js = require('xml2js');
const { centavos, validarImportes, iniciarEmision, bloquearSerie } = require('./arcaEmision');

function fechaISO(fecha) {
  if (!/^\d{8}$/.test(String(fecha))) throw new Error('Fecha fiscal invalida');
  const iso = `${fecha.slice(0,4)}-${fecha.slice(4,6)}-${fecha.slice(6,8)}`;
  if (!Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString().slice(0,10) !== iso) throw new Error('Fecha fiscal imposible');
  return iso;
}

async function interpretarConsulta(xml, intento) {
  const p = await xml2js.parseStringPromise(xml, { explicitArray: false,
    tagNameProcessors: [xml2js.processors.stripPrefix] });
  const body = p?.Envelope?.Body;
  const resultado = body?.FECompConsultarResponse?.FECompConsultarResult;
  const r = resultado?.ResultGet;
  if (body?.Fault || resultado?.Errors || !r || Array.isArray(r)) {
    throw new Error('Consulta fiscal incompleta o con errores; el intento sigue bloqueado');
  }
  const doc = String(intento.receptor_cuit || '0').replace(/-/g, '');
  const docTipo = doc !== '0' || intento.tipo === 1 ? 80 : 99;
  if (r.Resultado !== 'A' || r.EmisionTipo !== 'CAE' || Number(r.Concepto) !== 1 ||
      Number(r.PtoVta) !== intento.punto || Number(r.CbteTipo) !== intento.tipo ||
      Number(r.CbteDesde) !== intento.numero || Number(r.CbteHasta) !== intento.numero ||
      String(r.CbteFch) !== intento.fecha || Number(r.DocTipo) !== docTipo || String(r.DocNro) !== doc ||
      r.MonId !== 'PES' || Number(r.MonCotiz) !== 1 ||
      (r.CondicionIVAReceptorId !== undefined && Number(r.CondicionIVAReceptorId) !== intento.condicionReceptor)) {
    throw new Error('La consulta no coincide con el intento original; requiere revision');
  }
  const gravadas = intento.alicuotas.filter(a => a.alicuota > 0);
  const exentas = intento.alicuotas.filter(a => a.alicuota === 0);
  const sumar = (arr, campo) => arr.reduce((s, a) => s + centavos(a[campo]), 0);
  if (centavos(r.ImpTotal) !== centavos(intento.total) || centavos(r.ImpNeto) !== sumar(gravadas, 'base') ||
      centavos(r.ImpOpEx) !== sumar(exentas, 'base') || centavos(r.ImpIVA) !== centavos(intento.iva) ||
      centavos(r.ImpTrib) !== 0 || centavos(r.ImpTotConc) !== 0) {
    throw new Error('Los importes de ARCA no coinciden con el intento original');
  }
  const iva = r.Iva?.AlicIva;
  const recibidas = iva ? (Array.isArray(iva) ? iva : [iva]) : [];
  if (recibidas.length !== gravadas.length || gravadas.some(a => {
    const id = a.alicuota === 21 ? 5 : 4;
    const filas = recibidas.filter(b => Number(b.Id) === id);
    return filas.length !== 1 || centavos(filas[0].BaseImp) !== centavos(a.base) || centavos(filas[0].Importe) !== centavos(a.iva);
  })) throw new Error('Las alicuotas de ARCA no coinciden con el intento original');
  const cae = String(r.CodAutorizacion);
  if (!/^\d{14}$/.test(cae) || Number(cae) === 0) throw new Error('CAE consultado invalido');
  return { cae, cae_vencimiento: fechaISO(String(r.FchVto)) };
}

async function guardarFactura(db, cliente, venta, intentoId, datos, fiscal) {
  const numero_completo = `${datos.tipo === 1 ? 'FA' : 'FB'}-${String(datos.punto).padStart(5,'0')}-${String(datos.numero).padStart(8,'0')}`;
  const comp = await db.query(`INSERT INTO arca_comprobantes
    (cliente_id,venta_id,tipo_comprobante,numero_completo,punto_venta,numero,receptor_cuit,receptor_nombre,
     receptor_cond_iva,importe_neto,importe_iva,importe_total,cae,cae_vencimiento,fecha_emision)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [cliente,venta,String(datos.tipo),numero_completo,datos.punto,datos.numero,datos.receptor_cuit,datos.receptor_nombre,
      String(datos.condicionReceptor),datos.neto,datos.iva,datos.total,fiscal.cae,fiscal.cae_vencimiento,fechaISO(datos.fecha)]);
  const updated = await db.query(`UPDATE ventas SET cae=$1,cae_vencimiento=$2,tipo_factura=$3,numero_arca=$4,facturado=true
    WHERE id=$5 AND cliente_id=$6 AND COALESCE(facturado,false)=false`,
    [fiscal.cae,fiscal.cae_vencimiento,String(datos.tipo),numero_completo,venta,cliente]);
  if (updated.rowCount !== 1) throw new Error('La venta cambio de estado o no pertenece al cliente');
  const sumarIva = alic => datos.alicuotas.filter(a => a.alicuota === alic).reduce((s,a) => s + centavos(a.iva),0) / 100;
  await db.query(`INSERT INTO libros_iva_ventas
    (cliente_id,comprobante_id,venta_id,tipo_comprobante,numero_completo,cuit_receptor,nombre_receptor,
     importe_neto,importe_iva_21,importe_iva_105,importe_total,cae)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [cliente,comp.rows[0].id,venta,String(datos.tipo),numero_completo,datos.receptor_cuit,datos.receptor_nombre,
      datos.neto,sumarIva(21),sumarIva(10.5),datos.total,fiscal.cae]);
  const diario = await db.query('UPDATE arca_logs SET response=$1,exitoso=true WHERE id=$2 AND cliente_id=$3',
    [`registrada|${JSON.stringify(fiscal)}`,intentoId,cliente]);
  if (diario.rowCount !== 1) throw new Error('No se pudo finalizar el diario fiscal');
  return { ok: true, cae: fiscal.cae, numero_completo, tipo_factura: String(datos.tipo), vencimiento_cae: fiscal.cae_vencimiento };
}

// Dependencias inyectadas para probar PG real y ARCA simulada sin importar rutas ni .env.
async function conciliarFactura({ pool, consultar, obtenerToken }, cliente, ventaId) {
  const venta = Number(ventaId);
  if (!Number.isSafeInteger(venta) || venta <= 0) throw new Error('Venta invalida');
  const db = await iniciarEmision(pool, cliente, venta);
  try {
    const existentes = await db.query('SELECT * FROM arca_comprobantes WHERE cliente_id=$1 AND venta_id=$2', [cliente,venta]);
    const cfg = (await db.query('SELECT * FROM arca_configuracion WHERE cliente_id=$1 FOR UPDATE', [cliente])).rows[0];
    if (!cfg) throw new Error('Sin configuracion ARCA');
    const ventaRes = await db.query('SELECT * FROM ventas WHERE id=$1 AND cliente_id=$2 FOR UPDATE', [venta,cliente]);
    if (ventaRes.rows.length !== 1) throw new Error('Venta no encontrada para este cliente');
    if (existentes.rows.length) {
      const c = existentes.rows[0];
      const libro = await db.query('SELECT id FROM libros_iva_ventas WHERE comprobante_id=$1 AND cliente_id=$2 AND cae=$3', [c.id,cliente,c.cae]);
      if (existentes.rows.length !== 1 || !ventaRes.rows[0].facturado || ventaRes.rows[0].cae !== c.cae || libro.rows.length !== 1) {
        throw new Error('Existen registros contables inconsistentes; requiere revision');
      }
      await db.query('COMMIT');
      return { ok: true, ya_registrada: true, cae: c.cae, numero_completo: c.numero_completo };
    }
    const registros = await db.query(`SELECT id,request,response FROM arca_logs WHERE cliente_id=$1
      AND tipo='factura_intento' AND request LIKE $2 AND response <> 'rechazada' AND response NOT LIKE 'registrada|%' FOR UPDATE`,
      [cliente,`venta:${venta}|%`]);
    if (registros.rows.length !== 1) throw new Error('Debe existir un unico intento pendiente para conciliar');
    const registro = registros.rows[0];
    const datos = JSON.parse(registro.request.slice(registro.request.indexOf('|') + 1));
    if (![1,6].includes(datos.tipo) || !Number.isSafeInteger(datos.numero) || datos.numero < 1 || datos.numero > 99999999 ||
        !Number.isInteger(datos.punto) || datos.punto < 1 || datos.punto > 99999 ||
        !['produccion','homologacion'].includes(datos.modo) || datos.modo !== cfg.modo || datos.cuit !== cfg.cuit || datos.punto !== cfg.punto_venta ||
        centavos(ventaRes.rows[0].total) !== centavos(datos.total) || ventaRes.rows[0].facturado) {
      throw new Error('El intento, configuracion o venta cambiaron; requiere revision');
    }
    fechaISO(datos.fecha);
    validarImportes(datos.total,datos.alicuotas);
    const { validarEmisor,validarDetalle } = require('./arcaPdf');
    validarEmisor(datos.emisor); validarDetalle({ importe_neto: datos.neto, importe_iva: datos.iva },datos.items);
    await bloquearSerie(db,datos.modo,datos.cuit,datos.punto,datos.tipo);
    const token = await obtenerToken(cfg);
    const xml = await consultar(cfg,token,datos);
    const fiscal = await interpretarConsulta(xml,datos);
    if (registro.response) {
      const anterior = JSON.parse(registro.response);
      if (anterior.cae !== fiscal.cae || anterior.cae_vencimiento !== fiscal.cae_vencimiento) throw new Error('El CAE consultado difiere del diario fiscal');
    }
    const resultado = await guardarFactura(db,cliente,venta,registro.id,datos,fiscal);
    await db.query('COMMIT');
    return { ...resultado, conciliada: true };
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { db.release(); }
}

module.exports = { interpretarConsulta, guardarFactura, conciliarFactura };
