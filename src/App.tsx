import { Icon } from '@iconify/react';
import { useState } from 'react';
import NumberField from '../ui/NumberField';

interface Batch {
  id: string;
  code: string;
  originalWeightKg: number;
  remainingWeightKg: number;
  costPerKg: number;
  totalCost: number;
  date: string;
  isArchived: boolean;
}

interface BatchDetailProps {
  batch: Batch;
  onBack: () => void;
}

export default function BatchDetail({ batch, onBack }: BatchDetailProps) {
  const [deductAmount, setDeductAmount] = useState<number>(0);
  const [deductError, setDeductError] = useState<string>('');

  const onDeductAmountChange = (val: number) => {
    setDeductAmount(val);
    if (val > batch.remainingWeightKg) {
      setDeductError('مقدار وارد شده بیشتر از موجودی است');
    } else {
      setDeductError('');
    }
  };

  const onDeductMinus = () => {
    if (deductAmount > 0) {
      setDeductAmount(prev => prev - 1);
    }
  };

  const onDeductPlus = () => {
    if (deductAmount < batch.remainingWeightKg) {
      setDeductAmount(prev => prev + 1);
    }
  };

  const onConfirm = () => {
    if (deductAmount <= 0) {
      setDeductError('لطفاً مقدار معتبری وارد کنید');
      return;
    }
    if (deductAmount > batch.remainingWeightKg) {
      setDeductError('مقدار وارد شده بیشتر از موجودی است');
      return;
    }
    alert(`مقدار ${deductAmount} کیلوگرم از بار کسر شد.`);
  };

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* هدر */}
      <header className="flex items-center gap-4">
        <button 
          onClick={onBack}
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm active:scale-95 transition"
        >
          <Icon icon="solar:arrow-right-linear" className="text-2xl" />
        </button>
        <h1 className="text-3xl font-black text-slate-800">جزئیات بار ارسالی</h1>
      </header>

      {/* کارت اطلاعات بار */}
      <section className="grid gap-4 rounded-lg bg-white p-4 shadow-sm">
        <div className="flex justify-between items-center border-b pb-2">
          <span className="text-slate-500">کد بار:</span>
          <span className="font-bold text-slate-800">{batch.code}</span>
        </div>
        <div className="flex justify-between items-center border-b pb-2">
          <span className="text-slate-500">وزن اولیه:</span>
          <span className="font-bold text-slate-800">{batch.originalWeightKg} کیلوگرم</span>
        </div>
        <div className="flex justify-between items-center border-b pb-2">
          <span className="text-slate-500">وزن باقی‌مانده:</span>
          <span className="font-bold text-red-600">{batch.remainingWeightKg} کیلوگرم</span>
        </div>
        <div className="flex justify-between items-center border-b pb-2">
          <span className="text-slate-500">قیمت هر کیلو:</span>
          <span className="font-bold text-slate-800">{batch.costPerKg.toLocaleString()} تومان</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-500">قیمت کل:</span>
          <span className="font-bold text-emerald-600">{batch.totalCost.toLocaleString()} تومان</span>
        </div>
      </section>

      {/* بخش عملیات کسر موجودی (در صورت آرشیو نبودن) */}
      <section className="mt-4">
        {!batch.isArchived && (
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
              className="min-h-16 rounded-lg bg-red-700 px-6 text-2xl font-black text-white active:scale-[0.99] transition shadow-sm"
              type="button"
              onClick={onConfirm}
            >
              تایید کسر موجودی
            </button>
          </section>
        )}
      </section>
    </div>
  );
}
