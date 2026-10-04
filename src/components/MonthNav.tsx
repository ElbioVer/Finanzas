import { useApp } from '../context';
import { addMonthsYm, monthLabel } from '../lib/dates';
import { Icon } from './Icon';

export function MonthNav({ eyebrow }: { eyebrow: string }) {
  const { ym, setYm } = useApp();
  return (
    <div>
      <div className="eyebrow">{eyebrow}</div>
      <div className="month">
        <button aria-label="Mes anterior" onClick={() => setYm(addMonthsYm(ym, -1))}><Icon name="left" size={16} /></button>
        <h1>{monthLabel(ym)}</h1>
        <button aria-label="Mes siguiente" onClick={() => setYm(addMonthsYm(ym, 1))}><Icon name="right" size={16} /></button>
      </div>
    </div>
  );
}
