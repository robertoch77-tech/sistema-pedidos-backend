const express = require('express');
const router  = express.Router();
const pool    = require('../../db');
const { verificarCualquierToken, verificarClienteId } = require('./authMiddleware');
const axios   = require('axios');
const xml2js  = require('xml2js');
const forge   = require('node-forge');

// ─── TABLAS ───────────────────────────────────────────────────
async function asegurarTablas() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS arca_configuracion (
        id                 BIGSERIAL PRIMARY KEY,
        cliente_id         BIGINT NOT NULL UNIQUE,
        cuit               TEXT DEFAULT '',
        razon_social       TEXT DEFAULT '',
        condicion_iva      TEXT DEFAULT '',
        punto_venta        INTEGER DEFAULT 1,
        certificado        TEXT DEFAULT '',
        clave_privada      TEXT DEFAULT '',
        modo               TEXT DEFAULT 'homologacion',
        emite_factura_a    BOOLEAN DEFAULT false,
        emite_factura_b    BOOLEAN DEFAULT true,
        emite_factura_c    BOOLEAN DEFAULT false,
        emite_nota_credito BOOLEAN DEFAULT false,
        emite_nota_debito  BOOLEAN DEFAULT false,
        token_wsaa         TEXT DEFAULT '',
        sign_wsaa          TEXT DEFAULT '',
        token_expira       TIMESTAMPTZ,
        estado_conexion    TEXT DEFAULT 'sin_configurar',
        ultima_conexion    TIMESTAMPTZ,
        ultimo_error       TEXT DEFAULT '',
        creado_en          TIMESTAMPTZ DEFAULT now(),
        actualizado_en     TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS arca_comprobantes (
        id                  BIGSERIAL PRIMARY KEY,
        cliente_id          BIGINT NOT NULL,
        venta_id            BIGINT,
        tipo_comprobante    TEXT DEFAULT '',
        numero_completo     TEXT DEFAULT '',
        punto_venta         INTEGER DEFAULT 1,
        numero              BIGINT DEFAULT 0,
        receptor_cuit       TEXT DEFAULT '',
        receptor_nombre     TEXT DEFAULT '',
        receptor_cond_iva   TEXT DEFAULT '',
        fecha_emision       DATE DEFAULT CURRENT_DATE,
        importe_neto        NUMERIC DEFAULT 0,
        importe_iva         NUMERIC DEFAULT 0,
        importe_total       NUMERIC DEFAULT 0,
        cae                 TEXT DEFAULT '',
        cae_vencimiento     DATE,
        estado              TEXT DEFAULT 'emitida',
        pdf_base64          TEXT DEFAULT '',
        creado_en           TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS arca_logs (
        id          BIGSERIAL PRIMARY KEY,
        cliente_id  BIGINT NOT NULL,
        tipo        TEXT DEFAULT '',
        exitoso     BOOLEAN DEFAULT false,
        request     TEXT DEFAULT '',
        response    TEXT DEFAULT '',
        error       TEXT DEFAULT '',
        creado_en   TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    // libros_iva_ventas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS libros_iva_ventas (
        id               BIGSERIAL PRIMARY KEY,
        cliente_id       BIGINT NOT NULL,
        comprobante_id   BIGINT,
        venta_id         BIGINT,
        fecha            DATE DEFAULT CURRENT_DATE,
        tipo_comprobante TEXT DEFAULT '',
        numero_completo  TEXT DEFAULT '',
        cuit_receptor    TEXT DEFAULT '',
        nombre_receptor  TEXT DEFAULT '',
        importe_neto     NUMERIC DEFAULT 0,
        importe_iva_21   NUMERIC DEFAULT 0,
        importe_iva_105  NUMERIC DEFAULT 0,
        importe_total    NUMERIC DEFAULT 0,
        cae              TEXT DEFAULT '',
        creado_en        TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    const cols = [
      ['token_wsaa',      "TEXT DEFAULT ''"],
      ['sign_wsaa',       "TEXT DEFAULT ''"],
      ['token_expira',    'TIMESTAMPTZ'],
      ['estado_conexion', "TEXT DEFAULT 'sin_configurar'"],
      ['ultima_conexion', 'TIMESTAMPTZ'],
      ['ultimo_error',    "TEXT DEFAULT ''"],
      ['actualizado_en',  'TIMESTAMPTZ DEFAULT now()'],
      ['token_padron',       "TEXT DEFAULT ''"],
      ['sign_padron',        "TEXT DEFAULT ''"],
      ['token_padron_expira','TIMESTAMPTZ'],
    ];
    for (const [col, tipo] of cols) {
      await pool.query(`ALTER TABLE arca_configuracion ADD COLUMN IF NOT EXISTS ${col} ${tipo}`).catch(() => {});
    }

    // Las instalaciones anteriores podían tener la tabla sin la unicidad por
    // cliente. ON CONFLICT (cliente_id) necesita esta regla para poder guardar.
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
          WHERE c.conrelid = 'arca_configuracion'::regclass
            AND c.contype = 'u'
            AND array_length(c.conkey, 1) = 1
            AND a.attname = 'cliente_id'
        ) THEN
          ALTER TABLE arca_configuracion
            ADD CONSTRAINT arca_configuracion_cliente_id_uq UNIQUE (cliente_id);
        END IF;
      END $$;
    `).catch(err => console.error('arca: no se pudo asegurar unicidad por cliente:', err.message));

    // Columnas ARCA en tabla ventas
    const colsVentas = [
      ['cae',             "TEXT DEFAULT ''"],
      ['cae_vencimiento', 'DATE'],
      ['tipo_factura',    "TEXT DEFAULT ''"],
      ['numero_arca',     "TEXT DEFAULT ''"],
      ['facturado',       'BOOLEAN DEFAULT false'],
    ];
    for (const [col, tipo] of colsVentas) {
      await pool.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS ${col} ${tipo}`).catch(() => {});
    }
  } catch (err) {
    console.error('arca: error asegurando tablas:', err.message);
  }
}
asegurarTablas();

router.use(verificarCualquierToken);

