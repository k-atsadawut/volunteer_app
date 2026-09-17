import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authRoutes from './routes/auth';
import registrationRoutes from './routes/registrations';
import activityRoutes from './routes/activities';
import queueRoutes from './routes/queues';
import verificationRoutes from './routes/verifications';
import passwordResetRoutes from './routes/password-reset';
import adminUserRoutes from './routes/admin/users';
import adminRegistrationRoutes from './routes/admin/registrations';
import adminReportRoutes from './routes/admin/reports';
import adminPasswordRequestsRoutes from './routes/admin/password-requests';
import adminNotifyRoutes from './routes/admin/notify';
import organizerRegistrationRoutes from './routes/organizer/registrations';
import notificationRoutes from './routes/notifications';
import { scheduled } from './scheduled/reminder';
import { sessionMiddleware } from './middleware/session';
import { createRateLimit } from './middleware/rateLimit';

const app = new Hono();

// Middleware
app.use('*', cors({
  origin: (origin, c) => {
    // Production: Restrict to specific domains via ALLOWED_ORIGINS secret
    // Format: comma-separated list, e.g., "https://example.com,https://www.example.com"
    if (c.env?.ALLOWED_ORIGINS) {
      const allowedOrigins = c.env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
      // Same-origin requests may not send Origin header — allow them
      if (!origin) return allowedOrigins[0];
      return allowedOrigins.includes(origin) ? origin : false;
    }
    // Development: Allow any origin
    return origin || '*';
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));
app.use('*', sessionMiddleware);

// Rate limiting for sensitive endpoints
const loginRateLimit = createRateLimit({ maxRequests: 10, windowMs: 60000, keyPrefix: 'rl-login' });
const forgotPasswordRateLimit = createRateLimit({ maxRequests: 3, windowMs: 60000, keyPrefix: 'rl-forgot' });
app.use('/api/auth/login', loginRateLimit);
app.use('/api/forgot-password', forgotPasswordRateLimit);

// API Routes
app.route('/api/auth', authRoutes);
app.route('/api/activities', activityRoutes);
app.route('/api/registrations', registrationRoutes);
app.route('/api/queues', queueRoutes);
app.route('/api/verifications', verificationRoutes);
app.route('/api/forgot-password', passwordResetRoutes);
app.route('/api/admin/users', adminUserRoutes);
app.route('/api/admin/registrations', adminRegistrationRoutes);
app.route('/api/admin/reports', adminReportRoutes);
app.route('/api/admin/password-requests', adminPasswordRequestsRoutes);
app.route('/api/admin/notify', adminNotifyRoutes);
app.route('/api/organizer/registrations', organizerRegistrationRoutes);
app.route('/api/notifications', notificationRoutes);

// SPA routing fallback — delegate non-API 404s to Cloudflare Assets
app.notFound((c) => {
  if (c.req.path.startsWith('/api')) {
    return c.json({ error: 'Endpoint not found' }, 404);
  }
  if (c.env?.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('Not Found', 404);
});

// Global error handler — don't leak stack traces to clients
app.onError((err, c) => {
  console.error('[Unhandled Error]', err.stack || err.message || err);
  return c.json({ error: 'เกิดข้อผิดพลาดภายในระบบ' }, 500);
});

// Cloudflare Workers handler
export default {
  async fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    return scheduled(event, env, ctx);
  }
};
