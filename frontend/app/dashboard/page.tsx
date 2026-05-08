"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface SorUser {
  username: string;
  asset_type: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<SorUser | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("sor_user");
    if (!stored) {
      router.replace("/login");
      return;
    }
    setUser(JSON.parse(stored));
  }, [router]);

  function handleLogout() {
    localStorage.removeItem("sor_user");
    router.push("/login");
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold text-gray-800">SOR as a Service</h1>
          <nav className="flex gap-4 text-sm">
            <Link href="/dashboard" className="text-blue-600 font-medium">
              Dashboard
            </Link>
            <Link href="/schemas" className="text-gray-500 hover:text-gray-800">
              Schemas
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
            Signed in as <span className="font-medium">{user.username}</span>
            {user.asset_type && (
              <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full capitalize">
                {user.asset_type}
              </span>
            )}
          </span>
          <button
            onClick={handleLogout}
            className="text-sm text-red-600 hover:underline"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12 text-center">
        <h2 className="text-2xl font-semibold text-gray-700 mb-2">
          Welcome, {user.username}!
        </h2>
        <p className="text-gray-500 text-sm">
          Use the navigation above to manage Schemas. Asset ingestion and Reporting are coming soon.
        </p>
      </main>
    </div>
  );
}
