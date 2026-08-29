import { LoginForm } from './login-form.js';

export default function LoginPage() {
  return (
    <main className="mx-auto mt-24 w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="mb-6 text-xl font-semibold">Sign in to SupportOps</h1>
      <LoginForm />
    </main>
  );
}
