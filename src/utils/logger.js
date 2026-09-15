// Structured logging utility for Cloudflare Workers
// Provides consistent logging format with context and error tracking

export function logInfo(message, context = {}) {
  console.log(JSON.stringify({
    level: 'info',
    timestamp: new Date().toISOString(),
    message,
    ...context
  }));
}

export function logWarn(message, context = {}) {
  console.warn(JSON.stringify({
    level: 'warn',
    timestamp: new Date().toISOString(),
    message,
    ...context
  }));
}

export function logError(message, error = null, context = {}) {
  console.error(JSON.stringify({
    level: 'error',
    timestamp: new Date().toISOString(),
    message,
    error: error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : null,
    ...context
  }));
}

export function logAudit(action, userId, details = {}) {
  console.log(JSON.stringify({
    level: 'audit',
    timestamp: new Date().toISOString(),
    action,
    userId,
    ...details
  }));
}
