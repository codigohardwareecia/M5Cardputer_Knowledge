### Introdução

Base de conhecimento portátil para ser utilizada no **Cardputer Clássico** e **Cardputer ADV**.

### Pré-Requisitos

- **Hardware:** Cardputer ADV ou Cardputer Clássico.
    
- **Armazenamento:** Cartão SD formatado em **FAT32**.
    

### Passo 1: Preparação e Instalação do Cartão SD

1. Formate o seu cartão SD no formato **FAT32**.
    
2. Baixe o pacote de arquivos do site clicando [neste link do GitHub](https://github.com/codigohardwareecia/M5Cardputer_Knowledge/blob/main/site.zip).
    
3. Descompacte todo o conteúdo diretamente na **raiz** do cartão SD.
    
4. Certifique-se de que a estrutura na raiz do cartão ficou exatamente assim:
    
    - `index.html`
        
    - `webfonts/`
        
    - `scripts/`
        
    - `styles/`
        
5. Insira o cartão SD preparado no **slot para cartão SD** localizado na lateral do seu Cardputer.
    

### Passo 2: Gravação do Firmware

Escolha **apenas uma** das duas opções abaixo para gravar o programa no seu dispositivo:

#### Opção A: Pelo Arduino IDE (Recomendado para desenvolvedores)

1. **Baixar o Código:**
    
    - Acesse o [repositório principal no GitHub](https://github.com/codigohardwareecia/M5Cardputer_Knowledge).
        
    - Clique em **Code** > **Download ZIP**.
        
    - Descompacte o arquivo ZIP em uma pasta de sua preferência e abra o arquivo `m5cardputer_knowledge.ino`.
        
2. **Configurar a Placa:**
    
    - Vá em **File** > **Preferences** (Arquivo > Preferências).
        
    - No campo **Additional Boards Manager URLs**, clique no ícone ao lado.
        
    - Cole a URL abaixo e clique em **OK** em ambas as telas: `[https://static-cdn.m5stack.com/resource/arduino/package_m5stack_index.json](https://static-cdn.m5stack.com/resource/arduino/package_m5stack_index.json)`
        
    - Vá em **Tools** > **Boards Manager**, digite `M5Stack` na busca, selecione **M5Stack by M5Stack Official** e clique em **Install**.
        
3. **Instalar as Bibliotecas Necessárias:**
    
    - Vá em **Sketch** > **Include Library** > **Manage Libraries**.
        
    - Procure e instale as seguintes bibliotecas:
        
        - `M5Unified`
            
        - `M5Cardputer` (por M5Stack)
            
        - `ESP8266Audio` (por Earle F. Philhower, III)
            
4. **Conectar e Enviar:**
    
    - Vá em **Tools** > **Board** e selecione **M5Cardputer**.
        
    - Vá em **Tools** > **Port** e selecione a porta COM correspondente ao seu dispositivo conectado via USB.
        
    - Clique no botão **Upload** (seta para a direita) para gravar o código.
        

#### Opção B: Pelo M5Burner (Método mais rápido e fácil)

1. Baixe e abra o software oficial **M5Burner** no seu computador.
    
2. Na barra de pesquisa lateral, digite: `M5Cardputer Base de Conhecimento Offline`.
    
3. Clique no botão **Download** ao lado do aplicativo encontrado.
    
4. Conecte o seu Cardputer via USB, selecione a porta correta e clique em **Burn**.
