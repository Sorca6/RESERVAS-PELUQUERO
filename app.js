const form = document.querySelector('#booking-form');
const feedback = document.querySelector('#form-feedback');
const timeSelect = form.elements.time;
const dateInput = form.elements.date;
const serviceInput = form.elements.service;
const today = new Date();
const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
dateInput.min = localDate;

function durationFor(service) {
  if (/claritos|global/i.test(service)) return 150;
  if (/corte y barba/i.test(service)) return 45;
  if (/^corte/i.test(service)) return 30;
  if (/permanentes/i.test(service)) return 90;
  return 60;
}

async function makeTimes() {
  const date = dateInput.value;
  const day = date ? new Date(`${date}T12:00:00`).getDay() : -1;
  timeSelect.innerHTML = '<option value="">Elige una hora</option>';
  if (!date || day === 0 || day === 1) return;
  const close = day === 6 ? 900 : 1140;
  const slots = [];
  for (let start = 600; start < close; start += 30) {
    const end = start + durationFor(serviceInput.value);
    const validBlock = day === 6 ? end <= 900 : (start < 840 ? end <= 840 : start >= 960 && end <= 1140);
    if (start < 600 || !validBlock) continue;
    slots.push(`${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`);
  }
  try {
    const response = await fetch(`/api/availability?date=${encodeURIComponent(date)}`);
    if (!response.ok) throw new Error('availability');
    const busy = await response.json();
    slots.forEach(time => {
      const start = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
      const duration = durationFor(serviceInput.value);
      const overlaps = busy.some(item => {
        const occupiedStart = Number(item.time.slice(0, 2)) * 60 + Number(item.time.slice(3, 5));
        return start < occupiedStart + item.durationMinutes && occupiedStart < start + duration;
      });
      const option = document.createElement('option');
      option.value = time;
      option.textContent = overlaps ? `${time} · no disponible` : time;
      option.disabled = overlaps;
      timeSelect.append(option);
    });
    if (busy.length && !slots.some(time => !timeSelect.querySelector(`option[value="${time}"]`)?.disabled)) {
      const empty = timeSelect.querySelector('option');
      empty.textContent = 'No quedan horas disponibles';
    }
  } catch {
    const empty = timeSelect.querySelector('option');
    empty.textContent = 'No se pudo cargar la disponibilidad';
  }
}
dateInput.addEventListener('change', makeTimes);
serviceInput.addEventListener('change', makeTimes);

document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  document.querySelector('.filter.active')?.classList.remove('active');
  button.classList.add('active');
  document.querySelectorAll('.work-card').forEach(card => { card.hidden = button.dataset.filter !== 'todos' && card.dataset.category !== button.dataset.filter; });
}));

const menuButton = document.querySelector('.menu-toggle');
menuButton.addEventListener('click', () => {
  const nav = document.querySelector('.nav-links');
  const open = nav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.textContent = open ? '×' : '☰';
});
document.querySelectorAll('.nav-links a').forEach(link => link.addEventListener('click', () => {
  document.querySelector('.nav-links').classList.remove('open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.textContent = '☰';
}));

form.addEventListener('submit', async event => {
  event.preventDefault();
  feedback.className = 'form-feedback';
  feedback.textContent = 'Enviando tu solicitud…';
  const values = Object.fromEntries(new FormData(form).entries());
  try {
    const response = await fetch('/api/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo enviar la solicitud.');
    feedback.textContent = '¡Gracias! Hemos recibido tu solicitud y te contactaremos para confirmarla.';
    feedback.classList.add('success');
    form.reset();
    dateInput.min = localDate;
    timeSelect.innerHTML = '<option value="">Elige una hora</option>';
    loadAppointments();
  } catch (error) {
    feedback.textContent = error.message.includes('fetch') ? 'No se pudo conectar. Inténtalo de nuevo dentro de un momento.' : error.message;
    feedback.classList.add('error');
  }
});

const adminDate = document.querySelector('#admin-date');
const loginForm = document.querySelector('#admin-login');
const loginFeedback = document.querySelector('#login-feedback');
const agendaContent = document.querySelector('#agenda-content');
loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  loginFeedback.textContent = 'Comprobando…';
  try {
    const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: loginForm.elements.password.value }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo iniciar sesión.');
    loginForm.hidden = true;
    agendaContent.hidden = false;
    loginFeedback.textContent = '';
    loginForm.reset();
    await loadAppointments();
  } catch (error) { loginFeedback.textContent = error.message; }
});
document.querySelector('#admin-logout').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  agendaContent.hidden = true;
  loginForm.hidden = false;
  document.querySelector('#appointment-list').innerHTML = '<p class="empty-state">Inicia sesión para consultar las citas.</p>';
});
adminDate.addEventListener('change', loadAppointments);

async function loadAppointments() {
  const target = document.querySelector('#appointment-list');
  if (agendaContent.hidden) return;
  try {
    const suffix = adminDate.value ? `?date=${encodeURIComponent(adminDate.value)}` : '';
    const response = await fetch(`/api/appointments${suffix}`);
    const all = await response.json();
    if (response.status === 401) {
      agendaContent.hidden = true;
      loginForm.hidden = false;
      target.innerHTML = '<p class="empty-state">Inicia sesión para consultar las citas.</p>';
      return;
    }
    if (!response.ok) throw new Error(all.error || 'No se pudo cargar la agenda.');
    if (!all.length) { target.innerHTML = '<p class="empty-state">No hay citas pendientes para este día.</p>'; return; }
    target.innerHTML = all.map(item => `<article class="appointment-card"><div class="appointment-time">${escapeHtml(item.time)}<small>${new Date(`${item.date}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</small></div><div class="appointment-detail">${escapeHtml(item.name)}<small>${escapeHtml(item.service)} · ${escapeHtml(item.phone)}${item.note ? ` · ${escapeHtml(item.note)}` : ''}</small></div><button class="cancel-appointment" data-id="${escapeHtml(item.id)}">Cancelar</button></article>`).join('');
    target.querySelectorAll('.cancel-appointment').forEach(button => button.addEventListener('click', async () => {
      if (!confirm('¿Cancelar esta cita?')) return;
      const result = await fetch(`/api/appointments/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' });
      if (result.status === 401) { agendaContent.hidden = true; loginForm.hidden = false; return; }
      await loadAppointments();
    }));
  } catch (error) { target.innerHTML = `<p class="empty-state">${escapeHtml(error.message || 'No se pudo conectar con la agenda.')}</p>`; }
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
