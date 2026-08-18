const express = require('express');
const router  = express.Router();
const pool    = require('../../db');
const QRCode  = require('qrcode');

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const logoSeguro = value => {
  try {
    const url = new URL(String(value || ''));
    return ['https:', 'http:'].includes(url.protocol) ? escapeHtml(url.toString()) : '';
  } catch { return ''; }
};

const tokenValido = token => /^[a-f0-9]{48}$/.test(String(token || ''));

// ═══════════════════════════════════════════════════════════════
// GET /api/pago/public/:token — Landing pública con identificador opaco.
// SIN autenticación — es para que el comprador escanee el QR
// ═══════════════════════════════════════════════════════════════
router.get('/public/:token', async (req, res) => {
  const { token } = req.params;
  if (!tokenValido(token)) return res.status(404).send('No disponible');
  try {
    const result = await pool.query(
      `SELECT nombre_comercial, cuit, direccion, logo_url, alias_pago, cbu_pago, banco_pago
       FROM config_negocio WHERE pago_public_token = $1`,
      [token]
    );
    if (!result.rows[0] || !result.rows[0].alias_pago) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>No disponible</title></head>
        <body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F7FAFC">
          <div style="text-align:center;padding:40px"><h2 style="color:#2D3748">Datos de pago no configurados</h2>
          <p style="color:#718096">El negocio aún no cargó su información de pago.</p></div>
        </body></html>
      `);
    }
    const d = result.rows[0];
    const nombre = escapeHtml(d.nombre_comercial || 'Negocio');
    const direccion = escapeHtml(d.direccion);
    const alias = escapeHtml(d.alias_pago);
    const cbu = escapeHtml(d.cbu_pago);
    const banco = escapeHtml(d.banco_pago);
    const cuit = escapeHtml(d.cuit);
    const logo = logoSeguro(d.logo_url);
    const nonce = require('crypto').randomBytes(16).toString('base64');
    res.set('Content-Security-Policy', `default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`);
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.set('Cache-Control', 'no-store');
    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Datos de transferencia de ${nombre}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: #fff; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.15); max-width: 400px; width: 100%; overflow: hidden; }
    .header { background: #1B2A4A; padding: 28px 24px; text-align: center; }
    .header img { max-height: 60px; max-width: 200px; object-fit: contain; margin-bottom: 12px; border-radius: 8px; }
    .header h1 { color: #fff; font-size: 20px; font-weight: 700; margin: 0; }
    .header p { color: #A0AEC0; font-size: 13px; margin-top: 4px; }
    .body { padding: 28px 24px; }
    .field { margin-bottom: 20px; }
    .field-label { font-size: 11px; font-weight: 700; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
    .field-value { display: flex; align-items: center; justify-content: space-between; background: #F7FAFC; border: 1.5px solid #E2E8F0; border-radius: 10px; padding: 14px 16px; }
    .field-text { font-size: 16px; font-weight: 600; color: #1B2A4A; word-break: break-all; }
    .copy-btn { background: #2B6CB0; color: #fff; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; margin-left: 10px; transition: background 0.2s; }
    .copy-btn:active { background: #2C5282; }
    .copy-btn.copied { background: #38A169; }
    .bank-info { font-size: 13px; color: #718096; text-align: center; margin-top: 4px; }
    .footer { text-align: center; padding: 16px 24px 24px; border-top: 1px solid #EDF2F7; }
    .footer p { font-size: 11px; color: #A0AEC0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      ${logo ? `<img src="${logo}" alt="Logo">` : ''}
      <h1>${nombre}</h1>
      ${direccion ? `<p>${direccion}</p>` : ''}
    </div>
    <div class="body">
      <div class="field">
        <div class="field-label">Alias de transferencia</div>
        <div class="field-value">
          <span class="field-text" id="alias">${alias}</span>
          <button class="copy-btn" onclick="copiar('alias', this)">Copiar</button>
        </div>
      </div>
      ${cbu ? `
      <div class="field">
        <div class="field-label">CBU / CVU</div>
        <div class="field-value">
          <span class="field-text" id="cbu" style="font-size:13px">${cbu}</span>
          <button class="copy-btn" onclick="copiar('cbu', this)">Copiar</button>
        </div>
      </div>` : ''}
      ${banco ? `<p class="bank-info">&#127974; ${banco}</p>` : ''}
      ${cuit ? `<p class="bank-info" style="margin-top:8px">CUIT: ${cuit}</p>` : ''}
    </div>
    <div class="footer">
      <p>Verificá el titular en tu banco antes de confirmar la transferencia</p>
    </div>
  </div>
  <script nonce="${nonce}">
    function copiar(id, btn) {
      var txt = document.getElementById(id).textContent;
      navigator.clipboard.writeText(txt).then(function() {
        btn.textContent = '\\u2713 Copiado';
        btn.classList.add('copied');
        setTimeout(function() { btn.textContent = 'Copiar'; btn.classList.remove('copied'); }, 2000);
      }).catch(function() {
        var ta = document.createElement('textarea');
        ta.value = txt; ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); btn.textContent = '\\u2713 Copiado'; btn.classList.add('copied');
          setTimeout(function() { btn.textContent = 'Copiar'; btn.classList.remove('copied'); }, 2000);
        } catch(e) { alert('Copia manualmente: ' + txt); }
        document.body.removeChild(ta);
      });
    }
  </script>
</body>
</html>
    `);
  } catch (err) {
    console.error('pago-publico GET error:', err.message);
    res.status(500).send('<h2>Error</h2>');
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/pago/public/:token/qr.png — Imagen QR como PNG
// SIN autenticación — el frontend la usa para mostrar/descargar
// ═══════════════════════════════════════════════════════════════
router.get('/public/:token/qr.png', async (req, res) => {
  const { token } = req.params;
  if (!tokenValido(token)) return res.status(404).json({ error: 'No disponible' });
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  try {
    const result = await pool.query(
      `SELECT alias_pago FROM config_negocio WHERE pago_public_token = $1`,
      [token]
    );
    if (!result.rows[0] || !result.rows[0].alias_pago) {
      return res.status(404).json({ error: 'Alias de pago no configurado' });
    }
    const url = `${baseUrl}/api/pago/public/${token}`;
    const qrBuffer = await QRCode.toBuffer(url, {
      width: 400,
      margin: 2,
      color: { dark: '#1B2A4A', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(qrBuffer);
  } catch (err) {
    console.error('pago QR error:', err.message);
    res.status(500).json({ error: 'Error generando QR' });
  }
});

module.exports = router;
