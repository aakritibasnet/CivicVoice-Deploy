"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/src/store/auth-store";
import { useChat } from "@/src/hooks/useChat";
import { LuSearch, LuMessageSquare, LuBuilding2, LuUser, LuChevronRight } from "react-icons/lu";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChatSummary = {
  id: string;
  type: string;
  title: string | null;
  display_title?: string | null;
  status: string;
  ward_id: string | null;
  municipality_id: string | null;
  my_role: string;
  last_message_at: string | null;
  last_message: { body: string | null; type: string } | null;
};

type Ward = {
  id: string;
  ward_name: string;
  ward_code: string;
  municipality_id: string;
};

type Officer = {
  id: string;
  first_name: string;
  last_name: string;
  type?: string;
  profile_image_url?: string | null;
  department_name?: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffHours < 1) return "now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function messagePreview(msg: { body: string | null; type: string } | null): string {
  if (!msg) return "No messages yet";
  if (msg.type === "image") return "📷 Photo";
  if (msg.type === "file") return "📎 File";
  return msg.body ?? "No messages yet";
}

// ─── Ward user view ───────────────────────────────────────────────────────────

function WardView({
  chats,
  unread,
  token,
  municipalityId,
  BACKEND,
}: {
  chats: ChatSummary[];
  unread: Record<string, number>;
  token: string;
  municipalityId: string | null;
  BACKEND: string;
}) {
  const router = useRouter();
  const [municipalityChat, setMunicipalityChat] = useState<ChatSummary | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [officerSearch, setOfficerSearch] = useState("");
  const [openingOfficerId, setOpeningOfficerId] = useState<string | null>(null);

  // Find or auto-provision the ward_municipality chat.
  useEffect(() => {
    const existing = chats.find((c) => c.type === "ward_municipality");
    if (existing) {
      setMunicipalityChat(existing);
      setProvisionError(null);
      return;
    }
    if (provisioning) return;
    setProvisioning(true);
    setProvisionError(null);
    fetch(`${BACKEND}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: "ward_municipality", title: "Municipality Communication" }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (r.status === 401) {
          setProvisionError("session_expired");
          return;
        }
        if (!r.ok) {
          setProvisionError(data.error ?? "Failed to open municipality chat");
          return;
        }
        if (data.data?.chat) setMunicipalityChat(data.data.chat as ChatSummary);
      })
      .catch(() => setProvisionError("Network error — is the server running?"))
      .finally(() => setProvisioning(false));
  }, [chats, token, BACKEND]);

  // Fetch ward officers from the officers table (correct IDs for chat participants).
  useEffect(() => {
    fetch(`${BACKEND}/api/chat/ward-officers`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setOfficers(data.data?.officers ?? []))
      .catch(console.error);
  }, [token, BACKEND]);

  const filteredOfficers = useMemo(() => {
    if (!officerSearch.trim()) return officers;
    const q = officerSearch.toLowerCase();
    return officers.filter(
      (o) =>
        `${o.first_name} ${o.last_name}`.toLowerCase().includes(q) ||
        (o.department_name ?? "").toLowerCase().includes(q),
    );
  }, [officers, officerSearch]);

  const openOfficerChat = async (officer: Officer) => {
    setOpeningOfficerId(officer.id);
    try {
      // Backend find-or-create prevents duplicate chats when either side initiates.
      const res = await fetch(`${BACKEND}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: "officer_ward",
          title: `${officer.first_name} ${officer.last_name}`,
          participants: [{ kind: "officer", id: officer.id }],
        }),
      });
      const data = await res.json();
      if (data.data?.chat) router.push(`/dashboard/chat/${data.data.chat.id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setOpeningOfficerId(null);
    }
  };

  const muniUnread = municipalityChat ? (unread[municipalityChat.id] ?? 0) : 0;

  return (
    <div className="space-y-6">
      {/* Municipality chat */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
          Municipality
        </h2>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {provisioning ? (
            <div className="flex items-center gap-3 px-4 py-4">
              <div className="h-11 w-11 rounded-full bg-gray-100 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3" />
                <div className="h-2.5 bg-gray-100 rounded animate-pulse w-1/3" />
              </div>
            </div>
          ) : municipalityChat ? (
            <button
              onClick={() => router.push(`/dashboard/chat/${municipalityChat.id}`)}
              className="w-full flex items-center gap-3 px-4 py-4 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="h-11 w-11 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                <LuBuilding2 className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-gray-900 text-sm">
                    {municipalityChat.display_title ?? municipalityChat.title ?? "Municipality Communication"}
                  </p>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {formatTime(municipalityChat.last_message_at)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className="text-xs text-gray-500 truncate">
                    {messagePreview(municipalityChat.last_message)}
                  </p>
                  {muniUnread > 0 && (
                    <span className="flex-shrink-0 inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 rounded-full bg-blue-600 text-white text-xs font-bold">
                      {muniUnread}
                    </span>
                  )}
                </div>
              </div>
              <LuChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
            </button>
          ) : provisionError === "session_expired" ? (
            <div className="px-4 py-4">
              <p className="text-sm font-medium text-amber-700">Session expired</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Please log out and log back in to reconnect.
              </p>
            </div>
          ) : provisionError ? (
            <div className="px-4 py-4">
              <p className="text-sm font-medium text-red-600">Could not connect</p>
              <p className="text-xs text-gray-500 mt-0.5">{provisionError}</p>
            </div>
          ) : (
            <div className="px-4 py-4">
              <p className="text-sm font-medium text-red-600">Could not connect to municipality</p>
              <p className="text-xs text-gray-500 mt-0.5">Please try refreshing the page.</p>
            </div>
          )}
        </div>
      </section>

      {/* Officers */}
      {officers.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
            Ward Officers
          </h2>
          <div className="relative mb-2">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search officers…"
              value={officerSearch}
              onChange={(e) => setOfficerSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {officerSearch.trim() && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
            {filteredOfficers.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400">No officers found</p>
            ) : (
              filteredOfficers.map((officer) => (
                <button
                  key={officer.id}
                  onClick={() => openOfficerChat(officer)}
                  disabled={openingOfficerId === officer.id}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left disabled:opacity-60"
                >
                  <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <LuUser className="h-4 w-4 text-emerald-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {officer.first_name} {officer.last_name}
                    </p>
                    {officer.department_name && (
                      <p className="text-xs text-gray-500 truncate">{officer.department_name}</p>
                    )}
                  </div>
                  <span className="text-xs text-blue-600 font-medium flex-shrink-0">
                    {openingOfficerId === officer.id ? "Opening…" : "Chat →"}
                  </span>
                </button>
              ))
            )}
          </div>
          )}
        </section>
      )}

      {/* Existing officer_ward chats */}
      {chats.filter((c) => c.type === "officer_ward").length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
            Officer Conversations
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
            {chats
              .filter((c) => c.type === "officer_ward")
              .map((chat) => {
                const chatUnread = unread[chat.id] ?? 0;
                return (
                  <button
                    key={chat.id}
                    onClick={() => router.push(`/dashboard/chat/${chat.id}`)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="h-9 w-9 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
                      {(chat.display_title ?? chat.title ?? "O").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {chat.display_title ?? chat.title ?? "Officer Chat"}
                        </p>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {formatTime(chat.last_message_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-gray-500 truncate">
                          {messagePreview(chat.last_message)}
                        </p>
                        {chatUnread > 0 && (
                          <span className="flex-shrink-0 inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 rounded-full bg-blue-600 text-white text-xs font-bold">
                            {chatUnread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Municipality user view ───────────────────────────────────────────────────

function MunicipalityView({
  chats,
  unread,
  token,
  municipalityId,
  BACKEND,
}: {
  chats: ChatSummary[];
  unread: Record<string, number>;
  token: string;
  municipalityId: string | null;
  BACKEND: string;
}) {
  const router = useRouter();
  const [wards, setWards] = useState<Ward[]>([]);
  const [wardSearch, setWardSearch] = useState("");
  const [openingWardId, setOpeningWardId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BACKEND}/api/wards`)
      .then((r) => r.json())
      .then((data) => {
        const all: Ward[] = data.wards ?? [];
        setWards(municipalityId ? all.filter((w) => w.municipality_id === municipalityId) : all);
      })
      .catch(console.error);
  }, [BACKEND, municipalityId]);

  const chatByWardId = useMemo(() => {
    const map: Record<string, ChatSummary> = {};
    for (const c of chats) {
      if (c.type === "ward_municipality" && c.ward_id) map[c.ward_id] = c;
    }
    return map;
  }, [chats]);

  const filteredWards = useMemo(() => {
    if (!wardSearch.trim()) return wards;
    const q = wardSearch.toLowerCase();
    return wards.filter(
      (w) => w.ward_name.toLowerCase().includes(q) || w.ward_code.toLowerCase().includes(q),
    );
  }, [wards, wardSearch]);

  const internalChats = useMemo(
    () => chats.filter((c) => c.type === "municipality_internal"),
    [chats],
  );

  const openWardChat = async (ward: Ward) => {
    const existing = chatByWardId[ward.id];
    if (existing) {
      router.push(`/dashboard/chat/${existing.id}`);
      return;
    }
    setOpeningWardId(ward.id);
    try {
      const res = await fetch(`${BACKEND}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: "ward_municipality",
          title: `${ward.ward_name}`,
          wardId: ward.id,
        }),
      });
      const data = await res.json();
      if (data.data?.chat) router.push(`/dashboard/chat/${data.data.chat.id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setOpeningWardId(null);
    }
  };

  const existingWardChats = useMemo(
    () =>
      chats
        .filter((c) => c.type === "ward_municipality")
        .sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? "")),
    [chats],
  );

  return (
    <div className="space-y-4">
      {/* Existing ward conversations — always visible */}
      {existingWardChats.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
            Ward Conversations
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
            {existingWardChats.map((chat) => {
              const chatUnread = unread[chat.id] ?? 0;
              const wardName = chat.display_title ?? chat.title ?? "Ward";
              return (
                <button
                  key={chat.id}
                  onClick={() => router.push(`/dashboard/chat/${chat.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
                    {wardName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-gray-900 text-sm truncate">{wardName}</p>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {formatTime(chat.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs text-gray-500 truncate">
                        {messagePreview(chat.last_message)}
                      </p>
                      {chatUnread > 0 && (
                        <span className="flex-shrink-0 inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 rounded-full bg-blue-600 text-white text-xs font-bold">
                          {chatUnread}
                        </span>
                      )}
                    </div>
                  </div>
                  <LuChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Ward directory — only shown when searching */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
          {wardSearch.trim() ? `Wards (${filteredWards.length})` : "Start New Ward Chat"}
        </h2>
        <div className="relative mb-2">
          <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search wards…"
            value={wardSearch}
            onChange={(e) => setWardSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {wardSearch.trim() && (
          filteredWards.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <LuBuilding2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No wards found</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
              {filteredWards.map((ward) => {
                const chat = chatByWardId[ward.id];
                const chatUnread = chat ? (unread[chat.id] ?? 0) : 0;
                const isOpening = openingWardId === ward.id;

                return (
                  <button
                    key={ward.id}
                    onClick={() => openWardChat(ward)}
                    disabled={isOpening}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left disabled:opacity-60"
                  >
                    <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
                      {ward.ward_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-gray-900 text-sm truncate">
                          {ward.ward_name}
                        </p>
                        {chat && (
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            {formatTime(chat.last_message_at)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-gray-400 truncate">
                          {chat ? messagePreview(chat.last_message) : "Tap to open chat"}
                        </p>
                        {chatUnread > 0 && (
                          <span className="flex-shrink-0 inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 rounded-full bg-blue-600 text-white text-xs font-bold">
                            {chatUnread}
                          </span>
                        )}
                      </div>
                    </div>
                    {isOpening ? (
                      <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    ) : (
                      <LuChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )
        )}
      </div>

      {internalChats.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
            Municipality Officers
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
            {internalChats.map((chat) => {
              const chatUnread = unread[chat.id] ?? 0;
              const title =
                chat.display_title ?? chat.title ?? "Municipality officer";

              return (
                <button
                  key={chat.id}
                  onClick={() => router.push(`/dashboard/chat/${chat.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="h-10 w-10 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
                    <LuUser className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        {title}
                      </p>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {formatTime(chat.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs text-gray-500 truncate">
                        {messagePreview(chat.last_message)}
                      </p>
                      {chatUnread > 0 && (
                        <span className="flex-shrink-0 inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 rounded-full bg-blue-600 text-white text-xs font-bold">
                          {chatUnread}
                        </span>
                      )}
                    </div>
                  </div>
                  <LuChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChatListPage() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const { connected, unread, syncUnread } = useChat();

  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
  const isMunicipality = user?.role === "municipality";

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${BACKEND}/api/chat`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        setChats(data.data?.chats ?? []);
        setError(null);
      })
      .catch(() => setError("Failed to load chats"))
      .finally(() => setLoading(false));
  }, [token, BACKEND]);

  useEffect(() => {
    if (connected) syncUnread();
  }, [connected, syncUnread]);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Messages</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isMunicipality ? "Ward communication" : "Ward · Municipality communication"}
          </p>
        </div>
        {connected && (
          <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-green-100 text-green-700">
            ● Live
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-sm text-red-600 p-4 bg-red-50 rounded-xl border border-red-200">
          {error}
        </div>
      ) : !token ? (
        <p className="text-sm text-gray-500">Not authenticated.</p>
      ) : isMunicipality ? (
        <MunicipalityView
          chats={chats}
          unread={unread}
          token={token}
          municipalityId={user?.municipality_id ?? null}
          BACKEND={BACKEND}
        />
      ) : (
        <WardView
          chats={chats}
          unread={unread}
          token={token}
          municipalityId={user?.municipality_id ?? null}
          BACKEND={BACKEND}
        />
      )}

      {/* Show other chat types (complaint cases etc.) if any */}
      {!loading && !error && chats.filter((c) => c.type === "complaint_case").length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
            Case Chats
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
            {chats
              .filter((c) => c.type === "complaint_case")
              .map((chat) => {
                const chatUnread = unread[chat.id] ?? 0;
                return (
                  <button
                    key={chat.id}
                    onClick={() => router.push(`/dashboard/chat/${chat.id}`)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="h-10 w-10 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
                      <LuMessageSquare className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        {chat.title ?? "Case Chat"}
                      </p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {messagePreview(chat.last_message)}
                      </p>
                    </div>
                    {chatUnread > 0 && (
                      <span className="flex-shrink-0 inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 rounded-full bg-blue-600 text-white text-xs font-bold">
                        {chatUnread}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </section>
      )}
    </div>
  );
}
