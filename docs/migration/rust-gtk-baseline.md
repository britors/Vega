# Baseline Electron e protocolo de benchmark

O baseline deve ser coletado antes do scaffold nativo e repetido com a mesma
máquina, usuário, sessão gráfica e estado do `vegad`. Números obtidos em
máquinas diferentes não servem para aprovar o cutover.

## Ambiente de referência

| Campo | Valor |
|---|---|
| Data | 2026-07-15 |
| Commit | preencher no ensaio oficial |
| Distribuição/versão | Fedora Linux 44 Workstation |
| Kernel | 7.1.3-201.fc44.x86_64 |
| CPU | Intel Core i5-11260H |
| RAM | 15,37 GiB |
| GPU/driver | Intel UHD + NVIDIA GTX 1650; registrar driver no ensaio |
| Sessão | GNOME 50.3 / Wayland |
| GTK/libadwaita | 4.22.4 / 1.9.2 |
| Electron | 43.1.0 declarado em `vega/package.json` |
| Rust/UI nativa | rustc 1.97.0; gtk4 0.11.4; libadwaita 0.9.2 |

As dependências foram instaladas e o smoke launch nativo passou nesta máquina.
Os valores de desempenho continuam pendentes porque precisam do protocolo
completo e de builds release equivalentes; nenhum valor foi preenchido
artificialmente.

## Cenários

Executar no mínimo dez vezes, descartando a primeira execução fria quando o
objetivo for comparar inicializações aquecidas:

1. abrir no Painel e aguardar 30 s;
2. navegar uma vez por todos os 16 módulos e retornar ao Painel;
3. permanecer 5 min no Painel;
4. permanecer 5 min no Monitor;
5. pesquisar software e abrir detalhes sem iniciar mutação;
6. encerrar a janela e confirmar que nenhum processo da UI permanece.

O daemon deve estar instalado na mesma versão em ambos os ensaios. Registrar
se ele estava ativo antes da abertura; seu RSS não entra no total da UI.

## Métricas e resultados

Memória é a soma de PSS de toda a árvore de processos da UI, obtida em
`/proc/*/smaps_rollup`; RSS pode ser registrado apenas como dado auxiliar.
CPU ociosa é a soma da árvore durante 60 s após estabilização. Tempo de
abertura vai do início do processo até a primeira janela apresentada e pronta
para entrada, usando um marcador equivalente nas duas implementações.

| Métrica | Electron mediana | Rust mediana | Meta Rust |
|---|---:|---:|---:|
| Janela utilizável | pendente | pendente | <= 1 s |
| PSS ocioso, árvore UI | pendente | pendente | < 80 MiB |
| CPU ociosa por 60 s | pendente | pendente | próxima de 0% |
| Quantidade de processos | pendente | pendente | menor que Electron |
| Tamanho instalado da UI | pendente | pendente | menor que Electron |
| PSS após navegação | pendente | pendente | sem crescimento sustentado |
| PSS após 30 min | pendente | pendente | sem crescimento sustentado |

Publicar também todas as amostras, mediana, p95 e desvio, não somente o
melhor resultado. Durante a medição não usar devtools, hot reload ou builds de
debug; comparar os artefatos release que seriam empacotados.

## Condição de aprovação

A issue #74 aprova os resultados. Qualquer meta não atingida precisa de causa
registrada e aceite explícito antes da #75. Ganho de memória não compensa
regressão funcional, de acessibilidade ou de segurança.
