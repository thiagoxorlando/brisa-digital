/**
 * Safe query utility helpers — shared across admin pages.
 */

export type PageParams = {
  page: number;     // zero-indexed
  pageSize: number;
};

/**
 * Returns the Supabase .range(from, to) inclusive bounds for a page.
 *
 * @example
 *   const { from, to } = paginationRange({ page: 0, pageSize: 50 });
 *   supabase.from("contracts").select(...).range(from, to);
 */
export function paginationRange(params: PageParams): { from: number; to: number } {
  const page = Math.max(0, Math.floor(params.page));
  const pageSize = Math.max(1, Math.floor(params.pageSize));
  const from = page * pageSize;
  const to = from + pageSize - 1;
  return { from, to };
}

// TODO: Apply pagination to admin tables with large data sets
//   (admin/contracts, admin/bookings, admin/withdrawals, admin/payouts).
//   Currently they fetch the full table — fine for our scale, will need
//   pagination once any single table exceeds a few thousand rows.
