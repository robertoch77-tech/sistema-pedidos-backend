# Rutinas — Sistema Pedidos

---

## Nombre: Sistema Pedidos - Revisión Diaria

**Instrucciones:**
Revisar el estado del sistema sistema-pedidos.
PROYECTO FRONTEND: C:\Users\Usuario\sistema-pedidos
PROYECTO BACKEND: C:\Users\Usuario\sistema-pedidos-backend

1. Verificar que el backend arranca sin errores:
   cd C:\Users\Usuario\sistema-pedidos-backend
   node --check index.js

2. Verificar que el frontend compila sin errores:
   cd C:\Users\Usuario\sistema-pedidos
   npx tsc --noEmit

3. Listar todas las ramas abiertas en ambos repos
   que NO sean main/master

4. Verificar que db.js no fue modificado respecto
   a main/master

5. Reportar en español qué encontró y si hay
   algo que requiere atención.

NO modificar nada. Solo reportar.

**Activador:** Programación — todos los días a las 9 AM

---

## Nombre: Sistema Pedidos - Pre Deploy

**Instrucciones:**
Verificar que todo está listo para deploy.
PROYECTO FRONTEND: C:\Users\Usuario\sistema-pedidos
PROYECTO BACKEND: C:\Users\Usuario\sistema-pedidos-backend

1. Confirmar que db.js no fue modificado
   git diff main -- db.js (backend)

2. Confirmar que auth.js no fue modificado
   en la lógica de login y JWT

3. Confirmar que ?m=codigo no fue tocado
   en ningún archivo modificado

4. npm run build en el frontend
   Reportar si compila con errores o warnings

5. node --check en todos los archivos del backend

6. Listar exactamente qué archivos cambiaron
   respecto a main/master

7. Dar veredicto final:
   LISTO PARA DEPLOY o HAY PROBLEMAS — con detalle

NO modificar nada. Solo verificar y reportar.

**Activador:** Manual — antes de cada push

---

## Nombre: Sistema Pedidos - Pendientes Semanales

**Instrucciones:**
Revisar el estado del desarrollo de sistema-pedidos.
PROYECTO FRONTEND: C:\Users\Usuario\sistema-pedidos
PROYECTO BACKEND: C:\Users\Usuario\sistema-pedidos-backend

1. Listar todas las ramas feature abiertas
   en ambos repos con su fecha de creación

2. Verificar cuáles están mergeadas en main/master
   y cuáles no

3. Listar archivos nuevos creados en el último mes
   que no existan en main/master

4. Verificar que package.json del frontend
   no tiene dependencias sin usar

5. Reportar en español:
   - Qué está pendiente de merge
   - Qué ramas se pueden limpiar
   - Si hay algo que podría causar problemas

NO modificar nada. Solo reportar.

**Activador:** Programación — todos los lunes a las 9 AM

---

## Nombre: Sistema Pedidos - Errores Producción

**Instrucciones:**
Analizar si hay errores en el sistema en producción.
PROYECTO BACKEND: C:\Users\Usuario\sistema-pedidos-backend

1. Verificar los últimos commits en main
   git log --oneline -10

2. Verificar que todos los endpoints nuevos
   tienen su ruta registrada en index.js

3. Verificar que todas las rutas nuevas del frontend
   están registradas en App.tsx

4. Verificar que no hay endpoints duplicados
   en ningún archivo de routes/

5. Reportar en español cualquier inconsistencia
   que encuentre.

NO modificar nada. Solo reportar.

**Activador:** Manual — cuando hay un error en producción
