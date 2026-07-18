# FactoryLens MCP

FactoryLens is a Model Context Protocol (MCP) server for smart factory operations. It gives AI assistants structured access to machine telemetry, maintenance records, equipment manuals, and production schedules so they can investigate equipment failures end to end — from sensor anomaly detection through root cause analysis, business impact estimation, and work order creation.

Built for the [Factory MCP Hackathon](https://github.com/janakir2006/Factory-mcp-Hackathon) using the [NitroStack](https://nitrostack.ai) SDK.

---

## The Problem

When a machine throws a telemetry alert, plant operators and engineers often have to jump between CSV exports, maintenance logs, PDF manuals, and production spreadsheets before they can decide what to do. That slows response time and makes it harder to connect sensor readings to business impact.

FactoryLens addresses this by exposing factory data and investigation logic as MCP **tools**, **resources**, and **prompts**. An AI client (Cursor, Claude Desktop, NitroStudio, etc.) can run a structured investigation workflow without leaving the chat interface.

---

## Key Features

- **Sensor anomaly analysis** — Parses CSV telemetry (temperature, vibration, current, voltage) and flags readings against configurable safety thresholds.
- **Maintenance history lookup** — Queries SQLite for repair logs by machine ID.
- **Manual search** — Full-text search across machine operating manuals for error codes and troubleshooting steps.
- **Root cause synthesis** — Combines sensor anomalies, maintenance history, manual excerpts, and optional weather context into a diagnosis with confidence score and evidence.
- **Business impact prediction** — Estimates downtime hours, production loss (INR), and risk level from the production schedule.
- **Work order management** — Creates maintenance tickets in SQLite and updates machine status for high-urgency cases.
- **Investigation reports** — Generates Markdown failure reports saved to `uploads/`.
- **Interactive widgets** — NitroStack widgets for sensor dashboards and root cause views inside MCP-compatible clients.
- **Role-specific prompts** — Pre-built prompts for field technicians, plant managers, and emergency shutdown advisories.
- **Demo frontend** — A React console that walks through the MCH-004 conveyor failure scenario with charts and a NitroChat-style interface.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| MCP Server | [NitroStack](https://nitrostack.ai) (`@nitrostack/core`, `@nitrostack/cli`) |
| Language | TypeScript, ES2022 modules |
| Validation | Zod |
| Database | SQLite3 (auto-seeded on first run) |
| Widgets | Next.js 14, React 18, `@nitrostack/widgets` |
| Frontend Demo | React 19, Vite 8, Tailwind CSS v4, Chart.js |
| Protocol | [Model Context Protocol](https://modelcontextprotocol.io) |

---

## Architecture

```
                     MCP Client (AI Assistant)
              Cursor · Claude Desktop · NitroStudio
                              |
                     MCP (stdio / HTTP SSE)
                              v
                    factory-mcp-server (NitroStack)
   FactoryTools (7 tools)  FactoryResources (4)  FactoryPrompts (3)
                              |
                 DatabaseService (SQLite)  +  File System (uploads/, resources/)
                              |
                        Widget data
                              v
              NitroStack Widgets (Next.js, port 3001)
        sensor-anomaly-dashboard · root-cause-investigation

              Frontend Demo Console (React + Vite, port 5173)
             Standalone UI — simulates the investigation workflow
```

### Investigation workflow

The intended MCP tool chain for a failure event:

1. `analyze_sensor_data` — Upload or read sensor CSV; detect threshold breaches.
2. `get_maintenance_history` — Pull recent repairs for the affected machine.
3. `search_machine_manual` — Find relevant manual sections (e.g. E101, overheating).
4. `analyze_root_cause` — Synthesize a diagnosis from the above inputs.
5. `predict_business_impact` — Estimate downtime and revenue loss.
6. `create_work_order` — Log a maintenance ticket and update machine status.
7. `generate_investigation_report` — Produce a Markdown report for stakeholders.

The demo scenario centers on **MCH-004** (Conveyor System, Packaging Line 1), where rising temperature, vibration, and current point to drive belt slippage.

---

## Folder Structure

```
Factory-mcp-Hackathon/
├── src/                          # MCP server source
│   ├── index.ts                  # Server bootstrap (McpApplicationFactory)
│   ├── app.module.ts             # Root NitroStack module
│   ├── database/
│   │   └── db.ts                 # SQLite service + schema seeding
│   ├── health/
│   │   └── system.health.ts      # Memory/uptime health check
│   ├── modules/factory/
│   │   ├── factory.module.ts     # Factory feature module
│   │   ├── factory.tools.ts      # MCP tools (7)
│   │   ├── factory.resources.ts  # MCP resources (4)
│   │   └── factory.prompts.ts    # MCP prompts (3)
│   └── widgets/                  # NitroStack interactive widgets
│       ├── app/
│       │   ├── sensor-anomaly-dashboard/
│       │   └── root-cause-investigation/
│       └── widget-manifest.json
├── frontend/                     # Standalone demo React app
│   └── src/App.tsx               # FactoryLens investigation console
├── database/
│   ├── factory.db                # SQLite database (auto-created)
│   └── sensor.csv                # Sample telemetry for MCH-004
├── resources/manuals/
│   └── MCH-004-manual.txt        # CS-400 conveyor maintenance manual
├── uploads/                      # Uploaded CSVs and generated reports
├── .env.example                  # Environment variable template
├── package.json                  # MCP server dependencies & scripts
└── start-mcp.cmd                 # Windows production start script
```

---

## Prerequisites

- **Node.js** 18+ (22 recommended)
- **npm** 9+

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/janakir2006/Factory-mcp-Hackathon.git
cd Factory-mcp-Hackathon
```

### 2. Install MCP server dependencies

```bash
npm install
```

Or use the NitroStack installer to pull server and widget dependencies:

```bash
npm run install:all
```

### 3. Configure environment

```bash
cp .env.example .env
```

### 4. (Optional) Frontend demo

```bash
cd frontend
npm install
cd ..
```

### 5. (Optional) Widgets

```bash
cd src/widgets
npm install
cd ../..
```

---

## Running the Project

### MCP server (development)

Starts the server over STDIO (default for local MCP clients):

```bash
npm run dev
```

### MCP server (production)

Builds and starts with dual transport (STDIO + HTTP SSE):

```bash
npm run build
npm run start:prod
```

On Windows, you can also use:

```cmd
start-mcp.cmd
```

### Frontend demo console

```bash
cd frontend
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`). The frontend runs a **simulated** investigation flow for MCH-004; it does not call the MCP server directly.

### Widgets (for NitroStack / MCP ext-apps)

```bash
cd src/widgets
npm run dev
```

Widgets run on port **3001**.

### Testing with NitroStudio

[NitroStudio](https://nitrostack.ai/studio) is the recommended way to exercise tools, resources, prompts, and widgets during development.

---

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed:

| Variable | Default | Description |
|---|---|---|
| `NITRO_LOG_LEVEL` | `info` | Server log verbosity |
| `NITROSTACK_APP_MODE` | `openai` | NitroStack app mode |
| `MCP_TRANSPORT_TYPE` | `stdio` (dev) / `dual` (prod) | Transport: `stdio`, `http`, or `dual` |
| `PORT` | `3000` | HTTP port when using HTTP/dual transport |
| `HOST` | `localhost` | HTTP bind address |
| `ENABLE_CORS` | — | Enable CORS for HTTP transport |

`NODE_ENV=production` switches to dual transport (STDIO + HTTP SSE) automatically.

No API keys are required for the core server; all data is local (SQLite + files).

---

## MCP Server Reference

**Server name:** `factory-mcp-server`
**Version:** `1.0.0`

### Tools

| Tool | Description | Widget |
|---|---|---|
| `analyze_sensor_data` | Parse sensor CSV and detect anomalies (temp > 65°C, vibration > 2.5 mm/s, current outside 4.0–5.5 A) | `sensor-anomaly-dashboard` |
| `get_maintenance_history` | Fetch maintenance logs for a machine from SQLite | — |
| `search_machine_manual` | Search manuals for error codes and troubleshooting text | — |
| `analyze_root_cause` | Diagnose failure from anomalies, history, manual matches, and weather | `root-cause-investigation` |
| `predict_business_impact` | Estimate downtime, production loss (INR), and risk level | — |
| `create_work_order` | Insert a maintenance ticket; set machine status to `critical` for high/emergency urgency | — |
| `generate_investigation_report` | Compile and save a Markdown investigation report | — |

### Resources

| URI | Description |
|---|---|
| `factory://manuals/{machine_id}` | Machine operating manual (plain text) |
| `factory://maintenance/{machine_id}` | Maintenance history (JSON) |
| `factory://production/schedule` | Active production schedules with machine status |
| `factory://machines/specs` | Fleet inventory and status |

### Prompts

| Prompt | Purpose |
|---|---|
| `explain_to_technician` | Field advisory with LOTO guidelines and corrective steps |
| `summarize_for_manager` | Executive summary with downtime, cost, and priority |
| `emergency_shutdown_recommendation` | Critical shutdown advisory with safety commands |

### Sample data

On first run, SQLite is seeded with five machines (MCH-001 through MCH-005), maintenance logs, and production schedules. Sample sensor data lives at `database/sensor.csv`. The MCH-004 manual is at `resources/manuals/MCH-004-manual.txt`.

---

## Connecting an MCP Client

Example Cursor MCP config (STDIO):

```json
{
  "mcpServers": {
    "factory-lens": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/path/to/Factory-mcp-Hackathon"
    }
  }
}
```

Build first with `npm run build`, or point the command at `npm run dev` via your client's preferred setup.

---

## Future Improvements

- **Live frontend ↔ MCP integration** — Wire the React console to the MCP server over HTTP instead of mock data.
- **Real-time sensor ingestion** — Stream telemetry from MQTT/OPC-UA instead of CSV uploads.
- **LLM-driven root cause analysis** — Replace rule-based diagnosis with model inference while keeping structured tool outputs.
- **Multi-machine correlation** — Detect failures that span production lines or shared utilities.
- **Authentication & RBAC** — Role-based access for operators, engineers, and managers (NitroStack guards are scaffolded in project skills).
- **External weather API** — Fetch live humidity/temperature instead of hardcoded defaults in `analyze_root_cause`.
- **PDF manual parsing** — Support uploaded PDF manuals, not only plain-text files.
- **Alert webhooks** — Notify Slack/Teams when anomalies or emergency work orders are created.
- **Expanded widget manifest** — Register sensor and root-cause widgets in `widget-manifest.json` (currently still lists calculator examples from the starter template).

---

## Team

Built for the Factory MCP Hackathon.

| Name | Role | GitHub |
|---|---|---|
| Jankaki R | Project author | [@janakir2006](https://github.com/janakir2006) |
| Mokshitha Yarlagadda | Contributor | — |

> Update this table with your full hackathon team names and roles.

Repository: [github.com/janakir2006/Factory-mcp-Hackathon](https://github.com/janakir2006/Factory-mcp-Hackathon)

---

## License

MIT License — see project footer in the frontend demo.

---

## Related Links

- [NitroStack Documentation](https://docs.nitrostack.ai)
- [NitroStudio](https://nitrostack.ai/studio) — MCP testing and debugging
- [Model Context Protocol](https://modelcontextprotocol.io)
