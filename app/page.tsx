"use client";

import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserRole } from "@/lib/getUserRole";
import { getAgencyLanding } from "@/lib/getAgencyLanding";
import { PLAN_DEFINITIONS } from "@/lib/plans";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import heroBrandImage from "@/public/landing/brisahub-hero-brand.png";
import dashboardScreenshot from "@/public/landing/dashboard.png";
import financesScreenshot from "@/public/landing/finances.png";
import jobsScreenshot from "@/public/landing/jobs.png";
import talentScreenshot from "@/public/landing/talent.png";

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Crie a vaga com critérios claros",
    description: "Informe perfil, data, cachê, entregáveis e os materiais que a agência precisa avaliar.",
  },
  {
    step: "02",
    title: "Compare candidaturas e indicações",
    description: "Veja talentos interessados, convites enviados e indicações em uma fila simples de acompanhar.",
  },
  {
    step: "03",
    title: "Formalize antes de pagar",
    description: "Confirme a reserva, gere contrato digital e mantenha o valor em custódia até a conclusão.",
  },
  {
    step: "04",
    title: "Recontrate com histórico",
    description: "Consulte trabalhos anteriores, pagamentos e talentos aprovados para acelerar novas campanhas.",
  },
] as const;

const FEATURES = [
  {
    title: "Pagamentos seguros",
    description: "Use custódia para reservar valores, acompanhar o status financeiro e liberar pagamento com mais controle.",
    icon: "M12 3l7 4v5c0 4.5-2.9 8.5-7 9-4.1-.5-7-4.5-7-9V7l7-4z",
  },
  {
    title: "Contratos digitais",
    description: "Registre valor, entrega e aceite para que agência e talento tenham o mesmo combinado.",
    icon: "M7 3h7l4 4v14H7V3zm7 0v5h5M9 13h6M9 17h6M9 9h2",
  },
  {
    title: "Gestão financeira",
    description: "Acompanhe carteira, cobranças, reservas e repasses sem depender de planilhas paralelas.",
    icon: "M4 7h16v10H4V7zm3 4h.01M17 11h.01M8 17v2m8-2v2M7 7V5m10 2V5",
  },
  {
    title: "Indicação de talentos",
    description: "Receba indicações de talentos e identifique a origem de cada oportunidade dentro da vaga.",
    icon: "M17 20v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9.5 10a4 4 0 100-8 4 4 0 000 8zm10.5 10v-2a3 3 0 00-2-2.83M16 3.13a4 4 0 010 7.75",
  },
  {
    title: "Histórico e recontratação",
    description: "Mantenha contexto sobre quem já trabalhou bem com a agência e reduza tempo na próxima contratação.",
    icon: "M4 4v6h6M20 20v-6h-6M5 15a7 7 0 0011.9 3.8M19 9A7 7 0 007.1 5.2",
  },
  {
    title: "Vagas privadas no Premium",
    description: "Convide talentos para oportunidades fechadas e opere um fluxo privado quando a campanha exigir.",
    icon: "M7 11V8a5 5 0 0110 0v3M6 11h12v10H6V11zm6 4v2",
  },
] as const;

const TRUST_PILLARS = [
  {
    title: "Segurança de pagamento",
    description: "O valor pode ficar em custódia durante a reserva e ser liberado apenas após a confirmação do trabalho.",
  },
  {
    title: "Contratos claros",
    description: "Entregas, valores e aceite ficam definidos antes do pagamento, com registro do acordo entre as partes.",
  },
  {
    title: "Transparência e controle",
    description: "Histórico completo, status visível e menos retrabalho para acompanhar cada contratação com contexto.",
  },
] as const;

const BUSINESS_TYPES = [
  "agências de marketing",
  "criadores de conteúdo",
  "produção audiovisual",
  "freelancers criativos",
  "pequenos e médios negócios",
] as const;

const SHOWCASE = [
  {
    eyebrow: "Vagas",
    title: "Gestão de oportunidades",
    description: "Acompanhe vagas, status, valores e candidaturas com uma leitura rápida para o time.",
    image: jobsScreenshot,
    alt: "Tela de lista de vagas da BrisaHub",
    width: jobsScreenshot.width,
    height: jobsScreenshot.height,
  },
  {
    eyebrow: "Financeiro",
    title: "Saldo, depósitos e histórico",
    description: "Visualize carteira, depósitos, custódia e movimentações financeiras em um painel claro.",
    image: financesScreenshot,
    alt: "Tela financeira da agência na BrisaHub",
    width: financesScreenshot.width,
    height: financesScreenshot.height,
  },
  {
    eyebrow: "Talentos",
    title: "Perfis prontos para avaliar",
    description: "Compare profissionais com fotos, tags e contexto para decidir com mais confiança.",
    image: talentScreenshot,
    alt: "Tela de talentos da BrisaHub",
    width: talentScreenshot.width,
    height: talentScreenshot.height,
  },
] as const;

