import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use — BrisaHub",
};

const termsSections = [
  {
    title: "1. Definições",
    paragraphs: [
      "Para fins destes Termos:",
      "BrisaHub: plataforma digital que conecta agências e talentos para divulgação de vagas, candidaturas, contratação, reserva de valores, liberação de pagamentos e gestão de saques.",
      "Agência: usuário pessoa física ou jurídica que publica vagas, contrata talentos e realiza pagamentos dentro da plataforma.",
      "Talento: usuário que cria perfil profissional, candidata-se a vagas, aceita contratos e recebe pagamentos por trabalhos realizados.",
      "Usuário: qualquer pessoa cadastrada na plataforma, incluindo agências e talentos.",
      "Carteira: saldo interno do usuário dentro da plataforma, utilizado para depósitos, reservas, pagamentos, recebimentos e saques.",
      "Reserva ou custódia: valor separado da carteira da agência para garantir o pagamento de uma contratação até sua liberação.",
      "Asaas: provedor externo utilizado para processamento de pagamentos, cobranças, depósitos via PIX, assinaturas e transferências via PIX.",
      "Contrato: acordo criado dentro da plataforma entre agência e talento para execução de determinado trabalho.",
    ],
  },
  {
    title: "2. Sobre a BrisaHub",
    paragraphs: [
      "A BrisaHub atua como uma plataforma de intermediação entre agências e talentos.",
      "A BrisaHub não é empregadora dos talentos, não representa automaticamente as agências e não garante a execução perfeita dos serviços contratados. A relação de trabalho, entrega, presença, conduta, negociação e cumprimento do serviço ocorre entre agência e talento.",
      "A BrisaHub fornece ferramentas para facilitar:",
    ],
    bullets: [
      "publicação de vagas;",
      "candidatura de talentos;",
      "envio e assinatura de contratos;",
      "reserva de valores;",
      "liberação de pagamentos;",
      "registro de histórico;",
      "saque de valores via PIX;",
      "gestão de planos e assinaturas.",
    ],
  },
  {
    title: "3. Cadastro de usuários",
    paragraphs: [
      "Para utilizar a plataforma, o usuário deverá criar uma conta e fornecer informações verdadeiras, atualizadas e completas.",
      "A BrisaHub poderá solicitar dados como:",
    ],
    bullets: [
      "nome completo;",
      "nome da agência;",
      "nome do responsável;",
      "CPF ou CNPJ;",
      "telefone;",
      "e-mail;",
      "cidade e estado;",
      "chave PIX;",
      "dados profissionais;",
      "imagem de perfil;",
      "informações necessárias para pagamentos e saques.",
    ],
    trailingParagraphs: [
      "O usuário é responsável por manter seus dados atualizados.",
      "A BrisaHub poderá suspender, limitar ou encerrar contas que contenham informações falsas, incompletas, fraudulentas ou utilizadas de forma irregular.",
    ],
  },
  {
    title: "4. Conta da agência",
    paragraphs: [
      "A agência poderá utilizar a plataforma para publicar vagas, analisar talentos, enviar contratos, confirmar reservas e liberar pagamentos.",
      "A agência declara que:",
    ],
    bullets: [
      "possui autorização para contratar talentos;",
      "fornecerá informações corretas sobre a vaga;",
      "respeitará as condições acordadas com o talento;",
      "manterá saldo suficiente para confirmar reservas;",
      "não utilizará a plataforma para atividades ilegais, abusivas, fraudulentas ou discriminatórias.",
    ],
    trailingParagraphs: [
      "A agência é responsável pelas informações publicadas em suas vagas, pelos contratos enviados e pela liberação correta dos pagamentos após a execução do trabalho.",
    ],
  },
  {
    title: "5. Conta do talento",
    paragraphs: [
      "O talento poderá criar seu perfil, candidatar-se a vagas, aceitar contratos, receber valores em sua carteira e solicitar saque via PIX.",
      "O talento declara que:",
    ],
    bullets: [
      "as informações do seu perfil são verdadeiras;",
      "possui capacidade para executar os trabalhos aos quais se candidata;",
      "cumprirá os horários, locais e condições aceitas;",
      "manterá sua chave PIX correta e atualizada;",
      "não utilizará a plataforma para fraudes, dados falsos ou condutas indevidas.",
    ],
    trailingParagraphs: [
      "A BrisaHub não se responsabiliza por erros de saque causados por chave PIX incorreta informada pelo talento.",
    ],
  },
  {
    title: "6. Planos da agência",
    paragraphs: [
      "A BrisaHub poderá oferecer planos gratuitos e pagos para agências.",
      "Os planos podem variar em:",
    ],
    bullets: [
      "quantidade de vagas;",
      "limite de contratações;",
      "comissão da plataforma;",
      "recursos de visibilidade;",
      "acesso a histórico;",
      "ferramentas adicionais.",
    ],
    trailingParagraphs: [
      "Os valores, benefícios e condições de cada plano serão exibidos dentro da plataforma.",
      "A BrisaHub poderá alterar planos, valores e benefícios, mediante comunicação ou atualização na plataforma, respeitando eventuais cobranças já realizadas quando aplicável.",
    ],
  },
  {
    title: "7. Plano gratuito",
    paragraphs: [
      "O plano gratuito poderá permitir o uso limitado da plataforma.",
      "Quando disponível, o plano gratuito poderá permitir que a agência publique e conclua uma vaga dentro dos limites definidos pela BrisaHub.",
      "Após atingir o limite do plano gratuito, a agência poderá precisar contratar um plano pago para continuar publicando novas vagas ou acessando recursos adicionais.",
    ],
  },
  {
    title: "8. Assinaturas e cobranças de planos",
    paragraphs: [
      "Os planos pagos poderão ser cobrados de forma recorrente, mensal ou conforme informado na plataforma.",
      "A cobrança será processada por meio do provedor de pagamento integrado, atualmente o Asaas.",
      "Ao contratar um plano pago, a agência autoriza a cobrança do valor correspondente ao plano escolhido.",
      "A renovação, vencimento, histórico de cobranças e comprovantes poderão ser exibidos na área de billing ou plano da agência.",
      "Caso uma cobrança seja recusada, cancelada, contestada ou não confirmada, a BrisaHub poderá suspender, limitar ou rebaixar o acesso ao plano até a regularização.",
    ],
  },
  {
    title: "9. Depósitos na carteira",
    paragraphs: [
      "A agência poderá adicionar saldo à sua carteira por meio dos métodos disponíveis na plataforma, como PIX via Asaas.",
      "O saldo será creditado na carteira após confirmação do pagamento pelo provedor de pagamento.",
      "A BrisaHub poderá exibir o depósito como pendente até receber a confirmação do provedor.",
      "A agência deve verificar os dados antes de realizar pagamentos. A BrisaHub não se responsabiliza por pagamentos realizados fora dos canais oficiais da plataforma.",
    ],
  },
  {
    title: "10. Reserva de valores e custódia",
    paragraphs: [
      "Para confirmar uma contratação, a agência deverá possuir saldo suficiente em sua carteira.",
      "Ao confirmar a reserva, o valor correspondente será separado da carteira da agência para garantir o pagamento do talento.",
      "A reserva não significa pagamento imediato ao talento. O valor será liberado após a etapa de pagamento ou conclusão definida na plataforma.",
      "A agência não poderá utilizar saldo já reservado para outras finalidades até que a contratação seja concluída, cancelada ou resolvida conforme as regras da plataforma.",
    ],
  },
  {
    title: "11. Pagamento ao talento",
    paragraphs: [
      "Após a execução do trabalho ou conforme o fluxo definido na plataforma, a agência poderá liberar o pagamento ao talento.",
      "Quando o pagamento for liberado:",
    ],
    bullets: [
      "a comissão da plataforma será calculada conforme o plano da agência;",
      "o valor líquido será creditado na carteira do talento;",
      "o valor da comissão será registrado como receita da plataforma;",
      "o histórico da operação será registrado.",
    ],
    trailingParagraphs: [
      "A BrisaHub poderá manter registros financeiros e operacionais para fins de auditoria, suporte, prevenção a fraude e cumprimento legal.",
    ],
  },
  {
    title: "12. Comissão da plataforma",
    paragraphs: [
      "A BrisaHub poderá cobrar comissão sobre contratações realizadas dentro da plataforma.",
      "A comissão pode variar conforme o plano da agência.",
      "Exemplos de comissão, quando aplicável:",
    ],
    bullets: [
      "plano gratuito: percentual maior;",
      "plano Pro: percentual reduzido;",
      "plano Premium: percentual conforme informado na plataforma.",
    ],
    trailingParagraphs: [
      "A comissão aplicável será exibida antes ou durante o fluxo de contratação/pagamento.",
      "A BrisaHub poderá alterar percentuais de comissão para novos contratos ou novos planos, mediante atualização na plataforma.",
    ],
  },
  {
    title: "13. Saques via PIX",
    paragraphs: [
      "O talento poderá solicitar saque do saldo disponível em sua carteira para uma chave PIX cadastrada.",
      "A agência também poderá solicitar saque de saldo disponível, quando essa funcionalidade estiver habilitada.",
      "O saque será processado pelo provedor de pagamento integrado, atualmente Asaas.",
      "O usuário é responsável por informar uma chave PIX válida e pertencente ao titular correto.",
      "A BrisaHub poderá bloquear ou revisar saques em caso de:",
    ],
    bullets: [
      "suspeita de fraude;",
      "dados incorretos;",
      "inconsistência cadastral;",
      "ordem judicial;",
      "exigência do provedor de pagamento;",
      "pendências na conta;",
      "necessidade de verificação adicional.",
    ],
    trailingParagraphs: [
      "O prazo de recebimento pode depender do provedor de pagamento, do sistema PIX e de verificações de segurança.",
    ],
  },
  {
    title: "14. Taxas externas",
    paragraphs: [
      "O provedor de pagamento poderá cobrar taxas por cobranças, transferências, notificações, cartões, PIX ou outros serviços.",
      "Essas taxas poderão ser absorvidas pela BrisaHub ou repassadas ao usuário, conforme regra exibida na plataforma.",
      "A BrisaHub poderá ajustar regras de repasse de taxas conforme custos operacionais, condições comerciais ou alterações do provedor de pagamento.",
    ],
  },
  {
    title: "15. Cancelamentos",
    paragraphs: [
      "Cancelamentos de vagas, reservas, contratos ou pagamentos poderão seguir regras específicas exibidas na plataforma.",
      "A BrisaHub poderá impedir o cancelamento automático quando houver:",
    ],
    bullets: [
      "contrato já aceito;",
      "reserva confirmada;",
      "pagamento já liberado;",
      "saque em processamento;",
      "disputa aberta;",
      "suspeita de fraude;",
      "obrigação pendente entre as partes.",
    ],
    trailingParagraphs: [
      "Quando houver pagamento já realizado ou valor em custódia, o cancelamento poderá exigir análise manual.",
    ],
  },
  {
    title: "16. Disputas",
    paragraphs: [
      "Caso agência e talento discordem sobre a execução do trabalho, pagamento, presença, entrega ou condições do contrato, poderão acionar suporte ou abrir disputa, se essa funcionalidade estiver disponível.",
      "A BrisaHub poderá analisar informações registradas na plataforma, como:",
    ],
    bullets: [
      "dados da vaga;",
      "contrato;",
      "mensagens ou registros disponíveis;",
      "status da reserva;",
      "histórico de pagamentos;",
      "comprovantes;",
      "datas e horários.",
    ],
    trailingParagraphs: [
      "A BrisaHub poderá tomar medidas administrativas razoáveis, como manter valores em custódia, liberar pagamento, cancelar operação, bloquear conta ou solicitar documentos adicionais.",
    ],
  },
  {
    title: "17. Responsabilidades da agência",
    paragraphs: [
      "A agência é responsável por:",
    ],
    bullets: [
      "publicar informações corretas;",
      "contratar talentos de forma ética e legal;",
      "respeitar condições combinadas;",
      "manter saldo suficiente;",
      "liberar pagamentos quando devidos;",
      "não discriminar usuários;",
      "não solicitar serviços ilegais;",
      "não tentar burlar a plataforma.",
    ],
    trailingParagraphs: [
      "A agência não deve realizar pagamentos por fora da plataforma quando a contratação tiver sido iniciada dentro da BrisaHub, salvo autorização expressa da BrisaHub.",
    ],
  },
  {
    title: "18. Responsabilidades do talento",
    paragraphs: [
      "O talento é responsável por:",
    ],
    bullets: [
      "manter perfil verdadeiro;",
      "comparecer ao trabalho aceito;",
      "cumprir o serviço acordado;",
      "informar dados corretos;",
      "cadastrar chave PIX correta;",
      "respeitar a agência e as regras da plataforma;",
      "não aceitar trabalhos que não possa executar;",
      "não tentar burlar a plataforma.",
    ],
  },
  {
    title: "19. Condutas proibidas",
    paragraphs: [
      "É proibido utilizar a BrisaHub para:",
    ],
    bullets: [
      "fraude;",
      "lavagem de dinheiro;",
      "dados falsos;",
      "golpes;",
      "contratação de atividades ilegais;",
      "assédio;",
      "discriminação;",
      "violação de direitos de terceiros;",
      "spam;",
      "tentativa de invasão;",
      "uso automatizado não autorizado;",
      "manipulação de avaliações, pagamentos ou convites;",
      "contornar comissões ou pagamentos da plataforma.",
    ],
    trailingParagraphs: [
      "A violação destas regras poderá resultar em suspensão, bloqueio, retenção de valores para análise, encerramento de conta e comunicação às autoridades quando necessário.",
    ],
  },
  {
    title: "20. Dados pessoais e privacidade",
    paragraphs: [
      "A BrisaHub poderá tratar dados pessoais necessários para cadastro, operação da plataforma, pagamentos, prevenção a fraude, suporte, segurança e cumprimento de obrigações legais.",
      "Os dados poderão incluir informações cadastrais, documentos, dados de contato, dados de pagamento, histórico de uso, registros de contratação, chaves PIX e informações técnicas de acesso.",
      "A BrisaHub deverá tratar os dados de acordo com a legislação aplicável, incluindo a Lei Geral de Proteção de Dados Pessoais.",
      "O usuário poderá solicitar informações sobre seus dados, correção, atualização ou exclusão, observados os limites legais e a necessidade de manutenção de registros financeiros, antifraude, auditoria e cumprimento de obrigação legal.",
      "A exclusão da conta não implica exclusão imediata de todos os registros, especialmente registros financeiros, fiscais, transacionais, contratuais ou necessários para defesa de direitos.",
    ],
  },
  {
    title: "21. Segurança da conta",
    paragraphs: [
      "O usuário é responsável por manter a confidencialidade de sua senha e acesso.",
      "A BrisaHub não se responsabiliza por danos causados por compartilhamento de senha, acesso indevido por culpa do usuário ou uso de dispositivos inseguros.",
      "O usuário deverá comunicar imediatamente qualquer suspeita de uso não autorizado de sua conta.",
    ],
  },
  {
    title: "22. Alteração de senha e dados de perfil",
    paragraphs: [
      "O usuário poderá alterar senha e dados de perfil pelos meios disponíveis na plataforma.",
      "As informações salvas no perfil permanecerão registradas até que o usuário as altere, salvo em casos de correção técnica, exigência legal, moderação, segurança ou solicitação válida do próprio usuário.",
    ],
  },
  {
    title: "23. Exclusão de conta",
    paragraphs: [
      "O usuário poderá solicitar a exclusão ou desativação de sua conta.",
      "A exclusão poderá ser bloqueada enquanto houver:",
    ],
    bullets: [
      "saldo em carteira;",
      "saque pendente;",
      "reserva ativa;",
      "contrato pendente;",
      "pagamento em processamento;",
      "disputa;",
      "obrigação financeira;",
      "ação necessária em vaga ou contratação.",
    ],
    trailingParagraphs: [
      "Antes de excluir a conta, o usuário deverá finalizar pendências e sacar o saldo disponível.",
      "A BrisaHub poderá manter registros necessários para auditoria, segurança, prevenção a fraude, cumprimento legal e defesa de direitos.",
    ],
  },
  {
    title: "24. Suspensão ou encerramento pela BrisaHub",
    paragraphs: [
      "A BrisaHub poderá suspender, limitar ou encerrar contas em caso de:",
    ],
    bullets: [
      "violação destes Termos;",
      "suspeita de fraude;",
      "risco financeiro;",
      "uso indevido;",
      "dados falsos;",
      "chargeback;",
      "ordem judicial;",
      "comportamento prejudicial à plataforma ou a outros usuários.",
    ],
    trailingParagraphs: [
      "A BrisaHub poderá bloquear temporariamente valores enquanto investiga suspeitas de fraude, disputa ou irregularidade.",
    ],
  },
  {
    title: "25. Disponibilidade da plataforma",
    paragraphs: [
      "A BrisaHub buscará manter a plataforma disponível, mas não garante funcionamento ininterrupto.",
      "A plataforma poderá ficar indisponível por manutenção, falhas técnicas, indisponibilidade de terceiros, ataques, caso fortuito, força maior ou problemas em provedores externos.",
      "A BrisaHub não se responsabiliza por indisponibilidades causadas por serviços de terceiros, incluindo provedores de pagamento, hospedagem, internet, bancos ou sistema PIX.",
    ],
  },
  {
    title: "26. Provedores terceiros",
    paragraphs: [
      "A BrisaHub utiliza serviços de terceiros para processar pagamentos, autenticação, hospedagem, envio de e-mails e outras funcionalidades.",
      "O uso desses serviços pode estar sujeito aos próprios termos e políticas dos respectivos provedores.",
      "O usuário reconhece que certas operações, como pagamentos, cobranças, assinaturas, transferências e saques, dependem da aprovação e disponibilidade desses terceiros.",
    ],
  },
  {
    title: "27. Comprovantes e registros",
    paragraphs: [
      "A BrisaHub poderá disponibilizar comprovantes internos de operações realizadas na plataforma.",
      "Comprovantes internos servem para consulta e controle dentro da BrisaHub.",
      "Quando aplicável, comprovantes ou registros do provedor de pagamento poderão ser utilizados como referência adicional.",
      "A BrisaHub poderá manter histórico de contratos, reservas, pagamentos, saques, depósitos, assinaturas e ações administrativas para fins de auditoria.",
    ],
  },
  {
    title: "28. Propriedade intelectual",
    paragraphs: [
      "A marca BrisaHub, o sistema, design, código, textos, logos, fluxos, funcionalidades e demais elementos da plataforma pertencem à BrisaHub ou a seus respectivos titulares.",
      "O usuário não pode copiar, reproduzir, vender, explorar, modificar ou distribuir partes da plataforma sem autorização.",
    ],
  },
  {
    title: "29. Conteúdo enviado pelo usuário",
    paragraphs: [
      "O usuário é responsável por todo conteúdo que enviar à plataforma, incluindo fotos, textos, descrições, documentos, currículos, portfólios, contratos e informações profissionais.",
      "O usuário declara possuir direitos ou autorização para utilizar o conteúdo enviado.",
      "A BrisaHub poderá remover conteúdo que viole estes Termos, direitos de terceiros, legislação aplicável ou regras internas.",
    ],
  },
  {
    title: "30. Limitação de responsabilidade",
    paragraphs: [
      "Na máxima extensão permitida pela legislação aplicável, a BrisaHub não será responsável por:",
    ],
    bullets: [
      "descumprimento de obrigação por agência ou talento;",
      "informações falsas enviadas por usuários;",
      "ausência, atraso ou má execução do serviço;",
      "perda causada por dados de pagamento incorretos;",
      "indisponibilidade de provedores terceiros;",
      "bloqueios, recusas ou atrasos do provedor de pagamento;",
      "condutas fora da plataforma;",
      "negociações realizadas por fora da BrisaHub.",
    ],
    trailingParagraphs: [
      "Nada nestes Termos exclui direitos que não possam ser excluídos pela legislação aplicável.",
    ],
  },
  {
    title: "31. Alterações nos Termos",
    paragraphs: [
      "A BrisaHub poderá alterar estes Termos a qualquer momento.",
      "Quando houver alterações relevantes, a BrisaHub poderá comunicar os usuários pela plataforma, e-mail ou outro meio disponível.",
      "O uso contínuo da plataforma após a atualização dos Termos será considerado aceite da nova versão.",
    ],
  },
  {
    title: "32. Contato",
    paragraphs: [
      "Para dúvidas, solicitações ou suporte, o usuário poderá entrar em contato pelo e-mail:",
      "suporte@brisahub.com.br",
      "Caso ainda não exista esse e-mail, substituir pelo canal oficial de atendimento da BrisaHub antes do lançamento.",
    ],
  },
  {
    title: "33. Lei aplicável e foro",
    paragraphs: [
      "Estes Termos serão regidos pelas leis da República Federativa do Brasil.",
      "Fica eleito o foro da comarca competente conforme a legislação aplicável, sem prejuízo de direitos obrigatórios do consumidor quando aplicáveis.",
    ],
  },
  {
    title: "34. Aceite",
    paragraphs: [
      "Ao criar uma conta ou utilizar a BrisaHub, o usuário declara que:",
    ],
    bullets: [
      "leu estes Termos;",
      "compreendeu suas condições;",
      "aceita utilizar a plataforma conforme estas regras;",
      "reconhece que pagamentos e saques dependem de provedores externos;",
      "entende que a BrisaHub atua como plataforma intermediadora entre agências e talentos.",
    ],
  },
];

