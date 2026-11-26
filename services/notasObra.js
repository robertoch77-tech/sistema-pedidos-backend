const { fallo, huellaOperacion } = require('./cuentaCorrienteVentas');

async function exigirVentas(db, clienteId) {
  const habilitado = await db.query(`SELECT 1 FROM clientes_roberto c
    JOIN mayoristas m ON m.id=c.mayorista_id
    WHERE c.id=$1 AND m.tipo_fuente='roberto' AND m.habilitar_ventas`, [clienteId]);
  if (!habilitado.rowCount) throw fallo('Ventas no está habilitado para este negocio.', 403);
}

function entero(valor) {
  const n = Number(valor);
  if (!Number.isSafeInteger(n) || n < 1) throw fallo('Identificador inválido.');
  return n;
}

function decimal(valor, campo, admiteCero = true) {
  const s = String(valor ?? '').trim();
  if (!/^\d{1,15}(?:\.\d{1,15})?$/.test(s) || (!admiteCero && Number(s) === 0)) {
    throw fallo('Valor inválido en ' + campo + '.');
  }
  // Compara cantidades decimales sin redondearlas como números de punto flotante.
  const [entera, fraccion = ''] = s.split('.');
  const parte = fraccion.replace(/0+$/, '');
  return entera.replace(/^0+(?=\d)/, '') + (parte ? '.' + parte : '');
}

function uuid(valor) {
  if (typeof valor !== 'string' || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(valor)) {
    throw fallo('Identificador de operación inválido.');
  }
  return valor;
}

const cabecera = `SELECT n.id, n.cuenta_id, n.obra, n.version, n.venta_id, n.creado_en, n.actualizado_en,
  CASE WHEN n.venta_id IS NULL THEN 'abierta' ELSE 'finalizada' END AS estado,
  c.comprador_nombre AS nombre, c.comprador_cuit AS cuit, c.condicion_iva, c.lista_precio_id
  FROM roberto_notas_obra n JOIN cuentas_corrientes_clientes c ON c.id=n.cuenta_id AND c.cliente_id=n.cliente_id`;

// Las devoluciones parciales se acumulan con NUMERIC sobre la partida original.
const saldoRetiros = `SELECT r.*, r.cantidad - COALESCE(d.devuelto,0) AS disponible
  FROM roberto_notas_obra_movimientos r
  LEFT JOIN LATERAL (SELECT SUM(cantidad) AS devuelto FROM roberto_notas_obra_movimientos
    WHERE nota_id=r.nota_id AND retiro_id=r.id) d ON true
  WHERE r.nota_id=$1 AND r.retiro_id IS NULL`;

async function detalle(db, clienteId, notaId) {
  const n = await db.query(cabecera + ' WHERE n.cliente_id=$1 AND n.id=$2', [clienteId, notaId]);
  if (!n.rows[0]) throw fallo('Nota de obra no encontrada.', 404);
  const m = await db.query(`SELECT *, CASE WHEN retiro_id IS NULL THEN 'retiro' ELSE 'devolucion' END AS tipo
    FROM roberto_notas_obra_movimientos WHERE nota_id=$1 ORDER BY id`, [notaId]);
  const s = await db.query(`WITH saldos AS (${saldoRetiros})
    SELECT s.id AS retiro_id, s.producto_id, s.codigo, s.descripcion, s.disponible AS cantidad,
      s.precio_unitario, s.descuento_porcentaje, s.alicuota_iva, s.lista_precio, s.modo_iva,
      CASE WHEN p.id IS NOT NULL THEN json_build_object(
        'id',p.id,'codigo',p.codigo,'descripcion',p.descripcion,'activo',p.activo,
        'precio_venta_1',p.precio_venta_1,'precio_venta_2',p.precio_venta_2,'precio_venta_3',p.precio_venta_3,
        'precio_venta_final',p.precio_venta_final,'alicuota_iva',p.alicuota_iva,'stock_actual',p.stock_actual) END AS producto
    FROM saldos s LEFT JOIN productos_propios p ON p.id=s.producto_id AND p.cliente_id=$2
    WHERE s.disponible > 0 ORDER BY s.id`, [notaId,clienteId]);
  return { nota: n.rows[0], movimientos: m.rows, saldos: s.rows };
}

