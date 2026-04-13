"use client";
import Sidebar from "@/components/Sidebar";
import { ToastProvider } from "@/components/Toast";

export default function DocumentDetailLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="layout">
        <Sidebar />
        <main className="main-content">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
