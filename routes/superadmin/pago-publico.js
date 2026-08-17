const express = require('express');
const router  = express.Router();
const pool    = require('../../db');
const QRCode  = require('qrcode');

// ═══════════════════════════════════════════════════════════════
// GET /api/pago/:cliente_id — Landing page pública de pago
// SIN autenticación — es para que el comprador escanee el QR
// ═══════════════════════════════════════════════════════════════
router.get('/:cliente_id', async (req, res) => {
  const { cliente_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT nombre_comercial, cuit, direccion, logo_url, alias_pago, cbu_pago, banco_pago
       FROM config_negocio WHERE cliente_id = $1`,
      [cliente_id]
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
    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Pagar a ${d.nombre_comercial || 'Negocio'}</title>
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
      ${d.logo_url ? `<img src="${d.logo_url}" alt="Logo" onerror="this.style.display='none'">` : ''}
      <h1>${d.nombre_comercial || 'Negocio'}</h1>
      ${d.direccion ? `<p>${d.direccion}</p>` : ''}
    </div>
    <div class="body">
      <div class="field">
        <div class="field-label">Alias de transferencia</div>
        <div class="field-value">
          <span class="field-text" id="alias">${d.alias_pago}</span>
          <button class="copy-btn" onclick="copiar('alias', this)">Copiar</button>
        </div>
      </div>
      ${d.cbu_pago ? `
      <div class="field">
        <div class="field-label">CBU / CVU</div>
        <div class="field-value">
          <span class="field-text" id="cbu" style="font-size:13px">${d.cbu_pago}</span>
          <button class="copy-btn" onclick="copiar('cbu', this)">Copiar</button>
        </div>
      </div>` : ''}
      ${d.banco_pago ? `<p class="bank-info">&#127974; ${d.banco_pago}</p>` : ''}
      ${d.cuit ? `<p class="bank-info" style="margin-top:8px">CUIT: ${d.cuit}</p>` : ''}
    </div>
    <div class="footer">
      <p>Escaneá el QR o copiá el alias para transferir</p>
    </div>
  </div>
  <script>
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
// GET /api/pago/:cliente_id/qr.png — Imagen QR como PNG
// SIN autenticación — el frontend la usa para mostrar/descargar
// ═══════════════════════════════════════════════════════════════
router.get('/:cliente_id/qr.png', async (req, res) => {
  const { cliente_id } = req.params;
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  try {
    const result = await pool.query(
      `SELECT alias_pago FROM config_negocio WHERE cliente_id = $1`,
      [cliente_id]
    );
    if (!result.rows[0] || !result.rows[0].alias_pago) {
      return res.status(404).json({ error: 'Alias de pago no configurado' });
    }
    const url = `${baseUrl}/api/pago/${cliente_id}`;
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
