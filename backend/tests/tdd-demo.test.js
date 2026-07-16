process.env.NODE_ENV = 'test';
/*
 * TDD DEMO FILE — for the live presentation.
 *
 * HOW TO USE THIS FOR THE DEMO:
 * 1. Run `npm test` now -> this test FAILS because GET /api/todos/count doesn't exist yet.
 * 2. Add the route below (a few lines in server.js, see README "TDD demo" section).
 * 3. Run `npm test` again -> this test PASSES.
 *
 * This proves the "write test first, then code" (Red -> Green) cycle live.
 */
process.env.JWT_SECRET = 'test-secret-for-jest-only';
process.env.DB_PATH = ':memory:';

const request = require('supertest');
const app = require('../server');

describe('TDD demo: todo count endpoint', () => {
  test('GET /api/todos/count returns the number of todos for the user', async () => {
    const reg = await request(app).post('/api/register').send({ username: 'tdduser1', password: 'pass123' });
    const token = reg.body.token;

    await request(app).post('/api/todos').set('Authorization', `Bearer ${token}`).send({ title: 'Task 1' });
    await request(app).post('/api/todos').set('Authorization', `Bearer ${token}`).send({ title: 'Task 2' });

    const res = await request(app).get('/api/todos/count').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });
});
