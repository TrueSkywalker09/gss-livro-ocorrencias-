# Sistema GSS V2 - v2.18.0

Sistema de gestão empresarial com módulos de RH, documentos trabalhistas e controle operacional.

---

## Versão Atual

**v2.18.1** (01/07/2026)

Consulte o [Histórico de Atualizações](#histórico-de-atualizações) para detalhes.

---

## Controle de Versão

### Formato: Semantic Versioning (SemVer)

| Componente | Descrição | Exemplo |
|------------|-----------|---------|
| **Major** | Mudanças de arquitetura, breaking changes | `3.0.0` |
| **Minor** | Novas funcionalidades (retrocompatível) | `2.1.0` |
| **Patch** | Correções de bugs, ajustes pontuais | `2.0.1` |

### Gatilhos de Atualização

| Tipo | Quando atualizar | Exemplo |
|------|----------------|---------|
| **Patch** | Correções pequenas, ajustes de UI | `v2.0.1` |
| **Minor** | Novo módulo, nova funcionalidade | `v2.1.0` |
| **Major** | Refatoração, mudanças de arquitetura | `v3.0.0` |

### Onde a Versão é Controlada

| Local | Descrição |
|-------|-----------|
| Badge | Exibida no canto inferior direito do sistema (`src/index.html`) |
| `docs/AGENTS.md` | Cabeçalho + Histórico de Atualizações |

### Como Atualizar

1. Atualizar badge em `src/index.html`
2. Atualizar cabeçalho do `docs/AGENTS.md`
3. Adicionar entrada no Histórico de Atualizações do `docs/AGENTS.md`

---

## Stack

- **Frontend**: HTML5 + CSS3 + Vanilla JS (sem frameworks) + Leaflet 1.9.4 (mapas interativos)
- **Desktop**: Electron (contextIsolation, sandbox:false)
- **Persistência**: ZIP via JSZip em disco (Electron) / localStorage (fallback)
- **Extensão**: `.html` (não usa bundlers)

## Estrutura de Arquivos

```
C:\Sistema GSS\
├── docs/                        ← Documentação do projeto
│   ├── AGENTS.md                ← Este arquivo
│   ├── fluxo_desenvolvimento.md ← Fluxo de dev e deploy
│   └── supabase-ocorrencias.sql ← Schema SQL: tabelas, RLS, triggers
├── .github/workflows/           ← CI/CD (GitHub Actions)
│   ├── deploy-form.yml          ← Auto-deploy formulário → Cloudflare Pages
│   ├── deploy-supabase.yml      ← Semi-auto: Edge Functions + schema
│   └── build-desktop.yml        ← Auto-build EXE no push de tag
├── supabase/                    ← Configuração Supabase CLI
│   ├── config.toml              ← Config do projeto Supabase
│   └── functions/enviar-senha/  ← Edge Function (Deno + Resend)
│       ├── index.ts
│       └── deno.json
├── src/
│   ├── index.html               # Shell principal + topbar
│   ├── AGENTS.md                # (movido para docs/AGENTS.md)
│   ├── build/                   # Scripts de compilação
│   │   ├── compilar.cmd         # Wrapper (executar para compilar)
│   │   └── compilar.ps1         # Lógica de compilação
│   ├── dist/                    # Saída da compilação (pronta para distribuição)
│   │   └── livro-remoto/        # Formulário externo (Cloudflare Pages)
│   │       └── index.html       # Self-contained (HTML/CSS/JS)
│   ├── css/
│   │   └── estilos.css          # Estilos globais
│   ├── js/
│   │   ├── app.js               # Core (auth, MODULOS, persistência, backup, Electron)
│   │   ├── modulo-rh.js         # RH (Colaboradores + Postos + Recrutamento)
│   │   ├── modulo-ferias.js     # Férias + Feriados
│   │   ├── modulo-aso.js        # ASO (Saúde Ocupacional)
│   │   ├── modulo-treinamentos.js # Treinamentos / NRs
│   │   ├── modulo-cnv-reciclagens.js # CNV e Reciclagens
│   │   ├── modulo-epis.js       # EPIs
│   │   ├── modulo-suprimentos.js # Materiais / Fornecedores
│   │   ├── modulo-feriados.js   # Feriados
│   │   ├── modulo-documentos.js # Documentos trabalhistas
│   │   ├── modulo-precontratacao.js # Pré-Contratação
│   │   ├── modulo-vagas.js      # Vagas
│   │   ├── modulo-ferramentas.js # Ferramentas utilities
│   │   ├── modulo-usuarios.js   # Usuários
│   │   ├── modulo-pastas.js    # Gerenciamento de pastas (funcionários)
│   │   ├── modulo-pastas-postos.js # Gerenciamento de pastas (postos)
│   │   └── modulo-ocorrencias.js # Livro de Ocorrências Eletrônico
│   ├── MIDIAS/                  # Imagens do sistema
│   │   ├── logo-gss.png
│   │   ├── header-documentos.png
│   │   └── FOTOS_3X4/          # Fotos 3x4 dos colaboradores
│   └── DADOS/                   # Arquivos de dados JSON (template)
├── electron/                    # Camada desktop Electron
│   ├── main.js                  # Processo principal + IPC handlers
│   ├── preload.js               # Ponte contextBridge (apiLocal)
│   └── gss-config.json          # Config de deploy (dataFolder)
├── dist-electron/               # Saída do build .exe portátil
├── BACKUP/                      # Backups ZIPados (script legado)
└── RESUMO/                      # Histórico do projeto
```

---

## Padrões do Projeto

### Estrutura dos Módulos

Todo código JavaScript deve seguir o padrão IIFE:

```javascript
(function() {
  'use strict';

  window.NomeModule = {
    filtro1: '',
    filtro2: '',
    sort: { col: 'nome', dir: 'asc' }
  };

  // Funções core
  window.NomeModule.getAlerts = function() { return []; };

  // Renderização
  window.NomeModule.rdash = function() { /* dashboard */ };
  window.NomeModule.rcad = function() { /* formulário */ };
  window.NomeModule.rlista = function() { /* listagem */ };

  // CRUD
  window.NomeModule.salvar = function() { /* */ };
  window.NomeModule.excluir = function(id) { /* */ };
})();
```

### Regras de Nomenclatura

| Padronização | Descrição |
|--------------|------------|
| IIFE | Todo módulo envolvido em `(function() { ... })();` |
| Estado global | Cada módulo expõe `window.NomeModule` |
| Render functions | Prefixo `r` (rdash, rlista, rcad, rrecrutamento, etc.) |
| Persistência | Sempre chamar `GSS.persistData(true)` após alterações |
| Feedback | Usar `GSS.toast('mensagem')` para notificações |
| Validação | Verificar campos obrigatórios antes de salvar |
| Debounce | Usar `GSS.debounceInput(this, 'Module.funcao', 180)` em campos de busca |
| Loading | Usar `GSS.showLoading('msg')` e `GSS.hideLoading()` em operações async |
| Confirmação | Usar `GSS.confirm('mensagem', 'callback()')` para excluir/destrutivo |
| Auto-focus | Usar `GSS.focus('elementId')` após abrir modais |
| Export | Usar `GSS.exportExcel(html, filename)` para exportar tabelas |

---

## Layout dos Cards dos Dashboards

### Estrutura

Cards com layout vertical (ícone acima, número + descrição abaixo):

```
┌─────────────────────┐
│         👤         │
│         85         │
│       Ativos       │
└─────────────────────┘
```

### Especificações (CSS)

| Elemento | Tamanho | Estilo |
|----------|---------|--------|
| Ícone | 35px | flex-shrink:0 |
| Número | 18px | font-weight:700, color:#fff |
| Descrição | 14px | color:#fff (mesma cor do número) |

### Grid de Cards

- **Container**: `grid-template-columns: repeat(auto-fit, minmax(140px, 1fr))`
- **Gap**: 10px
- **Card**: border-radius:10px, padding:12px 14px

### Módulos Usando Este Padrão

- RH (dashboard unificado)
- ASO, Férias, Treinamentos, EPIs
- Suprimentos, Pré-Contratação

---

## Módulos Disponíveis

| Módulo | Ícone | Descrição |
|--------|-------|------------|
| RH | `users` | Colaboradores, Postos, Recrutamento & Seleção, Emitir Documentos |
| Férias | `umbrella` | Períodos aquisitivos, importação Excel, Feriados |
| CNV e Reciclagens | `book-open` | CNV, Reciclagem Vigilante, Formações (Bombeiro/Vigilante) |
| ASO | `heart` | Saúde Ocupacional (NR-7) |
| Treinamentos | `book-open` | Treinamentos, NRs (CNV, NR-35, NR-33) |
| EPIs | `shield` | Entrega de equipamentos |
| Suprimentos | `package` | Pedidos de materiais, fornecedores |
| Feriados | `calendar` | Cadastro de feriados |
| Ferramentas | `tool` | Verificação de Folha, Calculadora de Benefícios, Relatórios, Fundo de Caixa |
| Pastas | `folder` | Gerenciamento de pastas físicas/digitais dos funcionários e postos de trabalho |
| Ocorrências | `book-open` | Livro de Ocorrências Eletrônico — habilitação de postos, envio de senhas, sincronização de relatos via Supabase |

> **Nota**: Pré-Contratação e Vagas estão acessíveis via RH → Recrutamento & Seleção (abas)

---

## Documentos Trabalhistas

| Documento | Modal | Campos |
|-----------|-------|--------|
| Pedido de Demissão na Experiência | Data homologação | 1 |
| Pedido de Demissão Fora da Experiência | Data, horário, local + preview | 3+preview |
| Pedido de Demissão Trabalhado | Data início, endereço, data/horário | 3 |
| Aviso de Advertência | Irregularidade | 1 |
| Aviso Prévio Trabalhado | Data, endereço, data/horário | 3 |
| Dispensa na Experiência | Data dispensa, data homologação | 2 |
| Dispensa por Justa Causa | Data, motivo, retorno, acerto | 4 |
| Formulário de Vale Transporte | 2 opções (com dados / em branco) | — |
| Mudança de Posto | Data, posto/endereço, escala, horário | 4 |
| Convocação | Motivo, data, local/endereço, horário | 4 |

---

## Regras de Desenvolvimento

1. Sempre adicionar `type="text/javascript"` nos scripts
2. Usar `'use strict'` em todos os módulos
3. Dados em `window.GSS` (employees, vacations, asos, etc.)
4. Ao criar novo módulo: adicionar em MODULOS (app.js), criar arquivo, adicionar no switch (index.html)
5. Ícones do menu lateral usam SVG (Feather Icons) via `GSS.renderIcon(name)`. Adicionar novos ícones em `GSS.ICONS` no `app.js`.
6. **Deploy Cloudflare Pages (Formulário Externo)**: Ao enviar alterações para o repositório `gss-livro-ocorrencias-`, enviar **APENAS** os arquivos necessários para o funcionamento do módulo online. **NUNCA** enviar dados sensíveis (CSV de funcionários, fotos, documentos, configs com chaves). Arquivos permitidos: `dist/livro-remoto/index.html`, `dist/livro-remoto/logo-gss.png`. Consulte `docs/fluxo_desenvolvimento.md` → seção "Deploy do Formulário Externo" para detalhes.

---

## Utilitários Globais (GSS)

O sistema fornece funções utilitárias centraisizadas no `app.js`:

### Funções de UI

| Função | Descrição |
|--------|-----------|
| `GSS.toast(msg, type)` | Exibe notificação (type: 'ok', 'err', 'wrn') |
| `GSS.confirm(msg, onConfirm, onCancel)` | Modal de confirmação estilizado |
| `GSS.showLoading(msg)` | Exibe spinner de carregamento |
| `GSS.hideLoading()` | Remove spinner |
| `GSS.om(id)` | Abre modal (display: flex) |
| `GSS.cm(id)` | Fecha modal (display: none) |
| `GSS.focus(id)` | Auto-focus em campo após abrir modal |

### Funções de Dados

| Função | Descrição |
|--------|-----------|
| `GSS.persistData(showToast)` | Salva dados no disco (Electron) ou localStorage |
| `GSS.saveDataToDisk(showToast)` | Escreve `dados-gss.zip` na pasta configurada |
| `GSS.saveToDADOS(showToast)` | No Electron: cria backup ou restaura; no navegador: download |
| `GSS.createBackup(silent)` | Cria backup em `BACKUPS/` com rotação FIFO |
| `GSS.loadDataFromDisk()` | Carrega dados de `dados-gss.zip` ou fallbacks |
| `GSS._tryAutoBackup()` | Verifica se precisa criar backup automático ao iniciar |
| `GSS.loadData()` | Reset dos arrays de dados |
| `GSS.uid()` | Gera ID único |
| `GSS.fmt(date)` | Formata data para DD/MM/AAAA |
| `GSS.parseBR(str)` | Parse de data BR para Date |
| `GSS.toIso(date)` | Converte para ISO YYYY-MM-DD |
| `GSS.addDays(date, n)` | Adiciona dias |
| `GSS.addYears(date, n)` | Adiciona anos |
| `GSS.empresa(re, emp?)` | Retorna {l, c}. Se `emp` fornecido, usa `emp.filial` primeiro, `emp.empresa` fallback. Se omitido, busca por RE em `GSS.employees`. **Sempre passar o objeto do colaborador quando disponível** |

### Funções de Renderização

| Função | Descrição |
|--------|-----------|
| `GSS.renderIcon(name)` | Retorna SVG inline de `GSS.ICONS[name]` ou o próprio `name` como fallback |
| `GSS.renderAll()` | Re-renderiza sidebar + topbar + content |
| `GSS.debounce(key, fn, ms)` | Debounce genérico |
| `GSS.debounceInput(el, fnName, ms)` | Debounce para inputs de busca |
| `GSS.exportExcel(html, filename)` | Exporta tabela para Excel |
| `GSS.renderSearchDropdown(options)` | Renderiza dropdown de busca padronizado |
| `GSS.getFirstAccessiblePage()` | Retorna a primeira página permitida para o usuário |

### Configurações Centralizadas

| Constante | Descrição |
|-----------|-----------|
| `GSS.CONFIG.EMPRESAS` | Array com empresas (GSS SERVIÇOS, GSS SEGURANÇA) |
| `GSS.CONFIG.getEmpresaPorFilialOuRe(re, emp)` | Retorna {l, c}. `emp.filial` primeiro (`'01'`=SEG, demais=SRV), `emp.empresa` fallback, lookup por RE se `emp` omitido. Passar `emp` sempre que disponível |
| `GSS.CONFIG.MESES` | Array com nomes dos meses |
| `GSS.CONFIG.ANOS` | Array com anos (10 anos a partir de -2) |
| `GSS.CONFIG.STATUS_COLABORADOR` | Array com status de colaboradores |

---

## Sistema de Backup (Electron)

### Localização

Os backups ficam em `DADOS\BACKUPS\` dentro da pasta de dados configurada (ex: `Z:\4 - SUPERVISÃO\GERENCIAL\DADOS\BACKUPS\`).

### Nomenclatura

```
dados-gss-backup-YYYY-MM-DD_HH-MM-SS.zip
```

Com horário para evitar colisão entre múltiplos usuários no mesmo dia.

### Rotação FIFO

Máximo **10 backups**. Ao criar o 11º, o(s) mais antigo(s) são deletados automaticamente.

### Backup Automático (ao iniciar)

Após carregar `dados-gss.zip` com sucesso:
1. Cria `BACKUPS\` se não existir
2. Verifica se já existe backup com a data de **hoje** (ignora horário)
3. Se não existir → cria `dados-gss-backup-HOJE_HORARIO.zip` silenciosamente (sem toast)
4. Aplica rotação FIFO

### Botões na Topbar

#### Modo Normal (`GSS.backupMode = false`)

| Botão | Comportamento |
|-------|--------------|
| 📂 Carregar Dados | Abre modal listando backups disponíveis em `BACKUPS\` |
| 💾 Salvar Dados | Cria backup manual em `BACKUPS\` com toast de confirmação |

#### Modo Backup (`GSS.backupMode = true`)

Ativado ao carregar um backup pelo modal.

| Elemento | Comportamento |
|----------|--------------|
| Badge | `⚠️ Backup — 2026/05/28 14:30` (laranja) na topbar |
| Botão 💾 | Muda para `♻️ Restaurar Backup` (laranja) |
| 🔄 persistData() | **Não salva no disco** — só cacheia usuários no localStorage |

#### Fluxo de Restauração

1. Clicar em 📂 Carregar Dados
2. Selecionar um backup da lista
3. Dados carregados em memória → badge aparece → modo backup ativo
4. Clicar em ♻️ Restaurar Backup
5. Confirmação: "Tem certeza que deseja sobrescrever os dados atuais com o backup de (data)?"
6. Se confirmar → `saveDataToDisk()` sobrescreve `dados-gss.zip` → badge some

### Arquivos Envolvidos

| Arquivo | O que implementa |
|---------|-----------------|
| `electron/main.js` | IPC `listBackups(folderPath)` + `deleteFile(filePath)` |
| `electron/preload.js` | Exposição dos IPCs via `apiLocal` |
| `src/js/app.js` | `GSS.backupMode`, `GSS.backupFile`, `GSS.createBackup()`, `GSS.getBackupsDir()`, `GSS.rotateBackups()`, `GSS.hasBackupToday()`, `GSS._tryAutoBackup()`, `GSS.loadBackupListUI()`, `GSS.loadBackupFromList()` |
| `src/index.html` | Topbar: badge dinâmico + label do botão Salvar |

---

## Document Print Flow (Electron)

> **Status**: ⚠️ Funcional, porém o fluxo ainda não está implementado da melhor forma — sujeito a refinamentos futuros.

### Fluxo

1. Usuário clica **"Imprimir"** em qualquer documento trabalhista
2. `modulo-documentos.js` chama `window.open()` → interceptado pelo mock window em `app.js`
3. Mock window captura todo o HTML gerado via `document.write()`
4. Ao fechar (`document.close()`), envia o HTML capturado via IPC `api:saveDocAsPdf`
5. **Main process** (`electron/main.js`):
   - Lê `src/MIDIAS/header-documentos.png`, converte para base64 data URI
   - Substitui referências `MIDIAS/header-documentos.png` no HTML pela data URI
   - Escreve HTML em arquivo temporário
   - Cria `BrowserWindow` oculta (`show: false`) e carrega o arquivo
   - Aguarda 800ms para renderização de imagens/fontes
   - Gera PDF via `webContents.printToPDF()` (A4, `printBackground: true`)
   - Abre diálogo nativo `dialog.showSaveDialog()` para escolher destino
   - Salva PDF no caminho escolhido e limpa arquivos temporários
6. Toast "PDF salvo!" confirmando sucesso ou mensagem de erro

### Arquivos Envolvidos

| Arquivo | O que implementa |
|---------|-----------------|
| `electron/main.js` | IPC `api:saveDocAsPdf`: inlines header image → hidden window → `printToPDF()` → `showSaveDialog()` |
| `electron/preload.js` | Expõe `saveDocAsPdf(html)` via `apiLocal` |
| `src/js/app.js` | Mock de `window.open` captura HTML, chama `apiLocal.saveDocAsPdf()` no `close()` |

---

## Padrões de Busca com Dropdown

O módulo RH e outros módulos usam busca dinâmica com dropdown:

- **Busca**: `oninput="GSS.debounceInput(this, 'Module.buscaEmp', 180)"` (com debounce 180ms)
- **Filtragem**: Por nome, RE, função (não posto - posto tem filtro próprio)
- **Dropdown**: Máximo 10 resultados, container com `position:absolute`, `z-index:1000`
- **Seleção**: Função `selEmp(id)` atualiza input e exibe info do funcionário

---

## Importação de Planilha RH

### Formato CSV (v2.12.0)

A importação aceita apenas arquivos `.csv` no formato Protheus (259+ colunas para colaboradores, 83 colunas para postos).

**Parsing**: Formato não-padrão com aspas duplas envolvendo cada campo. Parser customizado (`parseCsvLine`) que:
1. Remove aspas externas da linha
2. Divide por `","` (separador entre campos quoted)
3. Remove aspas residuais e converte `""` → `"`

**Codificação**: ISO-8859-1 (`FileReader.readAsText(file, 'ISO-8859-1')`)

**Detecção de header**: Escaneia as primeiras 5 linhas procurando por `MATRICULA`/`RE` (colaboradores) ou `C CUSTO`/`NOME TOMADOR` (postos).

### Empresa por Nome do Arquivo

| Nome do Arquivo | Empresa | Filial |
|-----------------|---------|--------|
| Contém `seguranca` | GSS SEGURANÇA | 01 |
| Qualquer outro | GSS SERVIÇOS | 02 |

### Mapeamento de Colunas (Colaboradores)

Usa `hdrFind(termo)` (substring) e `hdrExact(termo)` (match exato) para localizar colunas dinamicamente:

| Campo | Busca | Descrição |
|-------|-------|-----------|
| `re` | `MATRICULA` | Matrícula (RE) |
| `nome` | `NOME COMPLET` | Nome completo |
| `centroCusto` | `CENTRO CUSTO` | Centro de custo (chave de vinculação com posto) |
| `funcao` | `DESC.FUNCAO` / `FUNCAO` | Cargo |
| `salario` | `SAL.BASE.DIS` | Salário nominal |
| `cpf` | `C.P.F.` | CPF |
| `rg` | `R.G.` | RG |
| `ufRG` | `UF-RG` | UF de expedição do RG |
| `pis` | `P.I.S.` | PIS |
| `sitFolha` | `SIT. FOLHA` | A=afastado, D=desligado, vazio=ativo |
| `sexo` | `SEXO` | Sexo |
| `nomePai` | `NOME PAI` | Nome do pai |
| `nomeMae` | `NOME MAE` | Nome da mãe |
| `estCivil` | `EST. CIVIL` | Estado civil |
| `email` | `EMAIL` | E-mail |
| `dataNascimento` | `DATA NASC` | Data ISO |
| `dataAdmissao` | `DATA ADMIS` | Data ISO |
| `dataDemissao` | `DT. DEMISSAO` | Data ISO |
| `tipoLograd` | `TIPO LOGRAD` | Tipo do logradouro (Rua, Av, Trav, etc.) |
| `descrLograd` | `DESCR.LOGRAD` | Descrição do logradouro |
| `numero` | `NRLOGRADOURO` | Número |
| `complemento` | `COMPL.ENDER` | Complemento |
| `bairro` | `BAIRRO` | Bairro |
| `municipio` | `MUNICIPIO` | Município |
| `uf` | `ESTADO` | UF |
| `cep` | `CEP` | CEP |
| `venctoExp1` | `VEN. EXPER` | Vencimento 1º experiência |
| `venctoExp2` | `VCTO EXP` | Vencimento 2º experiência |

### Mapeamento de Colunas (Postos)

| Campo | Busca | Descrição |
|-------|-------|-----------|
| `cc` | `C CUSTO` | Centro de Custo (chave) |
| `nome` | `NOME TOMADOR` | Nome do posto |
| `cnpj` | `CNPJ` | CNPJ do tomador |
| `endereco` | `END.TOMADOR` | Endereço |
| `bairro` | `BAIR.TOMADOR` | Bairro |
| `cidade` | `MUN.TOMADOR` | Cidade |
| `uf` | `ESTADO` | UF |
| `cep` | `CEP TOMADOR` | CEP |
| `cancelado` | `CANCELADO` | SIM/CANCELADO → ignorar |
| `ccBloq` | `CC BLOQ` | BLOQUEADO → ignorar |
| `codMunicipio` | `COD.MUNIC` | Código município |

### Status via SIT. FOLHA

- `A` → afastado (Afastado INSS)
- `D` → desligado
- vazio → ativo

### Chave de Upsert

`RE + Filial` como chave composta. Isso garante que importações de Serviços (filial 02) e Segurança (filial 01) são independentes.

### Divergência de Dados

**Colaboradores**: Snapshot `_imported` salvo no import. Campos monitorados: `filial`, `centroCusto`, `funcao`, `salario`. Se valor atual difere do importado → exibe badge ⚠ e dot laranja. Detalhes no modal FAC.

**Postos**: Array `_divergencias[]` com nomes dos campos protegidos que divergem. Campos protegidos: `nome`, `cnpj`, `endereco`, `bairro`, `cidade`, `estado`, `cep`. Se original tem valor e CSV difere → divergência registrada, valor original preservado.

### Preservação de Dados Manuais

- **Colaboradores**: Dados editados manualmente não são sobrescritos na re-importação
- **Postos**: Campos protegidos não são sobrescritos se o posto já existir com valor. Valores ausentes no posto são preenchidos pelo CSV.

---

## Status de Colaborador (RH)

### Status Disponíveis

| Status | Cor | Hex | Descrição |
|--------|-----|-----|------------|
| Ativo | Verde | #15803d | Colaborador em atividade |
| Afastado | Laranja | #b45309 | Afastado pelo INSS |
| Desligado | Vermelho | #b91c1c | Colaborador desligado |

### Regras do Status

Apenas colaboradores com status "ativo" participam de:
- Dashboard de ativos
- Alertas de ASO
- Alertas de Férias
- Alertas de Treinamentos
- Contagem por posto

Colaboradores com status "afastado" são excluídos dessas contagens, mas:
- Seu histórico é preservado
- Ao retornar para "ativo", volta a participar normalmente

---

## Postos de Trabalho (RH)

### Localização

- **Menu**: RH → Postos de Trabalho
- **Página**: `rhpostos`
- **Rota**: `RHModule.rpostos()`

### Estrutura de Dados

```javascript
{
  id: "D000041",                     // ID único (mesmo do CC na criação)
  nome: "REC SAPUCAI",              // Nome do posto (obrigatório)
  cc: "D000041",                    // Centro de Custo (obrigatório, único)
  empresa: "GSS SERVIÇOS",          // "GSS SERVIÇOS" | "GSS SEGURANÇA"
  cnpj: "05.784.526/0002-04",       // CNPJ do tomador (importado via CSV)
  servico: "Vigilância",            // Tipo de serviço
  endereco: "Rua Exemplo, 123",     // Endereço completo
  bairro: "Centro",                 // Bairro
  cidade: "Rio de Janeiro",         // Cidade
  estado: "RJ",                     // UF
  cep: "22250-905",                 // CEP (importado via CSV)
  codMunicipio: "3304557",          // Código do município (importado via CSV)
  lat: -22.9068,                    // Latitude (geocodificação Nominatim)
  lng: -43.1729,                    // Longitude (geocodificação Nominatim)
  obs: "Observações",               // Observações
  ativo: true,                      // true=Ativo, false=Inativo
  _divergencias: [],                // Array de campos divergentes da importação CSV
  contatos: [],                     // Array de contatos do posto { nome, cargo, email, telefone }
  criadoEm: "2026-04-20T10:00:00", // Auditoria
  criadoPor: "diogo.benites",      // Auditoria
  alteradoEm: "2026-06-18T14:00:00",// Auditoria (apenas edição)
  alteradoPor: "diogo.benites"      // Auditoria (apenas edição)
}
```

### Interface

- **Cadastro/Edição**: Modal `#mposto` com campos: Nome *, Centro de Custo *, Empresa (select GSS SERVIÇOS / GSS SEGURANÇA), CNPJ, Serviço, Endereço, Bairro, Cidade, Estado (UF), CEP, Observações, Ativo (checkbox)
- **Tabela**: Colunas Nome, CC, Empresa (badge azul para Serviços / amarelo para Segurança), Serviço, Cidade, Colaboradores, Status (Ativo/Inativo), Ações (Editar/Excluir)
- **Agrupamento por CNPJ**: Postos com mesmo CNPJ são agrupados em linhas expansíveis (▶/▼). Grupo exibe nome, quantidade de CCs, total de colaboradores. Filhos exibidos com prefixo ↳ e fundo claro. Postos sem CNPJ ou com único CC no CNPJ aparecem como linhas normais.
- **Badge de Divergência**: Se o posto tem `_divergencias.length > 0`, exibe badge ⚠ laranja no nome do posto na tabela
- **Busca**: Campo de texto com debounce 220ms — filtra por nome, empresa, CC, serviço ou cidade
- **Filtro**: Select de status (Todos / Ativos / Inativos)
- **Ordenação**: Clicável por qualquer coluna com indicador ▲▼
- **Contagem**: Cada posto exibe badge com número de colaboradores ativos vinculados (contagem via `centroCusto === p.cc`)

### Slide Panel de Detalhes

Painel deslizante com três abas:

| Aba | Conteúdo |
|-----|----------|
| **Principal** | Nome, CC, Empresa (badge), Serviço, Status (Ativo/Inativo), Auditoria (criado/alterado em/por), **Colaboradores Ativos vinculados** |
| **Endereço** | Endereço, Bairro, Cidade, Estado (UF), **Mapa interativo (Leaflet/OpenStreetMap) com geocodificação Nominatim**, botões "🔍 Buscar no mapa", "📍 Abrir no Google Maps", "📤 Compartilhar" |
| **Contatos** | Formulário de cadastro (Nome*, Cargo*, Email*, Telefone) + tabela com botão de exclusão 🗑️ + botão "Enviar E-mail para Todos" (abre Outlook via `mailto:` com separador `;`) |

Ações no footer: Botão "📂 Abrir Pasta" → modal flutuante de pastas do posto + Fechar.

### CRUD

| Operação | Função | Descrição |
|----------|--------|-----------|
| Novo | `RHModule.openPostoNew()` | Abre modal limpo com empresa padrão "GSS SERVIÇOS" e ativo=true |
| Editar | `RHModule.openPostoEdit(id)` | Abre modal preenchido com dados do posto |
| Salvar | `RHModule.savePosto()` | Valida campos obrigatórios (nome, CC), verifica unicidade do CC, persiste em `GSS.postoTrabalho`. Na criação, chama `PastasPostosModule.criarPastaPosto()`. Na edição com mudança de status, chama `PastasPostosModule.moverPastaPosto()` |
| Excluir | `RHModule.delPosto(id)` | Confirma exclusão; alerta se houver colaboradores ativos vinculados ao posto |
| Excluir (confirmado) | `RHModule.delPostoConfirmed(id)` | Remove do array e persiste |

### Relação com Colaboradores

O vínculo entre colaborador e posto é feito por **centro de custo** (`employee.centroCusto` ↔ `posto.cc`):

- `employee.centroCusto` armazena o código CC bruto do CSV (ex: `D000041`)
- `employee.postoServico` armazena o label formatado do posto (ex: `REC SAPUCAI (D000041)`)
- A contagem de colaboradores por posto usa `e.centroCusto === p.cc` (match direto por CC)
- O filtro de postos na listagem de colaboradores compara `e.postoServico` com o label do dropdown

### Vinculação Automática (`relinkPostos`)

A função `relinkPostos()` resolve o vínculo entre colaboradores e postos:

1. Cria um mapa de postos por CC (`ccMap[cc] = posto`)
2. Para cada colaborador: se `postoServico === centroCusto` (CC bruto, sem label) e existe um posto com esse CC → atualiza `postoServico` para `nome (cc)`
3. Retorna o número de colaboradores vinculados

**Onde é chamada:**
- Após importar colaboradores (`handleImport`) — vincula quem tem CC bruto
- Após importar postos (`handleImportPostos`) — vincula todos os colaboradores com CC correspondente
- Na inicialização do módulo (migração IIFE) — corrige dados existentes

**Ordem de importação irrelevante**: colaboradores podem ser importados antes ou depois dos postos. O `relinkPostos()` resolve o vínculo automaticamente.

### Importação de Postos (cc_*.csv)

Postos são importados via CSV (`cc_servicos.csv` / `cc_seguranca.csv`) usando o botão "📥 Importar CSV" na tela de Postos. A empresa é determinada pelo nome do arquivo (`seguranca` → GSS SEGURANÇA, senão GSS SERVIÇOS).

**Filtragem**: Linhas com `CANCELADO=SIM` ou `CC BLOQ=BLOQUEADO` são ignoradas.

**Proteção de dados**: Campos protegidos (`nome`, `cnpj`, `endereco`, `bairro`, `cidade`, `estado`, `cep`) não são sobrescritos se o posto já existir e tiver valor. Divergências são registradas em `_divergencias[]`.

**Pós-importação**: `relinkPostos()` é chamado automaticamente para vincular colaboradores cujo `centroCusto` bate com o CC de um posto importado.

### Importação de Colaboradores (csv_funcionarios_*.csv)

Colaboradores são importados via CSV. O `centroCusto` do CSV é comparado com os CCs dos postos existentes. Se encontrado, `postoServico` é definido como `nome (cc)`. Se não encontrado, `postoServico` fica com o CC bruto — o `relinkPostos()` resolve depois quando postos forem importados.

**A função `ensurePostoFromCentroCusto` foi removida** — o sistema não cria mais postos automaticamente durante a importação de colaboradores.

### Funções do Módulo

| Função | Descrição |
|--------|-----------|
| `RHModule.rpostos()` | Renderiza página de listagem com filtros, busca, ordenação, agrupamento CNPJ e ações |
| `RHModule.openPostoNew()` | Abre modal para novo posto |
| `RHModule.openPostoEdit(id)` | Abre modal para editar posto |
| `RHModule.savePosto()` | Salva/atualiza posto + hooks de pastas. Limpa `_divergencias` ao editar manualmente |
| `RHModule.openPostoDetail(id)` | Abre slide panel de detalhes (com CNPJ, CEP, divergências) |
| `RHModule.switchPostoDetailTab(tab)` | Alterna entre abas Principal/Endereço/Contatos |
| `RHModule.closePostoDetail()` | Fecha slide panel |
| `RHModule.delPosto(id)` | Confirma exclusão (alerta se houver colabs ativos via `centroCusto === p.cc`) |
| `RHModule.delPostoConfirmed(id)` | Executa exclusão |
| `RHModule.togglePostoGrupo(cnpj)` | Expande/recolhe grupo de postos com mesmo CNPJ |
| `RHModule.openImportPostos()` | Abre seletor de arquivo CSV para importar postos |
| `RHModule.handleImportPostos(input)` | Processa CSV de postos, filtra Cancelado/Bloqueado, detecta divergências, chama `relinkPostos()` |
| `RHModule.handleImport(input)` | Processa CSV de colaboradores, mapeia CC para posto existente, chama `relinkPostos()` |
| `resolvePostoLabel(cc)` | Retorna `nome (cc)` dado um CC, ou o CC bruto se posto não encontrado |
| `relinkPostos()` | Vincula colaboradores a postos: se `postoServico === centroCusto` e existe posto com esse CC → atualiza label. Retorna nº de alterações |
| `getPostoOptionsHtml(selected)` | Gera `<option>` HTML para dropdowns (apenas postos ativos) |
| `RHModule._ensurePostoMapButtons(p)` | Cria ou atualiza botões "Google Maps" e "Compartilhar" no side panel |
| `RHModule.geocodePosto(id)` | Busca coordenadas (lat/lng) via Nominatim a partir do endereço do posto |
| `RHModule.initPostoMap(id)` | Inicializa mapa Leaflet no side panel com marcador draggable |
| `RHModule.addPostoContato()` | Adiciona contato (nome, cargo, email, telefone) à lista do posto |
| `RHModule.removePostoContato(idx)` | Remove contato da lista pelo índice |
| `RHModule.enviarEmailContatos()` | Abre Outlook com `mailto:` para todos os contatos (separador `;`) |

### Arquivos Envolvidos

| Arquivo | O que implementa |
|---------|-----------------|
| `src/js/modulo-rh.js` | Todo CRUD de postos (`rpostos`, `savePosto`, `delPosto`, `openPostoDetail`, etc.) + helper `getPostoOptionsHtml` |
| `src/js/modulo-pastas-postos.js` | Criação/movimentação automática de pastas via hooks em `savePosto` |
| `src/index.html` | Modal `#mposto` (cadastro/edição) + rota `case 'rhpostos'` |
| `src/js/app.js` | State `GSS.postoTrabalho` + persistência em `dados-gss.zip` |
| `src/css/estilos.css` | Classes `.ef-posto`, `.ef-posto-title`, `.ef-posto.ef-over` |

---

## Slide Panel de Detalhes do Colaborador

### Estrutura

Painel deslizante (50% da tela) com duas abas:

| Aba | Conteúdo |
|-----|----------|
| **Principal** | Foto 3x4 (160x200px), Nome, RE, Status, Empresa, Posto, Função, Tipo Contratação, CPF, RG, PIS, Data Admissão, Data Demissão, Observações, Auditoria |
| **Detalhes** | Nome do Pai, Nome da Mãe, Estado Civil, Sexo, E-mail, Endereço, Bairro, Município/UF, CEP, Tipo de Contratação, Venc. Experiência, Venc. Experiência 2, Auditoria |

As abas são alternadas via `RHModule.switchColabTab(tab)`, definido dentro de `openColabDetail` para evitar conflito com a função homônima do módulo principal.

### Fotos 3x4

Localização (Electron): `{pasta_do_funcionario}/FOTO 3X4/`

Nome do arquivo: `RE_NOME.jpg`
Exemplo: `80123-JOAO_SILVA.jpg`

Fallback para `MIDIAS/FOTOS_3X4/` via protocolo `midias://` quando a foto não existe na pasta do funcionário.

### Como Adicionar Foto (Electron)

1. Clicar na linha do colaborador → abre side panel
2. Hover sobre a foto → botão "Alterar Foto 3x4"
3. Clicar no botão → seletor de arquivos
4. Selecionar imagem
5. A foto é salva automaticamente na subpasta `FOTO 3X4` da pasta do funcionário via Electron IPC `writeEmployeeFoto`
6. O painel lê a foto via `readEmployeeFoto` ao abrir (fallback `midias://` se não encontrar)
7. Refresh para aparecer

---

## Side Panel de Férias

### Localização

Abre ao clicar em qualquer linha da tabela de férias no dashboard.

### Estrutura

Painel deslizante da direita (42% da tela) com todos os dados da férias clicada:
- Seções: Colaborador, Férias, Observações (se houver), Auditoria
- Botões de ação no footer

### Ações do Panel

| Botão | Estilo | Ação |
|-------|--------|------|
| 🗑️ Apagar | vermelho | Fecha o panel e abre o modal de confirmação de exclusão |
| Fechar | outline | Fecha o panel |
| ✏️ Editar | primary | Fecha o panel e abre o editor de férias |

### Funções do Módulo

- `openVacDetails(id)` - Abre o panel com detalhes da férias
- `closePanel()` - Fecha o panel e remove o overlay
- `openVacEdit(id)` - Fecha o panel e abre o modal de edição
- `delFromPanel(id)` - Fecha o panel e abre confirmação de exclusão
- `evSetMode(m)` - Alterna entre modo Data e modo Mês no editor

---

## Cadastro de Férias

### Sistema de Busca de Colaborador

O cadastro de férias utiliza busca dinâmica com dropdown para localizar colaboradores:

- **Campo de busca**: Input com placeholder "Digite nome ou RE..."
- **Debounce**: 180ms (`GSS.debounceInput`)
- **Filtragem**: Por nome OU RE do funcionário (apenas ativos)
- **Dropdown**: Máximo 10 resultados, posicionado abaixo do input
- **Seleção**: Função `FeriasModule.selEmp(id)` atualiza o campo e exibe card do colaborador

### Estrutura do Slot

```javascript
{
  id: "uuid",
  foundEmp: null,      // Objeto do funcionário selecionado
  empSrch: '',         // Texto da busca
  dateMode: 'especifica', // 'especifica' | 'mesano'
  dataIni: '',         // Data ISO (YYYY-MM-DD)
  selM: 0,             // Mês selecionado (0-11)
  selY: 2026,          // Ano selecionado
  dias: '30',          // '20' | '30'
  pa: null,            // Período aquisitivo selecionado
  obs: '',             // Observações
  errs: {}             // Erros de validação
}
```

### Funções do Módulo

| Função | Descrição |
|--------|-----------|
| `FeriasModule.buscaEmp(val)` | Renderiza dropdown com colaboradores encontrados |
| `FeriasModule.selEmp(id)` | Seleciona colaborador, auto-seleciona PA, atualiza slot |
| `FeriasModule.refreshslot(i)` | Re-renderiza slot após alterações |
| `FeriasModule.rslot(s, i)` | Renderiza HTML do slot com novo sistema de busca |
| `FeriasModule.newslot()` | Cria slot com estrutura limpa (sem campos ep/re4) |

### Fluxo do Cadastro

1. Usuário digita no campo de busca (mínimo 2 caracteres)
2. Debounce de 180ms aguarda término da digitação
3. `buscaEmp()` filtra colaboradores ativos por nome OU RE
4. Dropdown exibe até 10 resultados com nome, RE e função
5. Ao clicar em um resultado, `selEmp()`:
   - Define `foundEmp` com o funcionário selecionado
   - Atualiza `empSrch` com o nome do funcionário
   - Auto-seleciona o próximo período aquisitivo disponível
   - Fecha o dropdown e re-renderiza o slot
6. Card do colaborador aparece com informações (Posto, Função, Admissão)
7. Período aquisitivo é selecionado automaticamente se disponível

---

## Editor de Férias com Modo Data/Mês

### Estrutura do Modal

O modal de edição (`mev`) permite informar a data de início de duas formas:

| Modo | Como funciona |
|------|---------------|
| **Data** | Campo manual DD/MM/AAAA |
| **Mês** | Seletores Mês + Ano → calcula automaticamente a 1ª segunda-feira do mês |

### Toggle Data/Mês

Dois botões no topo do modal:
- **📅 Data** — exibe campo manual
- **📆 Mês** — exibe seletores de mês/ano com preview da 1ª segunda-feira

### Preview do Retorno

O retorno é calculado em tempo real em ambos os modos:
- **Modo Data**: usa data digitada + dias de férias + próximo dia útil
- **Modo Mês**: usa 1ª segunda do mês/ano selecionado + dias de férias + próximo dia útil

### Reutilização

- `FeriasModule.firstMon(y, m)` - já existia no cadastro, reutilizada no editor
- `FeriasModule.evprev()` - preview de retorno unificado para ambos os modos
- `FeriasModule.saveev()` - lê do modo ativo e calcula corretamente

---

## Módulo Pré-Contratação

### Localização

- **Menu**: RH → Recrutamento & Seleção → Aba Pré-Contratação
- **Página**: `rhrecrutamento` → Aba Pré-Contratação

### Status

| Status | Cor | Hex |
|--------|-----|-----|
| Pendente | Cinza | #64748b |
| Entrevista | Cinza | #64748b |
| Pesquisa Social | Laranja | #b45309 |
| Aprovado | Azul | #0369a1 |
| Contratado | Verde | #15803d |
| Reprovado | Vermelho | #b91c1c |

### Campos do Cadastro

| Campo | Obrigatório | Descrição |
|-------|-------------|------------|
| Nome | ✅ | Nome completo |
| CPF | Não | CPF |
| RG | Não | RG |
| Mesmo do CPF | Não | Checkbox - copia CPF para RG |
| Nome do Pai | Não | Nome completo do pai |
| Nome da Mãe | Não | Nome completo da mãe |
| Telefone | Não | Telefone de contato |
| Vaga | ✅ | Dropdown das vagas ativas |
| Motivo | ✅ | Radio: Aumento de Quadro / Substituição de Pessoal |
| Nome do Substituto | Se substituição | Nome do funcionário a ser substituído |
| RE do Substituto | Se substituição | RE do funcionário a ser substituído |
| Status | ✅ | Select dos status disponíveis |
| Observações | Não | Textarea |

### Funcionalidades

- **Dashboard**: 6 cards com estatísticas por status
- **Tabela**: Nome, Posto, Função, Empresa, Substituindo, Status, Cadastro
- **Slide Panel**: Painel deslizante da direita com detalhes completos
- **Data de Cadastro**: Automática (DD/MM/AAAA HH:MM)
- **Última Alteração**: Automática (DD/MM/AAAA HH:MM)
- **Busca de Substituto**: Campo com autocomplete para buscar funcionário ativo por nome ou RE
- **Preservação de Dados**: Ao editar, dados do candidato são mantidos corretamente
- **Sync de Vagas**: Vagas são sincronizadas automaticamente com GSS.syncVagas()

### Lógica de Status da Vaga

| Status do Candidato | Incrementa Vaga? |
|--------------------|-------------------|
| Contratado | ✅ Sim |
| Aprovado | ✅ Sim |
| Pesquisa Social | ❌ Não |
| Entrevista | ❌ Não |
| Pendente | ❌ Não |
| Reprovado | ❌ Não (decrementa se estava contratado/aprovado antes) |

---

## Módulo de Vagas

### Localização

- **Menu**: RH → Recrutamento & Seleção → Aba Vagas
- **Página**: `rhrecrutamento` → Aba Vagas

### Estrutura de Dados

```javascript
{
  id: "uuid",
  posto: "Golgi Caxias",
  funcao: "Bombeiro",
  empresa: "GSS SERVIÇOS",
  quantidade: 3,
  preenchidas: 1,
  status: "EM_ANDAMENTO",
  dataAbertura: "2026-04-20",
  obs: ""
}
```

### Status de Vagas

| Status | Descrição |
|--------|------------|
| ABERTA | Vaga disponível |
| EM_ANDAMENTO | Candidato(s) em processo |
| PREENCHIDA | Todas as vagas preenchidas |
| CANCELADA | Vaga cancelada |

### Integração com Pré-Contratação

| Status do Candidato | Status da Vaga | Incrementa Preenchidas? |
|-------------------|----------------|------------------------|
| pendente | EM_ANDAMENTO | ❌ Não |
| entrevista | EM_ANDAMENTO | ❌ Não |
| pesquisa_social | EM_ANDAMENTO | ❌ Não |
| aprovado | EM_ANDAMENTO | ✅ Sim |
| contratado | PREENCHIDA | ✅ Sim |
| reprovado | ABERTA | ❌ Não (decrementa se estava contratado/aprovado) |

### Side Panel de Detalhes da Vaga

A página de Vagas possui um painel deslizante (direita para esquerda) que exibe detalhes da vaga ao clicar na linha:

- **Acesso**: Clicar em qualquer linha da tabela de vagas
- **Animação**: Slide da direita para esquerda (0.2s)
- **Conteúdo**: Função, Posto, Empresa, Cards (Total/Disp./Ocupadas), Status, Data Abertura, Observações
- **Lista de Candidatos**: Exibe candidatos vinculados (exceto reprovados) com botão "Ver"
- **Ação**: Botão "+ Incluir Candidato" abre formulário de pré-contratação com vaga pré-selecionada
- **Fechamento**: Botão × ou clique fora do panel

### Funções do Módulo

- `VagasModule.rdash()` - Dashboard com cards
- `VagasModule.rlista()` - Listagem com filtros
- `VagasModule.saveVaga()` - Cadastrar/editar vaga
- `VagasModule.incrementPreenchida()` - Incrementa vagas preenchidas
- `VagasModule.decrementPreenchida()` - Decrementa vagas preenchidas
- `VagasModule.updateVagaStatus()` - Atualiza status

---

## Dashboard Unificado de RH

### Estrutura

Novo dashboard que agrega métricas de todos os sub-módulos do RH em uma única tela.

### Seções

- **🏢 Efetivo por Empresa** - Gráfico de barras (topo)
- **📍 Top 5 Postos** - Postos com mais colaboradores (topo)
- **👥 Colaboradores** - Cards: Ativos, Afastados, Desligados, Total
- **📋 Recrutamento & Seleção** - Cards: Pendente, Entrevista, Pesq. Social, Aprovado, Contratado, Reprovado
- **📋 Vagas** - Cards: Abertas, Em Andamento, Preenchidas, Canceladas
- **⚠️ Alertas** - ASO, Férias, Treinamentos pendentes

### Funcionalidades

- Cards clicáveis que navegam para o módulo específico
- Alertas em vermelho quando há pendências
- Badge do menu RH soma alertas de todos os sub-módulos

---

## Menu Lateral Simplificado

Módulos com apenas 1 página aparecem como link direto (sem seta ▶, sem submenu).

Exemplo: Ferramentas abre diretamente sem precisar expandir submenu.

---

## Aba FAC Pendentes (Colaboradores)

### Localização

- **Menu**: RH → Colaboradores → Aba **FAC Pendentes**
- **Página**: `rhcolab` (mesma página, nova aba)

### Visão Geral

A aba "FAC Pendentes" lista todos os funcionários que possuem divergências entre os dados importados (snapshot `_imported`/`_original`) e os valores atuais. Os 4 campos monitorados são: **Empresa (filial), Centro de Custo, Função e Salário**.

### Funcionalidades

| Funcionalidade | Descrição |
|----------------|-----------|
| **Contador** | Badge na aba com o número total de funcionários com divergência |
| **Tabela** | Lista com Nome, RE, Empresa (badge), Posto, Função, Campos Divergentes, Ações |
| **Badges de campo** | Cada campo divergente exibido como badge laranja (`bdiver`) — ex: `Salário`, `Função`, `Centro de Custo` |
| **Ordenação** | Clicável por coluna (Nome, RE, Empresa, Posto, Função) com indicador ▲▼ |
| **Seleção** | Checkboxes individuais + "Selecionar todos" |
| **Ver FAC** | Botão "👁 Ver FAC" por linha — abre o modal FAC existente |
| **Batch (placeholder)** | Botão "📄 Gerar FACs Selecionados" — preparado para futura geração de documentos em lote |
| **Estado vazio** | Mensagem "Nenhum funcionário com divergência" quando não há pendências |

### Estado do Módulo

| Propriedade | Descrição |
|-------------|-----------|
| `RHModule.colabActiveTab` | Aba ativa: `'lista'` (colaboradores) ou `'fac'` (FAC pendentes) |
| `RHModule.facSort` | Ordenação: `{ col: 'nome', dir: 'asc' }` |
| `RHModule.facSelecionados` | Array de IDs dos funcionários selecionados |

### Funções

| Função | Descrição |
|--------|-----------|
| `RHModule.rcolabfac()` | Renderiza a listagem de FACs pendentes |
| `RHModule.switchColabTab(tab)` | Alterna entre abas (chama `renderContent()`) |
| `RHModule.toggleFac(id, checked)` | Marca/desmarca checkbox individual |
| `RHModule.toggleAllFac(checked)` | Marca/desmarca todos os checkboxes |
| `RHModule.gerarFacsSelecionados()` | Placeholder para geração em lote |

### Atualização em Tempo Real

- Ao salvar um colaborador sem divergência, ele some da lista automaticamente
- Ao editar e criar divergência, o funcionário aparece na aba FAC
- Ao importar planilha, novos funcionários com divergência aparecem imediatamente

### Arquivos Envolvidos

| Arquivo | O que implementa |
|---------|-----------------|
| `src/js/modulo-rh.js` | Estado (`colabActiveTab`, `facSort`, `facSelecionados`) + funções (`rcolabfac`, `switchColabTab`, `toggleFac`, `toggleAllFac`, `gerarFacsSelecionados`) + `rcolab()` modificado para renderizar abas |
| `src/css/estilos.css` | Classes `.colab-tabs`, `.colab-tab`, `.colab-tab.active` + dark mode |

---

## Módulo Suprimentos

### Localização

- **Menu**: Suprimentos
- **Página**: `suprimentos`

### Funcionalidades

| Ferramenta | Descrição |
|------------|-----------|
| Dashboard | Visão geral de pedidos, fornecedores, materiais |
| Comparativo Mensal | Comparação de gastos entre meses (2-4 meses, filtros independentes) |
| Exportar Excel | Exporta com totais por fornecedor (PANRIO/OUTROS) |
| Relatório PDF | Gera relatório em PDF dos pedidos |
| Detalhamento por Local | Expansível por local de trabalho |

### Comparativo Mensal

- Seleção independente de 2 a 4 meses
- Exibe lado a lado: Top 10 Crescimento + Top 10 Redução
- Permite analisar evolução de custos por material

### Detalhamento por Material (Compilação)

- Clicar no nome do material abre **side panel** deslizante (direita para esquerda, 45% da tela)
- Panel exibe: nome do material (com badge PANRIO se aplicável) + listagem por posto + TOTAL
- Removida coluna de numeração (#)
- Nome do material sem aparência de hyperlink

### Side Panel de Detalhes

- **Acesso**: Clicar no nome do material na tabela de compilação
- **Animação**: Slide da direita para esquerda (0.2s)
- **Conteúdo**: Nome do material + tabela com Posto | Quantidade + TOTAL
- **Fechamento**: Botão × ou clique fora do panel

---

## Módulo Ferramentas

### Localização

- **Menu**: Ferramentas (menu raiz, sem submenu)
- **Página**: `ferramentas`

### Ferramentas Disponíveis

| Ferramenta | Descrição |
|------------|-----------|
| Verificação de Folha | Lista de funcionários por posto com checkboxes para verificar folha de pagamento |
| Calculadora de Benefícios | Cálculo de VT, VR e Horas Extras (HE 50% e HE 100%) |
| Relatórios | Relatórios por posto, função e empresa |
| Requisição PIX | Gera arquivo TXT para solicitação de PIX |

### Verificação de Folha

- Lista por posto de trabalho (acordeão expansível)
- Filtro por empresa (GSS SERVIÇOS / GSS SEGURANÇA)
- Checkboxes para marcar funcionários verificados
- Botões "Expandir Todos" / "Recolher Todos"
- Somente colaboradores com status "ativo"

### Calculadora de Benefícios

- Salário base, dias lavorados
- Vale-Transporte (% ou valor fixo por dia)
- Vale-Refeição (valor diário)
- HE 50% (quantidade + valor por hora)
- HE 100% (quantidade + valor por hora)
- **Resultados aparecem após clicar "CALCULAR"**
- Quebra de linha automática nos valores

### Requisição PIX

Funcionalidade para gerar arquivo TXT com dados de múltiplos funcionários para solicitação de PIX.

- **Busca**: Por RE ou nome do funcionário
- **Campos do formulário**:
  - Escala (5x2, 6x1, 12x36)
  - Valor Diário
  - Chave PIX
  - Motivo
- **Lista temporária**: Adiciona múltiplos funcionários antes de gerar
- **Formato do TXT**:
  ```
  NOME COMPLETO
  RE: XXXXXX
  POSTO: Nome do Posto
  CHAVE PIX: chave@email.com
  ESCALA: 12x36
  VALOR DIÁRIO: 150
  MOTIVO: Ajuste de escala

  -------//-------
  ```

### Fundo de Caixa — VT (💵)

Ferramenta para gerar planilha de pagamento de Vale-Transporte (Fundo de Caixa).

- **Busca**: Por RE ou nome do funcionário (mesmo padrão PIX, debounce 180ms)
- **Dropdown**: Máximo 10 resultados, container `.gss-drop`
- **Motivo**: Dropdown com opções: VALE TRANSPORTE DIFERENÇA, VALE TRANSPORTE ADMISSÃO, OUTROS (exibe campo texto livre)
- **Data**: Input `type="date"`
- **Valor**: Input texto livre (formato brasileiro, ex: 150,00)
- **Lista temporária**: Adiciona múltiplos funcionários antes de gerar planilha
- **Ordenação**: Lista ordenada por data (mais antigo → mais recente)
- **Separação visual**: Funcionários divididos em duas seções — Serviços (azul) e Segurança (amarelo), cada uma com contagem de itens
- **Exportação Excel** (via ExcelJS):
  - Abas separadas: SERVIÇOS (cabeçalho azul #dbeafe) e SEGURANÇA (cabeçalho amarelo #fef3c7)
  - Colunas: HISTÓRICO, DATA (dd/mm/yyyy), CENTRO DE CUSTO, VALOR
  - Formato HISTÓRICO: `VT - RE{reSemZeros} - {DIFERENÇA|ADMISSÃO|motivo}`
  - Células centralizadas horizontal e verticalmente, bordas finas, fonte Calibri 10
  - Ordenação por data em cada aba

### Contestação

Geração de relatório de contestações em formato TXT.

- **Filtros**: Mês + Ano (selectores)
- **Dados**: Array `GSS.contestacoes`, filtrado por período
- **Tipos**: Salário, Vale, Insalubridade, Gratificação (Remuneração) / Passagem, Alimentação (Benefícios)
- **Separção**: Por empresa (Serviços vs Segurança) dentro de cada categoria
- **Formato TXT**:
  ```
  RELATÓRIO DE CONTESTAÇÕES — JUNHO/2026
  ════════════════════════════════════════

  SALÁRIO, VALE, INSALUBRIDADE, GRATIFICAÇÃO
  ──────────────────────────────────────────
  SERVIÇOS
    RE 001234 - João Silva - "Salário" - Descrição

  SEGURANÇA
    RE 002001 - Pedro Santos - "Insalubridade" - Descrição

  BENEFÍCIOS (ALIMENTAÇÃO E PASSAGEM)
  ──────────────────────────────────────────
  SERVIÇOS
    RE 001234 - João Silva - "Alimentação" - Descrição
  ```
- **Download**: Arquivo `Contestacoes_{Mês}_{Ano}.txt` via Blob + download link
- **Estado vazio**: Toast "Nenhuma contestação encontrada"

---

## Módulo Pastas — Funcionários (📁)

Gerenciamento de pastas físicas/digitais dos **funcionários** no disco (via Electron IPC).

### Estrutura de Diretórios

```
{dataFolder}\DADOS\FUNCIONARIOS\
├── SERVIÇOS\
│   ├── ATIVOS\
│   │   └── {RE} - {NOME}\
│   │       ├── ASO\
│   │       ├── DOCUMENTOS\
│   │       ├── OCORRÊNCIAS\
│   │       └── ATESTADOS\
│   ├── DESLIGADOS\
│   └── AFASTADOS\
└── SEGURANÇA\
    ├── ATIVOS\
    ├── DESLIGADOS\
    └── AFASTADOS\
```

### Localização no Menu

- **Side panel RH**: Botão "📂 Abrir Pasta" no slide panel do colaborador → modal flutuante com opções de subpastas
- **Configurações**: Botão "📦 Criar Pastas de Todos os Elegíveis" em ⚙️ Configurações
- **Automático**: Criação automática na admissão e movimentação na mudança de status via hooks em `saveColab()`

### Elegibilidade

Para criar pastas automaticamente, o funcionário deve atender a todos os critérios:

| Critério | Regra |
|----------|-------|
| RE válido | RE com exatamente 6 dígitos, **não** começando com `80` ou `57` |
| Status | ativo, ferias, desligado, inativo **ou** afastado |
| Admissão | `dataAdmissao >= 2021` (usa `GSS.parseBR` — aceita DD/MM/AAAA e AAAA-MM-DD) |

### Operações

| Função | Descrição |
|--------|-----------|
| `criarPastaFuncionario(emp)` | Cria estrutura de pastas para o funcionário (se elegível). Cria raiz + 4 subpastas |
| `abrirPastaFuncionario(emp, subpasta?)` | Abre a pasta no Windows Explorer (cria se não existir). Se `subpasta` informada, abre direto nela |
| `abrirPastaPorId(id)` | Busca funcionário por ID e abre pasta completa |
| `mostrarOpcoesPastasPorId(id)` | Abre modal flutuante com botões: Pasta Completa + ASO/DOCUMENTOS/OCORRÊNCIAS/ATESTADOS |
| `mostrarOpcoesPastas(emp)` | Renderiza modal diretamente a partir do objeto do funcionário |
| `fecharModalPastas()` | Fecha o modal flutuante |
| `moverPasta(emp, novoStatus)` | Move a pasta entre ATIVOS/DESLIGADOS/AFASTADOS conforme mudança de status |
| `verificarPasta(emp)` | Retorna `{ existe, subpastas: { ASO, DOCUMENTOS, ... } }` |
| `criarPastasEmLote()` | Cria pastas para **todos** os elegíveis que ainda não possuem pasta. Exibe log em tempo real |

### Modal Flutuante (Side Panel RH)

Ao clicar em "📂 Abrir Pasta" no side panel do colaborador:

```
┌─────────────────────────────────┐
│ 📁 Pastas — NOME DO FUNCIONÁRIO│
│ RE: 000715 · Posto · SRV/SEG   │
├─────────────────────────────────┤
│ 📂 Pasta Completa              │ ← azul (#0369a1)
│ 📁 ASO                         │
│ 📁 DOCUMENTOS                  │
│ 📁 OCORRÊNCIAS                 │
│ 📁 ATESTADOS                   │
├─────────────────────────────────┤
│            Fechar               │
└─────────────────────────────────┘
```

- Fundo escuro semi-transparente, clique fora fecha
- Cada botão abre o Windows Explorer direto na subpasta correspondente
- Cria a estrutura automaticamente ao abrir (não requer elegibilidade)

### Inicialização Automática

- Pastas raiz (SERVIÇOS/SEGURANÇA × ATIVOS/DESLIGADOS/AFASTADOS) são criadas no `init()`
- `saveColab()` no RH chama `criarPastaFuncionario(emp)` automaticamente na **admissão** e `moverPasta(emp, novoStatus)` na **mudança de status**
- Botão "📦 Criar Pastas de Todos os Elegíveis" em ⚙️ Configurações (apenas funcionários, não inclui postos)

### Arquivos Envolvidos

| Arquivo | O que implementa |
|---------|-----------------|
| `src/js/modulo-pastas.js` | Todo o módulo (helpers, operações, render, lote) |
| `src/js/modulo-rh.js` | Botão no side panel (chama `mostrarOpcoesPastasPorId`) + hooks em `saveColab` |
| `src/index.html` | Script tag |
| `electron/main.js` | IPC handlers: mkdirRecursive, openFolder, renameMove, folderExists |
| `electron/preload.js` | Exposição dos IPCs via `apiLocal` |

---

## Módulo Pastas — Postos de Trabalho (📁)

Gerenciamento de pastas físicas/digitais dos **postos de trabalho** no disco (via Electron IPC).

### Estrutura de Diretórios

```
{dataFolder}\DADOS\POSTOS\
├── SERVIÇOS\
│   ├── ATIVOS\
│   │   └── {CC} - {NOME}\
│   │       ├── TREINAMENTOS\
│   │       ├── DOCUMENTOS_LEGAIS\
│   │       └── MANUAIS\
│   └── INATIVOS\
└── SEGURANÇA\
    ├── ATIVOS\
    └── INATIVOS\
```

### Localização no Menu

- **Slide panel do posto**: Botão "📂 Abrir Pasta" no detail panel do posto → modal flutuante com opções de subpastas
- **Automático**: Criação automática ao cadastrar novo posto e movimentação ao alterar status ativo/inativo via hooks em `savePosto()`

### Mapeamento de Diretórios

| Campo do Posto | Diretório |
|----------------|-----------|
| `empresa` contém "SEGURANÇA" | `SEGURANÇA\` |
| senão | `SERVIÇOS\` |
| `ativo !== false` | `ATIVOS\` |
| `ativo === false` | `INATIVOS\` |
| Nome da pasta | `{cc sem zeros à esquerda} - {nome}` |

### Constantes

- **Subpastas**: `['TREINAMENTOS', 'DOCUMENTOS_LEGAIS', 'MANUAIS']`

### Operações

| Função | Descrição |
|--------|-----------|
| `init()` | Lê configuração de startup, define `_pastasPostosRaiz`, cria diretórios raiz (SERVIÇOS/SEGURANÇA × ATIVOS/INATIVOS) |
| `criarPastaPosto(posto)` | Cria estrutura de pastas para o posto. Cria raiz + 3 subpastas |
| `abrirPastaPosto(posto, subpasta?)` | Abre a pasta no Windows Explorer (cria se não existir). Se `subpasta` informada, abre direto nela |
| `abrirPastaPostoPorId(id)` | Busca posto por ID e abre pasta completa |
| `mostrarOpcoesPastasPostoPorId(id)` | Abre modal flutuante com botões: Pasta Completa + TREINAMENTOS/DOCUMENTOS_LEGAIS/MANUAIS |
| `mostrarOpcoesPastasPosto(posto)` | Renderiza modal diretamente a partir do objeto do posto |
| `fecharModalPastasPostos()` | Fecha o modal flutuante |
| `moverPastaPosto(posto, novoAtivo)` | Move a pasta entre ATIVOS/INATIVOS conforme mudança de status ativo |
| `verificarPastaPosto(posto)` | Retorna `{ existe, subpastas: { TREINAMENTOS, DOCUMENTOS_LEGAIS, ... } }` |

### Modal Flutuante (Slide Panel do Posto)

Ao clicar em "📂 Abrir Pasta" no slide panel de detalhes do posto:

```
┌─────────────────────────────────┐
│ 📁 Pastas — NOME DO POSTO      │
│ CC: D000041 · Serviço · SRV/SEG│
├─────────────────────────────────┤
│ 📂 Pasta Completa              │ ← azul (#0369a1)
│ 📁 TREINAMENTOS                │ ← ✅ Criada / ❌ Ausente
│ 📁 DOCUMENTOS_LEGAIS           │ ← ✅ Criada / ❌ Ausente
│ 📁 MANUAIS                     │ ← ✅ Criada / ❌ Ausente
├─────────────────────────────────┤
│            Fechar               │
└─────────────────────────────────┘
```

- Fundo escuro semi-transparente, clique fora fecha
- Cada botão abre o Windows Explorer direto na subpasta correspondente
- Cria a estrutura automaticamente ao abrir
- Status de cada subpasta indicado visualmente (✅ criada / ❌ ausente)

### Inicialização Automática

- Pastas raiz (SERVIÇOS/SEGURANÇA × ATIVOS/INATIVOS) são criadas no `init()`
- `savePosto()` no RH chama `criarPastaPosto(posto)` automaticamente na **criação** e `moverPastaPosto(posto, novoAtivo)` na **mudança de status ativo**

### Arquivos Envolvidos

| Arquivo | O que implementa |
|---------|-----------------|
| `src/js/modulo-pastas-postos.js` | Todo o módulo (helpers, operações, render, init automática) |
| `src/js/modulo-rh.js` | Hooks em `savePosto()` (chama `criarPastaPosto` e `moverPastaPosto`) + botão no detail panel |
| `src/index.html` | Script tag |
| `electron/main.js` | IPC handlers: mkdirRecursive, openFolder, renameMove, folderExists |
| `electron/preload.js` | Exposição dos IPCs via `apiLocal` |

---

## Permissões Granulares por Página

### Estrutura

O sistema permite configurar permissões específicas para cada página de um módulo.

### Estrutura de Dados

```javascript
// Permissão com páginas específicas
{
  rh: {
    view: true,
    edit: false,
    paginas: ['rhcolab', 'rhpostos']
  }
}

// Permissão com todas as páginas
{
  rh: {
    view: true,
    edit: true,
    paginas: []  // Array vazio = acesso BLOQUEADO (precisa selecionar)
  }
}
```

### Funções de Verificação

| Função | Descrição |
|--------|-----------|
| `GSS.canViewMod(mod)` | Verifica se pode ver o módulo |
| `GSS.canEditMod(mod)` | Verifica se pode editar o módulo |
| `GSS.canViewPage(mod, pg)` | Verifica se pode ver página específica |
| `GSS.canEditPage(mod, pg)` | Verifica se pode editar página específica |

### Regras de Permissão

- Para acessar, usuário deve selecionar pelo menos uma página
- Array vazio = acesso bloqueado (deve selecionar páginas específicas)
- Menu lateral exibe apenas páginas permitidas
- Ao clicar no header do módulo, navega para a primeira página acessível

### Interface de Permissões

No módulo Usuários:
- Lista de páginas por módulo no modal de edição
- Checkboxes para selecionar páginas específicas
- Hint mostrando "Selecione pelo menos uma página"
- Se nenhuma página selecionada = acesso bloqueado

---

## Comandos e Atalhos

| Ação | Comando |
|------|---------|
| Backup manual (Electron) | Botão "💾 Salvar Dados" → cria `dados-gss-backup-*.zip` em `BACKUPS\` |
| Restaurar backup (Electron) | Botão "📂 Carregar Dados" → lista backups → carrega → "♻️ Restaurar Backup" |
| Backup automático (Electron) | Ao iniciar, se não existe backup de hoje |
| Salvar dados para disco (Electron) | Automático via `persistData()` em cada alteração CRUD |
| Exportar Excel | Botão "📤 Exportar Excel" nos dashboards |
| Salvar documento como PDF (Electron) | Botão "Imprimir" em qualquer documento → diálogo nativo "Salvar como" → selecionar pasta → PDF gerado diretamente |
| Documentos | Disponível via modulo-documentos.js |
| Abrir pasta do funcionário (Electron) | Botão "📂 Abrir Pasta" no side panel do colaborador → modal flutuante com subpastas → Explorer |
| Abrir pasta do posto (Electron) | Botão "📂 Abrir Pasta" no detail panel do posto → modal flutuante com subpastas → Explorer |
| Criar pastas em lote (Electron) | ⚙️ Configurações → "📦 Criar Pastas de Todos os Elegíveis" |
| Gerar planilha Fundo de Caixa | 🔧 Ferramentas → 💵 Fundo de Caixa → adicionar itens → "📊 Gerar Planilha" |

---

## Compilação do Sistema

### Scripts

Arquivos em `build/`:
- `compilar.cmd` - Wrapper para execução
- `compilar.ps1` - Lógica de compilação

### Saída

A compilação gera a pasta `dist/` com todos os arquivos necessários para distribuição:
- index.html, css/, js/ (todos os módulos)
- MIDIAS/ (logo, header, favicon, fotos 3x4)
- DADOS/dados-gss.json (zerado, com usuário admin/admin)

### Como Compilar

1. Clique duas vezes em `build/compilar.cmd`
2. Ou execute via terminal: `build\compilar.cmd`

---

## Backup do Sistema (Script Legado)

### Script

Arquivo: `BACKUP/backup_sistema.cmd`

Gera: `BACKUP/backup_gss_AAAA-MM-DD_HH-MM-SS.zip`

### Como Usar

1. Clique duas vezes no arquivo .cmd
2. O script cria o backup automaticamente

> **Nota**: No Electron, o sistema de backup automático em `DADOS\BACKUPS\` substitui este script. Consulte a seção "Sistema de Backup (Electron)" para detalhes.

---

## Inicialização do Sistema

### Página Inicial

O sistema inicia automaticamente no **Dashboard de RH** (`rhdash`).

Para alterar, edite `src/index.html`:
```javascript
window.curPage = 'rhdash';  // Altere para 'dash', 'asodash', etc.
```

---

## Como Criar um Novo Módulo

### Passo 1: Definir no app.js

```javascript
const MODULOS = {
  nome_modulo: {
    titulo: 'Título do Menu',
    icon: 'book-open',
    badge: function() { return 0; },
    paginas: {
      pag_dash: { titulo: 'Dashboard', icon: 'bar-chart-2' },
      pag_cad: { titulo: 'Cadastrar', icon: 'edit', editar: true },
      pag_lista: { titulo: 'Listagem', icon: 'list' }
    }
  }
};
```

### Passo 2: Adicionar dados no GSS state

```javascript
window.GSS = {
  // ... dados existentes
  nome_dados: [],
};
```

### Passo 3: Atualizar persistData() e loadData()

Em `persistData()`:
```javascript
nome_dados: GSS.nome_dados || []
```

Em `loadData()`:
```javascript
GSS.nome_dados = raw.nome_dados || [];
```

### Passo 4: Criar arquivo modulo-nome.js

Seguir o padrão IIFE definido na seção "Padrões do Projeto".

### Passo 5: Adicionar script no index.html

```html
<script src="js/modulo-nome.js" type="text/javascript"></script>
```

### Passo 6: Adicionar casos no switch

```javascript
case 'pag_dash':
  el.innerHTML = NomeModule.rdash();
  break;
case 'pag_cad':
  el.innerHTML = NomeModule.rcad();
  break;
case 'pag_lista':
  el.innerHTML = NomeModule.rlista();
  break;
```

### Passo 7: Adicionar modais se necessário

```html
<!-- Modal: Nome -->
<div class="mbg" id="mnome" onclick="if(event.target===this)GSS.cm('mnome')">
  <div class="modal">
    <!-- conteúdo do modal -->
  </div>
</div>
```

---

## Módulo Livro de Ocorrências Eletrônico

### Localização

- **Menu**: Ocorrências
- **Página**: `ocordash`
- **Rota**: `OcorrenciasModule.render()`

### Visão Geral

Módulo que permite aos colaboradores nos postos de serviço registrarem ocorrências em formato de texto livre via formulário web externo. Controle centralizado no GSS Desktop (habilitar postos, criar acessos, gerenciar escalas). Dados de tráfego no Supabase (API REST nativa com fetch). Login individual por colaborador com senha provisória no primeiro acesso.

### Fluxo de Trabalho (3 passos)

```
1. Configurar Posto    →  Habilitar/Inabilitar postos no Supabase
2. Criar Acesso        →  Login/senha por colaborador (sem posto vinculado)
3. Criar Escala        →  Vincula colaborador + posto + período
```

### Arquitetura

```
GSS Desktop (Admin)                       Supabase                          Formulário Web (Colaborador)
┌──────────────────────────┐         ┌───────────────────┐         ┌─────────────────────────────────┐
│ modulo-ocorrencias.js    │──POST──→│ gss_postos_ativos │←──GET───│ dist/livro-remoto/index.html    │
│                          │         │ (habilitado)      │         │                                 │
│ GSS.ocorPostos[]         │←──GET───│                   │         │ Fluxo:                          │
│ GSS.ocorAcessos[]        │──POST──→│ gss_colaboradores │←──GET───│ Login → Livros → Formulário     │
│ GSS.ocorEscalas[]        │         │ _acesso           │         │                                 │
│                          │──POST──→│                   │         │ POST (anon):                    │
│ syncFromSupabase()       │←──GET───│ gss_escalas       │←──GET───│ gss_ocorrencias                 │
│ sincronizarDados()       │         │ (colab+posto+     │         │                                 │
│                          │──DELETE→│  período)          │         │                                 │
│                          │←──GET───│                   │         │                                 │
│ GSS.ocorregistos[]       │──DELETE→│ gss_ocorrencias   │         │                                 │
│ (histórico local)        │         │ (relatos)         │         │                                 │
└──────────────────────────┘         └───────────────────┘         └─────────────────────────────────┘
```

### Estrutura de Dados

#### Supabase — `gss_postos_ativos`

| Campo | Tipo | PK | Descrição |
|-------|------|----|-----------|
| `id_posto` | text | ✅ | Centro de Custo (ex: D000041) |
| `cc` | text | | CC redundante |
| `habilitado` | boolean | | true=habilitado, false=inabilitado |
| `criado_em` | timestamptz | | Data de criação |
| `atualizado_em` | timestamptz | | Última atualização (trigger) |

#### Supabase — `gss_colaboradores_acesso`

| Campo | Tipo | PK | Descrição |
|-------|------|----|-----------|
| `id` | uuid | ✅ | ID único (gen_random_uuid) |
| `id_colaborador` | text | | ID do colaborador no GSS |
| `re` | text | | RE do colaborador |
| `nome` | text | | Nome completo |
| `email` | text | | E-mail para envio de credenciais |
| `login` | text | unique | Login (e-mail ou RE) |
| `senha_hash` | text | | Hash SHA-256 da senha |
| `id_posto` | text | | nullable — posto vinculado (legado, uso futuro) |
| `primeiro_acesso` | boolean | | true=precisa trocar senha no 1º login |
| `habilitado` | boolean | | true=ativo, false=desabilitado |
| `criado_em` | timestamptz | | Data de criação |
| `alterado_em` | timestamptz | | Última atualização (trigger) |

#### Supabase — `gss_escalas`

| Campo | Tipo | PK | Descrição |
|-------|------|----|-----------|
| `id` | uuid | ✅ | ID único (gen_random_uuid) |
| `id_colaborador` | text | | ID do colaborador |
| `id_acesso` | uuid | FK → `gss_colaboradores_acesso(id)` ON DELETE CASCADE |
| `id_posto` | text | | CC do posto |
| `data_inicio` | date | | Data início da escala |
| `data_fim` | date | | Data fim da escala |
| `nome_colaborador` | text | | Nome (cache para consultas) |
| `re_colaborador` | text | | RE (cache para consultas) |
| `criado_em` | timestamptz | | Data de criação |
| `alterado_em` | timestamptz | | Última atualização (trigger) |

#### Supabase — `gss_ocorrencias`

| Campo | Tipo | PK | Descrição |
|-------|------|----|-----------|
| `id` | uuid | ✅ | ID único (gen_random_uuid) |
| `id_posto` | text | | CC do posto |
| `id_acesso` | uuid | FK → `gss_colaboradores_acesso(id)` |
| `colaborador` | text | | Nome (RE: XXXXXX) |
| `relato` | text | | Texto livre da ocorrência |
| `criado_em` | timestamptz | | Data/hora do envio |

#### Local — `GSS.ocorregistos[]`

```javascript
{
  id: "uuid-do-supabase",
  id_posto: "D000041",
  id_acesso: "uuid-do-acesso",
  colaborador: "João Silva (RE: 001234)",
  relato: "Texto livre da ocorrência...",
  criado_em: "2026-06-24T10:30:00Z",
  sincronizado_em: "24/06/2026 14:00:00"  // timestamp local
}
```

### Políticas RLS

| Tabela | Operação | Role | Permitido |
|--------|----------|------|-----------|
| `gss_postos_ativos` | SELECT/INSERT/UPDATE | anon | ✅ (validação, cadastro) |
| `gss_postos_ativos` | ALL | service_role | ✅ (admin Desktop) |
| `gss_colaboradores_acesso` | SELECT/INSERT/UPDATE/DELETE | anon | ✅ (CRUD completo) |
| `gss_colaboradores_acesso` | ALL | service_role | ✅ (admin Desktop) |
| `gss_escalas` | SELECT/INSERT/UPDATE/DELETE | anon | ✅ (CRUD completo) |
| `gss_escalas` | ALL | service_role | ✅ (admin Desktop) |
| `gss_ocorrencias` | INSERT | anon | ✅ (formulário externo) |
| `gss_ocorrencias` | ALL | service_role | ✅ (sincronização) |

### Funções do Módulo

| Função | Descrição |
|--------|-----------|
| `OcorrenciasModule.render()` | Renderiza interface com 5 abas + auto-sync ao abrir dashboard |
| `OcorrenciasModule._rdash()` | Dashboard com 4 cards + botão Sincronizar + tabela últimas 10 |
| `OcorrenciasModule._rconfig()` | Configurar Posto: habilitar/inabilitar postos |
| `OcorrenciasModule._rcolaboradores()` | Gerenciar acessos individuais (criar/editar/excluir) |
| `OcorrenciasModule._rescalas()` | Gerenciar escalas (criar/editar/excluir) |
| `OcorrenciasModule._rhistorico()` | Listagem de ocorrências sincronizadas com filtros |
| `OcorrenciasModule.syncFromSupabase()` | 1ª renderização: busca postos/acessos/escalas do Supabase |
| `OcorrenciasModule.sincronizarDados()` | Busca ocorrências do dia (com feedback loading/toast) |
| `OcorrenciasModule.sincronizarDadosSilencioso()` | Auto-sync ao abrir dashboard (sem feedback) |
| `OcorrenciasModule._openNovoAcesso()` | Modal: criar acesso (dropdown colaboradores ativos do RH) |
| `OcorrenciasModule._excluirAcesso(id)` | Excluir acesso + escalas vinculadas (ON DELETE CASCADE) |
| `OcorrenciasModule._openNovaEscala()` | Modal: criar escala (colaborador + posto + período) |
| `OcorrenciasModule._enviarCredenciais(id)` | Envia credenciais via mailto: (login + senha provisória) |
| `OcorrenciasModule.getAlerts()` | Badge: ocorrências de hoje |

### Fluxo do Formulário Externo

**URL**: `https://livrodeocorrenciasgss.pages.dev`

**6 Telas**:

```
┌─────────────┐    ┌──────────┐    ┌──────────────┐    ┌───────────────────┐    ┌──────────────────┐    ┌──────────┐
│  Loading ⏳  │───→│  Login 🔑│───→│ Trocar Senha │───→│ Livros Disponíveis│───→│ Formulário 📝    │───→│ Sucesso! │
│  (início)    │    │          │    │ (1º acesso)  │    │ (lista escalas)  │    │ (preencher)      │    │          │
└─────────────┘    └──────────┘    └──────────────┘    └───────────────────┘    └──────────────────┘    └──────────┘
```

1. **Loading**: Verifica se há parâmetro `?posto=` na URL
2. **Login**: Colaborador digita login + senha (SHA-256)
3. **Trocar Senha**: Se `primeiro_acesso = true`, força troca de senha
4. **Livros Disponíveis**: Lista escalas ativas do colaborador para hoje
5. **Formulário**: Colaborador seleciona livro e preenche ocorrência
6. **Sucesso**: Confirmação de envio

### GitHub Actions (CI/CD)

| Workflow | Trigger | O que faz |
|----------|---------|-----------|
| `deploy-form.yml` | Push para `main` | Deploy `dist/livro-remoto/` → Cloudflare Pages |
| `deploy-supabase.yml` | Push para `main` | Deploy Edge Functions + flag de schema changes |
| `build-desktop.yml` | Push de tag `v*` | Build EXE via electron-builder |

### Migrações SQL

O arquivo `docs/supabase-ocorrencias.sql` contém migrations seguras (pattern `DO $$ BEGIN ... EXCEPTION WHEN ... END $$`) para rodar em qualquer momento:

- Adicionar coluna `habilitado` em `gss_postos_ativos`
- Tornar `id_posto` nullable em `gss_colaboradores_acesso`
- Remover colunas antigas (`habilitado_inicio`, `habilitado_fim`, `senha_provisoria`)
- Adicionar `ON DELETE CASCADE` na FK de `gss_escalas`

### Arquivos Envolvidos

| Arquivo | O que implementa |
|---------|-----------------|
| `src/js/modulo-ocorrencias.js` | Módulo administrativo: 5 abas, CRUD acessos/escalas, sync, mailto |
| `dist/livro-remoto/index.html` | Formulário externo: 6 telas self-contained (HTML/CSS/JS) |
| `dist/livro-remoto/logo-gss.png` | Logo GSS para a tela de login do formulário |
| `supabase/functions/enviar-senha/index.ts` | Edge Function (Deno 2.x + Resend v4.1.2) |
| `docs/supabase-ocorrencias.sql` | Schema SQL: 4 tabelas, RLS, triggers, migrations |
| `src/js/app.js` | Integração: MODULOS, GSS.ocorAcessos/Escalas/Postos, persist/load |
| `src/index.html` | Script tag + case 'ocordash' no switch |
| `.github/workflows/deploy-form.yml` | Auto-deploy formulário → Cloudflare Pages |
| `.github/workflows/deploy-supabase.yml` | Semi-auto deploy Edge Functions |
| `.github/workflows/build-desktop.yml` | Auto-build EXE Desktop |
| `supabase/config.toml` | Configuração Supabase CLI |

### Configuração Supabase

1. Criar projeto no Supabase (gratuito)
2. SQL Editor → colar `docs/supabase-ocorrencias.sql`
3. Settings → API → copiar `anon` e `service_role` keys
4. Colar chaves no topo de `modulo-ocorrencias.js` e `dist/livro-remoto/index.html`
5. (Opcional) Configurar Resend domain para envio automático de e-mail
6. Push para GitHub → Cloudflare Pages deploy automático

### Hospedagem

| Componente | Hospedagem | URL |
|------------|------------|-----|
| Formulário externo | Cloudflare Pages | `livrodeocorrenciasgss.pages.dev` |
| Edge Functions | Supabase | `xyfllrcdrcvjimzwbfsm.supabase.co` |
| Desktop | Local (Electron) | Build `.exe` portátil |

---

## Próximos Passos Sugeridos

1. Adicionar mais documentos trabalhistas (termo de quitação, carta de recomendação)
2. Implementar sincronização de backups entre múltiplos servidores
3. Refinar fluxo de salvamento/impressão de documentos PDF (mock window + hidden BrowserWindow é funcional mas subótimo)
4. Criar módulo de vale-transporte (gestão/controle, separado do Fundo de Caixa)

---

## Histórico de Atualizações

| Data | Descrição |
|------|------------|
| 04/07/2026 | **Cloudflare Pages configurado e validado** — Deploy automático via GitHub Actions funcional. Build command vazio, Output directory `dist/livro-remito` aplicado. URL produção: `https://livrodeocorrenciasgss.pages.dev`. Login no formulário externo testado e aprovado. |
| 04/07/2026 | Migração do formulário externo (Livro de Ocorr...
| 01/07/2026 | **v2.18.1** — Correção generalizada: `GSS.empresa(re)` agora recebe o objeto do colaborador como 2º parâmetro em CNV e ASO (dashboard/cadastro/export), eliminando lookup二次 por RE que podia retornar empresa errada. `recTiposObrig` do CNV: comparação com normalização Unicode (acentos) para fixar match de funções como "VIGILANTE LIDER" vs "VIGILANTE LÍDER". `'VIGILANTE FEMININO'` adicionado às funções monitoradas. `filial` passa a ser a fonte primária de empresa em todos os módulos (EPI, PIX, Ferramentas, Pastas Postos, RH) com fallback para `empresa`. |
| 01/07/2026 | **v2.18.0** — Módulo PIX extraído de Ferramentas para módulo independente (`modulo-pix.js`) sob Operacional (`oppix`). Dashboard com 4 cards + últimas 10 requisições. Cadastro com busca de funcionário, campos condicionais VT (escala + nº dias, auto-cálculo valorDiário × dias), botão "Voltar" sempre visível. Histórico com 4 filtros (nome, motivo/tipo, data início/fim), colunas ordenáveis, "Gerar TXT (filtro)" que exporta apenas a lista filtrada. PIX removido de Ferramentas (~350 linhas eliminadas). 13 pontos de persistência de `pixHistorico` adicionados em app.js. Ícones em SVG (em vez de nomes de texto) no modal de permissões de Usuários. Botão de edição em permissões agora fica âmbar quando habilitado por view (em vez de cinza). Tamanho de ícones padronizado para 18px via `GSS.renderIcon()`. |
| 30/06/2026 | **v2.17.1** — Correção: `electron/gss-config.json` apontava para `Z:\4 - SUPERVISAO\GERENCIAL\DADOS` (sem acento), mas a pasta real com dados é `Z:\4 - SUPERVISÃO\GERENCIAL\DADOS` (com Ã). O `loadDataFromDisk()` não encontrava `dados-gss.zip` e sempre exibia o modal de seleção de dados. Fix: atualizado caminho nos 3 arquivos de config. |
| 24/06/2026 | **v2.17.1** — Login do Livro de Ocorrências padronizado com o sistema GSS (gradiente, logo, toggle senha). Correção ortográfica "Eletrónico" → "Eletrônico" em todo o projeto (6 arquivos, 14 ocorrências). Repositório GitHub Pages (`gss-livro-ocorrencias-`) recriado do zero — removidos todos os arquivos sensíveis (CSV funcionários, fotos, docs, config). Correção de encoding UTF-8 no formulário (PowerShell corrompeu com BOM). Adicionada regra de deploy seguro nos docs. |
| 24/06/2026 | **v2.17.0** — Refatoração completa do Livro de Ocorrências Eletrônico (v3.1). Novas tabelas `gss_colaboradores_acesso` (login individual por colaborador, SHA-256, primeiro_acesso) e `gss_escalas` (vincula colaborador + posto + período). Fluxo 3 passos: habilitar posto → criar acesso (sem posto vinculado) → criar escala. Formulário externo reescrito com 6 telas (Loading → Login → Trocar Senha → Livros Disponíveis → Formulário → Sucesso). `syncFromSupabase()` busca postos/acessos/escalas na 1ª renderização. Auto-sync silencioso de ocorrências ao abrir dashboard + botão manual "🔄 Sincronizar". FK `ON DELETE CASCADE` em `gss_escalas.id_acesso`. Migrações SQL seguras (`DO $$ BEGIN ... EXCEPTION`). GitHub Actions: auto-deploy formulário → GitHub Pages, semi-auto Edge Functions, auto-build EXE. `id_posto` nullable em acessos (posto só vinculado via escala). Dropdown de colaboradores filtra apenas `status === 'ativo'`. Removido `blocked-screen` e `getPostoParam()` (código morto). Mensagem de erro detalhada no delete (lê response body do Supabase). |
| 24/06/2026 | **v2.16.0** — Login individual por colaborador no Livro de Ocorrências Eletrônico. Nova tabela `gss_colaboradores_acesso` no Supabase (login, senha_hash, primeiro_acesso, habilitado). Formulário externo reescrito com 3 telas: Login → Troca de Senha (1º acesso) → Formulário de Ocorrência. Colaborador vê apenas o posto ao qual foi habilitado. Aba "Colaboradores" no módulo admin para gerenciar acessos individuais (habilitar/desabilitar/reenviar credenciais). Leitura de dados do módulo RH (`GSS.employees`) para vincular colaboradores aos postos. Email com credenciais individuais via Edge Function (login + senha provisória). Auto-sync: formulário busca dados frescos do Supabase a cada carga. GitHub Actions: auto-deploy do formulário no GitHub Pages, semi-auto deploy de Edge Functions, build automático do EXE Desktop. Persistência de `GSS.ocorAcessos[]` no ZIP. |
| 24/06/2026 | **v2.15.0** — Novo módulo "Livro de Ocorrências Eletrônico". Painel administrativo com dashboard, configuração de postos (habilitação por período), envio dual de senha (Supabase Edge Function + mailto:), listagem de histórico com filtros e exportação Excel. Formulário web externo (`dist/livro-remoto/index.html`) para colaboradores preencherem ocorrências via link com parâmetro `?posto=CC`. Integração Supabase (API REST): tabela `gss_postos_ativos` (senha+período) e `gss_ocorrencias` (relatos), com RLS configurado (anon SELECT/INSERT, service_role ALL). Sincronização: baixa ocorrências do dia → salva local em `GSS.ocorregistos[]` → limpa nuvem. Persistência no ZIP via `ocorregistos.json`. Edge Function `enviar-senha` com Resend para envio automático de e-mail. |
| 23/06/2026 | **v2.14.0** — Nova aba "📧 Contatos" no side panel de Postos de Trabalho (RH). Formulário de cadastro com Nome*, Cargo*, Email*, Telefone (opcional). Tabela de contatos com botão de exclusão 🗑️. Botão "Enviar E-mail para Todos" que abre Outlook via `mailto:` com separador `;`. Campo `contatos` preservado em `savePosto()` ao editar posto. Persistência automática via `GSS.persistData()`. |
| 23/06/2026 | **v2.13.1** — Correção: parser CSV (`parseCsvLine`) agora divide por `","` em vez de `,`, preservando valores com vírgulas internas (ex: salário `3.021,93`). O algoritmo anterior fazia `split(',')` que separava a vírgula decimal, resultando em valores incorretos para salários e endereços. |
| 22/06/2026 | **v2.13.0** — Mapa de localização no side panel de Postos: Leaflet + OpenStreetMap (gratuito, sem API key), geocodificação via Nominatim, marcador draggable para ajuste manual, botões "📍 Abrir no Google Maps" e "📤 Compartilhar" (navigator.share / clipboard). Campos `lat`/`lng` adicionados ao model do posto. Nova aba "👥 Colaboradores Ativos" na aba Principal do side panel com tabela Nome/RE/Função. Relatório de Contestação agora gera TXT em vez de XLS (formato texto simples com separadores visuais). |
| 22/06/2026 | **v2.12.0** — Migração de importação de XML para CSV: importação de funcionários agora aceita apenas `.csv` (formato Protheus com 259 colunas, parsing de aspas duplas). Empresa determinada pelo nome do arquivo (`seguranca` → GSS SEGURANÇA, caso contrário GSS SERVIÇOS). Botão "📥 Importar CSV" adicionado na tela de Postos de Trabalho para importar postos de `cc_servicos.csv`/`cc_seguranca.csv` (83 colunas, filtragem por Cancelado/CC Bloq). Campos novos no posto: CNPJ, CEP. Preservação de dados manuais na importação: campos divergentes entre CSV e sistema são sinalizados com badge ⚠ e não sobrescritos. Agrupamento de postos por CNPJ na tabela com expand/collapse (▶/▼) para postos com múltiplos centros de custo. Seção "⚠ Divergência CSV" no side panel de detalhes do posto. Correção de scroll: `renderContent()` agora preserva posição de scroll de `.content-area`, `.main-wrap` e `.tew` (tabelas com max-height). |
| 22/06/2026 | **v2.12.0** — Refatoração de importação: removida função `ensurePostoFromCentroCusto` (não cria mais postos automaticamente na importação de colaboradores). Nova função `relinkPostos()` vincula colaboradores a postos existentes via `centroCusto ↔ posto.cc`. Chamada após import de colaboradores, import de postos, e na inicialização (migração IIFE). Ordem de importação agora irrelevante. Helper `resolvePostoLabel(cc)` para resolução de CC para label. `contarColab()` simplificada para usar `e.centroCusto === p.cc`. Toast agora informa quantos colaboradores foram vinculados. |
| 18/06/2026 | **v2.11.1** — Correção: aba "Detalhes" do side panel do colaborador não exibia conteúdo. Causa: `RHModule.switchColabTab` do side panel era sobrescrito pela versão do módulo principal. Fix: movida definição para dentro de `openColabDetail` com delegação via `_origSwitch` para abas do módulo principal (lista/fac). Electron: novos IPC handlers `writeEmployeeFoto`/`readEmployeeFoto` para salvar/ler foto 3x4 na subpasta `FOTO 3X4` da pasta do funcionário. Helper `RHModule.getEmployeeFolderPath(emp)` adicionado. |
| 17/06/2026 | **v2.11.0** - Nova aba "FAC Pendentes" na página de Colaboradores (RH) com listagem de todos os funcionários com divergências cadastrais. Abas no topo: "Colaboradores" e "FAC Pendentes (N)" com contagem. Tabela com checkboxes, badges de campos divergentes (Empresa, Centro de Custo, Função, Salário), ordenação por coluna, botão "Ver FAC" por linha (reusa modal FAC existente). Botão "📄 Gerar FACs Selecionados" preparado para futura geração de documentos em lote. Estado: `colabActiveTab`, `facSort`, `facSelecionados`. CSS: classes `.colab-tabs`, `.colab-tab`. |
| 15/06/2026 | **v2.10.1** - Ícones SVG (Feather Icons) no menu lateral substituindo emojis. Nova função `GSS.renderIcon()`. Correção: `renderIcon` perdido na reatribuição do objeto `GSS`. Correção: fundo da logo ficava escuro no dark mode. Electron: menu oculto na build final (`Menu.setApplicationMenu(null)` se `IS_PACKAGED`). |
| 10/06/2026 | **v2.10.0** - Campo `empresa` em colaboradores, férias, treinamentos e CNV. Filtro por empresa no módulo Férias (botões GSS SERVIÇOS / GSS SEGURANÇA). Select `empresa` no formulário de colaborador. `GSS.confirm` corrigido (executa função diretamente em vez de `eval`). Criação de pastas em lote movida de ⚙️ Administração para ⚙️ Configurações. Código temporário de migração RE 57/80 removido. |
| 09/06/2026 | **v2.9.0** - Fundo de Caixa (VT): ferramenta em Ferramentas para gerar planilha de pagamento VT com busca de funcionário, dropdown de motivo (DIFERENÇA/ADMISSÃO/OUTROS), data/valor, lista ordenada com separação Serviços/Segurança, exportação Excel (ExcelJS) com abas separadas e formatação centralizada + Módulo Pastas — Funcionários (📁): gerenciamento de pastas de funcionários no disco via Electron IPC (mkdirRecursive, openFolder, renameMove, folderExists). Estrutura `FUNCIONARIOS/{SERVIÇOS|SEGURANÇA}/{ATIVOS|DESLIGADOS|AFASTADOS}/{RE} - {NOME}/` com subpastas ASO/DOCUMENTOS/OCORRÊNCIAS/ATESTADOS. Elegibilidade: RE 6 dígitos (exclui 57/80), status ativo/ferias/desligado/inativo/afastado, admissão ≥ 2021. Criação automática na admissão, movimentação automática no status, criação em lote nas Configurações. Modal flutuante no side panel RH ao clicar em "📂 Abrir Pasta" com opções de subpastas. `anoAdmissao` corrigido para usar `GSS.parseBR` (aceita DD/MM/AAAA e AAAA-MM-DD). + Módulo Pastas — Postos de Trabalho (📁): mesmo fluxo para pastas de postos em `DADOS\POSTOS\` com subpastas TREINAMENTOS/DOCUMENTOS_LEGAIS/MANUAIS, criação automática em `savePosto()`, movimentação automática ao alterar status ativo/inativo. |
| 08/06/2026 | **v2.8.0** - Filtragem por filial (01/02): removido todo código legado de `startsWith('80'/'57')` do sistema. `GSS.empresa(re, emp?)` com fallback lookup por RE. Módulos: app.js (CONFIG.EMPRESAS), modulo-documentos.js (botões/busca/10 geradores), modulo-epis.js (busca/filtro entrega/comprovante com `empresa` do registro + `_filialToEmpresa`), modulo-ferramentas.js (11 ocorrências), modulo-rh.js (getEmpresaByRe simplificado). Helpers: `_filialToEmpresa(f)`, `_fmtDateKey(dateKey)`. Bug fix: lookup de colaborador por RE+empresa em `comprovante(id)` e `gerarDocEPI(re, filial?)`. Timestamp CSV: conversão de Date XLSX para ISO string. Tabelas centralizadas com `text-align:center` inline. |
| 05/06/2026 | **v2.7.0** - Divergência de Dados (RH): snapshot `_imported` na importação, indicadores visuais com badge ⚠ e bolinha laranja, botão FAC com modal comparativo. `_original` para colaboradores manuais. Campo salário no formulário de edição. Edição inline no sidepanel (sem modal). Botões Editar/Excluir realocados da tabela para o sidepanel (btn-p/btn-r). Bug fix: `saveColab` mescla sobre original (preserva filial, centroCusto etc). Dark mode: dropdowns convertidos para `.gss-drop`/`.gss-drop-item`. |
| 05/06/2026 | **v2.6.2** - Correção: filtro da lista "Férias Cadastradas" substituído por busca com dropdown (autocomplete com debounce) — não perde foco ao digitar. Input de data específica no cadastro de férias corrigido — agora permite digitar normalmente sem recriar o input a cada tecla. |
| 01/06/2026 | **v2.6.1** - Correção: status CANCELADA em Vagas não era preservado (syncVagas sobrescrevia). Side panel de Vagas agora tem botões Editar/Excluir. Filtro "Ativas" removido do dropdown de status. Suprimentos: barra de busca de material com dropdown e debounce (não perde foco ao digitar). |
| 30/05/2026 | **v2.6.0** - Importação via XML Protheus com 27 colunas mapeadas. Chave upsert `RE+FILIAL` (importações independentes por filial). Status `SIT. FOLHA`: A=afastado, D=desligado, F=ativo (Férias removido). Empresa por filial (01=Segurança, 02=Serviços). Auto-criação de postos via Centro de Custo. Slide panel com abas Principal/Detalhes. Aceita .xml. Salário corrigido para formato brasileiro. Órgão Expedidor e CTPS removidos. |
| 28/05/2026 | **v2.5.1** - Impressão direta de documentos como PDF (Electron): intercepta `window.open` com mock window para capturar HTML do documento; envia via IPC `api:saveDocAsPdf` para o main process; inline do `header-documentos.png` como data URI (evita problemas de `file://` no ASAR); renderização em `BrowserWindow` oculta (`show:false`); geração de PDF via `printToPDF()` (A4, sem margens); diálogo nativo `dialog.showSaveDialog()` para escolher destino do arquivo; toast "PDF salvo!" ao final. Remove barra de ferramentas de pré-visualização anterior e código CSS/@media print associado. **Nota**: fluxo atual funcional, porém ainda não ideal — pendente de refinamentos futuros na geração/impressão de PDF. |
| 28/05/2026 | **v2.5.0** - Sistema de backup automático (FIFO, máx 10), pasta `DADOS\BACKUPS\`, modo backup com badge na topbar, botões Salvar/Carregar adaptados para Electron, persistData() preserva dados em modo backup, auto-backup ao iniciar se não existe backup do dia |
| 28/05/2026 | v2.4.1 - Novo documento trabalhista: Convocação (motivo, data, local/endereço, horário) com modal de 4 campos e impressão no padrão dos documentos existentes |
| 28/05/2026 | v2.4.0 - Novo documento trabalhista: Mudança de Posto (data, posto/endereço, escala, horário) com modal de 4 campos e impressão no padrão dos documentos existentes |
| 27/05/2026 | v2.3.1 - Correção de bugs: nomes de campos do JSON padrão no build script corrigidos (holidays, records, recTrainings, epiEntregas, matPedidos, postoTrabalho, preContratados, materiaisCad), loadDataFile agora lê records/recTrainings/preContratados/vagas, código temporário de importação CNV removido, bug de path no compilar.cmd corrigido |
| 21/05/2026 | v2.3.0 - Módulo CNV e Reciclagens desmembrado do Treinamentos (5 tipos fixos: CNV, Reciclagem Vigilante, Formação Vigilante, Formação Bombeiro, Reciclagem Bombeiro), dashboard/cadastro/listagem próprios, migração automática de registros legados, alertas no dashboard RH, importação de planilha Excel para carga inicial, build script atualizado, edição de tipos customizados no Treinamentos |
| 20/05/2026 | v2.2.0 - Dark mode completo (toggle na sidebar + ~160 linhas de overrides CSS), Requisição PIX com side panel e edição in-place, correção SyntaxError (const existing duplicado), tabela de usuários padronizada, setinha dropdown visível no dark mode |
| 12/05/2026 | v2.1.0 - Cadastro de férias com novo sistema de busca (por nome ou RE com dropdown); código limpo (removidos campos ep/re4, botão Buscar, função lookup); Badge atualizado para v2.0.0 (era v5.7); GSS.VER adicionado no app.js; Controle de versão implementado (SemVer) |
| 11/05/2026 | Script de compilação do sistema (build/compilar.cmd + compilar.ps1), estrutura dist/ para distribuição; Destaque amarelo no dashboard de férias para colaboradores afastados |
| 08/05/2026 | Formulário de Vale Transporte (com dados ou em branco); Side panel de detalhes da vaga com opção incluir candidato; Busca de funcionário para substituição (mesmo padrão documentos); Correção bugs pré-contratação (dados mantidos ao editar, sync de vagas); Lógica vagas corrigida (contratado/aprovado incrementam, reprovado decrementa); GSS.syncVagas() centralizado; GSS.confirm() corrigido |
| 07/05/2026 | Side panel de férias (dashboard), botão editar e apagar no panel, editor com modo Data/Mês |
| 30/04/2026 | Permissões Granulares |
| 28/04/2026 | Novo layout cards dashboards |
| 27/04/2026 | Permissões granulares por página |
| 23/04/2026 | Módulo Ferramentas, menu lateral simplificado |
| 21/04/2026 | Dashboard unificado RH |
| 20/04/2026 | Módulo Vagas + Pré-Contratação |
| 18/04/2026 | Status Afastado, multi-empresas |
| 17/04/2026 | Busca dinâmica dropdown |
| 14/04/2026 | Documento Demissão Trabalhado |
| 10/04/2026 | Documentos: Aviso Prévio, Dispensa |
| 08/04/2026 | Módulo Feriados |
| 07/04/2026 | Exportação Excel, backup |


_Last updated: 01/07/2026 v2.18.1_
