# Fluxo de Desenvolvimento e Distribuição

## Estrutura do Projeto

```
C:\Sistema GSS\
├── docs/                        ← Documentação do projeto
│   ├── AGENTS.md
│   └── fluxo_desenvolvimento.md
├── src/                         ← Código fonte (frontend)
│   ├── index.html               ← Shell principal + topbar
│   ├── css/estilos.css          ← Estilos globais
│   ├── js/
│   │   ├── app.js               ← Core (auth, MODULOS, persistência, backup)
│   │   └── modulo-*.js          ← Módulos do sistema
│   ├── DADOS/                   ← Template de dados (build)
│   └── MIDIAS/                  ← Imagens
├── electron/                    ← Camada desktop (Electron)
│   ├── main.js                  ← Processo principal + IPC handlers
│   ├── preload.js               ← Ponte contextBridge (apiLocal)
│   └── gss-config.json          ← Config de deploy (dataFolder)
├── build/                       ← Script de compilação web
│   ├── compilar.cmd
│   └── compilar.ps1
├── dist/                        ← Saída da compilação web
├── dist-electron/               ← Saída do build Electron (.exe)
├── package.json                 ← Dependências: electron, electron-builder
└── AGENTS.md                    ← (movido para docs/AGENTS.md)
```

---

## Stack

- **Frontend**: HTML5 + CSS3 + Vanilla JS (IIFE, sem frameworks)
- **Desktop**: Electron (contextIsolation, sandbox:false)
- **Persistência**: ZIP via JSZip em disco (Electron) / localStorage (fallback)
- **Build**: electron-builder (portátil .exe)

---

## Ciclo de Desenvolvimento

### 1. Editar código

- Frontend: arquivos em `src/`
- Electron: arquivos em `electron/`
- Nunca editar `dist/` ou `dist-electron/` — são gerados

### 2. Testar localmente

```bash
npm start              # Abre Electron com src/index.html
```

Ou abrir `src/index.html` diretamente no navegador para testar apenas o frontend (recursos Electron não disponíveis).

### 3. Compilar versão web (opcional)

```bash
build\compilar.cmd     # Gera dist/ com tudo minificado
```

### 4. Gerar .exe portátil

```bash
npm run build          # Gera dist-electron/GSS-Controle-Gerencial-{versao}.exe
```

Requer `$env:CSC_IDENTITY_AUTO_DISCOVERY="false"` no Windows (sem code signing).

---

## Estrutura de Deploy

```
Z:\4 - SUPERVISÃO\GERENCIAL\
├── app\                          ← Pasta da aplicação (copiar .exe + config)
│   ├── GSS-Controle-Gerencial-2.10.1.exe
│   └── gss-config.json
│
└── DADOS\                        ← Dados compartilhados na rede
    ├── dados-gss.zip             ← Arquivo principal (sobrescrito ao restaurar)
    └── BACKUPS\                  ← Backups automáticos (máx 10, FIFO)
        ├── dados-gss-backup-2026-05-28_14-30-00.zip
        ├── dados-gss-backup-2026-05-27_09-15-00.zip
        └── ...
```

### gss-config.json

```json
{
  "dataFolder": "Z:\\4 - SUPERVISÃO\\GERENCIAL\\DADOS"
}
```

Colocar na **mesma pasta do .exe** em cada máquina. O sistema lê este arquivo na inicialização para localizar os dados compartilhados.

---

## Fluxo de Inicialização (Electron)

1. `main.js` tenta ler `gss-config.json`:
   - `PORTABLE_EXECUTABLE_DIR` (portátil)
   - `path.dirname(app.getPath('exe'))` (instalado)
   - `__dirname` (npm start)
2. `app.js` recebe via IPC `getStartupConfig`:
   - Se `dataFolder` existe → carrega `dados-gss.zip`
   - Se não → tenta `localStorage`
   - Se não → tenta `src/DADOS/` (dev, não pacote)
   - Se não → modal de seleção de arquivo
