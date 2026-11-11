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
