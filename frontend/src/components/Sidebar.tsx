"use client";
// src/components/Sidebar.tsx
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Upload, FileText, Zap } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/upload",    label: "Upload",    icon: Upload },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>Doc<span>Flow</span></h1>
        <p>Async Document Processor</p>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`nav-link ${pathname.startsWith(href) ? "active" : ""}`}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <Zap size={12} style={{ color: "var(--accent)" }} />
          <span style={{ color: "var(--accent)", fontWeight: 600 }}>Powered by Celery + Redis</span>
        </div>
        <div>FastAPI · PostgreSQL · Next.js</div>
      </div>
    </aside>
  );
}