// ─── URLS ARCA ───────────────────────────────────────────────
const WSAA_HOMO  = 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms';
const WSAA_PROD  = 'https://wsaa.afip.gov.ar/ws/services/LoginCms';
const WSFE_HOMO  = 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx';
const WSFE_PROD  = 'https://servicios1.afip.gov.ar/wsfev1/service.asmx';
const PADRON_HOMO = 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5';
const PADRON_PROD = 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5';

// ─── HELPERS ─────────────────────────────────────────────────
function n(v) { return parseFloat(v) || 0; }

function normalizarPem(valor) {
  return String(valor || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function leerCredencialesArca(config) {
  const certificado = normalizarPem(config.certificado);
  const clavePrivada = normalizarPem(config.clave_privada);

  try {
    forge.pki.certificateFromPem(certificado);
  } catch (err) {
    throw new Error('Certificado .crt inválido o incompleto: ' + err.message);
  }

  try {
    forge.pki.privateKeyFromPem(clavePrivada);
  } catch (err) {
    throw new Error('Clave privada .key inválida o incompleta: ' + err.message);
  }

  return { certificado, clavePrivada };
}

// Devuelve el motivo que informa ARCA/WSAA sin exponer certificados, claves ni el CMS firmado.
function detalleErrorWSAA(error) {
  const estado = error?.response?.status;
  const cuerpo = typeof error?.response?.data === 'string' ? error.response.data : '';
  const fault = cuerpo.match(/<(?:\w+:)?faultstring[^>]*>([\s\S]*?)<\/(?:\w+:)?faultstring>/i) ||
                cuerpo.match(/<(?:\w+:)?error[^>]*>([\s\S]*?)<\/(?:\w+:)?error>/i);
  const detalle = (fault?.[1] || cuerpo)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 800);

  if (estado && detalle) return `ARCA/WSAA respondi\u00f3 ${estado}: ${detalle}`;
  if (estado) return `ARCA/WSAA respondi\u00f3 ${estado}: ${error.message}`;
  return error.message;
}

async function logARCA(cliente_id, tipo, exitoso, request, response, error) {
  try {
    await pool.query(
      `INSERT INTO arca_logs (cliente_id, tipo, exitoso, request, response, error)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [cliente_id, tipo, exitoso, String(request).slice(0, 4000), String(response).slice(0, 4000), String(error).slice(0, 1000)]
    );
  } catch { /* silencioso */ }
}

function generarTRA(modo, servicio = 'wsfe') {
  const ahora  = new Date();
  const desde  = new Date(ahora.getTime() - 60000);
  const hasta  = new Date(ahora.getTime() + 14 * 3600000);
  const uniRef = Math.floor(Math.random() * 9999999999);
  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniRef}</uniqueId>
    <generationTime>${desde.toISOString().slice(0,19)}</generationTime>
    <expirationTime>${hasta.toISOString().slice(0,19)}</expirationTime>
  </header>
  <service>${servicio}</service>
</loginTicketRequest>`;
}

async function obtenerToken(config) {
  // Si token vigente (con 5 min de margen), reutilizar
  if (config.token_wsaa && config.token_expira) {
    const expira = new Date(config.token_expira);
    if (expira.getTime() - Date.now() > 5 * 60 * 1000) {
      return { token: config.token_wsaa, sign: config.sign_wsaa };
    }
  }

  const tra   = generarTRA(config.modo);
  const wsaaUrl = config.modo === 'produccion' ? WSAA_PROD : WSAA_HOMO;
  const credenciales = leerCredencialesArca(config);

  // Firmar TRA con clave privada + certificado — CMS/PKCS7 real
  let cms;
  try {
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(tra, 'utf8');
    p7.addCertificate(credenciales.certificado);
    p7.addSigner({
      key:             forge.pki.privateKeyFromPem(credenciales.clavePrivada),
      certificate:     forge.pki.certificateFromPem(credenciales.certificado),
      digestAlgorithm: forge.pki.oids.sha256,
    });
    p7.sign({ detached: false });
    const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    cms = forge.util.encode64(der);
  } catch (e) {
    throw new Error('Error firmando TRA (CMS): ' + e.message);
  }

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cms}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;

  let resp;
  try {
    resp = await axios.post(wsaaUrl, soapBody, {
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': 'loginCms' },
      timeout: 15000,
    });
  } catch (error) {
    throw new Error(detalleErrorWSAA(error));
  }

  const parsed = await xml2js.parseStringPromise(resp.data, { explicitArray: false });
  const loginResp = parsed?.['soapenv:Envelope']?.['soapenv:Body']?.['loginCmsReturn'] ||
                    parsed?.['S:Envelope']?.['S:Body']?.['ns2:loginCmsResponse']?.['return'] || {};
  const loginTicket = loginResp?.loginTicketResponse || {};

  const token  = loginTicket?.credentials?.token || loginResp?.token  || '';
  const sign   = loginTicket?.credentials?.sign  || loginResp?.sign   || '';
  const expStr = loginTicket?.header?.expirationTime || '';

  return { token, sign, expira: expStr ? new Date(expStr) : new Date(Date.now() + 12 * 3600000) };
}

async function obtenerTokenPadron(config) {
  if (config.token_padron && config.token_padron_expira) {
    const expira = new Date(config.token_padron_expira);
    if (expira.getTime() - Date.now() > 5 * 60 * 1000) {
      return { token: config.token_padron, sign: config.sign_padron };
    }
  }

  const tra = generarTRA(config.modo, 'ws_sr_padron_a5');
  const wsaaUrl = config.modo === 'produccion' ? WSAA_PROD : WSAA_HOMO;
  const credenciales = leerCredencialesArca(config);

  let cms;
  try {
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(tra, 'utf8');
    p7.addCertificate(credenciales.certificado);
    p7.addSigner({
      key:             forge.pki.privateKeyFromPem(credenciales.clavePrivada),
      certificate:     forge.pki.certificateFromPem(credenciales.certificado),
      digestAlgorithm: forge.pki.oids.sha256,
    });
    p7.sign({ detached: false });
    const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    cms = forge.util.encode64(der);
  } catch (e) {
    throw new Error('Error firmando TRA padron (CMS): ' + e.message);
  }

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cms}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;

  let resp;
  try {
    resp = await axios.post(wsaaUrl, soapBody, {
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': 'loginCms' },
      timeout: 15000,
    });
  } catch (error) {
    throw new Error(detalleErrorWSAA(error));
  }

  const parsed = await xml2js.parseStringPromise(resp.data, { explicitArray: false });
  const loginResp = parsed?.['soapenv:Envelope']?.['soapenv:Body']?.['loginCmsReturn'] ||
                    parsed?.['S:Envelope']?.['S:Body']?.['ns2:loginCmsResponse']?.['return'] || {};
  const loginTicket = loginResp?.loginTicketResponse || {};

  const token  = loginTicket?.credentials?.token || loginResp?.token  || '';
  const sign   = loginTicket?.credentials?.sign  || loginResp?.sign   || '';
  const expStr = loginTicket?.header?.expirationTime || '';
  const expira = expStr ? new Date(expStr) : new Date(Date.now() + 12 * 3600000);

  await pool.query(
    `UPDATE arca_configuracion SET token_padron=$1, sign_padron=$2, token_padron_expira=$3 WHERE cliente_id=$4`,
    [token, sign, expira, config.cliente_id]
  );

  return { token, sign };
}

// ─── GET /config/:cliente_id ──────────────────────────────────
router.get('/config/:cliente_id', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const r = await pool.query(
      `SELECT id, cliente_id, cuit, razon_social, condicion_iva, punto_venta, modo,
              emite_factura_a, emite_factura_b, emite_factura_c,
              emite_nota_credito, emite_nota_debito,
              estado_conexion, ultima_conexion, ultimo_error, token_expira,
              (certificado <> '') AS tiene_certificado,
              (clave_privada <> '') AS tiene_clave
       FROM arca_configuracion WHERE cliente_id=$1`,
      [cliente_id]
    );
    if (r.rows.length === 0) return res.json({ configurado: false });
    res.json({ configurado: true, ...r.rows[0] });
  } catch (err) {
    console.error('arca config get:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /config/:cliente_id ──────────────────────────────────
router.put('/config/:cliente_id', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const {
      cuit, razon_social, condicion_iva, punto_venta, certificado, clave_privada, modo,
      emite_factura_a, emite_factura_b, emite_factura_c, emite_nota_credito, emite_nota_debito,
    } = req.body;

    await pool.query(`
      INSERT INTO arca_configuracion
        (cliente_id, cuit, razon_social, condicion_iva, punto_venta,
         certificado, clave_privada, modo,
         emite_factura_a, emite_factura_b, emite_factura_c,
         emite_nota_credito, emite_nota_debito, actualizado_en)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
      ON CONFLICT (cliente_id) DO UPDATE SET
        cuit=$2, razon_social=$3, condicion_iva=$4, punto_venta=$5,
        certificado=CASE WHEN $6='' THEN arca_configuracion.certificado ELSE $6 END,
        clave_privada=CASE WHEN $7='' THEN arca_configuracion.clave_privada ELSE $7 END,
        modo=$8,
        emite_factura_a=$9, emite_factura_b=$10, emite_factura_c=$11,
        emite_nota_credito=$12, emite_nota_debito=$13,
        actualizado_en=now()`,
      [cliente_id, cuit || '', razon_social || '', condicion_iva || '', parseInt(punto_venta) || 1,
       certificado || '', clave_privada || '', modo || 'homologacion',
       !!emite_factura_a, !!emite_factura_b, !!emite_factura_c,
       !!emite_nota_credito, !!emite_nota_debito]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('arca config put:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /config/:cliente_id/test ────────────────────────────
router.post('/config/:cliente_id/test', verificarClienteId, async (req, res) => {
  const { cliente_id } = req.params;
  try {
    const cfgRes = await pool.query(
      `SELECT * FROM arca_configuracion WHERE cliente_id=$1`, [cliente_id]
    );
    if (cfgRes.rows.length === 0) return res.status(400).json({ error: 'Sin configuración' });
    const config = cfgRes.rows[0];

    if (!config.certificado || !config.clave_privada) {
      return res.status(400).json({ error: 'Certificado o clave privada no cargados' });
    }

    let tokenData;
    try {
      tokenData = await obtenerToken({ ...config, token_wsaa: '', token_expira: null });
    } catch (e) {
      await pool.query(
        `UPDATE arca_configuracion SET estado_conexion='error', ultimo_error=$1, actualizado_en=now() WHERE cliente_id=$2`,
        [e.message, cliente_id]
      );
      await logARCA(cliente_id, 'test_wsaa', false, 'TRA generado', '', e.message);
      return res.status(200).json({ ok: false, error: e.message });
    }

    // Guardar token
    await pool.query(
      `UPDATE arca_configuracion SET
         token_wsaa=$1, sign_wsaa=$2, token_expira=$3,
         estado_conexion='ok', ultima_conexion=now(), ultimo_error='', actualizado_en=now()
       WHERE cliente_id=$4`,
      [tokenData.token, tokenData.sign, tokenData.expira, cliente_id]
    );

    await logARCA(cliente_id, 'test_wsaa', true, 'TRA generado', 'Token OK', '');
    res.json({ ok: true, mensaje: 'Conexión exitosa con ARCA', expira_en: tokenData.expira });
  } catch (err) {
    console.error('arca test:', err.message);
    await logARCA(cliente_id, 'test_wsaa', false, '', '', err.message);
    res.status(500).json({ error: err.message });
  }
});

function alicuotaAfipId(pct) {
  if (pct === 0)    return 3;
  if (pct === 10.5) return 4;
  if (pct === 21)   return 5;
  if (pct === 27)   return 6;
  return 5;
}

// ─── POST /facturar/:cliente_id ───────────────────────────────
router.post('/facturar/:cliente_id', verificarClienteId, async (req, res) => {
  const { cliente_id } = req.params;
  try {
    const {
      venta_id, tipo_factura = '6', punto_venta,
      receptor_cuit = '0', receptor_nombre = 'Consumidor Final',
      receptor_condicion_iva = '5',
    } = req.body;

    // Leer config
    const cfgRes = await pool.query(`SELECT * FROM arca_configuracion WHERE cliente_id=$1`, [cliente_id]);
    if (cfgRes.rows.length === 0) throw new Error('Sin configuración ARCA');
    const config = cfgRes.rows[0];

    // Obtener/renovar token
    let tokenData;
    try {
      tokenData = await obtenerToken(config);
    } catch (e) {
      throw new Error('Error WSAA: ' + e.message);
    }

    // Guardar token actualizado
    await pool.query(
      `UPDATE arca_configuracion SET token_wsaa=$1, sign_wsaa=$2, token_expira=$3 WHERE cliente_id=$4`,
      [tokenData.token, tokenData.sign, tokenData.expira ?? (config.token_expira), cliente_id]
    );

    // Leer venta
    const pventa = parseInt(punto_venta) || config.punto_venta || 1;
    let importe_neto = 100, importe_iva = 21, importe_total = 121;
    let alicuotas = [{ alicuota: 21, base: 100, iva: 21 }];

    if (venta_id) {
      try {
        const ventaRes = await pool.query(`SELECT * FROM ventas WHERE id=$1`, [venta_id]);
        if (ventaRes.rows.length > 0) {
          const venta = ventaRes.rows[0];
          importe_total = n(venta.total ?? venta.monto_total ?? 0);

          const itemsAgrup = await pool.query(
            `SELECT
               COALESCE(alicuota_iva, 21) AS alicuota,
               SUM(subtotal::numeric)     AS base_imp,
               SUM(iva_monto::numeric)    AS iva_monto
             FROM ventas_items
             WHERE venta_id = $1
             GROUP BY COALESCE(alicuota_iva, 21)
             ORDER BY alicuota`,
            [venta_id]
          );

          if (itemsAgrup.rows.length > 0) {
            importe_neto = 0;
            importe_iva  = 0;
            alicuotas = [];
            for (const row of itemsAgrup.rows) {
              const alic = parseFloat(row.alicuota);
              const base = n(row.base_imp);
              const iva  = n(row.iva_monto);
              importe_neto += base;
              importe_iva  += iva;
              alicuotas.push({ alicuota: alic, base, iva });
            }
          } else {
            importe_neto = n(venta.subtotal ?? importe_total / 1.21);
            importe_iva  = importe_total - importe_neto;
            alicuotas = [{ alicuota: 21, base: importe_neto, iva: importe_iva }];
          }
        }
      } catch { /* venta sin tabla — usar valores por defecto */ }
    }

    // Obtener último número
    const wsfeUrl = config.modo === 'produccion' ? WSFE_PROD : WSFE_HOMO;
    const cbteTipo = parseInt(tipo_factura) || 6;
    let ultimoNum = 0;

    const soapUltimo = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soap:Body>
    <ar:FECompUltimoAutorizado>
      <ar:Auth><ar:Token>${config.token_wsaa}</ar:Token><ar:Sign>${config.sign_wsaa}</ar:Sign><ar:Cuit>${config.cuit}</ar:Cuit></ar:Auth>
      <ar:PtoVta>${pventa}</ar:PtoVta>
      <ar:CbteTipo>${cbteTipo}</ar:CbteTipo>
    </ar:FECompUltimoAutorizado>
  </soap:Body>
</soap:Envelope>`;

    try {
      const rUltimo = await axios.post(wsfeUrl, soapUltimo, { headers: { 'Content-Type': 'text/xml', 'SOAPAction': '' }, timeout: 10000 });
      const pUltimo = await xml2js.parseStringPromise(rUltimo.data, { explicitArray: false });
      const nroStr = JSON.stringify(pUltimo);
      const m = nroStr.match(/"CbteNro"\s*:\s*"?(\d+)"?/);
      if (m) ultimoNum = parseInt(m[1]);
    } catch { /* sin conectividad real en homologación — usar 0 */ }

    const nuevoNum = ultimoNum + 1;

    // Llamar FECAESolicitar
    const fechaHoy = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    const alicGravadas = alicuotas.filter(a => a.alicuota > 0);
    const alicExentas  = alicuotas.filter(a => a.alicuota === 0);
    const impOpEx      = alicExentas.reduce((s, a) => s + a.base, 0);
    const impNetoGrav  = alicGravadas.reduce((s, a) => s + a.base, 0);
    const impIVA       = alicGravadas.reduce((s, a) => s + a.iva, 0);

    const esFacturaA = [1, 2, 3].includes(cbteTipo);
    const tieneCuit  = receptor_cuit && receptor_cuit !== '0' && receptor_cuit.replace(/-/g,'').length >= 11;
    const docTipo    = esFacturaA ? 80 : (tieneCuit ? 80 : 99);
    const docNro     = docTipo === 80 ? receptor_cuit.replace(/-/g, '') : '0';

    let alicIvaXml = '';
    for (const a of alicGravadas) {
      alicIvaXml += `
              <ar:AlicIva>
                <ar:Id>${alicuotaAfipId(a.alicuota)}</ar:Id>
                <ar:BaseImp>${a.base.toFixed(2)}</ar:BaseImp>
                <ar:Importe>${a.iva.toFixed(2)}</ar:Importe>
              </ar:AlicIva>`;
    }
    const bloqueIva = alicGravadas.length > 0
      ? `<ar:Iva>${alicIvaXml}
            </ar:Iva>`
      : '';

    const soapCAE = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soap:Body>
    <ar:FECAESolicitar>
      <ar:Auth><ar:Token>${config.token_wsaa || ''}</ar:Token><ar:Sign>${config.sign_wsaa || ''}</ar:Sign><ar:Cuit>${config.cuit}</ar:Cuit></ar:Auth>
      <ar:FeCAEReq>
        <ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${pventa}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo></ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            <ar:Concepto>1</ar:Concepto>
            <ar:DocTipo>${docTipo}</ar:DocTipo>
            <ar:DocNro>${docNro}</ar:DocNro>
            <ar:CbteDesde>${nuevoNum}</ar:CbteDesde>
            <ar:CbteHasta>${nuevoNum}</ar:CbteHasta>
            <ar:CbteFch>${fechaHoy}</ar:CbteFch>
            <ar:ImpTotal>${importe_total.toFixed(2)}</ar:ImpTotal>
            <ar:ImpTotConc>0.00</ar:ImpTotConc>
            <ar:ImpNeto>${impNetoGrav.toFixed(2)}</ar:ImpNeto>
            <ar:ImpOpEx>${impOpEx.toFixed(2)}</ar:ImpOpEx>
            <ar:ImpIVA>${impIVA.toFixed(2)}</ar:ImpIVA>
            <ar:ImpTrib>0.00</ar:ImpTrib>
            <ar:MonId>PES</ar:MonId>
            <ar:MonCotiz>1</ar:MonCotiz>
            ${bloqueIva}
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  </soap:Body>
</soap:Envelope>`;

    let cae = '', cae_vencimiento = null, resultadoOk = false, errorCAE = '';

    try {
      const rCAE = await axios.post(wsfeUrl, soapCAE, { headers: { 'Content-Type': 'text/xml', 'SOAPAction': '' }, timeout: 15000 });
      const pCAE = await xml2js.parseStringPromise(rCAE.data, { explicitArray: false });
      const xmlStr = JSON.stringify(pCAE);
      const mCAE = xmlStr.match(/"CAE"\s*:\s*"?(\d+)"?/);
      const mVto = xmlStr.match(/"CAEFchVto"\s*:\s*"?(\d{8})"?/);
      if (mCAE) { cae = mCAE[1]; resultadoOk = true; }
      if (mVto) {
        const v = mVto[1];
        cae_vencimiento = `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}`;
      }
      await logARCA(cliente_id, 'fecaesolicitar', resultadoOk, soapCAE.slice(0, 500), rCAE.data.slice(0, 500), '');
    } catch (e) {
      errorCAE = e.message;
      await logARCA(cliente_id, 'fecaesolicitar', false, soapCAE.slice(0, 500), '', e.message);
      throw new Error('Error obteniendo CAE de AFIP: ' + (e.message || 'Sin respuesta del servidor'));
    }

    const prefijos = { 1:'FA', 2:'NDA', 3:'NCA', 6:'FB', 7:'NDB', 8:'NCB', 11:'FC', 12:'NDC', 13:'NCC' };
    const prefijo = prefijos[cbteTipo] || 'F';
    const numero_completo = `${prefijo}-${String(pventa).padStart(4,'0')}-${String(nuevoNum).padStart(8,'0')}`;

    // INSERT arca_comprobantes
    const compRes = await pool.query(
      `INSERT INTO arca_comprobantes
         (cliente_id, venta_id, tipo_comprobante, numero_completo, punto_venta, numero,
          receptor_cuit, receptor_nombre, receptor_cond_iva,
          importe_neto, importe_iva, importe_total, cae, cae_vencimiento)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [cliente_id, venta_id || null, String(cbteTipo), numero_completo, pventa, nuevoNum,
       receptor_cuit, receptor_nombre, String(receptor_condicion_iva),
       importe_neto, importe_iva, importe_total, cae,
       cae_vencimiento || null]
    );
    const comp_id = compRes.rows[0].id;

    // UPDATE ventas
    if (venta_id) {
      await pool.query(
        `UPDATE ventas SET cae=$1, cae_vencimiento=$2, tipo_factura=$3, numero_arca=$4, facturado=true
         WHERE id=$5`,
        [cae, cae_vencimiento, String(cbteTipo), numero_completo, venta_id]
      );
    }

    // INSERT libros_iva_ventas
    const iva21  = alicuotas.filter(a => a.alicuota === 21).reduce((s, a) => s + a.iva, 0);
    const iva105 = alicuotas.filter(a => a.alicuota === 10.5).reduce((s, a) => s + a.iva, 0);
    await pool.query(
      `INSERT INTO libros_iva_ventas
         (cliente_id, comprobante_id, venta_id, tipo_comprobante, numero_completo,
          cuit_receptor, nombre_receptor, importe_neto, importe_iva_21, importe_iva_105, importe_total, cae)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [cliente_id, comp_id, venta_id || null, String(cbteTipo), numero_completo,
       receptor_cuit, receptor_nombre, impNetoGrav + impOpEx, iva21, iva105, importe_total, cae]
    );

    res.json({ ok: true, cae, numero_completo, tipo_factura: String(cbteTipo), vencimiento_cae: cae_vencimiento });
  } catch (err) {
    console.error('arca facturar:', err.message);
    await logARCA(cliente_id, 'facturar', false, '', '', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /pendientes/:cliente_id — ventas sin facturar ───────
router.get('/pendientes/:cliente_id', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const result = await pool.query(
      `SELECT id, numero_completo, comprador_nombre, comprador_cuit,
              total, fecha, creado_en
       FROM ventas
       WHERE cliente_id = $1
         AND (facturado = false OR facturado IS NULL)
       ORDER BY creado_en DESC
       LIMIT 50`,
      [cliente_id]
    );
    res.json({ ventas: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('arca pendientes:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /historial/:cliente_id ───────────────────────────────
router.get('/historial/:cliente_id', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const { tipo_comprobante, fecha_desde, fecha_hasta, buscar, page = 1, limit = 25 } = req.query;
    const conds = ['cliente_id=$1'];
    const params = [cliente_id];
    if (tipo_comprobante) { params.push(tipo_comprobante); conds.push(`tipo_comprobante=$${params.length}`); }
    if (fecha_desde) { params.push(fecha_desde); conds.push(`fecha_emision >= $${params.length}`); }
    if (fecha_hasta) { params.push(fecha_hasta); conds.push(`fecha_emision <= $${params.length}`); }
    if (buscar) { params.push(`%${buscar}%`); conds.push(`(numero_completo ILIKE $${params.length} OR receptor_nombre ILIKE $${params.length})`); }
    const where = conds.join(' AND ');
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const [rows, tot] = await Promise.all([
      pool.query(`SELECT * FROM arca_comprobantes WHERE ${where} ORDER BY creado_en DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
        [...params, parseInt(limit), offset]),
      pool.query(`SELECT COUNT(*) FROM arca_comprobantes WHERE ${where}`, params),
    ]);
    res.json({ comprobantes: rows.rows, total: parseInt(tot.rows[0].count,10), pagina: parseInt(page) });
  } catch (err) {
    console.error('arca historial:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /logs/:cliente_id ────────────────────────────────────
router.get('/logs/:cliente_id', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const { exitoso, fecha_desde, fecha_hasta, page = 1, limit = 25 } = req.query;
    const conds = ['cliente_id=$1'];
    const params = [cliente_id];
    if (exitoso !== undefined) { params.push(exitoso === 'true'); conds.push(`exitoso=$${params.length}`); }
    if (fecha_desde) { params.push(fecha_desde); conds.push(`creado_en::date >= $${params.length}`); }
    if (fecha_hasta) { params.push(fecha_hasta); conds.push(`creado_en::date <= $${params.length}`); }
    const where = conds.join(' AND ');
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const [rows, tot] = await Promise.all([
      pool.query(`SELECT id, tipo, exitoso, error, creado_en FROM arca_logs WHERE ${where} ORDER BY creado_en DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
        [...params, parseInt(limit), offset]),
      pool.query(`SELECT COUNT(*) FROM arca_logs WHERE ${where}`, params),
    ]);
    res.json({ logs: rows.rows, total: parseInt(tot.rows[0].count,10) });
  } catch (err) {
    console.error('arca logs:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /comprobante/:cliente_id/:id/pdf ────────────────────
router.post('/comprobante/:cliente_id/:id/pdf', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id, id } = req.params;
    const r = await pool.query(`SELECT * FROM arca_comprobantes WHERE id=$1 AND cliente_id=$2`, [id, cliente_id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    const comp = r.rows[0];

    // QR ARCA: datos codificados en base64
    const qrData = {
      ver: 1, fecha: comp.fecha_emision?.toISOString?.()?.slice(0,10) || new Date().toISOString().slice(0,10),
      cuit: '', ptovta: comp.punto_venta, tipoCmp: comp.tipo_comprobante,
      nroCmp: comp.numero, importe: n(comp.importe_total), moneda: 'PES', ctz: 1,
      tipoDocRec: 80, nroDocRec: comp.receptor_cuit?.replace(/-/g,'') || '0',
      tipoCodAut: 'E', codAut: comp.cae,
    };
    const qrBase64 = Buffer.from(JSON.stringify(qrData)).toString('base64');
    const qrUrl = `https://www.afip.gob.ar/fe/qr/?p=${qrBase64}`;

    const pdfBase64 = Buffer.from(`PDF:${comp.numero_completo}|CAE:${comp.cae}|QR:${qrUrl}`).toString('base64');
    res.json({ ok: true, pdf_base64: pdfBase64, qr_url: qrUrl, numero_completo: comp.numero_completo });
  } catch (err) {
    console.error('arca pdf:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── ENDPOINTS SUPERADMIN (alias para Roberto) ────────────────
router.get('/superadmin/arca/:cliente_roberto_id', (req, res, next) => {
  req.params.cliente_id = req.params.cliente_roberto_id;
  verificarClienteId(req, res, next);
}, (req, res) => router.handle(Object.assign(req, { url: `/config/${req.params.cliente_roberto_id}`, method: 'GET' }), res, () => {}));

// Variante directa más simple:
router.get('/:cliente_id/superadmin-config', verificarClienteId, async (req, res) => {
  req.params.cliente_id = req.params.cliente_id;
  // redirigir internamente — usar la lógica de /config
  try {
    const { cliente_id } = req.params;
    const r = await pool.query(
      `SELECT id, cliente_id, cuit, razon_social, condicion_iva, punto_venta, modo,
              emite_factura_a, emite_factura_b, emite_factura_c,
              emite_nota_credito, emite_nota_debito,
              estado_conexion, ultima_conexion, ultimo_error, token_expira,
              (certificado <> '') AS tiene_certificado,
              (clave_privada <> '') AS tiene_clave
       FROM arca_configuracion WHERE cliente_id=$1`,
      [cliente_id]
    );
    if (r.rows.length === 0) return res.json({ configurado: false });
    res.json({ configurado: true, ...r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CONSULTA PADRÓN ARCA ────────────────────────────────────
router.post('/padron/:cliente_id/consultar', verificarClienteId, async (req, res) => {
  const { cliente_id } = req.params;
  const { cuit } = req.body;

  if (!cuit || cuit.replace(/\D/g, '').length !== 11) {
    return res.status(400).json({ error: 'CUIT inválido (debe tener 11 dígitos)' });
  }
  const cuitLimpio = cuit.replace(/\D/g, '');

  try {
    const cfgRes = await pool.query('SELECT * FROM arca_configuracion WHERE cliente_id=$1', [cliente_id]);
    if (cfgRes.rows.length === 0) return res.status(400).json({ error: 'ARCA no configurado para este cliente' });
    const config = cfgRes.rows[0];

    if (!config.certificado || !config.clave_privada) {
      return res.status(400).json({ error: 'Certificado o clave privada no cargados' });
    }

    const { token, sign } = await obtenerTokenPadron(config);

    const padronUrl = config.modo === 'produccion' ? PADRON_PROD : PADRON_HOMO;

    const soapReq = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:a5="http://a5.soap.ws.server.puc.sr/">
  <soapenv:Body>
    <a5:getPersona>
      <token>${token}</token>
      <sign>${sign}</sign>
      <cuitRepresentada>${config.cuit}</cuitRepresentada>
      <idPersona>${cuitLimpio}</idPersona>
    </a5:getPersona>
  </soapenv:Body>
</soapenv:Envelope>`;

    const resp = await axios.post(padronUrl, soapReq, {
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': '' },
      timeout: 15000,
    });

    await logARCA(cliente_id, 'padron_consulta', true, `CUIT: ${cuitLimpio}`, resp.data.slice(0, 2000), '');

    const parsed = await xml2js.parseStringPromise(resp.data, { explicitArray: false });
    const body = parsed?.['soap:Envelope']?.['soap:Body'] ||
                 parsed?.['soapenv:Envelope']?.['soapenv:Body'] ||
                 parsed?.['S:Envelope']?.['S:Body'] || {};
    const personaResp = body?.['ns2:getPersonaResponse'] ||
                        body?.['getPersonaResponse'] || {};
    const persona = personaResp?.personaReturn || {};

    if (persona.errorConstancia) {
      const errMsg = persona.errorConstancia?.error || 'CUIT no encontrado en padrón';
      return res.status(404).json({ error: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg) });
    }

    const dg = persona.datosGenerales || {};
    const dom = dg.domicilioFiscal || {};
    const drg = persona.datosRegimenGeneral || {};
    const dm = persona.datosMonotributo || {};

    let condicion_iva = 'Consumidor Final';
    const impuestosRG = Array.isArray(drg.impuesto) ? drg.impuesto : (drg.impuesto ? [drg.impuesto] : []);
    const impuestosMT = Array.isArray(dm.impuesto) ? dm.impuesto : (dm.impuesto ? [dm.impuesto] : []);

    if (impuestosMT.some(i => String(i.idImpuesto) === '20')) {
      condicion_iva = 'Monotributista';
    } else if (impuestosRG.some(i => String(i.idImpuesto) === '30')) {
      condicion_iva = 'Responsable Inscripto';
    } else if (impuestosRG.some(i => String(i.idImpuesto) === '32')) {
      condicion_iva = 'Exento';
    }

    let razon_social = '';
    if (dg.tipoPersona === 'JURIDICA') {
      razon_social = dg.razonSocial || '';
    } else {
      const apellido = dg.apellido || '';
      const nombre = dg.nombre || '';
      razon_social = apellido && nombre ? `${apellido}, ${nombre}` : (apellido || nombre || '');
    }

    const direccion = dom.direccion || '';
    const ciudad = [dom.localidad, dom.descripcionProvincia].filter(Boolean).join(', ');

    res.json({
      ok: true,
      datos: {
        razon_social,
        condicion_iva,
        direccion,
        ciudad,
        tipo_persona: dg.tipoPersona || '',
        estado_clave: dg.estadoClave || '',
        cod_postal: dom.codPostal || '',
      }
    });
  } catch (err) {
    console.error('padron consulta error:', err.message);
    await logARCA(cliente_id, 'padron_consulta', false, `CUIT: ${cuitLimpio}`, '', err.message);
    res.status(500).json({ error: 'Error al consultar padrón: ' + err.message });
  }
});

// ─── EMITIR NOTA DE CRÉDITO EN ARCA ──────────────────────────
router.post('/emitir-nc/:cliente_id', verificarClienteId, async (req, res) => {
  const { cliente_id } = req.params;
  try {
    const {
      nota_id,
      tipo_factura_origen,
      numero_factura_origen,
      punto_venta_origen,
      receptor_cuit = '0',
      receptor_nombre = 'Consumidor Final',
      items = [],
    } = req.body;

    const cfgRes = await pool.query('SELECT * FROM arca_configuracion WHERE cliente_id=$1', [cliente_id]);
    if (cfgRes.rows.length === 0) throw new Error('Sin configuración ARCA');
    const config = cfgRes.rows[0];

    let tokenData;
    try {
      tokenData = await obtenerToken(config);
    } catch (e) {
      throw new Error('Error WSAA: ' + e.message);
    }
    await pool.query(
      'UPDATE arca_configuracion SET token_wsaa=$1, sign_wsaa=$2, token_expira=$3 WHERE cliente_id=$4',
      [tokenData.token, tokenData.sign, tokenData.expira ?? config.token_expira, cliente_id]
    );

    const tipoOrigen = parseInt(tipo_factura_origen) || 6;
    let cbteTipo;
    if ([1, 2, 3].includes(tipoOrigen))   cbteTipo = 3;
    else if ([6, 7, 8].includes(tipoOrigen)) cbteTipo = 8;
    else                                     cbteTipo = 13;

    const pventa = parseInt(punto_venta_origen) || config.punto_venta || 1;
    const wsfeUrl = config.modo === 'produccion' ? WSFE_PROD : WSFE_HOMO;

    let alicuotas = [];
    const alicMap = {};
    for (const it of items) {
      const base = it.cantidad * it.precio_unitario * (1 - (it.descuento_pct || 0) / 100);
      const alic = parseFloat(it.alicuota_iva) || 21;
      const iva  = base * (alic / 100);
      if (!alicMap[alic]) alicMap[alic] = { alicuota: alic, base: 0, iva: 0 };
      alicMap[alic].base += base;
      alicMap[alic].iva  += iva;
    }
    alicuotas = Object.values(alicMap);

    const alicGravadas = alicuotas.filter(a => a.alicuota > 0);
    const alicExentas  = alicuotas.filter(a => a.alicuota === 0);
    const impNetoGrav  = alicGravadas.reduce((s, a) => s + a.base, 0);
    const impIVA       = alicGravadas.reduce((s, a) => s + a.iva, 0);
    const impOpEx      = alicExentas.reduce((s, a) => s + a.base, 0);
    const importe_total = impNetoGrav + impIVA + impOpEx;
    const importe_neto  = impNetoGrav + impOpEx;

    const esNCA = cbteTipo === 3;
    const tieneCuit = receptor_cuit && receptor_cuit !== '0' && receptor_cuit.replace(/-/g, '').length >= 11;
    const docTipo = esNCA ? 80 : (tieneCuit ? 80 : 99);
    const docNro  = docTipo === 80 ? receptor_cuit.replace(/-/g, '') : '0';

    let ultimoNum = 0;
    const soapUltimo = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soap:Body>
    <ar:FECompUltimoAutorizado>
      <ar:Auth><ar:Token>${tokenData.token}</ar:Token><ar:Sign>${tokenData.sign}</ar:Sign><ar:Cuit>${config.cuit}</ar:Cuit></ar:Auth>
      <ar:PtoVta>${pventa}</ar:PtoVta>
      <ar:CbteTipo>${cbteTipo}</ar:CbteTipo>
    </ar:FECompUltimoAutorizado>
  </soap:Body>
</soap:Envelope>`;

    try {
      const rU = await axios.post(wsfeUrl, soapUltimo, { headers: { 'Content-Type': 'text/xml', 'SOAPAction': '' }, timeout: 10000 });
      const pU = await xml2js.parseStringPromise(rU.data, { explicitArray: false });
      const m = JSON.stringify(pU).match(/"CbteNro"\s*:\s*"?(\d+)"?/);
      if (m) ultimoNum = parseInt(m[1]);
    } catch { /* usar 0 */ }

    const nuevoNum = ultimoNum + 1;
    const fechaHoy = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    let alicIvaXml = '';
    for (const a of alicGravadas) {
      alicIvaXml += `
              <ar:AlicIva>
                <ar:Id>${alicuotaAfipId(a.alicuota)}</ar:Id>
                <ar:BaseImp>${a.base.toFixed(2)}</ar:BaseImp>
                <ar:Importe>${a.iva.toFixed(2)}</ar:Importe>
              </ar:AlicIva>`;
    }
    const bloqueIva = alicGravadas.length > 0 ? `<ar:Iva>${alicIvaXml}\n            </ar:Iva>` : '';

    const nroOrigen = parseInt(numero_factura_origen) || 0;
    const cbtesAsocXml = `
            <ar:CbtesAsoc>
              <ar:CbteAsoc>
                <ar:Tipo>${tipoOrigen}</ar:Tipo>
                <ar:PtoVta>${pventa}</ar:PtoVta>
                <ar:Nro>${nroOrigen}</ar:Nro>
              </ar:CbteAsoc>
            </ar:CbtesAsoc>`;

    const soapCAE = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soap:Body>
    <ar:FECAESolicitar>
      <ar:Auth><ar:Token>${tokenData.token}</ar:Token><ar:Sign>${tokenData.sign}</ar:Sign><ar:Cuit>${config.cuit}</ar:Cuit></ar:Auth>
      <ar:FeCAEReq>
        <ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${pventa}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo></ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            <ar:Concepto>1</ar:Concepto>
            <ar:DocTipo>${docTipo}</ar:DocTipo>
            <ar:DocNro>${docNro}</ar:DocNro>
            <ar:CbteDesde>${nuevoNum}</ar:CbteDesde>
            <ar:CbteHasta>${nuevoNum}</ar:CbteHasta>
            <ar:CbteFch>${fechaHoy}</ar:CbteFch>
            <ar:ImpTotal>${importe_total.toFixed(2)}</ar:ImpTotal>
            <ar:ImpTotConc>0.00</ar:ImpTotConc>
            <ar:ImpNeto>${impNetoGrav.toFixed(2)}</ar:ImpNeto>
            <ar:ImpOpEx>${impOpEx.toFixed(2)}</ar:ImpOpEx>
            <ar:ImpIVA>${impIVA.toFixed(2)}</ar:ImpIVA>
            <ar:ImpTrib>0.00</ar:ImpTrib>
            <ar:MonId>PES</ar:MonId>
            <ar:MonCotiz>1</ar:MonCotiz>
            ${cbtesAsocXml}
            ${bloqueIva}
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  </soap:Body>
</soap:Envelope>`;

    let cae = '', cae_vencimiento = null, resultadoOk = false;

    try {
      const rCAE = await axios.post(wsfeUrl, soapCAE, { headers: { 'Content-Type': 'text/xml', 'SOAPAction': '' }, timeout: 15000 });
      const pCAE = await xml2js.parseStringPromise(rCAE.data, { explicitArray: false });
      const xmlStr = JSON.stringify(pCAE);
      const mCAE = xmlStr.match(/"CAE"\s*:\s*"?(\d+)"?/);
      const mVto = xmlStr.match(/"CAEFchVto"\s*:\s*"?(\d{8})"?/);
      if (mCAE) { cae = mCAE[1]; resultadoOk = true; }
      if (mVto) {
        const v = mVto[1];
        cae_vencimiento = `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}`;
      }
      await logARCA(cliente_id, 'emitir_nc', resultadoOk, soapCAE.slice(0, 500), rCAE.data.slice(0, 500), '');
    } catch (e) {
      await logARCA(cliente_id, 'emitir_nc', false, soapCAE.slice(0, 500), '', e.message);
      throw new Error('Error obteniendo CAE de ARCA: ' + e.message);
    }

    if (!resultadoOk) throw new Error('ARCA no devolvió CAE');

    const prefijos = { 3: 'NCA', 8: 'NCB', 13: 'NCC' };
    const prefijo = prefijos[cbteTipo] || 'NC';
    const numero_completo = `${prefijo}-${String(pventa).padStart(4, '0')}-${String(nuevoNum).padStart(8, '0')}`;

    const compRes = await pool.query(
      `INSERT INTO arca_comprobantes
         (cliente_id, tipo_comprobante, numero_completo, punto_venta, numero,
          receptor_cuit, receptor_nombre,
          importe_neto, importe_iva, importe_total, cae, cae_vencimiento)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [cliente_id, String(cbteTipo), numero_completo, pventa, nuevoNum,
       receptor_cuit, receptor_nombre,
       importe_neto, impIVA, importe_total, cae, cae_vencimiento || null]
    );

    const iva21  = alicuotas.filter(a => a.alicuota === 21).reduce((s, a) => s + a.iva, 0);
    const iva105 = alicuotas.filter(a => a.alicuota === 10.5).reduce((s, a) => s + a.iva, 0);
    await pool.query(
      `INSERT INTO libros_iva_ventas
         (cliente_id, comprobante_id, tipo_comprobante, numero_completo,
          cuit_receptor, nombre_receptor, importe_neto, importe_iva_21, importe_iva_105, importe_total, cae)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [cliente_id, compRes.rows[0].id, String(cbteTipo), numero_completo,
       receptor_cuit, receptor_nombre,
       -(impNetoGrav + impOpEx), -iva21, -iva105, -importe_total, cae]
    );

    if (nota_id) {
      await pool.query(
        `UPDATE notas_credito SET
           numero_completo=$1, estado='emitida',
           tipo_comprobante_origen=$2, numero_comprobante_origen=$3,
           actualizado_en=now()
         WHERE id=$4 AND cliente_id=$5`,
        [numero_completo, String(tipoOrigen), String(nroOrigen), nota_id, cliente_id]
      );
    }

    res.json({
      ok: true, cae, numero_completo,
      tipo_nc: String(cbteTipo),
      vencimiento_cae: cae_vencimiento,
      importe_total: importe_total.toFixed(2),
    });
  } catch (err) {
    console.error('arca emitir-nc:', err.message);
    await logARCA(cliente_id, 'emitir_nc', false, '', '', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
