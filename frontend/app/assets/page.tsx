"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

export default function AssetsPage() {
  const router = useRouter();
  const [user, setUser] = useState<SorUser | null>(null);

  const [selectedType, setSelectedType] = useState<AssetType>("servers");
  const [recordsInput, setRecordsInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    type: "success" | "error";
    text: string;
    ids?: string[];
  } | null>(null);

  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [filterOwner, setFilterOwner] = useState("");
  const [filterLocation, setFilterLocation] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("sor_user");
    if (!stored) {
      router.replace("/login");
      return;
    }
    setUser(JSON.parse(stored));
  }, [router]);

  const fetchAssets = useCallback(
    async (type: AssetType, username: string, owner?: string, location?: string) => {
      setLoadingAssets(true);
      try {
        const params = new URLSearchParams();
        if (owner) params.set("asset_owner", owner);
        if (location) params.set("asset_location", location);
        const qs = params.toString() ? `?${params.toString()}` : "";
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/assets/${type}${qs}`,
          { headers: { "X-Username": username } }
        );
        if (res.ok) setAssets(await res.json());
      } finally {
        setLoadingAssets(false);
      }
    },
    []
  );

  useEffect(() => {
    if (user) {
      setFilterOwner("");
      setFilterLocation("");
      fetchAssets(selectedType, user.username);
    }
  }, [user, selectedType, fetchAssets]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitResult(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(recordsInput);
    } catch {
      setSubmitResult({ type: "error", text: "Invalid JSON — must be an array of objects." });
      return;
    }
    if (!Array.isArray(parsed)) {
      setSubmitResult({ type: "error", text: "Payload must be a JSON array." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/assets/${selectedType}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Username": user!.username,
          },
          body: JSON.stringify(parsed),
        }
      );
      const data = await res.json();
      if (res.ok) {
        setSubmitResult({
          type: "success",
          text: data.message,
          ids: data.asset_ids,
        });
        setRecordsInput("");
        fetchAssets(selectedType, user!.username);
      } else {
        setSubmitResult({ type: "error", text: data.detail || "Asset Records saving unsuccessful" });
      }
    } catch {
      setSubmitResult({ type: "error", text: "Unable to reach the server." });
    } finally {
      setSubmitting(false);
    }
  }

  function handleFilter(e: React.FormEvent) {
    e.preventDefault();
    if (user) fetchAssets(selectedType, user.username, filterOwner, filterLocation);
  }

  const canPost = user?.asset_type === selectedType;

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
            <Link href="/assets" className="text-blue-600 font-medium">
              Assets
            </Link>
            <Link href="/reports" className="text-gray-500 hover:text-gray-800">
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
        <h2 className="text-xl font-semibold text-gray-800 mb-6">Asset Ingestion</h2>

        {/* Asset type tabs */}
        <div className="flex gap-2 mb-8">
          {ASSET_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => {
                setSelectedType(type);
                setSubmitResult(null);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                selectedType === type
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Submit form */}
          <section>
            <h3 className="text-base font-semibold text-gray-700 mb-3">Submit Asset Records</h3>
            {!canPost ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
                {user.asset_type
                  ? `You are authorised to ingest assets for "${user.asset_type}" only.`
                  : "Read-only users cannot submit asset records."}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Asset Records (JSON Array)
                  </label>
                  <p className="text-xs text-gray-400 mb-2">
                    Provide an array of objects.{" "}
                    <code className="bg-gray-100 px-1 rounded">asset_type</code> and{" "}
                    <code className="bg-gray-100 px-1 rounded">asset_id</code> are
                    injected automatically.
                  </p>
                  <textarea
                    value={recordsInput}
                    onChange={(e) => setRecordsInput(e.target.value)}
                    required
                    rows={14}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                    placeholder={`[\n  {\n    "asset_owner": "Platform Team",\n    "asset_location": "us-east-1"\n  }\n]`}
                  />
                </div>

                {submitResult && (
                  <div
                    className={`text-sm px-3 py-2 rounded-lg border ${
                      submitResult.type === "success"
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-red-50 text-red-600 border-red-200"
                    }`}
                  >
                    <p className="font-medium">{submitResult.text}</p>
                    {submitResult.ids && submitResult.ids.length > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {submitResult.ids.map((id) => (
                          <li key={id} className="font-mono text-xs">
                            {id}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg py-2 text-sm transition-colors"
                >
                  {submitting ? "Saving…" : "Save Asset Records"}
                </button>
              </form>
            )}
          </section>

          {/* View section */}
          <section>
            <h3 className="text-base font-semibold text-gray-700 mb-3">
              View Assets —{" "}
              <span className="capitalize">{selectedType}</span>
            </h3>

            <form onSubmit={handleFilter} className="flex gap-2 mb-4">
              <input
                type="text"
                value={filterOwner}
                onChange={(e) => setFilterOwner(e.target.value)}
                placeholder="Filter by owner"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
                placeholder="Filter by location"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="px-3 py-1.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-700"
              >
                Search
              </button>
            </form>

            {loadingAssets ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : assets.length === 0 ? (
              <p className="text-sm text-gray-400">No asset records found.</p>
            ) : (
              <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
                {assets.map((a) => {
                  const { _id, asset_id, asset_type, asset_owner, asset_location, ...rest } = a;
                  return (
                    <div
                      key={_id}
                      className="bg-white rounded-xl border border-gray-200 p-4"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="font-mono text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded break-all">
                          {asset_id}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 mb-2">
                        <span>
                          <span className="text-gray-400">Owner </span>
                          {asset_owner}
                        </span>
                        <span>
                          <span className="text-gray-400">Location </span>
                          {asset_location}
                        </span>
                      </div>
                      {Object.keys(rest).length > 0 && (
                        <pre className="text-xs text-gray-500 bg-gray-50 rounded p-2 overflow-auto max-h-24 whitespace-pre-wrap">
                          {JSON.stringify(rest, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
