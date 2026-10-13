const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool } = require('pg');

const root = __dirname;
const dataFile = path.join(root, 'data', 'appointments.json');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };
const sessions = new Map();
const isProduction = process.env.NODE_ENV === 'production';
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000, ssl: isProduction ? { rejectUnauthorized: false } : undefined }) : null;

function readLocalAppointments() {
  try { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); } catch { return []; }
}

async function listAppointments(date) {
  if (!pool) return readLocalAppointments().filter(item => !date || item.date === date);
  const result = await pool.query(`SELECT id, name, phone, service, duration_minutes AS "durationMinutes", to_char(appointment_date, 'YYYY-MM-DD') AS date, to_char(start_time, 'HH24:MI') AS time, note, status, created_at AS "createdAt" FROM appointments ${date ? 'WHERE appointment_date = $1::date' : ''} ORDER BY appointment_date, start_time`, date ? [date] : []);
  return result.rows;
}

function respond(res, status, value, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(status === 204 ? '' : JSON.stringify(value));
}

function parseBody(req, res, done) {
  let body = '';
  req.on('data', chunk => { body += chunk; if (body.length > 20000) { respond(res, 413, { error: 'La solicitud es demasiado grande.' }); req.destroy(); } });
  req.on('end', () => {
    try {
      Promise.resolve(done(JSON.parse(body || '{}'))).catch(error => {
        console.error(error);
        if (!res.headersSent) respond(res, 500, { error: 'Ha ocurrido un error. Inténtalo de nuevo.' });
      });
    } catch { respond(res, 400, { error: 'No se pudo leer la solicitud.' }); }
  });
}

function requireAdmin(req, res) {
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(part => part.trim().split('=').map(decodeURIComponent)).filter(parts => parts.length === 2));
  const token = cookies.luma_session;
  const expiry = token && sessions.get(token);
  if (!expiry || expiry < Date.now()) {
    if (token) sessions.delete(token);
    respond(res, 401, { error: 'Inicia sesión para ver la agenda.' });
    return false;
  }
  return true;
}

function durationFor(service) {
  if (/claritos|global/i.test(service)) return 150;
  if (/corte y barba/i.test(service)) return 45;
  if (/^corte/i.test(service)) return 30;
  if (/permanentes/i.test(service)) return 90;
  return 60;
}

function isRealDate(date) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function todayAtSalon() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: process.env.TIME_ZONE || 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = key => parts.find(item => item.type === key).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function isWithinSchedule(date, time, duration) {
  const day = new Date(`${date}T12:00:00`).getDay();
  const start = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const end = start + duration;
  if (day === 0 || day === 1 || start < 600) return false;
  if (day === 6) return end <= 900;
  if (start < 840) return end <= 840;
  return start >= 960 && end <= 1140;
}

