"use client";

import Link from "next/link";
import { BeanPounderLogo } from "~/components/BeanPounderLogo";

export function AppNav() {
  return (
    <header className="border-b bg-background">
      <nav className="container mx-auto flex max-w-5xl items-center px-4 py-4 xl:max-w-6xl">
        <Link
          href="/"
          className="inline-flex items-center gap-3 text-2xl font-bold tracking-tight transition hover:opacity-80"
        >
          <BeanPounderLogo
            className="aspect-[54/24] h-7 w-auto text-primary"
            aria-hidden
          />
          <span>Bean Pounder</span>
        </Link>
      </nav>
    </header>
  );
}
