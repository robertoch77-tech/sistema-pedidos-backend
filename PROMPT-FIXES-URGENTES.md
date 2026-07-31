# FIXES URGENTES — 4 CORRECCIONES + GITHUB FRONTEND

## ARCHIVOS QUE NO DEBES TOCAR (SISTEMA IVAN):
db.js, routes/auth.js, routes/mayoristas.js, routes/admin.js, Login.tsx, ClienteHome.tsx, Admin.tsx, Catalogo.tsx

---

## FIX 1 — IMPORTACIÓN DE CLIENTES: 2421 ERRORES

### Problema:
El frontend (paso 1.5) deja al usuario elegir manualmente la fila de encabezado. Pero cuando envía el archivo al backend, el backend re-detecta el encabezado por su cuenta con `detectarEncabezado()`. Si detectan filas diferentes, los nombres de columna del mapeo no coinciden con los del backend → `nombre` queda vacío → TODAS las filas dan error.

### Fix en el FRONTEND — `src/pages/roberto/clientes/RobertoClientes.tsx`:

En la función `importar()`, agregar `filaEncabezado` al FormData:

```javascript
// BUSCAR esta línea (dentro de la función importar):
fd.append('conflicto', conflicto);

// AGREGAR DESPUÉS:
fd.append('filaEncabezado', String(filaEncabezado));
```

### Fix en el BACKEND — `routes/superadmin/importador-entidades.js`:

En el endpoint `POST /clientes/:clienteId/importar` (línea ~80), el backend debe usar el filaEncabezado del frontend si viene:

```javascript
// BUSCAR esta línea (dentro del endpoint /importar):
const { columnas, dataFilas, colPosMap } = analizarArchivo(req.file.buffer);

// REEMPLAZAR POR:
const filaEncabezadoManual = req.body.filaEncabezado != null ? parseInt(req.body.filaEncabezado) : null;
const { columnas, dataFilas, colPosMap } = analizarArchivo(req.file.buffer, filaEncabezadoManual);
```

Y modificar la función `analizarArchivo` para aceptar un índice manual:

```javascript
// BUSCAR la firma actual:
function analizarArchivo(buffer) {

// REEMPLAZAR POR:
function analizarArchivo(buffer, filaEncabezadoManual = null) {
```

Dentro de esa función, cambiar la detección de encabezado:

```javascript
// BUSCAR:
const idxEnc   = detectarEncabezado(filas);

// REEMPLAZAR POR:
const idxEnc = (filaEncabezadoManual != null && filaEncabezadoManual >= 0 && filaEncabezadoManual < filas.length) 
  ? filaEncabezadoManual 
  : detectarEncabezado(filas);
```

### MISMO FIX para proveedores:

En el FRONTEND — `src/pages/roberto/proveedores/RobertoProveedores.tsx`:
Buscar la función importar y agregar `fd.append('filaEncabezado', String(filaEncabezado));` después de `fd.append('conflicto', conflicto);`

En el BACKEND — en el endpoint `POST /proveedores/:clienteId/importar` del mismo archivo `importador-entidades.js`:
Hacer el mismo cambio: leer `filaEncabezadoManual` del body y pasarlo a `analizarArchivo`.

---

## FIX 2 — ELIMINAR PRODUCTOS CON VENTAS ASOCIADAS

### Problema:
Al intentar eliminar un producto que tiene ventas registradas (`ventas_items`), el backend da error 500 por FK constraint.

### Fix en el BACKEND — `routes/superadmin/eliminar-registro.js`:

Agregar verificación ANTES del DELETE. Buscar donde se hace el DELETE de `productos_propios` y agregar antes:

```javascript
// Si la tabla es productos_propios, verificar que no tenga ventas
if (tabla === 'productos_propios') {
  const refs = await pool.query(
    'SELECT COUNT(*) as cnt FROM ventas_items WHERE producto_id = $1', [id]
  );
  if (parseInt(refs.rows[0].cnt) > 0) {
    return res.status(400).json({ 
      mensaje: `No se puede eliminar: el producto tiene ${refs.rows[0].cnt} venta(s) asociada(s). Desactivalo en su lugar.` 
    });
  }
}
```

