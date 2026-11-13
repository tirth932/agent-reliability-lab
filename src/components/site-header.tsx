import Link from "next/link";

const links = [
  { href: "/", label: "Overview" },
  { href: "/playground", label: "Playground" },
  { href: "/results", label: "Results" },
  { href: "/about", label: "About" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-sm font-semibold tracking-tight text-zinc-950">
          Agent Reliability Lab
        </Link>
        <nav className="flex flex-wrap gap-1 text-sm" aria-label="Main">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-md px-2 py-1 text-zinc-700 hover:bg-zinc-100">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function DemoBanner() {
  return (
    <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
      Demo environment: mock data only
    </p>
  );
}