const PLANS = [
  {
    key: "free",
    name: PLAN_DEFINITIONS.free.label,
    price: PLAN_DEFINITIONS.free.priceLabel,
    period: "",
    audience: "Para a primeira vaga",
    summary: "Ideal para testar a plataforma, validar o processo e conduzir uma contratação inicial sem mensalidade.",
    commission: PLAN_DEFINITIONS.free.commissionLabel,
    highlights: ["1 vaga ativa", "Até 3 contratações por vaga", `Comissão de ${PLAN_DEFINITIONS.free.commissionLabel}`],
    featured: false,
    premium: false,
  },
  {
    key: "pro",
    name: PLAN_DEFINITIONS.pro.label,
    price: PLAN_DEFINITIONS.pro.priceLabel,
    period: "/mês",
    audience: "Para contratar com recorrência",
    summary: "O plano principal para agências que publicam vagas com frequência e querem operar com menos atrito e comissão menor.",
    commission: PLAN_DEFINITIONS.pro.commissionLabel,
    highlights: ["Vagas públicas ilimitadas", "Contratações ilimitadas", `Comissão de ${PLAN_DEFINITIONS.pro.commissionLabel}`],
    featured: true,
    premium: false,
  },
  {
    key: "premium",
    name: PLAN_DEFINITIONS.premium.label,
    price: PLAN_DEFINITIONS.premium.priceLabel,
    period: "",
    audience: "Plataforma privada completa",
    summary: "Um ambiente fechado exclusivo para a sua agência — vagas, talentos, contratos e pagamentos operando dentro do seu próprio espaço, sem mistura com o marketplace público.",
    commission: PLAN_DEFINITIONS.premium.commissionLabel,
    highlights: ["Tudo do Pro", "Ambiente 100% privado e fechado", "Vagas apenas para convidados", "Pool de talentos exclusivo da agência"],
    featured: false,
    premium: true,
  },
] as const;

const primaryLink =
  "inline-flex items-center justify-center rounded-2xl bg-[var(--brand-green)] px-6 py-4 text-[15px] font-black text-[var(--brand-surface)] shadow-[0_16px_36px_rgba(72,242,154,0.28)] transition-all hover:-translate-y-0.5 hover:bg-[var(--brand-green-strong)]";

const secondaryDarkLink =
  "inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-6 py-4 text-[15px] font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-white/15";

function CheckIcon({ className = "text-[var(--brand-green)]" }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 flex-shrink-0 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function FeatureIcon({ path }: { path: string }) {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--brand-green)] text-[var(--brand-surface)] shadow-[0_10px_24px_rgba(72,242,154,0.22)]">
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={path} />
      </svg>
    </div>
  );
}

