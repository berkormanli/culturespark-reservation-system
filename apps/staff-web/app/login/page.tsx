"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState, Suspense } from "react";
import { useAuth } from "../../components/auth-context";
import { ApiClientError } from "../../lib/api";

function LoginContent() {
  const router = useRouter();
  const { status, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/calendar");
    }
  }, [router, status]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);
    try {
      await login({ email, password });
      router.replace("/calendar");
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.code === "INVALID_CREDENTIALS"
      ) {
        setErrorMessage("Hatalı e‑posta veya şifre");
      } else {
        setErrorMessage("Şu anda giriş yapılamıyor. Lütfen daha sonra tekrar deneyiniz.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="font-display bg-background-light dark:bg-background-dark min-h-screen flex items-center justify-center p-4 overflow-hidden relative">
      {/* Background Decoration (Abstract Shapes) */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <main className="relative w-full max-w-md">
        {/* Salon Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white dark:bg-zinc-900 rounded-xl shadow-sm mb-4 border border-zinc-100 dark:border-zinc-800">
            <span className="material-icons text-primary text-4xl">content_cut</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">Yönetici Girişi</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 text-sm">Çoklu şube yönetim sistemine hoş geldiniz</p>
        </div>

        {/* Login Card */}
        <div className="bg-white dark:bg-zinc-900 shadow-xl shadow-zinc-200/50 dark:shadow-none rounded-xl p-8 border border-zinc-100 dark:border-zinc-800">
          {/* Error Alert Box */}
          {errorMessage ? (
            <div className="mb-6 flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 rounded-lg text-red-600 dark:text-red-400">
              <span className="material-icons text-xl">error_outline</span>
              <p className="text-sm font-medium">{errorMessage}</p>
            </div>
          ) : null}

          <form className="space-y-5" onSubmit={onSubmit}>
            {/* Email Field */}
            <div>
              <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5" htmlFor="email">
                E-posta Adresi
              </label>
              <div className="relative">
                <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-xl">mail_outline</span>
                <input
                  className="w-full pl-11 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                  id="email"
                  name="email"
                  placeholder="admin@culturespark.com"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300" htmlFor="password">
                  Şifre
                </label>
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline transition-all"
                  onClick={() => {}}
                >
                  Şifremi Unuttum
                </button>
              </div>
              <div className="relative">
                <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-xl">lock_open</span>
                <input
                  className="w-full pl-11 pr-12 py-2.5 bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                  id="password"
                  name="password"
                  placeholder="••••••••"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <span className="material-icons text-xl">
                    {showPassword ? "visibility" : "visibility_off"}
                  </span>
                </button>
              </div>
            </div>

            {/* Login Button */}
            <button
              className="w-full bg-primary hover:opacity-90 text-zinc-900 font-bold py-3 px-4 rounded-lg shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
              type="submit"
              disabled={isSubmitting}
            >
              <span>{isSubmitting ? "Giriş Yapılıyor..." : "Giriş Yap"}</span>
              <span className="material-icons text-lg">login</span>
            </button>
          </form>

          {/* Bottom Support Info */}
          <div className="mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800 text-center">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Hesabınıza erişemiyor musunuz?{" "}
              <button type="button" className="text-zinc-700 dark:text-zinc-200 font-semibold hover:text-primary transition-colors">
                Destek birimiyle iletişime geçin.
              </button>
            </p>
          </div>
        </div>

        {/* System Status/Version */}
        <div className="mt-8 text-center flex flex-col gap-1">
          <p className="text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-500 font-bold">CultureSpark Staff Web v1.0.0</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Tüm sistemler çalışıyor</span>
          </div>
        </div>
      </main>

      {/* Visual Element: Salon Background Image (Subtle Overlay) */}
      <div className="fixed inset-0 z-[-1] opacity-5 dark:opacity-[0.03]">
        <img
          alt="Luxury Hair Salon Interior"
          className="w-full h-full object-cover"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuAzX5RDELVLpIAvJSrVoYaWbR8pOgO3dzjJZu7aJAcq75W87CLRbrEoAKt4gFKazq1c5SUFlrdD6aKMrKWlf2txrdDEmEmKbMzpRYZhU7eYCqQybhc77DqGbnjkTIK7p-mjCwIBUB8d1ImOZOWTWPERZkcZZ56OlLaKKOay6H7f-DR1MHanVxH-pSk-GcA8yCR-4w0D1JdR2HBA99mUys6wTbb-KiMo_zemsOiV2UE76aW9QBnyXRVOKX3WFWSa7aQW9t6nSxJ2-RJc"
        />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
