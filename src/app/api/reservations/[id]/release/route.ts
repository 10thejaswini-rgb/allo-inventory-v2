import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ReservationDTO } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{
        id: string;
        status: string;
        product_id: string;
        warehouse_id: string;
        quantity: number;
      }>>`
        SELECT id, status, "productId" AS product_id, "warehouseId" AS warehouse_id, quantity
        FROM "Reservation"
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (rows.length === 0) return { type: "NOT_FOUND" as const };
      const res = rows[0];
      if (res.status !== "PENDING") {
        return { type: "ALREADY_SETTLED" as const, status: res.status };
      }

      await tx.$executeRaw`
        UPDATE "StockLevel"
        SET "reservedUnits" = "reservedUnits" - ${res.quantity}
        WHERE "productId" = ${res.product_id} AND "warehouseId" = ${res.warehouse_id}
      `;

      const updated = await tx.reservation.update({
        where: { id },
        data: { status: "RELEASED" },
        include: { product: true, warehouse: true },
      });

      return { type: "OK" as const, reservation: updated };
    });

    if (result.type === "NOT_FOUND") {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }
    if (result.type === "ALREADY_SETTLED") {
      return NextResponse.json({ message: `Reservation is already ${result.status.toLowerCase()}` });
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

    return NextResponse.json(dto);
  } catch (err) {
    console.error(`[POST /api/reservations/${id}/release]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}