type TermsSection = (typeof termsSections)[number];

function Section({ section }: { section: TermsSection }) {
  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
        {section.title}
      </h2>

      <div className="mt-5 space-y-4 text-[15px] leading-7 text-zinc-600">
        {section.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}

        {section.bullets && (
          <ul className="space-y-2 pl-5 text-zinc-700">
            {section.bullets.map((item) => (
              <li key={item} className="list-disc">
                {item}
              </li>
            ))}
          </ul>
        )}

        {section.trailingParagraphs?.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}

export default async function TermsPage() {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const lang = cookieStore.get("lang")?.value ?? "pt-BR";
  const isEn = lang === "en";

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-900 sm:px-6 sm:py-14">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
            {isEn ? "Public document" : "Documento público"}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            {isEn ? "Terms of Use and Conditions — BrisaHub" : "Termos de Uso e Condições — BrisaHub"}
          </h1>
          <div className="mt-4 space-y-1 text-sm text-zinc-500">
            <p>{isEn ? "Version 1.0" : "Versão 1.0"}</p>
            <p>{isEn ? "Last updated: May 2026" : "Última atualização: Maio de 2026"}</p>
          </div>
        </header>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="space-y-4 text-[15px] leading-7 text-zinc-600">
            <p>
              Estes Termos de Uso e Condições regulam o acesso e uso da plataforma BrisaHub,
              disponível em brisahub.com.br, por agências, talentos, administradores e demais
              usuários cadastrados.
            </p>
            <p>
              Ao criar uma conta, acessar ou utilizar a BrisaHub, o usuário declara que leu,
              compreendeu e concorda com estes Termos.
            </p>
          </div>
        </section>

        <div className="space-y-4">
          {termsSections.map((section) => (
            <Section key={section.title} section={section} />
          ))}
        </div>
      </div>
    </main>
  );
}
