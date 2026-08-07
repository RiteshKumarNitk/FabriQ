'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Unit } from '@fabriq/shared';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { num, qty, money } from '@/lib/utils';

export interface LineItem {
  itemName: string;
  description?: string;
  quantity: number;
  unit: string;
  rate?: number;
  gstPercent?: number;
  remarks?: string;
  requisitionItemId?: string;
}

const UNITS = Object.values(Unit);

export interface ItemsTotals {
  subTotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
}

interface ItemsEditorProps {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  /** show rate + GST columns (purchase orders) and the totals panel */
  pricing?: boolean;
  /** tax % + discount % applied to the totals (PO headers) */
  taxPercent?: number;
  discountPercent?: number;
}

export function ItemsEditor({ items, onChange, pricing = false, taxPercent = 0, discountPercent = 0 }: ItemsEditorProps) {
  function update(index: number, patch: Partial<LineItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addRow() {
    onChange([
      ...items,
      { itemName: '', quantity: 1, unit: Unit.METERS, ...(pricing ? { rate: 0, gstPercent: 0 } : {}) },
    ]);
  }

  function removeRow(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  const subTotal = items.reduce((sum, i) => sum + num(i.quantity) * num(i.rate), 0);
  const taxAmount = items.reduce((sum, i) => sum + num(i.quantity) * num(i.rate) * (num(i.gstPercent) / 100), 0);
  const discountAmount = subTotal * (num(discountPercent) / 100);
  const totalAmount = subTotal - discountAmount + taxAmount;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="min-w-44 px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="w-24 px-3 py-2 font-medium">Qty</th>
              <th className="w-28 px-3 py-2 font-medium">Unit</th>
              {pricing ? (
                <>
                  <th className="w-28 px-3 py-2 font-medium">Rate</th>
                  <th className="w-20 px-3 py-2 font-medium">GST %</th>
                  <th className="w-28 px-3 py-2 text-right font-medium">Amount</th>
                </>
              ) : (
                <th className="w-40 px-3 py-2 font-medium">Remarks</th>
              )}
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={pricing ? 7 : 6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No items yet — add a line below.
                </td>
              </tr>
            ) : (
              items.map((item, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 text-xs"
                      placeholder="e.g. Cotton 100% — Grey Fabric"
                      value={item.itemName}
                      onChange={(e) => update(i, { itemName: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 text-xs"
                      placeholder="Optional"
                      value={item.description ?? ''}
                      onChange={(e) => update(i, { description: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 text-xs"
                      type="number"
                      min={0}
                      step="0.001"
                      value={item.quantity}
                      onChange={(e) => update(i, { quantity: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Select className="h-8 text-xs" value={item.unit} onChange={(e) => update(i, { unit: e.target.value })}>
                      {UNITS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </Select>
                  </td>
                  {pricing ? (
                    <>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 text-xs"
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.rate}
                          onChange={(e) => update(i, { rate: Number(e.target.value) })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 text-xs"
                          type="number"
                          min={0}
                          max={100}
                          value={item.gstPercent ?? 0}
                          onChange={(e) => update(i, { gstPercent: Number(e.target.value) })}
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right text-xs font-medium">
                        {money(num(item.quantity) * num(item.rate))}
                      </td>
                    </>
                  ) : (
                    <td className="px-2 py-1.5">
                      <Input
                        className="h-8 text-xs"
                        placeholder="Optional"
                        value={item.remarks ?? ''}
                        onChange={(e) => update(i, { remarks: e.target.value })}
                      />
                    </td>
                  )}
                  <td className="px-2 py-1.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeRow(i)} aria-label="Remove line">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus /> Add item
        </Button>
        {pricing ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
            <span className="text-muted-foreground">
              Subtotal <strong className="text-foreground">{money(subTotal)}</strong>
            </span>
            <span className="text-muted-foreground">
              Tax <strong className="text-foreground">{money(taxAmount)}</strong>
            </span>
            <span className="text-muted-foreground">
              Discount <strong className="text-foreground">−{money(discountAmount)}</strong>
            </span>
            <span className="text-sm font-semibold">
              Total <span className="text-primary">{money(totalAmount)}</span>
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            {items.length} line{items.length === 1 ? '' : 's'} · {qty(items.reduce((s, i) => s + num(i.quantity), 0))} total units
          </span>
        )}
      </div>
    </div>
  );
}
