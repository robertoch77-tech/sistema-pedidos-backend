'use strict';

const ORIGEN = 'https://sistemagestionpedidos.netlify.app';
const ORIGENES = new Set([ORIGEN, 'http://localhost:3000']);

function crearManifest(codigo, nombre, origen = ORIGEN) {
  if (!ORIGENES.has(origen)) throw Object.assign(new Error('Origen de instalación inválido.'), { status: 400 });
  const entrada = origen + '/login?m=' + encodeURIComponent(codigo);
  return {
    id: entrada, start_url: entrada, scope: origen + '/',
    name: nombre || 'Pedidos de tu proveedor', short_name: (nombre || 'Pedidos').slice(0, 24),
    description: 'Pedidos para clientes', display: 'standalone',
    theme_color: '#2563eb', background_color: '#ffffff',
    icons: [192, 512].map(size => ({ src: origen + '/logo-ivan-' + size + '.png', sizes: size + 'x' + size, type: 'image/png' }))
  };
}

module.exports = { crearManifest };
