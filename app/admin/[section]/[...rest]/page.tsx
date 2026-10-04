import { notFound } from "next/navigation";

// Match unknown deeper Admin paths inside app/admin/layout.tsx so their 404 keeps the Admin frame.
export default function UnknownAdminNestedPage() {
  notFound();
}
