const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const pool    = require('../../db');
const { verificarCualquierToken } = require('./authMiddleware');

router.use(verificarCualquierToken);

const TABLAS_PERMITIDAS = {
  cuentas_corrientes_clientes: { col_cliente: 'cliente_id', label: 'cliente' },
  proveedores:                  { col_cliente: 'cliente_id', label: 'proveedor' },
  productos_propios:            { col_cliente: 'cliente_id', label: 'producto' },
  presupuestos:                 { col_cliente: 'cliente_id', label: 'presupuesto' },
  gastos_variables:             { col_cliente: 'cliente_id', label: 'gasto variable' },
  gastos_fijos:                 { col_cliente: 'cliente_id', label: 'gasto fijo' },
};

// POST /api/superadmin/eliminar-registro
router.post('/', async (req, res) => {
  const { tabla, id, clave_usuario, clave_superadmin, cliente_id } = req.body;
  const clave = clave_usuario || clave_superadmin;

  if (!tabla || !id || !clave || !cliente_id) {
    return res.status(400).json({ mensaje: 'Faltan datos requeridos' });
  }

  const config = TABLAS_PERMITIDAS[tabla];
  if (!config) {
    return res.status(400).json({ mensaje: 'Tabla no permitida para eliminación' });
  }

  try {
    const superCheck = await pool.query(
      `SELECT password_hash FROM clientes_roberto WHERE id = $1`,
      [cliente_id]
    );

    if (superCheck.rows.length === 0) {
      return res.status(403).json({ mensaje: 'Clave del usuario del sistema incorrecta' });
    }

    const claveOk = bcrypt.compareSync(clave, superCheck.rows[0].password_hash);
    if (!claveOk) {
      return res.status(403).json({ mensaje: 'Clave del usuario del sistema incorrecta' });
    }

    const existe = await pool.query(
      `SELECT id FROM ${tabla} WHERE id = $1 AND ${config.col_cliente} = $2`,
      [id, cliente_id]
    );

    if (existe.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Registro no encontrado' });
    }

    if (tabla === 'productos_propios') {
      const refs = await pool.query(
        'SELECT COUNT(*) AS cnt FROM ventas_items WHERE producto_id = $1', [id]
      );
      if (parseInt(refs.rows[0].cnt) > 0) {
        return res.status(400).json({
          mensaje: `No se puede eliminar: el producto tiene ${refs.rows[0].cnt} venta(s) asociada(s). Desactivalo en su lugar.`
        });
      }
    }

    await pool.query(
      `DELETE FROM ${tabla} WHERE id = $1 AND ${config.col_cliente} = $2`,
      [id, cliente_id]
    );

    res.json({ mensaje: `${config.label} eliminado correctamente`, id });
  } catch (err) {
    console.error('Error al eliminar registro:', err.message);
    res.status(500).json({ mensaje: 'Error al eliminar', detalle: err.message });
  }
});

module.exports = router;
