# Roteiro de demonstração mobile — PBI-0072.3

Este roteiro cobre a participação do aplicativo FieldOps no fluxo de demonstração
`login → execução → revisão`, usando os dados de demonstração do backend no perfil
`dev`.

## Preparação

1. Inicie o backend com o perfil `dev`. Ele cria a inspeção **[Demo] Atribuída —
   sync mobile** para o técnico de demonstração.
2. Configure o aplicativo para apontar para a API em execução. Em dispositivo físico,
   use uma URL que o celular consiga alcançar (por exemplo, um túnel HTTPS), nunca
   `localhost`.
3. Abra o APK de demonstração e permita as permissões solicitadas pelo Android.

## Execução no aplicativo

1. Entre como técnico:
   - e-mail: `joao.tecnico@example.com`
   - senha: `DemoPass123!`
2. Na aba **Sincronização**, toque em **Sincronizar agora** para obter os dados mais
   recentes da API.
3. Na aba **Inspeções**, abra a inspeção **[Demo] Atribuída — sync mobile** e
   inicie o checklist. Para uma repetição local sem reiniciar a API, use a seed
   **[Demo] Em execução**, que já está pronta para o preenchimento.
4. Responda todos os itens obrigatórios.
5. Na tela **Resumo da inspeção**, confirme a conclusão uma única vez e aguarde o
   retorno visual de processamento/conclusão.
6. Volte à aba **Sincronização** e toque em **Sincronizar agora**. A fila deve ser
   enviada e a inspeção deve passar para enviada/concluída conforme o retorno da API.

## Revisão e evidência

1. Entre como supervisora no painel web ou use o roteiro do backend para iniciar a
   revisão e aprovar a mesma inspeção:
   - e-mail: `ana.silva@example.com`
   - senha: `DemoPass123!`
2. No celular, sincronize novamente para buscar a decisão de revisão.
3. Registre como evidência uma captura de cada marco: login, checklist respondido,
   resumo concluído, sincronização e estado final revisado.

## Resultado esperado

O técnico executa o checklist no celular, as alterações entram na fila local e a
sincronização envia os dados ao backend. Após a aprovação pela supervisora, uma nova
sincronização apresenta o resultado final no aplicativo.

> Os usuários e a senha acima existem apenas no perfil local `dev`. Para reiniciar a
> demonstração, recrie a base H2 e inicie o backend novamente.
