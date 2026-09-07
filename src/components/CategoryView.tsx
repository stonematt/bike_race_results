import type { CategoryField, CategoryFieldRow } from '@/lib/category.ts';
import { pctBackText } from './roster-wall-view.ts';
import {
  ANCHOR_ROW_ID,
  anchorHeadline,
  listDescription,
  rowDeficit,
  rowMark,
  scopeStatement,
} from './category-view.ts';

/**
 * The crossing's destination (ADR-0002, issue #92): a ranked list anchored on
 * the rider's own row, not a distribution. `docs/adr/0001-description-not-adjudication.md`
 * line, restated here: every fact this component draws — place, percent
 * back, lap deficit, field size — comes verbatim from `CategoryField`
 * (`src/lib/category.ts`), already ranked; this component never re-sorts or
 * re-derives any of it.
 *
 * **Anchored, not scrolled to.** The rider's own row carries the `id`
 * `ANCHOR_ROW_ID` (`src/components/category-view.ts`), and every crossing
 * link that opens this page ends in `#rider` (`categoryHref`,
 * `src/components/roster-wall-view.ts`). A browser scrolls to a URL's own
 * fragment on load, with no client script — the same mechanism an in-page
 * "jump to this row" link at the top of the list also uses, for the rare
 * direct hit that lands here without the fragment. This is what makes the
 * list read identically at both ends of the corpus: 2 riders (`Varsity Girls
 * - South`) or 80 (`HS1 Boys - North`), the rider's row is one native scroll
 * away, never a search through a wall of names.
 *
 * The three states render inline, in the list's own order: a DNF is a row
 * with no numeric place, never a row that is missing. A short-lap rider is
 * NOT a fourth state — NICA orders the rider in the same single sequence as
 * everyone else (issue #111), so the row carries a numeral like anyone
 * else's, with the lap deficit as an annotation beside it, never a chip in
 * place of the numeral. The anchor row and a squad-mate's row are told apart
 * from an ordinary row by more than colour — each carries its own text badge
 * and its own left border, not only a tint.
 */
export type CategoryViewProps = {
  field: CategoryField;
  /** The Rider the crossing was opened for — whose row gets `ANCHOR_ROW_ID`. */
  riderId: number;
};

/* Only DNF gets a chip now (issue #111): a short-lap rider holds a published
 * place, so the row gets the numeral like anyone else, not a chip in its place.
 */
const DNF_CHIP_TONE = 'bg-fg text-bg';

function RowMark({ row }: { row: CategoryFieldRow }) {
  if (row.status === 'dnf') {
    return (
      <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${DNF_CHIP_TONE}`}>
        {rowMark(row)}
      </span>
    );
  }
  return (
    <span className="font-display tabular-nums block w-10 text-right text-lg leading-none">
      {rowMark(row)}
    </span>
  );
}

/** The row's lap deficit, beside its mark — the annotation, never a
 *  replacement for the numeral `RowMark` already drew (issue #111). */
function RowDeficit({ row }: { row: CategoryFieldRow }) {
  const deficit = rowDeficit(row);
  if (deficit === null) return null;
  return <span className="text-muted block text-[10px] leading-none">{deficit}</span>;
}

/** One row of the ranked list. `isAnchor` and `isSquadMate` are mutually
 *  exclusive in the rendering: the anchor row always wins, even though it is
 *  necessarily also a squad-mate's row. */
function Row({ row, isAnchor }: { row: CategoryFieldRow; isAnchor: boolean }) {
  const tone = isAnchor
    ? 'border-l-accent bg-accent/10 border-l-4'
    : row.isSquadMate
      ? 'border-l-navy bg-navy/5 border-l-4'
      : 'border-l-4 border-l-transparent';

  return (
    <li
      id={isAnchor ? ANCHOR_ROW_ID : undefined}
      className={`border-border flex items-center justify-between gap-3 border-b p-2 text-sm ${tone}`}
    >
      <div className="flex items-center gap-3">
        <div>
          <RowMark row={row} />
          <RowDeficit row={row} />
        </div>
        <div>
          <div className="font-semibold">
            {row.displayName}
            {isAnchor ? (
              <span className="bg-accent on-accent ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase">
                This rider
              </span>
            ) : row.isSquadMate ? (
              <span className="bg-navy ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
                Squad
              </span>
            ) : null}
          </div>
          <div className="text-muted text-xs">{row.scoringTeam}</div>
        </div>
      </div>
      <div
        className={
          row.pctBack === null ? 'text-muted text-xs italic' : 'text-accent text-xs font-semibold'
        }
      >
        {pctBackText(row.pctBack)}
      </div>
    </li>
  );
}

export function CategoryView({ field, riderId }: CategoryViewProps) {
  const anchor = field.rows.find((row) => row.riderId === riderId);

  return (
    <div className="mt-6">
      <h1 className="font-display text-3xl tracking-wide uppercase">{field.categoryName}</h1>
      <p className="text-muted mt-1 text-sm">{scopeStatement(field)}</p>

      {anchor ? (
        <div className="border-border bg-surface mt-4 rounded-lg border p-4">
          {/* The rider's name, not a label — so it does not take the
              uppercase/tracked treatment the labels elsewhere on this page
              carry. It replaced a literal "HER RESULT" (issue #112); a
              pronoun could never be right here, and the name says more. */}
          <p className="text-muted text-xs font-bold">{anchor.displayName}</p>
          <p className="font-display mt-1 text-3xl leading-none">
            {anchorHeadline(anchor, field.fieldSize)}
          </p>
          {rowDeficit(anchor) ? (
            <p className="text-muted mt-0.5 text-xs font-semibold">{rowDeficit(anchor)}</p>
          ) : null}
          <p
            className={
              anchor.pctBack === null
                ? 'text-muted mt-1 text-sm italic'
                : 'text-accent mt-1 text-sm font-semibold'
            }
          >
            {pctBackText(anchor.pctBack)}
          </p>
          <a href={`#${ANCHOR_ROW_ID}`} className="text-accent mt-3 inline-block text-xs underline">
            Jump to this row in the list below
          </a>
        </div>
      ) : null}

      <p className="sr-only">{listDescription(field, anchor)}</p>

      <ol className="border-border mt-6 list-none rounded-lg border p-0">
        {field.rows.map((row, i) => (
          <Row
            key={`${row.plate}-${i}`}
            row={row}
            isAnchor={anchor !== undefined && row === anchor}
          />
        ))}
      </ol>
    </div>
  );
}
