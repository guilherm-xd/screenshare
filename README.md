# Screenshared - Compartilhamento de tela, direto do seu PC.

**Screenshared** é um compartilhamento de tela em **1080p a 60fps** feito para duas pessoas: uma transmite pelo navegador e a outra assiste pelo celular ou por outro computador, sem instalar nada. O vídeo vai direto de um PC para o outro, sem depender de um serviço de terceiros.

<img width="1919" height="1079" alt="image" src="https://github.com/user-attachments/assets/f606d511-bb0d-4432-82c5-037d86d64aa9" />

---

## Sobre o Projeto

Esse projeto nasceu da necessidade de substituir um aplicativo de compartilhamento de tela que foi desativado. A ideia era ter algo simples, que rodasse no próprio PC, com boa qualidade e sem mensalidade.

Você abre uma página no navegador, escolhe a tela e pronto: a outra pessoa recebe a imagem e o som em tempo real. Tudo roda na sua máquina, e por isso **não existe versão online**. Cada pessoa que quiser usar roda a própria cópia, com as próprias chaves de acesso.

---

## Funcionalidades

- **1080p a 60fps** - captura a tela inteira junto com o áudio do sistema.
- **Sem aceleração de hardware** - o navegador codifica o vídeo por software (VP8 ou H264), então funciona em qualquer PC com processador razoável.
- **Troca ao vivo** - o bitrate muda na hora, e o codec pode ser trocado durante a transmissão.
- **Painel de diagnóstico** - mostra fps, Mbps, o que está limitando a qualidade, o codificador em uso e o nível do áudio capturado.
- **Acesso por chaves** - uma chave para transmitir e outra para assistir.
- **Um espectador por vez** - se outra pessoa entrar com a chave, ela substitui a primeira.
- **Funciona fora da sua rede** - usa um Cloudflare Tunnel, sem abrir portas no roteador.
- **Reconexão automática** - volta sozinho quando a rede oscila ou a tela do celular bloqueia.
- **Visualizador feito para o celular** - com botão de som e tela cheia.
- **Opção "Escutar comunicação"** - por padrão, pede ao navegador só o áudio da janela compartilhada, para o Discord e apps de chamada ficarem de fora.
- **Proteção contra tentativas** - 5 chaves erradas bloqueiam o IP por 10 minutos, com limites de conexões e mensagens.

---

## Tecnologias Utilizadas

- HTML
- CSS
- JavaScript
- Node.js
- Express
- WebSocket (`ws`)
- WebRTC
- Cloudflare Tunnel

---

## Como Funciona

- A captura da tela e do áudio é feita pelo navegador, com `getDisplayMedia`.
- O vídeo viaja por **WebRTC**, direto do PC de quem transmite para quem assiste.
- O `server.js` só faz a **sinalização**: apresenta os dois lados um ao outro. Ele não vê nem guarda o vídeo.
- O **Cloudflare Tunnel** dá ao servidor um endereço `https` público e temporário.
- Os servidores STUN do Google ajudam os dois lados a se encontrarem. O vídeo não passa por eles.

---

## Instalação

### Requisitos

