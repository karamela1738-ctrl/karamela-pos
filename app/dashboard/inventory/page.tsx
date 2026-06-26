import { DashboardPageHeader } from "@/components/dashboard/ui";
import { getProducts } from "@/lib/services/inventory";
import { formatCurrency } from "@/lib/utils/format";

export default async function InventoryPage() {
  try {
    const products = await getProducts();

    return (
      <main className="min-h-screen bg-[#080604] p-8 text-white">
        <DashboardPageHeader
          title="Inventory"
          description="Products loaded from Supabase."
          titleClassName="text-4xl font-bold text-[#d08a35]"
        />

        <div className="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/10 text-zinc-300">
              <tr>
                <th className="p-4">Product</th>
                <th className="p-4">Brand</th>
                <th className="p-4">Category</th>
                <th className="p-4">Barcode</th>
                <th className="p-4">Price</th>
                <th className="p-4">Stock</th>
              </tr>
            </thead>

            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-t border-white/10">
                  <td className="p-4 font-medium">{product.product_name}</td>
                  <td className="p-4 text-zinc-300">{product.brand || "-"}</td>
                  <td className="p-4 text-zinc-400">{product.category || "-"}</td>
                  <td className="p-4 text-zinc-400">{product.barcode || "-"}</td>
                  <td className="p-4 text-[#d08a35]">
                    {formatCurrency(product.selling_price)}
                  </td>
                  <td className="p-4">{product.stock_qty ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    );
  } catch (error) {
    return (
      <main className="min-h-screen bg-[#080604] p-8 text-red-300">
        Error: {error instanceof Error ? error.message : "Unable to load inventory."}
      </main>
    );
  }
}
