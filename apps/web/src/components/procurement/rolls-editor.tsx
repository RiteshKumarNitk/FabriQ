'use client';

import { Plus, Trash2 } from 'lucide-react';
import { RollCondition } from '@fabriq/shared';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

export interface RollRow {
  rollNumber: string;
  fabricType?: string;
  color?: string;
  gsm?: number;
  width?: number;
  length?: number;
  weight?: number;
  batch?: string;
  lot?: string;
  barcode?: string;
  qrCode?: string;
  condition: string;
  purchaseOrderItemId?: string;
  remarks?: string;
}

interface RollsEditorProps {
  rolls: RollRow[];
  onChange: (rolls: RollRow[]) => void;
  /** PO line options [{ id, label }] — assigns rolls to PO items */
  poItems?: Array<{ id: string; label: string }>;
}

export function RollsEditor({ rolls, onChange, poItems }: RollsEditorProps) {
  function update(index: number, patch: Partial<RollRow>) {
    onChange(rolls.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    onChange([...rolls, { rollNumber: '', condition: RollCondition.GOOD }]);
  }

  function removeRow(index: number) {
    onChange(rolls.filter((_, i) => i !== index));
  }

  const input = 'h-8 text-xs';

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="min-w-28 px-3 py-2 font-medium">Roll No.</th>
              <th className="min-w-32 px-3 py-2 font-medium">Fabric Type</th>
              <th className="w-24 px-3 py-2 font-medium">Color</th>
              <th className="w-20 px-3 py-2 font-medium">GSM</th>
              <th className="w-20 px-3 py-2 font-medium">Width</th>
              <th className="w-20 px-3 py-2 font-medium">Length</th>
              <th className="w-20 px-3 py-2 font-medium">Weight</th>
              <th className="w-24 px-3 py-2 font-medium">Batch</th>
              <th className="w-24 px-3 py-2 font-medium">Lot</th>
              <th className="w-32 px-3 py-2 font-medium">Barcode</th>
              {poItems?.length ? <th className="min-w-36 px-3 py-2 font-medium">PO Line</th> : null}
              <th className="w-28 px-3 py-2 font-medium">Condition</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rolls.length === 0 ? (
              <tr>
                <td colSpan={poItems?.length ? 12 : 11} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No rolls yet — add a roll for every piece received (including damaged ones).
                </td>
              </tr>
            ) : (
              rolls.map((roll, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-2 py-1.5">
                    <Input className={input} placeholder="R-1001" value={roll.rollNumber} onChange={(e) => update(i, { rollNumber: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input className={input} placeholder="Cotton 100%" value={roll.fabricType ?? ''} onChange={(e) => update(i, { fabricType: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input className={input} placeholder="Grey" value={roll.color ?? ''} onChange={(e) => update(i, { color: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input className={input} type="number" min={0} value={roll.gsm ?? ''} onChange={(e) => update(i, { gsm: Number(e.target.value) })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input className={input} type="number" min={0} value={roll.width ?? ''} onChange={(e) => update(i, { width: Number(e.target.value) })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input className={input} type="number" min={0} step="0.001" value={roll.length ?? ''} onChange={(e) => update(i, { length: Number(e.target.value) })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input className={input} type="number" min={0} step="0.001" value={roll.weight ?? ''} onChange={(e) => update(i, { weight: Number(e.target.value) })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input className={input} placeholder="B-01" value={roll.batch ?? ''} onChange={(e) => update(i, { batch: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input className={input} placeholder="L-01" value={roll.lot ?? ''} onChange={(e) => update(i, { lot: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input className={input} placeholder="Auto / scan" value={roll.barcode ?? ''} onChange={(e) => update(i, { barcode: e.target.value })} />
                  </td>
                  {poItems?.length ? (
                    <td className="px-2 py-1.5">
                      <Select className={input} value={roll.purchaseOrderItemId ?? ''} onChange={(e) => update(i, { purchaseOrderItemId: e.target.value || undefined })}>
                        <option value="">Unassigned</option>
                        {poItems.map((o) => (
                          <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                      </Select>
                    </td>
                  ) : null}
                  <td className="px-2 py-1.5">
                    <Select className={input} value={roll.condition} onChange={(e) => update(i, { condition: e.target.value })}>
                      <option value={RollCondition.GOOD}>Good</option>
                      <option value={RollCondition.DAMAGED}>Damaged</option>
                    </Select>
                  </td>
                  <td className="px-2 py-1.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeRow(i)} aria-label="Remove roll">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus /> Add roll
        </Button>
        <span className="text-xs text-muted-foreground">
          Damaged rolls are excluded from the PO received quantity automatically.
        </span>
      </div>
    </div>
  );
}
