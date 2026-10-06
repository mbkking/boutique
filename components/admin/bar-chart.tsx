interface BarChartProps {
  title: string;
  points: Array<{ label: string; value: number }>;
  formatValue?: (value: number) => string;
}

/**
 * Graphique � barres minimal, rendu côt� serveur. Pas de librairie externe :
 * les 7/30 points du dashboard ne justifient pas un bundle de charting.
 */
export function BarChart({ title, points, formatValue }: BarChartProps) {
  const max = Math.max(1, ...points.map((point) => point.value));

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <ul className="flex flex-col gap-2">
        {points.map((point) => (
          <li key={point.label} className="flex items-center gap-3">
            <span className="w-12 shrink-0 text-xs text-gray-500">{point.label}</span>
            <div className="h-2.5 flex-1 rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.round((point.value / max) * 100)}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-xs font-medium text-gray-900">
              {formatValue ? formatValue(point.value) : point.value}
            </span>
          </li>
        ))}
      </ul>
      {points.every((point) => point.value === 0) ? (
        <p className="text-xs text-gray-500">Aucune donnée sur la période.</p>
      ) : null}
    </div>
  );
}
