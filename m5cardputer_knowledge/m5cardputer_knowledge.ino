#include <M5Cardputer.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <SD.h>
#include <ArduinoJson.h>
#include <DNSServer.h>
#include <Preferences.h>



// Configurações padrão do Access Point (Modo Configuração / Rua)
const char* ap_ssid = "MypersonalkbAP";
const char* ap_password = "12345678"; // Vazio para rede aberta ou defina uma senha

// WebServer, DNS Server e Preferences
WebServer server(80);
DNSServer dnsServer;
Preferences preferences;
const byte DNS_PORT = 53;

// Variáveis dinâmicas de credenciais Wi-Fi
String saved_ssid = "";
String saved_password = "";
String saved_hostname = "mypersonalkb";

// Declaração antecipada das funções
bool updateKnowledgeBaseJson();
bool loadFileFromSD(String path, String contentType);
String getContentType(String filename);

void startConfig(){
  auto cfg = M5.config();
  M5.begin(cfg);
}

void startWifi(){
  Serial.println("Lendo credenciais Wi-Fi da memória...");
  
  // Abre a biblioteca preferences no espaço "wifi-config"
  preferences.begin("wifi-config", false);
  saved_hostname = preferences.getString("hostname", "");
  saved_ssid = preferences.getString("ssid", "");
  saved_password = preferences.getString("pass", "");
  preferences.end();

  WiFi.mode(WIFI_AP_STA);

  // Sempre inicia o Access Point para facilitar o acesso de configuração
  if (strlen(ap_password) > 0) {
    WiFi.softAP(ap_ssid, ap_password);
  } else {
    WiFi.softAP(ap_ssid);
  }

  IPAddress AP_IP = WiFi.softAPIP();
  Serial.print("Access Point ativo! Conecte em: ");
  Serial.println(ap_ssid);
  
  // Inicia o DNS Captivo (redireciona tudo para o IP do AP)
  dnsServer.start(DNS_PORT, "*", AP_IP);

  // Se houver SSID salvo, tenta conectar na rede STA
  if (saved_ssid.length() > 0) {
    Serial.print("Tentando conectar ao WiFi salvo: ");
    Serial.println(saved_ssid);
    
    WiFi.begin(saved_ssid.c_str(), saved_password.c_str());

    int tentativas = 0;
    while (WiFi.status() != WL_CONNECTED && tentativas < 10) {
      delay(500);
      Serial.print(".");
      tentativas++;
    }

    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\nWiFi conectado com sucesso!");
      String ipStr = WiFi.localIP().toString();
      Serial.print("IP na rede: ");
      Serial.println(ipStr);

      // Define o título e o IP da rede doméstica na tela
      String staDescription = "Hostname: " + saved_hostname +  "\n IP: " + ipStr;
      showMessage("Mode STA" ,staDescription);
 
      if (MDNS.begin(saved_hostname)) {
        Serial.println("Serviço de mDNS iniciado: " + saved_hostname);
      }
      return;
    }
  }

  // Se não conectou na rede de casa, exibe as informações do Access Point na tela
  Serial.println("\nNenhuma rede configurada ou falha na conexão. Abrindo Modo Configuração.");
  String apIpStr = AP_IP.toString();
  
  String appDescription = "SSID: " + String(ap_ssid) + "\nPass: " + String(ap_password) + "\nIP: " + apIpStr;
  showMessage("Mode AP" ,appDescription);
}

void startDisplay(){
  M5.Lcd.begin();
  M5.Lcd.setRotation(1);
  M5.Lcd.setBrightness(100);
  M5.Lcd.fillScreen(BLACK);
}

void startStorage(){
  SPI.begin(40, 39, 14, 12); 
  if (!SD.begin(12, SPI, 20000000)) {
    Serial.println("ERRO: Falha ao montar o Cartão SD!");
    M5Cardputer.Display.setTextColor(RED);
    M5Cardputer.Display.println("Erro SD!");
  } else {
    Serial.println("Cartão SD montado com sucesso!");
    M5Cardputer.Display.setTextColor(GREEN);
    M5Cardputer.Display.println("SD OK!");
  }
}

