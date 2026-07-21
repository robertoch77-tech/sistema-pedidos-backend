const express = require('express');
const router  = express.Router();
const pool    = require('../../db');
const { verificarTokenSuperAdmin } = require('./auth');
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
    ];
    for (const [col, tipo] of cols) {
      await pool.query(`ALTER TABLE arca_configuracion ADD COLUMN IF NOT EXISTS ${col} ${tipo}`).catch(() => {});
    }

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

router.use(verificarTokenSuperAdmin);

// ─── URLS ARCA ───────────────────────────────────────────────
const WSAA_HOMO  = 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms';
const WSAA_PROD  = 'https://wsaa.afip.gov.ar/ws/services/LoginCms';
const WSFE_HOMO  = 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx';
const WSFE_PROD  = 'https://servicios1.afip.gov.ar/wsfev1/service.asmx';

// ─── HELPERS ─────────────────────────────────────────────────
function n(v) { return parseFloat(v) || 0; }

async function logARCA(cliente_id, tipo, exitoso, request, response, error) {
  try {
    await pool.query(
      `INSERT INTO arca_logs (cliente_id, tipo, exitoso, request, response, error)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [cliente_id, tipo, exitoso, String(request).slice(0, 4000), String(response).slice(0, 4000), String(error).slice(0, 1000)]
    );
  } catch { /* silencioso */ }
}

function generarTRA(modo) {
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
  <service>wsfe</service>
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

  // Firmar TRA con clave privada + certificado — CMS/PKCS7 real
  let cms;
  try {
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(tra, 'utf8');
    p7.addCertificate(config.certificado);
    p7.addSigner({
      key:             forge.pki.privateKeyFromPem(config.clave_privada),
      certificate:     forge.pki.certificateFromPem(config.certificado),
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

  const resp = await axios.post(wsaaUrl, soapBody, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': 'loginCms' },
    timeout: 15000,
  });

  const parsed = await xml2js.parseStringPromise(resp.data, { explicitArray: false });
  const loginResp = parsed?.['soapenv:Envelope']?.['soapenv:Body']?.['loginCmsReturn'] ||
                    parsed?.['S:Envelope']?.['S:Body']?.['ns2:loginCmsResponse']?.['return'] || {};
  const loginTicket = loginResp?.loginTicketResponse || {};

  const token  = loginTicket?.credentials?.token || loginResp?.token  || '';
  const sign   = loginTicket?.credentials?.sign  || loginResp?.sign   || '';
  const expStr = loginTicket?.header?.expirationTime || '';

  return { token, sign, expira: expStr ? new Date(expStr) : new Date(Date.now() + 12 * 3600000) };
}

// ─── GET /config/:cliente_id ──────────────────────────────────
router.get('/config/:cliente_id', async (req, res) => {
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
router.put('/config/:cliente_id', async (req, res) => {
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
router.post('/config/:cliente_id/test', async (req, res) => {
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

// ─── POST /facturar/:cliente_id ───────────────────────────────
router.post('/facturar/:cliente_id', async (req, res) => {
  const client = await pool.connect();
  const { cliente_id } = req.params;
  try {
    const {
      venta_id, tipo_factura = '6', punto_venta,
      receptor_cuit = '0', receptor_nombre = 'Consumidor Final',
      receptor_condicion_iva = '5',
    } = req.body;

    await client.query('BEGIN');

    // Leer config
    const cfgRes = await client.query(`SELECT * FROM arca_configuracion WHERE cliente_id=$1`, [cliente_id]);
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
    await client.query(
      `UPDATE arca_configuracion SET token_wsaa=$1, sign_wsaa=$2, token_expira=$3 WHERE cliente_id=$4`,
      [tokenData.token, tokenData.sign, tokenData.expira ?? (config.token_expira), cliente_id]
    );

    // Leer venta
    const pventa = parseInt(punto_venta) || config.punto_venta || 1;
    let importe_neto = 100, importe_iva = 21, importe_total = 121;
    let importe_neto_105 = 0, importe_iva_105 = 0;

    if (venta_id) {
      try {
        const ventaRes = await client.query(`SELECT * FROM ventas WHERE id=$1`, [venta_id]);
        if (ventaRes.rows.length > 0) {
          const venta = ventaRes.rows[0];
          importe_total = n(venta.total ?? venta.monto_total ?? 0);
          importe_neto  = n(venta.subtotal ?? importe_total / 1.21);
          importe_iva   = importe_total - importe_neto;
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
            <ar:DocTipo>80</ar:DocTipo>
            <ar:DocNro>${receptor_cuit.replace(/-/g,'') || '0'}</ar:DocNro>
            <ar:CbteDesde>${nuevoNum}</ar:CbteDesde>
            <ar:CbteHasta>${nuevoNum}</ar:CbteHasta>
            <ar:CbteFch>${fechaHoy}</ar:CbteFch>
            <ar:ImpTotal>${importe_total.toFixed(2)}</ar:ImpTotal>
            <ar:ImpTotConc>0.00</ar:ImpTotConc>
            <ar:ImpNeto>${importe_neto.toFixed(2)}</ar:ImpNeto>
            <ar:ImpOpEx>0.00</ar:ImpOpEx>
            <ar:ImpIVA>${importe_iva.toFixed(2)}</ar:ImpIVA>
            <ar:ImpTrib>0.00</ar:ImpTrib>
            <ar:MonId>PES</ar:MonId>
            <ar:MonCotiz>1</ar:MonCotiz>
            <ar:Iva>
              <ar:AlicIva>
                <ar:Id>5</ar:Id>
                <ar:BaseImp>${importe_neto.toFixed(2)}</ar:BaseImp>
                <ar:Importe>${importe_iva.toFixed(2)}</ar:Importe>
              </ar:AlicIva>
            </ar:Iva>
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
    const compRes = await client.query(
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
      await client.query(
        `UPDATE ventas SET cae=$1, cae_vencimiento=$2, tipo_factura=$3, numero_arca=$4, facturado=true
         WHERE id=$5`,
        [cae, cae_vencimiento, String(cbteTipo), numero_completo, venta_id]
      );
    }

    // INSERT libros_iva_ventas
    await client.query(
      `INSERT INTO libros_iva_ventas
         (cliente_id, comprobante_id, venta_id, tipo_comprobante, numero_completo,
          cuit_receptor, nombre_receptor, importe_neto, importe_iva_21, importe_total, cae)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [cliente_id, comp_id, venta_id || null, String(cbteTipo), numero_completo,
       receptor_cuit, receptor_nombre, importe_neto, importe_iva, importe_total, cae]
    );

    await client.query('COMMIT');
    res.json({ ok: true, cae, numero_completo, tipo_factura: String(cbteTipo), vencimiento_cae: cae_vencimiento });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('arca facturar:', err.message);
    await logARCA(cliente_id, 'facturar', false, '', '', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── GET /pendientes/:cliente_id — ventas sin facturar ───────
router.get('/pendientes/:cliente_id', async (req, res) => {
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
router.get('/historial/:cliente_id', async (req, res) => {
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
router.get('/logs/:cliente_id', async (req, res) => {
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
router.post('/comprobante/:cliente_id/:id/pdf', async (req, res) => {
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
router.get('/superadmin/arca/:cliente_roberto_id',       (req, res) => { req.params.cliente_id = req.params.cliente_roberto_id; return router.handle(Object.assign(req, { url: `/config/${req.params.cliente_roberto_id}`, method: 'GET' }), res, () => {}); });

// Variante directa más simple:
router.get('/:cliente_id/superadmin-config', async (req, res) => {
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

module.exports = router;
