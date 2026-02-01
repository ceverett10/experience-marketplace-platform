import { NextResponse } from 'next/server';
import { prisma } from '@experience-marketplace/database';

export async function POST() {
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
