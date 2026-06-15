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

    const intentar = (urlActual, alternativas) => {
      const cliente = urlActual.startsWith('https') ? https : http;
      const reqImg = cliente.get(urlActual, (imgRes) => {
        if (imgRes.statusCode === 200) {
          res.setHeader('Content-Type', imgRes.headers['content-type'] || 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          imgRes.pipe(res);
        } else {
          imgRes.resume();
          if (alternativas.length > 0) {
            intentar(alternativas[0], alternativas.slice(1));
          } else {
            res.status(404).json({ mensaje: 'Imagen no encontrada' });
          }
        }
      });
      reqImg.on('error', () => {
        if (alternativas.length > 0) {
          intentar(alternativas[0], alternativas.slice(1));
        } else {
          res.status(404).json({ mensaje: 'Imagen no encontrada' });
        }
      });
    };

    const urlDecoded = decodeURIComponent(url);
    const alternativas = [];

    if (urlDecoded.startsWith('https://')) {
      alternativas.push(urlDecoded.replace('https://', 'http://'));
    }
    if (urlDecoded.includes('://www.')) {
      alternativas.push(urlDecoded.replace('://www.', '://'));
      if (urlDecoded.startsWith('https://')) {
        alternativas.push(urlDecoded.replace('https://www.', 'http://'));
      }
    }

    intentar(urlDecoded, alternativas);

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
app.use('/api/demanda', require('./routes/demanda'));
app.use('/api/ofertas', require('./routes/ofertas'));
app.use('/api/productos-solicitados', require('./routes/productos-solicitados'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});