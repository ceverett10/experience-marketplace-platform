/**
 * Admin audit logging.
 * Records security-relevant actions to the admin_audit_logs table.
 */

import { prisma } from '@/lib/prisma';

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'LOGIN_RATE_LIMITED'
  | 'CREATE_USER'
  | 'DELETE_USER'
  | 'CHANGE_PASSWORD'
  | 'FORCE_PASSWORD_CHANGE'
  | 'PAUSE_ALL'
  | 'RESUME_ALL'
  | 'UPDATE_SETTINGS'
  | 'TRIGGER_ROADMAP_PROCESSOR';

interface AuditParams {
  userId?: string;
  userEmail?: string;
  action: AuditAction;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Log an audit event. Fire-and-forget — never throws.
 */
export async function logAudit(params: AuditParams): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).adminAuditLog.create({
      data: {
        userId: params.userId ?? null,
        userEmail: params.userEmail ?? null,
        action: params.action,
        details: params.details ? JSON.stringify(params.details) : null,
        ipAddress: params.ipAddress ?? null,
      },
    });
  } catch (error) {
    // Audit logging must never break the main operation
    console.error('[Audit] Failed to log event:', params.action, error);
  }
}

/**
 * Extract client IP from request headers.
 * Checks X-Forwarded-For (set by Heroku proxy), falls back to other headers.
 */
export function getClientIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim();
  }
  return request.headers.get('x-real-ip') ?? undefined;
}
