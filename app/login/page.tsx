"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, HeartPulse, Leaf, LockKeyhole, ShieldCheck, Sparkles, UserRound } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível entrar.");
      router.replace("/");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível entrar.");
      setLoading(false);
    }
  }

  return <main className="login-shell relative grid min-h-screen overflow-hidden bg-[#f5f8f5] lg:grid-cols-[1.08fr_.92fr]">
    <div className="pointer-events-none absolute -left-32 -top-32 size-[420px] rounded-full bg-[#bad9c8]/35 blur-3xl" />
    <div className="pointer-events-none absolute -bottom-40 right-1/3 size-[480px] rounded-full bg-[#e7d69f]/20 blur-3xl" />

    <section className="relative hidden min-h-screen overflow-hidden bg-gradient-to-br from-[#053b2f] via-[#07533f] to-[#0b7257] p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
      <div className="absolute inset-0 opacity-30 login-pattern" />
      <div className="absolute -right-24 top-20 size-80 rounded-full border border-white/10" />
      <div className="absolute -right-5 top-40 size-56 rounded-full border border-white/10" />
      <div className="relative flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-2xl border border-white/20 bg-white/10 shadow-xl shadow-black/10 backdrop-blur"><Sparkles className="text-[#ead9a5]" /></span>
        <div><p className="font-serif text-2xl font-semibold">Clínica Essência</p><p className="text-sm text-white/55">Cuidado em cada sessão</p></div>
      </div>
      <div className="relative max-w-xl">
        <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white/80 backdrop-blur"><HeartPulse className="size-4 text-[#ead9a5]" /> Gestão clínica inteligente</div>
        <h1 className="font-serif text-5xl font-semibold leading-[1.08] xl:text-6xl">Cuidar de pessoas começa com uma rotina mais leve.</h1>
        <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/65">Pacientes, sessões, pagamentos e agenda organizados em um espaço seguro e elegante.</p>
        <div className="mt-10 flex flex-wrap gap-3 text-sm text-white/75"><span className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3"><ShieldCheck className="size-4 text-[#ead9a5]" /> Dados protegidos</span><span className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3"><Leaf className="size-4 text-[#ead9a5]" /> Simples de usar</span></div>
      </div>
      <p className="relative text-sm text-white/45">Atendimento com propósito · Gestão com tranquilidade</p>
    </section>

    <section className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
      <div className="w-full max-w-[470px]">
        <div className="mb-9 flex items-center gap-3 lg:hidden"><span className="grid size-11 place-items-center rounded-2xl bg-[#07533f] text-[#ead9a5]"><Sparkles /></span><div><p className="font-serif text-xl font-semibold text-[#17352b]">Clínica Essência</p><p className="text-xs text-[#718078]">Cuidado em cada sessão</p></div></div>
        <div className="rounded-[30px] border border-white/80 bg-white/85 p-7 shadow-[0_30px_80px_rgba(20,65,48,.12)] backdrop-blur-xl sm:p-10">
          <span className="mb-7 grid size-14 place-items-center rounded-2xl bg-[#e7f3ec] text-[#07533f]"><LockKeyhole className="size-6" /></span>
          <p className="text-sm font-semibold uppercase tracking-[.18em] text-[#9b7b3f]">Área exclusiva</p>
          <h2 className="mt-2 font-serif text-4xl font-semibold text-[#17352b]">Bem-vinda, Dra. Maria Carolini</h2>
          <p className="mt-3 leading-relaxed text-[#718078]">Entre com seus dados para acessar o painel da clínica.</p>

          <form onSubmit={login} className="mt-8 grid gap-5">
            <label className="grid gap-2 text-sm font-medium text-[#42564d]">Usuário
              <span className="relative"><UserRound className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#8a9991]" /><input name="user" autoComplete="username" required autoFocus placeholder="Digite seu usuário" className="h-14 w-full rounded-2xl border border-[#dce6e0] bg-[#fbfdfb] pl-12 pr-4 outline-none transition focus:border-[#73a791] focus:ring-4 focus:ring-[#dcefe6]" /></span>
            </label>
            <label className="grid gap-2 text-sm font-medium text-[#42564d]">Senha
              <span className="relative"><LockKeyhole className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#8a9991]" /><input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required placeholder="Digite sua senha" className="h-14 w-full rounded-2xl border border-[#dce6e0] bg-[#fbfdfb] pl-12 pr-12 outline-none transition focus:border-[#73a791] focus:ring-4 focus:ring-[#dcefe6]" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#7f8e86]" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}</button></span>
            </label>
            {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            <button disabled={loading} className="mt-1 flex h-14 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#07533f] to-[#087057] font-semibold text-white shadow-lg shadow-[#07533f]/20 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-wait disabled:opacity-70">{loading ? "Entrando..." : <>Entrar no sistema <ArrowRight className="size-5" /></>}</button>
          </form>
          <div className="mt-7 flex items-center justify-center gap-2 text-xs text-[#829089]"><ShieldCheck className="size-4 text-[#4a8b72]" /> Sessão privada e protegida</div>
        </div>
      </div>
    </section>
  </main>;
}
