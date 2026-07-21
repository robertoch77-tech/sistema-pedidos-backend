const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../../db');

router.post('/login', async (req, res) => {
  try {
    const { codigo, clave } = req.body;
    if (!codigo || !clave) {
      return res.status(400).json({ mensaje: 'Código y clave son requeridos' });
    }

    const result = await pool.query(
      `SELECT id, nombre_comercial, razon_social, cuit, condicion_iva,
              direccion_fiscal, ciudad_fiscal, provincia_fiscal, telefono, whatsapp,
              plan, estado, codigo_acceso, mayorista_id, password_hash,
              habilitar_sucursales, habilitar_empleados, arca_habilitado
       FROM clientes_roberto
       WHERE codigo_acceso = $1`,
      [codigo.trim()]
    );

    if (!result.rows[0]) {
      return res.status(401).json({ mensaje: 'Código o clave incorrectos' });
    }

    const cliente = result.rows[0];

    if (cliente.estado === 'suspendido') {
      return res.status(403).json({ mensaje: 'Cuenta suspendida. Contactá a tu administrador.' });
    }

    if (!cliente.password_hash) {
      return res.status(401).json({ mensaje: 'Acceso no configurado aún. Contactá a tu administrador.' });
    }

    const claveOk = bcrypt.compareSync(clave, cliente.password_hash);
    if (!claveOk) {
      return res.status(401).json({ mensaje: 'Código o clave incorrectos' });
    }

    const token = `rp_${cliente.id}_${Date.now()}`;

    res.json({
      ok: true,
      token,
      cliente: {
        id:                   cliente.id,
        nombre_comercial:     cliente.nombre_comercial,
        razon_social:         cliente.razon_social || cliente.nombre_comercial,
        cuit:                 cliente.cuit         || '',
        condicion_iva:        cliente.condicion_iva || '',
        direccion:            cliente.direccion_fiscal || '',
        ciudad:               cliente.ciudad_fiscal    || '',
        provincia:            cliente.provincia_fiscal || '',
        telefono:             cliente.telefono  || '',
        whatsapp:             cliente.whatsapp  || '',
        plan:                 cliente.plan,
        codigo_acceso:        cliente.codigo_acceso,
        mayorista_id:         cliente.mayorista_id,
        habilitar_sucursales: !!cliente.habilitar_sucursales,
        habilitar_empleados:  !!cliente.habilitar_empleados,
        arca_habilitado:      !!cliente.arca_habilitado,
      },
    });
  } catch (error) {
    console.error('Portal-auth POST /login error:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

module.exports = router;
