const { fallo, bloquearOperacion, bloquearCuenta, huellaOperacion } = require('./cuentaCorrienteVentas');
const n = v => Number(v) || 0;

// Función común: Ventas y Cuenta corriente registran el mismo cobro.
// El llamador abre/cierrra la transacción. No se toca stock ni precios.
async function registrarCobroCliente(client, cliente_id, datos, operacionId = '') {
  const { cuenta_corriente_id, monto_total, fecha, medios_pago = [], observaciones = '', venta_id = null } = datos;
  if (!Number.isFinite(Number(monto_total)) || Number(monto_total) <= 0) throw fallo('El cobro debe ser mayor que cero.');
  if (!medios_pago.length || medios_pago.some(m => !Number.isFinite(Number(m.monto)) || Number(m.monto) <= 0 || !m.tipo || m.tipo === 'cuenta_corriente')) {
    throw fallo('Indicá los medios de pago realmente recibidos.');
  }
  if (Math.abs(medios_pago.reduce((s,m) => s + Number(m.monto), 0) - Number(monto_total)) > 0.005) throw fallo('Los medios de pago no coinciden con el importe cobrado.');
  if (operacionId && !/^[a-zA-Z0-9_-]{16,100}$/.test(operacionId)) throw fallo('Identificador de operación inválido.');
  await bloquearOperacion(client, cliente_id);
  const cuenta = await bloquearCuenta(client, cliente_id, cuenta_corriente_id);
  const referenciaOperacion = operacionId ? 'cc-cobro:' + operacionId + ':' + huellaOperacion(datos) : '';
  if (operacionId) {
    const previa = await client.query(
      `SELECT numero_comprobante, referencia FROM movimientos_cuentas_corrientes
       WHERE cliente_id=$1 AND split_part(referencia, ':', 1)='cc-cobro'
         AND split_part(referencia, ':', 2)=$2 AND tipo='cobro'`, [cliente_id, operacionId]);
    if (previa.rows[0]) {
      if (previa.rows[0].referencia !== referenciaOperacion) throw fallo('Este cobro ya se registró con otros datos. Revisá el comprobante antes de iniciar otro.', 409);
      return { ok: true, repetida: true, numero_completo: previa.rows[0].numero_comprobante, saldo_nuevo: cuenta.saldo };
    }
  }
  // La caja no se inventa ni se omite silenciosamente: el pago debe tener destino.
  const cajaAbierta = await client.query(
    `SELECT id FROM cajas WHERE cliente_id=$1 AND estado='abierta' ORDER BY fecha_apertura DESC LIMIT 1 FOR UPDATE`, [cliente_id]);
  if (!cajaAbierta.rows[0]) throw fallo('Abrí una caja para registrar este cobro. No se modificó la deuda.', 409);
  const pendientes = await client.query(
    `SELECT v.id, v.saldo, v.total FROM ventas v
     WHERE v.cliente_id=$1 AND v.va_a_cuenta_corriente=true AND v.anulada=false AND v.cobrada=false
       AND EXISTS (SELECT 1 FROM movimientos_cuentas_corrientes m
         WHERE m.cliente_id=v.cliente_id AND m.venta_id=v.id AND m.cuenta_corriente_id=$2 AND m.tipo='venta')
       AND ($3::bigint IS NULL OR v.id=$3)
     ORDER BY v.fecha, v.id FOR UPDATE OF v`, [cliente_id, cuenta_corriente_id, venta_id]);
  if (venta_id && (!pendientes.rows[0] || Number(monto_total) > Number(pendientes.rows[0].saldo) + 0.005)) {
    throw fallo('La venta ya está cobrada o el importe supera su saldo pendiente.', 409);
  }
  if (venta_id && Number(monto_total) > Number(cuenta.saldo) + 0.005) {
    throw fallo('Esta cuenta tiene pagos o créditos previos. Registrá el saldo real desde Cuenta corriente para no cobrarlo dos veces.', 409);
  }
    // Número de cobranza
    const numRes = await client.query(
      `SELECT COALESCE(MAX(id),0)+1 AS num FROM cobranzas WHERE cliente_id=$1`, [cliente_id]
    );
    const numero = `COB-${String(numRes.rows[0].num).padStart(6, '0')}`;

    // INSERT cobranza
    const cobRes = await client.query(
      `INSERT INTO cobranzas (cliente_id, cuenta_corriente_id, numero, fecha, total_cobrado, observaciones)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [cliente_id, cuenta_corriente_id, numero, fecha || new Date().toISOString().slice(0,10), n(monto_total), observaciones || '']
    );
    const cobranza_id = cobRes.rows[0].id;

    // Obtener nombre del comprador una sola vez para los cheques
    const compradorNombreRes = await client.query(
      `SELECT comprador_nombre FROM cuentas_corrientes_clientes WHERE id=$1 AND cliente_id=$2`, [cuenta_corriente_id, cliente_id]
    );
    const compradorNombreCC = compradorNombreRes.rows[0]?.comprador_nombre || '';

    // INSERT items
    for (const item of medios_pago) {
      await client.query(
        `INSERT INTO cobranzas_items (cobranza_id, tipo, monto, referencia, medio_pago_id, cheque_datos)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [cobranza_id, item.tipo, n(item.monto), item.referencia || '', item.medio_pago_id || null,
         item.cheque_datos ? JSON.stringify(item.cheque_datos) : null]
      );

      // Si es cheque → registrar en tabla cheques
      if ((item.tipo === 'cheque_propio' || item.tipo === 'cheque_tercero' || item.tipo === 'echeq') && item.cheque_datos) {
        const ch = item.cheque_datos;
        await client.query(
          `INSERT INTO cheques (cliente_id, numero, banco, titular_nombre, titular_cuit, monto, fecha_cobro,
            tipo, estado, origen, origen_id, cliente_proveedor)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'en_cartera','cobranza',$9,$10)`,
          [cliente_id, ch.numero || '', ch.banco || '', ch.titular || '', ch.cuit_titular || '',
           n(item.monto), ch.fecha_cobro || null,
           item.tipo === 'cheque_propio' ? 'propio' : item.tipo === 'echeq' ? 'echeq' : 'tercero',
           cobranza_id, compradorNombreCC]
        );
      }
    }

    // Saldo actual antes del cobro
    const ccRes = await client.query(
      `SELECT saldo FROM cuentas_corrientes_clientes WHERE id=$1 AND cliente_id=$2`, [cuenta_corriente_id, cliente_id]
    );
    const saldoAnterior = n(ccRes.rows[0]?.saldo ?? 0);
    const saldoNuevo    = saldoAnterior - n(monto_total);

    // INSERT movimiento tipo=cobro
    await client.query(
      `INSERT INTO movimientos_cuentas_corrientes
         (cuenta_corriente_id, cliente_id, tipo, haber, saldo_acumulado, descripcion, numero_comprobante, referencia)
       VALUES ($1,$2,'cobro',$3,$4,$5,$6,$7)`,
      [cuenta_corriente_id, cliente_id, n(monto_total), saldoNuevo,
       `Cobro ${numero}${observaciones ? ' - ' + observaciones : ''}`, numero, referenciaOperacion]
    );

    // UPDATE saldo CC
    await client.query(
      `UPDATE cuentas_corrientes_clientes
       SET saldo=$1, modificado_en=now()
       WHERE id=$2 AND cliente_id=$3`,
      [saldoNuevo, cuenta_corriente_id, cliente_id]
    );

    // Movimiento de caja (si hay caja abierta)
    {
      const cajaRes = await client.query(
        `SELECT id FROM cajas WHERE cliente_id=$1 AND estado='abierta' ORDER BY fecha_apertura DESC LIMIT 1 FOR UPDATE`,
        [cliente_id]
      );
      if (cajaRes.rows.length > 0) {
        const caja_id = cajaRes.rows[0].id;
        const medio_pago_principal = medios_pago[0]?.tipo || 'efectivo';
        const compradorRes = await client.query(
          `SELECT comprador_nombre FROM cuentas_corrientes_clientes WHERE id=$1 AND cliente_id=$2`, [cuenta_corriente_id, cliente_id]
        );
        const comprador_nombre = compradorRes.rows[0]?.comprador_nombre || '';
        await client.query(
          `INSERT INTO caja_movimientos
             (caja_id, cliente_id, tipo, tipo_operacion,
              monto, medio_pago, descripcion, numero_comprobante)
           VALUES ($1,$2,'cobro','ingreso',$3,$4,$5,$6)`,
          [caja_id, cliente_id, n(monto_total), medio_pago_principal,
           `Cobro cliente ${comprador_nombre}`, numero]
        );
        await client.query(
          `UPDATE cajas
           SET total_ingresos = total_ingresos + $1,
               saldo_actual   = saldo_actual   + $1
           WHERE id=$2`,
          [n(monto_total), caja_id]
        );
      }
    }

  // Aplicación del pago a ventas pendientes, sin volver a crear la venta.
  // Los pagos generales se imputan por antigüedad; el sobrante queda a favor.
  let disponible = Number(monto_total);
  for (const venta of pendientes.rows) {
    if (disponible <= 0) break;
    const aplicado = Math.min(disponible, Math.max(0, Number(venta.saldo)));
    if (!aplicado) continue;
    await client.query(
      `UPDATE ventas SET saldo=GREATEST(0, saldo-$1::numeric),
         cobrada=(saldo-$1::numeric<=0.005),
         estado=CASE WHEN saldo-$1::numeric<=0.005 THEN 'cobrada' ELSE 'pendiente' END,
         modificado_en=now() WHERE id=$2 AND cliente_id=$3`, [aplicado.toFixed(4), venta.id, cliente_id]);
    if (Number(venta.saldo)-aplicado <= 0.005) {
      await client.query(
        `UPDATE movimientos_cuentas_corrientes SET estado='procesado'
         WHERE cliente_id=$1 AND venta_id=$2 AND cuenta_corriente_id=$3 AND tipo='venta'`,
        [cliente_id, venta.id, cuenta_corriente_id]);
    }
    disponible = Math.max(0, disponible-aplicado);
  }
  // Las ventas parcialmente pagadas aportan sólo su saldo, no el importe original.
  await client.query(
    `UPDATE cuentas_corrientes_clientes SET saldo_vencido=GREATEST(0, LEAST(saldo,
       (SELECT COALESCE(SUM(CASE WHEN m.tipo='venta' AND v.id IS NOT NULL THEN v.saldo ELSE m.debe-m.haber END),0)
        FROM movimientos_cuentas_corrientes m LEFT JOIN ventas v ON v.id=m.venta_id AND v.cliente_id=m.cliente_id
        WHERE m.cuenta_corriente_id=$1 AND m.cliente_id=$2 AND m.estado='pendiente'
          AND m.fecha_vencimiento IS NOT NULL AND m.fecha_vencimiento<CURRENT_DATE)))
     WHERE id=$1 AND cliente_id=$2`, [cuenta_corriente_id, cliente_id]);
  // Mantener el evento previo sin permitir que analytics falle toda la cobranza.
  await client.query('SAVEPOINT cc_analytics');
  try {
    await client.query(`INSERT INTO analytics_eventos (cliente_id,tipo,valor,metadata) VALUES($1,'cobro',$2,$3)`,
      [cliente_id, n(monto_total), JSON.stringify({ cobranza_id, cuenta_corriente_id })]);
  } catch (_) { await client.query('ROLLBACK TO SAVEPOINT cc_analytics'); }
  await client.query('RELEASE SAVEPOINT cc_analytics');
  return { ok: true, cobranza_id, numero_completo: numero, saldo_nuevo: saldoNuevo };
}
module.exports = { registrarCobroCliente };
