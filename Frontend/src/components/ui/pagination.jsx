/**
 * TablePagination – shared pagination bar used on every table page.
 *
 * Usage:
 *   const PAGE_SIZE = 10;
 *   const [page, setPage] = useState(1);
 *   const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
 *   const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
 *   ...
 *   <TablePagination page={page} totalPages={totalPages}
 *                    total={filtered.length} pageSize={PAGE_SIZE}
 *                    onPageChange={setPage} />
 *
 * Renders nothing when totalPages <= 1.
 * Shows at most 5 page buttons centred on the current page, with ellipsis.
 */
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { Button } from "@/components/ui/button";

export function TablePagination({ page, totalPages, total, pageSize, onPageChange }) {
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, total);

  // Build visible page range (±2 around current, clamped)
  const delta = 2;
  const range = [];
  for (
    let i = Math.max(1, page - delta);
    i <= Math.min(totalPages, page + delta);
    i++
  ) range.push(i);

  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">
        {from}–{to} of {total}
      </p>

      <div className="flex items-center gap-1">
        {/* Prev */}
        <Button
          variant="outline" size="sm" className="h-8 w-8 p-0"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          <FiChevronLeft className="h-4 w-4" />
        </Button>

        {/* First page + leading ellipsis */}
        {range[0] > 1 && (
          <>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-xs"
              onClick={() => onPageChange(1)}>1</Button>
            {range[0] > 2 && (
              <span className="px-1 text-xs text-muted-foreground">…</span>
            )}
          </>
        )}

        {/* Visible pages */}
        {range.map((pg) => (
          <Button
            key={pg}
            variant={pg === page ? "default" : "outline"}
            size="sm" className="h-8 w-8 p-0 text-xs"
            onClick={() => onPageChange(pg)}
          >
            {pg}
          </Button>
        ))}

        {/* Trailing ellipsis + last page */}
        {range[range.length - 1] < totalPages && (
          <>
            {range[range.length - 1] < totalPages - 1 && (
              <span className="px-1 text-xs text-muted-foreground">…</span>
            )}
            <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-xs"
              onClick={() => onPageChange(totalPages)}>{totalPages}</Button>
          </>
        )}

        {/* Next */}
        <Button
          variant="outline" size="sm" className="h-8 w-8 p-0"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
        >
          <FiChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
