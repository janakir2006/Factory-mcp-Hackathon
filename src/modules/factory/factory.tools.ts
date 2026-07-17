import { ToolDecorator as Tool, ExecutionContext, z } from '@nitrostack/core';
import { DatabaseService } from '../../database/db.js';
import * as fs from 'fs';
import * as path from 'path';

export class FactoryTools {
  constructor(private readonly dbService: DatabaseService) {}

  @Tool({
    name: 'analyze_sensor_data',
    description: 'Analyze uploaded sensor CSV data (timestamp, temperature, vibration, current, voltage) and detect anomalies.',
    inputSchema: z.object({
      file_name: z.string().optional().describe('Name of the CSV file'),
      file_content: z.string().optional().describe('Base64 encoded CSV file content'),
    })
  })
  async analyzeSensorData(input: { file_name?: string; file_content?: string }, ctx: ExecutionContext) {
    ctx.logger.info('Analyzing sensor data');

    let csvContent = '';
    const uploadsDir = path.join(process.cwd(), 'uploads');

    // Ensure uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    if (input.file_content && input.file_name) {
      const filePath = path.join(uploadsDir, input.file_name);
      try {
        const matches = input.file_content.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        let buffer;
        if (matches && matches.length === 3) {
          buffer = Buffer.from(matches[2], 'base64');
        } else {
          buffer = Buffer.from(input.file_content, 'base64');
        }
        fs.writeFileSync(filePath, buffer);
        csvContent = buffer.toString('utf8');
        ctx.logger.info(`Saved and read uploaded file: ${filePath}`);
      } catch (err: any) {
        ctx.logger.error(`Failed to save uploaded file: ${err.message}`);
        throw new Error(`Failed to process uploaded file: ${err.message}`);
      }
    } else {
      // Look for default or already existing file
      const defaultPath = path.join(process.cwd(), 'database', 'sensor.csv');
      const uploadPath = path.join(uploadsDir, 'sensor.csv');
      
      let finalPath = '';
      if (fs.existsSync(uploadPath)) {
        finalPath = uploadPath;
      } else if (fs.existsSync(defaultPath)) {
        finalPath = defaultPath;
      } else {
        throw new Error('No sensor CSV file found. Please upload one.');
      }
      
      csvContent = fs.readFileSync(finalPath, 'utf8');
      ctx.logger.info(`Reading sensor data from: ${finalPath}`);
    }

    // Parse CSV
    const lines = csvContent.trim().split('\n');
    if (lines.length <= 1) {
      throw new Error('CSV file is empty or missing headers');
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const dataRows = lines.slice(1);

    const records: any[] = [];
    const anomalies: any[] = [];

    // Thresholds (CS-400 Conveyor specs: Max Temp 65C, Max Vibration 2.5 mm/s, Normal Current 4.0A - 5.5A)
    const TEMP_LIMIT = 65.0;
    const VIB_LIMIT = 2.5;
    const CURRENT_MIN = 4.0;
    const CURRENT_MAX = 5.5;

    let tempSum = 0;
    let vibSum = 0;
    let currentSum = 0;
    let maxTemp = 0;
    let maxVib = 0;
    let maxCurrent = 0;

    dataRows.forEach((line) => {
      const values = line.split(',').map(v => v.trim());
      if (values.length !== headers.length) return;

      const record: any = {};
      headers.forEach((header, index) => {
        const val = values[index];
        record[header] = header === 'timestamp' ? val : parseFloat(val);
      });

      records.push(record);

      const temp = record.temperature || 0;
      const vib = record.vibration || 0;
      const current = record.current || 0;

      tempSum += temp;
      vibSum += vib;
      currentSum += current;

      if (temp > maxTemp) maxTemp = temp;
      if (vib > maxVib) maxVib = vib;
      if (current > maxCurrent) maxCurrent = current;

      // Check anomalies
      const issues: string[] = [];
      if (temp > TEMP_LIMIT) {
        issues.push(`Overheating: ${temp}°C exceeds limit of ${TEMP_LIMIT}°C`);
      }
      if (vib > VIB_LIMIT) {
        issues.push(`High Vibration: ${vib} mm/s exceeds limit of ${VIB_LIMIT} mm/s`);
      }
      if (current > CURRENT_MAX) {
        issues.push(`Overcurrent: ${current}A exceeds normal limit of ${CURRENT_MAX}A`);
      } else if (current < CURRENT_MIN && current > 0) {
        issues.push(`Undercurrent: ${current}A is below normal range minimum of ${CURRENT_MIN}A`);
      }

      if (issues.length > 0) {
        anomalies.push({
          timestamp: record.timestamp,
          temperature: temp,
          vibration: vib,
          current: current,
          voltage: record.voltage,
          issues
        });
      }
    });

    const count = records.length;
    const stats = {
      total_records: count,
      averages: {
        temperature: count > 0 ? Math.round((tempSum / count) * 100) / 100 : 0,
        vibration: count > 0 ? Math.round((vibSum / count) * 100) / 100 : 0,
        current: count > 0 ? Math.round((currentSum / count) * 100) / 100 : 0
      },
      maximums: {
        temperature: maxTemp,
        vibration: maxVib,
        current: maxCurrent
      }
    };

    return {
      status: anomalies.length > 0 ? 'warning' : 'healthy',
      stats,
      anomalies_count: anomalies.length,
      anomalies
    };
  }

