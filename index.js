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
const bannersRouter = require('./routes/banners');
app.use('/api/banners', bannersRouter);
const mensajesRouter = require('./routes/mensajes');
app.use('/api/mensajes', mensajesRouter);
const notificacionesRouter = require('./routes/notificaciones');
app.use('/api/notificaciones', notificacionesRouter);
const historialRouter = require('./routes/historial');
app.use('/api/historial', historialRouter);
const novedadesRouter = require('./routes/novedades');
app.use('/api/novedades', novedadesRouter);
app.use('/api/superadmin', require('./routes/superadmin/auth'));
app.use('/api/superadmin/clientes', require('./routes/superadmin/clientes'));
app.use('/api/superadmin/portal', require('./routes/superadmin/portal'));
app.use('/api/superadmin/portal-auth', require('./routes/superadmin/portal-auth'));
app.use('/api/superadmin/importador', require('./routes/superadmin/importador'));
app.use('/api/superadmin/ventas', require('./routes/superadmin/ventas'));
app.use('/api/superadmin/clientes-finales', require('./routes/superadmin/clientes-finales'));
app.use('/api/superadmin/presupuestos', require('./routes/superadmin/presupuestos'));
app.use('/api/superadmin/remitos', require('./routes/superadmin/remitos'));
app.use('/api/superadmin/stock',       require('./routes/superadmin/stock'));
app.use('/api/superadmin/proveedores', require('./routes/superadmin/proveedores'));
app.use('/api/superadmin/cuenta-corriente', require('./routes/superadmin/cuenta-corriente'));
app.use('/api/superadmin/caja', require('./routes/superadmin/caja'));
app.use('/api/superadmin/cheques', require('./routes/superadmin/cheques'));
app.use('/api/superadmin/notas',   require('./routes/superadmin/notas'));
app.use('/api/superadmin/arca',    require('./routes/superadmin/arca'));
app.use('/api/superadmin/reportes', require('./routes/superadmin/reportes'));
app.use('/api/pi/auth',    require('./routes/pi/auth'));
app.use('/api/pi/importar', require('./routes/pi/importar'));
app.use('/api/pi/procesar', require('./routes/pi/procesar'));
app.use('/api/pi/pedidos',  require('./routes/pi/pedidos'));
app.use('/api/pi/config',   require('./routes/pi/config'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});