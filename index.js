const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const https = require('https');
const http = require('http');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Proxy de imágenes — resuelve Mixed Content (HTTP vs HTTPS)
app.get('/api/imagen', (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ mensaje: 'Falta la URL' });
    const urlDecoded = decodeURIComponent(url);
    const cliente = urlDecoded.startsWith('https') ? https : http;
    cliente.get(urlDecoded, (imgRes) => {
      res.setHeader('Content-Type', imgRes.headers['content-type'] || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      imgRes.pipe(res);
    }).on('error', () => {
      res.status(404).json({ mensaje: 'Imagen no encontrada' });
    });
  } catch (error) {
    console.error('Error proxy imagen:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// Rutas
app.use('/api/auth', require('./routes/auth'));
app.use('/api/mayoristas', require('./routes/mayoristas'));
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/productos', require('./routes/productos'));
app.use('/api/pedidos', require('./routes/pedidos'));
app.use('/api/admin', require('./routes/admin'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});