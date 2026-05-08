"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const ASSET_TYPES = ["servers", "storage", "databases"] as const;
type AssetType = (typeof ASSET_TYPES)[number];

interface SorUser {
  username: string;
  asset_type: string | null;
}

interface AssetRecord {
  _id: string;
  asset_id: string;
  asset_type: string;
  asset_owner: string;
  asset_location: string;
  [key: string]: unknown;
}

const TYPE_COLORS: Record<string, string> = {
  servers: "#3b82f6",
  storage: "#10b981",
  databases: "#8b5cf6",
};

export default function ReportsPage() {
  const router = useRouter();
  const [user, setUser] = useState<SorUser | null>(null);

  const [selectedType, setSelectedType] = useState<AssetType | "all">("all");
  const [allRecords, setAllRecords] = useState<AssetRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const [filterOwner, setFilterOwner] = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");

  useEffect(() => {
    const stored = localStorage.getItem("sor_user");
    if (!stored) {
      router.replace("/login");
      return;
    }
    setUser(JSON.parse(stored));
  }, [router]);

  const fetchRecords = useCallback(
    async (type: AssetType | "all", username: string) => {
      setLoading(true);
      setFilterOwner("all");
      setFilterLocation("all");
      try {
        const types: AssetType[] =
          type === "all" ? [...ASSET_TYPES] : [type];
        const results = await Promise.all(
          types.map((t) =>
            fetch(`${process.env.NEXT_PUBLIC_API_URL}/assets/${t}`, {
              headers: { "X-Username": username },
            }).then((r) => (r.ok ? r.json() : []))
          )
        );
        setAllRecords((results as AssetRecord[][]).flat());
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (user) fetchRecords(selectedType, user.username);
  }, [user, selectedType, fetchRecords]);

  // Derive dropdown options from the full unfiltered data set
  const distinctOwners = useMemo(
    () => [...new Set(allRecords.map((r) => r.asset_owner))].sort(),
    [allRecords]
  );
  const distinctLocations = useMemo(
    () => [...new Set(allRecords.map((r) => r.asset_location))].sort(),
    [allRecords]
  );

  // Apply local filters
  const records = useMemo(() => {
    let data = allRecords;
    if (filterOwner !== "all") data = data.filter((r) => r.asset_owner === filterOwner);
    if (filterLocation !== "all") data = data.filter((r) => r.asset_location === filterLocation);
    return data;
  }, [allRecords, filterOwner, filterLocation]);

  // Chart data derived from filtered records
  const typeChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach((r) => {
      counts[r.asset_type] = (counts[r.asset_type] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [records]);

  const ownerChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach((r) => {
      counts[r.asset_owner] = (counts[r.asset_owner] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [records]);

  const locationChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach((r) => {
      counts[r.asset_location] = (counts[r.asset_location] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [records]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold text-gray-800">SOR as a Service</h1>
          <nav className="flex gap-4 text-sm">
            <Link href="/dashboard" className="text-gray-500 hover:text-gray-800">
              Dashboard
            </Link>
            <Link href="/schemas" className="text-gray-500 hover:text-gray-800">
              Schemas
            </Link>
            <Link href="/assets" className="text-gray-500 hover:text-gray-800">
              Assets
            </Link>
            <Link href="/reports" className="text-blue-600 font-medium">
              Reports
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
            onClick={() => {
              localStorage.removeItem("sor_user");
              router.push("/login");
            }}
            className="text-sm text-red-600 hover:underline"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <h2 className="text-xl font-semibold text-gray-800 mb-6">Reports</h2>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-8 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Asset Type
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as AssetType | "all")}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              {ASSET_TYPES.map((t) => (
                <option key={t} value={t} className="capitalize">
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Asset Owner
            </label>
            <select
              value={filterOwner}
              onChange={(e) => setFilterOwner(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={distinctOwners.length === 0}
            >
              <option value="all">All Owners</option>
              {distinctOwners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Asset Location
            </label>
            <select
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={distinctLocations.length === 0}
            >
              <option value="all">All Locations</option>
              {distinctLocations.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          <div className="ml-auto text-sm text-gray-500">
            {loading ? (
              "Loading…"
            ) : (
              <span>
                <span className="font-semibold text-gray-800">{records.length}</span>{" "}
                record{records.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Charts */}
        {!loading && records.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">
                Count by Asset Type
              </h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={typeChartData} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    radius={[4, 4, 0, 0]}
                    fill="#3b82f6"
                    label={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">
                Count by Asset Owner
              </h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={ownerChartData} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">
                Count by Asset Location
              </h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={locationChartData}
                  margin={{ top: 0, right: 8, left: -16, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Asset records table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Asset Records</h3>
          </div>
          {loading ? (
            <p className="text-sm text-gray-400 p-6">Loading…</p>
          ) : records.length === 0 ? (
            <p className="text-sm text-gray-400 p-6">No records match the selected filters.</p>
          ) : (
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {["Asset ID", "Type", "Owner", "Location"].map((h) => (
                      <th
                        key={h}
                        className="text-left text-xs font-medium text-gray-500 px-4 py-2 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {records.map((r) => (
                    <tr key={r._id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs text-blue-700">
                        {r.asset_id}
                      </td>
                      <td className="px-4 py-2 capitalize">
                        <span
                          className="inline-block px-2 py-0.5 rounded-full text-xs font-medium text-white"
                          style={{ backgroundColor: TYPE_COLORS[r.asset_type] ?? "#6b7280" }}
                        >
                          {r.asset_type}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-700">{r.asset_owner}</td>
                      <td className="px-4 py-2 text-gray-700">{r.asset_location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