async function saveAppointment(input) {
  const service = String(input.service).slice(0, 90);
  const durationMinutes = durationFor(service);
  const id = crypto.randomUUID();
  if (!pool) {
    const appointments = readLocalAppointments();
    const start = input.time.split(':').map(Number).reduce((h, m) => h * 60 + m);
    if (appointments.some(item => {
      if (item.date !== input.date || item.status === 'cancelled') return false;
      const otherStart = item.time.split(':').map(Number).reduce((h, m) => h * 60 + m);
      return start < otherStart + (item.durationMinutes || 60) && otherStart < start + durationMinutes;
    })) return null;
    const appointment = { id, name: String(input.name).slice(0, 90), phone: String(input.phone).slice(0, 30), service, durationMinutes, date: input.date, time: input.time, note: String(input.note || '').slice(0, 400), status: 'pending', createdAt: new Date().toISOString() };
    appointments.push(appointment);
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.writeFileSync(dataFile, JSON.stringify(appointments, null, 2));
    return appointment;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.date]);
    const conflict = await client.query(`SELECT 1 FROM appointments WHERE appointment_date = $1::date AND status = 'pending' AND start_time < $2::time + ($3::int * interval '1 minute') AND start_time + (duration_minutes * interval '1 minute') > $2::time LIMIT 1`, [input.date, input.time, durationMinutes]);
    if (conflict.rowCount) { await client.query('ROLLBACK'); return null; }
    const saved = await client.query(`INSERT INTO appointments (id, name, phone, service, duration_minutes, appointment_date, start_time, note, status) VALUES ($1,$2,$3,$4,$5,$6::date,$7::time,$8,'pending') RETURNING id, name, phone, service, duration_minutes AS "durationMinutes", to_char(appointment_date, 'YYYY-MM-DD') AS date, to_char(start_time, 'HH24:MI') AS time, note, status, created_at AS "createdAt"`, [id, String(input.name).slice(0, 90), String(input.phone).slice(0, 30), service, durationMinutes, input.date, input.time, String(input.note || '').slice(0, 400)]);
    await client.query('COMMIT');
    return saved.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/health') return respond(res, 200, { status: 'ok' });
    if (url.pathname === '/api/admin/login' && req.method === 'POST') return parseBody(req, res, body => {
      const expected = process.env.ADMIN_PASSWORD;
      const password = String(body.password || '');
      if (!expected) return respond(res, 503, { error: 'Falta configurar ADMIN_PASSWORD en Render.' });
      const providedBuffer = Buffer.from(password);
      const expectedBuffer = Buffer.from(expected);
      if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) return respond(res, 401, { error: 'Contraseña incorrecta.' });
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, Date.now() + 12 * 60 * 60 * 1000);
      const secure = isProduction ? '; Secure' : '';
      respond(res, 200, { ok: true }, { 'Set-Cookie': `luma_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}` });
    });
    if (url.pathname === '/api/admin/logout' && req.method === 'POST') {
      const token = (req.headers.cookie || '').match(/(?:^|;\s*)luma_session=([^;]+)/)?.[1];
      if (token) sessions.delete(decodeURIComponent(token));
      return respond(res, 200, { ok: true }, { 'Set-Cookie': 'luma_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
    }
    if (url.pathname === '/api/availability' && req.method === 'GET') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date') || '')) return respond(res, 400, { error: 'Fecha no válida.' });
      const items = await listAppointments(url.searchParams.get('date'));
      return respond(res, 200, items.filter(item => item.status !== 'cancelled').map(({ time, durationMinutes }) => ({ time, durationMinutes: Number(durationMinutes) || 60 })));
    }
    if (url.pathname === '/api/appointments' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const date = url.searchParams.get('date');
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return respond(res, 400, { error: 'Fecha no válida.' });
      return respond(res, 200, (await listAppointments(date)).filter(item => item.status !== 'cancelled'));
    }
    if (url.pathname === '/api/appointments' && req.method === 'POST') return parseBody(req, res, async input => {
      const date = String(input.date || '');
      const time = String(input.time || '');
      if (!input.name || !input.phone || !input.service || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !isRealDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return respond(res, 400, { error: 'Revisa los campos y el horario de la cita.' });
      const duration = durationFor(String(input.service));
      if (date < todayAtSalon() || !isWithinSchedule(date, time, duration)) return respond(res, 400, { error: 'Ese día u horario está fuera del horario de atención.' });
      const result = await saveAppointment({ ...input, date, time });
      if (!result) return respond(res, 409, { error: 'Ese horario se solapa con otra cita. Elige otro.' });
      return respond(res, 201, result);
    });
    const cancel = url.pathname.match(/^\/api\/appointments\/([^/]+)$/);
    if (cancel && req.method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      const id = decodeURIComponent(cancel[1]);
      if (!pool) {
        const appointments = readLocalAppointments();
        const item = appointments.find(row => row.id === id);
        if (!item) return respond(res, 404, { error: 'No se encontró la cita.' });
        item.status = 'cancelled';
        fs.writeFileSync(dataFile, JSON.stringify(appointments, null, 2));
        return respond(res, 200, item);
      }
      const cancelled = await pool.query(`UPDATE appointments SET status='cancelled' WHERE id=$1 RETURNING id`, [id]);
      return cancelled.rowCount ? respond(res, 200, { ok: true }) : respond(res, 404, { error: 'No se encontró la cita.' });
    }
    let file = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    file = path.resolve(root, `.${file}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(file, (err, content) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
      res.end(content);
    });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) respond(res, 500, { error: 'Ha ocurrido un error. Inténtalo de nuevo.' });
  }
});

async function start() {
  if (pool) await pool.query(`CREATE TABLE IF NOT EXISTS appointments (id text PRIMARY KEY, name varchar(90) NOT NULL, phone varchar(30) NOT NULL, service varchar(90) NOT NULL, duration_minutes integer NOT NULL, appointment_date date NOT NULL, start_time time NOT NULL, note varchar(400) NOT NULL DEFAULT '', status varchar(20) NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now())`);
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, '0.0.0.0', () => console.log(`Estudio Luma está listo en el puerto ${port}`));
}
start().catch(error => { console.error('No se pudo iniciar el servidor o conectar a la base de datos:', error); process.exit(1); });
