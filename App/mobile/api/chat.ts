// Chat REST surface for the mobile officer app. Thin wrappers over the
// shared axios `api` instance (auto Bearer + refresh). Realtime delivery is
// handled separately by lib/chatSocket + hooks/useChat.

import { api, API_BASE_URL } from "@/lib/api";
import { getAccessToken } from "@/lib/session";

export type ChatType =
  | "officer_ward"
  | "municipality_internal"
  | "ward_municipality"
  | "complaint_case";

export type ChatAttachment = {
  id: string;
  file_name: string;
  mime_type: string;
  resource_type: string;
  size_bytes: number;
};

export type ChatMessage = {
  id: string;
  chat_id: string;
  sender_kind: "user" | "officer";
  sender_id: string;
  type: string;
  body: string | null;
  reply_to_message_id?: string | null;
  priority?: string;
  client_msg_id?: string | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  created_at: string;
  attachments?: ChatAttachment[];
};

export type ChatSummary = {
  id: string;
  type: ChatType;
  title: string | null;
  /** For 1-on-1 chats: the other participant's name computed server-side.
   *  Always use this over `title` when present — `title` is the name the
   *  creator used, which may be the viewer's own name. */
  display_title: string | null;
  status: string;
  priority?: string;
  ward_id: string | null;
  municipality_id: string | null;
  is_group?: boolean;
  is_archived?: boolean;
  my_role?: string;
  other_participant_kind?: "user" | "officer" | null;
  other_participant_id?: string | null;
  last_message_at: string | null;
  created_at: string;
  last_message: {
    body: string | null;
    type: string;
    mime_type?: string | null;
  } | null;
};

export type ChatParticipant = {
  party_kind: "user" | "officer";
  party_id: string;
  role_in_chat: string;
  is_active: boolean;
  joined_at: string;
  removed_at: string | null;
};

export type HistoryPage = {
  messages: ChatMessage[];
  nextCursor: string | null;
  hasMore: boolean;
  direction: "forward" | "backward";
};

export async function listChats(): Promise<ChatSummary[]> {
  const res = await api.get("/chat");
  return res.data?.data?.chats ?? [];
}

export async function getHistory(
  chatId: string,
  opts: { limit?: number; before?: string | null; after?: string | null } = {},
): Promise<HistoryPage> {
  const params: Record<string, string | number> = {};
  if (opts.limit) params.limit = opts.limit;
  if (opts.before) params.before = opts.before;
  if (opts.after) params.after = opts.after;
  const res = await api.get(`/chat/${chatId}/messages`, { params });
  return res.data.data as HistoryPage;
}

export async function sendMessage(
  chatId: string,
  input: {
    body?: string | null;
    type?: string;
    clientMsgId?: string | null;
    replyToMessageId?: string | null;
  },
): Promise<{ message: ChatMessage; deduped: boolean }> {
  const res = await api.post(`/chat/${chatId}/messages`, input);
  return res.data.data;
}

export async function createChat(input: {
  type: ChatType;
  title?: string | null;
  wardId?: string | null;
  municipalityId?: string | null;
  participants?: { kind: "user" | "officer"; id: string }[];
}): Promise<ChatSummary> {
  const res = await api.post("/chat", input);
  return res.data.data.chat as ChatSummary;
}

export async function getParticipants(
  chatId: string,
): Promise<ChatParticipant[]> {
  const res = await api.get(`/chat/${chatId}/participants`);
  return res.data?.data?.participants ?? [];
}

export type LocalAttachment = {
  uri: string;
  name: string;
  mimeType: string;
};

/**
 * Upload a file as a chat message (image / file / audio). The backend infers
 * the message type from the mime and emits a `message.created` realtime event
 * just like a text send, so the optimistic message reconciles by clientMsgId.
 */
export async function uploadAttachment(
  chatId: string,
  file: LocalAttachment,
  opts: { body?: string | null; clientMsgId?: string | null; replyToMessageId?: string | null } = {},
): Promise<{ message: ChatMessage; deduped?: boolean }> {
  const form = new FormData();
  // React Native FormData file shape.
  form.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  } as unknown as Blob);
  if (opts.body) form.append("body", opts.body);
  if (opts.clientMsgId) form.append("clientMsgId", opts.clientMsgId);
  if (opts.replyToMessageId) form.append("replyToMessageId", opts.replyToMessageId);

  const res = await api.post(`/chat/${chatId}/attachments`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60000,
  });
  return res.data.data;
}

/** Authenticated URL the backend streams the (otherwise signed) asset from. */
export function attachmentUrl(
  attachmentId: string,
  opts: { thumb?: boolean } = {},
): string {
  const base = `${API_BASE_URL}/chat/attachments/${attachmentId}`;
  return opts.thumb ? `${base}?thumb=1` : base;
}

export type ChatPeer = {
  id: string;
  first_name: string;
  last_name: string;
  type: "ward_officer" | "municipality_officer";
  profile_image_url: string | null;
  department_name: string | null;
};

export async function listPeers(): Promise<ChatPeer[]> {
  const res = await api.get("/chat/peers");
  return res.data?.data?.peers ?? [];
}

export type WardOrg = {
  id: string;
  name: string;
  email: string;
  ward_name: string;
};

export type MunicipalityOrg = {
  id: string;
  name: string;
  email: string;
  municipality_name: string;
};

/** Returns ward org user accounts the calling officer can initiate chats with.
 *  Ward officers get their single ward's account; municipality officers get all
 *  ward accounts in their municipality. */
export async function listWardOrgs(): Promise<WardOrg[]> {
  const res = await api.get("/chat/ward-org");
  return res.data?.data?.ward_orgs ?? [];
}

/** Returns the municipality org account a municipality officer can chat with. */
export async function listMunicipalityOrgs(): Promise<MunicipalityOrg[]> {
  const res = await api.get("/chat/municipality-org");
  return res.data?.data?.municipality_orgs ?? [];
}

/** Header map for <Image source={{ uri, headers }}> on protected assets. */
export async function authImageHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
