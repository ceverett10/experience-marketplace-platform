import { NextResponse } from 'next/server';
import { prisma } from '@experience-marketplace/database';
import { requireSuperAdmin } from '@/lib/require-role';
import { logAudit, getClientIp } from '@/lib/audit';

export async function POST(request: Request) {
  const result = await requireSuperAdmin();
  if ('error' in result) return result.error;

  try {
    const { pauseReason } = await request.json();

    // Update platform settings to pause all autonomous processes
    await prisma.platformSettings.update({
      where: { id: 'platform_settings_singleton' },
      data: {
        allAutonomousProcessesPaused: true,
        pausedAt: new Date(),
        pausedBy: result.session.email,
        pauseReason: pauseReason || 'Manual pause from admin dashboard',
      },
    });

    await logAudit({
      userId: result.session.userId,
      userEmail: result.session.email,
      action: 'PAUSE_ALL',
      details: { reason: pauseReason || 'Manual pause from admin dashboard' },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      success: true,
      message: 'All autonomous processes have been paused',
    });
  } catch (error) {
    console.error('Failed to pause autonomous processes:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to pause processes' },
      { status: 500 }
    );
  }
}
