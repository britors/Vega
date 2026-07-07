# PROMPT DE IMPLEMENTAÇÃO — LYRA OS: INTEGRAÇÃO LYRA TOUR + VEGA

> **Versão:** 2.0
> **Status:** Especificação incremental, pronta para implementação
> **Supersede:** `PROMPT-LYRA-OS-INTEGRACAO-TOUR-VEGA.md` v1.0 (mesma intenção, atualizado para o estado atual do projeto — nomenclatura Vega já consolidada e mecanismo de repositório local de desenvolvimento)
> **Pré-requisitos:** `PROMPT-LYRA-OS.md` v2.1, `PROMPT-LYRA-IDENTIDADE.md` v1.0, `PROMPT-LYRA-TOUR-v2.md`, `PROMPT-VEGA.md` v1.0, `PROMPT-LYRA-ISO-SETUP-HOST.md` v1.0
> **Escopo:** Este documento integra os pacotes **Lyra Tour** e **Vega/vegad** ao build do ISO do Lyra OS. Não redefine o comportamento interno de nenhum dos dois produtos — apenas conecta ao build, considerando que, neste momento, **nenhum dos dois está publicado em canal oficial** (nem AUR, nem repositório `lyra` remoto). O caminho descrito aqui usa o repositório local de desenvolvimento já estabelecido pelo `PROMPT-LYRA-ISO-SETUP-HOST.md`.

---

## 1. Estado Atual e Caminho de Integração

| Componente | Canal-alvo definitivo | Canal usado agora (desenvolvimento) |
|---|---|---|
| `lyra-tour` | AUR | repositório local de arquivo (`~/.local/share/lyra-repo/`) |
| `vega` | repositório `lyra` oficial | repositório local de arquivo (mesmo mecanismo) |
| `vegad` | repositório `lyra` oficial | repositório local de arquivo (mesmo mecanismo) |

Enquanto o repositório `lyra` oficial e a publicação no AUR não existem, **os três pacotes são tratados da mesma forma**: compilados localmente e servidos pelo repositório de arquivo `[lyra]` já configurado em `lyra-iso/pacman.conf` pelo script `setup-build-host.sh`. Isso significa que a distinção "AUR vs repo lyra" (relevante para o release final) **não muda nada no processo de build local agora** — os três entram pelo mesmo `repo-add`.

Quando os canais definitivos existirem, a única mudança necessária é remover esses três nomes da lista de build local e deixar o Pacman resolvê-los pelos repositórios reais — nenhuma mudança estrutural no `lyra-iso/`.

---

## 2. Alterações no `setup-build-host.sh`

Estender a lista já existente (`PROMPT-LYRA-ISO-SETUP-HOST.md` §3.2), que hoje contém apenas Prosa e Fina:

```diff
 LYRA_AUR_PACKAGES=(
     "prosa"
     "fina"
+    "lyra-tour"
+    "vega"
+    "vegad"
 )
```

- Nenhuma outra linha do script muda — o loop do Passo 4 já itera sobre a lista genericamente
- **Pré-condição:** `vega`, `vegad` e `lyra-tour` precisam ter um PKGBUILD válido acessível para o `yay`/`makepkg` processar. Como nenhum dos três está publicado no AUR ainda, isso implica uma das duas abordagens:
  - **(a)** Publicar PKGBUILDs "privados" temporários no AUR mesmo antes do release público (prática comum — o AUR aceita pacotes em qualquer estágio), permitindo que `yay -S vega` funcione normalmente; ou
  - **(b)** Buildar localmente via `makepkg` direto a partir do checkout Git de cada repositório (`vega/`, `vegad/`, `lyra-tour/`), sem depender do AUR neste momento
- Este documento assume a abordagem **(b)** por não exigir publicação prematura; ver §3

---

## 3. Build Local a partir do Checkout Git (sem AUR)

Adição ao `setup-build-host.sh` (ou script complementar `scripts/build-local-packages.sh`, chamado pelo mesmo): para pacotes que ainda não estão no AUR, buildar diretamente do diretório do projeto:

```bash
# Pacotes construídos localmente a partir do checkout Git do próprio projeto,
# ainda não publicados em canal oficial (AUR ou repo lyra).
# Mover para LYRA_AUR_PACKAGES (via yay) assim que forem publicados.
LYRA_LOCAL_SOURCE_PACKAGES=(
    "vega:$HOME/dev/vega"
    "vegad:$HOME/dev/vegad"
    "lyra-tour:$HOME/dev/lyra-tour"
)

for entry in "${LYRA_LOCAL_SOURCE_PACKAGES[@]}"; do
    name="${entry%%:*}"
    path="${entry#*:}"

    if [[ ! -d "$path" ]]; then
        echo "Aviso: diretório de $name não encontrado em $path — pulando." >&2
        continue
    fi

    log "Buildando $name a partir de $path"
    (cd "$path" && makepkg -f --noconfirm)

    pkgfile="$(find "$path" -maxdepth 1 -name '*.pkg.tar.zst' -printf '%T@ %p\n' \
                | sort -rn | head -1 | cut -d' ' -f2-)"

    if [[ -z "$pkgfile" ]]; then
        echo "Falha: $name não gerou pacote em $path" >&2
        exit 1
    fi

    cp -f "$pkgfile" "$LYRA_REPO_DIR/"
    log "  -> copiado: $(basename "$pkgfile")"
done
```

