begin;
-- FR-078 (diario-de-plantao, tarefas 0.4/0.6 e 5.2): semeadura dos campos de fábrica do
-- modelo da ficha de plantão, no catálogo já generalizado em 20261127100000.
--
-- Decisões do solicitante de 20/11/2026, aplicadas literalmente:
--  * NENHUM campo nasce obrigatório (0.4). Marcar obrigatório é ato do Administrador.
--  * Nascem compartilháveis EXATAMENTE três — Rotina, Alimentação e Atividades (0.6).
--    Todos os demais nascem internos, inclusive Observações e Estado emocional. Isso
--    revoga a suposição S3 do design.md.
--  * Campo de fábrica é campo como qualquer outro: pode ser desativado, reordenado e
--    marcado obrigatório pelo Administrador. Nada é apagado — não há grant de DELETE.
--
-- Recorte: os campos estruturais da ficha de papel (Paciente, Data, Profissional/papel e
-- Plantão/período) NÃO entram aqui. Eles são identidade e propriedade do turno (D3 do
-- design.md), não campo de formulário administrado. O que entra é o conteúdo redigido do
-- plantão, na ordem da ficha de papel.
insert into cadastro.campo_extra_plano_catalogo
  (id, escopo, nome, tipo, opcoes, ativo, ordem, obrigatorio, de_fabrica, visibilidade, versao, criado_por_usuario_id)
values
  ('7f1c0001-0000-4000-8000-000000000001', 'ficha_plantao', 'Estado emocional observado', 'texto', null, true, 1, false, true, 'interna', 1, null),
  ('7f1c0001-0000-4000-8000-000000000002', 'ficha_plantao', 'Rotina', 'texto_longo', null, true, 2, false, true, 'compartilhavel', 1, null),
  ('7f1c0001-0000-4000-8000-000000000003', 'ficha_plantao', 'Atividades', 'texto_longo', null, true, 3, false, true, 'compartilhavel', 1, null),
  ('7f1c0001-0000-4000-8000-000000000004', 'ficha_plantao', 'Alimentação', 'texto_longo', null, true, 4, false, true, 'compartilhavel', 1, null),
  ('7f1c0001-0000-4000-8000-000000000005', 'ficha_plantao', 'Medicação', 'texto_longo', null, true, 5, false, true, 'interna', 1, null),
  ('7f1c0001-0000-4000-8000-000000000006', 'ficha_plantao', 'Intercorrências', 'texto_longo', null, true, 6, false, true, 'interna', 1, null),
  ('7f1c0001-0000-4000-8000-000000000007', 'ficha_plantao', 'Observações', 'texto_longo', null, true, 7, false, true, 'interna', 1, null),
  ('7f1c0001-0000-4000-8000-000000000008', 'ficha_plantao', 'Pendências', 'texto_longo', null, true, 8, false, true, 'interna', 1, null);

do $$ begin
  if (select count(*) from cadastro.campo_extra_plano_catalogo where escopo = 'ficha_plantao' and obrigatorio) <> 0 then
    raise exception 'FABRICA_NASCEU_OBRIGATORIA';
  end if;
  if (select count(*) from cadastro.campo_extra_plano_catalogo where escopo = 'ficha_plantao' and visibilidade = 'compartilhavel') <> 3 then
    raise exception 'COMPARTILHAVEIS_FORA_DA_DECISAO';
  end if;
end $$;
commit;
