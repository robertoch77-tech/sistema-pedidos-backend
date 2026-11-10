'use strict';

const { centavos: centavosFiscales } = require('./arcaEmision');

const TIPOS = {
  1: 'Factura A', 2: 'Nota de débito A', 3: 'Nota de crédito A',
  6: 'Factura B', 7: 'Nota de débito B', 8: 'Nota de crédito B',
  11: 'Factura C', 12: 'Nota de débito C', 13: 'Nota de crédito C',
  51: 'Factura M', 52: 'Nota de débito M', 53: 'Nota de crédito M'
};
const CREDITOS = new Set(['3', '8', '13', '53']);

function rangoPeriodo(periodo) {
  if (typeof periodo !== 'string' || !/^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])$/.test(periodo)) return null;
  const [anio, mes] = periodo.split('-').map(Number);
  return [periodo + '-01', new Date(Date.UTC(anio, mes, 1)).toISOString().slice(0, 10)];
}

function centavos(valor) {
  const texto = String(valor ?? '');
  const negativo = texto.startsWith('-');
  try {
    const unidades = centavosFiscales(negativo ? texto.slice(1) : texto);
    return negativo ? -unidades : unidades;
  } catch {
    return null;
  }
}

function monto(valor, signo = 0) {
  const unidades = centavos(valor);
  if (unidades === null) return null;
  return (signo ? Math.abs(unidades) * signo : unidades) / 100;
}

function snapshotConfirmado(comp, diarios) {
  const candidatos = [];
  for (const diario of diarios) {
    try {
      const registro = JSON.parse(diario.request.slice(diario.request.indexOf('|') + 1));
      const resultado = JSON.parse(diario.response.slice('registrada|'.length));
      if (resultado.cae !== comp.cae ||
          registro.tipo !== Number(comp.tipo_comprobante) ||
          registro.punto !== Number(comp.punto_venta) ||
          registro.numero !== Number(comp.numero) ||
          registro.fecha !== comp.fecha.replace(/-/g, '') ||
          centavos(registro.neto) !== centavos(comp.neto) ||
          centavos(registro.iva) !== centavos(comp.iva) ||
          centavos(registro.total) !== centavos(comp.total)) continue;
      candidatos.push(registro);
    } catch {
      // Un diario antiguo o incompleto no invalida el comprobante guardado.
    }
  }
  return candidatos.length === 1 ? candidatos[0] : null;
}

function desgloseConfirmado(filas, iva, signo) {
  if (!Array.isArray(filas) || filas.length === 0 || iva === null) return [];
  const detalle = filas.map(fila => ({
    alicuota: fila.alicuota === null ? NaN : Number(fila.alicuota),
    neto: monto(fila.base, signo),
    iva: monto(fila.iva, signo)
  }));
  if (detalle.some(fila => !Number.isFinite(fila.alicuota) || fila.alicuota < 0 || fila.iva === null)) return [];
  const suma = detalle.reduce((total, fila) => total + centavos(fila.iva), 0);
  return suma === centavos(iva) ? detalle : [];
}

function venta(comp, diarios) {
  const snapshot = snapshotConfirmado(comp, diarios);
  if (snapshot?.modo === 'homologacion') return null;
  const signo = CREDITOS.has(String(comp.tipo_comprobante)) ? -1 : 0;
  const iva = monto(comp.iva, signo);
  const neto = monto(comp.neto, signo);
  let desglose = desgloseConfirmado(snapshot?.alicuotas, iva, signo);
  if (desglose.length && (desglose.some(fila => fila.neto === null) ||
      desglose.reduce((suma, fila) => suma + centavos(fila.neto), 0) !== centavos(neto))) {
    desglose = [];
  }
  if (!desglose.length && Number(comp.filas_libro) === 1) {
    const libro = [
      { alicuota: 10.5, base: null, iva: comp.iva_105 },
      { alicuota: 21, base: null, iva: comp.iva_21 }
    ].filter(fila => centavos(fila.iva));
    desglose = desgloseConfirmado(libro, iva, signo);
  }
  const completo = desglose.length > 0 && desglose.every(fila => fila.neto !== null);
  return {
    id: comp.id, fecha: comp.fecha,
    tipo: TIPOS[comp.tipo_comprobante] || 'Tipo ' + comp.tipo_comprobante,
    numero: comp.numero_completo, cuit: comp.cuit, nombre: comp.nombre, cae: comp.cae,
    neto, iva, total: monto(comp.total, signo), desglose,
    gravado: completo ? desglose.filter(fila => fila.alicuota > 0).reduce((s, f) => s + centavos(f.neto), 0) / 100 : null,
    exento: completo ? desglose.filter(fila => fila.alicuota === 0).reduce((s, f) => s + centavos(f.neto), 0) / 100 : null,
    ambiente: snapshot?.modo === 'produccion' ? 'Producción' : 'Sin identificar'
  };
}

