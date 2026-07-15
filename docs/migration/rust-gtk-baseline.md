# Baseline da interface e protocolo de benchmark

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

As dependências foram instaladas e o ensaio automatizado foi executado com o
binário release. As dez amostras brutas estão em
`docs/migration/rust-gtk-benchmark.csv`. Não havia um artefato Electron release
equivalente reproduzível; por isso o baseline histórico permanece indisponível,
em vez de receber valores estimados.

## Cenários

Executar no mínimo dez vezes, descartando a primeira execução fria quando o
objetivo for comparar inicializações aquecidas:

1. abrir no Painel e aguardar 30 s;
2. navegar uma vez por todos os 16 módulos e retornar ao Painel;
3. permanecer 5 min no Painel;
4. pesquisar software e abrir detalhes sem iniciar mutação;
5. encerrar a janela e confirmar que nenhum processo da UI permanece.

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
| Janela utilizável | indisponível | 215 ms | <= 1 s |
| PSS ocioso, árvore UI | indisponível | 65.530 KiB | < 80 MiB |
| CPU ociosa | indisponível | 0% (mediana) | próxima de 0% |
| Quantidade de processos | indisponível | 1 | processo único |
| Tamanho do binário da UI | indisponível | 8.082.456 bytes | registrar |
| PSS após navegação | pendente | pendente | sem crescimento sustentado |
| PSS após 30 min | pendente | pendente | sem crescimento sustentado |

Publicar também todas as amostras, mediana, p95 e desvio, não somente o
melhor resultado. Durante a medição não usar devtools, hot reload ou builds de
debug; comparar os artefatos release que seriam empacotados.

Resultado de 2026-07-15: mediana/p95 de abertura 215/1.500 ms e mediana/p95
de PSS 65.530/66.360 KiB. Nove das dez aberturas ficaram entre 179 e 251 ms;
a primeira abertura fria levou 1,5 s. O desvio frio é aceito para o corte porque
a mediana fica muito abaixo da meta, não se repete com cache aquecido e a UI
permanece utilizável. CPU teve mediana 0% e média 2,1% nas janelas curtas de
amostragem; o roteiro manual de longa duração continua obrigatório por release.

## Condição de aprovação

A issue #74 aprova os resultados. O baseline Electron histórico pode permanecer
como indisponível quando não houver artefato release equivalente reproduzível;
isso deve ser registrado, nunca estimado. Qualquer meta não atingida precisa de causa
registrada e aceite explícito antes da #75. Ganho de memória não compensa
regressão funcional, de acessibilidade ou de segurança.
