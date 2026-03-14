import { NextResponse } from 'next/server';
import { prisma } from '@experience-marketplace/database';
import { requireSuperAdmin } from '@/lib/require-role';
import { logAudit, getClientIp } from '@/lib/audit';

export async function POST(request: Request) {
  const result = await requireSuperAdmin();
  if ('error' in result) return result.error;

  try {
    // Update platform settings to resume all autonomous processes
    await prisma.platformSettings.update({
      where: { id: 'platform_settings_singleton' },
      data: {
        allAutonomousProcessesPaused: false,
        pausedAt: null,
        pausedBy: null,
        pauseReason: null,
      },
    });

    await logAudit({
      userId: result.session.userId,
      userEmail: result.session.email,
      action: 'RESUME_ALL',
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      success: true,
      message: 'All autonomous processes have been resumed',
    });
  } catch (error) {
    console.error('Failed to resume autonomous processes:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to resume processes' },
      { status: 500 }
    );
  }
}
