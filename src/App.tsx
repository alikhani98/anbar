import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { db, type Batch, type Photo } from "./db";

type Route = "/" | "/search" | "/new-batch" | "/settings";

type FormErrors = Partial<
  Record<
    | "pistachioType"
    | "grade"
    | "totalWeightKg"
    | "sackCount"
    | "owner"
    | "entryDateJalali",
    string
  >
>;

type PhotoDraft = {
  id: string;
  file: File;
  url: string;
};

type BatchWithPhotos = Batch & {
  id: number;
  photoUrls: string[];
};

type BackupBatch = Batch & {
  id?: number;
};

type BackupPhoto = {
  id?: number;
  batchId: number;
  imageDataUrl: string;
};

type BackupFile = {
  app: "pistachio-warehouse-tracker";
  version: 1;
  exportedAtJalali: string;
  batches: BackupBatch[];
  photos: BackupPhoto[];
};

type FormState = {
  pistachioType: string;
  customPistachioType: string;
  grade: string;
  ounceGrade: string;
  kernelPercent: string;
  totalWeightKg: string;
  sackCount: string;
  owner: string;
  entryDateJalali: string;
  location: string;
  notes: string;
};

const pistachioTypes = ["احمدآقایی", "اکبری", "آجیلی", "کله‌قوچی", "فندقی", "سایر"];
const listedPistachioTypes = pistachioTypes.filter((type) => type !== "سایر");
const grades = ["اعلا", "معمولی"];
const gradeFilters = ["فرقی ندارد", ...grades];

const initialFormState: FormState = {
  pistachioType: "",
  customPistachioType: "",
  grade: "",
  ounceGrade: "",
  kernelPercent: "",
  totalWeightKg: "",
  sackCount: "",
  owner: "",
  entryDateJalali: getTodayJalali(),
  location: "",
  notes: "",
};

function getRoute(): Route {
  const path = window.location.pathname;

  if (path === "/search" || path === "/new-batch" || path === "/settings") {
    return path;
  }

  return "/";
}

