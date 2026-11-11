const express = require('express');
const { randomUUID } = require('node:crypto');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

const tasks = new Map();
const priorities = new Set(['baja', 'media', 'alta']);
const statuses = new Set(['pendiente', 'en_progreso', 'completada']);
const fields = new Set(['title', 'description', 'subject', 'dueDate', 'priority', 'status']);

function validateTask(input, { partial = false } = {}) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return ['El cuerpo debe ser un objeto JSON.'];
  }
  const unknown = Object.keys(input).filter((key) => !fields.has(key));
  if (unknown.length) errors.push(`Campos no permitidos: ${unknown.join(', ')}.`);
  if (partial && Object.keys(input).length === 0) errors.push('Debe incluir al menos un campo para actualizar.');
  if (!partial && !Object.hasOwn(input, 'title')) errors.push('El título es obligatorio.');
  if (Object.hasOwn(input, 'title') || (!partial && !Object.hasOwn(input, 'title'))) {
    if (typeof input.title !== 'string' || input.title.trim().length < 3 || input.title.trim().length > 120) {
      errors.push('El título debe tener entre 3 y 120 caracteres.');
    }
  }
  for (const key of ['description', 'subject']) {
    if (Object.hasOwn(input, key) && (typeof input[key] !== 'string' || input[key].trim().length > (key === 'description' ? 1000 : 80))) {
      errors.push(`${key} debe ser texto y no superar ${key === 'description' ? 1000 : 80} caracteres.`);
    }
  }
  if (Object.hasOwn(input, 'priority') && !priorities.has(input.priority)) errors.push('La prioridad debe ser baja, media o alta.');
  if (Object.hasOwn(input, 'status') && !statuses.has(input.status)) errors.push('El estado debe ser pendiente, en_progreso o completada.');
  if (Object.hasOwn(input, 'dueDate') && (typeof input.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) || Number.isNaN(Date.parse(`${input.dueDate}T00:00:00Z`)) || new Date(`${input.dueDate}T00:00:00Z`).toISOString().slice(0, 10) !== input.dueDate)) {
    errors.push('dueDate debe ser una fecha válida en formato AAAA-MM-DD.');
  }
  return errors;
}

function normalize(input) {
  const result = { ...input };
  if (typeof result.title === 'string') result.title = result.title.trim();
  if (typeof result.description === 'string') result.description = result.description.trim();
  if (typeof result.subject === 'string') result.subject = result.subject.trim();
  return result;
}

app.get('/health', (_req, res) => res.status(200).json({ status: 'ok', service: 'gestion-tareas-academicas' }));

