import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  db,
  defaultPistachioTypeNames,
  type Batch,
  type Deduction,
  type Photo,
  type PistachioTypeOption,
} from "./db";

type Route = "/" | "/search" | "/new-batch" | "/settings";
type StatusFilter = "available" | "withReserved" | "withArchive";

type FormErrors = Partial<
  Record<
    | "pistachioType"
    | "grade"
    | "ounceGrade"
    | "kernelPercent"
    | "totalWeightKg"
    | "sackCount"
    | "owner"
    | "entryDateJalali",
    string
  >
>;

type PhotoDraft = {
  id: string;
  existingPhotoId?: number;
  fullBlob: Blob;
  thumbnailBlob: Blob;
  fullUrl: string;
  thumbnailUrl: string;
  originalSize: number;
  compressedSize: number;
  thumbnailSize: number;
};

type BatchPhotoItem = {
  id?: number;
  fullBlob: Blob;
  thumbnailBlob?: Blob;
  fullUrl: string;
  thumbnailUrl: string;
};

type BatchWithPhotos = Batch & {
  id: number;
  photoUrls: string[];
  thumbnailUrls: string[];
  photos: BatchPhotoItem[];
  deductions: Deduction[];
};

type BackupBatch = Batch & {
  id?: number;
};

type BackupPhoto = {
  id?: number;
  batchId: number;
  imageDataUrl: string;
  thumbnailDataUrl?: string;
};

type BackupDeduction = Deduction & {
  id?: number;
};

type BackupPistachioType = PistachioTypeOption & {
  id?: number;
};

type BackupFile = {
  app: "pistachio-warehouse-tracker";
  version: 1;
  exportedAtJalali: string;
  batches: BackupBatch[];
  photos: BackupPhoto[];
  deductions?: BackupDeduction[];
  pistachioTypes?: BackupPistachioType[];
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
  isConsignment: boolean;
  entryDateJalali: string;
  location: string;
  notes: string;
};

const otherPistachioTypeLabel = "سایر";
const unknownLabel = "نامشخص";
const anyFilterLabel = "فرقی ندارد";
const lowStockThresholdKg = 50;
const grades = ["اعلا", "معمولی", unknownLabel];
const gradeFilters = [anyFilterLabel, ...grades];
const statusFilterOptions: { label: string; value: StatusFilter }[] = [
  { label: "فقط موجود", value: "available" },
  { label: "همراه رزرو", value: "withReserved" },
  { label: "شامل آرشیو", value: "withArchive" },
];

const initialFormState: FormState = {
  pistachioType: "",
  customPistachioType: "",
  grade: unknownLabel,
  ounceGrade: "",
  kernelPercent: "",
  totalWeightKg: "",
  sackCount: "",
  owner: "",
  isConsignment: false,
  entryDateJalali: getTodayJalali(),
  location: "",
  notes: "",
};

function getFormStateFromBatch(batch: Batch, typeNames = defaultPistachioTypeNames): FormState {
  const usesListedType = typeNames.includes(batch.pistachioType);

  return {
    pistachioType: usesListedType ? batch.pistachioType : otherPistachioTypeLabel,
    customPistachioType: usesListedType ? "" : batch.pistachioType,
    grade: batch.grade || unknownLabel,
    ounceGrade: batch.ounceGrade == null ? "" : String(batch.ounceGrade),
    kernelPercent: batch.kernelPercent == null ? "" : String(batch.kernelPercent),
    totalWeightKg: String(batch.totalWeightKg),
    sackCount: String(batch.sackCount),
    owner: batch.owner,
    isConsignment: batch.isConsignment ?? false,
    entryDateJalali: batch.entryDateJalali,
    location: batch.location,
    notes: batch.notes,
  };
}

function getPhotoDraftsFromBatch(batch: BatchWithPhotos): PhotoDraft[] {
  return batch.photos.map((photo, index) => ({
    id: `existing-${photo.id ?? index}`,
    existingPhotoId: photo.id,
    fullBlob: photo.fullBlob,
    thumbnailBlob: photo.thumbnailBlob ?? photo.fullBlob,
    fullUrl: URL.createObjectURL(photo.fullBlob),
    thumbnailUrl: URL.createObjectURL(photo.thumbnailBlob ?? photo.fullBlob),
    originalSize: photo.fullBlob.size,
    compressedSize: photo.fullBlob.size,
    thumbnailSize: (photo.thumbnailBlob ?? photo.fullBlob).size,
  }));
}

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

