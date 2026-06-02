import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use — BrisaHub",
};

// ── Portuguese sections ────────────────────────────────────────────────────────

const ptSections = [
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
    paragraphs: ["A agência é responsável por:"],
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
    paragraphs: ["O talento é responsável por:"],
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
    paragraphs: ["É proibido utilizar a BrisaHub para:"],
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
    paragraphs: ["A BrisaHub poderá suspender, limitar ou encerrar contas em caso de:"],
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
    paragraphs: ["Na máxima extensão permitida pela legislação aplicável, a BrisaHub não será responsável por:"],
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
    paragraphs: ["Ao criar uma conta ou utilizar a BrisaHub, o usuário declara que:"],
    bullets: [
      "leu estes Termos;",
      "compreendeu suas condições;",
      "aceita utilizar a plataforma conforme estas regras;",
      "reconhece que pagamentos e saques dependem de provedores externos;",
      "entende que a BrisaHub atua como plataforma intermediadora entre agências e talentos.",
    ],
  },
];

// ── English sections ───────────────────────────────────────────────────────────

const enSections = [
  {
    title: "1. Definitions",
    paragraphs: [
      "For the purposes of these Terms:",
      "BrisaHub: a digital platform that connects agencies and talents for job posting, applications, hiring, escrow of funds, payment release, and withdrawal management.",
      "Agency: an individual or legal entity that posts jobs, hires talents, and makes payments within the platform.",
      "Talent: a user who creates a professional profile, applies to jobs, accepts contracts, and receives payments for completed work.",
      "User: any person registered on the platform, including agencies and talents.",
      "Wallet: the user's internal balance on the platform, used for deposits, escrow, payments, receipts, and withdrawals.",
      "Escrow or custody: funds set aside from the agency's wallet to guarantee payment to a talent until the payment is released.",
      "Asaas: a third-party provider used for payment processing, billing, PIX deposits, subscriptions, and PIX transfers.",
      "Contract: an agreement created within the platform between an agency and a talent for the performance of a specific job.",
    ],
  },
  {
    title: "2. About BrisaHub",
    paragraphs: [
      "BrisaHub acts as an intermediary platform between agencies and talents.",
      "BrisaHub is not an employer of talents, does not automatically represent agencies, and does not guarantee the perfect execution of contracted services. The working relationship, delivery, attendance, conduct, negotiation, and fulfillment of services occurs between the agency and the talent.",
      "BrisaHub provides tools to facilitate:",
    ],
    bullets: [
      "job posting;",
      "talent applications;",
      "contract sending and signing;",
      "escrow of funds;",
      "payment release;",
      "history records;",
      "PIX withdrawals;",
      "plan and subscription management.",
    ],
  },
  {
    title: "3. User registration",
    paragraphs: [
      "To use the platform, the user must create an account and provide accurate, up-to-date, and complete information.",
      "BrisaHub may request information such as:",
    ],
    bullets: [
      "full name;",
      "agency name;",
      "responsible person's name;",
      "CPF or CNPJ (Brazilian tax IDs) or equivalent;",
      "phone number;",
      "email address;",
      "city and state;",
      "PIX key;",
      "professional information;",
      "profile picture;",
      "information required for payments and withdrawals.",
    ],
    trailingParagraphs: [
      "The user is responsible for keeping their information up to date.",
      "BrisaHub may suspend, limit, or close accounts that contain false, incomplete, fraudulent, or irregularly used information.",
    ],
  },
  {
    title: "4. Agency account",
    paragraphs: [
      "The agency may use the platform to post jobs, review talents, send contracts, confirm bookings, and release payments.",
      "The agency declares that:",
    ],
    bullets: [
      "it has authorization to hire talents;",
      "it will provide accurate information about the job;",
      "it will respect the conditions agreed with the talent;",
      "it will maintain sufficient balance to confirm bookings;",
      "it will not use the platform for illegal, abusive, fraudulent, or discriminatory activities.",
    ],
    trailingParagraphs: [
      "The agency is responsible for the information published in its job postings, the contracts sent, and the correct release of payments after the work is completed.",
    ],
  },
  {
    title: "5. Talent account",
    paragraphs: [
      "The talent may create their profile, apply to jobs, accept contracts, receive funds in their wallet, and request PIX withdrawals.",
      "The talent declares that:",
    ],
    bullets: [
      "the information on their profile is truthful;",
      "they have the ability to perform the jobs they apply for;",
      "they will comply with the agreed schedules, locations, and conditions;",
      "they will keep their PIX key accurate and up to date;",
      "they will not use the platform for fraud, false information, or improper conduct.",
    ],
    trailingParagraphs: [
      "BrisaHub is not responsible for withdrawal errors caused by an incorrect PIX key provided by the talent.",
    ],
  },
  {
    title: "6. Agency plans",
    paragraphs: [
      "BrisaHub may offer free and paid plans for agencies.",
      "Plans may vary in:",
    ],
    bullets: [
      "number of job postings;",
      "hiring limits;",
      "platform commission;",
      "visibility features;",
      "access to history;",
      "additional tools.",
    ],
    trailingParagraphs: [
      "The prices, benefits, and conditions of each plan will be displayed within the platform.",
      "BrisaHub may change plans, prices, and benefits, with notice or an update on the platform, respecting charges already made when applicable.",
    ],
  },
  {
    title: "7. Free plan",
    paragraphs: [
      "The free plan may allow limited use of the platform.",
      "When available, the free plan may allow the agency to post and complete one job within the limits defined by BrisaHub.",
      "After reaching the free plan limit, the agency may need to subscribe to a paid plan to continue posting new jobs or accessing additional features.",
    ],
  },
  {
    title: "8. Subscriptions and plan billing",
    paragraphs: [
      "Paid plans may be billed on a recurring basis, monthly, or as otherwise stated on the platform.",
      "Billing will be processed through the integrated payment provider, currently Asaas.",
      "By subscribing to a paid plan, the agency authorizes the charge of the amount corresponding to the chosen plan.",
      "Renewal, expiration, billing history, and receipts may be displayed in the agency's billing or plan section.",
      "If a charge is declined, cancelled, disputed, or not confirmed, BrisaHub may suspend, limit, or downgrade access to the plan until the issue is resolved.",
    ],
  },
  {
    title: "9. Wallet deposits",
    paragraphs: [
      "The agency may add funds to their wallet using the methods available on the platform, such as PIX via Asaas.",
      "The balance will be credited to the wallet after payment confirmation by the payment provider.",
      "BrisaHub may show the deposit as pending until it receives confirmation from the provider.",
      "The agency should verify the details before making payments. BrisaHub is not responsible for payments made outside the platform's official channels.",
    ],
  },
  {
    title: "10. Escrow and value reservation",
    paragraphs: [
      "To confirm a booking, the agency must have sufficient balance in their wallet.",
      "When confirming a booking, the corresponding amount will be set aside from the agency's wallet to guarantee payment to the talent.",
      "Escrow does not mean immediate payment to the talent. The amount will be released after the payment step or completion defined on the platform.",
      "The agency may not use already-reserved funds for other purposes until the hiring is completed, cancelled, or resolved according to platform rules.",
    ],
  },
  {
    title: "11. Payment to talent",
    paragraphs: [
      "After the work is performed or in accordance with the flow defined on the platform, the agency may release payment to the talent.",
      "When payment is released:",
    ],
    bullets: [
      "the platform commission will be calculated according to the agency's plan;",
      "the net amount will be credited to the talent's wallet;",
      "the commission amount will be recorded as platform revenue;",
      "the transaction history will be recorded.",
    ],
    trailingParagraphs: [
      "BrisaHub may maintain financial and operational records for audit, support, fraud prevention, and legal compliance purposes.",
    ],
  },
  {
    title: "12. Platform commission",
    paragraphs: [
      "BrisaHub may charge a commission on hires made within the platform.",
      "The commission may vary depending on the agency's plan.",
      "Commission examples, when applicable:",
    ],
    bullets: [
      "free plan: higher percentage;",
      "Pro plan: reduced percentage;",
      "Premium plan: percentage as stated on the platform.",
    ],
    trailingParagraphs: [
      "The applicable commission will be displayed before or during the hiring/payment flow.",
      "BrisaHub may change commission percentages for new contracts or new plans, upon platform update.",
    ],
  },
  {
    title: "13. PIX withdrawals",
    paragraphs: [
      "The talent may request withdrawal of available wallet balance to a registered PIX key.",
      "The agency may also request withdrawal of available balance when this feature is enabled.",
      "Withdrawals will be processed by the integrated payment provider, currently Asaas.",
      "The user is responsible for providing a valid PIX key belonging to the correct account holder.",
      "BrisaHub may block or review withdrawals in case of:",
    ],
    bullets: [
      "suspected fraud;",
      "incorrect data;",
      "registration inconsistency;",
      "court order;",
      "payment provider requirements;",
      "pending account issues;",
      "need for additional verification.",
    ],
    trailingParagraphs: [
      "The receipt time may depend on the payment provider, the PIX system, and security checks.",
    ],
  },
  {
    title: "14. External fees",
    paragraphs: [
      "The payment provider may charge fees for billing, transfers, notifications, cards, PIX, or other services.",
      "These fees may be absorbed by BrisaHub or passed on to the user, according to the rule displayed on the platform.",
      "BrisaHub may adjust fee-pass-through rules in accordance with operational costs, commercial conditions, or changes by the payment provider.",
    ],
  },
  {
    title: "15. Cancellations",
    paragraphs: [
      "Cancellations of jobs, bookings, contracts, or payments may follow specific rules displayed on the platform.",
      "BrisaHub may prevent automatic cancellation when there is:",
    ],
    bullets: [
      "an accepted contract;",
      "a confirmed booking;",
      "a payment already released;",
      "a withdrawal in progress;",
      "an open dispute;",
      "suspected fraud;",
      "a pending obligation between the parties.",
    ],
    trailingParagraphs: [
      "When payment has already been made or funds are in escrow, cancellation may require manual review.",
    ],
  },
  {
    title: "16. Disputes",
    paragraphs: [
      "If an agency and a talent disagree about the execution of work, payment, attendance, delivery, or contract terms, they may contact support or open a dispute if that feature is available.",
      "BrisaHub may review information recorded on the platform, such as:",
    ],
    bullets: [
      "job data;",
      "contract;",
      "available messages or records;",
      "booking status;",
      "payment history;",
      "receipts;",
      "dates and times.",
    ],
    trailingParagraphs: [
      "BrisaHub may take reasonable administrative measures, such as keeping funds in escrow, releasing payment, cancelling an operation, blocking an account, or requesting additional documentation.",
    ],
  },
  {
    title: "17. Agency responsibilities",
    paragraphs: ["The agency is responsible for:"],
    bullets: [
      "publishing accurate information;",
      "hiring talents ethically and legally;",
      "respecting agreed conditions;",
      "maintaining sufficient balance;",
      "releasing payments when due;",
      "not discriminating against users;",
      "not requesting illegal services;",
      "not attempting to circumvent the platform.",
    ],
    trailingParagraphs: [
      "The agency must not make payments outside the platform when the hiring was initiated within BrisaHub, unless expressly authorized by BrisaHub.",
    ],
  },
  {
    title: "18. Talent responsibilities",
    paragraphs: ["The talent is responsible for:"],
    bullets: [
      "maintaining an accurate profile;",
      "showing up for accepted work;",
      "fulfilling the agreed service;",
      "providing correct information;",
      "registering the correct PIX key;",
      "respecting the agency and platform rules;",
      "not accepting jobs they cannot perform;",
      "not attempting to circumvent the platform.",
    ],
  },
  {
    title: "19. Prohibited conduct",
    paragraphs: ["It is prohibited to use BrisaHub for:"],
    bullets: [
      "fraud;",
      "money laundering;",
      "false data;",
      "scams;",
      "hiring for illegal activities;",
      "harassment;",
      "discrimination;",
      "violation of third-party rights;",
      "spam;",
      "unauthorized access attempts;",
      "unauthorized automated use;",
      "manipulation of ratings, payments, or invitations;",
      "circumventing platform commissions or payments.",
    ],
    trailingParagraphs: [
      "Violation of these rules may result in suspension, blocking, fund retention for review, account termination, and notification to authorities when necessary.",
    ],
  },
  {
    title: "20. Personal data and privacy",
    paragraphs: [
      "BrisaHub may process personal data necessary for registration, platform operation, payments, fraud prevention, support, security, and compliance with legal obligations.",
      "Data may include registration information, documents, contact details, payment data, usage history, hiring records, PIX keys, and technical access information.",
      "BrisaHub shall process data in accordance with applicable legislation, including Brazil's General Data Protection Law (LGPD) and other applicable privacy laws.",
      "The user may request information about their data, correction, update, or deletion, subject to legal limits and the need to maintain financial, anti-fraud, audit, and legal compliance records.",
      "Account deletion does not imply immediate deletion of all records, particularly financial, tax, transactional, contractual, or records necessary for the defense of rights.",
    ],
  },
  {
    title: "21. Account security",
    paragraphs: [
      "The user is responsible for maintaining the confidentiality of their password and access credentials.",
      "BrisaHub is not responsible for damages caused by password sharing, unauthorized access due to the user's negligence, or use of insecure devices.",
      "The user must immediately report any suspected unauthorized use of their account.",
    ],
  },
  {
    title: "22. Password and profile changes",
    paragraphs: [
      "The user may change their password and profile information through the means available on the platform.",
      "Information saved in the profile will remain recorded until the user changes it, except in cases of technical correction, legal requirement, moderation, security, or a valid request from the user.",
    ],
  },
  {
    title: "23. Account deletion",
    paragraphs: [
      "The user may request the deletion or deactivation of their account.",
      "Deletion may be blocked while there is:",
    ],
    bullets: [
      "wallet balance;",
      "pending withdrawal;",
      "active booking;",
      "pending contract;",
      "payment in progress;",
      "open dispute;",
      "financial obligation;",
      "required action on a job or hiring.",
    ],
    trailingParagraphs: [
      "Before deleting their account, the user should resolve pending items and withdraw available balance.",
      "BrisaHub may retain records necessary for audit, security, fraud prevention, legal compliance, and defense of rights.",
    ],
  },
  {
    title: "24. Suspension or termination by BrisaHub",
    paragraphs: ["BrisaHub may suspend, limit, or close accounts in case of:"],
    bullets: [
      "violation of these Terms;",
      "suspected fraud;",
      "financial risk;",
      "misuse;",
      "false data;",
      "chargeback;",
      "court order;",
      "conduct harmful to the platform or other users.",
    ],
    trailingParagraphs: [
      "BrisaHub may temporarily block funds while investigating suspected fraud, disputes, or irregularities.",
    ],
  },
  {
    title: "25. Platform availability",
    paragraphs: [
      "BrisaHub will strive to keep the platform available but does not guarantee uninterrupted operation.",
      "The platform may be unavailable due to maintenance, technical failures, third-party unavailability, attacks, fortuitous events, force majeure, or issues with external providers.",
      "BrisaHub is not responsible for unavailability caused by third-party services, including payment providers, hosting, internet, banks, or the PIX system.",
    ],
  },
  {
    title: "26. Third-party providers",
    paragraphs: [
      "BrisaHub uses third-party services for payment processing, authentication, hosting, email sending, and other features.",
      "The use of these services may be subject to the providers' own terms and policies.",
      "The user acknowledges that certain operations, such as payments, billing, subscriptions, transfers, and withdrawals, depend on the approval and availability of these third parties.",
    ],
  },
  {
    title: "27. Receipts and records",
    paragraphs: [
      "BrisaHub may provide internal receipts for operations performed on the platform.",
      "Internal receipts serve for consultation and control within BrisaHub.",
      "When applicable, receipts or records from the payment provider may be used as additional reference.",
      "BrisaHub may maintain a history of contracts, bookings, payments, withdrawals, deposits, subscriptions, and administrative actions for audit purposes.",
    ],
  },
  {
    title: "28. Intellectual property",
    paragraphs: [
      "The BrisaHub brand, system, design, code, texts, logos, flows, features, and other platform elements belong to BrisaHub or their respective owners.",
      "The user may not copy, reproduce, sell, exploit, modify, or distribute parts of the platform without authorization.",
    ],
  },
  {
    title: "29. User-submitted content",
    paragraphs: [
      "The user is responsible for all content they submit to the platform, including photos, texts, descriptions, documents, resumes, portfolios, contracts, and professional information.",
      "The user declares they have the rights or authorization to use the submitted content.",
      "BrisaHub may remove content that violates these Terms, third-party rights, applicable law, or internal rules.",
    ],
  },
  {
    title: "30. Limitation of liability",
    paragraphs: ["To the fullest extent permitted by applicable law, BrisaHub shall not be liable for:"],
    bullets: [
      "failure to fulfill obligations by an agency or talent;",
      "false information submitted by users;",
      "absence, delay, or poor execution of services;",
      "loss caused by incorrect payment information;",
      "unavailability of third-party providers;",
      "blocks, refusals, or delays by the payment provider;",
      "conduct outside the platform;",
      "negotiations made outside of BrisaHub.",
    ],
    trailingParagraphs: [
      "Nothing in these Terms excludes rights that cannot be excluded by applicable law.",
    ],
  },
  {
    title: "31. Changes to these Terms",
    paragraphs: [
      "BrisaHub may change these Terms at any time.",
      "When there are significant changes, BrisaHub may notify users through the platform, email, or another available channel.",
      "Continued use of the platform after the Terms are updated will be considered acceptance of the new version.",
    ],
  },
  {
    title: "32. Contact",
    paragraphs: [
      "For questions, requests, or support, the user may contact us at:",
      "support@brisahub.com.br",
    ],
  },
  {
    title: "33. Governing law and jurisdiction",
    paragraphs: [
      "These Terms shall be governed by the laws of the Federative Republic of Brazil.",
      "The competent court shall be chosen in accordance with applicable law, without prejudice to mandatory consumer rights where applicable.",
    ],
  },
  {
    title: "34. Acceptance",
    paragraphs: ["By creating an account or using BrisaHub, the user declares that they:"],
    bullets: [
      "have read these Terms;",
      "have understood their conditions;",
      "agree to use the platform in accordance with these rules;",
      "acknowledge that payments and withdrawals depend on external providers;",
      "understand that BrisaHub acts as an intermediary platform between agencies and talents.",
    ],
  },
];

// ── Component ──────────────────────────────────────────────────────────────────

type TermsSection = (typeof ptSections)[number];

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

  const sections = isEn ? enSections : ptSections;

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
            {isEn ? (
              <>
                <p>
                  These Terms of Use and Conditions govern access to and use of the BrisaHub
                  platform, available at brisahub.com.br, by agencies, talents, administrators,
                  and other registered users.
                </p>
                <p>
                  By creating an account, accessing, or using BrisaHub, the user declares that
                  they have read, understood, and agree to these Terms.
                </p>
              </>
            ) : (
              <>
                <p>
                  Estes Termos de Uso e Condições regulam o acesso e uso da plataforma BrisaHub,
                  disponível em brisahub.com.br, por agências, talentos, administradores e demais
                  usuários cadastrados.
                </p>
                <p>
                  Ao criar uma conta, acessar ou utilizar a BrisaHub, o usuário declara que leu,
                  compreendeu e concorda com estes Termos.
                </p>
              </>
            )}
          </div>
        </section>

        <div className="space-y-4">
          {sections.map((section) => (
            <Section key={section.title} section={section} />
          ))}
        </div>
      </div>
    </main>
  );
}