async function crear(db, clienteId, body) {
  const cuenta = entero(body.cuenta_id);
  const obra = String(body.obra || '').trim();
  const op = uuid(body.operacion_id);
  if (obra.length > 250) throw fallo('La referencia de obra admite hasta 250 caracteres.');
  const insert = await db.query(`INSERT INTO roberto_notas_obra(cliente_id,cuenta_id,obra,operacion_id)
    SELECT $1,id,$3,$4 FROM cuentas_corrientes_clientes WHERE cliente_id=$1 AND id=$2 AND activo
    ON CONFLICT (cliente_id,operacion_id) DO NOTHING RETURNING id`, [clienteId,cuenta,obra,op]);
  if (insert.rowCount) return detalle(db,clienteId,insert.rows[0].id);
  const anterior = await db.query('SELECT id, cuenta_id, obra FROM roberto_notas_obra WHERE cliente_id=$1 AND operacion_id=$2', [clienteId,op]);
  if (!anterior.rowCount) throw fallo('Elegí un cliente activo del negocio.');
  if (Number(anterior.rows[0].cuenta_id) !== cuenta || anterior.rows[0].obra !== obra) throw fallo('Esta operación ya se usó para otra nota.',409);
  return detalle(db,clienteId,anterior.rows[0].id);
}

async function registrar(db, clienteId, notaId, body) {
  const op = uuid(body.operacion_id);
  const retira = String(body.retira || '').trim();
  if (retira.length > 250) throw fallo('El nombre de quien retira admite hasta 250 caracteres.');
  if (!Array.isArray(body.items) || !body.items.length) throw fallo('Agregá al menos un movimiento.');
  const nota = await db.query('SELECT venta_id FROM roberto_notas_obra WHERE id=$1 AND cliente_id=$2 FOR UPDATE',[notaId,clienteId]);
  if (!nota.rowCount) throw fallo('Nota de obra no encontrada.',404);
  const huella = huellaOperacion({retira, items:body.items});
  const operacion = await db.query('SELECT huella FROM roberto_notas_obra_operaciones WHERE nota_id=$1 AND operacion_id=$2',[notaId,op]);
  if (operacion.rowCount) {
    if (operacion.rows[0].huella !== huella) throw fallo('Esta operación ya se registró con otros datos.',409);
    return detalle(db,clienteId,notaId);
  }
  if (nota.rows[0].venta_id) throw fallo('La nota ya está finalizada.',409);
  await db.query('INSERT INTO roberto_notas_obra_operaciones(nota_id,operacion_id,huella) VALUES($1,$2,$3)',[notaId,op,huella]);
  for (const item of body.items) {
    const cantidad = decimal(item?.cantidad,'cantidad',false);
    if (item.tipo === 'retiro') {
      const precio = decimal(item.precio_unitario,'precio unitario');
      const iva = decimal(item.alicuota_iva,'alícuota IVA');
      const descuento = decimal(item.descuento_porcentaje ?? 0,'descuento');
      if (Number(descuento) > 100) throw fallo('El descuento supera el 100 %.');
      const retiro = await db.query(`INSERT INTO roberto_notas_obra_movimientos
        (nota_id,operacion_id,producto_id,codigo,descripcion,retira,cantidad,precio_unitario,alicuota_iva,descuento_porcentaje,lista_precio,modo_iva)
        SELECT $1,$2,p.id,COALESCE(p.codigo,''),COALESCE(p.descripcion,''),$3,$4,$5,$6,$7,$8,$9
        FROM productos_propios p WHERE p.id=$10 AND p.cliente_id=$11 AND p.activo`,
        [notaId,op,retira,cantidad,precio,iva,descuento,item.lista_precio ?? null,item.modo_iva ?? null,entero(item.producto_id),clienteId]);
      if (!retiro.rowCount) throw fallo('El producto no está activo en este negocio.',409);
    } else if (item.tipo === 'devolucion') {
      const devolucion = await db.query(`WITH saldos AS (${saldoRetiros})
        INSERT INTO roberto_notas_obra_movimientos
        (nota_id,operacion_id,producto_id,codigo,descripcion,retira,retiro_id,cantidad,precio_unitario,alicuota_iva,descuento_porcentaje,lista_precio,modo_iva)
        SELECT nota_id,$2,producto_id,codigo,descripcion,$3,id,$4,precio_unitario,alicuota_iva,descuento_porcentaje,lista_precio,modo_iva
        FROM saldos WHERE id=$5 AND disponible >= $4::numeric`, [notaId,op,retira,cantidad,entero(item.retiro_id)]);
      if (!devolucion.rowCount) throw fallo('La devolución supera el saldo de ese retiro o corresponde a otra nota.',409);
    } else throw fallo('Tipo de movimiento inválido.');
  }
  await db.query('UPDATE roberto_notas_obra SET version=version+1, actualizado_en=now() WHERE id=$1',[notaId]);
  return detalle(db,clienteId,notaId);
}

