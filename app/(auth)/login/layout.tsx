import { redirectIfSignedIn } from "@/lib/auth";

/**
 * Wraps the three sign-in pages (the chooser, company and employee). Someone
 * already signed in goes home; someone whose token outlived their access —
 * suspended, removed — sees the form instead of looping (see
 * `redirectIfSignedIn`).
 */
export default async function LoginLayout({ children }: LayoutProps<"/login">) {
  await redirectIfSignedIn();
  return children;
}