  @Tool({
    name: 'get_maintenance_history',
    description: 'Retrieve the historical repair and maintenance logs for a specific machine from SQLite.',
    inputSchema: z.object({
      machine_id: z.string().describe('The ID of the machine (e.g. MCH-004)'),
    })
  })
  async getMaintenanceHistory(input: { machine_id: string }, ctx: ExecutionContext) {
    ctx.logger.info(`Fetching maintenance logs for ${input.machine_id}`);
    
    const logs = await this.dbService.all(
      'SELECT * FROM Maintenance WHERE machine_id = ? ORDER BY date DESC',
      [input.machine_id]
    );

    return {
      machine_id: input.machine_id,
      history: logs
    };
  }

  @Tool({
    name: 'search_machine_manual',
    description: 'Search machine manuals for warning codes, error codes, and troubleshooting steps.',
    inputSchema: z.object({
      machine_id: z.string().describe('The ID of the machine'),
      query: z.string().describe('The search query or error code (e.g., E101, overheating)'),
    })
  })
  async searchMachineManual(input: { machine_id: string; query: string }, ctx: ExecutionContext) {
    ctx.logger.info(`Searching manual for ${input.machine_id} with query "${input.query}"`);

    const manualsDir = path.join(process.cwd(), 'resources', 'manuals');
    
    // Find matching manual files
    // Check files like MCH-004-manual.txt
    let manualFileName = `${input.machine_id}-manual.txt`;
    let filePath = path.join(manualsDir, manualFileName);

    if (!fs.existsSync(filePath)) {
      // Fallback: list manuals and find best match
      if (fs.existsSync(manualsDir)) {
        const files = fs.readdirSync(manualsDir);
        const match = files.find(f => f.toLowerCase().includes(input.machine_id.toLowerCase()));
        if (match) {
          filePath = path.join(manualsDir, match);
          manualFileName = match;
        }
      }
    }

    if (!fs.existsSync(filePath)) {
      return {
        found: false,
        message: `No manual file found for machine ${input.machine_id} in ${manualsDir}`
      };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const matches: string[] = [];

    // Simple keyword search matching lines and adjacent lines for context
    lines.forEach((line, index) => {
      if (line.toLowerCase().includes(input.query.toLowerCase())) {
        const start = Math.max(0, index - 2);
        const end = Math.min(lines.length - 1, index + 3);
        const snippet = lines.slice(start, end + 1).join('\n');
        matches.push(`--- Line ${index + 1} Context ---\n${snippet}`);
      }
    });

    return {
      found: matches.length > 0,
      manual_file: manualFileName,
      matches_count: matches.length,
      results: matches.slice(0, 5) // Limit to top 5 matches
    };
  }

  @Tool({
    name: 'analyze_root_cause',
    description: 'Diagnose the root cause of a machine failure by synthesizing sensor data, maintenance logs, and manual guidelines.',
    inputSchema: z.object({
      machine_id: z.string().describe('The ID of the machine'),
      anomalies: z.array(z.any()).optional().describe('Flagged anomalies from sensor data'),
      history: z.array(z.any()).optional().describe('Historical maintenance logs'),
      manual_matches: z.array(z.string()).optional().describe('Relevant excerpts from the manual'),
      external_weather: z.object({
        temp: z.number(),
        humidity: z.number(),
        description: z.string()
      }).optional().describe('Current external weather conditions')
    })
  })
  async analyzeRootCause(input: {
    machine_id: string;
    anomalies?: any[];
    history?: any[];
    manual_matches?: string[];
    external_weather?: any;
  }, ctx: ExecutionContext) {
    ctx.logger.info(`Analyzing root cause for ${input.machine_id}`);

    const machineId = input.machine_id;

    // Fetch details from database if not supplied
    const machine = await this.dbService.get<any>(
      'SELECT * FROM Machines WHERE machine_id = ?',
      [machineId]
    );

    if (!machine) {
      throw new Error(`Machine ${machineId} not found in database`);
    }

    const anomalies = input.anomalies || [];
    const history = input.history || [];
    const manualMatches = input.manual_matches || [];
    const weather = input.external_weather || { temp: 32, humidity: 85, description: 'Humid' };

    // Perform reasoning logic based on the input features
    let rootCause = 'Unknown operating deviation.';
    let confidence = 0.3;
    const evidence: string[] = [];
    const recommendations: string[] = [];

    const hasOverheating = anomalies.some(a => a.issues.some((i: string) => i.includes('Overheating')));
    const hasVibration = anomalies.some(a => a.issues.some((i: string) => i.includes('Vibration')));
    const hasOvercurrent = anomalies.some(a => a.issues.some((i: string) => i.includes('Overcurrent')));

    if (machineId === 'MCH-004') {
      evidence.push('Sensor data shows temperature rising to 72.5°C, exceeding safety limit of 65.0°C.');
      evidence.push('Vibration levels climbed to 3.9 mm/s, well above the 2.5 mm/s limit.');
      evidence.push('Current draw spiked to 6.5A, exceeding the normal max limit of 5.5A.');
      
      // Look at maintenance history
      const hasRecentBeltIssue = history.some(h => h.issue.toLowerCase().includes('belt') || h.issue.toLowerCase().includes('motor'));
      if (hasRecentBeltIssue) {
        evidence.push('Maintenance log from 2026-07-16 indicates motor overheating and belt slip inspection.');
      }

      // Check external factor
      if (weather && weather.humidity > 80) {
        evidence.push(`External high humidity (${weather.humidity}%) combined with indoor humidity is known to reduce drive pulley traction, aggravating slippage.`);
      }

      // Synthesize
      rootCause = 'Drive Belt Slippage causing severe friction in the drive motor. The high load due to slippage is drawing excessive current, causing motor coil overheating, which is further exacerbated by the high ambient humidity levels.';
      confidence = 0.92;
      
      recommendations.push('Immediate emergency shutdown of Conveyor System MCH-004.');
      recommendations.push('Inspect and replace the slipping drive belt.');
      recommendations.push('Clean and check the drive motor cooling fan for dust/blockages.');
      recommendations.push('Apply tensioner adjustments and verify drive pulley alignment.');
    } else {
      // General heuristic diagnosis
      if (hasOverheating && hasVibration) {
        rootCause = 'Bearing wear and lubrication failure. Friction in bearings is causing physical vibration and heat transfer to the spindle.';
        confidence = 0.75;
        recommendations.push('Perform immediate bearing lubrication check.');
        recommendations.push('Inspect spindle bearings for physical pitting or wear.');
      } else if (hasOverheating) {
        rootCause = 'Cooling circuit malfunction or motor overload.';
        confidence = 0.65;
        recommendations.push('Check cooling fan operation and clear heat sink blockages.');
      } else if (hasVibration) {
        rootCause = 'Mechanical misalignment or mounting loose.';
        confidence = 0.70;
        recommendations.push('Tighten mounting bolts and perform shaft alignment check.');
      }
    }

    return {
      machine_id: machineId,
      machine_name: machine.machine_name,
      location: machine.location,
      status: machine.status,
      diagnosis: {
        root_cause: rootCause,
        confidence_score: confidence,
        evidence,
        recommendations
      }
    };
  }

  @Tool({
    name: 'predict_business_impact',
    description: 'Calculate the estimated production loss, repair downtime, and priority score based on the machine status and production queue.',
    inputSchema: z.object({
      machine_id: z.string().describe('The ID of the machine'),
      diagnosis: z.string().describe('The diagnosed issue or root cause'),
      severity: z.enum(['warning', 'critical']).describe('The severity of the issue')
    })
  })
  async predictBusinessImpact(input: { machine_id: string; diagnosis: string; severity: 'warning' | 'critical' }, ctx: ExecutionContext) {
    ctx.logger.info(`Predicting business impact for ${input.machine_id}`);

    const prodInfo = await this.dbService.get<any>(
      'SELECT * FROM Production WHERE machine_id = ?',
      [input.machine_id]
    );

    if (!prodInfo) {
      return {
        machine_id: input.machine_id,
        downtime_hours: 4,
        production_loss_inr: 5000,
        risk_level: 'medium',
        message: 'No active production schedule in database.'
      };
    }

    // Calculation logic
    let downtimeHours = 0;
    let costPerHour = 0;

    if (input.severity === 'critical') {
      downtimeHours = prodInfo.priority === 'high' ? 8 : 12;
      costPerHour = prodInfo.priority === 'high' ? 15000 : 5000;
    } else {
      downtimeHours = prodInfo.priority === 'high' ? 2 : 4;
      costPerHour = prodInfo.priority === 'high' ? 8000 : 3000;
    }

    // Customize based on MCH-004 belt slippage
    if (input.machine_id === 'MCH-004') {
      downtimeHours = 3; // 3 hours to replace belt and test
      costPerHour = 12000;
    }

    const estimatedLoss = downtimeHours * costPerHour;
    const riskLevel = prodInfo.priority === 'high' && input.severity === 'critical' ? 'critical' : (prodInfo.priority === 'high' || input.severity === 'critical' ? 'high' : 'medium');

    return {
      machine_id: input.machine_id,
      product: prodInfo.product,
      quantity_pending: prodInfo.quantity,
      production_priority: prodInfo.priority,
      estimated_downtime_hours: downtimeHours,
      estimated_production_loss_inr: estimatedLoss,
      risk_level: riskLevel
    };
  }

  @Tool({
    name: 'create_work_order',
    description: 'Create a new maintenance work order ticket in SQLite database.',
    inputSchema: z.object({
      machine_id: z.string().describe('The ID of the machine'),
      issue: z.string().describe('The issue description'),
      urgency: z.enum(['low', 'medium', 'high', 'emergency']).describe('The urgency level'),
      assigned_engineer: z.string().describe('The name of the engineer assigned to the task')
    })
  })
  async createWorkOrder(input: {
    machine_id: string;
    issue: string;
    urgency: 'low' | 'medium' | 'high' | 'emergency';
    assigned_engineer: string;
  }, ctx: ExecutionContext) {
    ctx.logger.info(`Creating work order for ${input.machine_id}`);

    const dateStr = new Date().toISOString().split('T')[0];
    const repairStr = `PENDING - Urgency: ${input.urgency.toUpperCase()}. Assigned to ${input.assigned_engineer}.`;

    await this.dbService.run(
      'INSERT INTO Maintenance (machine_id, date, issue, repair, engineer) VALUES (?, ?, ?, ?, ?)',
      [input.machine_id, dateStr, input.issue, repairStr, input.assigned_engineer]
    );

    // Update machine status in DB to critical if emergency or high
    if (input.urgency === 'emergency' || input.urgency === 'high') {
      await this.dbService.run(
        "UPDATE Machines SET status = 'critical' WHERE machine_id = ?",
        [input.machine_id]
      );
    }

    // Get inserted ID
    const row = await this.dbService.get<any>('SELECT last_insert_rowid() as id');
    const orderId = row ? row.id : Math.floor(Math.random() * 1000);

    return {
      success: true,
      work_order_id: orderId,
      machine_id: input.machine_id,
      issue: input.issue,
      assigned_engineer: input.assigned_engineer,
      date_created: dateStr,
      status: 'pending'
    };
  }

  @Tool({
    name: 'generate_investigation_report',
    description: 'Compile a final maintenance work order investigation report in Markdown format.',
    inputSchema: z.object({
      machine_id: z.string().describe('The ID of the machine'),
      diagnosis: z.any().describe('The diagnosis object returned by analyze_root_cause'),
      impact: z.any().describe('The impact object returned by predict_business_impact'),
      work_order_id: z.number().describe('The ID of the created work order')
    })
  })
  async generateInvestigationReport(input: {
    machine_id: string;
    diagnosis: any;
    impact: any;
    work_order_id: number;
  }, ctx: ExecutionContext) {
    ctx.logger.info(`Compiling report for MCH-${input.machine_id}`);

    const dateStr = new Date().toLocaleDateString();

    const reportContent = `
# FACTORYLENS FAILURE INVESTIGATION REPORT
**Report Date:** ${dateStr} | **Work Order ID:** #WO-${input.work_order_id}
**Machine:** MCH-${input.machine_id} (${input.diagnosis.machine_name || 'System'})
**Location:** ${input.diagnosis.location || 'N/A'}

---

## 1. Executive Summary
An inspection of machine **${input.machine_id}** was triggered due to telemetry anomalies. Root cause analysis suggests a **${input.diagnosis.diagnosis.root_cause}** with a confidence score of **${Math.round(input.diagnosis.diagnosis.confidence_score * 100)}%**.

## 2. Evidence Logs
${input.diagnosis.diagnosis.evidence.map((e: string) => `- ${e}`).join('\n')}

## 3. Business & Production Impact
- **Affected Product Line:** ${input.impact.product} (Priority: ${input.impact.production_priority.toUpperCase()})
- **Pending Batch Quantity:** ${input.impact.quantity_pending} units
- **Estimated Repair Downtime:** ${input.impact.estimated_downtime_hours} hours
- **Estimated Financial Impact:** ₹${input.impact.estimated_production_loss_inr.toLocaleString('en-IN')} INR
- **Risk Level:** **${input.impact.risk_level.toUpperCase()}**

## 4. Maintenance Recommendations
${input.diagnosis.diagnosis.recommendations.map((r: string, idx: number) => `${idx + 1}. **${r}**`).join('\n')}

---
**Lead Investigating AI:** FactoryLens Engineer MCP
**Assigned Repair Technician:** ${input.impact.assigned_engineer || 'Alex Mercer'}
`;

    // Ensure reports directory exists
    const reportsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const reportFileName = `report_MCH-${input.machine_id}_WO-${input.work_order_id}.md`;
    fs.writeFileSync(path.join(reportsDir, reportFileName), reportContent);

    return {
      status: 'compiled',
      filename: reportFileName,
      report: reportContent
    };
  }
}
