import { ResourceDecorator as Resource, ExecutionContext } from '@nitrostack/core';
import { DatabaseService } from '../../database/db.js';
import * as fs from 'fs';
import * as path from 'path';

export class FactoryResources {
  constructor(private readonly dbService: DatabaseService) {}

  @Resource({
    uri: 'factory://manuals/{machine_id}',
    name: 'Machine Manuals',
    description: 'The industrial operating and maintenance manual for a specific machine.',
    mimeType: 'text/plain'
  })
  async getManual(uri: string, params: { machine_id: string }, ctx: ExecutionContext) {
    ctx.logger.info(`Resource requested: ${uri}`);
    
    const manualsDir = path.join(process.cwd(), 'resources', 'manuals');
    const filePath = path.join(manualsDir, `${params.machine_id}-manual.txt`);

    let text = `No manual file found for machine ${params.machine_id}`;
    if (fs.existsSync(filePath)) {
      text = fs.readFileSync(filePath, 'utf8');
    }

    return {
      contents: [{
        uri,
        mimeType: 'text/plain',
        text
      }]
    };
  }

  @Resource({
    uri: 'factory://maintenance/{machine_id}',
    name: 'Maintenance History',
    description: 'SQLite maintenance history records for a specific machine.',
    mimeType: 'application/json'
  })
  async getMaintenance(uri: string, params: { machine_id: string }, ctx: ExecutionContext) {
    ctx.logger.info(`Resource requested: ${uri}`);
    
    const logs = await this.dbService.all(
      'SELECT * FROM Maintenance WHERE machine_id = ? ORDER BY date DESC',
      [params.machine_id]
    );

    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(logs, null, 2)
      }]
    };
  }

  @Resource({
    uri: 'factory://production/schedule',
    name: 'Production Schedule',
    description: 'The current active factory production schedules and priority matrix.',
    mimeType: 'application/json'
  })
  async getProductionSchedule(uri: string, ctx: ExecutionContext) {
    ctx.logger.info(`Resource requested: ${uri}`);
    
    const schedule = await this.dbService.all(
      'SELECT p.*, m.machine_name, m.status FROM Production p JOIN Machines m ON p.machine_id = m.machine_id'
    );

    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(schedule, null, 2)
      }]
    };
  }

  @Resource({
    uri: 'factory://machines/specs',
    name: 'Machine Specifications',
    description: 'List of all operational machines, their physical locations, and status metrics.',
    mimeType: 'application/json'
  })
  async getMachineSpecs(uri: string, ctx: ExecutionContext) {
    ctx.logger.info(`Resource requested: ${uri}`);
    
    const machines = await this.dbService.all('SELECT * FROM Machines');

    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(machines, null, 2)
      }]
    };
  }
}
