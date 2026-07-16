const API = 'http://localhost:3000/api';
let token = localStorage.getItem('token');

function showAuthError(msg) { document.getElementById('auth-error').textContent = msg; }
function showTodoError(msg) { document.getElementById('todo-error').textContent = msg; }

function switchToApp() {
  document.getElementById('auth-view').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  loadTodos();
}

async function register() {
  showAuthError('');
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  try {
    const res = await fetch(`${API}/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) return showAuthError(data.error || 'Registration failed');
    token = data.token;
    localStorage.setItem('token', token);
    switchToApp();
  } catch (err) {
    showAuthError('Could not reach the server. Is the backend running (npm start)?');
  }
}

async function login() {
  showAuthError('');
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  try {
    const res = await fetch(`${API}/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) return showAuthError(data.error || 'Login failed');
    token = data.token;
    localStorage.setItem('token', token);
    switchToApp();
  } catch (err) {
    showAuthError('Could not reach the server. Is the backend running (npm start)?');
  }
}

function logout() {
  token = null;
  localStorage.removeItem('token');
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-view').style.display = 'block';
}

async function loadTodos() {
  showTodoError('');
  const res = await fetch(`${API}/todos`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) return logout();
  const todos = await res.json();
  document.getElementById('list').innerHTML = todos.map(t => `
    <li>
      <div class="checkmark ${t.done ? 'done' : ''}" onclick="toggle(${t.id}, ${t.done ? 0 : 1})"></div>
      <span class="title ${t.done ? 'done' : ''}">${escapeHtml(t.title)}</span>
      <button class="remove-btn" onclick="removeTodo(${t.id})">Remove</button>
    </li>`).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function addTodo() {
  showTodoError('');
  const title = document.getElementById('new-title').value;
  const res = await fetch(`${API}/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title })
  });
  const data = await res.json();
  if (!res.ok) return showTodoError(data.error || 'Could not add task');
  document.getElementById('new-title').value = '';
  loadTodos();
}

async function toggle(id, done) {
  showTodoError('');
  const res = await fetch(`${API}/todos/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ done: Boolean(done) })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    showTodoError(data.error || 'Could not update task');
    return;
  }
  loadTodos();
}

async function removeTodo(id) {
  await fetch(`${API}/todos/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  loadTodos();
}

if (token) switchToApp();
