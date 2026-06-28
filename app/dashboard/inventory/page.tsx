"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardPageHeader } from "@/components/dashboard/ui";
import {
  addProduct,
  deleteProduct,
  getProducts,
  updateProduct,
  type Product,
  type ProductInput,
} from "@/lib/services/inventory";
import { getStoredStaffSession } from "@/lib/services/auth";
import { formatCurrency } from "@/lib/utils/format";

type ProductFormState = {
  product_name: string;
  brand: string;
  category: string;
  barcode: string;
  stock_qty: string;
  reorder_level: string;
  cost_price: string;
  selling_price: string;
};

const EMPTY_FORM: ProductFormState = {
  product_name: "",
  brand: "",
  category: "",
  barcode: "",
  stock_qty: "",
  reorder_level: "",
  cost_price: "",
  selling_price: "",
};

export default function InventoryPage() {
  const session = getStoredStaffSession();
  const canManageProducts =
    session?.role === "admin" ||
    session?.role === "owner" ||
    session?.role === "manager";

  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);

  async function loadProducts() {
    setLoading(true);

    try {
      setProducts(await getProducts());
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to load inventory.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadProducts();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const filteredProducts = useMemo(() => {
    const term = search.toLowerCase();

    return products.filter((product) =>
      `${product.product_name} ${product.brand || ""} ${product.category || ""} ${product.barcode || ""}`
        .toLowerCase()
        .includes(term)
    );
  }, [products, search]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  function startCreateProduct() {
    setSelectedProductId(null);
    setForm(EMPTY_FORM);
  }

  function startEditProduct(product: Product) {
    setSelectedProductId(product.id);
    setForm({
      product_name: product.product_name || "",
      brand: product.brand || "",
      category: product.category || "",
      barcode: product.barcode || "",
      stock_qty: stringifyNumber(product.stock_qty),
      reorder_level: stringifyNumber(product.reorder_level),
      cost_price: stringifyNumber(product.cost_price),
      selling_price: stringifyNumber(product.selling_price),
    });
  }

  function updateFormField(field: keyof ProductFormState, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function saveProduct(event: React.FormEvent) {
    event.preventDefault();

    if (!canManageProducts) {
      alert("Only managers can manage products.");
      return;
    }

    setSaving(true);

    try {
      const payload = toProductInput(form);

      if (selectedProductId) {
        const updatedProduct = await updateProduct(selectedProductId, payload);
        setProducts((current) =>
          current.map((product) =>
            product.id === updatedProduct.id ? updatedProduct : product
          )
        );
        alert("Product updated successfully");
      } else {
        const createdProduct = await addProduct(payload);
        setProducts((current) =>
          [...current, createdProduct].sort((a, b) =>
            a.product_name.localeCompare(b.product_name)
          )
        );
        alert("Product added successfully");
      }

      setSelectedProductId(null);
      setForm(EMPTY_FORM);
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "Unable to save product right now."
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeProduct(product: Product) {
    if (!canManageProducts) {
      alert("Only managers can manage products.");
      return;
    }

    const confirmed = window.confirm(
      `Delete ${product.product_name}? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setSaving(true);

    try {
      await deleteProduct(product.id);
      setProducts((current) => current.filter((item) => item.id !== product.id));

      if (selectedProductId === product.id) {
        setSelectedProductId(null);
        setForm(EMPTY_FORM);
      }

      alert("Product deleted successfully");
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unable to delete this product right now."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="dashboard-page-shell">
      <DashboardPageHeader
        title="Product Management"
        description={
          canManageProducts
            ? "Add, edit and remove products while keeping pricing and stock details clean."
            : "Browse products and stock levels. Manager access is required for product changes."
        }
        titleClassName="text-4xl font-bold text-[#d08a35]"
      />

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <input
              placeholder="Search product, barcode, brand..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none md:max-w-md"
            />

            {canManageProducts && (
              <button
                type="button"
                onClick={startCreateProduct}
                className="rounded-2xl bg-[#d08a35] px-5 py-3 font-semibold text-black hover:bg-[#e4a24e]"
              >
                Add Product
              </button>
            )}
          </div>

          <div className="dashboard-table-shell mt-6 rounded-3xl border border-white/10">
            <table className="dashboard-data-table w-full text-left text-sm">
              <thead className="bg-white/10 text-zinc-300">
                <tr>
                  <th className="p-4">Product</th>
                  <th className="p-4">Brand</th>
                  <th className="p-4">Category</th>
                  <th className="p-4">Price</th>
                  <th className="p-4">Stock</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredProducts.map((product) => (
                  <tr
                    key={product.id}
                    className={`border-t border-white/10 ${
                      selectedProductId === product.id ? "bg-[#d08a35]/10" : ""
                    }`}
                  >
                    <td className="p-4">
                      <p className="font-medium">{product.product_name}</p>
                      <p className="text-xs text-zinc-500">{product.barcode || "-"}</p>
                    </td>
                    <td className="p-4 text-zinc-300">{product.brand || "-"}</td>
                    <td className="p-4 text-zinc-400">{product.category || "-"}</td>
                    <td className="p-4 text-[#d08a35]">
                      {formatCurrency(product.selling_price)}
                    </td>
                    <td className="p-4">{product.stock_qty ?? 0}</td>
                    <td className="p-4">
                      <div className="flex gap-3">
                        {canManageProducts && (
                          <button
                            type="button"
                            onClick={() => startEditProduct(product)}
                            className="text-[#d08a35] hover:text-[#e4a24e]"
                          >
                            Edit
                          </button>
                        )}
                        {canManageProducts && (
                          <button
                            type="button"
                            onClick={() => void removeProduct(product)}
                            className="text-red-300 hover:text-red-200"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {!loading && filteredProducts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-zinc-500">
                      No products found.
                    </td>
                  </tr>
                )}

                {loading && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-zinc-500">
                      Loading inventory...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-[2rem] border border-[#d08a35]/20 bg-white/5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-[#d08a35]">
                {selectedProduct ? "Edit Product" : "Add Product"}
              </h2>
              <p className="mt-2 text-sm text-zinc-400">
                Maintain clean product names, prices and opening stock.
              </p>
            </div>

            {(selectedProduct || form.product_name) && canManageProducts && (
              <button
                type="button"
                onClick={startCreateProduct}
                className="text-sm text-zinc-400 hover:text-white"
              >
                Reset
              </button>
            )}
          </div>

          {!canManageProducts && (
            <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              You can view products here, but only manager accounts can add, edit
              or delete them.
            </div>
          )}

          <form onSubmit={saveProduct} className="mt-6 grid gap-4">
            <label className="block">
              <span className="text-sm text-zinc-400">Product name</span>
              <input
                value={form.product_name}
                onChange={(event) =>
                  updateFormField("product_name", event.target.value)
                }
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none"
                disabled={!canManageProducts || saving}
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm text-zinc-400">Brand</span>
                <input
                  value={form.brand}
                  onChange={(event) => updateFormField("brand", event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none"
                  disabled={!canManageProducts || saving}
                />
              </label>

              <label className="block">
                <span className="text-sm text-zinc-400">Category</span>
                <input
                  value={form.category}
                  onChange={(event) =>
                    updateFormField("category", event.target.value)
                  }
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none"
                  disabled={!canManageProducts || saving}
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm text-zinc-400">Barcode</span>
              <input
                value={form.barcode}
                onChange={(event) => updateFormField("barcode", event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none"
                disabled={!canManageProducts || saving}
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <NumberField
                label="Opening stock"
                value={form.stock_qty}
                onChange={(value) => updateFormField("stock_qty", value)}
                disabled={!canManageProducts || saving}
              />
              <NumberField
                label="Reorder level"
                value={form.reorder_level}
                onChange={(value) => updateFormField("reorder_level", value)}
                disabled={!canManageProducts || saving}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <NumberField
                label="Cost price"
                value={form.cost_price}
                onChange={(value) => updateFormField("cost_price", value)}
                disabled={!canManageProducts || saving}
                step="0.01"
              />
              <NumberField
                label="Selling price"
                value={form.selling_price}
                onChange={(value) => updateFormField("selling_price", value)}
                disabled={!canManageProducts || saving}
                step="0.01"
              />
            </div>

            <button
              type="submit"
              disabled={!canManageProducts || saving}
              className="mt-2 rounded-2xl bg-[#d08a35] px-5 py-4 font-bold text-black hover:bg-[#e4a24e] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? selectedProduct
                  ? "Saving Product..."
                  : "Adding Product..."
                : selectedProduct
                  ? "Save Changes"
                  : "Create Product"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
  step = "1",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-zinc-400">{label}</span>
      <input
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none"
        disabled={disabled}
      />
    </label>
  );
}

function toProductInput(form: ProductFormState): ProductInput {
  return {
    product_name: form.product_name,
    brand: form.brand,
    category: form.category,
    barcode: form.barcode,
    stock_qty: parseOptionalNumber(form.stock_qty),
    reorder_level: parseOptionalNumber(form.reorder_level),
    cost_price: parseOptionalNumber(form.cost_price),
    selling_price: parseOptionalNumber(form.selling_price),
  };
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  return Number(trimmed);
}

function stringifyNumber(value: number | null) {
  return value === null || value === undefined ? "" : String(value);
}
