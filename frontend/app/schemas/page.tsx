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

interface SchemaDoc {
  _id: string;
  asset_type: string;
  version: string;
  [key: string]: unknown;
}

export default function SchemasPage() {
  const router = useRouter();
  const [user, setUser] = useState<SorUser | null>(null);
  const [selectedType, setSelectedType] = useState<AssetType>("servers");
  const [schemas, setSchemas] = useState<SchemaDoc[]>([]);
  const [loadingSchemas, setLoadingSchemas] = useState(false);
  const [schemaInput, setSchemaInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("sor_user");
    if (!stored) {
      router.replace("/login");
      return;
    }
    setUser(JSON.parse(stored));
  }, [router]);

  const fetchSchemas = useCallback(async (type: AssetType, username: string) => {
    setLoadingSchemas(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/schemas/${type}`,
        { headers: { "X-Username": username } }
      );
      if (res.ok) {
        setSchemas(await res.json());
      }
    } finally {
      setLoadingSchemas(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchSchemas(selectedType, user.username);
  }, [user, selectedType, fetchSchemas]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(schemaInput);
    } catch {
      setMessage({ type: "error", text: "Invalid JSON — please check your schema." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/schemas/${selectedType}`,
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
        setMessage({ type: "success", text: data.message });
        setSchemaInput("");
        fetchSchemas(selectedType, user!.username);
      } else {
        setMessage({ type: "error", text: data.detail || "Schema saving unsuccessful" });
      }
    } catch {
      setMessage({ type: "error", text: "Unable to reach the server." });
    } finally {
      setSubmitting(false);
    }
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
            <Link href="/schemas" className="text-blue-600 font-medium">
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

      <main className="max-w-5xl mx-auto px-6 py-8">
        <h2 className="text-xl font-semibold text-gray-800 mb-6">Schema Management</h2>

        <div className="flex gap-2 mb-8">
          {ASSET_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => {
                setSelectedType(type);
                setMessage(null);
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
          <section>
            <h3 className="text-base font-semibold text-gray-700 mb-3">
              Existing Schemas —{" "}
              <span className="capitalize">{selectedType}</span>
            </h3>
            {loadingSchemas ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : schemas.length === 0 ? (
              <p className="text-sm text-gray-400">No schemas found for this asset type.</p>
            ) : (
              <div className="space-y-4">
                {[...schemas]
                  .sort((a, b) => parseFloat(b.version) - parseFloat(a.version))
                  .map((s) => {
                    const { _id, ...rest } = s;
                    return (
                      <div
                        key={_id}
                        className="bg-white rounded-xl border border-gray-200 p-4"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-800 capitalize">
                            {s.asset_type}
                          </span>
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                            v{s.version}
                          </span>
                        </div>
                        <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-auto max-h-64 whitespace-pre-wrap">
                          {JSON.stringify(rest, null, 2)}
                        </pre>
                      </div>
                    );
                  })}
              </div>
            )}
          </section>

          <section>
            <h3 className="text-base font-semibold text-gray-700 mb-3">Add New Schema</h3>
            {!canPost ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
                {user.asset_type
                  ? `You are authorised to manage schemas for "${user.asset_type}" only.`
                  : "Read-only users cannot add schemas."}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Schema JSON
                  </label>
                  <p className="text-xs text-gray-400 mb-2">
                    Paste a JSON Schema object.{" "}
                    <code className="bg-gray-100 px-1 rounded">asset_type</code> and{" "}
                    <code className="bg-gray-100 px-1 rounded">version</code> are
                    injected automatically.
                  </p>
                  <textarea
                    value={schemaInput}
                    onChange={(e) => setSchemaInput(e.target.value)}
                    required
                    rows={14}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                    placeholder={`{\n  "$schema": "http://json-schema.org/draft-07/schema#",\n  "title": "My Schema",\n  "type": "object",\n  "required": ["asset_type", "asset_owner", "asset_location"],\n  "properties": { ... }\n}`}
                  />
                </div>

                {message && (
                  <p
                    className={`text-sm px-3 py-2 rounded-lg border ${
                      message.type === "success"
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-red-50 text-red-600 border-red-200"
                    }`}
                  >
                    {message.text}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg py-2 text-sm transition-colors"
                >
                  {submitting ? "Saving…" : "Save Schema"}
                </button>
              </form>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