void startWebServer(){
  server.begin();

  // ==========================================
  // ROTA DE CONFIGURAÇÃO WI-FI (HTML Form)
  // ==========================================
  server.on("/config", HTTP_GET, []() {
    String html = "<html lang='pt-BR'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1.0'>";
    html += "<title>Configuração Wi-Fi - Cardputer</title>";
    html += "<style>body{font-family:Segoe UI,sans-serif;background:#0f172a;color:#f8fafc;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}";
    html += ".card{background:#1e293b;padding:30px;border-radius:12px;box-shadow:0 4px 15px rgba(0,0,0,0.5);width:100%;max-width:350px;}";
    html += "h2{margin-top:0;color:#38bdf8;text-align:center;}label{display:block;margin:15px 0 5px;font-size:14px;}";
    html += "input{width:100%;padding:10px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#fff;box-sizing:border-box;}";
    html += "button{width:100%;margin-top:20px;padding:12px;background:#2563eb;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;}";
    html += "button:hover{background:#1d4ed8;}</style></head><body>";
    html += "<div class='card'><h2>Configurar Wi-Fi</h2><form action='/config-save' method='POST'>";
    html += "<label>Hostname:</label><input type='text' name='hostname' value='" + saved_hostname + "' required>";
    html += "<label>Nome da Rede (SSID):</label><input type='text' name='ssid' value='" + saved_ssid + "' required>";
    html += "<label>Senha da Rede:</label><input type='password' name='pass' value='" + saved_password + "'>";
    html += "<button type='submit'>Salvar e Conectar</button></form></div></body></html>";
    
    server.send(200, "text/html", html);
  });

  server.on("/config-save", HTTP_POST, []() {
    if (!server.hasArg("ssid")) {
      server.send(400, "text/plain", "Parâmetros incompletos.");
      return;
    }

    String new_ssid = server.arg("ssid");
    String new_pass = server.arg("pass");
    String new_hostname = server.arg("hostname");

    // Salva na memória Preferences
    preferences.begin("wifi-config", false);
    preferences.putString("ssid", new_ssid);
    preferences.putString("pass", new_pass);
    preferences.putString("hostname", new_hostname);
    preferences.end();

    String html = "<html lang='pt-BR'><head><meta charset='UTF-8'><title>Configurado</title>";
    html += "<style>body{font-family:Segoe UI,sans-serif;background:#0f172a;color:#f8fafc;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;text-align:center;}";
    html += ".card{background:#1e293b;padding:30px;border-radius:12px;box-shadow:0 4px 15px rgba(0,0,0,0.5);}</style></head><body>";
    html += "<div class='card'><h2>Configurações Salvas!</h2><p>O dispositivo está reiniciando para conectar na rede <b>" + new_ssid + "</b>...</p>";
    html += "<p>Aguarde alguns segundos e acesse pelo IP ou por <b>http://mypersonalkb</b></p></div></body></html>";

    server.send(200, "text/html", html);
    delay(2000);
    ESP.restart(); // Reinicia o ESP32 aplicando a nova rede
  });

  // Rota genérica (Captive Portal / SD files)
  server.onNotFound([]() {
    // Se não estiver conectado no Wi-Fi STA e não for chamada à API, força a tela de configuração
    if (WiFi.status() != WL_CONNECTED && !server.uri().startsWith("/api/")) {
      server.sendHeader("Location", "/config", true);
      server.send(302, "text/plain", "");
      return;
    }

    String path = server.uri();
    int queryIndex = path.indexOf('?');
    if (queryIndex != -1) {
      path = path.substring(0, queryIndex);
    }

    if (path == "/") {
      path = "/index.html";
    }

    String contentType = getContentType(path);

    if (!loadFileFromSD(path, contentType)) {
      server.send(404, "text/plain", "404: Arquivo nao encontrado no SD");
    }
  });

  // Rotas da API de Conhecimento
  server.on("/api/list", HTTP_GET, []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");

    if (!SD.exists("/knowledgeBase.json")) {
      updateKnowledgeBaseJson();
    }

    File jsonFile = SD.open("/knowledgeBase.json", FILE_READ);
    if (!jsonFile) {
      server.send(404, "text/plain", "Arquivo JSON nao encontrado.");
      return;
    }

    server.streamFile(jsonFile, "application/json");
    jsonFile.close();
  });

  server.on("/api/read", HTTP_GET, []() {
    if (!server.hasArg("folder") || !server.hasArg("file")) {
      server.send(400, "application/json", "{\"error\":\"Parametros 'folder' e 'file' sao obrigatorios\"}");
      return;
    }

    String folderName = server.arg("folder");
    String fileName = server.arg("file");
    String fullPath = "/knowledge/" + folderName + "/" + fileName;

    if (!SD.exists(fullPath)) {
      server.send(404, "application/json", "{\"error\":\"Arquivo nao encontrado\"}");
      return;
    }

    File file = SD.open(fullPath, FILE_READ);
    if (!file || file.isDirectory()) {
      if (file) file.close();
      server.send(500, "application/json", "{\"error\":\"Erro ao abrir o arquivo\"}");
      return;
    }

    server.sendHeader("Access-Control-Allow-Origin", "*");

    if (fileName.endsWith(".pdf") || fileName.endsWith(".PDF")) {
      server.streamFile(file, "application/pdf");
      file.close();
      return;
    }

    String content = "";
    while (file.available()) {
      content += (char)file.read();
    }
    file.close();

    server.send(200, "text/plain; charset=utf-8", content);
  });

  server.on("/api/save", HTTP_POST, []() {
    if (!server.hasArg("folder") || !server.hasArg("file") || !server.hasArg("content")) {
      server.send(400, "application/json", "{\"error\":\"Parametros incompletos\"}");
      return;
    }

    String folderName = server.arg("folder");
    String fileName = server.arg("file");
    String newContent = server.arg("content");
    String fullPath = "/knowledge/" + folderName + "/" + fileName;

    File file = SD.open(fullPath, FILE_WRITE);
    if (!file) {
      server.send(500, "application/json", "{\"error\":\"Erro ao abrir o arquivo para gravacao\"}");
      return;
    }

    file.print(newContent);
    file.close();

    updateKnowledgeBaseJson();

    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", "{\"status\":\"success\",\"message\":\"Arquivo salvo com sucesso\"}");
  });

  server.on("/api/create-group", HTTP_POST, []() {
    if (!server.hasArg("group")) {
      server.send(400, "application/json", "{\"error\":\"Nome do grupo nao informado\"}");
      return;
    }

    String groupName = server.arg("group");
    String fullPath = "/knowledge/" + groupName;

    if (SD.exists(fullPath)) {
      server.send(400, "application/json", "{\"error\":\"O grupo/pasta ja existe\"}");
      return;
    }

    if (SD.mkdir(fullPath)) {
      updateKnowledgeBaseJson();
      server.sendHeader("Access-Control-Allow-Origin", "*");
      server.send(200, "application/json", "{\"status\":\"success\",\"message\":\"Grupo criado com sucesso\"}");
    } else {
      server.send(500, "application/json", "{\"error\":\"Erro ao criar o grupo no cartao SD\"}");
    }
  });

  server.on("/api/rename-group", HTTP_POST, []() {
    if (!server.hasArg("oldName") || !server.hasArg("newName")) {
      server.send(400, "application/json", "{\"error\":\"Parametros incompletos\"}");
      return;
    }

    String oldPath = "/knowledge/" + server.arg("oldName");
    String newPath = "/knowledge/" + server.arg("newName");

    if (!SD.exists(oldPath)) {
      server.send(404, "application/json", "{\"error\":\"Grupo original nao encontrado\"}");
      return;
    }

    if (SD.exists(newPath)) {
      server.send(400, "application/json", "{\"error\":\"Ja existe um grupo com esse nome\"}");
      return;
    }

    if (SD.rename(oldPath, newPath)) {
      updateKnowledgeBaseJson();
      server.sendHeader("Access-Control-Allow-Origin", "*");
      server.send(200, "application/json", "{\"status\":\"success\",\"message\":\"Grupo renomeado com sucesso\"}");
    } else {
      server.send(500, "application/json", "{\"error\":\"Erro ao renomear o grupo\"}");
    }
  });

  server.on("/api/delete-group", HTTP_POST, []() {
    if (!server.hasArg("group")) {
      server.send(400, "application/json", "{\"error\":\"Grupo nao informado\"}");
      return;
    }

    String groupPath = "/knowledge/" + server.arg("group");
    if (!SD.exists(groupPath)) {
      server.send(404, "application/json", "{\"error\":\"Grupo nao encontrado\"}");
      return;
    }

    File dir = SD.open(groupPath);
    if (dir && dir.isDirectory()) {
      File file = dir.openNextFile();
      while (file) {
        String filePath = groupPath + "/" + String(file.name());
        SD.remove(filePath);
        file = dir.openNextFile();
      }
      dir.close();
    }

    if (SD.rmdir(groupPath)) {
      updateKnowledgeBaseJson();
      server.sendHeader("Access-Control-Allow-Origin", "*");
      server.send(200, "application/json", "{\"status\":\"success\",\"message\":\"Grupo excluido com sucesso\"}");
    } else {
      server.send(500, "application/json", "{\"error\":\"Erro ao excluir o grupo\"}");
    }
  });

  server.on("/api/rename-file", HTTP_POST, []() {
    if (!server.hasArg("folder") || !server.hasArg("oldFile") || !server.hasArg("newFile")) {
      server.send(400, "application/json", "{\"error\":\"Parametros incompletos\"}");
      return;
    }

    String folder = server.arg("folder");
    String oldPath = "/knowledge/" + folder + "/" + server.arg("oldFile");
    String newPath = "/knowledge/" + folder + "/" + server.arg("newFile");

    if (!SD.exists(oldPath)) {
      server.send(404, "application/json", "{\"error\":\"Arquivo original nao encontrado\"}");
      return;
    }

    if (SD.rename(oldPath, newPath)) {
      updateKnowledgeBaseJson();
      server.sendHeader("Access-Control-Allow-Origin", "*");
      server.send(200, "application/json", "{\"status\":\"success\",\"message\":\"Arquivo renomeado com sucesso\"}");
    } else {
      server.send(500, "application/json", "{\"error\":\"Erro ao renomear o arquivo\"}");
    }
  });

  server.on("/api/delete-file", HTTP_POST, []() {
    if (!server.hasArg("folder") || !server.hasArg("file")) {
      server.send(400, "application/json", "{\"error\":\"Parametros incompletos\"}");
      return;
    }

    String filePath = "/knowledge/" + server.arg("folder") + "/" + server.arg("file");
    if (!SD.exists(filePath)) {
      server.send(404, "application/json", "{\"error\":\"Arquivo nao encontrado\"}");
      return;
    }

    if (SD.remove(filePath)) {
      updateKnowledgeBaseJson();
      server.sendHeader("Access-Control-Allow-Origin", "*");
      server.send(200, "application/json", "{\"status\":\"success\",\"message\":\"Arquivo excluido com sucesso\"}");
    } else {
      server.send(500, "application/json", "{\"error\":\"Erro ao excluir o arquivo\"}");
    }
  });

  server.on("/api/upload", HTTP_POST, []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", "{\"status\":\"success\",\"message\":\"Arquivo enviado com sucesso\"}");
  }, []() {
    HTTPUpload& upload = server.upload();
    
    static File fsUploadFile;
    static String uploadFolder = "";

    if (upload.status == UPLOAD_FILE_START) {
      if (server.hasArg("folder")) {
        uploadFolder = server.arg("folder");
      } else {
        uploadFolder = "Geral";
      }

      String filename = upload.filename;
      if (!filename.startsWith("/")) {
        filename = "/" + filename;
      }

      String fullPath = "/knowledge/" + uploadFolder + filename;
      fsUploadFile = SD.open(fullPath, FILE_WRITE);
    } 
    else if (upload.status == UPLOAD_FILE_WRITE) {
      if (fsUploadFile) {
        fsUploadFile.write(upload.buf, upload.currentSize);
      }
    } 
    else if (upload.status == UPLOAD_FILE_END) {
      if (fsUploadFile) {
        fsUploadFile.close();
        updateKnowledgeBaseJson();
      }
    }
  });
}

