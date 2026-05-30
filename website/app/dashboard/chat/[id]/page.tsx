"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/src/store/auth-store";
import { useChat, type ChatMessage } from "@/src/hooks/useChat";
import { ChatAttachment } from "@/src/components/chat/ChatAttachment";
import {
  LuArrowLeft,
  LuPaperclip,
  LuSend,
  LuX,
  LuFile,
  LuCheck,
  LuCheckCheck,
  LuClock,
  LuReply,
  LuImage,
} from "react-icons/lu";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChatMeta = {
  id: string;
  title: string | null;
  type: string;
  status: string;
};

type PendingMessage = ChatMessage & {
  _clientMsgId: string;
  _status: "sending" | "failed";
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateSeparator(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function chatTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    ward_municipality: "Ward · Municipality",
    officer_ward: "Ward",
    municipality_internal: "Internal",
    complaint_case: "Case",
  };
  return labels[type] ?? type.replace(/_/g, " ");
}

/** One-line summary of a message for use in reply previews. */
function replyPreviewText(msg: ChatMessage): string {
  if (msg.attachments && msg.attachments.length > 0) {
    const att = msg.attachments[0];
    if (att.mime_type.startsWith("image/")) return "📷 Photo";
    if (att.mime_type === "application/pdf") return "📄 PDF";
    return `📎 ${att.file_name}`;
  }
  if (msg.type === "image") return "📷 Photo";
  if (msg.type === "file") return "📎 File";
  if (msg.type === "audio") return "🎤 Voice note";
  return msg.body ?? "";
}

// ─── Status tick component ────────────────────────────────────────────────────

function MessageStatus({
  status,
}: {
  status: "sending" | "sent" | "delivered" | "read";
}) {
  if (status === "sending")
    return <LuClock className="h-3 w-3 text-blue-200" />;
  if (status === "sent")
    return <LuCheck className="h-3 w-3 text-blue-200" />;
  if (status === "delivered")
    return <LuCheckCheck className="h-3 w-3 text-blue-200" />;
  return <LuCheckCheck className="h-3 w-3 text-white" />;
}

// ─── Reply quote block (inside a bubble) ─────────────────────────────────────

function ReplyQuote({
  original,
  isMine,
  token,
  BACKEND,
}: {
  original: ChatMessage;
  isMine: boolean;
  token: string;
  BACKEND: string;
}) {
  const hasImage =
    original.attachments?.some((a) => a.mime_type.startsWith("image/")) ??
    (original.type === "image");

  const firstImageAtt = original.attachments?.find((a) =>
    a.mime_type.startsWith("image/"),
  );

  return (
    <div
      className={`flex gap-2 rounded-lg px-2.5 py-1.5 mb-1.5 max-w-full overflow-hidden ${
        isMine
          ? "bg-blue-500/40 border-l-2 border-white/60"
          : "bg-gray-100 border-l-2 border-blue-400"
      }`}
    >
      {/* Thumbnail for image replies */}
      {firstImageAtt && (
        <ReplyImageThumb
          attachmentId={firstImageAtt.id}
          token={token}
          BACKEND={BACKEND}
        />
      )}

      <div className="flex-1 min-w-0">
        <p
          className={`text-[10px] font-semibold mb-0.5 ${
            isMine ? "text-blue-100" : "text-blue-600"
          }`}
        >
          Replying to
        </p>
        <p
          className={`text-xs truncate ${
            isMine ? "text-blue-100/80" : "text-gray-600"
          }`}
        >
          {replyPreviewText(original)}
        </p>
      </div>
    </div>
  );
}

