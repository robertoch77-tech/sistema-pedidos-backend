const {leer}=require('./ivanFuncionesCatalogo');
const {errorCliente}=require('./ivanImagenesDatos');
const CAMPO_ACTUAL='obs_producto';
function esUbicacion(nombre) {
  return typeof nombre==='string' && nombre.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes('ubic');
}
function identificadorSql(nombre) {
  if(typeof nombre!=='string' || !nombre || Buffer.byteLength(nombre,'utf8')>63 || nombre.includes('\0'))throw errorCliente('Campo de equivalencias inválido.');
  return '"'+nombre.replace(/"/g,'""')+'"';
}
async function camposDisponibles(db) {
  const r=await db.query(`SELECT a.attname AS nombre FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid WHERE a.attrelid=to_regclass('"viewProductos"') AND a.attnum>0 AND NOT a.attisdropped AND t.typcategory='S' ORDER BY a.attnum`);
  return r.rows.map(r=>r.nombre).filter(nombre=>nombre===CAMPO_ACTUAL || esUbicacion(nombre));
}
async function validarCampo(db,campo) {
  identificadorSql(campo);
  if(campo===CAMPO_ACTUAL)return campo;
  if(!esUbicacion(campo) || !(await camposDisponibles(db)).includes(campo))throw errorCliente('Ese campo de Ubicación no está disponible en la vista del catálogo. No se guardaron cambios.',409);
  return campo;
}
async function resolverCampo(db,mayoristaId,obsDisponible) {
  try {
    const cfg=await leer(mayoristaId);
    const campo=cfg.equivalencias_campo || CAMPO_ACTUAL;
    if(campo===CAMPO_ACTUAL)return obsDisponible?CAMPO_ACTUAL:null;
    if(!esUbicacion(campo))return null;
    return (await camposDisponibles(db)).includes(campo)?campo:null;
  } catch {
    // Una fuente no comprobada no produce equivalencias ni bloquea el catálogo.
    return null;
  }
}
function seleccionGrupo(campo) {
  return campo?', '+identificadorSql(campo)+' AS equivalencia_grupo':', NULL::text AS equivalencia_grupo';
}
module.exports={CAMPO_ACTUAL,esUbicacion,identificadorSql,camposDisponibles,validarCampo,resolverCampo,seleccionGrupo};
