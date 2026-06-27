"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getDefaultDashboardPath,
  loginWithPin,
  validateStoredStaffSession,
} from "@/lib/services/auth";

const PIN_DOTS = [0, 1, 2, 3, 4, 5];
const PIN_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function restoreSession() {
      try {
        const session = await validateStoredStaffSession();

        if (session) {
          router.replace(getDefaultDashboardPath(session.role));
        }
      } catch {
        // Ignore stale or invalid sessions and keep the user on the login screen.
      }
    }

    void restoreSession();
  }, [router]);

  function pressNumber(num: string) {
    setErrorMsg("");

    if (pin.length < 6) {
      setPin((current) => current + num);
    }
  }

  function clearPin() {
    setPin("");
    setErrorMsg("");
  }

  async function loginStaff() {
    if (pin.length !== 6) {
      setErrorMsg("Enter your 6-digit PIN");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const session = await loginWithPin(pin);

      if (!session) {
        setErrorMsg("Invalid PIN");
        setPin("");
        return;
      }

      router.push(getDefaultDashboardPath(session.role));
    } catch (error) {
      console.error(error);
      setErrorMsg(
        error instanceof Error ? error.message : "Unexpected error occurred."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080604] px-4 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#9a5a18_0%,transparent_35%),radial-gradient(circle_at_bottom,#3a1d08_0%,transparent_40%)] opacity-60" />

      <div className="relative w-full max-w-md rounded-[2rem] border border-[#c47a2c]/25 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col items-center text-center">
          <div className="mb-5 flex h-24 w-24 items-center justify-center rounded-full border border-[#c47a2c]/30 bg-[#130b05] shadow-[0_0_40px_rgba(196,122,44,0.25)]">
            <Image
              src="/icons/karamela-icon.jpeg"
              alt="Karamela"
              width={70}
              height={70}
              className="rounded-full"
              priority
            />
          </div>

          <h1 className="text-4xl font-semibold tracking-wide text-[#d08a35]">
            Karamela
          </h1>

          <p className="mt-2 text-sm text-zinc-400">
            Sales / Inventory / Reconciliation
          </p>
        </div>

        <div className="mt-8">
          <div className="mb-5 flex justify-center gap-3">
            {PIN_DOTS.map((index) => (
              <div
                key={index}
                className={`h-4 w-4 rounded-full border border-[#c47a2c]/60 ${
                  pin.length > index ? "bg-[#d08a35]" : "bg-transparent"
                }`}
              />
            ))}
          </div>

          {errorMsg && (
            <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300">
              {errorMsg}
            </p>
          )}

          <div className="grid grid-cols-3 gap-4">
            {PIN_DIGITS.map((num) => (
              <button
                key={num}
                type="button"
                disabled={loading}
                onClick={() => pressNumber(num)}
                className="h-16 rounded-2xl border border-white/10 bg-white/5 text-2xl font-semibold text-white hover:bg-[#d08a35]/20 active:scale-95"
              >
                {num}
              </button>
            ))}

            <button
              type="button"
              onClick={clearPin}
              disabled={loading}
              className="h-16 rounded-2xl border border-white/10 bg-white/5 text-sm font-semibold text-zinc-300 hover:bg-red-500/20"
            >
              Clear
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => pressNumber("0")}
              className="h-16 rounded-2xl border border-white/10 bg-white/5 text-2xl font-semibold text-white hover:bg-[#d08a35]/20"
            >
              0
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={loginStaff}
              className="h-16 rounded-2xl bg-[#d08a35] text-sm font-bold text-black hover:bg-[#e9a34c]"
            >
              {loading ? "..." : "Login"}
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-500">
          Karamela POS v1.0
        </p>
      </div>
    </main>
  );
}
