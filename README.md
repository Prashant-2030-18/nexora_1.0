# MDoNER AI-Based Smart Logistics and Accessibility Intelligence Platform (NER-SmartLogix)

[![SIH Prototype](https://img.shields.io/badge/SIH-Final%20Prototype-blue.svg)](https://sih.gov.in)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React%2018%20+%20Vite-61dafb.svg)](https://reactjs.org/)
[![Database](https://img.shields.io/badge/Database-SQLite3%20%2B%20SQLAlchemy-003B57.svg)](https://sqlite.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

An end-to-end, production-grade AI + GIS + Logistics Intelligence Platform built for the **Ministry of Development of North Eastern Region (MDoNER)**.

NER-SmartLogix combines **AI spatial reasoning**, **GIS cartography**, **deterministic multi-criteria routing**, **live disaster telemetry**, and **PM-DevINE infrastructure planning** across all 8 North Eastern states (Assam, Arunachal Pradesh, Manipur, Meghalaya, Mizoram, Nagaland, Tripura, Sikkim).

---

## 🌟 Core Value Proposition

> *"Use AI and GIS to understand where the North Eastern Region is inaccessible, optimize how goods move through it, predict disruptions before they happen, and help governments decide where infrastructure investment will have the greatest impact."*

---

## 🚀 Key Features

### 1. 🎯 Interactive 11-Step SIH Presentation Demo Mode
- A one-click guided tour controller that leads judges and evaluators through every milestone:
  1. **NER Command Center & Top KPIs** (8 States, Accessibility, Active Hubs, At-Risk Routes)
  2. **Low-Accessibility District Selection** (e.g. Dima Hasao, Tawang)
  3. **9-Factor MDoNER Weighted Accessibility Diagnostic** with automated AI explainability
  4. **Multi-Criteria Route Planning** (Guwahati ➔ Imphal)
  5. **4-Profile Comparison** (Fastest vs Cheapest vs Safest vs Most Reliable)
  6. **Live Natural Hazard Detection** (Landslide blockage on NH-6)
  7. **Dynamic AI Rerouting** (34% risk reduction via Mahasadak bypass)
  8. **Infrastructure Gap Intelligence** (Cold storage deficits, missing railheads)
  9. **AI Logistics Hub Siting** (Spatial gravity model, 42 ➔ 76 accessibility uplift)
  10. **What-If Scenario Simulator** (Highway closure, hub deployment, greenfield expressways)
  11. **NER Intelligence Copilot Query** (Direct SQLite-backed NLP decision support)

### 2. 🗺️ Multi-Layer GIS Spatial Intelligence Map
- **Leaflet + CartoDB Dark Matter / OSM cartography**
- Overlays for:
  - National Highways (NH-27, NH-6, NH-29, NH-2, NH-37, NH-10, NH-8, etc.)
  - Transshipment Logistics Hubs & Railheads
  - Grade-A Cold Storage & Dry Warehouses
  - Live Landslide, Flood, and Scour Hazard zones
  - District polygons and accessibility scorecard popups

### 3. 🧠 Deterministic AI Routing Engine
- Multi-criteria Dijkstra graph algorithms calculating 4 distinct strategies:
  - **Fastest Route**: Speed-optimized for multi-lane corridors.
  - **Cheapest Route**: Minimizes toll fees and gradient-weighted fuel consumption.
  - **Safest Route**: Minimizes landslide and river flood exposure.
  - **Most Reliable Route**: Maximizes historical uptime and engineered bypasses.
- **Dynamic Rerouting**: Detects road incidents and provides immediate 1-click alternative corridors with quantified savings.

### 4. 📊 9-Factor MDoNER Weighted Accessibility Formula
$$\text{Accessibility Index} = 0.25 \times \text{Road} + 0.15 \times \text{Highway} + 0.10 \times \text{Rail} + 0.10 \times \text{Airport} + 0.15 \times \text{Logistics Hub} + 0.10 \times \text{Travel Time} + 0.05 \times \text{Emergency} + 0.05 \times \text{Weather} + 0.05 \times \text{Network}$$
- Automated textual AI explainability summaries breaking down root structural causes.

### 5. 🤖 NER Intelligence Copilot (Database-Backed Assistant)
- Floating assistant querying live SQLite database records to answer complex policy, routing, disaster, and investment questions.

### 6. 🔮 Predictive ML Risk & Traffic Forecast
- 24–72 hour probability modeling for landslides, river floods, and road scour.
- Corridor disruption probability matrix and hourly traffic speed curves.

### 7. 🧪 What-If Scenario Simulator
- **Scenario 1**: Close a Major Highway (delays, freight cost surge, shipments affected).
- **Scenario 2**: Build a Logistics Hub (catchment reach, perishables spoilage drop).
- **Scenario 3**: Build a Greenfield Expressway (transit time reduction, regional trade ROI).

### 8. 📄 Executive Reports & Data Exports
- One-click downloadable **Official PDF Briefs** and **CSV datasets**.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons, Recharts, Leaflet, React-Leaflet, Axios |
| **Backend** | Python 3.11, FastAPI, SQLAlchemy 2.0, Pydantic v2, Uvicorn, NetworkX, ReportLab |
| **Database** | SQLite3 (`ner_smartlogix.db`) with relational integrity and automatic schema migrations |
| **Security** | JWT (JSON Web Tokens), BCrypt password hashing, Role-Based Access Control (RBAC) |

---

## 👥 Role-Based Access Control (RBAC)

1. **Admin / MDoNER**: Full system access, all 8 states, user management, incident controls, infrastructure planning, audit logs.
2. **State Government**: State-level scope, district diagnostics, state logistics, state incident reporting.
3. **Logistics Operator**: Fleet tracking, shipments dispatch, route calculator, warehouse utilization, AI optimization.
4. **Citizen / Transporter**: Commuter route finder, road safety warnings, district connectivity index.

---

## 🔑 Demo Accounts (Pre-Seeded)

| Role | Email | Password |
|---|---|---|
| **MDoNER Admin** | `admin@nersmartlogix.gov.in` | `Admin@123` |
| **State Government (Assam)** | `assam.gov@nersmartlogix.gov.in` | `Assam@123` |
| **State Government (Meghalaya)** | `meghalaya.gov@nersmartlogix.gov.in` | `Meghalaya@123` |
| **Logistics Operator** | `operator@nerlogix.in` | `Operator@123` |
| **Citizen / Driver** | `user@nersmartlogix.in` | `User@123` |

*(Note: The login page includes 1-click quick credentials switcher buttons for instant demonstration).*

---

## 💻 Installation & Running

### Prerequisites
- Python 3.10+
- Node.js 18+ and npm

### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install Python dependencies
pip install -r requirements.txt

# Seed the SQLite database with 8 NE states, 40+ districts, roads, and hubs
python seed.py

# Start FastAPI backend server (Runs on http://127.0.0.1:8000)
uvicorn app.main:app --reload --port 8000
```

Backend API Swagger Docs will be available at: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### 2. Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start Vite development server (Runs on http://localhost:5173)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🗄️ Database Architecture (`ner_smartlogix.db`)

- `users`: User authentication, roles, state domains, hashed passwords.
- `states`: 8 North Eastern states, population, risk ratings.
- `districts`: 40+ districts with coordinates and 9 weighted accessibility factors.
- `roads`: National highways and key corridors, average speeds, conditions, risk.
- `logistics_hubs`: Multi-modal terminals, transshipment capacities, utilizations.
- `warehouses`: Storage centers, cold-storage status, current inventory levels.
- `vehicles` & `shipments`: Fleet assets, active consignments, cargo types, ETAs.
- `incidents` & `alerts`: Active natural hazards, landslides, flood alerts.
- `infrastructure_gaps`: Structural bottlenecks and PM-DevINE action items.
- `simulation_results` & `audit_logs`: Simulation records and administrative audit trails.

---

## 🛡️ Important Disclaimer
*This prototype uses simulated/demo data where live government GIS APIs are unavailable. The architecture is engineered for direct integration with authorized GIS, MoRTH, IMD, and state logistics APIs.*
