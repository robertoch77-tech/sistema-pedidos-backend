const express = require('express');
const router = express.Router();
const pool = require('../../db');

const TABLAS_CRITICAS = [
  'clientes',
  'superadmin_usuarios',
  'config_negocio',
  'productos_propios',
  'proveedores',
  'ventas',
  'ventas_items',
  'ventas_pagos',
  'presupuestos',
  'presupuestos_items',
  'remitos',
  'remitos_items',
  'compras',
  'compras_items',
  'caja',
  'cajas',
  'caja_movimientos',
  'cuentas_corrientes_clientes',
  'cuentas_corrientes_clientes_movimientos',
  'cuentas_corrientes_proveedores',
  'cuentas_corrientes_proveedores_movimientos',
  'cheques',
  'stock',
  'stock_movimientos',
  'clientes_roberto',
  'clientes_roberto_contactos',
  'clientes_roberto_sucursales',
  'clientes_roberto_pagos',
  'vehiculos',
  'ventas_autos',
  'socios_autos',
  'gastos_fijos',
  'gastos_variables',
  'notas_credito',
  'notas_credito_items',
  'notas_debito',
  'notas_debito_items',
  'historial_cambios_productos',
  'importaciones_historial',
  'importaciones_detalle',
  'arca_comprobantes',
  'arca_configuracion',
  'catalogo_config',
  'catalogo_pedidos',
  'claves_clientes',
  'proveedores_mapeo_excel',
  'productos_propios_precios',
  'listas_precio',
  'mayoristas',
  'productos',
  'pedidos',
  'pedido_items',
  'pi_clientes',
  'pi_config',
  'pi_productos',
  'pi_pedidos',
  'pi_pedidos_items',
  'pi_usuarios',
  'pi_importaciones',
];

router.get('/backup', async (req, res) => {
  try {
    const { secret } = req.query;
    if (secret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ mensaje: 'Acceso denegado' });
    }

    const backup = {
      fecha: new Date().toISOString(),
      version: '1.0',
      tablas: {},
      resumen: {},
    };

    let totalRegistros = 0;

    for (const tabla of TABLAS_CRITICAS) {
      try {
        const result = await pool.query(`SELECT * FROM ${tabla}`);
        backup.tablas[tabla] = result.rows;
        backup.resumen[tabla] = result.rows.length;
        totalRegistros += result.rows.length;
      } catch (err) {
        backup.tablas[tabla] = [];
        backup.resumen[tabla] = `ERROR: ${err.message}`;
      }
    }

    backup.total_registros = totalRegistros;
    backup.total_tablas = TABLAS_CRITICAS.length;

    const fecha = new Date().toISOString().slice(0, 10);
    const hora = new Date().toISOString().slice(11, 16).replace(':', '');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="backup-${fecha}-${hora}.json"`);
    res.json(backup);
  } catch (err) {
    console.error('GET /backup error:', err.message);
    res.status(500).json({ mensaje: 'Error al generar backup', detalle: err.message });
  }
});

router.get('/backup/resumen', async (req, res) => {
  try {
    const { secret } = req.query;
    if (secret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ mensaje: 'Acceso denegado' });
    }

    const resumen = {};
    let total = 0;

    for (const tabla of TABLAS_CRITICAS) {
      try {
        const result = await pool.query(`SELECT COUNT(*) FROM ${tabla}`);
        const count = parseInt(result.rows[0].count);
        resumen[tabla] = count;
        total += count;
      } catch (err) {
        resumen[tabla] = `ERROR: ${err.message}`;
      }
    }

    res.json({
      ok: true,
      fecha: new Date().toISOString(),
      total_registros: total,
      total_tablas: TABLAS_CRITICAS.length,
      tablas: resumen,
    });
  } catch (err) {
    console.error('GET /backup/resumen error:', err.message);
    res.status(500).json({ mensaje: 'Error al generar resumen', detalle: err.message });
  }
});

module.exports = router;
