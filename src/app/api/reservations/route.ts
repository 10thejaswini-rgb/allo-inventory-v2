// src/app/api/reservations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withLock } from "@/lib/lock";
import { withIdempotency } from "@/lib/idempotency";
import { CreateReservationSchema } from "@/lib/schemas";
import type { ReservationDTO } from "@/lib/schemas";

export const dynamic = "force-dynamic";

const RESERVATION_TTL_MINUTES = 10;

export async function POST(request: NextRequest) {
  const idempotencyKey = request.headers.get("Idempotency-Key");

  return withIdempotency(idempotencyKey, "/api/reservations", async () => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = CreateReservationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { productId, warehouseId, quantity } = parsed.data;

    /**
     * Concurrency strategy:
     *
     * We use a Redis distributed lock keyed on `${productId}:${warehouseId}`.
     * This serialises concurrent reservation requests for the same SKU+warehouse
     * so only one can read-then-write the stock level at a time.
     *
     * Inside the lock we use a Prisma transaction with a SELECT … FOR UPDATE
     * (via $queryRaw) to also protect against other processes that may not go
     * through the lock (e.g. direct DB writes in tests).  Belt-and-suspenders.
     *
     * The lock is intentionally scoped to a single SKU+warehouse pair so that
     * reservations for unrelated SKUs can proceed in parallel.
     */
    const lockKey = `stock:${productId}:${warehouseId}`;

    try {
      const result = await withLock(lockKey, async () => {
        return await prisma.$transaction(async (tx) => {
          // SELECT FOR UPDATE — prevents phantom reads from concurrent DB writers
          const rows = await tx.$queryRaw<
            Array<{ id: string; total_units: number; reserved_units: number }>
          >`
            SELECT id, "totalUnits" AS total_units, "reservedUnits" AS reserved_units
            FROM "StockLevel"
            WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
            FOR UPDATE
          `;

          if (rows.length === 0) {
            return { type: "NOT_FOUND" as const };
          }

          const stock = rows[0];
          const available = stock.total_units - stock.reserved_units;

          if (available < quantity) {
            return {
              type: "INSUFFICIENT_STOCK" as const,
              available,
            };
          }

          // Increment reserved units
          await tx.$executeRaw`
            UPDATE "StockLevel"
            SET "reservedUnits" = "reservedUnits" + ${quantity}
              
            WHERE id = ${stock.id}
          `;

          const expiresAt = new Date(
            Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000
          );

          const reservation = await tx.reservation.create({
            data: {
              productId,
              warehouseId,
              quantity,
              status: "PENDING",
              expiresAt,
            },
            include: {
              product: true,
              warehouse: true,
            },
          });

          return { type: "OK" as const, reservation };
        });
      });

      if (result.type === "NOT_FOUND") {
        return NextResponse.json(
          { error: "Stock record not found for this product/warehouse combination" },
          { status: 404 }
        );
      }

      if (result.type === "INSUFFICIENT_STOCK") {
        return NextResponse.json(
          {
            error: "Not enough stock available",
            available: result.available,
          },
          { status: 409 }
        );
      }

      const { reservation } = result;
      const dto: ReservationDTO = {
        id: reservation.id,
        productId: reservation.productId,
        productName: reservation.product.name,
        productPrice: reservation.product.price,
        warehouseId: reservation.warehouseId,
        warehouseName: reservation.warehouse.name,
        quantity: reservation.quantity,
        status: reservation.status as ReservationDTO["status"],
        expiresAt: reservation.expiresAt.toISOString(),
        createdAt: reservation.createdAt.toISOString(),
      };

      return NextResponse.json(dto, { status: 201 });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("Could not acquire lock")) {
        return NextResponse.json(
          { error: "Server is busy, please try again" },
          { status: 503 }
        );
      }
      console.error("[POST /api/reservations]", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  });
}