- Os caminhos em `LYRA_LOCAL_SOURCE_PACKAGES` são placeholders — ajustar para a localização real dos três repositórios na máquina de build (recomenda-se um diretório-pai comum, ex.: `~/dev/`, para consistência)
- **`vegad`** é um binário Go, não um pacote Electron — seu `PKGBUILD` próprio (conforme `PROMPT-VEGA.md` §5.1) já lida com `go build`; este script não precisa saber a diferença, apenas chama `makepkg`
- Após este passo, o restante do fluxo (`repo-add`, seção `[lyra]` do `pacman.conf`) já definido no `PROMPT-LYRA-ISO-SETUP-HOST.md` funciona sem alteração — os `.pkg.tar.zst` de Vega/vegad/Lyra Tour entram no mesmo repositório de arquivo que Prosa e Fina

---

## 4. Alterações no Repositório `lyra-iso`

### 4.1 `packages.x86_64`

```diff
+ vega
+ vegad
```

*(`lyra-tour` não entra aqui — pacotes AUR/dev entram via `packages.aur.lock`, §4.2, mesmo em build local)*

### 4.2 `packages.aur.lock`

```diff
+ lyra-tour=2.0.0
```

- Mesmo em build local (sem AUR real), manter este arquivo como registro da versão esperada — quando a publicação oficial acontecer, o número aqui deve corresponder à tag Git usada no PKGBUILD real

### 4.3 Meta-pacote `lyra-desktop`

```diff
  depends=(
      ...
+     vega
+     vegad
  )
```

*(`lyra-tour` permanece fora do meta-pacote, listado separadamente em `packages.x86_64` do perfil archiso — mesma decisão do documento de integração anterior)*

### 4.4 `build.sh` — systemd units

Sem mudança em relação ao já especificado: **não** habilitar `vegad.service` via `systemctl enable` (é bus-activated). O `build.sh` apenas valida a presença dos arquivos:

```
/usr/lib/systemd/system/vegad.service
/usr/share/dbus-1/system.d/org.lyraos.Vega1.conf
```

### 4.5 Autostart do Lyra Tour

Nenhuma ação no `build.sh` — o próprio pacote `lyra-tour` instala `/etc/xdg/autostart/lyra-tour.desktop`. O build valida a presença do arquivo no chroot (falha explícita se ausente).

---

## 5. Ordem de Execução Recomendada

1. Rodar `setup-build-host.sh` atualizado (§2) — builda Prosa e Fina como já fazia
2. Rodar o passo de build local (§3) — builda Vega, vegad e Lyra Tour a partir dos checkouts Git
3. Confirmar `repo-add` incluiu os 5 pacotes: `pacman -Sl lyra` (ou inspecionar `lyra-repo/lyra.db.tar.gz`) deve listar `prosa`, `fina`, `vega`, `vegad`, `lyra-tour`
4. Atualizar `packages.x86_64`, `packages.aur.lock` e `lyra-desktop` conforme §4
5. Rodar `mkarchiso` (`build.sh` do perfil)

---

## 6. Validação

**Repositório local:**
- [ ] `~/.local/share/lyra-repo/` contém pacotes de `prosa`, `fina`, `vega`, `vegad` e `lyra-tour`
- [ ] `pacman -Sl lyra` (dentro do ambiente de build) lista os 5 pacotes

**Vega:**
- [ ] `pacman -Qi vega vegad` presentes na instalação (VM de teste via QEMU)
- [ ] `systemctl status vegad` reporta `inactive` logo após o boot (bus activation)
- [ ] Abrir o Vega ativa `vegad` automaticamente
- [ ] Instalação de um pacote de teste via Vega gera snapshot pré/pós (`snapper list`)

**Lyra Tour:**
- [ ] `/etc/xdg/autostart/lyra-tour.desktop` presente no chroot (build falha se ausente)
- [ ] Primeiro login na VM de teste abre o Tour automaticamente
- [ ] Botões "Abrir" das telas 5 e 6 abrem o Vega corretamente (`vega.desktop`)

**Regressão:**
- [ ] `grep -ri lyrae airootfs/` retorna vazio (nenhuma referência residual ao nome antigo)
- [ ] Checklist do build base (`PROMPT-LYRA-OS.md` §11.2) integralmente verde

---

## 7. Fora de Escopo

- Publicação real de `vega`, `vegad` e `lyra-tour` em canal oficial (AUR / repositório `lyra` assinado) — quando ocorrer, ver §1 para o caminho de migração do build local para o oficial
- Pacotes transitional `lyrae`→`vega`/`lyraed`→`vegad` para usuários de instalações antigas — só relevante após existir um release público anterior instalado por alguém (ainda não é o caso)
- Calco, Pulso — entram neste mesmo mecanismo assim que tiverem PKGBUILD pronto, seguindo exatamente o padrão deste documento

---

**Fim da especificação.**
