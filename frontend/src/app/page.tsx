// src/app/page.tsx
// Root page — redirect to dashboard
import { redirect } from "next/navigation";
export default function Home() {
  redirect("/dashboard");
}
