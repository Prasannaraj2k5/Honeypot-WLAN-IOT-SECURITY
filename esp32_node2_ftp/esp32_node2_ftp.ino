#include <HTTPClient.h>
#include <WebServer.h>
#include <WiFi.h>

// --- Configuration ---
const char *ssid = "prasanna";
const char *password = "Password";

// Node.js Backend endpoint
// IMPORTANT: Change this IP to your laptop's IP on the same network
const char *backendURL = "http://10.77.11.36:3000/api/report";

// FTP uses Port 21
WiFiServer ftpServer(21);
// Alarm mock
WebServer server(80);

void setup() {
  Serial.begin(115200);

  Serial.print("Connecting to WiFi");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected to WiFi!");
  Serial.print("ESP32 IP Address: ");
  Serial.println(WiFi.localIP());

  // Hardware alarm endpoint
  server.on("/alarm", HTTP_POST, []() {
    Serial.println("ALARM TRIGGERED FOR NODE-2!");
    // In hardware, digitalWrite(ALARM_PIN, HIGH) goes here
    server.send(200, "application/json", "{\"success\":true}");
  });
  server.begin();
  Serial.println("Alarm server started on port 80.");

  ftpServer.begin();
  Serial.println("FTP server started on port 21.");
}

void reportAttack(String ip, String protocol, String uname, String pwd) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(backendURL);
    http.addHeader("Content-Type", "application/json");

    String jsonPayload = "{\"node_id\":\"Node-2 (FTP Camera)\", \"ip\":\"" + ip + "\", \"protocol\":\"" + protocol +
                         "\", \"username\":\"" + uname + "\", \"password\":\"" + pwd + "\"}";

    int httpResponseCode = http.POST(jsonPayload);

    if (httpResponseCode > 0) {
      Serial.println("Reported to backend successfully: " + String(httpResponseCode));
    } else {
      Serial.println("Error reporting to backend: " + String(httpResponseCode));
    }
    http.end();
  }
}

void loop() {
  server.handleClient();

  // Handle FTP clients
  if (ftpServer.hasClient()) {
    WiFiClient ftpClient = ftpServer.available();
    if (ftpClient) {
      String clientIP = ftpClient.remoteIP().toString();
      Serial.println("[FTP Warning] Connection attempt from " + clientIP);

      // FTP 220 banner (vsFTPd mock)
      ftpClient.print("220 (vsFTPd 3.0.3)\r\n");

      long startTime = millis();
      String input = "";
      String ftpUser = "";
      String ftpPass = "";

      while (ftpClient.connected() && millis() - startTime < 15000) {
        if (ftpClient.available()) {
          char c = ftpClient.read();
          if (c == '\n' || c == '\r') {
            if (input.length() > 0) {
              if (input.startsWith("USER ")) {
                ftpUser = input.substring(5);
                ftpClient.print("331 Please specify the password.\r\n");
              } else if (input.startsWith("PASS ")) {
                ftpPass = input.substring(5);
                // We have both credentials!
                reportAttack(clientIP, "FTP", ftpUser, ftpPass);
                ftpClient.print("530 Login incorrect.\r\n");
                delay(500);
                break;
              } else {
                ftpClient.print("500 Unknown command.\r\n");
              }
              input = "";
            }
          } else {
            input += c;
          }
        }
      }
      ftpClient.stop();
      Serial.println("[FTP] Disconnected attacker.");
    }
  }
}
