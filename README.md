# API de Gestión de Tareas Académicas

API REST construida con Node.js y Express para administrar tareas académicas. La colección Postman comprueba flujos correctos y respuestas de error con Newman. GitHub Actions ejecuta la colección en cada push y pull request a `main`; Render está configurado para desplegar una revisión después de que pasen las verificaciones de CI.

## Arquitectura

```text
Cliente HTTP / Postman
        │ JSON
        ▼
Express (src/app.js) ── validación y errores HTTP
        │
        └── almacenamiento en memoria (Map)

GitHub Actions ── npm ci ── API ── Newman ── artefacto JSON
Render Blueprint ── Node.js / npm ci ── npm start ── /health
```

La aplicación escucha en `0.0.0.0` y usa la variable `PORT` que proporciona Render. La implementación actual conserva las tareas en memoria: el conjunto de datos se reinicia al reiniciar o volver a desplegar el servicio. Es apropiado para una demostración y para probar la API, pero no ofrece persistencia de producción.

## Endpoints

Todas las respuestas de recursos usan el contenedor `{ "data": ... }`. Los errores usan `{ "error": { "code", "message", "details?" } }`.

| Método | Ruta | Descripción | Respuestas principales |
|---|---|---|---|
| `GET` | `/health` | Estado del servicio | `200` |
| `GET` | `/api/tasks` | Lista tareas; admite `?status=` y `?subject=` | `200` |
| `GET` | `/api/tasks/:id` | Obtiene una tarea | `200`, `404` |
| `POST` | `/api/tasks` | Crea una tarea | `201`, `400` |
| `PATCH` | `/api/tasks/:id` | Actualiza parcialmente una tarea | `200`, `400`, `404` |
| `DELETE` | `/api/tasks/:id` | Elimina una tarea | `204`, `404` |

Ejemplo de creación:

```json
{
  "title": "Entregar informe de laboratorio",
  "description": "Preparar resultados y conclusiones",
  "subject": "Biología",
  "dueDate": "2030-06-15",
  "priority": "alta"
}
```

`title` es obligatorio y debe tener entre 3 y 120 caracteres. `description` admite hasta 1000 caracteres; `subject`, hasta 80. `dueDate` debe tener formato `AAAA-MM-DD` y ser una fecha válida. `priority` admite `baja`, `media` o `alta`; `status`, `pendiente`, `en_progreso` o `completada`. Los valores predeterminados son descripción y asignatura vacías, prioridad `media` y estado `pendiente`. Se rechazan propiedades desconocidas y actualizaciones `PATCH` vacías. El límite del cuerpo JSON es 32 KB.

## Requisitos e instalación

Requiere Node.js 20 o posterior y npm.

```bash
git clone https://github.com/anaesteban1/api-testing-newman-github-actions.git
cd api-testing-newman-github-actions
npm ci
npm start
```

La API local queda disponible en `http://localhost:3000`. Comprueba la disponibilidad con `GET http://localhost:3000/health`. En desarrollo puede usarse `npm run dev`.

## Pruebas automatizadas

La colección versionada está en `postman/gestion-tareas.postman_collection.json`. Contiene 20 solicitudes secuenciales: salud, listado, creación, consulta, filtros, actualización, eliminación, validaciones, JSON malformado y rutas o recursos inexistentes.

Con la API ejecutándose en otra terminal:

```bash
npm run test:newman
```

Para ejecutar la misma colección contra otra URL:

```bash
npx newman run postman/gestion-tareas.postman_collection.json \
  --env-var "baseUrl=https://TU-SERVICIO.onrender.com" \
  --reporters cli,json \
  --reporter-json-export reports/newman.json
```

El archivo `reports/newman.json` se genera localmente y está excluido de Git. La API comienza cada proceso con memoria vacía, por lo que la colección es repetible.

## Integración y despliegue continuo

`.github/workflows/ci.yml` instala las dependencias con `npm ci`, inicia la API, espera `/health`, ejecuta Newman y publica `newman.json` como artefacto de GitHub Actions incluso si una etapa falla. El artefacto se conserva 30 días.

`render.yaml` define un servicio web Node.js en el plan gratuito, con `npm ci`, `npm start` y `/health` como health check. El Blueprint está vinculado al repositorio y a `main`; `autoDeployTrigger: checksPass` hace que Render espere a que pasen las verificaciones de CI del commit antes del despliegue automático.

## Resultados verificados

- Ejecución local de Newman: **20 solicitudes, 20 aserciones aprobadas y 0 fallidas**.
- La ruta `/health` respondió `200` con `{"status":"ok","service":"gestion-tareas-academicas"}`.
- Prueba de producción: **20 solicitudes, 20 aserciones aprobadas y 0 fallidas** contra Render. El primer `/health` respondió `200`; el servicio está en plan gratuito.
- GitHub Actions: ejecución real **correcta** para el commit `97e04e2` ([run 42977879556](https://github.com/anaesteban1/api-testing-newman-github-actions/actions/runs/42977879556)); instalación, health check, Newman y publicación del artefacto concluyeron correctamente.
- Enlace del repositorio: <https://github.com/anaesteban1/api-testing-newman-github-actions>
- URL pública de Render: <https://gestion-tareas-academicas.onrender.com>

Newman usa dependencias de desarrollo con avisos de vulnerabilidad reportados por `npm audit`; las dependencias de producción (`npm audit --omit=dev`) no reportan vulnerabilidades. No se aplicaron actualizaciones forzadas que sustituyen Newman por una versión principal anterior.

## Estructura

```text
src/app.js                              rutas, validación y manejo de errores
src/server.js                           arranque y cierre ordenado
postman/gestion-tareas.postman_collection.json
.github/workflows/ci.yml                integración continua y artefactos
render.yaml                             configuración declarativa de Render
```
