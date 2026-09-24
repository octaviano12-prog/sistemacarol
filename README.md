# Clínica Essência

Sistema de gestão de pacientes, pacotes, sessões, pagamentos e agenda, desenvolvido em Next.js para publicação na Hostinger com Node.js e MySQL.

## Funcionalidades

- painel com pacientes ativos, sessões em haver e pagamentos pendentes;
- cadastro e pesquisa de pacientes;
- criação de pacotes com qualquer quantidade de sessões;
- baixa de sessões com atualização automática do saldo;
- pagamentos integrais ou parciais por Pix, dinheiro, cartão ou transferência;
- histórico de sessões e pagamentos;
- agenda de atendimentos;
- layout responsivo para computador, tablet e celular;
- dados persistidos em MySQL.

## Rodar localmente

1. Instale Node.js 22 ou superior e pnpm.
2. Crie um banco MySQL vazio.
3. Copie `.env.example` para `.env.local` e preencha `DATABASE_URL`.
4. Execute:

```bash
pnpm install
pnpm dev
```

Abra `http://localhost:3000`. Na primeira conexão, o sistema cria as tabelas e alguns registros de demonstração automaticamente.

## Variáveis de ambiente

```env
DATABASE_URL=mysql://USUARIO:SENHA@HOST:3306/NOME_DO_BANCO
CLINIC_OWNER_ID=clinica-essencia
ADMIN_USER=admin
ADMIN_PASSWORD=troque-por-uma-senha-forte
```

`ADMIN_USER` e `ADMIN_PASSWORD` protegem todo o painel e sua API. Use uma senha forte, mantenha o HTTPS da Hostinger ativo e nunca envie o arquivo `.env` para o GitHub.

## Publicar no GitHub

```bash
git init
git add .
git commit -m "Sistema Clínica Essência"
git branch -M main
git remote add origin URL_DO_REPOSITORIO
git push -u origin main
```

## Publicar na Hostinger

1. No hPanel, crie um banco MySQL e guarde host, nome do banco, usuário e senha.
2. Crie um aplicativo Node.js e conecte o repositório do GitHub.
3. Configure `DATABASE_URL`, `CLINIC_OWNER_ID`, `ADMIN_USER` e `ADMIN_PASSWORD` nas variáveis de ambiente.
4. Configure o comando de instalação como `pnpm install --frozen-lockfile`.
5. Configure o comando de build como `pnpm build`.
6. Configure o comando de inicialização como `pnpm start`.
7. Use Node.js 22 ou uma versão mais recente compatível.
8. Faça o deploy e associe o domínio desejado.

O projeto gera uma aplicação Next.js standalone, adequada para ambiente Node.js.
