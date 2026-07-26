import Dexie, { type EntityTable } from "dexie";

export type BatchStatus = "موجود" | "رزرو شده" | "تمام شده";

export interface Batch {
  id?: number;
  pistachioType: string;
  appearanceType: string | null;
  ounceGrade: number | null;
  kernelPercent: number | null;
  totalWeightKg: number;
  sackCount: number;
  remainingWeightKg: number;
  owner: string;
  isConsignment: boolean;
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
  defaultImageBlob?: Blob | null;
}

export interface AppearanceTypeOption {
  id?: number;
  name: string;
  defaultImageBlob?: Blob | null;
}

export const defaultPistachioTypeNames = [
  "احمدآقایی",
  "اکبری",
  "آجیلی",
  "کله‌قوچی",
  "فندقی",
];

export const defaultAppearanceTypeNames = [
  "دهن‌بست",
  "خندان",
  "نخودو",
  "روآبی",
  "زردو",
];

export const db = new Dexie("PistachioWarehouseTracker") as Dexie & {
  batches: EntityTable<Batch, "id">;
  photos: EntityTable<Photo, "id">;
  deductions: EntityTable<Deduction, "id">;
  pistachioTypes: EntityTable<PistachioTypeOption, "id">;
  appearanceTypes: EntityTable<AppearanceTypeOption, "id">;
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

db.version(4)
  .stores({
    batches: "++id,pistachioType,owner,entryDateJalali,location,status",
    photos: "++id,batchId",
    deductions: "++id,batchId,deductedAtJalali",
    pistachioTypes: "++id,&name",
  })
  .upgrade(async (transaction) => {
    await transaction
      .table<Batch, number>("batches")
      .toCollection()
      .modify((batch) => {
        if (batch.isConsignment === undefined) {
          batch.isConsignment = false;
        }
      });
  });

db.version(5)
  .stores({
    batches: "++id,pistachioType,appearanceType,owner,entryDateJalali,location,status",
    photos: "++id,batchId",
    deductions: "++id,batchId,deductedAtJalali",
    pistachioTypes: "++id,&name",
    appearanceTypes: "++id,&name",
  })
  .upgrade(async (transaction) => {
    const appearanceTable = transaction.table<AppearanceTypeOption, number>("appearanceTypes");

    if ((await appearanceTable.count()) === 0) {
      await appearanceTable.bulkAdd(defaultAppearanceTypeNames.map((name) => ({ name })));
    }

    await transaction
      .table<Batch, number>("batches")
      .toCollection()
      .modify((batch) => {
        if (batch.appearanceType === undefined) {
          batch.appearanceType = null;
        }
      });
  });

db.version(6)
  .stores({
    batches: "++id,pistachioType,appearanceType,owner,entryDateJalali,location,status",
    photos: "++id,batchId",
    deductions: "++id,batchId,deductedAtJalali",
    pistachioTypes: "++id,&name",
    appearanceTypes: "++id,&name",
  })
  .upgrade(async (transaction) => {
    await transaction
      .table<PistachioTypeOption, number>("pistachioTypes")
      .toCollection()
      .modify((typeOption) => {
        if (typeOption.defaultImageBlob === undefined) {
          typeOption.defaultImageBlob = null;
        }
      });
  });

db.version(7)
  .stores({
    batches: "++id,pistachioType,appearanceType,owner,entryDateJalali,location,status",
    photos: "++id,batchId",
    deductions: "++id,batchId,deductedAtJalali",
    pistachioTypes: "++id,&name",
    appearanceTypes: "++id,&name",
  })
  .upgrade(async (transaction) => {
    await transaction
      .table<AppearanceTypeOption, number>("appearanceTypes")
      .toCollection()
      .modify((typeOption) => {
        if (typeOption.defaultImageBlob === undefined) {
          typeOption.defaultImageBlob = null;
        }
      });
  });