function compra(registro) {
  const iva = monto(registro.iva);
  const signo = iva < 0 ? -1 : 0;
  const desglose = desgloseConfirmado(registro.alicuotas, iva, signo);
  return {
    id: registro.id, fecha: registro.fecha, numero: registro.numero,
    tipo: registro.tipo === 'detallada' ? 'Compra detallada' : registro.tipo === 'simple' ? 'Compra simple' : 'Compra',
    cuit: registro.cuit, nombre: registro.nombre, neto: monto(registro.neto),
    iva, total: monto(registro.total), desglose,
    percepcion_iva: monto(registro.percepcion_iva),
    percepcion_iibb: monto(registro.percepcion_iibb),
    percepcion_municipal: monto(registro.percepcion_municipal)
  };
}

async function leerReporteIva(pool, cliente, periodo, rango) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const params = [cliente, ...rango];
    const ventas = await db.query(`
      SELECT a.id::text, a.fecha_emision::text AS fecha, a.tipo_comprobante,
             a.numero_completo, a.punto_venta, a.numero, a.cae,
             a.receptor_cuit AS cuit, a.receptor_nombre AS nombre,
             a.importe_neto AS neto, a.importe_iva AS iva, a.importe_total AS total,
             l.filas_libro, l.iva_105, l.iva_21
      FROM arca_comprobantes a
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS filas_libro, MAX(importe_iva_105) AS iva_105, MAX(importe_iva_21) AS iva_21
        FROM libros_iva_ventas
        WHERE cliente_id = a.cliente_id AND comprobante_id = a.id AND cae = a.cae
      ) l ON true
      WHERE a.cliente_id = $1 AND a.fecha_emision >= $2::date AND a.fecha_emision < $3::date
        AND COALESCE(a.estado, '') NOT IN ('anulada', 'cancelada', 'rechazada', 'pendiente')
        AND BTRIM(COALESCE(a.cae, '')) NOT IN ('', '0')
      ORDER BY a.fecha_emision, a.id
    `, params);

    const diariosPorCae = new Map();
    if (ventas.rows.length) {
      const diarios = await db.query(`
        SELECT d.request, d.response, d.cae
        FROM (
          SELECT request, response, substring(response FROM '"cae"[[:space:]]*:[[:space:]]*"([0-9]+)"') AS cae
          FROM arca_logs
          WHERE cliente_id = $1 AND tipo IN ('factura_intento', 'nc_intento')
            AND exitoso = true AND response LIKE 'registrada|%'
        ) d
        WHERE d.cae = ANY($2::text[])
      `, [cliente, [...new Set(ventas.rows.map(fila => fila.cae))]]);
      for (const diario of diarios.rows) {
        const coincidencias = diariosPorCae.get(diario.cae) || [];
        coincidencias.push(diario);
        diariosPorCae.set(diario.cae, coincidencias);
      }
    }

    const compras = await db.query(`
      SELECT c.id::text, c.fecha::text, c.tipo, c.numero_factura AS numero,
             p.cuit, c.proveedor_nombre AS nombre, c.subtotal AS neto,
             c.iva_monto AS iva, c.total,
             (to_jsonb(c)->>'perc_iva_monto') AS percepcion_iva,
             (to_jsonb(c)->>'iibb_monto') AS percepcion_iibb,
             (to_jsonb(c)->>'municipal_monto') AS percepcion_municipal,
             i.alicuotas
      FROM compras c
      LEFT JOIN proveedores p ON p.id = c.proveedor_id AND p.cliente_id = c.cliente_id
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('alicuota', tasa, 'iva', iva::text,
                        'base', CASE WHEN c.subtotal = base_total THEN base::text END)
                        ORDER BY tasa) AS alicuotas
        FROM (
          SELECT alicuota_iva AS tasa, SUM(iva_monto) AS iva, SUM(subtotal) AS base,
                 SUM(SUM(subtotal)) OVER () AS base_total
          FROM compras_items
          WHERE compra_id = c.id AND cliente_id = c.cliente_id
          GROUP BY alicuota_iva
        ) grupos
      ) i ON true
      WHERE c.cliente_id = $1 AND c.fecha >= $2::date AND c.fecha < $3::date
        AND COALESCE(c.estado, '') NOT IN ('anulada', 'cancelada', 'rechazada')
      ORDER BY c.fecha, c.id
    `, params);
    const filasVentas = ventas.rows.map(comp => venta(comp, diariosPorCae.get(comp.cae) || []));
    const resultado = {
      periodo, ventas: filasVentas.filter(Boolean), compras: compras.rows.map(compra),
      comprobantes_prueba_excluidos: filasVentas.filter(fila => fila === null).length
    };
    await db.query('COMMIT');
    return resultado;
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}

module.exports = { rangoPeriodo, leerReporteIva };
