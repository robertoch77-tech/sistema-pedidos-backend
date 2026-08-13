const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');

const checkAdmin = (req, res, next) => {
  const secret = req.headers['x-admin-secret'];
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ mensaje: 'No autorizado' });
  }
  next();
};

// GET — listar todos
router.get('/mayoristas', checkAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      // === MODIFICADO: se agregaron los flags nuevos (Módulo 9) ===
      `SELECT id, nombre, email, codigo, activo, config_habilitada, db_connection, ivan_activo,
              habilitar_ctas_ctes, razon_social, habilitar_demanda, habilitar_ofertas,
              habilitar_productos_solicitados, habilitar_descuentos_por_cliente,
              habilitar_banners, habilitar_mensajes, habilitar_notificaciones, habilitar_cotizaciones,
              habilitar_pedido_sugerido, habilitar_cross_selling, habilitar_lector_barras,
              habilitar_mis_promociones, habilitar_estados_avanzados, habilitar_medios_de_pago,
              habilitar_analiticas, dto_pago_termino
       FROM mayoristas
       WHERE (tipo_fuente IS NULL OR tipo_fuente != 'roberto')
       ORDER BY nombre`
    );
    res.json(resultado.rows);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

// POST — crear (también usado por "Clonar mayorista" en el frontend)
router.post('/mayoristas', checkAdmin, async (req, res) => {
  try {
    const { nombre, email, codigo, db_connection, clave_inicial } = req.body;
    if (!nombre || !email || !codigo || !clave_inicial)
      return res.status(400).json({ mensaje: 'Faltan campos obligatorios' });
    const existe = await pool.query(
      'SELECT id FROM mayoristas WHERE codigo=$1 OR email=$2',
      [codigo.toLowerCase(), email.toLowerCase()]
    );
    if (existe.rows.length > 0)
      return res.status(400).json({ mensaje: 'Ya existe un mayorista con ese código o email' });
    const password = await bcrypt.hash(clave_inicial, 10);
    const resultado = await pool.query(
      // === MODIFICADO: se agregaron los flags nuevos (Módulo 9), todos arrancan en false ===
      `INSERT INTO mayoristas
         (nombre, email, password, codigo, db_connection, activo, config_habilitada,
          mostrar_precios, mostrar_stock, mostrar_marca, mostrar_rubro, mostrar_tipo,
          pedir_clave, tamanio_hoja, items_por_hoja, numero_pedido_inicio,
          habilitar_calculadora, descuento_1, descuento_2, descuento_3, iva, orden_pdf,
          ivan_activo, habilitar_ctas_ctes, habilitar_demanda, habilitar_ofertas,
          habilitar_productos_solicitados, habilitar_descuentos_por_cliente,
          habilitar_banners, habilitar_mensajes, habilitar_notificaciones, habilitar_cotizaciones,
          habilitar_pedido_sugerido, habilitar_cross_selling, habilitar_lector_barras,
          habilitar_mis_promociones, habilitar_estados_avanzados, habilitar_medios_de_pago,
          habilitar_analiticas, dto_pago_termino)
       VALUES ($1,$2,$3,$4,$5,true,false,true,true,true,true,true,false,'A4',30,1,false,0,0,0,21,'codigo',
               false,false,false,false,false,false,
               false,false,false,false,false,false,false,false,false,false,false,0)
       RETURNING id, nombre, email, codigo`,
      [nombre.trim(), email.trim().toLowerCase(), password, codigo.trim().toLowerCase(), db_connection || '']
    );
    res.json({ mayorista: resultado.rows[0], link_cliente: `/?m=${codigo.trim().toLowerCase()}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al crear el mayorista' });
  }
});

// PUT — editar datos (nombre, email, db_connection, razon_social)
router.put('/mayoristas/:id/datos', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, email, db_connection, razon_social } = req.body;
    if (!nombre || !email)
      return res.status(400).json({ mensaje: 'Nombre y email son obligatorios' });
    const resultado = await pool.query(
      `UPDATE mayoristas SET nombre=$1, email=$2, db_connection=$3, razon_social=$4
       WHERE id=$5 RETURNING id, nombre, email, codigo, activo, config_habilitada, db_connection, razon_social`,
      [nombre.trim(), email.trim().toLowerCase(), db_connection || '', razon_social || null, id]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al actualizar' });
  }
});

// PUT — toggle activo
router.put('/mayoristas/:id/toggle', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET activo = NOT activo WHERE id=$1 RETURNING id, nombre, activo', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

// PUT — toggle config_habilitada
router.put('/mayoristas/:id/toggle-config', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET config_habilitada = NOT config_habilitada WHERE id=$1 RETURNING id, nombre, config_habilitada', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

// PUT — toggle habilitar_ctas_ctes
router.put('/mayoristas/:id/toggle-ctas-ctes', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET habilitar_ctas_ctes = NOT habilitar_ctas_ctes WHERE id=$1 RETURNING id, nombre, habilitar_ctas_ctes', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

// PUT — toggle habilitar_demanda
router.put('/mayoristas/:id/toggle-demanda', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET habilitar_demanda = NOT habilitar_demanda WHERE id=$1 RETURNING id, nombre, habilitar_demanda', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

// PUT — toggle habilitar_ofertas
router.put('/mayoristas/:id/toggle-ofertas', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET habilitar_ofertas = NOT habilitar_ofertas WHERE id=$1 RETURNING id, nombre, habilitar_ofertas', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

// PUT — toggle habilitar_productos_solicitados
router.put('/mayoristas/:id/toggle-productos-solicitados', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET habilitar_productos_solicitados = NOT habilitar_productos_solicitados WHERE id=$1 RETURNING id, nombre, habilitar_productos_solicitados', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

// === NUEVO (Módulo 9): toggles de los flags preparados para futuros módulos ===
// Todos siguen el mismo patrón UPDATE...SET campo = NOT campo. Ver SQL de migración
// al final de este archivo (en comentario) para las columnas que hay que crear en Supabase.

router.put('/mayoristas/:id/toggle-descuentos-cliente', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET habilitar_descuentos_por_cliente = NOT habilitar_descuentos_por_cliente WHERE id=$1 RETURNING id, nombre, habilitar_descuentos_por_cliente', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

router.put('/mayoristas/:id/toggle-banners', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET habilitar_banners = NOT habilitar_banners WHERE id=$1 RETURNING id, nombre, habilitar_banners', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

router.put('/mayoristas/:id/toggle-mensajes', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET habilitar_mensajes = NOT habilitar_mensajes WHERE id=$1 RETURNING id, nombre, habilitar_mensajes', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

router.put('/mayoristas/:id/toggle-notificaciones', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET habilitar_notificaciones = NOT habilitar_notificaciones WHERE id=$1 RETURNING id, nombre, habilitar_notificaciones', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

router.put('/mayoristas/:id/toggle-cotizaciones', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET habilitar_cotizaciones = NOT habilitar_cotizaciones WHERE id=$1 RETURNING id, nombre, habilitar_cotizaciones', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

router.put('/mayoristas/:id/toggle-novedades', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET habilitar_novedades = NOT habilitar_novedades WHERE id=$1 RETURNING id, nombre, habilitar_novedades', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

router.put('/mayoristas/:id/toggle-pedido-sugerido', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET habilitar_pedido_sugerido = NOT habilitar_pedido_sugerido WHERE id=$1 RETURNING id, nombre, habilitar_pedido_sugerido', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

router.put('/mayoristas/:id/toggle-cross-selling', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET habilitar_cross_selling = NOT habilitar_cross_selling WHERE id=$1 RETURNING id, nombre, habilitar_cross_selling', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

router.put('/mayoristas/:id/toggle-lector-barras', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET habilitar_lector_barras = NOT habilitar_lector_barras WHERE id=$1 RETURNING id, nombre, habilitar_lector_barras', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

router.put('/mayoristas/:id/toggle-mis-promociones', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET habilitar_mis_promociones = NOT habilitar_mis_promociones WHERE id=$1 RETURNING id, nombre, habilitar_mis_promociones', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

router.put('/mayoristas/:id/toggle-estados-avanzados', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET habilitar_estados_avanzados = NOT habilitar_estados_avanzados WHERE id=$1 RETURNING id, nombre, habilitar_estados_avanzados', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

router.put('/mayoristas/:id/toggle-medios-de-pago', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET habilitar_medios_de_pago = NOT habilitar_medios_de_pago WHERE id=$1 RETURNING id, nombre, habilitar_medios_de_pago', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

router.put('/mayoristas/:id/toggle-analiticas', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET habilitar_analiticas = NOT habilitar_analiticas WHERE id=$1 RETURNING id, nombre, habilitar_analiticas', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

// GET — obtener configuración Ivan
router.get('/mayoristas/:id/ivan', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      `SELECT ivan_activo, ivan_id_deposito, ivan_id_operario, ivan_id_vendedor,
              ivan_id_tipo_pedido, ivan_id_sucursal, ivan_porc_iva, ivan_id_condicion_venta
       FROM mayoristas WHERE id=$1`,
      [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// === NUEVO: descuentos propios por cliente ===

// GET — clientes con descuentos propios de un mayorista (lee claves_clientes)
router.get('/mayoristas/:id/clientes-descuentos', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const may = await pool.query('SELECT codigo FROM mayoristas WHERE id=$1', [id]);
    if (!may.rows[0]) return res.status(404).json({ mensaje: 'Mayorista no encontrado' });
    const resultado = await pool.query(
      `SELECT cuit, descuento_1, descuento_2, descuento_3
       FROM claves_clientes WHERE mayorista_codigo=$1 ORDER BY cuit`,
      [may.rows[0].codigo]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// PUT — asignar/editar descuentos propios de un cliente (crea la fila si no existe)
router.put('/clientes/:mayorista_codigo/:cuit/descuentos', checkAdmin, async (req, res) => {
  try {
    const { mayorista_codigo, cuit } = req.params;
    const { descuento_1, descuento_2, descuento_3 } = req.body;
    const upd = await pool.query(
      `UPDATE claves_clientes SET descuento_1=$1, descuento_2=$2, descuento_3=$3
       WHERE mayorista_codigo=$4 AND cuit=$5
       RETURNING cuit, descuento_1, descuento_2, descuento_3`,
      [descuento_1 ?? null, descuento_2 ?? null, descuento_3 ?? null, mayorista_codigo, cuit]
    );
    if (upd.rows[0]) return res.json(upd.rows[0]);
    // El cliente todavía no tiene fila en claves_clientes (nunca registró clave)
    const ins = await pool.query(
      `INSERT INTO claves_clientes (mayorista_codigo, cuit, descuento_1, descuento_2, descuento_3)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING cuit, descuento_1, descuento_2, descuento_3`,
      [mayorista_codigo, cuit, descuento_1 ?? null, descuento_2 ?? null, descuento_3 ?? null]
    );
    res.json(ins.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al guardar descuentos del cliente' });
  }
});

// PUT — guardar configuración Ivan
router.put('/mayoristas/:id/ivan', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { ivan_activo, ivan_id_deposito, ivan_id_operario, ivan_id_vendedor,
            ivan_id_tipo_pedido, ivan_id_sucursal, ivan_porc_iva, ivan_id_condicion_venta } = req.body;
    const resultado = await pool.query(
      `UPDATE mayoristas
       SET ivan_activo=$1, ivan_id_deposito=$2, ivan_id_operario=$3, ivan_id_vendedor=$4,
           ivan_id_tipo_pedido=$5, ivan_id_sucursal=$6, ivan_porc_iva=$7, ivan_id_condicion_venta=$8
       WHERE id=$9
       RETURNING id, nombre, ivan_activo, ivan_id_deposito, ivan_id_operario, ivan_id_vendedor,
                 ivan_id_tipo_pedido, ivan_id_sucursal, ivan_porc_iva, ivan_id_condicion_venta`,
      [ivan_activo||false, ivan_id_deposito||1, ivan_id_operario||null, ivan_id_vendedor||null,
       ivan_id_tipo_pedido||1, ivan_id_sucursal||1, ivan_porc_iva||21,
       ivan_id_condicion_venta||null, id]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al guardar configuración Ivan' });
  }
});

// === NUEVO (Módulo 3 / tab 👥 Clientes): clientes registrados del mayorista ===
// Lee/borra únicamente filas de claves_clientes (Supabase). NO toca Ivan, NO toca
// pedidos existentes, NO toca la conexión db_connection del mayorista.

// GET — clientes registrados (CUIT + fecha de registro)
router.get('/mayoristas/:id/clientes-registrados', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const may = await pool.query('SELECT codigo FROM mayoristas WHERE id=$1', [id]);
    if (!may.rows[0]) return res.status(404).json({ mensaje: 'Mayorista no encontrado' });
    const resultado = await pool.query(
      `SELECT cuit, creada_en FROM claves_clientes WHERE mayorista_codigo=$1 ORDER BY creada_en DESC NULLS LAST`,
      [may.rows[0].codigo]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// DELETE — elimina el acceso de un cliente (solo la fila de claves_clientes)
router.delete('/clientes/:mayorista_codigo/:cuit', checkAdmin, async (req, res) => {
  try {
    const { mayorista_codigo, cuit } = req.params;
    const del = await pool.query(
      'DELETE FROM claves_clientes WHERE mayorista_codigo=$1 AND cuit=$2',
      [mayorista_codigo, cuit]
    );
    res.json({ borradas: del.rowCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// === NUEVO (Módulo 2): regenerar código de acceso — función de emergencia ===
// Solo actualiza mayoristas.codigo. NO toca db_connection, NO toca claves_clientes,
// NO toca ninguna otra tabla. El frontend exige doble confirmación antes de llamar esto.
router.put('/mayoristas/:id/regenerar-codigo', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const actual = await pool.query('SELECT nombre FROM mayoristas WHERE id=$1', [id]);
    if (!actual.rows[0]) return res.status(404).json({ mensaje: 'Mayorista no encontrado' });
    const base = actual.rows[0].nombre
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
    const nuevoCodigo = `${base}_${Date.now()}`;
    const resultado = await pool.query(
      'UPDATE mayoristas SET codigo=$1 WHERE id=$2 RETURNING id, nombre, codigo',
      [nuevoCodigo, id]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al regenerar el código' });
  }
});

// === NUEVO (Módulo 6): cambiar la clave de administrador ===
// Se guarda solo en memoria (process.env.ADMIN_SECRET) — se pierde al reiniciar
// el servidor. Para hacerla permanente hay que actualizar la variable de entorno
// ADMIN_SECRET en Render.
router.put('/cambiar-clave', checkAdmin, async (req, res) => {
  try {
    const { clave_actual, clave_nueva } = req.body;
    if (!clave_actual || !clave_nueva)
      return res.status(400).json({ mensaje: 'Faltan la clave actual y la clave nueva' });
    if (clave_actual !== process.env.ADMIN_SECRET)
      return res.status(401).json({ mensaje: 'La clave actual es incorrecta' });
    if (clave_nueva.length < 4)
      return res.status(400).json({ mensaje: 'La clave nueva es demasiado corta' });
    process.env.ADMIN_SECRET = clave_nueva;
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al cambiar la clave' });
  }
});

// === NUEVO (Módulo 8): analytics de uso por mayorista ===
// Consulta únicamente tablas de Supabase (pedidos_web, pedidos_web_items,
// claves_clientes, demanda_no_satisfecha). NO toca Ivan.
router.get('/mayoristas/:id/analytics', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const may = await pool.query('SELECT codigo FROM mayoristas WHERE id=$1', [id]);
    if (!may.rows[0]) return res.status(404).json({ mensaje: 'Mayorista no encontrado' });
    const codigo = may.rows[0].codigo;

    const [
      totalPedidos, pedidosEsteMes, pedidosMesPasado, totalClientes,
      ultimoPedido, demandaEsteMes, productoTop
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM pedidos_web WHERE mayorista_id=$1 AND estado != 'borrador'`, [id]),
      pool.query(
        `SELECT COUNT(*) FROM pedidos_web
         WHERE mayorista_id=$1 AND estado != 'borrador'
         AND date_trunc('month', fecha_pedido) = date_trunc('month', now())`, [id]),
      pool.query(
        `SELECT COUNT(*) FROM pedidos_web
         WHERE mayorista_id=$1 AND estado != 'borrador'
         AND date_trunc('month', fecha_pedido) = date_trunc('month', now() - interval '1 month')`, [id]),
      pool.query(`SELECT COUNT(*) FROM claves_clientes WHERE mayorista_codigo=$1`, [codigo]),
      pool.query(
        `SELECT MAX(fecha_pedido) AS fecha FROM pedidos_web
         WHERE mayorista_id=$1 AND estado != 'borrador'`, [id]),
      pool.query(
        `SELECT COUNT(*) FROM demanda_no_satisfecha
         WHERE mayorista_id=$1 AND date_trunc('month', fecha) = date_trunc('month', now())`, [id]),
      pool.query(
        `SELECT pi.nombre, SUM(pi.cantidad) AS total
         FROM pedidos_web_items pi
         JOIN pedidos_web p ON p.id = pi.pedido_id
         WHERE p.mayorista_id=$1 AND p.estado != 'borrador' AND pi.nombre IS NOT NULL AND pi.nombre != ''
         GROUP BY pi.nombre
         ORDER BY total DESC
         LIMIT 1`, [id]),
    ]);

    res.json({
      total_pedidos: parseInt(totalPedidos.rows[0].count),
      pedidos_este_mes: parseInt(pedidosEsteMes.rows[0].count),
      pedidos_mes_pasado: parseInt(pedidosMesPasado.rows[0].count),
      total_clientes: parseInt(totalClientes.rows[0].count),
      ultimo_pedido: ultimoPedido.rows[0]?.fecha || null,
      demanda_este_mes: parseInt(demandaEsteMes.rows[0].count),
      producto_mas_pedido: productoTop.rows[0]?.nombre || null,
      producto_mas_pedido_cantidad: productoTop.rows[0] ? parseInt(productoTop.rows[0].total) : 0,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// === NUEVO (Módulo 10): limpiar datos de prueba de un mayorista ===
// Borra en orden estricto para respetar foreign keys, dentro de una transacción
// (todo-o-nada). NO toca la tabla mayoristas ni su configuración, NO toca Ivan,
// NO toca el código de acceso (?m=codigo) — solo borra pedidos, clientes
// (claves_clientes), demanda no satisfecha y consultas de ofertas de ESTE
// mayorista. Las ofertas en sí (tabla ofertas/ofertas_items) no se tocan.
router.delete('/mayoristas/:id/limpiar-pruebas', checkAdmin, async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    const may = await client.query('SELECT codigo FROM mayoristas WHERE id=$1', [id]);
    if (!may.rows[0]) {
      client.release();
      return res.status(404).json({ mensaje: 'Mayorista no encontrado' });
    }
    const codigo = may.rows[0].codigo;

    await client.query('BEGIN');

    // 1. pedidos_web_items (depende de pedidos_web via pedido_id)
    const items = await client.query(
      `DELETE FROM pedidos_web_items WHERE pedido_id IN (SELECT id FROM pedidos_web WHERE mayorista_id=$1)`,
      [id]
    );
    // 2. pedidos_web
    const pedidos = await client.query('DELETE FROM pedidos_web WHERE mayorista_id=$1', [id]);
    // 3. claves_clientes (por código, no toca la tabla mayoristas)
    const clientes = await client.query('DELETE FROM claves_clientes WHERE mayorista_codigo=$1', [codigo]);
    // 4. demanda_no_satisfecha
    const demanda = await client.query('DELETE FROM demanda_no_satisfecha WHERE mayorista_id=$1', [id]);
    // 5. ofertas_consultas (solo las consultas, no las ofertas en sí)
    const consultas = await client.query('DELETE FROM ofertas_consultas WHERE mayorista_id=$1', [id]);

    await client.query('COMMIT');

    res.json({
      pedidos_items_eliminados: items.rowCount,
      pedidos_eliminados: pedidos.rowCount,
      clientes_eliminados: clientes.rowCount,
      demanda_eliminada: demanda.rowCount,
      consultas_eliminadas: consultas.rowCount,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Error al limpiar datos de prueba:', error.message);
    res.status(500).json({ mensaje: 'Error al limpiar datos de prueba' });
  } finally {
    client.release();
  }
});

module.exports = router;

/*
=====================================================================
SQL PARA SUPABASE — generado, NO ejecutado. Ejecutar manualmente en
Supabase → SQL Editor antes de deployar esta rama, o varios endpoints
de arriba fallarán (columnas inexistentes).
=====================================================================

-- Módulo 9: flags nuevos en mayoristas. Todos arrancan en false, así
-- que los mayoristas existentes no ganan ninguna función nueva sola.
ALTER TABLE mayoristas ADD COLUMN IF NOT EXISTS habilitar_descuentos_por_cliente boolean DEFAULT false;
ALTER TABLE mayoristas ADD COLUMN IF NOT EXISTS habilitar_banners boolean DEFAULT false;
ALTER TABLE mayoristas ADD COLUMN IF NOT EXISTS habilitar_mensajes boolean DEFAULT false;
ALTER TABLE mayoristas ADD COLUMN IF NOT EXISTS habilitar_notificaciones boolean DEFAULT false;
ALTER TABLE mayoristas ADD COLUMN IF NOT EXISTS habilitar_cotizaciones boolean DEFAULT false;
ALTER TABLE mayoristas ADD COLUMN IF NOT EXISTS habilitar_pedido_sugerido boolean DEFAULT false;
ALTER TABLE mayoristas ADD COLUMN IF NOT EXISTS habilitar_cross_selling boolean DEFAULT false;
ALTER TABLE mayoristas ADD COLUMN IF NOT EXISTS habilitar_lector_barras boolean DEFAULT false;
ALTER TABLE mayoristas ADD COLUMN IF NOT EXISTS habilitar_mis_promociones boolean DEFAULT false;
ALTER TABLE mayoristas ADD COLUMN IF NOT EXISTS habilitar_estados_avanzados boolean DEFAULT false;
ALTER TABLE mayoristas ADD COLUMN IF NOT EXISTS habilitar_medios_de_pago boolean DEFAULT false;
ALTER TABLE mayoristas ADD COLUMN IF NOT EXISTS habilitar_analiticas boolean DEFAULT false;

-- Tab 🎁 Descuentos: descuentos propios por cliente (23 registros existentes
-- quedan en NULL = "sin descuentos propios", sin cambio de comportamiento)
ALTER TABLE claves_clientes ADD COLUMN IF NOT EXISTS descuento_1 numeric DEFAULT NULL;
ALTER TABLE claves_clientes ADD COLUMN IF NOT EXISTS descuento_2 numeric DEFAULT NULL;
ALTER TABLE claves_clientes ADD COLUMN IF NOT EXISTS descuento_3 numeric DEFAULT NULL;
-- Necesario para poder asignar descuentos a clientes que nunca registraron clave
-- (el endpoint PUT /clientes/:mayorista_codigo/:cuit/descuentos crea la fila sin clave)
ALTER TABLE claves_clientes ALTER COLUMN clave DROP NOT NULL;

-- Tab 👥 Clientes: fecha de registro. Los registros existentes quedan con la
-- fecha de HOY (no hay forma de recuperar la fecha real de alta retroactivamente).
ALTER TABLE claves_clientes ADD COLUMN IF NOT EXISTS creada_en timestamptz DEFAULT now();
*/
