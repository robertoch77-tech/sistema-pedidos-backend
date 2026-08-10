# PROMPT: Commit + Push — Fix endpoints POST/PUT productos

## CAMBIOS YA APLICADOS (solo commit + push)

### Archivo: `routes/superadmin/importador.js`

**3 correcciones:**

1. **POST /productos/:cliente_id (crear producto, línea ~782)**
   - Agregado `utilidad_3` y `precio_venta_3` al destructuring y al INSERT
   - Antes: no recibía utilidad_3 ni precio_venta_3 → quedaban en 0/null
   - Ahora: los 31 campos se insertan correctamente

2. **PUT /productos/:cliente_id/:id (editar producto, línea ~827)**
   - Agregado `utilidad_3` y `precio_venta_3` al destructuring y al UPDATE
   - Antes: no actualizaba estos campos
   - Ahora: los 32 parámetros se actualizan correctamente

3. **PUT /actualizar-precios-v2 (edición modal + inline, línea ~1722)**
   - Agregado `precio_costo_final` al UPDATE con COALESCE
   - Antes: pcFinal NUNCA se actualizaba → quedaba desincronizado con costo/descuentos
   - Ahora: 23 parámetros, pcFinal se actualiza cuando el frontend lo envía

### NO SE TOCA:
- db.js, routes/auth.js, routes/mayoristas.js, routes/admin.js
- Ningún archivo frontend
- El endpoint de importación Excel
- La fórmula de recálculo del importador (ya corregida con IVA)

## Ejecutar:

```bash
cd C:\Users\Usuario\sistema-pedidos-backend
git add -A && git commit -m "fix: agregar utilidad_3, pv3 y pcFinal a endpoints POST/PUT productos" && git push origin main
```

Render despliega automáticamente con el push.
