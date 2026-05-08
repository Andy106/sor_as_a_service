"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
        <h1 className="text-lg font-bold text-gray-800">SOR as a Service</h1>
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
          More features (Schema management, Asset ingestion, Reporting) will appear here as they are built out.
        </p>
      </main>
    </div>
  );
}
