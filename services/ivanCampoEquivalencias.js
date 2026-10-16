const {leer}=require('./ivanFuncionesCatalogo');
const {errorCliente}=require('./ivanImagenesDatos');
const CAMPO_ACTUAL='obs_producto';
// OID de los tipos incorporados char, name, text, bpchar y varchar.
const TIPOS_TEXTO=new Set([18,19,25,1042,1043]);
function esUbicacion(nombre) {
  return typeof nombre==='string' && nombre.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes('ubic');
}
function identificadorSql(nombre) {
  if(typeof nombre!=='string' || !nombre || Buffer.byteLength(nombre,'utf8')>63 || nombre.includes('\0'))throw errorCliente('Campo de equivalencias inválido.');
  return '"'+nombre.replace(/"/g,'""')+'"';
}
async function camposDisponibles(db) {
  try {
    // Misma vista y permisos que el catálogo. No devuelve filas de productos ni
    // depende de to_regclass, ausente en versiones antiguas de PostgreSQL.
    const r=await db.query('SELECT * FROM "viewProductos" LIMIT 0');
    if(!Array.isArray(r.fields))throw errorCliente('No se pudo comprobar la estructura del catálogo. Se conserva la configuración actual.',503);
    const candidatos=r.fields.filter(campo=>campo.name===CAMPO_ACTUAL || esUbicacion(campo.name));
    const tiposTexto=new Set(TIPOS_TEXTO);
    const otrosTipos=[...new Set(candidatos.map(campo=>campo.dataTypeID).filter(tipo=>!tiposTexto.has(tipo)))];
    if(otrosTipos.length){
      // Conserva también tipos de texto personalizados admitidos anteriormente.
      const tipos=await db.query("SELECT oid FROM pg_type WHERE oid=ANY($1::oid[]) AND typcategory='S'",[otrosTipos]);
      tipos.rows.forEach(tipo=>tiposTexto.add(Number(tipo.oid)));
    }
    return candidatos.filter(campo=>tiposTexto.has(campo.dataTypeID)).map(campo=>campo.name);
  } catch(e) {
    if(e.status)throw e;
    const codigo=typeof e.code==='string' && /^[0-9A-Z]{5}$/.test(e.code)?e.code:null;
    // Solo código SQL: nunca errores crudos que puedan contener datos de conexión.
    console.error('[IVAN_EQUIVALENCIAS] No se pudo consultar la estructura de viewProductos.',{codigo:codigo || 'SIN_CODIGO_SQL'});
    const mensaje=codigo==='42P01'?'No se encontró la vista viewProductos en la base de este mayorista.':codigo==='42501'?'La base de este mayorista no permite consultar la vista del catálogo.':'No se pudieron consultar los campos de la vista del catálogo.';
    throw errorCliente(mensaje+' Se conserva la configuración actual.'+(codigo?' Código de consulta: '+codigo+'.':''),503);
  }
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
