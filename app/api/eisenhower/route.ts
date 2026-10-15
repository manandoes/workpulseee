import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, serverError, unauthorized } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const QUADRANTS = ["DoNow", "Schedule", "Delegate", "Eliminate"] as const;

const AddToMatrixSchema = z.object({
  taskId: z.string().min(1),
  quadrant: z.enum(QUADRANTS),
});

const MoveTaskSchema = z.object({
  taskId: z.string().min(1),
  quadrant: z.enum(QUADRANTS),
  sortOrder: z.number().int().min(0).default(0),
});

/**
 * Helper: builds the where clause for finding matrix entries for an actor.
 * Employees use recipientEmployeeId, company accounts use recipientAccountId.
 */
function matrixRecipientWhere(actor: { id: string; accountType: string }) {
  if (actor.accountType === "employee") {
    return { recipientEmployeeId: actor.id };
  }
  return { recipientAccountId: actor.id };
}

/**
 * GET /api/eisenhower - Load this actor's matrix entries with task details.
 */
export async function GET(_request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  try {
    const entries = await db.taskMatrix.findMany({
      where: {
        ...matrixRecipientWhere(actor),
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
            assigneeId: true,
            assignee: { select: { fullName: true } },
            project: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ entries });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/eisenhower",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

/**
 * POST /api/eisenhower - Add task(s) to a matrix quadrant.
 */
export async function POST(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = AddToMatrixSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(
      "Invalid payload. Expected: { taskId, quadrant }.",
      400,
      "invalid_payload"
    );
  }

  const { taskId, quadrant } = parsed.data;

  try {
    // Verify the task belongs to the company
    const task = await db.task.findFirst({
      where: { id: taskId, companyId: actor.companyId },
      select: { id: true, companyId: true },
    });
    if (!task) return apiError("Task not found.", 404, "not_found");

    const recipientWhere = matrixRecipientWhere(actor);

    // Upsert: move if exists, insert if not
    const existing = await db.taskMatrix.findFirst({
      where: {
        ...recipientWhere,
        taskId,
      },
    });

    let sortOrder = 0;
    if (existing) {
      // Move existing entry
      sortOrder = existing.sortOrder;
      await db.taskMatrix.update({
        where: { id: existing.id },
        data: { quadrant, sortOrder },
      });
    } else {
      // Calculate next sort order for this quadrant
      const maxOrder = await db.taskMatrix.aggregate({
        where: {
          ...recipientWhere,
          quadrant,
        },
        _max: { sortOrder: true },
      });
      sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

      await db.taskMatrix.create({
        data: {
          companyId: actor.companyId,
          ...recipientWhere,
          taskId,
          quadrant,
          sortOrder,
        },
      });
    }

    return NextResponse.json({ ok: true, quadrant, sortOrder });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/eisenhower",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

/**
 * PATCH /api/eisenhower - Move a task to a different quadrant or reorder.
 */
export async function PATCH(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = MoveTaskSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(
      "Invalid payload. Expected: { taskId, quadrant, sortOrder }.",
      400,
      "invalid_payload"
    );
  }

  const { taskId, quadrant, sortOrder } = parsed.data;

  try {
    const recipientWhere = matrixRecipientWhere(actor);
    const entry = await db.taskMatrix.findFirst({
      where: {
        ...recipientWhere,
        taskId,
      },
    });
    if (!entry) return apiError("Task not found in matrix.", 404, "not_found");

    await db.taskMatrix.update({
      where: { id: entry.id },
      data: { quadrant, sortOrder },
    });

    return NextResponse.json({ ok: true });
  } catch (cause) {
    return serverError(
      {
        route: "PATCH /api/eisenhower",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

/**
 * DELETE /api/eisenhower - Remove a task from the matrix.
 */
export async function DELETE(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = z.object({ taskId: z.string().min(1) }).safeParse(payload);
  if (!parsed.success) {
    return apiError(
      "Invalid payload. Expected: { taskId }.",
      400,
      "invalid_payload"
    );
  }

  const { taskId } = parsed.data;

  try {
    const recipientWhere = matrixRecipientWhere(actor);
    const entry = await db.taskMatrix.findFirst({
      where: {
        ...recipientWhere,
        taskId,
      },
    });
    if (!entry) return apiError("Task not found in matrix.", 404, "not_found");

    await db.taskMatrix.delete({ where: { id: entry.id } });

    return NextResponse.json({ ok: true });
  } catch (cause) {
    return serverError(
      {
        route: "DELETE /api/eisenhower",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