function normalizeOptionalNumber(value: string, min: number, max?: number) {
  if (!value.trim()) {
    return null;
  }

  const numericValue = normalizeNumber(value);

  if (Number.isNaN(numericValue)) {
    return null;
  }

  return clamp(numericValue, min, max);
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

function formatOptionalNumber(value: number | null | undefined) {
  return value == null ? unknownLabel : formatKg(value);
}

function formatOptionalPercent(value: number | null | undefined) {
  return value == null ? unknownLabel : `${formatKg(value)}٪`;
}

function isLowStock(batch: Batch) {
  return batch.remainingWeightKg < lowStockThresholdKg;
}

function isArchived(batch: Batch) {
  return batch.status === "تمام شده";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(bytes / 1024)} کیلوبایت`;
  }

  return `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} مگابایت`;
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

async function ensureDefaultPistachioTypes() {
  const count = await db.pistachioTypes.count();

  if (count === 0) {
    await db.pistachioTypes.bulkAdd(defaultPistachioTypeNames.map((name) => ({ name })));
  }
}

async function loadPistachioTypeOptions() {
  await ensureDefaultPistachioTypes();
  return db.pistachioTypes.orderBy("name").toArray();
}

function normalizeBackupPistachioType(record: unknown): BackupPistachioType {
  if (!record || typeof record !== "object") {
    throw new Error("Invalid pistachio type.");
  }

  const typeOption = record as Partial<BackupPistachioType>;
  const normalized: BackupPistachioType = {
    name: String(typeOption.name ?? "").trim(),
  };

  if (!normalized.name) {
    throw new Error("Invalid pistachio type name.");
  }

  if (typeof typeOption.id === "number") {
    normalized.id = typeOption.id;
  }

  return normalized;
}

async function resizeImageToJpeg(file: Blob, maxDimension: number, quality: number) {
  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Image could not be loaded."));
      element.src = sourceUrl;
    });
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas is not available.");
    }

    context.drawImage(image, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
            return;
          }

          reject(new Error("Image compression failed."));
        },
        "image/jpeg",
        quality,
      );
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function preparePhotoForStorage(file: File): Promise<PhotoDraft> {
  const fullBlob = await resizeImageToJpeg(file, 1200, 0.78);
  const thumbnailBlob = await resizeImageToJpeg(file, 300, 0.78);

  return {
    id: crypto.randomUUID(),
    fullBlob,
    thumbnailBlob,
    fullUrl: URL.createObjectURL(fullBlob),
    thumbnailUrl: URL.createObjectURL(thumbnailBlob),
    originalSize: file.size,
    compressedSize: fullBlob.size,
    thumbnailSize: thumbnailBlob.size,
  };
}

async function ensureThumbnailBlob(fullImageBlob: Blob, thumbnailBlob?: Blob) {
  if (thumbnailBlob) {
    return thumbnailBlob;
  }

  return resizeImageToJpeg(fullImageBlob, 300, 0.78);
}

function normalizeBackupBatch(record: unknown): BackupBatch {
  if (!record || typeof record !== "object") {
    throw new Error("Invalid batch.");
  }

  const batch = record as Partial<BackupBatch>;
  const normalized: BackupBatch = {
    pistachioType: String(batch.pistachioType ?? ""),
    grade: String(batch.grade ?? unknownLabel),
    ounceGrade:
      batch.ounceGrade === null || batch.ounceGrade === undefined
        ? null
        : Number(batch.ounceGrade),
    kernelPercent:
      batch.kernelPercent === null || batch.kernelPercent === undefined
        ? null
        : Number(batch.kernelPercent),
    totalWeightKg: Number(batch.totalWeightKg ?? 0),
    sackCount: Number(batch.sackCount ?? 0),
    remainingWeightKg: Number(batch.remainingWeightKg ?? 0),
    owner: String(batch.owner ?? ""),
    isConsignment: Boolean(batch.isConsignment ?? false),
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

function normalizeBackupDeduction(record: unknown): BackupDeduction {
  if (!record || typeof record !== "object") {
    throw new Error("Invalid deduction.");
  }

  const deduction = record as Partial<BackupDeduction>;
  const normalized: BackupDeduction = {
    batchId: Number(deduction.batchId),
    amountKg: Number(deduction.amountKg ?? 0),
    deductedAtJalali: String(deduction.deductedAtJalali ?? ""),
    note: String(deduction.note ?? ""),
  };

  if (!Number.isFinite(normalized.batchId) || !Number.isFinite(normalized.amountKg)) {
    throw new Error("Invalid deduction numbers.");
  }

  if (typeof deduction.id === "number") {
    normalized.id = deduction.id;
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
  const [availableBatchCount, setAvailableBatchCount] = useState(0);
  const [availableWeightKg, setAvailableWeightKg] = useState(0);

  useEffect(() => {
    let active = true;

    db.batches
      .where("status")
      .equals("موجود")
      .toArray()
      .then((availableBatches) => {
        if (!active) {
          return;
        }

        setAvailableBatchCount(availableBatches.length);
        setAvailableWeightKg(
          availableBatches.reduce(
            (sum, batch) => sum + Number(batch.remainingWeightKg || 0),
            0,
          ),
        );
      })
      .catch((error) => {
        console.error("Failed to load home stats", error);
      });

    return () => {
      active = false;
    };
  }, []);

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
          <p className="mt-5 rounded-lg bg-white px-4 py-3 text-xl font-black text-zinc-700 shadow-sm">
            بارهای موجود: {formatKg(availableBatchCount)} | موجودی کل:{" "}
            {formatKg(availableWeightKg)} کیلو
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
  const [pistachioTypeOptions, setPistachioTypeOptions] = useState<PistachioTypeOption[]>([]);
  const [newPistachioType, setNewPistachioType] = useState("");
  const [editingTypeId, setEditingTypeId] = useState<number | null>(null);
  const [editingTypeName, setEditingTypeName] = useState("");
  const restoreInputRef = useRef<HTMLInputElement>(null);

  async function refreshPistachioTypes() {
    setPistachioTypeOptions(await loadPistachioTypeOptions());
  }

  useEffect(() => {
    refreshPistachioTypes().catch((loadError) => {
      console.error("Failed to load pistachio types", loadError);
      setError("خواندن نوع‌های پسته انجام نشد.");
    });
  }, []);

  function clearSettingsMessages() {
    setMessage("");
    setError("");
  }

  async function exportBackup() {
    setMessage("");
    setError("");

    try {
      const batches = await db.batches.toArray();
      const photos = await db.photos.toArray();
      const deductions = await db.deductions.toArray();
      const pistachioTypesForBackup = await loadPistachioTypeOptions();
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
            thumbnailDataUrl: await blobToDataUrl(
              await ensureThumbnailBlob(photo.imageBlob, photo.thumbnailBlob),
            ),
          })),
        ),
        deductions: deductions.map(normalizeBackupDeduction),
        pistachioTypes: pistachioTypesForBackup.map(normalizeBackupPistachioType),
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
      const deductions = Array.isArray(parsed.deductions)
        ? parsed.deductions.map(normalizeBackupDeduction)
        : [];
      const pistachioTypesForRestore = Array.isArray(parsed.pistachioTypes)
        ? parsed.pistachioTypes.map(normalizeBackupPistachioType)
        : defaultPistachioTypeNames.map((name) => ({ name }));
      const photos = await Promise.all(parsed.photos.map(async (photo) => {
        if (
          !photo ||
          typeof photo !== "object" ||
          typeof photo.batchId !== "number" ||
          typeof photo.imageDataUrl !== "string"
        ) {
          throw new Error("Invalid photo record.");
        }

        const imageBlob = dataUrlToBlob(photo.imageDataUrl);
        const thumbnailBlob =
          typeof photo.thumbnailDataUrl === "string"
            ? dataUrlToBlob(photo.thumbnailDataUrl)
            : await ensureThumbnailBlob(imageBlob);
        const restoredPhoto = {
          batchId: photo.batchId,
          imageBlob,
          thumbnailBlob,
        };

        if (typeof photo.id === "number") {
          return {
            id: photo.id,
            ...restoredPhoto,
          };
        }

        return restoredPhoto;
      }));

      await db.transaction("rw", db.batches, db.photos, db.deductions, db.pistachioTypes, async () => {
        await db.pistachioTypes.clear();
        await db.deductions.clear();
        await db.photos.clear();
        await db.batches.clear();

        if (batches.length > 0) {
          await db.batches.bulkPut(batches);
        }

        if (photos.length > 0) {
          await db.photos.bulkPut(photos);
        }

        if (deductions.length > 0) {
          await db.deductions.bulkPut(deductions);
        }

        if (pistachioTypesForRestore.length > 0) {
          await db.pistachioTypes.bulkPut(pistachioTypesForRestore);
        }
      });

      await refreshPistachioTypes();
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

  async function addPistachioType() {
    const name = newPistachioType.trim();
    clearSettingsMessages();

    if (!name) {
      setError("نام نوع پسته را وارد کنید.");
      return;
    }

    if (pistachioTypeOptions.some((typeOption) => typeOption.name === name)) {
      setError("این نوع پسته قبلا ثبت شده است.");
      return;
    }

    try {
      await db.pistachioTypes.add({ name });
      setNewPistachioType("");
      await refreshPistachioTypes();
      setMessage("نوع پسته اضافه شد.");
    } catch (addError) {
      console.error("Failed to add pistachio type", addError);
      setError("اضافه کردن نوع پسته انجام نشد.");
    }
  }

  function startEditingPistachioType(typeOption: PistachioTypeOption) {
    setEditingTypeId(typeOption.id ?? null);
    setEditingTypeName(typeOption.name);
    clearSettingsMessages();
  }

  async function savePistachioTypeName(typeOption: PistachioTypeOption) {
    if (typeOption.id === undefined) {
      return;
    }

    const newName = editingTypeName.trim();
    const oldName = typeOption.name;
    clearSettingsMessages();

    if (!newName) {
      setError("نام نوع پسته نمی‌تواند خالی باشد.");
      return;
    }

    if (
      newName !== oldName &&
      pistachioTypeOptions.some((option) => option.name === newName)
    ) {
      setError("این نام قبلا در فهرست نوع پسته وجود دارد.");
      return;
    }

    try {
      await db.transaction("rw", db.pistachioTypes, db.batches, async () => {
        await db.pistachioTypes.update(typeOption.id!, { name: newName });
        await db.batches
          .where("pistachioType")
          .equals(oldName)
          .modify((batch) => {
            batch.pistachioType = newName;
          });
      });

      setEditingTypeId(null);
      setEditingTypeName("");
      await refreshPistachioTypes();
      setMessage("نام نوع پسته و بارهای قبلی مرتبط به‌روزرسانی شد.");
    } catch (renameError) {
      console.error("Failed to rename pistachio type", renameError);
      setError("ویرایش نام نوع پسته انجام نشد.");
    }
  }

  async function deletePistachioType(typeOption: PistachioTypeOption) {
    if (typeOption.id === undefined) {
      return;
    }

    clearSettingsMessages();

    try {
      const usedCount = await db.batches
        .where("pistachioType")
        .equals(typeOption.name)
        .count();

      if (usedCount > 0) {
        setError(
          `این نوع پسته در ${formatKg(usedCount)} بار استفاده شده و حذف نمی‌شود.`,
        );
        return;
      }

      await db.pistachioTypes.delete(typeOption.id);
      await refreshPistachioTypes();
      setMessage("نوع پسته حذف شد.");
    } catch (deleteError) {
      console.error("Failed to delete pistachio type", deleteError);
      setError("حذف نوع پسته انجام نشد.");
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

        <section className="grid gap-4 rounded-lg bg-white p-4 shadow-sm">
          <h2 className="text-3xl font-black">مدیریت نوع پسته</h2>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              className="min-h-16 rounded-lg border-2 border-zinc-300 bg-white px-4 text-2xl font-semibold outline-none focus:border-emerald-800"
              type="text"
              value={newPistachioType}
              onChange={(event) => setNewPistachioType(event.target.value)}
              placeholder="نوع جدید پسته"
            />
            <button
              className="min-h-16 rounded-lg bg-emerald-800 px-6 text-2xl font-black text-white"
              type="button"
              onClick={addPistachioType}
            >
              افزودن
            </button>
          </div>

          <div className="grid gap-3">
            {pistachioTypeOptions.map((typeOption) => (
              <div
                className="grid gap-3 rounded-lg border-2 border-zinc-200 p-3 sm:grid-cols-[1fr_auto_auto]"
                key={typeOption.id ?? typeOption.name}
              >
                {editingTypeId === typeOption.id ? (
                  <input
                    className="min-h-14 rounded-lg border-2 border-zinc-300 bg-white px-4 text-2xl font-semibold outline-none focus:border-emerald-800"
                    type="text"
                    value={editingTypeName}
                    onChange={(event) => setEditingTypeName(event.target.value)}
                  />
                ) : (
                  <div className="flex min-h-14 items-center text-2xl font-black">
                    {typeOption.name}
                  </div>
                )}

                {editingTypeId === typeOption.id ? (
                  <button
                    className="min-h-14 rounded-lg bg-emerald-800 px-5 text-xl font-black text-white"
                    type="button"
                    onClick={() => savePistachioTypeName(typeOption)}
                  >
                    ذخیره
                  </button>
                ) : (
                  <button
                    className="min-h-14 rounded-lg border-2 border-zinc-900 bg-white px-5 text-xl font-black text-zinc-950"
                    type="button"
                    onClick={() => startEditingPistachioType(typeOption)}
                  >
                    ویرایش
                  </button>
                )}

                {editingTypeId === typeOption.id ? (
                  <button
                    className="min-h-14 rounded-lg border-2 border-zinc-300 bg-white px-5 text-xl font-black text-zinc-700"
                    type="button"
                    onClick={() => {
                      setEditingTypeId(null);
                      setEditingTypeName("");
                    }}
                  >
                    لغو
                  </button>
                ) : (
                  <button
                    className="min-h-14 rounded-lg border-2 border-red-700 bg-white px-5 text-xl font-black text-red-800"
                    type="button"
                    onClick={() => deletePistachioType(typeOption)}
                  >
                    حذف
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

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
  const [grade, setGrade] = useState(anyFilterLabel);
  const [ownerFilter, setOwnerFilter] = useState("");
  const [ownerSuggestions, setOwnerSuggestions] = useState<string[]>([]);
  const [consignmentFilter, setConsignmentFilter] = useState(anyFilterLabel);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [pistachioTypeOptions, setPistachioTypeOptions] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("available");
  const [batches, setBatches] = useState<BatchWithPhotos[]>([]);
  const [orderBasket, setOrderBasket] = useState<BatchWithPhotos[]>([]);
  const [basketOpen, setBasketOpen] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState<BatchWithPhotos | null>(null);
  const [editingBatch, setEditingBatch] = useState<BatchWithPhotos | null>(null);
  const [deductAmount, setDeductAmount] = useState("");
  const [deductError, setDeductError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [detailNotice, setDetailNotice] = useState("");
  const photoUrlsRef = useRef<string[]>([]);

  async function loadBatches() {
    const statusList =
      statusFilter === "withArchive"
        ? ["موجود", "رزرو شده", "تمام شده"]
        : statusFilter === "withReserved"
          ? ["موجود", "رزرو شده"]
          : ["موجود"];
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
    const deductions = batchIds.length
      ? await db.deductions.where("batchId").anyOf(batchIds).toArray()
      : [];
    const photosByBatch = photos.reduce<Record<number, Photo[]>>((grouped, photo) => {
      grouped[photo.batchId] = [...(grouped[photo.batchId] ?? []), photo];
      return grouped;
    }, {});
    const deductionsByBatch = deductions.reduce<Record<number, Deduction[]>>(
      (grouped, deduction) => {
        grouped[deduction.batchId] = [...(grouped[deduction.batchId] ?? []), deduction];
        return grouped;
      },
      {},
    );

    photoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    photoUrlsRef.current = [];

    const nextBatches: BatchWithPhotos[] = availableBatches
      .filter((batch): batch is Batch & { id: number } => batch.id !== undefined)
      .sort(sortByOldestEntry)
      .map((batch) => {
        const batchPhotos = photosByBatch[batch.id] ?? [];
        const photoItems = batchPhotos.map((photo) => {
          const fullUrl = URL.createObjectURL(photo.imageBlob);
          const thumbnailUrl = URL.createObjectURL(photo.thumbnailBlob ?? photo.imageBlob);

          return {
            id: photo.id,
            fullBlob: photo.imageBlob,
            thumbnailBlob: photo.thumbnailBlob,
            fullUrl,
            thumbnailUrl,
          };
        });
        const photoUrls = photoItems.map((photo) => photo.fullUrl);
        const thumbnailUrls = photoItems.map((photo) => photo.thumbnailUrl);
        photoUrlsRef.current.push(...photoUrls, ...thumbnailUrls);

        return {
          ...batch,
          photoUrls,
          thumbnailUrls,
          photos: photoItems,
          deductions: (deductionsByBatch[batch.id] ?? []).sort((first, second) =>
            second.deductedAtJalali.localeCompare(first.deductedAtJalali),
          ),
        };
      });

    setBatches(nextBatches);
    setSelectedBatch((current) =>
      current ? nextBatches.find((batch) => batch.id === current.id) ?? null : null,
    );
    setEditingBatch((current) =>
      current ? nextBatches.find((batch) => batch.id === current.id) ?? null : null,
    );
    setOrderBasket((current) =>
      current
        .map((basketBatch) => nextBatches.find((batch) => batch.id === basketBatch.id))
        .filter((batch): batch is BatchWithPhotos => batch !== undefined),
    );
    return nextBatches;
  }

  useEffect(() => {
    loadBatches();

    return () => {
      photoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      photoUrlsRef.current = [];
    };
  }, [statusFilter]);

  useEffect(() => {
    let active = true;

    Promise.all([loadPistachioTypeOptions(), db.batches.orderBy("owner").uniqueKeys()])
      .then(([options, owners]) => {
        if (active) {
          setPistachioTypeOptions(options.map((option) => option.name));
          setOwnerSuggestions(
            owners
              .map(String)
              .filter(Boolean)
              .sort((a, b) => a.localeCompare(b, "fa")),
          );
        }
      })
      .catch((error) => {
        console.error("Failed to load search filter options", error);
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredBatches = useMemo(() => {
    const ownerQuery = ownerFilter.trim();

    return batches.filter((batch) => {
      const typeMatches =
        !pistachioType ||
        (pistachioType === otherPistachioTypeLabel
          ? !pistachioTypeOptions.includes(batch.pistachioType)
          : batch.pistachioType === pistachioType);
      const gradeMatches = grade === anyFilterLabel || batch.grade === grade;
      const ownerMatches = !ownerQuery || batch.owner.includes(ownerQuery);
      const consignmentMatches =
        consignmentFilter === anyFilterLabel ||
        (consignmentFilter === "امانت" ? batch.isConsignment : !batch.isConsignment);

      return typeMatches && gradeMatches && ownerMatches && consignmentMatches;
    });
  }, [batches, consignmentFilter, grade, ownerFilter, pistachioType, pistachioTypeOptions]);

  const filteredOwnerSuggestions = useMemo(() => {
    const query = ownerFilter.trim();

    if (!query) {
      return ownerSuggestions.slice(0, 6);
    }

    return ownerSuggestions
      .filter((owner) => owner.includes(query))
      .filter((owner) => owner !== query)
      .slice(0, 6);
  }, [ownerFilter, ownerSuggestions]);

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

    await db.transaction("rw", db.batches, db.deductions, async () => {
      await db.batches.update(selectedBatch.id, {
        remainingWeightKg: nextRemaining,
        status: nextStatus,
      });
      await db.deductions.add({
        batchId: selectedBatch.id,
        amountKg: Math.min(amount, selectedBatch.remainingWeightKg),
        deductedAtJalali: getTodayJalali(),
        note: "",
      });
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
    setDetailNotice("");
  }

  function addBatchToBasket(batch: BatchWithPhotos) {
    setOrderBasket((current) => {
      if (current.some((item) => item.id === batch.id)) {
        return current;
      }

      return [...current, batch];
    });
    setBasketOpen(true);
  }

  function removeBatchFromBasket(batchId: number) {
    setOrderBasket((current) => current.filter((batch) => batch.id !== batchId));
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLDivElement>, batch: BatchWithPhotos) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetail(batch);
    }
  }

  async function handleEditSaved(batchId: number) {
    const nextBatches = await loadBatches();
    const updatedBatch = nextBatches.find((batch) => batch.id === batchId) ?? null;
    setEditingBatch(null);
    setSelectedBatch(updatedBatch);
    setDetailNotice("ویرایش بار ذخیره شد");
  }

  if (editingBatch) {
    return (
      <NewBatchForm
        editingBatch={editingBatch}
        onEditCancel={() => setEditingBatch(null)}
        onEditSaved={handleEditSaved}
      />
    );
  }

  return (
    <main className="min-h-screen bg-lime-50 px-4 py-5 text-zinc-950 sm:px-8">
      <section className="mx-auto grid w-full max-w-5xl gap-5 pb-56">
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
              options={[...pistachioTypeOptions, otherPistachioTypeLabel]}
              value={pistachioType}
              onChange={(value) => setPistachioType(value === pistachioType ? "" : value)}
            />
          </Field>

          <Field label="درجه">
            <ChipGroup options={gradeFilters} value={grade} onChange={setGrade} />
          </Field>

          <section className="grid gap-3">
            <button
              className="min-h-12 justify-self-start rounded-lg border-2 border-zinc-300 bg-white px-4 text-base font-black text-zinc-800"
              type="button"
              onClick={() => setShowMoreFilters((current) => !current)}
            >
              {showMoreFilters ? "بستن فیلترهای بیشتر" : "فیلترهای بیشتر"}
            </button>

            {showMoreFilters ? (
              <div className="grid gap-4 rounded-lg bg-white p-4 shadow-sm">
                <Field label="مالک">
                  <input
                    className="min-h-14 w-full rounded-lg border-2 border-zinc-300 bg-white px-4 text-xl font-semibold outline-none focus:border-emerald-800"
                    type="text"
                    value={ownerFilter}
                    onChange={(event) => setOwnerFilter(event.target.value)}
                    placeholder="نام مالک"
                  />
                  {filteredOwnerSuggestions.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-3">
                      {filteredOwnerSuggestions.map((owner) => (
                        <button
                          className="min-h-12 rounded-lg border-2 border-zinc-300 bg-white px-4 text-lg font-bold text-zinc-950"
                          key={owner}
                          type="button"
                          onClick={() => setOwnerFilter(owner)}
                        >
                          {owner}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </Field>

                <Field label="امانت">
                  <ChipGroup
                    options={[anyFilterLabel, "امانت", "غیر امانت"]}
                    value={consignmentFilter}
                    onChange={setConsignmentFilter}
                  />
                </Field>
              </div>
            ) : null}
          </section>

          <Field label="وضعیت">
            <StatusFilterGroup value={statusFilter} onChange={setStatusFilter} />
          </Field>
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
              <div
                className={`relative grid min-h-36 grid-cols-[7rem_1fr] gap-4 rounded-lg border-2 p-3 text-right shadow-sm active:scale-[0.99] sm:grid-cols-[9rem_1fr] ${
                  isArchived(batch)
                    ? "border-zinc-300 bg-zinc-100 opacity-85"
                    : "border-zinc-200 bg-white"
                }`}
                key={batch.id}
                role="button"
                tabIndex={0}
                onClick={() => openDetail(batch)}
                onKeyDown={(event) => handleCardKeyDown(event, batch)}
              >
                <BatchBadges batch={batch} className="absolute left-3 top-3" />
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
                  <button
                    className="mt-2 min-h-12 justify-self-start rounded-lg bg-zinc-950 px-4 text-lg font-black text-white disabled:bg-zinc-400"
                    type="button"
                    disabled={orderBasket.some((item) => item.id === batch.id)}
                    onClick={(event) => {
                      event.stopPropagation();
                      addBatchToBasket(batch);
                    }}
                  >
                    {orderBasket.some((item) => item.id === batch.id)
                      ? "در لیست سفارش"
                      : "افزودن به لیست"}
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}
      </section>

      <OrderBasketPanel
        batches={orderBasket}
        open={basketOpen}
        onClear={() => setOrderBasket([])}
        onOpenChange={setBasketOpen}
        onRemove={removeBatchFromBasket}
      />

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
          onEdit={() => setEditingBatch(selectedBatch)}
          notice={detailNotice}
        />
      ) : null}
    </main>
  );
}

function BatchThumbnail({ batch }: { batch: BatchWithPhotos }) {
  const thumbnailUrl = batch.thumbnailUrls[0] ?? batch.photoUrls[0];

  if (thumbnailUrl) {
    return (
      <img
        className="h-28 w-28 rounded-lg object-cover sm:h-36 sm:w-36"
        src={thumbnailUrl}
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

function BatchBadges({ batch, className = "" }: { batch: Batch; className?: string }) {
  const badges = [
    isArchived(batch)
      ? {
          label: "آرشیو",
          className: "bg-zinc-200 text-zinc-800 ring-1 ring-zinc-500",
        }
      : null,
    batch.isConsignment
      ? {
          label: "امانت",
          className: "bg-amber-200 text-amber-950 ring-1 ring-amber-500",
        }
      : null,
    isLowStock(batch)
      ? {
          label: "موجودی کم",
          className: "bg-red-100 text-red-800 ring-1 ring-red-600",
        }
      : null,
  ].filter((badge): badge is { label: string; className: string } => badge !== null);

  if (badges.length === 0) {
    return null;
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {badges.map((badge) => (
        <span
          className={`rounded-lg px-3 py-1 text-base font-black ${badge.className}`}
          key={badge.label}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}

function OrderBasketPanel({
  batches,
  open,
  onClear,
  onOpenChange,
  onRemove,
}: {
  batches: BatchWithPhotos[];
  open: boolean;
  onClear: () => void;
  onOpenChange: (open: boolean) => void;
  onRemove: (batchId: number) => void;
}) {
  return (
    <aside className="fixed inset-x-0 bottom-0 z-10 border-t-2 border-zinc-200 bg-white/95 px-4 py-3 shadow-2xl backdrop-blur sm:px-8">
      <div className="mx-auto grid max-w-5xl gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            className="min-h-12 rounded-lg border-2 border-zinc-300 bg-white px-4 text-xl font-black text-zinc-950"
            type="button"
            onClick={() => onOpenChange(!open)}
          >
            لیست سفارش فعلی ({formatKg(batches.length)})
          </button>
          {batches.length > 0 ? (
            <button
              className="min-h-12 rounded-lg border-2 border-red-700 bg-white px-4 text-lg font-black text-red-800"
              type="button"
              onClick={onClear}
            >
              پاک کردن لیست
            </button>
          ) : null}
        </div>

        {open ? (
          batches.length > 0 ? (
            <ul className="grid max-h-56 gap-2 overflow-y-auto">
              {batches.map((batch) => (
                <li
                  className="grid gap-2 rounded-lg bg-lime-50 px-3 py-2 text-lg font-bold text-zinc-800 sm:grid-cols-[1fr_auto]"
                  key={batch.id}
                >
                  <div>
                    <span className="font-black text-zinc-950">
                      {batch.pistachioType} - {batch.grade}
                    </span>
                    <span className="mx-2">|</span>
                    <span>{formatKg(batch.remainingWeightKg)} کیلو</span>
                    <span className="mx-2">|</span>
                    <span>مالک: {batch.owner}</span>
                  </div>
                  <button
                    className="min-h-10 rounded-lg bg-red-700 px-3 text-base font-black text-white"
                    type="button"
                    onClick={() => onRemove(batch.id)}
                  >
                    حذف
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-lg font-bold text-zinc-600">
              هنوز باری به لیست سفارش اضافه نشده است.
            </p>
          )
        ) : null}
      </div>
    </aside>
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
  onEdit,
  notice,
}: {
  batch: BatchWithPhotos;
  deductAmount: string;
  deductError: string;
  onDeductAmountChange: (value: string) => void;
  onDeductMinus: () => void;
  onDeductPlus: () => void;
  onClose: () => void;
  onConfirm: () => void;
  onEdit: () => void;
  notice?: string;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showDeductions, setShowDeductions] = useState(false);
  const [showCustomerView, setShowCustomerView] = useState(false);
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

  if (showCustomerView) {
    return (
      <CustomerDisplayView batch={batch} onBack={() => setShowCustomerView(false)} />
    );
  }

  return (
    <div className="fixed inset-0 z-20 overflow-y-auto bg-lime-50 px-4 py-5 text-zinc-950 sm:px-8">
      <section className="mx-auto grid w-full max-w-4xl gap-5 pb-8">
        <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-4 border-b border-lime-200 bg-lime-50/95 px-4 py-4 backdrop-blur sm:-mx-8 sm:px-8">
          <h1 className="text-3xl font-black">جزئیات بار</h1>
          <div className="flex gap-3">
            <button
              className="min-h-14 rounded-lg bg-zinc-950 px-5 text-xl font-black text-white"
              type="button"
              onClick={() => setShowCustomerView(true)}
            >
              نمایش به مشتری
            </button>
            <button
              className="min-h-14 rounded-lg bg-emerald-800 px-5 text-xl font-black text-white"
              type="button"
              onClick={onEdit}
            >
              ویرایش
            </button>
            <button
              className="min-h-14 rounded-lg border-2 border-zinc-900 bg-white px-5 text-xl font-black text-zinc-950"
              type="button"
              onClick={onClose}
            >
              بستن
            </button>
          </div>
        </header>

        {notice ? (
          <div className="rounded-lg bg-emerald-800 px-5 py-4 text-2xl font-black text-white">
            {notice}
          </div>
        ) : null}

        <BatchBadges batch={batch} />

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
          <DetailRow label="انس" value={formatOptionalNumber(batch.ounceGrade)} />
          <DetailRow label="درصد مغز" value={formatOptionalPercent(batch.kernelPercent)} />
          <DetailRow label="وزن کل" value={`${formatKg(batch.totalWeightKg)} کیلو`} />
          <DetailRow
            label="باقیمانده"
            value={`${formatKg(batch.remainingWeightKg)} کیلو`}
          />
          <DetailRow label="تعداد گونی" value={formatKg(batch.sackCount)} />
          <DetailRow label="مالک" value={batch.owner} />
          <DetailRow label="امانت" value={batch.isConsignment ? "بله" : "خیر"} />
          <DetailRow label="تاریخ ورود" value={batch.entryDateJalali} />
          <DetailRow label="مکان" value={batch.location || "ثبت نشده"} wide />
          <DetailRow label="توضیحات" value={batch.notes || "ندارد"} wide />
          <DetailRow label="وضعیت" value={batch.status} />
        </section>

        <section className="grid gap-3 rounded-lg bg-white p-4 shadow-sm">
          <button
            className="flex min-h-14 items-center justify-between rounded-lg border-2 border-zinc-200 bg-white px-4 text-2xl font-black text-zinc-950"
            type="button"
            onClick={() => setShowDeductions((current) => !current)}
          >
            <span>تاریخچه برداشت</span>
            <span>{showDeductions ? "−" : "+"}</span>
          </button>

          {showDeductions ? (
            batch.deductions.length > 0 ? (
              <ul className="grid gap-2">
                {batch.deductions.map((deduction) => (
                  <li
                    className="rounded-lg bg-lime-50 px-4 py-3 text-xl font-bold text-zinc-800"
                    key={deduction.id ?? `${deduction.deductedAtJalali}-${deduction.amountKg}`}
                  >
                    <span>{deduction.deductedAtJalali}</span>
                    <span className="mx-2">-</span>
                    <span>{formatKg(deduction.amountKg)} کیلو</span>
                    {deduction.note ? <span> - {deduction.note}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xl font-bold text-zinc-600">هنوز برداشتی ثبت نشده است.</p>
            )
          ) : null}
        </section>

        {isArchived(batch) ? (
          <section className="rounded-lg border-2 border-zinc-300 bg-zinc-100 p-4 text-xl font-black text-zinc-700">
            این بار در آرشیو است؛ کسر موجودی برای آن نمایش داده نمی‌شود.
          </section>
        ) : (
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
        )}
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

function CustomerDisplayView({
  batch,
  onBack,
}: {
  batch: BatchWithPhotos;
  onBack: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-zinc-950 px-4 py-5 text-white sm:px-8">
      <button
        className="fixed left-4 top-4 z-10 min-h-11 rounded-lg bg-white/90 px-4 text-base font-black text-zinc-950"
        type="button"
        onClick={onBack}
      >
        بازگشت
      </button>

      <section className="mx-auto grid min-h-screen w-full max-w-5xl content-center gap-6 pb-6 pt-16">
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
          {batch.photoUrls.length > 0 ? (
            batch.photoUrls.map((url) => (
              <img
                className="h-[54vh] min-w-full snap-center rounded-lg object-contain sm:h-[62vh]"
                src={url}
                alt="عکس بار"
                key={url}
              />
            ))
          ) : (
            <div className="grid h-[54vh] min-w-full place-items-center rounded-lg bg-lime-100 text-8xl font-black text-emerald-800 sm:h-[62vh]">
              پ
            </div>
          )}
        </div>

        <section className="grid gap-4 rounded-lg bg-white px-5 py-5 text-zinc-950 sm:grid-cols-2">
          <div>
            <div className="text-lg font-black text-zinc-500">نوع پسته</div>
            <div className="text-4xl font-black">{batch.pistachioType}</div>
          </div>
          <div>
            <div className="text-lg font-black text-zinc-500">درجه</div>
            <div className="text-4xl font-black">{batch.grade}</div>
          </div>
          <div>
            <div className="text-lg font-black text-zinc-500">انس</div>
            <div className="text-4xl font-black">{formatOptionalNumber(batch.ounceGrade)}</div>
          </div>
          <div>
            <div className="text-lg font-black text-zinc-500">درصد مغز</div>
            <div className="text-4xl font-black">{formatOptionalPercent(batch.kernelPercent)}</div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-lg font-black text-zinc-500">باقیمانده</div>
            <div className="text-5xl font-black text-emerald-800">
              {formatKg(batch.remainingWeightKg)} کیلو
            </div>
          </div>
        </section>
      </section>
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

function NewBatchForm({
  editingBatch,
  onEditCancel,
  onEditSaved,
}: {
  editingBatch?: BatchWithPhotos;
  onEditCancel?: () => void;
  onEditSaved?: (batchId: number) => void | Promise<void>;
} = {}) {
  const isEditing = editingBatch !== undefined;
  const [form, setForm] = useState<FormState>(() =>
    editingBatch ? getFormStateFromBatch(editingBatch) : initialFormState,
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [ownerSuggestions, setOwnerSuggestions] = useState<string[]>([]);
  const [pistachioTypeOptions, setPistachioTypeOptions] = useState<string[]>(
    defaultPistachioTypeNames,
  );
  const [photos, setPhotos] = useState<PhotoDraft[]>(() =>
    editingBatch ? getPhotoDraftsFromBatch(editingBatch) : [],
  );
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [compressionSummary, setCompressionSummary] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<PhotoDraft[]>([]);

  const selectedPistachioType =
    form.pistachioType === otherPistachioTypeLabel
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
      form.grade !== initialFormState.grade ||
      form.ounceGrade !== "" ||
      form.kernelPercent !== "" ||
      form.totalWeightKg !== "" ||
      form.sackCount !== "" ||
      form.owner !== "" ||
      form.isConsignment !== initialFormState.isConsignment ||
      form.entryDateJalali !== initialFormState.entryDateJalali ||
      form.location !== "" ||
      form.notes !== "" ||
      photos.length > 0
    );
  }, [form, photos.length]);

  useEffect(() => {
    let active = true;

    async function loadFormOptions() {
      const [owners, typeOptions] = await Promise.all([
        db.batches.orderBy("owner").uniqueKeys(),
        loadPistachioTypeOptions(),
      ]);

      if (!active) {
        return;
      }

      const typeNames = typeOptions.map((option) => option.name);
      setPistachioTypeOptions(typeNames);

      if (editingBatch) {
        setForm(getFormStateFromBatch(editingBatch, typeNames));
      }

      setOwnerSuggestions(
        owners
          .map(String)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, "fa")),
      );
    }

    loadFormOptions().catch((error) => {
      console.error("Failed to load form options", error);

      if (active) {
        setSaveError("خواندن اطلاعات فرم انجام نشد. لطفا دوباره تلاش کنید.");
      }
    });

    return () => {
      active = false;
    };
  }, [editingBatch]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      photosRef.current.forEach((photo) => {
        URL.revokeObjectURL(photo.fullUrl);
        URL.revokeObjectURL(photo.thumbnailUrl);
      });
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
      [part]: value.replace(/\D/g, "").slice(0, part === "year" ? 4 : 2),
    };

    updateField("entryDateJalali", `${next.year}/${next.month}/${next.day}`);
  }

  function validateForm() {
    const nextErrors: FormErrors = {};
    const ounceGrade = normalizeNumber(form.ounceGrade);
    const kernelPercent = normalizeNumber(form.kernelPercent);
    const totalWeightKg = normalizeNumber(form.totalWeightKg);
    const sackCount = normalizeNumber(form.sackCount);

    if (!selectedPistachioType) {
      nextErrors.pistachioType = "نوع پسته را انتخاب کنید.";
    }

    if (!form.grade) {
      nextErrors.grade = "درجه را انتخاب کنید.";
    }

    if (form.ounceGrade.trim() && (Number.isNaN(ounceGrade) || ounceGrade < 0)) {
      nextErrors.ounceGrade = "انس باید عدد صفر یا بیشتر باشد.";
    }

    if (
      form.kernelPercent.trim() &&
      (Number.isNaN(kernelPercent) || kernelPercent < 0 || kernelPercent > 100)
    ) {
      nextErrors.kernelPercent = "درصد مغز باید بین صفر تا ۱۰۰ باشد.";
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

    if (photoProcessing) {
      setSaveError("لطفا تا پایان آماده‌سازی عکس‌ها صبر کنید.");
      return;
    }

    if (!validateForm()) {
      setSaveError("لطفا خطاهای فرم را برطرف کنید.");
      return;
    }

    setSaving(true);

    try {
      const totalWeightKg = normalizeNumber(form.totalWeightKg);
      const batchFields: Batch = {
        pistachioType: selectedPistachioType,
        grade: form.grade,
        ounceGrade: normalizeOptionalNumber(form.ounceGrade, 0),
        kernelPercent: normalizeOptionalNumber(form.kernelPercent, 0, 100),
        totalWeightKg,
        sackCount: normalizeNumber(form.sackCount),
        remainingWeightKg: editingBatch?.remainingWeightKg ?? totalWeightKg,
        owner: form.owner.trim(),
        isConsignment: form.isConsignment,
        entryDateJalali: form.entryDateJalali.trim(),
        location: form.location.trim(),
        notes: form.notes.trim(),
        status: editingBatch?.status ?? "موجود",
      };

      await db.transaction("rw", db.batches, db.photos, async () => {
        if (isEditing && editingBatch) {
          await db.batches.update(editingBatch.id, {
            pistachioType: batchFields.pistachioType,
            grade: batchFields.grade,
            ounceGrade: batchFields.ounceGrade,
            kernelPercent: batchFields.kernelPercent,
            totalWeightKg: batchFields.totalWeightKg,
            sackCount: batchFields.sackCount,
            owner: batchFields.owner,
            isConsignment: batchFields.isConsignment,
            entryDateJalali: batchFields.entryDateJalali,
            location: batchFields.location,
            notes: batchFields.notes,
          });
          await db.photos.where("batchId").equals(editingBatch.id).delete();

          if (photos.length > 0) {
            await db.photos.bulkAdd(
              photos.map((photo) => ({
                batchId: editingBatch.id,
                imageBlob: photo.fullBlob,
                thumbnailBlob: photo.thumbnailBlob,
              })),
            );
          }

          return;
        }

        const batchId = await db.batches.add(batchFields);

        if (batchId === undefined) {
          throw new Error("Batch id was not created.");
        }

        if (photos.length > 0) {
          await db.photos.bulkAdd(
            photos.map((photo) => ({
              batchId,
              imageBlob: photo.fullBlob,
              thumbnailBlob: photo.thumbnailBlob,
            })),
          );
        }
      });

      if (isEditing && editingBatch) {
        await onEditSaved?.(editingBatch.id);
        return;
      }

      setSaved(true);
      window.setTimeout(() => navigateTo("/"), 1400);
    } catch (error) {
      console.error("Failed to save new batch", error);
      setSaveError("ذخیره بار انجام نشد. لطفا دوباره تلاش کنید.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoSelection(files: FileList | null) {
    if (!files) {
      return;
    }

    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      return;
    }

    setPhotoProcessing(true);
    setSaveError("");
    setCompressionSummary("");

    try {
      const nextPhotos = await Promise.all(imageFiles.map(preparePhotoForStorage));
      const originalTotal = nextPhotos.reduce((sum, photo) => sum + photo.originalSize, 0);
      const compressedTotal = nextPhotos.reduce(
        (sum, photo) => sum + photo.compressedSize + photo.thumbnailSize,
        0,
      );

      setPhotos((current) => [...current, ...nextPhotos]);
      setCompressionSummary(
        `عکس‌ها آماده شد: ${formatFileSize(originalTotal)} → ${formatFileSize(compressedTotal)}`,
      );
    } catch (error) {
      console.error("Failed to prepare photos", error);
      setSaveError("آماده‌سازی عکس انجام نشد. لطفا دوباره عکس بگیرید.");
    } finally {
      setPhotoProcessing(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function removePhoto(id: string) {
    setPhotos((current) => {
      const photo = current.find((item) => item.id === id);

      if (photo) {
        URL.revokeObjectURL(photo.fullUrl);
        URL.revokeObjectURL(photo.thumbnailUrl);
      }

      return current.filter((item) => item.id !== id);
    });
  }

  function requestCancel() {
    if (isEditing) {
      onEditCancel?.();
      return;
    }

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
          <h1 className="text-3xl font-black">
            {isEditing ? "ویرایش بار" : "ثبت بار جدید"}
          </h1>
          <button
            className="min-h-16 rounded-lg border-2 border-red-700 bg-white px-6 text-2xl font-black text-red-800"
            type="button"
            onClick={requestCancel}
          >
            {isEditing ? "لغو ویرایش" : "لغو"}
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
            options={[...pistachioTypeOptions, otherPistachioTypeLabel]}
            value={form.pistachioType}
            onChange={(value) => updateField("pistachioType", value)}
          />
          {form.pistachioType === otherPistachioTypeLabel ? (
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
          error={errors.ounceGrade}
          onChange={(value) => updateField("ounceGrade", value)}
          onMinus={() => updateNumberField("ounceGrade", -1, 0)}
          onPlus={() => updateNumberField("ounceGrade", 1, 0)}
        />

        <NumberField
          label="درصد مغز"
          value={form.kernelPercent}
          error={errors.kernelPercent}
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
          <label className="mt-3 flex min-h-16 items-center gap-4 rounded-lg border-2 border-amber-300 bg-amber-50 px-4 text-2xl font-black text-amber-950">
            <input
              className="h-8 w-8 accent-amber-600"
              type="checkbox"
              checked={form.isConsignment}
              onChange={(event) => updateField("isConsignment", event.target.checked)}
            />
            <span>امانت</span>
          </label>
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
            className="min-h-16 w-full rounded-lg bg-zinc-950 px-6 text-2xl font-black text-white disabled:bg-zinc-500"
            type="button"
            disabled={photoProcessing}
            onClick={() => fileInputRef.current?.click()}
          >
            {photoProcessing ? "در حال آماده‌سازی عکس..." : "گرفتن عکس"}
          </button>
          {compressionSummary ? (
            <p className="text-lg font-bold text-emerald-800">{compressionSummary}</p>
          ) : null}
          {photos.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {photos.map((photo) => (
                <div className="overflow-hidden rounded-lg border-2 border-zinc-200 bg-white" key={photo.id}>
                  <img
                    className="h-36 w-full object-cover"
                    src={photo.thumbnailUrl}
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
          disabled={saving || photoProcessing}
        >
          {photoProcessing
            ? "در حال آماده‌سازی عکس..."
            : saving
              ? "در حال ذخیره..."
              : isEditing
                ? "ذخیره ویرایش"
                : "ذخیره بار"}
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

function StatusFilterGroup({
  value,
  onChange,
}: {
  value: StatusFilter;
  onChange: (value: StatusFilter) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {statusFilterOptions.map((option) => {
        const selected = value === option.value;

        return (
          <button
            className={`min-h-14 rounded-lg border-2 px-4 text-xl font-black ${
              selected
                ? "border-emerald-800 bg-emerald-800 text-white"
                : "border-zinc-300 bg-white text-zinc-950"
            }`}
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
          >
            {option.label}
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
          onFocus={(event) => event.currentTarget.select()}
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
          pattern="[0-9]*"
          type="tel"
          maxLength={4}
          value={year}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => onChange("year", event.target.value)}
          placeholder="سال"
        />
        <input
          aria-label="ماه"
          className="min-h-16 min-w-0 rounded-lg border-2 border-zinc-300 bg-white px-3 text-center text-2xl font-black outline-none focus:border-emerald-800"
          inputMode="numeric"
          pattern="[0-9]*"
          type="tel"
          maxLength={2}
          value={month}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => onChange("month", event.target.value)}
          placeholder="ماه"
        />
        <input
          aria-label="روز"
          className="min-h-16 min-w-0 rounded-lg border-2 border-zinc-300 bg-white px-3 text-center text-2xl font-black outline-none focus:border-emerald-800"
          inputMode="numeric"
          pattern="[0-9]*"
          type="tel"
          maxLength={2}
          value={day}
          onFocus={(event) => event.currentTarget.select()}
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
