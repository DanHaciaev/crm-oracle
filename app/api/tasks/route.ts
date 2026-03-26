import { NextResponse } from "next/server";
import { execute, getConnection } from "@/lib/oracle";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";

export async function GET() {
    const conn = await getConnection();
    try {
        const result = await conn.execute(
            `SELECT id, title, description, status, assigned_to, created_by, created_at
       FROM crm_user.tasks ORDER BY created_at ASC`,
            [],
            { outFormat: 4002 }
        );
        const rows = (result.rows ?? []) as Record<string, unknown>[];
        return NextResponse.json(rows.map((r) => ({
            id: Number(r["ID"]),
            title: String(r["TITLE"] ?? ""),
            description: r["DESCRIPTION"] ? String(r["DESCRIPTION"]) : null,
            status: String(r["STATUS"] ?? ""),
            assigned_to: r["ASSIGNED_TO"] ? Number(r["ASSIGNED_TO"]) : null,
            created_by: r["CREATED_BY"] ? Number(r["CREATED_BY"]) : null,
            created_at: r["CREATED_AT"] instanceof Date
                ? (r["CREATED_AT"] as Date).toISOString()
                : String(r["CREATED_AT"] ?? ""),
        })));
    } finally {
        await conn.close();
    }
}

export async function POST(request: Request) {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    const payload = token ? verifyToken(token) : null;

    const { title, description, status, assigned_to } = await request.json();

    await execute(
        `INSERT INTO crm_user.tasks (title, description, status, assigned_to, created_by)
     VALUES (:1, :2, :3, :4, :5)`,
        [title, description || null, status, assigned_to || null, payload?.id || null]
    );

    const conn = await getConnection();
    try {
        const result = await conn.execute(
            `SELECT id, title, description, status, assigned_to, created_by, created_at
       FROM crm_user.tasks ORDER BY id DESC FETCH FIRST 1 ROWS ONLY`,
            [],
            { outFormat: 4002 }
        );
        const rows = (result.rows ?? []) as Record<string, unknown>[];
        const r = rows[0];
        return NextResponse.json({
            id: Number(r["ID"]),
            title: String(r["TITLE"] ?? ""),
            description: r["DESCRIPTION"] ? String(r["DESCRIPTION"]) : null,
            status: String(r["STATUS"] ?? ""),
            assigned_to: r["ASSIGNED_TO"] ? Number(r["ASSIGNED_TO"]) : null,
            created_by: r["CREATED_BY"] ? Number(r["CREATED_BY"]) : null,
            created_at: r["CREATED_AT"] instanceof Date
                ? (r["CREATED_AT"] as Date).toISOString()
                : String(r["CREATED_AT"] ?? ""),
        });
    } finally {
        await conn.close();
    }
}

export async function PUT(request: Request) {
    const { id, title, description, status, assigned_to } = await request.json();
    await execute(
        `UPDATE crm_user.tasks
     SET title = :1, description = :2, status = :3, assigned_to = :4
     WHERE id = :5`,
        [title, description || null, status, assigned_to || null, id]
    );
    return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
    const { id } = await request.json();
    await execute(`DELETE FROM crm_user.tasks WHERE id = :1`, [id]);
    return NextResponse.json({ success: true });
}