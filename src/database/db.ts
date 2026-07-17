import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { Injectable } from '@nitrostack/core';

const DB_PATH = path.join(process.cwd(), 'database', 'factory.db');

@Injectable()
export class DatabaseService {
  private db: sqlite3.Database | null = null;

  constructor() {
    this.init();
  }

  private init() {
    // Ensure database folder exists
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('❌ Failed to connect to SQLite:', err.message);
        return;
      }
      console.log('✔ Connected to SQLite database:', DB_PATH);
      this.createTablesAndSeed();
    });
  }

  private createTablesAndSeed() {
    if (!this.db) return;

    this.db.serialize(() => {
      // 1. Machines Table
      this.db!.run(`
        CREATE TABLE IF NOT EXISTS Machines (
          machine_id TEXT PRIMARY KEY,
          machine_name TEXT NOT NULL,
          location TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('healthy', 'warning', 'critical'))
        )
      `);

      // 2. Maintenance Table
      this.db!.run(`
        CREATE TABLE IF NOT EXISTS Maintenance (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          machine_id TEXT NOT NULL,
          date TEXT NOT NULL,
          issue TEXT NOT NULL,
          repair TEXT NOT NULL,
          engineer TEXT NOT NULL,
          FOREIGN KEY (machine_id) REFERENCES Machines(machine_id)
        )
      `);

      // 3. Production Table
      this.db!.run(`
        CREATE TABLE IF NOT EXISTS Production (
          machine_id TEXT PRIMARY KEY,
          product TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          priority TEXT NOT NULL CHECK(priority IN ('low', 'medium', 'high')),
          FOREIGN KEY (machine_id) REFERENCES Machines(machine_id)
        )
      `);

      // Seed initial data if Machines is empty
      this.db!.get('SELECT COUNT(*) as count FROM Machines', (err, row: any) => {
        if (err) {
          console.error('Failed to check database content:', err);
          return;
        }

        if (row && row.count === 0) {
          console.log('🌱 Seeding factory database...');

          // Seed Machines
          const machines = [
            ['MCH-001', 'CNC Milling Machine', 'Assembly Bay A', 'healthy'],
            ['MCH-002', 'Robotic Welder', 'Welding Cell B', 'warning'],
            ['MCH-003', 'Injection Molder', 'Plastics Bay C', 'healthy'],
            ['MCH-004', 'Conveyor System', 'Packaging Line 1', 'critical'],
            ['MCH-005', 'Hydraulic Press', 'Heavy Press Bay D', 'healthy']
          ];

          const machineStmt = this.db!.prepare(`
            INSERT INTO Machines (machine_id, machine_name, location, status) VALUES (?, ?, ?, ?)
          `);
          machines.forEach(m => machineStmt.run(m));
          machineStmt.finalize();

          // Seed Maintenance history
          const maintenanceLogs = [
            ['MCH-001', '2026-06-15', 'Spindle vibration detected', 'Replaced spindle bearings and recalibrated spindle axis', 'Sarah Connor'],
            ['MCH-002', '2026-07-02', 'Robot joint 3 error code 44', 'Cleaned joint 3 encoder disc and updated firmware', 'John Doe'],
            ['MCH-003', '2026-05-10', 'Heating element failure', 'Replaced heating element band 3 and thermocouple sensor', 'Sarah Connor'],
            ['MCH-004', '2026-07-10', 'Conveyor belt slip', 'Tensioned belt and replaced drive pulley wheel', 'Alex Mercer'],
            ['MCH-004', '2026-07-16', 'Motor overheating alert', 'Inspected cooling fan, cleaned dust accumulation. Temp still high.', 'Alex Mercer']
          ];

          const maintStmt = this.db!.prepare(`
            INSERT INTO Maintenance (machine_id, date, issue, repair, engineer) VALUES (?, ?, ?, ?, ?)
          `);
          maintenanceLogs.forEach(log => maintStmt.run(log));
          maintStmt.finalize();

          // Seed Production details
          const productionSchedules = [
            ['MCH-001', 'Automotive Gear G1', 500, 'medium'],
            ['MCH-002', 'Car Chassis Frame C-4', 120, 'high'],
            ['MCH-003', 'Plastic Casing P-9', 2000, 'low'],
            ['MCH-004', 'Product Box Packing', 1500, 'high'],
            ['MCH-005', 'Steel Plate Bracket', 350, 'medium']
          ];

          const prodStmt = this.db!.prepare(`
            INSERT INTO Production (machine_id, product, quantity, priority) VALUES (?, ?, ?, ?)
          `);
          productionSchedules.forEach(p => prodStmt.run(p));
          prodStmt.finalize();

          console.log('🌱 Database seeded successfully.');
        } else {
          console.log('✔ Database already populated.');
        }
      });
    });
  }

  // Database helper methods
  public run(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public get<T>(sql: string, params: any[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row as T);
      });
    });
  }

  public all<T>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }
}
