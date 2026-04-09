import type { Metadata } from "next";
import TalentBookings from "@/features/talent/TalentBookings";

export const metadata: Metadata = { title: "My Bookings — Brisa Digital" };

export default function TalentBookingsPage() {
  return <TalentBookings />;
}
