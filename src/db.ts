import Dexie, { type EntityTable } from "dexie";

export type BatchStatus = "موجود" | "رزرو شده" | "تمام شده";

export interface Batch {
  id?: number;
  pistachioType: string;
  grade: string;
  ounceGrade: number | null;
  kernelPercent: number | null;
  totalWeightKg: number;
  sackCount: number;
  remainingWeightKg: number;
  owner: string;
  entryDateJalali: string;
  location: string;
  notes: string;
  status: BatchStatus;
}

export interface Photo {
  id?: number;
  batchId: number;
  imageBlob: Blob;
  thumbnailBlob?: Blob;
}

export interface Deduction {
  id?: number;
  batchId: number;
  amountKg: number;
  deductedAtJalali: string;
  note: string;
}

export interface PistachioTypeOption {
  id?: number;
  name: string;
}

export const defaultPistachioTypeNames = [
  "احمدآقایی",
  "اکبری",
  "آجیلی",
  "کله‌قوچی",
  "فندقی",
];

export const db = new Dexie("PistachioWarehouseTracker") as Dexie & {
  batches: EntityTable<Batch, "id">;
  photos: EntityTable<Photo, "id">;
  deductions: EntityTable<Deduction, "id">;
  pistachioTypes: EntityTable<PistachioTypeOption, "id">;
};

db.version(1).stores({
  batches: "++id,pistachioType,owner,entryDateJalali,location,status",
  photos: "++id,batchId",
});

db.version(2).stores({
  batches: "++id,pistachioType,owner,entryDateJalali,location,status",
  photos: "++id,batchId",
  deductions: "++id,batchId,deductedAtJalali",
});

db.version(3)
  .stores({
    batches: "++id,pistachioType,owner,entryDateJalali,location,status",
    photos: "++id,batchId",
    deductions: "++id,batchId,deductedAtJalali",
    pistachioTypes: "++id,&name",
  })
  .upgrade(async (transaction) => {
    const table = transaction.table<PistachioTypeOption, number>("pistachioTypes");

    if ((await table.count()) === 0) {
      await table.bulkAdd(defaultPistachioTypeNames.map((name) => ({ name })));
    }
  });