async function validarParaVenta(db, clienteId, body) {
  await exigirVentas(db, clienteId);
  const id = entero(body.nota_obra_id);
  const res = await db.query(`SELECT n.*, c.comprador_nombre,c.comprador_cuit,v.numero_completo FROM roberto_notas_obra n
    JOIN cuentas_corrientes_clientes c ON c.cliente_id=n.cliente_id AND c.id=n.cuenta_id
    LEFT JOIN ventas v ON v.cliente_id=n.cliente_id AND v.id=n.venta_id
    WHERE n.id=$1 AND n.cliente_id=$2 FOR UPDATE OF n`,[id,clienteId]);
  const nota = res.rows[0];
  if (!nota) throw fallo('Nota de obra no encontrada.',404);
  if (nota.venta_id) {
    if (nota.venta_huella !== huellaOperacion(body)) throw fallo('La nota ya está finalizada en la venta ' + nota.numero_completo + '.',409);
    return {venta_id:nota.venta_id, numero_completo:nota.numero_completo};
  }
  if (nota.version !== entero(body.nota_obra_version)) throw fallo('La nota cambió. Volvé a abrirla para revisar los movimientos.',409);
  if ((body.comprador_nombre || '') !== nota.comprador_nombre || (body.comprador_cuit || '') !== (nota.comprador_cuit || '') ||
      (body.va_a_cuenta_corriente && Number(body.cuenta_corriente_cliente_id) !== Number(nota.cuenta_id))) {
    throw fallo('La venta debe corresponder al cliente de la nota.',409);
  }
  if (body.presupuesto_origen_id) throw fallo('Elegí un solo documento de origen.');
  const saldos = await db.query(`SELECT id,producto_id,disponible FROM (${saldoRetiros}) s WHERE disponible>0`,[id]);
  const pendientes = new Map(saldos.rows.map(r => [Number(r.id),r]));
  for (const item of body.items) {
    const retiro = entero(item.nota_obra_retiro_id);
    const saldo = pendientes.get(retiro);
    if (!saldo || item.es_libre || Number(item.producto_id) !== Number(saldo.producto_id) ||
        decimal(item.cantidad,'cantidad',false) !== decimal(saldo.disponible,'cantidad',false)) {
      throw fallo('Los artículos o cantidades ya no coinciden con la nota. Revisá sus movimientos.',409);
    }
    pendientes.delete(retiro);
  }
  if (pendientes.size) throw fallo('Faltan artículos de la nota en la venta.',409);
}

async function finalizar(db, clienteId, body, ventaId) {
  await db.query(`UPDATE roberto_notas_obra SET venta_id=$1, venta_huella=$2,version=version+1,actualizado_en=now()
    WHERE cliente_id=$3 AND id=$4`,[ventaId,huellaOperacion(body),clienteId,body.nota_obra_id]);
}

module.exports = { entero, exigirVentas, cabecera, detalle, crear, registrar, validarParaVenta, finalizar };
