import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const category = searchParams.get('category');

    // Build query filters
    const where: any = {};
    if (status && status !== 'all') {
      where.status = status;
    }
    if (category && category !== 'all') {
      where.category = category;
    }

    // Fetch tasks
    const tasks = await prisma.manualTask.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: {
        site: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    // Calculate stats
    const allTasks = await prisma.manualTask.findMany();
    const stats = {
      total: allTasks.length,
      pending: allTasks.filter((t) => t.status === 'PENDING').length,
      inProgress: allTasks.filter((t) => t.status === 'IN_PROGRESS').length,
      completed: allTasks.filter((t) => t.status === 'COMPLETED').length,
      urgent: allTasks.filter((t) => t.priority === 'URGENT' && t.status !== 'COMPLETED').length,
    };

    return NextResponse.json({
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        category: task.category,
        priority: task.priority,
        status: task.status,
        context: task.context,
        dueDate: task.dueDate?.toISOString() || null,
        completedAt: task.completedAt?.toISOString() || null,
        completedBy: task.completedBy,
        notes: task.notes,
        siteName: task.site?.name || null,
        siteId: task.siteId,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
      })),
      stats,
    });
  } catch (error) {
    console.error('[API] Error fetching tasks:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, description, category, priority, siteId, context, dueDate } = body;

    if (!title || !category) {
      return NextResponse.json({ error: 'title and category are required' }, { status: 400 });
    }

    const task = await prisma.manualTask.create({
      data: {
        title,
        description,
        category,
        priority: priority || 'MEDIUM',
        siteId: siteId || null,
        context: context || null,
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    });

    return NextResponse.json({
      success: true,
      task,
    });
  } catch (error) {
    console.error('[API] Error creating task:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, status, notes, completedBy } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updateData: any = {};
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    // If marking as completed, set completedAt and completedBy
    if (status === 'COMPLETED') {
      updateData.completedAt = new Date();
      updateData.completedBy = completedBy || 'admin';
    }

    const task = await prisma.manualTask.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      task,
    });
  } catch (error) {
    console.error('[API] Error updating task:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    await prisma.manualTask.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('[API] Error deleting task:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