- Windows, macOS ou Linux
- [Node.js](https://nodejs.org) versão 20.6 ou mais nova (versão LTS)
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
- Chrome ou Edge no computador de quem transmite

No Windows, com o PowerShell:

```
winget install OpenJS.NodeJS.LTS
winget install Cloudflare.cloudflared
```

Feche e abra o terminal depois de instalar. Se o PowerShell disser que a execução de scripts está desabilitada, rode `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

### Passo a passo

1. Baixe ou clone este repositório e entre na pasta.

2. Instale as dependências:

```
npm ci
```

   O `npm ci` instala exatamente as versões do `package-lock.json`.

3. Gere duas chaves diferentes. Rode o comando duas vezes e guarde os resultados:

```
npm run genkey
```

4. Crie o arquivo `.env`.

   No Windows:

```
Copy-Item .env.example .env
notepad .env
```

   No macOS ou Linux:

```
cp .env.example .env
```

5. Edite o arquivo colocando as chaves geradas, sem aspas, sem espaços e sem caracteres extras:

```
HOST_KEY=SUBSTITUA_PELA_PRIMEIRA_CHAVE_GERADA
VIEW_KEY=SUBSTITUA_PELA_SEGUNDA_CHAVE_GERADA
```

O comando gera uma chave aleatória hexadecimal de 36 caracteres. Use o comando duas vezes e substitua os dois valores de exemplo. O servidor se recusa a iniciar se as chaves forem iguais, tiverem menos de 32 caracteres ou ainda forem os valores de exemplo. O arquivo `.env` não deve ser enviado ao GitHub.

---

## Como Usar

1. Em um terminal, inicie o servidor:

```
npm start
```

2. Em um segundo terminal, abra o túnel:

```
npm run tunnel
```

3. Copie o endereço `https://alguma-coisa.trycloudflare.com` que aparecer.

4. No **Chrome ou Edge**, abra `http://127.0.0.1:3000/host.html`, digite a `HOST_KEY` e clique em **Iniciar compartilhamento**.

5. Na janela de seleção, escolha o que deve ser compartilhado e marque **Compartilhar áudio do sistema** caso queira compartilhar áudio.

6. Envie à outra pessoa o endereço HTTPS do túnel e a `VIEW_KEY`. Ela abre o endereço, confere o servidor exibido, digita a chave e assiste. No celular, basta tocar em **Ativar som**. Nunca peça à outra pessoa para informar a chave em um endereço de servidor que ela não reconheça.

7. Para encerrar, clique em **Parar** e feche os dois terminais.

Se quiser transmitir um site aberto em outro navegador (como o Firefox), deixe a página do host aberta no Edge ou no Chrome e compartilhe a **tela inteira**. Ela captura tudo o que aparece no monitor.

### Visualizador hospedado no GitHub Pages

Por padrão, o visualizador não aceita mais um servidor definido por parâmetro de URL. A pessoa deve digitar e conferir o endereço no campo visível antes de informar a chave. Se hospedar `docs/` no GitHub Pages, adicione a origem exata da página ao `.env` da máquina que roda o servidor, por exemplo `ALLOWED_ORIGINS=https://SEU-USUARIO.github.io`. Não use curingas. Depois reinicie o servidor. Sem essa configuração, acessos entre origens diferentes são bloqueados.

---

## Painel do Host

Com alguém conectado, o painel mostra o estado da transmissão:

- **Captura** - resolução e fps capturados, e se o áudio foi capturado.
- **Nível do som capturado** - indica se o som do PC está chegando ao navegador.
- **Comunicação** - mostra se a opção "Escutar comunicação" está ligada e avisa quando a tela inteira envia o áudio de todo o sistema.
- **Espectador** - estado da conexão (`connected` é o esperado).
- **Envio** - resolução, fps, Mbps, o que limita a qualidade (`cpu`, `bandwidth` ou `none`) e o codificador em uso.
- **Áudio enviado** - quantidade de áudio já enviada.

---

## Áudio de Comunicação

Se você compartilha a tela durante uma chamada no mesmo PC (Discord e apps parecidos), quem assiste pode ouvir a própria voz, porque o som da chamada vai junto com o áudio do sistema. A opção **Escutar comunicação** controla isso na hora de iniciar o compartilhamento:

- **Desligada (padrão)** - o host pede ao navegador só o áudio da janela compartilhada, o que deixa a chamada de fora.
- **Ligada** - o host pede o áudio de todo o sistema, incluindo a chamada.

Limites importantes:

- Isso só funciona ao compartilhar uma **janela**. Ao compartilhar a **tela inteira**, o navegador entrega o áudio do sistema todo, e o projeto não consegue separar o Discord dele. Nesse caso o painel do host avisa.
- É um pedido ao navegador, que pode ignorá-lo. A opção `windowAudio` ainda é experimental e só existe em versões recentes do Chrome e do Edge.
- A mudança só vale na próxima vez que você iniciar o compartilhamento.
- O projeto não usa o microfone nem outros dispositivos de áudio.
- Foram testados o pedido feito ao navegador e os avisos do painel. O efeito real no Windows, com uma chamada de verdade, não foi testado.

---

## Codec e Bitrate

- Comece com **VP8 e 15 Mbps**.
- Se o celular travar ou esquentar, tente **H264**, que a maioria dos celulares decodifica por hardware.
- Se o painel mostrar `limitado por: cpu` ou `bandwidth`, baixe o bitrate para 10 Mbps.
- Se um site aparecer com a tela preta na captura (comum com conteúdo protegido), desligue a aceleração de hardware **do navegador que exibe o site** e reinicie esse navegador. Essa opção não pode ser trocada durante a transmissão.

A troca de bitrate é imediata. A troca de codec refaz a conexão e interrompe a imagem por cerca de um segundo.

---

## Se a Conexão Não Abrir

Se o celular mostrar "Falha na conexão direta" e o problema só ocorrer em certas redes, pode ser necessário um servidor TURN, que retransmite o vídeo quando a conexão direta é impossível.

Como o relé carrega o vídeo, o consumo é alto: 15 Mbps dá cerca de 7 GB por hora. Prefira um servidor TURN compatível com credenciais temporárias no padrão TURN REST API. Configure no `.env` as URLs e o segredo compartilhado com o servidor TURN:

```
TURN_URLS=turn:SERVIDOR:3478?transport=udp,turns:SERVIDOR:5349?transport=tcp
TURN_SHARED_SECRET=SEGREDO_ALEATORIO_COMPARTILHADO_COM_O_TURN
TURN_TTL_SECONDS=3600
```

O servidor gera credenciais temporárias quando um usuário autenticado busca a configuração. Use um segredo aleatório de pelo menos 32 caracteres e mantenha-o apenas no `.env` e na configuração privada do TURN. Não use `#` nos valores. Reinicie o `npm start` depois de editar.

O campo opcional `ICE_SERVERS` ainda permite servidores ICE personalizados em JSON. Evite colocar nele credenciais TURN fixas: elas precisam chegar ao navegador para funcionar e podem ser vistas por qualquer pessoa autenticada com `VIEW_KEY`. Não reutilize essas credenciais em outro serviço.

---

## Segurança

- Quem tem a `VIEW_KEY` vê a sua tela inteira. Compartilhe a chave só com quem você confia e gere uma nova se ela vazar.
- `HOST_KEY` e `VIEW_KEY` devem ser chaves aleatórias, diferentes e geradas com `npm run genkey`; não use senhas pessoais.
- O endpoint `/config` exige uma das chaves e não expõe os dados de ICE a visitantes anônimos. As requisições não são armazenadas em cache.
- O servidor valida a origem de requisições HTTP e WebSocket. Para usar um visualizador em outro domínio, configure a origem exata em `ALLOWED_ORIGINS`.
- O servidor escuta apenas em `127.0.0.1`, então só é acessível localmente ou por um túnel encaminhado para esse endereço.
- O servidor só responde quando o cabeçalho `Host` é `127.0.0.1`, `localhost`, um endereço `*.trycloudflare.com` ou um host listado em `ALLOWED_HOSTS`. Isso bloqueia ataques de DNS rebinding. Se usar um túnel nomeado ou um domínio próprio, adicione o domínio ao `.env`, sem curingas, por exemplo `ALLOWED_HOSTS=tela.seudominio.com`, e reinicie o servidor.
- As páginas são servidas com `Content-Security-Policy` e `Permissions-Policy` restritivas.
- Existem limites para tentativas de chave, conexões simultâneas e mensagens WebSocket. Esses limites reduzem abuso, mas não substituem o encerramento do túnel quando ele não estiver em uso. O bloqueio por tentativas erradas não vale para acessos vindos do próprio PC (`127.0.0.1`), para que ninguém consiga travar o host.
- As credenciais TURN geradas por `TURN_URLS` e `TURN_SHARED_SECRET` são temporárias. Um cliente autenticado pode usar as credenciais enquanto elas estiverem válidas, por isso mantenha TTL razoável e limites de consumo no serviço TURN.
- Credenciais TURN fixas colocadas manualmente em `ICE_SERVERS` podem ser inspecionadas por qualquer pessoa autenticada com `VIEW_KEY`; não reutilize credenciais administrativas ou valiosas.
- Como o vídeo vai direto entre os dois PCs, quem assiste consegue descobrir o seu IP público. O túnel esconde apenas o endereço do servidor de sinalização. Só um servidor TURN em modo relé esconderia o IP, e o projeto não força esse modo.
- Quem tem a `VIEW_KEY` também pode enviar candidatos de rede ao host, o que faz o navegador do host trocar pacotes com endereços escolhidos por essa pessoa, inclusive da sua rede local. Isso é próprio do WebRTC, e por isso a chave só deve ir para quem você confia.
- Mantenha o `.env` fora do Git e confira o histórico do repositório antes de torná-lo público. Remover um segredo do arquivo atual não o remove de commits anteriores.

---

## Limitações

- Feito para **uma pessoa transmitindo e uma assistindo**, por enquanto.
- Quem transmite precisa usar **Chrome ou Edge**. Navegadores como o Firefox não capturam o áudio do sistema no compartilhamento de tela.
- Ao compartilhar a **tela inteira**, o áudio de chamadas (Discord e apps parecidos) vai junto, porque o navegador não separa o áudio por aplicativo. Compartilhe uma janela para deixá-lo de fora.
- O endereço do túnel muda toda vez que ele é reiniciado, então é preciso enviar o link novo a cada sessão.
- Em redes restritivas (alguns dados móveis, redes corporativas) a conexão direta pode falhar e exigir um servidor TURN.
- Foi testado no Windows, transmitindo pelo Edge para um celular. Outros cenários podem precisar de ajustes.

---

## Autor

[Guilherme Miranda Murillo](https://github.com/guilherm-xd)