### TAMBIÉN en la ruta DELETE /productos del importador.js:

Buscar donde se ejecuta `DELETE FROM productos_propios` en la ruta de eliminar productos individuales y envolver en try/catch que devuelva mensaje claro si hay FK error:

```javascript
// En el catch del DELETE:
if (err.code === '23503') {
  return res.status(400).json({ error: 'No se puede eliminar: el producto tiene ventas asociadas.' });
}
```

---

## FIX 3 — PRODUCTOS: EVITAR DUPLICADOS AL RE-IMPORTAR CON PROVEEDOR

### Problema:
Al importar productos con proveedor (ej: "FERRETERIA GONGORA"), el sistema crea "FG-10279" la primera vez (CASO 2). Pero al buscar en existMap usa el código crudo "10279" del Excel, no encuentra "FG-10279", y crea duplicados.

### Fix en el BACKEND — `routes/superadmin/importador.js`:

En la ruta POST de importación masiva (la que tiene los 3 CASOS), DESPUÉS de calcular el `key`:

```javascript
// BUSCAR estas líneas (aprox línea 1501-1502):
const codigo = val(fila, mapeo.codigo, enc) || null;
const key = codigo ? codigo.trim().toUpperCase() : null;

// AGREGAR DESPUÉS:
// Si no encontramos el código crudo, buscar con el prefijo del proveedor
const prefixedKey = (key && prefix) ? `${prefix}-${key}` : null;
const effectiveKey = (key && !existMap.has(key) && prefixedKey && existMap.has(prefixedKey)) ? prefixedKey : key;
```

Luego reemplazar TODAS las referencias a `key` en la lógica de CASO 1/2/3 por `effectiveKey`:

```javascript
// CAMBIAR:
if (key && existMap.has(key)) {
  const existing = existMap.get(key);

// POR:
if (effectiveKey && existMap.has(effectiveKey)) {
  const existing = existMap.get(effectiveKey);
```

Y en CASO 3, usar el código prefijado si hay proveedor:

```javascript
// CASO 3 — código nuevo: insertar con prefijo si hay proveedor
const codigoFinal = prefix ? `${prefix}-${codigo}` : codigo;
// Y usar codigoFinal en el INSERT en lugar de codigo
```

Y al final del CASO 3 actualizar existMap con el código correcto:

```javascript
const finalKey = codigoFinal ? codigoFinal.trim().toUpperCase() : null;
if (finalKey) existMap.set(finalKey, { id: ins.rows[0].id, proveedor_id });
```

---

## FIX 4 — FRONTEND A GITHUB

En la carpeta `C:\Users\Usuario\sistema-pedidos`, ejecutar:

```bash
# Verificar si ya hay remote
git remote -v

# Si no hay remote de GitHub:
# 1. Crear repo en GitHub (puede ser privado) llamado "sistema-pedidos"
# 2. Agregar remote:
git remote add origin https://github.com/TU_USUARIO/sistema-pedidos.git
git branch -M master
git push -u origin master
```

Si ya hay un .gitignore, verificar que incluya:
```
node_modules/
dist/
build/
.env
```

IMPORTANTE: NO hagas ningún cambio en el código para esto, solo configura git.

---

## DESPUÉS DE APLICAR LOS 4 FIXES:

1. En el BACKEND: `git add -A && git commit -m "fix: importacion clientes, eliminacion productos, duplicados importacion" && git push origin main`
2. En el FRONTEND: `npm run build` y deploy manual a Netlify (drag-drop del dist/)
3. Los cambios que YA ESTÁN en el frontend (IVA discriminar, gestión claves movida a superadmin) se deployan con este mismo build.