/** Small thumbnail fetched once for image reply previews. */
function ReplyImageThumb({
  attachmentId,
  token,
  BACKEND,
}: {
  attachmentId: string;
  token: string;
  BACKEND: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    fetch(`${BACKEND}/api/chat/attachments/${attachmentId}?thumb=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setSrc(url);
      })
      .catch(() => {});

    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [attachmentId, token, BACKEND]);

  if (!src) return <LuImage className="h-8 w-8 opacity-40 flex-shrink-0 self-center" />;
  return (
    <img
      src={src}
      alt=""
      className="h-10 w-10 rounded object-cover flex-shrink-0"
    />
  );
}

// ─── Reply banner (above the composer) ───────────────────────────────────────

function ReplyBanner({
  replyTo,
  onCancel,
  token,
  BACKEND,
}: {
  replyTo: ChatMessage;
  onCancel: () => void;
  token: string;
  BACKEND: string;
}) {
  const firstImageAtt = replyTo.attachments?.find((a) =>
    a.mime_type.startsWith("image/"),
  );

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 border-t border-blue-200 flex-shrink-0">
      <div className="w-1 self-stretch bg-blue-500 rounded-full flex-shrink-0" />

      {firstImageAtt && (
        <ReplyImageThumb
          attachmentId={firstImageAtt.id}
          token={token}
          BACKEND={BACKEND}
        />
      )}

      {!firstImageAtt && (
        <LuReply className="h-4 w-4 text-blue-500 flex-shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-blue-600">Replying to</p>
        <p className="text-xs text-gray-600 truncate">
          {replyPreviewText(replyTo)}
        </p>
      </div>

      <button
        onClick={onCancel}
        className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
        title="Cancel reply"
      >
        <LuX className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type PendingFile = { file: File; previewUrl: string | null };

export default function ChatRoomPage() {
  const { id: chatId } = useParams<{ id: string }>();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const router = useRouter();

  const BACKEND =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
  const {
    connected,
    messages,
    isTyping,
    deliveredIds,
    othersLastReadMsgId,
    markRead,
    sendTyping,
  } = useChat(chatId);

  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [chatMeta, setChatMeta] = useState<ChatMeta | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load history and chat metadata on mount.
  useEffect(() => {
    if (!token || !chatId) return;

    fetch(`${BACKEND}/api/chat/${chatId}/messages?limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const msgs: ChatMessage[] = data.data?.messages ?? [];
        setHistory(msgs.reverse());
      })
      .catch(console.error);

    fetch(`${BACKEND}/api/chat`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const chats = data.data?.chats as ChatMeta[] | undefined;
        const found = chats?.find((c) => c.id === chatId);
        if (found) setChatMeta(found);
      })
      .catch(console.error);
  }, [token, chatId, BACKEND]);

  // Merge history + live socket messages, deduplicated by id.
  const allMessages: ChatMessage[] = [...history];
  for (const m of messages) {
    if (!allMessages.find((h) => h.id === m.id)) allMessages.push(m);
  }

  // Remove pending messages that have been confirmed via socket.
  useEffect(() => {
    if (pendingMessages.length === 0) return;
    const confirmedClientIds = new Set(
      allMessages
        .map((m) => m.client_msg_id)
        .filter((id): id is string => Boolean(id)),
    );
    setPendingMessages((prev) =>
      prev.filter((pm) => !confirmedClientIds.has(pm._clientMsgId)),
    );
  }, [messages.length]); // intentionally only trigger on new socket messages

  const visible = [
    ...allMessages.filter((m) => m && !m.deleted_at),
    ...pendingMessages
      .filter(
        (pm) =>
          !allMessages.find(
            (m) => m.client_msg_id === pm._clientMsgId,
          ),
      )
      .filter((pm) => pm._status !== "failed"),
  ];

  // Build a lookup map for reply-to resolution.
  const msgById = new Map<string, ChatMessage>(
    [...allMessages, ...pendingMessages].map((m) => [m.id, m]),
  );

  // Scroll to bottom and mark read when new content appears.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    const lastReal = allMessages.filter((m) => m && !m.deleted_at).at(-1);
    if (lastReal) markRead(lastReal.id);
  }, [visible.length]);

  const handleBodyChange = (val: string) => {
    setBody(val);
    sendTyping(val.length > 0);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => sendTyping(false), 3000);
  };

  const handleSetReply = (msg: ChatMessage) => {
    setReplyTo(msg);
    textareaRef.current?.focus();
  };

  const handleSend = useCallback(async () => {
    const trimmed = body.trim();
    if (!trimmed || !token || sending) return;

    const clientMsgId = crypto.randomUUID();
    const replyToId = replyTo?.id ?? null;

    const optimistic: PendingMessage = {
      id: `pending-${clientMsgId}`,
      chat_id: chatId,
      sender_kind: "user",
      sender_id: user?.id ?? "",
      type: "text",
      body: trimmed,
      priority: "normal",
      created_at: new Date().toISOString(),
      client_msg_id: clientMsgId,
      reply_to_message_id: replyToId,
      _clientMsgId: clientMsgId,
      _status: "sending",
    };
    setPendingMessages((prev) => [...prev, optimistic]);
    setBody("");
    setReplyTo(null);
    setSending(true);
    sendTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    try {
      await fetch(`${BACKEND}/api/chat/${chatId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          body: trimmed,
          type: "text",
          clientMsgId,
          replyToMessageId: replyToId,
        }),
      });
    } catch {
      setPendingMessages((prev) =>
        prev.map((pm) =>
          pm._clientMsgId === clientMsgId
            ? { ...pm, _status: "failed" }
            : pm,
        ),
      );
    } finally {
      setSending(false);
    }
  }, [body, token, sending, chatId, BACKEND, sendTyping, user, replyTo]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    const previewUrl = file.type.startsWith("image/")
      ? URL.createObjectURL(file)
      : null;
    setPendingFile({ file, previewUrl });
    e.target.value = "";
  };

  const handleUpload = async () => {
    if (!pendingFile || !token || uploading) return;
    setUploading(true);
    setUploadError(null);
    const formData = new FormData();
    formData.append("file", pendingFile.file);
    if (body.trim()) formData.append("body", body.trim());
    if (replyTo?.id) formData.append("replyToMessageId", replyTo.id);
    try {
      const res = await fetch(`${BACKEND}/api/chat/${chatId}/attachments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error ?? "Upload failed");
        return;
      }
      if (pendingFile.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl);
      setPendingFile(null);
      setBody("");
      setReplyTo(null);
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const cancelPendingFile = () => {
    if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl);
    setPendingFile(null);
    setUploadError(null);
  };

  const chatLabel =
    chatMeta?.title || (chatMeta ? chatTypeLabel(chatMeta.type) : "Chat");

  const lastReadIdx = othersLastReadMsgId
    ? visible.findLastIndex((m) => m.id === othersLastReadMsgId)
    : -1;

  // Date separator groups.
  type Item =
    | { kind: "separator"; label: string; key: string }
    | { kind: "message"; msg: ChatMessage; idx: number };

  const items: Item[] = [];
  let lastDate = "";
  visible.forEach((msg, idx) => {
    const dateStr = new Date(msg.created_at).toDateString();
    if (dateStr !== lastDate) {
      lastDate = dateStr;
      items.push({
        kind: "separator",
        label: formatDateSeparator(msg.created_at),
        key: dateStr + idx,
      });
    }
    items.push({ kind: "message", msg, idx });
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <button
          onClick={() => router.push("/dashboard/chat")}
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
        >
          <LuArrowLeft className="h-5 w-5" />
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-gray-900 truncate leading-tight">
            {chatLabel}
          </h1>
          {chatMeta && (
            <p className="text-xs text-gray-500 capitalize">
              {chatMeta.status} · {chatTypeLabel(chatMeta.type)}
            </p>
          )}
        </div>

        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
            connected
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {connected ? "● Live" : "○ …"}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-3 space-y-1 min-h-0">
        {items.map((item) => {
          if (item.kind === "separator") {
            return (
              <div key={item.key} className="flex items-center gap-3 py-2">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400 font-medium">
                  {item.label}
                </span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
            );
          }

          const { msg, idx } = item;
          const isMine = msg.sender_id === user?.id;
          const isPending = "_clientMsgId" in msg;
          const hasAttachments = msg.attachments && msg.attachments.length > 0;
          const originalMsg = msg.reply_to_message_id
            ? msgById.get(msg.reply_to_message_id) ?? null
            : null;

          let msgStatus: "sending" | "sent" | "delivered" | "read" = "sent";
          if (isPending) {
            msgStatus = "sending";
          } else if (isMine) {
            if (lastReadIdx >= 0 && idx <= lastReadIdx) {
              msgStatus = "read";
            } else if (deliveredIds.has(msg.id)) {
              msgStatus = "delivered";
            } else {
              msgStatus = "sent";
            }
          }

          return (
            <div
              key={msg.id}
              className={`flex ${isMine ? "justify-end" : "justify-start"} mb-1 group`}
              onMouseEnter={() => setHoveredMsgId(msg.id)}
              onMouseLeave={() => setHoveredMsgId(null)}
            >
              {/* Reply button — visible on hover for their messages */}
              {!isMine && (
                <button
                  onClick={() => handleSetReply(msg)}
                  className={`self-end mb-1 mr-1.5 p-1 rounded-full text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-all flex-shrink-0 ${
                    hoveredMsgId === msg.id ? "opacity-100" : "opacity-0"
                  }`}
                  title="Reply"
                >
                  <LuReply className="h-3.5 w-3.5" />
                </button>
              )}

              <div
                className={`max-w-[72%] ${isMine ? "items-end" : "items-start"} flex flex-col gap-0.5`}
              >
                <div
                  className={`px-3 py-2 rounded-2xl text-sm break-words ${
                    isMine
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : "bg-white text-gray-900 shadow-sm border border-gray-100 rounded-bl-sm"
                  } ${isPending ? "opacity-70" : ""}`}
                >
                  {/* Reply quote */}
                  {originalMsg && token && (
                    <ReplyQuote
                      original={originalMsg}
                      isMine={isMine}
                      token={token}
                      BACKEND={BACKEND}
                    />
                  )}

                  {/* Attachment(s) */}
                  {hasAttachments &&
                    msg.attachments!.map((att) => (
                      <div key={att.id} className="mb-1.5 last:mb-0">
                        <ChatAttachment
                          attachmentId={att.id}
                          mimeType={att.mime_type}
                          fileName={att.file_name}
                          sizeBytes={att.size_bytes}
                        />
                      </div>
                    ))}

                  {/* Body */}
                  {msg.body && (
                    <span>
                      {msg.body}
                      {msg.edited_at && (
                        <span className="text-xs opacity-60 ml-1.5 italic">
                          (edited)
                        </span>
                      )}
                    </span>
                  )}
                </div>

                {/* Timestamp + status tick */}
                <div
                  className={`flex items-center gap-1 px-1 ${isMine ? "flex-row-reverse" : ""}`}
                >
                  <span className="text-[10px] text-gray-400">
                    {formatTime(msg.created_at)}
                  </span>
                  {isMine && <MessageStatus status={msgStatus} />}
                </div>
              </div>

              {/* Reply button — visible on hover for own messages */}
              {isMine && (
                <button
                  onClick={() => handleSetReply(msg)}
                  className={`self-end mb-1 ml-1.5 p-1 rounded-full text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-all flex-shrink-0 ${
                    hoveredMsgId === msg.id ? "opacity-100" : "opacity-0"
                  }`}
                  title="Reply"
                >
                  <LuReply className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex justify-start mb-1">
            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1 items-center h-4">
                <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Reply banner */}
      {replyTo && token && (
        <ReplyBanner
          replyTo={replyTo}
          onCancel={() => setReplyTo(null)}
          token={token}
          BACKEND={BACKEND}
        />
      )}

      {/* File preview bar */}
      {pendingFile && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border-t border-blue-200 flex-shrink-0">
          {pendingFile.previewUrl ? (
            <img
              src={pendingFile.previewUrl}
              alt="preview"
              className="h-12 w-12 rounded-lg object-cover border border-blue-200"
            />
          ) : (
            <div className="h-12 w-12 rounded-lg bg-blue-100 border border-blue-200 flex items-center justify-center">
              <LuFile className="h-6 w-6 text-blue-600" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">
              {pendingFile.file.name}
            </p>
            <p className="text-xs text-gray-500">
              {Math.round(pendingFile.file.size / 1024)} KB
            </p>
            {replyTo && (
              <p className="text-xs text-blue-600 truncate mt-0.5">
                ↩ Replying to: {replyPreviewText(replyTo)}
              </p>
            )}
            {uploadError && (
              <p className="text-xs text-red-500 mt-0.5">{uploadError}</p>
            )}
          </div>
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors"
          >
            {uploading ? "Sending…" : "Send"}
          </button>
          <button
            onClick={cancelPendingFile}
            className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <LuX className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-end gap-2 px-4 py-3 bg-white border-t border-gray-200 flex-shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
          className="hidden"
          onChange={handleFileSelect}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex-shrink-0 mb-0.5"
          title="Attach image or PDF"
        >
          <LuPaperclip className="h-5 w-5" />
        </button>

        <textarea
          ref={textareaRef}
          className="flex-1 border border-gray-300 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed max-h-32 overflow-y-auto"
          placeholder={replyTo ? "Type a reply…" : "Type a message…"}
          value={body}
          rows={1}
          onChange={(e) => {
            handleBodyChange(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
            if (e.key === "Escape" && replyTo) {
              setReplyTo(null);
            }
          }}
          disabled={!!pendingFile}
        />

        <button
          className="p-2.5 bg-blue-600 text-white rounded-full disabled:opacity-40 hover:bg-blue-700 transition-colors flex-shrink-0 mb-0.5"
          onClick={pendingFile ? handleUpload : handleSend}
          disabled={pendingFile ? uploading : !body.trim()}
          title="Send"
        >
          <LuSend className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
