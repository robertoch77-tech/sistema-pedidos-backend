const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const resultado = await pool.query(
      'SELECT * FROM mayoristas WHERE email = $1 AND activo = true',
      [email]
    );
    if (resultado.rows.length === 0) {
      return res.status(401).json({ mensaje: 'Email o contraseña incorrectos' });
    }
    const mayorista = resultado.rows[0];
    const passwordValida = await bcrypt.compare(password, mayorista.password);
    if (!passwordValida) {
      return res.status(401).json({ mensaje: 'Email o contraseña incorrectos' });
    }
    const token = jwt.sign(
      { id: mayorista.id, email: mayorista.email },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({
      token,
      mayorista: {
        id: mayorista.id,
        nombre: mayorista.nombre,
        email: mayorista.email,
        mostrar_precios: mayorista.mostrar_precios,
        mostrar_stock: mayorista.mostrar_stock,
        tamanio_hoja: mayorista.tamanio_hoja,
        items_por_hoja: mayorista.items_por_hoja
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

router.post('/login-cliente', async (req, res) => {
  const { email, password } = req.body;
  try {
    const uc = await pool.query(
      'SELECT * FROM usuarios_clientes WHERE email = $1 AND activo = true',
      [email]
    );
    if (uc.rows.length === 0) {
      return res.status(401).json({ mensaje: 'Email o contraseña incorrectos' });
    }
    const usuario = uc.rows[0];
    const passwordValida = await bcrypt.compare(password, usuario.password);
    if (!passwordValida) {
      return res.status(401).json({ mensaje: 'Email o contraseña incorrectos' });
    }
    const cl = await pool.query(
      'SELECT * FROM clientes WHERE id = $1',
      [usuario.cliente_id]
    );
    const cliente = cl.rows[0];
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, tipo: 'cliente' },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({
      token,
      cliente: {
        id: usuario.cliente_id,
        nombre: cliente.nombre,
        mayorista_id: usuario.mayorista_id,
        ver_stock: cliente.ver_stock,
        ver_precios: cliente.ver_precios,
        descuento: cliente.descuento
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

module.exports = router;