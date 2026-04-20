import { createServerClient } from "@/lib/supabase";
import { validateBookingStatus } from "@/lib/bookingStatus";

export async function syncBooking(
  supabase: ReturnType<typeof createServerClient>,
  contract: { talent_id: string; agency_id: string; job_id: string | null; booking_id?: string | null },
  newStatus: string,
) {
  const validationErr = validateBookingStatus(newStatus);
  if (validationErr) throw new Error(`syncBooking: ${validationErr}`);

  // Primary path: direct FK match — exact and safe
  if (contract.booking_id) {
    await supabase
      .from("bookings")
      .update({ status: newStatus })
      .eq("id", contract.booking_id);
    return;
  }

  // Legacy fallback: composite-key join for contracts created before booking_id was populated
  let q = supabase
    .from("bookings")
    .update({ status: newStatus })
    .eq("talent_user_id", contract.talent_id)
    .eq("agency_id", contract.agency_id);

  if (contract.job_id) {
    q = (q as any).eq("job_id", contract.job_id);
  } else {
    q = (q as any).is("job_id", null);
  }

  await q;
}
