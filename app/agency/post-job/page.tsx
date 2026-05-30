import type { Metadata } from "next";
import PostJobForm from "@/features/agency/PostJobForm";

export const metadata: Metadata = { title: "Post Job — BrisaHub" };

export default function PostJobPage() {
  return <PostJobForm />;
}
