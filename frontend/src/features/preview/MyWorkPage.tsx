import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BellPlus,
  CheckCheck,
  ImagePlus,
  MessageSquare,
  Search,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, Empty } from "../operations/components";
import {
  formatTimestamp,
  jakartaDate,
  statuses,
} from "../operations/demo-data";
import { usePreview } from "./context";
import { conversation, latestActivity, unreadCount } from "./chat-model";
import type { WorkOrder } from "./model";
import { field } from "./PreviewAuth";
const categoryOptions = [
  "B2C/TIAL",
  "B2C/LOGIC",
  "ASSUREN",
  "B2B",
  "REPLACEMENT",
];
const closed = (order: WorkOrder) =>
  order.status === "DONE" || order.status === "GAGAL";
const categoryLabel = (order: WorkOrder) =>
  order.module ? `${order.category}/${order.module}` : order.category;
export default function MyWorkPage() {
  const { state, dispatch } = usePreview();
  const navigate = useNavigate();
  const { monitoringId } = useParams();
  const userId = state.sessionId!;
  useEffect(() => {
    const media=window.matchMedia("(max-width: 767px)");
    const previous=document.body.style.overflow;
    const apply=()=>{document.body.style.overflow=media.matches && monitoringId ? "hidden" : previous;};
    apply();
    media.addEventListener("change",apply);
    return ()=>{media.removeEventListener("change",apply);document.body.style.overflow=previous;};
  },[monitoringId]);
  const [tab, setTab] = useState<"active" | "history">("active");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [date, setDate] = useState("");
  const [target, setTarget] = useState("");
  const [source, setSource] = useState<"bot" | "telegram">("telegram");
  const mine = state.orders.filter((o) => o.handlerAlias === userId);
  const available = state.orders.filter(
    (o) => o.handlerAlias === userId || o.participants.includes(userId),
  );
  const selected = available.find((o) => o.monitoringId === monitoringId);
  const effectiveTab = selected
    ? closed(selected) || selected.handlerAlias !== userId
      ? "history"
      : "active"
    : tab;
  const filtered = available
    .filter(
      (o) =>
        (effectiveTab === "active"
          ? o.handlerAlias === userId && !closed(o)
          : closed(o) || o.handlerAlias !== userId) &&
        (!search ||
          `${o.monitoringId} ${o.sto} ${categoryLabel(o)}`
            .toLowerCase()
            .includes(search.toLowerCase())) &&
        (!category || categoryLabel(o) === category) &&
        (!status || o.status === status) &&
        (!date || jakartaDate(new Date(o.receivedAt)) === date),
    )
    .sort(
      (a, b) =>
        latestActivity(b) - latestActivity(a) ||
        b.monitoringId.localeCompare(a.monitoringId),
    );
  const totalUnread = mine.reduce((n, o) => n + unreadCount(o, userId), 0);
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[.18em] text-primary">
            PERSONAL OPERATIONS / DEMO
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Pekerjaan Saya
          </h1>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            Semua kategori, satu inbox. Percakapan terpisah per order ·{" "}
            {totalUnread} pesan belum dibaca.
          </p>
        </div>
        <Link className="text-sm text-primary" to="/preview/jobs">
          Ambil pekerjaan baru →
        </Link>
      </header>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Aktif", mine.filter((o) => !closed(o)).length],
          ["DONE", mine.filter((o) => o.status === "DONE").length],
          ["GAGAL", mine.filter((o) => o.status === "GAGAL").length],
          ["Total", mine.length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Statistik mengikuti kepemilikan saat ini. Tab Riwayat juga menyimpan
        order yang pernah Anda tangani sebelum dipindahkan.
      </p>
      <section
        aria-label="Simulasi Telegram"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4"
      >
        <label className="min-w-44 flex-1 text-xs">
          Order penerima pesan
          <select
            aria-label="Order simulasi pesan"
            className={field}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">Pilih order milik Anda</option>
            {mine.map((o) => (
              <option key={o.monitoringId} value={o.monitoringId}>
                {o.monitoringId} · {categoryLabel(o)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Pengirim
          <select
            aria-label="Pengirim simulasi"
            className={field}
            value={source}
            onChange={(e) => setSource(e.target.value as typeof source)}
          >
            <option value="telegram">Petugas Telegram</option>
            <option value="bot">Bot</option>
          </select>
        </label>
        <Button
          disabled={!mine.some((o) => o.monitoringId === target)}
          onClick={() =>
            dispatch({ type: "telegram-incoming", id: target, source })
          }
        >
          <BellPlus />
          Pesan Telegram Masuk
        </Button>
        <p className="w-full text-[11px] text-muted-foreground">
          Simulasi lokal saja. Pilih order yang tidak sedang dibuka untuk
          menguji badge dan urutan inbox.
        </p>
      </section>
      <div className="grid min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm md:h-[760px] md:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]">
        <aside
          aria-label="Daftar Pekerjaan Saya"
          className={`${monitoringId ? "hidden md:flex" : "flex"} min-h-0 flex-col border-r`}
        >
          <div className="space-y-3 border-b p-4">
            <div className="grid grid-cols-2 gap-2">
              {[
                ["active", "Pekerjaan Aktif"],
                ["history", "Riwayat"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => {
                    setTab(value as typeof tab);
                    navigate("/preview/my-work");
                  }}
                  aria-pressed={effectiveTab === value}
                  className={`rounded-lg px-2 py-2.5 text-xs font-medium ${effectiveTab === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="relative block">
              <Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
              <input
                aria-label="Cari pekerjaan saya"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari kode order / STO"
                className="h-10 w-full rounded-lg border bg-background pr-3 pl-9 text-sm"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label="Kategori pekerjaan saya"
                className="min-w-0 rounded-lg border bg-background p-2 text-xs"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Semua kategori</option>
                {categoryOptions.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select
                aria-label="Status pekerjaan saya"
                className="min-w-0 rounded-lg border bg-background p-2 text-xs"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Semua status</option>
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <label className="block text-[11px] text-muted-foreground">
              Tanggal order · WIB
              <input
                aria-label="Tanggal pekerjaan saya"
                type="date"
                className={`${field} text-xs`}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            {(search || category || status || date) && (
              <button
                className="text-xs text-primary"
                onClick={() => {
                  setSearch("");
                  setCategory("");
                  setStatus("");
                  setDate("");
                }}
              >
                Reset filter
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.map((o) => {
              const messages = conversation(o);
              const latest = messages.at(-1);
              const unread = unreadCount(o, userId);
              return (
                <Link
                  key={o.monitoringId}
                  data-order-id={o.monitoringId}
                  to={`/preview/my-work/${o.monitoringId}`}
                  className={`block border-b p-4 transition hover:bg-muted/60 ${selected?.monitoringId === o.monitoringId ? "bg-primary/5" : ""}`}
                  aria-current={
                    selected?.monitoringId === o.monitoringId
                      ? "page"
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-xs">{o.monitoringId}</strong>
                    {unread > 0 && (
                      <span
                        aria-label={`${unread} pesan belum dibaca`}
                        className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground"
                      >
                        {unread}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {categoryLabel(o)}
                    </span>
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="mt-2 truncate text-xs text-muted-foreground">
                    {latest?.text || "Lampiran gambar"}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {latest && formatTimestamp(latest.at)}
                    {o.handlerAlias !== userId ? " · Sudah dipindahkan" : ""}
                  </p>
                </Link>
              );
            })}
            {!filtered.length && (
              <Empty text="Tidak ada pekerjaan sesuai filter pada tab ini." />
            )}
          </div>
        </aside>
        <div
          className={`${monitoringId ? "fixed inset-0 z-40 flex bg-card md:static md:z-auto" : "hidden md:flex"} min-h-0 min-w-0 flex-col`}
        >
          {selected ? (
            <ChatPane
              key={`${userId}:${selected.monitoringId}`}
              order={selected}
              userId={userId}
            />
          ) : monitoringId ? (
            <div className="p-6">
              <Button
                variant="outline"
                onClick={() => navigate("/preview/my-work")}
              >
                <ArrowLeft />
                Kembali
              </Button>
              <Empty text="Order tidak tersedia dalam pekerjaan atau riwayat keterlibatan Anda." />
            </div>
          ) : (
            <div className="grid h-full min-h-96 place-content-center justify-items-center gap-4 p-8 text-center">
              <span className="grid size-20 place-items-center rounded-full bg-primary/5 text-primary">
                <MessageSquare className="size-9" />
              </span>
              <h2 className="text-xl font-semibold">
                Percakapan pekerjaan Anda
              </h2>
              <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                Pilih order di sebelah kiri untuk membuka percakapan. Setiap
                pesan hanya terhubung ke order yang dipilih.
              </p>
              <span className="text-xs text-muted-foreground">
                DEMO · tidak mengirim pesan Telegram
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function ChatPane({ order, userId }: { order: WorkOrder; userId: string }) {
  const { state, dispatch } = usePreview();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const messages = conversation(order);
  const ids = messages.map((m) => m.id).join("|");
  const owner = order.handlerAlias === userId;
  const canSend = owner && order.status === "PROSES CEK";
  const unread = unreadCount(order, userId);
  useEffect(() => {
    if (owner && unread)
      dispatch({ type: "chat-read", id: order.monitoringId });
  }, [dispatch, owner, unread, ids, order.monitoringId]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [ids]);
  async function addImages(files: File[]) {
    setError("");
    if (images.length + files.length > 10) {
      setError("Maksimal 10 gambar per pesan.");
      return;
    }
    if (
      files.some(
        (f) => !f.type.startsWith("image/") || f.size > 5 * 1024 * 1024,
      )
    ) {
      setError("Hanya gambar, maksimal 5 MB per gambar.");
      return;
    }
    setReading(true);
    try {
      const added = await Promise.all(
        files.map(
          (f) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = reject;
              reader.readAsDataURL(f);
            }),
        ),
      );
      setImages((prev) => {
        if (prev.length + added.length > 10) {
          setError("Maksimal 10 gambar per pesan.");
          return prev;
        }
        return [...prev, ...added];
      });
    } catch {
      setError("Gagal membaca gambar.");
    } finally {
      setReading(false);
    }
  }
  function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length) {
      event.preventDefault();
      void addImages(files);
    }
  }
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-background p-4">
        <div className="flex items-center gap-3">
          <button
            aria-label="Kembali ke daftar pekerjaan"
            onClick={() => navigate("/preview/my-work")}
            className="rounded-lg p-2 hover:bg-muted md:hidden"
          >
            <ArrowLeft className="size-5" />
          </button>
          <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
            <MessageSquare className="size-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">{order.monitoringId}</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {categoryLabel(order)} ·{" "}
              {order.handlerAlias ?? "Belum ditugaskan"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={order.status} />
          <Link
            className="text-xs text-primary"
            to={`/preview/orders/${order.monitoringId}`}
          >
            Detail & tindakan →
          </Link>
        </div>
      </header>
      <div className="border-b bg-muted/40 px-4 py-2 text-[10px] text-muted-foreground">
        DEMO · setiap pesan web adalah reply ke {order.originalMessageId} · sesi{" "}
        {order.session}
      </div>
      <div
        aria-label={`Percakapan ${order.monitoringId}`}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-muted/30 p-4 sm:p-6"
      >
        {messages.map((m) => {
          const own = m.source === "web" && m.sender === userId;
          const sender =
            state.users.find((u) => u.id === m.sender)?.name ?? m.sender;
          return (
            <article
              key={m.id}
              data-message-order={m.orderId}
              className={`max-w-[92%] rounded-2xl border p-3 shadow-sm sm:max-w-[80%] ${own ? "ml-auto rounded-tr-sm border-primary/15 bg-primary/10" : "mr-auto rounded-tl-sm bg-card"}`}
            >
              <div className="mb-2 flex flex-wrap justify-between gap-3 text-[10px]">
                <strong className="text-primary">{sender}</strong>
                <span className="text-muted-foreground">
                  {m.source === "web"
                    ? "Web HD"
                    : m.source === "bot"
                      ? "Bot DEMO"
                      : "Telegram DEMO"}
                </span>
              </div>
              <p className="mb-2 truncate border-l-2 border-primary/20 pl-2 text-[10px] text-muted-foreground">
                ↩ Order asli · {m.replyToMessageId}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm leading-6">
                {m.text}
              </p>
              {m.images.length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {m.images.map((src, i) => (
                    <a href={src} target="_blank" rel="noreferrer" key={i}>
                      <img
                        src={src}
                        alt={`Gambar pesan ${i + 1}`}
                        className="max-h-48 w-full rounded-lg object-contain"
                      />
                    </a>
                  ))}
                </div>
              )}
              <p className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                {formatTimestamp(m.at)}
                {own && <CheckCheck className="size-3" />}
              </p>
            </article>
          );
        })}
        <div ref={end} />
      </div>
      <form
        className="border-t bg-background p-3 sm:p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSend) return;
          dispatch({ type: "message", id: order.monitoringId, text, images });
          setText("");
          setImages([]);
          setError("");
        }}
      >
        {images.length > 0 && (
          <div className="mb-3 flex max-h-32 gap-2 overflow-auto">
            {images.map((src, i) => (
              <div key={i} className="relative shrink-0 rounded-lg border p-1">
                <img
                  alt={`Draft gambar ${i + 1}`}
                  src={src}
                  className="h-20 w-20 object-contain"
                />
                <button
                  aria-label={`Hapus draft gambar ${i + 1}`}
                  type="button"
                  className="absolute top-0 right-0 rounded bg-background p-1"
                  onClick={() =>
                    setImages(images.filter((_, index) => index !== i))
                  }
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <label
            className="shrink-0 cursor-pointer rounded-lg border p-3"
            title="Tambahkan gambar"
          >
            <ImagePlus className="size-5 text-muted-foreground" />
            <input
              aria-label="Gambar percakapan"
              className="sr-only"
              type="file"
              accept="image/*"
              multiple
              disabled={!canSend || reading}
              onChange={(e) => {
                void addImages(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>
          <textarea
            aria-label="Pesan percakapan"
            className="min-h-12 min-w-0 flex-1 resize-none rounded-xl border bg-muted/30 p-3 text-sm disabled:opacity-60"
            rows={2}
            placeholder={
              canSend
                ? "Tulis pesan atau paste gambar…"
                : "Percakapan read-only. Gunakan detail untuk reopen."
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={paste}
            disabled={!canSend}
          />
          <Button
            aria-label="Kirim pesan percakapan"
            type="submit"
            disabled={!canSend || reading || (!text.trim() && !images.length)}
          >
            <Send className="size-4" />
            <span className="hidden sm:inline">Kirim</span>
          </Button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <p className="mt-2 text-[10px] text-muted-foreground">
          Maks. 10 gambar · 5 MB/gambar · teks tanpa awalan nama HD · tidak
          dikirim Telegram
        </p>
      </form>
    </>
  );
}
