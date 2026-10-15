# Screenshare - Compartilhamento de tela, direto do seu PC.

**Screenshare** é um compartilhamento de tela em **1080p a 60fps** feito para duas pessoas: uma transmite pelo navegador e a outra assiste pelo celular ou por outro computador, sem instalar nada. O vídeo vai direto de um PC para o outro, sem depender de um serviço de terceiros.

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
- **Proteção contra tentativas** - 5 chaves erradas bloqueiam o IP por 10 minutos.

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
npm install
```

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

5. Edite o arquivo colocando as chaves geradas, sem aspas, sem espaços e sem o caractere `#`:

```
HOST_KEY=primeira-chave-gerada
VIEW_KEY=segunda-chave-gerada
```

O servidor se recusa a iniciar se as chaves faltarem, forem iguais ou tiverem menos de 12 caracteres.

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

5. Na janela de seleção, escolha **Tela inteira** e marque **Compartilhar áudio do sistema**. Sem isso, não há som.

6. Envie à outra pessoa o endereço do túnel e a `VIEW_KEY`. Ela abre o endereço, digita a chave e assiste. No celular, basta tocar em **Ativar som**.

7. Para encerrar, clique em **Parar** e feche os dois terminais.

Se quiser transmitir um site aberto em outro navegador (como o Firefox), deixe a página do host aberta no Edge ou no Chrome e compartilhe a **tela inteira**. Ela captura tudo o que aparece no monitor.

---

## Painel do Host

Com alguém conectado, o painel mostra o estado da transmissão:

- **Captura** - resolução e fps capturados, e se o áudio foi capturado.
- **Nível do som capturado** - indica se o som do PC está chegando ao navegador.
- **Espectador** - estado da conexão (`connected` é o esperado).
- **Envio** - resolução, fps, Mbps, o que limita a qualidade (`cpu`, `bandwidth` ou `none`) e o codificador em uso.
- **Áudio enviado** - quantidade de áudio já enviada.

---

## Codec e Bitrate

- Comece com **VP8 e 15 Mbps**.
- Se o celular travar ou esquentar, tente **H264**, que a maioria dos celulares decodifica por hardware.
- Se o painel mostrar `limitado por: cpu` ou `bandwidth`, baixe o bitrate para 10 Mbps.
- Se um site aparecer com a tela preta na captura (comum com conteúdo protegido), desligue a aceleração de hardware **do navegador que exibe o site** e reinicie esse navegador. Essa opção não pode ser trocada durante a transmissão.

A troca de bitrate é imediata. A troca de codec refaz a conexão e interrompe a imagem por cerca de um segundo.

---

## Se a Conexão Não Abrir

Se o celular mostrar "Falha na conexão direta" e o problema só ocorrer em certas redes, falta um servidor TURN, que retransmite o vídeo quando a conexão direta é impossível.

Como o relé carrega todo o vídeo, o consumo é alto: 15 Mbps dá cerca de 7 GB por hora. Procure um serviço de TURN com franquia grande e credenciais fixas, confira os termos atuais dele e adicione ao `.env`, em uma única linha:

```
ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:SERVIDOR:3478?transport=udp","username":"USUARIO","credential":"SENHA"}]
```

Não use `#` nos valores. Reinicie o `npm start` depois de editar.

---

## Segurança

- **Nunca envie o `.env` ao GitHub.** O `.gitignore` já o bloqueia, mas confira com `git status` antes de cada commit.
- Quem tem a `VIEW_KEY` vê a sua tela inteira. Compartilhe a chave só com quem você confia e troque-a com `npm run genkey` se ela vazar.
- O servidor escuta apenas em `127.0.0.1`, então só é acessível pelo túnel.
- O endereço do túnel é público enquanto ele estiver aberto. Feche o túnel quando não estiver transmitindo.

---

## Limitações

- Feito para **uma pessoa transmitindo e uma assistindo**.
- Quem transmite precisa usar **Chrome ou Edge**. O Firefox não captura o áudio do sistema no compartilhamento de tela.
- O endereço do túnel muda toda vez que ele é reiniciado, então é preciso enviar o link novo a cada sessão.
- Em redes restritivas (alguns dados móveis, redes corporativas) a conexão direta pode falhar e exigir um servidor TURN.
- Foi testado no Windows, transmitindo pelo Edge para um celular. Outros cenários podem precisar de ajustes.

---

## Autor

[Guilherme Miranda Murillo](https://github.com/guilherm-xd)
