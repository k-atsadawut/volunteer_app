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

const app = new Hono();

// Middleware
app.use('*', cors({
  origin: (origin) => {
    // Production: Restrict to specific domains via ALLOWED_ORIGINS secret
    // Format: comma-separated list, e.g., "https://example.com,https://www.example.com"
    if (c.env?.ALLOWED_ORIGINS) {
      const allowedOrigins = c.env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
      if (!origin) return false; // Require origin header in production
      return allowedOrigins.includes(origin);
    }
    // Development: Allow any origin
    return origin || '*';
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));
app.use('*', sessionMiddleware);

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

// Fallback - SPA-style redirect
app.get('*', async (c) => {
  return c.redirect('/login.html');
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