function ScreenshotFrame({
  src,
  alt,
  width,
  height,
  priority = false,
  tone = "dark",
  className = "",
  imageClassName = "",
  sizes,
  aspectRatio,
}: {
  src: string | StaticImageData;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  tone?: "dark" | "light";
  className?: string;
  imageClassName?: string;
  sizes: string;
  aspectRatio?: string;
}) {
  const toneClass =
    tone === "light"
      ? "border-zinc-200/80 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.10)]"
      : "border-white/12 bg-white/[0.04] shadow-[0_18px_42px_rgba(0,0,0,0.18)]";

  return (
    <div
      className={[
        "overflow-hidden rounded-[1.25rem] border p-1.5",
        toneClass,
        className,
      ].join(" ")}
    >
      <div
        className="relative w-full overflow-hidden rounded-[1rem]"
        style={{ aspectRatio: aspectRatio ?? `${width} / ${height}` }}
      >
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          className={[
            "h-full w-full object-cover object-top",
            imageClassName,
          ].join(" ")}
          sizes={sizes}
        />
      </div>
    </div>
  );
}

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-xl lg:mx-0 lg:max-w-2xl lg:justify-self-end">
      <div className="absolute -left-6 top-10 h-40 w-40 rounded-full bg-[var(--brand-green)]/30 blur-3xl lg:-left-10 lg:top-12 lg:h-48 lg:w-48" />
      <div className="absolute -right-6 bottom-8 h-44 w-44 rounded-full bg-white/10 blur-3xl lg:-right-8 lg:bottom-10 lg:h-56 lg:w-56" />
      <div className="relative rounded-[2.1rem] bg-[linear-gradient(135deg,rgba(72,242,154,0.22),rgba(255,255,255,0.10)_42%,rgba(255,255,255,0.03))] p-px shadow-[0_22px_54px_rgba(0,0,0,0.22)]">
        <ScreenshotFrame
          src={dashboardScreenshot}
          alt="Dashboard da agência na BrisaHub"
          width={dashboardScreenshot.width}
          height={dashboardScreenshot.height}
          priority
          className="rounded-[2rem] bg-white/[0.05] backdrop-blur-sm"
          sizes="(min-width: 1024px) 52vw, 94vw"
          aspectRatio={`${dashboardScreenshot.width} / ${dashboardScreenshot.height}`}
        />
      </div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [showRoleMenu, setShowRoleMenu] = useState(false);

  useEffect(() => {
    getUserRole().then(async (role) => {
      if (role === "agency") router.replace(await getAgencyLanding());
      else if (role === "talent") router.replace("/talent/dashboard");
      else setChecking(false);
    });
  }, [router]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-[var(--brand-green)]" />
      </div>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[var(--brand-paper)] text-zinc-950">
      <nav className="sticky top-0 z-20 border-b border-white/10 bg-[var(--brand-surface)]/92 px-5 backdrop-blur-md lg:px-10">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between">
          <Link href="/" aria-label="BrisaHub">
            <span className="text-[15px] font-bold tracking-tight text-white">BrisaHub</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-xl px-3 py-2 text-[13px] font-semibold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              Entrar
            </Link>
            <div className="relative hidden sm:block">
              <button
                onClick={() => setShowRoleMenu((v) => !v)}
                className="rounded-xl bg-[var(--brand-green)] px-4 py-2 text-[13px] font-black text-[var(--brand-surface)] shadow-sm transition-all hover:bg-[var(--brand-green-strong)] cursor-pointer"
              >
                Criar conta
              </button>
              {showRoleMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowRoleMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 z-40 w-48 rounded-2xl border border-white/10 bg-[var(--brand-surface)] shadow-[0_8px_32px_rgba(0,0,0,0.32)] overflow-hidden">
                    <Link
                      href="/signup?role=agency"
                      onClick={() => setShowRoleMenu(false)}
                      className="flex items-center gap-3 px-4 py-3.5 text-[13px] font-semibold text-white hover:bg-white/10 transition-colors"
                    >
                      <span className="w-7 h-7 rounded-lg bg-[var(--brand-green)]/15 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3.5 h-3.5 text-[var(--brand-green)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </span>
                      <div>
                        <p>Agência</p>
                        <p className="text-[11px] font-normal text-zinc-400">Publique vagas e contrate</p>
                      </div>
                    </Link>
                    <div className="h-px bg-white/8 mx-4" />
                    <Link
                      href="/signup?role=talent"
                      onClick={() => setShowRoleMenu(false)}
                      className="flex items-center gap-3 px-4 py-3.5 text-[13px] font-semibold text-white hover:bg-white/10 transition-colors"
                    >
                      <span className="w-7 h-7 rounded-lg bg-[var(--brand-green)]/15 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3.5 h-3.5 text-[var(--brand-green)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </span>
                      <div>
                        <p>Talento</p>
                        <p className="text-[11px] font-normal text-zinc-400">Candidate-se a vagas</p>
                      </div>
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      <section className="relative bg-[var(--brand-surface)] px-5 py-16 text-white sm:py-20 lg:px-10 lg:py-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(72,242,154,0.22),transparent_28%),radial-gradient(circle_at_85%_12%,rgba(255,255,255,0.10),transparent_24%),linear-gradient(180deg,#07110d_0%,#0b1711_70%,#f7f8f2_100%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)] lg:gap-16">
          <div className="mx-auto flex w-full max-w-xl flex-col items-center justify-center text-center lg:max-w-lg">
            <div className="flex justify-center">
              <Image
                src={heroBrandImage}
                alt="Marca BrisaHub"
                width={heroBrandImage.width}
                height={heroBrandImage.height}
                preload
                className="h-auto w-full max-w-[94px] sm:max-w-[112px] lg:max-w-[132px]"
                sizes="(min-width: 1024px) 132px, (min-width: 640px) 112px, 94px"
              />
            </div>

            <h1 className="mt-8 max-w-[11ch] text-[2.35rem] font-black leading-[0.98] tracking-[-0.05em] text-white sm:text-[3rem] lg:text-[4rem]">
              Contrate talentos com segurança.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg sm:leading-8">
              Contratos, pagamentos e gestão em um só lugar para seu negócio contratar com mais controle.
            </p>

            <div className="mt-8 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row sm:justify-center">
              <Link href="/signup?role=agency" className={`${primaryLink} w-full sm:w-auto`}>
                Começar como agência
              </Link>
              <Link href="/signup?role=talent" className={`${secondaryDarkLink} w-full sm:w-auto`}>
                Entrar como talento
              </Link>
            </div>
          </div>

          <ProductPreview />
        </div>
      </section>

      <section className="bg-[var(--brand-paper)] px-5 py-20 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="success" className="uppercase tracking-[0.24em]">Sem WhatsApp. Sem planilhas.</Badge>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] text-zinc-950 sm:text-5xl">
              Um fluxo único para sair do briefing e chegar à contratação
            </h2>
            <p className="mt-5 text-base leading-7 text-zinc-600">
              A Brisa substitui mensagens soltas, planilhas e comprovantes dispersos por um processo estruturado
              para a agência publicar, selecionar, contratar e pagar com mais previsibilidade.
            </p>
          </div>

          <div className="mx-auto mt-16 max-w-2xl text-center">
            <Badge variant="success" className="uppercase tracking-[0.24em]">Como funciona</Badge>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] text-zinc-950 sm:text-5xl">
              Um fluxo claro para conduzir cada contratação
            </h2>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((item) => (
              <Card key={item.step} variant="default" padding="lg" className="group transition-transform duration-200 hover:-translate-y-1">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--brand-surface)] text-sm font-black text-[var(--brand-green)]">
                  {item.step}
                </span>
                <h3 className="mt-6 text-lg font-black text-zinc-950">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-zinc-600">{item.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[var(--brand-surface)] px-5 py-20 text-white lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
            <div className="mx-auto max-w-xl">
              <div className="mb-10 hidden justify-center lg:flex">
                <Image
                  src={heroBrandImage}
                  alt="Marca BrisaHub"
                  width={heroBrandImage.width}
                  height={heroBrandImage.height}
                  className="h-auto w-full max-w-[220px]"
                  sizes="220px"
                />
              </div>
              <Badge variant="muted" className="uppercase tracking-[0.24em]">Recursos principais</Badge>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] sm:text-5xl">
                Tudo o que a agência precisa para contratar com mais segurança
              </h2>
              <p className="mt-5 text-base leading-7 text-zinc-400">
                Da publicação da vaga ao pagamento final, a plataforma mantém contexto, documentos e
                status no mesmo fluxo para a agência não perder tempo em controles paralelos.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {FEATURES.map((feature) => (
                <Card key={feature.title} variant="dark" padding="md" className="bg-white/[0.055]">
                  <FeatureIcon path={feature.icon} />
                  <h3 className="mt-5 text-base font-black text-white">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{feature.description}</p>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[var(--brand-surface)] px-5 pb-20 text-white lg:px-10">
        <div className="mx-auto max-w-7xl">
          <Card
            variant="dark"
            padding="lg"
            className="overflow-hidden rounded-[2rem] bg-[radial-gradient(circle_at_14%_0%,rgba(72,242,154,0.20),transparent_30%),linear-gradient(135deg,var(--brand-surface-soft)_0%,var(--brand-surface)_70%)]"
          >
            <div className="grid gap-10 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
              <div>
                <Badge variant="muted" className="uppercase tracking-[0.24em]">Uso profissional</Badge>
                <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] text-white sm:text-5xl">
                  Contratação segura para diferentes tipos de negócio
                </h2>
                <p className="mt-5 text-base leading-7 text-zinc-400">
                  A BrisaHub substitui processos informais em WhatsApp, planilhas e comprovantes soltos
                  por um fluxo estruturado: da criação da vaga à contratação, contrato e pagamento.
                </p>

                <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5">
                  <p className="text-sm font-black text-white">Para quem é</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Para equipes e profissionais que contratam, indicam ou prestam serviços criativos com frequência.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {BUSINESS_TYPES.map((type) => (
                      <Badge key={type} variant="muted" className="capitalize">
                        {type}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-1">
                {TRUST_PILLARS.map((pillar) => (
                  <Card key={pillar.title} variant="dark" padding="md" className="bg-white/[0.07]">
                    <CheckIcon />
                    <h3 className="mt-4 text-base font-black text-white">{pillar.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">{pillar.description}</p>
                  </Card>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </section>

      <section className="bg-white px-5 pb-20 pt-16 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <Badge variant="success" className="uppercase tracking-[0.24em]">Veja a plataforma em ação</Badge>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] text-zinc-950 sm:text-5xl">
                Uma visão rápida do que a agência acompanha
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-zinc-500">
              Screenshots do produto organizados para mostrar, sem ruído, como a agência acompanha
              vagas, financeiro e talentos no dia a dia.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
            <article className="flex flex-col gap-4">
              <ScreenshotFrame
                tone="light"
                src={SHOWCASE[0].image}
                alt={SHOWCASE[0].alt}
                width={SHOWCASE[0].width}
                height={SHOWCASE[0].height}
                className="bg-white"
                sizes="(min-width: 1024px) 58vw, 92vw"
                aspectRatio={`${SHOWCASE[0].width} / ${SHOWCASE[0].height}`}
              />
              <div className="space-y-2 px-1">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--brand-green)]">
                  {SHOWCASE[0].eyebrow}
                </p>
                <h3 className="text-lg font-black text-zinc-950">{SHOWCASE[0].title}</h3>
                <p className="max-w-2xl text-sm leading-6 text-zinc-600">{SHOWCASE[0].description}</p>
              </div>
            </article>

            <div className="grid gap-6">
              {SHOWCASE.slice(1).map((item) => (
                <article key={item.title} className="flex flex-col gap-4">
                  <ScreenshotFrame
                    tone="light"
                    src={item.image}
                    alt={item.alt}
                    width={item.width}
                    height={item.height}
                    className="bg-white"
                    sizes="(min-width: 1024px) 34vw, 92vw"
                    aspectRatio={`${item.width} / ${item.height}`}
                  />
                  <div className="space-y-2 px-1">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--brand-green)]">
                      {item.eyebrow}
                    </p>
                    <h3 className="text-lg font-black text-zinc-950">{item.title}</h3>
                    <p className="text-sm leading-6 text-zinc-600">{item.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[var(--brand-paper)] px-5 pb-20 pt-24 lg:px-10 lg:pt-28">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="success" className="uppercase tracking-[0.24em]">Planos</Badge>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] text-zinc-950 sm:text-5xl">
              Escolha o plano pelo ritmo da sua operação
            </h2>
            <p className="mt-5 text-base leading-7 text-zinc-600">
              Comece sem mensalidade para validar a primeira vaga, evolua para o Pro quando a agência
              precisar contratar com frequência e use o Premium para processos privados e seleções mais reservadas.
            </p>
          </div>

          <div className="mt-14 grid items-stretch gap-6 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <Card
                key={plan.key}
                variant={plan.premium ? "dark" : "default"}
                padding="lg"
                className={[
                  "relative flex h-full flex-col",
                  plan.featured ? "border-[var(--brand-green)] shadow-[0_24px_70px_rgba(72,242,154,0.20)]" : "",
                  plan.premium ? "bg-[linear-gradient(145deg,var(--brand-surface)_0%,#101c15_58%,#17251d_100%)]" : "",
                ].join(" ")}
              >
                {plan.featured && (
                  <span className="absolute right-5 top-5 rounded-full bg-[var(--brand-green)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-[var(--brand-surface)] shadow-[0_10px_24px_rgba(72,242,154,0.24)]">
                    Mais popular
                  </span>
                )}
                {plan.premium && (
                  <span className="absolute right-5 top-5 rounded-full border border-zinc-600 bg-zinc-800 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-zinc-300">
                    Em breve
                  </span>
                )}
                <div className={plan.featured || plan.premium ? "flex h-full flex-col pt-10" : "flex h-full flex-col"}>
                <p className={plan.premium ? "text-sm font-bold text-zinc-400" : "text-sm font-bold text-zinc-500"}>{plan.audience}</p>
                <h3 className={plan.premium ? "mt-4 text-2xl font-black text-white" : "mt-4 text-2xl font-black text-zinc-950"}>{plan.name}</h3>
                <p className={plan.premium ? "mt-3 text-sm leading-6 text-zinc-400" : "mt-3 text-sm leading-6 text-zinc-600"}>
                  {plan.summary}
                </p>
                <div className="mt-4 flex items-end gap-1">
                  <span className={plan.premium ? "text-4xl font-black tracking-[-0.04em] text-white" : "text-4xl font-black tracking-[-0.04em] text-zinc-950"}>{plan.price}</span>
                  {plan.period && <span className={plan.premium ? "pb-1 text-sm font-semibold text-zinc-400" : "pb-1 text-sm font-semibold text-zinc-500"}>{plan.period}</span>}
                </div>
                {!plan.premium && (
                  <div className="mt-5 rounded-2xl bg-[var(--brand-green-soft)] px-4 py-3 flex items-center justify-between gap-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-800">Comissão da plataforma</p>
                    <p className="text-xl font-black text-zinc-950 flex-shrink-0">{plan.commission}</p>
                  </div>
                )}
                <ul className="mt-6 space-y-3 pb-7">
                  {plan.highlights.map((feature) => (
                    <li key={feature} className={plan.premium ? "flex gap-3 text-sm leading-6 text-zinc-300" : "flex gap-3 text-sm leading-6 text-zinc-600"}>
                      <CheckIcon />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                {plan.premium ? (
                  <span className="mt-auto inline-flex w-full items-center justify-center rounded-2xl px-5 py-3.5 text-sm font-black bg-white/10 text-zinc-400 cursor-not-allowed">
                    Em breve
                  </span>
                ) : (
                  <Link
                    href={`/signup?role=agency&plan=${plan.key}`}
                    className={[
                      "mt-auto inline-flex w-full items-center justify-center rounded-2xl px-5 py-3.5 text-sm font-black transition-all",
                      plan.featured
                        ? "bg-[var(--brand-green)] text-[var(--brand-surface)] hover:bg-[var(--brand-green-strong)]"
                        : "border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
                    ].join(" ")}
                  >
                    Começar com {plan.name}
                  </Link>
                )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-5 py-20 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <Badge variant="success" className="uppercase tracking-[0.24em]">Confiança</Badge>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] text-zinc-950 sm:text-5xl">
              Segurança jurídica e financeira para contratar com mais tranquilidade
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-zinc-600">
              Contrato, pagamento e histórico ficam registrados para a agência ter previsibilidade operacional
              e o talento saber exatamente em que etapa está.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {["Escopo e valores registrados", "Pagamento com status rastreável", "Histórico para decisão e recontratação"].map((item) => (
              <Card key={item} variant="soft" padding="md">
                <CheckIcon />
                <p className="mt-4 text-sm font-black leading-6 text-zinc-800">{item}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[var(--brand-paper)] px-5 py-20 lg:px-10">
        <Card variant="dark" padding="lg" className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[radial-gradient(circle_at_20%_0%,rgba(72,242,154,0.22),transparent_32%),var(--brand-surface)] px-6 py-14 text-center sm:px-10">
          <Badge variant="muted" className="uppercase tracking-[0.24em]">Estruture a próxima contratação</Badge>
          <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-black tracking-[-0.04em] text-white sm:text-5xl">
            Abra sua conta de agência e conduza a próxima vaga com contrato, pagamento seguro e menos retrabalho.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-300">
            Se você contrata com frequência, o Pro já deixa claro o ganho operacional. Se você é talento,
            também pode criar seu perfil para receber convites e acompanhar oportunidades.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/signup?role=agency" className={primaryLink}>
              Começar como agência
            </Link>
            <Link href="/signup?role=talent" className={secondaryDarkLink}>
              Entrar como talento
            </Link>
          </div>
        </Card>
      </section>

      <footer className="border-t border-zinc-900/10 bg-[var(--brand-paper)] px-5 py-7 lg:px-10">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
            <div className="flex items-center justify-center sm:justify-start">
              <span className="text-[13px] font-bold tracking-tight text-zinc-950">BrisaHub</span>
            </div>
            <p className="text-[12px] text-zinc-500">© 2026 BrisaHub. Todos os direitos reservados.</p>
          </div>
      </footer>
    </main>
  );
}
