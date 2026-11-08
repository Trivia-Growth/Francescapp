# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Supabase, Netlify e OpenRouter, com Google Drive e Google Calendar. O padrão de código é o Atendimento; referência e adaptações em [docs/projeto/referencia-atendimento.md](docs/projeto/referencia-atendimento.md). A migração do processo para OpenSpec não define versões, ambientes ou novos fornecedores.

## Users

Edilaine como case manager, equipe multidisciplinar da Francescato e familiares/cuidadores autorizados. Participação direta do paciente e profissionais externos seguem as fases e pendências registradas nas specs.

## Product Purpose

**Nome do aplicativo: FFCMApp**, confirmado em 15/10/2026. Francescato é a organização; Francescapp é o nome anterior, ainda presente em caminhos e materiais históricos.

Centralizar o acompanhamento por paciente: diário, anamneses, sínteses, documentos classificados, plano, pendências e agenda. Requisitos em [openspec/specs](openspec/specs); decisões e pendências em [docs/projeto/fundacao.md](docs/projeto/fundacao.md).

## Operating Context

Um único perfil por usuário: Administrador, Profissional ou Família. A equipe precisa de cadastro/concessão prévios por Administrador; login Google não concede acesso automaticamente. Edilaine terá administração de negócio inicial. A conta técnica individual por senha, excepcionalmente autorizada, já existe no Supabase Auth do projeto confirmado; a concessão de Administrador da aplicação ainda não foi executada. Sem credenciais ou identificação pessoal nas specs.

Profissionais entram pelo Google Workspace. Familiares recebem convite inicial do Supabase, definem senha e usam e-mail/senha com recuperação. Cada profissional mantém sua agenda na própria conta Google; a global está em e-mail compartilhado, com permissões separadas de consulta e edição. A primeira agenda terá consulta/criação/alteração/cancelamento confirmados na origem. Anexos ficam no Google Drive compartilhado institucional; identificador, raiz e organização ainda serão definidos. Família acessa somente o app.

Cadastro mínimo (16/10/2026): nome obrigatório; preferência, nascimento e contatos opcionais; familiares/responsáveis separados, sem CPF obrigatório. Para casos novos, a partir da entrega 2 da ficha do paciente (decisão de 08/11/2026), o cadastro exige nome, preferência, nascimento, ao menos um contato, situação e case manager, sem valor padrão; o mínimo vale até lá e para casos existentes ("a completar"). Áudio original deve ser apagado após confirmação da revisão, preservando o texto; falha de exclusão aparece como pendência, não sucesso.

Histórico contínuo por paciente, preservado em pausas e retomadas, sem ampliar audiências ou restaurar acesso revogado. O mesmo ambiente remoto será usado nos testes e na futura produção, somente com dados fictícios antes da liberação. A transição exige limpeza seletiva dos itens de teste identificados e conferência, preservando configurações, acessos administrativos válidos e conteúdo institucional preexistente. Isso não autoriza exclusão ou provisionamento agora.

## Brand Commitments

Identidade Francescato. Em 15/10/2026 o solicitante forneceu logos e paleta de referência; originais, cores extraídas e limites em [identidade-visual.md](docs/projeto/identidade-visual.md). As imagens orientam a marca, sem definir fontes ou componentes finais. A marca Trívia é da proposta comercial, não da aplicação. O mockup continua referência provisória de interface, não design final ratificado.

## Evidence on Hand

Projeto aprovado, proposta e mockup existentes, requisitos e cinco esclarecimentos de 10/10/2026 preservados na migração de 14/10/2026. Não inventar regras clínicas, compromissos de entrega ou afirmações comerciais.

## Accessibility & Inclusion

Português brasileiro, uso prioritário no celular, leitura confortável, campos curtos, foco visível, teclado, contraste, zoom e estados além da cor. Áudio é opcional, transcrição é rascunho revisado e deve haver alternativa por texto.
