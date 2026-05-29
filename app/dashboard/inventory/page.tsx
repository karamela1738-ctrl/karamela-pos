import { supabase } from "@/lib/supabase/client";

export default async function InventoryPage() {
  const { data: products, error } = await supabase
    .from("products")
    .select("id, product_name, brand, category, barcode, selling_price, stock_qty, reorder_level")
    .order("product_name");

  if (error) {
    return (
      <main className="min-h-screen bg-[#080604] p-8 text-red-300">
        Error: {error.message}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080604] p-8 text-white">
      <h1 className="text-4xl font-bold text-[#d08a35]">Inventory</h1>
      <p className="mt-2 text-zinc-400">
        Products loaded from Supabase.
      </p>

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
            {products?.map((product) => (
              <tr key={product.id} className="border-t border-white/10">
                <td className="p-4 font-medium">{product.product_name}</td>
                <td className="p-4 text-zinc-300">{product.brand}</td>
                <td className="p-4 text-zinc-400">{product.category}</td>
                <td className="p-4 text-zinc-400">{product.barcode}</td>
                <td className="p-4 text-[#d08a35]">
                  KES {product.selling_price ?? 0}
                </td>
                <td className="p-4">
                  {product.stock_qty ?? 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}