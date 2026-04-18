<div align="center">
  <h1>🛡️ WLAN IoT Honeypot & Threat Analytics Dashboard</h1>
  <p><i>An advanced, real-time threat intelligence platform for detecting, analyzing, and visualizing credential attacks on IoT networks.</i></p>
</div>

<br />

## 🌟 Overview

The **WLAN IoT Honeypot Dashboard** is a comprehensive security research project designed to simulate vulnerable IoT devices on a network and monitor malicious activities in real-time. By deploying simulated ESP32 devices (acting as captive portals or FTP servers) and an advanced Node.js backend, this system attracts attackers, logs their actions, and uses Machine Learning to predict and classify threats.

The frontend features a stunning, glassmorphism-inspired dark UI with dynamic network graphs, live geolocation of attackers, and predictive analytics.

---

## ✨ Key Features

- **🌐 Live Threat Geolocation**: Visualizes attacker IPs on an interactive map using Leaflet.js.
- **🔗 IP Network Graph**: Maps connections between attackers and simulated ESP32 nodes via `vis-network`.
- **🤖 Machine Learning Analysis**:
  - **TF.js Botnet Threat**: Analyzes attack patterns to assign a threat probability score.
  - **K-Means Clustering**: Groups threats into distinct profiles based on attack vectors.
  - **LSTM Prediction (Brain.js)**: Predicts the next credentials an attacker is likely to try.
- **📊 Real-time Analytics**: Displays top used credentials and predictive attack volume forecasting using Chart.js.
- **📥 Reporting**: Export attack logs to CSV or download the entire dashboard as a PDF.
- **📟 Raw Matrix Stream**: A live terminal view of incoming honeypot traffic.

---

## 🛠️ Technology Stack

### **Frontend**
- **HTML5/CSS3**: Glassmorphism UI, Dark Theme
- **JavaScript**: Real-time DOM manipulation
- **Chart.js**: Data visualization
- **TensorFlow.js**: In-browser machine learning execution
- **Leaflet.js**: Geospatial mapping
- **Vis-Network**: Network topology graphing

### **Backend**
- **Node.js & Express**: High-performance REST API
- **SQLite3**: Lightweight, file-based database for attack logs
- **Brain.js & ML-Kmeans**: Server-side machine learning and clustering

### **Hardware/Simulated Nodes**
- **ESP32 Captive Portal**: Simulates a vulnerable open Wi-Fi login page.
- **ESP32 FTP Node**: Simulates an insecure file server.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+)
- npm (Node Package Manager)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Prasannaraj2k5/Honeypot-WLAN-IOT-SECURITY.git
   cd Honeypot-WLAN-IOT-SECURITY
   ```

2. **Install Backend Dependencies:**
   ```bash
   cd backend
   npm install
   ```

3. **Start the Backend Server:**
   ```bash
   npm start
   ```
   *The server will run on `http://localhost:3000` and automatically create the SQLite database.*

4. **Launch the Dashboard:**
   - Open `frontend/index.html` in your web browser.
   - For the best experience, use a local server like Live Server (VS Code).

5. **Run the Attacker Demo:**
   - Open `demo_client/index.html` in a separate browser window.
   - Simulate an attack by entering credentials and watch the dashboard update in real-time!

---

## 📂 Project Structure

```text
├── backend/                  # Node.js Express Server, ML models, & SQLite DB
├── frontend/                 # Analytics Dashboard UI (HTML, CSS, JS)
├── demo_client/              # Web-based attacker simulation tool
├── esp32_captive_portal/     # Arduino code for ESP32 Captive Portal Honeypot
├── esp32_node2_ftp/          # Arduino code for ESP32 FTP Server Honeypot
├── automated_tester.js       # Script for generating load/simulated attacks
└── test_data.js              # Sample data for ML training/testing
```

---

## 🛡️ Disclaimer

This project is built for **educational and research purposes only**. It is designed to be deployed in controlled environments to study attacker behavior and improve IoT security. Do not use this software for malicious purposes or on networks you do not own or have explicit permission to monitor.
