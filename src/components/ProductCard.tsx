"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductDTO } from "@/lib/schemas";

function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(cents / 100);
}

function StockPill({ available }: { available: number }) {
  if (available === 0) return <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", fontWeight: 500, color: "#dc2626", background: "#fef2f2", padding: "2px 7px", borderRadius: 20, border: "1px solid #fecaca" }}>out of stock</span>;
  if (available <= 3) return <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", fontWeight: 500, color: "#d97706", background: "#fffbeb", padding: "2px 7px", borderRadius: 20, border: "1px solid #fde68a" }}>{available} left</span>;
  return <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", fontWeight: 500, color: "#16a34a", background: "#f0fdf4", padding: "2px 7px", borderRadius: 20, border: "1px solid #bbf7d0" }}>{available} units</span>;
}

export function ProductCard({ product }: { product: ProductDTO }) {
  const router = useRouter();
  const [selectedWarehouse, setSelectedWarehouse] = useState(product.stockLevels[0]?.warehouseId ?? "");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedStock = product.stockLevels.find(s => s.warehouseId === selectedWarehouse);
  const available = selectedStock?.availableUnits ?? 0;

  async function handleReserve() {
    setError(null); setLoading(true);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": `reserve-${product.id}-${selectedWarehouse}-${Date.now()}` },
        body: JSON.stringify({ productId: product.id, warehouseId: selectedWarehouse, quantity }),
      });
      const data = await res.json();
      if (res.status === 409) { setError(`Only ${data.available ?? 0} unit(s) available`); return; }
      if (!res.ok) { setError(data.error ?? "Reservation failed"); return; }
      router.push(`/checkout/${data.id}`);
    } catch { setError("Network error — please try again"); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", transition: "box-shadow 0.2s" }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.07)")}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}>
      {product.imageUrl && (
        <div style={{ height: 180, overflow: "hidden", background: "var(--bg)" }}>
          <img src={product.imageUrl} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      )}
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3, letterSpacing: "-0.01em" }}>{product.name}</h2>
            <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: "var(--text-primary)", whiteSpace: "nowrap" }}>{formatPrice(product.price)}</span>
          </div>
          {product.description && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.5 }}>{product.description}</p>}
        </div>
        <div>
          <p style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Warehouse</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {product.stockLevels.map(s => (
              <label key={s.warehouseId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 7, border: `1px solid ${selectedWarehouse === s.warehouseId ? "var(--border-strong)" : "var(--border)"}`, cursor: "pointer", background: selectedWarehouse === s.warehouseId ? "var(--bg)" : "transparent", transition: "all 0.15s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="radio" name={`wh-${product.id}`} value={s.warehouseId} checked={selectedWarehouse === s.warehouseId} onChange={() => { setSelectedWarehouse(s.warehouseId); setError(null); }} style={{ accentColor: "var(--accent)" }} />
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{s.warehouseName}</span>
                </div>
                <StockPill available={s.availableUnits} />
              </label>
            ))}
          </div>
        </div>
        <div>
          <p style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Quantity</p>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setQuantity(q => Math.max(1, q - 1))} style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: 16, color: "var(--text-secondary)", fontFamily: "JetBrains Mono, monospace" }}>−</button>
            <span style={{ fontSize: 14, fontFamily: "JetBrains Mono, monospace", fontWeight: 500, width: 24, textAlign: "center" }}>{quantity}</span>
            <button onClick={() => setQuantity(q => Math.min(available, q + 1))} disabled={quantity >= available} style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid var(--border)", background: "transparent", cursor: quantity >= available ? "not-allowed" : "pointer", fontSize: 16, color: "var(--text-secondary)", fontFamily: "JetBrains Mono, monospace", opacity: quantity >= available ? 0.4 : 1 }}>+</button>
          </div>
        </div>
        {error && <div style={{ fontSize: 12, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 10px" }}>{error}</div>}
        <button onClick={handleReserve} disabled={loading || available === 0} style={{ marginTop: "auto", padding: "10px 16px", background: "var(--accent)", color: "white", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: loading || available === 0 ? "not-allowed" : "pointer", opacity: loading || available === 0 ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, letterSpacing: "-0.01em" }}>
          {loading ? "Reserving…" : available === 0 ? "Out of Stock" : "Reserve →"}
        </button>
      </div>
    </div>
  );
}