bool loadFileFromSD(String path, String contentType) {
  if (SD.exists(path)) {
    File file = SD.open(path, "r");
    server.streamFile(file, contentType);
    file.close();
    return true;
  }
  return false;
}

String getContentType(String filename) {
  if (filename.endsWith(".html") || filename.endsWith(".htm")) return "text/html";
  else if (filename.endsWith(".css")) return "text/css";
  else if (filename.endsWith(".js")) return "application/javascript";
  else if (filename.endsWith(".png")) return "image/png";
  else if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) return "image/jpeg";
  else if (filename.endsWith(".ico")) return "image/x-icon";
  else if (filename.endsWith(".xml")) return "text/xml";
  else if (filename.endsWith(".pdf")) return "application/x-pdf";
  else if (filename.endsWith(".zip")) return "application/x-zip";
  else if (filename.endsWith(".gz")) return "application/x-gzip";
  return "text/plain";
}

void showMessage(String title, String description){
  M5.Lcd.fillScreen(BLACK);
  M5.Display.setTextWrap(true);
  M5.Lcd.setTextSize(2);
  M5.Lcd.setCursor(0,0);
  M5.Lcd.println(title);

  M5.Lcd.setTextSize(2);
  M5.Lcd.setCursor(0,30);
  M5.Lcd.println(description);
}

