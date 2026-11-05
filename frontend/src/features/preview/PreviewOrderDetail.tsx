import { useState, type ClipboardEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ImagePlus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Empty, OrderOverview, Section } from "../operations/components";
import { formatTimestamp } from "../operations/demo-data";
import { usePreview } from "./context";
import OrderOutcomeActions from "./OrderOutcomeActions";
import { field } from "./PreviewAuth";
import { publicProjection, type Action } from "./model";
export default function PreviewOrderDetail() {
  const { state, dispatch } = usePreview();
  const { monitoringId } = useParams();
  const order = state.orders.find((o) => o.monitoringId === monitoringId);
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState<{
    text: string;
    action: Action;
  } | null>(null);
  const [edit, setEdit] = useState("");
  const [editText, setEditText] = useState("");
  const [reading, setReading] = useState(false);
  if (!order) return <Empty text="Order DEMO tidak ditemukan." />;
  const mine = order.handlerAlias === state.sessionId;
  const active = order.status === "PROSES CEK";
  const finished = ["DONE", "GAGAL"].includes(order.status);
  async function addImages(files: File[]) {
    setError("");
    if (images.length + files.length > 10) {
      setError("Maksimal 10 gambar per pengiriman.");
      return;
    }
    if (
      files.some(
        (file) =>
          !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024,
      )
    ) {
      setError("Hanya gambar, maksimal 5 MB per gambar untuk preview.");
      return;
    }
    setReading(true);
    try {
      const added = await Promise.all(
        files.map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = reject;
              reader.readAsDataURL(file);
            }),
        ),
      );
      setImages((previous) => {
        if (previous.length + added.length > 10) {
          setError("Maksimal 10 gambar per pengiriman.");
          return previous;
        }
        return [...previous, ...added];
      });
    } catch {
      setError("Gambar tidak dapat dibaca.");
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
      <Link
        className="inline-flex items-center gap-2 text-sm text-primary"
        to={`/preview/work/${order.category}${order.module ? `/${order.module}` : ""}`}
      >
        <ArrowLeft className="size-4" />
        Kembali ke daftar order
      </Link>
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="text-xs text-primary">
            {order.category} / {order.module ?? "WORKSPACE"} · {order.sto}
          </p>
          <h1 className="mt-2 text-2xl font-semibold">{order.monitoringId}</h1>
          <p className="mt-2 text-xs text-muted-foreground">
            Sesi pengecekan {order.session} · Pemilik:{" "}
            {order.handlerAlias ?? "belum ditugaskan"}
          </p>
        </div>
        <Badge variant="outline" className="self-start">
          DEMO · tidak ada data pelanggan
        </Badge>
      </header>
      <div className="flex flex-wrap gap-2">
        {order.status === "MENUNGGU" && (
          <Button
            onClick={() => dispatch({ type: "claim", id: order.monitoringId })}
          >
            Ambil Order
          </Button>
        )}
        {active && !mine && (
          <Button
            onClick={() =>
              setConfirm({
                text: `Ambil alih dari ${order.handlerAlias}? Kepemilikan langsung berpindah dan dicatat.`,
                action: { type: "claim", id: order.monitoringId },
              })
            }
          >
            Ambil dari Teman
          </Button>
        )}
        {finished && (
          <div className="flex w-full flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
            <label className="min-w-48 flex-1 text-xs">
              Alasan Reopen (wajib)
              <input
                aria-label="Alasan Reopen"
                className={field}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Alasan pengecekan ulang"
              />
            </label>
            <Button
              disabled={!reason.trim()}
              onClick={() => {
                dispatch({ type: "reopen", id: order.monitoringId, reason });
                setReason("");
              }}
            >
              Reopen order
            </Button>
          </div>
        )}
      </div>
      <Link
        className="inline-flex items-center gap-2 text-sm text-primary"
        to={`/preview/my-work/${order.monitoringId}`}
      >
        Buka percakapan di Pekerjaan Saya →
      </Link>
      <OrderOverview order={publicProjection([order])[0]} />
      <div className="grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Section
            title={`Tahapan pengecekan ${order.module ?? order.category}`}
            description="Placeholder alur khusus"
          >
            <div className="rounded-lg border border-dashed p-5 text-sm leading-6 text-muted-foreground">
              Tahapan teknis {order.module ?? order.category} belum ditentukan.
              Tidak ada langkah pemeriksaan teknis yang diasumsikan pada preview
              ini.
            </div>
          </Section>
          <Section
            title="Pesan hasil pengecekan"
            description="Boleh mengirim beberapa pesan sebelum DONE/GAGAL. Pesan dan gambar hanya disimpan di memori."
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                dispatch({
                  type: "message",
                  id: order.monitoringId,
                  text,
                  images,
                });
                setText("");
                setImages([]);
              }}
            >
              <label className="text-xs font-medium">
                Teks pengecekan
                <textarea
                  aria-label="Teks pengecekan"
                  className={`${field} min-h-28`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onPaste={paste}
                  disabled={!mine || !active}
                  placeholder="Tulis pesan demo atau paste screenshot…"
                />
              </label>
              <label className="mt-3 block text-xs">
                Gunakan template
                <select
                  aria-label="Template pesan"
                  className={field}
                  defaultValue=""
                  disabled={!mine || !active}
                  onChange={(e) => setText(e.target.value)}
                >
                  <option value="">Pilih template</option>
                  {state.templates.map((t) => (
                    <option key={t.id} value={t.text}>
                      {t.text}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-xs">
                <ImagePlus className="size-4" />
                Upload gambar ({images.length}/10)
                <input
                  aria-label="Upload gambar"
                  className="max-w-48"
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={!mine || !active || reading}
                  onChange={(e) => {
                    void addImages(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                />
              </label>
              <p className="mt-2 text-xs text-muted-foreground">
                Maksimal 10 gambar dalam satu pesan · 5 MB/gambar · lampiran
                tidak ditampilkan publik.
              </p>
              {images.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {images.map((src, index) => (
                    <div key={index} className="relative rounded-lg border p-2">
                      <img
                        className="h-24 w-full object-contain"
                        src={src}
                        alt={`Lampiran demo ${index + 1}`}
                      />
                      <button
                        type="button"
                        aria-label={`Hapus gambar ${index + 1}`}
                        className="absolute top-1 right-1 rounded bg-background p-1"
                        onClick={() =>
                          setImages(images.filter((_, i) => i !== index))
                        }
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {error && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                className="mt-4"
                disabled={
                  !mine ||
                  !active ||
                  reading ||
                  (!text.trim() && !images.length)
                }
              >
                <Send />
                Kirim pesan DEMO
              </Button>
            </form>
            <div className="mt-6 space-y-4">
              {order.messages.map((message) => (
                <article key={message.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap justify-between gap-2 text-xs">
                    <strong>
                      {message.by} · sesi {message.session}
                    </strong>
                    <span className="text-muted-foreground">
                      {formatTimestamp(message.at)}
                    </span>
                  </div>
                  {edit === message.id ? (
                    <div>
                      <textarea
                        aria-label="Koreksi pesan"
                        className={field}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                      />
                      <Button
                        className="mt-3"
                        disabled={!editText.trim()}
                        onClick={() => {
                          dispatch({
                            type: "edit",
                            id: order.monitoringId,
                            messageId: message.id,
                            text: editText,
                          });
                          setEdit("");
                        }}
                      >
                        Simpan koreksi
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
                      {message.text || "Lampiran pengecekan"}
                    </p>
                  )}
                  {message.images.length > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {message.images.map((src, i) => (
                        <img
                          key={i}
                          src={src}
                          alt={`Lampiran privat ${i + 1}`}
                          className="h-24 w-full rounded border object-contain"
                        />
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {message.by === state.sessionId && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEdit(message.id);
                          setEditText(message.text);
                        }}
                      >
                        Koreksi pesan
                      </Button>
                    )}
                    {(mine ||
                      state.users.find((u) => u.id === state.sessionId)
                        ?.role !== "HD") && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          setConfirm({
                            text: message.publicApproved
                              ? "Tarik teks ini dari monitoring publik?"
                              : "Nyatakan teks ini aman untuk publik? Pastikan tidak mengandung informasi pelanggan, NIK, INET lengkap, atau kredensial. Gambar tetap privat.",
                            action: {
                              type: "publish",
                              id: order.monitoringId,
                              messageId: message.id,
                            },
                          })
                        }
                      >
                        {message.publicApproved
                          ? "Tarik dari publik"
                          : "Nyatakan aman publik"}
                      </Button>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {message.publicApproved
                      ? "Teks disetujui untuk publik · gambar privat"
                      : "Privat · belum dinyatakan aman untuk publik"}
                  </p>
                  {message.revisions.length > 0 && (
                    <details className="mt-3 text-xs">
                      <summary>
                        Riwayat koreksi ({message.revisions.length})
                      </summary>
                      {message.revisions.map((revision, i) => (
                        <p className="mt-2 whitespace-pre-wrap" key={i}>
                          {formatTimestamp(revision.at)} · {revision.text}
                        </p>
                      ))}
                    </details>
                  )}
                </article>
              ))}
              {!order.messages.length && (
                <Empty text="Belum ada pesan pengecekan pada simulasi ini." />
              )}
            </div>
          </Section>
        </div>
        <div className="space-y-6">
          <Section
            title="Penyelesaian order"
            description="Tindakan terpisah dari pengiriman pesan."
          >
            <OrderOutcomeActions orderId={order.monitoringId} />
            {order.outcomes.map((outcome, index) => (
              <p
                key={index}
                className="mt-3 text-xs leading-5 text-muted-foreground"
              >
                {formatTimestamp(outcome.at)} · {outcome.name} ·{" "}
                {outcome.status} · sesi {outcome.session}
                {outcome.reason && ` · Alasan: ${outcome.reason}`}
              </p>
            ))}
            {order.escalations.map((e) => (
              <p key={e.id} className="mt-3 text-xs leading-5 text-primary">
                ESKALASI · {formatTimestamp(e.at)} · {e.name} → {e.target}:{" "}
                {e.description}
              </p>
            ))}
          </Section>
          <Section
            title="Kirim ke Teman"
            description="Penerima wajib menyetujui; kepemilikan belum berubah saat dikirim."
          >
            <select
              aria-label="Penerima order"
              className={field}
              value={to}
              disabled={!mine || !active}
              onChange={(e) => setTo(e.target.value)}
            >
              <option value="">Pilih penerima</option>
              {state.users
                .filter(
                  (u) =>
                    u.role === "HD" &&
                    u.id !== state.sessionId &&
                    u.active &&
                    u.approval === "APPROVED",
                )
                .map((u) => (
                  <option value={u.id} key={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
            <Button
              className="mt-4"
              disabled={!mine || !active || !to}
              onClick={() =>
                dispatch({ type: "transfer", ids: [order.monitoringId], to })
              }
            >
              Kirim permintaan
            </Button>
            <Link
              className="mt-4 block text-xs text-primary"
              to="/preview/transfers"
            >
              Bulk transfer & persetujuan →
            </Link>
          </Section>
          <Section
            title="Riwayat pengerjaan"
            description="Pesan, sesi, dan perpindahan kepemilikan tidak dihapus."
          >
            <ol className="max-h-[32rem] space-y-4 overflow-y-auto">
              {[...order.events].reverse().map((event, index) => (
                <li key={index} className="border-l-2 border-primary/20 pl-3">
                  <p className="text-sm leading-6">{event.text}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatTimestamp(event.at)}
                  </p>
                </li>
              ))}
            </ol>
          </Section>
        </div>
      </div>
      <Dialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Konfirmasi simulasi</DialogTitle>
          <DialogDescription className="mt-3 leading-6">
            {confirm?.text}
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Batal
            </Button>
            <Button
              onClick={() => {
                if (confirm) dispatch(confirm.action);
                setConfirm(null);
              }}
            >
              Konfirmasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
