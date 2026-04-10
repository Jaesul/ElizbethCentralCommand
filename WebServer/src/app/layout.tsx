import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";
import { AppNav } from "~/components/AppNav";
import { FlowConnectionProvider } from "~/components/FlowConnectionProvider";
import { ToastProvider } from "~/components/ui/use-toast";
import { Toaster } from "~/components/ui/toaster";

export const metadata: Metadata = {
  title: {
    default: "Bean Pounder",
    template: "%s · Bean Pounder",
  },
  description:
    "Dial espresso profiles, pick beans and recipes, and log shots with live machine telemetry.",
  icons: [
    { rel: "icon", url: "/bean-pounder-logo.svg", type: "image/svg+xml" },
  ],
  appleWebApp: {
    capable: true,
    title: "Bean Pounder",
    statusBarStyle: "black-translucent",
  },
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body>
        <ToastProvider>
          <FlowConnectionProvider>
            <AppNav />
            {children}
          </FlowConnectionProvider>
          <Toaster />
        </ToastProvider>
      </body>
    </html>
  );
}
