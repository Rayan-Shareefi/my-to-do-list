process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-jest-only';
process.env.DB_PATH = ':memory:';

const request = require('supertest');
const app = require('../server');

describe('Auth', () => {
  test('register creates a new user and returns a token', async () => {
    const res = await request(app).post('/api/register').send({ username: 'alice1', password: 'pass123' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
  });

  test('register rejects a duplicate username', async () => {
    await request(app).post('/api/register').send({ username: 'bob1', password: 'pass123' });
    const res = await request(app).post('/api/register').send({ username: 'bob1', password: 'pass123' });
    expect(res.status).toBe(409);
  });

  test('register rejects a password that is too short', async () => {
    const res = await request(app).post('/api/register').send({ username: 'carol1', password: '123' });
    expect(res.status).toBe(400);
  });

  test('login succeeds with correct credentials', async () => {
    await request(app).post('/api/register').send({ username: 'dave1', password: 'pass123' });
    const res = await request(app).post('/api/login').send({ username: 'dave1', password: 'pass123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('login fails with wrong password', async () => {
    await request(app).post('/api/register').send({ username: 'erin1', password: 'pass123' });
    const res = await request(app).post('/api/login').send({ username: 'erin1', password: 'WrongPass1!' });
    expect(res.status).toBe(401);
  });
});

describe('Todos (require authentication)', () => {
  let token;

  beforeAll(async () => {
    const res = await request(app).post('/api/register').send({ username: 'frank1', password: 'pass123' });
    token = res.body.token;
  });

  test('GET /api/todos without token is rejected', async () => {
    const res = await request(app).get('/api/todos');
    expect(res.status).toBe(401);
  });

  test('POST /api/todos creates a todo for the authenticated user', async () => {
    const res = await request(app)
      .post('/api/todos')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Buy milk' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Buy milk');
  });

  test('POST /api/todos rejects empty title', async () => {
    const res = await request(app)
      .post('/api/todos')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '' });
    expect(res.status).toBe(400);
  });

  test('a user cannot see or modify another user\'s todos', async () => {
    const other = await request(app).post('/api/register').send({ username: 'grace1', password: 'pass123' });
    const otherToken = other.body.token;
    const created = await request(app)
      .post('/api/todos')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'Secret task' });

    const res = await request(app)
      .put(`/api/todos/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`) // frank1 trying to edit grace1's todo
      .send({ done: true });
    expect(res.status).toBe(404);
  });

  test('SQL injection attempt in title is stored safely, table survives', async () => {
    const malicious = "'); DROP TABLE todos; --";
    const res = await request(app)
      .post('/api/todos')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: malicious });
    expect(res.status).toBe(201);
    const list = await request(app).get('/api/todos').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
  });

  test('backend strips <> characters from title as XSS defense-in-depth', async () => {
    const res = await request(app)
      .post('/api/todos')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '<script>alert(1)</script>' });
    expect(res.status).toBe(201);
    expect(res.body.title).not.toContain('<');
    expect(res.body.title).not.toContain('>');
  });

  test('PUT /api/todos/:id rejects a non-boolean done value', async () => {
    const created = await request(app)
      .post('/api/todos')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Boolean check task' });
    const res = await request(app)
      .put(`/api/todos/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ done: 'yes' }); // string, not boolean
    expect(res.status).toBe(400);
  });

  test('DELETE /api/todos/:id removes the todo', async () => {
    const created = await request(app)
      .post('/api/todos')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Temp task' });
    const res = await request(app)
      .delete(`/api/todos/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });
});
