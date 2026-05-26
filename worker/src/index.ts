import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();
app.use('*', cors());

// Firebase Token যাচাই (REST API ব্যবহার করে)
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
    c.set('uid', user.localId);
    c.set('email', user.email || '');
  } catch (e) {
    return c.json({ error: 'Invalid token' }, 401);
  }
  await next();
};

// অ্যাডমিন চেক middleware
const adminOnly = async (c: any, next: any) => {
  const uid = c.get('uid');
  const db = c.env.DB;
  const user = await db.prepare('SELECT role FROM users WHERE id = ?').bind(uid).first();
  if (!user || user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await next();
};

// ---------- Health ----------
app.get('/api/health', (c) => c.text('OK'));

// ---------- User Endpoints ----------
// প্রোফাইল ও প্রথম লগইনে ইউজার তৈরি
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

// ইউজারের ডিপোজিট হিস্টরি
app.get('/api/user/deposits', verifyAuth, async (c) => {
  const uid = c.get('uid');
  const db = c.env.DB;
  const deposits = await db.prepare(
    `SELECT deposits.*, payment_methods.name as method_name, payment_methods.account_number 
     FROM deposits 
     JOIN payment_methods ON deposits.method_id = payment_methods.id 
     WHERE deposits.user_id = ? 
     ORDER BY deposits.created_at DESC`
  ).bind(uid).all();
  return c.json(deposits.results);
});

// নতুন ডিপোজিট রিকোয়েস্ট তৈরি
app.post('/api/user/deposits', verifyAuth, async (c) => {
  const uid = c.get('uid');
  const { method_id, amount, sender_number, transaction_id } = await c.req.json();
  if (!method_id || !amount || amount <= 0) return c.json({ error: 'Invalid data' }, 400);
  const db = c.env.DB;
  const method = await db.prepare('SELECT * FROM payment_methods WHERE id = ? AND is_active = 1').bind(method_id).first();
  if (!method) return c.json({ error: 'Payment method not available' }, 400);
  await db.prepare(
    'INSERT INTO deposits (user_id, method_id, amount, sender_number, transaction_id) VALUES (?, ?, ?, ?, ?)'
  ).bind(uid, method_id, amount, sender_number || '', transaction_id || '').run();
  return c.json({ success: true, message: 'Deposit request submitted' });
});

// পেমেন্ট মেথড লিস্ট (পাবলিক, অ্যাক্টিভগুলো)
app.get('/api/payment-methods', async (c) => {
  const db = c.env.DB;
  const methods = await db.prepare('SELECT * FROM payment_methods WHERE is_active = 1').all();
  return c.json(methods.results);
});

// ---------- Admin Endpoints ----------
// সব পেমেন্ট মেথড (অ্যাডমিন)
app.get('/api/admin/payment-methods', verifyAuth, adminOnly, async (c) => {
  const db = c.env.DB;
  const methods = await db.prepare('SELECT * FROM payment_methods').all();
  return c.json(methods.results);
});

// পেমেন্ট মেথড যোগ
app.post('/api/admin/payment-methods', verifyAuth, adminOnly, async (c) => {
  const { name, account_number, holder_name, is_active } = await c.req.json();
  if (!name || !account_number) return c.json({ error: 'Name and account number required' }, 400);
  const db = c.env.DB;
  await db.prepare('INSERT INTO payment_methods (name, account_number, holder_name, is_active) VALUES (?, ?, ?, ?)')
    .bind(name, account_number, holder_name || '', is_active !== undefined ? is_active : 1).run();
  return c.json({ success: true });
});

// পেমেন্ট মেথড আপডেট
app.put('/api/admin/payment-methods/:id', verifyAuth, adminOnly, async (c) => {
  const id = c.req.param('id');
  const { name, account_number, holder_name, is_active } = await c.req.json();
  const db = c.env.DB;
  await db.prepare('UPDATE payment_methods SET name=?, account_number=?, holder_name=?, is_active=? WHERE id=?')
    .bind(name, account_number, holder_name || '', is_active, id).run();
  return c.json({ success: true });
});

// পেমেন্ট মেথড ডিলিট
app.delete('/api/admin/payment-methods/:id', verifyAuth, adminOnly, async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  await db.prepare('DELETE FROM payment_methods WHERE id=?').bind(id).run();
  return c.json({ success: true });
});

// পেন্ডিং ডিপোজিট লিস্ট
app.get('/api/admin/pending-deposits', verifyAuth, adminOnly, async (c) => {
  const db = c.env.DB;
  const deposits = await db.prepare(
    `SELECT deposits.*, users.username, payment_methods.name as method_name, payment_methods.account_number 
     FROM deposits 
     JOIN users ON deposits.user_id = users.id 
     JOIN payment_methods ON deposits.method_id = payment_methods.id 
     WHERE deposits.status = 'pending' 
     ORDER BY deposits.created_at ASC`
  ).all();
  return c.json(deposits.results);
});

// ডিপোজিট এপ্রুভ
app.post('/api/admin/deposits/:id/approve', verifyAuth, adminOnly, async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  const deposit = await db.prepare('SELECT * FROM deposits WHERE id=?').bind(id).first();
  if (!deposit || deposit.status !== 'pending') return c.json({ error: 'Invalid deposit' }, 400);
  await db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').bind(deposit.amount, deposit.user_id).run();
  await db.prepare('UPDATE deposits SET status = ?, processed_at = datetime() WHERE id = ?').bind('approved', id).run();
  await db.prepare('INSERT INTO transactions (user_id, type, amount) VALUES (?, ?, ?)')
    .bind(deposit.user_id, 'deposit', deposit.amount).run();
  return c.json({ success: true });
});

// ডিপোজিট রিজেক্ট
app.post('/api/admin/deposits/:id/reject', verifyAuth, adminOnly, async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  const deposit = await db.prepare('SELECT * FROM deposits WHERE id=?').bind(id).first();
  if (!deposit || deposit.status !== 'pending') return c.json({ error: 'Invalid deposit' }, 400);
  await db.prepare('UPDATE deposits SET status = ?, processed_at = datetime() WHERE id = ?').bind('rejected', id).run();
  return c.json({ success: true });
});

// ইউজার লিস্ট (অ্যাডমিন)
app.get('/api/admin/users', verifyAuth, adminOnly, async (c) => {
  const db = c.env.DB;
  const users = await db.prepare('SELECT id, username, balance, role, created_at FROM users ORDER BY created_at DESC').all();
  return c.json(users.results);
});

// ইউজার ব্যালেন্স ম্যানুয়ালি আপডেট
app.post('/api/admin/users/:id/balance', verifyAuth, adminOnly, async (c) => {
  const id = c.req.param('id');
  const { amount } = await c.req.json();
  if (!amount || amount === 0) return c.json({ error: 'Invalid amount' }, 400);
  const db = c.env.DB;
  await db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').bind(amount, id).run();
  await db.prepare('INSERT INTO transactions (user_id, type, amount, details) VALUES (?, ?, ?, ?)')
    .bind(id, amount > 0 ? 'admin_add' : 'admin_deduct', Math.abs(amount), 'Admin adjustment').run();
  return c.json({ success: true });
});

export default app;