3. Após carregar os dados com sucesso:
   - Cria `BACKUPS\` se não existir
   - Se não existe backup de hoje → cria `dados-gss-backup-HOJE.zip`
   - Aplica rotação FIFO (máx 10 backups)

---

## Comandos Úteis

| Comando | Descrição |
|---------|-----------|
| `npm start` | Inicia Electron em modo dev |
| `npm run build` | Gera .exe portátil |
| `build\compilar.cmd` | Compila versão web (dist/) |

---

## Atualização do Sistema

| O que mudou | Ação necessária |
|-------------|-----------------|
| Frontend (`src/`) | Rebuild → substituir .exe nas máquinas |
| Electron (`electron/`) | Rebuild → substituir .exe (menu removido automaticamente na build final) |
| Config (`gss-config.json`) | Editar direto nas máquinas (sem rebuild) |
| Dados (`dados-gss.zip`) | Gerenciado pelo próprio sistema |

---

## Deploy do Formulário Externo (Cloudflare Pages)

### Repositório

O formulário do Livro de Ocorrências Eletrônico é hospedado via **Cloudflare Pages**, conectado ao repositório no GitHub: `TrueSkywalker09/gss-livro-ocorrencias-`.

### Arquivos Permitidos no Repositório

| Arquivo | Descrição |
|---------|-----------|
| `dist/livro-remoto/index.html` | Formulário externo (self-contained: HTML + CSS + JS inline) |
| `dist/livro-remoto/logo-gss.png` | Logo GSS para a tela de login |
| `.gitignore` | Regras de ignore |

### Arquivos PROIBIDOS no Repositório

| Arquivo/Pasta | Motivo |
|---------------|--------|
| `DOCUMENTOS/` | Dados sensíveis de funcionários |
| `src/` | Código fonte do sistema desktop |
| `electron/` | Código fonte Electron + config com chaves |
| `supabase/` | Edge Functions + config |
| `BACKUP/`, `build/`, `docs/` | Não necessários para o formulário |
| `*.csv`, `*.xml`, `*.xlsx` | Dados de funcionários e operacionais |
| `src/MIDIAS/FOTOS_3X4/` | Fotos de funcionários |
| `src/DADOS/` | Dados da aplicação |
| `package.json`, `package-lock.json` | Dependências do desktop |

### Regra de Segurança

> **NUNCA** enviar dados sensíveis ou código fonte do sistema desktop para o repositório do formulário externo. O repositório é público e qualquer dado enviado ficará exposto permanentemente (mesmo após delete, permanece no histórico do git).

### Fluxo de Deploy (Automatizado via GitHub Actions)

O deploy é **totalmente automático** via GitHub Actions. Qualquer alteração nos arquivos do formulário externo no projeto principal dispara o pipeline:

1. **Editar** `dist/livro-remito/index.html` ou `dist/livro-remoto/logo-gss.png` no projeto principal (`C:\Sistema GSS\`)
2. **Commit + Push** no repositório principal (`C:\Sistema GSS\`) — branch `main`
3. **GitHub Action** (`deploy-form.yml`) detecta mudanças em `dist/livro-remoto/**`
4. Action copia os arquivos para o repositório `gss-livro-ocorrencias-` e faz push
5. **Cloudflare Pages** detecta push no repo do formulário → deploy automático (< 10s)

> **URL final**: `https://livrodeocorrenciasgss.pages.dev`

### Configuração do Cloudflare Pages (✅ Concluída)

Projeto criado e configurado corretamente:

| Configuração | Valor |
|--------------|-------|
| **Framework preset** | None (static) |
| **Build command** | *(vazio)* |
| **Build output directory** | `dist/livro-remoto` |
| **Root directory** | `/` |
| **Branch** | `main` |

Deploy testado e funcional — login no formulário externo validado.

### Encoding

O arquivo `index.html` deve ser salvo em **UTF-8 sem BOM**. Nunca usar `Set-Content -Encoding UTF8` do PowerShell (adiciona BOM e corrompe caracteres). Usar `Out-File -Encoding utf8` ou ferramentas que preservem UTF-8 sem BOM.

---

## Controle de Versão

Ver `docs/AGENTS.md` para detalhes do versionamento SemVer e histórico completo.
