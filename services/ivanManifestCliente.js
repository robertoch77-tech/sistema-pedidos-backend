'use strict';

const ORIGEN = 'https://sistemagestionpedidos.netlify.app';
const ORIGENES = new Set([ORIGEN, 'http://localhost:3000']);
const CODIGO_LUMAC = 'lumac_sas_1787930168848';

function rutaLogoCloudinary(logo) {
  try {
    const url = new URL(logo);
    if (url.origin !== 'https://res.cloudinary.com' || url.username || url.password) return null;
    return /^\/([\w-]+\/image\/upload)\/(v\d+\/[\w%./-]+\.(?:png|jpe?g|webp))$/i.exec(url.pathname);
  } catch { return null; }
}

function crearManifest(codigo, nombre, origen = ORIGEN, logo) {
  if (!ORIGENES.has(origen)) throw Object.assign(new Error('Origen de instalación inválido.'), { status: 400 });
  const entrada = origen + '/login?m=' + encodeURIComponent(codigo);
  const lumac = codigo === CODIGO_LUMAC;
  const rutaLogo = rutaLogoCloudinary(logo);
  return {
    id: entrada, start_url: entrada, scope: origen + '/',
    name: nombre || 'Pedidos de tu proveedor', short_name: (nombre || 'Pedidos').slice(0, 24),
    description: 'Pedidos para clientes', display: 'standalone',
    theme_color: '#2563eb', background_color: '#ffffff',
    icons: [192, 512].map(size => ({
      src: rutaLogo
        ? `https://res.cloudinary.com/${rutaLogo[1]}/c_pad,w_${size},h_${size},b_white,f_png/${rutaLogo[2]}`
        : `${origen}/${lumac ? 'logo-login-ivan' : 'logo-ivan'}-${size}.png`,
      sizes: size + 'x' + size,
      type: 'image/png',
    })),
  };
}

module.exports = { crearManifest, CODIGO_LUMAC, rutaLogoCloudinary };
