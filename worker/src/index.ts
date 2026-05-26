import { Hono } from 'hono';
import { cors } from 'hono/cors';
import jwt from '@tsndr/cloudflare-worker-jwt';

const app = new Hono();
app.use('*', cors());

// Firebase Token Verify Middleware
const verifyAuth = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const idToken = authHeader.split(' ')[1];
  try {
    const response = await fetch(
      'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
    );
    const certs: any = await response.json();
    const decoded: any = jwt.decode(idToken);
    const header: any = jwt.decode(idToken, { complete: true })?.header;
    const kid = header?.kid;
    if (!kid || !certs[kid]) throw new Error('Invalid key');
    const verified = await jwt.verify(idToken, certs[kid], { algorithm: 'RS256' });
    if (!verified) throw new Error('Token verification failed');
    c.set('uid', decoded.payload.sub);
    c.set('email', decoded.payload.email || '');
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

// (পরবর্তী ফেইজে গেম API যুক্ত হবে)

export default app;
