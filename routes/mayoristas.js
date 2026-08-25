const express = require('express');
const router = express.Router();
const pool = require('../db');
const conexionCompartida = require('../services/conexionMayorista');

const columnaPresupuestoLista = pool.query('ALTER TABLE mayoristas ADD COLUMN IF NOT EXISTS permitir_presupuesto_clientes boolean DEFAULT false').catch(error => {
  console.error('Mayoristas: no se pudo asegurar permitir_presupuesto_clientes:', error.message);
  return null;
});
const columnaDetalleCalculo = pool.query('ALTER TABLE mayoristas ADD COLUMN IF NOT EXISTS mostrar_detalle_calculo_precios boolean DEFAULT true').catch(error => {
  console.error('Mayoristas: no se pudo asegurar mostrar_detalle_calculo_precios:', error.message);
  return null;
});

async function getConexionMayorista(mayorista_id) {
  return conexionCompartida.getConexionMayorista(mayorista_id);
}

router.get('/', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, nombre, codigo, logo_url AS logo, activo,
              mostrar_precios, mostrar_stock, mostrar_marca, mostrar_rubro, mostrar_tipo,
              habilitar_calculadora, descuento_1, descuento_2, descuento_3, iva,
              orden_pdf, config_habilitada, pedir_clave, tamanio_hoja, items_por_hoja,
              numero_pedido_inicio, habilitar_ctas_ctes, razon_social,
              habilitar_demanda, habilitar_ofertas, habilitar_productos_solicitados,
              habilitar_descuentos_por_cliente,
              habilitar_lector_barras, habilitar_cross_selling, habilitar_mensajes,
              habilitar_medios_de_pago, medios_de_pago, habilitar_notificaciones,
              habilitar_calculadora_venta, habilitar_historial_ventas,
              habilitar_cotizaciones, habilitar_novedades,
              dto_pago_termino, precio_incluye_iva,
              ivan_activo
       FROM mayoristas
       WHERE activo = true
         AND tipo_fuente IS DISTINCT FROM 'roberto'`
    );
    res.json(resultado.rows);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

router.get('/:id/configuracion', async (req, res) => {
  try {
    await Promise.all([columnaPresupuestoLista, columnaDetalleCalculo]);
    const { id } = req.params;
    const resultado = await pool.query(
      // === MODIFICADO: se agregó habilitar_productos_solicitados ===
      `SELECT mostrar_precios, mostrar_stock, mostrar_marca, mostrar_rubro, mostrar_tipo,
              habilitar_calculadora, descuento_1, descuento_2, descuento_3, iva,
              orden_pdf, config_habilitada, pedir_clave, tamanio_hoja, items_por_hoja,
              numero_pedido_inicio, habilitar_ctas_ctes, razon_social, nombre, logo_url,
              habilitar_demanda, habilitar_ofertas, habilitar_productos_solicitados,
              habilitar_descuentos_por_cliente,
              habilitar_lector_barras, habilitar_cross_selling, habilitar_mensajes,
              habilitar_medios_de_pago, medios_de_pago, habilitar_notificaciones,
              habilitar_calculadora_venta, habilitar_historial_ventas,
              habilitar_cotizaciones, habilitar_novedades,
              dto_pago_termino,
              precio_incluye_iva, permitir_presupuesto_clientes,
              mostrar_detalle_calculo_precios
       FROM mayoristas WHERE id=$1`, [id]
    );
    if (!resultado.rows[0]) return res.status(404).json({ mensaje: 'Mayorista no encontrado' });
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

router.put('/:id/configuracion', async (req, res) => {
  try {
    await Promise.all([columnaPresupuestoLista, columnaDetalleCalculo]);
    const { id } = req.params;
    const {
      mostrar_precios, mostrar_stock, mostrar_marca, mostrar_rubro, mostrar_tipo,
      pedir_clave, tamanio_hoja, items_por_hoja, numero_pedido_inicio,
      habilitar_calculadora, descuento_1, descuento_2, descuento_3, iva, orden_pdf,
      // === MODIFICADO: se agregó habilitar_productos_solicitados ===
      habilitar_ctas_ctes, habilitar_demanda, habilitar_ofertas, habilitar_productos_solicitados,
      habilitar_medios_de_pago, medios_de_pago, habilitar_notificaciones,
      dto_pago_termino, precio_incluye_iva, permitir_presupuesto_clientes,
      mostrar_detalle_calculo_precios
    } = req.body;
    // Este endpoint es compartido por Admin y por el panel del mayorista.
    // Cada pantalla envía un subconjunto distinto: un campo ausente debe
    // conservarse, mientras que false y 0 sí son valores intencionales.
    const valor = dato => dato === undefined ? null : dato;
    const resultado = await pool.query(
      `UPDATE mayoristas SET
        mostrar_precios=COALESCE($1, mostrar_precios),
        mostrar_stock=COALESCE($2, mostrar_stock),
        mostrar_marca=COALESCE($3, mostrar_marca),
        mostrar_rubro=COALESCE($4, mostrar_rubro),
        mostrar_tipo=COALESCE($5, mostrar_tipo),
        pedir_clave=COALESCE($6, pedir_clave),
        tamanio_hoja=COALESCE($7, tamanio_hoja),
        items_por_hoja=COALESCE($8, items_por_hoja),
        numero_pedido_inicio=COALESCE($9, numero_pedido_inicio),
        habilitar_calculadora=COALESCE($10, habilitar_calculadora),
        descuento_1=COALESCE($11, descuento_1),
        descuento_2=COALESCE($12, descuento_2),
        descuento_3=COALESCE($13, descuento_3),
        iva=COALESCE($14, iva),
        orden_pdf=COALESCE($15, orden_pdf),
        habilitar_ctas_ctes=COALESCE($16, habilitar_ctas_ctes),
        habilitar_demanda=COALESCE($17, habilitar_demanda),
        habilitar_ofertas=COALESCE($18, habilitar_ofertas),
        habilitar_productos_solicitados=COALESCE($19, habilitar_productos_solicitados),
        habilitar_medios_de_pago=COALESCE($20, habilitar_medios_de_pago),
        medios_de_pago=COALESCE($21, medios_de_pago),
        habilitar_notificaciones=COALESCE($22, habilitar_notificaciones),
        dto_pago_termino=COALESCE($23, dto_pago_termino),
        precio_incluye_iva=COALESCE($24, precio_incluye_iva),
        permitir_presupuesto_clientes=COALESCE($25, permitir_presupuesto_clientes),
        mostrar_detalle_calculo_precios=COALESCE($26, mostrar_detalle_calculo_precios)
       WHERE id=$27
       RETURNING id, nombre, codigo, logo_url,
                 mostrar_precios, mostrar_stock, mostrar_marca, mostrar_rubro, mostrar_tipo,
                 habilitar_calculadora, descuento_1, descuento_2, descuento_3, iva,
                 orden_pdf, config_habilitada, pedir_clave, tamanio_hoja, items_por_hoja,
                 numero_pedido_inicio, habilitar_ctas_ctes, razon_social,
                 habilitar_demanda, habilitar_ofertas, habilitar_productos_solicitados,
                 habilitar_descuentos_por_cliente,
                 habilitar_lector_barras, habilitar_cross_selling, habilitar_mensajes,
                 habilitar_medios_de_pago, medios_de_pago, habilitar_notificaciones,
                 habilitar_calculadora_venta, habilitar_historial_ventas,
                 habilitar_cotizaciones, habilitar_novedades,
                 dto_pago_termino, precio_incluye_iva, permitir_presupuesto_clientes,
                 mostrar_detalle_calculo_precios`,
      [valor(mostrar_precios), valor(mostrar_stock), valor(mostrar_marca), valor(mostrar_rubro), valor(mostrar_tipo),
       valor(pedir_clave), valor(tamanio_hoja), valor(items_por_hoja), valor(numero_pedido_inicio),
       valor(habilitar_calculadora), valor(descuento_1), valor(descuento_2), valor(descuento_3), valor(iva),
       valor(orden_pdf), valor(habilitar_ctas_ctes), valor(habilitar_demanda), valor(habilitar_ofertas),
       valor(habilitar_productos_solicitados), valor(habilitar_medios_de_pago), valor(medios_de_pago),
       valor(habilitar_notificaciones), valor(dto_pago_termino), valor(precio_incluye_iva),
       valor(permitir_presupuesto_clientes), valor(mostrar_detalle_calculo_precios), id]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

router.get('/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    const hoy = new Date().toISOString().split('T')[0];
    const [pedidosHoy, sinImprimir, pedidosNuevos] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM pedidos_web WHERE mayorista_id=$1 AND estado!='borrador' AND DATE(fecha_pedido)=$2`, [id, hoy]),
      pool.query(`SELECT COUNT(*) FROM pedidos_web WHERE mayorista_id=$1 AND estado='enviado'`, [id]),
      pool.query(`SELECT id, numero_pedido, cliente_nombre, cliente_cuit, estado, fecha_pedido, total_estimado FROM pedidos_web WHERE mayorista_id=$1 AND estado='enviado' ORDER BY fecha_pedido DESC`, [id])
    ]);
    let totalProductos = 0, totalClientes = 0;
    try {
      const poolExterno = await getConexionMayorista(id);
      if (poolExterno) {
        const [prodRes, cliRes] = await Promise.all([
          poolExterno.query(`SELECT COUNT(*) FROM "viewProductos"`),
          poolExterno.query(`SELECT COUNT(*) FROM "viewClientes" WHERE es_activo=true`)
        ]);
        totalProductos = parseInt(prodRes.rows[0].count);
        totalClientes = parseInt(cliRes.rows[0].count);
      }
    } catch (e) { console.error('Error Ivan stats:', e.message); }
    res.json({
      stats: {
        pedidos_hoy: parseInt(pedidosHoy.rows[0].count),
        total_productos: totalProductos,
        total_clientes: totalClientes,
        pedidos_pendientes: parseInt(sinImprimir.rows[0].count)
      },
      ultimos_pedidos: pedidosNuevos.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

router.post('/:id/resetear-clave-cliente', async (req, res) => {
  try {
    const { id } = req.params;
    const { cuit } = req.body;
    if (!cuit) return res.status(400).json({ mensaje: 'Falta el CUIT' });
    const may = await pool.query('SELECT codigo FROM mayoristas WHERE id=$1', [id]);
    if (!may.rows[0]) return res.status(404).json({ mensaje: 'No encontrado' });
    const del = await pool.query('DELETE FROM claves_clientes WHERE mayorista_codigo=$1 AND cuit=$2', [may.rows[0].codigo, cuit]);
    res.json({ borradas: del.rowCount });
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

router.get('/:id/proximo-numero', async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener el contador actual y el MAX real de pedidos_web en paralelo
    const [contadorRes, maxRes] = await Promise.all([
      pool.query(`SELECT numero_pedido_inicio FROM mayoristas WHERE id=$1`, [id]),
      pool.query(
        `SELECT COALESCE(MAX(CAST(numero_pedido AS INTEGER)), 0) AS max_real
         FROM pedidos_web
         WHERE mayorista_id=$1
           AND numero_pedido ~ '^[0-9]+$'`,
        [id]
      ),
    ]);

    if (!contadorRes.rows[0]) return res.status(404).json({ mensaje: 'Mayorista no encontrado' });

    const contador = parseInt(contadorRes.rows[0].numero_pedido_inicio) || 1;
    const maxReal  = parseInt(maxRes.rows[0].max_real) || 0;

    // Vista previa solamente: consultar no debe consumir un número.
    const proximoNumero = Math.max(contador, maxReal + 1);

    res.json({ numero: proximoNumero });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

module.exports = router;