bool updateKnowledgeBaseJson() {
  if (!SD.exists("/knowledge")) {
    SD.mkdir("/knowledge");
    return false;
  }

  File root = SD.open("/knowledge");
  if (!root || !root.isDirectory()) {
    if (root) root.close();
    return false;
  }

  JsonDocument doc;
  JsonArray knowledgeBaseData = doc.to<JsonArray>();

  int nextGroupId = 1;
  int nextFileId = 1;

  File folder = root.openNextFile();
  while (folder) {
    if (folder.isDirectory()) {
      String folderName = String(folder.name());
      if (!folderName.startsWith(".")) {
        JsonObject grupo = knowledgeBaseData.add<JsonObject>();
        grupo["groupId"] = "p" + String(nextGroupId++);
        grupo["groupName"] = folderName;
        grupo["Icon"] = "fa-folder";
        grupo["expanded"] = false;

        JsonArray itensGrupo = grupo["itens"].to<JsonArray>();

        File arq = folder.openNextFile();
        while (arq) {
          if (!arq.isDirectory()) {
            JsonObject item = itensGrupo.add<JsonObject>();
            item["id"] = "file-" + String(nextFileId++);
            item["title"] = String(arq.name());
            item["Icon"] = "fa-code";
          }
          arq.close();
          arq = folder.openNextFile();
        }
      }
    }
    
    File nextFolder = root.openNextFile();
    folder.close();
    folder = nextFolder;
    vTaskDelay(pdMS_TO_TICKS(2)); 
  }
  root.close();

  if (SD.exists("/knowledgeBase.json")) {
    SD.remove("/knowledgeBase.json");
  }

  File configFile = SD.open("/knowledgeBase.json", FILE_WRITE);
  if (!configFile) return false;

  if (serializeJson(doc, configFile) == 0) {
    configFile.close();
    return false;
  }
  
  configFile.close();
  return true;
}

void setup() {
  Serial.begin(115200);

  startConfig();
  startDisplay();
  startStorage();
  startWifi();
  startWebServer();
  updateKnowledgeBaseJson();
}

void loop() {
  server.handleClient();
  dnsServer.processNextRequest(); // Mantém o portal captivo ativo para redirecionar requisições

  M5Cardputer.update();
  delay(2);
}