app.get('/', (_req, res) => res.type('html').send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="API REST para organizar y consultar tareas académicas.">
  <title>Gestión de Tareas Académicas · API</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; background: #f4f7fb; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(ellipse at 50% 0, #e2ecff 0, transparent 48%), #f4f7fb; }
    main { width: min(820px, calc(100% - 32px)); margin: 0 auto; padding: 72px 0 56px; }
    .hero, .panel { border: 1px solid #e1e7f0; border-radius: 20px; background: #fff; box-shadow: 0 16px 48px #22345b0d; }
    .hero { padding: clamp(28px, 6vw, 52px); }
    .eyebrow { color: #425fc5; font-size: 12px; font-weight: 750; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 14px 0 12px; max-width: 620px; font-size: clamp(32px, 6vw, 48px); line-height: 1.08; letter-spacing: -.04em; }
    .intro { max-width: 620px; color: #596579; font-size: 17px; line-height: 1.7; }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 26px; }
    .button { display: inline-flex; align-items: center; min-height: 44px; padding: 0 17px; border-radius: 10px; background: #3558c8; color: #fff; font-weight: 650; text-decoration: none; }
    .button.secondary { border: 1px solid #dce3ef; background: #fff; color: #26344d; }
    .panel { margin-top: 20px; padding: 26px clamp(22px, 5vw, 36px); }
    h2 { margin: 0 0 17px; font-size: 18px; }
    ul { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
    li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 9px; color: #596579; line-height: 1.5; }
    .method { min-width: 57px; color: #27634c; font: 700 12px ui-monospace, SFMono-Regular, Consolas, monospace; }
    code { color: #202d44; font-size: 13px; }
    a.endpoint { color: #3156bd; text-decoration-thickness: 1px; text-underline-offset: 3px; }
    footer { padding: 22px 4px 0; color: #778196; font-size: 13px; }
  </style>
</head>
<body>
  <main>
    <section class="hero" aria-labelledby="welcome-title">
      <div class="eyebrow">API REST · Node.js</div>
      <h1 id="welcome-title">Gestión de Tareas Académicas</h1>
      <p class="intro">Organiza tus actividades académicas desde una API sencilla. Consulta tareas, filtra por asignatura o estado y gestiona cada tarea mediante solicitudes HTTP.</p>
      <div class="actions">
        <a class="button" href="/api/tasks">Explorar tareas</a>
        <a class="button secondary" href="/health">Estado del servicio</a>
      </div>
    </section>
    <section class="panel" aria-labelledby="endpoints-title">
      <h2 id="endpoints-title">Endpoints disponibles</h2>
      <ul>
        <li><span class="method">GET</span><a class="endpoint" href="/health"><code>/health</code></a><span>Estado de la API.</span></li>
        <li><span class="method">GET</span><a class="endpoint" href="/api/tasks"><code>/api/tasks</code></a><span>Lista tareas; admite filtros <code>?status=</code> y <code>?subject=</code>.</span></li>
        <li><span class="method">GET</span><code>/api/tasks/:id</code><span>Consulta una tarea por su identificador.</span></li>
        <li><span class="method">POST</span><a class="endpoint" href="/api/tasks"><code>/api/tasks</code></a><span>Crea una tarea.</span></li>
        <li><span class="method">PATCH</span><code>/api/tasks/:id</code><span>Actualiza parcialmente una tarea.</span></li>
        <li><span class="method">DELETE</span><code>/api/tasks/:id</code><span>Elimina una tarea.</span></li>
      </ul>
    </section>
    <footer>Las operaciones de creación, actualización y eliminación se realizan con el método HTTP indicado.</footer>
  </main>
</body>
</html>`));

app.get('/api/tasks', (req, res) => {
  let result = [...tasks.values()];
  if (req.query.status) result = result.filter((task) => task.status === req.query.status);
  if (req.query.subject) result = result.filter((task) => task.subject?.toLowerCase() === String(req.query.subject).toLowerCase());
  res.json({ data: result, total: result.length });
});

app.get('/api/tasks/:id', (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: { code: 'TASK_NOT_FOUND', message: 'No se encontró la tarea solicitada.' } });
  return res.json({ data: task });
});

app.post('/api/tasks', (req, res) => {
  const errors = validateTask(req.body);
  if (errors.length) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Los datos enviados no son válidos.', details: errors } });
  const now = new Date().toISOString();
  const task = { id: randomUUID(), description: '', subject: '', priority: 'media', status: 'pendiente', ...normalize(req.body), createdAt: now, updatedAt: now };
  tasks.set(task.id, task);
  return res.status(201).location(`/api/tasks/${task.id}`).json({ data: task });
});

app.patch('/api/tasks/:id', (req, res) => {
  const current = tasks.get(req.params.id);
  if (!current) return res.status(404).json({ error: { code: 'TASK_NOT_FOUND', message: 'No se encontró la tarea solicitada.' } });
  const errors = validateTask(req.body, { partial: true });
  if (errors.length) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Los datos enviados no son válidos.', details: errors } });
  const updated = { ...current, ...normalize(req.body), updatedAt: new Date().toISOString() };
  tasks.set(updated.id, updated);
  return res.json({ data: updated });
});

app.delete('/api/tasks/:id', (req, res) => {
  if (!tasks.has(req.params.id)) return res.status(404).json({ error: { code: 'TASK_NOT_FOUND', message: 'No se encontró la tarea solicitada.' } });
  tasks.delete(req.params.id);
  return res.status(204).end();
});

app.use((_req, res) => res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: 'La ruta solicitada no existe.' } }));
app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'El cuerpo debe contener JSON válido.' } });
  }
  if (err.type === 'entity.too.large') return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'El cuerpo supera el límite permitido.' } });
  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error interno.' } });
});

module.exports = app;
