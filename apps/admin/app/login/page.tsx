import { login } from "./actions";

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export const metadata = { title: "Login" };

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const hasError = params.error === "1";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-zinc-950">
      <form action={login} className="w-full max-w-sm space-y-5 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-white">Admin Login</h1>
          <p className="text-sm text-zinc-500">Enter the admin secret from your environment.</p>
        </div>

        {hasError && (
          <div className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            Invalid admin secret.
          </div>
        )}

        <label className="block space-y-2">
          <span className="text-sm text-zinc-400">Secret</span>
          <input
            name="secret"
            type="password"
            required
            autoFocus
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-red-500"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-500"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
