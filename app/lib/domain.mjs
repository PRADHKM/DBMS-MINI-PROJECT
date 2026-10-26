export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function fail(status, message) { throw new HttpError(status, message); }
export function parseId(value, name = 'id') {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) fail(400, `${name} must be a positive integer`);
  return Number(value);
}
export function optionalId(value, name) { return value === '' || value == null ? null : parseId(value, name); }
export function text(value, name, { required = false, max = 10000 } = {}) {
  if (value == null || value === '') { if (required) fail(400, `${name} is required`); return null; }
  if (typeof value !== 'string') fail(400, `${name} must be text`);
  const cleaned = value.trim();
  if ((required && !cleaned) || cleaned.length > max) fail(400, `${name} must contain ${required ? '1' : '0'}–${max} characters`);
  return cleaned || null;
}
export function date(value, name, { required = false } = {}) {
  if (value == null || value === '') { if (required) fail(400, `${name} is required`); return null; }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400, `${name} must be YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value < '1000-01-01') fail(400, `${name} is invalid`);
  return value;
}
export function enumValue(value, name, choices, fallback) {
  if ((value == null || value === '') && fallback !== undefined) return fallback;
  if (!choices.includes(value)) fail(400, `${name} must be one of: ${choices.join(', ')}`);
  return value;
}
export function numberValue(value, name, { min = 0, max = Infinity, required = true } = {}) {
  if ((value == null || value === '') && !required) return null;
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '' || !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max) fail(400, `${name} must be between ${min} and ${max}`);
  return Number(value);
}
export function assertFields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'A JSON object is required');
  const invalid = Object.keys(body).filter((key) => !allowed.includes(key));
  if (invalid.length) fail(400, `Unsupported fields: ${invalid.join(', ')}`);
}
export function canAccessEmployee(user, id) { return user?.role === 'admin' || Number(user?.empId) === Number(id); }
export function dateOrder(start, end, startName = 'start_date', endName = 'end_date') {
  if (start && end && end < start) fail(400, `${endName} cannot precede ${startName}`);
}
export const TASK_STATUSES = ['not_started', 'in_progress', 'completed', 'blocked'];
export const PROJECT_STATUSES = ['planned', 'ongoing', 'completed', 'on_hold'];
export const PRIORITIES = ['low', 'medium', 'high', 'critical'];
