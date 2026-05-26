import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();
app.use('*', cors());

// Firebase Token যাচাই করার নতুন মিডলওয়্যার (REST API ব্যবহার করে)
const verifyAuth = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const idToken = authHeader.split(' ')[1];
  const apiKey = c.env.FIREBASE_API_KEY;
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      }
    );
    const data: any = await response.json();
    if (data.error || !data.users || data.users.length === 0) {
      return c.json({ error: 'Invalid token' }, 401);
    }
    const user = data.users[0];
    c.set('uid', user.localId);          // Firebase UID
    c.set('email', user.email || '');
  } catch (e) {
    return c.json({ error: 'Invalid token' }, 401);
  }
  await next();
};

// Health check
app.get('/api/health', (c) => c.text('OK'));

// Get user profile (auto-create on first login)
app.get('/api/user/me', verifyAuth, async (c) => {
  const uid = c.get('uid');
  const email = c.get('email');
  const db = c.env.DB;
  let user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(uid).first();
  if (!user) {
    await db.prepare('INSERT INTO users (id, username) VALUES (?, ?)').bind(uid, email).run();
    user = { id: uid, username: email, balance: 0, role: 'user' };
  }
  return c.json(user);
});

export default app;