function navigateTo(route: Route) {
  window.history.pushState({}, "", route);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function getTodayJalali() {
  const parts = new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";

  return `${year}/${month}/${day}`;
}

function normalizeNumber(value: string) {
  return Number(value.trim());
}

function clamp(value: number, min: number, max?: number) {
  if (Number.isNaN(value)) {
    return min;
  }

  if (max !== undefined) {
    return Math.min(max, Math.max(min, value));
  }

  return Math.max(min, value);
}

function formatKg(value: number) {
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(value);
}

function sortByOldestEntry(a: Batch, b: Batch) {
  return a.entryDateJalali.localeCompare(b.entryDateJalali);
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string) {
  const [metadata, base64Data] = dataUrl.split(",");

  if (!metadata?.startsWith("data:") || !base64Data) {
    throw new Error("Invalid image data.");
  }

  const mimeType = metadata.slice(5, metadata.indexOf(";")) || "application/octet-stream";
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

function normalizeBackupBatch(record: unknown): BackupBatch {
  if (!record || typeof record !== "object") {
    throw new Error("Invalid batch.");
  }

  const batch = record as Partial<BackupBatch>;
  const normalized: BackupBatch = {
    pistachioType: String(batch.pistachioType ?? ""),
    grade: String(batch.grade ?? ""),
    ounceGrade: Number(batch.ounceGrade ?? 0),
    kernelPercent: Number(batch.kernelPercent ?? 0),
    totalWeightKg: Number(batch.totalWeightKg ?? 0),
    sackCount: Number(batch.sackCount ?? 0),
    remainingWeightKg: Number(batch.remainingWeightKg ?? 0),
    owner: String(batch.owner ?? ""),
    entryDateJalali: String(batch.entryDateJalali ?? ""),
    location: String(batch.location ?? ""),
    notes: String(batch.notes ?? ""),
    status:
      batch.status === "رزرو شده" || batch.status === "تمام شده" ? batch.status : "موجود",
  };

  if (typeof batch.id === "number") {
    normalized.id = batch.id;
  }

  return normalized;
}

export function App() {
  const [route, setRoute] = useState<Route>(getRoute);

  useEffect(() => {
    const handleRouteChange = () => setRoute(getRoute());

    window.addEventListener("popstate", handleRouteChange);
    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);

  if (route === "/search") {
    return <SearchInventory />;
  }

  if (route === "/new-batch") {
    return <NewBatchForm />;
  }

  if (route === "/settings") {
    return <SettingsScreen />;
  }

  return <Home />;
}

function Home() {
  return (
    <main className="min-h-screen bg-lime-50 px-5 py-8 text-zinc-950 sm:px-8">
      <button
        className="absolute left-5 top-5 rounded-lg px-3 py-2 text-lg font-bold text-zinc-600 underline decoration-2 underline-offset-4"
        type="button"
        onClick={() => navigateTo("/settings")}
      >
        تنظیمات
      </button>
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl flex-col items-stretch justify-center gap-8">
        <div className="text-center">
          <h1 className="text-4xl font-black leading-tight sm:text-5xl">
            انبار پسته
          </h1>
          <p className="mt-4 text-xl font-semibold text-zinc-700">
            مدیریت موجودی فیزیکی انبار
          </p>
        </div>

        <div className="grid gap-5">
          <button
            className="min-h-16 rounded-lg bg-emerald-800 px-6 py-5 text-2xl font-bold text-white shadow-sm transition active:scale-[0.99] sm:text-3xl"
            type="button"
            onClick={() => navigateTo("/search")}
          >
            جستجوی موجودی
          </button>
          <button
            className="min-h-16 rounded-lg bg-zinc-950 px-6 py-5 text-2xl font-bold text-white shadow-sm transition active:scale-[0.99] sm:text-3xl"
            type="button"
            onClick={() => navigateTo("/new-batch")}
          >
            ثبت بار جدید
          </button>
        </div>
      </section>
    </main>
  );
}

function SettingsScreen() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  async function exportBackup() {
    setMessage("");
    setError("");

    try {
      const batches = await db.batches.toArray();
      const photos = await db.photos.toArray();
      const backup: BackupFile = {
        app: "pistachio-warehouse-tracker",
        version: 1,
        exportedAtJalali: getTodayJalali(),
        batches: batches.map(normalizeBackupBatch),
        photos: await Promise.all(
          photos.map(async (photo) => ({
            id: photo.id,
            batchId: photo.batchId,
            imageDataUrl: await blobToDataUrl(photo.imageBlob),
          })),
        ),
      };
      const json = JSON.stringify(backup, null, 2);
      const url = URL.createObjectURL(
        new Blob([json], { type: "application/json;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `anbar-backup-${getTodayJalali().replace(/\//g, "-")}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage(`نسخه پشتیبان آماده شد. تعداد بارها: ${formatKg(batches.length)}`);
    } catch (backupError) {
      console.error("Failed to export backup", backupError);
      setError("دریافت نسخه پشتیبان انجام نشد. لطفا دوباره تلاش کنید.");
    }
  }

  function requestRestoreFile() {
    setMessage("");
    setError("");
    restoreInputRef.current?.click();
  }

  async function restoreBackup(file: File | undefined) {
    if (!file) {
      return;
    }

    const confirmed = window.confirm(
      "این کار اطلاعات فعلی را جایگزین می‌کند - ادامه می‌دهید؟",
    );

    if (!confirmed) {
      return;
    }

    setRestoring(true);
    setMessage("");
    setError("");

    try {
      const parsed = JSON.parse(await file.text()) as Partial<BackupFile>;

      if (
        parsed.app !== "pistachio-warehouse-tracker" ||
        !Array.isArray(parsed.batches) ||
        !Array.isArray(parsed.photos)
      ) {
        throw new Error("Invalid backup file.");
      }

      const batches = parsed.batches.map(normalizeBackupBatch);
      const photos = parsed.photos.map((photo) => {
        if (
          !photo ||
          typeof photo !== "object" ||
          typeof photo.batchId !== "number" ||
          typeof photo.imageDataUrl !== "string"
        ) {
          throw new Error("Invalid photo record.");
        }

        const restoredPhoto = {
          batchId: photo.batchId,
          imageBlob: dataUrlToBlob(photo.imageDataUrl),
        };

        if (typeof photo.id === "number") {
          return {
            id: photo.id,
            ...restoredPhoto,
          };
        }

        return restoredPhoto;
      });

      await db.transaction("rw", db.batches, db.photos, async () => {
        await db.photos.clear();
        await db.batches.clear();

        if (batches.length > 0) {
          await db.batches.bulkPut(batches);
        }

        if (photos.length > 0) {
          await db.photos.bulkPut(photos);
        }
      });

      setMessage(`بازیابی انجام شد. تعداد بارهای بازیابی‌شده: ${formatKg(batches.length)}`);
    } catch (restoreError) {
      console.error("Failed to restore backup", restoreError);
      setError("فایل نسخه پشتیبان معتبر نیست یا خراب شده است.");
    } finally {
      setRestoring(false);

      if (restoreInputRef.current) {
        restoreInputRef.current.value = "";
      }
    }
  }

  return (
    <main className="min-h-screen bg-lime-50 px-5 py-8 text-zinc-950 sm:px-8">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-3xl content-center gap-6">
        <header className="grid gap-4 text-center">
          <h1 className="text-4xl font-black">تنظیمات</h1>
          <p className="text-xl font-semibold text-zinc-700">
            نسخه پشتیبان اطلاعات همین دستگاه
          </p>
        </header>

        {message ? (
          <div className="rounded-lg bg-emerald-800 px-5 py-4 text-2xl font-black text-white">
            {message}
          </div>
        ) : null}

        {error ? (
          <div
            className="rounded-lg border-2 border-red-700 bg-red-50 px-5 py-4 text-2xl font-black text-red-800"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <button
          className="min-h-16 rounded-lg bg-emerald-800 px-6 text-2xl font-black text-white"
          type="button"
          onClick={exportBackup}
        >
          دریافت نسخه پشتیبان
        </button>

        <input
          ref={restoreInputRef}
          className="hidden"
          type="file"
          accept="application/json,.json"
          onChange={(event) => restoreBackup(event.target.files?.[0])}
        />
        <button
          className="min-h-16 rounded-lg bg-zinc-950 px-6 text-2xl font-black text-white disabled:bg-zinc-500"
          type="button"
          disabled={restoring}
          onClick={requestRestoreFile}
        >
          {restoring ? "در حال بازیابی..." : "بازیابی از نسخه پشتیبان"}
        </button>

        <button
          className="min-h-16 rounded-lg border-2 border-zinc-900 bg-white px-6 text-2xl font-black text-zinc-950"
          type="button"
          onClick={() => navigateTo("/")}
        >
          بازگشت
        </button>
      </section>
    </main>
  );
}

function SearchInventory() {
  const [pistachioType, setPistachioType] = useState("");
  const [grade, setGrade] = useState("فرقی ندارد");
  const [showReserved, setShowReserved] = useState(false);
  const [batches, setBatches] = useState<BatchWithPhotos[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<BatchWithPhotos | null>(null);
  const [deductAmount, setDeductAmount] = useState("");
  const [deductError, setDeductError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const photoUrlsRef = useRef<string[]>([]);

  async function loadBatches() {
    const statusList = showReserved ? ["موجود", "رزرو شده"] : ["موجود"];
    const availableBatches = await db.batches
      .where("status")
      .anyOf(statusList)
      .toArray();
    const batchIds = availableBatches
      .map((batch) => batch.id)
      .filter((id): id is number => id !== undefined);
    const photos = batchIds.length
      ? await db.photos.where("batchId").anyOf(batchIds).toArray()
      : [];
    const photosByBatch = photos.reduce<Record<number, Photo[]>>((grouped, photo) => {
      grouped[photo.batchId] = [...(grouped[photo.batchId] ?? []), photo];
      return grouped;
    }, {});

    photoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    photoUrlsRef.current = [];

    const nextBatches = availableBatches
      .filter((batch): batch is Batch & { id: number } => batch.id !== undefined)
      .sort(sortByOldestEntry)
      .map((batch) => {
        const photoUrls = (photosByBatch[batch.id] ?? []).map((photo) =>
          URL.createObjectURL(photo.imageBlob),
        );
        photoUrlsRef.current.push(...photoUrls);

        return {
          ...batch,
          photoUrls,
        };
      });

    setBatches(nextBatches);
    setSelectedBatch((current) =>
      current ? nextBatches.find((batch) => batch.id === current.id) ?? null : null,
    );
  }

  useEffect(() => {
    loadBatches();

    return () => {
      photoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      photoUrlsRef.current = [];
    };
  }, [showReserved]);

  const filteredBatches = useMemo(() => {
    return batches.filter((batch) => {
      const typeMatches =
        !pistachioType ||
        (pistachioType === "سایر"
          ? !listedPistachioTypes.includes(batch.pistachioType)
          : batch.pistachioType === pistachioType);
      const gradeMatches = grade === "فرقی ندارد" || batch.grade === grade;

      return typeMatches && gradeMatches;
    });
  }, [batches, grade, pistachioType]);

  async function confirmDeduction() {
    if (!selectedBatch) {
      return;
    }

    const amount = normalizeNumber(deductAmount);

    if (!deductAmount.trim() || Number.isNaN(amount) || amount <= 0) {
      setDeductError("مقدار کسر باید بیشتر از صفر باشد.");
      return;
    }

    const nextRemaining = Math.max(0, selectedBatch.remainingWeightKg - amount);
    const nextStatus = nextRemaining <= 0 ? "تمام شده" : "موجود";

    await db.batches.update(selectedBatch.id, {
      remainingWeightKg: nextRemaining,
      status: nextStatus,
    });

    setConfirmation(
      `${formatKg(Math.min(amount, selectedBatch.remainingWeightKg))} کیلو کسر شد — باقیمانده: ${formatKg(nextRemaining)} کیلو`,
    );
    setSelectedBatch(null);
    setDeductAmount("");
    setDeductError("");
    await loadBatches();
  }

  function openDetail(batch: BatchWithPhotos) {
    setSelectedBatch(batch);
    setDeductAmount(String(batch.remainingWeightKg));
    setDeductError("");
  }

  return (
    <main className="min-h-screen bg-lime-50 px-4 py-5 text-zinc-950 sm:px-8">
      <section className="mx-auto grid w-full max-w-5xl gap-5 pb-10">
        <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-4 border-b border-lime-200 bg-lime-50/95 px-4 py-4 backdrop-blur sm:-mx-8 sm:px-8">
          <h1 className="text-3xl font-black">جستجوی موجودی</h1>
          <button
            className="min-h-14 rounded-lg border-2 border-zinc-900 bg-white px-5 text-xl font-black text-zinc-950"
            type="button"
            onClick={() => navigateTo("/")}
          >
            بازگشت
          </button>
        </header>

        <section className="grid gap-5">
          <Field label="نوع پسته">
            <ChipGroup
              options={pistachioTypes}
              value={pistachioType}
              onChange={(value) => setPistachioType(value === pistachioType ? "" : value)}
            />
          </Field>

          <Field label="درجه">
            <ChipGroup options={gradeFilters} value={grade} onChange={setGrade} />
          </Field>

          <button
            className={`min-h-12 justify-self-start rounded-lg border-2 px-4 text-base font-black ${
              showReserved
                ? "border-emerald-800 bg-emerald-800 text-white"
                : "border-zinc-300 bg-white text-zinc-800"
            }`}
            type="button"
            onClick={() => setShowReserved((current) => !current)}
          >
            نمایش رزرو شده‌ها
          </button>
        </section>

        {confirmation ? (
          <div className="rounded-lg bg-emerald-800 px-5 py-4 text-2xl font-black text-white">
            {confirmation}
          </div>
        ) : null}

        {filteredBatches.length === 0 ? (
          <div className="grid min-h-52 place-items-center rounded-lg border-2 border-dashed border-zinc-300 bg-white px-5 text-center">
            <p className="text-3xl font-black text-zinc-700">
              چیزی با این مشخصات پیدا نشد
            </p>
          </div>
        ) : (
          <section className="grid gap-4">
            {filteredBatches.map((batch) => (
              <button
                className="grid min-h-36 grid-cols-[7rem_1fr] gap-4 rounded-lg border-2 border-zinc-200 bg-white p-3 text-right shadow-sm active:scale-[0.99] sm:grid-cols-[9rem_1fr]"
                key={batch.id}
                type="button"
                onClick={() => openDetail(batch)}
              >
                <BatchThumbnail batch={batch} />
                <div className="grid content-center gap-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h2 className="text-2xl font-black">
                      {batch.pistachioType} - {batch.grade}
                    </h2>
                    {batch.status === "رزرو شده" ? (
                      <span className="rounded-lg bg-amber-100 px-3 py-1 text-base font-black text-amber-900">
                        رزرو شده
                      </span>
                    ) : null}
                  </div>
                  <p className="text-3xl font-black text-emerald-800">
                    {formatKg(batch.remainingWeightKg)} کیلو
                  </p>
                  <dl className="grid gap-1 text-lg font-semibold text-zinc-700 sm:grid-cols-2">
                    <div>تعداد گونی: {formatKg(batch.sackCount)}</div>
                    <div>مالک: {batch.owner}</div>
                    <div>مکان: {batch.location || "ثبت نشده"}</div>
                    <div>تاریخ ورود: {batch.entryDateJalali}</div>
                  </dl>
                </div>
              </button>
            ))}
          </section>
        )}
      </section>

      {selectedBatch ? (
        <BatchDetail
          batch={selectedBatch}
          deductAmount={deductAmount}
          deductError={deductError}
          onDeductAmountChange={(value) => {
            setDeductAmount(value);
            setDeductError("");
          }}
          onDeductMinus={() =>
            setDeductAmount((current) =>
              String(clamp((normalizeNumber(current) || selectedBatch.remainingWeightKg) - 1, 0)),
            )
          }
          onDeductPlus={() =>
            setDeductAmount((current) =>
              String(clamp((normalizeNumber(current) || 0) + 1, 0, selectedBatch.remainingWeightKg)),
            )
          }
          onClose={() => setSelectedBatch(null)}
          onConfirm={confirmDeduction}
        />
      ) : null}
    </main>
  );
}

function BatchThumbnail({ batch }: { batch: BatchWithPhotos }) {
  if (batch.photoUrls.length > 0) {
    return (
      <img
        className="h-28 w-28 rounded-lg object-cover sm:h-36 sm:w-36"
        src={batch.photoUrls[0]}
        alt="عکس بار"
      />
    );
  }

  return (
    <div className="grid h-28 w-28 place-items-center rounded-lg bg-lime-100 text-5xl font-black text-emerald-800 sm:h-36 sm:w-36">
      پ
    </div>
  );
}

function BatchDetail({
  batch,
  deductAmount,
  deductError,
  onDeductAmountChange,
  onDeductMinus,
  onDeductPlus,
  onClose,
  onConfirm,
}: {
  batch: BatchWithPhotos;
  deductAmount: string;
  deductError: string;
  onDeductAmountChange: (value: string) => void;
  onDeductMinus: () => void;
  onDeductPlus: () => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const hasMultiplePhotos = batch.photoUrls.length > 1;

  function showPreviousPhoto() {
    setLightboxIndex((current) => {
      if (current === null || batch.photoUrls.length === 0) {
        return current;
      }

      return current === 0 ? batch.photoUrls.length - 1 : current - 1;
    });
  }

  function showNextPhoto() {
    setLightboxIndex((current) => {
      if (current === null || batch.photoUrls.length === 0) {
        return current;
      }

      return current === batch.photoUrls.length - 1 ? 0 : current + 1;
    });
  }

  return (
    <div className="fixed inset-0 z-20 overflow-y-auto bg-lime-50 px-4 py-5 text-zinc-950 sm:px-8">
      <section className="mx-auto grid w-full max-w-4xl gap-5 pb-8">
        <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-4 border-b border-lime-200 bg-lime-50/95 px-4 py-4 backdrop-blur sm:-mx-8 sm:px-8">
          <h1 className="text-3xl font-black">جزئیات بار</h1>
          <button
            className="min-h-14 rounded-lg border-2 border-zinc-900 bg-white px-5 text-xl font-black text-zinc-950"
            type="button"
            onClick={onClose}
          >
            بستن
          </button>
        </header>

        <section className="flex gap-4 overflow-x-auto pb-2">
          {batch.photoUrls.length > 0 ? (
            batch.photoUrls.map((url, index) => (
              <button
                className="min-h-64 min-w-64 overflow-hidden rounded-lg bg-zinc-100"
                key={url}
                type="button"
                onClick={() => setLightboxIndex(index)}
              >
                <img
                  className="h-64 w-64 object-cover"
                  src={url}
                  alt="عکس بار"
                />
              </button>
            ))
          ) : (
            <div className="grid h-64 min-w-64 place-items-center rounded-lg bg-lime-100 text-6xl font-black text-emerald-800">
              پ
            </div>
          )}
        </section>

        <section className="grid gap-3 rounded-lg bg-white p-4 text-xl font-semibold shadow-sm sm:grid-cols-2">
          <DetailRow label="نوع پسته" value={batch.pistachioType} />
          <DetailRow label="درجه" value={batch.grade} />
          <DetailRow label="انس" value={formatKg(batch.ounceGrade)} />
          <DetailRow label="درصد مغز" value={`${formatKg(batch.kernelPercent)}٪`} />
          <DetailRow label="وزن کل" value={`${formatKg(batch.totalWeightKg)} کیلو`} />
          <DetailRow
            label="باقیمانده"
            value={`${formatKg(batch.remainingWeightKg)} کیلو`}
          />
          <DetailRow label="تعداد گونی" value={formatKg(batch.sackCount)} />
          <DetailRow label="مالک" value={batch.owner} />
          <DetailRow label="تاریخ ورود" value={batch.entryDateJalali} />
          <DetailRow label="مکان" value={batch.location || "ثبت نشده"} wide />
          <DetailRow label="توضیحات" value={batch.notes || "ندارد"} wide />
          <DetailRow label="وضعیت" value={batch.status} />
        </section>

        <section className="grid gap-4 rounded-lg bg-white p-4 shadow-sm">
          <h2 className="text-3xl font-black">رزرو / کسر از موجودی</h2>
          <NumberField
            label="مقدار (کیلو)"
            value={deductAmount}
            error={deductError}
            min={0}
            max={batch.remainingWeightKg}
            onChange={onDeductAmountChange}
            onMinus={onDeductMinus}
            onPlus={onDeductPlus}
          />
          <button
            className="min-h-16 rounded-lg bg-emerald-800 px-6 text-2xl font-black text-white"
            type="button"
            onClick={onConfirm}
          >
            تایید کسر از موجودی
          </button>
        </section>
      </section>

      {lightboxIndex !== null && batch.photoUrls[lightboxIndex] ? (
        <div className="fixed inset-0 z-30 grid bg-zinc-950/90 p-4 text-white">
          <button
            className="absolute right-4 top-4 z-10 min-h-16 min-w-16 rounded-lg bg-white px-5 text-4xl font-black text-zinc-950"
            type="button"
            aria-label="بستن عکس"
            onClick={() => setLightboxIndex(null)}
          >
            ×
          </button>

          {hasMultiplePhotos ? (
            <>
              <button
                className="absolute left-4 top-1/2 z-10 min-h-16 min-w-16 -translate-y-1/2 rounded-lg bg-white/95 px-5 text-4xl font-black text-zinc-950"
                type="button"
                aria-label="عکس قبلی"
                onClick={showPreviousPhoto}
              >
                ‹
              </button>
              <button
                className="absolute right-4 top-1/2 z-10 min-h-16 min-w-16 -translate-y-1/2 rounded-lg bg-white/95 px-5 text-4xl font-black text-zinc-950"
                type="button"
                aria-label="عکس بعدی"
                onClick={showNextPhoto}
              >
                ›
              </button>
            </>
          ) : null}

          <button
            className="grid h-full w-full place-items-center"
            type="button"
            aria-label="بستن پس‌زمینه عکس"
            onClick={() => setLightboxIndex(null)}
          >
            <img
              className="max-h-[88vh] max-w-full rounded-lg object-contain"
              src={batch.photoUrls[lightboxIndex]}
              alt="عکس بزرگ بار"
              onClick={(event) => event.stopPropagation()}
            />
          </button>

          {hasMultiplePhotos ? (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-lg bg-zinc-950/80 px-4 py-2 text-xl font-black">
              {formatKg(lightboxIndex + 1)} از {formatKg(batch.photoUrls.length)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <div className="text-base font-black text-zinc-500">{label}</div>
      <div className="mt-1 break-words text-2xl font-black text-zinc-950">{value}</div>
    </div>
  );
}

function NewBatchForm() {
  const [form, setForm] = useState<FormState>(initialFormState);
  const [errors, setErrors] = useState<FormErrors>({});
  const [ownerSuggestions, setOwnerSuggestions] = useState<string[]>([]);
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<PhotoDraft[]>([]);

  const selectedPistachioType =
    form.pistachioType === "سایر"
      ? form.customPistachioType.trim()
      : form.pistachioType;

  const filteredOwnerSuggestions = useMemo(() => {
    const query = form.owner.trim();

    if (!query) {
      return ownerSuggestions.slice(0, 6);
    }

    return ownerSuggestions
      .filter((owner) => owner.includes(query))
      .filter((owner) => owner !== query)
      .slice(0, 6);
  }, [form.owner, ownerSuggestions]);

  const isDirty = useMemo(() => {
    return (
      form.pistachioType !== "" ||
      form.customPistachioType !== "" ||
      form.grade !== "" ||
      form.ounceGrade !== "" ||
      form.kernelPercent !== "" ||
      form.totalWeightKg !== "" ||
      form.sackCount !== "" ||
      form.owner !== "" ||
      form.entryDateJalali !== initialFormState.entryDateJalali ||
      form.location !== "" ||
      form.notes !== "" ||
      photos.length > 0
    );
  }, [form, photos.length]);

  useEffect(() => {
    let active = true;

    db.batches
      .orderBy("owner")
      .uniqueKeys()
      .then((owners) => {
        if (!active) {
          return;
        }

        setOwnerSuggestions(
          owners
            .map(String)
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, "fa")),
        );
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url));
    };
  }, []);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSaveError("");
  }

  function updateNumberField(
    key: "ounceGrade" | "kernelPercent" | "totalWeightKg" | "sackCount",
    delta: number,
    min: number,
    max?: number,
  ) {
    const currentValue = normalizeNumber(form[key]);
    const nextValue = clamp((Number.isNaN(currentValue) ? min : currentValue) + delta, min, max);
    updateField(key, String(nextValue));
  }

  function updateDatePart(part: "year" | "month" | "day", value: string) {
    const [year = "", month = "", day = ""] = form.entryDateJalali.split("/");
    const next = {
      year,
      month,
      day,
      [part]: value.replace(/\D/g, ""),
    };

    updateField(
      "entryDateJalali",
      `${next.year}/${next.month.padStart(2, "0")}/${next.day.padStart(2, "0")}`,
    );
  }

  function validateForm() {
    const nextErrors: FormErrors = {};
    const totalWeightKg = normalizeNumber(form.totalWeightKg);
    const sackCount = normalizeNumber(form.sackCount);

    if (!selectedPistachioType) {
      nextErrors.pistachioType = "نوع پسته را انتخاب کنید.";
    }

    if (!form.grade) {
      nextErrors.grade = "درجه را انتخاب کنید.";
    }

    if (!form.totalWeightKg.trim() || Number.isNaN(totalWeightKg) || totalWeightKg <= 0) {
      nextErrors.totalWeightKg = "وزن کل باید بیشتر از صفر باشد.";
    }

    if (!form.sackCount.trim() || Number.isNaN(sackCount) || sackCount <= 0) {
      nextErrors.sackCount = "تعداد گونی باید بیشتر از صفر باشد.";
    }

    if (!form.owner.trim()) {
      nextErrors.owner = "نام مالک را وارد کنید.";
    }

    if (!form.entryDateJalali.trim()) {
      nextErrors.entryDateJalali = "تاریخ ورود را وارد کنید.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError("");

    if (!validateForm()) {
      setSaveError("لطفا خطاهای فرم را برطرف کنید.");
      return;
    }

    setSaving(true);

    try {
      const totalWeightKg = normalizeNumber(form.totalWeightKg);
      const batch: Batch = {
        pistachioType: selectedPistachioType,
        grade: form.grade,
        ounceGrade: normalizeNumber(form.ounceGrade) || 0,
        kernelPercent: clamp(normalizeNumber(form.kernelPercent), 0, 100),
        totalWeightKg,
        sackCount: normalizeNumber(form.sackCount),
        remainingWeightKg: totalWeightKg,
        owner: form.owner.trim(),
        entryDateJalali: form.entryDateJalali.trim(),
        location: form.location.trim(),
        notes: form.notes.trim(),
        status: "موجود",
      };

      await db.transaction("rw", db.batches, db.photos, async () => {
        const batchId = await db.batches.add(batch);

        if (batchId === undefined) {
          throw new Error("Batch id was not created.");
        }

        if (photos.length > 0) {
          await db.photos.bulkAdd(
            photos.map((photo) => ({
              batchId,
              imageBlob: photo.file,
            })),
          );
        }
      });

      setSaved(true);
      window.setTimeout(() => navigateTo("/"), 1400);
    } catch (error) {
      console.error("Failed to save new batch", error);
      setSaveError("ذخیره بار انجام نشد. لطفا دوباره تلاش کنید.");
    } finally {
      setSaving(false);
    }
  }

  function handlePhotoSelection(files: FileList | null) {
    if (!files) {
      return;
    }

    const nextPhotos = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
      }));

    setPhotos((current) => [...current, ...nextPhotos]);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function removePhoto(id: string) {
    setPhotos((current) => {
      const photo = current.find((item) => item.id === id);

      if (photo) {
        URL.revokeObjectURL(photo.url);
      }

      return current.filter((item) => item.id !== id);
    });
  }

  function requestCancel() {
    if (isDirty) {
      setShowCancelConfirm(true);
      return;
    }

    navigateTo("/");
  }

  if (saved) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-emerald-800 px-6 text-center text-white">
        <section className="grid gap-6">
          <div className="mx-auto grid h-28 w-28 place-items-center rounded-full bg-white text-6xl font-black text-emerald-800">
            ✓
          </div>
          <h1 className="text-4xl font-black">بار جدید ثبت شد</h1>
          <p className="text-2xl font-semibold">در حال بازگشت به خانه...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-lime-50 px-4 py-5 text-zinc-950 sm:px-8">
      <form className="mx-auto grid w-full max-w-3xl gap-6 pb-28" onSubmit={handleSubmit}>
        <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-4 border-b border-lime-200 bg-lime-50/95 px-4 py-4 backdrop-blur sm:-mx-8 sm:px-8">
          <h1 className="text-3xl font-black">ثبت بار جدید</h1>
          <button
            className="min-h-16 rounded-lg border-2 border-red-700 bg-white px-6 text-2xl font-black text-red-800"
            type="button"
            onClick={requestCancel}
          >
            لغو
          </button>
        </header>

        {saveError ? (
          <div
            className="rounded-lg border-2 border-red-700 bg-red-50 px-5 py-4 text-2xl font-black text-red-800"
            role="alert"
          >
            {saveError}
          </div>
        ) : null}

        <Field label="نوع پسته" error={errors.pistachioType}>
          <ChipGroup
            options={pistachioTypes}
            value={form.pistachioType}
            onChange={(value) => updateField("pistachioType", value)}
          />
          {form.pistachioType === "سایر" ? (
            <input
              className="mt-4 min-h-16 w-full rounded-lg border-2 border-zinc-300 bg-white px-4 text-2xl font-semibold outline-none focus:border-emerald-800"
              type="text"
              value={form.customPistachioType}
              onChange={(event) => updateField("customPistachioType", event.target.value)}
              placeholder="نوع پسته را بنویسید"
            />
          ) : null}
        </Field>

        <Field label="درجه" error={errors.grade}>
          <ChipGroup
            options={grades}
            value={form.grade}
            onChange={(value) => updateField("grade", value)}
          />
        </Field>

        <NumberField
          label="انس"
          value={form.ounceGrade}
          onChange={(value) => updateField("ounceGrade", value)}
          onMinus={() => updateNumberField("ounceGrade", -1, 0)}
          onPlus={() => updateNumberField("ounceGrade", 1, 0)}
        />

        <NumberField
          label="درصد مغز"
          value={form.kernelPercent}
          max={100}
          min={0}
          onChange={(value) => updateField("kernelPercent", value)}
          onMinus={() => updateNumberField("kernelPercent", -1, 0, 100)}
          onPlus={() => updateNumberField("kernelPercent", 1, 0, 100)}
        />

        <NumberField
          label="وزن کل"
          value={form.totalWeightKg}
          error={errors.totalWeightKg}
          onChange={(value) => updateField("totalWeightKg", value)}
          onMinus={() => updateNumberField("totalWeightKg", -1, 0)}
          onPlus={() => updateNumberField("totalWeightKg", 1, 0)}
        />

        <NumberField
          label="تعداد گونی"
          value={form.sackCount}
          error={errors.sackCount}
          onChange={(value) => updateField("sackCount", value)}
          onMinus={() => updateNumberField("sackCount", -1, 0)}
          onPlus={() => updateNumberField("sackCount", 1, 0)}
        />

        <Field label="مالک" error={errors.owner}>
          <input
            className="min-h-16 w-full rounded-lg border-2 border-zinc-300 bg-white px-4 text-2xl font-semibold outline-none focus:border-emerald-800"
            type="text"
            value={form.owner}
            onChange={(event) => updateField("owner", event.target.value)}
            placeholder="نام مالک"
          />
          {filteredOwnerSuggestions.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-3">
              {filteredOwnerSuggestions.map((owner) => (
                <button
                  className="min-h-14 rounded-lg border-2 border-zinc-300 bg-white px-5 text-xl font-bold text-zinc-950"
                  key={owner}
                  type="button"
                  onClick={() => updateField("owner", owner)}
                >
                  {owner}
                </button>
              ))}
            </div>
          ) : null}
        </Field>

        <Field label="تاریخ ورود" error={errors.entryDateJalali}>
          <JalaliDatePicker
            value={form.entryDateJalali}
            onChange={(part, value) => updateDatePart(part, value)}
            onToday={() => updateField("entryDateJalali", getTodayJalali())}
          />
        </Field>

        <Field label="مکان">
          <input
            className="min-h-16 w-full rounded-lg border-2 border-zinc-300 bg-white px-4 text-2xl font-semibold outline-none focus:border-emerald-800"
            type="text"
            value={form.location}
            onChange={(event) => updateField("location", event.target.value)}
            placeholder="مثلا پالت ۷ - ردیف ۲"
          />
        </Field>

        <Field label="توضیحات">
          <textarea
            className="min-h-32 w-full rounded-lg border-2 border-zinc-300 bg-white px-4 py-3 text-2xl font-semibold outline-none focus:border-emerald-800"
            value={form.notes}
            onChange={(event) => updateField("notes", event.target.value)}
            placeholder="اختیاری"
          />
        </Field>

        <Field label="عکس‌ها">
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(event) => handlePhotoSelection(event.target.files)}
          />
          <button
            className="min-h-16 w-full rounded-lg bg-zinc-950 px-6 text-2xl font-black text-white"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            گرفتن عکس
          </button>
          {photos.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {photos.map((photo) => (
                <div className="overflow-hidden rounded-lg border-2 border-zinc-200 bg-white" key={photo.id}>
                  <img
                    className="h-36 w-full object-cover"
                    src={photo.url}
                    alt="عکس بار"
                  />
                  <button
                    className="min-h-14 w-full bg-red-700 px-3 text-xl font-black text-white"
                    type="button"
                    onClick={() => removePhoto(photo.id)}
                  >
                    حذف / گرفتن دوباره
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </Field>

        <button
          className="fixed inset-x-4 bottom-4 mx-auto min-h-16 max-w-3xl rounded-lg bg-emerald-800 px-6 text-2xl font-black text-white shadow-lg disabled:bg-zinc-500"
          type="submit"
          disabled={saving}
        >
          {saving ? "در حال ذخیره..." : "ذخیره بار"}
        </button>
      </form>

      {showCancelConfirm ? (
        <div className="fixed inset-0 z-20 grid place-items-center bg-zinc-950/70 px-5">
          <section className="w-full max-w-xl rounded-lg bg-white p-5 text-center shadow-xl">
            <h2 className="text-3xl font-black">ثبت بار لغو شود؟</h2>
            <p className="mt-3 text-xl font-semibold text-zinc-700">
              اطلاعات وارد شده ذخیره نشده است.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                className="min-h-16 rounded-lg bg-red-700 px-5 text-2xl font-black text-white"
                type="button"
                onClick={() => navigateTo("/")}
              >
                بله، لغو شود
              </button>
              <button
                className="min-h-16 rounded-lg border-2 border-zinc-900 bg-white px-5 text-2xl font-black text-zinc-950"
                type="button"
                onClick={() => setShowCancelConfirm(false)}
              >
                ادامه ثبت
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <label className="text-2xl font-black text-zinc-950">{label}</label>
      {children}
      {error ? <p className="text-xl font-bold text-red-700">{error}</p> : null}
    </section>
  );
}

function ChipGroup({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {options.map((option) => {
        const selected = value === option;

        return (
          <button
            className={`min-h-16 rounded-lg border-2 px-4 text-2xl font-black ${
              selected
                ? "border-emerald-800 bg-emerald-800 text-white"
                : "border-zinc-300 bg-white text-zinc-950"
            }`}
            key={option}
            type="button"
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function NumberField({
  label,
  value,
  error,
  min,
  max,
  onChange,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  error?: string;
  min?: number;
  max?: number;
  onChange: (value: string) => void;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <Field label={label} error={error}>
      <div className="grid grid-cols-[4.5rem_1fr_4.5rem] gap-3">
        <button
          className="min-h-16 rounded-lg bg-zinc-900 text-4xl font-black leading-none text-white"
          type="button"
          onClick={onMinus}
        >
          -
        </button>
        <input
          className="min-h-16 min-w-0 rounded-lg border-2 border-zinc-300 bg-white px-4 text-center text-2xl font-black outline-none focus:border-emerald-800"
          inputMode="decimal"
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          className="min-h-16 rounded-lg bg-zinc-900 text-4xl font-black leading-none text-white"
          type="button"
          onClick={onPlus}
        >
          +
        </button>
      </div>
    </Field>
  );
}

function JalaliDatePicker({
  value,
  onChange,
  onToday,
}: {
  value: string;
  onChange: (part: "year" | "month" | "day", value: string) => void;
  onToday: () => void;
}) {
  const [year = "", month = "", day = ""] = value.split("/");

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-3">
        <input
          aria-label="سال"
          className="min-h-16 min-w-0 rounded-lg border-2 border-zinc-300 bg-white px-3 text-center text-2xl font-black outline-none focus:border-emerald-800"
          inputMode="numeric"
          maxLength={4}
          value={year}
          onChange={(event) => onChange("year", event.target.value)}
          placeholder="سال"
        />
        <input
          aria-label="ماه"
          className="min-h-16 min-w-0 rounded-lg border-2 border-zinc-300 bg-white px-3 text-center text-2xl font-black outline-none focus:border-emerald-800"
          inputMode="numeric"
          maxLength={2}
          value={month}
          onChange={(event) => onChange("month", event.target.value)}
          placeholder="ماه"
        />
        <input
          aria-label="روز"
          className="min-h-16 min-w-0 rounded-lg border-2 border-zinc-300 bg-white px-3 text-center text-2xl font-black outline-none focus:border-emerald-800"
          inputMode="numeric"
          maxLength={2}
          value={day}
          onChange={(event) => onChange("day", event.target.value)}
          placeholder="روز"
        />
      </div>
      <button
        className="min-h-14 rounded-lg border-2 border-emerald-800 bg-white px-4 text-xl font-black text-emerald-900"
        type="button"
        onClick={onToday}
      >
        امروز
      </button>
    </div>
  );
}
