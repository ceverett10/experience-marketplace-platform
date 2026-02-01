import { NextResponse } from 'next/server';
import { prisma } from '@experience-marketplace/database';

export async function POST(request: Request) {
  try {
    const { pausedBy, pauseReason } = await request.json();

    // Update platform settings to pause all autonomous processes
    await prisma.platformSettings.update({
      where: { id: 'platform_settings_singleton' },
      data: {
        allAutonomousProcessesPaused: true,
        pausedAt: new Date(),
        pausedBy: pausedBy || 'admin',
        pauseReason: pauseReason || 'Manual pause from admin dashboard',
      },
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
