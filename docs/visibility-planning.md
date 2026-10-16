# Cálculo de visibilidade para o planejador

O módulo `planning` avalia amostras de uma janela de observação sem depender de HTTP,
banco de dados ou fornecedor meteorológico. Assim, os adaptadores podem combinar a altitude
calculada pelo núcleo astronômico com dados lunares e com o contrato normalizado de clima.

## Regras

- A altitude é obrigatória e usa o mínimo informado pelo consumidor.
- Dados lunares são opcionais. Quando disponíveis, a condição é favorável se a iluminação não
  exceder o limite ou se o objeto estiver suficientemente distante da Lua.
- Dados climáticos são opcionais. Cada medição disponível é comparada a seu limite; uma medição
  desfavorável reprova aquele instante.
- A ausência de Lua ou clima é informada como `unavailable`, mas não bloqueia uma recomendação
  baseada somente em altitude.
- A janela é favorável quando ao menos uma amostra dentro de seus limites é favorável.

O retorno contém os limites das amostras favoráveis, o instante representativo de maior altitude
e os fatores de altitude, Lua e clima considerados nesse mesmo instante. Os limites opcionais têm
valores padrão conservadores e podem ser configurados em cada avaliação.

## Integração

Use `ObservationVisibilityService.evaluate` depois de obter amostras para a janela desejada. O
serviço recebe somente tipos de domínio; payloads específicos de provedores devem ser convertidos
antes da chamada.

O endpoint autenticado `POST /api/v1/planning/observation-window` recebe o objeto do catálogo, o
local do observador, uma janela de até 24 horas e a altitude mínima desejada. A aplicação amostra
a posição do astro a cada duas horas, combina a previsão climática horária quando disponível e
retorna um dos estados abaixo:

- `recommended`: há uma janela favorável e seus fatores são apresentados;
- `no_favorable_window`: existem dados suficientes, mas as condições não atendem às regras;
- `insufficient_data`: não há posições suficientes para produzir uma recomendação segura.

A indisponibilidade isolada do clima não inventa dados: ela é indicada em `meta.weatherAvailable`
e na justificativa, enquanto a recomendação pode continuar baseada na posição conhecida do astro.
