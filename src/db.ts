import Dexie, { type EntityTable } from "dexie";

export type BatchStatus = "موجود" | "رزرو شده" | "تمام شده";

export interface Batch {
  id?: number;
  pistachioType: string;
  grade: string;
  ounceGrade: number;
  kernelPercent: number;
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
}

export const db = new Dexie("PistachioWarehouseTracker") as Dexie & {
  batches: EntityTable<Batch, "id">;
  photos: EntityTable<Photo, "id">;
};

db.version(1).stores({
  batches: "++id,pistachioType,owner,entryDateJalali,location,status",
  photos: "++id,batchId",
});
