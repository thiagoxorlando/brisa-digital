import Link from "next/link";

export default function AccountFrozenPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-10 max-w-md w-full text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-sky-100 flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div>
          <h1 className="text-[1.25rem] font-semibold text-zinc-900 mb-2">Conta suspensa</h1>
          <p className="text-[13px] text-zinc-500 leading-relaxed">
            Sua conta foi temporariamente suspensa. Entre em contato com o suporte da Brisa Digital para mais informações.
          </p>
        </div>
        <Link
          href="/login"
          className="inline-block text-[13px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
        >
          ← Voltar ao login
        </Link>
      </div>
    </div>
  );
}
