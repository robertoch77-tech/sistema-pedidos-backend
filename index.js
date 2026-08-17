const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const https = require('https');
const http = require('http');

dotenv.config();

const pool = require('./db');

const crearIndices = async () => {
  const indices = [
    'CREATE INDEX IF NOT EXISTS idx_productos_cliente ON productos_propios(cliente_id)',
    'CREATE INDEX IF NOT EXISTS idx_productos_codigo ON productos_propios(cliente_id, codigo)',
    'CREATE INDEX IF NOT EXISTS idx_productos_proveedor ON productos_propios(cliente_id, proveedor_id)',
    'CREATE INDEX IF NOT EXISTS idx_productos_activo ON productos_propios(cliente_id, activo)',
    'CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas(cliente_id)',
    'CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(cliente_id, fecha)',
    'CREATE INDEX IF NOT EXISTS idx_ventas_estado ON ventas(cliente_id, estado)',
    'CREATE INDEX IF NOT EXISTS idx_ventas_items_venta ON ventas_items(venta_id)',
    'CREATE INDEX IF NOT EXISTS idx_ventas_items_producto ON ventas_items(producto_id)',
    'CREATE INDEX IF NOT EXISTS idx_compras_cliente ON compras(cliente_id)',
    'CREATE INDEX IF NOT EXISTS idx_compras_proveedor ON compras(cliente_id, proveedor_id)',
    'CREATE INDEX IF NOT EXISTS idx_caja_mov_caja ON caja_movimientos(caja_id)',
    'CREATE INDEX IF NOT EXISTS idx_caja_mov_cliente ON caja_movimientos(cliente_id)',
    'CREATE INDEX IF NOT EXISTS idx_mov_cc_cuenta ON movimientos_cuentas_corrientes(cuenta_corriente_id)',
    'CREATE INDEX IF NOT EXISTS idx_mov_cc_cliente ON movimientos_cuentas_corrientes(cliente_id)',
    'CREATE INDEX IF NOT EXISTS idx_cc_clientes_cliente ON cuentas_corrientes_clientes(cliente_id)',
    'CREATE INDEX IF NOT EXISTS idx_proveedores_cliente ON proveedores(cliente_id)',
    'CREATE INDEX IF NOT EXISTS idx_vehiculos_cliente ON vehiculos(cliente_id)',
    'CREATE INDEX IF NOT EXISTS idx_vehiculos_estado ON vehiculos(cliente_id, estado)',
    'CREATE INDEX IF NOT EXISTS idx_ventas_autos_cliente ON ventas_autos(cliente_id)',
    'CREATE INDEX IF NOT EXISTS idx_cat_pedidos_cliente ON catalogo_pedidos(cliente_id)',
    'CREATE INDEX IF NOT EXISTS idx_cat_pedidos_estado ON catalogo_pedidos(cliente_id, estado)',
  ];
  for (const sql of indices) {
    await pool.query(sql).catch(err =>
      console.error('Índice error:', err.message));
  }
  console.log('✅ Índices verificados');
};

crearIndices();

;(async () => {
  await pool.query(`ALTER TABLE mayoristas ADD COLUMN IF NOT EXISTS dto_pago_termino NUMERIC DEFAULT 0`).catch(() => {});
})();

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
}));

app.use(cors({
  origin: [
    'https://sistemagestionpedidos.netlify.app',
    'http://localhost:3000'
  ],
  credentials: true,
}));
app.use(express.json());

app.use(mongoSanitize());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.set('trust proxy', 1);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Esperá 15 minutos.' },
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 200,
  message: { error: 'Demasiadas solicitudes. Intentá en un momento.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (res.statusCode >= 400 || duration > 5000) {
      console.warn(`[SECURITY] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms) IP:${req.ip}`);
    }
  });
  next();
});

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
app.use('/api/superadmin/auth/login', loginLimiter);
app.use('/api/superadmin/portal-auth/login', loginLimiter);
app.use('/api/superadmin', require('./routes/superadmin/auth'));
app.use('/api/superadmin/clientes', require('./routes/superadmin/clientes'));
app.use('/api/superadmin/portal', require('./routes/superadmin/portal'));
app.use('/api/superadmin/portal-auth', require('./routes/superadmin/portal-auth'));
app.use('/api/superadmin/importador', require('./routes/superadmin/importador'));
app.use('/api/superadmin/importador-entidades', require('./routes/superadmin/importador-entidades'));
app.use('/api/superadmin/eliminar-registro',   require('./routes/superadmin/eliminar-registro'));
app.use('/api/superadmin/gestion-claves',      require('./routes/superadmin/gestion-claves'));
app.use('/api/superadmin/ventas', require('./routes/superadmin/ventas'));
app.use('/api/superadmin/clientes-finales', require('./routes/superadmin/clientes-finales'));
app.use('/api/superadmin/presupuestos', require('./routes/superadmin/presupuestos'));
app.use('/api/superadmin/remitos', require('./routes/superadmin/remitos'));
app.use('/api/superadmin/stock',       require('./routes/superadmin/stock'));
app.use('/api/superadmin/proveedores', require('./routes/superadmin/proveedores'));
app.use('/api/superadmin/compras',    require('./routes/superadmin/compras'));
app.use('/api/superadmin/cuenta-corriente', require('./routes/superadmin/cuenta-corriente'));
app.use('/api/superadmin/caja', require('./routes/superadmin/caja'));
app.use('/api/superadmin/cheques', require('./routes/superadmin/cheques'));
app.use('/api/superadmin/notas',   require('./routes/superadmin/notas'));
app.use('/api/superadmin/arca',    require('./routes/superadmin/arca'));
app.use('/api/superadmin/reportes', require('./routes/superadmin/reportes'));
app.use('/api/superadmin/gastos',  require('./routes/superadmin/gastos'));
app.use('/api/superadmin/autos',   require('./routes/superadmin/autos'));
app.use('/api/superadmin/config',  require('./routes/superadmin/config'));
app.use('/api/pago',               require('./routes/superadmin/pago-publico'));
app.use('/api/pi/auth',    require('./routes/pi/auth'));
app.use('/api/pi/importar', require('./routes/pi/importar'));
app.use('/api/pi/procesar', require('./routes/pi/procesar'));
app.use('/api/pi/pedidos',  require('./routes/pi/pedidos'));
app.use('/api/pi/config',   require('./routes/pi/config'));
app.use('/api/catalogo',             require('./routes/catalogo/catalogo'));
app.use('/api/superadmin/catalogo',  require('./routes/superadmin/catalogo'));
app.use('/api/superadmin/historial', require('./routes/superadmin/historial'));
app.use('/api/superadmin/backup', require('./routes/superadmin/backup'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});