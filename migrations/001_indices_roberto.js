const pool = require('../db');

async function crearIndices() {
  const indices = [
    // productos_propios
    'CREATE INDEX IF NOT EXISTS idx_productos_cliente ON productos_propios(cliente_id)',
    'CREATE INDEX IF NOT EXISTS idx_productos_codigo ON productos_propios(cliente_id, codigo)',
    'CREATE INDEX IF NOT EXISTS idx_productos_proveedor ON productos_propios(cliente_id, proveedor_id)',
    'CREATE INDEX IF NOT EXISTS idx_productos_activo ON productos_propios(cliente_id, activo)',

    // ventas
    'CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas(cliente_id)',
    'CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(cliente_id, fecha)',
    'CREATE INDEX IF NOT EXISTS idx_ventas_estado ON ventas(cliente_id, estado)',

    // ventas_items
    'CREATE INDEX IF NOT EXISTS idx_ventas_items_venta ON ventas_items(venta_id)',
    'CREATE INDEX IF NOT EXISTS idx_ventas_items_producto ON ventas_items(producto_id)',

    // compras
    'CREATE INDEX IF NOT EXISTS idx_compras_cliente ON compras(cliente_id)',
    'CREATE INDEX IF NOT EXISTS idx_compras_proveedor ON compras(cliente_id, proveedor_id)',

    // caja_movimientos
    'CREATE INDEX IF NOT EXISTS idx_caja_mov_caja ON caja_movimientos(caja_id)',
    'CREATE INDEX IF NOT EXISTS idx_caja_mov_cliente ON caja_movimientos(cliente_id)',

    // movimientos_cuentas_corrientes
    'CREATE INDEX IF NOT EXISTS idx_mov_cc_cuenta ON movimientos_cuentas_corrientes(cuenta_corriente_id)',
    'CREATE INDEX IF NOT EXISTS idx_mov_cc_cliente ON movimientos_cuentas_corrientes(cliente_id)',

    // cuentas_corrientes_clientes
    'CREATE INDEX IF NOT EXISTS idx_cc_clientes_cliente ON cuentas_corrientes_clientes(cliente_id)',

    // proveedores
    'CREATE INDEX IF NOT EXISTS idx_proveedores_cliente ON proveedores(cliente_id)',

    // vehiculos
    'CREATE INDEX IF NOT EXISTS idx_vehiculos_cliente ON vehiculos(cliente_id)',
    'CREATE INDEX IF NOT EXISTS idx_vehiculos_estado ON vehiculos(cliente_id, estado)',

    // ventas_autos
    'CREATE INDEX IF NOT EXISTS idx_ventas_autos_cliente ON ventas_autos(cliente_id)',

    // catalogo_pedidos
    'CREATE INDEX IF NOT EXISTS idx_cat_pedidos_cliente ON catalogo_pedidos(cliente_id)',
    'CREATE INDEX IF NOT EXISTS idx_cat_pedidos_estado ON catalogo_pedidos(cliente_id, estado)',
  ];

  console.log('Creando índices...');
  for (const sql of indices) {
    try {
      await pool.query(sql);
      console.log('✅ ' + sql.match(/idx_\w+/)[0]);
    } catch (err) {
      console.error('❌ Error:', err.message);
    }
  }
  console.log('Índices completados.');
  process.exit(0);
}

crearIndices();
